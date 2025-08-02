



import type { Lesson, Figure, AppSettings, IDataService, Category } from './types';
import { openDB, deleteDB, type IDBPDatabase, type IDBPObjectStore } from 'idb';

// --- Helper Functions ---
const generateId = (): string => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const getInitialLanguage = (): 'english' | 'polish' => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('pl')) {
      return 'polish';
    }
  }
  return 'english'; // Default language
};


// --- IndexedDB Configuration ---
const DB_NAME = 'bachata-moves-db';
const DB_VERSION = 4;
const LESSONS_STORE = 'lessons';
const FIGURES_STORE = 'figures';
const CATEGORIES_STORE = 'categories';
const SETTINGS_STORE = 'settings';
const VIDEOS_STORE = 'videos';
const THUMBNAILS_STORE = 'thumbnails';
const FIGURE_THUMBNAILS_STORE = 'figure-thumbnails';
const SETTINGS_KEY = 'app-settings';

async function openBachataDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(LESSONS_STORE)) {
        db.createObjectStore(LESSONS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FIGURES_STORE)) {
        db.createObjectStore(FIGURES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
      if (!db.objectStoreNames.contains(VIDEOS_STORE)) {
        db.createObjectStore(VIDEOS_STORE);
      }
      if (!db.objectStoreNames.contains(THUMBNAILS_STORE)) {
        db.createObjectStore(THUMBNAILS_STORE);
      }
      if (oldVersion < 3 && !db.objectStoreNames.contains(FIGURE_THUMBNAILS_STORE)) {
          db.createObjectStore(FIGURE_THUMBNAILS_STORE);
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
          db.createObjectStore(CATEGORIES_STORE, { keyPath: 'id' });
        }
      }
    },
  });
}

const generateThumbnailBlob = (file: File, thumbTime: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const videoUrl = URL.createObjectURL(file);

    if (!context) {
      URL.revokeObjectURL(videoUrl);
      return reject(new Error('Canvas 2D context is not available.'));
    }

    video.addEventListener('loadedmetadata', () => {
      video.width = video.videoWidth;
      video.height = video.videoHeight;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      video.currentTime = thumbTime / 1000; // Seek to specified time in seconds
    });

    video.addEventListener('seeked', () => {
      context.drawImage(video, 0, 0, video.width, video.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(videoUrl);
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas to Blob conversion failed.'));
        }
      }, 'image/jpeg', 0.8);
    });

    video.addEventListener('error', (err) => {
      URL.revokeObjectURL(videoUrl);
      console.error("Video thumbnail generation error:", err);
      reject(new Error('Failed to load video for thumbnail generation.'));
    });

    video.preload = 'metadata';
    video.src = videoUrl;
    video.load();
  });
};

// --- Helper Functions for Import/Export ---
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(blob);
    });
  };
  
const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const res = await fetch(dataUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch data URL: ${res.statusText}`);
    }
    return res.blob();
};


class AppDataService implements IDataService {
  private videoUrlCache = new Map<string, string>();
  private thumbUrlCache = new Map<string, string>();
  private figureThumbUrlCache = new Map<string, string>();

  // --- Lessons ---
  async getLessons(): Promise<Lesson[]> { 
    const db = await openBachataDB();
    return db.getAll(LESSONS_STORE);
  }

  async addLesson(lessonData: Omit<Lesson, 'id' | 'videoFileName' | 'thumbTime'>, videoFile: File): Promise<Lesson> {
    const db = await openBachataDB();
    const newId = generateId();
    
    const newLesson: Lesson = {
      ...lessonData,
      id: newId,
      videoFileName: videoFile.name,
      thumbTime: 0, // Default to first frame
    };

    const thumbnailBlob = await generateThumbnailBlob(videoFile, 0);

    const tx = db.transaction([LESSONS_STORE, VIDEOS_STORE, THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(LESSONS_STORE).put(newLesson),
      tx.objectStore(VIDEOS_STORE).put(videoFile, newId),
      tx.objectStore(THUMBNAILS_STORE).put(thumbnailBlob, newId),
    ]);
    await tx.done;

    return newLesson;
  }
  
  async updateLesson(lessonId: string, lessonUpdateData: Partial<Omit<Lesson, 'id'>>): Promise<Lesson> {
    const db = await openBachataDB();

    const lesson = await db.get(LESSONS_STORE, lessonId);
    if (!lesson) throw new Error(`Lesson with id "${lessonId}" not found.`);

    let newThumbnailBlob: Blob | null = null;
    if (typeof lessonUpdateData.thumbTime === 'number' && lessonUpdateData.thumbTime !== lesson.thumbTime) {
      this.revokeAndClearCache(lessonId, 'thumbnail');
      const videoFile = await db.get(VIDEOS_STORE, lessonId);
      if (videoFile) {
        newThumbnailBlob = await generateThumbnailBlob(videoFile, lessonUpdateData.thumbTime);
      }
    }

    const tx = db.transaction([LESSONS_STORE, THUMBNAILS_STORE], 'readwrite');
    const updatedLesson = { ...lesson, ...lessonUpdateData };
    
    const writePromises: Promise<any>[] = [
      tx.objectStore(LESSONS_STORE).put(updatedLesson),
    ];

    if (newThumbnailBlob) {
      writePromises.push(tx.objectStore(THUMBNAILS_STORE).put(newThumbnailBlob, lessonId));
    }
    
    await Promise.all(writePromises);
    await tx.done;

    return updatedLesson;
  }

  async deleteLesson(lessonId: string): Promise<void> {
    this.revokeAndClearCache(lessonId, 'all');

    const db = await openBachataDB();
    const tx = db.transaction([LESSONS_STORE, VIDEOS_STORE, THUMBNAILS_STORE, FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');

    const figures = await tx.objectStore(FIGURES_STORE).getAll();
    const figuresToDelete = figures.filter(f => f.lessonId === lessonId);

    const deletePromises = [
      tx.objectStore(LESSONS_STORE).delete(lessonId),
      tx.objectStore(VIDEOS_STORE).delete(lessonId),
      tx.objectStore(THUMBNAILS_STORE).delete(lessonId),
      ...figuresToDelete.map(fig => {
        this.revokeAndClearCache(fig.id, 'figure-thumbnail');
        return tx.objectStore(FIGURE_THUMBNAILS_STORE).delete(fig.id);
      }),
      ...figuresToDelete.map(fig => tx.objectStore(FIGURES_STORE).delete(fig.id))
    ];
    
    await Promise.all(deletePromises);
    await tx.done;
  }

  // --- Figures ---
  async getFigures(): Promise<Figure[]> { 
    const db = await openBachataDB();
    return db.getAll(FIGURES_STORE);
  }

  async addFigure(lessonId: string, figureData: Omit<Figure, 'id' | 'lessonId'>): Promise<Figure> {
    const db = await openBachataDB();

    // Perform all reads and long-running operations *before* the write transaction.
    const lesson = await db.get(LESSONS_STORE, lessonId);
    if (!lesson) throw new Error(`Cannot add figure. Lesson with id "${lessonId}" does not exist.`);
    
    const videoFile = await db.get(VIDEOS_STORE, lessonId);
    if (!videoFile) throw new Error(`Video for lesson "${lessonId}" not found.`);

    const newFigure: Figure = { ...figureData, id: generateId(), lessonId, categoryId: null };
    const thumbnailBlob = await generateThumbnailBlob(videoFile, newFigure.thumbTime);

    // Start a short, focused transaction for writes only.
    const tx = db.transaction([FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(FIGURES_STORE).put(newFigure),
      tx.objectStore(FIGURE_THUMBNAILS_STORE).put(thumbnailBlob, newFigure.id)
    ]);
    await tx.done;
    
    return newFigure;
  }

  async updateFigure(figureId: string, figureUpdateData: Partial<Omit<Figure, 'id' | 'lessonId'>>): Promise<Figure> {
    const db = await openBachataDB();

    const figure = await db.get(FIGURES_STORE, figureId);
    if (!figure) throw new Error(`Figure with id "${figureId}" not found.`);

    let newThumbnailBlob: Blob | null = null;
    if (typeof figureUpdateData.thumbTime === 'number' && figureUpdateData.thumbTime !== figure.thumbTime) {
      this.revokeAndClearCache(figureId, 'figure-thumbnail');
      const videoFile = await db.get(VIDEOS_STORE, figure.lessonId);
      if (videoFile) {
        newThumbnailBlob = await generateThumbnailBlob(videoFile, figureUpdateData.thumbTime);
      }
    }

    const tx = db.transaction([FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');
    const updatedFigure = { ...figure, ...figureUpdateData };
    
    const writePromises = [
      tx.objectStore(FIGURES_STORE).put(updatedFigure),
    ];

    if (newThumbnailBlob) {
      writePromises.push(tx.objectStore(FIGURE_THUMBNAILS_STORE).put(newThumbnailBlob, figureId));
    }
    
    await Promise.all(writePromises);
    await tx.done;
    return updatedFigure;
  }

  async deleteFigure(figureId: string): Promise<void> {
    this.revokeAndClearCache(figureId, 'figure-thumbnail');
    const db = await openBachataDB();
    const tx = db.transaction([FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(FIGURES_STORE).delete(figureId),
      tx.objectStore(FIGURE_THUMBNAILS_STORE).delete(figureId)
    ]);
    await tx.done;
  }
  
  // --- Categories ---
  async getCategories(): Promise<Category[]> {
    const db = await openBachataDB();
    let categories = await db.getAll(CATEGORIES_STORE);
    if (categories.length === 0) {
      // Create a default category if none exist
      const defaultCategory: Category = {
        id: generateId(),
        name: 'Learned',
        isExpanded: true,
      };
      await db.put(CATEGORIES_STORE, defaultCategory);
      categories = [defaultCategory];
    }
    return categories;
  }

  async updateCategory(categoryId: string, categoryUpdateData: Partial<Omit<Category, 'id'>>): Promise<Category> {
    const db = await openBachataDB();
    const category = await db.get(CATEGORIES_STORE, categoryId);
    if (!category) throw new Error(`Category with id "${categoryId}" not found.`);

    const updatedCategory = { ...category, ...categoryUpdateData };
    await db.put(CATEGORIES_STORE, updatedCategory);
    return updatedCategory;
  }

  // --- Settings ---
  async getSettings(): Promise<AppSettings> { 
    const db = await openBachataDB();
    const savedSettings = await db.get(SETTINGS_STORE, SETTINGS_KEY);
    const defaultSettings: AppSettings = {
      language: getInitialLanguage(),
      lessonSortOrder: 'newest',
      figureSortOrder: 'newest',
      lessonGrouping: 'none',
      figureGrouping: 'none',
      autoplayGalleryVideos: false,
      uncategorizedCategoryIsExpanded: true,
    };

    return { ...defaultSettings, ...(savedSettings || {}) };
  }

  async saveSettings(settingsData: AppSettings): Promise<void> {
    const db = await openBachataDB();
    await db.put(SETTINGS_STORE, settingsData, SETTINGS_KEY);
  }
  
  // --- File/Blob Handling ---
  async getLessonThumbnailUrl(lessonId: string): Promise<string | null> {
    if (this.thumbUrlCache.has(lessonId)) {
      return this.thumbUrlCache.get(lessonId)!;
    }
    const db = await openBachataDB();
    const thumbBlob = await db.get(THUMBNAILS_STORE, lessonId);
    if (!thumbBlob) return null;
    
    const url = URL.createObjectURL(thumbBlob);
    this.thumbUrlCache.set(lessonId, url);
    return url;
  }
  
  async getFigureThumbnailUrl(figureId: string): Promise<string | null> {
    if (this.figureThumbUrlCache.has(figureId)) {
      return this.figureThumbUrlCache.get(figureId)!;
    }
    const db = await openBachataDB();
    const thumbBlob = await db.get(FIGURE_THUMBNAILS_STORE, figureId);
    if (!thumbBlob) return null;
    
    const url = URL.createObjectURL(thumbBlob);
    this.figureThumbUrlCache.set(figureId, url);
    return url;
  }

  async getVideoFile(lessonId: string): Promise<File | undefined> {
    const db = await openBachataDB();
    const videoFile = await db.get(VIDEOS_STORE, lessonId);
    return videoFile;
  }

  async getVideoObjectUrl(lesson: Lesson): Promise<string> {
    if (this.videoUrlCache.has(lesson.id)) {
      return this.videoUrlCache.get(lesson.id)!;
    }
    const db = await openBachataDB();
    const videoBlob = await db.get(VIDEOS_STORE, lesson.id);
    if (!videoBlob) {
        throw new Error(`Video for lesson "${lesson.description || lesson.id}" not found in the database.`);
    }
    const url = URL.createObjectURL(videoBlob);
    this.videoUrlCache.set(lesson.id, url);
    return url;
  }

  public revokeVideoObjectUrl(lessonId: string): void {
    this.revokeAndClearCache(lessonId, 'video');
  }

  private revokeAndClearCache(id: string, type: 'thumbnail' | 'figure-thumbnail' | 'video' | 'all'): void {
    if (type === 'video' || type === 'all') {
      const videoUrl = this.videoUrlCache.get(id);
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
        this.videoUrlCache.delete(id);
      }
    }
    if (type === 'thumbnail' || type === 'all') {
      const thumbUrl = this.thumbUrlCache.get(id);
      if (thumbUrl) {
        URL.revokeObjectURL(thumbUrl);
        this.thumbUrlCache.delete(id);
      }
    }
     if (type === 'figure-thumbnail' || type === 'all') {
      const figureThumbUrl = this.figureThumbUrlCache.get(id);
      if (figureThumbUrl) {
        URL.revokeObjectURL(figureThumbUrl);
        this.figureThumbUrlCache.delete(id);
      }
    }
  }

  async clearAllData(): Promise<void> {
    // Revoke all cached URLs to prevent memory leaks before the page reloads.
    this.videoUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.videoUrlCache.clear();
    this.thumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.thumbUrlCache.clear();
    this.figureThumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.figureThumbUrlCache.clear();

    // The `deleteDB` function from the `idb` library closes any open connections
    // before deleting the database, so we don't need to manage DB instances here.
    await deleteDB(DB_NAME);
  }

  // --- Data Management ---
  async exportAllData(): Promise<Blob> {
    const db = await openBachataDB();
    const tx = db.transaction(db.objectStoreNames, 'readonly');

    const getAllEntries = async <T>(storeName: string): Promise<[IDBValidKey, T][]> => {
        const store = tx.objectStore(storeName as any);
        const entries: [IDBValidKey, T][] = [];
        let cursor = await store.openCursor();
        while (cursor) {
            entries.push([cursor.key, cursor.value]);
            cursor = await cursor.continue();
        }
        return entries;
    };
    
    // 1. Fetch all data from IndexedDB. All these requests run in parallel within the same transaction.
    const [
      lessons,
      figures,
      categories,
      settings,
      videoEntries,
      thumbnailEntries,
      figureThumbnailEntries
    ] = await Promise.all([
      tx.objectStore(LESSONS_STORE).getAll(),
      tx.objectStore(FIGURES_STORE).getAll(),
      tx.objectStore(CATEGORIES_STORE).getAll(),
      tx.objectStore(SETTINGS_STORE).get(SETTINGS_KEY),
      getAllEntries<Blob>(VIDEOS_STORE),
      getAllEntries<Blob>(THUMBNAILS_STORE),
      getAllEntries<Blob>(FIGURE_THUMBNAILS_STORE)
    ]);
    
    // Ensure the transaction is complete before proceeding to CPU-intensive work.
    await tx.done;

    // 2. After the transaction is closed, convert blobs to base64. This is async but doesn't need the DB.
    const convertEntriesToBase64 = (entries: [IDBValidKey, Blob][]): Promise<[IDBValidKey, string][]> => {
      if (!entries) return Promise.resolve([]);
      const promises = entries.map(async ([key, blob]) => {
        const base64Value = await blobToBase64(blob);
        return [key, base64Value] as [IDBValidKey, string];
      });
      return Promise.all(promises);
    };

    const [
      videos,
      thumbnails,
      figureThumbnails
    ] = await Promise.all([
      convertEntriesToBase64(videoEntries),
      convertEntriesToBase64(thumbnailEntries),
      convertEntriesToBase64(figureThumbnailEntries)
    ]);

    // 3. Construct the final export object.
    const exportObject = {
        '__BACHATA_MOVES_EXPORT__': true,
        'version': 2,
        'exportDate': new Date().toISOString(),
        'data': {
            lessons: lessons || [],
            figures: figures || [],
            categories: categories || [],
            settings: settings || {},
            videos: videos || [],
            thumbnails: thumbnails || [],
            figureThumbnails: figureThumbnails || [],
        },
    };

    const jsonString = JSON.stringify(exportObject);
    return new Blob([jsonString], { type: 'application/json' });
  }

  async importData(dataBlob: Blob): Promise<void> {
    const jsonString = await dataBlob.text();
    const importObject = JSON.parse(jsonString);

    if (!importObject || importObject.__BACHATA_MOVES_EXPORT__ !== true) {
        throw new Error('Invalid import file format.');
    }

    const {
        lessons = [],
        figures = [],
        categories = [],
        settings = {},
        videos: videoEntries = [],
        thumbnails: thumbnailEntries = [],
        figureThumbnails: figureThumbnailEntries = [],
    } = importObject.data;

    // --- Step 1: Convert all base64 data to Blobs *before* starting the transaction ---
    const convertEntriesToBlobs = (entries: [IDBValidKey, string][]): Promise<[IDBValidKey, Blob][]> => {
        if (!entries) return Promise.resolve([]);
        const promises = entries.map(async ([key, base64Value]) => {
            const blob = await dataUrlToBlob(base64Value);
            return [key, blob] as [IDBValidKey, Blob];
        });
        return Promise.all(promises);
    };
    
    const [
        videoBlobs,
        thumbnailBlobs,
        figureThumbnailBlobs
    ] = await Promise.all([
        convertEntriesToBlobs(videoEntries),
        convertEntriesToBlobs(thumbnailEntries),
        convertEntriesToBlobs(figureThumbnailEntries),
    ]);
    
    // Revoke all cached URLs to prevent memory leaks before the page reloads.
    this.videoUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.videoUrlCache.clear();
    this.thumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.thumbUrlCache.clear();
    this.figureThumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.figureThumbUrlCache.clear();

    // --- Step 2: Open a single transaction and write everything ---
    const db = await openBachataDB();
    const tx = db.transaction(db.objectStoreNames, 'readwrite');

    try {
        // First, get existing settings before clearing anything
        const currentSettings = await tx.objectStore(SETTINGS_STORE).get(SETTINGS_KEY) || {};

        // Now, clear all the other stores
        const clearPromises = Array.from(db.objectStoreNames)
            .filter(name => name !== SETTINGS_STORE)
            .map(name => tx.objectStore(name as any).clear());
        await Promise.all(clearPromises);

        // Merge settings and write them back
        const newSettings = { ...currentSettings, ...settings };

        // Write all the new data in parallel
        await Promise.all([
            tx.objectStore(SETTINGS_STORE).put(newSettings, SETTINGS_KEY),
            ...lessons.map((item: Lesson) => tx.objectStore(LESSONS_STORE).put(item)),
            ...figures.map((item: Figure) => tx.objectStore(FIGURES_STORE).put(item)),
            ...categories.map((item: Category) => tx.objectStore(CATEGORIES_STORE).put(item)),
            ...videoBlobs.map(([key, blob]) => tx.objectStore(VIDEOS_STORE).put(blob, key)),
            ...thumbnailBlobs.map(([key, blob]) => tx.objectStore(THUMBNAILS_STORE).put(blob, key)),
            ...figureThumbnailBlobs.map(([key, blob]) => tx.objectStore(FIGURE_THUMBNAILS_STORE).put(blob, key)),
        ]);

        await tx.done; // Commit transaction
    } catch (err) {
        console.error('Import transaction failed:', err);
        // The transaction will be aborted automatically by the library on error.
        // We just need to re-throw to notify the caller.
        throw err;
    }
  }
}

/**
 * A singleton instance of the AppDataService.
 * Components will import this instance to interact with the application's data layer.
 */
export const dataService = new AppDataService();

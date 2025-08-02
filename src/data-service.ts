

import type { Lesson, Figure, AppSettings, IDataService, FigureCategory, LessonCategory } from './types';
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
const DB_VERSION = 8; // Incremented version for settings separation
const LESSONS_STORE = 'lessons';
const FIGURES_STORE = 'figures';
const FIGURE_CATEGORIES_STORE = 'figure_categories';
const LESSON_CATEGORIES_STORE = 'lesson_categories';
const SETTINGS_STORE = 'settings';
const VIDEO_FILES_STORE = 'video_files';
const LESSON_THUMBNAILS_STORE = 'lesson_thumbnails';
const FIGURE_THUMBNAILS_STORE = 'figure_thumbnails';

const DEVICE_SETTINGS_KEY = 'device-settings';
const SYNC_SETTINGS_KEY = 'sync-settings';

const LEGACY_VIDEOS_STORE = 'videos';

async function openBachataDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade: async (db, oldVersion, newVersion, tx) => {
      if (oldVersion < 2 && !db.objectStoreNames.contains(LESSONS_STORE)) {
        db.createObjectStore(LESSONS_STORE, { keyPath: 'id' });
        db.createObjectStore(FIGURES_STORE, { keyPath: 'id' });
        db.createObjectStore(SETTINGS_STORE);
        db.createObjectStore(LEGACY_VIDEOS_STORE);
        db.createObjectStore('thumbnails'); // Old name
      }
      if (oldVersion < 3 && !db.objectStoreNames.contains('figure-thumbnails')) {
          db.createObjectStore('figure-thumbnails'); // Old name
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains('categories')) { // Old name
          db.createObjectStore(FIGURE_CATEGORIES_STORE, { keyPath: 'id' });
        }
      }
      if (oldVersion < 5) {
          if (db.objectStoreNames.contains('categories')) {
            db.deleteObjectStore('categories');
          }
          if (!db.objectStoreNames.contains(FIGURE_CATEGORIES_STORE)) {
            db.createObjectStore(FIGURE_CATEGORIES_STORE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(LESSON_CATEGORIES_STORE)) {
            db.createObjectStore(LESSON_CATEGORIES_STORE, { keyPath: 'id' });
          }
      }
      if (oldVersion < 6) {
        db.createObjectStore(VIDEO_FILES_STORE);
        if (db.objectStoreNames.contains(LEGACY_VIDEOS_STORE)) {
            const lessonsStore = tx.objectStore(LESSONS_STORE);
            const legacyVideosStore = tx.objectStore(LEGACY_VIDEOS_STORE);
            const videoFilesStore = tx.objectStore(VIDEO_FILES_STORE);

            let cursor = await legacyVideosStore.openCursor();
            while (cursor) {
                const lessonId = cursor.key as string;
                const videoFile = cursor.value as File;
                const lesson = await lessonsStore.get(lessonId);

                if (lesson) {
                    const videoId = generateId();
                    await videoFilesStore.put(videoFile, videoId);
                    
                    const updatedLesson = { ...lesson, videoId };
                    delete updatedLesson.videoFileName;
                    await lessonsStore.put(updatedLesson);
                }
                cursor = await cursor.continue();
            }
            db.deleteObjectStore(LEGACY_VIDEOS_STORE);
        }
      }
      if (oldVersion < 7) {
        // Migration for lesson thumbnails
        if (db.objectStoreNames.contains('thumbnails')) {
            const store = tx.objectStore('thumbnails');
            const newStore = db.createObjectStore(LESSON_THUMBNAILS_STORE);
            let cursor = await store.openCursor();
            while (cursor) {
                newStore.put(cursor.value, cursor.key);
                cursor = await cursor.continue();
            }
            db.deleteObjectStore('thumbnails');
        } else if (!db.objectStoreNames.contains(LESSON_THUMBNAILS_STORE)) {
            db.createObjectStore(LESSON_THUMBNAILS_STORE);
        }

        // Migration for figure thumbnails
        if (db.objectStoreNames.contains('figure-thumbnails')) {
            const store = tx.objectStore('figure-thumbnails');
            const newStore = db.createObjectStore(FIGURE_THUMBNAILS_STORE);
            let cursor = await store.openCursor();
            while (cursor) {
                newStore.put(cursor.value, cursor.key);
                cursor = await cursor.continue();
            }
            db.deleteObjectStore('figure-thumbnails');
        } else if (!db.objectStoreNames.contains(FIGURE_THUMBNAILS_STORE)) {
            db.createObjectStore(FIGURE_THUMBNAILS_STORE);
        }
      }
      if (oldVersion < 8) {
        const settingsStore = tx.objectStore(SETTINGS_STORE);
        const oldSettings = await settingsStore.get('app-settings');

        if (oldSettings) {
            // Perform one-time migration for old key names
            if ('categoryOrder' in oldSettings) {
                oldSettings.figureCategoryOrder = oldSettings.categoryOrder;
                delete oldSettings.categoryOrder;
            }
            if ('uncategorizedCategoryIsExpanded' in oldSettings) {
                oldSettings.uncategorizedFigureCategoryIsExpanded = oldSettings.uncategorizedCategoryIsExpanded;
                delete oldSettings.uncategorizedCategoryIsExpanded;
            }
            if ('showEmptyCategoriesInGroupedView' in oldSettings) {
                oldSettings.showEmptyFigureCategoriesInGroupedView = oldSettings.showEmptyCategoriesInGroupedView;
                delete oldSettings.showEmptyCategoriesInGroupedView;
            }
            
            // Split settings into device and sync objects
            const deviceSettings: Partial<AppSettings> = {};
            const syncSettings: Partial<AppSettings> = {};
            const deviceSettingKeys: (keyof AppSettings)[] = ['language', 'autoplayGalleryVideos'];

            for (const key in oldSettings) {
                if (deviceSettingKeys.includes(key as keyof AppSettings)) {
                    (deviceSettings as any)[key] = oldSettings[key];
                } else {
                    (syncSettings as any)[key] = oldSettings[key];
                }
            }
            
            await Promise.all([
                settingsStore.put(deviceSettings, DEVICE_SETTINGS_KEY),
                settingsStore.put(syncSettings, SYNC_SETTINGS_KEY),
                settingsStore.delete('app-settings')
            ]);
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

  async addLesson(lessonData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, videoFile: File): Promise<Lesson> {
    const db = await openBachataDB();
    const newId = generateId();
    const newVideoId = generateId();
    
    const newLesson: Lesson = {
      ...lessonData,
      id: newId,
      videoId: newVideoId,
      thumbTime: 0, // Default to first frame
    };

    const thumbnailBlob = await generateThumbnailBlob(videoFile, 0);

    const tx = db.transaction([LESSONS_STORE, VIDEO_FILES_STORE, LESSON_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(LESSONS_STORE).put(newLesson),
      tx.objectStore(VIDEO_FILES_STORE).put(videoFile, newVideoId),
      tx.objectStore(LESSON_THUMBNAILS_STORE).put(thumbnailBlob, newId),
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
      const videoFile = await db.get(VIDEO_FILES_STORE, lesson.videoId);
      if (videoFile) {
        newThumbnailBlob = await generateThumbnailBlob(videoFile, lessonUpdateData.thumbTime);
      }
    }

    const tx = db.transaction([LESSONS_STORE, LESSON_THUMBNAILS_STORE], 'readwrite');
    const updatedLesson = { ...lesson, ...lessonUpdateData };
    
    const writePromises: Promise<any>[] = [
      tx.objectStore(LESSONS_STORE).put(updatedLesson),
    ];

    if (newThumbnailBlob) {
      writePromises.push(tx.objectStore(LESSON_THUMBNAILS_STORE).put(newThumbnailBlob, lessonId));
    }
    
    await Promise.all(writePromises);
    await tx.done;

    return updatedLesson;
  }

  async deleteLesson(lessonId: string): Promise<void> {
    const db = await openBachataDB();
    const lesson = await db.get(LESSONS_STORE, lessonId);
    if (!lesson) {
        return;
    }
    
    this.revokeAndClearCache(lesson.videoId, 'video');
    this.revokeAndClearCache(lessonId, 'thumbnail');

    const tx = db.transaction([LESSONS_STORE, VIDEO_FILES_STORE, LESSON_THUMBNAILS_STORE, FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');

    const allLessons = await tx.objectStore(LESSONS_STORE).getAll();
    const otherLessonsUsingVideo = allLessons.filter(l => l.videoId === lesson.videoId && l.id !== lessonId);

    const figures = await tx.objectStore(FIGURES_STORE).getAll();
    const figuresToDelete = figures.filter(f => f.lessonId === lessonId);

    const deletePromises = [
      tx.objectStore(LESSONS_STORE).delete(lessonId),
      otherLessonsUsingVideo.length === 0 ? tx.objectStore(VIDEO_FILES_STORE).delete(lesson.videoId) : Promise.resolve(),
      tx.objectStore(LESSON_THUMBNAILS_STORE).delete(lessonId),
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
    
    const videoFile = await db.get(VIDEO_FILES_STORE, lesson.videoId);
    if (!videoFile) throw new Error(`Video for lesson "${lessonId}" not found.`);

    const newFigure: Figure = { ...figureData, id: generateId(), lessonId };
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
      const lesson = await db.get(LESSONS_STORE, figure.lessonId);
      if (!lesson) throw new Error(`Could not find parent lesson for figure`);
      const videoFile = await db.get(VIDEO_FILES_STORE, lesson.videoId);
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
  
  // --- Figure Categories ---
  async getFigureCategories(): Promise<FigureCategory[]> {
    const db = await openBachataDB();
    return await db.getAll(FIGURE_CATEGORIES_STORE);
  }
  
  async addFigureCategory(categoryName: string): Promise<FigureCategory> {
    const db = await openBachataDB();
    const newCategory: FigureCategory = {
      id: generateId(),
      name: categoryName,
      isExpanded: true,
    };
    await db.put(FIGURE_CATEGORIES_STORE, newCategory);
    return newCategory;
  }

  async updateFigureCategory(categoryId: string, categoryUpdateData: Partial<Omit<FigureCategory, 'id'>>): Promise<FigureCategory> {
    const db = await openBachataDB();
    const category = await db.get(FIGURE_CATEGORIES_STORE, categoryId);
    if (!category) throw new Error(`Category with id "${categoryId}" not found.`);

    const updatedCategory = { ...category, ...categoryUpdateData };
    await db.put(FIGURE_CATEGORIES_STORE, updatedCategory);
    return updatedCategory;
  }

  async deleteFigureCategory(categoryId: string): Promise<void> {
    const db = await openBachataDB();
    const tx = db.transaction([FIGURE_CATEGORIES_STORE, FIGURES_STORE], 'readwrite');
    
    const allFigures = await tx.objectStore(FIGURES_STORE).getAll();
    const figuresToUpdate = allFigures.filter(f => f.categoryId === categoryId);

    const updatePromises = figuresToUpdate.map(figure => {
      const updatedFigure = { ...figure, categoryId: null };
      return tx.objectStore(FIGURES_STORE).put(updatedFigure);
    });

    await Promise.all(updatePromises);
    await tx.objectStore(FIGURE_CATEGORIES_STORE).delete(categoryId);
    await tx.done;
  }

  // --- Lesson Categories ---
  async getLessonCategories(): Promise<LessonCategory[]> {
    const db = await openBachataDB();
    return await db.getAll(LESSON_CATEGORIES_STORE);
  }
  
  async addLessonCategory(categoryName: string): Promise<LessonCategory> {
    const db = await openBachataDB();
    const newCategory: LessonCategory = {
      id: generateId(),
      name: categoryName,
      isExpanded: true,
    };
    await db.put(LESSON_CATEGORIES_STORE, newCategory);
    return newCategory;
  }

  async updateLessonCategory(categoryId: string, categoryUpdateData: Partial<Omit<LessonCategory, 'id'>>): Promise<LessonCategory> {
    const db = await openBachataDB();
    const category = await db.get(LESSON_CATEGORIES_STORE, categoryId);
    if (!category) throw new Error(`Lesson category with id "${categoryId}" not found.`);

    const updatedCategory = { ...category, ...categoryUpdateData };
    await db.put(LESSON_CATEGORIES_STORE, updatedCategory);
    return updatedCategory;
  }

  async deleteLessonCategory(categoryId: string): Promise<void> {
    const db = await openBachataDB();
    const tx = db.transaction([LESSON_CATEGORIES_STORE, LESSONS_STORE], 'readwrite');
    
    const allLessons = await tx.objectStore(LESSONS_STORE).getAll();
    const lessonsToUpdate = allLessons.filter(l => l.categoryId === categoryId);

    const updatePromises = lessonsToUpdate.map(lesson => {
      const updatedLesson = { ...lesson, categoryId: null };
      return tx.objectStore(LESSONS_STORE).put(updatedLesson);
    });

    await Promise.all(updatePromises);
    await tx.objectStore(LESSON_CATEGORIES_STORE).delete(categoryId);
    await tx.done;
  }

  // --- Settings ---
  async getSettings(): Promise<AppSettings> { 
    const db = await openBachataDB();
    const [savedDeviceSettings, savedSyncSettings] = await Promise.all([
        db.get(SETTINGS_STORE, DEVICE_SETTINGS_KEY),
        db.get(SETTINGS_STORE, SYNC_SETTINGS_KEY)
    ]);
    
    const defaultDeviceSettings: Partial<AppSettings> = {
      language: getInitialLanguage(),
      autoplayGalleryVideos: false,
    };

    const defaultSyncSettings: Partial<AppSettings> = {
      lessonSortOrder: 'newest',
      figureSortOrder: 'newest',
      lessonGrouping: 'none',
      figureGrouping: 'none',
      collapsedLessonDateGroups: [],
      collapsedFigureDateGroups: [],
      uncategorizedFigureCategoryIsExpanded: true,
      figureCategoryOrder: [],
      showEmptyFigureCategoriesInGroupedView: false,
      showFigureCountInGroupHeaders: false,
      uncategorizedLessonCategoryIsExpanded: true,
      lessonCategoryOrder: [],
      showEmptyLessonCategoriesInGroupedView: false,
      showLessonCountInGroupHeaders: false,
    };

    return {
        ...defaultDeviceSettings,
        ...(savedDeviceSettings || {}),
        ...defaultSyncSettings,
        ...(savedSyncSettings || {}),
    } as AppSettings;
  }

  async saveSettings(settingsData: AppSettings): Promise<void> {
    const db = await openBachataDB();
    const deviceSettings: Partial<AppSettings> = {};
    const syncSettings: Partial<AppSettings> = {};
    const deviceSettingKeys: (keyof AppSettings)[] = ['language', 'autoplayGalleryVideos'];

    for (const key in settingsData) {
        const typedKey = key as keyof AppSettings;
        if (deviceSettingKeys.includes(typedKey)) {
            (deviceSettings as any)[typedKey] = settingsData[typedKey];
        } else {
            (syncSettings as any)[typedKey] = settingsData[typedKey];
        }
    }
    
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    await Promise.all([
        tx.objectStore(SETTINGS_STORE).put(deviceSettings, DEVICE_SETTINGS_KEY),
        tx.objectStore(SETTINGS_STORE).put(syncSettings, SYNC_SETTINGS_KEY)
    ]);
    await tx.done;
  }
  
  // --- File/Blob Handling ---
  async getLessonThumbnailUrl(lessonId: string): Promise<string | null> {
    if (this.thumbUrlCache.has(lessonId)) {
      return this.thumbUrlCache.get(lessonId)!;
    }
    const db = await openBachataDB();
    const thumbBlob = await db.get(LESSON_THUMBNAILS_STORE, lessonId);
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
    const lesson = await db.get(LESSONS_STORE, lessonId);
    if (!lesson) return undefined;
    const videoFile = await db.get(VIDEO_FILES_STORE, lesson.videoId);
    return videoFile;
  }

  async getVideoObjectUrl(lesson: Lesson): Promise<string> {
    if (this.videoUrlCache.has(lesson.videoId)) {
      return this.videoUrlCache.get(lesson.videoId)!;
    }
    const db = await openBachataDB();
    const videoBlob = await db.get(VIDEO_FILES_STORE, lesson.videoId);
    if (!videoBlob) {
        throw new Error(`Video for lesson "${lesson.description || lesson.id}" not found in the database.`);
    }
    const url = URL.createObjectURL(videoBlob);
    this.videoUrlCache.set(lesson.videoId, url);
    return url;
  }

  public revokeVideoObjectUrl(videoId: string): void {
    this.revokeAndClearCache(videoId, 'video');
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
  async exportAllData(onProgress?: (progress: number) => void): Promise<Blob> {
    onProgress?.(0);
    const db = await openBachataDB();
    onProgress?.(0.01);
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
      figureCategories,
      lessonCategories,
      syncSettings,
      videoFileEntries,
      thumbnailEntries,
      figureThumbnailEntries
    ] = await Promise.all([
      tx.objectStore(LESSONS_STORE).getAll(),
      tx.objectStore(FIGURES_STORE).getAll(),
      tx.objectStore(FIGURE_CATEGORIES_STORE).getAll(),
      tx.objectStore(LESSON_CATEGORIES_STORE).getAll(),
      tx.objectStore(SETTINGS_STORE).get(SYNC_SETTINGS_KEY),
      getAllEntries<Blob>(VIDEO_FILES_STORE),
      getAllEntries<Blob>(LESSON_THUMBNAILS_STORE),
      getAllEntries<Blob>(FIGURE_THUMBNAILS_STORE)
    ]);
    
    // Ensure the transaction is complete before proceeding to CPU-intensive work.
    await tx.done;
    onProgress?.(0.20);

    // 2. After the transaction is closed, convert blobs to base64. This is async but doesn't need the DB.
    const totalBlobs = videoFileEntries.length + thumbnailEntries.length + figureThumbnailEntries.length;
    let blobsConverted = 0;
    const convertEntriesToBase64 = (entries: [IDBValidKey, Blob][]): Promise<[IDBValidKey, string][]> => {
      if (!entries) return Promise.resolve([]);
      const promises = entries.map(async ([key, blob]) => {
        const base64Value = await blobToBase64(blob);
        blobsConverted++;
        if (totalBlobs > 0) {
            onProgress?.(0.20 + (blobsConverted / totalBlobs) * 0.70); // Progress from 20% to 90%
        }
        return [key, base64Value] as [IDBValidKey, string];
      });
      return Promise.all(promises);
    };

    const [
      videoFiles,
      thumbnails,
      figureThumbnails
    ] = await Promise.all([
      convertEntriesToBase64(videoFileEntries),
      convertEntriesToBase64(thumbnailEntries),
      convertEntriesToBase64(figureThumbnailEntries)
    ]);
    onProgress?.(0.90);
    
    const videoFilesMap = new Map<string, string>(videoFiles as [string, string][]);

    // Reconstruct the old 'videos' format for export: [[lessonId, base64]]
    const videos = lessons.map(lesson => {
        const base64Data = videoFilesMap.get(lesson.videoId);
        return [lesson.id, base64Data || ''];
    }).filter(([, base64Data]) => base64Data);

    // 3. Construct the final export object.
    const exportObject = {
        '__BACHATA_MOVES_EXPORT__': true,
        'version': 3, // This version refers to export format, not DB schema.
        'exportDate': new Date().toISOString(),
        'data': {
            lessons: lessons || [],
            figures: figures || [],
            figureCategories: figureCategories || [],
            lessonCategories: lessonCategories || [],
            settings: syncSettings || {},
            videos: videos || [],
            thumbnails: thumbnails || [],
            figureThumbnails: figureThumbnails || [],
        },
    };

    onProgress?.(0.95);
    const jsonString = JSON.stringify(exportObject);
    const blob = new Blob([jsonString], { type: 'application/json' });
    onProgress?.(1);
    return blob;
  }

  async importData(dataBlob: Blob, onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(0);
    const jsonString = await dataBlob.text();
    const importObject = JSON.parse(jsonString);
    onProgress?.(0.02);

    if (!importObject || importObject.__BACHATA_MOVES_EXPORT__ !== true) {
        throw new Error('Invalid import file format.');
    }
    onProgress?.(0.05);

    const {
        lessons = [],
        figures = [],
        categories = [], // Legacy support for old imports
        figureCategories = categories,
        lessonCategories = [],
        settings: importedSyncSettings = {},
        videos: videoEntries = [],
        thumbnails: thumbnailEntries = [],
        figureThumbnails: figureThumbnailEntries = [],
    } = importObject.data;

    const totalBlobsToConvert = videoEntries.length + thumbnailEntries.length + figureThumbnailEntries.length;
    let blobsConverted = 0;

    const reportBlobProgress = () => {
        blobsConverted++;
        if (totalBlobsToConvert > 0) {
            onProgress?.(0.05 + (blobsConverted / totalBlobsToConvert) * 0.45); // 5% to 50%
        }
    };

    const videoIdMap = new Map<string, string>(); // lessonId -> new videoId
    const videoBlobPromises = videoEntries.map(async ([lessonId, base64Value]: [string, string]) => {
        const videoId = generateId();
        videoIdMap.set(lessonId, videoId);
        const blob = await dataUrlToBlob(base64Value);
        reportBlobProgress();
        return [videoId, blob] as [IDBValidKey, Blob];
    });

    const thumbnailBlobPromises = thumbnailEntries.map(async ([key, base64Value]: [string, string]) => {
        const blob = await dataUrlToBlob(base64Value);
        reportBlobProgress();
        return [key, blob] as [IDBValidKey, Blob];
    });

    const figureThumbnailBlobPromises = figureThumbnailEntries.map(async ([key, base64Value]: [string, string]) => {
        const blob = await dataUrlToBlob(base64Value);
        reportBlobProgress();
        return [key, blob] as [IDBValidKey, Blob];
    });

    const [
        videoBlobs,
        thumbnailBlobs,
        figureThumbnailBlobs
    ] = await Promise.all([
        Promise.all(videoBlobPromises),
        Promise.all(thumbnailBlobPromises),
        Promise.all(figureThumbnailBlobPromises),
    ]);
    onProgress?.(0.50);
    
    const lessonsWithVideoId = lessons.map((lesson: Lesson) => {
        const videoId = videoIdMap.get(lesson.id);
        if (videoId) {
            return { ...lesson, videoId };
        }
        return lesson;
    });
    
    this.videoUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.videoUrlCache.clear();
    this.thumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.thumbUrlCache.clear();
    this.figureThumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.figureThumbUrlCache.clear();

    const db = await openBachataDB();
    const tx = db.transaction(db.objectStoreNames, 'readwrite');

    try {
        // Clear all stores except for settings, as we want to preserve device settings.
        const storesToClear = Array.from(db.objectStoreNames)
            .filter(name => name !== SETTINGS_STORE);
        await Promise.all(storesToClear.map(name => tx.objectStore(name as any).clear()));
        onProgress?.(0.55);
        
        // Write all imported data. Only sync settings are overwritten.
        await tx.objectStore(SETTINGS_STORE).put(importedSyncSettings, SYNC_SETTINGS_KEY);
        onProgress?.(0.56);
        await Promise.all(lessonsWithVideoId.map((item: Lesson) => tx.objectStore(LESSONS_STORE).put(item)));
        onProgress?.(0.65);
        await Promise.all(figures.map((item: Figure) => tx.objectStore(FIGURES_STORE).put(item)));
        onProgress?.(0.70);
        await Promise.all(figureCategories.map((item: FigureCategory) => tx.objectStore(FIGURE_CATEGORIES_STORE).put(item)));
        onProgress?.(0.75);
        await Promise.all(lessonCategories.map((item: LessonCategory) => tx.objectStore(LESSON_CATEGORIES_STORE).put(item)));
        onProgress?.(0.80);
        await Promise.all(videoBlobs.map(([key, blob]) => tx.objectStore(VIDEO_FILES_STORE).put(blob, key)));
        onProgress?.(0.90);
        await Promise.all(thumbnailBlobs.map(([key, blob]) => tx.objectStore(LESSON_THUMBNAILS_STORE).put(blob, key)));
        onProgress?.(0.95);
        await Promise.all(figureThumbnailBlobs.map(([key, blob]) => tx.objectStore(FIGURE_THUMBNAILS_STORE).put(blob, key)));
        onProgress?.(0.99);

        await tx.done;
        onProgress?.(1);
    } catch (err) {
        console.error('Import transaction failed:', err);
        onProgress?.(0); // Reset progress on failure
        throw err;
    }
  }
}

/**
 * A singleton instance of the AppDataService.
 * Components will import this instance to interact with the application's data layer.
 */
export const dataService = new AppDataService();
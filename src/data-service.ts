import type { Lesson, Figure, AppSettings, IDataService } from './types';
import { openDB, type IDBPDatabase } from 'idb';

// --- Helper Functions ---
const generateId = (): string => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// --- IndexedDB Configuration ---
const DB_NAME = 'bachata-moves-db';
const DB_VERSION = 3;
const LESSONS_STORE = 'lessons';
const FIGURES_STORE = 'figures';
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
  
  // --- Settings ---
  async getSettings(): Promise<AppSettings> { 
    const db = await openBachataDB();
    const savedSettings = await db.get(SETTINGS_STORE, SETTINGS_KEY);
    const defaultSettings: AppSettings = {
      language: 'English',
      lessonSortOrder: 'newest',
      figureSortOrder: 'newest',
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
}

/**
 * A singleton instance of the AppDataService.
 * Components will import this instance to interact with the application's data layer.
 */
export const dataService = new AppDataService();
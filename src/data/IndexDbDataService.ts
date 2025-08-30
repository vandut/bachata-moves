import type { Lesson, Figure, AppSettings, FigureCategory, LessonCategory, SyncTask, School, Instructor } from '../types';
import type { DataService } from './DataService';
import { openDB, deleteDB, type IDBPDatabase, type IDBPObjectStore } from 'idb';
import { createLogger } from '../utils/logger';

const logger = createLogger('DataService');

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
const DB_VERSION = 12; // Incremented for schools and instructors
const LESSONS_STORE = 'lessons';
const FIGURES_STORE = 'figures';
const FIGURE_CATEGORIES_STORE = 'figure_categories';
const LESSON_CATEGORIES_STORE = 'lesson_categories';
const SCHOOLS_STORE = 'schools';
const INSTRUCTORS_STORE = 'instructors';
const SETTINGS_STORE = 'settings';
const VIDEO_FILES_STORE = 'video_files';
const LESSON_THUMBNAILS_STORE = 'lesson_thumbnails';
const FIGURE_THUMBNAILS_STORE = 'figure_thumbnails';
const DELETED_DRIVE_IDS_STORE = 'deleted_drive_ids';


const DEVICE_SETTINGS_KEY = 'device-settings';
const SYNC_SETTINGS_KEY = 'sync-settings';

const LEGACY_VIDEOS_STORE = 'videos';

export async function openBachataDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade: async (db, oldVersion, newVersion, tx) => {
      // Store Creation (Idempotent)
      if (!db.objectStoreNames.contains(LESSONS_STORE)) {
        db.createObjectStore(LESSONS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FIGURES_STORE)) {
        db.createObjectStore(FIGURES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FIGURE_CATEGORIES_STORE)) {
        db.createObjectStore(FIGURE_CATEGORIES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LESSON_CATEGORIES_STORE)) {
        db.createObjectStore(LESSON_CATEGORIES_STORE, { keyPath: 'id' });
      }
       if (!db.objectStoreNames.contains(SCHOOLS_STORE)) {
        db.createObjectStore(SCHOOLS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(INSTRUCTORS_STORE)) {
        db.createObjectStore(INSTRUCTORS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
      if (!db.objectStoreNames.contains(VIDEO_FILES_STORE)) {
        db.createObjectStore(VIDEO_FILES_STORE);
      }
      if (!db.objectStoreNames.contains(LESSON_THUMBNAILS_STORE)) {
        db.createObjectStore(LESSON_THUMBNAILS_STORE);
      }
      if (!db.objectStoreNames.contains(FIGURE_THUMBNAILS_STORE)) {
        db.createObjectStore(FIGURE_THUMBNAILS_STORE);
      }
      if (!db.objectStoreNames.contains(DELETED_DRIVE_IDS_STORE)) {
        db.createObjectStore(DELETED_DRIVE_IDS_STORE);
      }

      // Cleanup Legacy Stores
      if (db.objectStoreNames.contains(LEGACY_VIDEOS_STORE)) {
        db.deleteObjectStore(LEGACY_VIDEOS_STORE);
      }

      // Index Creation (Idempotent, using the upgrade transaction)
      const lessonsStore = tx.objectStore(LESSONS_STORE);
      if (!lessonsStore.indexNames.contains('categoryId')) lessonsStore.createIndex('categoryId', 'categoryId');
      if (!lessonsStore.indexNames.contains('schoolId')) lessonsStore.createIndex('schoolId', 'schoolId');
      if (!lessonsStore.indexNames.contains('instructorId')) lessonsStore.createIndex('instructorId', 'instructorId');
      if (!lessonsStore.indexNames.contains('driveId')) lessonsStore.createIndex('driveId', 'driveId', { unique: true, multiEntry: false });
      
      const figuresStore = tx.objectStore(FIGURES_STORE);
      if (!figuresStore.indexNames.contains('lessonId')) figuresStore.createIndex('lessonId', 'lessonId');
      if (!figuresStore.indexNames.contains('categoryId')) figuresStore.createIndex('categoryId', 'categoryId');
      if (!figuresStore.indexNames.contains('schoolId')) figuresStore.createIndex('schoolId', 'schoolId');
      if (!figuresStore.indexNames.contains('instructorId')) figuresStore.createIndex('instructorId', 'instructorId');
      if (!figuresStore.indexNames.contains('driveId')) figuresStore.createIndex('driveId', 'driveId', { unique: true, multiEntry: false });

      // Version-based Migrations
      if (oldVersion < 12) {
          const storesWithSync = [SCHOOLS_STORE, INSTRUCTORS_STORE];
          for (const storeName of storesWithSync) {
              const store = tx.objectStore(storeName as any);
              if (!store.indexNames.contains('driveId')) {
                  store.createIndex('driveId', 'driveId', { unique: false });
              }
               if (!store.indexNames.contains('modifiedTime')) {
                  store.createIndex('modifiedTime', 'modifiedTime', { unique: false });
              }
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
    if (!dataUrl || !dataUrl.startsWith('data:')) {
        throw new Error('Invalid data URL provided for blob conversion.');
    }
    const res = await fetch(dataUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch data URL: ${res.statusText}`);
    }
    const blob = await res.blob();
    if (blob.size === 0) {
        console.warn('Converted a data URL to an empty blob. The data URL might be corrupt.');
    }
    return blob;
};


export class IndexDbDataService implements DataService {
  private videoUrlCache = new Map<string, string>();
  private thumbUrlCache = new Map<string, string>();
  private figureThumbUrlCache = new Map<string, string>();
  private listeners = new Set<() => void>();

  // --- Subscription ---
  public subscribe = (callback: () => void): () => void => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify = (): void => {
    logger.info("Notifying listeners of data change.");
    // Use a timeout to batch notifications and prevent rapid-fire updates
    setTimeout(() => {
      this.listeners.forEach(cb => cb());
    }, 100);
  }

  // --- Tombstone / Deleted IDs ---
  public addDeletedDriveId = async (driveId: string): Promise<void> => {
    logger.info(`Adding driveId ${driveId} to tombstone log.`);
    const db = await openBachataDB();
    await db.put(DELETED_DRIVE_IDS_STORE, { id: driveId, deletedAt: new Date().toISOString() }, driveId);
  }

  public getDeletedDriveIds = async (): Promise<string[]> => {
    const db = await openBachataDB();
    const keys = await db.getAllKeys(DELETED_DRIVE_IDS_STORE);
    return keys as string[];
  }

  public removeDeletedDriveId = async (driveId: string): Promise<void> => {
    const db = await openBachataDB();
    await db.delete(DELETED_DRIVE_IDS_STORE, driveId);
  }

  // --- Lessons ---
  public getLessons = async (): Promise<Lesson[]> => { 
    const db = await openBachataDB();
    return db.getAll(LESSONS_STORE);
  }

  public addLesson = async (lessonData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, videoFile: File): Promise<Lesson> => {
    const db = await openBachataDB();
    const newId = generateId();
    const newVideoId = generateId();
    
    const newLesson: Lesson = {
      ...lessonData,
      id: newId,
      videoId: newVideoId,
      thumbTime: 0, // Default to first frame
      modifiedTime: new Date().toISOString(),
    };

    const thumbnailBlob = await generateThumbnailBlob(videoFile, 0);

    const tx = db.transaction([LESSONS_STORE, VIDEO_FILES_STORE, LESSON_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(LESSONS_STORE).put(newLesson),
      tx.objectStore(VIDEO_FILES_STORE).put(videoFile, newVideoId),
      tx.objectStore(LESSON_THUMBNAILS_STORE).put(thumbnailBlob, newId),
    ]);
    await tx.done;

    this.notify();
    return newLesson;
  }
  
  public updateLesson = async (lessonId: string, lessonUpdateData: Partial<Omit<Lesson, 'id'>>): Promise<Lesson> => {
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
    const updatedLesson = { 
        ...lesson, 
        ...lessonUpdateData, 
        modifiedTime: lessonUpdateData.modifiedTime || new Date().toISOString() 
    };
    
    const writePromises: Promise<any>[] = [
      tx.objectStore(LESSONS_STORE).put(updatedLesson),
    ];

    if (newThumbnailBlob) {
      writePromises.push(tx.objectStore(LESSON_THUMBNAILS_STORE).put(newThumbnailBlob, lessonId));
    }
    
    await Promise.all(writePromises);
    await tx.done;

    this.notify();
    return updatedLesson;
  }

  public deleteLesson = async (lessonId: string, options?: { skipTombstone?: boolean }): Promise<void> => {
    logger.info(`Deleting lesson ${lessonId}, skipTombstone: ${!!options?.skipTombstone}`);
    const db = await openBachataDB();
    const lesson = await db.get(LESSONS_STORE, lessonId);
    if (!lesson) {
        logger.warn(`Lesson ${lessonId} not found for deletion.`);
        return;
    }
    
    // Add to tombstone list *before* deleting, if it has a driveId and we are NOT skipping.
    if (lesson.driveId && !options?.skipTombstone) {
        logger.info(`Lesson ${lessonId} has driveId ${lesson.driveId}. Adding to tombstone.`);
        await this.addDeletedDriveId(lesson.driveId);
        if (lesson.videoDriveId) {
            logger.info(`Lesson ${lessonId} has videoDriveId ${lesson.videoDriveId}. Adding to tombstone.`);
            await this.addDeletedDriveId(lesson.videoDriveId);
        }
    }

    this.revokeAndClearCache(lesson.videoId, 'video');
    this.revokeAndClearCache(lessonId, 'thumbnail');

    const tx = db.transaction([LESSONS_STORE, VIDEO_FILES_STORE, LESSON_THUMBNAILS_STORE, FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');

    const allLessons = await tx.objectStore(LESSONS_STORE).getAll();
    const otherLessonsUsingVideo = allLessons.filter(l => l.videoId === lesson.videoId && l.id !== lessonId);

    const figuresToDelete = await tx.objectStore(FIGURES_STORE).index('lessonId').getAll(lessonId);

    const deletePromises = [
      tx.objectStore(LESSONS_STORE).delete(lessonId),
      otherLessonsUsingVideo.length === 0 ? tx.objectStore(VIDEO_FILES_STORE).delete(lesson.videoId) : Promise.resolve(),
      tx.objectStore(LESSON_THUMBNAILS_STORE).delete(lessonId),
      ...figuresToDelete.map(async (fig) => {
        if (fig.driveId && !options?.skipTombstone) { // Also respect skipTombstone for child figures
            logger.info(`Child figure ${fig.id} of lesson ${lessonId} has driveId ${fig.driveId}. Adding to tombstone.`);
            await this.addDeletedDriveId(fig.driveId);
        }
        this.revokeAndClearCache(fig.id, 'figure-thumbnail');
        await tx.objectStore(FIGURE_THUMBNAILS_STORE).delete(fig.id);
        await tx.objectStore(FIGURES_STORE).delete(fig.id);
      })
    ];
    
    await Promise.all(deletePromises);
    await tx.done;
    logger.info(`Successfully deleted lesson ${lessonId} and ${figuresToDelete.length} associated figures from local DB.`);
    this.notify();
  }

  public saveDownloadedLesson = async (lesson: Lesson, videoFile?: Blob): Promise<void> => {
    this.revokeAndClearCache(lesson.videoId, 'video');
    this.revokeAndClearCache(lesson.id, 'thumbnail');

    const db = await openBachataDB();
    
    // Use the provided video file, or fetch the existing one from the DB if it's not provided.
    const videoBlobForThumbnail = videoFile ?? await db.get(VIDEO_FILES_STORE, lesson.videoId);
    if (!videoBlobForThumbnail) {
        throw new Error(`Video blob for lesson ${lesson.id} could not be found to generate a thumbnail.`);
    }

    const thumbnailBlob = await generateThumbnailBlob(new File([videoBlobForThumbnail], `${lesson.videoId}.bin`, { type: videoBlobForThumbnail.type }), lesson.thumbTime);

    const tx = db.transaction([LESSONS_STORE, VIDEO_FILES_STORE, LESSON_THUMBNAILS_STORE], 'readwrite');
    const writePromises = [
        tx.objectStore(LESSONS_STORE).put(lesson),
        tx.objectStore(LESSON_THUMBNAILS_STORE).put(thumbnailBlob, lesson.id),
    ];
    
    // Only write the video file if a new one was actually downloaded and provided.
    if (videoFile) {
        writePromises.push(tx.objectStore(VIDEO_FILES_STORE).put(videoFile, lesson.videoId));
    }

    await Promise.all(writePromises);
    await tx.done;
    this.notify();
  }

  // --- Figures ---
  public getFigures = async (): Promise<Figure[]> => { 
    const db = await openBachataDB();
    return db.getAll(FIGURES_STORE);
  }

  public addFigure = async (lessonId: string, figureData: Omit<Figure, 'id' | 'lessonId'>): Promise<Figure> => {
    const db = await openBachataDB();

    // Perform all reads and long-running operations *before* the write transaction.
    const lesson = await db.get(LESSONS_STORE, lessonId);
    if (!lesson) throw new Error(`Cannot add figure. Lesson with id "${lessonId}" does not exist.`);
    
    const videoFile = await db.get(VIDEO_FILES_STORE, lesson.videoId);
    if (!videoFile) throw new Error(`Video for lesson "${lessonId}" not found.`);

    const newFigure: Figure = { ...figureData, id: generateId(), lessonId, modifiedTime: new Date().toISOString() };
    const thumbnailBlob = await generateThumbnailBlob(videoFile, newFigure.thumbTime);

    // Start a short, focused transaction for writes only.
    const tx = db.transaction([FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(FIGURES_STORE).put(newFigure),
      tx.objectStore(FIGURE_THUMBNAILS_STORE).put(thumbnailBlob, newFigure.id)
    ]);
    await tx.done;
    
    this.notify();
    return newFigure;
  }

  public updateFigure = async (figureId: string, figureUpdateData: Partial<Omit<Figure, 'id' | 'lessonId'>>): Promise<Figure> => {
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
    const updatedFigure = { 
        ...figure, 
        ...figureUpdateData, 
        modifiedTime: figureUpdateData.modifiedTime || new Date().toISOString() 
    };
    
    const writePromises = [
      tx.objectStore(FIGURES_STORE).put(updatedFigure),
    ];

    if (newThumbnailBlob) {
      writePromises.push(tx.objectStore(FIGURE_THUMBNAILS_STORE).put(newThumbnailBlob, figureId));
    }
    
    await Promise.all(writePromises);
    await tx.done;
    
    this.notify();
    return updatedFigure;
  }

  public deleteFigure = async (figureId: string, options?: { skipTombstone?: boolean }): Promise<void> => {
    logger.info(`Deleting figure ${figureId}, skipTombstone: ${!!options?.skipTombstone}`);
    const db = await openBachataDB();
    const figure = await db.get(FIGURES_STORE, figureId);
    if (!figure) {
        logger.warn(`Figure ${figureId} not found for deletion.`);
        return;
    }

    if (figure.driveId && !options?.skipTombstone) {
        logger.info(`Figure ${figureId} has driveId ${figure.driveId}. Adding to tombstone.`);
        await this.addDeletedDriveId(figure.driveId);
    }
    this.revokeAndClearCache(figureId, 'figure-thumbnail');
    
    const tx = db.transaction([FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(FIGURES_STORE).delete(figureId),
      tx.objectStore(FIGURE_THUMBNAILS_STORE).delete(figureId)
    ]);
    await tx.done;
    logger.info(`Successfully deleted figure ${figureId} from local DB.`);
    this.notify();
  }

  public saveDownloadedFigure = async (figure: Figure): Promise<void> => {
    this.revokeAndClearCache(figure.id, 'figure-thumbnail');

    const db = await openBachataDB();
    const lesson = await db.get(LESSONS_STORE, figure.lessonId);
    if (!lesson) throw new Error(`Parent lesson ${figure.lessonId} for figure ${figure.id} not found locally.`);
    const videoFile = await db.get(VIDEO_FILES_STORE, lesson.videoId);
    if (!videoFile) throw new Error(`Video file ${lesson.videoId} for figure ${figure.id} not found locally.`);

    const thumbnailBlob = await generateThumbnailBlob(videoFile, figure.thumbTime);
    
    const tx = db.transaction([FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(FIGURES_STORE).put(figure),
      tx.objectStore(FIGURE_THUMBNAILS_STORE).put(thumbnailBlob, figure.id),
    ]);
    await tx.done;
    this.notify();
  }
  
  // --- Figure Categories ---
  public getFigureCategories = async (): Promise<FigureCategory[]> => {
    const db = await openBachataDB();
    return await db.getAll(FIGURE_CATEGORIES_STORE);
  }
  
  public addFigureCategory = async (categoryName: string): Promise<FigureCategory> => {
    const db = await openBachataDB();
    const newCategory: FigureCategory = {
      id: generateId(),
      name: categoryName,
      modifiedTime: new Date().toISOString(),
    };
    await db.put(FIGURE_CATEGORIES_STORE, newCategory);
    this.notify();
    return newCategory;
  }

  public updateFigureCategory = async (categoryId: string, categoryUpdateData: Partial<Omit<FigureCategory, 'id'>>): Promise<FigureCategory> => {
    const db = await openBachataDB();
    const category = await db.get(FIGURE_CATEGORIES_STORE, categoryId);
    if (!category) throw new Error(`Category with id "${categoryId}" not found.`);

    const updatedCategory = { 
        ...category, 
        ...categoryUpdateData, 
        modifiedTime: categoryUpdateData.modifiedTime || new Date().toISOString() 
    };
    await db.put(FIGURE_CATEGORIES_STORE, updatedCategory);
    this.notify();
    return updatedCategory;
  }

  public deleteFigureCategory = async (categoryId: string): Promise<void> => {
    const db = await openBachataDB();
    const category = await db.get(FIGURE_CATEGORIES_STORE, categoryId);
    if (!category) return;
    
    if (category.driveId) {
        await this.addDeletedDriveId(category.driveId);
    }
    
    const tx = db.transaction([FIGURE_CATEGORIES_STORE, FIGURES_STORE], 'readwrite');
    
    const figuresToUpdate = await tx.objectStore(FIGURES_STORE).index('categoryId').getAll(categoryId);

    const updatePromises = figuresToUpdate.map(figure => {
      const updatedFigure = { ...figure, categoryId: null, modifiedTime: new Date().toISOString() };
      return tx.objectStore(FIGURES_STORE).put(updatedFigure);
    });

    await Promise.all(updatePromises);
    await tx.objectStore(FIGURE_CATEGORIES_STORE).delete(categoryId);
    await tx.done;
    this.notify();
  }

  // --- Lesson Categories ---
  public getLessonCategories = async (): Promise<LessonCategory[]> => {
    const db = await openBachataDB();
    return await db.getAll(LESSON_CATEGORIES_STORE);
  }
  
  public addLessonCategory = async (categoryName: string): Promise<LessonCategory> => {
    const db = await openBachataDB();
    const newCategory: LessonCategory = {
      id: generateId(),
      name: categoryName,
      modifiedTime: new Date().toISOString(),
    };
    await db.put(LESSON_CATEGORIES_STORE, newCategory);
    this.notify();
    return newCategory;
  }

  public updateLessonCategory = async (categoryId: string, categoryUpdateData: Partial<Omit<LessonCategory, 'id'>>): Promise<LessonCategory> => {
    const db = await openBachataDB();
    const category = await db.get(LESSON_CATEGORIES_STORE, categoryId);
    if (!category) throw new Error(`Lesson category with id "${categoryId}" not found.`);

    const updatedCategory = { 
        ...category, 
        ...categoryUpdateData, 
        modifiedTime: categoryUpdateData.modifiedTime || new Date().toISOString() 
    };
    await db.put(LESSON_CATEGORIES_STORE, updatedCategory);
    this.notify();
    return updatedCategory;
  }

  public deleteLessonCategory = async (categoryId: string): Promise<void> => {
    const db = await openBachataDB();
    const category = await db.get(LESSON_CATEGORIES_STORE, categoryId);
    if (!category) return;
    
    if (category.driveId) {
        await this.addDeletedDriveId(category.driveId);
    }
    
    const tx = db.transaction([LESSON_CATEGORIES_STORE, LESSONS_STORE], 'readwrite');
    
    const lessonsToUpdate = await tx.objectStore(LESSONS_STORE).index('categoryId').getAll(categoryId);

    const updatePromises = lessonsToUpdate.map(lesson => {
      const updatedLesson = { ...lesson, categoryId: null, modifiedTime: new Date().toISOString() };
      return tx.objectStore(LESSONS_STORE).put(updatedLesson);
    });

    await Promise.all(updatePromises);
    await tx.objectStore(LESSON_CATEGORIES_STORE).delete(categoryId);
    await tx.done;
    this.notify();
  }

  // --- Schools ---
  public getSchools = async (): Promise<School[]> => {
    const db = await openBachataDB();
    return await db.getAll(SCHOOLS_STORE);
  }

  public addSchool = async (name: string): Promise<School> => {
    const db = await openBachataDB();
    const newSchool: School = { id: generateId(), name, modifiedTime: new Date().toISOString() };
    await db.put(SCHOOLS_STORE, newSchool);
    this.notify();
    return newSchool;
  }

  public updateSchool = async (id: string, updateData: Partial<Omit<School, 'id'>>): Promise<School> => {
    const db = await openBachataDB();
    const school = await db.get(SCHOOLS_STORE, id);
    if (!school) throw new Error(`School with id "${id}" not found.`);
    const updatedSchool = { 
        ...school, 
        ...updateData, 
        modifiedTime: updateData.modifiedTime || new Date().toISOString() 
    };
    await db.put(SCHOOLS_STORE, updatedSchool);
    this.notify();
    return updatedSchool;
  }

  public deleteSchool = async (id: string): Promise<void> => {
    const db = await openBachataDB();
    const school = await db.get(SCHOOLS_STORE, id);
    if (!school) return;
    if (school.driveId) await this.addDeletedDriveId(school.driveId);
    
    const tx = db.transaction([SCHOOLS_STORE, LESSONS_STORE, FIGURES_STORE], 'readwrite');
    const lessonsToUpdate = await tx.objectStore(LESSONS_STORE).index('schoolId').getAll(id);
    const figuresToUpdate = await tx.objectStore(FIGURES_STORE).index('schoolId').getAll(id);
    
    const updatePromises = [
        ...lessonsToUpdate.map(item => tx.objectStore(LESSONS_STORE).put({ ...item, schoolId: null, modifiedTime: new Date().toISOString() })),
        ...figuresToUpdate.map(item => tx.objectStore(FIGURES_STORE).put({ ...item, schoolId: null, modifiedTime: new Date().toISOString() }))
    ];

    await Promise.all(updatePromises);
    await tx.objectStore(SCHOOLS_STORE).delete(id);
    await tx.done;
    this.notify();
  }

  // --- Instructors ---
  public getInstructors = async (): Promise<Instructor[]> => {
    const db = await openBachataDB();
    return await db.getAll(INSTRUCTORS_STORE);
  }

  public addInstructor = async (name: string): Promise<Instructor> => {
    const db = await openBachataDB();
    const newInstructor: Instructor = { id: generateId(), name, modifiedTime: new Date().toISOString() };
    await db.put(INSTRUCTORS_STORE, newInstructor);
    this.notify();
    return newInstructor;
  }

  public updateInstructor = async (id: string, updateData: Partial<Omit<Instructor, 'id'>>): Promise<Instructor> => {
    const db = await openBachataDB();
    const instructor = await db.get(INSTRUCTORS_STORE, id);
    if (!instructor) throw new Error(`Instructor with id "${id}" not found.`);
    const updatedInstructor = { 
        ...instructor, 
        ...updateData, 
        modifiedTime: updateData.modifiedTime || new Date().toISOString() 
    };
    await db.put(INSTRUCTORS_STORE, updatedInstructor);
    this.notify();
    return updatedInstructor;
  }

  public deleteInstructor = async (id: string): Promise<void> => {
    const db = await openBachataDB();
    const instructor = await db.get(INSTRUCTORS_STORE, id);
    if (!instructor) return;
    if (instructor.driveId) await this.addDeletedDriveId(instructor.driveId);
    
    const tx = db.transaction([INSTRUCTORS_STORE, LESSONS_STORE, FIGURES_STORE], 'readwrite');
    const lessonsToUpdate = await tx.objectStore(LESSONS_STORE).index('instructorId').getAll(id);
    const figuresToUpdate = await tx.objectStore(FIGURES_STORE).index('instructorId').getAll(id);
    
    const updatePromises = [
        ...lessonsToUpdate.map(item => tx.objectStore(LESSONS_STORE).put({ ...item, instructorId: null, modifiedTime: new Date().toISOString() })),
        ...figuresToUpdate.map(item => tx.objectStore(FIGURES_STORE).put({ ...item, instructorId: null, modifiedTime: new Date().toISOString() }))
    ];

    await Promise.all(updatePromises);
    await tx.objectStore(INSTRUCTORS_STORE).delete(id);
    await tx.done;
    this.notify();
  }

  // --- Settings ---
  public getSettings = async (): Promise<AppSettings> => { 
    const db = await openBachataDB();
    const [savedDeviceSettings, savedSyncSettings] = await Promise.all([
        db.get(SETTINGS_STORE, DEVICE_SETTINGS_KEY),
        db.get(SETTINGS_STORE, SYNC_SETTINGS_KEY)
    ]);
    
    const defaultDeviceSettings: Partial<AppSettings> = {
      language: getInitialLanguage(),
      autoplayGalleryVideos: false,
      isMuted: false,
      volume: 1,
      lessonSortOrder: 'newest',
      figureSortOrder: 'newest',
      lessonGrouping: 'none',
      figureGrouping: 'none',
      collapsedLessonDateGroups: [],
      collapsedFigureDateGroups: [],
      uncategorizedFigureCategoryIsExpanded: true,
      uncategorizedLessonCategoryIsExpanded: true,
      collapsedLessonCategories: [],
      collapsedFigureCategories: [],
      // School Grouping Settings
      collapsedLessonSchools: [],
      collapsedFigureSchools: [],
      uncategorizedLessonSchoolIsExpanded: true,
      uncategorizedFigureSchoolIsExpanded: true,
      // Instructor Grouping Settings
      collapsedLessonInstructors: [],
      collapsedFigureInstructors: [],
      uncategorizedLessonInstructorIsExpanded: true,
      uncategorizedFigureInstructorIsExpanded: true,
      // Filters
      lessonFilter_excludedYears: [],
      lessonFilter_excludedCategoryIds: [],
      lessonFilter_excludedSchoolIds: [],
      lessonFilter_excludedInstructorIds: [],
      figureFilter_excludedYears: [],
      figureFilter_excludedCategoryIds: [],
      figureFilter_excludedSchoolIds: [],
      figureFilter_excludedInstructorIds: [],
    };

    const defaultSyncSettings: Partial<AppSettings> = {
      figureCategoryOrder: [],
      showEmptyFigureCategoriesInGroupedView: false,
      showFigureCountInGroupHeaders: false,
      lessonCategoryOrder: [],
      showEmptyLessonCategoriesInGroupedView: false,
      showLessonCountInGroupHeaders: false,
      lessonSchoolOrder: [],
      figureSchoolOrder: [],
      lessonInstructorOrder: [],
      figureInstructorOrder: [],
      lastSyncTimestamp: undefined,
    };

    return {
        ...defaultDeviceSettings,
        ...(savedDeviceSettings || {}),
        ...defaultSyncSettings,
        ...(savedSyncSettings || {}),
    } as AppSettings;
  }

  public saveSettings = async (settingsData: AppSettings, options?: { silent?: boolean }): Promise<void> => {
    const db = await openBachataDB();
    const deviceSettings: Partial<AppSettings> = {};
    const syncSettings: Partial<AppSettings> & { modifiedTime?: string } = {};
    const deviceSettingKeys: (keyof AppSettings)[] = [
        'language',
        'autoplayGalleryVideos',
        'isMuted',
        'volume',
        'lessonSortOrder',
        'figureSortOrder',
        'lessonGrouping',
        'figureGrouping',
        'collapsedLessonDateGroups',
        'collapsedFigureDateGroups',
        'uncategorizedLessonCategoryIsExpanded',
        'uncategorizedFigureCategoryIsExpanded',
        'collapsedLessonCategories',
        'collapsedFigureCategories',
        'collapsedLessonSchools',
        'collapsedFigureSchools',
        'uncategorizedLessonSchoolIsExpanded',
        'uncategorizedFigureSchoolIsExpanded',
        'collapsedLessonInstructors',
        'collapsedFigureInstructors',
        'uncategorizedLessonInstructorIsExpanded',
        'uncategorizedFigureInstructorIsExpanded',
        'lessonFilter_excludedYears',
        'lessonFilter_excludedCategoryIds',
        'lessonFilter_excludedSchoolIds',
        'lessonFilter_excludedInstructorIds',
        'figureFilter_excludedYears',
        'figureFilter_excludedCategoryIds',
        'figureFilter_excludedSchoolIds',
        'figureFilter_excludedInstructorIds',
    ];

    for (const key in settingsData) {
        const typedKey = key as keyof AppSettings;
        if (deviceSettingKeys.includes(typedKey)) {
            (deviceSettings as any)[typedKey] = settingsData[typedKey];
        } else {
            (syncSettings as any)[typedKey] = settingsData[typedKey];
        }
    }
    
    // Add a modifiedTime to the syncable settings object for comparison
    syncSettings.modifiedTime = new Date().toISOString();
    
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    await Promise.all([
        tx.objectStore(SETTINGS_STORE).put(deviceSettings, DEVICE_SETTINGS_KEY),
        tx.objectStore(SETTINGS_STORE).put(syncSettings, SYNC_SETTINGS_KEY)
    ]);
    await tx.done;

    if (!options?.silent) {
      this.notify();
    }
  }
  
  // --- File/Blob Handling ---
  public getLessonThumbnailUrl = async (lessonId: string): Promise<string | null> => {
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
  
  public getFigureThumbnailUrl = async (figureId: string): Promise<string | null> => {
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

  public getVideoFile = async (lessonId: string): Promise<File | undefined> => {
    const db = await openBachataDB();
    const lesson = await db.get(LESSONS_STORE, lessonId);
    if (!lesson) return undefined;
    const videoFile = await db.get(VIDEO_FILES_STORE, lesson.videoId);
    return videoFile;
  }

  public getVideoObjectUrl = async (lesson: Lesson): Promise<string> => {
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

  public revokeVideoObjectUrl = (videoId: string): void => {
    this.revokeAndClearCache(videoId, 'video');
  }

  private revokeAndClearCache = (id: string, type: 'thumbnail' | 'figure-thumbnail' | 'video' | 'all'): void => {
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

  public clearAllData = async (): Promise<void> => {
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
    this.notify();
  }

  // --- Data Management ---
  public exportAllData = async (onProgress?: (progress: number) => void): Promise<Blob> => {
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
      schools,
      instructors,
      syncSettings,
      videoFileEntries,
      thumbnailEntries,
      figureThumbnailEntries
    ] = await Promise.all([
      tx.objectStore(LESSONS_STORE).getAll(),
      tx.objectStore(FIGURES_STORE).getAll(),
      tx.objectStore(FIGURE_CATEGORIES_STORE).getAll(),
      tx.objectStore(LESSON_CATEGORIES_STORE).getAll(),
      tx.objectStore(SCHOOLS_STORE).getAll(),
      tx.objectStore(INSTRUCTORS_STORE).getAll(),
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
            schools: schools || [],
            instructors: instructors || [],
            settings: syncSettings || {},
            videos: videoFiles || [], // Use videoFiles directly ([videoId, base64])
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

  public importData = async (dataBlob: Blob, onProgress?: (progress: number) => void): Promise<void> => {
    onProgress?.(0);
    const jsonString = await dataBlob.text();
    const importObject = JSON.parse(jsonString);
    onProgress?.(0.02);

    if (!importObject || importObject.__BACHATA_MOVES_EXPORT__ !== true || importObject.version !== 3) {
        throw new Error('Invalid or unsupported import file format.');
    }
    onProgress?.(0.05);

    const {
        lessons = [],
        figures = [],
        categories = [], // Legacy support for old imports
        figureCategories = categories,
        lessonCategories = [],
        schools = [],
        instructors = [],
        settings: importedSyncSettings = {},
        videos: originalVideoEntries = [],
        thumbnails: thumbnailEntries = [],
        figureThumbnails: figureThumbnailEntries = [],
    } = importObject.data;
    
    // --- Start: Backward Compatibility Fix ---
    // Heuristic to detect old export format where videos were keyed by lesson.id instead of lesson.videoId.
    const lessonIdSet = new Set(lessons.map((l: Lesson) => l.id));
    const isOldVideoFormat = originalVideoEntries.length > 0 && originalVideoEntries.every(([key]: [string, string]) => lessonIdSet.has(key));
    
    let videoEntries = originalVideoEntries;

    if (isOldVideoFormat) {
      console.log("Old video format detected, remapping video keys from lesson.id to lesson.videoId.");
      const lessonMap = new Map<string, Lesson>(lessons.map((l: Lesson) => [l.id, l]));
      videoEntries = originalVideoEntries.map(([lessonId, base64]: [string, string]) => {
        const lesson = lessonMap.get(lessonId);
        // If a lesson for this video exists, use its videoId as the new key.
        // Otherwise, this video is orphaned and will be skipped.
        return lesson ? [lesson.videoId, base64] : null;
      }).filter((entry: [string, string] | null): entry is [string, string] => entry !== null);
    }
    // --- End: Backward Compatibility Fix ---

    const totalBlobsToConvert = videoEntries.length + thumbnailEntries.length + figureThumbnailEntries.length;
    let blobsConverted = 0;

    const reportBlobProgress = () => {
        blobsConverted++;
        if (totalBlobsToConvert > 0) {
            onProgress?.(0.05 + (blobsConverted / totalBlobsToConvert) * 0.45); // 5% to 50%
        }
    };
    
    const convertAndFilter = async (entries: [string, string][], type: string) => {
        const promises = entries.map(async ([key, base64Value]: [string, string]) => {
            try {
                if (!base64Value || typeof base64Value !== 'string' || !base64Value.startsWith('data:')) {
                    throw new Error('Invalid base64 value');
                }
                const blob = await dataUrlToBlob(base64Value);
                reportBlobProgress();
                return [key, blob] as [IDBValidKey, Blob];
            } catch (e: any) {
                console.warn(`Skipping invalid ${type} data for key: ${key}. Error: ${e.message}`);
                reportBlobProgress(); // Still report progress even on failure
                return null;
            }
        });
        const resultsWithNulls = await Promise.all(promises);
        return resultsWithNulls.filter(entry => entry !== null) as [IDBValidKey, Blob][];
    };

    const [
        videoBlobs,
        thumbnailBlobs,
        figureThumbnailBlobs
    ] = await Promise.all([
        convertAndFilter(videoEntries, 'video'),
        convertAndFilter(thumbnailEntries, 'thumbnail'),
        convertAndFilter(figureThumbnailEntries, 'figure thumbnail'),
    ]);
    onProgress?.(0.50);

    this.videoUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.videoUrlCache.clear();
    this.thumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.thumbUrlCache.clear();
    this.figureThumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.figureThumbUrlCache.clear();

    const db = await openBachataDB();
    const tx = db.transaction(db.objectStoreNames, 'readwrite');

    try {
        onProgress?.(0.55);
        
        await tx.objectStore(SETTINGS_STORE).put(importedSyncSettings, SYNC_SETTINGS_KEY);
        onProgress?.(0.56);
        
        const cleanAndPut = async (storeName: string, items: any[]) => {
            if (!items) return;
            const store = tx.objectStore(storeName as any);
            await store.clear();
            const cleanedItems = items.map(item => {
                const { isExpanded, ...rest } = item; // Remove legacy isExpanded property
                return rest;
            });
            await Promise.all(cleanedItems.map(item => store.put(item)));
        };

        await cleanAndPut(LESSONS_STORE, lessons);
        onProgress?.(0.65);
        await cleanAndPut(FIGURES_STORE, figures);
        onProgress?.(0.70);
        await cleanAndPut(FIGURE_CATEGORIES_STORE, figureCategories);
        onProgress?.(0.75);
        await cleanAndPut(LESSON_CATEGORIES_STORE, lessonCategories);
        onProgress?.(0.80);
        await cleanAndPut(SCHOOLS_STORE, schools);
        onProgress?.(0.82);
        await cleanAndPut(INSTRUCTORS_STORE, instructors);
        onProgress?.(0.85);

        await Promise.all(videoBlobs.map(([key, blob]) => tx.objectStore(VIDEO_FILES_STORE).put(blob, key)));
        onProgress?.(0.90);
        await Promise.all(thumbnailBlobs.map(([key, blob]) => tx.objectStore(LESSON_THUMBNAILS_STORE).put(blob, key)));
        onProgress?.(0.95);
        await Promise.all(figureThumbnailBlobs.map(([key, blob]) => tx.objectStore(FIGURE_THUMBNAILS_STORE).put(blob, key)));
        onProgress?.(0.99);

        await tx.done;
        onProgress?.(1);
        this.notify();
    } catch (err) {
        console.error('Import transaction failed:', err);
        onProgress?.(0); // Reset progress on failure
        throw err;
    }
  }
}
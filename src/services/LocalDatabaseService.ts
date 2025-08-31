import type { Lesson, Figure, FigureCategory, LessonCategory, School, Instructor } from '../types';
import type { AppSettings } from '../contexts/SettingsContext';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { createLogger } from '../utils/logger';

// --- Interface ---

export interface LocalDatabaseService {
  // Lessons
  getLessons(): Promise<Lesson[]>;
  addLesson(lessonData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, videoFile: File, thumbnailBlob: Blob): Promise<Lesson>;
  updateLesson(lessonId: string, lessonUpdateData: Partial<Omit<Lesson, 'id'>>, newThumbnailBlob?: Blob | null): Promise<Lesson>;
  deleteLesson(lessonId: string): Promise<void>;
  saveDownloadedLesson(lesson: Lesson, videoFile: Blob, thumbnailBlob: Blob): Promise<void>;

  // Figures
  getFigures(): Promise<Figure[]>;
  addFigure(lessonId: string, figureData: Omit<Figure, 'id' | 'lessonId'>, thumbnailBlob: Blob): Promise<Figure>;
  updateFigure(figureId: string, figureUpdateData: Partial<Omit<Figure, 'id' | 'lessonId'>>, newThumbnailBlob?: Blob | null): Promise<Figure>;
  deleteFigure(figureId: string): Promise<void>;
  saveDownloadedFigure(figure: Figure, thumbnailBlob: Blob): Promise<void>;

  // Figure Categories
  getFigureCategories(): Promise<FigureCategory[]>;
  addFigureCategory(categoryName: string): Promise<FigureCategory>;
  updateFigureCategory(categoryId: string, categoryUpdateData: Partial<Omit<FigureCategory, 'id'>>): Promise<FigureCategory>;
  deleteFigureCategory(categoryId: string): Promise<void>;
  
  // Lesson Categories
  getLessonCategories(): Promise<LessonCategory[]>;
  addLessonCategory(categoryName: string): Promise<LessonCategory>;
  updateLessonCategory(categoryId: string, categoryUpdateData: Partial<Omit<LessonCategory, 'id'>>): Promise<LessonCategory>;
  deleteLessonCategory(categoryId: string): Promise<void>;

  // Schools
  getSchools(): Promise<School[]>;
  addSchool(name: string): Promise<School>;
  updateSchool(id: string, updateData: Partial<Omit<School, 'id'>>): Promise<School>;
  deleteSchool(id: string): Promise<void>;
  
  // Instructors
  getInstructors(): Promise<Instructor[]>;
  addInstructor(name: string): Promise<Instructor>;
  updateInstructor(id: string, updateData: Partial<Omit<Instructor, 'id'>>): Promise<Instructor>;
  deleteInstructor(id: string): Promise<void>;

  // Settings
  getRawSettings(): Promise<{ device: Partial<AppSettings> | undefined; sync: Partial<AppSettings> | undefined; }>;
  saveAllSettings(settingsData: AppSettings, modifiedTime?: string): Promise<void>;
  
  // Blob Handling
  getVideoBlob(videoId: string): Promise<Blob | undefined>;
  getLessonThumbnailBlob(lessonId: string): Promise<Blob | undefined>;
  getFigureThumbnailBlob(figureId: string): Promise<Blob | undefined>;

  // Data Management
  clearAllData(): Promise<void>;

  // Sync / Tombstone Management
  addTombstones(driveIds: string[]): Promise<void>;
  getTombstones(): Promise<string[]>;
  removeTombstones(driveIds: string[]): Promise<void>;

  // Subscription for live updates
  subscribe(callback: () => void): () => void;
  notifyListeners(): void;
}

// --- Implementation ---

const logger = createLogger('LocalDBService');

// --- Helper Functions ---
const generateId = (): string => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;


// --- IndexedDB Configuration ---
const DB_NAME = 'bachata-moves-db';
const DB_VERSION = 13; // Incremented for tombstone store
export const LESSONS_STORE = 'lessons';
export const FIGURES_STORE = 'figures';
export const FIGURE_CATEGORIES_STORE = 'figure_categories';
export const LESSON_CATEGORIES_STORE = 'lesson_categories';
export const SCHOOLS_STORE = 'schools';
export const INSTRUCTORS_STORE = 'instructors';
export const SETTINGS_STORE = 'settings';
export const VIDEO_FILES_STORE = 'video_files';
export const LESSON_THUMBNAILS_STORE = 'lesson_thumbnails';
export const FIGURE_THUMBNAILS_STORE = 'figure_thumbnails';
export const SYNC_TOMBSTONES_STORE = 'sync_tombstones';


export const DEVICE_SETTINGS_KEY = 'device-settings';
export const SYNC_SETTINGS_KEY = 'sync-settings';

const LEGACY_VIDEOS_STORE = 'videos';
const DELETED_DRIVE_IDS_STORE = 'deleted_drive_ids'; // Legacy, will be removed

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
      if (!db.objectStoreNames.contains(SYNC_TOMBSTONES_STORE)) {
        db.createObjectStore(SYNC_TOMBSTONES_STORE);
      }

      // Cleanup Legacy Stores
      if (db.objectStoreNames.contains(LEGACY_VIDEOS_STORE)) {
        db.deleteObjectStore(LEGACY_VIDEOS_STORE);
      }
      if (db.objectStoreNames.contains(DELETED_DRIVE_IDS_STORE)) {
        db.deleteObjectStore(DELETED_DRIVE_IDS_STORE);
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

class IndexDbLocalDatabaseService implements LocalDatabaseService {
  private listeners = new Set<() => void>();

  // --- Subscription ---
  public subscribe = (callback: () => void): () => void => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  public notifyListeners = (): void => {
    this.notify();
  }

  private notify = (): void => {
    logger.info("Notifying listeners of data change.");
    // Use a timeout to batch notifications and prevent rapid-fire updates
    setTimeout(() => {
      this.listeners.forEach(cb => cb());
    }, 100);
  }

  // --- Tombstone / Deleted IDs ---
  public addTombstones = async (driveIds: string[]): Promise<void> => {
    if (driveIds.length === 0) return;
    logger.info(`Adding ${driveIds.length} driveId(s) to tombstone log.`);
    const db = await openBachataDB();
    const tx = db.transaction(SYNC_TOMBSTONES_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_TOMBSTONES_STORE);
    await Promise.all(driveIds.map(id => store.put({ id, deletedAt: new Date().toISOString() }, id)));
    await tx.done;
  }

  public getTombstones = async (): Promise<string[]> => {
    const db = await openBachataDB();
    const keys = await db.getAllKeys(SYNC_TOMBSTONES_STORE);
    return keys as string[];
  }

  public removeTombstones = async (driveIds: string[]): Promise<void> => {
    if (driveIds.length === 0) return;
    const db = await openBachataDB();
    const tx = db.transaction(SYNC_TOMBSTONES_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_TOMBSTONES_STORE);
    await Promise.all(driveIds.map(id => store.delete(id)));
    await tx.done;
  }

  // --- Lessons ---
  public getLessons = async (): Promise<Lesson[]> => { 
    const db = await openBachataDB();
    return db.getAll(LESSONS_STORE);
  }

  public addLesson = async (lessonData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, videoFile: File, thumbnailBlob: Blob): Promise<Lesson> => {
    const db = await openBachataDB();
    const newId = generateId();
    const newVideoId = generateId();
    
    const newLesson: Lesson = {
      ...lessonData,
      id: newId,
      videoId: newVideoId,
      thumbTime: 0,
      modifiedTime: new Date().toISOString(),
    };

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
  
  public updateLesson = async (lessonId: string, lessonUpdateData: Partial<Omit<Lesson, 'id'>>, newThumbnailBlob?: Blob | null): Promise<Lesson> => {
    const db = await openBachataDB();
    const lesson = await db.get(LESSONS_STORE, lessonId);
    if (!lesson) throw new Error(`Lesson with id "${lessonId}" not found.`);

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

  public deleteLesson = async (lessonId: string): Promise<void> => {
    const db = await openBachataDB();
    const lesson = await db.get(LESSONS_STORE, lessonId);
    if (!lesson) {
        logger.warn(`Lesson ${lessonId} not found for deletion.`);
        return;
    }

    const tx = db.transaction([LESSONS_STORE, VIDEO_FILES_STORE, LESSON_THUMBNAILS_STORE], 'readwrite');
    
    const allLessons = await tx.objectStore(LESSONS_STORE).getAll();
    const otherLessonsUsingVideo = allLessons.filter(l => l.videoId === lesson.videoId && l.id !== lessonId);

    const deletePromises = [
      tx.objectStore(LESSONS_STORE).delete(lessonId),
      tx.objectStore(LESSON_THUMBNAILS_STORE).delete(lessonId),
    ];

    if (otherLessonsUsingVideo.length === 0) {
        logger.info(`No other lessons use videoId ${lesson.videoId}. Deleting video blob.`);
        deletePromises.push(tx.objectStore(VIDEO_FILES_STORE).delete(lesson.videoId));
    }
    
    await Promise.all(deletePromises);
    await tx.done;
    this.notify();
  }

  public saveDownloadedLesson = async (lesson: Lesson, videoFile: Blob, thumbnailBlob: Blob): Promise<void> => {
    const db = await openBachataDB();
    const tx = db.transaction([LESSONS_STORE, VIDEO_FILES_STORE, LESSON_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
        tx.objectStore(LESSONS_STORE).put(lesson),
        tx.objectStore(LESSON_THUMBNAILS_STORE).put(thumbnailBlob, lesson.id),
        tx.objectStore(VIDEO_FILES_STORE).put(videoFile, lesson.videoId)
    ]);
    await tx.done;
    this.notify();
  }

  // --- Figures ---
  public getFigures = async (): Promise<Figure[]> => { 
    const db = await openBachataDB();
    return db.getAll(FIGURES_STORE);
  }

  public addFigure = async (lessonId: string, figureData: Omit<Figure, 'id' | 'lessonId'>, thumbnailBlob: Blob): Promise<Figure> => {
    const db = await openBachataDB();
    const newFigure: Figure = { ...figureData, id: generateId(), lessonId, modifiedTime: new Date().toISOString() };
    
    const tx = db.transaction([FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(FIGURES_STORE).put(newFigure),
      tx.objectStore(FIGURE_THUMBNAILS_STORE).put(thumbnailBlob, newFigure.id)
    ]);
    await tx.done;
    
    this.notify();
    return newFigure;
  }

  public updateFigure = async (figureId: string, figureUpdateData: Partial<Omit<Figure, 'id' | 'lessonId'>>, newThumbnailBlob?: Blob | null): Promise<Figure> => {
    const db = await openBachataDB();
    const figure = await db.get(FIGURES_STORE, figureId);
    if (!figure) throw new Error(`Figure with id "${figureId}" not found.`);

    const tx = db.transaction([FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');
    const updatedFigure = { 
        ...figure, 
        ...figureUpdateData, 
        modifiedTime: figureUpdateData.modifiedTime || new Date().toISOString() 
    };
    
    const writePromises = [ tx.objectStore(FIGURES_STORE).put(updatedFigure) ];
    if (newThumbnailBlob) {
      writePromises.push(tx.objectStore(FIGURE_THUMBNAILS_STORE).put(newThumbnailBlob, figureId));
    }
    
    await Promise.all(writePromises);
    await tx.done;
    
    this.notify();
    return updatedFigure;
  }

  public deleteFigure = async (figureId: string): Promise<void> => {
    const db = await openBachataDB();
    const tx = db.transaction([FIGURES_STORE, FIGURE_THUMBNAILS_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(FIGURES_STORE).delete(figureId),
      tx.objectStore(FIGURE_THUMBNAILS_STORE).delete(figureId)
    ]);
    await tx.done;
    this.notify();
  }

  public saveDownloadedFigure = async (figure: Figure, thumbnailBlob: Blob): Promise<void> => {
    const db = await openBachataDB();
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
    await db.delete(FIGURE_CATEGORIES_STORE, categoryId);
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
    await db.delete(LESSON_CATEGORIES_STORE, categoryId);
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
    await db.delete(SCHOOLS_STORE, id);
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
    await db.delete(INSTRUCTORS_STORE, id);
    this.notify();
  }

  // --- Settings ---
  public getRawSettings = async (): Promise<{ device: Partial<AppSettings> | undefined; sync: Partial<AppSettings> | undefined; }> => {
    const db = await openBachataDB();
    const [device, sync] = await Promise.all([
        db.get(SETTINGS_STORE, DEVICE_SETTINGS_KEY),
        db.get(SETTINGS_STORE, SYNC_SETTINGS_KEY)
    ]);
    return { device, sync };
  }

  public saveAllSettings = async (settingsData: AppSettings, modifiedTime?: string): Promise<void> => {
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
    
    // Use provided modifiedTime for sync, otherwise generate a new one.
    syncSettings.modifiedTime = modifiedTime || new Date().toISOString();
    
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    await Promise.all([
        tx.objectStore(SETTINGS_STORE).put(deviceSettings, DEVICE_SETTINGS_KEY),
        tx.objectStore(SETTINGS_STORE).put(syncSettings, SYNC_SETTINGS_KEY)
    ]);
    await tx.done;
  }
  
  // --- Blob Handling ---
  public async getLessonThumbnailBlob(lessonId: string): Promise<Blob | undefined> {
    const db = await openBachataDB();
    return await db.get(LESSON_THUMBNAILS_STORE, lessonId);
  }
  
  public async getFigureThumbnailBlob(figureId: string): Promise<Blob | undefined> {
    const db = await openBachataDB();
    return await db.get(FIGURE_THUMBNAILS_STORE, figureId);
  }

  public async getVideoBlob(videoId: string): Promise<Blob | undefined> {
    const db = await openBachataDB();
    return await db.get(VIDEO_FILES_STORE, videoId);
  }

  public clearAllData = async (): Promise<void> => {
    await deleteDB(DB_NAME);
    this.notify();
  }
}

// --- Singleton Instance ---
export const localDatabaseService: LocalDatabaseService = new IndexDbLocalDatabaseService();

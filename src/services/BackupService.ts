
import type { Lesson, Figure, FigureCategory, LessonCategory, School, Instructor } from '../types';
import {
    openBachataDB,
    localDatabaseService,
    LESSONS_STORE,
    FIGURES_STORE,
    FIGURE_CATEGORIES_STORE,
    LESSON_CATEGORIES_STORE,
    SCHOOLS_STORE,
    INSTRUCTORS_STORE,
    SETTINGS_STORE,
    VIDEO_FILES_STORE,
    LESSON_THUMBNAILS_STORE,
    FIGURE_THUMBNAILS_STORE,
    SYNC_SETTINGS_KEY
} from './LocalDatabaseService';
import { dataService } from './DataService';
import { createLogger } from '../utils/logger';

const logger = createLogger('BackupService');

// --- Helper Functions ---
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


// --- Interface ---
export interface BackupService {
    exportAllData(onProgress?: (progress: number) => void): Promise<Blob>;
    importData(dataBlob: Blob, onProgress?: (progress: number) => void): Promise<void>;
}


// --- Implementation ---
class BackupServiceImpl implements BackupService {
    public async exportAllData(onProgress?: (progress: number) => void): Promise<Blob> {
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
        
        // 1. Fetch all data from IndexedDB.
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
        
        await tx.done;
        onProgress?.(0.20);
    
        // 2. Convert blobs to base64.
        const totalBlobs = videoFileEntries.length + thumbnailEntries.length + figureThumbnailEntries.length;
        let blobsConverted = 0;
        const convertEntriesToBase64 = (entries: [IDBValidKey, Blob][]): Promise<[IDBValidKey, string][]> => {
          if (!entries) return Promise.resolve([]);
          const promises = entries.map(async ([key, blob]) => {
            const base64Value = await blobToBase64(blob);
            blobsConverted++;
            if (totalBlobs > 0) {
                onProgress?.(0.20 + (blobsConverted / totalBlobs) * 0.70);
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
            'version': 3,
            'exportDate': new Date().toISOString(),
            'data': {
                lessons: lessons || [],
                figures: figures || [],
                figureCategories: figureCategories || [],
                lessonCategories: lessonCategories || [],
                schools: schools || [],
                instructors: instructors || [],
                settings: syncSettings || {},
                videos: videoFiles || [],
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

    public async importData(dataBlob: Blob, onProgress?: (progress: number) => void): Promise<void> {
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
            categories = [],
            figureCategories = categories,
            lessonCategories = [],
            schools = [],
            instructors = [],
            settings: importedSyncSettings = {},
            videos: originalVideoEntries = [],
            thumbnails: thumbnailEntries = [],
            figureThumbnails: figureThumbnailEntries = [],
        } = importObject.data;
        
        const lessonIdSet = new Set(lessons.map((l: Lesson) => l.id));
        const isOldVideoFormat = originalVideoEntries.length > 0 && originalVideoEntries.every(([key]: [string, string]) => lessonIdSet.has(key));
        
        let videoEntries = originalVideoEntries;
    
        if (isOldVideoFormat) {
          logger.info("Old video format detected, remapping video keys from lesson.id to lesson.videoId.");
          const lessonMap = new Map<string, Lesson>(lessons.map((l: Lesson) => [l.id, l]));
          videoEntries = originalVideoEntries.map(([lessonId, base64]: [string, string]) => {
            const lesson = lessonMap.get(lessonId);
            return lesson ? [lesson.videoId, base64] : null;
          }).filter((entry: [string, string] | null): entry is [string, string] => entry !== null);
        }
    
        const totalBlobsToConvert = videoEntries.length + thumbnailEntries.length + figureThumbnailEntries.length;
        let blobsConverted = 0;
    
        const reportBlobProgress = () => {
            blobsConverted++;
            if (totalBlobsToConvert > 0) {
                onProgress?.(0.05 + (blobsConverted / totalBlobsToConvert) * 0.45);
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
                    logger.warn(`Skipping invalid ${type} data for key: ${key}. Error: ${e.message}`);
                    reportBlobProgress();
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
    
        dataService.clearUrlCaches();
    
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
                    const { isExpanded, ...rest } = item;
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
            localDatabaseService.notifyListeners();
        } catch (err) {
            console.error('Import transaction failed:', err);
            onProgress?.(0);
            throw err;
        }
    }
}

// --- Singleton Instance ---
export const backupService: BackupService = new BackupServiceImpl();

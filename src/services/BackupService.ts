import type { Lesson, Figure, FigureCategory, LessonCategory, School, Instructor } from '../types';
import {
    openBachataDB,
    localDatabaseService,
    LESSONS_STORE,
    FIGURES_STORE,
    FIGURE_CATEGORIES_STORE,
    LESSON_CATEGORIES_STORE,
    LESSON_SCHOOLS_STORE,
    FIGURE_SCHOOLS_STORE,
    LESSON_INSTRUCTORS_STORE,
    FIGURE_INSTRUCTORS_STORE,
    SETTINGS_STORE,
    VIDEO_FILES_STORE,
    LESSON_THUMBNAILS_STORE,
    FIGURE_THUMBNAILS_STORE,
    SYNC_SETTINGS_KEY
} from './LocalDatabaseService';
import { dataService } from './DataService';
import { createLogger } from '../utils/logger';
import oboe from 'oboe';
import type { IDBPDatabase } from 'idb';


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
    exportAllData(onProgress?: (progress: number) => void, onStatusUpdate?: (key: string, params?: { item: string }) => void): Promise<Blob | null>;
    importData(dataBlob: Blob, onStatusUpdate?: (key: string, params?: { item: string }) => void): Promise<void>;
}


// --- Implementation ---
class BackupServiceImpl implements BackupService {
    public async exportAllData(
        onProgress?: (progress: number) => void,
        onStatusUpdate?: (key: string, params?: { item: string }) => void
    ): Promise<Blob | null> {
        logger.info('--- Starting Data Export ---');
        onProgress?.(0);
        onStatusUpdate?.('settings.exportStatusPreparing');

        const db = await openBachataDB();
        
        const getAllEntries = async <T>(storeName: string): Promise<[IDBValidKey, T][]> => {
            const entries: [IDBValidKey, T][] = [];
            let cursor = await db.transaction(storeName).store.openCursor();
            while (cursor) {
                entries.push([cursor.key, cursor.value]);
                cursor = await cursor.continue();
            }
            return entries;
        };
        
        // Fetch all non-blob data first
        logger.info('Fetching metadata from IndexedDB...');
        onStatusUpdate?.('settings.exportStatusFetching');
        const [
          lessons, figures, figureCategories, lessonCategories, 
          lessonSchools, lessonInstructors, figureSchools, figureInstructors,
          syncSettings
        ] = await Promise.all([
          db.getAll(LESSONS_STORE), db.getAll(FIGURES_STORE),
          db.getAll(FIGURE_CATEGORIES_STORE), db.getAll(LESSON_CATEGORIES_STORE),
          db.getAll(LESSON_SCHOOLS_STORE), db.getAll(LESSON_INSTRUCTORS_STORE),
          db.getAll(FIGURE_SCHOOLS_STORE), db.getAll(FIGURE_INSTRUCTORS_STORE),
          db.get(SETTINGS_STORE, SYNC_SETTINGS_KEY)
        ]);
        logger.info(`Metadata fetched: ${lessons.length} lessons, ${figures.length} figures, etc.`);
        onProgress?.(0.10);

        // Streaming implementation
        if (window.showSaveFilePicker) {
            logger.info('Using File System Access API for streaming export.');
            onStatusUpdate?.('settings.exportStatusWriting', { item: 'Metadata' });
            const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
            const fileHandle = await window.showSaveFilePicker({
              suggestedName: `bachata-moves-export-${timestamp}.json`,
              types: [{ description: 'Bachata Moves Backup', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await fileHandle.createWritable();
            const encoder = new TextEncoder();

            await writable.write(encoder.encode('{"__BACHATA_MOVES_EXPORT__":true,"version":4,"exportDate":"' + new Date().toISOString() + '","data":{'));

            const metadata = { lessons, figures, figureCategories, lessonCategories, lessonSchools, lessonInstructors, figureSchools, figureInstructors, settings: syncSettings };
            const metadataKeys = Object.keys(metadata) as (keyof typeof metadata)[];

            for (let i = 0; i < metadataKeys.length; i++) {
                const key = metadataKeys[i];
                if (i > 0) {
                    await writable.write(encoder.encode(','));
                }
                await writable.write(encoder.encode(`"${key}":${JSON.stringify(metadata[key] || (Array.isArray(metadata[key]) ? [] : {}))}`));
            }
            onProgress?.(0.15);

            const streamBlobStore = async (storeName: string, storeId: string, progressStart: number, progressEnd: number) => {
                logger.info(`Streaming blob store: ${storeName}`);
                onStatusUpdate?.('settings.exportStatusWriting', { item: storeName });
                await writable.write(encoder.encode(`, "${storeName}":[`));
                const entries = await getAllEntries<Blob>(storeId);
                const total = entries.length;
                logger.info(`Streaming ${total} blobs from ${storeName}...`);
                for (let i = 0; i < total; i++) {
                    const [key, blob] = entries[i];
                    const base64Value = await blobToBase64(blob);
                    const entryJson = JSON.stringify([key, base64Value]);
                    await writable.write(encoder.encode(entryJson));
                    if (i < total - 1) await writable.write(encoder.encode(','));
                    onProgress?.(progressStart + ((i + 1) / total) * (progressEnd - progressStart));
                }
                await writable.write(encoder.encode(']'));
                logger.info(`Finished streaming ${storeName}.`);
            };

            await streamBlobStore('videos', VIDEO_FILES_STORE, 0.15, 0.65);
            await streamBlobStore('lesson_thumbnails', LESSON_THUMBNAILS_STORE, 0.65, 0.80);
            await streamBlobStore('figure_thumbnails', FIGURE_THUMBNAILS_STORE, 0.80, 0.99);

            logger.info('Finalizing export file...');
            onStatusUpdate?.('settings.exportStatusFinalizing');
            await writable.write(encoder.encode('}}'));
            await writable.close();
            onProgress?.(1);
            logger.info('--- Streaming Export Complete ---');
            return null; // Indicate download was handled by the stream
        }

        // Fallback in-memory implementation
        logger.info('File System Access API not supported. Falling back to in-memory export.');
        const [videoFileEntries, thumbnailEntries, figureThumbnailEntries] = await Promise.all([
            getAllEntries<Blob>(VIDEO_FILES_STORE),
            getAllEntries<Blob>(LESSON_THUMBNAILS_STORE),
            getAllEntries<Blob>(FIGURE_THUMBNAILS_STORE),
        ]);
        onProgress?.(0.20);
    
        const totalBlobs = videoFileEntries.length + thumbnailEntries.length + figureThumbnailEntries.length;
        logger.info(`Converting ${totalBlobs} blobs to base64 for in-memory export.`);
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
    
        const [videoFiles, thumbnails, figureThumbnails] = await Promise.all([
          convertEntriesToBase64(videoFileEntries),
          convertEntriesToBase64(thumbnailEntries),
          convertEntriesToBase64(figureThumbnailEntries)
        ]);
        onProgress?.(0.90);
        
        const exportObject = {
            '__BACHATA_MOVES_EXPORT__': true, 'version': 4, 'exportDate': new Date().toISOString(),
            'data': { lessons, figures, figureCategories, lessonCategories, lessonSchools, lessonInstructors, figureSchools, figureInstructors, settings: syncSettings, videos: videoFiles, lesson_thumbnails: thumbnails, figure_thumbnails: figureThumbnails },
        };
    
        onProgress?.(0.95);
        onStatusUpdate?.('settings.exportStatusFinalizing');
        const jsonString = JSON.stringify(exportObject);
        const blob = new Blob([jsonString], { type: 'application/json' });
        onProgress?.(1);
        logger.info('--- In-Memory Export Complete ---');
        return blob;
    }

    public importData(
        dataBlob: Blob,
        onStatusUpdate?: (key: string, params?: { item: string }) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            logger.info('--- Starting Data Import ---');
            onStatusUpdate?.('settings.importStatusValidating');
            
            const writePromises: Promise<any>[] = [];
            let db: IDBPDatabase;
            let cleared = false;
            let fileVersion = 3;
            const counters = { lessons: 0, figures: 0, videos: 0, lesson_thumbnails: 0, figure_thumbnails: 0, schools: 0, instructors: 0 };
        
            const getDb = async () => {
              if (!db) db = await openBachataDB();
              return db;
            };
        
            const processBlobEntry = (storeName: string, entry: [string, string]) => {
              const promise = (async () => {
                const dbHandle = await getDb();
                try {
                  const [key, base64] = entry;
                  const blob = await dataUrlToBlob(base64);
                  await dbHandle.put(storeName, blob, key);
                } catch (e) {
                  logger.warn(`Skipping invalid blob entry in ${storeName}`, e);
                }
              })();
              writePromises.push(promise);
            };
            
            logger.info('Initializing oboe instance...');
            const oboeInstance = oboe();

            oboeInstance
              .on('start', () => {
                logger.info('Oboe stream parsing started.');
              })
              .node('!.__BACHATA_MOVES_EXPORT__', (value) => {
                if (value !== true) {
                  oboeInstance.abort();
                  reject(new Error('Invalid import file format.'));
                  return oboe.drop;
                }
                logger.info('Backup file format validated.');
              })
              .node('!.version', (value) => {
                fileVersion = value;
                if (value > 4) {
                  oboeInstance.abort();
                  reject(new Error(`Unsupported import file version: ${value}.`));
                  return oboe.drop;
                }
                 logger.info(`Backup file version validated: ${value}`);
              })
              .on('path', 'data', () => {
                logger.info('Reached "data" object in import file.');
                const promise = (async () => {
                  if (!cleared) {
                    onStatusUpdate?.('settings.importStatusClearing');
                    logger.info('Clearing all local data before import.');
                    try {
                      dataService.clearUrlCaches();
                      await localDatabaseService.clearAllData();
                      db = await openBachataDB();
                      cleared = true;
                      logger.info('Local data cleared.');
                    } catch (e) {
                        oboeInstance.abort();
                        reject(new Error('Failed to clear existing data before import.'));
                    }
                  }
                })();
                writePromises.push(promise);
              })
              .on('path', 'data.lessons', () => { logger.info('Found "lessons" array.'); onStatusUpdate?.('settings.importStatusImporting', { item: 'Lessons' }); })
              .node('data.lessons.*', (item) => { counters.lessons++; writePromises.push(getDb().then(d => d.put(LESSONS_STORE, item))); return oboe.drop; })
              
              .on('path', 'data.figures', () => { logger.info('Found "figures" array.'); onStatusUpdate?.('settings.importStatusImporting', { item: 'Figures' }); })
              .node('data.figures.*', (item) => { counters.figures++; writePromises.push(getDb().then(d => d.put(FIGURES_STORE, item))); return oboe.drop; })

              .on('path', 'data.figureCategories', () => onStatusUpdate?.('settings.importStatusImporting', { item: 'Figure Categories' }))
              .node('data.figureCategories.*', (item) => { writePromises.push(getDb().then(d => d.put(FIGURE_CATEGORIES_STORE, item))); return oboe.drop; })
              
              .on('path', 'data.lessonCategories', () => onStatusUpdate?.('settings.importStatusImporting', { item: 'Lesson Categories' }))
              .node('data.lessonCategories.*', (item) => { writePromises.push(getDb().then(d => d.put(LESSON_CATEGORIES_STORE, item))); return oboe.drop; })

              // Legacy School/Instructor import
              .node('data.schools.*', (item) => { if (fileVersion < 4) { counters.schools++; writePromises.push(getDb().then(d => Promise.all([d.put(LESSON_SCHOOLS_STORE, item), d.put(FIGURE_SCHOOLS_STORE, item)]))); } return oboe.drop; })
              .node('data.instructors.*', (item) => { if (fileVersion < 4) { counters.instructors++; writePromises.push(getDb().then(d => Promise.all([d.put(LESSON_INSTRUCTORS_STORE, item), d.put(FIGURE_INSTRUCTORS_STORE, item)]))); } return oboe.drop; })

              // New School/Instructor import
              .on('path', 'data.lessonSchools', () => onStatusUpdate?.('settings.importStatusImporting', { item: 'Lesson Schools' }))
              .node('data.lessonSchools.*', (item) => { writePromises.push(getDb().then(d => d.put(LESSON_SCHOOLS_STORE, item))); return oboe.drop; })
              .on('path', 'data.figureSchools', () => onStatusUpdate?.('settings.importStatusImporting', { item: 'Figure Schools' }))
              .node('data.figureSchools.*', (item) => { writePromises.push(getDb().then(d => d.put(FIGURE_SCHOOLS_STORE, item))); return oboe.drop; })
              .on('path', 'data.lessonInstructors', () => onStatusUpdate?.('settings.importStatusImporting', { item: 'Lesson Instructors' }))
              .node('data.lessonInstructors.*', (item) => { writePromises.push(getDb().then(d => d.put(LESSON_INSTRUCTORS_STORE, item))); return oboe.drop; })
              .on('path', 'data.figureInstructors', () => onStatusUpdate?.('settings.importStatusImporting', { item: 'Figure Instructors' }))
              .node('data.figureInstructors.*', (item) => { writePromises.push(getDb().then(d => d.put(FIGURE_INSTRUCTORS_STORE, item))); return oboe.drop; })
              
              .on('path', 'data.settings', (item) => { onStatusUpdate?.('settings.importStatusImporting', { item: 'Settings' }); writePromises.push(getDb().then(d => d.put(SETTINGS_STORE, item, SYNC_SETTINGS_KEY))); return oboe.drop; })
              
              .on('path', 'data.videos', () => { logger.info('Found "videos" array.'); onStatusUpdate?.('settings.importStatusImporting', { item: 'Videos' }); })
              .node('data.videos.*', (entry) => { counters.videos++; processBlobEntry(VIDEO_FILES_STORE, entry); return oboe.drop; })
              
              .on('path', 'data.thumbnails', () => { onStatusUpdate?.('settings.importStatusImporting', { item: 'Lesson Thumbnails' }); }) // Legacy support
              .node('data.thumbnails.*', (entry) => { counters.lesson_thumbnails++; processBlobEntry(LESSON_THUMBNAILS_STORE, entry); return oboe.drop; })
              
              .on('path', 'data.lesson_thumbnails', () => { onStatusUpdate?.('settings.importStatusImporting', { item: 'Lesson Thumbnails' }); })
              .node('data.lesson_thumbnails.*', (entry) => { counters.lesson_thumbnails++; processBlobEntry(LESSON_THUMBNAILS_STORE, entry); return oboe.drop; })
              
              .on('path', 'data.figure_thumbnails', () => { onStatusUpdate?.('settings.importStatusImporting', { item: 'Figure Thumbnails' }); })
              .node('data.figure_thumbnails.*', (entry) => { counters.figure_thumbnails++; processBlobEntry(FIGURE_THUMBNAILS_STORE, entry); return oboe.drop; })
              
              .on('done', () => {
                onStatusUpdate?.('settings.importStatusFinalizing');
                logger.info('Import stream finished parsing.');
                logger.info(`Totals found: ${JSON.stringify(counters)}`);
                logger.info(`Awaiting ${writePromises.length} database write operations...`);
                Promise.all(writePromises)
                  .then(() => {
                    logger.info('All database writes complete.');
                    logger.info('--- Data Import Complete ---');
                    onStatusUpdate?.('settings.importStatusComplete');
                    localDatabaseService.notifyListeners();
                    resolve();
                  })
                  .catch((err) => {
                    logger.error('Error during database write operations.', err);
                    reject(err);
                  });
              })
              // FIX: The type definitions for oboe are incomplete. Use the documented .fail() method instead of .on('fail', ...).
              .fail((err) => {
                logger.error('Oboe stream failed during parsing.', err);
                reject(new Error('Failed to parse the import file. It may be corrupted.'));
              });

            // Manually read the stream and feed it to oboe
            const startManualStream = async () => {
              logger.info('Starting manual stream reading...');
              const reader = dataBlob.stream().getReader();
              const decoder = new TextDecoder();

              const readChunk = async (): Promise<void> => {
                  try {
                      const { done, value } = await reader.read();
                      if (done) {
                          logger.info('Stream reading complete. Finalizing oboe.');
                          oboeInstance.emit('end');
                          return;
                      }
                      
                      const chunkString = decoder.decode(value, { stream: true });
                      oboeInstance.emit('data', chunkString);
                      
                      // Continue reading
                      return readChunk();
                  } catch (err) {
                      logger.error('Error while reading stream chunk.', err);
                      // FIX: The correct way to manually fail an oboe stream is to call .abort().
                      oboeInstance.abort();
                  }
              };

              await readChunk();
            };

            startManualStream();
        });
    }
}

// --- Singleton Instance ---
export const backupService: BackupService = new BackupServiceImpl();





import type { SyncTask, SyncTaskType, Lesson, Figure, GroupingConfig, AppSettings, FigureCategory, LessonCategory, School, Instructor } from '../types';
import type { LocalDatabaseService } from './LocalDatabaseService';
import type { GoogleDriveService } from './GoogleDriveService';
import type { ExternalStorageService, RemoteItem } from './ExternalStorageService';
import { localDatabaseService } from './LocalDatabaseService';
import { dataService } from './DataService';
import { externalStorageService } from './ExternalStorageService';
import { googleDriveService } from './GoogleDriveService';
import { settingsService } from './SettingsService';
import { createLogger } from '../utils/logger';

const logger = createLogger('SyncQueue');
const generateId = (): string => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;


// --- Types and Interface ---
export interface SyncQueueService {
    getQueue(): SyncTask[];
    getIsActive(): boolean;
    subscribe(listener: () => void): () => void;
    startProcessing(): void;
    stopProcessing(): void;
    addTask(type: SyncTaskType, payload?: any, isPriority?: boolean): void;
    forceAddItem(itemData: any, type: 'lesson' | 'figure', options?: any): Promise<any>;
    forceUpdateItem(itemId: string, itemData: any, type: 'lesson' | 'figure'): Promise<any>;
    forceDeleteItem(item: any): Promise<void>;
    forceDeleteGroupingItem(item: FigureCategory | LessonCategory | School | Instructor, itemType: 'category' | 'school' | 'instructor', galleryType: 'lesson' | 'figure'): Promise<void>;
    forceUploadGroupingConfig(type: 'lesson' | 'figure'): Promise<void>;
}


// --- Implementation ---
class SyncQueueServiceImpl implements SyncQueueService {
    private queue: SyncTask[] = [];
    private listeners: Set<() => void> = new Set();
    private isProcessing = false;
    private localDB: LocalDatabaseService;
    private externalStorageService: ExternalStorageService;
    private driveService: GoogleDriveService;

    constructor(localDB: LocalDatabaseService, externalStorageService: ExternalStorageService, driveService: GoogleDriveService) {
        this.localDB = localDB;
        this.externalStorageService = externalStorageService;
        this.driveService = driveService;
    }

    // --- Public Interface ---

    public getQueue = (): SyncTask[] => {
        return this.queue;
    }

    public getIsActive = (): boolean => {
        return this.queue.some(task => task.status === 'in-progress' || task.status === 'pending');
    }

    public subscribe = (listener: () => void): () => void => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public startProcessing = (): void => {
        this.processNext();
    }

    public stopProcessing = (): void => {
        this.isProcessing = false;
        // Reset in-progress tasks to pending so they can be resumed on next sign-in
        this.queue = this.queue.map(task => 
            task.status === 'in-progress' ? { ...task, status: 'pending' } : task
        );
        this.notify();
    }

    public addTask = (type: SyncTaskType, payload?: any, isPriority = false): void => {
        const uniquePayloadIdentifier = type === 'sync-gallery' || type === 'sync-grouping-config' 
            ? payload?.type 
            : (payload?.id || payload?.remoteItem?.externalId || payload?.externalId);
        if (this.isDuplicate(type, uniquePayloadIdentifier)) {
            logger.info(`Skipping duplicate task: ${type}`, payload);
            return;
        }

        const newTask: SyncTask = {
            id: generateId(),
            type,
            payload,
            status: 'pending',
            createdAt: Date.now(),
        };

        if (isPriority) {
            this.queue.unshift(newTask);
            logger.info('Added PRIORITY task:', newTask);
        } else {
            this.queue.push(newTask);
            logger.info('Added task:', newTask);
        }

        this.queue.sort((a, b) => a.createdAt - b.createdAt);
        this.notify();
        this.processNext();
    }
    
    // --- UI-Blocking ("Force") Operations ---

    public forceAddItem = async (
        itemData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'> | Omit<Figure, 'id'| 'lessonId'>, 
        type: 'lesson' | 'figure', 
        options?: { videoFile?: File, lessonId?: string }
    ): Promise<Lesson | Figure> => {
        if (!this.driveService.getAuthState().isSignedIn) throw new Error("Cannot add item while not signed in.");
        logger.info(`--- UI-BLOCK: Forcing ADD for ${type} ---`);
        let newItem: Lesson | Figure;

        if (type === 'lesson') {
            if (!options?.videoFile) throw new Error("Video file is required to add a lesson.");
            newItem = await dataService.addLesson(itemData as Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, options.videoFile);
            logger.info(' > Lesson added locally:', newItem.id);
            newItem = await this.uploadLesson(newItem.id);
        } else { // type === 'figure'
            if (!options?.lessonId) throw new Error("Lesson ID is required to add a figure.");
            newItem = await dataService.addFigure(options.lessonId, itemData as Omit<Figure, 'id' | 'lessonId'>);
            logger.info(' > Figure added locally:', newItem.id);
            newItem = await this.uploadFigure(newItem.id);
        }
        logger.info('✅ Force add complete.');
        return newItem;
    };

    public forceUpdateItem = async (
        itemId: string, 
        itemData: Partial<Omit<Lesson, 'id'>> | Partial<Omit<Figure, 'id'>>, 
        type: 'lesson' | 'figure'
    ): Promise<Lesson | Figure> => {
        if (!this.driveService.getAuthState().isSignedIn) throw new Error("Cannot update item while not signed in.");
        logger.info(`--- UI-BLOCK: Forcing UPDATE for ${type} ${itemId} ---`);
        let updatedItem: Lesson | Figure;

        if (type === 'lesson') {
            updatedItem = await dataService.updateLesson(itemId, itemData as Partial<Omit<Lesson, 'id'>>);
            updatedItem = await this.uploadLesson(updatedItem.id);
        } else {
            updatedItem = await dataService.updateFigure(itemId, itemData as Partial<Omit<Figure, 'id'>>);
            updatedItem = await this.uploadFigure(updatedItem.id);
        }
        logger.info('✅ Force update complete.');
        return updatedItem;
    };

    public forceDeleteItem = async (item: Lesson | Figure): Promise<void> => {
        if (!this.driveService.getAuthState().isSignedIn) throw new Error("Cannot delete item while not signed in.");
        const itemType = 'uploadDate' in item ? 'lesson' : 'figure';
        logger.info(`--- UI-BLOCK: Forcing DELETE for ${itemType} ${item.id} ---`);

        const driveIdsToDelete = itemType === 'lesson'
            ? await dataService.deleteLesson(item.id)
            : [await dataService.deleteFigure(item.id)].filter((id): id is string => !!id);

        if (driveIdsToDelete.length > 0) {
            await this.localDB.addTombstones(driveIdsToDelete);
            this.addTask('sync-deleted-log', {}, true);
        }
        
        logger.info(`✅ Force delete for ${itemType} ${item.id} processed locally. Sync queued.`);
    };

    public forceDeleteGroupingItem = async (item: FigureCategory | LessonCategory | School | Instructor, itemType: 'category' | 'school' | 'instructor', galleryType: 'lesson' | 'figure'): Promise<void> => {
        if (!this.driveService.getAuthState().isSignedIn) throw new Error("Cannot delete grouping item while not signed in.");
        logger.info(`--- UI-BLOCK: Forcing DELETE for grouping item ${item.id} ---`);

        let driveId: string | null = null;
        if (itemType === 'category') {
            driveId = galleryType === 'lesson'
                ? await dataService.deleteLessonCategory(item.id)
                : await dataService.deleteFigureCategory(item.id);
        } else if (itemType === 'school') {
            driveId = await dataService.deleteSchool(item.id);
        } else if (itemType === 'instructor') {
            driveId = await dataService.deleteInstructor(item.id);
        }

        if (driveId) {
            await this.localDB.addTombstones([driveId]);
            this.addTask('sync-deleted-log', {}, true);
        }
    }
    
    public forceUploadGroupingConfig = async (type: 'lesson' | 'figure'): Promise<void> => {
        if (!this.driveService.getAuthState().isSignedIn) throw new Error("Cannot upload config while not signed in.");
        logger.info(`--- UI-BLOCK: Forcing UPLOAD of grouping config for ${type} ---`);
        await this.syncGroupingConfig(type);
    };

    // --- Task Implementations ---
    private syncGallery = async (type: 'lesson' | 'figure'): Promise<void> => {
        logger.info(`--- Syncing Gallery: ${type.toUpperCase()} ---`);

        const [remoteItems, localItems, tombstones] = await Promise.all([
            this.externalStorageService.listRemoteItems(type),
            type === 'lesson' ? this.localDB.getLessons() : this.localDB.getFigures(),
            this.localDB.getTombstones()
        ]);

        const remoteItemMap = new Map<string, RemoteItem>();
        for (const remoteItem of remoteItems) {
            if (remoteItem.name.endsWith('.json')) {
                const localId = remoteItem.name.replace('.json', '');
                remoteItemMap.set(localId, remoteItem);
            }
        }
        
        // FIX: Explicitly type the result of the map function to a tuple `[string, Lesson | Figure]`
        // to ensure TypeScript correctly infers the type for the Map constructor.
        const localItemMap = new Map<string, Lesson | Figure>(localItems.map((item: Lesson | Figure): [string, Lesson | Figure] => [item.id, item]));

        // Check remote items against local
        for (const remoteItem of remoteItems) {
            if (!remoteItem.name.endsWith('.json')) continue;
            
            if (tombstones.includes(remoteItem.externalId)) {
                this.addTask('delete-remote', { externalId: remoteItem.externalId });
                continue;
            }

            const localId = remoteItem.name.replace('.json', '');
            const localItem = localItemMap.get(localId);
            if (!localItem || new Date(remoteItem.modifiedTime) > new Date(localItem.modifiedTime || 0)) {
                this.addTask(type === 'lesson' ? 'download-lesson' : 'download-figure', { remoteItem });
            }
        }

        // Check local items against remote
        for (const localItem of localItems) {
            const remoteItem = remoteItemMap.get(localItem.id);
            if (!remoteItem || (localItem.modifiedTime && new Date(localItem.modifiedTime) > new Date(remoteItem.modifiedTime))) {
                this.addTask(type === 'lesson' ? 'upload-lesson' : 'upload-figure', { id: localItem.id });
            }
        }
        logger.info(`--- Gallery Sync Queued: ${type.toUpperCase()} ---`);
    }

    private syncGroupingConfig = async (type: 'lesson' | 'figure'): Promise<void> => {
        logger.info(`--- Syncing Grouping Config: ${type.toUpperCase()} ---`);
        
        const [remoteConfig, localConfig] = await Promise.all([
            this.externalStorageService.getRemoteGroupingConfig(type),
            this.getLocalGroupingConfig(type)
        ]);
        
        if (!remoteConfig) {
            logger.info('No remote grouping config found. Uploading local config.');
            await this.externalStorageService.uploadGroupingConfig(type, localConfig);
            return;
        }

        const remoteTime = new Date(remoteConfig.modifiedTime).getTime();
        const localTime = new Date(localConfig.modifiedTime).getTime();

        if (remoteTime > localTime) {
            logger.info('Remote grouping config is newer. Applying remote changes locally.');
            await this.applyRemoteGroupingConfig(remoteConfig, type);
        } else if (localTime > remoteTime) {
            logger.info('Local grouping config is newer. Uploading local changes.');
            await this.externalStorageService.uploadGroupingConfig(type, localConfig);
        } else {
            logger.info('Grouping configs are in sync.');
        }
    }

    private uploadLesson = async (lessonId: string): Promise<Lesson> => {
        const lesson = await this.localDB.getLessons().then(l => l.find(x => x.id === lessonId));
        if (!lesson) throw new Error(`Cannot upload lesson ${lessonId}: not found in local DB.`);
        const videoFile = await dataService.getVideoFile(lesson.id);
        if (!videoFile) throw new Error(`Cannot upload lesson ${lessonId}: video file not found.`);

        const { lessonMetadata, videoMetadata } = await this.externalStorageService.uploadLesson(lesson, videoFile);

        const updatedLessonData = { driveId: lessonMetadata.externalId, videoDriveId: videoMetadata.externalId, modifiedTime: lessonMetadata.modifiedTime };
        return dataService.updateLesson(lesson.id, updatedLessonData);
    }

    private uploadFigure = async (figureId: string): Promise<Figure> => {
        const figure = await this.localDB.getFigures().then(f => f.find(x => x.id === figureId));
        if (!figure) throw new Error(`Cannot upload figure ${figureId}: not found in local DB.`);
        
        const figureMetadata = await this.externalStorageService.uploadFigure(figure);
        
        const updatedFigureData = { driveId: figureMetadata.externalId, modifiedTime: figureMetadata.modifiedTime };
        return dataService.updateFigure(figure.id, updatedFigureData);
    }

    private downloadLesson = async (remoteItem: RemoteItem): Promise<void> => {
        const downloaded = await this.externalStorageService.downloadLesson(remoteItem);
        if (downloaded) {
            await dataService.saveDownloadedLesson(downloaded.lesson, downloaded.video);
        }
    }

    private downloadFigure = async (remoteItem: RemoteItem): Promise<void> => {
        const figureData = await this.externalStorageService.downloadFigure(remoteItem);
        if (figureData) {
            await dataService.saveDownloadedFigure(figureData);
        }
    }

    private deleteRemoteItem = async (externalId: string): Promise<void> => {
        await this.externalStorageService.deleteRemoteItemById(externalId);
        await this.localDB.removeTombstones([externalId]);
    }

    // --- Private Methods ---
    private notify = (): void => this.listeners.forEach(listener => listener());

    private isDuplicate = (type: SyncTaskType, payloadIdentifier: any): boolean => {
        if (!payloadIdentifier) return false;
        return this.queue.some(task => {
            if (task.type !== type) return false;
            const taskIdentifier = (type === 'sync-gallery' || type === 'sync-grouping-config') 
                ? task.payload?.type 
                : (task.payload?.id || task.payload?.remoteItem?.externalId || task.payload?.externalId);
            return taskIdentifier === payloadIdentifier;
        });
    }
    
    private updateTaskStatus = (taskId: string, status: SyncTask['status'], error?: string): void => {
        const taskIndex = this.queue.findIndex(t => t.id === taskId);
        if (taskIndex > -1) {
            this.queue[taskIndex].status = status;
            if (error) this.queue[taskIndex].error = error;
        }
        this.notify();
    }

    private removeTask = (taskId: string): void => {
        this.queue = this.queue.filter(t => t.id !== taskId);
        this.notify();
    }

    private processNext = async (): Promise<void> => {
        if (this.isProcessing || !this.driveService.getAuthState().isSignedIn) return;
        const task = this.queue.find(t => t.status === 'pending');
        if (!task) return;

        this.isProcessing = true;
        this.updateTaskStatus(task.id, 'in-progress');
        
        try {
            logger.info(`Processing task: ${task.type}`, task.payload);
            switch (task.type) {
                case 'sync-gallery': await this.syncGallery(task.payload.type); break;
                case 'sync-grouping-config': await this.syncGroupingConfig(task.payload.type); break;
                case 'upload-lesson': await this.uploadLesson(task.payload.id); break;
                case 'upload-figure': await this.uploadFigure(task.payload.id); break;
                case 'download-lesson': await this.downloadLesson(task.payload.remoteItem); break;
                case 'download-figure': await this.downloadFigure(task.payload.remoteItem); break;
                case 'delete-remote': await this.deleteRemoteItem(task.payload.externalId); break;
                default: logger.warn(`Unknown task type: ${task.type}`);
            }
            logger.info(`✅ Task completed: ${task.type}`);
            this.removeTask(task.id);
        } catch (e: any) {
            logger.error(`❌ Task failed: ${task.type}`, e);
            this.updateTaskStatus(task.id, 'error', e.message || 'An unknown error occurred.');
        } finally {
            this.isProcessing = false;
            this.processNext();
        }
    }

    private getLocalGroupingConfig = async (type: 'lesson' | 'figure'): Promise<GroupingConfig> => {
        // Fetch all data in parallel
        const [categories, schools, instructors, settings, rawSettings] = await Promise.all([
            type === 'lesson' ? this.localDB.getLessonCategories() : this.localDB.getFigureCategories(),
            this.localDB.getSchools(),
            this.localDB.getInstructors(),
            settingsService.getSettings(),
            this.localDB.getRawSettings() // Fetch raw settings to get the sync object's modifiedTime
        ]);

        // The timestamp for the config is stored on the sync-settings object itself
        const modifiedTime = (rawSettings.sync as any)?.modifiedTime || '1970-01-01T00:00:00.000Z';

        return {
            modifiedTime: modifiedTime,
            categories,
            schools,
            instructors,
            showEmpty: type === 'lesson' ? settings.showEmptyLessonCategoriesInGroupedView : settings.showEmptyFigureCategoriesInGroupedView,
            showCount: type === 'lesson' ? settings.showLessonCountInGroupHeaders : settings.showFigureCountInGroupHeaders,
            // Include the order arrays in the config
            categoryOrder: type === 'lesson' ? settings.lessonCategoryOrder : settings.figureCategoryOrder,
            schoolOrder: type === 'lesson' ? settings.lessonSchoolOrder : settings.figureSchoolOrder,
            instructorOrder: type === 'lesson' ? settings.lessonInstructorOrder : settings.figureInstructorOrder,
        };
    }

    private applyRemoteGroupingConfig = async (remoteConfig: GroupingConfig, type: 'lesson' | 'figure'): Promise<void> => {
        // Destructure all properties from the remote config, including new order arrays
        const { categories, schools, instructors, showEmpty, showCount, categoryOrder, schoolOrder, instructorOrder } = remoteConfig;

        type SyncableConfigItem = (LessonCategory | FigureCategory | School | Instructor);

        const syncItems = async (localItems: SyncableConfigItem[], remoteItems: SyncableConfigItem[], addFn: any, updateFn: any) => {
            const localDriveIdMap = new Map<string, SyncableConfigItem>(localItems.filter(i => i.driveId).map(i => [i.driveId!, i]));
            for (const remoteItem of remoteItems) {
                const existingByDriveId = localDriveIdMap.get(remoteItem.id); 
                if (existingByDriveId) {
                    if (new Date(remoteItem.modifiedTime!) > new Date(existingByDriveId.modifiedTime!)) {
                        await updateFn(existingByDriveId.id, { name: remoteItem.name, modifiedTime: remoteItem.modifiedTime, driveId: remoteItem.id });
                    }
                } else {
                    await addFn(remoteItem.name, remoteItem.id, remoteItem.modifiedTime);
                }
            }
        };

        if (type === 'lesson') await syncItems(await this.localDB.getLessonCategories(), categories as LessonCategory[], this.localDB.addLessonCategory, this.localDB.updateLessonCategory);
        else await syncItems(await this.localDB.getFigureCategories(), categories as FigureCategory[], this.localDB.addFigureCategory, this.localDB.updateFigureCategory);
        
        await syncItems(await this.localDB.getSchools(), schools, this.localDB.addSchool, this.localDB.updateSchool);
        await syncItems(await this.localDB.getInstructors(), instructors, this.localDB.addInstructor, this.localDB.updateInstructor);

        // Create the settings update object with the new order arrays
        const settingsUpdate: Partial<AppSettings> = type === 'lesson' ? {
            showEmptyLessonCategoriesInGroupedView: showEmpty,
            showLessonCountInGroupHeaders: showCount,
            lessonCategoryOrder: categoryOrder,
            lessonSchoolOrder: schoolOrder,
            lessonInstructorOrder: instructorOrder,
        } : {
            showEmptyFigureCategoriesInGroupedView: showEmpty,
            showFigureCountInGroupHeaders: showCount,
            figureCategoryOrder: categoryOrder,
            figureSchoolOrder: schoolOrder,
            figureInstructorOrder: instructorOrder,
        };
        
        // Use the new service method to preserve the timestamp from the remote data.
        await settingsService.applyRemoteSettings(settingsUpdate, remoteConfig.modifiedTime);
    }
}

// --- Singleton Instance ---
export const syncQueueService: SyncQueueService = new SyncQueueServiceImpl(localDatabaseService, externalStorageService, googleDriveService);
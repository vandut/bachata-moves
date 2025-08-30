import type { SyncTask, SyncTaskType, Lesson, Figure, GroupingConfig, AppSettings, FigureCategory, LessonCategory, School, Instructor } from '../types';
import type { DataService } from '../data/DataService';
import type { GoogleDriveService } from './GoogleDriveService';
import type { ExternalStorageService, RemoteItem } from './ExternalStorageService';
import { dataService } from '../data/DataService';
import { externalStorageService } from './ExternalStorageService';
import { googleDriveService } from './GoogleDriveService';
import { createLogger } from '../utils/logger';
import { openBachataDB } from '../data/IndexDbDataService';

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
    forceUploadGroupingConfig(type: 'lesson' | 'figure'): Promise<void>;
}


// --- Implementation ---
class SyncQueueServiceImpl implements SyncQueueService {
    private queue: SyncTask[] = [];
    private listeners: Set<() => void> = new Set();
    private isProcessing = false;
    private dataService: DataService;
    private externalStorageService: ExternalStorageService;
    private driveService: GoogleDriveService; // Retained for auth state checking

    constructor(dataService: DataService, externalStorageService: ExternalStorageService, driveService: GoogleDriveService) {
        this.dataService = dataService;
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
            newItem = await this.dataService.addLesson(itemData as Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, options.videoFile);
            logger.info(' > Lesson added locally:', newItem.id);
            newItem = await this.uploadLesson(newItem.id);
        } else { // type === 'figure'
            if (!options?.lessonId) throw new Error("Lesson ID is required to add a figure.");
            newItem = await this.dataService.addFigure(options.lessonId, itemData as Omit<Figure, 'id' | 'lessonId'>);
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
            updatedItem = await this.dataService.updateLesson(itemId, itemData as Partial<Omit<Lesson, 'id'>>);
            updatedItem = await this.uploadLesson(updatedItem.id);
        } else {
            updatedItem = await this.dataService.updateFigure(itemId, itemData as Partial<Omit<Figure, 'id'>>);
            updatedItem = await this.uploadFigure(updatedItem.id);
        }
        logger.info('✅ Force update complete.');
        return updatedItem;
    };

    public forceDeleteItem = async (item: Lesson | Figure): Promise<void> => {
        if (!this.driveService.getAuthState().isSignedIn) throw new Error("Cannot delete item while not signed in.");
        const itemType = 'uploadDate' in item ? 'lesson' : 'figure';
        logger.info(`--- UI-BLOCK: Forcing DELETE for ${itemType} ${item.id} ---`);
    
        if (itemType === 'lesson') {
            const allFigures = await this.dataService.getFigures();
            const childFigures = allFigures.filter(fig => fig.lessonId === item.id);
            await Promise.all(childFigures.map(fig => this.forceDeleteItem(fig)));
        }
    
        const freshItem: Lesson | Figure | undefined = await (itemType === 'lesson'
            ? this.dataService.getLessons().then(items => items.find(i => i.id === item.id))
            : this.dataService.getFigures().then(items => items.find(i => i.id === item.id)));

        if (!freshItem) {
            logger.warn(`Item ${item.id} not found in DB for deletion.`);
            return;
        }

        if (freshItem.driveId) await this.deleteRemoteItem(freshItem.driveId);
        if ('videoDriveId' in freshItem && freshItem.videoDriveId) await this.deleteRemoteItem(freshItem.videoDriveId);
        
        if (itemType === 'lesson') await this.dataService.deleteLesson(freshItem.id, { skipTombstone: true });
        else await this.dataService.deleteFigure(freshItem.id, { skipTombstone: true });

        logger.info(`✅ Force delete complete for ${itemType} ${item.id}.`);
    };
    
    public forceUploadGroupingConfig = async (type: 'lesson' | 'figure'): Promise<void> => {
        if (!this.driveService.getAuthState().isSignedIn) throw new Error("Cannot upload config while not signed in.");
        logger.info(`--- UI-BLOCK: Forcing UPLOAD of grouping config for ${type} ---`);
        await this.syncGroupingConfig(type);
    };

    // --- Task Implementations ---
    private syncGallery = async (type: 'lesson' | 'figure'): Promise<void> => {
        logger.info(`--- Syncing Gallery: ${type.toUpperCase()} ---`);

        const [remoteItems, localItems, deletedDriveIds] = await Promise.all([
            this.externalStorageService.listRemoteItems(type),
            type === 'lesson' ? this.dataService.getLessons() : this.dataService.getFigures(),
            this.dataService.getDeletedDriveIds()
        ]);

        const remoteItemMap = new Map<string, RemoteItem>();
        for (const remoteItem of remoteItems) {
            if (remoteItem.name.endsWith('.json')) {
                const localId = remoteItem.name.replace('.json', '');
                remoteItemMap.set(localId, remoteItem);
            }
        }
        
        const localItemMap = new Map(localItems.map(item => [item.id, item]));

        // Check remote items against local
        for (const remoteItem of remoteItems) {
            if (!remoteItem.name.endsWith('.json')) continue;
            const localId = remoteItem.name.replace('.json', '');

            if (deletedDriveIds.includes(remoteItem.externalId)) {
                this.addTask('delete-remote', { externalId: remoteItem.externalId });
                continue;
            }
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
        const lesson = await this.dataService.getLessons().then(l => l.find(x => x.id === lessonId));
        if (!lesson) throw new Error(`Cannot upload lesson ${lessonId}: not found in local DB.`);
        const videoFile = await this.dataService.getVideoFile(lesson.id);
        if (!videoFile) throw new Error(`Cannot upload lesson ${lessonId}: video file not found.`);

        const { lessonMetadata, videoMetadata } = await this.externalStorageService.uploadLesson(lesson, videoFile);

        const updatedLesson = { ...lesson, driveId: lessonMetadata.externalId, videoDriveId: videoMetadata.externalId, modifiedTime: lessonMetadata.modifiedTime };
        await this.dataService.updateLesson(lesson.id, updatedLesson);
        return updatedLesson;
    }

    private uploadFigure = async (figureId: string): Promise<Figure> => {
        const figure = await this.dataService.getFigures().then(f => f.find(x => x.id === figureId));
        if (!figure) throw new Error(`Cannot upload figure ${figureId}: not found in local DB.`);
        
        const figureMetadata = await this.externalStorageService.uploadFigure(figure);
        
        const updatedFigure = { ...figure, driveId: figureMetadata.externalId, modifiedTime: figureMetadata.modifiedTime };
        await this.dataService.updateFigure(figure.id, updatedFigure);
        return updatedFigure;
    }

    private downloadLesson = async (remoteItem: RemoteItem): Promise<void> => {
        const downloaded = await this.externalStorageService.downloadLesson(remoteItem);
        if (downloaded) {
            await this.dataService.saveDownloadedLesson(downloaded.lesson, downloaded.video);
        }
    }

    private downloadFigure = async (remoteItem: RemoteItem): Promise<void> => {
        const figureData = await this.externalStorageService.downloadFigure(remoteItem);
        if (figureData) {
            await this.dataService.saveDownloadedFigure(figureData);
        }
    }

    private deleteRemoteItem = async (externalId: string): Promise<void> => {
        await this.externalStorageService.deleteRemoteItemById(externalId);
        await this.dataService.removeDeletedDriveId(externalId);
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
        const [categories, schools, instructors, settings] = await Promise.all([
            type === 'lesson' ? this.dataService.getLessonCategories() : this.dataService.getFigureCategories(),
            this.dataService.getSchools(),
            this.dataService.getInstructors(),
            this.dataService.getSettings()
        ]);
        
        const getLatestTime = (items: any[]) => items.reduce((latest, item) => Math.max(latest, new Date(item.modifiedTime || 0).getTime()), 0);
        const latestTime = Math.max(getLatestTime(categories), getLatestTime(schools), getLatestTime(instructors));
        
        return {
            modifiedTime: latestTime > 0 ? new Date(latestTime).toISOString() : '1970-01-01T00:00:00.000Z',
            categories, schools, instructors,
            showEmpty: type === 'lesson' ? settings.showEmptyLessonCategoriesInGroupedView : settings.showEmptyFigureCategoriesInGroupedView,
            showCount: type === 'lesson' ? settings.showLessonCountInGroupHeaders : settings.showFigureCountInGroupHeaders,
        };
    }

    private applyRemoteGroupingConfig = async (remoteConfig: GroupingConfig, type: 'lesson' | 'figure'): Promise<void> => {
        const db = await openBachataDB();
        const { categories, schools, instructors, showEmpty, showCount } = remoteConfig;

        // FIX: Define a type for items being synced and apply it to function parameters
        // to resolve type errors with Map constructor and property access.
        type SyncableConfigItem = (LessonCategory | FigureCategory | School | Instructor);

        const syncItems = async (localItems: SyncableConfigItem[], remoteItems: SyncableConfigItem[], storeName: string) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName as any);
            // FIX: Explicitly type the Map to ensure correct type inference for its values.
            const localDriveIdMap = new Map<string, SyncableConfigItem>(localItems.filter(i => i.driveId).map(i => [i.driveId!, i]));
            for (const remoteItem of remoteItems) {
                const existingByDriveId = localDriveIdMap.get(remoteItem.id); 
                if (existingByDriveId) {
                    if (new Date(remoteItem.modifiedTime!) > new Date(existingByDriveId.modifiedTime!)) {
                        await store.put({ ...existingByDriveId, name: remoteItem.name, modifiedTime: remoteItem.modifiedTime });
                    }
                } else {
                    await store.put({ ...remoteItem, driveId: remoteItem.id });
                }
            }
            await tx.done;
        };

        if (type === 'lesson') await syncItems(await this.dataService.getLessonCategories(), categories as LessonCategory[], 'lesson_categories');
        else await syncItems(await this.dataService.getFigureCategories(), categories as FigureCategory[], 'figure_categories');
        
        await syncItems(await this.dataService.getSchools(), schools, 'schools');
        await syncItems(await this.dataService.getInstructors(), instructors, 'instructors');

        const settings = await this.dataService.getSettings();
        const settingsUpdate: Partial<AppSettings> = type === 'lesson' ? {
            showEmptyLessonCategoriesInGroupedView: showEmpty,
            showLessonCountInGroupHeaders: showCount
        } : {
            showEmptyFigureCategoriesInGroupedView: showEmpty,
            showFigureCountInGroupHeaders: showCount
        };
        await this.dataService.saveSettings({ ...settings, ...settingsUpdate });
    }
}

// --- Singleton Instance ---
export const syncQueueService: SyncQueueService = new SyncQueueServiceImpl(dataService, externalStorageService, googleDriveService);

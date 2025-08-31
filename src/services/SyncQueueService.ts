import type { Lesson, Figure } from '../types';
import type { LocalDatabaseService } from './LocalDatabaseService';
import { localDatabaseService } from './LocalDatabaseService';
import { dataService } from './DataService';
import { googleDriveService, GoogleDriveService } from './GoogleDriveService';
import { settingsService, SettingsService, RemoteGroupingConfig } from './SettingsService';
import { createLogger } from '../utils/logger';
import { GoogleDriveSyncApiImpl, GoogleDriveSyncApi } from '../api/GoogleDriveSyncApi';
import { GoogleDriveApi, DriveFile } from '../api/GoogleDriveApi';
import { GoogleDriveApiImpl } from '../api/GoogleDriveApi';


const logger = createLogger('SyncQueue');
const generateId = (): string => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// --- Constants ---
const FOLDERS = {
    lessons: 'lessons',
    figures: 'figures',
    videos: 'videos'
};
const FILES = {
    lessonGroupingConfig: 'lesson_grouping_config.json',
    figureGroupingConfig: 'figure_grouping_config.json',
};

// --- Types and Interface (Encapsulated) ---
export type SyncTaskType = 
  | 'sync-gallery'
  | 'sync-grouping-config';

export interface SyncTask {
  id: string;
  type: SyncTaskType;
  payload?: any;
  status: 'pending' | 'in-progress' | 'error';
  createdAt: number;
  error?: string;
  priority: number;
}

export interface SyncQueueService {
    getQueue(): SyncTask[];
    getIsActive(): boolean;
    subscribe(listener: () => void): () => void;
    startProcessing(): void;
    stopProcessing(): void;
    addTask(type: SyncTaskType, payload?: any, isPriority?: boolean): void;
}


// --- Implementation ---
class SyncQueueServiceImpl implements SyncQueueService {
    private queue: SyncTask[] = [];
    private listeners: Set<() => void> = new Set();
    private isProcessing = false;
    private localDB: LocalDatabaseService;
    private driveService: GoogleDriveService;
    private settingsSvc: SettingsService;
    private syncApi: GoogleDriveSyncApi;
    private gdriveApi: GoogleDriveApi | null = null;

    constructor(localDB: LocalDatabaseService, driveService: GoogleDriveService, settingsSvc: SettingsService) {
        this.localDB = localDB;
        this.driveService = driveService;
        this.settingsSvc = settingsSvc;
        this.syncApi = new GoogleDriveSyncApiImpl();

        this.driveService.onAuthStateChanged(state => {
            if (state.isSignedIn) {
                const storedToken = localStorage.getItem('google_access_token');
                if (storedToken) {
                    this.gdriveApi = new GoogleDriveApiImpl(storedToken);
                }
            } else {
                this.gdriveApi = null;
            }
        });
    }

    // --- Public Interface ---

    public getQueue = (): SyncTask[] => this.queue;
    public getIsActive = (): boolean => this.queue.some(task => task.status === 'in-progress' || task.status === 'pending');

    public subscribe = (listener: () => void): () => void => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public startProcessing = (): void => {
        const token = localStorage.getItem('google_access_token');
        if (token) {
            this.gdriveApi = new GoogleDriveApiImpl(token);
        }
        this.processNext();
    }

    public stopProcessing = (): void => {
        this.isProcessing = false;
        this.queue = this.queue.map(task => 
            task.status === 'in-progress' ? { ...task, status: 'pending' } : task
        );
        this.gdriveApi = null;
        this.notify();
    }

    public addTask = (type: SyncTaskType, payload?: any, isPriority = false): void => {
        const uniquePayloadIdentifier = payload?.type;
        if (this.isDuplicate(type, uniquePayloadIdentifier)) {
            logger.info(`Skipping duplicate task: ${type}`, payload);
            return;
        }

        const newTask: SyncTask = {
            id: generateId(), type, payload, status: 'pending', createdAt: Date.now(), priority: isPriority ? 1 : 0
        };

        this.queue.push(newTask);
        
        this.queue.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority; // Higher priority first
            }
            return a.createdAt - b.createdAt; // Then older tasks first
        });

        this.notify();
        this.processNext();
    }
    
    // --- Task Implementations ---
    private async syncGallery(type: 'lesson' | 'figure'): Promise<void> {
        if (!this.gdriveApi) throw new Error("Not authenticated");
        logger.info(`--- Syncing Gallery: ${type.toUpperCase()} ---`);
        
        const folderName = type === 'lesson' ? FOLDERS.lessons : FOLDERS.figures;
        
        const [remoteJsonFiles, localItems, tombstones] = await Promise.all([
            this.driveService.listFiles(`/${folderName}`),
            type === 'lesson' ? this.localDB.getLessons() : this.localDB.getFigures(),
            this.localDB.getTombstones()
        ]);
        
        const localFilesForPlan = localItems.map(item => ({
            name: `${item.id}.json`,
            modifiedTime: item.modifiedTime || '1970-01-01T00:00:00.000Z'
        }));
        
        const plan = this.syncApi.planDirectorySync(localFilesForPlan, remoteJsonFiles, tombstones);

        // Execute Plan
        for (const file of plan.filesToDelete) {
            logger.info(`Deleting remote item by ID: ${file.id}`);
            await this.deleteItemByJsonId(file.id, type);
            await this.localDB.removeTombstones([file.id]);
        }

        for (const file of plan.filesToDownload) {
            logger.info(`Downloading remote item: ${file.name}`);
            if (type === 'lesson') await this.downloadLesson(file.id);
            else await this.downloadFigure(file.id);
        }

        for (const file of plan.filesToUpload) {
            logger.info(`Uploading local item: ${file.name}`);
            const localId = file.name.replace('.json', '');
            if (type === 'lesson') await this.uploadLesson(localId);
            else await this.uploadFigure(localId);
        }
        
        logger.info(`--- Gallery Sync Complete: ${type.toUpperCase()} ---`);
    }

    private async syncGroupingConfig(type: 'lesson' | 'figure'): Promise<void> {
        if (!this.gdriveApi) throw new Error("Not authenticated");
        logger.info(`--- Syncing Grouping Config: ${type.toUpperCase()} ---`);
        
        const configFileName = type === 'lesson' ? FILES.lessonGroupingConfig : FILES.figureGroupingConfig;
        const remoteFile = await this.driveService.readJsonFileWithMetadata<RemoteGroupingConfig>(`/${configFileName}`).then(r => r?.metadata || null);
        const { content, modifiedTime } = await this.settingsSvc.getGroupingConfigForUpload(type);
        
        const localFile = {
            name: configFileName,
            content: new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }),
            modifiedTime: modifiedTime,
        };
        
        const result = await this.syncApi.syncFile(localFile, remoteFile, this.gdriveApi, 'appDataFolder');

        if (result.outcome === 'downloaded' && result.downloadedContent && result.newTimestamp) {
            logger.info(`Downloaded newer grouping config for ${type}. Applying.`);
            const remoteContent = JSON.parse(await result.downloadedContent.text());
            const remoteConfig: RemoteGroupingConfig = remoteContent;
            await this.settingsSvc.applyRemoteGroupingConfig(type, remoteConfig, result.newTimestamp);
        } else if (result.outcome === 'uploaded' && result.newTimestamp) {
            logger.info(`Uploaded local grouping config for ${type}.`);
            await this.settingsSvc.applyRemoteSettings({}, result.newTimestamp);
        } else {
            logger.info(`Grouping config for ${type} is in sync.`);
        }
    }

    // --- Private Domain Logic Helpers ---
    private async deleteItemByJsonId(jsonId: string, type: 'lesson' | 'figure'): Promise<void> {
        if (type === 'lesson') {
            const lessonData = await this.driveService.readJsonFileById<Lesson>(jsonId);
            if (lessonData?.videoDriveId) {
                await this.driveService.deleteFileById(lessonData.videoDriveId);
            }
        }
        await this.driveService.deleteFileById(jsonId);
    }
    
    private async downloadLesson(jsonId: string): Promise<void> {
        const result = await this.driveService.readJsonFileWithMetadataById<Lesson>(jsonId);
        if (!result) {
            logger.warn(`Could not download lesson JSON and metadata for ID ${jsonId}`);
            return;
        }
        const { content: lessonData, metadata } = result;
    
        if (lessonData?.videoDriveId) {
            const videoBlob = await this.driveService.readBinaryFileById(lessonData.videoDriveId);
            if (videoBlob) {
                const lessonToSave = { ...lessonData, modifiedTime: metadata.modifiedTime };
                await dataService.saveDownloadedLesson(lessonToSave, videoBlob);
            } else {
                logger.warn(`Could not download video blob for lesson ${lessonData.id}`);
            }
        } else {
            logger.warn(`Lesson JSON ${jsonId} downloaded but had no videoDriveId.`);
        }
    }

    private async downloadFigure(jsonId: string): Promise<void> {
        const result = await this.driveService.readJsonFileWithMetadataById<Figure>(jsonId);
        if (!result) {
            logger.warn(`Could not download figure JSON and metadata for ID ${jsonId}`);
            return;
        }
        const { content: figureData, metadata } = result;
    
        if (figureData) {
            const figureToSave = { ...figureData, modifiedTime: metadata.modifiedTime };
            await dataService.saveDownloadedFigure(figureToSave);
        }
    }
    
    private async uploadLesson(lessonId: string): Promise<void> {
        const lesson = await this.localDB.getLessons().then(l => l.find(x => x.id === lessonId));
        if (!lesson) throw new Error(`Cannot upload lesson ${lessonId}: not found in local DB.`);
        const videoFile = await dataService.getVideoFile(lesson.id);
        if (!videoFile) throw new Error(`Cannot upload lesson ${lessonId}: video file not found.`);
        
        const videoDriveFile = await this.driveService.writeFile(`/${FOLDERS.videos}/${lesson.id}.mp4`, videoFile, videoFile.type);
        
        const lessonWithVideoId: Lesson = { ...lesson, videoDriveId: videoDriveFile.id };
        const updatedLessonJson = JSON.stringify(lessonWithVideoId);
        
        const lessonDriveFile = await this.driveService.writeFile(`/${FOLDERS.lessons}/${lesson.id}.json`, updatedLessonJson, 'application/json');

        await dataService.updateLesson(lesson.id, { 
            driveId: lessonDriveFile.id,
            videoDriveId: videoDriveFile.id, 
            modifiedTime: lessonDriveFile.modifiedTime 
        });
    }

    private async uploadFigure(figureId: string): Promise<void> {
        const figure = await this.localDB.getFigures().then(f => f.find(x => x.id === figureId));
        if (!figure) throw new Error(`Cannot upload figure ${figureId}: not found in local DB.`);

        const figureJson = JSON.stringify(figure);
        const figureDriveFile = await this.driveService.writeFile(`/${FOLDERS.figures}/${figure.id}.json`, figureJson, 'application/json');

        await dataService.updateFigure(figure.id, { driveId: figureDriveFile.id, modifiedTime: figureDriveFile.modifiedTime });
    }
    

    // --- Private Queue Management Methods ---
    private notify = (): void => this.listeners.forEach(listener => listener());

    private isDuplicate = (type: SyncTaskType, payloadIdentifier: any): boolean => {
        if (!payloadIdentifier) return false;
        const now = Date.now();
        // Debounce gallery syncs for 2 seconds to catch rapid changes
        const debounceMs = 2000;
        return this.queue.some(task => {
            if (task.type !== type || task.payload?.type !== payloadIdentifier) return false;
            // If a task is already running, it's a duplicate.
            if (task.status === 'in-progress') return true;
            // If a pending task was added very recently, debounce.
            if ((now - task.createdAt) < debounceMs) return true;
            return false;
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
        if (this.isProcessing || !this.driveService.getAuthState().isSignedIn || !this.gdriveApi) return;
        const task = this.queue.find(t => t.status === 'pending');
        if (!task) return;

        this.isProcessing = true;
        this.updateTaskStatus(task.id, 'in-progress');
        
        try {
            logger.info(`Processing task: ${task.type}`, task.payload);
            switch (task.type) {
                case 'sync-gallery': await this.syncGallery(task.payload.type); break;
                case 'sync-grouping-config': await this.syncGroupingConfig(task.payload.type); break;
                default: logger.warn(`Unknown task type: ${task.type}`);
            }
            logger.info(`✅ Task completed: ${task.type}`);
            this.removeTask(task.id);
        } catch (e: any) {
            logger.error(`❌ Task failed: ${task.type}`, e);
            this.updateTaskStatus(task.id, 'error', e.message || 'An unknown error occurred.');
        } finally {
            this.isProcessing = false;
            setTimeout(() => this.processNext(), 1000); // Small delay before next task
        }
    }
}

// --- Singleton Instance ---
export const syncQueueService: SyncQueueService = new SyncQueueServiceImpl(localDatabaseService, googleDriveService, settingsService);

import type { SyncTask, SyncTaskType, Lesson, Figure, GroupingConfig, LessonCategory, FigureCategory } from '../types';
import { GoogleDriveApi, FOLDERS, FILES, DriveFile } from './googledrive';
import { dataService } from './service';
import { createLogger } from '../utils/logger';
import { openBachataDB } from './indexdb';

const logger = createLogger('SyncQueue');
const VIDEO_FILES_STORE = 'video_files';
const generateId = (): string => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

class SyncQueueService {
    private queue: SyncTask[] = [];
    private listeners: Set<() => void> = new Set();
    private isProcessing = false;
    private api: GoogleDriveApi | null = null;

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

    public startProcessing = (api: GoogleDriveApi): void => {
        this.api = api;
        this.processNext();
    }

    public stopProcessing = (): void => {
        this.api = null;
        this.isProcessing = false;
        // Reset in-progress tasks to pending so they can be resumed on next sign-in
        this.queue = this.queue.map(task => 
            task.status === 'in-progress' ? { ...task, status: 'pending' } : task
        );
        this.notify();
    }

    public addTask = (type: SyncTaskType, payload?: any, isPriority = false): void => {
        const uniquePayloadIdentifier = type === 'sync-gallery' || type === 'sync-grouping-config' ? payload?.type : (payload?.id || payload?.driveId || payload?.lessonId || payload?.figureId);
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
    
    // --- Task Implementations (callable from outside for blocking operations) ---
    public syncGallery = async (api: GoogleDriveApi, type: 'lesson' | 'figure'): Promise<void> => {
        logger.info(`--- Syncing Gallery: ${type.toUpperCase()} ---`);

        const folderName = type === 'lesson' ? FOLDERS.lessons : FOLDERS.figures;
        const folderId = await api.findOrCreateFolder(folderName);
        const remoteFiles = await api.listFiles(`'${folderId}' in parents and trashed=false`);
        const remoteFileMap = new Map<string, DriveFile>(remoteFiles.map(f => [f.name.replace('.json', ''), f]));

        const getLocalItems = type === 'lesson' ? dataService.getLessons : dataService.getFigures;
        const localItems: (Lesson | Figure)[] = await getLocalItems();
        const localItemMap = new Map<string, Lesson | Figure>(localItems.map(item => [item.id, item]));

        const logFileMeta = (await api.listFiles(`name='${FILES.deletedItemsLog}'`))[0];
        const remoteDeletedLog = logFileMeta ? (await api.downloadJson<string[]>(logFileMeta.id) || []) : [];
        const localDeletedLog = await dataService.getDeletedDriveIds();
        
        logger.info('Local items found:', localItems.length);
        logger.info('Remote files found:', remoteFiles.length);
        logger.info('Local deleted log:', localDeletedLog.length);
        logger.info('Remote deleted log:', remoteDeletedLog.length);

        // --- Local to Remote Comparison ---
        for (const item of localItems) {
            if (!item.driveId) {
                logger.info(`[NEW] Local item ${item.id} has no driveId. Queueing for UPLOAD.`);
                this.addTask(`upload-${type}`, { [`${type}Id`]: item.id });
            } else {
                const remoteMatch = remoteFileMap.get(item.id);
                if (!remoteMatch) {
                    if (!remoteDeletedLog.includes(item.driveId)) {
                         logger.info(`[MISSING] Remote file for local item ${item.id} not found. Queueing for UPLOAD.`);
                         this.addTask(`upload-${type}`, { [`${type}Id`]: item.id });
                    }
                } else {
                    const remoteTime = new Date(remoteMatch.modifiedTime).getTime();
                    const localTime = item.modifiedTime ? new Date(item.modifiedTime).getTime() : 0;
                    if (localTime > remoteTime) { // Local is newer
                         logger.info(`[STALE] Local item ${item.id} is newer than remote. Queueing for UPLOAD.`);
                         this.addTask(`upload-${type}`, { [`${type}Id`]: item.id });
                    }
                }
            }
        }
        
        // --- Remote to Local Comparison ---
        for (const remoteFile of remoteFiles) {
            const itemId = remoteFile.name.replace('.json', '');
            const localMatch = localItemMap.get(itemId);
            if (!localMatch) {
                if (!localDeletedLog.includes(remoteFile.id)) {
                    logger.info(`[NEW] Remote file ${remoteFile.name} not found locally. Queueing for DOWNLOAD.`);
                    this.addTask(`download-${type}`, { driveId: remoteFile.id });
                }
            } else if (localMatch.driveId) {
                 const remoteTime = new Date(remoteFile.modifiedTime).getTime();
                 const localTime = localMatch.modifiedTime ? new Date(localMatch.modifiedTime).getTime() : 0;
                 if (remoteTime > localTime) { // Remote is newer
                    logger.info(`[STALE] Remote file ${remoteFile.name} is newer than local. Queueing for DOWNLOAD.`);
                    this.addTask(`download-${type}`, { driveId: remoteFile.id });
                 }
            }
        }

        // --- Local Tombstone to Remote Deletion ---
        for (const deletedDriveId of localDeletedLog) {
            const remoteFile = await api.getFile(deletedDriveId);
            if (remoteFile && !remoteFile.trashed) {
                logger.info(`[TOMBSTONE] Local log indicates remote file ${deletedDriveId} should be deleted. Queueing for REMOTE DELETE.`);
                this.addTask('delete-remote', { driveId: deletedDriveId });
            } else {
                // The file is already gone from remote, or doesn't exist, so we can clean up our local tombstone
                logger.info(`[TOMBSTONE] Remote file ${deletedDriveId} already deleted or not found. Removing from local log.`);
                await dataService.removeDeletedDriveId(deletedDriveId);
            }
        }

        // --- Remote Tombstone to Local Deletion ---
        for(const deletedDriveId of remoteDeletedLog) {
            const db = await openBachataDB();
            let item: Lesson | Figure | undefined;
            if (type === 'lesson') item = await db.getFromIndex('lessons', 'driveId', deletedDriveId);
            else item = await db.getFromIndex('figures', 'driveId', deletedDriveId);
            if (item) {
                logger.info(`[TOMBSTONE] Remote log indicates item with driveId ${deletedDriveId} should be deleted. Queueing for LOCAL DELETE.`);
                this.addTask('delete-local', { driveId: deletedDriveId, type });
            }
        }

        this.addTask('sync-deleted-log', {});
        logger.info('Sync gallery complete. Tasks queued.');
    }

    public uploadLesson = async (api: GoogleDriveApi, lessonId: string): Promise<Lesson> => {
        logger.info(`Uploading lesson ${lessonId}...`);
        const db = await openBachataDB();
        const lesson: Lesson | undefined = await db.get('lessons', lessonId);
        const videoFile = await dataService.getVideoFile(lessonId);
        if (!lesson || !videoFile) throw new Error("Local lesson or video file not found for upload.");

        const videoFolderId = await api.findOrCreateFolder(FOLDERS.videos);
        const videoDriveFile = await api.upload(videoFile, { name: `${lesson.videoId}.mp4`, mimeType: videoFile.type, parents: [videoFolderId] }, lesson.videoDriveId);
        lesson.videoDriveId = videoDriveFile.id;
        
        const lessonsFolderId = await api.findOrCreateFolder(FOLDERS.lessons);
        const uploadedLessonFile = await api.upload(JSON.stringify(lesson), { name: `${lesson.id}.json`, mimeType: 'application/json', parents: [lessonsFolderId] }, lesson.driveId);

        const finalLessonMeta = await api.getFile(uploadedLessonFile.id);
        if (!finalLessonMeta) throw new Error(`Could not get metadata for just-uploaded lesson ${lesson.id}`);

        lesson.driveId = finalLessonMeta.id;
        lesson.modifiedTime = finalLessonMeta.modifiedTime;
        await db.put('lessons', lesson);
        logger.info(`✅ Uploaded lesson ${lesson.id}. Drive ID: ${lesson.driveId}, Video Drive ID: ${lesson.videoDriveId}`);
        return lesson;
    }

    public uploadFigure = async (api: GoogleDriveApi, figureId: string): Promise<Figure> => {
        logger.info(`Uploading figure ${figureId}...`);
        const db = await openBachataDB();
        const figure: Figure | undefined = await db.get('figures', figureId);
        if (!figure) throw new Error("Local figure not found for upload.");

        const figuresFolderId = await api.findOrCreateFolder(FOLDERS.figures);
        const uploadedFigureFile = await api.upload(JSON.stringify(figure), { name: `${figure.id}.json`, mimeType: 'application/json', parents: [figuresFolderId] }, figure.driveId);
        
        const finalFigureMeta = await api.getFile(uploadedFigureFile.id);
        if (!finalFigureMeta) throw new Error(`Could not get metadata for just-uploaded figure ${figure.id}`);

        figure.driveId = finalFigureMeta.id;
        figure.modifiedTime = finalFigureMeta.modifiedTime;
        await db.put('figures', figure);
        logger.info(`✅ Uploaded figure ${figure.id}. Drive ID: ${figure.driveId}`);
        return figure;
    }

    public downloadLesson = async (api: GoogleDriveApi, driveId: string): Promise<void> => {
        logger.info(`Downloading lesson (Drive ID: ${driveId})...`);
        const db = await openBachataDB();

        const fileMeta = await api.getFile(driveId);
        if (!fileMeta) throw new Error(`Could not get remote lesson file metadata for driveId: ${driveId}`);

        const lessonJson = await api.downloadJson<Lesson>(driveId);
        if (!lessonJson || !lessonJson.videoId) throw new Error("Remote lesson JSON or videoId missing.");

        lessonJson.modifiedTime = fileMeta.modifiedTime;
        lessonJson.driveId = driveId;

        const localVideo = await db.get(VIDEO_FILES_STORE, lessonJson.videoId);
        if (localVideo) {
            logger.info(`  > Video for lesson already exists locally. Skipping video download.`);
            await dataService.saveDownloadedLesson(lessonJson);
        } else {
            if (!lessonJson.videoDriveId) throw new Error("Remote lesson JSON is missing videoDriveId for download.");
            logger.info(`  > Video for lesson not found locally. Downloading video...`);
            const videoBlob = await api.downloadBlob(lessonJson.videoDriveId);
            if (!videoBlob) throw new Error("Remote lesson video file missing or failed to download.");
            await dataService.saveDownloadedLesson(lessonJson, videoBlob);
        }
        logger.info(`✅ Downloaded and saved lesson (Drive ID: ${driveId}).`);
    }

    public deleteRemoteFile = async (api: GoogleDriveApi, driveId: string): Promise<void> => {
        logger.info(`🗑️ Deleting remote file (Drive ID: ${driveId})`);
        await api.deleteFile(driveId);
    }
    
    public buildLocalGroupingConfig = async (type: 'lesson' | 'figure'): Promise<GroupingConfig> => {
        const settingsKeys = type === 'lesson'
            ? { order: 'lessonCategoryOrder', showEmpty: 'showEmptyLessonCategoriesInGroupedView', showCount: 'showLessonCountInGroupHeaders' }
            : { order: 'figureCategoryOrder', showEmpty: 'showEmptyFigureCategoriesInGroupedView', showCount: 'showFigureCountInGroupHeaders' };
    
        const localCategories = await (type === 'lesson' ? dataService.getLessonCategories() : dataService.getFigureCategories());
        const localSettings = await dataService.getSettings();
        
        const getLatestTime = async () => {
            const db = await openBachataDB();
            const syncSettings = await db.get('settings', 'sync-settings') as any;

            let latest = 0;
            if (syncSettings?.modifiedTime) {
                latest = new Date(syncSettings.modifiedTime).getTime();
            }
            localCategories.forEach(c => {
                if (c.modifiedTime) {
                    const t = new Date(c.modifiedTime).getTime();
                    if (t > latest) latest = t;
                }
            });
            return latest > 0 ? new Date(latest).toISOString() : new Date(0).toISOString();
        };

        const allKnownIds = new Set(['__uncategorized__', ...localCategories.map(c => c.id)]);
        let order = (localSettings as any)[settingsKeys.order] || [];
        const orderSet = new Set(order);

        if (order.length < allKnownIds.size) {
            const missingIds = [...allKnownIds].filter(id => !orderSet.has(id));
            order = [...order, ...missingIds];
        }
    
        return {
            modifiedTime: await getLatestTime(),
            categories: localCategories,
            order: order,
            showEmpty: (localSettings as any)[settingsKeys.showEmpty] || false,
            showCount: (localSettings as any)[settingsKeys.showCount] || false,
        };
    };

    public downloadAndApplyGroupingConfig = async (config: GroupingConfig, type: 'lesson' | 'figure'): Promise<void> => {
        const db = await openBachataDB();
        const storeName = type === 'lesson' ? 'lesson_categories' : 'figure_categories';
        const settingsKeys = type === 'lesson'
            ? { order: 'lessonCategoryOrder', showEmpty: 'showEmptyLessonCategoriesInGroupedView', showCount: 'showLessonCountInGroupHeaders' }
            : { order: 'figureCategoryOrder', showEmpty: 'showEmptyFigureCategoriesInGroupedView', showCount: 'showFigureCountInGroupHeaders' };
    
        // Update categories
        const catTx = db.transaction(storeName, 'readwrite');
        await catTx.store.clear();
        for (const cat of config.categories) {
            await catTx.store.put(cat as any);
        }
        await catTx.done;
    
        // Update settings directly in the database to preserve the remote modifiedTime
        const settingsTx = db.transaction('settings', 'readwrite');
        const syncSettings: any = await settingsTx.store.get('sync-settings') || {};
        
        syncSettings[settingsKeys.order] = config.order || [];
        syncSettings[settingsKeys.showEmpty] = !!config.showEmpty;
        syncSettings[settingsKeys.showCount] = !!config.showCount;
        
        // This is the crucial part: set the modifiedTime to match the remote source.
        syncSettings.modifiedTime = config.modifiedTime;
        syncSettings.lastSyncTimestamp = config.modifiedTime;

        await settingsTx.store.put(syncSettings, 'sync-settings');
        await settingsTx.done;

        logger.info(`✅ Applied grouping config for ${type} from remote. Local timestamp updated to match remote: ${config.modifiedTime}.`);
    };

    public syncGroupingConfig = async (api: GoogleDriveApi, type: 'lesson' | 'figure'): Promise<void> => {
        logger.info(`--- Syncing Grouping Config: ${type.toUpperCase()} ---`);

        const configFileName = type === 'lesson' ? FILES.lessonGroupingConfig : FILES.figureGroupingConfig;

        const [remoteFile] = await api.listFiles(`name='${configFileName}'`);

        if (!remoteFile) {
            logger.info(`No remote config found for ${type}. Uploading local config.`);
            await this.uploadGroupingConfig(api, type);
            return;
        }

        const remoteConfig = await api.downloadJson<GroupingConfig>(remoteFile.id);
        if (!remoteConfig) {
            logger.warn(`Remote config file ${remoteFile.id} for ${type} was found but could not be downloaded or parsed. Assuming it's corrupted and uploading local version.`);
            await this.uploadGroupingConfig(api, type);
            return;
        }

        const localConfig = await this.buildLocalGroupingConfig(type);

        // Use the Drive file's metadata timestamp as the single source of truth for remote time.
        const remoteTimestamp = new Date(remoteFile.modifiedTime).getTime();
        const localTimestamp = new Date(localConfig.modifiedTime).getTime();
        
        const remoteISO = new Date(remoteTimestamp).toISOString();
        const localISO = new Date(localTimestamp).toISOString();

        if (remoteTimestamp > localTimestamp) {
            logger.info(`Remote config for ${type} is newer. Downloading.`, { remote: remoteISO, local: localISO });
            // Pass the server's modifiedTime to the download function so it can be preserved.
            await this.downloadAndApplyGroupingConfig({ ...remoteConfig, modifiedTime: remoteFile.modifiedTime }, type);
        } else if (localTimestamp > remoteTimestamp) {
            logger.info(`Local config for ${type} is newer. Uploading.`, { local: localISO, remote: remoteISO });
            await this.uploadGroupingConfig(api, type);
        } else {
            logger.info(`Grouping config for ${type} is up to date.`, { timestamp: localISO });
        }
    }

    // --- Private Methods ---
    
    private uploadGroupingConfig = async (api: GoogleDriveApi, type: 'lesson' | 'figure'): Promise<DriveFile> => {
        const configToUpload = await this.buildLocalGroupingConfig(type);
        // The modifiedTime is set by the server on upload, so we don't need to set it here.
    
        const configFileName = type === 'lesson' ? FILES.lessonGroupingConfig : FILES.figureGroupingConfig;
        const [existingFile] = await api.listFiles(`name='${configFileName}'`);
        const uploadedFile = await api.upload(JSON.stringify(configToUpload), { name: configFileName, mimeType: 'application/json' }, existingFile?.id);
    
        // After uploading, update the local 'sync-settings' object with the server's timestamp.
        // This prevents a loop where the local config (with its fresh but pre-upload timestamp)
        // is always considered newer than the remote one on the next check.
        const db = await openBachataDB();
        const syncSettings: any = await db.get('settings', 'sync-settings') || {};
        syncSettings.modifiedTime = uploadedFile.modifiedTime;
        // We also update lastSyncTimestamp for good measure, though the logic mainly relies on modifiedTime for comparison.
        syncSettings.lastSyncTimestamp = uploadedFile.modifiedTime;
        
        await db.put('settings', syncSettings, 'sync-settings');
        logger.info(`Updated local 'sync-settings' modifiedTime to ${uploadedFile.modifiedTime}`);
    
        return uploadedFile;
    };

    private notify = (): void => {
        this.listeners.forEach(listener => listener());
    }

    private isDuplicate = (type: SyncTaskType, uniqueIdentifier: string | undefined): boolean => {
        if (!uniqueIdentifier && (type !== 'sync-deleted-log' && type !== 'sync-settings')) {
            return false; // Cannot determine duplication without an ID
        }

        return this.queue.some(task => {
            if ((task.status !== 'pending' && task.status !== 'in-progress') || task.type !== type) {
                return false;
            }
            
            if (type === 'sync-gallery' || type === 'sync-grouping-config') {
                return task.payload?.type === uniqueIdentifier;
            }
            
            if (type === 'sync-deleted-log' || type === 'sync-settings') return true;
            
            const taskIdentifier = task.payload?.id || task.payload?.driveId || task.payload?.lessonId || task.payload?.figureId;
            return taskIdentifier === uniqueIdentifier;
        });
    }

    private processNext = async (): Promise<void> => {
        if (this.isProcessing || !this.api) return;

        const task = this.queue.find(t => t.status === 'pending');
        if (!task) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        let taskError: string | undefined;

        this.updateTaskStatus(task.id, 'in-progress');
        logger.info(`--- Processing task: ${task.type} (${task.id}) ---`, 'Payload:', task.payload);

        try {
            const api = this.api;
            const { type, payload } = task;

            switch (type) {
                case 'sync-gallery':
                    await this.syncGallery(api, payload.type);
                    break;
                case 'sync-grouping-config':
                    await this.syncGroupingConfig(api, payload.type);
                    break;
                case 'upload-lesson':
                    await this.uploadLesson(api, payload.lessonId);
                    break;
                case 'upload-figure':
                    await this.uploadFigure(api, payload.figureId);
                    break;
                case 'download-lesson':
                    await this.downloadLesson(api, payload.driveId);
                    break;
                case 'download-figure': {
                    const { driveId } = payload;
                    
                    const fileMeta = await api.getFile(driveId);
                    if (!fileMeta) throw new Error(`Could not get remote figure file metadata for driveId: ${driveId}`);
                    
                    const figureJson = await api.downloadJson<Figure>(driveId);
                    if (!figureJson) throw new Error("Remote figure JSON missing.");

                    figureJson.modifiedTime = fileMeta.modifiedTime;
                    figureJson.driveId = driveId;

                    const db = await openBachataDB();
                    const parentLesson = await db.get('lessons', figureJson.lessonId);
                    if (!parentLesson) {
                        const lessonsFolderId = await api.findOrCreateFolder(FOLDERS.lessons);
                        const parentLessonFiles = await api.listFiles(`name='${figureJson.lessonId}.json' and '${lessonsFolderId}' in parents`);
                        if (parentLessonFiles.length > 0) {
                            logger.info(`  > Parent lesson ${figureJson.lessonId} not found. Adding PRIORITY download task and rescheduling this task.`);
                            this.addTask('download-lesson', { driveId: parentLessonFiles[0].id }, true);
                            
                            this.updateTaskStatus(task.id, 'pending', undefined, Date.now() + 2000);
                            
                            this.isProcessing = false;
                            this.processNext();
                            return;
                        } else {
                            throw new Error(`Orphaned figure: Parent lesson ${figureJson.lessonId} not found on Drive.`);
                        }
                    }
                    await dataService.saveDownloadedFigure(figureJson);
                    break;
                }
                case 'delete-remote':
                    await this.deleteRemoteFile(api, payload.driveId);
                    break;
                case 'delete-local': {
                    const { driveId: itemDriveId, type: itemType } = payload;
                    const storeName = itemType === 'lesson' ? 'lessons' : 'figures';
                    const db = await openBachataDB();
                    let item: Lesson | Figure | undefined;
                    if (itemType === 'lesson') item = await db.getFromIndex(storeName, 'driveId', itemDriveId);
                    else item = await db.getFromIndex(storeName, 'driveId', itemDriveId);

                    if (item) {
                        if (itemType === 'lesson') await dataService.deleteLesson(item.id, { skipTombstone: true });
                        else if (itemType === 'figure') await dataService.deleteFigure(item.id, { skipTombstone: true });
                    }
                    break;
                }
                case 'sync-deleted-log': {
                    const logFileMeta = (await api.listFiles(`name='${FILES.deletedItemsLog}'`))[0];
                    const remoteDeletedLog = logFileMeta ? (await api.downloadJson<string[]>(logFileMeta.id) || []) : [];
                    const localDeletedLog = await dataService.getDeletedDriveIds();
                    const mergedSet = new Set([...remoteDeletedLog, ...localDeletedLog]);

                    if (mergedSet.size > 0) {
                        logger.info('Syncing deleted items log. Merged count:', mergedSet.size);
                        await api.upload(JSON.stringify([...mergedSet]), { name: FILES.deletedItemsLog, mimeType: 'application/json' }, logFileMeta?.id);
                    }
                    for (const id of localDeletedLog) {
                        if (remoteDeletedLog.includes(id)) {
                            await dataService.removeDeletedDriveId(id);
                        }
                    }
                    break;
                }
            }
            logger.info(`✅ Task ${task.id} (${task.type}) completed successfully.`);
            this.removeTask(task.id);
        } catch (e: any) {
            logger.error(`❌ Task ${task.id} (${task.type}) failed:`, e);
            taskError = e.message || 'An unknown error occurred';
            this.updateTaskStatus(task.id, 'error', taskError);
        } finally {
            if (task.status !== 'pending') {
               logger.info(`--- Finished task: ${task.type} (${task.id}) ---`);
            }
            this.isProcessing = false;
            setTimeout(() => this.processNext(), 100);
        }
    }

    private updateTaskStatus = (taskId: string, status: SyncTask['status'], error?: string, newCreatedAt?: number) => {
        this.queue = this.queue.map(t =>
            t.id === taskId
                ? { ...t, status, error, createdAt: newCreatedAt ?? t.createdAt }
                : t
        );
        this.queue.sort((a,b) => a.createdAt - b.createdAt);
        this.notify();
    }
    
    private removeTask = (taskId: string) => {
        this.queue = this.queue.filter(t => t.id !== taskId);
        this.notify();
    }
}

export const syncQueueService = new SyncQueueService();

import type { DriveFile } from '../api/GoogleDriveApi';
import type { Lesson, Figure } from '../types';
import type { GroupingConfig } from './SettingsService';
import type { GoogleDriveService } from './GoogleDriveService';
import { googleDriveService } from './GoogleDriveService';
import { createLogger } from '../utils/logger';

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

// --- Types and Interface ---
export interface RemoteItem {
    externalId: string;
    name: string;
    modifiedTime: string;
}

export interface ExternalStorageService {
    listRemoteItems(type: 'lesson' | 'figure'): Promise<RemoteItem[]>;
    downloadLesson(lessonMetadata: RemoteItem): Promise<{ lesson: Lesson; video: Blob } | null>;
    downloadFigure(figureMetadata: RemoteItem): Promise<Figure | null>;
    uploadLesson(lesson: Lesson, videoFile: File): Promise<{ lessonMetadata: RemoteItem, videoMetadata: RemoteItem }>;
    uploadFigure(figure: Figure): Promise<RemoteItem>;
    deleteRemoteItemById(externalId: string): Promise<void>;
    getRemoteGroupingConfig(type: 'lesson' | 'figure'): Promise<GroupingConfig | null>;
    uploadGroupingConfig(type: 'lesson' | 'figure', config: GroupingConfig): Promise<void>;
}

// --- Implementation ---
const logger = createLogger('ExternalStorage');

class GoogleDriveExternalStorageServiceImpl implements ExternalStorageService {
    private driveService: GoogleDriveService;

    constructor(driveService: GoogleDriveService) {
        this.driveService = driveService;
    }
    
    private driveFileToRemoteItem(driveFile: DriveFile): RemoteItem {
        return {
            externalId: driveFile.id,
            name: driveFile.name,
            modifiedTime: driveFile.modifiedTime,
        };
    }

    async listRemoteItems(type: 'lesson' | 'figure'): Promise<RemoteItem[]> {
        const folderName = type === 'lesson' ? FOLDERS.lessons : FOLDERS.figures;
        const remoteFiles = await this.driveService.listFiles(`/${folderName}`);
        return remoteFiles.map(this.driveFileToRemoteItem);
    }

    async downloadLesson(lessonMetadata: RemoteItem): Promise<{ lesson: Lesson; video: Blob } | null> {
        const lessonData = await this.driveService.readJsonFileById<Lesson>(lessonMetadata.externalId);
        if (lessonData && lessonData.videoDriveId) {
            const videoBlob = await this.driveService.readBinaryFileById(lessonData.videoDriveId);
            if (videoBlob) {
                return { lesson: lessonData, video: videoBlob };
            }
        }
        logger.warn(`Failed to download full lesson content for ${lessonMetadata.name}`);
        return null;
    }

    async downloadFigure(figureMetadata: RemoteItem): Promise<Figure | null> {
        return this.driveService.readJsonFileById<Figure>(figureMetadata.externalId);
    }

    async uploadLesson(lesson: Lesson, videoFile: File): Promise<{ lessonMetadata: RemoteItem, videoMetadata: RemoteItem }> {
        const [lessonDriveFile, videoDriveFile] = await Promise.all([
            this.driveService.writeFile(`/${FOLDERS.lessons}/${lesson.id}.json`, JSON.stringify(lesson), 'application/json'),
            this.driveService.writeFile(`/${FOLDERS.videos}/${lesson.id}.mp4`, videoFile, 'video/mp4'),
        ]);
        return { 
            lessonMetadata: this.driveFileToRemoteItem(lessonDriveFile), 
            videoMetadata: this.driveFileToRemoteItem(videoDriveFile) 
        };
    }

    async uploadFigure(figure: Figure): Promise<RemoteItem> {
        const driveFile = await this.driveService.writeFile(`/${FOLDERS.figures}/${figure.id}.json`, JSON.stringify(figure), 'application/json');
        return this.driveFileToRemoteItem(driveFile);
    }

    async deleteRemoteItemById(externalId: string): Promise<void> {
        return this.driveService.deleteFileById(externalId);
    }
    
    async getRemoteGroupingConfig(type: 'lesson' | 'figure'): Promise<GroupingConfig | null> {
        const configFileName = type === 'lesson' ? FILES.lessonGroupingConfig : FILES.figureGroupingConfig;
        return this.driveService.readJsonFile<GroupingConfig>(`/${configFileName}`);
    }

    async uploadGroupingConfig(type: 'lesson' | 'figure', config: GroupingConfig): Promise<void> {
        const configFileName = type === 'lesson' ? FILES.lessonGroupingConfig : FILES.figureGroupingConfig;
        await this.driveService.writeFile(`/${configFileName}`, JSON.stringify(config), 'application/json');
    }
}

export const externalStorageService: ExternalStorageService = new GoogleDriveExternalStorageServiceImpl(googleDriveService);

import { createLogger } from '../utils/logger';
import type { DriveFile, GoogleDriveApi } from './GoogleDriveApi';

const logger = createLogger('GoogleDriveSyncApi');

// --- Types and Interface ---

export interface LocalFile {
    name: string;
    content: Blob;
    modifiedTime: string; // ISO 8601 string
}

export type SyncFileOutcome = 'uploaded' | 'downloaded' | 'in-sync' | 'conflict' | 'error';

export interface SyncFileResult {
    outcome: SyncFileOutcome;
    newTimestamp?: string;
    downloadedContent?: Blob;
    errorMessage?: string;
}

export interface SyncDirectoryPlan {
    filesToUpload: { name: string; modifiedTime: string }[];
    filesToDownload: { name: string; id: string; modifiedTime: string }[];
    filesToDelete: { id: string }[];
    filesInSync: { name: string }[];
}


export interface GoogleDriveSyncApi {
    syncFile(local: LocalFile, remoteFile: DriveFile | null, driveApi: GoogleDriveApi, parentFolderId: string): Promise<SyncFileResult>;
    planDirectorySync(localFiles: { name: string; modifiedTime: string }[], remoteFiles: DriveFile[], tombstoneIds: string[]): SyncDirectoryPlan;
}

// --- Implementation ---

export class GoogleDriveSyncApiImpl implements GoogleDriveSyncApi {
    
    public async syncFile(local: LocalFile, remoteFile: DriveFile | null, driveApi: GoogleDriveApi, parentFolderId: string): Promise<SyncFileResult> {
        const localTimestamp = new Date(local.modifiedTime).getTime();

        if (!remoteFile) {
            logger.info(`[syncFile:${local.name}] Remote does not exist. Uploading.`);
            const uploadedFile = await driveApi.upload(local.content, { name: local.name, mimeType: local.content.type, parents: [parentFolderId] });
            return { outcome: 'uploaded', newTimestamp: uploadedFile.modifiedTime };
        }

        const remoteTimestamp = new Date(remoteFile.modifiedTime).getTime();
        // FIX: Replaced non-existent 'logger.debug' with 'logger.info'.
        logger.info(`[syncFile:${local.name}] Comparing timestamps -> Local: ${local.modifiedTime} (${localTimestamp}), Remote: ${remoteFile.modifiedTime} (${remoteTimestamp})`);

        // Add a 1-second tolerance for timestamp comparisons to account for precision differences
        const timeDiff = localTimestamp - remoteTimestamp;

        if (timeDiff < -1000) { // Remote is significantly newer
            logger.info(`[syncFile:${local.name}] Remote is newer. Downloading.`);
            const downloadedContent = await driveApi.downloadBlob(remoteFile.id);
            if (!downloadedContent) {
                return { outcome: 'error', errorMessage: 'Failed to download remote file content.' };
            }
            return { outcome: 'downloaded', downloadedContent, newTimestamp: remoteFile.modifiedTime };
        } else if (timeDiff > 1000) { // Local is significantly newer
            logger.info(`[syncFile:${local.name}] Local is newer. Uploading.`);
            const updatedFile = await driveApi.upload(local.content, { name: local.name, mimeType: local.content.type }, remoteFile.id);
            return { outcome: 'uploaded', newTimestamp: updatedFile.modifiedTime };
        } else {
            logger.info(`[syncFile:${local.name}] Timestamps match. In sync.`);
            return { outcome: 'in-sync' };
        }
    }
    
    public planDirectorySync(
        localFiles: { name: string; modifiedTime: string }[],
        remoteFiles: DriveFile[],
        tombstoneIds: string[]
    ): SyncDirectoryPlan {
        logger.info(`[planDirectorySync] Planning sync for ${localFiles.length} local files, ${remoteFiles.length} remote files, and ${tombstoneIds.length} tombstones.`);
        const plan: SyncDirectoryPlan = {
            filesToUpload: [],
            filesToDownload: [],
            filesToDelete: [],
            filesInSync: [],
        };
        
        const localFileMap = new Map(localFiles.map(f => [f.name, f]));
        const remoteFileMap = new Map(remoteFiles.map(f => [f.name, f]));
        const tombstoneSet = new Set(tombstoneIds);

        // Process remote files
        for (const remoteFile of remoteFiles) {
             if (tombstoneSet.has(remoteFile.id)) {
                // FIX: Replaced non-existent 'logger.debug' with 'logger.info'.
                logger.info(`[planDirectorySync] Remote file ${remoteFile.name} (id: ${remoteFile.id}) is in tombstone list. Planning deletion.`);
                plan.filesToDelete.push({ id: remoteFile.id });
                continue;
            }
            
            const localFile = localFileMap.get(remoteFile.name);
            if (!localFile) {
                // FIX: Replaced non-existent 'logger.debug' with 'logger.info'.
                logger.info(`[planDirectorySync] Remote file ${remoteFile.name} not found locally. Planning download.`);
                plan.filesToDownload.push({ name: remoteFile.name, id: remoteFile.id, modifiedTime: remoteFile.modifiedTime });
            }
        }
        
        // Process local files
        for (const localFile of localFiles) {
            const remoteFile = remoteFileMap.get(localFile.name);
            if (!remoteFile) {
                // FIX: Replaced non-existent 'logger.debug' with 'logger.info'.
                logger.info(`[planDirectorySync] Local file ${localFile.name} not found remotely. Planning upload.`);
                plan.filesToUpload.push({ name: localFile.name, modifiedTime: localFile.modifiedTime });
            } else {
                // File exists in both, compare timestamps
                const localTimestamp = new Date(localFile.modifiedTime).getTime();
                const remoteTimestamp = new Date(remoteFile.modifiedTime).getTime();
                const timeDiff = localTimestamp - remoteTimestamp;

                // FIX: Replaced non-existent 'logger.debug' with 'logger.info'.
                logger.info(`[planDirectorySync] Comparing ${localFile.name} -> Local: ${localTimestamp}, Remote: ${remoteTimestamp}`);

                if (timeDiff > 1000) { // Local is significantly newer
                    // FIX: Replaced non-existent 'logger.debug' with 'logger.info'.
                    logger.info(`[planDirectorySync] -> Local is newer. Planning upload.`);
                    plan.filesToUpload.push({ name: localFile.name, modifiedTime: localFile.modifiedTime });
                } else if (timeDiff < -1000) { // Remote is significantly newer
                    // FIX: Replaced non-existent 'logger.debug' with 'logger.info'.
                    logger.info(`[planDirectorySync] -> Remote is newer. Planning download.`);
                    plan.filesToDownload.push({ name: remoteFile.name, id: remoteFile.id, modifiedTime: remoteFile.modifiedTime });
                } else {
                    // FIX: Replaced non-existent 'logger.debug' with 'logger.info'.
                    logger.info(`[planDirectorySync] -> In sync.`);
                    plan.filesInSync.push({ name: localFile.name });
                }
            }
        }
        logger.info(`[planDirectorySync] Plan complete: ${plan.filesToUpload.length} uploads, ${plan.filesToDownload.length} downloads, ${plan.filesToDelete.length} deletions.`);
        return plan;
    }
}

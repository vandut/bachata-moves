import { createLogger } from '../utils/logger';

const logger = createLogger('DriveAPI');

export const FOLDERS = {
    lessons: 'lessons',
    figures: 'figures',
    videos: 'videos'
};

export const FILES = {
    lessonGroupingConfig: 'lesson_grouping_config.json',
    figureGroupingConfig: 'figure_grouping_config.json',
    settings: 'settings.json',
    deletedItemsLog: 'deleted_items_log.json',
};

export interface DriveFile {
    id: string;
    name: string;
    modifiedTime: string;
    parents: string[];
    trashed?: boolean;
}

export class GoogleDriveApi {
    private readonly accessToken: string;
    private readonly baseUrl = 'https://www.googleapis.com/drive/v3';
    private readonly uploadBaseUrl = 'https://www.googleapis.com/upload/drive/v3';
    private readonly apiTimeout = 15000; // 15 seconds

    constructor(token: string) {
        this.accessToken = token;
    }

    private get headers() {
        return { 'Authorization': `Bearer ${this.accessToken}` };
    }

    private async fetchWithTimeout(url: RequestInfo, options: RequestInit, timeout?: number): Promise<Response> {
        const controller = new AbortController();
        const finalTimeout = timeout || this.apiTimeout;
        const timeoutId = setTimeout(() => {
            const urlString = typeof url === 'string' ? url : (url as Request).url;
            logger.warn(`Request to ${urlString} timed out after ${finalTimeout}ms.`);
            controller.abort();
        }, finalTimeout);

        try {
            const response = await fetch(url, {
                cache: 'no-cache', // Prevent browser from returning stale data
                ...options,
                signal: controller.signal,
            });
            return response;
        } catch (e: any) {
            if (e.name === 'AbortError') {
                throw new Error('The request to Google Drive timed out. This may be due to a network issue or a misconfigured service worker.');
            }
            throw e;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async listFiles(query: string, pageSize: number = 100): Promise<DriveFile[]> {
        logger.info(`Listing files with query: "${query}"`);
        let allFiles: DriveFile[] = [];
        let pageToken: string | undefined = undefined;

        do {
            const queryParams = new URLSearchParams({
                spaces: 'appDataFolder',
                fields: 'nextPageToken, files(id, name, modifiedTime, parents)',
                q: query,
                pageSize: String(pageSize),
            });

            if (pageToken) {
                queryParams.set('pageToken', pageToken);
            }
            
            const response = await this.fetchWithTimeout(`${this.baseUrl}/files?${queryParams.toString()}`, {
                headers: this.headers,
            });

            if (!response.ok) throw new Error(`Failed to list files: ${await response.text()}`);
            const data = await response.json();

            if (data.files) {
                allFiles = allFiles.concat(data.files);
            }
            pageToken = data.nextPageToken;

        } while (pageToken);
        logger.info(` > Found ${allFiles.length} files for query "${query}".`);
        return allFiles;
    }

    async findOrCreateFolder(name: string, parentId: string = 'appDataFolder'): Promise<string> {
        logger.info(`Finding or creating folder: "${name}"`);
        const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
        const existing = await this.listFiles(query);
        if (existing.length > 0) {
            logger.info(` > Folder "${name}" already exists with id ${existing[0].id}.`);
            return existing[0].id;
        }

        logger.info(` > Folder "${name}" not found. Creating...`);
        const metadata = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        };
        const response = await this.fetchWithTimeout(`${this.baseUrl}/files`, {
            method: 'POST',
            headers: { ...this.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
        if (!response.ok) throw new Error('Failed to create folder');
        const file = await response.json();
        logger.info(` > Created folder "${name}" with id ${file.id}.`);
        return file.id;
    }
    
    async upload(content: Blob | string, metadata: { name: string, mimeType: string, parents?: string[] }, fileId?: string): Promise<DriveFile> {
        const action = fileId ? 'Updating' : 'Uploading';
        logger.info(`${action} file: "${metadata.name}"`);
        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const close_delim = `\r\n--${boundary}--`;
      
        const requestMetadata = { ...metadata };
        if (fileId) {
            delete requestMetadata.parents;
        } else if (!requestMetadata.parents) {
            requestMetadata.parents = ['appDataFolder'];
        }
        
        const queryParams = new URLSearchParams({
            uploadType: 'multipart',
            fields: 'id,name,modifiedTime,parents' // Specify the fields we want in the response.
        });
        
        const uploadUrl = fileId 
            ? `${this.uploadBaseUrl}/files/${fileId}?${queryParams.toString()}` 
            : `${this.uploadBaseUrl}/files?${queryParams.toString()}`;
        
        const body = content instanceof Blob ? new Blob([
                delimiter,
                'Content-Type: application/json\r\n\r\n',
                JSON.stringify(requestMetadata),
                delimiter,
                `Content-Type: ${metadata.mimeType}\r\n\r\n`,
                content,
                close_delim
            ]) : (
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                JSON.stringify(requestMetadata) +
                delimiter +
                `Content-Type: ${metadata.mimeType}\r\n\r\n` +
                content +
                close_delim
            );
        
        const response = await this.fetchWithTimeout(uploadUrl, {
            method: fileId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': `multipart/related; boundary="${boundary}"`, ...this.headers },
            body: body
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`Upload failed for "${metadata.name}" with status ${response.status}:`, errorText);
            throw new Error(`Failed to upload file '${metadata.name}': ${errorText}`);
        }
        const fileData = await response.json();
        logger.info(` > Successfully ${action.toLowerCase()}d file "${metadata.name}". New Drive ID: ${fileData.id}`);
        return fileData;
    }
    
    async downloadJson<T>(fileId: string): Promise<T | null> {
        logger.info(`Downloading JSON content for file: ${fileId}`);
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/files/${fileId}?alt=media`, { headers: this.headers });
            if (!response.ok) {
                 if (response.status === 404) {
                    logger.warn(` > JSON file ${fileId} not found (404).`);
                    return null;
                 }
                 throw new Error(`Failed to download JSON file ${fileId}`);
            }
            return response.json();
        } catch (e) {
            logger.error(`Error downloading JSON file ${fileId}:`, e);
            if (e instanceof Error && e.message.includes('timed out')) {
                throw e;
            }
            return null;
        }
    }

    async downloadBlob(fileId: string): Promise<Blob | null> {
        logger.info(`Downloading blob content for file: ${fileId}`);
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/files/${fileId}?alt=media`, { headers: this.headers });
            if (!response.ok) {
                 if (response.status === 404) {
                    logger.warn(` > Blob file ${fileId} not found (404).`);
                    return null;
                 }
                 throw new Error(`Failed to download blob file ${fileId}`);
            }
            return response.blob();
        } catch (e) {
            logger.error(`Error downloading blob file ${fileId}:`, e);
            if (e instanceof Error && e.message.includes('timed out')) {
                throw e;
            }
            return null;
        }
    }

    async deleteFile(fileId: string): Promise<void> {
        logger.info(`Deleting file from Drive: ${fileId}`);
        const response = await this.fetchWithTimeout(`${this.baseUrl}/files/${fileId}`, {
            method: 'DELETE',
            headers: this.headers
        });
        if (!response.ok && response.status !== 404) {
             throw new Error(`Failed to delete file ${fileId}`);
        }
        logger.info(` > Successfully deleted file ${fileId} (or it was already gone).`);
    }

    async getFile(fileId: string): Promise<DriveFile | null> {
        logger.info(`Getting metadata for file: ${fileId}`);
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/files/${fileId}?fields=id,name,modifiedTime,parents,trashed`, {
                headers: this.headers,
            });
            if (!response.ok) {
                if (response.status === 404) {
                    logger.warn(` > Metadata for file ${fileId} not found (404).`);
                    return null;
                }
                throw new Error(`Failed to get file metadata: ${await response.text()}`);
            }
            return await response.json();
        } catch (e) {
            logger.error(`Error getting file metadata for ${fileId}:`, e);
            if (e instanceof Error && e.message.includes('timed out')) {
                throw e;
            }
            return null;
        }
    }
}
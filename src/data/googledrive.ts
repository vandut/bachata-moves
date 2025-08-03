


export const FOLDERS = {
    lessons: 'lessons',
    figures: 'figures',
    videos: 'videos'
};

export const FILES = {
    lessonCategories: 'lesson_categories.json',
    figureCategories: 'figure_categories.json',
    settings: 'settings.json'
};

export interface DriveFile {
    id: string;
    name: string;
    modifiedTime: string;
    parents: string[];
}

export class GoogleDriveApi {
    private readonly accessToken: string;
    private readonly baseUrl = 'https://www.googleapis.com/drive/v3';
    private readonly uploadBaseUrl = 'https://www.googleapis.com/upload/drive/v3';

    constructor(token: string) {
        this.accessToken = token;
    }

    private get headers() {
        return { 'Authorization': `Bearer ${this.accessToken}` };
    }

    async listFiles(query: string): Promise<DriveFile[]> {
        const queryParams = new URLSearchParams({
            spaces: 'appDataFolder',
            fields: 'files(id, name, modifiedTime, parents)',
            q: query,
        });
        const response = await fetch(`${this.baseUrl}/files?${queryParams.toString()}`, {
            headers: this.headers,
        });
        if (!response.ok) throw new Error(`Failed to list files: ${await response.text()}`);
        const data = await response.json();
        return data.files || [];
    }

    async findOrCreateFolder(name: string, parentId: string = 'appDataFolder'): Promise<string> {
        const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
        const existing = await this.listFiles(query);
        if (existing.length > 0) {
            return existing[0].id;
        }

        const metadata = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        };
        const response = await fetch(`${this.baseUrl}/files`, {
            method: 'POST',
            headers: { ...this.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
        if (!response.ok) throw new Error('Failed to create folder');
        const file = await response.json();
        return file.id;
    }
    
    async upload(content: Blob | string, metadata: { name: string, mimeType: string, parents?: string[] }, fileId?: string): Promise<DriveFile> {
        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const close_delim = `\r\n--${boundary}--`;
      
        // If we are updating a file (fileId exists), we must not include the 'parents' field.
        const requestMetadata = { ...metadata };
        if (fileId) {
            delete requestMetadata.parents;
        }

        const uploadUrl = fileId 
            ? `${this.uploadBaseUrl}/files/${fileId}?uploadType=multipart` 
            : `${this.uploadBaseUrl}/files?uploadType=multipart`;
        
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
        
        const response = await fetch(uploadUrl, {
            method: fileId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': `multipart/related; boundary="${boundary}"`, ...this.headers },
            body: body
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Upload failed with body:', errorText);
            throw new Error(`Failed to upload file '${metadata.name}': ${errorText}`);
        }
        return await response.json();
    }
    
    async downloadJson<T>(fileId: string): Promise<T | null> {
        try {
            const response = await fetch(`${this.baseUrl}/files/${fileId}?alt=media`, { headers: this.headers });
            if (!response.ok) {
                 if (response.status === 404) return null;
                 throw new Error(`Failed to download JSON file ${fileId}`);
            }
            return response.json();
        } catch (e) {
            console.error(`Error downloading JSON file ${fileId}:`, e);
            return null;
        }
    }

    async downloadBlob(fileId: string): Promise<Blob | null> {
        try {
            const response = await fetch(`${this.baseUrl}/files/${fileId}?alt=media`, { headers: this.headers });
            if (!response.ok) {
                 if (response.status === 404) return null;
                 throw new Error(`Failed to download blob file ${fileId}`);
            }
            return response.blob();
        } catch (e) {
            console.error(`Error downloading blob file ${fileId}:`, e);
            return null;
        }
    }

    async deleteFile(fileId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
            method: 'DELETE',
            headers: this.headers
        });
        if (!response.ok && response.status !== 404) {
             throw new Error(`Failed to delete file ${fileId}`);
        }
    }
}
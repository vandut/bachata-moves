import type { UserProfile, TokenResponse, GoogleIdentityAPI } from '../api/GoogleIdentityAPI';
import { GoogleIdentityApiImpl } from '../api/GoogleIdentityAPI';
import type { DriveFile, GoogleDriveApi } from '../api/GoogleDriveApi';
import { GoogleDriveApiImpl } from '../api/GoogleDriveApi';
import { GOOGLE_CLIENT_ID } from '../../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('GoogleDriveService');
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const LOCAL_STORAGE_TOKEN_KEY = 'google_access_token';
const LOCAL_STORAGE_PROFILE_KEY = 'google_user_profile';
const SESSION_STORAGE_ERROR_KEY = 'google_sync_error';

// --- Types and Interface ---

export interface AuthState {
  isGisReady: boolean;
  isSignedIn: boolean;
  userProfile: UserProfile | null;
  error: string | null;
}

export type AuthStateListener = (state: AuthState) => void;

export type GoogleDriveApiFactory = (token: string) => GoogleDriveApi;

export interface GoogleDriveService {
  initialize(): Promise<void>;
  onAuthStateChanged(listener: AuthStateListener): () => void;
  getAuthState(): AuthState;
  signIn(): void;
  signOut(): void;
  listFiles(folderPath: string): Promise<DriveFile[]>;
  readJsonFile<T>(filePath: string): Promise<T | null>;
  readBinaryFile(filePath: string): Promise<Blob | null>;
  readJsonFileById<T>(fileId: string): Promise<T | null>;
  readBinaryFileById(fileId: string): Promise<Blob | null>;
  writeFile(filePath: string, content: string | Blob, mimeType: string): Promise<DriveFile>;
  deleteFile(filePath: string): Promise<void>;
  deleteFileById(fileId: string): Promise<void>;
}

// --- Implementation ---

class GoogleDriveServiceImpl implements GoogleDriveService {
  private identityService: GoogleIdentityAPI;
  private driveApiFactory: GoogleDriveApiFactory;
  private api: GoogleDriveApi | null = null;
  private listeners: Set<AuthStateListener> = new Set();
  private folderIdCache: Map<string, string> = new Map();
  private state: AuthState = {
    isGisReady: false,
    isSignedIn: false,
    userProfile: null,
    error: sessionStorage.getItem(SESSION_STORAGE_ERROR_KEY),
  };

  constructor(identityService: GoogleIdentityAPI, driveApiFactory: GoogleDriveApiFactory) {
    this.identityService = identityService;
    this.driveApiFactory = driveApiFactory;
    this.hydrateSession();
  }

  // --- Public Methods ---

  public async initialize(): Promise<void> {
    if (this.state.isGisReady) return;
    try {
      await this.identityService.initialize(GOOGLE_CLIENT_ID, SCOPES, this.handleTokenResponse);
      this.setState({ isGisReady: true });
    } catch (e: any) {
      this.setState({ error: `Google Auth init failed: ${e.message}` });
    }
  }

  public onAuthStateChanged = (listener: AuthStateListener): () => void => {
    this.listeners.add(listener);
    // Immediately invoke with current state
    listener(this.state);
    return () => this.listeners.delete(listener);
  };

  public getAuthState = (): AuthState => this.state;

  public signIn = (): void => {
    if (!this.state.isGisReady) {
      this.setState({ error: 'Google Auth is not ready.' });
      return;
    }
    this.setState({ error: null });
    sessionStorage.removeItem(SESSION_STORAGE_ERROR_KEY);
    logger.info('Requesting access token...');
    this.identityService.requestToken();
  };

  public signOut = (): void => this.handleSignOut(false);

  public async listFiles(folderPath: string): Promise<DriveFile[]> {
    if (!this.api) throw new Error("Not signed in.");
    const parentFolderId = await this._getFolderId(folderPath, false);
    if (!parentFolderId) return [];
    return this.api.listFiles(`'${parentFolderId}' in parents and trashed=false`);
  }
  
  public async readJsonFile<T>(filePath: string): Promise<T | null> {
    if (!this.api) throw new Error("Not signed in.");
    const file = await this._getFile(filePath);
    if (!file) return null;
    return this.api.downloadJson<T>(file.id);
  }

  public async readBinaryFile(filePath: string): Promise<Blob | null> {
    if (!this.api) throw new Error("Not signed in.");
    const file = await this._getFile(filePath);
    if (!file) return null;
    return this.api.downloadBlob(file.id);
  }

  public async readJsonFileById<T>(fileId: string): Promise<T | null> {
    if (!this.api) throw new Error("Not signed in.");
    return this.api.downloadJson<T>(fileId);
  }

  public async readBinaryFileById(fileId: string): Promise<Blob | null> {
    if (!this.api) throw new Error("Not signed in.");
    return this.api.downloadBlob(fileId);
  }

  public async writeFile(filePath: string, content: string | Blob, mimeType: string): Promise<DriveFile> {
    if (!this.api) throw new Error("Not signed in.");
    const { folderPath, fileName } = this._splitPath(filePath);
    const parentFolderId = await this._getFolderId(folderPath, true);
    if (!parentFolderId) throw new Error(`Could not find or create folder for path: ${folderPath}`);

    const existingFile = await this._getFile(filePath);
    return this.api.upload(content, { name: fileName, mimeType, parents: [parentFolderId] }, existingFile?.id);
  }

  public async deleteFile(filePath: string): Promise<void> {
    if (!this.api) throw new Error("Not signed in.");
    const file = await this._getFile(filePath);
    if (file) {
      await this.api.deleteFile(file.id);
    }
  }

  public async deleteFileById(fileId: string): Promise<void> {
    if (!this.api) throw new Error("Not signed in.");
    await this.api.deleteFile(fileId);
  }
  
  // --- Private Methods ---

  private setState(updates: Partial<AuthState>): void {
    this.state = { ...this.state, ...updates };
    if (updates.error) {
        sessionStorage.setItem(SESSION_STORAGE_ERROR_KEY, updates.error);
    }
    this.listeners.forEach(listener => listener(this.state));
  }
  
  private handleTokenResponse = async (tokenResponse: TokenResponse): Promise<void> => {
    if (tokenResponse.error) {
      this.setState({ error: `Auth Error: ${tokenResponse.error_description || tokenResponse.error}`, isSignedIn: false });
      return;
    }
    const token = tokenResponse.access_token;
    logger.info('Received new access token.');
    localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, token);
    this.api = this.driveApiFactory(token);
    
    try {
      const profile = await this.identityService.getUserProfile(token);
      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(profile));
      this.setState({ isSignedIn: true, userProfile: profile, error: null });
      sessionStorage.removeItem(SESSION_STORAGE_ERROR_KEY);
    } catch (e: any) {
      logger.error("Error fetching user profile after sign-in", e);
      this.setState({ error: `Could not fetch user profile: ${e.message}` });
    }
  };

  private handleSignOut = (isExpired: boolean): void => {
    const token = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    if (token && !isExpired) {
      this.identityService.revokeToken(token);
    }
    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
    localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
    this.api = null;
    this.folderIdCache.clear();
    const error = isExpired ? 'Your session has expired. Please sign in again.' : null;
    this.setState({ isSignedIn: false, userProfile: null, error });
    logger.info('User signed out.');
  };
  
  private hydrateSession = (): void => {
    const storedToken = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    const storedProfileJSON = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
    if (!storedToken || !storedProfileJSON) return;
    
    this.api = this.driveApiFactory(storedToken);
    
    // Optimistically set signed-in state
    try {
        const profile = JSON.parse(storedProfileJSON);
        this.setState({ isSignedIn: true, userProfile: profile });
    } catch(e) { /* ignore */ }
    
    // Validate token in the background
    this.identityService.getUserProfile(storedToken).catch(() => {
        logger.warn('Stored token is expired or invalid. Signing out.');
        this.handleSignOut(true);
    });
  }

  private _splitPath(filePath: string): { folderPath: string, fileName: string } {
    const parts = filePath.replace(/^\/|\/$/g, '').split('/');
    const fileName = parts.pop() || '';
    const folderPath = `/${parts.join('/')}`;
    return { folderPath, fileName };
  }

  private async _getFolderId(folderPath: string, createIfNotExists: boolean): Promise<string | null> {
    if (this.folderIdCache.has(folderPath)) {
      return this.folderIdCache.get(folderPath)!;
    }
    if (!this.api) throw new Error("Not signed in.");
    
    const segments = folderPath.replace(/^\/|\/$/g, '').split('/').filter(s => s);
    let parentId = 'appDataFolder';

    for (const segment of segments) {
      const currentPath = this.folderIdCache.get(parentId) + '/' + segment;
      if (this.folderIdCache.has(currentPath)) {
        parentId = this.folderIdCache.get(currentPath)!;
        continue;
      }
      
      const query = `name='${segment}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
      const existing = await this.api.listFiles(query);

      if (existing.length > 0) {
        parentId = existing[0].id;
      } else {
        if (!createIfNotExists) return null;
        parentId = await this.api.findOrCreateFolder(segment, parentId);
      }
      this.folderIdCache.set(currentPath, parentId);
    }

    this.folderIdCache.set(folderPath, parentId);
    return parentId;
  }
  
  private async _getFile(filePath: string): Promise<DriveFile | null> {
    if (!this.api) throw new Error("Not signed in.");
    const { folderPath, fileName } = this._splitPath(filePath);
    const parentFolderId = await this._getFolderId(folderPath, false);
    if (!parentFolderId) return null;
    
    const files = await this.api.listFiles(`name='${fileName}' and '${parentFolderId}' in parents and trashed=false`);
    return files.length > 0 ? files[0] : null;
  }
}

// --- Singleton Instance ---
const identityService = new GoogleIdentityApiImpl();
const driveApiFactory = (token: string) => new GoogleDriveApiImpl(token);
export const googleDriveService: GoogleDriveService = new GoogleDriveServiceImpl(
    identityService,
    driveApiFactory
);

import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef, useMemo } from 'react';
import { GOOGLE_CLIENT_ID } from '../../config';
import { GoogleDriveApi, DriveFile, FOLDERS, FILES } from '../data/googledrive';
import { dataService } from '../data/service';
import type { AppSettings, Figure, Lesson, SyncTask, SyncTaskType, FigureCategory, LessonCategory } from '../types';
import { openBachataDB } from '../data/indexdb';
import { createLogger } from '../utils/logger';
import { syncQueueService } from '../data/syncQueueService';

const logger = createLogger('Sync');

// TypeScript definitions for Google Identity Services
declare global {
  interface Window {
    google: any; 
  }
}

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const LOCAL_STORAGE_TOKEN_KEY = 'google_access_token';
const LOCAL_STORAGE_PROFILE_KEY = 'google_user_profile';

export interface UserProfile {
  email: string;
  name: string;
  imageUrl: string;
}

interface GoogleDriveContextType {
  isGisReady: boolean;
  isSignedIn: boolean;
  userProfile: UserProfile | null;
  syncError: string | null;
  signIn: () => void;
  signOut: () => void;
  // Queue related
  syncQueue: SyncTask[];
  isSyncActive: boolean;
  initiateSync: (type: 'lesson' | 'figure') => void;
  // Direct, non-queued operations
  fetchLatestSettingsForEditing: (type: 'lesson' | 'figure') => Promise<void>;
  forceUploadSettingsAndCategories: (type: 'lesson' | 'figure') => Promise<void>;
  fetchLatestItemForEditing: <T extends Lesson | Figure>(itemId: string, type: 'lesson' | 'figure') => Promise<T>;
  forceAddItem: (itemData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'> | Omit<Figure, 'id'| 'lessonId'>, type: 'lesson' | 'figure', options?: { videoFile?: File, lessonId?: string }) => Promise<Lesson | Figure>;
  forceUpdateItem: (itemId: string, itemData: Partial<Omit<Lesson, 'id'>> | Partial<Omit<Figure, 'id'>>, type: 'lesson' | 'figure') => Promise<Lesson | Figure>;
  forceDeleteItem: (item: Lesson | Figure) => Promise<void>;
}

const GoogleDriveContext = createContext<GoogleDriveContextType | undefined>(undefined);

export const GoogleDriveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isGisReady, setIsGisReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  
  const [syncQueue, setSyncQueue] = useState<SyncTask[]>(() => syncQueueService.getQueue());
  const isSyncActive = useMemo(() => {
    return syncQueue.some(task => task.status === 'in-progress' || task.status === 'pending');
  }, [syncQueue]);

  const apiRef = useRef<GoogleDriveApi | null>(null);

  // Effect to subscribe to the sync queue service for UI updates
  useEffect(() => {
    const handleUpdate = () => {
        setSyncQueue([...syncQueueService.getQueue()]);
    };
    const unsubscribe = syncQueueService.subscribe(handleUpdate);
    return () => unsubscribe();
  }, []);

  const initiateSync = useCallback((type: 'lesson' | 'figure') => {
    if (!apiRef.current) {
      return;
    }
    logger.info(`Queueing gallery sync for: ${type}`);
    syncQueueService.addTask('sync-gallery', { type });
  }, []);

  // --- START: Truly Blocking Operations ---
  const forceAddItem = useCallback(async (
    itemData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'> | Omit<Figure, 'id'| 'lessonId'>, 
    type: 'lesson' | 'figure', 
    options?: { videoFile?: File, lessonId?: string }
  ): Promise<Lesson | Figure> => {
      logger.info(`--- UI-BLOCK: Forcing ADD for ${type} ---`);
      
      let newItem: Lesson | Figure;

      if (type === 'lesson') {
          if (!options?.videoFile) throw new Error("Video file is required to add a lesson.");
          // 1. Add locally first to get an ID
          newItem = await dataService.addLesson(itemData as Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, options.videoFile);
          logger.info(' > Lesson added locally:', newItem.id);

          // 2. If signed in, upload to Drive
          const api = apiRef.current;
          if (api) {
              logger.info(' > Uploading to Google Drive...');
              // The upload function will update the item in IndexedDB with drive IDs
              newItem = await syncQueueService.uploadLesson(api, newItem.id);
              logger.info('✅ Force add complete.');
          }
      } else { // type === 'figure'
          if (!options?.lessonId) throw new Error("Lesson ID is required to add a figure.");
          // 1. Add locally first
          newItem = await dataService.addFigure(options.lessonId, itemData as Omit<Figure, 'id' | 'lessonId'>);
          logger.info(' > Figure added locally:', newItem.id);
          
          // 2. If signed in, upload to Drive
          const api = apiRef.current;
          if (api) {
              logger.info(' > Uploading to Google Drive...');
              newItem = await syncQueueService.uploadFigure(api, newItem.id);
              logger.info('✅ Force add complete.');
          }
      }
      return newItem;

  }, []);

  const forceUpdateItem = useCallback(async (
    itemId: string, 
    itemData: Partial<Omit<Lesson, 'id'>> | Partial<Omit<Figure, 'id'>>, 
    type: 'lesson' | 'figure'
  ): Promise<Lesson | Figure> => {
      logger.info(`--- UI-BLOCK: Forcing UPDATE for ${type} ${itemId} ---`);
      
      let updatedItem: Lesson | Figure;

      // 1. Update locally
      if (type === 'lesson') {
          updatedItem = await dataService.updateLesson(itemId, itemData as Partial<Omit<Lesson, 'id'>>);
      } else {
          updatedItem = await dataService.updateFigure(itemId, itemData as Partial<Omit<Figure, 'id'>>);
      }
      logger.info(' > Item updated locally.');

      // 2. If signed in, upload to Drive
      const api = apiRef.current;
      if (api) {
          logger.info(' > Uploading to Google Drive...');
          if (type === 'lesson') {
              updatedItem = await syncQueueService.uploadLesson(api, updatedItem.id);
          } else {
              updatedItem = await syncQueueService.uploadFigure(api, updatedItem.id);
          }
          logger.info('✅ Force update complete.');
      }

      return updatedItem;

  }, []);

  const forceDeleteItem = useCallback(async (item: Lesson | Figure) => {
      const itemType = 'uploadDate' in item ? 'lesson' : 'figure';
      logger.info(`--- UI-BLOCK: Forcing DELETE for ${itemType} ${item.id} ---`);
      
      const api = apiRef.current;
      const db = await openBachataDB();

      // If deleting a lesson, first recursively delete all its child figures.
      if (itemType === 'lesson') {
          logger.info(` > It's a lesson. Finding child figures to delete recursively...`);
          const allChildFigures = await db.getAllFromIndex('figures', 'lessonId', item.id);
          if (allChildFigures.length > 0) {
              // NOTE: This relies on forceDeleteItem being a stable function from useCallback.
              const figureDeletePromises = allChildFigures.map(fig => forceDeleteItem(fig));
              await Promise.all(figureDeletePromises);
              logger.info(` > Finished deleting ${allChildFigures.length} child figures recursively.`);
          }
      }

      // Re-fetch the item from the DB to ensure we have the latest driveId, etc.
      const freshItem = itemType === 'lesson' 
          ? await db.get('lessons', item.id)
          : await db.get('figures', item.id);

      if (!freshItem) {
          logger.warn(`Item ${item.id} not found in DB for deletion. It might have been already deleted.`);
          return;
      }
      
      // Delete the main item from remote.
      if (api && freshItem.driveId) {
          logger.info(` > Found driveId: ${freshItem.driveId}. Deleting from remote...`);
          await syncQueueService.deleteRemoteFile(api, freshItem.driveId);
          if ('videoDriveId' in freshItem && freshItem.videoDriveId) {
              logger.info(` > Found videoDriveId: ${freshItem.videoDriveId}. Deleting from remote...`);
              await syncQueueService.deleteRemoteFile(api, freshItem.videoDriveId);
          }
          logger.info(` > Remote file(s) for ${freshItem.id} deleted.`);
      } else {
          logger.warn(` > No driveId found for item ${freshItem.id} or not signed in. Skipping remote delete.`);
      }
      
      // Delete from local DB. For lessons, this will also try to delete child figures locally, which is fine as they should already be gone.
      if (itemType === 'lesson') {
          await dataService.deleteLesson(freshItem.id, { skipTombstone: true });
      } else {
          await dataService.deleteFigure(freshItem.id, { skipTombstone: true });
      }
      logger.info(`✅ Force delete complete for ${itemType} ${item.id}.`);

  }, []);
  // --- END: Truly Blocking Operations ---


  // --- Settings and Categories Sync ---
  const fetchLatestSettingsForEditing = useCallback(async (type: 'lesson' | 'figure') => {
      if (!apiRef.current) return;
      const api = apiRef.current;
      const db = await openBachataDB();
      logger.info(`--- UI-BLOCK: Fetching latest settings for ${type} category editor... ---`);
  
      try {
          const settingsFileName = FILES.settings;
          const categoriesFileName = type === 'lesson' ? FILES.lessonCategories : FILES.figureCategories;
      
          const [remoteSettingsFile] = await api.listFiles(`name='${settingsFileName}'`);
          const [remoteCategoriesFile] = await api.listFiles(`name='${categoriesFileName}'`);
          
          const localSyncSettings: any = await db.get('settings', 'sync-settings');
      
          if (remoteSettingsFile && (!localSyncSettings?.modifiedTime || new Date(remoteSettingsFile.modifiedTime).getTime() > new Date(localSyncSettings.modifiedTime).getTime())) {
              logger.info('Remote settings are newer. Downloading...');
              const remoteSettings = await api.downloadJson<any>(remoteSettingsFile.id);
              if (remoteSettings) {
                  await db.put('settings', remoteSettings, 'sync-settings');
                  logger.info('✅ Synced settings from remote.');
              }
          } else {
               logger.info('Local settings are up-to-date.');
          }
      
          if (remoteCategoriesFile) {
              logger.info(`Remote categories file found for ${type}. Downloading...`);
              const remoteCategories = await api.downloadJson<(LessonCategory | FigureCategory)[]>(remoteCategoriesFile.id);
              if (remoteCategories) {
                  const storeName = type === 'lesson' ? 'lesson_categories' : 'figure_categories';
                  const tx = db.transaction(storeName, 'readwrite');
                  await tx.store.clear();
                  for (const cat of remoteCategories) {
                      await tx.store.put(cat);
                  }
                  await tx.done;
                  logger.info(`✅ Synced ${remoteCategories.length} categories from remote.`);
              }
          }
      } catch (e) {
        logger.error('Failed to fetch latest settings for editing', e);
      }
  }, []);
  
  const forceUploadSettingsAndCategories = useCallback(async (type: 'lesson' | 'figure') => {
      if (!apiRef.current) return;
      const api = apiRef.current;
      const db = await openBachataDB();
      logger.info(`--- UI-BLOCK: Forcing UPLOAD of settings & categories for ${type} ---`);
  
      try {
          const settingsFileName = FILES.settings;
          const categoriesFileName = type === 'lesson' ? FILES.lessonCategories : FILES.figureCategories;
          
          const localSyncSettings: any = await db.get('settings', 'sync-settings');
          if (localSyncSettings) {
              const [existingSettingsFile] = await api.listFiles(`name='${settingsFileName}'`);
              logger.info('Uploading local settings...');
              
              const settingsDriveFile = await api.upload(JSON.stringify(localSyncSettings), { name: settingsFileName, mimeType: 'application/json' }, existingSettingsFile?.id);
              
              // Update local settings with the timestamp from the successful upload
              localSyncSettings.modifiedTime = settingsDriveFile.modifiedTime;
              await db.put('settings', localSyncSettings, 'sync-settings');

              logger.info('✅ Settings uploaded.');
          }
          
          const getLocalCategories = type === 'lesson' ? dataService.getLessonCategories : dataService.getFigureCategories;
          const localCategories = await getLocalCategories();
          const [existingCategoriesFile] = await api.listFiles(`name='${categoriesFileName}'`);
          logger.info(`Uploading ${localCategories.length} local categories for ${type}...`);
          await api.upload(JSON.stringify(localCategories), { name: categoriesFileName, mimeType: 'application/json' }, existingCategoriesFile?.id);
          logger.info('✅ Categories uploaded.');
      } catch(e) {
        logger.error('Failed to force upload settings and categories', e);
      }
  
  }, []);

  const fetchLatestItemForEditing = useCallback(async <T extends Lesson | Figure>(
    itemId: string, 
    type: 'lesson' | 'figure'
): Promise<T> => {
    logger.info(`--- UI-BLOCK: Fetching latest item for editing ${type} ${itemId} ---`);
    try {
        const db = await openBachataDB();
        const api = apiRef.current;
        
        const localItem = type === 'lesson' 
            ? await db.get('lessons', itemId) as T | undefined
            : await db.get('figures', itemId) as T | undefined;
            
        if (!localItem) throw new Error("Local item not found for editing.");
        if (!api || !localItem.driveId) {
            logger.info(' > No remote to check. Returning local item.');
            return localItem;
        }
        
        logger.info(' > Checking remote for newer version...');
        const folderName = type === 'lesson' ? FOLDERS.lessons : FOLDERS.figures;
        const folderId = await api.findOrCreateFolder(folderName);
        const [remoteFile] = await api.listFiles(`name='${localItem.id}.json' and '${folderId}' in parents`);

        if (!remoteFile) {
            logger.warn(' > Remote file not found. Returning local item.');
            return localItem;
        }

        const localTime = localItem.modifiedTime ? new Date(localItem.modifiedTime).getTime() : 0;
        const remoteTime = new Date(remoteFile.modifiedTime).getTime();

        if (remoteTime > localTime + 2000) { // Remote is newer
            logger.info(' > Remote is newer. Downloading and returning updated item.');
            if (type === 'lesson') {
                await syncQueueService.downloadLesson(api, remoteFile.id);
                return await db.get('lessons', itemId) as T;
            } else { // type === 'figure'
                const figureJson = await api.downloadJson<Figure>(remoteFile.id);
                if (!figureJson) throw new Error("Failed to download remote figure JSON.");
                await dataService.saveDownloadedFigure(figureJson);
                return await db.get('figures', itemId) as T;
            }
        }
        
        logger.info(' > Local item is up-to-date. Returning local item.');
        return localItem;

    } catch (e) {
        logger.error(`Failed to fetch latest item for editing ${itemId}`, e);
        // If it fails, return the local item as a fallback
        const localItem = type === 'lesson'
            ? await (await openBachataDB()).get('lessons', itemId) as T | undefined
            : await (await openBachataDB()).get('figures', itemId) as T | undefined;
        if (!localItem) throw new Error("Local item not found for editing after remote fetch failed.");
        return localItem;
    }
  }, []);

  const handleSignOut = useCallback((isExpired: boolean = false) => {
      if (accessToken && !isExpired) {
          window.google.accounts.oauth2.revoke(accessToken, () => {});
      }
      localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
      localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
      setAccessToken(null);
      apiRef.current = null;
      setIsSignedIn(false);
      setUserProfile(null);
      syncQueueService.stopProcessing();
      if (!isExpired) setSyncError(null);
      logger.info('User signed out.');
  }, [accessToken]);

  // --- Authentication and Initialization ---
  useEffect(() => {
    const storedToken = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    const storedProfileJSON = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);

    const validateAndHydrate = async (token: string, profileJSON: string) => {
      setIsSignedIn(true);
      setAccessToken(token);
      apiRef.current = new GoogleDriveApi(token);
      try { setUserProfile(JSON.parse(profileJSON)); } catch (e) { /* ignore */ }
      
      try {
        logger.info('Validating stored token...');
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Token validation failed');
        const profile = await response.json();
        const freshUserProfile = { email: profile.email, name: profile.name, imageUrl: profile.picture };
        setUserProfile(freshUserProfile);
        localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(freshUserProfile));
        logger.info('✅ Token validated. User hydrated.');
        syncQueueService.startProcessing(apiRef.current);
      } catch (e) {
        logger.warn('Stored token is expired or invalid. Signing out.');
        handleSignOut(true);
        setSyncError('Your session has expired. Please sign in again.');
      }
    };

    if (storedToken && storedProfileJSON) {
      validateAndHydrate(storedToken, storedProfileJSON);
    }
  }, [handleSignOut]);

  const fetchUserProfile = useCallback(async (token: string) => {
    try {
      logger.info('Fetching user profile...');
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch user profile');
      const profile = await response.json();
      const newProfile = { email: profile.email, name: profile.name, imageUrl: profile.picture };
      setUserProfile(newProfile);
      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newProfile));
      logger.info('✅ User profile fetched.');
    } catch (e: any) {
      logger.error("Error fetching user profile", e);
      setSyncError(`Could not fetch user profile: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    const gisInit = () => {
        try {
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: async (tokenResponse: any) => {
                    if (tokenResponse.error) {
                        setSyncError(`Auth Error: ${tokenResponse.error_description || tokenResponse.error}`);
                        setAccessToken(null);
                        setIsSignedIn(false);
                        return;
                    }
                    const token = tokenResponse.access_token;
                    logger.info('Received new access token.');
                    localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, token);
                    setAccessToken(token);
                    apiRef.current = new GoogleDriveApi(token);
                    setIsSignedIn(true);
                    setSyncError(null);
                    await fetchUserProfile(token);
                    syncQueueService.startProcessing(apiRef.current);
                },
            });
            setTokenClient(client);
            setIsGisReady(true);
        } catch(e: any) {
            setSyncError(`Google Auth init failed: ${e.message}`);
        }
    };
    
    const checkGis = setInterval(() => {
        if (window.google?.accounts) {
            clearInterval(checkGis);
            gisInit();
        }
    }, 100);

    return () => clearInterval(checkGis);
  }, [fetchUserProfile]);

  const signIn = useCallback(() => {
    if (!tokenClient) {
        setSyncError('Google Auth is not ready.');
        return;
    }
    setSyncError(null);
    logger.info('Requesting access token...');
    tokenClient.requestAccessToken({ prompt: '' });
  }, [tokenClient]);
  

  const value = useMemo(() => ({
      isGisReady, isSignedIn, userProfile, syncError, 
      signIn, signOut: handleSignOut,
      syncQueue, isSyncActive,
      initiateSync,
      fetchLatestSettingsForEditing,
      forceUploadSettingsAndCategories,
      fetchLatestItemForEditing,
      forceAddItem,
      forceUpdateItem,
      forceDeleteItem
  }), [
      isGisReady, isSignedIn, userProfile, syncError, 
      signIn, handleSignOut,
      syncQueue, isSyncActive,
      initiateSync,
      fetchLatestSettingsForEditing,
      forceUploadSettingsAndCategories,
      fetchLatestItemForEditing,
      forceAddItem,
      forceUpdateItem,
      forceDeleteItem
  ]);

  return React.createElement(GoogleDriveContext.Provider, { value }, children);
};

export const useGoogleDrive = (): GoogleDriveContextType => {
  const context = useContext(GoogleDriveContext);
  if (context === undefined) {
    throw new Error('useGoogleDrive must be used within a GoogleDriveProvider');
  }
  return context;
};

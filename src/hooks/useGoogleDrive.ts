import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef, useMemo } from 'react';
import { GOOGLE_CLIENT_ID } from '../../config';
import { GoogleDriveApi, DriveFile, FOLDERS, FILES } from '../data/googledrive';
import { dataService } from '../data/service';
import type { AppSettings, Figure, Lesson, SyncTask, SyncTaskType, FigureCategory, LessonCategory, GroupingConfig } from '../types';
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
  forceUploadGroupingConfig: (type: 'lesson' | 'figure') => Promise<void>;
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
    syncQueueService.addTask('sync-grouping-config', { type });
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
  const forceUploadGroupingConfig = useCallback(async (type: 'lesson' | 'figure') => {
      if (!apiRef.current) return;
      const api = apiRef.current;
      logger.info(`--- UI-BLOCK: Forcing UPLOAD of grouping config for ${type} ---`);
      try {
          await syncQueueService.syncGroupingConfig(api, type);
          logger.info('✅ Grouping config sync/upload complete.');
      } catch(e) {
        logger.error('Failed to force upload grouping config', e);
        throw e; // Re-throw to be caught by the calling component
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
      forceUploadGroupingConfig,
      forceAddItem,
      forceUpdateItem,
      forceDeleteItem
  }), [
      isGisReady, isSignedIn, userProfile, syncError, 
      signIn, handleSignOut,
      syncQueue, isSyncActive,
      initiateSync,
      forceUploadGroupingConfig,
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
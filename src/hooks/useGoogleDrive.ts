
import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef } from 'react';
import { GOOGLE_CLIENT_ID } from '../config';
import { GoogleDriveApi, DriveFile, FOLDERS, FILES } from '../data/googledrive';
import { dataService } from '../data/service';
import type { AppSettings, Figure, FigureCategory, Lesson, LessonCategory } from '../types';

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
  isSyncing: boolean;
  syncProgress: number;
  syncError: string | null;
  signIn: () => void;
  signOut: () => void;
  synchronize: (forceFullUpload?: boolean) => Promise<void>;
  uploadLesson: (lesson: Lesson, videoFile: File) => Promise<void>;
  updateLesson: (lesson: Lesson) => Promise<void>;
  deleteLesson: (lesson: Lesson) => Promise<void>;
  uploadFigure: (figure: Figure) => Promise<void>;
  updateFigure: (figure: Figure) => Promise<void>;
  deleteFigure: (figure: Figure) => Promise<void>;
  uploadCategories: (type: 'lesson' | 'figure') => Promise<void>;
  uploadSettings: () => Promise<void>;
}

const GoogleDriveContext = createContext<GoogleDriveContextType | undefined>(undefined);

export const GoogleDriveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isGisReady, setIsGisReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  const apiRef = useRef<GoogleDriveApi | null>(null);
  const folderIdsRef = useRef<Record<string, string>>({});

  const synchronizeRef = useRef((_force?: boolean) => Promise.resolve());

  // Restore session from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    const storedProfileJSON = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);

    if (storedToken && storedProfileJSON) {
      const validateAndHydrate = async () => {
        setIsSignedIn(true);
        setAccessToken(storedToken);
        apiRef.current = new GoogleDriveApi(storedToken);
        try { setUserProfile(JSON.parse(storedProfileJSON)); } catch (e) { /* ignore */ }
        
        try {
          const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          if (!response.ok) throw new Error('Token validation failed');
          const profile = await response.json();
          const freshUserProfile = {
              email: profile.email,
              name: profile.name,
              imageUrl: profile.picture,
          };
          setUserProfile(freshUserProfile);
          localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(freshUserProfile));
          synchronizeRef.current(); // Auto-sync on startup
        } catch (e) {
          handleSignOut(true);
          setSyncError('Your session has expired. Please sign in again.');
        }
      };
      validateAndHydrate();
    }
  }, []);

  const fetchUserProfile = useCallback(async (token: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch user profile');
      const profile = await response.json();
      const newProfile = {
        email: profile.email,
        name: profile.name,
        imageUrl: profile.picture,
      };
      setUserProfile(newProfile);
      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newProfile));
    } catch (e: any) {
      console.error("Error fetching user profile", e);
      setSyncError(`Could not fetch user profile: ${e.message}`);
    }
  }, []);

  // Initialize Google Identity Services
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
                    localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, token);
                    setAccessToken(token);
                    apiRef.current = new GoogleDriveApi(token);
                    setIsSignedIn(true);
                    setSyncError(null);
                    await fetchUserProfile(token);
                    await synchronizeRef.current(); // Sync immediately after login
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

  const signIn = () => {
    if (!tokenClient) {
        setSyncError('Google Auth is not ready.');
        return;
    }
    setSyncError(null);
    tokenClient.requestAccessToken({ prompt: '' });
  };
  
  const handleSignOut = (isExpired: boolean = false) => {
    if (accessToken && !isExpired) {
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
    localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
    setAccessToken(null);
    apiRef.current = null;
    setIsSignedIn(false);
    setUserProfile(null);
    if (!isExpired) setSyncError(null);
  };
  
  const getFolderIds = async () => {
    if (!apiRef.current) throw new Error("Not authenticated");
    if (Object.keys(folderIdsRef.current).length === 3) return folderIdsRef.current;
    
    const [lessons, figures, videos] = await Promise.all([
        apiRef.current.findOrCreateFolder(FOLDERS.lessons),
        apiRef.current.findOrCreateFolder(FOLDERS.figures),
        apiRef.current.findOrCreateFolder(FOLDERS.videos),
    ]);
    folderIdsRef.current = { lessons, figures, videos };
    return folderIdsRef.current;
  };
  
  // Reactive upload/update/delete functions
  const uploadLesson = async (lesson: Lesson, videoFile: File) => {
      if (!apiRef.current || !lesson) return;
      const api = apiRef.current;
      const folders = await getFolderIds();

      // Check if video file already exists to avoid re-uploading immutable assets
      const remoteVideoFiles = await api.listFiles(`name='${lesson.videoId}.bin' and '${folders.videos}' in parents and trashed=false`);
      let videoDriveFile: DriveFile;

      if (remoteVideoFiles.length > 0) {
          videoDriveFile = remoteVideoFiles[0]; // Use existing video
      } else {
          // Upload video only if it doesn't exist
          const videoMeta = { name: `${lesson.videoId}.bin`, mimeType: 'application/octet-stream', parents: [folders.videos] };
          videoDriveFile = await api.upload(videoFile, videoMeta);
      }
      
      // Upload lesson JSON
      const lessonToUpload = { ...lesson, videoDriveId: videoDriveFile.id };
      delete (lessonToUpload as any).modifiedTime;
      const lessonMeta = { name: `${lesson.id}.json`, mimeType: 'application/json', parents: [folders.lessons] };
      
      const driveFile = await api.upload(JSON.stringify(lessonToUpload), lessonMeta);
      await dataService.updateLesson(lesson.id, { driveId: driveFile.id, videoDriveId: videoDriveFile.id, modifiedTime: driveFile.modifiedTime });
  };
  
  const updateLesson = async (lesson: Lesson) => {
      if (!apiRef.current || !lesson.driveId) return;
      const lessonToUpload = { ...lesson };
      delete (lessonToUpload as any).modifiedTime;
      const lessonMeta = { name: `${lesson.id}.json`, mimeType: 'application/json' };
      const driveFile = await apiRef.current.upload(JSON.stringify(lessonToUpload), lessonMeta, lesson.driveId);
      await dataService.updateLesson(lesson.id, { modifiedTime: driveFile.modifiedTime });
  };

  const deleteLesson = async (lesson: Lesson) => {
    if (!apiRef.current) return;
    // Fetch the latest state from the DB to ensure we have all the correct driveIds
    const allLessons = await dataService.getLessons();
    const lessonToDelete = allLessons.find(l => l.id === lesson.id);
    if (!lessonToDelete) return; // Already gone, nothing to do on Drive

    const allFigures = await dataService.getFigures();
    const figuresToDelete = allFigures.filter(f => f.lessonId === lessonToDelete.id);

    const deletePromises: Promise<void>[] = [];
    if (lessonToDelete.driveId) {
        deletePromises.push(apiRef.current.deleteFile(lessonToDelete.driveId));
    }
    figuresToDelete.forEach(fig => {
        if (fig.driveId) deletePromises.push(apiRef.current.deleteFile(fig.driveId));
    });
    if (lessonToDelete.videoDriveId) {
        const isVideoShared = allLessons.some(l => l.id !== lessonToDelete.id && l.videoDriveId === lessonToDelete.videoDriveId);
        if (!isVideoShared) deletePromises.push(apiRef.current.deleteFile(lessonToDelete.videoDriveId));
    }
    
    if (deletePromises.length === 0) return; // Nothing to delete on Drive.

    const results = await Promise.allSettled(deletePromises);
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
        console.error("Failed to delete one or more remote files:", failed.map(f => (f as PromiseRejectedResult).reason));
        // This error will be caught by the calling component (e.g., LessonCard)
        // and should prevent the local data from being deleted, maintaining consistency.
        throw new Error("Failed to delete from Google Drive. The item was not removed locally. Please try again.");
    }
  };
  
  const uploadFigure = async (figure: Figure) => {
      if (!apiRef.current || !figure) return;
      const folders = await getFolderIds();
      const figureToUpload = { ...figure };
      delete (figureToUpload as any).modifiedTime;
      const figureMeta = { name: `${figure.id}.json`, mimeType: 'application/json', parents: [folders.figures] };
      const driveFile = await apiRef.current.upload(JSON.stringify(figureToUpload), figureMeta);
      await dataService.updateFigure(figure.id, { driveId: driveFile.id, modifiedTime: driveFile.modifiedTime });
  };
  
  const updateFigure = async (figure: Figure) => {
      if (!apiRef.current || !figure.driveId) return;
      const figureToUpload = { ...figure };
      delete (figureToUpload as any).modifiedTime;
      const figureMeta = { name: `${figure.id}.json`, mimeType: 'application/json' };
      const driveFile = await apiRef.current.upload(JSON.stringify(figureToUpload), figureMeta, figure.driveId);
      await dataService.updateFigure(figure.id, { modifiedTime: driveFile.modifiedTime });
  };
  
  const deleteFigure = async (figure: Figure) => {
    if (!apiRef.current) return;
    const allFigures = await dataService.getFigures();
    const dbFigure = allFigures.find(f => f.id === figure.id);

    if (dbFigure?.driveId) {
        try {
            await apiRef.current.deleteFile(dbFigure.driveId);
        } catch (e) {
            console.error(`Failed to delete remote figure ${dbFigure.id}:`, e);
            throw new Error("Failed to delete from Google Drive. The item was not removed locally. Please try again.");
        }
    }
  };
  
  const uploadCategories = async (type: 'lesson' | 'figure') => {
      if (!apiRef.current) return;
      const isLesson = type === 'lesson';
      const filename = isLesson ? FILES.lessonCategories : FILES.figureCategories;
      const categories = isLesson ? await dataService.getLessonCategories() : await dataService.getFigureCategories();
      const remoteFiles = await apiRef.current.listFiles(`name='${filename}'`);
      const fileId = remoteFiles[0]?.id;
      const meta = { name: filename, mimeType: 'application/json', parents: ['appDataFolder'] };
      const catsToUpload = categories.map(c => ({...c, driveId: fileId, modifiedTime: undefined }));
      const driveFile = await apiRef.current.upload(JSON.stringify(catsToUpload), meta, fileId);
      // Update local categories with driveId and modifiedTime
      const tx = categories.map(c => dataService.updateFigureCategory(c.id, { driveId: driveFile.id, modifiedTime: driveFile.modifiedTime }));
      await Promise.all(tx);
  };
  
  const uploadSettings = async () => {
    if (!apiRef.current) return;
    const settings = await dataService.getSettings();
    const syncableSettings: Partial<AppSettings> = { ...settings };
    
    // These keys are device-specific and should not be synced
    delete syncableSettings.language;
    delete syncableSettings.isMuted;
    delete syncableSettings.volume;
    delete syncableSettings.autoplayGalleryVideos;
    delete syncableSettings.lessonSortOrder;
    delete syncableSettings.figureSortOrder;
    delete syncableSettings.lessonGrouping;
    delete syncableSettings.figureGrouping;
    delete syncableSettings.collapsedLessonDateGroups;
    delete syncableSettings.collapsedFigureDateGroups;

    const remoteFiles = await apiRef.current.listFiles(`name='${FILES.settings}'`);
    const fileId = remoteFiles[0]?.id;
    const meta = { name: FILES.settings, mimeType: 'application/json', parents: ['appDataFolder'] };
    const driveFile = await apiRef.current.upload(JSON.stringify(syncableSettings), meta, fileId);
    await dataService.saveSettings({ ...settings, lastSyncTimestamp: driveFile.modifiedTime });
  };

  synchronizeRef.current = async (forceFullUpload = false) => {
    if (!apiRef.current || isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);
    setSyncProgress(0);

    try {
        const api = apiRef.current;
        const folders = await getFolderIds();
        setSyncProgress(5);

        // --- FORCE FULL UPLOAD (AFTER IMPORT) ---
        if (forceFullUpload) {
            const lessons = await dataService.getLessons();
            const figures = await dataService.getFigures();
            
            const totalUploads = 3 + lessons.length + figures.length;
            let completedUploads = 0;
            const updateUploadProgress = () => {
                completedUploads++;
                setSyncProgress(5 + (completedUploads / totalUploads) * 90);
            };

            await uploadSettings(); updateUploadProgress();
            await uploadCategories('lesson'); updateUploadProgress();
            await uploadCategories('figure'); updateUploadProgress();

            for (const lesson of lessons) {
                const videoFile = await dataService.getVideoFile(lesson.id);
                if (videoFile) {
                    await uploadLesson(lesson, videoFile);
                }
                updateUploadProgress();
            }
            for (const figure of figures) {
                await uploadFigure(figure);
                updateUploadProgress();
            }
        } else {
            // --- TWO-WAY DIFFERENTIAL SYNC (DEPENDENCY-AWARE) ---
            // 1. Fetch all data
            const [localLessons, localFigures, localSettings, remoteLessonFiles, remoteFigureFiles, remoteSettingsFile] = await Promise.all([
                dataService.getLessons(),
                dataService.getFigures(),
                dataService.getSettings(),
                api.listFiles(`'${folders.lessons}' in parents and trashed=false`),
                api.listFiles(`'${folders.figures}' in parents and trashed=false`),
                api.listFiles(`name='${FILES.settings}'`).then(f => f[0]),
            ]);
            setSyncProgress(15);

            // 2. Create maps for quick lookups
            const localLessonsMap = new Map(localLessons.map(l => [l.id, l]));
            const remoteLessonsMap = new Map(remoteLessonFiles.map(f => [f.name.replace('.json', ''), f]));
            
            // 3. Reconcile LESSONS first
            const lessonsToUpload = new Set<string>();
            const lessonsToDownload = new Set<string>();
            
            localLessons.forEach(local => {
                const remote = remoteLessonsMap.get(local.id);
                if (!remote || (local.modifiedTime && new Date(local.modifiedTime).getTime() > new Date(remote.modifiedTime).getTime() + 1000)) {
                    lessonsToUpload.add(local.id);
                }
            });
            remoteLessonFiles.forEach(remote => {
                const remoteId = remote.name.replace('.json', '');
                const local = localLessonsMap.get(remoteId);
                if (!local || (local?.modifiedTime && new Date(remote.modifiedTime).getTime() > new Date(local.modifiedTime).getTime() + 1000)) {
                    lessonsToDownload.add(remoteId);
                }
            });
            
            // 4. Execute lesson operations
            const lessonOps: Promise<any>[] = [];
            for (const id of lessonsToUpload) {
                const lesson = localLessonsMap.get(id);
                if (lesson) {
                    lessonOps.push((async () => {
                        const videoFile = await dataService.getVideoFile(id);
                        if (videoFile) await uploadLesson(lesson, videoFile);
                    })());
                }
            }
            for (const id of lessonsToDownload) {
                const remoteFile = remoteLessonsMap.get(id)!;
                lessonOps.push(api.downloadJson<Lesson>(remoteFile.id).then(async data => {
                    if (data?.videoDriveId) {
                        const blob = await api.downloadBlob(data.videoDriveId);
                        if (blob) await dataService.saveDownloadedLesson(data, blob);
                    }
                }));
            }
            if (lessonOps.length > 0) await Promise.allSettled(lessonOps);
            setSyncProgress(45);

            // 5. Re-fetch local data post-lesson sync and reconcile FIGURES
            const finalLocalLessonsMap = new Map((await dataService.getLessons()).map(l => [l.id, l]));
            const localFiguresMap = new Map(localFigures.map(f => [f.id, f]));
            const remoteFiguresMap = new Map(remoteFigureFiles.map(f => [f.name.replace('.json', ''), f]));

            const figuresToUpload = new Set<string>();
            const figuresToDownload = new Set<string>();
            const remoteFiguresToDelete = new Set<string>(); // Holds file IDs

            localFigures.forEach(local => {
                const remote = remoteFiguresMap.get(local.id);
                if (!remote || (local.modifiedTime && new Date(local.modifiedTime).getTime() > new Date(remote.modifiedTime).getTime() + 1000)) {
                    figuresToUpload.add(local.id);
                }
            });

            const remoteFigureProcessingPromises = remoteFigureFiles.map(async remoteFile => {
                const remoteId = remoteFile.name.replace('.json', '');
                const local = localFiguresMap.get(remoteId);
                if (!local || (local?.modifiedTime && new Date(remoteFile.modifiedTime).getTime() > new Date(local.modifiedTime).getTime() + 1000)) {
                    const figureData = await api.downloadJson<Figure>(remoteFile.id);
                    if (!figureData) {
                        remoteFiguresToDelete.add(remoteFile.id); // Corrupted
                        return;
                    }
                    // This is the crucial check against the *final* state of local lessons
                    if (finalLocalLessonsMap.has(figureData.lessonId)) {
                        figuresToDownload.add(remoteId);
                    } else {
                        remoteFiguresToDelete.add(remoteFile.id); // Orphan
                    }
                }
            });
            await Promise.all(remoteFigureProcessingPromises);
            setSyncProgress(75);

            // 6. Execute figure operations
            const figureOps: Promise<any>[] = [];
            for (const id of figuresToUpload) {
                const figure = localFiguresMap.get(id);
                if (figure) figureOps.push(uploadFigure(figure));
            }
            for (const id of figuresToDownload) {
                 const remoteFile = remoteFiguresMap.get(id)!;
                 figureOps.push(api.downloadJson<Figure>(remoteFile.id).then(data => { if(data) dataService.saveDownloadedFigure(data) }));
            }
            for (const id of remoteFiguresToDelete) figureOps.push(api.deleteFile(id));
            if (figureOps.length > 0) await Promise.allSettled(figureOps);
            
            // 7. Settings sync
            if (remoteSettingsFile && (!localSettings.lastSyncTimestamp || new Date(remoteSettingsFile.modifiedTime) > new Date(localSettings.lastSyncTimestamp))) {
                const remoteSettings = await api.downloadJson<Partial<AppSettings>>(remoteSettingsFile.id);
                if (remoteSettings) await dataService.saveSettings({ ...localSettings, ...remoteSettings, lastSyncTimestamp: remoteSettingsFile.modifiedTime });
            } else {
                 await uploadSettings();
            }
        }
        
        await dataService.saveSettings({ ...await dataService.getSettings(), lastSyncTimestamp: new Date().toISOString() });
        setSyncProgress(100);

    } catch (e: any) {
        console.error("Sync failed", e);
        setSyncError(`Sync failed: ${e.message}`);
        setSyncProgress(0);
    } finally {
        setIsSyncing(false);
    }
  };

  const value = {
      isGisReady, isSignedIn, userProfile, isSyncing, syncProgress, syncError, 
      signIn, signOut: handleSignOut, synchronize: synchronizeRef.current, 
      uploadLesson, updateLesson, deleteLesson,
      uploadFigure, updateFigure, deleteFigure,
      uploadCategories, uploadSettings
  };

  return React.createElement(GoogleDriveContext.Provider, { value }, children);
};

export const useGoogleDrive = (): GoogleDriveContextType => {
  const context = useContext(GoogleDriveContext);
  if (context === undefined) {
    throw new Error('useGoogleDrive must be used within a GoogleDriveProvider');
  }
  return context;
};

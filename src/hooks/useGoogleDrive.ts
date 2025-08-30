import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode, useMemo } from 'react';
import type { UserProfile } from '../api/GoogleIdentityAPI';
import type { SyncTask } from '../types';
// FIX: Corrected import casing to resolve module resolution issue with duplicate filenames.
import { syncQueueService } from '../services/SyncQueueService';
import { googleDriveService, type AuthState } from '../services/GoogleDriveService';

interface GoogleDriveContextType {
  isGisReady: boolean;
  isSignedIn: boolean;
  userProfile: UserProfile | null;
  syncError: string | null;
  signIn: () => void;
  signOut: () => void;
  syncQueue: SyncTask[];
  isSyncActive: boolean;
  initiateSync: (type: 'lesson' | 'figure') => void;
  forceUploadGroupingConfig: (type: 'lesson' | 'figure') => Promise<void>;
  forceAddItem: (itemData: any, type: 'lesson' | 'figure', options?: any) => Promise<any>;
  forceUpdateItem: (itemId: string, itemData: any, type: 'lesson' | 'figure') => Promise<any>;
  forceDeleteItem: (item: any) => Promise<void>;
}

const GoogleDriveContext = createContext<GoogleDriveContextType | undefined>(undefined);

export const GoogleDriveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(googleDriveService.getAuthState());
  const [syncQueue, setSyncQueue] = useState<SyncTask[]>(syncQueueService.getQueue());

  useEffect(() => {
    googleDriveService.initialize();
    
    const unsubscribeAuth = googleDriveService.onAuthStateChanged(setAuthState);
    const unsubscribeQueue = syncQueueService.subscribe(() => {
      setSyncQueue([...syncQueueService.getQueue()]);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeQueue();
    };
  }, []);

  // Effect to manage the sync queue processing based on auth state
  useEffect(() => {
    if (authState.isSignedIn) {
      syncQueueService.startProcessing();
    } else {
      syncQueueService.stopProcessing();
    }
  }, [authState.isSignedIn]);

  const initiateSync = useCallback((type: 'lesson' | 'figure') => {
    if (authState.isSignedIn) {
      syncQueueService.addTask('sync-gallery', { type });
      syncQueueService.addTask('sync-grouping-config', { type });
    }
  }, [authState.isSignedIn]);

  const value = useMemo(() => ({
    // FIX: Explicitly map properties from authState to the context type, renaming 'error' to 'syncError'.
    isGisReady: authState.isGisReady,
    isSignedIn: authState.isSignedIn,
    userProfile: authState.userProfile,
    syncError: authState.error,
    signIn: googleDriveService.signIn,
    signOut: googleDriveService.signOut,
    syncQueue,
    isSyncActive: syncQueueService.getIsActive(),
    initiateSync,
    forceUploadGroupingConfig: syncQueueService.forceUploadGroupingConfig,
    forceAddItem: syncQueueService.forceAddItem,
    forceUpdateItem: syncQueueService.forceUpdateItem,
    forceDeleteItem: syncQueueService.forceDeleteItem,
  }), [authState, syncQueue, initiateSync]);

  return React.createElement(GoogleDriveContext.Provider, { value }, children);
};

export const useGoogleDrive = (): GoogleDriveContextType => {
  const context = useContext(GoogleDriveContext);
  if (context === undefined) {
    throw new Error('useGoogleDrive must be used within a GoogleDriveProvider');
  }
  return context;
};
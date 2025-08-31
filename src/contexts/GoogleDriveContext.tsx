import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode, useMemo } from 'react';
import type { UserProfile } from '../api/GoogleIdentityAPI';
import { syncQueueService, type SyncTask, type SyncTaskType } from '../services/SyncQueueService';
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
  addTask: (type: SyncTaskType, payload?: any, isPriority?: boolean) => void;
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
    isGisReady: authState.isGisReady,
    isSignedIn: authState.isSignedIn,
    userProfile: authState.userProfile,
    syncError: authState.error,
    signIn: googleDriveService.signIn,
    signOut: googleDriveService.signOut,
    syncQueue,
    isSyncActive: syncQueueService.getIsActive(),
    initiateSync,
    addTask: syncQueueService.addTask,
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
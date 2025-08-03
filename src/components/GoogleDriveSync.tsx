

import React from 'react';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import { useTranslation } from '../App';

const GoogleIcon: React.FC = () => (
    <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.87c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
        <path fill="#34A853" d="M24 46c6.49 0 11.92-2.13 15.89-5.82l-7.11-5.52c-2.17 1.46-4.94 2.32-8.78 2.32-6.76 0-12.47-4.55-14.51-10.61H2.26v5.7C6.22 39.88 14.41 46 24 46z"/>
        <path fill="#FBBC05" d="M9.49 27.58c-.41-1.23-.65-2.55-.65-3.92s.24-2.69.65-3.92V14.04H2.26C.82 16.88 0 20.33 0 24.1c0 3.76.82 7.22 2.26 10.05l7.23-5.7z"/>
        <path fill="#EA4335" d="M24 9.4c3.51 0 6.56 1.21 8.98 3.49l6.23-6.23C35.91 2.19 30.49 0 24 0 14.41 0 6.22 6.12 2.26 14.04l7.23 5.7c2.04-6.06 7.75-10.34 14.51-10.34z"/>
    </svg>
);

const GoogleDriveSync: React.FC = () => {
    const { isSignedIn, isSyncing, syncProgress, userProfile, syncError, signIn, signOut, synchronize } = useGoogleDrive();
    const { t } = useTranslation();
    
    if (syncError) {
        return (
            <p className="text-sm text-center p-2 rounded-md bg-red-100 text-red-700">
                {t('settings.syncError', { error: syncError })}
            </p>
        );
    }

    if (!isSignedIn) {
        return (
            <div className="sm:flex sm:justify-start">
                <button
                    onClick={signIn}
                    className="w-full sm:w-auto inline-flex items-center justify-center bg-white border border-gray-300 text-gray-700 font-bold px-4 py-2 rounded-lg shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200 gap-2"
                >
                    <GoogleIcon />
                    {t('settings.signInWithGoogle')}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center space-x-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                <img src={userProfile?.imageUrl} alt="User profile" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                <div className="text-sm overflow-hidden">
                    <p className="font-semibold text-gray-800 truncate">{userProfile?.name}</p>
                    <p className="text-gray-500 truncate">{userProfile?.email}</p>
                </div>
            </div>
            <div className="space-y-3 sm:space-y-0 sm:flex sm:space-x-3">
                <button
                    onClick={() => synchronize()}
                    disabled={isSyncing}
                    className="w-full sm:w-auto bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                   {isSyncing && <i className="material-icons animate-spin">sync</i>}
                   {isSyncing ? t('settings.syncing') : t('settings.syncData')}
                </button>
                <button
                    onClick={() => signOut()}
                    disabled={isSyncing}
                    className="w-full sm:w-auto bg-white text-gray-700 border border-gray-300 font-bold py-2 px-4 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                    {t('settings.signOut')}
                </button>
            </div>
            {isSyncing && (
                  <div className="mt-4">
                      <div className="text-center text-sm text-gray-600 mb-1">
                          <span>{t('settings.syncInProgress', { progress: Math.round(syncProgress) })}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                          <div
                              className="bg-blue-600 h-2.5 rounded-full transition-all duration-200 ease-linear"
                              style={{ width: `${syncProgress}%` }}
                          ></div>
                      </div>
                  </div>
              )}
        </div>
    );
};

export default GoogleDriveSync;
import React, { useRef } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MobileTopNav from './MobileTopNav';
import DesktopTopNav from './DesktopTopNav';
import { useTranslation } from '../contexts/I18nContext';
import GoogleDriveSync from './GoogleDriveSync';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { isDev, isE2ETest } from '../../config';
import { useSettings } from '../contexts/SettingsContext';
import { APP_VERSION } from '../version';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { backupOrchestrationService, useBackupStatus } from '../services/BackupOrchestrationService';

const SettingsView: React.FC = () => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const { isSignedIn } = useGoogleDrive();
  const devMode = isDev();
  
  const backupStatus = useBackupStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // If the service requests a file, click the hidden input.
    if (backupStatus.status === 'awaiting-file') {
      fileInputRef.current?.click();
    }
  }, [backupStatus.status]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value as 'english' | 'polish';
    updateSettings({ language: newLanguage });
  };
  
  const handleAutoplayToggle = () => {
    updateSettings({ autoplayGalleryVideos: !settings.autoplayGalleryVideos })
      .catch(err => {
        console.error("Failed to save autoplay setting", err);
      });
  };
  
  const handleExport = () => {
    backupOrchestrationService.exportData();
  };

  const handleImportClick = () => {
    backupOrchestrationService.requestImport();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        backupOrchestrationService.cancelImport(); // User cancelled the file picker
        return;
      }
      backupOrchestrationService.handleFileSelected(file);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const LANGUAGES = [
    { value: 'english' as const, label: t('settings.english') },
    { value: 'polish' as const, label: t('settings.polish') },
  ];
  
  const pageTitle = t('settings.title');
  const isActionInProgress = backupStatus.status === 'exporting' || backupStatus.status === 'importing';

  return (
    <>
      {isMobile ? <MobileTopNav title={pageTitle} /> : null}
      <div id="settings-view" className="p-4 md:p-8">
        {!isMobile && <DesktopTopNav title={pageTitle} />}
        <div className="bg-white p-6 rounded-lg shadow-md max-w-2xl">
          {!isE2ETest() && <p className="text-right -mt-4 -mr-4 mb-4 text-xs text-gray-400">Version: {APP_VERSION}</p>}
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-700" id="language-group-label">{t('settings.language')}</h2>
              <p className="text-gray-500 mt-1">{t('settings.languageDesc')}</p>
              <select
                id="language-select"
                name="language"
                value={settings.language}
                onChange={handleLanguageChange}
                className="mt-3 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                aria-label="Select language"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-gray-200 pt-6">
                <h2 className="text-xl font-semibold text-gray-700">{t('settings.gallery')}</h2>
                <p className="text-gray-500 mt-1">{t('settings.galleryDesc')}</p>
                <div
                    onClick={handleAutoplayToggle}
                    role="switch"
                    data-action="toggle-autoplay"
                    aria-checked={settings.autoplayGalleryVideos}
                    className="flex items-center justify-between mt-4 cursor-pointer"
                >
                    <div>
                        <span className="text-gray-700">{t('settings.autoplay')}</span>
                        <p className="text-sm text-gray-500">{t('settings.autoplayDesc')}</p>
                    </div>
                    {/* Toggle switch */}
                    <div className={`relative w-11 h-6 flex-shrink-0 rounded-full transition-colors duration-300 ease-in-out ${settings.autoplayGalleryVideos ? 'bg-blue-500' : 'bg-gray-300'}`}>
                        <div
                            className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
                                settings.autoplayGalleryVideos ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        ></div>
                    </div>
                </div>
            </div>
            
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-xl font-semibold text-gray-700">{t('settings.googleDriveSync')}</h2>
              <p className="text-gray-500 mt-1">{t('settings.googleDriveSyncDesc')}</p>
              <div className="mt-4">
                <GoogleDriveSync />
              </div>
            </div>

            {devMode && (
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center">
                  <h2 className="text-xl font-semibold text-gray-700">{t('settings.dataManagement')}</h2>
                  <span className="ml-2 bg-yellow-200 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full">DEV</span>
                </div>
                <p className="text-gray-500 mt-1">{t('settings.dataManagementDesc')}</p>
                <div className="mt-4 space-y-3 sm:space-y-0 sm:flex sm:space-x-3">
                    <button onClick={handleExport} data-action="export-data" disabled={isActionInProgress} className="w-full sm:w-auto bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {backupStatus.status === 'exporting' ? t('settings.exporting') : t('settings.exportData')}
                    </button>
                    <button onClick={handleImportClick} data-action="import-data" disabled={isActionInProgress} className="w-full sm:w-auto bg-green-500 text-white font-bold py-2 px-4 rounded hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {backupStatus.status === 'importing' ? t('settings.importing') : t('settings.importData')}
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileSelected} className="sr-only" accept=".json" />
                </div>
                {isActionInProgress && (
                    <div className="mt-4">
                        <div className="flex items-center justify-center text-sm text-gray-600 mb-2">
                            <i className="material-icons text-blue-600 animate-spin-reverse">sync</i>
                            <span className="ml-2">{t(backupStatus.statusMessage)}</span>
                        </div>
                        {backupStatus.status === 'exporting' && backupStatus.progress !== null && (
                            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-200 ease-linear"
                                    style={{ width: `${(backupStatus.progress || 0) * 100}%` }}
                                ></div>
                            </div>
                        )}
                    </div>
                )}
                {backupStatus.actionMessage && (
                    <p className={`text-sm mt-4 text-center ${backupStatus.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {backupStatus.actionMessage}
                    </p>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
      <ConfirmDeleteModal
        isOpen={backupStatus.showImportConfirm}
        onClose={() => backupOrchestrationService.cancelImport()}
        onConfirm={() => backupOrchestrationService.confirmImport()}
        isDeleting={backupStatus.status === 'importing'}
        title={t('settings.importConfirmTitle')}
      >
        <p>{t('settings.importConfirmBody')}</p>
        <p className="mt-2 font-semibold">{t('deleteModal.warning')}</p>
      </ConfirmDeleteModal>
    </>
  );
};

export default SettingsView;

import React, { useState, useRef } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MobileTopNav from './MobileTopNav';
import DesktopTopNav from './DesktopTopNav';
import { useTranslation } from '../App';
import { dataService } from '../data/service';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import GoogleDriveSync from './GoogleDriveSync';

type Status = { type: 'success' | 'error'; message: string } | null;

const SettingsView: React.FC = () => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { t, settings, setLanguage, updateSettings, reloadAllData } = useTranslation();
  
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  
  const [dataManagementStatus, setDataManagementStatus] = useState<Status>(null);
  const [clearStatus, setClearStatus] = useState<Status>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value as 'english' | 'polish';
    setLanguage(newLanguage);
  };
  
  const handleAutoplayToggle = () => {
    updateSettings({ autoplayGalleryVideos: !settings.autoplayGalleryVideos })
      .catch(err => {
        console.error("Failed to save autoplay setting", err);
        // Not showing an error to user per current design
      });
  };
  
  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setDataManagementStatus(null);
    setClearStatus(null);
    try {
        const dataBlob = await dataService.exportAllData((p) => setProgress(p));
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
        a.href = url;
        a.download = `bachata-moves-export-${timestamp}.bin`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDataManagementStatus({ type: 'success', message: t('settings.exportSuccess') });
    } catch (err) {
        console.error("Export failed", err);
        setDataManagementStatus({ type: 'error', message: t('settings.exportError') });
    } finally {
        setIsExporting(false);
        setProgress(null);
    }
  };

  const handleImportClick = () => {
      setDataManagementStatus(null);
      setClearStatus(null);
      fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      setProgress(0);
      setDataManagementStatus(null);
      setClearStatus(null);
      try {
          await dataService.importData(file, (p) => setProgress(p));
          setDataManagementStatus({ type: 'success', message: t('settings.importSuccess')});
          reloadAllData();
      } catch (err) {
          console.error("Import failed", err);
          setDataManagementStatus({ type: 'error', message: t('settings.importError')});
      } finally {
          setIsImporting(false);
          setProgress(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };
  
  const handleRequestClear = () => {
    setClearStatus(null);
    setDataManagementStatus(null);
    setShowClearConfirm(true);
  };

  const handleConfirmClear = async () => {
    setIsClearing(true);
    setClearStatus(null);
    try {
        await dataService.clearAllData();
        reloadAllData(); 
        setShowClearConfirm(false);
        setClearStatus({ type: 'success', message: t('settings.clearSuccess') });
    } catch (err) {
        console.error("Failed to clear all data", err);
        setShowClearConfirm(false);
        setClearStatus({ type: 'error', message: t('settings.clearError') });
    } finally {
      setIsClearing(false);
    }
  };

  const LANGUAGES = [
    { value: 'english' as const, label: t('settings.english') },
    { value: 'polish' as const, label: t('settings.polish') },
  ];
  
  const pageTitle = t('settings.title');
  const isActionInProgress = isExporting || isImporting || isClearing;

  return (
    <>
      {isMobile ? <MobileTopNav title={pageTitle} /> : null}
      <div className="p-4 md:p-8">
        {!isMobile && <DesktopTopNav title={pageTitle} />}
        <div className="bg-white p-6 rounded-lg shadow-md max-w-2xl">
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

            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-xl font-semibold text-gray-700">{t('settings.dataManagement')}</h2>
              <p className="text-gray-500 mt-1">{t('settings.dataManagementDesc')}</p>
              <div className="mt-4 space-y-3 sm:space-y-0 sm:flex sm:space-x-3">
                  <button onClick={handleExport} disabled={isActionInProgress} className="w-full sm:w-auto bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                      {isExporting ? t('settings.exporting') : t('settings.exportData')}
                  </button>
                  <button onClick={handleImportClick} disabled={isActionInProgress} className="w-full sm:w-auto bg-green-500 text-white font-bold py-2 px-4 rounded hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                      {isImporting ? t('settings.importing') : t('settings.importData')}
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleFileSelected} className="sr-only" accept=".bin,application/json" />
              </div>
              {(isExporting || isImporting) && progress !== null && (
                  <div className="mt-4">
                      <div className="text-center text-sm text-gray-600 mb-1">
                          <span>{isExporting ? t('settings.exporting') : t('settings.importing')}</span>
                          <span className="font-semibold ml-2">{Math.round(progress * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                          <div
                              className="bg-blue-600 h-2.5 rounded-full transition-all duration-200 ease-linear"
                              style={{ width: `${progress * 100}%` }}
                          ></div>
                      </div>
                  </div>
              )}
              {dataManagementStatus && (
                  <p className={`text-sm mt-4 text-center ${dataManagementStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                      {dataManagementStatus.message}
                  </p>
              )}

              <div className="mt-6 border-t border-dashed border-red-200 pt-5">
                <h3 className="text-lg font-semibold text-red-600">{t('settings.dangerZone')}</h3>
                <p className="text-gray-500 mt-1 text-sm">{t('settings.dangerZoneDesc')}</p>
                 <button 
                    onClick={handleRequestClear} 
                    disabled={isActionInProgress} 
                    className="mt-3 bg-red-600 text-white font-bold py-2 px-4 rounded hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isClearing ? t('settings.clearing') : t('settings.clearAllData')}
                  </button>
                  {clearStatus && (
                    <p className={`text-sm mt-3 ${clearStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {clearStatus.message}
                    </p>
                  )}
              </div>
            </div>

          </div>
        </div>
      </div>
      <ConfirmDeleteModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        isDeleting={isClearing}
        title={t('deleteModal.titleClear')}
      >
        <p>{t('deleteModal.bodyClear')}</p>
        <p className="mt-2 font-semibold">{t('deleteModal.warning')}</p>
      </ConfirmDeleteModal>
    </>
  );
};

export default SettingsView;
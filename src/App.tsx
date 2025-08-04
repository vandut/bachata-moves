


import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useRef, useMemo } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { NavItem, AppSettings } from './types';
import { useMediaQuery } from './hooks/useMediaQuery';
import LessonsGallery from './components/LessonsGallery';
import FiguresGallery from './components/FiguresGallery';
import SettingsView from './components/SettingsView';
import DesktopDrawer from './components/DesktopDrawer';
import MobileBottomNav from './components/MobileBottomNav';
import AddLessonModal from './components/AddLessonModal';
import AddFigureModal from './components/AddFigureModal';
import EditorScreen from './components/EditorScreen';
import { dataService } from './data/service';
import { translations } from './i18n';
import CustomizeGroupingScreen from './components/CustomizeCategoriesScreen';
import { GoogleDriveProvider, useGoogleDrive } from './hooks/useGoogleDrive';

// --- I18N Provider and Hook ---
type Language = 'english' | 'polish';
type Locale = 'en-US' | 'pl-PL';

interface I18nContextType {
  language: Language;
  locale: Locale;
  settings: AppSettings;
  setLanguage: (lang: Language) => void;
  updateSettings: (updates: Partial<AppSettings>, options?: { silent?: boolean }) => Promise<void>;
  t: (key: string, options?: { [key: string]: string | number }) => string;
  reloadAllData: () => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const getNestedTranslation = (lang: Language, key: string): string | undefined => {
  return key.split('.').reduce((obj: any, k: string) => obj?.[k], translations[lang]);
};

export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};

const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Use a ref to hold the latest settings for callbacks, breaking dependency cycles
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const reloadAllData = useCallback(() => {
    // Fetches fresh settings from DB and updates state, triggering re-renders where needed.
    dataService.getSettings().then(setSettings);
  }, []); // This is stable

  // Initial data load on component mount
  useEffect(() => {
    reloadAllData();
  }, [reloadAllData]);
  
  const updateSettings = useCallback(async (updates: Partial<AppSettings>, options?: { silent?: boolean }) => {
    const currentSettings = settingsRef.current;
    if (!currentSettings) return;

    const newSettings = { ...currentSettings, ...updates };
    settingsRef.current = newSettings; // Always update the ref for other callbacks

    // Only trigger a full re-render if the update is not silent
    if (!options?.silent) {
        setSettings(newSettings); // Optimistic UI update
    }
    
    try {
      await dataService.saveSettings(newSettings);
    } catch (err) {
      console.error("Failed to save settings:", err);
      settingsRef.current = currentSettings; // Revert ref on failure
      // Only revert state on failure if it was set in the first place
      if (!options?.silent) {
        setSettings(currentSettings);
      }
    }
  }, []); // Stable: relies on ref, not state

  const setLanguage = useCallback((lang: Language) => {
    updateSettings({ language: lang });
  }, [updateSettings]); // Stable

  const t = useCallback((key: string, options?: { [key: string]: string | number }): string => {
    // This is the tricky one. It needs the latest language but should be stable.
    // Using a ref is the classic way to solve this.
    const lang = settingsRef.current?.language || 'english';
    let translation = getNestedTranslation(lang, key);
    if (translation === undefined) {
      console.warn(`Translation key not found for language '${lang}': ${key}. Falling back to English.`);
      translation = getNestedTranslation('english', key);
    }
    if (translation === undefined) {
      console.error(`Translation key not found in English fallback: ${key}`);
      return key;
    }
    if (options) {
      return Object.entries(options).reduce((str, [k, v]) => str.replace(`{${k}}`, String(v)), translation);
    }
    return translation;
  }, []); // Stable

  // This logic must run before the early return to ensure hooks are not called conditionally.
  const language = settings?.language || 'english';
  const locale: Locale = language === 'polish' ? 'pl-PL' : 'en-US';
  
  // Memoize the context value. It's now called on every render, fixing the conditional hook error.
  const value = useMemo(() => ({ 
    language, 
    locale, 
    setLanguage, 
    t, 
    // `settings` can be null here, but the `if (!settings)` check below ensures consumers only render 
    // when `settings` is not null. We can safely assert the type for the context value.
    settings: settings!, 
    updateSettings, 
    reloadAllData 
  }), [language, locale, setLanguage, t, settings, updateSettings, reloadAllData]);

  if (!settings) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <i className="material-icons text-5xl text-gray-400 animate-spin">sync</i>
      </div>
    );
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

// --- Main App Component Structure ---
const AppContent: React.FC<{ isDesktop: boolean }> = ({ isDesktop }) => {
  const { t } = useTranslation();
  const { syncError } = useGoogleDrive();
  
  const NAV_ITEMS: NavItem[] = [
    { path: '/lessons', label: t('nav.lessons'), icon: 'ondemand_video' },
    { path: '/figures', label: t('nav.figures'), icon: 'people' },
    { path: '/settings', label: t('nav.settings'), icon: 'settings' },
  ];

  const settingsNavItem = NAV_ITEMS.find(item => item.path === '/settings');
  if (settingsNavItem && syncError) {
      settingsNavItem.icon = 'notification_important';
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col lg:flex-row overflow-hidden">
      {isDesktop ? (
        <DesktopDrawer navItems={NAV_ITEMS} hasError={!!syncError} />
      ) : null}

      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/lessons" replace />} />
          <Route path="lessons" element={<LessonsGallery />}>
            <Route path="add" element={<AddLessonModal />} />
            <Route path=":lessonId/edit" element={<EditorScreen />} />
            <Route path="categories" element={<CustomizeGroupingScreen />} />
          </Route>
          <Route path="figures" element={<FiguresGallery />}>
            <Route path="add" element={<AddFigureModal />} />
            <Route path="create" element={<EditorScreen />} />
            <Route path=":figureId/edit" element={<EditorScreen />} />
            <Route path="categories" element={<CustomizeGroupingScreen />} />
          </Route>
          <Route path="settings" element={<SettingsView />} />
        </Routes>
      </main>

      {!isDesktop ? (
        <MobileBottomNav navItems={NAV_ITEMS} hasError={!!syncError} />
      ) : null}
    </div>
  );
};

const App: React.FC = () => {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <I18nProvider>
      <GoogleDriveProvider>
        <AppContent isDesktop={isDesktop} />
      </GoogleDriveProvider>
    </I18nProvider>
  );
};

export default App;
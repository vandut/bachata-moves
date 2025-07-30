import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
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
import { VideoSettingsProvider } from './contexts/VideoSettingsContext';
import { dataService } from './data-service';
import { translations } from './i18n';

// --- I18N Provider and Hook ---
type Language = 'english' | 'polish';
type Locale = 'en-US' | 'pl-PL';

interface I18nContextType {
  language: Language;
  locale: Locale;
  settings: AppSettings;
  setLanguage: (lang: Language) => void;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
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

  const reloadAllData = useCallback(() => {
    dataService.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    reloadAllData();
  }, [reloadAllData]);
  
  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    if (!settings) return;

    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    try {
      await dataService.saveSettings(newSettings);
    } catch (err) {
      console.error("Failed to save settings:", err);
      // Optionally revert state on failure
      setSettings(settings);
    }
  }, [settings]);

  const setLanguage = useCallback((lang: Language) => {
    updateSettings({ language: lang });
  }, [updateSettings]);

  const t = useCallback((key: string, options?: { [key: string]: string | number }): string => {
    const lang = settings?.language || 'english';
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
  }, [settings?.language]);

  if (!settings) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <i className="material-icons text-5xl text-gray-400 animate-spin">sync</i>
      </div>
    );
  }
  
  const language = settings.language;
  const locale: Locale = language === 'polish' ? 'pl-PL' : 'en-US';
  const value = { language, locale, setLanguage, t, settings, updateSettings, reloadAllData };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

// --- Main App Component Structure ---
const AppContent: React.FC<{ isDesktop: boolean }> = ({ isDesktop }) => {
  const { t } = useTranslation();
  
  const NAV_ITEMS: NavItem[] = [
    { path: '/lessons', label: t('nav.lessons'), icon: 'ondemand_video' },
    { path: '/figures', label: t('nav.figures'), icon: 'people' },
    { path: '/settings', label: t('nav.settings'), icon: 'settings' },
  ];

  return (
    <div className="h-screen bg-gray-50 flex flex-col lg:flex-row overflow-hidden">
      {isDesktop ? (
        <DesktopDrawer navItems={NAV_ITEMS} />
      ) : null}

      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/lessons" replace />} />
          <Route path="lessons" element={<LessonsGallery />}>
            <Route path="add" element={<AddLessonModal />} />
            <Route path=":lessonId/edit" element={<EditorScreen />} />
          </Route>
          <Route path="figures" element={<FiguresGallery />}>
            <Route path="add" element={<AddFigureModal />} />
            <Route path="create" element={<EditorScreen />} />
            <Route path=":figureId/edit" element={<EditorScreen />} />
          </Route>
          <Route path="settings" element={<SettingsView />} />
        </Routes>
      </main>

      {!isDesktop ? (
        <MobileBottomNav navItems={NAV_ITEMS} />
      ) : null}
    </div>
  );
};

const App: React.FC = () => {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <I18nProvider>
      <VideoSettingsProvider>
        <AppContent isDesktop={isDesktop} />
      </VideoSettingsProvider>
    </I18nProvider>
  );
};

export default App;

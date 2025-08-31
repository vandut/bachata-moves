import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { NavItem } from './types';
import { useMediaQuery } from './hooks/useMediaQuery';
import LessonsGallery from './components/LessonsGallery';
import FiguresGallery from './components/FiguresGallery';
import SettingsView from './components/SettingsView';
import DesktopDrawer from './components/DesktopDrawer';
import MobileBottomNav from './components/MobileBottomNav';
import AddLessonModal from './components/AddLessonModal';
import AddFigureModal from './components/AddFigureModal';
import EditorScreen from './components/EditorScreen';
import CustomizeGroupingScreen from './components/CustomizeCategoriesScreen';
import { GoogleDriveProvider, useGoogleDrive } from './contexts/GoogleDriveContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { I18nProvider, useTranslation } from './contexts/I18nContext';


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
    <SettingsProvider>
      <I18nProvider>
        <GoogleDriveProvider>
          <AppContent isDesktop={isDesktop} />
        </GoogleDriveProvider>
      </I18nProvider>
    </SettingsProvider>
  );
};

export default App;

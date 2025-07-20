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
import PlayerScreen from './components/PlayerScreen';
import EditorScreen from './components/EditorScreen';
import { VideoSettingsProvider } from './contexts/VideoSettingsContext';

const NAV_ITEMS: NavItem[] = [
  { path: '/lessons', label: 'Lessons', icon: 'ondemand_video' },
  { path: '/figures', label: 'Figures', icon: 'people' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

const App: React.FC = () => {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <VideoSettingsProvider>
      <div className="h-screen bg-gray-50 flex flex-col lg:flex-row overflow-hidden">
        {isDesktop ? (
          <DesktopDrawer navItems={NAV_ITEMS} />
        ) : null}

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/lessons" replace />} />
            <Route path="lessons" element={<LessonsGallery />}>
              <Route path="add" element={<AddLessonModal />} />
              <Route path=":lessonId" element={<PlayerScreen />} />
              <Route path=":lessonId/edit" element={<EditorScreen />} />
            </Route>
            <Route path="figures" element={<FiguresGallery />}>
              <Route path="add" element={<AddFigureModal />} />
              <Route path="create" element={<EditorScreen />} />
              <Route path=":figureId" element={<PlayerScreen />} />
              <Route path=":figureId/edit" element={<EditorScreen />} />
            </Route>
            <Route path="settings" element={<SettingsView />} />
          </Routes>
        </main>

        {!isDesktop ? (
          <MobileBottomNav navItems={NAV_ITEMS} />
        ) : null}
      </div>
    </VideoSettingsProvider>
  );
};

export default App;
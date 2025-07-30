import React, { useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { dataService } from '../data-service';
import type { Figure, Lesson, FigureSortOrder } from '../types';
import FigureCard from './FigureCard';
import MobileTopNav from './MobileTopNav';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DesktopTopNav from './DesktopTopNav';
import SortControl from './SortControl';
import { useTranslation } from '../App';
import MuteToggleButton from './MuteToggleButton';

const AddNewCard: React.FC = () => {
  const { t } = useTranslation();
  return (
   <div 
    className="
      relative 
      rounded-lg 
      border-2 border-dashed border-gray-400 
      hover:border-blue-500 hover:text-blue-500 
      transition-all duration-300 
      cursor-pointer 
      group
      bg-gray-50/50 h-full
    "
  >
    <div className="aspect-[9/16] flex items-center justify-center">
      <div className="text-center">
        <i className="material-icons text-7xl text-gray-400 group-hover:text-blue-500 transition-colors duration-300">add_circle_outline</i>
        <p className="mt-2 text-lg font-medium text-gray-600 group-hover:text-blue-500">{t('common.addNew')}</p>
      </div>
    </div>
  </div>
)};

const FiguresGallery: React.FC = () => {
  const { t } = useTranslation();
  const [figures, setFigures] = useState<Figure[]>([]);
  const [lessonsMap, setLessonsMap] = useState<Map<string, Lesson>>(new Map());
  const [sortOrder, setSortOrder] = useState<FigureSortOrder | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const location = useLocation();

  const SORT_OPTIONS = [
    { value: 'newest', label: t('sort.newest') },
    { value: 'oldest', label: t('sort.oldest') },
    { value: 'alphabetical_asc', label: t('sort.alphaAsc') },
    { value: 'alphabetical_desc', label: t('sort.alphaDesc') },
  ];

  const handleSortChange = async (newSortValue: string) => {
    const newSortOrder = newSortValue as FigureSortOrder;
    setSortOrder(newSortOrder);
    try {
      const currentSettings = await dataService.getSettings();
      await dataService.saveSettings({ ...currentSettings, figureSortOrder: newSortOrder });
    } catch(err) {
      console.error("Failed to save figure sort order:", err);
    }
  };

  const refreshFigures = useCallback(() => {
    if (sortOrder === null) return;

    Promise.all([
      dataService.getFigures(),
      dataService.getLessons()
    ]).then(([fetchedFigures, fetchedLessons]) => {
      const lessonIdMap = new Map(fetchedLessons.map(lesson => [lesson.id, lesson]));

      const sortedFigures = [...fetchedFigures].sort((a, b) => {
        const lessonA = lessonIdMap.get(a.lessonId);
        const lessonB = lessonIdMap.get(b.lessonId);

        // Fallback for figures with no lesson data to prevent crashes
        if (!lessonA || !lessonB) {
            if (sortOrder === 'oldest') {
                return parseInt(a.id.split('-')[0], 10) - parseInt(b.id.split('-')[0], 10);
            }
            return parseInt(b.id.split('-')[0], 10) - parseInt(a.id.split('-')[0], 10);
        }

        switch (sortOrder) {
          case 'newest':
          default: {
            const dateComparison = new Date(lessonB.uploadDate).getTime() - new Date(lessonA.uploadDate).getTime();
            if (dateComparison !== 0) return dateComparison;
            
            const idComparison = parseInt(lessonB.id.split('-')[0], 10) - parseInt(lessonA.id.split('-')[0], 10);
            if (idComparison !== 0) return idComparison;

            return b.startTime - a.startTime;
          }
          case 'oldest': {
            const dateComparison = new Date(lessonA.uploadDate).getTime() - new Date(lessonB.uploadDate).getTime();
            if (dateComparison !== 0) return dateComparison;

            const idComparison = parseInt(lessonA.id.split('-')[0], 10) - parseInt(lessonB.id.split('-')[0], 10);
            if (idComparison !== 0) return idComparison;

            return a.startTime - b.startTime;
          }
          case 'alphabetical_asc':
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          case 'alphabetical_desc':
            return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
        }
      });
      
      setFigures(sortedFigures);
      setLessonsMap(lessonIdMap);
    }).catch(console.error);
  }, [sortOrder]);
  
  useEffect(() => {
    if (location.pathname === '/figures') {
        dataService.getSettings().then(settings => {
            setSortOrder(settings.figureSortOrder);
        });
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname === '/figures' && sortOrder !== null) {
        refreshFigures();
    }
  }, [location.pathname, sortOrder, refreshFigures]);
  
  const intelligentRefresh = useCallback(() => {
    if (sortOrder) {
      refreshFigures();
    } else {
      dataService.getSettings().then(settings => {
        setSortOrder(settings.figureSortOrder);
      });
    }
  }, [sortOrder, refreshFigures]);


  const outletContext = { refresh: intelligentRefresh, isMobile };
  const isChildRouteActive = location.pathname !== '/figures';
  const pageTitle = t('nav.figures');

  if (lessonsMap.size === 0 && figures.length > 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <i className="material-icons text-5xl text-gray-400 animate-spin">sync</i>
        <span className="ml-4 text-xl text-gray-600">{t('gallery.loading', { item: t('gallery.figures') })}</span>
      </div>
    );
  }

  const actionMenu = (
    <div className="flex items-center space-x-2">
      <MuteToggleButton />
      <SortControl
        options={SORT_OPTIONS}
        value={sortOrder || 'newest'}
        onChange={handleSortChange}
      />
    </div>
  );
  
  // --- Mobile View ---
  if (isMobile) {
    if (isChildRouteActive) {
      return <Outlet context={outletContext} />;
    } else {
      return (
        <>
          <MobileTopNav title={pageTitle} />
          <div className="px-4 pt-4 pb-2 flex justify-end">
            {actionMenu}
          </div>
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              {figures.map((figure) => (
                <FigureCard 
                  key={figure.id} 
                  figure={figure} 
                  parentLesson={lessonsMap.get(figure.lessonId)} 
                  onRefresh={refreshFigures}
                />
              ))}
              <Link to="add" aria-label={t('common.addNew')}>
                <AddNewCard />
              </Link>
            </div>
          </div>
        </>
      );
    }
  } else {
    // --- Desktop View ---
    const galleryContent = (
      <div className="p-8">
        <DesktopTopNav title={pageTitle} rightAction={actionMenu} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-6">
          {figures.map((figure) => (
            <FigureCard 
              key={figure.id} 
              figure={figure} 
              parentLesson={lessonsMap.get(figure.lessonId)} 
              onRefresh={refreshFigures}
            />
          ))}
          <Link to="add" aria-label={t('common.addNew')}>
            <AddNewCard />
          </Link>
        </div>
      </div>
    );
    
    if (isChildRouteActive) {
      return (
         <>
          {galleryContent}
          <Outlet context={outletContext} />
        </>
      );
    } else {
      return galleryContent;
    }
  }
};

export default FiguresGallery;
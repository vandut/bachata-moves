import React, { useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { dataService } from '../data-service';
import type { Figure, Lesson, FigureSortOrder } from '../types';
import FigureCard from './FigureCard';
import MobileTopNav from './MobileTopNav';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DesktopTopNav from './DesktopTopNav';
import SortControl from './SortControl';

const AddNewCard: React.FC = () => (
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
        <p className="mt-2 text-lg font-medium text-gray-600 group-hover:text-blue-500">Add New</p>
      </div>
    </div>
  </div>
);

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'alphabetical_asc', label: 'Alphabetical (A-Z)' },
  { value: 'alphabetical_desc', label: 'Alphabetical (Z-A)' },
];


const FiguresGallery: React.FC = () => {
  const [figures, setFigures] = useState<Figure[]>([]);
  const [lessonsMap, setLessonsMap] = useState<Map<string, Lesson>>(new Map());
  const [sortOrder, setSortOrder] = useState<FigureSortOrder | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const location = useLocation();

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
        switch (sortOrder) {
          case 'oldest':
            // The id is `timestamp-random`. We parse the timestamp.
            return parseInt(a.id.split('-')[0], 10) - parseInt(b.id.split('-')[0], 10);
          case 'alphabetical_asc':
            return a.name.localeCompare(b.name);
          case 'alphabetical_desc':
            return b.name.localeCompare(a.name);
          case 'newest':
          default:
            return parseInt(b.id.split('-')[0], 10) - parseInt(a.id.split('-')[0], 10);
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


  const outletContext = { refresh: intelligentRefresh, isMobile, itemIds: figures.map(f => f.id) };
  const isChildRouteActive = location.pathname !== '/figures';

  const sortControl = (
    <SortControl
      options={SORT_OPTIONS}
      value={sortOrder || 'newest'}
      onChange={handleSortChange}
    />
  );
  
  // --- Mobile View ---
  if (isMobile) {
    if (isChildRouteActive) {
      return <Outlet context={outletContext} />;
    } else {
      return (
        <>
          <MobileTopNav title="Figures" />
          <div className="px-4 pt-4 pb-2 flex justify-end">
            {sortControl}
          </div>
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              {figures.map((figure) => (
                <FigureCard 
                  key={figure.id} 
                  figure={figure} 
                  parentLesson={lessonsMap.get(figure.lessonId)} 
                />
              ))}
              <Link to="add" aria-label="Add new figure">
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
        <DesktopTopNav title="Figures" rightAction={sortControl} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-6">
          {figures.map((figure) => (
            <FigureCard 
              key={figure.id} 
              figure={figure} 
              parentLesson={lessonsMap.get(figure.lessonId)} 
            />
          ))}
          <Link to="add" aria-label="Add new figure">
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
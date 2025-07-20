import React, { useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { dataService } from '../data-service';
import type { Lesson, LessonSortOrder } from '../types';
import LessonCard from './LessonCard';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MobileTopNav from './MobileTopNav';
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
];

const LessonsGallery: React.FC = () => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<LessonSortOrder | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const location = useLocation();
  
  const handleSortChange = async (newSortValue: string) => {
    const newSortOrder = newSortValue as LessonSortOrder;
    setSortOrder(newSortOrder);
    try {
      const currentSettings = await dataService.getSettings();
      await dataService.saveSettings({ ...currentSettings, lessonSortOrder: newSortOrder });
    } catch (err) {
      console.error("Failed to save lesson sort order:", err);
    }
  };

  const refreshLessons = useCallback(() => {
    if (sortOrder === null) return; // Don't refresh if sort order isn't loaded yet
    
    setIsLoading(true);
    dataService.getLessons()
      .then(fetchedLessons => {
        const sorted = [...fetchedLessons].sort((a, b) => {
          const dateA = new Date(a.uploadDate).getTime();
          const dateB = new Date(b.uploadDate).getTime();
          return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });
        setLessons(sorted);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [sortOrder]);
  
  // Effect to load settings on initial mount or when returning to the gallery
  useEffect(() => {
    if (location.pathname === '/lessons') {
      dataService.getSettings().then(settings => {
        setSortOrder(settings.lessonSortOrder);
      });
    }
  }, [location.pathname]);

  // Effect to refresh data when sort order changes
  useEffect(() => {
    if (location.pathname === '/lessons' && sortOrder !== null) {
      refreshLessons();
    }
  }, [location.pathname, sortOrder, refreshLessons]);

  const intelligentRefresh = useCallback(() => {
    if (sortOrder) {
      refreshLessons();
    } else {
      // If a child route calls refresh before settings are loaded, load them first.
      // This will then trigger the other useEffect to perform the refresh.
      dataService.getSettings().then(settings => {
        setSortOrder(settings.lessonSortOrder);
      });
    }
  }, [sortOrder, refreshLessons]);


  const outletContext = { refresh: intelligentRefresh, isMobile, itemIds: lessons.map(l => l.id) };
  const isChildRouteActive = location.pathname !== '/lessons';

  if (isLoading && lessons.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <i className="material-icons text-5xl text-gray-400 animate-spin">sync</i>
        <span className="ml-4 text-xl text-gray-600">Loading Lessons...</span>
      </div>
    );
  }

  const sortControl = (
    <SortControl
      options={SORT_OPTIONS}
      value={sortOrder || 'newest'}
      onChange={handleSortChange}
    />
  );

  // --- Mobile View ---
  // On mobile, child routes replace the gallery view.
  if (isMobile) {
    if (isChildRouteActive) {
      return <Outlet context={outletContext} />;
    } else {
      return (
        <>
          <MobileTopNav title="Lessons" />
          <div className="px-4 pt-4 pb-2 flex justify-end">
            {sortControl}
          </div>
          <div className="px-4 pt-2 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                  {lessons.map((lesson) => (
                      <LessonCard key={lesson.id} lesson={lesson} />
                  ))}
                  <Link to="add" aria-label="Add new lesson">
                      <AddNewCard />
                  </Link>
              </div>
          </div>
        </>
      );
    }
  } else {
    // --- Desktop View ---
    // On desktop, the gallery is always visible, and child routes render as an overlay.
    const galleryContent = (
      <div className="p-8">
        <DesktopTopNav title="Lessons" rightAction={sortControl} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-6">
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
          <Link to="add" aria-label="Add new lesson">
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

export default LessonsGallery;
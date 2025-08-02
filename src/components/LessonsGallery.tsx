import React, { useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { dataService } from '../data-service';
import type { Lesson, LessonSortOrder } from '../types';
import LessonCard from './LessonCard';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MobileTopNav from './MobileTopNav';
import DesktopTopNav from './DesktopTopNav';
import SortControl from './SortControl';
import { useTranslation } from '../App';
import MuteToggleButton from './MuteToggleButton';
import GroupingControl from './GroupingControl';

const LessonsGallery: React.FC = () => {
  const { t, settings, updateSettings } = useTranslation();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const location = useLocation();
  const navigate = useNavigate();

  const SORT_OPTIONS = [
    { value: 'newest', label: t('sort.newest') },
    { value: 'oldest', label: t('sort.oldest') },
  ];
  
  const GROUPING_OPTIONS = [
      { value: 'none', label: t('grouping.none') },
  ];

  const handleSortChange = async (newSortValue: string) => {
    const newSortOrder = newSortValue as LessonSortOrder;
    try {
      await updateSettings({ lessonSortOrder: newSortOrder });
    } catch (err) {
      console.error("Failed to save lesson sort order:", err);
    }
  };
  
  const handleGroupingChange = async (newGroupingValue: string) => {
      // For lessons, only 'none' is supported, but we keep the structure for consistency.
      await updateSettings({ lessonGrouping: newGroupingValue as 'none' });
  };

  const refreshLessons = useCallback(() => {
    if (!settings) return;
    
    setIsLoading(true);
    dataService.getLessons()
      .then(fetchedLessons => {
        const sorted = [...fetchedLessons].sort((a, b) => {
          const dateA = new Date(a.uploadDate).getTime();
          const dateB = new Date(b.uploadDate).getTime();
          
          if (dateA !== dateB) {
            return settings.lessonSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
          }
          
          const idA = parseInt(a.id.split('-')[0], 10);
          const idB = parseInt(b.id.split('-')[0], 10);
          return settings.lessonSortOrder === 'newest' ? idB - idA : idA - idB;
        });
        setLessons(sorted);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [settings]);
  
  useEffect(() => {
    if (location.pathname === '/lessons' && settings) {
      refreshLessons();
    }
  }, [location.pathname, settings, refreshLessons]);

  const intelligentRefresh = refreshLessons;

  const handleAddClick = () => {
    navigate('/lessons/add');
  };

  const outletContext = { refresh: intelligentRefresh, isMobile };
  const isChildRouteActive = location.pathname !== '/lessons';
  const pageTitle = t('nav.lessons');

  if (isLoading && lessons.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <i className="material-icons text-5xl text-gray-400 animate-spin">sync</i>
        <span className="ml-4 text-xl text-gray-600">{t('gallery.loading', { item: t('gallery.lessons') })}</span>
      </div>
    );
  }

  const actionMenu = (
    <div className="flex items-center space-x-2">
      <button
        onClick={handleAddClick}
        className="inline-flex items-center justify-center w-10 h-10 rounded-md border border-transparent shadow-sm bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        aria-label={t('common.addNew')}
      >
        <i className="material-icons">add</i>
      </button>
      <MuteToggleButton />
      <GroupingControl
        options={GROUPING_OPTIONS}
        value={settings.lessonGrouping}
        onChange={handleGroupingChange}
        onAction={() => {}}
        isMobile={isMobile}
      />
      <SortControl
        options={SORT_OPTIONS}
        value={settings.lessonSortOrder}
        onChange={handleSortChange}
        isMobile={isMobile}
      />
    </div>
  );
  
  const itemIds = lessons.map(l => l.id);
  const baseRoute = '/lessons';
  const gridClass = isMobile ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]";

  const galleryGrid = (
    <div className={`grid ${gridClass} gap-6`}>
        {lessons.map((lesson) => (
            <LessonCard 
              key={lesson.id} 
              lesson={lesson} 
              onRefresh={refreshLessons}
              itemIds={itemIds}
              baseRoute={baseRoute}
            />
        ))}
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
              {galleryGrid}
          </div>
        </>
      );
    }
  } else {
    // --- Desktop View ---
    const galleryContent = (
      <div className="p-8">
        <DesktopTopNav title={pageTitle} rightAction={actionMenu} />
        {galleryGrid}
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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { dataService } from '../data/service';
import type { Lesson, LessonSortOrder, LessonCategory, AppSettings } from '../types';
import LessonCard from './LessonCard';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MobileTopNav from './MobileTopNav';
import DesktopTopNav from './DesktopTopNav';
import SortControl from './SortControl';
import { useTranslation } from '../App';
import EmptyState from './EmptyState';
import MuteToggleButton from './MuteToggleButton';
import GroupingControl from './GroupingControl';
import SyncStatus from './SyncStatus';
import { useGoogleDrive } from '../hooks/useGoogleDrive';

const UNCATEGORIZED_ID = '__uncategorized__';

const EmptyCategoryMessage: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="text-center py-6 px-4 text-gray-500 bg-gray-100 rounded-lg border border-dashed border-gray-300">
            <p className="text-sm max-w-sm mx-auto">{t('gallery.emptyCategory')}</p>
        </div>
    );
};

const getGroupInfo = (dateString: string, grouping: 'byMonth' | 'byYear', locale: string) => {
    const date = new Date(dateString);
    if (grouping === 'byYear') {
        const year = date.getFullYear();
        return {
            key: `${year}`,
            header: `${year}`
        };
    }
    // byMonth
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const monthName = date.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
        key: `${year}-${String(month).padStart(2, '0')}`, // e.g., "2024-06" for sorting
        header: monthName
    };
};

const CategoryHeader: React.FC<{ name: string; isExpanded?: boolean; onToggle?: () => void; count?: number; }> = ({ name, isExpanded, onToggle, count }) => {
    const isCollapsible = onToggle !== undefined && isExpanded !== undefined;
    return (
        <div
            className={`flex items-center my-4 ${isCollapsible ? 'cursor-pointer group' : ''}`}
            onClick={isCollapsible ? onToggle : undefined}
            role={isCollapsible ? 'button' : undefined}
            tabIndex={isCollapsible ? 0 : undefined}
            aria-expanded={isCollapsible ? isExpanded : undefined}
            onKeyDown={(e) => isCollapsible && (e.key === 'Enter' || e.key === ' ') && onToggle()}
        >
            <div className={`flex items-center text-gray-600 ${isCollapsible ? 'group-hover:text-gray-800' : ''} transition-colors`}>
                {isCollapsible ? (
                    <i className={`material-icons transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                        chevron_right
                    </i>
                ) : <div className="w-6" />}
                <h2 className={`text-xl font-semibold ml-2 ${name.match(/^[a-z]/) ? 'capitalize' : ''}`}>
                    {name}
                    {typeof count === 'number' && (
                        <span className="ml-2">({count})</span>
                    )}
                </h2>
            </div>
            <div className={`flex-grow border-t border-gray-300 ${isCollapsible ? 'group-hover:border-gray-400' : ''} transition-colors ml-4`}></div>
        </div>
    );
};

const LessonGrid: React.FC<{
    lessons: Lesson[];
    lessonCategories: LessonCategory[];
    onRefresh: () => void;
    baseRoute: string;
    allLessonIds: string[];
    onForceDelete?: (item: Lesson) => Promise<void>;
}> = ({ lessons, lessonCategories, onRefresh, baseRoute, allLessonIds, onForceDelete }) => {
    const gridClass = useMediaQuery('(max-width: 768px)') ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]";
    return (
        <div className={`grid ${gridClass} gap-6`}>
            {lessons.map((lesson) => (
                <LessonCard 
                    key={`${lesson.id}-${lesson.modifiedTime || ''}`} 
                    lesson={lesson}
                    lessonCategories={lessonCategories}
                    onRefresh={onRefresh}
                    itemIds={allLessonIds}
                    baseRoute={baseRoute}
                    onForceDelete={onForceDelete}
                />
            ))}
        </div>
    );
};


const LessonsGallery: React.FC = () => {
  const { t, settings, updateSettings, reloadAllData, locale } = useTranslation();
  const { isSignedIn, initiateSync, forceDeleteItem } = useGoogleDrive();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonCategories, setLessonCategories] = useState<LessonCategory[]>([]);
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
    { value: 'byMonth', label: t('grouping.byMonth') },
    { value: 'byYear', label: t('grouping.byYear') },
    { value: 'byCategory', label: t('grouping.byCategory') },
    { value: 'divider', label: '-', isDivider: true },
    { value: 'customize', label: t('grouping.customize'), isAction: true },
  ];

  const handleSortChange = async (newSortValue: string) => {
    const newSortOrder = newSortValue as LessonSortOrder;
    await updateSettings({ lessonSortOrder: newSortOrder });
  };

  const handleGroupingChange = async (newGroupingValue: string) => {
    await updateSettings({ lessonGrouping: newGroupingValue as AppSettings['lessonGrouping'] });
  };

  const handleGroupingAction = (action: string) => {
      if (action === 'customize') {
          navigate('/lessons/categories');
      }
  };

  const handleToggleCategory = async (categoryId: string) => {
    const currentCollapsed = settings.collapsedLessonCategories || [];
    const isCollapsed = currentCollapsed.includes(categoryId);
    const newCollapsedKeys = isCollapsed
      ? currentCollapsed.filter(key => key !== categoryId)
      : [...currentCollapsed, categoryId];
    await updateSettings({ collapsedLessonCategories: newCollapsedKeys });
  };
  
  const handleToggleUncategorized = () => {
    updateSettings({ uncategorizedLessonCategoryIsExpanded: !settings.uncategorizedLessonCategoryIsExpanded });
  };

  const handleToggleDateGroup = (groupKey: string) => {
    const currentCollapsed = settings.collapsedLessonDateGroups || [];
    const isCurrentlyCollapsed = currentCollapsed.includes(groupKey);

    const newCollapsedKeys = isCurrentlyCollapsed
      ? currentCollapsed.filter(key => key !== groupKey)
      : [...currentCollapsed, groupKey];

    updateSettings({ collapsedLessonDateGroups: newCollapsedKeys });
  };

  const sortLessons = (lessonsToSort: Lesson[], sortOrder: LessonSortOrder): Lesson[] => {
      return [...lessonsToSort].sort((a, b) => {
        const dateA = new Date(a.uploadDate).getTime();
        const dateB = new Date(b.uploadDate).getTime();
        
        if (dateA !== dateB) {
          return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        }
        
        const idA = parseInt(a.id.split('-')[0], 10);
        const idB = parseInt(b.id.split('-')[0], 10);
        return sortOrder === 'newest' ? idB - idA : idA - idB;
      });
  };

  const refreshGallery = useCallback(() => {
    setIsLoading(true);
    Promise.all([
        dataService.getLessons(),
        dataService.getLessonCategories(),
    ]).then(([fetchedLessons, fetchedCategories]) => {
        setLessons(fetchedLessons);
        setLessonCategories(fetchedCategories);
    }).catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);
  
  // Effect for initial load and sync initiation
  useEffect(() => {
    if (location.pathname === '/lessons') {
      reloadAllData();
      refreshGallery();
      if (isSignedIn && !location.state?.skipSync) {
        initiateSync('lesson');
      }
    }
  }, [location.pathname, isSignedIn, location.state]);
  
  // Effect for live updates from data service
  useEffect(() => {
    const unsubscribe = dataService.subscribe(refreshGallery);
    return () => unsubscribe();
  }, [refreshGallery]);

  const allSortedLessons = useMemo(() => {
    return sortLessons(lessons, settings.lessonSortOrder);
  }, [lessons, settings.lessonSortOrder]);

  const { categorized: categorizedLessons, new: uncategorizedLessons } = useMemo(() => {
    const grouped: { [key: string]: Lesson[] } = {};
    lessonCategories.forEach(c => {
        grouped[c.id] = [];
    });
    
    const uncategorized: Lesson[] = [];

    for (const lesson of lessons) {
      if (lesson.categoryId && grouped.hasOwnProperty(lesson.categoryId)) {
        grouped[lesson.categoryId].push(lesson);
      } else {
        uncategorized.push(lesson);
      }
    }

    const sortedCategorized: { [key: string]: Lesson[] } = {};
    for (const categoryId in grouped) {
        sortedCategorized[categoryId] = sortLessons(grouped[categoryId], settings.lessonSortOrder);
    }
    
    const sortedNew = sortLessons(uncategorized, settings.lessonSortOrder);
    
    return { categorized: sortedCategorized, new: sortedNew };

  }, [lessons, lessonCategories, settings.lessonSortOrder]);

  const dateBasedGroupedLessons = useMemo(() => {
    if (settings.lessonGrouping !== 'byMonth' && settings.lessonGrouping !== 'byYear') {
        return { groups: new Map(), groupOrder: [] };
    }

    const grouped = new Map<string, { header: string; lessons: Lesson[] }>();

    for (const lesson of allSortedLessons) {
        const { key, header } = getGroupInfo(lesson.uploadDate, settings.lessonGrouping, locale);
        if (!grouped.has(key)) {
            grouped.set(key, { header, lessons: [] });
        }
        grouped.get(key)!.lessons.push(lesson);
    }
    
    const groupOrder = [...grouped.keys()].sort((a, b) => {
        return settings.lessonSortOrder === 'newest' ? b.localeCompare(a) : a.localeCompare(b);
    });

    return { groups: grouped, groupOrder };
  }, [allSortedLessons, settings.lessonGrouping, settings.lessonSortOrder, locale]);


  const displayItems = useMemo(() => {
    const categoryMap = new Map(lessonCategories.map(c => [c.id, c]));
    const orderedItems: ({ id: string; isUncategorized: true } | LessonCategory)[] = [];
    
    let order = settings.lessonCategoryOrder && settings.lessonCategoryOrder.length > 0
        ? settings.lessonCategoryOrder
        : [UNCATEGORIZED_ID, ...lessonCategories.map(c => c.id).sort((a,b) => a.localeCompare(b))];
    
    const allKnownIds = new Set([UNCATEGORIZED_ID, ...lessonCategories.map(c => c.id)]);
    const orderSet = new Set(order);

    if (order.length < allKnownIds.size) {
        const missingIds = [...allKnownIds].filter(id => !orderSet.has(id));
        order = [...order, ...missingIds];
    }
    
    for (const id of order) {
        if (id === UNCATEGORIZED_ID) {
            orderedItems.push({ id: UNCATEGORIZED_ID, isUncategorized: true });
        } else {
            const category = categoryMap.get(id);
            if (category) {
                orderedItems.push(category);
            }
        }
    }
    return orderedItems;
  }, [lessonCategories, settings.lessonCategoryOrder]);


  const handleAddClick = () => navigate('/lessons/add');
  const outletContext = { refresh: refreshGallery, isMobile };
  const isChildRouteActive = location.pathname !== '/lessons';
  const pageTitle = t('nav.lessons');

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
      {isSignedIn && <SyncStatus />}
      <GroupingControl
        options={GROUPING_OPTIONS}
        value={settings.lessonGrouping}
        onChange={handleGroupingChange}
        onAction={handleGroupingAction}
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
  
  const baseRoute = '/lessons';
  const allLessonIds = useMemo(() => allSortedLessons.map(l => l.id), [allSortedLessons]);
  const onForceDelete = isSignedIn ? forceDeleteItem : undefined;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <i className="material-icons text-5xl text-gray-400 animate-spin">sync</i>
          <span className="ml-4 text-xl text-gray-600">{t('gallery.loading', { item: t('gallery.lessons') })}</span>
        </div>
      );
    }
    
    if (lessons.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon="ondemand_video"
            title={t('gallery.emptyLessonsTitle')}
            description={t('gallery.emptyLessonsDescription')}
            actionText={t('gallery.addFirstLesson')}
            onAction={handleAddClick}
          />
        </div>
      );
    }

    if (settings.lessonGrouping === 'byMonth' || settings.lessonGrouping === 'byYear') {
      const { groups, groupOrder } = dateBasedGroupedLessons;
      return (
          <div>
              {groupOrder.map(groupKey => {
                  const group = groups.get(groupKey)!;
                  if (!group || group.lessons.length === 0) return null;
                  
                  const isExpanded = !(settings.collapsedLessonDateGroups || []).includes(groupKey);

                  return (
                      <div key={groupKey}>
                          <CategoryHeader
                              name={group.header}
                              count={settings.showLessonCountInGroupHeaders ? group.lessons.length : undefined}
                              isExpanded={isExpanded}
                              onToggle={() => handleToggleDateGroup(groupKey)}
                          />
                          {isExpanded && (
                            <div className="pt-2 pb-6">
                                <LessonGrid
                                    lessons={group.lessons}
                                    lessonCategories={lessonCategories}
                                    onRefresh={refreshGallery}
                                    baseRoute={baseRoute}
                                    allLessonIds={allLessonIds}
                                    onForceDelete={onForceDelete}
                                />
                            </div>
                          )}
                      </div>
                  );
              })}
          </div>
      );
    }
    
    if (settings.lessonGrouping === 'byCategory') {
      return (
        <div>
          {displayItems.map(item => {
            if ('isUncategorized' in item) {
              const count = uncategorizedLessons.length;
              const showGroup = count > 0 || settings.showEmptyLessonCategoriesInGroupedView;
              if (!showGroup) return null;
              
              return (
                <div key={item.id}>
                    <CategoryHeader 
                        name={t('common.uncategorized')} 
                        isExpanded={settings.uncategorizedLessonCategoryIsExpanded} 
                        onToggle={handleToggleUncategorized} 
                        count={settings.showLessonCountInGroupHeaders ? count : undefined}
                    />
                    {settings.uncategorizedLessonCategoryIsExpanded && (
                        <div className="pt-2 pb-6">
                            {count > 0 ? (
                                <LessonGrid
                                    lessons={uncategorizedLessons}
                                    lessonCategories={lessonCategories}
                                    onRefresh={refreshGallery}
                                    baseRoute={baseRoute}
                                    allLessonIds={allLessonIds}
                                    onForceDelete={onForceDelete}
                                />
                            ) : (
                                <EmptyCategoryMessage />
                            )}
                        </div>
                    )}
                </div>
              );
            } else {
              const category = item;
              const categoryLessons = categorizedLessons[category.id] || [];
              const count = categoryLessons.length;
              const showGroup = count > 0 || settings.showEmptyLessonCategoriesInGroupedView;
              if (!showGroup) return null;

              const isExpanded = !(settings.collapsedLessonCategories || []).includes(category.id);

              return (
                <div key={category.id}>
                  <CategoryHeader 
                      name={category.name} 
                      isExpanded={isExpanded} 
                      onToggle={() => handleToggleCategory(category.id)}
                      count={settings.showLessonCountInGroupHeaders ? count : undefined}
                  />
                  {isExpanded && (
                      <div className="pt-2 pb-6">
                         {count > 0 ? (
                             <LessonGrid
                                  lessons={categoryLessons}
                                  lessonCategories={lessonCategories}
                                  onRefresh={refreshGallery}
                                  baseRoute={baseRoute}
                                  allLessonIds={allLessonIds}
                                  onForceDelete={onForceDelete}
                              />
                         ) : (
                              <EmptyCategoryMessage />
                         )}
                      </div>
                  )}
                </div>
              );
            }
          })}
        </div>
      );
    }

    return (
      <div className="pt-2 pb-6">
        <LessonGrid
            lessons={allSortedLessons}
            lessonCategories={lessonCategories}
            onRefresh={refreshGallery}
            baseRoute={baseRoute}
            allLessonIds={allLessonIds}
            onForceDelete={onForceDelete}
        />
      </div>
    );
  };

  // --- Mobile View ---
  if (isMobile) {
    if (isChildRouteActive) {
      return <Outlet context={outletContext} />;
    } else {
      return (
        <div className="h-full flex flex-col">
          <MobileTopNav title={pageTitle} />
          <div className="px-4 pt-4 pb-2 flex justify-end">
            {actionMenu}
          </div>
          <div className="px-4 pt-2 pb-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      );
    }
  } else {
    // --- Desktop View ---
    const galleryContent = (
      <div className="p-8 h-full flex flex-col">
        <DesktopTopNav title={pageTitle} rightAction={actionMenu} />
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-2 -m-2">
          {renderContent()}
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
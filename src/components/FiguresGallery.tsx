
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { dataService } from '../data/service';
import type { Figure, Lesson, FigureSortOrder, FigureCategory, AppSettings } from '../types';
import FigureCard from './FigureCard';
import MobileTopNav from './MobileTopNav';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DesktopTopNav from './DesktopTopNav';
import SortControl from './SortControl';
import { useTranslation } from '../App';
import MuteToggleButton from './MuteToggleButton';
import GroupingControl from './GroupingControl';
import EmptyState from './EmptyState';
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

const FigureGrid: React.FC<{
    figures: Figure[];
    lessonsMap: Map<string, Lesson>;
    figureCategories: FigureCategory[];
    onRefresh: () => void;
    baseRoute: string;
    allFigureIds: string[];
    onForceDelete?: (item: Figure) => Promise<void>;
}> = ({ figures, lessonsMap, figureCategories, onRefresh, baseRoute, allFigureIds, onForceDelete }) => {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-6">
            {figures.map((figure) => (
                <FigureCard 
                    key={`${figure.id}-${figure.modifiedTime || ''}`} 
                    figure={figure} 
                    parentLesson={lessonsMap.get(figure.lessonId)} 
                    figureCategories={figureCategories}
                    onRefresh={onRefresh}
                    itemIds={allFigureIds}
                    baseRoute={baseRoute}
                    onForceDelete={onForceDelete}
                />
            ))}
        </div>
    );
};


const FiguresGallery: React.FC = () => {
  const { t, settings, updateSettings, reloadAllData, locale } = useTranslation();
  const { isSignedIn, initiateSync, forceDeleteItem } = useGoogleDrive();
  const [figures, setFigures] = useState<Figure[]>([]);
  const [lessonsMap, setLessonsMap] = useState<Map<string, Lesson>>(new Map());
  const [figureCategories, setFigureCategories] = useState<FigureCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState(settings.collapsedFigureCategories || []);
  const [isUncategorizedExpanded, setIsUncategorizedExpanded] = useState(settings.uncategorizedFigureCategoryIsExpanded);
  const [collapsedDateGroups, setCollapsedDateGroups] = useState(settings.collapsedFigureDateGroups || []);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const location = useLocation();
  const navigate = useNavigate();

  // Sync with global settings
  useEffect(() => {
    setCollapsedCategories(settings.collapsedFigureCategories || []);
    setIsUncategorizedExpanded(settings.uncategorizedFigureCategoryIsExpanded);
    setCollapsedDateGroups(settings.collapsedFigureDateGroups || []);
  }, [settings.collapsedFigureCategories, settings.uncategorizedFigureCategoryIsExpanded, settings.collapsedFigureDateGroups]);

  const SORT_OPTIONS = [
    { value: 'newest', label: t('sort.newest') },
    { value: 'oldest', label: t('sort.oldest') },
    { value: 'alphabetical_asc', label: t('sort.alphaAsc') },
    { value: 'alphabetical_desc', label: t('sort.alphaDesc') },
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
    const newSortOrder = newSortValue as FigureSortOrder;
    try {
      await updateSettings({ figureSortOrder: newSortOrder });
    } catch(err) {
      console.error("Failed to save figure sort order:", err);
    }
  };

  const handleGroupingChange = async (newGroupingValue: string) => {
      await updateSettings({ figureGrouping: newGroupingValue as AppSettings['figureGrouping'] });
  };
  
  const handleGroupingAction = (action: string) => {
      if (action === 'customize') {
          navigate('/figures/categories');
      }
  };

  const handleToggleCategory = (categoryId: string) => {
    const isCollapsed = collapsedCategories.includes(categoryId);
    const newCollapsedKeys = isCollapsed
      ? collapsedCategories.filter(key => key !== categoryId)
      : [...collapsedCategories, categoryId];
    setCollapsedCategories(newCollapsedKeys);
    updateSettings({ collapsedFigureCategories: newCollapsedKeys }, { silent: true });
  };
  
  const handleToggleUncategorized = () => {
    const newExpandedState = !isUncategorizedExpanded;
    setIsUncategorizedExpanded(newExpandedState);
    updateSettings({ uncategorizedFigureCategoryIsExpanded: newExpandedState }, { silent: true });
  };

  const handleToggleDateGroup = (groupKey: string) => {
    const isCurrentlyCollapsed = collapsedDateGroups.includes(groupKey);

    const newCollapsedKeys = isCurrentlyCollapsed
      ? collapsedDateGroups.filter(key => key !== groupKey)
      : [...collapsedDateGroups, groupKey];

    setCollapsedDateGroups(newCollapsedKeys);
    updateSettings({ collapsedFigureDateGroups: newCollapsedKeys }, { silent: true });
  };

  const sortFigures = (figuresToSort: Figure[], lessonDataMap: Map<string, Lesson>, currentSortOrder: FigureSortOrder): Figure[] => {
    return [...figuresToSort].sort((a, b) => {
        const lessonA = lessonDataMap.get(a.lessonId);
        const lessonB = lessonDataMap.get(b.lessonId);

        if (!lessonA || !lessonB) {
            return currentSortOrder === 'oldest' 
                ? parseInt(a.id.split('-')[0], 10) - parseInt(b.id.split('-')[0], 10)
                : parseInt(b.id.split('-')[0], 10) - parseInt(a.id.split('-')[0], 10);
        }

        switch (currentSortOrder) {
            case 'oldest': {
                const dateComp = new Date(lessonA.uploadDate).getTime() - new Date(lessonB.uploadDate).getTime();
                if (dateComp !== 0) return dateComp;
                const idComp = parseInt(lessonA.id.split('-')[0], 10) - parseInt(lessonB.id.split('-')[0], 10);
                if (idComp !== 0) return idComp;
                return a.startTime - b.startTime;
            }
            case 'alphabetical_asc':
                return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            case 'alphabetical_desc':
                return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
            case 'newest':
            default: {
                const dateComp = new Date(lessonB.uploadDate).getTime() - new Date(lessonA.uploadDate).getTime();
                if (dateComp !== 0) return dateComp;
                const idComp = parseInt(lessonB.id.split('-')[0], 10) - parseInt(lessonA.id.split('-')[0], 10);
                if (idComp !== 0) return idComp;
                return b.startTime - a.startTime;
            }
        }
    });
  };

  const refreshGalleries = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      dataService.getFigures(),
      dataService.getLessons(),
      dataService.getFigureCategories(),
      // No need to get settings again as they are in the context
    ]).then(([fetchedFigures, fetchedLessons, fetchedCategories]) => {
      const lessonIdMap = new Map(fetchedLessons.map(lesson => [lesson.id, lesson]));
      setFigures(fetchedFigures);
      setLessonsMap(lessonIdMap);
      setFigureCategories(fetchedCategories);
    }).catch(console.error)
    .finally(() => setIsLoading(false));
  }, []);
  
  // Effect for initial load and sync initiation
  useEffect(() => {
    if (location.pathname === '/figures') {
        reloadAllData(); 
        refreshGalleries();
        if (isSignedIn && !location.state?.skipSync) {
          initiateSync('figure');
        }
    }
  }, [location.pathname, isSignedIn, location.state]);

  // Effect for live updates from data service
  useEffect(() => {
    const unsubscribe = dataService.subscribe(refreshGalleries);
    return () => unsubscribe();
  }, [refreshGalleries]);
  
  const intelligentRefresh = refreshGalleries;

  const allSortedFigures = useMemo(() => {
    return sortFigures(figures, lessonsMap, settings.figureSortOrder);
  }, [figures, lessonsMap, settings.figureSortOrder]);

  const { categorized: categorizedFigures, new: uncategorizedFigures } = useMemo(() => {
    const grouped: { [key: string]: Figure[] } = {};
    figureCategories.forEach(c => {
        grouped[c.id] = [];
    });
    
    const uncategorized: Figure[] = [];

    for (const figure of figures) {
      if (figure.categoryId && grouped.hasOwnProperty(figure.categoryId)) {
        grouped[figure.categoryId].push(figure);
      } else {
        uncategorized.push(figure);
      }
    }

    const sortedCategorized: { [key: string]: Figure[] } = {};
    for (const categoryId in grouped) {
        sortedCategorized[categoryId] = sortFigures(grouped[categoryId], lessonsMap, settings.figureSortOrder);
    }
    
    const sortedNew = sortFigures(uncategorized, lessonsMap, settings.figureSortOrder);
    
    return { categorized: sortedCategorized, new: sortedNew };

  }, [figures, figureCategories, lessonsMap, settings.figureSortOrder]);
  
  const dateBasedGroupedFigures = useMemo(() => {
    if (settings.figureGrouping !== 'byMonth' && settings.figureGrouping !== 'byYear') {
        return { groups: new Map(), groupOrder: [] };
    }

    const grouped = new Map<string, { header: string; figures: Figure[] }>();

    for (const figure of allSortedFigures) {
        const lesson = lessonsMap.get(figure.lessonId);
        if (!lesson) continue;

        const { key, header } = getGroupInfo(lesson.uploadDate, settings.figureGrouping, locale);
        if (!grouped.has(key)) {
            grouped.set(key, { header, figures: [] });
        }
        grouped.get(key)!.figures.push(figure);
    }
    
    let groupOrder = [...grouped.keys()];
    
    if (settings.figureSortOrder === 'newest' || settings.figureSortOrder === 'oldest') {
        groupOrder.sort((a, b) => {
            return settings.figureSortOrder === 'newest' ? b.localeCompare(a) : a.localeCompare(b);
        });
    } else {
        groupOrder.sort((a, b) => {
            const headerA = grouped.get(a)!.header;
            const headerB = grouped.get(b)!.header;
            const comparison = headerA.localeCompare(headerB, locale);
            return settings.figureSortOrder === 'alphabetical_asc' ? comparison : -comparison;
        });
    }

    return { groups: grouped, groupOrder };
  }, [allSortedFigures, lessonsMap, settings.figureGrouping, settings.figureSortOrder, locale]);
  
  const displayItems = useMemo(() => {
    const categoryMap = new Map(figureCategories.map(c => [c.id, c]));
    const orderedItems: ({ id: string; isUncategorized: true } | FigureCategory)[] = [];

    // Use categoryOrder from settings, but ensure it's complete and valid.
    let order = settings.figureCategoryOrder && settings.figureCategoryOrder.length > 0 
        ? settings.figureCategoryOrder 
        : [UNCATEGORIZED_ID, ...figureCategories.map(c => c.id).sort((a, b) => a.localeCompare(b))];
    
    const allKnownIds = new Set([UNCATEGORIZED_ID, ...figureCategories.map(c => c.id)]);
    const orderSet = new Set(order);

    // Add any missing items to the end of the order to prevent them from disappearing
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
  }, [figureCategories, settings.figureCategoryOrder]);
  
  const outletContext = { refresh: intelligentRefresh, isMobile };
  const isChildRouteActive = location.pathname !== '/figures';
  const pageTitle = t('nav.figures');

  const handleAddClick = () => {
    navigate('/figures/add');
  };

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
        value={settings.figureGrouping}
        onChange={handleGroupingChange}
        onAction={handleGroupingAction}
        isMobile={isMobile}
      />
      <SortControl
        options={SORT_OPTIONS}
        value={settings.figureSortOrder}
        onChange={handleSortChange}
        isMobile={isMobile}
      />
    </div>
  );
  
  const baseRoute = '/figures';
  const allFigureIds = useMemo(() => allSortedFigures.map(f => f.id), [allSortedFigures]);
  const onForceDelete = isSignedIn ? forceDeleteItem : undefined;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <i className="material-icons text-5xl text-gray-400 animate-spin">sync</i>
          <span className="ml-4 text-xl text-gray-600">{t('gallery.loading', { item: t('gallery.figures') })}</span>
        </div>
      );
    }
    
    if (figures.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon="people"
            title={t('gallery.emptyFiguresTitle')}
            description={t('gallery.emptyFiguresDescription')}
            actionText={t('gallery.addFirstFigure')}
            onAction={handleAddClick}
          />
        </div>
      );
    }

    if (settings.figureGrouping === 'byMonth' || settings.figureGrouping === 'byYear') {
      const { groups, groupOrder } = dateBasedGroupedFigures;
      return (
        <div>
            {groupOrder.map(groupKey => {
                const group = groups.get(groupKey)!;
                if (!group || group.figures.length === 0) return null;

                const isExpanded = !collapsedDateGroups.includes(groupKey);

                return (
                    <div key={groupKey}>
                        <CategoryHeader
                            name={group.header}
                            count={settings.showFigureCountInGroupHeaders ? group.figures.length : undefined}
                            isExpanded={isExpanded}
                            onToggle={() => handleToggleDateGroup(groupKey)}
                        />
                        {isExpanded && (
                            <div className="pt-2 pb-6">
                                <FigureGrid
                                    figures={group.figures}
                                    lessonsMap={lessonsMap}
                                    figureCategories={figureCategories}
                                    onRefresh={refreshGalleries}
                                    baseRoute={baseRoute}
                                    allFigureIds={allFigureIds}
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

    if (settings.figureGrouping === 'byCategory') {
      return (
        <div>
          {displayItems.map(item => {
            if ('isUncategorized' in item) {
              const count = uncategorizedFigures.length;
              const showGroup = count > 0 || settings.showEmptyFigureCategoriesInGroupedView;
              if (!showGroup) return null;
              
              return (
                <div key={item.id}>
                    <CategoryHeader 
                        name={t('common.uncategorized')} 
                        isExpanded={isUncategorizedExpanded} 
                        onToggle={handleToggleUncategorized} 
                        count={settings.showFigureCountInGroupHeaders ? count : undefined}
                    />
                    {isUncategorizedExpanded && (
                        <div className="pt-2 pb-6">
                            {count > 0 ? (
                                <FigureGrid
                                    figures={uncategorizedFigures}
                                    lessonsMap={lessonsMap}
                                    figureCategories={figureCategories}
                                    onRefresh={refreshGalleries}
                                    baseRoute={baseRoute}
                                    allFigureIds={allFigureIds}
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
              const categoryFigures = categorizedFigures[category.id] || [];
              const count = categoryFigures.length;
              const showGroup = count > 0 || settings.showEmptyFigureCategoriesInGroupedView;
              if (!showGroup) return null;

              const isExpanded = !collapsedCategories.includes(category.id);

              return (
                <div key={category.id}>
                  <CategoryHeader 
                      name={category.name} 
                      isExpanded={isExpanded} 
                      onToggle={() => handleToggleCategory(category.id)}
                      count={settings.showFigureCountInGroupHeaders ? count : undefined}
                  />
                  {isExpanded && (
                      <div className="pt-2 pb-6">
                         {count > 0 ? (
                             <FigureGrid
                                  figures={categoryFigures}
                                  lessonsMap={lessonsMap}
                                  figureCategories={figureCategories}
                                  onRefresh={refreshGalleries}
                                  baseRoute={baseRoute}
                                  allFigureIds={allFigureIds}
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
        <FigureGrid
            figures={allSortedFigures}
            lessonsMap={lessonsMap}
            figureCategories={figureCategories}
            onRefresh={refreshGalleries}
            baseRoute={baseRoute}
            allFigureIds={allFigureIds}
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

export default FiguresGallery;

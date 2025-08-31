import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { localDatabaseService } from '../services/LocalDatabaseService';
import type { Figure, Lesson, FigureSortOrder, FigureCategory, AppSettings, School, Instructor } from '../types';
import FigureCard from './FigureCard';
import MobileTopNav from './MobileTopNav';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DesktopTopNav from './DesktopTopNav';
import { useTranslation } from '../App';
import EmptyState from './EmptyState';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import GalleryActionBar from './GalleryActionBar';
import { GroupingOption } from './GroupingControl';
import { settingsService } from '../services/SettingsService';

const UNCATEGORIZED_ID = '__uncategorized__';
const UNASSIGNED_ID = '__unassigned__';

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
    schools: School[];
    instructors: Instructor[];
    onRefresh: () => void;
    baseRoute: string;
    allFigureIds: string[];
    onForceDelete?: (item: Figure) => Promise<void>;
}> = ({ figures, lessonsMap, figureCategories, schools, instructors, onRefresh, baseRoute, allFigureIds, onForceDelete }) => {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-6">
            {figures.map((figure) => (
                <FigureCard 
                    key={`${figure.id}-${figure.modifiedTime || ''}`} 
                    figure={figure} 
                    parentLesson={lessonsMap.get(figure.lessonId)} 
                    figureCategories={figureCategories}
                    schools={schools}
                    instructors={instructors}
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
  const [schools, setSchools] = useState<School[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const location = useLocation();
  const navigate = useNavigate();

  const SORT_OPTIONS = useMemo(() => [
    { value: 'newest', label: t('sort.newest') },
    { value: 'oldest', label: t('sort.oldest') },
    { value: 'alphabetical_asc', label: t('sort.alphaAsc') },
    { value: 'alphabetical_desc', label: t('sort.alphaDesc') },
  ], [t, settings.language]);
  
  const GROUPING_OPTIONS: GroupingOption[] = useMemo(() => [
      { value: 'none', label: t('grouping.none') },
      { value: 'byMonth', label: t('grouping.byMonth') },
      { value: 'byYear', label: t('grouping.byYear') },
      { value: 'byCategory', label: t('grouping.byCategory') },
      { value: 'bySchool', label: t('grouping.bySchool') },
      { value: 'byInstructor', label: t('grouping.byInstructor') },
      { value: 'divider', label: '-', isDivider: true },
      { value: 'customize', label: t('grouping.customize'), isAction: true },
  ], [t, settings.language]);

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
  
  const handleFilterChange = (newExcludedIds: any) => {
    updateSettings({
      figureFilter_excludedYears: newExcludedIds.years,
      figureFilter_excludedCategoryIds: newExcludedIds.categories,
      figureFilter_excludedSchoolIds: newExcludedIds.schools,
      figureFilter_excludedInstructorIds: newExcludedIds.instructors,
    });
  };

  const handleGroupingAction = (action: string) => {
      if (action === 'customize') {
          navigate('/figures/categories');
      }
  };

  const handleToggleCategory = (categoryId: string) => {
    settingsService.toggleFigureCategoryCollapsed(categoryId);
  };
  
  const handleToggleUncategorized = () => {
    settingsService.toggleFigureUncategorizedExpanded();
  };

  const handleToggleDateGroup = (groupKey: string) => {
    settingsService.toggleFigureDateGroupCollapsed(groupKey);
  };

  const handleToggleSchool = (schoolId: string) => {
    settingsService.toggleFigureSchoolCollapsed(schoolId);
  };
  
  const handleToggleUnassignedSchool = () => {
    settingsService.toggleFigureUnassignedSchoolExpanded();
  };

  const handleToggleInstructor = (instructorId: string) => {
    settingsService.toggleFigureInstructorCollapsed(instructorId);
  };

  const handleToggleUnassignedInstructor = () => {
    settingsService.toggleFigureUnassignedInstructorExpanded();
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
      localDatabaseService.getFigures(),
      localDatabaseService.getLessons(),
      localDatabaseService.getFigureCategories(),
      localDatabaseService.getSchools(),
      localDatabaseService.getInstructors(),
    ]).then(([fetchedFigures, fetchedLessons, fetchedCategories, fetchedSchools, fetchedInstructors]) => {
      const lessonIdMap = new Map(fetchedLessons.map(lesson => [lesson.id, lesson]));
      setFigures(fetchedFigures);
      setLessonsMap(lessonIdMap);
      setFigureCategories(fetchedCategories);
      setSchools(fetchedSchools);
      setInstructors(fetchedInstructors);
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
    const unsubscribe = localDatabaseService.subscribe(refreshGalleries);
    return () => unsubscribe();
  }, [refreshGalleries]);
  
  const intelligentRefresh = refreshGalleries;

  const filteredFigures = useMemo(() => {
    const { 
      figureFilter_excludedYears: excludedYears, 
      figureFilter_excludedCategoryIds: excludedCategories,
      figureFilter_excludedSchoolIds: excludedSchools,
      figureFilter_excludedInstructorIds: excludedInstructors
    } = settings;

    if (excludedYears.length === 0 && excludedCategories.length === 0 && excludedSchools.length === 0 && excludedInstructors.length === 0) {
      return figures;
    }

    return figures.filter(figure => {
      const lesson = lessonsMap.get(figure.lessonId);
      if (!lesson) return false;

      const year = new Date(lesson.uploadDate).getFullYear().toString();
      if (excludedYears.includes(year)) return false;

      const categoryId = figure.categoryId || UNCATEGORIZED_ID;
      if (excludedCategories.includes(categoryId)) return false;

      const schoolId = figure.schoolId || UNASSIGNED_ID;
      if (excludedSchools.includes(schoolId)) return false;

      const instructorId = figure.instructorId || UNASSIGNED_ID;
      if (excludedInstructors.includes(instructorId)) return false;
      
      return true;
    });
  }, [figures, lessonsMap, settings]);
  
  const allSortedFigures = useMemo(() => {
    return sortFigures(filteredFigures, lessonsMap, settings.figureSortOrder);
  }, [filteredFigures, lessonsMap, settings.figureSortOrder]);

  const { categorized: categorizedFigures, new: uncategorizedFigures } = useMemo(() => {
    const grouped: { [key: string]: Figure[] } = {};
    figureCategories.forEach(c => { grouped[c.id] = []; });
    const uncategorized: Figure[] = [];
    for (const figure of filteredFigures) {
      if (figure.categoryId) {
        if (grouped.hasOwnProperty(figure.categoryId)) {
          grouped[figure.categoryId].push(figure);
        } else {
          console.warn(`Figure with name "${figure.name}" (ID: ${figure.id}) is assigned to a non-existent category ID: ${figure.categoryId}. It will be treated as uncategorized.`);
          uncategorized.push(figure);
        }
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
  }, [filteredFigures, figureCategories, lessonsMap, settings.figureSortOrder]);
  
   const groupedBySchool = useMemo(() => {
    const grouped: { [key: string]: Figure[] } = {};
    schools.forEach(s => { grouped[s.id] = []; });
    const unassigned: Figure[] = [];
    for (const figure of filteredFigures) {
      if (figure.schoolId) {
        if (grouped.hasOwnProperty(figure.schoolId)) {
          grouped[figure.schoolId].push(figure);
        } else {
          console.warn(`Figure with name "${figure.name}" (ID: ${figure.id}) is assigned to a non-existent school ID: ${figure.schoolId}. It will be treated as unassigned.`);
          unassigned.push(figure);
        }
      } else {
        unassigned.push(figure);
      }
    }
    const sortedGrouped: { [key: string]: Figure[] } = {};
    for (const id in grouped) {
        sortedGrouped[id] = sortFigures(grouped[id], lessonsMap, settings.figureSortOrder);
    }
    return { grouped: sortedGrouped, unassigned: sortFigures(unassigned, lessonsMap, settings.figureSortOrder) };
  }, [filteredFigures, schools, lessonsMap, settings.figureSortOrder]);

  const groupedByInstructor = useMemo(() => {
    const grouped: { [key: string]: Figure[] } = {};
    instructors.forEach(i => { grouped[i.id] = []; });
    const unassigned: Figure[] = [];
    for (const figure of filteredFigures) {
      if (figure.instructorId) {
        if (grouped.hasOwnProperty(figure.instructorId)) {
          grouped[figure.instructorId].push(figure);
        } else {
          console.warn(`Figure with name "${figure.name}" (ID: ${figure.id}) is assigned to a non-existent instructor ID: ${figure.instructorId}. It will be treated as unassigned.`);
          unassigned.push(figure);
        }
      } else {
        unassigned.push(figure);
      }
    }
    const sortedGrouped: { [key: string]: Figure[] } = {};
    for (const id in grouped) {
        sortedGrouped[id] = sortFigures(grouped[id], lessonsMap, settings.figureSortOrder);
    }
    return { grouped: sortedGrouped, unassigned: sortFigures(unassigned, lessonsMap, settings.figureSortOrder) };
  }, [filteredFigures, instructors, lessonsMap, settings.figureSortOrder]);

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
  
  const displayCategories = useMemo(() => {
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

    const createOrderedList = useCallback((
    items: (School[] | Instructor[]), 
    orderSetting: string[],
    unassignedId: string
  ) => {
    const itemMap = new Map(items.map(item => [item.id, item]));
    const orderedItems: ({ id: string; isUnassigned: true } | School | Instructor)[] = [];

    let order = orderSetting && orderSetting.length > 0
        ? orderSetting
        : [unassignedId, ...items.map(i => i.id).sort((a, b) => a.localeCompare(b))];
        
    const allKnownIds = new Set([unassignedId, ...items.map(i => i.id)]);
    const orderSet = new Set(order);

    if (order.length < allKnownIds.size) {
        const missingIds = [...allKnownIds].filter(id => !orderSet.has(id));
        order.push(...missingIds);
    }
    
    for (const id of order) {
        if (id === unassignedId) {
            orderedItems.push({ id: unassignedId, isUnassigned: true });
        } else {
            const item = itemMap.get(id);
            if (item) orderedItems.push(item);
        }
    }
    return orderedItems;
  }, []);

  const displaySchools = useMemo(() => createOrderedList(schools, settings.figureSchoolOrder, UNASSIGNED_ID), [schools, settings.figureSchoolOrder, createOrderedList]);
  const displayInstructors = useMemo(() => createOrderedList(instructors, settings.figureInstructorOrder, UNASSIGNED_ID), [instructors, settings.figureInstructorOrder, createOrderedList]);
  
  const outletContext = { refresh: intelligentRefresh, isMobile };
  const isChildRouteActive = location.pathname !== '/figures';
  const pageTitle = t('nav.figures');

  const handleAddClick = () => {
    navigate('/figures/add');
  };

  const filterOptions = useMemo(() => {
    let years = [...new Set(Array.from(lessonsMap.values()).map(l => new Date(l.uploadDate).getFullYear().toString()))].sort((a,b) => b.localeCompare(a));
    if (years.length === 0) {
        years.push(new Date().getFullYear().toString());
    }
    return {
        years,
        categories: figureCategories,
        schools,
        instructors
    }
  }, [lessonsMap, figureCategories, schools, instructors]);

  const excludedIds = useMemo(() => ({
    years: settings.figureFilter_excludedYears,
    categories: settings.figureFilter_excludedCategoryIds,
    schools: settings.figureFilter_excludedSchoolIds,
    instructors: settings.figureFilter_excludedInstructorIds,
  }), [settings]);

  const actionMenu = (
    <GalleryActionBar
      isMobile={isMobile}
      onAddClick={handleAddClick}
      // Filter props
      filterOptions={filterOptions}
      excludedIds={excludedIds}
      onFilterChange={handleFilterChange}
      uncategorizedId={UNCATEGORIZED_ID}
      uncategorizedLabel={t('common.uncategorized')}
      unassignedId={UNASSIGNED_ID}
      unassignedLabel={t('common.unassigned')}
      // Grouping props
      groupingOptions={GROUPING_OPTIONS}
      groupingValue={settings.figureGrouping}
      onGroupingChange={handleGroupingChange}
      onGroupingAction={handleGroupingAction}
      // Sorting props
      sortOptions={SORT_OPTIONS}
      sortValue={settings.figureSortOrder}
      onSortChange={handleSortChange}
    />
  );
  
  const baseRoute = '/figures';
  const allFigureIds = useMemo(() => allSortedFigures.map(f => f.id), [allSortedFigures]);
  const onForceDelete = isSignedIn ? forceDeleteItem : undefined;
  
  const renderGroupedBy = useCallback((
    orderedItems: ({ id: string; name?: string; isUnassigned?: boolean; } | School | Instructor)[],
    groupedData: { [key: string]: Figure[] },
    unassignedData: Figure[],
    unassignedLabel: string,
    groupingType: 'school' | 'instructor'
  ) => {
    const groupRenderConfig = (groupingType === 'school')
        ? {
            collapsedGroups: settings.collapsedFigureSchools,
            isUnassignedExpanded: settings.uncategorizedFigureSchoolIsExpanded,
            handleToggle: handleToggleSchool,
            handleToggleUnassigned: handleToggleUnassignedSchool,
        }
        : { // instructor
            collapsedGroups: settings.collapsedFigureInstructors,
            isUnassignedExpanded: settings.uncategorizedFigureInstructorIsExpanded,
            handleToggle: handleToggleInstructor,
            handleToggleUnassigned: handleToggleUnassignedInstructor,
        };
    
    const { collapsedGroups, isUnassignedExpanded, handleToggle, handleToggleUnassigned } = groupRenderConfig;

    return (
        <div>
            {orderedItems.map(item => {
                const isUnassigned = 'isUnassigned' in item && item.isUnassigned;
                const figures = isUnassigned ? unassignedData : groupedData[item.id] || [];
                const count = figures.length;
                if (count === 0 && !settings.showEmptyFigureCategoriesInGroupedView) return null;

                const { isExpanded, onToggle } = isUnassigned
                    ? { isExpanded: isUnassignedExpanded, onToggle: handleToggleUnassigned }
                    : { isExpanded: !collapsedGroups.includes(item.id), onToggle: () => handleToggle(item.id) };
                
                return (
                    <div key={item.id}>
                        <CategoryHeader 
                            name={isUnassigned ? unassignedLabel : (item.name || '')}
                            count={settings.showFigureCountInGroupHeaders ? count : undefined}
                            isExpanded={isExpanded}
                            onToggle={onToggle}
                        />
                        {isExpanded && (
                            <div className="pt-2 pb-6">
                                {count > 0 ? (
                                    <FigureGrid figures={figures} lessonsMap={lessonsMap} figureCategories={figureCategories} schools={schools} instructors={instructors} onRefresh={refreshGalleries} baseRoute={baseRoute} allFigureIds={allFigureIds} onForceDelete={onForceDelete} />
                                ) : <EmptyCategoryMessage />}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
  }, [
      settings.showEmptyFigureCategoriesInGroupedView, settings.showFigureCountInGroupHeaders,
      settings.collapsedFigureSchools, settings.uncategorizedFigureSchoolIsExpanded,
      settings.collapsedFigureInstructors, settings.uncategorizedFigureInstructorIsExpanded,
      lessonsMap, figureCategories, schools, instructors, refreshGalleries, baseRoute, allFigureIds, onForceDelete
  ]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <i className="material-icons text-5xl text-gray-400 animate-spin-reverse">sync</i>
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
    
    if (settings.figureGrouping === 'bySchool') {
        return renderGroupedBy(displaySchools, groupedBySchool.grouped, groupedBySchool.unassigned, t('common.unassigned'), 'school');
    }
    if (settings.figureGrouping === 'byInstructor') {
        return renderGroupedBy(displayInstructors, groupedByInstructor.grouped, groupedByInstructor.unassigned, t('common.unassigned'), 'instructor');
    }

    if (settings.figureGrouping === 'byMonth' || settings.figureGrouping === 'byYear') {
      const { groups, groupOrder } = dateBasedGroupedFigures;
      return (
        <div>
            {groupOrder.map(groupKey => {
                const group = groups.get(groupKey)!;
                if (!group || group.figures.length === 0) return null;

                const isExpanded = !settings.collapsedFigureDateGroups.includes(groupKey);

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
                                <FigureGrid figures={group.figures} lessonsMap={lessonsMap} figureCategories={figureCategories} schools={schools} instructors={instructors} onRefresh={refreshGalleries} baseRoute={baseRoute} allFigureIds={allFigureIds} onForceDelete={onForceDelete} />
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
          {displayCategories.map(item => {
            if ('isUncategorized' in item) {
              const count = uncategorizedFigures.length;
              const showGroup = count > 0 || settings.showEmptyFigureCategoriesInGroupedView;
              if (!showGroup) return null;
              
              return (
                <div key={item.id}>
                    <CategoryHeader 
                        name={t('common.uncategorized')} 
                        isExpanded={settings.uncategorizedFigureCategoryIsExpanded} 
                        onToggle={handleToggleUncategorized} 
                        count={settings.showFigureCountInGroupHeaders ? count : undefined}
                    />
                    {settings.uncategorizedFigureCategoryIsExpanded && (
                        <div className="pt-2 pb-6">
                            {count > 0 ? (
                                <FigureGrid figures={uncategorizedFigures} lessonsMap={lessonsMap} figureCategories={figureCategories} schools={schools} instructors={instructors} onRefresh={refreshGalleries} baseRoute={baseRoute} allFigureIds={allFigureIds} onForceDelete={onForceDelete} />
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

              const isExpanded = !settings.collapsedFigureCategories.includes(category.id);

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
                             <FigureGrid figures={categoryFigures} lessonsMap={lessonsMap} figureCategories={figureCategories} schools={schools} instructors={instructors} onRefresh={refreshGalleries} baseRoute={baseRoute} allFigureIds={allFigureIds} onForceDelete={onForceDelete} />
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
        <FigureGrid figures={allSortedFigures} lessonsMap={lessonsMap} figureCategories={figureCategories} schools={schools} instructors={instructors} onRefresh={refreshGalleries} baseRoute={baseRoute} allFigureIds={allFigureIds} onForceDelete={onForceDelete} />
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
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { dataService } from '../data-service';
import type { Figure, Lesson, FigureSortOrder, Category } from '../types';
import FigureCard from './FigureCard';
import MobileTopNav from './MobileTopNav';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DesktopTopNav from './DesktopTopNav';
import SortControl from './SortControl';
import { useTranslation } from '../App';
import MuteToggleButton from './MuteToggleButton';
import GroupingControl from './GroupingControl';

const EmptyCategoryMessage: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="text-center py-6 px-4 text-gray-500 bg-gray-100 rounded-lg border border-dashed border-gray-300">
            <p className="text-sm max-w-sm mx-auto">{t('gallery.emptyCategory')}</p>
        </div>
    );
};

const CategoryHeader: React.FC<{ name: string; isExpanded: boolean; onToggle: () => void }> = ({ name, isExpanded, onToggle }) => {
  return (
    <div
      className="flex items-center my-4 cursor-pointer group"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
    >
      <div className="flex items-center text-gray-600 group-hover:text-gray-800 transition-colors">
        <i className={`material-icons transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
          chevron_right
        </i>
        <h2 className="text-xl font-semibold ml-2">{name}</h2>
      </div>
      <div className="flex-grow border-t border-gray-300 group-hover:border-gray-400 transition-colors ml-4"></div>
    </div>
  );
};

const FigureGrid: React.FC<{
    figures: Figure[];
    lessonsMap: Map<string, Lesson>;
    categories: Category[];
    onRefresh: () => void;
    baseRoute: string;
    allFigureIds: string[];
}> = ({ figures, lessonsMap, categories, onRefresh, baseRoute, allFigureIds }) => {
    
    if (figures.length === 0) {
        return <EmptyCategoryMessage />;
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-6">
            {figures.map((figure) => (
                <FigureCard 
                    key={figure.id} 
                    figure={figure} 
                    parentLesson={lessonsMap.get(figure.lessonId)} 
                    categories={categories}
                    onRefresh={onRefresh}
                    itemIds={allFigureIds}
                    baseRoute={baseRoute}
                />
            ))}
        </div>
    );
};


const FiguresGallery: React.FC = () => {
  const { t, settings, updateSettings } = useTranslation();
  const [figures, setFigures] = useState<Figure[]>([]);
  const [lessonsMap, setLessonsMap] = useState<Map<string, Lesson>>(new Map());
  const [categories, setCategories] = useState<Category[]>([]);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const location = useLocation();
  const navigate = useNavigate();

  const SORT_OPTIONS = [
    { value: 'newest', label: t('sort.newest') },
    { value: 'oldest', label: t('sort.oldest') },
    { value: 'alphabetical_asc', label: t('sort.alphaAsc') },
    { value: 'alphabetical_desc', label: t('sort.alphaDesc') },
  ];
  
  const GROUPING_OPTIONS = [
      { value: 'none', label: t('grouping.none') },
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
      await updateSettings({ figureGrouping: newGroupingValue as 'none' | 'byCategory' });
  };
  
  const handleGroupingAction = (action: string) => {
      if (action === 'customize') {
          navigate('/figures/categories');
      }
  };

  const handleToggleCategory = async (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    try {
      await dataService.updateCategory(categoryId, { isExpanded: !category.isExpanded });
      refreshGalleries(); // Refresh to get the updated category state
    } catch (err) {
      console.error("Failed to update category state:", err);
    }
  };
  
  const handleToggleUncategorized = () => {
    updateSettings({ uncategorizedCategoryIsExpanded: !settings.uncategorizedCategoryIsExpanded });
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
    Promise.all([
      dataService.getFigures(),
      dataService.getLessons(),
      dataService.getCategories(),
    ]).then(([fetchedFigures, fetchedLessons, fetchedCategories]) => {
      const lessonIdMap = new Map(fetchedLessons.map(lesson => [lesson.id, lesson]));
      setFigures(fetchedFigures);
      setLessonsMap(lessonIdMap);
      setCategories(fetchedCategories);
    }).catch(console.error);
  }, []);
  
  useEffect(() => {
    if (location.pathname === '/figures') {
        refreshGalleries();
    }
  }, [location.pathname, refreshGalleries]);
  
  const intelligentRefresh = refreshGalleries;

  const allSortedFigures = useMemo(() => {
    return sortFigures(figures, lessonsMap, settings.figureSortOrder);
  }, [figures, lessonsMap, settings.figureSortOrder]);

  const { categorized: categorizedFigures, new: uncategorizedFigures } = useMemo(() => {
    const grouped: { [key: string]: Figure[] } = {};
    categories.forEach(c => {
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

  }, [figures, categories, lessonsMap, settings.figureSortOrder]);
  
  const sortedCategories = useMemo(() => 
    [...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), 
    [categories]
  );
  
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

  const galleryContent = (
    <div className={isMobile ? "px-4 pt-2 pb-4" : "p-8"}>
        {!isMobile && <DesktopTopNav title={pageTitle} rightAction={actionMenu} />}
        
        {settings.figureGrouping === 'byCategory' ? (
          <>
            <div>
                <CategoryHeader 
                    name={t('common.uncategorized')} 
                    isExpanded={settings.uncategorizedCategoryIsExpanded} 
                    onToggle={handleToggleUncategorized} 
                />
                {settings.uncategorizedCategoryIsExpanded && (
                    <div className="pt-2 pb-6">
                        <FigureGrid
                            figures={uncategorizedFigures}
                            lessonsMap={lessonsMap}
                            categories={categories}
                            onRefresh={refreshGalleries}
                            baseRoute={baseRoute}
                            allFigureIds={allFigureIds}
                        />
                    </div>
                )}
            </div>

            {sortedCategories.map(category => (
                <div key={category.id}>
                    <CategoryHeader name={category.name} isExpanded={category.isExpanded} onToggle={() => handleToggleCategory(category.id)} />
                    {category.isExpanded && (
                        <div className="pt-2 pb-6">
                           <FigureGrid
                                figures={categorizedFigures[category.id] || []}
                                lessonsMap={lessonsMap}
                                categories={categories}
                                onRefresh={refreshGalleries}
                                baseRoute={baseRoute}
                                allFigureIds={allFigureIds}
                            />
                        </div>
                    )}
                </div>
            ))}
          </>
        ) : (
          <div className="pt-2 pb-6">
            <FigureGrid
                figures={allSortedFigures}
                lessonsMap={lessonsMap}
                categories={categories}
                onRefresh={refreshGalleries}
                baseRoute={baseRoute}
                allFigureIds={allFigureIds}
            />
          </div>
        )}
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
          {galleryContent}
        </>
      );
    }
  } else {
    // --- Desktop View ---
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
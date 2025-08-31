import React, { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Figure, Lesson, FigureSortOrder, FigureCategory, School, Instructor } from '../types';
import FigureCard from './FigureCard';
import MobileTopNav from './MobileTopNav';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DesktopTopNav from './DesktopTopNav';
import { useTranslation } from '../contexts/I18nContext';
import EmptyState from './EmptyState';
import GalleryActionBar from './GalleryActionBar';
import { GroupingOption } from './GroupingControl';
import { useSettings } from '../contexts/SettingsContext';
import { useGalleryProcessor } from '../hooks/useGalleryProcessor';

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

const CategoryHeader: React.FC<{ name: string; isExpanded: boolean; onToggle: () => void; count?: number; }> = ({ name, isExpanded, onToggle, count }) => {
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
                <h2 className={`text-xl font-semibold ml-2 ${name.match(/^[a-z]/) ? 'capitalize' : ''}`}>
                    {name}
                    {typeof count === 'number' && (
                        <span className="ml-2">({count})</span>
                    )}
                </h2>
            </div>
            <div className="flex-grow border-t border-gray-300 group-hover:border-gray-400 transition-colors ml-4"></div>
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
    thumbnailUrls: Map<string, string | null>;
    videoUrls: Map<string, string | null>;
}> = ({ figures, lessonsMap, figureCategories, schools, instructors, onRefresh, baseRoute, allFigureIds, thumbnailUrls, videoUrls }) => {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-6">
            {figures.map((figure) => {
                const parentLesson = lessonsMap.get(figure.lessonId);
                return (
                    <FigureCard 
                        key={`${figure.id}-${figure.modifiedTime || ''}`} 
                        figure={figure} 
                        parentLesson={parentLesson} 
                        thumbnailUrl={thumbnailUrls.get(figure.id) || null}
                        videoUrl={parentLesson ? videoUrls.get(parentLesson.videoId) : null}
                        figureCategories={figureCategories}
                        schools={schools}
                        instructors={instructors}
                        onRefresh={onRefresh}
                        itemIds={allFigureIds}
                        baseRoute={baseRoute}
                    />
                );
            })}
        </div>
    );
};


const FiguresGallery: React.FC = () => {
  const { t, language } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  const { galleryData, isLoading, filterOptions, refreshGallery } = useGalleryProcessor<Figure>('figure');

  const SORT_OPTIONS = useMemo(() => [
    { value: 'newest', label: t('sort.newest') },
    { value: 'oldest', label: t('sort.oldest') },
    { value: 'alphabetical_asc', label: t('sort.alphaAsc') },
    { value: 'alphabetical_desc', label: t('sort.alphaDesc') },
  ], [t, language]);
  
  const GROUPING_OPTIONS: GroupingOption[] = useMemo(() => [
      { value: 'none', label: t('grouping.none') },
      { value: 'byMonth', label: t('grouping.byMonth') },
      { value: 'byYear', label: t('grouping.byYear') },
      { value: 'byCategory', label: t('grouping.byCategory') },
      { value: 'bySchool', label: t('grouping.bySchool') },
      { value: 'byInstructor', label: t('grouping.byInstructor') },
      { value: 'divider', label: '-', isDivider: true },
      { value: 'customize', label: t('grouping.customize'), isAction: true },
  ], [t, language]);

  const handleSortChange = (newSortValue: string) => {
    updateSettings({ figureSortOrder: newSortValue as FigureSortOrder });
  };

  const handleGroupingChange = (newGroupingValue: string) => {
      updateSettings({ figureGrouping: newGroupingValue as any });
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
      if (action === 'customize') navigate('/figures/categories');
  };

  const excludedIds = useMemo(() => ({
    years: settings.figureFilter_excludedYears,
    categories: settings.figureFilter_excludedCategoryIds,
    schools: settings.figureFilter_excludedSchoolIds,
    instructors: settings.figureFilter_excludedInstructorIds,
  }), [settings]);
  
  const actionMenu = (
    <GalleryActionBar
      isMobile={isMobile}
      onAddClick={() => navigate('/figures/add')}
      filterOptions={filterOptions}
      excludedIds={excludedIds}
      onFilterChange={handleFilterChange}
      uncategorizedId={UNCATEGORIZED_ID}
      uncategorizedLabel={t('common.uncategorized')}
      unassignedId={UNASSIGNED_ID}
      unassignedLabel={t('common.unassigned')}
      groupingOptions={GROUPING_OPTIONS}
      groupingValue={settings.figureGrouping}
      onGroupingChange={handleGroupingChange}
      onGroupingAction={handleGroupingAction}
      sortOptions={SORT_OPTIONS}
      sortValue={settings.figureSortOrder}
      onSortChange={handleSortChange}
    />
  );
  
  const renderContent = () => {
    if (isLoading || !galleryData) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <i className="material-icons text-5xl text-gray-400 animate-spin-reverse">sync</i>
          <span className="ml-4 text-xl text-gray-600">{t('gallery.loading', { item: t('gallery.figures') })}</span>
        </div>
      );
    }
    
    if (galleryData.totalItemCount === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon="people"
            title={t('gallery.emptyFiguresTitle')}
            description={t('gallery.emptyFiguresDescription')}
            actionText={t('gallery.addFirstFigure')}
            onAction={() => navigate('/figures/add')}
          />
        </div>
      );
    }
    
    if (settings.figureGrouping === 'none') {
      return (
        <div className="pt-2 pb-6">
          <FigureGrid
            figures={galleryData.allItems}
            lessonsMap={galleryData.lessonsMap!}
            figureCategories={galleryData.allCategories as FigureCategory[]}
            schools={galleryData.allSchools}
            instructors={galleryData.allInstructors}
            onRefresh={refreshGallery}
            baseRoute='/figures'
            allFigureIds={galleryData.allItemIds}
            thumbnailUrls={galleryData.thumbnailUrls}
            videoUrls={galleryData.videoUrls}
          />
        </div>
      );
    }

    return (
      <div>
        {galleryData.groups.map(group => (
          <div key={group.key}>
            <CategoryHeader 
                name={group.header}
                count={settings.showFigureCountInGroupHeaders ? group.items.length : undefined}
                isExpanded={group.isExpanded}
                onToggle={group.onToggle}
            />
            {group.isExpanded && (
              <div className="pt-2 pb-6">
                {group.items.length > 0 ? (
                  <FigureGrid
                    figures={group.items}
                    lessonsMap={galleryData.lessonsMap!}
                    figureCategories={galleryData.allCategories as FigureCategory[]}
                    schools={galleryData.allSchools}
                    instructors={galleryData.allInstructors}
                    onRefresh={refreshGallery}
                    baseRoute='/figures'
                    allFigureIds={galleryData.allItemIds}
                    thumbnailUrls={galleryData.thumbnailUrls}
                    videoUrls={galleryData.videoUrls}
                  />
                ) : <EmptyCategoryMessage />}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const pageTitle = t('nav.figures');
  const isChildRouteActive = location.pathname !== '/figures';
  const outletContext = { refresh: refreshGallery, isMobile };

  // --- Mobile View ---
  if (isMobile) {
    if (isChildRouteActive) {
      return <Outlet context={outletContext} />;
    }
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
  
  // --- Desktop View ---
  const galleryContent = (
    <div className="p-8 h-full flex flex-col">
      <DesktopTopNav title={pageTitle} rightAction={actionMenu} />
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-2 -m-2">
        {renderContent()}
      </div>
    </div>
  );
  
  return (
    <>
      {galleryContent}
      {isChildRouteActive && <Outlet context={outletContext} />}
    </>
  );
};

export default FiguresGallery;

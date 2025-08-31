import React from 'react';
import { useTranslation } from '../contexts/I18nContext';
import MuteToggleButton from './MuteToggleButton';
import SyncStatus from './SyncStatus';
import FilterControl, { ExcludedIds } from './FilterControl';
import GroupingControl, { GroupingOption } from './GroupingControl';
import SortControl from './SortControl';

interface SortOption {
  value: string;
  label: string;
}

interface GalleryActionBarProps {
  onAddClick: () => void;
  filterOptions: {
    years: string[];
    categories: { id: string; name: string }[];
    schools: { id: string; name: string }[];
    instructors: { id: string; name: string }[];
  };
  excludedIds: ExcludedIds;
  onFilterChange: (newExcludedIds: ExcludedIds) => void;
  groupingOptions: GroupingOption[];
  groupingValue: string;
  onGroupingChange: (value: string) => void;
  onGroupingAction: (value: string) => void;
  sortOptions: SortOption[];
  sortValue: string;
  onSortChange: (value: string) => void;
  isMobile: boolean;
  uncategorizedId: string;
  uncategorizedLabel: string;
  unassignedId: string;
  unassignedLabel: string;
}

const GalleryActionBar: React.FC<GalleryActionBarProps> = ({
  onAddClick,
  filterOptions,
  excludedIds,
  onFilterChange,
  groupingOptions,
  groupingValue,
  onGroupingChange,
  onGroupingAction,
  sortOptions,
  sortValue,
  onSortChange,
  isMobile,
  uncategorizedId,
  uncategorizedLabel,
  unassignedId,
  unassignedLabel,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={onAddClick}
        className="inline-flex items-center justify-center w-10 h-10 rounded-md border border-transparent shadow-sm bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        aria-label={t('common.addNew')}
      >
        <i className="material-icons">add</i>
      </button>
      <div className="border-l border-gray-300 h-6" />
      <MuteToggleButton />
      <SyncStatus />
      <div className="border-l border-gray-300 h-6" />
      <FilterControl
        filterOptions={filterOptions}
        excludedIds={excludedIds}
        onFilterChange={onFilterChange}
        isMobile={isMobile}
        uncategorizedId={uncategorizedId}
        uncategorizedLabel={uncategorizedLabel}
        unassignedLabel={unassignedLabel}
        unassignedId={unassignedId}
      />
      <GroupingControl
        options={groupingOptions}
        value={groupingValue}
        onChange={onGroupingChange}
        onAction={onGroupingAction}
        isMobile={isMobile}
      />
      <SortControl
        options={sortOptions}
        value={sortValue}
        onChange={onSortChange}
        isMobile={isMobile}
      />
    </div>
  );
};

export default GalleryActionBar;
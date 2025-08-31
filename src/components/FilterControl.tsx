import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from '../contexts/I18nContext';

export interface ExcludedIds {
    years: string[];
    categories: string[];
    schools: string[];
    instructors: string[];
}

interface FilterControlProps {
    filterOptions: {
        years: string[];
        categories: { id: string; name: string }[];
        schools: { id: string; name: string }[];
        instructors: { id: string; name: string }[];
    };
    excludedIds: ExcludedIds;
    onFilterChange: (newExcludedIds: ExcludedIds) => void;
    isMobile?: boolean;
    uncategorizedId: string;
    uncategorizedLabel: string;
    unassignedId: string;
    unassignedLabel: string;
}

type MenuType = 'years' | 'categories' | 'schools' | 'instructors';

const FilterControl: React.FC<FilterControlProps> = ({
    filterOptions,
    excludedIds,
    onFilterChange,
    isMobile,
    uncategorizedId,
    uncategorizedLabel,
    unassignedId,
    unassignedLabel,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<MenuType>>(new Set());
    const [localExcludedIds, setLocalExcludedIds] = useState<ExcludedIds>(excludedIds);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

    // Effect to initialize local state when the dropdown is opened
    useEffect(() => {
        if (isOpen) {
            setLocalExcludedIds(excludedIds);
        }
    }, [isOpen, excludedIds]);
    
    // Effect to close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggleDropdown = () => setIsOpen(!isOpen);

    const handleToggleSection = (section: MenuType) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(section)) newSet.delete(section);
            else newSet.add(section);
            return newSet;
        });
    };
    
    const handleItemCheckboxChange = (menu: MenuType, id: string, isChecked: boolean) => {
        setLocalExcludedIds(prev => {
            const currentExcluded = prev[menu] || [];
            // If checked, it means we should include it, so remove from excluded list.
            // If unchecked, it means we should exclude it, so add to excluded list.
            const newExcluded = isChecked
                ? currentExcluded.filter(exId => exId !== id)
                : [...currentExcluded, id];
            return { ...prev, [menu]: newExcluded };
        });
    };

    const handleApply = () => {
        onFilterChange(localExcludedIds);
        setIsOpen(false);
    };

    const handleClear = () => {
        const clearedIds: ExcludedIds = { years: [], categories: [], schools: [], instructors: [] };
        setLocalExcludedIds(clearedIds);
        onFilterChange(clearedIds); // Clear immediately
        setIsOpen(false);
    };

    const activeFilterCount = useMemo(() => {
        return (Object.keys(excludedIds) as (keyof ExcludedIds)[])
            .filter(key => excludedIds[key].length > 0)
            .length;
    }, [excludedIds]);

    const menuHeaders: { key: MenuType; label: string; options: {id: string; name: string}[] }[] = useMemo(() => [
        { key: 'years', label: t('filter.years'), options: filterOptions.years.map(y => ({id:y, name:y})) },
        { key: 'categories', label: t('filter.categories'), options: [{id: uncategorizedId, name: uncategorizedLabel}, ...filterOptions.categories] },
        { key: 'schools', label: t('filter.schools'), options: [{id: unassignedId, name: unassignedLabel}, ...filterOptions.schools] },
        { key: 'instructors', label: t('filter.instructors'), options: [{id: unassignedId, name: unassignedLabel}, ...filterOptions.instructors] },
    ], [t, filterOptions, uncategorizedId, uncategorizedLabel, unassignedId, unassignedLabel]);

    const renderMenu = () => (
        <div className="flex flex-col h-full">
            <div className="flex-grow overflow-y-auto p-2 space-y-1">
                {menuHeaders.map(header => {
                    const totalCount = header.options.length;
                    if (totalCount === 0) return null;
                    
                    const excludedCount = (localExcludedIds[header.key] || []).length;
                    const selectedCount = totalCount - excludedCount;
                    const isSectionExpanded = expandedSections.has(header.key);
                    
                    const summary = selectedCount < totalCount ? `(${selectedCount}/${totalCount})` : null;

                    return (
                        <div key={header.key}>
                            <button
                                onClick={() => handleToggleSection(header.key)}
                                className="flex items-center w-full p-2 rounded-md hover:bg-gray-100 text-left"
                                aria-expanded={isSectionExpanded}
                            >
                                <span className="flex-grow font-semibold text-gray-700">{header.label}</span>
                                {summary && (
                                    <span className="text-sm text-gray-500 mr-1">{summary}</span>
                                )}
                                <i className={`material-icons text-gray-600 transition-transform duration-200 ${isSectionExpanded ? 'rotate-90' : ''}`}>chevron_right</i>
                            </button>

                            {isSectionExpanded && (
                                <div className="pl-6 mt-1 space-y-1">
                                    {header.options.map(item => {
                                        const isItemChecked = !(localExcludedIds[header.key] || []).includes(item.id);
                                        return (
                                            <label key={item.id} className="flex items-center p-1.5 rounded-md hover:bg-gray-50 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isItemChecked}
                                                    onChange={(e) => handleItemCheckboxChange(header.key, item.id, e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="ml-3 text-sm text-gray-800">{item.name}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex-shrink-0 flex justify-end space-x-2 p-2 border-t border-gray-200 bg-gray-50">
                <button onClick={handleClear} className="px-4 py-2 text-sm text-gray-700 font-medium rounded-md hover:bg-gray-200 border border-gray-300">{t('common.clear')}</button>
                <button onClick={handleApply} className="px-4 py-2 text-sm text-white font-medium rounded-md bg-blue-600 hover:bg-blue-700">{t('common.apply')}</button>
            </div>
        </div>
    );
    
    const buttonClass = isMobile
        ? "inline-flex items-center justify-center w-10 h-10 rounded-md border border-gray-300 shadow-sm bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 relative"
        : "inline-flex items-center justify-center rounded-md border border-gray-300 shadow-sm px-4 h-10 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500";

    const filterIcon = activeFilterCount > 0 ? 'filter_alt' : 'filter_alt_off';
    const desktopLabel = activeFilterCount > 0 ? `${t('filter.title')}: ${activeFilterCount}` : t('filter.title');


    return (
        <div className="relative inline-block text-left" ref={wrapperRef}>
            <button
                type="button"
                onClick={handleToggleDropdown}
                className={buttonClass}
                id="filter-menu-button"
                aria-expanded={isOpen}
                aria-haspopup="true"
                aria-label={t('filter.title')}
            >
                {isMobile ? (
                    <>
                        <i className="material-icons">{filterIcon}</i>
                        {activeFilterCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                                {activeFilterCount}
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        <i className="material-icons -ml-1 mr-2 text-[20px]">{filterIcon}</i>
                        <span>{desktopLabel}</span>
                        <i className="material-icons -mr-1 ml-2 text-[20px]">arrow_drop_down</i>
                    </>
                )}
            </button>

            {isOpen && (
                <div
                    className="origin-top-right absolute right-0 mt-2 w-72 h-[450px] max-h-[70vh] rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10 overflow-hidden flex flex-col"
                    role="menu"
                    aria-orientation="vertical"
                >
                    {renderMenu()}
                </div>
            )}
        </div>
    );
};

export default FilterControl;
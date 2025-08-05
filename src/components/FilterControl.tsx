import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from '../App';

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
    const [activeSubMenu, setActiveSubMenu] = useState<MenuType | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

    const menuItems = useMemo<{ key: MenuType; label: string }[]>(() => [
        { key: 'years', label: t('filter.years') },
        { key: 'categories', label: t('filter.categories') },
        { key: 'schools', label: t('filter.schools') },
        { key: 'instructors', label: t('filter.instructors') },
    ], [t]);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (excludedIds.years.length > 0) count++;
        if (excludedIds.categories.length > 0) count++;
        if (excludedIds.schools.length > 0) count++;
        if (excludedIds.instructors.length > 0) count++;
        return count;
    }, [excludedIds]);


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setActiveSubMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => {
        setIsOpen(!isOpen);
        if (isOpen) setActiveSubMenu(null);
    };

    const handleCheckboxChange = (menu: MenuType, id: string, isChecked: boolean) => {
        const currentExcluded = excludedIds[menu];
        let newExcluded: string[];
        if (isChecked) {
            newExcluded = currentExcluded.filter(exId => exId !== id);
        } else {
            newExcluded = [...currentExcluded, id];
        }
        onFilterChange({ ...excludedIds, [menu]: newExcluded });
    };

    const handleClear = (menu: MenuType, allIds: string[]) => {
        onFilterChange({ ...excludedIds, [menu]: allIds });
    };

    const handleSelectAll = (menu: MenuType) => {
        onFilterChange({ ...excludedIds, [menu]: [] });
    };
    
    const renderSubMenu = () => {
        if (!activeSubMenu) return null;

        let allItems: { id: string; name: string }[] = [];
        let title = '';

        switch (activeSubMenu) {
            case 'years':
                allItems = filterOptions.years.map(y => ({ id: y, name: y }));
                title = t('filter.years');
                break;
            case 'categories':
                allItems = [{id: uncategorizedId, name: uncategorizedLabel}, ...filterOptions.categories];
                title = t('filter.categories');
                break;
            case 'schools':
                allItems = [{id: unassignedId, name: unassignedLabel}, ...filterOptions.schools];
                title = t('filter.schools');
                break;
            case 'instructors':
                allItems = [{id: unassignedId, name: unassignedLabel}, ...filterOptions.instructors];
                title = t('filter.instructors');
                break;
        }
        
        const allIds = allItems.map(item => item.id);
        const excluded = excludedIds[activeSubMenu];

        return (
            <div className="absolute inset-0 bg-white flex flex-col animate-slide-in">
                <div className="flex-shrink-0 flex items-center p-2 border-b border-gray-200">
                    <button onClick={() => setActiveSubMenu(null)} className="p-2 text-gray-700 hover:bg-gray-100 rounded-full">
                        <i className="material-icons">arrow_back</i>
                    </button>
                    <h4 className="ml-2 font-semibold text-gray-800">{title}</h4>
                </div>
                <div className="flex-grow overflow-y-auto p-2">
                    {allItems.map(item => {
                        const isChecked = !excluded.includes(item.id);
                        return (
                            <label key={item.id} className="flex items-center p-2 rounded-md hover:bg-gray-100 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => handleCheckboxChange(activeSubMenu, item.id, e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-3 text-sm text-gray-800">{item.name}</span>
                            </label>
                        );
                    })}
                </div>
                <div className="flex-shrink-0 flex justify-end space-x-2 p-2 border-t border-gray-200">
                    <button onClick={() => handleClear(activeSubMenu, allIds)} className="px-3 py-1 text-sm text-blue-600 font-medium rounded-md hover:bg-blue-50">{t('common.clear')}</button>
                    <button onClick={() => handleSelectAll(activeSubMenu)} className="px-3 py-1 text-sm text-blue-600 font-medium rounded-md hover:bg-blue-50">{t('common.selectAll')}</button>
                </div>
            </div>
        );
    };

    const renderMainMenu = () => (
        <ul className="animate-fade-in-fast">
            {menuItems.map(item => {
                const isFiltered = excludedIds[item.key].length > 0;
                return (
                    <li key={item.key}>
                        <button onClick={() => setActiveSubMenu(item.key)} className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-gray-100">
                            <span className={`flex-grow ${isFiltered ? 'font-bold' : ''}`}>{item.label}</span>
                            {isFiltered && <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>}
                            <i className="material-icons ml-auto text-lg text-gray-500">chevron_right</i>
                        </button>
                    </li>
                );
            })}
        </ul>
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
                onClick={handleToggle}
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
                    className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10 overflow-hidden"
                    role="menu"
                    aria-orientation="vertical"
                    style={{ minHeight: '180px' }}
                >
                    <div className="py-1 relative h-full">
                        {activeSubMenu ? renderSubMenu() : renderMainMenu()}
                    </div>
                </div>
            )}
            <style>{`
                @keyframes fade-in-fast { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in-fast { animation: fade-in-fast 0.1s ease-out forwards; }
                @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .animate-slide-in { animation: slide-in 0.2s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default FilterControl;

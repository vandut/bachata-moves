import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import BaseModal from './BaseModal';
import { useTranslation } from '../App';
import type { ModalAction, FigureCategory, LessonCategory, AppSettings } from '../types';
import { dataService } from '../data/service';
import { useGoogleDrive } from '../hooks/useGoogleDrive';

interface GalleryContext {
    isMobile: boolean;
}

type GenericCategory = (FigureCategory | LessonCategory) & {
  isNew?: boolean;
  isDirty?: boolean;
  isSpecial?: boolean; // For the "Uncategorized" group
};

const UNCATEGORIZED_ID = '__uncategorized__';

const CustomizeGroupingScreen: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isMobile } = useOutletContext<GalleryContext>();
    const { t, updateSettings, reloadAllData } = useTranslation();
    const { isSignedIn, forceUploadGroupingConfig } = useGoogleDrive();

    const type = useMemo(() => location.pathname.startsWith('/lessons') ? 'lesson' : 'figure', [location.pathname]);

    const [localItems, setLocalItems] = useState<GenericCategory[]>([]);
    const [initialCategories, setInitialCategories] = useState<GenericCategory[]>([]);
    const [showEmpty, setShowEmpty] = useState(false);
    const [showCount, setShowCount] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const config = useMemo(() => {
        return type === 'lesson'
            ? {
                getCategories: dataService.getLessonCategories,
                addCategory: dataService.addLessonCategory,
                updateCategory: dataService.updateLessonCategory,
                deleteCategory: dataService.deleteLessonCategory,
                updateSettingsKeys: {
                    order: 'lessonCategoryOrder' as keyof AppSettings,
                    showEmpty: 'showEmptyLessonCategoriesInGroupedView' as keyof AppSettings,
                    showCount: 'showLessonCountInGroupHeaders' as keyof AppSettings,
                }
            }
            : {
                getCategories: dataService.getFigureCategories,
                addCategory: dataService.addFigureCategory,
                updateCategory: dataService.updateFigureCategory,
                deleteCategory: dataService.deleteFigureCategory,
                updateSettingsKeys: {
                    order: 'figureCategoryOrder' as keyof AppSettings,
                    showEmpty: 'showEmptyFigureCategoriesInGroupedView' as keyof AppSettings,
                    showCount: 'showFigureCountInGroupHeaders' as keyof AppSettings,
                }
            };
    }, [type]);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Load local data directly without a pre-sync check.
                const [localDBSettings, fetchedCategories] = await Promise.all([
                    dataService.getSettings(),
                    config.getCategories()
                ]);

                setInitialCategories(fetchedCategories);

                const uncategorizedItem: GenericCategory = {
                    id: UNCATEGORIZED_ID,
                    name: t('common.uncategorized'),
                    isSpecial: true,
                };

                const allItemsMap = new Map<string, GenericCategory>();
                fetchedCategories.forEach(cat => allItemsMap.set(cat.id, cat));
                allItemsMap.set(uncategorizedItem.id, uncategorizedItem);
                
                const currentOrder = (type === 'lesson' ? localDBSettings.lessonCategoryOrder : localDBSettings.figureCategoryOrder) || [];
                const currentShowEmpty = type === 'lesson' ? localDBSettings.showEmptyLessonCategoriesInGroupedView : localDBSettings.showEmptyFigureCategoriesInGroupedView;
                const currentShowCount = type === 'lesson' ? localDBSettings.showLessonCountInGroupHeaders : localDBSettings.showFigureCountInGroupHeaders;
                
                const orderedItems: GenericCategory[] = [];
                const processedIds = new Set<string>();

                for (const id of currentOrder) {
                    if (allItemsMap.has(id)) {
                        orderedItems.push(allItemsMap.get(id)!);
                        processedIds.add(id);
                    }
                }

                for (const id of allItemsMap.keys()) {
                    if (!processedIds.has(id)) {
                        orderedItems.push(allItemsMap.get(id)!);
                    }
                }
                
                setLocalItems(orderedItems);
                setShowEmpty(!!currentShowEmpty);
                setShowCount(!!currentShowCount);

            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        
        loadData();
    }, [type, t, config]);


    const handleClose = () => navigate(type === 'lesson' ? '/lessons' : '/figures');
    
    const handleSave = async () => {
        setError(null);
        if (localItems.some(item => !item.isSpecial && item.name.trim() === '')) {
            setError(t('customizeCategories.nameRequiredError'));
            return;
        }

        setIsSaving(true);

        try {
            const initialIds = new Set(initialCategories.map(c => c.id));
            const finalRealItems = localItems.filter(item => !item.isSpecial);
            const finalIds = new Set(finalRealItems.map(item => item.id));

            const idsToDelete = [...initialIds].filter(id => !finalIds.has(id));
            
            const deletePromises = idsToDelete.map(id => config.deleteCategory(id));
            const updatePromises = finalRealItems
                .filter(item => !item.isNew && item.isDirty)
                .map(item => config.updateCategory(item.id, { name: item.name.trim() }));
            const addPromises = finalRealItems
                .filter(item => item.isNew)
                .map(item => config.addCategory(item.name.trim()));
            
            const newCategories = await Promise.all(addPromises);
            await Promise.all([...deletePromises, ...updatePromises]);

            const newIdMap = new Map<string, string>();
            localItems.filter(c => c.isNew).forEach((c, index) => {
                newIdMap.set(c.id, newCategories[index].id);
            });
            
            const finalCategoryOrder = localItems.map(item => newIdMap.get(item.id) || item.id);
            
            const newSettings: Partial<AppSettings> = {
                [config.updateSettingsKeys.order]: finalCategoryOrder,
                [config.updateSettingsKeys.showEmpty]: showEmpty,
                [config.updateSettingsKeys.showCount]: showCount,
            };
            await updateSettings(newSettings);
            
            if (isSignedIn) {
                await forceUploadGroupingConfig(type);
            }
            
            reloadAllData();
            handleClose();

        } catch (err) {
            console.error(err);
            setError(t('customizeCategories.errorSave'));
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleMove = (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= localItems.length) return;

        const updatedItems = [...localItems];
        [updatedItems[index], updatedItems[newIndex]] = [updatedItems[newIndex], updatedItems[index]];
        setLocalItems(updatedItems);
    };

    const handleNameChange = (id: string, newName: string) => {
        setLocalItems(prev => prev.map(cat => 
            cat.id === id ? { ...cat, name: newName, isDirty: true } : cat
        ));
    };

    const handleAddNew = () => {
        const newCategory: GenericCategory = {
            id: `new-${Date.now()}`,
            name: '',
            isNew: true,
        };
        setLocalItems(prev => [...prev, newCategory]);
    };

    const handleDeleteItem = (id: string) => {
        setLocalItems(prev => prev.filter(item => item.id !== id));
    };
    
    const isSaveDisabled = useMemo(() => {
      return isSaving || isLoading || localItems.some(item => !item.isSpecial && item.name.trim() === '');
    }, [isSaving, isLoading, localItems]);

    const primaryAction: ModalAction = {
        label: t('common.save'),
        onClick: handleSave,
        isLoading: isSaving,
        disabled: isSaveDisabled,
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center h-48">
                    <i className="material-icons text-4xl text-gray-400 animate-spin">sync</i>
                    <p className="mt-4 text-gray-600">{t('common.loading')}</p>
                </div>
            );
        }

        return (
          <>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                {localItems.map((item, index) => (
                    <div key={item.id} className="flex items-center space-x-2 bg-gray-50 p-2 rounded-md">
                        {item.isSpecial ? (
                             <span className="flex-grow px-2 py-1 text-gray-700 font-medium select-none">{item.name}</span>
                        ) : (
                             <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleNameChange(item.id, e.target.value)}
                                placeholder={t('common.category')}
                                className="flex-grow px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                        )}
                        <button onClick={() => handleMove(index, 'up')} disabled={index === 0} className="p-1 text-gray-500 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed"><i className="material-icons">keyboard_arrow_up</i></button>
                        <button onClick={() => handleMove(index, 'down')} disabled={index === localItems.length - 1} className="p-1 text-gray-500 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed"><i className="material-icons">keyboard_arrow_down</i></button>
                        <button
                            onClick={() => handleDeleteItem(item.id)}
                            disabled={item.isSpecial}
                            className={`p-1 text-red-500 hover:text-red-700 ${item.isSpecial ? 'invisible' : ''}`}
                            aria-hidden={item.isSpecial}
                        >
                            <i className="material-icons">delete</i>
                        </button>
                    </div>
                ))}
            </div>
            <button onClick={handleAddNew} className="mt-4 w-full flex items-center justify-center py-2 px-4 border border-dashed border-gray-400 text-gray-600 rounded-md hover:bg-gray-100 hover:border-gray-500">
                <i className="material-icons mr-2">add</i>
                {t('customizeCategories.add')}
            </button>
            <div className="border-t border-gray-200 mt-6 pt-5 space-y-4">
                 <div
                    onClick={() => setShowEmpty(!showEmpty)}
                    role="switch"
                    aria-checked={showEmpty}
                    className="flex items-center justify-between cursor-pointer"
                >
                    <div>
                        <span className="text-gray-700">{t('customizeCategories.showEmpty')}</span>
                        <p className="text-sm text-gray-500">{t('customizeCategories.showEmptyDesc')}</p>
                    </div>
                    {/* Toggle switch */}
                    <div className={`relative w-11 h-6 flex-shrink-0 rounded-full transition-colors duration-300 ease-in-out ${showEmpty ? 'bg-blue-500' : 'bg-gray-300'}`}>
                        <div
                            className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
                                showEmpty ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        ></div>
                    </div>
                </div>
                <div
                    onClick={() => setShowCount(!showCount)}
                    role="switch"
                    aria-checked={showCount}
                    className="flex items-center justify-between cursor-pointer"
                >
                    <div>
                        <span className="text-gray-700">{t('customizeCategories.showCount')}</span>
                        <p className="text-sm text-gray-500">{t('customizeCategories.showCountDesc')}</p>
                    </div>
                    {/* Toggle switch */}
                    <div className={`relative w-11 h-6 flex-shrink-0 rounded-full transition-colors duration-300 ease-in-out ${showCount ? 'bg-blue-500' : 'bg-gray-300'}`}>
                        <div
                            className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
                                showCount ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        ></div>
                    </div>
                </div>
            </div>
          </>
        );
    };

    return (
        <BaseModal
            onClose={handleClose}
            primaryAction={primaryAction}
            title={t('customizeCategories.title')}
            isMobile={isMobile}
            desktopWidth="max-w-lg"
            error={error}
        >
            {renderContent()}
        </BaseModal>
    );
};

export default CustomizeGroupingScreen;
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import BaseModal from './BaseModal';
import { useTranslation } from '../contexts/I18nContext';
import type { ModalAction, FigureCategory, LessonCategory, School, Instructor } from '../types';
import { localDatabaseService } from '../services/LocalDatabaseService';
import { dataService } from '../services/DataService';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { settingsService, GroupingConfiguration } from '../services/SettingsService';
// FIX: Import `useSettings` hook to access settings context.
import { useSettings } from '../contexts/SettingsContext';

interface GalleryContext {
    isMobile: boolean;
}

type GenericCategory = (FigureCategory | LessonCategory | School | Instructor) & {
  isNew?: boolean;
  isDirty?: boolean;
  isSpecial?: boolean; // For the "Uncategorized" group
};

const UNCATEGORIZED_ID = '__uncategorized__';
const UNASSIGNED_ID = '__unassigned__';

const CustomizeGroupingScreen: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isMobile } = useOutletContext<GalleryContext>();
    // FIX: `settings` and `reloadAllData` come from `useSettings`, not `useTranslation`.
    const { t } = useTranslation();
    const { settings, reloadAllData } = useSettings();
    const { isSignedIn, forceUploadGroupingConfig, forceDeleteGroupingItem } = useGoogleDrive();

    const type = useMemo(() => location.pathname.startsWith('/lessons') ? 'lesson' : 'figure', [location.pathname]);

    const [categories, setCategories] = useState<GenericCategory[]>([]);
    const [schools, setSchools] = useState<GenericCategory[]>([]);
    const [instructors, setInstructors] = useState<GenericCategory[]>([]);

    const [showEmpty, setShowEmpty] = useState(false);
    const [showCount, setShowCount] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; type: 'category' | 'school' | 'instructor'} | null>(null);

    const config = useMemo(() => {
        return type === 'lesson'
            ? {
                getCategories: localDatabaseService.getLessonCategories, addCategory: localDatabaseService.addLessonCategory, updateCategory: localDatabaseService.updateLessonCategory, deleteCategory: dataService.deleteLessonCategory,
                getSchools: localDatabaseService.getSchools, addSchool: localDatabaseService.addSchool, updateSchool: localDatabaseService.updateSchool, deleteSchool: dataService.deleteSchool,
                getInstructors: localDatabaseService.getInstructors, addInstructor: localDatabaseService.addInstructor, updateInstructor: localDatabaseService.updateInstructor, deleteInstructor: dataService.deleteInstructor,
            }
            : {
                getCategories: localDatabaseService.getFigureCategories, addCategory: localDatabaseService.addFigureCategory, updateCategory: localDatabaseService.updateFigureCategory, deleteCategory: dataService.deleteFigureCategory,
                getSchools: localDatabaseService.getSchools, addSchool: localDatabaseService.addSchool, updateSchool: localDatabaseService.updateSchool, deleteSchool: dataService.deleteSchool,
                getInstructors: localDatabaseService.getInstructors, addInstructor: localDatabaseService.addInstructor, updateInstructor: localDatabaseService.updateInstructor, deleteInstructor: dataService.deleteInstructor,
            };
    }, [type]);

    useEffect(() => {
        const buildOrderedList = (
            items: (School | Instructor | LessonCategory | FigureCategory)[],
            order: string[],
            specialId: string,
            specialName: string
        ): GenericCategory[] => {
            const specialItem: GenericCategory = { id: specialId, name: specialName, isSpecial: true };
            const allItemsMap = new Map<string, GenericCategory>([...items, specialItem].map(c => [c.id, c]));
            const currentOrder = order || [];
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
            return orderedItems;
        };

        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [fetchedCategories, fetchedSchools, fetchedInstructors] = await Promise.all([
                    config.getCategories(),
                    config.getSchools(),
                    config.getInstructors(),
                ]);
                
                const { lessonCategoryOrder, lessonSchoolOrder, lessonInstructorOrder, figureCategoryOrder, figureSchoolOrder, figureInstructorOrder } = settings;
                const categoryOrder = type === 'lesson' ? lessonCategoryOrder : figureCategoryOrder;
                const schoolOrder = type === 'lesson' ? lessonSchoolOrder : figureSchoolOrder;
                const instructorOrder = type === 'lesson' ? lessonInstructorOrder : figureInstructorOrder;

                setCategories(buildOrderedList(fetchedCategories, categoryOrder, UNCATEGORIZED_ID, t('common.uncategorized')));
                setSchools(buildOrderedList(fetchedSchools, schoolOrder, UNASSIGNED_ID, t('common.unassigned')));
                setInstructors(buildOrderedList(fetchedInstructors, instructorOrder, UNASSIGNED_ID, t('common.unassigned')));

                setShowEmpty(!!(type === 'lesson' ? settings.showEmptyLessonCategoriesInGroupedView : settings.showEmptyFigureCategoriesInGroupedView));
                setShowCount(!!(type === 'lesson' ? settings.showLessonCountInGroupHeaders : settings.showFigureCountInGroupHeaders));
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [type, t, config, settings]);


    const handleClose = () => navigate(type === 'lesson' ? '/lessons' : '/figures');
    
    const handleSave = async () => {
        setError(null);
        if ([...categories, ...schools, ...instructors].some(item => !item.isSpecial && item.name.trim() === '')) {
            setError(t('customizeCategories.nameRequiredError'));
            return;
        }
        setIsSaving(true);
        try {
            const initialCategories = await config.getCategories();
            const initialSchools = await config.getSchools();
            const initialInstructors = await config.getInstructors();

            const createUpdateDelete = async (initialItems: any[], localItems: any[], addFn: any, updateFn: any) => {
                const localIds = new Set(localItems.map(i => i.id));
                const toDelete = initialItems.filter(i => !localIds.has(i.id));
                for(const item of toDelete) {
                    if (item.id.includes('category')) await config.deleteCategory(item.id);
                    else if (item.id.includes('school')) await config.deleteSchool(item.id);
                    else if (item.id.includes('instructor')) await config.deleteInstructor(item.id);
                }

                const toAdd = localItems.filter(i => i.isNew).map(i => addFn(i.name.trim()));
                const toUpdate = localItems.filter(i => !i.isNew && i.isDirty).map(i => updateFn(i.id, { name: i.name.trim() }));
                const newItems = await Promise.all(toAdd);
                await Promise.all(toUpdate);
                return newItems;
            };
            
            const newCats = await createUpdateDelete(initialCategories, categories.filter(c => !c.isSpecial), config.addCategory, config.updateCategory);
            const newSchools = await createUpdateDelete(initialSchools, schools.filter(s => !s.isSpecial), config.addSchool, config.updateSchool);
            const newInstructors = await createUpdateDelete(initialInstructors, instructors.filter(i => !i.isNew), config.addInstructor, config.updateInstructor);
            
            const newCatIdMap = new Map<string, string>();
            categories.filter(c => c.isNew).forEach((c, index) => { newCatIdMap.set(c.id, newCats[index].id); });
            const finalCategoryOrder = categories.map(item => newCatIdMap.get(item.id) || item.id);

            const newSchoolIdMap = new Map<string, string>();
            schools.filter(s => s.isNew).forEach((s, index) => { newSchoolIdMap.set(s.id, newSchools[index].id); });
            const finalSchoolOrder = schools.map(item => newSchoolIdMap.get(item.id) || item.id);

            const newInstructorIdMap = new Map<string, string>();
            instructors.filter(i => i.isNew).forEach((i, index) => { newInstructorIdMap.set(i.id, newInstructors[index].id); });
            const finalInstructorOrder = instructors.map(item => newInstructorIdMap.get(item.id) || item.id);
            
            const groupingConfig: GroupingConfiguration = {
                categoryOrder: finalCategoryOrder,
                schoolOrder: finalSchoolOrder,
                instructorOrder: finalInstructorOrder,
                showEmpty: showEmpty,
                showCount: showCount,
            };
            await settingsService.saveGroupingConfiguration(type, groupingConfig);
            
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
    
    const isSaveDisabled = useMemo(() => {
      return isSaving || isLoading || [...categories, ...schools, ...instructors].some(item => !item.isSpecial && !item.name.trim());
    }, [isSaving, isLoading, categories, schools, instructors]);

    const primaryAction: ModalAction = { label: t('common.save'), onClick: handleSave, isLoading: isSaving, disabled: isSaveDisabled };

    const renderEditableList = (title: string, items: GenericCategory[], setItems: React.Dispatch<React.SetStateAction<GenericCategory[]>>, options: { reorderable: boolean; addText: string; deleteText: string; type: 'category' | 'school' | 'instructor' }) => {
        const handleMove = (index: number, direction: 'up' | 'down') => {
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= items.length) return;
            const updatedItems = [...items];
            [updatedItems[index], updatedItems[newIndex]] = [updatedItems[newIndex], updatedItems[index]];
            setItems(updatedItems);
        };
        const handleNameChange = (id: string, newName: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, name: newName, isDirty: true } : i));
        const handleAddNew = () => setItems(prev => [...prev, { id: `new-${options.type}-${Date.now()}`, name: '', isNew: true }]);
        const handleDelete = (id: string, name: string) => setItemToDelete({ id, name, type: options.type });
        
        return (
            <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">{title}</h3>
                <div className="space-y-2">
                    {items.map((item, index) => (
                        <div key={item.id} className="flex items-center space-x-2 bg-gray-50 p-2 rounded-md">
                            {item.isSpecial ? (
                                <span className="flex-grow px-2 py-1 text-gray-700 font-medium select-none">{item.name}</span>
                            ) : (
                                <input type="text" value={item.name} onChange={(e) => handleNameChange(item.id, e.target.value)} placeholder={t('common.category')} className="flex-grow px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"/>
                            )}
                            {options.reorderable && <>
                                <button onClick={() => handleMove(index, 'up')} disabled={index === 0} className="p-1 text-gray-500 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed"><i className="material-icons">keyboard_arrow_up</i></button>
                                <button onClick={() => handleMove(index, 'down')} disabled={index === items.length - 1} className="p-1 text-gray-500 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed"><i className="material-icons">keyboard_arrow_down</i></button>
                            </>}
                            <button onClick={() => handleDelete(item.id, item.name)} disabled={item.isSpecial} className={`p-1 text-red-500 hover:text-red-700 ${item.isSpecial ? 'invisible' : ''}`} aria-hidden={item.isSpecial}>
                                <i className="material-icons">delete</i>
                            </button>
                        </div>
                    ))}
                </div>
                <button onClick={handleAddNew} className="mt-3 w-full flex items-center justify-center py-2 px-4 border border-dashed border-gray-400 text-gray-600 rounded-md hover:bg-gray-100 hover:border-gray-500">
                    <i className="material-icons mr-2">add</i>
                    {options.addText}
                </button>
            </div>
        );
    };
    
    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;
        const { id, type: itemType } = itemToDelete;

        const stateUpdaterMap = {
            category: setCategories,
            school: setSchools,
            instructor: setInstructors,
        };
        const stateItemsMap = {
            category: categories,
            school: schools,
            instructor: instructors,
        };

        const itemToDeleteObject = stateItemsMap[itemType].find(item => item.id === id);
        if (!itemToDeleteObject) return;
        
        try {
            if (isSignedIn) {
                await forceDeleteGroupingItem(itemToDeleteObject, itemType, type);
            } else {
                if (itemType === 'category') await config.deleteCategory(id);
                else if (itemType === 'school') await config.deleteSchool(id);
                else if (itemType === 'instructor') await config.deleteInstructor(id);
            }
            // Optimistic UI update
            stateUpdaterMap[itemType](prev => prev.filter(item => item.id !== id));
        } catch (err) {
            console.error("Failed to delete item:", err);
            setError(err instanceof Error ? err.message : "Failed to delete");
        }
        
        setItemToDelete(null);
    };

    const renderContent = () => {
        if (isLoading) {
            return <div className="flex flex-col items-center justify-center h-48"><i className="material-icons text-4xl text-gray-400 animate-spin-reverse">sync</i><p className="mt-4 text-gray-600">{t('common.loading')}</p></div>;
        }

        return (
          <>
            <div className="space-y-6 max-h-[60vh] overflow-y-auto p-1 pr-3">
                {renderEditableList(t('customizeCategories.sectionCategories'), categories, setCategories, { reorderable: true, addText: t('customizeCategories.add'), deleteText: '', type: 'category' })}
                <hr className="my-6 border-gray-300" />
                {renderEditableList(t('customizeCategories.sectionSchools'), schools, setSchools, { reorderable: true, addText: t('customizeCategories.addSchool'), deleteText: '', type: 'school' })}
                 <hr className="my-6 border-gray-300" />
                {renderEditableList(t('customizeCategories.sectionInstructors'), instructors, setInstructors, { reorderable: true, addText: t('customizeCategories.addInstructor'), deleteText: '', type: 'instructor' })}
            </div>
            
            <div className="border-t border-gray-200 mt-6 pt-5 space-y-4">
                 <div onClick={() => setShowEmpty(!showEmpty)} role="switch" aria-checked={showEmpty} className="flex items-center justify-between cursor-pointer">
                    <div><span className="text-gray-700">{t('customizeCategories.showEmpty')}</span><p className="text-sm text-gray-500">{t('customizeCategories.showEmptyDesc')}</p></div>
                    <div className={`relative w-11 h-6 flex-shrink-0 rounded-full transition-colors duration-300 ease-in-out ${showEmpty ? 'bg-blue-500' : 'bg-gray-300'}`}><div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${showEmpty ? 'translate-x-5' : 'translate-x-0'}`}></div></div>
                </div>
                <div onClick={() => setShowCount(!showCount)} role="switch" aria-checked={showCount} className="flex items-center justify-between cursor-pointer">
                    <div><span className="text-gray-700">{t('customizeCategories.showCount')}</span><p className="text-sm text-gray-500">{t('customizeCategories.showCountDesc')}</p></div>
                    <div className={`relative w-11 h-6 flex-shrink-0 rounded-full transition-colors duration-300 ease-in-out ${showCount ? 'bg-blue-500' : 'bg-gray-300'}`}><div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${showCount ? 'translate-x-5' : 'translate-x-0'}`}></div></div>
                </div>
            </div>
          </>
        );
    };

    return (
      <>
        <BaseModal
            onClose={handleClose}
            primaryAction={primaryAction}
            title={t('customizeCategories.title')}
            isMobile={isMobile}
            desktopWidth="max-w-xl"
            error={error}
        >
            {renderContent()}
        </BaseModal>
        <ConfirmDeleteModal
            isOpen={!!itemToDelete}
            onClose={() => setItemToDelete(null)}
            onConfirm={handleConfirmDelete}
            isDeleting={false}
            title={itemToDelete?.type === 'category' ? t('customizeCategories.deleteConfirmTitle') : itemToDelete?.type === 'school' ? t('customizeCategories.deleteSchoolConfirmTitle') : t('customizeCategories.deleteInstructorConfirmTitle')}
        >
            {itemToDelete && <p>{itemToDelete?.type === 'category' ? t('customizeCategories.deleteConfirmBody', { name: itemToDelete.name }) : itemToDelete?.type === 'school' ? t('customizeCategories.deleteSchoolConfirmBody', { name: itemToDelete.name }) : t('customizeCategories.deleteInstructorConfirmBody', { name: itemToDelete.name })}</p>}
        </ConfirmDeleteModal>
      </>
    );
};

export default CustomizeGroupingScreen;
import type { FigureCategory, LessonCategory, School, Instructor } from '../types';
import type { AppSettings } from '../contexts/SettingsContext';
import { localDatabaseService, LocalDatabaseService } from './LocalDatabaseService';
import { createLogger } from '../utils/logger';

const logger = createLogger('SettingsService');

const getInitialLanguage = (): 'english' | 'polish' => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('pl')) {
      return 'polish';
    }
  }
  return 'english'; // Default language
};

const defaultDeviceSettings: Partial<AppSettings> = {
  language: getInitialLanguage(),
  autoplayGalleryVideos: false,
  isMuted: false,
  volume: 1,
  lessonSortOrder: 'newest',
  figureSortOrder: 'newest',
  lessonGrouping: 'none',
  figureGrouping: 'none',
  collapsedLessonDateGroups: [],
  collapsedFigureDateGroups: [],
  uncategorizedFigureCategoryIsExpanded: true,
  uncategorizedLessonCategoryIsExpanded: true,
  collapsedLessonCategories: [],
  collapsedFigureCategories: [],
  collapsedLessonSchools: [],
  collapsedFigureSchools: [],
  uncategorizedLessonSchoolIsExpanded: true,
  uncategorizedFigureSchoolIsExpanded: true,
  collapsedLessonInstructors: [],
  collapsedFigureInstructors: [],
  uncategorizedLessonInstructorIsExpanded: true,
  uncategorizedFigureInstructorIsExpanded: true,
  lessonFilter_excludedYears: [],
  lessonFilter_excludedCategoryIds: [],
  lessonFilter_excludedSchoolIds: [],
  lessonFilter_excludedInstructorIds: [],
  figureFilter_excludedYears: [],
  figureFilter_excludedCategoryIds: [],
  figureFilter_excludedSchoolIds: [],
  figureFilter_excludedInstructorIds: [],
};

const defaultSyncSettings: Partial<AppSettings> = {
  figureCategoryOrder: [],
  showEmptyFigureCategoriesInGroupedView: false,
  showFigureCountInGroupHeaders: false,
  lessonCategoryOrder: [],
  showEmptyLessonCategoriesInGroupedView: false,
  showLessonCountInGroupHeaders: false,
  lessonSchoolOrder: [],
  figureSchoolOrder: [],
  lessonInstructorOrder: [],
  figureInstructorOrder: [],
  lastSyncTimestamp: undefined,
};


// --- Interface ---
interface RemoteGroupingItem {
    id: string;
    name: string;
    driveId?: string;
}

export interface RemoteGroupingConfig {
    categories: RemoteGroupingItem[];
    schools: RemoteGroupingItem[];
    instructors: RemoteGroupingItem[];
    showEmpty: boolean;
    showCount: boolean;
}

export interface GroupingConfiguration {
  categoryOrder: string[];
  schoolOrder: string[];
  instructorOrder: string[];
  showEmpty: boolean;
  showCount: boolean;
}
export interface SettingsService {
  getSettings(): Promise<AppSettings>;
  reloadSettings(): Promise<AppSettings>;
  updateSettings(updates: Partial<AppSettings>, options?: { silent?: boolean }): Promise<void>;
  applyRemoteSettings(updates: Partial<AppSettings>, modifiedTime: string): Promise<void>;
  subscribe(callback: (settings: AppSettings) => void): () => void;
  getSettingsSnapshot(): AppSettings | null;

  // New methods for toggling gallery group states
  toggleLessonCategoryCollapsed(categoryId: string): Promise<void>;
  toggleFigureCategoryCollapsed(categoryId: string): Promise<void>;
  toggleLessonUncategorizedExpanded(): Promise<void>;
  toggleFigureUncategorizedExpanded(): Promise<void>;
  toggleLessonDateGroupCollapsed(groupKey: string): Promise<void>;
  toggleFigureDateGroupCollapsed(groupKey: string): Promise<void>;
  toggleLessonSchoolCollapsed(schoolId: string): Promise<void>;
  toggleFigureSchoolCollapsed(schoolId: string): Promise<void>;
  toggleLessonUnassignedSchoolExpanded(): Promise<void>;
  toggleFigureUnassignedSchoolExpanded(): Promise<void>;
  toggleLessonInstructorCollapsed(instructorId: string): Promise<void>;
  toggleFigureInstructorCollapsed(instructorId: string): Promise<void>;
  toggleLessonUnassignedInstructorExpanded(): Promise<void>;
  toggleFigureUnassignedInstructorExpanded(): Promise<void>;

  // New method for saving grouping configuration
  saveGroupingConfiguration(type: 'lesson' | 'figure', config: GroupingConfiguration): Promise<void>;
  getGroupingConfigForUpload(type: 'lesson' | 'figure'): Promise<{ content: RemoteGroupingConfig, modifiedTime: string }>;
  applyRemoteGroupingConfig(type: 'lesson' | 'figure', config: RemoteGroupingConfig, modifiedTime: string): Promise<void>;
}

// --- Implementation ---
class SettingsServiceImpl implements SettingsService {
  private localDB: LocalDatabaseService;
  private settings: AppSettings | null = null;
  private listeners = new Set<(settings: AppSettings) => void>();
  private loadingPromise: Promise<AppSettings> | null = null;

  constructor(localDB: LocalDatabaseService) {
    this.localDB = localDB;
    this.getSettings(); // Pre-warm the settings cache
  }

  public getSettingsSnapshot(): AppSettings | null {
    return this.settings;
  }

  public getSettings(): Promise<AppSettings> {
    if (this.settings) {
        return Promise.resolve(this.settings);
    }
    if (this.loadingPromise) {
        return this.loadingPromise;
    }
    logger.info('Loading settings from database...');
    this.loadingPromise = this.localDB.getRawSettings().then(({ device, sync }) => {
        const fullSettings = {
            ...defaultDeviceSettings,
            ...(device || {}),
            ...defaultSyncSettings,
            ...(sync || {}),
        } as AppSettings;
        this.settings = fullSettings;
        this.notify();
        logger.info('Settings loaded and merged.');
        return fullSettings;
    }).catch(err => {
        logger.error('Failed to load settings, returning defaults.', err);
        this.settings = { ...defaultDeviceSettings, ...defaultSyncSettings } as AppSettings;
        this.notify();
        return this.settings;
    }).finally(() => {
        this.loadingPromise = null;
    });
    return this.loadingPromise;
  }
  
  public async reloadSettings(): Promise<AppSettings> {
      this.settings = null;
      this.loadingPromise = null;
      return this.getSettings();
  }

  public async updateSettings(updates: Partial<AppSettings>, options?: { silent?: boolean }): Promise<void> {
    const currentSettings = await this.getSettings();
    const newSettings = { ...currentSettings, ...updates };
    this.settings = newSettings; // Optimistic update

    try {
      await this.localDB.saveAllSettings(newSettings);
      if (!options?.silent) {
        this.notify();
      }
    } catch (error) {
      logger.error('Failed to save settings', error);
      // Revert optimistic update on failure
      this.settings = currentSettings;
      if (!options?.silent) {
        this.notify();
      }
    }
  }

  public async applyRemoteSettings(updates: Partial<AppSettings>, modifiedTime: string): Promise<void> {
    const currentSettings = await this.getSettings();
    const newSettings = { ...currentSettings, ...updates };
    this.settings = newSettings; // Optimistic update

    try {
        await this.localDB.saveAllSettings(newSettings, modifiedTime);
        this.notify();
    } catch (error) {
        logger.error('Failed to apply remote settings', error);
        // Revert optimistic update on failure
        this.settings = currentSettings;
        this.notify();
    }
  }

  public subscribe(callback: (settings: AppSettings) => void): () => void {
    this.listeners.add(callback);
    // Immediately call with current settings if they are loaded
    if (this.settings) {
      callback(this.settings);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(): void {
    if (this.settings) {
      this.listeners.forEach(listener => listener(this.settings!));
    }
  }

  // --- Private Helpers for Toggling State ---
  private async toggleArrayItem(key: keyof AppSettings, id: string): Promise<void> {
    const currentSettings = await this.getSettings();
    const currentArray = (currentSettings[key] as string[] | undefined) || [];
    const isIncluded = currentArray.includes(id);
    const newArray = isIncluded
        ? currentArray.filter(i => i !== id)
        : [...currentArray, id];
    
    // Optimistic update and persist
    this.updateSettings({ [key]: newArray } as Partial<AppSettings>);
  }

  private async toggleBoolean(key: keyof AppSettings): Promise<void> {
      const currentSettings = await this.getSettings();
      const currentValue = !!currentSettings[key];
      this.updateSettings({ [key]: !currentValue } as Partial<AppSettings>);
  }

  // --- Public Toggle Methods ---
  public toggleLessonCategoryCollapsed = (categoryId: string): Promise<void> => this.toggleArrayItem('collapsedLessonCategories', categoryId);
  public toggleFigureCategoryCollapsed = (categoryId: string): Promise<void> => this.toggleArrayItem('collapsedFigureCategories', categoryId);
  
  public toggleLessonUncategorizedExpanded = (): Promise<void> => this.toggleBoolean('uncategorizedLessonCategoryIsExpanded');
  public toggleFigureUncategorizedExpanded = (): Promise<void> => this.toggleBoolean('uncategorizedFigureCategoryIsExpanded');
  
  public toggleLessonDateGroupCollapsed = (groupKey: string): Promise<void> => this.toggleArrayItem('collapsedLessonDateGroups', groupKey);
  public toggleFigureDateGroupCollapsed = (groupKey: string): Promise<void> => this.toggleArrayItem('collapsedFigureDateGroups', groupKey);
  
  public toggleLessonSchoolCollapsed = (schoolId: string): Promise<void> => this.toggleArrayItem('collapsedLessonSchools', schoolId);
  public toggleFigureSchoolCollapsed = (schoolId: string): Promise<void> => this.toggleArrayItem('collapsedFigureSchools', schoolId);
  
  public toggleLessonUnassignedSchoolExpanded = (): Promise<void> => this.toggleBoolean('uncategorizedLessonSchoolIsExpanded');
  public toggleFigureUnassignedSchoolExpanded = (): Promise<void> => this.toggleBoolean('uncategorizedFigureSchoolIsExpanded');
  
  public toggleLessonInstructorCollapsed = (instructorId: string): Promise<void> => this.toggleArrayItem('collapsedLessonInstructors', instructorId);
  public toggleFigureInstructorCollapsed = (instructorId: string): Promise<void> => this.toggleArrayItem('collapsedFigureInstructors', instructorId);

  public toggleLessonUnassignedInstructorExpanded = (): Promise<void> => this.toggleBoolean('uncategorizedLessonInstructorIsExpanded');
  public toggleFigureUnassignedInstructorExpanded = (): Promise<void> => this.toggleBoolean('uncategorizedFigureInstructorIsExpanded');

  // --- Public Method for Saving Grouping ---
  public async saveGroupingConfiguration(type: 'lesson' | 'figure', config: GroupingConfiguration): Promise<void> {
    const settingsUpdate: Partial<AppSettings> = type === 'lesson'
        ? {
            lessonCategoryOrder: config.categoryOrder,
            lessonSchoolOrder: config.schoolOrder,
            lessonInstructorOrder: config.instructorOrder,
            showEmptyLessonCategoriesInGroupedView: config.showEmpty,
            showLessonCountInGroupHeaders: config.showCount,
          }
        : {
            figureCategoryOrder: config.categoryOrder,
            figureSchoolOrder: config.schoolOrder,
            figureInstructorOrder: config.instructorOrder,
            showEmptyFigureCategoriesInGroupedView: config.showEmpty,
            showFigureCountInGroupHeaders: config.showCount,
          };
    
    await this.updateSettings(settingsUpdate);
  }

  public async getGroupingConfigForUpload(type: 'lesson' | 'figure'): Promise<{ content: RemoteGroupingConfig; modifiedTime: string; }> {
    const allSettings = await this.getSettings();
    const syncSettingsInDb = await this.localDB.getRawSettings().then(s => s.sync);

    const [categories, schools, instructors] = await Promise.all(type === 'lesson' 
      ? [this.localDB.getLessonCategories(), this.localDB.getSchools(), this.localDB.getInstructors()]
      : [this.localDB.getFigureCategories(), this.localDB.getSchools(), this.localDB.getInstructors()]
    );

    const sortItems = <T extends { id: string }>(items: T[], order: string[]): T[] => {
        const orderMap = new Map(order.map((id, index) => [id, index]));
        return [...items].sort((a, b) => {
            const indexA = orderMap.get(a.id);
            const indexB = orderMap.get(b.id);
            if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
            if (indexA !== undefined) return -1;
            if (indexB !== undefined) return 1;
            return 0; // or some other default sort
        });
    };

    const content: RemoteGroupingConfig = type === 'lesson'
        ? {
            categories: sortItems(categories, allSettings.lessonCategoryOrder),
            schools: sortItems(schools, allSettings.lessonSchoolOrder),
            instructors: sortItems(instructors, allSettings.lessonInstructorOrder),
            showEmpty: allSettings.showEmptyLessonCategoriesInGroupedView,
            showCount: allSettings.showLessonCountInGroupHeaders,
        } : {
            categories: sortItems(categories, allSettings.figureCategoryOrder),
            schools: sortItems(schools, allSettings.figureSchoolOrder),
            instructors: sortItems(instructors, allSettings.figureInstructorOrder),
            showEmpty: allSettings.showEmptyFigureCategoriesInGroupedView,
            showCount: allSettings.showFigureCountInGroupHeaders,
        };
          
    const modifiedTime = (syncSettingsInDb as any)?.modifiedTime || new Date(0).toISOString();

    return { content, modifiedTime };
  }

  public async applyRemoteGroupingConfig(type: 'lesson' | 'figure', remoteConfig: RemoteGroupingConfig, modifiedTime: string): Promise<void> {
    logger.info(`Applying remote grouping config for ${type}`);

    // FIX: Destructure with default empty arrays to prevent crash if remote config is malformed.
    const { 
        categories = [], 
        schools = [], 
        instructors = [],
        showEmpty = false,
        showCount = false
    } = remoteConfig || {};

    const syncItems = async <T extends { id: string; name: string; driveId?: string; }>(
        remoteItems: RemoteGroupingItem[],
        getLocalItems: () => Promise<T[]>,
        addItem: (name: string, driveId?: string) => Promise<T>,
        updateItem: (id: string, data: { name: string; driveId?: string }) => Promise<T>,
        deleteItem: (id: string) => Promise<void>
    ) => {
        const localItems = await getLocalItems();
        const localMap = new Map(localItems.map(item => [item.id, item]));
        const remoteMap = new Map(remoteItems.map(item => [item.id, item]));

        // Add/Update
        for (const remoteItem of remoteItems) {
            const localItem = localMap.get(remoteItem.id);
            if (localItem) {
                if (localItem.name !== remoteItem.name || localItem.driveId !== remoteItem.driveId) {
                    await updateItem(localItem.id, { name: remoteItem.name, driveId: remoteItem.driveId });
                }
            } else {
                await addItem(remoteItem.name, remoteItem.driveId);
            }
        }
        // Delete
        for (const localItem of localItems) {
            if (!remoteMap.has(localItem.id)) {
                await deleteItem(localItem.id);
            }
        }
    };

    if (type === 'lesson') {
        await syncItems(categories, this.localDB.getLessonCategories, this.localDB.addLessonCategory, this.localDB.updateLessonCategory, this.localDB.deleteLessonCategory);
    } else {
        await syncItems(categories, this.localDB.getFigureCategories, this.localDB.addFigureCategory, this.localDB.updateFigureCategory, this.localDB.deleteFigureCategory);
    }
    await syncItems(schools, this.localDB.getSchools, this.localDB.addSchool, this.localDB.updateSchool, this.localDB.deleteSchool);
    await syncItems(instructors, this.localDB.getInstructors, this.localDB.addInstructor, this.localDB.updateInstructor, this.localDB.deleteInstructor);

    const settingsUpdate: Partial<AppSettings> = type === 'lesson'
        ? {
            lessonCategoryOrder: categories.map(c => c.id),
            lessonSchoolOrder: schools.map(s => s.id),
            lessonInstructorOrder: instructors.map(i => i.id),
            showEmptyLessonCategoriesInGroupedView: showEmpty,
            showLessonCountInGroupHeaders: showCount,
        } : {
            figureCategoryOrder: categories.map(c => c.id),
            figureSchoolOrder: schools.map(s => s.id),
            figureInstructorOrder: instructors.map(i => i.id),
            showEmptyFigureCategoriesInGroupedView: showEmpty,
            showFigureCountInGroupHeaders: showCount,
        };
        
    await this.applyRemoteSettings(settingsUpdate, modifiedTime);
    this.localDB.notifyListeners(); // Force galleries to update with new data
  }
}

// --- Singleton Instance ---
export const settingsService: SettingsService = new SettingsServiceImpl(localDatabaseService);
import type { FigureCategory, LessonCategory, School, Instructor } from '../types';
import type { AppSettings } from '../contexts/SettingsContext';
import { localDatabaseService, LocalDatabaseService } from './LocalDatabaseService';
import { createLogger } from '../utils/logger';
import { dataService } from './DataService';

const logger = createLogger('SettingsService');

const UNCATEGORIZED_ID = '__uncategorized__';
const UNASSIGNED_ID = '__unassigned__';

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

// List of keys that are device-specific and should NOT be synced.
const DEVICE_SETTING_KEYS: (keyof AppSettings)[] = [
    'language', 'autoplayGalleryVideos', 'isMuted', 'volume',
    'lessonSortOrder', 'figureSortOrder', 'lessonGrouping', 'figureGrouping',
    'collapsedLessonDateGroups', 'collapsedFigureDateGroups',
    'uncategorizedLessonCategoryIsExpanded', 'uncategorizedFigureCategoryIsExpanded',
    'collapsedLessonCategories', 'collapsedFigureCategories',
    'collapsedLessonSchools', 'collapsedFigureSchools',
    'uncategorizedLessonSchoolIsExpanded', 'uncategorizedFigureSchoolIsExpanded',
    'collapsedLessonInstructors', 'collapsedFigureInstructors',
    'uncategorizedLessonInstructorIsExpanded', 'uncategorizedFigureInstructorIsExpanded',
    'lessonFilter_excludedYears', 'lessonFilter_excludedCategoryIds',
    'lessonFilter_excludedSchoolIds', 'lessonFilter_excludedInstructorIds',
    'figureFilter_excludedYears', 'figureFilter_excludedCategoryIds',
    'figureFilter_excludedSchoolIds', 'figureFilter_excludedInstructorIds',
];


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

    // Check if any of the updated keys are syncable settings
    const didSyncSettingChange = Object.keys(updates).some(
      key => !DEVICE_SETTING_KEYS.includes(key as keyof AppSettings)
    );
    
    // Only generate a new timestamp if a syncable setting has changed.
    const newModifiedTime = didSyncSettingChange ? new Date().toISOString() : undefined;

    try {
      await this.localDB.saveAllSettings(newSettings, newModifiedTime);
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

    const [dbCategories, dbSchools, dbInstructors] = await Promise.all(type === 'lesson' 
      ? [this.localDB.getLessonCategories(), this.localDB.getLessonSchools(), this.localDB.getLessonInstructors()]
      : [this.localDB.getFigureCategories(), this.localDB.getFigureSchools(), this.localDB.getFigureInstructors()]
    );

    const uncategorizedItem: RemoteGroupingItem = { id: UNCATEGORIZED_ID, name: 'Uncategorized' };
    const unassignedItem: RemoteGroupingItem = { id: UNASSIGNED_ID, name: 'Unassigned' };
    
    const allCategories = [...dbCategories, uncategorizedItem];
    const allSchools = [...dbSchools, unassignedItem];
    const allInstructors = [...dbInstructors, unassignedItem];
    
    const orderItems = <T extends { id: string }>(items: T[], order: string[]): T[] => {
        const itemMap = new Map(items.map(item => [item.id, item]));
        const orderedResult: T[] = [];
        const processedIds = new Set<string>();

        for (const id of order) {
            if (itemMap.has(id)) {
                orderedResult.push(itemMap.get(id)!);
                processedIds.add(id);
            }
        }
        for (const item of items) {
            if (!processedIds.has(item.id)) {
                orderedResult.push(item);
            }
        }
        return orderedResult;
    };

    const content: RemoteGroupingConfig = type === 'lesson'
        ? {
            categories: orderItems(allCategories, allSettings.lessonCategoryOrder),
            schools: orderItems(allSchools, allSettings.lessonSchoolOrder),
            instructors: orderItems(allInstructors, allSettings.lessonInstructorOrder),
            showEmpty: allSettings.showEmptyLessonCategoriesInGroupedView,
            showCount: allSettings.showLessonCountInGroupHeaders,
        } : {
            categories: orderItems(allCategories, allSettings.figureCategoryOrder),
            schools: orderItems(allSchools, allSettings.figureSchoolOrder),
            instructors: orderItems(allInstructors, allSettings.figureInstructorOrder),
            showEmpty: allSettings.showEmptyFigureCategoriesInGroupedView,
            showCount: allSettings.showFigureCountInGroupHeaders,
        };
          
    const modifiedTime = (syncSettingsInDb as any)?.modifiedTime || new Date(0).toISOString();

    return { content, modifiedTime };
  }

  public async applyRemoteGroupingConfig(type: 'lesson' | 'figure', remoteConfig: RemoteGroupingConfig, modifiedTime: string): Promise<void> {
    logger.info(`Applying remote grouping config for ${type}`);

    const { 
        categories = [], 
        schools = [], 
        instructors = [],
        showEmpty = false,
        showCount = false
    } = remoteConfig || {};

    // This helper function syncs a set of items (e.g., all categories) between the remote config and local DB.
    // It correctly uses the remote ID as the source of truth.
    const syncItems = async <T extends { id: string; name: string; driveId?: string; }>(
        remoteItems: RemoteGroupingItem[],
        getLocalItems: () => Promise<T[]>,
        saveItem: (item: T) => Promise<any>, // Can be `add` or `update`, uses `put` so it's an upsert.
        deleteItem: (id: string) => Promise<any> // From dataService to handle unlinking.
    ) => {
        const isSpecial = (id: string) => id === UNCATEGORIZED_ID || id === UNASSIGNED_ID;
        const localItems = await getLocalItems();
        const localMap = new Map(localItems.map(item => [item.id, item]));
        const remoteIdSet = new Set(remoteItems.map(item => item.id));

        // Add or update items from the remote source.
        for (const remoteItem of remoteItems) {
            if (isSpecial(remoteItem.id)) continue;
            
            const localItem = localMap.get(remoteItem.id);
            if (!localItem || localItem.name !== remoteItem.name || localItem.driveId !== remoteItem.driveId) {
                // Item is new, or needs an update. `saveItem` (which uses `put`) handles both cases,
                // preserving the ID from the remote data.
                await saveItem(remoteItem as T);
            }
        }

        // Delete any local items that are no longer present on the remote source.
        for (const localItem of localItems) {
            if (!isSpecial(localItem.id) && !remoteIdSet.has(localItem.id)) {
                await deleteItem(localItem.id);
            }
        }
    };

    if (type === 'lesson') {
        await syncItems(categories, this.localDB.getLessonCategories, this.localDB.saveLessonCategory, dataService.deleteLessonCategory);
        await syncItems(schools, this.localDB.getLessonSchools, this.localDB.saveLessonSchool, dataService.deleteLessonSchool);
        await syncItems(instructors, this.localDB.getLessonInstructors, this.localDB.saveLessonInstructor, dataService.deleteLessonInstructor);
    } else {
        await syncItems(categories, this.localDB.getFigureCategories, this.localDB.saveFigureCategory, dataService.deleteFigureCategory);
        await syncItems(schools, this.localDB.getFigureSchools, this.localDB.saveFigureSchool, dataService.deleteFigureSchool);
        await syncItems(instructors, this.localDB.getFigureInstructors, this.localDB.saveFigureInstructor, dataService.deleteFigureInstructor);
    }

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


import type { AppSettings } from '../types';
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
export interface SettingsService {
  getSettings(): Promise<AppSettings>;
  updateSettings(updates: Partial<AppSettings>, options?: { silent?: boolean }): Promise<void>;
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
    
    // Optimistic update and persist silently
    this.updateSettings({ [key]: newArray } as Partial<AppSettings>, { silent: true });
  }

  private async toggleBoolean(key: keyof AppSettings): Promise<void> {
      const currentSettings = await this.getSettings();
      const currentValue = !!currentSettings[key];
      this.updateSettings({ [key]: !currentValue } as Partial<AppSettings>, { silent: true });
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
}

// --- Singleton Instance ---
export const settingsService: SettingsService = new SettingsServiceImpl(localDatabaseService);
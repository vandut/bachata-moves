import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useMemo } from 'react';
import type { LessonSortOrder, FigureSortOrder } from '../types';
import { settingsService } from '../services/SettingsService';

// --- AppSettings Interface (moved from types.ts) ---
export interface AppSettings {
  language: 'english' | 'polish';
  lessonSortOrder: LessonSortOrder;
  figureSortOrder: FigureSortOrder;
  lessonGrouping: 'none' | 'byMonth' | 'byYear' | 'byCategory' | 'bySchool' | 'byInstructor';
  figureGrouping: 'none' | 'byMonth' | 'byYear' | 'byCategory' | 'bySchool' | 'byInstructor';
  autoplayGalleryVideos: boolean;
  isMuted: boolean;
  volume: number;
  // Date Grouping Settings
  collapsedLessonDateGroups: string[];
  collapsedFigureDateGroups: string[];
  // Figure Category Settings
  uncategorizedFigureCategoryIsExpanded: boolean;
  collapsedFigureCategories: string[];
  figureCategoryOrder: string[];
  showEmptyFigureCategoriesInGroupedView: boolean;
  showFigureCountInGroupHeaders: boolean;
  // Lesson Category Settings
  uncategorizedLessonCategoryIsExpanded: boolean;
  collapsedLessonCategories: string[];
  lessonCategoryOrder: string[];
  showEmptyLessonCategoriesInGroupedView: boolean;
  showLessonCountInGroupHeaders: boolean;
  // School Grouping Settings
  collapsedLessonSchools: string[];
  collapsedFigureSchools: string[];
  uncategorizedLessonSchoolIsExpanded: boolean;
  uncategorizedFigureSchoolIsExpanded: boolean;
  lessonSchoolOrder: string[];
  figureSchoolOrder: string[];
  // Instructor Grouping Settings
  collapsedLessonInstructors: string[];
  collapsedFigureInstructors: string[];
  uncategorizedLessonInstructorIsExpanded: boolean;
  uncategorizedFigureInstructorIsExpanded: boolean;
  lessonInstructorOrder: string[];
  figureInstructorOrder: string[];
  // Lesson Filters
  lessonFilter_excludedYears: string[];
  lessonFilter_excludedCategoryIds: string[];
  lessonFilter_excludedSchoolIds: string[];
  lessonFilter_excludedInstructorIds: string[];
  // Figure Filters
  figureFilter_excludedYears: string[];
  figureFilter_excludedCategoryIds: string[];
  figureFilter_excludedSchoolIds: string[];
  figureFilter_excludedInstructorIds: string[];
  // Sync settings
  lastSyncTimestamp?: string;
}


// --- Settings Provider and Hook ---
interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>, options?: { silent?: boolean }) => Promise<void>;
  reloadAllData: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(settingsService.getSettingsSnapshot());

  useEffect(() => {
    const unsubscribe = settingsService.subscribe(setSettings);
    if (!settings) {
        settingsService.getSettings().then(setSettings);
    }
    return unsubscribe;
  }, []);
  
  const updateSettings = useCallback(async (updates: Partial<AppSettings>, options?: { silent?: boolean }) => {
    await settingsService.updateSettings(updates, options);
  }, []);

  const reloadAllData = useCallback(() => {
    settingsService.getSettings().then(setSettings);
  }, []);
  
  const value = useMemo(() => ({
    settings: settings!,
    updateSettings,
    reloadAllData
  }), [settings, updateSettings, reloadAllData]);
  
  if (!settings) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <i className="material-icons text-5xl text-gray-400 animate-spin-reverse">sync</i>
      </div>
    );
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

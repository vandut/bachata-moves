// This declaration helps TypeScript understand the File System Access API types
// even if they are not in the default library definitions.

export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface FigureCategory {
  id: string;
  name:string;
  driveId?: string;
  modifiedTime?: string;
}

export interface LessonCategory {
  id: string;
  name: string;
  driveId?: string;
  modifiedTime?: string;
}

export interface Figure {
  id: string;
  lessonId: string;
  name: string;
  description?: string | null;
  startTime: number; // Milliseconds
  endTime: number; // Milliseconds
  thumbTime: number; // Milliseconds from the start of the video
  categoryId?: string | null;
  driveId?: string;
  modifiedTime?: string;
}

export interface Lesson {
  id:string;
  videoId: string;
  uploadDate: string; // ISO 8601 string
  description?: string | null;
  startTime: number; // Milliseconds
  endTime: number; // Milliseconds
  thumbTime: number; // Milliseconds from the start of the video
  categoryId?: string | null;
  driveId?: string;
  videoDriveId?: string;
  modifiedTime?: string;
}

export type LessonSortOrder = 'newest' | 'oldest';
export type FigureSortOrder = 'newest' | 'oldest' | 'alphabetical_asc' | 'alphabetical_desc';

export interface AppSettings {
  language: 'english' | 'polish';
  lessonSortOrder: LessonSortOrder;
  figureSortOrder: FigureSortOrder;
  lessonGrouping: 'none' | 'byMonth' | 'byYear' | 'byCategory';
  figureGrouping: 'none' | 'byMonth' | 'byYear' | 'byCategory';
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
  // Sync settings
  lastSyncTimestamp?: string;
}

export interface AppData {
  lessons: Lesson[];
  figures: Figure[];
  settings: AppSettings;
}

export interface ModalAction {
  label: string;
  onClick: () => void | Promise<void>;
  isDestructive?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
}

export type SyncTaskType = 
  | 'sync-gallery'
  | 'sync-grouping-config'
  | 'sync-settings'
  | 'sync-deleted-log'
  | 'upload-lesson'
  | 'download-lesson'
  | 'upload-figure'
  | 'download-figure'
  | 'delete-local'
  | 'delete-remote';

export interface SyncTask {
  id: string;
  type: SyncTaskType;
  payload?: any;
  status: 'pending' | 'in-progress' | 'error';
  createdAt: number;
  error?: string;
}

export interface GroupingConfig {
    modifiedTime: string;
    categories: FigureCategory[] | LessonCategory[];
    order: string[];
    showEmpty: boolean;
    showCount: boolean;
}
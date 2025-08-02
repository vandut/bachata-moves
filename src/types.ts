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
  isExpanded: boolean;
}

export interface LessonCategory {
  id: string;
  name: string;
  isExpanded: boolean;
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
  // Date Grouping Settings
  collapsedLessonDateGroups: string[];
  collapsedFigureDateGroups: string[];
  // Figure Category Settings
  uncategorizedFigureCategoryIsExpanded: boolean;
  figureCategoryOrder: string[];
  showEmptyFigureCategoriesInGroupedView: boolean;
  showFigureCountInGroupHeaders: boolean;
  // Lesson Category Settings
  uncategorizedLessonCategoryIsExpanded: boolean;
  lessonCategoryOrder: string[];
  showEmptyLessonCategoriesInGroupedView: boolean;
  showLessonCountInGroupHeaders: boolean;
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

export interface IDataService {
  // Lessons
  getLessons(): Promise<Lesson[]>;
  addLesson(lessonData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, videoFile: File): Promise<Lesson>;
  updateLesson(lessonId: string, lessonUpdateData: Partial<Omit<Lesson, 'id'>>): Promise<Lesson>;
  deleteLesson(lessonId: string): Promise<void>;

  // Figures
  getFigures(): Promise<Figure[]>;
  addFigure(lessonId: string, figureData: Omit<Figure, 'id' | 'lessonId'>): Promise<Figure>;
  updateFigure(figureId: string, figureUpdateData: Partial<Omit<Figure, 'id' | 'lessonId'>>): Promise<Figure>;
  deleteFigure(figureId: string): Promise<void>;

  // Figure Categories
  getFigureCategories(): Promise<FigureCategory[]>;
  addFigureCategory(categoryName: string): Promise<FigureCategory>;
  updateFigureCategory(categoryId: string, categoryUpdateData: Partial<Omit<FigureCategory, 'id'>>): Promise<FigureCategory>;
  deleteFigureCategory(categoryId: string): Promise<void>;
  
  // Lesson Categories
  getLessonCategories(): Promise<LessonCategory[]>;
  addLessonCategory(categoryName: string): Promise<LessonCategory>;
  updateLessonCategory(categoryId: string, categoryUpdateData: Partial<Omit<LessonCategory, 'id'>>): Promise<LessonCategory>;
  deleteLessonCategory(categoryId: string): Promise<void>;

  // Settings
  getSettings(): Promise<AppSettings>;
  saveSettings(settingsData: AppSettings): Promise<void>;
  
  // File Handling
  getVideoObjectUrl(lesson: Lesson): Promise<string>;
  revokeVideoObjectUrl(videoId: string): void;
  getLessonThumbnailUrl(lessonId: string): Promise<string | null>;
  getFigureThumbnailUrl(figureId: string): Promise<string | null>;
  getVideoFile(lessonId: string): Promise<File | undefined>;

  // Data Management
  exportAllData(onProgress?: (progress: number) => void): Promise<Blob>;
  importData(dataBlob: Blob, onProgress?: (progress: number) => void): Promise<void>;
  clearAllData(): Promise<void>;
}
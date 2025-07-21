// This declaration helps TypeScript understand the File System Access API types
// even if they are not in the default library definitions.

export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface Figure {
  id: string;
  lessonId: string;
  name: string;
  description?: string | null;
  startTime: number; // Milliseconds
  endTime: number; // Milliseconds
  thumbTime: number; // Milliseconds from the start of the video
}

export interface Lesson {
  id:string;
  videoFileName: string;
  uploadDate: string; // ISO 8601 string
  description?: string | null;
  startTime: number; // Milliseconds
  endTime: number; // Milliseconds
  thumbTime: number; // Milliseconds from the start of the video
}

export type LessonSortOrder = 'newest' | 'oldest';
export type FigureSortOrder = 'newest' | 'oldest' | 'alphabetical_asc' | 'alphabetical_desc';

export interface AppSettings {
  language: 'english' | 'polish';
  lessonSortOrder: LessonSortOrder;
  figureSortOrder: FigureSortOrder;
  autoplayGalleryVideos: boolean;
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
  addLesson(lessonData: Omit<Lesson, 'id' | 'videoFileName' | 'thumbTime'>, videoFile: File): Promise<Lesson>;
  updateLesson(lessonId: string, lessonUpdateData: Partial<Omit<Lesson, 'id'>>): Promise<Lesson>;
  deleteLesson(lessonId: string): Promise<void>;

  // Figures
  getFigures(): Promise<Figure[]>;
  addFigure(lessonId: string, figureData: Omit<Figure, 'id' | 'lessonId'>): Promise<Figure>;
  updateFigure(figureId: string, figureUpdateData: Partial<Omit<Figure, 'id' | 'lessonId'>>): Promise<Figure>;
  deleteFigure(figureId: string): Promise<void>;

  // Settings
  getSettings(): Promise<AppSettings>;
  saveSettings(settingsData: AppSettings): Promise<void>;
  
  // File Handling
  getVideoObjectUrl(lesson: Lesson): Promise<string>;
  getLessonThumbnailUrl(lessonId: string): Promise<string | null>;
  getFigureThumbnailUrl(figureId: string): Promise<string | null>;
  getVideoFile(lessonId: string): Promise<File | undefined>;

  // Data Management
  exportAllData(): Promise<Blob>;
  importData(dataBlob: Blob): Promise<void>;
  clearAllData(): Promise<void>;
}
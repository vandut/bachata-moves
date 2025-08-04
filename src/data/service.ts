import type { Lesson, Figure, AppSettings, FigureCategory, LessonCategory, School, Instructor } from '../types';
import { AppDataService } from './indexdb';

export interface IDataService {
  // Lessons
  getLessons(): Promise<Lesson[]>;
  addLesson(lessonData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, videoFile: File): Promise<Lesson>;
  updateLesson(lessonId: string, lessonUpdateData: Partial<Omit<Lesson, 'id'>>): Promise<Lesson>;
  deleteLesson(lessonId: string, options?: { skipTombstone?: boolean }): Promise<void>;
  saveDownloadedLesson(lesson: Lesson, videoFile?: Blob): Promise<void>;

  // Figures
  getFigures(): Promise<Figure[]>;
  addFigure(lessonId: string, figureData: Omit<Figure, 'id' | 'lessonId'>): Promise<Figure>;
  updateFigure(figureId: string, figureUpdateData: Partial<Omit<Figure, 'id' | 'lessonId'>>): Promise<Figure>;
  deleteFigure(figureId: string, options?: { skipTombstone?: boolean }): Promise<void>;
  saveDownloadedFigure(figure: Figure): Promise<void>;

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

  // Schools
  getSchools(): Promise<School[]>;
  addSchool(name: string): Promise<School>;
  updateSchool(id: string, updateData: Partial<Omit<School, 'id'>>): Promise<School>;
  deleteSchool(id: string): Promise<void>;
  
  // Instructors
  getInstructors(): Promise<Instructor[]>;
  addInstructor(name: string): Promise<Instructor>;
  updateInstructor(id: string, updateData: Partial<Omit<Instructor, 'id'>>): Promise<Instructor>;
  deleteInstructor(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<AppSettings>;
  saveSettings(settingsData: AppSettings, options?: { silent?: boolean }): Promise<void>;
  
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

  // Sync / Tombstone Management
  addDeletedDriveId(driveId: string): Promise<void>;
  getDeletedDriveIds(): Promise<string[]>;
  removeDeletedDriveId(driveId: string): Promise<void>;

  // Subscription for live updates
  subscribe(callback: () => void): () => void;
}

/**
 * A singleton instance of the AppDataService.
 * Components will import this instance to interact with the application's data layer.
 */
export const dataService: IDataService = new AppDataService();
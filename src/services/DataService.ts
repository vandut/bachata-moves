import type { Lesson, Figure } from '../types';
import { localDatabaseService } from './LocalDatabaseService';
import { thumbnailService } from './ThumbnailService';
import { createLogger } from '../utils/logger';

const logger = createLogger('DataService');

// --- Interface ---
export interface DataService {
  // Lessons
  addLesson(lessonData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, videoFile: File): Promise<Lesson>;
  updateLesson(lessonId: string, lessonUpdateData: Partial<Omit<Lesson, 'id'>>): Promise<Lesson>;
  deleteLesson(lessonId: string): Promise<string[]>;
  saveDownloadedLesson(lesson: Lesson, videoFile: Blob): Promise<void>;
  
  // Figures
  addFigure(lessonId: string, figureData: Omit<Figure, 'id' | 'lessonId'>): Promise<Figure>;
  updateFigure(figureId: string, figureUpdateData: Partial<Omit<Figure, 'id' | 'lessonId'>>): Promise<Figure>;
  deleteFigure(figureId: string): Promise<string | null>;
  saveDownloadedFigure(figure: Figure): Promise<void>;

  // Categories & Groupings
  deleteFigureCategory(categoryId: string): Promise<string | null>;
  deleteLessonCategory(categoryId: string): Promise<string | null>;
  deleteLessonSchool(schoolId: string): Promise<string | null>;
  deleteFigureSchool(schoolId: string): Promise<string | null>;
  deleteLessonInstructor(instructorId: string): Promise<string | null>;
  deleteFigureInstructor(instructorId: string): Promise<string | null>;

  // File Handling
  getVideoObjectUrl(lesson: Lesson): Promise<string>;
  getLessonThumbnailUrl(lessonId: string): Promise<string | null>;
  getFigureThumbnailUrl(figureId: string): Promise<string | null>;
  getVideoFile(lessonId: string): Promise<File | undefined>;
  clearUrlCaches(): void;
}

// --- Implementation ---
class DataServiceImpl implements DataService {
  private videoUrlCache = new Map<string, string>();
  private thumbUrlCache = new Map<string, string>();
  private figureThumbUrlCache = new Map<string, string>();

  public async addLesson(lessonData: Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>, videoFile: File): Promise<Lesson> {
    logger.info("Adding new lesson (DataService)");
    const thumbnailBlob = await thumbnailService.generateThumbnailBlob(videoFile, 0); // Default to first frame
    return localDatabaseService.addLesson(lessonData, videoFile, thumbnailBlob);
  }
  
  public async updateLesson(lessonId: string, lessonUpdateData: Partial<Omit<Lesson, 'id'>>): Promise<Lesson> {
    logger.info(`Updating lesson ${lessonId} (DataService)`);
    const lessons = await localDatabaseService.getLessons();
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) throw new Error(`Lesson with id "${lessonId}" not found.`);

    let newThumbnailBlob: Blob | null = null;
    if (typeof lessonUpdateData.thumbTime === 'number' && lessonUpdateData.thumbTime !== lesson.thumbTime) {
      this.revokeAndClearCache(lesson.id, 'thumbnail');
      const videoFile = await this.getVideoFile(lesson.id);
      if (videoFile) {
        newThumbnailBlob = await thumbnailService.generateThumbnailBlob(videoFile, lessonUpdateData.thumbTime / 1000);
      }
    }
    
    return localDatabaseService.updateLesson(lessonId, lessonUpdateData, newThumbnailBlob);
  }

  public async deleteLesson(lessonId: string): Promise<string[]> {
    logger.info(`Deleting lesson ${lessonId} and its children (DataService)`);
    const lessons = await localDatabaseService.getLessons();
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return [];
    
    this.revokeAndClearCache(lesson.videoId, 'video');
    this.revokeAndClearCache(lessonId, 'thumbnail');
    
    const deletedDriveIds: string[] = [];
    if (lesson.driveId) deletedDriveIds.push(lesson.driveId);
    if (lesson.videoDriveId) deletedDriveIds.push(lesson.videoDriveId);

    const figures = await localDatabaseService.getFigures();
    const childFigures = figures.filter(fig => fig.lessonId === lessonId);
    logger.info(`Found ${childFigures.length} child figures to delete.`);
    for (const figure of childFigures) {
      const figureDriveId = await this.deleteFigure(figure.id);
      if (figureDriveId) deletedDriveIds.push(figureDriveId);
    }

    await localDatabaseService.deleteLesson(lessonId);
    
    return deletedDriveIds.filter(id => !!id);
  }
  
  public async saveDownloadedLesson(lesson: Lesson, videoFile: Blob): Promise<void> {
    logger.info(`Saving downloaded lesson ${lesson.id} (DataService)`);
    this.revokeAndClearCache(lesson.videoId, 'video');
    this.revokeAndClearCache(lesson.id, 'thumbnail');
    const videoAsFile = new File([videoFile], `${lesson.videoId}.bin`, { type: videoFile.type });
    const thumbnailBlob = await thumbnailService.generateThumbnailBlob(videoAsFile, lesson.thumbTime / 1000);
    await localDatabaseService.saveDownloadedLesson(lesson, videoFile, thumbnailBlob);
  }

  public async addFigure(lessonId: string, figureData: Omit<Figure, 'id' | 'lessonId'>): Promise<Figure> {
    logger.info(`Adding new figure to lesson ${lessonId} (DataService)`);
    const videoFile = await this.getVideoFile(lessonId);
    if (!videoFile) throw new Error(`Video file for parent lesson ${lessonId} not found.`);

    const thumbnailBlob = await thumbnailService.generateThumbnailBlob(videoFile, figureData.thumbTime / 1000);
    return localDatabaseService.addFigure(lessonId, figureData, thumbnailBlob);
  }

  public async updateFigure(figureId: string, figureUpdateData: Partial<Omit<Figure, 'id' | 'lessonId'>>): Promise<Figure> {
    logger.info(`Updating figure ${figureId} (DataService)`);
    const figures = await localDatabaseService.getFigures();
    const figure = figures.find(f => f.id === figureId);
    if (!figure) throw new Error(`Figure with id "${figureId}" not found.`);

    let newThumbnailBlob: Blob | null = null;
    if (typeof figureUpdateData.thumbTime === 'number' && figureUpdateData.thumbTime !== figure.thumbTime) {
        this.revokeAndClearCache(figure.id, 'figure-thumbnail');
        const videoFile = await this.getVideoFile(figure.lessonId);
        if (videoFile) {
            newThumbnailBlob = await thumbnailService.generateThumbnailBlob(videoFile, figureUpdateData.thumbTime / 1000);
        }
    }

    return localDatabaseService.updateFigure(figureId, figureUpdateData, newThumbnailBlob);
  }
  
  public async deleteFigure(figureId: string): Promise<string | null> {
    logger.info(`Deleting figure ${figureId} (DataService)`);
    const figures = await localDatabaseService.getFigures();
    const figure = figures.find(f => f.id === figureId);
    if (!figure) return null;

    this.revokeAndClearCache(figureId, 'figure-thumbnail');
    await localDatabaseService.deleteFigure(figureId);
    return figure.driveId || null;
  }
  
  public async saveDownloadedFigure(figure: Figure): Promise<void> {
    logger.info(`Saving downloaded figure ${figure.id} (DataService)`);
    this.revokeAndClearCache(figure.id, 'figure-thumbnail');
    const videoFile = await this.getVideoFile(figure.lessonId);
    if (!videoFile) throw new Error(`Video file for figure's parent lesson not found.`);
    const thumbnailBlob = await thumbnailService.generateThumbnailBlob(videoFile, figure.thumbTime / 1000);
    await localDatabaseService.saveDownloadedFigure(figure, thumbnailBlob);
  }

  public async deleteFigureCategory(categoryId: string): Promise<string | null> {
    logger.info(`Deleting figure category ${categoryId} and un-assigning items (DataService)`);
    const categories = await localDatabaseService.getFigureCategories();
    const category = categories.find(c => c.id === categoryId);
    if (!category) return null;
    
    const figures = await localDatabaseService.getFigures();
    const figuresToUpdate = figures.filter(f => f.categoryId === categoryId);
    for (const figure of figuresToUpdate) {
      await localDatabaseService.updateFigure(figure.id, { categoryId: null });
    }

    await localDatabaseService.deleteFigureCategory(categoryId);
    return category.driveId || null;
  }

  public async deleteLessonCategory(categoryId: string): Promise<string | null> {
    logger.info(`Deleting lesson category ${categoryId} and un-assigning items (DataService)`);
    const categories = await localDatabaseService.getLessonCategories();
    const category = categories.find(c => c.id === categoryId);
    if (!category) return null;

    const lessons = await localDatabaseService.getLessons();
    const lessonsToUpdate = lessons.filter(l => l.categoryId === categoryId);
    for (const lesson of lessonsToUpdate) {
      await localDatabaseService.updateLesson(lesson.id, { categoryId: null });
    }

    await localDatabaseService.deleteLessonCategory(categoryId);
    return category.driveId || null;
  }

  public async deleteLessonSchool(schoolId: string): Promise<string | null> {
    logger.info(`Deleting lesson school ${schoolId} and un-assigning items (DataService)`);
    const schools = await localDatabaseService.getLessonSchools();
    const school = schools.find(s => s.id === schoolId);
    if (!school) return null;
    
    const lessons = await localDatabaseService.getLessons();
    const lessonsToUpdate = lessons.filter(l => l.schoolId === schoolId);
    for (const lesson of lessonsToUpdate) {
      await localDatabaseService.updateLesson(lesson.id, { schoolId: null });
    }

    await localDatabaseService.deleteLessonSchool(schoolId);
    return school.driveId || null;
  }

  public async deleteFigureSchool(schoolId: string): Promise<string | null> {
    logger.info(`Deleting figure school ${schoolId} and un-assigning items (DataService)`);
    const schools = await localDatabaseService.getFigureSchools();
    const school = schools.find(s => s.id === schoolId);
    if (!school) return null;
    
    const figures = await localDatabaseService.getFigures();
    const figuresToUpdate = figures.filter(f => f.schoolId === schoolId);
    for (const figure of figuresToUpdate) {
      await localDatabaseService.updateFigure(figure.id, { schoolId: null });
    }

    await localDatabaseService.deleteFigureSchool(schoolId);
    return school.driveId || null;
  }

  public async deleteLessonInstructor(instructorId: string): Promise<string | null> {
    logger.info(`Deleting lesson instructor ${instructorId} and un-assigning items (DataService)`);
    const instructors = await localDatabaseService.getLessonInstructors();
    const instructor = instructors.find(i => i.id === instructorId);
    if (!instructor) return null;

    const lessons = await localDatabaseService.getLessons();
    const lessonsToUpdate = lessons.filter(l => l.instructorId === instructorId);
    for (const lesson of lessonsToUpdate) {
      await localDatabaseService.updateLesson(lesson.id, { instructorId: null });
    }
    
    await localDatabaseService.deleteLessonInstructor(instructorId);
    return instructor.driveId || null;
  }

  public async deleteFigureInstructor(instructorId: string): Promise<string | null> {
    logger.info(`Deleting figure instructor ${instructorId} and un-assigning items (DataService)`);
    const instructors = await localDatabaseService.getFigureInstructors();
    const instructor = instructors.find(i => i.id === instructorId);
    if (!instructor) return null;

    const figures = await localDatabaseService.getFigures();
    const figuresToUpdate = figures.filter(f => f.instructorId === instructorId);
    for (const figure of figuresToUpdate) {
      await localDatabaseService.updateFigure(figure.id, { instructorId: null });
    }
    
    await localDatabaseService.deleteFigureInstructor(instructorId);
    return instructor.driveId || null;
  }

  // --- File Handling ---
  public async getLessonThumbnailUrl(lessonId: string): Promise<string | null> {
    if (this.thumbUrlCache.has(lessonId)) {
      return this.thumbUrlCache.get(lessonId)!;
    }
    const thumbBlob = await localDatabaseService.getLessonThumbnailBlob(lessonId);
    if (!thumbBlob) return null;
    
    const url = URL.createObjectURL(thumbBlob);
    this.thumbUrlCache.set(lessonId, url);
    return url;
  }
  
  public async getFigureThumbnailUrl(figureId: string): Promise<string | null> {
    if (this.figureThumbUrlCache.has(figureId)) {
      return this.figureThumbUrlCache.get(figureId)!;
    }
    const thumbBlob = await localDatabaseService.getFigureThumbnailBlob(figureId);
    if (!thumbBlob) return null;
    
    const url = URL.createObjectURL(thumbBlob);
    this.figureThumbUrlCache.set(figureId, url);
    return url;
  }

  public async getVideoFile(lessonId: string): Promise<File | undefined> {
    const lesson = await localDatabaseService.getLessons().then(ls => ls.find(l => l.id === lessonId));
    if (!lesson) return undefined;
    const videoBlob = await localDatabaseService.getVideoBlob(lesson.videoId);
    if (!videoBlob) return undefined;
    return new File([videoBlob], `${lesson.videoId}.bin`, { type: videoBlob.type });
  }

  public async getVideoObjectUrl(lesson: Lesson): Promise<string> {
    if (this.videoUrlCache.has(lesson.videoId)) {
      return this.videoUrlCache.get(lesson.videoId)!;
    }
    const videoBlob = await localDatabaseService.getVideoBlob(lesson.videoId);
    if (!videoBlob) {
        throw new Error(`Video for lesson "${lesson.description || lesson.id}" not found in the database.`);
    }
    const url = URL.createObjectURL(videoBlob);
    this.videoUrlCache.set(lesson.videoId, url);
    return url;
  }

  private revokeAndClearCache(id: string, type: 'thumbnail' | 'figure-thumbnail' | 'video' | 'all'): void {
    if (type === 'video' || type === 'all') {
      const videoUrl = this.videoUrlCache.get(id);
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
        this.videoUrlCache.delete(id);
      }
    }
    if (type === 'thumbnail' || type === 'all') {
      const thumbUrl = this.thumbUrlCache.get(id);
      if (thumbUrl) {
        URL.revokeObjectURL(thumbUrl);
        this.thumbUrlCache.delete(id);
      }
    }
     if (type === 'figure-thumbnail' || type === 'all') {
      const figureThumbUrl = this.figureThumbUrlCache.get(id);
      if (figureThumbUrl) {
        URL.revokeObjectURL(figureThumbUrl);
        this.figureThumbUrlCache.delete(id);
      }
    }
  }
  
  public clearUrlCaches(): void {
    this.videoUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.videoUrlCache.clear();
    this.thumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.thumbUrlCache.clear();
    this.figureThumbUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.figureThumbUrlCache.clear();
  }
}

// --- Singleton Instance ---
export const dataService: DataService = new DataServiceImpl();
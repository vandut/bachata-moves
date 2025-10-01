import { dataService, DataService } from './DataService';
import { localDatabaseService, LocalDatabaseService } from './LocalDatabaseService';
import { syncQueueService, SyncQueueService } from './SyncQueueService';
import { googleDriveService, GoogleDriveService } from './GoogleDriveService';
import { settingsService, SettingsService, GroupingConfiguration } from './SettingsService';
import { thumbnailService, ThumbnailService } from './ThumbnailService';
import type { Lesson, Figure, School, Instructor, LessonCategory, FigureCategory } from '../types';

const UNCATEGORIZED_ID = '__uncategorized__';
const UNASSIGNED_ID = '__unassigned__';

// --- Interface ---

export interface ViewerData {
    item: Lesson | Figure;
    videoUrl: string;
}

export interface EditorData {
    item: Lesson | Figure;
    videoUrl: string;
    videoDurationMs: number;
    videoFile: File;
    categories: (LessonCategory[] | FigureCategory[]);
    schools: School[];
    instructors: Instructor[];
    originalThumbnailUrl: string | null;
}

export interface GroupingEditorData {
    categories: (FigureCategory | LessonCategory)[];
    schools: School[];
    instructors: Instructor[];
    showEmpty: boolean;
    showCount: boolean;
}

export interface GroupingSaveConfiguration {
    initialData: GroupingEditorData;
    categories: (FigureCategory | LessonCategory)[];
    schools: School[];
    instructors: Instructor[];
    showEmpty: boolean;
    showCount: boolean;
}

export interface ItemManagementService {
    updateItemProperty(
        type: 'lesson' | 'figure',
        itemId: string,
        property: 'categoryId' | 'schoolId' | 'instructorId',
        value: string | null
    ): Promise<void>;
    deleteItem(type: 'lesson' | 'figure', itemId: string): Promise<void>;
    getItemForViewer(type: 'lesson' | 'figure', id: string): Promise<ViewerData>;
    getItemForEditor(type: 'lesson' | 'figure', id: string): Promise<EditorData>;
    getItemForNewFigure(lessonId: string): Promise<EditorData>;
    createLesson(data: { uploadDate: string; categoryId: string | null; schoolId: string | null; instructorId: string | null; }, videoFile: File): Promise<void>;
    saveItem(
        type: 'lesson' | 'figure', 
        data: Partial<Lesson & Figure>, 
        options: { isNew: boolean, videoDurationMs?: number }
    ): Promise<void>;
    getLessonsForNewFigure(): Promise<{ lessons: Lesson[], thumbnailUrls: Map<string, string | null> }>;
    getGroupingEditorData(type: 'lesson' | 'figure'): Promise<GroupingEditorData>;
    saveGroupingConfiguration(type: 'lesson' | 'figure', config: GroupingSaveConfiguration): Promise<void>;
    generatePreviewForNewLesson(file: File): Promise<{ thumbnailUrl: string }>;
    generatePreviewForExistingItem(videoFile: File, timeSeconds: number): Promise<{ thumbnailUrl: string }>;
}

// --- Implementation ---

class ItemManagementServiceImpl implements ItemManagementService {
    private dataSvc: DataService;
    private localDBSvc: LocalDatabaseService;
    private syncQueueSvc: SyncQueueService;
    private driveSvc: GoogleDriveService;
    private thumbSvc: ThumbnailService;
    private settingsSvc: SettingsService;

    constructor(
        dataSvc: DataService,
        localDBSvc: LocalDatabaseService,
        syncQueueSvc: SyncQueueService,
        driveSvc: GoogleDriveService,
        thumbSvc: ThumbnailService,
        settingsSvc: SettingsService,
    ) {
        this.dataSvc = dataSvc;
        this.localDBSvc = localDBSvc;
        this.syncQueueSvc = syncQueueSvc;
        this.driveSvc = driveSvc;
        this.thumbSvc = thumbSvc;
        this.settingsSvc = settingsSvc;
    }

    public async updateItemProperty(
        type: 'lesson' | 'figure',
        itemId: string,
        property: 'categoryId' | 'schoolId' | 'instructorId',
        value: string | null
    ): Promise<void> {
        try {
            if (type === 'lesson') {
                await this.dataSvc.updateLesson(itemId, { [property]: value });
            } else {
                await this.dataSvc.updateFigure(itemId, { [property]: value });
            }
            if (this.driveSvc.getAuthState().isSignedIn) {
                this.syncQueueSvc.addTask('sync-gallery', { type }, true);
            }
        } catch (err) {
            console.error(`Failed to update ${type} ${property}:`, err);
            throw err;
        }
    }

    public async deleteItem(type: 'lesson' | 'figure', itemId: string): Promise<void> {
        try {
            const driveIdsToDelete = type === 'lesson'
                ? await this.dataSvc.deleteLesson(itemId)
                : [await this.dataSvc.deleteFigure(itemId)].filter((id): id is string => !!id);

            if (this.driveSvc.getAuthState().isSignedIn && driveIdsToDelete.length > 0) {
                await this.localDBSvc.addTombstones(driveIdsToDelete);
                this.syncQueueSvc.addTask('sync-gallery', { type }, true);
            }
        } catch (err) {
            console.error(`Failed to delete ${type}:`, err);
            throw err;
        }
    }

    public async getItemForViewer(type: 'lesson' | 'figure', id: string): Promise<ViewerData> {
        let item: Lesson | Figure | undefined;
        let videoLessonSource: Lesson | undefined;

        if (type === 'lesson') {
            item = (await this.localDBSvc.getLessons()).find(l => l.id === id);
            videoLessonSource = item as Lesson;
        // FIX: When the item type is 'figure', the `item` variable was still typed as `Lesson | Figure`,
        // causing a type error when accessing `item.lessonId`. By creating a new `figureItem` variable,
        // TypeScript correctly infers its type as `Figure`, resolving the error.
        } else {
            const [figures, lessons] = await Promise.all([this.localDBSvc.getFigures(), this.localDBSvc.getLessons()]);
            const figureItem = figures.find(f => f.id === id);
            item = figureItem;
            if (figureItem) {
                videoLessonSource = lessons.find(l => l.id === figureItem.lessonId);
            }
        }

        if (!item || !videoLessonSource) throw new Error("Item or its video source could not be found.");
        
        const videoUrl = await this.dataSvc.getVideoObjectUrl(videoLessonSource);
        return { item, videoUrl };
    }

    private async _getEditorData(item: Lesson | Figure, videoLessonSource: Lesson): Promise<EditorData> {
        const type = 'uploadDate' in item ? 'lesson' : 'figure';
        const [
            videoUrl, videoFile, originalThumbnailUrl,
            categories,
            schools, instructors
        ] = await Promise.all([
            this.dataSvc.getVideoObjectUrl(videoLessonSource),
            this.dataSvc.getVideoFile(videoLessonSource.id),
            type === 'lesson' ? this.dataSvc.getLessonThumbnailUrl(item.id) : this.dataSvc.getFigureThumbnailUrl(item.id),
            type === 'lesson' ? this.localDBSvc.getLessonCategories() : this.localDBSvc.getFigureCategories(),
            type === 'lesson' ? this.localDBSvc.getLessonSchools() : this.localDBSvc.getFigureSchools(),
            type === 'lesson' ? this.localDBSvc.getLessonInstructors() : this.localDBSvc.getFigureInstructors(),
        ]);

        if (!videoFile) throw new Error("Video file for the item could not be loaded.");

        const videoElement = document.createElement('video');
        videoElement.src = videoUrl;
        const videoDurationMs = await new Promise<number>((resolve, reject) => {
            const onError = () => {
                videoElement.removeEventListener('loadedmetadata', onLoaded);
                videoElement.removeEventListener('error', onError);
                reject(new Error('Video metadata could not be loaded. The file might be corrupted.'));
            };
            const onLoaded = () => {
                videoElement.removeEventListener('loadedmetadata', onLoaded);
                videoElement.removeEventListener('error', onError);
                resolve(videoElement.duration * 1000);
            };
            videoElement.addEventListener('loadedmetadata', onLoaded);
            videoElement.addEventListener('error', onError);
        });

        return { item, videoUrl, videoFile, videoDurationMs, categories, schools, instructors, originalThumbnailUrl };
    }

    public async getItemForEditor(type: 'lesson' | 'figure', id: string): Promise<EditorData> {
        const viewerData = await this.getItemForViewer(type, id);
        const videoLessonSource = type === 'lesson'
            ? viewerData.item as Lesson
            : await this.localDBSvc.getLessons().then(l => l.find(x => x.id === (viewerData.item as Figure).lessonId));
        if (!videoLessonSource) throw new Error("Could not determine video source for editor.");
        return this._getEditorData(viewerData.item, videoLessonSource);
    }

    public async getItemForNewFigure(lessonId: string): Promise<EditorData> {
        // 1. Fetch all necessary data in parallel
        const [
            lesson,
            allLessonCategories,
            allLessonSchools,
            allLessonInstructors,
            allFigureCategories,
            allFigureSchools,
            allFigureInstructors
        ] = await Promise.all([
            this.localDBSvc.getLesson(lessonId),
            this.localDBSvc.getLessonCategories(),
            this.localDBSvc.getLessonSchools(),
            this.localDBSvc.getLessonInstructors(),
            this.localDBSvc.getFigureCategories(),
            this.localDBSvc.getFigureSchools(),
            this.localDBSvc.getFigureInstructors()
        ]);
    
        if (!lesson) throw new Error("Source lesson for new figure not found.");
    
        // 2. Helper function to match names and get target ID
        const findMatchingIdByName = (
            sourceId: string | null | undefined,
            sourceList: { id: string; name: string }[],
            targetList: { id: string; name: string }[]
        ): string | null => {
            if (!sourceId) return null;
            const sourceItem = sourceList.find(item => item.id === sourceId);
            if (!sourceItem) return null;
            // Case-insensitive matching
            const targetItem = targetList.find(item => item.name.trim().toLowerCase() === sourceItem.name.trim().toLowerCase());
            return targetItem ? targetItem.id : null;
        };
    
        // 3. Find matching IDs
        const matchedCategoryId = findMatchingIdByName(lesson.categoryId, allLessonCategories, allFigureCategories);
        const matchedSchoolId = findMatchingIdByName(lesson.schoolId, allLessonSchools, allFigureSchools);
        const matchedInstructorId = findMatchingIdByName(lesson.instructorId, allLessonInstructors, allFigureInstructors);
    
        // 4. Create the new figure template with matched properties
        const newItem: Figure = {
            id: 'new',
            lessonId: lesson.id,
            name: '',
            description: null,
            startTime: lesson.startTime,
            endTime: lesson.endTime,
            thumbTime: lesson.thumbTime,
            categoryId: matchedCategoryId,
            schoolId: matchedSchoolId,
            instructorId: matchedInstructorId,
        };
    
        // 5. Get the rest of the editor data (video URL, etc.)
        return this._getEditorData(newItem, lesson);
    }
    
    public async getLessonsForNewFigure(): Promise<{ lessons: Lesson[], thumbnailUrls: Map<string, string | null> }> {
        const lessons = await this.localDBSvc.getLessons();
        const sortedLessons = lessons.sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
        
        const thumbnailUrls = new Map<string, string | null>();
        const urlPromises = sortedLessons.map(async lesson => {
            const url = await this.dataSvc.getLessonThumbnailUrl(lesson.id);
            thumbnailUrls.set(lesson.id, url);
        });
        await Promise.all(urlPromises);

        return { lessons: sortedLessons, thumbnailUrls };
    }
    
    public async createLesson(data: { uploadDate: string; categoryId: string | null; schoolId: string | null; instructorId: string | null; }, videoFile: File): Promise<void> {
        const { blob: thumbnailBlob, durationMs } = await this.thumbSvc.generateThumbnail(videoFile, 0);
        const lessonData = {
            ...data,
            description: null,
            startTime: 0,
            endTime: durationMs,
        } as Omit<Lesson, 'id' | 'videoId' | 'thumbTime'>;
        
        await this.localDBSvc.addLesson(lessonData, videoFile, thumbnailBlob);
        
        if (this.driveSvc.getAuthState().isSignedIn) {
            this.syncQueueSvc.addTask('sync-gallery', { type: 'lesson' }, true);
        }
    }

    public async saveItem(
        type: 'lesson' | 'figure', 
        data: Partial<Lesson & Figure>, 
        options: { isNew: boolean, videoDurationMs?: number }
    ): Promise<void> {
        const commonData: Partial<Lesson & Figure> = {
            startTime: data.startTime,
            endTime: data.endTime,
            thumbTime: data.thumbTime,
            schoolId: data.schoolId || null,
            instructorId: data.instructorId || null,
        };

        // Server-side validation for time values
        if (typeof data.startTime === 'number' && typeof data.endTime === 'number' && typeof options.videoDurationMs === 'number') {
            commonData.startTime = Math.max(0, Math.min(data.startTime, data.endTime));
            commonData.endTime = Math.max(data.startTime, Math.min(data.endTime, options.videoDurationMs));
        }

        if (type === 'lesson') {
            const lessonData: Partial<Lesson> = {
                ...commonData,
                uploadDate: data.uploadDate!,
                categoryId: data.categoryId || null
            };
            if (options.isNew) {
                throw new Error("Creating new lessons should use the `createLesson` method, not `saveItem`.");
            } else {
                await this.dataSvc.updateLesson(data.id!, lessonData);
            }
        } else { // Figure
            const figureData: Partial<Figure> = {
                ...commonData,
                name: data.name!,
                categoryId: data.categoryId || null
            };
            if (options.isNew) {
                // FIX: Cast `data` to Partial<Figure> to access lessonId, as the compiler incorrectly infers the type.
                await this.dataSvc.addFigure((data as Partial<Figure>).lessonId!, figureData as Omit<Figure, 'id' | 'lessonId'>);
            } else {
                await this.dataSvc.updateFigure(data.id!, figureData);
            }
        }
        
        if (this.driveSvc.getAuthState().isSignedIn) {
            this.syncQueueSvc.addTask('sync-gallery', { type }, true);
        }
    }

    public async getGroupingEditorData(type: 'lesson' | 'figure'): Promise<GroupingEditorData> {
        const settings = await this.settingsSvc.getSettings();
        
        const [categories, schools, instructors] = await Promise.all(type === 'lesson'
            ? [this.localDBSvc.getLessonCategories(), this.localDBSvc.getLessonSchools(), this.localDBSvc.getLessonInstructors()]
            : [this.localDBSvc.getFigureCategories(), this.localDBSvc.getFigureSchools(), this.localDBSvc.getFigureInstructors()]
        );
        
        const { order, showEmpty, showCount, specialId, specialName } = type === 'lesson'
            ? { order: settings.lessonCategoryOrder, showEmpty: settings.showEmptyLessonCategoriesInGroupedView, showCount: settings.showLessonCountInGroupHeaders, specialId: UNCATEGORIZED_ID, specialName: 'Uncategorized' }
            : { order: settings.figureCategoryOrder, showEmpty: settings.showEmptyFigureCategoriesInGroupedView, showCount: settings.showFigureCountInGroupHeaders, specialId: UNCATEGORIZED_ID, specialName: 'Uncategorized' };

        const buildOrderedList = <T extends { id: string, name: string }>(items: T[], order: string[], specialId: string, specialName: string): T[] => {
            // FIX: Use `as unknown as T` to safely cast the special item. The generic type `T` can be a more specific
            // subtype, and this cast acknowledges that we are creating a structurally similar object for internal logic.
            const specialItem = { id: specialId, name: specialName, isSpecial: true } as unknown as T;
            const allItemsMap = new Map<string, T>([...items, specialItem].map(c => [c.id, c]));
            const orderedItems: T[] = [];
            const processedIds = new Set<string>();
        
            for (const id of order) {
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

        const orderedCategories = buildOrderedList(categories, order, specialId, specialName);
        const orderedSchools = buildOrderedList(schools, type === 'lesson' ? settings.lessonSchoolOrder : settings.figureSchoolOrder, UNASSIGNED_ID, 'Unassigned');
        const orderedInstructors = buildOrderedList(instructors, type === 'lesson' ? settings.lessonInstructorOrder : settings.figureInstructorOrder, UNASSIGNED_ID, 'Unassigned');

        return { categories: orderedCategories, schools: orderedSchools, instructors: orderedInstructors, showEmpty, showCount };
    }

    public async saveGroupingConfiguration(type: 'lesson' | 'figure', config: GroupingSaveConfiguration): Promise<void> {
        const { initialData, categories, schools, instructors, showEmpty, showCount } = config;
        
        const configs = type === 'lesson' 
            ? { 
                addCat: this.localDBSvc.addLessonCategory, updateCat: this.localDBSvc.updateLessonCategory, delCat: this.dataSvc.deleteLessonCategory,
                addSchool: this.localDBSvc.addLessonSchool, updateSchool: this.localDBSvc.updateLessonSchool, delSchool: this.dataSvc.deleteLessonSchool,
                addInst: this.localDBSvc.addLessonInstructor, updateInst: this.localDBSvc.updateLessonInstructor, delInst: this.dataSvc.deleteLessonInstructor,
              }
            : { 
                addCat: this.localDBSvc.addFigureCategory, updateCat: this.localDBSvc.updateFigureCategory, delCat: this.dataSvc.deleteFigureCategory,
                addSchool: this.localDBSvc.addFigureSchool, updateSchool: this.localDBSvc.updateFigureSchool, delSchool: this.dataSvc.deleteFigureSchool,
                addInst: this.localDBSvc.addFigureInstructor, updateInst: this.localDBSvc.updateFigureInstructor, delInst: this.dataSvc.deleteFigureInstructor,
            };

        const processItems = async <T extends { id: string; name: string; isNew?: boolean; isDirty?: boolean; isSpecial?: boolean; }>(
            initialItems: T[], localItems: T[], addFn: (name: string) => Promise<T>, updateFn: (id: string, data: { name: string }) => Promise<T>, deleteFn: (id: string) => Promise<string | null>
        ) => {
            const localIdSet = new Set(localItems.map(i => i.id));
            const initialIdMap = new Map(initialItems.map(i => [i.id, i]));

            const toDelete = initialItems.filter(item => !item.isSpecial && !localIdSet.has(item.id));
            const toAdd = localItems.filter(item => item.isNew);
            const toUpdate = localItems.filter(item => !item.isNew && item.isDirty);

            const deletedDriveIds = (await Promise.all(toDelete.map(item => deleteFn(item.id)))).filter((id): id is string => !!id);
            await Promise.all(toUpdate.map(item => updateFn(item.id, { name: item.name.trim() })));
            const newItemsFromDb = await Promise.all(toAdd.map(item => addFn(item.name.trim())));
            
            const newIdMap = new Map<string, string>(toAdd.map((item, index) => [item.id, newItemsFromDb[index].id]));
            const finalOrder = localItems.map(item => newIdMap.get(item.id) || item.id);
            return { finalOrder, deletedDriveIds };
        };

        const { finalOrder: finalCategoryOrder, deletedDriveIds: deletedCategoryIds } = await processItems(initialData.categories, categories, configs.addCat, configs.updateCat, configs.delCat);
        const { finalOrder: finalSchoolOrder, deletedDriveIds: deletedSchoolIds } = await processItems(initialData.schools, schools, configs.addSchool, configs.updateSchool, configs.delSchool);
        const { finalOrder: finalInstructorOrder, deletedDriveIds: deletedInstructorIds } = await processItems(initialData.instructors, instructors, configs.addInst, configs.updateInst, configs.delInst);

        const groupingConfig: GroupingConfiguration = {
            categoryOrder: finalCategoryOrder, schoolOrder: finalSchoolOrder, instructorOrder: finalInstructorOrder,
            showEmpty, showCount,
        };
        await this.settingsSvc.saveGroupingConfiguration(type, groupingConfig);

        if (this.driveSvc.getAuthState().isSignedIn) {
            const allDeletedIds = [...deletedCategoryIds, ...deletedSchoolIds, ...deletedInstructorIds];
            if (allDeletedIds.length > 0) await this.localDBSvc.addTombstones(allDeletedIds);
            this.syncQueueSvc.addTask('sync-grouping-config', { type }, true);
            if (allDeletedIds.length > 0) this.syncQueueSvc.addTask('sync-gallery', { type }, true);
        }
    }
    
    public async generatePreviewForNewLesson(file: File): Promise<{ thumbnailUrl: string }> {
        if (!file.type.startsWith('video/')) {
            throw new Error('Invalid file type provided. Expected a video.');
        }
        const { dataUrl } = await this.thumbSvc.generateThumbnail(file, 0);
        return { thumbnailUrl: dataUrl };
    }

    public async generatePreviewForExistingItem(videoFile: File, timeSeconds: number): Promise<{ thumbnailUrl: string }> {
        const { dataUrl } = await this.thumbSvc.generateThumbnail(videoFile, timeSeconds);
        return { thumbnailUrl: dataUrl };
    }
}

// --- Singleton Instance ---

export const itemManagementService: ItemManagementService = new ItemManagementServiceImpl(
    dataService,
    localDatabaseService,
    syncQueueService,
    googleDriveService,
    thumbnailService,
    settingsService,
);
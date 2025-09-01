import { localDatabaseService, LocalDatabaseService } from './LocalDatabaseService';
import { settingsService, SettingsService } from './SettingsService';
import { dataService, DataService } from './DataService';
import type { AppSettings } from '../contexts/SettingsContext';
import type { Lesson, LessonSortOrder, LessonCategory, School, Instructor, Figure, FigureSortOrder, FigureCategory } from '../types';

const UNCATEGORIZED_ID = '__uncategorized__';
const UNASSIGNED_ID = '__unassigned__';

// --- Generic Types ---
interface GalleryGroup<T> {
  key: string;
  header: string;
  items: T[];
  isExpanded: boolean;
  onToggle: () => void;
}

export interface ProcessedGalleryData<T> {
  groups: GalleryGroup<T>[];
  allItems: T[];
  allItemIds: string[];
  totalItemCount: number;
  thumbnailUrls: Map<string, string | null>;
  videoUrls: Map<string, string | null>;
  filterOptions: {
    years: string[];
    categories: (LessonCategory | FigureCategory)[];
    schools: School[];
    instructors: Instructor[];
  };
  // Specific data needed by child components
  allCategories: (LessonCategory[] | FigureCategory[]);
  allSchools: School[];
  allInstructors: Instructor[];
  lessonsMap?: Map<string, Lesson>;
}

// --- Interface ---
export interface GalleryOrchestrationService {
    getProcessedLessons(settings: AppSettings, locale: string): Promise<ProcessedGalleryData<Lesson>>;
    getProcessedFigures(settings: AppSettings, locale: string): Promise<ProcessedGalleryData<Figure>>;
}


// --- Helper Functions ---
const getGroupInfo = (dateString: string, grouping: 'byMonth' | 'byYear', locale: string) => {
    const date = new Date(dateString);
    if (grouping === 'byYear') {
        const year = date.getFullYear();
        return { key: `${year}`, header: `${year}` };
    }
    // byMonth
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const monthName = date.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { key: `${year}-${String(month).padStart(2, '0')}`, header: monthName };
};

const sortLessons = (lessonsToSort: Lesson[], sortOrder: LessonSortOrder): Lesson[] => {
    return [...lessonsToSort].sort((a, b) => {
      const dateA = new Date(a.uploadDate).getTime();
      const dateB = new Date(b.uploadDate).getTime();
      if (dateA !== dateB) return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      const idA = parseInt(a.id.split('-')[0], 10);
      const idB = parseInt(b.id.split('-')[0], 10);
      return sortOrder === 'newest' ? idB - idA : idA - idB;
    });
};

const sortFigures = (figuresToSort: Figure[], lessonDataMap: Map<string, Lesson>, currentSortOrder: FigureSortOrder): Figure[] => {
    return [...figuresToSort].sort((a, b) => {
        const lessonA = lessonDataMap.get(a.lessonId);
        const lessonB = lessonDataMap.get(b.lessonId);
        if (!lessonA || !lessonB) return 0;

        switch (currentSortOrder) {
            case 'oldest': {
                const effectiveTimestampA = new Date(lessonA.uploadDate).getTime() + a.startTime;
                const effectiveTimestampB = new Date(lessonB.uploadDate).getTime() + b.startTime;
                return effectiveTimestampA - effectiveTimestampB;
            }
            case 'alphabetical_asc': return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            case 'alphabetical_desc': return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
            case 'newest': default: {
                const effectiveTimestampA = new Date(lessonA.uploadDate).getTime() + a.startTime;
                const effectiveTimestampB = new Date(lessonB.uploadDate).getTime() + b.startTime;
                return effectiveTimestampB - effectiveTimestampA;
            }
        }
    });
};

// --- Implementation ---
class GalleryOrchestrationServiceImpl implements GalleryOrchestrationService {
    private localDBSvc: LocalDatabaseService;
    private settingsSvc: SettingsService;
    private dataSvc: DataService;

    constructor(localDBSvc: LocalDatabaseService, settingsSvc: SettingsService, dataSvc: DataService) {
        this.localDBSvc = localDBSvc;
        this.settingsSvc = settingsSvc;
        this.dataSvc = dataSvc;
    }

    public async getProcessedLessons(settings: AppSettings, locale: string): Promise<ProcessedGalleryData<Lesson>> {
        const [lessons, categories, schools, instructors] = await Promise.all([
            this.localDBSvc.getLessons(),
            this.localDBSvc.getLessonCategories(),
            this.localDBSvc.getLessonSchools(),
            this.localDBSvc.getLessonInstructors(),
        ]);

        const filteredLessons = lessons.filter(lesson => {
            const year = new Date(lesson.uploadDate).getFullYear().toString();
            if (settings.lessonFilter_excludedYears.includes(year)) return false;
            if (settings.lessonFilter_excludedCategoryIds.includes(lesson.categoryId || UNCATEGORIZED_ID)) return false;
            if (settings.lessonFilter_excludedSchoolIds.includes(lesson.schoolId || UNASSIGNED_ID)) return false;
            if (settings.lessonFilter_excludedInstructorIds.includes(lesson.instructorId || UNASSIGNED_ID)) return false;
            return true;
        });

        const allSortedLessons = sortLessons(filteredLessons, settings.lessonSortOrder);

        const groups: GalleryGroup<Lesson>[] = [];

        if (settings.lessonGrouping === 'none') {
            // No groups
        } else if (settings.lessonGrouping === 'byMonth' || settings.lessonGrouping === 'byYear') {
            const groupedMap = new Map<string, { header: string; lessons: Lesson[] }>();
            for (const lesson of allSortedLessons) {
                const { key, header } = getGroupInfo(lesson.uploadDate, settings.lessonGrouping, locale);
                if (!groupedMap.has(key)) groupedMap.set(key, { header, lessons: [] });
                groupedMap.get(key)!.lessons.push(lesson);
            }
            const groupOrder = [...groupedMap.keys()].sort((a, b) => settings.lessonSortOrder === 'newest' ? b.localeCompare(a) : a.localeCompare(b));
            for (const key of groupOrder) {
                const group = groupedMap.get(key)!;
                groups.push({
                    key, header: group.header, items: group.lessons,
                    isExpanded: !settings.collapsedLessonDateGroups.includes(key),
                    onToggle: () => this.settingsSvc.toggleLessonDateGroupCollapsed(key)
                });
            }
        } else { // Category, School, or Instructor
            let groupingType: 'byCategory' | 'bySchool' | 'byInstructor' = settings.lessonGrouping;
            let items: (LessonCategory | School | Instructor)[], order, collapsed, specialId, specialLabel, isSpecialExpanded, toggleSpecial;
            switch(groupingType) {
                case 'bySchool':
                    items = schools; order = settings.lessonSchoolOrder; collapsed = settings.collapsedLessonSchools; specialId = UNASSIGNED_ID; specialLabel = "Unassigned";
                    isSpecialExpanded = settings.uncategorizedLessonSchoolIsExpanded; toggleSpecial = this.settingsSvc.toggleLessonUnassignedSchoolExpanded; break;
                case 'byInstructor':
                    items = instructors; order = settings.lessonInstructorOrder; collapsed = settings.collapsedLessonInstructors; specialId = UNASSIGNED_ID; specialLabel = "Unassigned";
                    isSpecialExpanded = settings.uncategorizedLessonInstructorIsExpanded; toggleSpecial = this.settingsSvc.toggleLessonUnassignedInstructorExpanded; break;
                default: // byCategory
                    items = categories; order = settings.lessonCategoryOrder; collapsed = settings.collapsedLessonCategories; specialId = UNCATEGORIZED_ID; specialLabel = "Uncategorized";
                    isSpecialExpanded = settings.uncategorizedLessonCategoryIsExpanded; toggleSpecial = this.settingsSvc.toggleLessonUncategorizedExpanded; break;
            }

            const itemMap = new Map(items.map(i => [i.id, i]));
            const specialItem = { id: specialId, name: specialLabel };
            const finalOrder = order.length > 0 ? order : [specialId, ...items.map(i => i.id).sort((a,b) => a.localeCompare(b))];
            
            const groupedData = new Map<string, Lesson[]>();
            for (const lesson of allSortedLessons) {
                const key = (lesson as any)[groupingType.replace('by', '').toLowerCase() + 'Id'] || specialId;
                if (!groupedData.has(key)) groupedData.set(key, []);
                groupedData.get(key)!.push(lesson);
            }

            for (const id of finalOrder) {
                const item = id === specialId ? specialItem : itemMap.get(id);
                if (!item) continue;
                const groupItems = groupedData.get(id) || [];
                if (groupItems.length === 0 && !settings.showEmptyLessonCategoriesInGroupedView) continue;
                
                groups.push({
                    key: id, header: item.name, items: groupItems,
                    isExpanded: id === specialId ? isSpecialExpanded : !collapsed.includes(id),
                    onToggle: id === specialId ? toggleSpecial : () => (this.settingsSvc as any)[`toggleLesson${groupingType.replace('by', '')}Collapsed`](id)
                });
            }
        }

        const years = [...new Set(lessons.map(l => new Date(l.uploadDate).getFullYear().toString()))].sort((a, b) => b.localeCompare(a));
        
        // Pre-fetch URLs
        const thumbnailUrls = new Map<string, string | null>();
        const videoUrls = new Map<string, string | null>();
        const urlPromises = allSortedLessons.map(async (lesson) => {
            const [thumbUrl, videoUrl] = await Promise.all([
                this.dataSvc.getLessonThumbnailUrl(lesson.id),
                this.dataSvc.getVideoObjectUrl(lesson).catch(() => null)
            ]);
            thumbnailUrls.set(lesson.id, thumbUrl);
            videoUrls.set(lesson.videoId, videoUrl);
        });
        await Promise.all(urlPromises);

        return {
            groups, allItems: allSortedLessons, allItemIds: allSortedLessons.map(l => l.id), totalItemCount: lessons.length,
            thumbnailUrls, videoUrls,
            allCategories: categories, allSchools: schools, allInstructors: instructors,
            filterOptions: { years: years.length > 0 ? years : [new Date().getFullYear().toString()], categories, schools, instructors }
        };
    }

    public async getProcessedFigures(settings: AppSettings, locale: string): Promise<ProcessedGalleryData<Figure>> {
        const [figures, lessons, categories, schools, instructors] = await Promise.all([
            this.localDBSvc.getFigures(), this.localDBSvc.getLessons(),
            this.localDBSvc.getFigureCategories(), this.localDBSvc.getFigureSchools(), this.localDBSvc.getFigureInstructors(),
        ]);
        const lessonsMap = new Map(lessons.map(l => [l.id, l]));

        const filteredFigures = figures.filter(figure => {
            const lesson = lessonsMap.get(figure.lessonId);
            if (!lesson) return false;
            const year = new Date(lesson.uploadDate).getFullYear().toString();
            if (settings.figureFilter_excludedYears.includes(year)) return false;
            if (settings.figureFilter_excludedCategoryIds.includes(figure.categoryId || UNCATEGORIZED_ID)) return false;
            if (settings.figureFilter_excludedSchoolIds.includes(figure.schoolId || UNASSIGNED_ID)) return false;
            if (settings.figureFilter_excludedInstructorIds.includes(figure.instructorId || UNASSIGNED_ID)) return false;
            return true;
        });
        
        const allSortedFigures = sortFigures(filteredFigures, lessonsMap, settings.figureSortOrder);
        const groups: GalleryGroup<Figure>[] = [];

        if (settings.figureGrouping === 'none') {
            // No groups
        } else if (settings.figureGrouping === 'byMonth' || settings.figureGrouping === 'byYear') {
            const groupedMap = new Map<string, { header: string; figures: Figure[] }>();
            for (const figure of allSortedFigures) {
                const lesson = lessonsMap.get(figure.lessonId);
                if (!lesson) continue;
                const { key, header } = getGroupInfo(lesson.uploadDate, settings.figureGrouping, locale);
                if (!groupedMap.has(key)) groupedMap.set(key, { header, figures: [] });
                groupedMap.get(key)!.figures.push(figure);
            }
            const groupOrder = [...groupedMap.keys()].sort((a, b) => settings.figureSortOrder === 'newest' || settings.figureSortOrder === 'oldest' ? (settings.figureSortOrder === 'newest' ? b.localeCompare(a) : a.localeCompare(b)) : a.localeCompare(b));
            for (const key of groupOrder) {
                const group = groupedMap.get(key)!;
                groups.push({
                    key, header: group.header, items: group.figures,
                    isExpanded: !settings.collapsedFigureDateGroups.includes(key),
                    onToggle: () => this.settingsSvc.toggleFigureDateGroupCollapsed(key)
                });
            }
        } else { // Category, School, or Instructor
            let groupingType: 'byCategory' | 'bySchool' | 'byInstructor' = settings.figureGrouping;
            let items: (FigureCategory | School | Instructor)[], order, collapsed, specialId, specialLabel, isSpecialExpanded, toggleSpecial;
            switch(groupingType) {
                case 'bySchool':
                    items = schools; order = settings.figureSchoolOrder; collapsed = settings.collapsedFigureSchools; specialId = UNASSIGNED_ID; specialLabel = "Unassigned";
                    isSpecialExpanded = settings.uncategorizedFigureSchoolIsExpanded; toggleSpecial = this.settingsSvc.toggleFigureUnassignedSchoolExpanded; break;
                case 'byInstructor':
                    items = instructors; order = settings.figureInstructorOrder; collapsed = settings.collapsedFigureInstructors; specialId = UNASSIGNED_ID; specialLabel = "Unassigned";
                    isSpecialExpanded = settings.uncategorizedFigureInstructorIsExpanded; toggleSpecial = this.settingsSvc.toggleFigureUnassignedInstructorExpanded; break;
                default: // byCategory
                    items = categories; order = settings.figureCategoryOrder; collapsed = settings.collapsedFigureCategories; specialId = UNCATEGORIZED_ID; specialLabel = "Uncategorized";
                    isSpecialExpanded = settings.uncategorizedFigureCategoryIsExpanded; toggleSpecial = this.settingsSvc.toggleFigureUncategorizedExpanded; break;
            }

            const itemMap = new Map(items.map(i => [i.id, i]));
            const specialItem = { id: specialId, name: specialLabel };
            const finalOrder = order.length > 0 ? order : [specialId, ...items.map(i => i.id).sort((a,b) => a.localeCompare(b))];
            
            const groupedData = new Map<string, Figure[]>();
            for (const figure of allSortedFigures) {
                const key = (figure as any)[groupingType.replace('by', '').toLowerCase() + 'Id'] || specialId;
                if (!groupedData.has(key)) groupedData.set(key, []);
                groupedData.get(key)!.push(figure);
            }

            for (const id of finalOrder) {
                const item = id === specialId ? specialItem : itemMap.get(id);
                if (!item) continue;
                const groupItems = groupedData.get(id) || [];
                if (groupItems.length === 0 && !settings.showEmptyFigureCategoriesInGroupedView) continue;
                
                groups.push({
                    key: id, header: item.name, items: groupItems,
                    isExpanded: id === specialId ? isSpecialExpanded : !collapsed.includes(id),
                    onToggle: id === specialId ? toggleSpecial : () => (this.settingsSvc as any)[`toggleFigure${groupingType.replace('by', '')}Collapsed`](id)
                });
            }
        }

        const years = [...new Set(lessons.map(l => new Date(l.uploadDate).getFullYear().toString()))].sort((a, b) => b.localeCompare(a));
        
        // Pre-fetch URLs
        const thumbnailUrls = new Map<string, string | null>();
        const videoUrls = new Map<string, string | null>();
        const urlPromises = allSortedFigures.map(async (figure) => {
            const [thumbUrl, videoUrl] = await Promise.all([
                this.dataSvc.getFigureThumbnailUrl(figure.id),
                lessonsMap.has(figure.lessonId) ? this.dataSvc.getVideoObjectUrl(lessonsMap.get(figure.lessonId)!).catch(() => null) : Promise.resolve(null)
            ]);
            thumbnailUrls.set(figure.id, thumbUrl);
            if (lessonsMap.has(figure.lessonId)) {
                videoUrls.set(lessonsMap.get(figure.lessonId)!.videoId, videoUrl);
            }
        });
        await Promise.all(urlPromises);

        return {
            groups, allItems: allSortedFigures, allItemIds: allSortedFigures.map(f => f.id), totalItemCount: figures.length, lessonsMap,
            thumbnailUrls, videoUrls,
            allCategories: categories, allSchools: schools, allInstructors: instructors,
            filterOptions: { years: years.length > 0 ? years : [new Date().getFullYear().toString()], categories, schools, instructors }
        };
    }
}

export const galleryOrchestrationService: GalleryOrchestrationService = new GalleryOrchestrationServiceImpl(
    localDatabaseService,
    settingsService,
    dataService,
);
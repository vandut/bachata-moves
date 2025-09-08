import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useTranslation } from '../contexts/I18nContext';
import { localDatabaseService } from '../services/LocalDatabaseService';
import { galleryOrchestrationService, ProcessedGalleryData } from '../services/GalleryOrchestrationService';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { useLocation } from 'react-router-dom';
import type { Lesson, Figure, FigureCategory, LessonCategory, School, Instructor, DbChangePayload } from '../types';
// FIX: Import dataService to resolve reference errors.
import { dataService } from '../services/DataService';

type RawData<T> = T extends Lesson ? 
    { items: Lesson[], categories: LessonCategory[], schools: School[], instructors: Instructor[] } :
    { items: Figure[], lessons: Lesson[], categories: FigureCategory[], schools: School[], instructors: Instructor[] };

export const useGalleryProcessor = <T extends Lesson | Figure>(type: 'lesson' | 'figure') => {
    const { settings } = useSettings();
    const { locale } = useTranslation();
    const { isSignedIn, addTask } = useGoogleDrive();
    const location = useLocation();

    // Raw data from DB, held in state
    const [rawData, setRawData] = useState<RawData<T> | null>(null);
    
    // Processed data for display
    const [galleryData, setGalleryData] = useState<ProcessedGalleryData<T> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [dataVersion, setDataVersion] = useState(0);

    const refreshGallery = useCallback(() => {
        setDataVersion(v => v + 1);
    }, []);

    // Effect 1: Fetch all raw data from DB.
    // Runs on manual refresh.
    useEffect(() => {
        let isCancelled = false;
        setIsLoading(true);

        const fetchRawData = async () => {
            try {
                if (type === 'lesson') {
                    const [items, categories, schools, instructors] = await Promise.all([
                        localDatabaseService.getLessons(),
                        localDatabaseService.getLessonCategories(),
                        localDatabaseService.getLessonSchools(),
                        localDatabaseService.getLessonInstructors(),
                    ]);
                    if (!isCancelled) setRawData({ items, categories, schools, instructors } as RawData<T>);
                } else {
                    const [items, lessons, categories, schools, instructors] = await Promise.all([
                        localDatabaseService.getFigures(),
                        localDatabaseService.getLessons(),
                        localDatabaseService.getFigureCategories(),
                        localDatabaseService.getFigureSchools(),
                        localDatabaseService.getFigureInstructors(),
                    ]);
                    if (!isCancelled) setRawData({ items, lessons, categories, schools, instructors } as RawData<T>);
                }
            } catch (error) {
                console.error("Failed to fetch raw gallery data:", error);
            } finally {
                if (!isCancelled) setIsLoading(false);
            }
        };

        fetchRawData();
        return () => { isCancelled = true; };
    }, [dataVersion, type]);

    // Effect 2: Process raw data into display data.
    // Runs whenever raw data or settings (sort/filter/group) change.
    useEffect(() => {
        if (!rawData) return;
        let isCancelled = false;

        const processAndSetData = async () => {
            // FIX: The type of `processed` was incorrect. The gallery orchestration service
            // returns data without filterOptions, which are calculated later in this hook.
            let processed: Omit<ProcessedGalleryData<T>, 'thumbnailUrls' | 'videoUrls' | 'filterOptions'>;

            if (type === 'lesson') {
                const { items, categories, schools, instructors } = rawData as RawData<Lesson>;
                // FIX: Cast the result to the generic type to satisfy TypeScript.
                processed = galleryOrchestrationService.processLessons(items, categories, schools, instructors, settings, locale) as Omit<ProcessedGalleryData<T>, 'thumbnailUrls' | 'videoUrls' | 'filterOptions'>;
            } else {
                const { items, lessons, categories, schools, instructors } = rawData as RawData<Figure>;
                // FIX: Cast the result to the generic type to satisfy TypeScript.
                processed = galleryOrchestrationService.processFigures(items, lessons, categories, schools, instructors, settings, locale) as Omit<ProcessedGalleryData<T>, 'thumbnailUrls' | 'videoUrls' | 'filterOptions'>;
            }
            
            // Fetch URLs for the visible items
            const thumbnailUrls = new Map<string, string | null>();
            const videoUrls = new Map<string, string | null>();
            const urlPromises = processed.allItems.map(async (item: T) => {
                if (type === 'lesson') {
                    const lesson = item as Lesson;
                    const [thumbUrl, videoUrl] = await Promise.all([
                        dataService.getLessonThumbnailUrl(lesson.id),
                        dataService.getVideoObjectUrl(lesson).catch(() => null)
                    ]);
                    thumbnailUrls.set(lesson.id, thumbUrl);
                    videoUrls.set(lesson.videoId, videoUrl);
                } else {
                    const figure = item as Figure;
                    const lesson = (rawData as RawData<Figure>).lessons.find(l => l.id === figure.lessonId);
                    const [thumbUrl, videoUrl] = await Promise.all([
                        dataService.getFigureThumbnailUrl(figure.id),
                        lesson ? dataService.getVideoObjectUrl(lesson).catch(() => null) : Promise.resolve(null)
                    ]);
                    thumbnailUrls.set(figure.id, thumbUrl);
                    if (lesson) videoUrls.set(lesson.videoId, videoUrl);
                }
            });

            await Promise.all(urlPromises);
            
            if (!isCancelled) {
                // FIX: The `galleryData` state requires `filterOptions`. This logic constructs
                // the filter options from the raw data and includes it in the final state object.
                const lessonsForYears = (type === 'lesson' ? rawData.items : (rawData as RawData<Figure>).lessons) as Lesson[];
                const years = [...new Set(lessonsForYears.map(l => new Date(l.uploadDate).getFullYear().toString()))].sort((a, b) => b.localeCompare(a));
                const filterOptions = {
                    years: years.length > 0 ? years : [new Date().getFullYear().toString()],
                    categories: rawData.categories,
                    schools: rawData.schools,
                    instructors: rawData.instructors,
                };
                setGalleryData({ ...processed, thumbnailUrls, videoUrls, filterOptions });
            }
        };

        processAndSetData();
        return () => { isCancelled = true; };
    }, [rawData, settings, locale, type]);

    // Effect 3: Subscribe to DB changes for granular updates.
    useEffect(() => {
        const handleDbChange = async (payload: DbChangePayload) => {
            const isRelevantItem = payload.type === type;
            const isRelevantGrouping = payload.type.toLowerCase().includes(type);

            if (payload.type === 'all') {
                refreshGallery();
                return;
            }

            // Granular updates for items
            if (isRelevantItem && (payload.action === 'add' || payload.action === 'update') && payload.ids) {
                const getFn = type === 'lesson' ? localDatabaseService.getLesson : localDatabaseService.getFigure;
                const updatedItems = (await Promise.all(payload.ids.map(id => getFn(id)))).filter(Boolean) as T[];

                setRawData(prev => {
                    if (!prev) return null;
                    let items = [...prev.items];
                    if (payload.action === 'add') {
                        items.push(...updatedItems);
                    } else { // update
                        updatedItems.forEach(item => {
                            const index = items.findIndex(i => i.id === item.id);
                            if (index > -1) items[index] = item;
                            else items.push(item); // Handle potential race condition where update comes before add
                        });
                    }
                    return { ...prev, items };
                });
            } else if (isRelevantItem && payload.action === 'delete' && payload.ids) {
                const idSet = new Set(payload.ids);
                setRawData(prev => prev ? { ...prev, items: prev.items.filter(i => !idSet.has(i.id)) } : null);
            }

            // Full refresh for grouping/dependency changes
            if (isRelevantGrouping && payload.type !== type || (type === 'figure' && payload.type === 'lesson')) {
                refreshGallery();
            }
        };

        const unsubscribe = localDatabaseService.subscribe(handleDbChange);
        return () => unsubscribe();
    }, [type, refreshGallery]);
    
    // Effect 4: Trigger sync on initial gallery load, navigation, or login.
    useEffect(() => {
        const currentPath = type === 'lesson' ? '/lessons' : '/figures';
        if (location.pathname === currentPath && isSignedIn && !location.state?.skipSync) {
            addTask('sync-grouping-config', { type }, true);
            addTask('sync-gallery', { type });
        }
    }, [location.pathname, isSignedIn, type, addTask, location.state?.skipSync]);

    const filterOptions = useMemo(() => {
        if (!rawData) return { years: [], categories: [], schools: [], instructors: [] };
        const items = rawData.items;
        const lessonsForYears = (type === 'lesson' ? items : (rawData as RawData<Figure>).lessons) as Lesson[];
        const years = [...new Set(lessonsForYears.map(l => new Date(l.uploadDate).getFullYear().toString()))].sort((a, b) => b.localeCompare(a));
        return {
            years: years.length > 0 ? years : [new Date().getFullYear().toString()],
            categories: rawData.categories,
            schools: rawData.schools,
            instructors: rawData.instructors,
        };
    }, [rawData, type]);

    return { galleryData, isLoading, filterOptions, refreshGallery };
};

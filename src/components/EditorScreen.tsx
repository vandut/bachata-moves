import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useOutletContext, useParams } from 'react-router-dom';
import BaseModal from './BaseModal';
import BaseEditor from './BaseEditor';
import type { ModalAction, Lesson, Figure, School, Instructor } from '../types';
import { dataService } from '../data/service';
import { useTranslation } from '../App';
import { useGoogleDrive } from '../hooks/useGoogleDrive';

interface GalleryContext {
    refresh: () => void;
    isMobile: boolean;
}

// --- Helper Functions ---
const generateThumbnailPreview = (file: File, timeSeconds: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const videoUrl = URL.createObjectURL(file);

      if (!context) {
        URL.revokeObjectURL(videoUrl);
        return reject(new Error('Canvas 2D context is not available.'));
      }

      video.addEventListener('loadedmetadata', () => {
        video.width = video.videoWidth;
        video.height = video.videoHeight;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        video.currentTime = timeSeconds;
      });

      video.addEventListener('seeked', () => {
        context.drawImage(video, 0, 0, video.width, video.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        URL.revokeObjectURL(videoUrl);
        resolve(dataUrl);
      });

      video.addEventListener('error', (err) => {
        URL.revokeObjectURL(videoUrl);
        console.error("Video thumbnail generation error:", err);
        reject(new Error('Failed to load video for thumbnail generation.'));
      });

      video.preload = 'metadata';
      video.src = videoUrl;
      video.load();
    });
};

const msToSecondsString = (ms: number): string => {
    if (isNaN(ms) || ms < 0) return '0.00';
    return (ms / 1000).toFixed(2);
};

const secondsStringToMs = (s: string): number => {
    const parsed = parseFloat(s);
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 1000);
};

const useQuery = () => {
    const { search } = useLocation();
    return React.useMemo(() => new URLSearchParams(search), [search]);
};

// --- Main Editor Screen Component ---

const EditorScreen: React.FC = () => {
    const { lessonId: lessonIdParam, figureId } = useParams<{ lessonId?: string; figureId?: string }>();
    const navigate = useNavigate();
    const { isMobile, refresh } = useOutletContext<GalleryContext>();
    const { t, locale, settings, updateSettings } = useTranslation();
    const { isSignedIn, forceAddItem, forceUpdateItem } = useGoogleDrive();
    const { isMuted, volume } = settings;
    const query = useQuery();

    // --- State ---
    const [item, setItem] = useState<Lesson | Figure | null>(null);
    const [title, setTitle] = useState('Editor');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [schools, setSchools] = useState<School[]>([]);
    const [instructors, setInstructors] = useState<Instructor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({ name: '', description: '', uploadDate: '', startTime: 0, endTime: 0, thumbTime: 0, schoolId: '', instructorId: '' });
    const [newThumbnailUrl, setNewThumbnailUrl] = useState<string | null>(null);
    const [originalThumbnailUrl, setOriginalThumbnailUrl] = useState<string | null>(null);
    const [videoDurationMs, setVideoDurationMs] = useState(0);
    const [currentTimeMs, setCurrentTimeMs] = useState(0);
    const [draggingElement, setDraggingElement] = useState<'start' | 'end' | 'scrub' | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    // --- Mode Determination ---
    const lessonIdForNewFigure = query.get('lessonId');
    const isCreatingFigure = !!lessonIdForNewFigure;
    const isEditingFigure = !!figureId;
    const isEditingLesson = !!lessonIdParam && !isEditingFigure;
    const shouldForceCreate = query.get('forceCreate') === 'true' && isSignedIn;

    const baseNavPath = isEditingLesson ? '/lessons' : '/figures';

    // --- Data Loading Effect ---
    useEffect(() => {
        let isCancelled = false;
        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                let loadedItem: Lesson | Figure | null = null;
                let videoLessonSource: Lesson | undefined;
                let thumbPromise: Promise<string | null> | null = null;
                
                const [fetchedSchools, fetchedInstructors] = await Promise.all([
                    dataService.getSchools(),
                    dataService.getInstructors(),
                ]);
                if (isCancelled) return;
                setSchools(fetchedSchools);
                setInstructors(fetchedInstructors);

                if (isCreatingFigure && lessonIdForNewFigure) {
                    const lesson = (await dataService.getLessons()).find(l => l.id === lessonIdForNewFigure);
                    if (!lesson) throw new Error("Source lesson for new figure not found.");
                    videoLessonSource = lesson;
                    // Pre-populate figure from lesson data
                    loadedItem = {
                        id: 'new',
                        lessonId: lesson.id,
                        name: '',
                        description: null, // Start with empty description for new figures
                        // Copy timings and assignments from parent lesson as a starting point
                        startTime: lesson.startTime,
                        endTime: lesson.endTime,
                        thumbTime: lesson.thumbTime,
                        categoryId: lesson.categoryId,
                        schoolId: lesson.schoolId,
                        instructorId: lesson.instructorId,
                    } as Figure;
                    thumbPromise = dataService.getLessonThumbnailUrl(lesson.id);
                } else { // Editing
                    const itemId = figureId || lessonIdParam;
                    const type = figureId ? 'figure' : 'lesson';
                    if (!itemId) throw new Error("Item ID not specified for editing.");

                    const items = type === 'figure' ? await dataService.getFigures() : await dataService.getLessons();
                    loadedItem = items.find(i => i.id === itemId) || null;
                    
                    if (!loadedItem) throw new Error("Item to edit not found.");
                    
                    if ('lessonId' in loadedItem) { // Figure
                        videoLessonSource = (await dataService.getLessons()).find(l => l.id === (loadedItem as Figure).lessonId);
                        thumbPromise = dataService.getFigureThumbnailUrl(loadedItem.id);
                    } else { // Lesson
                        videoLessonSource = loadedItem as Lesson;
                        thumbPromise = dataService.getLessonThumbnailUrl(loadedItem.id);
                    }
                }
                
                if (isCancelled) return;
                if (!loadedItem || !videoLessonSource) throw new Error("Item or its video source could not be found.");
                
                setItem(loadedItem);
                setFormData({
                    name: (loadedItem as Figure).name || '',
                    description: loadedItem.description || '',
                    uploadDate: (loadedItem as Lesson).uploadDate ? new Date((loadedItem as Lesson).uploadDate).toISOString().split('T')[0] : '',
                    startTime: loadedItem.startTime || 0,
                    endTime: loadedItem.endTime,
                    thumbTime: loadedItem.thumbTime,
                    schoolId: loadedItem.schoolId || '',
                    instructorId: loadedItem.instructorId || '',
                });
                setCurrentTimeMs(loadedItem.startTime || 0);

                const [url, thumbUrl] = await Promise.all([ dataService.getVideoObjectUrl(videoLessonSource), thumbPromise ]);
                if (isCancelled) return;
                setVideoUrl(url);
                setOriginalThumbnailUrl(thumbUrl);

            } catch (e) {
                if (isCancelled) return;
                console.error("Failed to load editor data:", e);
                setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            } finally {
                if (!isCancelled) setIsLoading(false);
            }
        };
        loadData();
        return () => { isCancelled = true; };
    }, [lessonIdParam, figureId, lessonIdForNewFigure, isCreatingFigure, isEditingFigure, isEditingLesson]);

    // --- Dynamic Title Effect ---
    useEffect(() => {
        const getStaticTitle = () => {
            if (isLoading) return t('editor.loading');
            if (error && !item) return t('editor.error');
            if (isCreatingFigure) return t('editor.createFigureTitle');
            if (isEditingFigure) return t('editor.editFigureTitle');
            if (isEditingLesson) {
                const dateString = formData.uploadDate 
                    ? new Date(formData.uploadDate).toLocaleDateString(locale, { timeZone: 'UTC' }) 
                    : t('nav.lessons');
                return t('editor.editLessonTitle', { date: dateString });
            }
            return 'Editor';
        };
        setTitle(getStaticTitle());
    }, [isLoading, error, item, isCreatingFigure, isEditingFigure, isEditingLesson, formData.uploadDate, t, locale]);

    // --- Callbacks for BaseEditor ---
    const handleClose = () => {
        if (isCreatingFigure) {
            navigate('/figures/add'); // Go back to lesson selection
        } else {
            navigate(baseNavPath); // Go back to the gallery page
        }
    };

    useEffect(() => {
        const video = videoRef.current;
        if (video) {
            video.muted = isMuted;
            video.volume = volume;
        }
    }, [isMuted, volume, videoUrl]);

    const handleVolumeChange = () => {
        const video = videoRef.current;
        if (!video) return;
        if(video.muted !== isMuted) updateSettings({ isMuted: video.muted });
        if(video.volume !== volume) updateSettings({ volume: video.volume });
    };

    const handleLoadedMetadata = () => {
        const video = videoRef.current;
        if (!video) return;
        setVideoDurationMs(video.duration * 1000);
        video.currentTime = (formData.startTime || 0) / 1000;
    };

    const handleTimeUpdate = () => {
        const video = videoRef.current;
        // Don't update time while user is dragging handles/scrubber
        if (!video || draggingElement) return;

        setCurrentTimeMs(video.currentTime * 1000);

        // Loop logic
        const startTimeSec = (formData.startTime || 0) / 1000;
        const endTimeSec = formData.endTime / 1000;

        // If the video is playing and reaches the end of the trim range, loop back.
        // A small buffer (0.1s) helps prevent overshooting due to timeupdate event frequency.
        if (!video.paused && endTimeSec > startTimeSec && video.currentTime >= endTimeSec - 0.1) {
            video.currentTime = startTimeSec;
            video.play().catch(e => console.warn("Editor loop playback failed", e));
        }
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { id, value } = e.target;
        if (id === 'startTime' || id === 'endTime') {
            const newTimeMs = secondsStringToMs(value);
            let finalTimeMs;
            if (id === 'startTime') {
                finalTimeMs = Math.max(0, Math.min(newTimeMs, formData.endTime));
                setFormData(prev => ({ ...prev, startTime: finalTimeMs }));
            } else { // endTime
                finalTimeMs = Math.max(formData.startTime, Math.min(newTimeMs, videoDurationMs));
                setFormData(prev => ({ ...prev, endTime: finalTimeMs }));
            }
            if (videoRef.current && !isNaN(finalTimeMs)) {
                videoRef.current.currentTime = finalTimeMs / 1000;
                setCurrentTimeMs(finalTimeMs);
            }
        } else {
            setFormData(prev => ({ ...prev, [id]: value }));
        }
    };
    
    const handleSetThumbnail = async () => {
        if (!item || !videoRef.current) return;
        
        const currentTimeSeconds = videoRef.current.currentTime;
        try {
            let lessonIdForVideo: string;
            if ('lessonId' in item) { // item is Figure
                lessonIdForVideo = (item as Figure).lessonId;
            } else { // item is Lesson
                lessonIdForVideo = item.id;
            }
            const videoFile = await dataService.getVideoFile(lessonIdForVideo);
            if (!videoFile) throw new Error("Could not retrieve video file.");
            
            const dataUrl = await generateThumbnailPreview(videoFile, currentTimeSeconds);
            setNewThumbnailUrl(dataUrl);
            setFormData(prev => ({ ...prev, thumbTime: Math.round(currentTimeSeconds * 1000) }));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('editor.errorThumb'));
        }
    };
    
    const getTimeFromPosition = useCallback((clientX: number) => {
        if (!timelineRef.current || videoDurationMs === 0) return 0;
        const rect = timelineRef.current.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
        return (offsetX / rect.width) * videoDurationMs;
    }, [videoDurationMs]);

    const handleDragMove = useCallback((clientX: number, element: 'start' | 'end' | 'scrub') => {
        if (!videoRef.current) return;
        const newTimeMs = getTimeFromPosition(clientX);
        
        const seekVideoTo = (timeMs: number) => {
            if (videoRef.current) {
                videoRef.current.currentTime = timeMs / 1000;
                setCurrentTimeMs(timeMs);
            }
        };

        if (element === 'scrub') {
            const clampedTime = Math.max(formData.startTime, Math.min(newTimeMs, formData.endTime));
            seekVideoTo(clampedTime);
        } else if (element === 'start') {
            const clampedTime = Math.max(0, Math.min(newTimeMs, formData.endTime));
            setFormData(prev => ({ ...prev, startTime: clampedTime }));
            seekVideoTo(clampedTime);
        } else if (element === 'end') {
            const clampedTime = Math.max(formData.startTime, Math.min(newTimeMs, videoDurationMs));
            setFormData(prev => ({ ...prev, endTime: clampedTime }));
            seekVideoTo(clampedTime);
        }
    }, [getTimeFromPosition, formData.startTime, formData.endTime, videoDurationMs]);
    
    const handleDragEnd = useCallback(() => setDraggingElement(null), []);

    useEffect(() => {
        if (!draggingElement) return;
        const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, draggingElement);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', handleDragEnd);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [draggingElement, handleDragMove, handleDragEnd]);
    
    const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        setDraggingElement('scrub');
        handleDragMove(e.clientX, 'scrub');
    };
    const handleHandleMouseDown = (e: React.MouseEvent, h: 'start' | 'end') => { e.stopPropagation(); setDraggingElement(h); };
    
    const handleSave = async () => {
        if ((isCreatingFigure || isEditingFigure) && !formData.name) {
            setError(t('editor.nameRequiredError'));
            return;
        }
        setIsSaving(true);
        setError(null);

        const commonData = {
            description: formData.description,
            startTime: formData.startTime,
            endTime: formData.endTime,
            thumbTime: formData.thumbTime,
            schoolId: formData.schoolId || null,
            instructorId: formData.instructorId || null,
        };

        try {
            if (isCreatingFigure && lessonIdForNewFigure) {
                const figureData = { ...commonData, name: formData.name };
                await forceAddItem(figureData, 'figure', { lessonId: lessonIdForNewFigure });
            } else if (isEditingFigure && figureId) {
                const updateData = { ...commonData, name: formData.name };
                await forceUpdateItem(figureId, updateData, 'figure');
            } else if (isEditingLesson && lessonIdParam) {
                const updateData = { ...commonData, uploadDate: new Date(formData.uploadDate).toISOString() };
                await forceUpdateItem(lessonIdParam, updateData, 'lesson');
            }
            if (refresh) refresh();
            navigate(baseNavPath, { state: { skipSync: true } });
        } catch (err) {
            console.error("Failed to save:", err);
            setError(err instanceof Error ? err.message : t('editor.errorSave'));
        } finally {
            setIsSaving(false);
        }
    };
    
    // --- Render Logic ---
    const renderHeaderContent = () => {
        const commonClasses = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm";
        if (isEditingLesson) {
            return <div><label htmlFor="uploadDate" className="block text-sm font-medium text-gray-700">{t('editor.lessonDate')}</label><input type="date" id="uploadDate" value={formData.uploadDate} onChange={handleFormChange} className={commonClasses} required/></div>;
        }
        if (isCreatingFigure || isEditingFigure) {
            return <div><label htmlFor="name" className="block text-sm font-medium text-gray-700">{t('editor.name')} <span className="text-red-500">*</span></label><input type="text" id="name" value={formData.name} onChange={handleFormChange} className={commonClasses} required/></div>;
        }
        return null;
    };
    
    const isSaveDisabled = isSaving || ((isCreatingFigure || isEditingFigure) && !formData.name.trim());
    const primaryAction: ModalAction = { label: t('common.save'), loadingLabel: t('common.saving'), onClick: handleSave, isLoading: isSaving, disabled: isSaveDisabled };
    
    const renderContent = () => {
        if (isLoading) {
            return <div className="flex items-center justify-center h-[60vh]"><i className="material-icons text-5xl text-gray-400 animate-spin-reverse">sync</i><span className="ml-4 text-xl text-gray-600">{t('editor.loading')}</span></div>;
        }

        if (!item) {
            return (
                <div className="flex flex-col items-center justify-center h-[60vh] bg-gray-50 rounded-lg p-4 text-center">
                    <i className="material-icons text-6xl text-red-400">error_outline</i>
                    <h2 className="text-red-700 text-xl font-bold mt-4">{t('editor.failedToLoad')}</h2>
                    <p className="text-red-600 text-sm mt-1">{error || t('editor.itemNotFound')}</p>
                </div>
            );
        }

        return (
            <>
                {error && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
                        <p>{error}</p>
                    </div>
                )}
                <BaseEditor
                    videoUrl={videoUrl}
                    videoRef={videoRef}
                    timelineRef={timelineRef}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onVolumeChange={handleVolumeChange}
                    formData={formData}
                    onFormChange={handleFormChange}
                    videoDurationMs={videoDurationMs}
                    currentTimeMs={currentTimeMs}
                    draggingElement={draggingElement}
                    onHandleMouseDown={handleHandleMouseDown}
                    onTimelineMouseDown={handleTimelineMouseDown}
                    onSetThumbnail={handleSetThumbnail}
                    isSaving={isSaving}
                    thumbnailPreviewUrl={newThumbnailUrl || originalThumbnailUrl}
                    headerContent={renderHeaderContent()}
                    msToSecondsString={msToSecondsString}
                    schools={schools}
                    instructors={instructors}
                />
            </>
        );
    };

    return (
        <BaseModal 
            onClose={handleClose} 
            title={title} 
            isMobile={isMobile} 
            primaryAction={primaryAction} 
            desktopWidth="max-w-6xl" 
            error={null}
        >
            {renderContent()}
        </BaseModal>
    );
};

export default EditorScreen;
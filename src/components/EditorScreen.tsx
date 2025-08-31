import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useOutletContext, useParams } from 'react-router-dom';
import BaseModal from './BaseModal';
import BaseEditor from './BaseEditor';
import type { ModalAction, Lesson, Figure, School, Instructor } from '../types';
import { useTranslation } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { thumbnailService } from '../services/ThumbnailService';
import { itemManagementService, EditorData } from '../services/ItemManagementService';
import { msToSecondsString, secondsStringToMs } from '../utils/formatters';

interface GalleryContext {
    refresh: () => void;
    isMobile: boolean;
}

const useQuery = () => {
    const { search } = useLocation();
    return React.useMemo(() => new URLSearchParams(search), [search]);
};

// --- Main Editor Screen Component ---

const EditorScreen: React.FC = () => {
    const { lessonId: lessonIdParam, figureId } = useParams<{ lessonId?: string; figureId?: string }>();
    const navigate = useNavigate();
    const { isMobile, refresh } = useOutletContext<GalleryContext>();
    const { t, locale } = useTranslation();
    const { settings, updateSettings } = useSettings();
    const { isMuted, volume } = settings;
    const query = useQuery();

    // --- State ---
    const [editorData, setEditorData] = useState<EditorData | null>(null);
    const [title, setTitle] = useState('Editor');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({ id: '', name: '', description: '', uploadDate: '', startTime: 0, endTime: 0, thumbTime: 0, schoolId: '', instructorId: '' });
    const [newThumbnailUrl, setNewThumbnailUrl] = useState<string | null>(null);
    const [currentTimeMs, setCurrentTimeMs] = useState(0);
    const [draggingElement, setDraggingElement] = useState<'start' | 'end' | 'scrub' | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    // --- Mode Determination ---
    const lessonIdForNewFigure = query.get('lessonId');
    const isCreatingFigure = !!lessonIdForNewFigure;
    const isEditingFigure = !!figureId;
    const isEditingLesson = !!lessonIdParam && !isEditingFigure;

    const baseNavPath = isEditingLesson ? '/lessons' : '/figures';

    // --- Data Loading Effect ---
    useEffect(() => {
        let isCancelled = false;
        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                let data;
                if (isCreatingFigure && lessonIdForNewFigure) {
                    data = await itemManagementService.getItemForNewFigure(lessonIdForNewFigure);
                } else {
                    const id = figureId || lessonIdParam;
                    if (!id) throw new Error("Item ID not specified for editing.");
                    const type = isEditingFigure ? 'figure' : 'lesson';
                    data = await itemManagementService.getItemForEditor(type, id);
                }

                if (isCancelled) return;

                setEditorData(data);
                const { item } = data;
                setFormData({
                    id: item.id,
                    name: (item as Figure).name || '',
                    description: item.description || '',
                    uploadDate: (item as Lesson).uploadDate ? new Date((item as Lesson).uploadDate).toISOString().split('T')[0] : '',
                    startTime: item.startTime || 0,
                    endTime: item.endTime,
                    thumbTime: item.thumbTime,
                    schoolId: item.schoolId || '',
                    instructorId: item.instructorId || '',
                });
                setCurrentTimeMs(item.startTime || 0);

            } catch (e) {
                if (isCancelled) return;
                console.error("Failed to load editor data:", e);
                setError(e instanceof Error ? e.message : t('editor.itemNotFound'));
            } finally {
                if (!isCancelled) setIsLoading(false);
            }
        };
        loadData();
        return () => { isCancelled = true; };
    }, [lessonIdParam, figureId, lessonIdForNewFigure, isCreatingFigure, isEditingFigure, isEditingLesson, t]);

    // --- Dynamic Title Effect ---
    useEffect(() => {
        const getStaticTitle = () => {
            if (isLoading) return t('editor.loading');
            if (error && !editorData) return t('editor.error');
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
    }, [isLoading, error, editorData, isCreatingFigure, isEditingFigure, isEditingLesson, formData.uploadDate, t, locale]);

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
    }, [isMuted, volume, editorData?.videoUrl]);

    const handleVolumeChange = () => {
        const video = videoRef.current;
        if (!video) return;
        if(video.muted !== isMuted) updateSettings({ isMuted: video.muted });
        if(video.volume !== volume) updateSettings({ volume: video.volume });
    };

    const handleLoadedMetadata = () => {
        const video = videoRef.current;
        if (!video || !editorData) return;
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
                finalTimeMs = Math.max(formData.startTime, Math.min(newTimeMs, editorData?.videoDurationMs || 0));
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
        if (!editorData?.item || !videoRef.current) return;
        
        try {
            const currentTimeSeconds = videoRef.current.currentTime;
            const { dataUrl } = await thumbnailService.generateThumbnail(editorData.videoFile, currentTimeSeconds);
            setNewThumbnailUrl(dataUrl);
            setFormData(prev => ({ ...prev, thumbTime: Math.round(currentTimeSeconds * 1000) }));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('editor.errorThumb'));
        }
    };
    
    const getTimeFromPosition = useCallback((clientX: number) => {
        if (!timelineRef.current || !editorData || editorData.videoDurationMs === 0) return 0;
        const rect = timelineRef.current.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
        return (offsetX / rect.width) * editorData.videoDurationMs;
    }, [editorData]);

    const handleDragMove = useCallback((clientX: number, element: 'start' | 'end' | 'scrub') => {
        if (!videoRef.current || !editorData) return;
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
            const clampedTime = Math.max(formData.startTime, Math.min(newTimeMs, editorData.videoDurationMs));
            setFormData(prev => ({ ...prev, endTime: clampedTime }));
            seekVideoTo(clampedTime);
        }
    }, [getTimeFromPosition, formData.startTime, formData.endTime, editorData]);
    
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
        if ((isCreatingFigure || isEditingFigure) && !formData.name.trim()) {
            setError(t('editor.nameRequiredError'));
            return;
        }
        setIsSaving(true);
        setError(null);

        const type = isEditingLesson ? 'lesson' : 'figure';
        const isNew = isCreatingFigure;

        try {
            await itemManagementService.saveItem(type, formData, { isNew });
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
        if (isLoading || !editorData) {
            return <div className="flex items-center justify-center h-[60vh]"><i className="material-icons text-5xl text-gray-400 animate-spin-reverse">sync</i><span className="ml-4 text-xl text-gray-600">{t('editor.loading')}</span></div>;
        }

        if (error && !editorData) {
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
                {error && !isSaving && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
                        <p>{error}</p>
                    </div>
                )}
                <BaseEditor
                    videoUrl={editorData.videoUrl}
                    videoRef={videoRef}
                    timelineRef={timelineRef}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onVolumeChange={handleVolumeChange}
                    formData={formData}
                    onFormChange={handleFormChange}
                    videoDurationMs={editorData.videoDurationMs}
                    currentTimeMs={currentTimeMs}
                    draggingElement={draggingElement}
                    onHandleMouseDown={handleHandleMouseDown}
                    onTimelineMouseDown={handleTimelineMouseDown}
                    onSetThumbnail={handleSetThumbnail}
                    isSaving={isSaving}
                    thumbnailPreviewUrl={newThumbnailUrl || editorData.originalThumbnailUrl}
                    headerContent={renderHeaderContent()}
                    msToSecondsString={msToSecondsString}
                    schools={editorData.schools}
                    instructors={editorData.instructors}
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
            error={isSaving ? error : null} // Only show modal-level error when saving
        >
            {renderContent()}
        </BaseModal>
    );
};

export default EditorScreen;

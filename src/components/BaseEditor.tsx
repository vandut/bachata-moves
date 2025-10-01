import React from 'react';
import { useTranslation } from '../contexts/I18nContext';
import type { School, Instructor } from '../types';

interface BaseEditorProps {
    videoUrl: string | null;
    videoRef: React.RefObject<HTMLVideoElement>;
    timelineRef: React.RefObject<HTMLDivElement>;
    onLoadedMetadata: () => void;
    onTimeUpdate: () => void;
    onVolumeChange: () => void;
    onVideoKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    formData: {
        description: string;
        startTime: number;
        endTime: number;
        thumbTime: number;
        schoolId?: string | null;
        instructorId?: string | null;
    };
    onFormChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    videoDurationMs: number;
    currentTimeMs: number;
    draggingElement: 'start' | 'end' | 'scrub' | null;
    onHandleMouseDown: (event: React.MouseEvent<HTMLDivElement>, handle: 'start' | 'end') => void;
    onTimelineMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
    onSetThumbnail: () => void;
    onSetStartTime: () => void;
    onSetEndTime: () => void;
    isSaving: boolean;
    thumbnailPreviewUrl: string | null;
    headerContent: React.ReactNode;
    msToSecondsString: (ms: number) => string;
    schools: School[];
    instructors: Instructor[];
}

const BaseEditor: React.FC<BaseEditorProps> = ({
    videoUrl,
    videoRef,
    timelineRef,
    onLoadedMetadata,
    onTimeUpdate,
    onVolumeChange,
    onVideoKeyDown,
    formData,
    onFormChange,
    videoDurationMs,
    currentTimeMs,
    draggingElement,
    onHandleMouseDown,
    onTimelineMouseDown,
    onSetThumbnail,
    onSetStartTime,
    onSetEndTime,
    isSaving,
    thumbnailPreviewUrl,
    headerContent,
    msToSecondsString,
    schools,
    instructors
}) => {
    const { t } = useTranslation();
    
    const startTime = formData.startTime || 0;
    const endTime = formData.endTime > startTime ? formData.endTime : videoDurationMs;
    const startPercent = videoDurationMs > 0 ? (startTime / videoDurationMs) * 100 : 0;
    const endPercent = videoDurationMs > 0 ? (endTime / videoDurationMs) * 100 : 100;
    const currentPercent = videoDurationMs > 0 ? (currentTimeMs / videoDurationMs) * 100 : 0;
    
    const commonSelectClasses = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm";
    const setTimeButtonClasses = "w-full inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50";

    return (
        <div data-component="editor-screen" className="grid grid-cols-1 md:grid-cols-2 md:gap-x-8 gap-y-6">
            <div className="space-y-4">
                <div
                    className="aspect-video w-full bg-black rounded-lg flex items-center justify-center text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 focus:ring-blue-500"
                    onKeyDownCapture={onVideoKeyDown}
                    tabIndex={0}
                    aria-label="Video player for trimming. Use left and right arrow keys to seek."
                >
                    {videoUrl ? (
                        <video 
                            ref={videoRef} 
                            src={videoUrl} 
                            onLoadedMetadata={onLoadedMetadata} 
                            onTimeUpdate={onTimeUpdate} 
                            onVolumeChange={onVolumeChange} 
                            controls 
                            playsInline 
                            className="w-full h-full object-contain custom-video-controls" 
                            controlsList="nodownload noplaybackrate" 
                            disablePictureInPicture 
                        />
                    ) : (
                        <i className="material-icons text-7xl text-gray-600">ondemand_video</i>
                    )}
                </div>
                <div className="mt-4">
                    <h4 className="text-lg font-medium text-gray-800 mb-3">{t('editor.trimming')}</h4>
                    <div
                        ref={timelineRef}
                        onMouseDown={onTimelineMouseDown}
                        className="relative h-10 flex items-center cursor-pointer"
                        role="group"
                    >
                        <div className="absolute w-full h-1.5 bg-gray-300 rounded-full top-1/2 -translate-y-1/2" />
                        <div className="absolute h-1.5 bg-blue-500 rounded-full top-1/2 -translate-y-1/2" style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }}/>
                        <div
                            onMouseDown={(e) => onHandleMouseDown(e, 'start')}
                            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow cursor-ew-resize transition-transform z-10 ${draggingElement === 'start' ? 'scale-125' : ''}`} style={{ left: `calc(${startPercent}% - 8px)` }}>
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-500 font-bold">S</div>
                        </div>
                        <div
                            onMouseDown={(e) => onHandleMouseDown(e, 'end')}
                            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow cursor-ew-resize transition-transform z-10 ${draggingElement === 'end' ? 'scale-125' : ''}`} style={{ left: `calc(${endPercent}% - 8px)` }}>
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-500 font-bold">E</div>
                        </div>
                        <div className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none" style={{ left: `${currentPercent}%` }}/>
                    </div>
                    <div className="flex justify-between items-start mt-6 space-x-4">
                        <div className="flex-1 space-y-2">
                            <div>
                                <label htmlFor="startTime" className="block text-sm font-medium text-gray-700">{t('editor.startTime')}</label>
                                <input type="number" id="startTime" value={msToSecondsString(formData.startTime)} onChange={onFormChange} step="0.04" min="0" max={msToSecondsString(videoDurationMs)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                            </div>
                            <button type="button" onClick={onSetStartTime} data-action="set-start-time" disabled={isSaving} className={setTimeButtonClasses}>
                                {t('editor.setAsStart')}
                            </button>
                        </div>
                        <div className="flex-1 space-y-2">
                            <div>
                                <label htmlFor="endTime" className="block text-sm font-medium text-gray-700">{t('editor.endTime')}</label>
                                <input type="number" id="endTime" value={msToSecondsString(formData.endTime)} onChange={onFormChange} step="0.04" min="0" max={msToSecondsString(videoDurationMs)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                            </div>
                            <button type="button" onClick={onSetEndTime} data-action="set-end-time" disabled={isSaving} className={setTimeButtonClasses}>
                                {t('editor.setAsEnd')}
                            </button>
                        </div>
                    </div>
                    <button type="button" onClick={onSetThumbnail} data-action="set-thumbnail" disabled={isSaving} className="mt-4 w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400">{t('editor.setThumb')}</button>
                </div>
            </div>
            <div className="space-y-6 p-2">
                <div className="space-y-4">
                    <h4 className="text-lg font-medium text-gray-800">{t('editor.metadata')}</h4>
                    {headerContent}
                    <div>
                        <label htmlFor="schoolId" className="block text-sm font-medium text-gray-700">{t('common.school')}</label>
                        <select id="schoolId" name="schoolId" value={formData.schoolId || ''} onChange={onFormChange} className={commonSelectClasses}>
                            <option value="">{t('common.unassigned')}</option>
                            {schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="instructorId" className="block text-sm font-medium text-gray-700">{t('common.instructor')}</label>
                        <select id="instructorId" name="instructorId" value={formData.instructorId || ''} onChange={onFormChange} className={commonSelectClasses}>
                            <option value="">{t('common.unassigned')}</option>
                            {instructors.map(instructor => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}
                        </select>
                    </div>
                    <div><label htmlFor="description" className="block text-sm font-medium text-gray-700">{t('common.description')}</label><textarea id="description" rows={4} value={formData.description} onChange={onFormChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" /></div>
                </div>
                <div className="mt-4">
                    <h4 className="text-lg font-medium text-gray-800 mb-3">{t('editor.thumbnail')}</h4>
                    <div className="aspect-video w-full max-w-xs bg-black rounded-md mx-auto flex items-center justify-center border border-gray-300 overflow-hidden">
                        {thumbnailPreviewUrl ? <img src={thumbnailPreviewUrl} alt="Current thumbnail" className="w-full h-full object-contain" /> : <i className="material-icons text-5xl text-gray-400">photo_size_select_actual</i>}
                    </div>
                    <p className="text-center text-xs text-gray-500 mt-2">{t('editor.thumbAt', { time: msToSecondsString(formData.thumbTime) })}</p>
                </div>
            </div>
        </div>
    );
};

export default BaseEditor;
import React, { useState, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { dataService } from '../data-service';
import type { Lesson, ModalAction } from '../types';
import BaseModal from './BaseModal';
import { useTranslation } from '../App';

interface GalleryContext {
    refresh: () => void;
    isMobile: boolean;
}

const AddLessonModal: React.FC = () => {
  const { refresh, isMobile } = useOutletContext<GalleryContext>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [videoDurationMs, setVideoDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateThumbnail = (file: File): Promise<{ dataUrl: string, durationMs: number }> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const videoUrl = URL.createObjectURL(file);

      if (!context) {
        reject(new Error('Canvas 2D context is not available.'));
        return;
      }
      
      let durationMs = 0;

      video.addEventListener('loadedmetadata', () => {
        video.width = video.videoWidth;
        video.height = video.videoHeight;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        durationMs = video.duration * 1000;
        video.currentTime = 0; // Seek to the first frame
      });

      video.addEventListener('seeked', () => {
        context.drawImage(video, 0, 0, video.width, video.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        URL.revokeObjectURL(videoUrl); // Clean up
        resolve({ dataUrl, durationMs });
      });

      video.addEventListener('error', (err) => {
        URL.revokeObjectURL(videoUrl); // Clean up on error
        console.error("Video thumbnail generation error:", err);
        reject(new Error('Failed to load video for thumbnail generation.'));
      });

      video.preload = 'metadata';
      video.src = videoUrl;
      video.load();
    });
  };

  const processFile = async (file: File | null | undefined) => {
    if (file && file.type.startsWith('video/')) {
      setError(null);
      setVideoFile(file);
      setThumbnailUrl(null); // Reset thumbnail while generating new one
      setVideoDurationMs(0);
      try {
        const { dataUrl, durationMs } = await generateThumbnail(file);
        setThumbnailUrl(dataUrl);
        setVideoDurationMs(durationMs);
      } catch (genError) {
        console.error(genError);
        setError(t('addLessonModal.errorThumb'));
        setThumbnailUrl(null);
      }
    } else {
      setError(t('addLessonModal.errorFile'));
      setVideoFile(null);
      setThumbnailUrl(null);
      setVideoDurationMs(0);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFile(e.target.files?.[0]);
  };
  
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation(); // Necessary to allow drop.
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleClose = () => {
    navigate('/lessons');
  };
  
  const handleSave = async () => {
    if (!videoFile || !date) {
        setError(!videoFile ? t('addLessonModal.errorFile') : t('addLessonModal.errorDate'));
        return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const lessonData: Omit<Lesson, 'id' | 'videoFileName' | 'thumbTime'> = {
        uploadDate: new Date(date).toISOString(),
        description: description || null,
        startTime: 0,
        endTime: videoDurationMs,
      };
      
      await dataService.addLesson(lessonData, videoFile);
      if (refresh) {
        refresh();
      }
      navigate('/lessons');
    } catch (err) {
      console.error("Failed to add lesson:", err);
      setError(err instanceof Error ? err.message : t('addLessonModal.errorSave'));
    } finally {
        setIsSaving(false);
    }
  };
  
  const primaryAction: ModalAction = {
    label: t('common.save'),
    loadingLabel: t('common.saving'),
    onClick: handleSave,
    disabled: !videoFile || !date,
    isLoading: isSaving,
  };
  
  const FormFields = (
    <>
      {/* File Input & Thumbnail Preview */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('addLessonModal.video')} <span className="text-red-500">{t('addLessonModal.required')}</span></label>
        <div 
            className={`mx-auto max-w-[50%] max-h-[50vh] mt-1 rounded-lg border-2 border-dashed transition-colors cursor-pointer group relative overflow-hidden bg-gray-100 aspect-[9/16] flex items-center justify-center ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="Video thumbnail" className="absolute inset-0 w-full h-full object-contain bg-black" />
            ) : (
                <div className="text-center text-gray-400 group-hover:text-gray-500 transition-colors">
                    <i className="material-icons text-6xl">ondemand_video</i>
                    <p className="mt-2 text-sm font-medium">{t('addLessonModal.videoDesc')}</p>
                </div>
            )}
            <input ref={fileInputRef} id="file-upload" name="file-upload" type="file" className="sr-only" accept="video/*" onChange={handleFileChange} />
        </div>
        {videoFile && (
          <p className="mt-2 text-sm text-gray-600 truncate text-center" title={videoFile.name}>
              {videoFile.name}
          </p>
        )}
      </div>


      {/* Date Input */}
      <div>
        <label htmlFor="lesson-date" className="block text-sm font-medium text-gray-700">{t('addLessonModal.date')} <span className="text-red-500">{t('addLessonModal.required')}</span></label>
        <input
            type="date"
            id="lesson-date"
            value={date}
            onChange={e => {
                setDate(e.target.value);
                setError(null);
            }}
            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            required
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            {t('addLessonModal.descriptionOptional')}
        </label>
        <textarea
            id="description"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder={t('addLessonModal.descriptionPlaceholder')}
        />
      </div>
    </>
  );
  
  return (
    <BaseModal
      onClose={handleClose}
      primaryAction={primaryAction}
      title={t('addLessonModal.title')}
      isMobile={isMobile}
      error={error}
      desktopWidth="max-w-md"
    >
      {FormFields}
    </BaseModal>
  );
};

export default AddLessonModal;

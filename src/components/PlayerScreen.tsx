import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation, useOutletContext } from 'react-router-dom';
import BaseModal from './BaseModal';
import { localDatabaseService } from '../services/LocalDatabaseService';
import { dataService } from '../services/DataService';
import type { Lesson, Figure, ModalAction } from '../types';
import CustomSlider from './CustomSlider';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { useTranslation } from '../contexts/I18nContext';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { useSettings } from '../contexts/SettingsContext';

// This context is provided by the parent gallery component (Lessons or Figures)
interface GalleryContext {
  refresh: () => void;
  isMobile: boolean;
  itemIds?: string[];
}

const PlayerScreen: React.FC = () => {
  const { lessonId, figureId } = useParams<{ lessonId?: string; figureId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, refresh, itemIds } = useOutletContext<GalleryContext>();
  const { t, locale } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const { isSignedIn, addTask } = useGoogleDrive();
  const { isMuted, volume } = settings;

  const [item, setItem] = useState<Lesson | Figure | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [videoDurationMs, setVideoDurationMs] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [desktopModalStyle, setDesktopModalStyle] = useState<React.CSSProperties>({});
  const [touchStart, setTouchStart] = useState<{ x: number, y: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const currentId = lessonId || figureId;
  const baseRoute = location.pathname.startsWith('/lessons/') ? '/lessons' : '/figures';

  const navigateToItem = (direction: 'next' | 'prev') => {
    if (!itemIds || !currentId) return;
    const currentIndex = itemIds.indexOf(currentId);
    if (currentIndex === -1) return;

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (nextIndex >= 0 && nextIndex < itemIds.length) {
      const nextId = itemIds[nextIndex];
      navigate(`${baseRoute}/${nextId}`);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      setItem(null);
      setVideoUrl(null);
      setVideoAspectRatio(null);
      setCurrentTimeMs(0);
      setVideoDurationMs(0);
      setDesktopModalStyle({});
      try {
        let loadedItem: Lesson | Figure | undefined;
        let videoLessonSource: Lesson | undefined;

        if (lessonId) {
          const lessons = await localDatabaseService.getLessons();
          if (isCancelled) return;
          loadedItem = lessons.find(l => l.id === lessonId);
          videoLessonSource = loadedItem as Lesson;
        } else if (figureId) {
          const [figures, lessons] = await Promise.all([
            localDatabaseService.getFigures(),
            localDatabaseService.getLessons(),
          ]);
          if (isCancelled) return;
          loadedItem = figures.find(f => f.id === figureId);
          if (loadedItem) {
            videoLessonSource = lessons.find(l => l.id === (loadedItem as Figure).lessonId);
          }
        }

        if (isCancelled) return;

        if (loadedItem && videoLessonSource) {
          setItem(loadedItem);
          const url = await dataService.getVideoObjectUrl(videoLessonSource);
          if (isCancelled) return;
          setVideoUrl(url);
        } else {
          setError(t('player.itemNotFound'));
        }
      } catch (e) {
        if (isCancelled) return;
        console.error("Failed to load player data:", e);
        setError(e instanceof Error ? e.message : 'An unknown error occurred.');
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };
    loadData();

    return () => { isCancelled = true; }
  }, [lessonId, figureId, t]);

  // Effect for Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if an input element is focused
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        
      if (e.key === 'ArrowRight') {
        navigateToItem('next');
      } else if (e.key === 'ArrowLeft') {
        navigateToItem('prev');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [itemIds, currentId, navigate]);

  useEffect(() => {
    if (!isMobile && videoAspectRatio !== null) {
      const isVertical = videoAspectRatio < 1;
      if (isVertical) {
        setDesktopModalStyle({
          width: '50vh',
          maxWidth: '80vw',
          height: '80vh',
        });
      } else { // Horizontal or square
        setDesktopModalStyle({
          width: '80vw',
          height: '50vw',
          maxHeight: '80vh',
        });
      }
    } else {
      setDesktopModalStyle({});
    }
  }, [isMobile, videoAspectRatio]);


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
    if (video.muted !== isMuted) updateSettings({ isMuted: video.muted });
    if (video.volume !== volume) updateSettings({ volume: video.volume });
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.targetTouches.length === 0) return;
    setTouchStart({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  };
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null || e.changedTouches.length === 0) return;
    const touchEnd = e.changedTouches[0];
    const diffX = touchStart.x - touchEnd.clientX;
    const diffY = touchStart.y - touchEnd.clientY;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);
    // It's a horizontal swipe if horizontal movement is greater than vertical,
    // and it exceeds a minimum threshold.
    if (absDiffX > absDiffY && absDiffX > 50) {
      if (diffX > 0) {
        // Swipe left
        navigateToItem('next');
      } else {
        // Swipe right
        navigateToItem('prev');
      }
    }
    setTouchStart(null);
  };

  const handleClose = () => navigate(baseRoute);
  
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video || !item) return;
    if (video.videoHeight > 0) {
      setVideoAspectRatio(video.videoWidth / video.videoHeight);
    }
    setVideoDurationMs(video.duration * 1000);
    const startTimeSec = (item.startTime || 0) / 1000;
    video.currentTime = startTimeSec;
    setCurrentTimeMs(item.startTime || 0);
    video.play().catch(e => console.warn("Autoplay was prevented:", e));
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !item) return;
    setCurrentTimeMs(video.currentTime * 1000);
    const startTimeSec = (item.startTime || 0) / 1000;
    const endTimeSec = item.endTime / 1000;
    if (endTimeSec > startTimeSec && video.currentTime >= endTimeSec - 0.1) {
      video.currentTime = startTimeSec;
      video.play().catch(e => console.warn("Loop playback failed", e));
    }
  };

  const handleSliderChange = (newTimeMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = newTimeMs / 1000;
    setCurrentTimeMs(newTimeMs);
  };
  
  const handleEdit = () => navigate(`${location.pathname}/edit`);
  const handleRequestDelete = () => setShowDeleteConfirm(true);
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    if (error) setError(null);
  };

  const handleConfirmDelete = async () => {
    if (!item) return;
    const itemType = 'uploadDate' in item ? 'lesson' : 'figure';

    setIsDeleting(true);
    setError(null);
    try {
      const driveIdsToDelete = itemType === 'lesson'
        ? await dataService.deleteLesson(item.id)
        : [await dataService.deleteFigure(item.id)].filter((id): id is string => !!id);

      if (isSignedIn && driveIdsToDelete.length > 0) {
        await localDatabaseService.addTombstones(driveIdsToDelete);
        // FIX: 'sync-deleted-log' is not a valid task type. Use 'sync-gallery' to process tombstones.
        addTask('sync-gallery', { type: itemType }, true);
      }
      
      if (refresh) refresh();
      handleClose();
    } catch (e) {
      console.error(`Failed to delete ${itemType}:`, e);
      setError(e instanceof Error ? e.message : t('player.errorDelete', { itemType: t(`player.${itemType}`) }));
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const modalTitle = item ? ('uploadDate' in item ? t('player.titleLesson', { date: new Date(item.uploadDate).toLocaleDateString(locale) }) : item.name) : t('common.loading');
    
  const primaryAction: ModalAction | undefined = item ? { label: t('common.edit'), onClick: handleEdit, disabled: isDeleting } : undefined;
  const secondaryActions: ModalAction[] | undefined = item ? [{ label: t('common.delete'), onClick: handleRequestDelete, isDestructive: true, disabled: isDeleting }] : undefined;
  
  return (
    <div className="h-full">
      <BaseModal
        onClose={handleClose}
        title={modalTitle}
        isMobile={isMobile}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        desktopWidth=""
        desktopHeight=""
        desktopStyle={desktopModalStyle}
        error={!showDeleteConfirm ? error : null}
        fillHeight={true}
      >
        <div
          className="flex flex-col h-full w-full"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div 
            className="bg-black flex-1 min-h-0 flex flex-col items-center justify-center"
          >
            {videoUrl && item ? (
              <div className="w-full h-full flex flex-col justify-center">
                <div className="relative flex-1 min-h-0 flex items-center justify-center group">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      onLoadedMetadata={handleLoadedMetadata}
                      onTimeUpdate={handleTimeUpdate}
                      onVolumeChange={handleVolumeChange}
                      playsInline
                      controls
                      controlsList="nodownload noplaybackrate"
                      disablePictureInPicture
                      className="w-full h-full object-contain cursor-pointer custom-video-controls"
                    />
                </div>
                <div className="p-4 flex-shrink-0">
                  <CustomSlider
                    min={item.startTime || 0}
                    max={item.endTime || videoDurationMs}
                    value={currentTimeMs}
                    onChange={handleSliderChange}
                    aria-label={t('player.seekSlider')}
                  />
                </div>
              </div>
            ) : (
              <i className={`material-icons text-7xl text-gray-600 ${isLoading ? 'animate-spin-reverse' : ''}`}>
                {isLoading ? 'sync' : 'ondemand_video'}
              </i>
            )}
          </div>
          <div className="px-4 pt-3 flex-shrink-0">
            <h3 className="font-bold text-gray-800 mb-1">{t('common.description')}:</h3>
            <div className="h-[2.5rem] overflow-y-auto pr-2 text-sm text-gray-700">
              {item?.description ? (
                <p className="whitespace-pre-wrap">{item.description}</p>
              ) : (
                <p className="italic text-gray-500">{t('common.noDescription')}</p>
              )}
            </div>
          </div>
        </div>
      </BaseModal>

      {item && (
        <ConfirmDeleteModal
            isOpen={showDeleteConfirm}
            onClose={handleCancelDelete}
            onConfirm={handleConfirmDelete}
            isDeleting={isDeleting}
            title={'uploadDate' in item ? t('deleteModal.titleLesson') : t('deleteModal.titleFigure')}
        >
            <p>
                {'uploadDate' in item
                    ? t('deleteModal.bodyLesson')
                    : t('deleteModal.bodyFigure')
                }
            </p>
            <p className="mt-2 font-semibold">{t('deleteModal.warning')}</p>
        </ConfirmDeleteModal>
      )}
    </div>
  );
};

export default PlayerScreen;

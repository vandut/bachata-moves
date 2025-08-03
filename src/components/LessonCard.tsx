



import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lesson, LessonCategory } from '../types';
import { dataService } from '../data/service';
import { useTranslation } from '../App';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { useFullscreenPlayer } from '../hooks/useFullscreenPlayer';
import ContextMenu, { ContextMenuAction } from './ContextMenu';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useGoogleDrive } from '../hooks/useGoogleDrive';

interface LessonCardProps {
  lesson: Lesson;
  lessonCategories: LessonCategory[];
  onRefresh: () => void;
  itemIds: string[];
  baseRoute: string;
}

const LessonCard: React.FC<LessonCardProps> = ({ lesson, lessonCategories, onRefresh, itemIds, baseRoute }) => {
  const { t, locale, settings } = useTranslation();
  const { isSignedIn, deleteLesson: deleteLessonFromDrive } = useGoogleDrive();

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVisible = useIntersectionObserver(cardRef, { threshold: 0.1 });
  const playInFullscreen = useFullscreenPlayer();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [menuState, setMenuState] = useState({ isOpen: false, position: { x: 0, y: 0 }});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const shouldPlay = (settings.autoplayGalleryVideos && isVisible) || isHovering;

  useEffect(() => {
    let isCancelled = false;
    // Reset state for new lesson prop
    setThumbnailUrl(null);
    // Do not reset videoUrl here, as it might be needed if hover state doesn't change
    setError(null);
    setIsPlaying(false);

    dataService.getLessonThumbnailUrl(lesson.id)
      .then(url => {
        if (!isCancelled && url) {
          setThumbnailUrl(url);
        }
      })
      .catch((err) => {
        console.warn(`Could not get thumbnail for lesson ${lesson.id}:`, err.message);
        if (!isCancelled) {
          setError(t('card.thumbNotAvailable'));
        }
      });
    return () => { isCancelled = true; };
  }, [lesson.id, lesson.thumbTime, t]);
  
  // Effect to load video URL when it should play
  useEffect(() => {
    let isCancelled = false;
    if (shouldPlay && !videoUrl) {
      dataService.getVideoObjectUrl(lesson)
        .then(url => {
          if (!isCancelled) setVideoUrl(url);
        })
        .catch(err => {
          if (!isCancelled) {
            console.error(`Could not load video for lesson ${lesson.id}:`, err);
            setError(t('card.videoNotLoaded'));
          }
        });
    }
    return () => { isCancelled = true; };
  }, [shouldPlay, videoUrl, lesson, t]);
  
  // Effect to set the final playing state
  useEffect(() => {
    setIsPlaying(shouldPlay && !!videoUrl);
  }, [shouldPlay, videoUrl]);
  
  // Effect to stop video playback when tab becomes inactive.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isPlaying) {
        setIsHovering(false); // Stop hover-play if tab is hidden
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  // Effect that handles the actual video element playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      const handleTimeUpdate = () => {
        const startTimeSec = (lesson.startTime || 0) / 1000;
        const endTimeSec = lesson.endTime / 1000;

        // Custom loop logic if endTime is set
        if (endTimeSec > startTimeSec && video.currentTime >= endTimeSec) {
          video.currentTime = startTimeSec;
          video.play().catch(e => console.warn("Loop playback failed", e));
        }
      };

      const playVideo = () => {
        video.currentTime = (lesson.startTime || 0) / 1000;
        video.play().catch(e => console.warn("Autoplay was prevented.", e));
      };

      video.addEventListener('timeupdate', handleTimeUpdate);

      if (video.readyState >= 3) { // HAVE_FUTURE_DATA
        playVideo();
      } else {
        video.addEventListener('loadeddata', playVideo, { once: true });
      }

      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('loadeddata', playVideo);
        video.pause();
      };
    } else {
      video.pause();
    }
  }, [isPlaying, lesson.startTime, lesson.endTime]);


  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);

  const handleExitFullscreen = () => {
    setVideoUrl(null);
  };
  
  const handleOpen = () => {
    playInFullscreen({
        item: lesson,
        onExit: handleExitFullscreen,
        itemIds,
        baseRoute,
    });
  };

  const handleEdit = () => {
    navigate(`/lessons/${lesson.id}/edit`);
  };

  const handleRequestRemove = () => {
    setShowDeleteConfirm(true);
  };

  const handleChangeCategory = async (newCategoryId: string | null) => {
    try {
      await dataService.updateLesson(lesson.id, { categoryId: newCategoryId });
      onRefresh();
    } catch (err) {
      console.error("Failed to update lesson category:", err);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      // First, attempt to delete from Google Drive if the user is signed in.
      // This is awaited, so if it fails, the local delete will not proceed.
      if (isSignedIn) {
        await deleteLessonFromDrive(lesson);
      }
      // If Drive deletion is successful (or not applicable), delete locally.
      await dataService.deleteLesson(lesson.id);
      
      setShowDeleteConfirm(false);
      onRefresh(); // Refresh the gallery to reflect the change.
    } catch (err) {
      console.error("Failed to delete lesson:", err);
      // In a real app, you might want to show an error toast to the user
    } finally {
      setIsDeleting(false);
    }
  };

  const showContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuState({ isOpen: true, position: { x: event.clientX, y: event.clientY } });
  }, []);

  const closeContextMenu = useCallback(() => setMenuState(prev => ({ ...prev, isOpen: false })), []);
  
  const categorySubMenu: ContextMenuAction[] = [
    {
      label: t('common.uncategorized'),
      onClick: () => handleChangeCategory(null),
      isChecked: !lesson.categoryId,
    },
    ...lessonCategories.map(cat => ({
      label: cat.name,
      onClick: () => handleChangeCategory(cat.id),
      isChecked: lesson.categoryId === cat.id,
    })),
  ];

  const menuActions: ContextMenuAction[] = [
    { label: t('common.open'), onClick: handleOpen, icon: 'open_in_full' },
    { label: t('common.category'), icon: 'folder', submenu: categorySubMenu },
    { label: t('common.edit'), onClick: handleEdit, icon: 'edit' },
    { label: t('common.remove'), onClick: handleRequestRemove, isDestructive: true, icon: 'delete' },
  ];

  const formattedDate = new Date(lesson.uploadDate).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const showVideo = isPlaying && videoUrl;

  return (
    <>
      <div
          ref={cardRef}
          onClick={handleOpen}
          onContextMenu={showContextMenu}
          role="button"
          tabIndex={0}
          aria-label={t('card.viewLesson', { date: formattedDate })}
          className="block bg-white text-current no-underline rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
      >
        <div className="h-full flex flex-col">
          <div className="aspect-[9/16] bg-gray-900 flex items-center justify-center relative text-white">
            {showVideo ? (
              <video
                ref={videoRef}
                src={videoUrl!} // We know videoUrl is a string here
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                {/* Display thumbnail as a background image */}
                <div 
                  className="w-full h-full bg-cover bg-center"
                  style={{ backgroundImage: thumbnailUrl ? `url(${thumbnailUrl})` : 'none' }}
                ></div>

                {/* Overlay for placeholder icon or error message */}
                {(error || !thumbnailUrl) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 bg-gray-900/50 pointer-events-none">
                    <i className="material-icons text-6xl text-gray-400">
                      {error ? 'videocam_off' : 'ondemand_video'}
                    </i>
                    {error && (
                      <p className="mt-2 text-xs text-red-400">{error}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="p-4 flex items-center justify-center">
            <h3 className="text-lg font-medium text-gray-800" title={t('card.lessonFrom', { date: formattedDate })}>
              {formattedDate}
            </h3>
          </div>
        </div>
      </div>
      <ContextMenu
        isOpen={menuState.isOpen}
        onClose={closeContextMenu}
        position={menuState.position}
        actions={menuActions}
        isMobile={isMobile}
      />
      <ConfirmDeleteModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title={t('deleteModal.titleLesson')}
      >
          <p>{t('deleteModal.bodyLesson')}</p>
          <p className="mt-2 font-semibold">{t('deleteModal.warning')}</p>
      </ConfirmDeleteModal>
    </>
  );
};

export default LessonCard;
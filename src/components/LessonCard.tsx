
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lesson, LessonCategory, School, Instructor } from '../types';
import { dataService } from '../services/DataService';
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
  schools: School[];
  instructors: Instructor[];
  onRefresh: () => void;
  itemIds: string[];
  baseRoute: string;
  onForceDelete?: (item: Lesson) => Promise<void>;
}

const LessonCard: React.FC<LessonCardProps> = ({ lesson, lessonCategories, schools, instructors, onRefresh, itemIds, baseRoute, onForceDelete }) => {
  // FIX: Destructure updateSettings to pass to the fullscreen player hook.
  const { t, locale, settings, updateSettings } = useTranslation();
  const { isSignedIn, initiateSync } = useGoogleDrive();

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  
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
    setError(null);

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

    const onPlaying = () => setIsVideoVisible(true);
    const onPause = () => setIsVideoVisible(false);

    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);

    if (isPlaying) {
      const handleTimeUpdate = () => {
        const startTimeSec = (lesson.startTime || 0) / 1000;
        const endTimeSec = lesson.endTime / 1000;

        // Custom loop logic if endTime is set
        if (endTimeSec > startTimeSec && video.currentTime >= endTimeSec) {
          video.currentTime = startTimeSec;
          video.play().catch(e => {
            if (e.name !== 'AbortError') {
              console.warn("Loop playback failed", e);
            }
          });
        }
      };
      video.addEventListener('timeupdate', handleTimeUpdate);

      video.currentTime = (lesson.startTime || 0) / 1000;
      video.play().catch(e => {
        if (e.name !== 'AbortError') {
          console.warn("Autoplay was prevented.", e);
        }
      });
      
      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
      }
    } else {
      video.pause();
    }

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
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
        // FIX: Pass settings and updateSettings to the hook.
        settings,
        updateSettings,
    });
  };

  const handleEdit = () => {
    navigate(`/lessons/${lesson.id}/edit`);
  };

  const handleRequestRemove = () => {
    setShowDeleteConfirm(true);
  };

  const handleChange = async (key: 'categoryId' | 'schoolId' | 'instructorId', value: string | null) => {
    try {
        await dataService.updateLesson(lesson.id, { [key]: value });
        if (isSignedIn) {
            initiateSync('lesson');
        }
        onRefresh();
    } catch (err) {
        console.error(`Failed to update lesson ${key}:`, err);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (onForceDelete) {
        await onForceDelete(lesson);
      } else {
        await dataService.deleteLesson(lesson.id);
      }
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
    { label: t('common.uncategorized'), onClick: () => handleChange('categoryId', null), isChecked: !lesson.categoryId },
    ...lessonCategories.map(cat => ({ label: cat.name, onClick: () => handleChange('categoryId', cat.id), isChecked: lesson.categoryId === cat.id })),
  ];

  const schoolSubMenu: ContextMenuAction[] = [
    { label: t('common.unassigned'), onClick: () => handleChange('schoolId', null), isChecked: !lesson.schoolId },
    ...schools.map(item => ({ label: item.name, onClick: () => handleChange('schoolId', item.id), isChecked: lesson.schoolId === item.id })),
  ];
  
  const instructorSubMenu: ContextMenuAction[] = [
    { label: t('common.unassigned'), onClick: () => handleChange('instructorId', null), isChecked: !lesson.instructorId },
    ...instructors.map(item => ({ label: item.name, onClick: () => handleChange('instructorId', item.id), isChecked: lesson.instructorId === item.id })),
  ];

  const menuActions: ContextMenuAction[] = [
    { label: t('common.open'), onClick: handleOpen, icon: 'open_in_full' },
    { label: t('common.category'), icon: 'folder', submenu: categorySubMenu },
    { label: t('common.school'), icon: 'school', submenu: schoolSubMenu },
    { label: t('common.instructor'), icon: 'person', submenu: instructorSubMenu },
    { label: t('common.edit'), onClick: handleEdit, icon: 'edit' },
    { label: t('common.remove'), onClick: handleRequestRemove, isDestructive: true, icon: 'delete' },
  ];

  const formattedDate = new Date(lesson.uploadDate).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <div
          ref={cardRef}
          onClick={handleOpen}
          onContextMenu={showContextMenu}
          role="button"
          tabIndex={0}
          aria-label={t('card.viewLesson', { date: formattedDate })}
          className={`block bg-white text-current no-underline rounded-lg shadow-md overflow-hidden transform transition-transform duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer ${isHovering ? 'scale-105' : ''}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
      >
        <div className="h-full flex flex-col">
          <div className="aspect-[9/16] bg-gray-900 flex items-center justify-center relative text-white">
            {/* Video is a layer that appears when playing */}
            {videoUrl && (
              <video
                  ref={videoRef}
                  src={videoUrl}
                  muted
                  playsInline
                  className={`absolute inset-0 w-full h-full object-cover ${!isVideoVisible ? 'hidden' : ''}`}
              />
            )}
            {/* Thumbnail and error are a layer that is hidden when playing */}
            <div className={`absolute inset-0 w-full h-full ${isVideoVisible ? 'hidden' : ''}`}>
                <div 
                  className="w-full h-full bg-cover bg-center"
                  style={{ backgroundImage: thumbnailUrl ? `url(${thumbnailUrl})` : 'none' }}
                ></div>

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
            </div>
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

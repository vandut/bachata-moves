import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Figure, Lesson, FigureCategory } from '../types';
import { dataService } from '../data-service';
import { useTranslation } from '../App';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { useFullscreenPlayer } from '../hooks/useFullscreenPlayer';
import ContextMenu, { ContextMenuAction } from './ContextMenu';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface FigureCardProps {
  figure: Figure;
  parentLesson?: Lesson;
  figureCategories: FigureCategory[];
  onRefresh: () => void;
  itemIds: string[];
  baseRoute: string;
}

const FigureCard: React.FC<FigureCardProps> = ({ figure, parentLesson, figureCategories, onRefresh, itemIds, baseRoute }) => {
  const { t, settings } = useTranslation();
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

  // Effect to load the thumbnail
  useEffect(() => {
    let isCancelled = false;
    setThumbnailUrl(null);
    setError(null); // Clear previous errors when figure changes

    dataService.getFigureThumbnailUrl(figure.id)
      .then(url => {
        if (!isCancelled && url) {
          setThumbnailUrl(url);
        }
      })
      .catch(err => {
        console.warn(`Could not get thumbnail for figure ${figure.id}:`, err.message);
        if (!isCancelled) {
            setError(t('card.thumbNotAvailable'));
        }
      });
    
    return () => { isCancelled = true; };
  }, [figure.id, figure.thumbTime, t]);

  // Effect to load video URL
  useEffect(() => {
    let isCancelled = false;
    if (shouldPlay && !videoUrl && parentLesson) {
      dataService.getVideoObjectUrl(parentLesson)
        .then(url => {
          if (!isCancelled) setVideoUrl(url);
        })
        .catch(err => {
          if (!isCancelled) {
            console.error(`Could not load video for figure ${figure.id}:`, err);
            setError(t('card.videoNotLoaded'));
          }
        });
    }
    return () => { isCancelled = true; };
  }, [shouldPlay, videoUrl, parentLesson, figure.id, t]);

  // Effect to set the final playing state
  useEffect(() => {
    setIsPlaying(shouldPlay && !!videoUrl && !!parentLesson);
  }, [shouldPlay, videoUrl, parentLesson]);

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

  // Effect to handle video element playback logic
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      const handleTimeUpdate = () => {
        const startTimeSec = (figure.startTime || 0) / 1000;
        const endTimeSec = figure.endTime / 1000;

        // Loop logic
        if (endTimeSec > startTimeSec && video.currentTime >= endTimeSec) {
          video.currentTime = startTimeSec;
          video.play().catch(e => console.warn("Figure loop playback failed", e));
        }
      };

      const playVideo = () => {
        video.currentTime = (figure.startTime || 0) / 1000;
        video.play().catch(e => console.warn("Figure autoplay was prevented.", e));
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
  }, [isPlaying, figure.startTime, figure.endTime]);

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);
  
  const handleExitFullscreen = () => {
    setVideoUrl(null);
  };
  
  const handleOpen = () => {
    playInFullscreen({
        item: figure,
        parentLesson,
        onExit: handleExitFullscreen,
        itemIds,
        baseRoute,
    });
  };

  const handleEdit = () => {
    navigate(`/figures/${figure.id}/edit`);
  };

  const handleRequestRemove = () => {
    setShowDeleteConfirm(true);
  };

  const handleChangeCategory = async (newCategoryId: string | null) => {
    try {
      await dataService.updateFigure(figure.id, { categoryId: newCategoryId });
      onRefresh();
    } catch (err) {
      console.error("Failed to update figure category:", err);
      // Optionally show an error to the user
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await dataService.deleteFigure(figure.id);
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to delete figure:", err);
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
      isChecked: !figure.categoryId,
    },
    ...figureCategories.map(cat => ({
      label: cat.name,
      onClick: () => handleChangeCategory(cat.id),
      isChecked: figure.categoryId === cat.id,
    })),
  ];

  const menuActions: ContextMenuAction[] = [
    { label: t('common.open'), onClick: handleOpen, icon: 'open_in_full' },
    { label: t('common.category'), icon: 'folder', submenu: categorySubMenu },
    { label: t('common.edit'), onClick: handleEdit, icon: 'edit' },
    { label: t('common.remove'), onClick: handleRequestRemove, isDestructive: true, icon: 'delete' },
  ];

  const showVideo = isPlaying && videoUrl;
  
  const getIconName = () => {
    if (error === t('card.videoNotLoaded') || error === t('card.videoNotAvailable')) return 'videocam_off';
    if (error) return 'image_not_supported';
    return 'people';
  };

  return (
    <>
      <div
          ref={cardRef}
          onClick={handleOpen}
          onContextMenu={showContextMenu}
          role="button"
          tabIndex={0}
          aria-label={t('card.viewFigure', { name: figure.name })}
          className="block bg-white text-current no-underline rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
      >
        <div className="h-full flex flex-col">
          <div className="aspect-[9/16] bg-gray-900 flex items-center justify-center relative text-white">
            {showVideo ? (
              <video
                ref={videoRef}
                src={videoUrl!}
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <div 
                  className="w-full h-full bg-cover bg-center"
                  style={{ backgroundImage: thumbnailUrl ? `url(${thumbnailUrl})` : 'none' }}
                ></div>
                
                {(error || !thumbnailUrl) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 bg-gray-900/50 pointer-events-none">
                    <i className="material-icons text-6xl text-gray-400">
                      {getIconName()}
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
            <h3 className="text-lg font-medium text-gray-800 text-center" title={figure.name}>{figure.name}</h3>
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
        title={t('deleteModal.titleFigure')}
      >
          <p>{t('deleteModal.bodyFigure')}</p>
          <p className="mt-2 font-semibold">{t('deleteModal.warning')}</p>
      </ConfirmDeleteModal>
    </>
  );
};

export default FigureCard;
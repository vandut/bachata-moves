import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// FIX: Changed ContextMenuAction to be a type import, as it's only used for type annotations.
import type { Figure, Lesson, FigureCategory, School, Instructor } from '../types';
import { dataService } from '../services/DataService';
import { useTranslation } from '../contexts/I18nContext';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { useFullscreenPlayer } from '../hooks/useFullscreenPlayer';
// FIX: ContextMenu is a default export. The original file was incomplete, causing the error.
import ContextMenu, { type ContextMenuAction } from './ContextMenu';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSettings } from '../contexts/SettingsContext';
import { itemManagementService } from '../services/ItemManagementService';

interface FigureCardProps {
  figure: Figure;
  parentLesson?: Lesson;
  figureCategories: FigureCategory[];
  schools: School[];
  instructors: Instructor[];
  onRefresh: () => void;
  itemIds: string[];
  baseRoute: string;
  onForceDelete?: (item: Figure) => Promise<void>;
}

const FigureCard: React.FC<FigureCardProps> = ({ figure, parentLesson, figureCategories, schools, instructors, onRefresh, itemIds, baseRoute, onForceDelete }) => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
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

    const onPlaying = () => setIsVideoVisible(true);
    const onPause = () => setIsVideoVisible(false);

    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);

    if (isPlaying) {
      const handleTimeUpdate = () => {
        const startTimeSec = (figure.startTime || 0) / 1000;
        const endTimeSec = figure.endTime / 1000;

        // Loop logic
        if (endTimeSec > startTimeSec && video.currentTime >= endTimeSec) {
          video.currentTime = startTimeSec;
          video.play().catch(e => {
            if (e.name !== 'AbortError') {
              console.warn("Figure loop playback failed", e);
            }
          });
        }
      };
      video.addEventListener('timeupdate', handleTimeUpdate);

      video.currentTime = (figure.startTime || 0) / 1000;
      video.play().catch(e => {
        if (e.name !== 'AbortError') {
          console.warn("Figure autoplay was prevented.", e);
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
    };
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
        settings,
        updateSettings,
    });
  };

  const handleEdit = () => {
    navigate(`/figures/${figure.id}/edit`);
  };

  const handleRequestRemove = () => {
    setShowDeleteConfirm(true);
  };

  const handleChange = async (key: 'categoryId' | 'schoolId' | 'instructorId', value: string | null) => {
    try {
        await itemManagementService.updateItemProperty('figure', figure.id, key, value);
        onRefresh();
    } catch (err) {
        console.error(`Failed to update figure ${key}:`, err);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await itemManagementService.deleteItem('figure', figure.id);
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
    { label: t('common.uncategorized'), onClick: () => handleChange('categoryId', null), isChecked: !figure.categoryId },
    ...figureCategories.map(cat => ({ label: cat.name, onClick: () => handleChange('categoryId', cat.id), isChecked: figure.categoryId === cat.id })),
  ];

  const schoolSubMenu: ContextMenuAction[] = [
    { label: t('common.unassigned'), onClick: () => handleChange('schoolId', null), isChecked: !figure.schoolId },
    ...schools.map(item => ({ label: item.name, onClick: () => handleChange('schoolId', item.id), isChecked: figure.schoolId === item.id })),
  ];
  
  const instructorSubMenu: ContextMenuAction[] = [
    { label: t('common.unassigned'), onClick: () => handleChange('instructorId', null), isChecked: !figure.instructorId },
    ...instructors.map(item => ({ label: item.name, onClick: () => handleChange('instructorId', item.id), isChecked: figure.instructorId === item.id })),
  ];

  const menuActions: ContextMenuAction[] = [
    { label: t('common.open'), onClick: handleOpen, icon: 'open_in_full' },
    { label: t('common.category'), icon: 'folder', submenu: categorySubMenu },
    { label: t('common.school'), icon: 'school', submenu: schoolSubMenu },
    { label: t('common.instructor'), icon: 'person', submenu: instructorSubMenu },
    { label: t('common.edit'), onClick: handleEdit, icon: 'edit' },
    { label: t('common.remove'), onClick: handleRequestRemove, isDestructive: true, icon: 'delete' },
  ];
  
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
                      {getIconName()}
                    </i>
                    {error && (
                        <p className="mt-2 text-xs text-red-400">{error}</p>
                    )}
                  </div>
                )}
            </div>
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
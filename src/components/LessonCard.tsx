import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// FIX: Changed ContextMenuAction to be a type import, as it's only used for type annotations.
import type { Lesson, LessonCategory, School, Instructor } from '../types';
import { useTranslation } from '../contexts/I18nContext';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { useFullscreenPlayer } from '../hooks/useFullscreenPlayer';
// FIX: ContextMenu is a default export. The original file was incomplete, causing the error.
import ContextMenu, { type ContextMenuAction } from './ContextMenu';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSettings } from '../contexts/SettingsContext';
import { itemManagementService } from '../services/ItemManagementService';
import { useVideoPlayback } from '../hooks/useVideoPlayback';

interface LessonCardProps {
  lesson: Lesson;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  lessonCategories: LessonCategory[];
  schools: School[];
  instructors: Instructor[];
  onRefresh: () => void;
  itemIds: string[];
  baseRoute: string;
  onForceDelete?: (item: Lesson) => Promise<void>;
}

const LessonCard: React.FC<LessonCardProps> = ({ lesson, thumbnailUrl, videoUrl, lessonCategories, schools, instructors, onRefresh, itemIds, baseRoute, onForceDelete }) => {
  const { t, locale } = useTranslation();
  const { settings, updateSettings } = useSettings();

  const [error, setError] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);
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
  
  const shouldPlay = ((settings.autoplayGalleryVideos && isVisible) || isHovering) && !!videoUrl;
  useVideoPlayback({ videoRef, item: lesson, shouldPlay, onVideoVisibilityChange: setIsVideoVisible });

  useEffect(() => {
    setError(null);
  }, [lesson.id]);

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);
  
  const handleOpen = () => {
    if (!videoUrl) {
      console.warn("Attempted to open lesson with no video URL.");
      return;
    }
    playInFullscreen({
        item: lesson,
        videoUrl,
        onExit: () => {},
        itemIds,
        baseRoute,
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
        await itemManagementService.updateItemProperty('lesson', lesson.id, key, value);
        onRefresh();
    } catch (err) {
        console.error(`Failed to update lesson ${key}:`, err);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await itemManagementService.deleteItem('lesson', lesson.id);
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to delete lesson:", err);
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
import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import BaseModal from './BaseModal';
import type { ModalAction, Lesson } from '../types';
import { useTranslation } from '../contexts/I18nContext';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { dataService } from '../services/DataService';
import { itemManagementService } from '../services/ItemManagementService';

// --- SELECTABLE LESSON CARD ---

interface SelectableLessonCardProps {
  lesson: Lesson;
  onSelect: (lessonId: string) => void;
  isSelected: boolean;
}

const SelectableLessonCard: React.FC<SelectableLessonCardProps> = ({ lesson, onSelect, isSelected }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const { locale } = useTranslation();

  useEffect(() => {
    let isCancelled = false;
    dataService.getLessonThumbnailUrl(lesson.id).then(url => {
      if (!isCancelled && url) setThumbnailUrl(url);
    });
    return () => { isCancelled = true; };
  }, [lesson.id]);

  const formattedDate = new Date(lesson.uploadDate).toLocaleDateString(locale, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div
      onClick={() => onSelect(lesson.id)}
      aria-label={`Select lesson from ${formattedDate}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(lesson.id)}
      className={`block text-current no-underline rounded-lg shadow-md overflow-hidden transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
        isSelected ? 'ring-4 ring-blue-500' : 'hover:shadow-lg'
      }`}
    >
      <div className="aspect-[9/16] bg-gray-900 flex items-center justify-center relative text-white">
        {thumbnailUrl ? (
          <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${thumbnailUrl})` }}/>
        ) : (
          <i className="material-icons text-6xl text-gray-400">ondemand_video</i>
        )}
      </div>
      <div className="p-2 text-center">
        <p className="text-sm font-medium text-gray-800">{formattedDate}</p>
      </div>
    </div>
  );
};


// --- ADD FIGURE MODAL ---

interface GalleryContext {
  refresh: () => void;
  isMobile: boolean;
}

const AddFigureModal: React.FC = () => {
    const navigate = useNavigate();
    const { isMobile } = useOutletContext<GalleryContext>();
    const { t } = useTranslation();
    const { isSignedIn } = useGoogleDrive();
    const [error, setError] = useState<string | null>(null);
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
    const [isLoadingLessons, setIsLoadingLessons] = useState(true);

    useEffect(() => {
        setIsLoadingLessons(true);
        itemManagementService.getLessonsForNewFigure()
            .then(lessons => setLessons(lessons))
            .catch(err => setError(err.message))
            .finally(() => setIsLoadingLessons(false));
    }, []);

    const handleClose = () => navigate('/figures');
    
    const handleNext = () => {
        if (selectedLessonId) {
            // If signed in, we want to treat this as a blocking operation on the next screen.
            const forceCreateParam = isSignedIn ? '&forceCreate=true' : '';
            navigate(`/figures/create?lessonId=${selectedLessonId}${forceCreateParam}`);
        }
    };
    
    const primaryAction: ModalAction = { 
        label: t('common.next'), 
        onClick: handleNext, 
        disabled: !selectedLessonId 
    };

    return (
        <BaseModal
            onClose={handleClose}
            primaryAction={primaryAction}
            title={t('addFigureModal.title')}
            isMobile={isMobile}
            desktopWidth="max-w-4xl"
            error={error}
        >
            <div className="space-y-4">
                <p className="text-gray-600">{t('addFigureModal.selectLesson')}</p>
                {isLoadingLessons ? (
                    <div className="flex items-center justify-center h-48">
                        <i className="material-icons text-4xl text-gray-400 animate-spin-reverse">sync</i>
                        <span className="ml-3 text-gray-600">{t('gallery.loading', { item: t('nav.lessons') })}</span>
                    </div>
                ) : lessons.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-center text-gray-500">
                        <div>
                           <i className="material-icons text-6xl">video_library</i>
                           <p className="mt-2">{t('addFigureModal.noLessons')}</p>
                           <p className="text-sm">{t('addFigureModal.noLessonsDesc')}</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 max-h-[60vh] overflow-y-auto p-4 rounded-md bg-gray-50">
                        {lessons.map(lesson => (
                            <SelectableLessonCard 
                                key={lesson.id} 
                                lesson={lesson} 
                                onSelect={setSelectedLessonId} 
                                isSelected={selectedLessonId === lesson.id} 
                            />
                        ))}
                    </div>
                )}
            </div>
        </BaseModal>
    );
};

export default AddFigureModal;
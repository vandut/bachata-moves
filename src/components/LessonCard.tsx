import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Lesson } from '../types';
import { dataService } from '../data-service';
import { useTranslation } from '../App';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface LessonCardProps {
  lesson: Lesson;
}

const LessonCard: React.FC<LessonCardProps> = ({ lesson }) => {
  const { t, locale, settings } = useTranslation();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const cardRef = useRef<HTMLAnchorElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVisible = useIntersectionObserver(cardRef, { threshold: 0.1 });

  const shouldPlay = (settings.autoplayGalleryVideos && isVisible) || isHovering;

  useEffect(() => {
    let isCancelled = false;
    // Reset state for new lesson prop
    setThumbnailUrl(null);
    setVideoUrl(null);
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

  const formattedDate = new Date(lesson.uploadDate).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const showVideo = isPlaying && videoUrl;

  return (
    <Link
        ref={cardRef}
        to={`/lessons/${lesson.id}`}
        aria-label={t('card.viewLesson', { date: formattedDate })}
        className="block bg-white text-current no-underline rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
    </Link>
  );
};

export default LessonCard;
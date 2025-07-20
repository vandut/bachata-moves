

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Lesson } from '../types';
import { dataService } from '../data-service';

interface LessonCardProps {
  lesson: Lesson;
}

const LessonCard: React.FC<LessonCardProps> = ({ lesson }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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
          setError('Thumbnail not available');
        }
      });
    return () => { isCancelled = true; };
  }, [lesson.id]);

  // This effect handles playback and runs ONLY when the video element is mounted and isPlaying is true
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Only set up listeners and play if isPlaying is true
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

      // If video is already loaded, `loadeddata` won't fire again.
      if (video.readyState >= 3) { // HAVE_FUTURE_DATA
        playVideo();
      } else {
        video.addEventListener('loadeddata', playVideo);
      }

      return () => {
        video.removeEventListener('loadeddata', playVideo);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.pause();
      };
    } else {
      video.pause();
    }
  }, [isPlaying, videoUrl, lesson.startTime, lesson.endTime]);

  const handleMouseEnter = () => {
    // Don't try to play if a video load has already failed
    if (error === 'Video could not be loaded.') return;

    if (!videoUrl) {
      dataService.getVideoObjectUrl(lesson)
        .then(url => {
          setVideoUrl(url);
          setIsPlaying(true);
        })
        .catch(err => {
          console.error(`Could not load video for lesson ${lesson.id}:`, err);
          setError('Video could not be loaded.');
        });
    } else {
      setIsPlaying(true);
    }
  };

  const handleMouseLeave = () => {
    setIsPlaying(false);
  };


  const formattedDate = new Date(lesson.uploadDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const showVideo = isPlaying && videoUrl;

  return (
    <Link
        to={`/lessons/${lesson.id}`}
        aria-label={`View lesson from ${formattedDate}`}
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
          <h3 className="text-lg font-medium text-gray-800" title={`Lesson from ${formattedDate}`}>
            {formattedDate}
          </h3>
        </div>
      </div>
    </Link>
  );
};

export default LessonCard;
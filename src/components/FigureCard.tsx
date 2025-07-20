


import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Figure, Lesson } from '../types';
import { dataService } from '../data-service';

interface FigureCardProps {
  figure: Figure;
  parentLesson?: Lesson;
}

const FigureCard: React.FC<FigureCardProps> = ({ figure, parentLesson }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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
            setError('Thumbnail not available');
        }
      });
    
    return () => { isCancelled = true; };
  }, [figure.id]);

  // Effect to handle video playback logic
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
  }, [isPlaying, videoUrl, figure.startTime, figure.endTime]);


  const handleMouseEnter = () => {
    if (!parentLesson) {
        setError('Video not available (lesson missing)');
        return;
    }
    if (error === 'Video could not be loaded.') return;

    if (!videoUrl) {
      dataService.getVideoObjectUrl(parentLesson)
        .then(url => {
          setVideoUrl(url);
          setIsPlaying(true);
        })
        .catch(err => {
          console.error(`Could not load video for figure ${figure.id} from lesson ${parentLesson.id}:`, err);
          setError('Video could not be loaded.');
        });
    } else {
      setIsPlaying(true);
    }
  };

  const handleMouseLeave = () => {
    setIsPlaying(false);
  };

  const showVideo = isPlaying && videoUrl;
  
  const getIconName = () => {
    if (error?.includes('Video')) return 'videocam_off';
    if (error) return 'image_not_supported';
    return 'people';
  };

  return (
    <Link 
        to={`/figures/${figure.id}`}
        aria-label={`View figure: ${figure.name}`}
        className="block bg-white text-current no-underline rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
    </Link>
  );
};

export default FigureCard;
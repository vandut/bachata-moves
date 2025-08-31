import { useEffect, RefObject } from 'react';
import type { Lesson, Figure } from '../types';

interface UseVideoPlaybackProps {
  videoRef: RefObject<HTMLVideoElement>;
  item: Lesson | Figure | null | undefined;
  // FIX: Added optional props to support autoplay in gallery views, fixing errors in LessonCard and FigureCard.
  shouldPlay?: boolean;
  onVideoVisibilityChange?: (isVisible: boolean) => void;
}

/**
 * A hook that centralizes the business logic for looping a video clip.
 * It attaches a 'timeupdate' event listener to a video element and ensures
 * that playback loops between the item's `startTime` and `endTime`.
 * The component using this hook remains responsible for initiating play/pause,
 * unless `shouldPlay` is provided.
 */
export const useVideoPlayback = ({ videoRef, item, shouldPlay, onVideoVisibilityChange }: UseVideoPlaybackProps) => {
  // Handles looping logic
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item) return;

    const handleTimeUpdate = () => {
      // Don't loop if paused by user, seeking, or not ready to play
      if (video.paused || video.seeking || video.readyState < 3) return;

      const startTimeSec = (item.startTime || 0) / 1000;
      const endTimeSec = item.endTime / 1000;

      // Add a 0.1s buffer to prevent premature looping on some browsers
      if (endTimeSec > startTimeSec && video.currentTime >= endTimeSec - 0.1) {
        video.currentTime = startTimeSec;
        if (shouldPlay) {
          video.play().catch(e => console.warn("Loop playback failed", e));
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    
    return () => {
      if (video) {
        video.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, [item, videoRef, shouldPlay]);

  // Handles play/pause logic for gallery cards
  useEffect(() => {
    if (typeof shouldPlay !== 'boolean' || typeof onVideoVisibilityChange !== 'function') {
        return;
    }

    const video = videoRef.current;
    if (!video || !item) {
        onVideoVisibilityChange(false);
        return;
    };
    
    if (shouldPlay) {
      const startTimeSec = (item.startTime || 0) / 1000;
      // Seek to start if we are outside the loop range or at the very end.
      if (video.currentTime < startTimeSec || video.currentTime >= item.endTime / 1000) {
          video.currentTime = startTimeSec;
      }
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          onVideoVisibilityChange(true);
        }).catch(err => {
          console.warn('Video autoplay was prevented:', err);
          onVideoVisibilityChange(false);
        });
      }
    } else {
      video.pause();
      onVideoVisibilityChange(false);
    }
  }, [shouldPlay, item, videoRef, onVideoVisibilityChange]);
};

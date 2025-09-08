import { useRef, useCallback } from 'react';
import type { Lesson, Figure } from '../types';
import type { AppSettings } from '../contexts/SettingsContext';

type OnExitCallback = () => void;

interface PlayOptions {
    item: Lesson | Figure;
    videoUrl: string;
    onExit?: OnExitCallback;
    itemIds: string[];
    baseRoute: string;
    settings: AppSettings;
    updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

export const useFullscreenPlayer = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const onExitRef = useRef<OnExitCallback | undefined>(undefined);

    const cleanup = useCallback(() => {
        // Remove the video element from the DOM
        if (videoRef.current && videoRef.current.parentNode) {
            videoRef.current.parentNode.removeChild(videoRef.current);
            videoRef.current = null;
        }

        // Call the onExit callback if it exists
        const exitCb = onExitRef.current;
        onExitRef.current = undefined;
        if (typeof exitCb === 'function') {
            exitCb();
        }
    }, []);

    const play = useCallback(async (options: PlayOptions) => {
        const { item, onExit, settings, updateSettings, videoUrl } = options;
        onExitRef.current = onExit;

        try {
            const video = document.createElement('video');
            videoRef.current = video;
            video.src = videoUrl;
            video.controls = true;
            video.autoplay = true;
            video.style.position = 'absolute'; // Hide element before it's fullscreen
            video.style.left = '-9999px';
            video.muted = settings.isMuted;
            video.volume = settings.volume;

            // Apply the same control attributes as the editor's video player
            video.setAttribute('controlsList', 'nodownload noplaybackrate');
            video.toggleAttribute('disablePictureInPicture', true);

            video.addEventListener('volumechange', () => {
                if (video.muted !== settings.isMuted) updateSettings({ isMuted: video.muted });
                if (video.volume !== settings.volume) updateSettings({ volume: video.volume });
            });

            video.addEventListener('loadedmetadata', () => {
                video.currentTime = (item.startTime || 0) / 1000;
            });
            
            video.addEventListener('timeupdate', () => {
                const startTimeSec = (item.startTime || 0) / 1000;
                const endTimeSec = item.endTime / 1000;
                if (endTimeSec > startTimeSec && video.currentTime >= endTimeSec) {
                    video.currentTime = startTimeSec;
                    video.play().catch(e => console.warn("Fullscreen loop playback failed", e));
                }
            });
            
            // Add dblclick listener to exit fullscreen, as requested
            video.addEventListener('dblclick', () => {
                if (document.fullscreenElement === video) {
                    document.exitFullscreen().catch(err => console.error("Error exiting fullscreen on dblclick:", err));
                }
            });

            document.body.appendChild(video);
            
            if (video.requestFullscreen) {
                await video.requestFullscreen();
            }

            const onFullscreenChange = () => {
                // When we exit fullscreen, document.fullscreenElement is no longer our video.
                if (document.fullscreenElement !== video) {
                    cleanup();
                    document.removeEventListener('fullscreenchange', onFullscreenChange);
                }
            };
            document.addEventListener('fullscreenchange', onFullscreenChange);

        } catch (error) {
            console.error("Failed to play video in fullscreen:", error);
            cleanup(); // Ensure cleanup happens on error
        }
    }, [cleanup]);

    return play;
};

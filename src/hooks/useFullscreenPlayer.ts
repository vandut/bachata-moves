


import { useRef, useCallback } from 'react';
import { dataService } from '../services/DataService';
import type { Lesson, Figure, AppSettings } from '../types';

type OnExitCallback = () => void;

interface PlayOptions {
    item: Lesson | Figure;
    parentLesson?: Lesson;
    onExit?: OnExitCallback;
    itemIds: string[];
    baseRoute: string;
    settings: AppSettings;
    updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

export const useFullscreenPlayer = () => {
    // FIX: Completed the hook implementation. The useRef should be for an HTMLVideoElement.
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const onExitRef = useRef<OnExitCallback | undefined>();

    const cleanup = useCallback(async () => {
        if (document.fullscreenElement && document.exitFullscreen) {
            // FIX: Refactor to async/await to handle the promise from exitFullscreen().
            // This can resolve obscure environment-specific linter errors related to promise handling.
            try {
                // FIX: The standard document.exitFullscreen() call is correct. The previous use of .call() was an attempt to fix a misleading type error "Expected 1 arguments, but got 0".
                await document.exitFullscreen();
            } catch (err) {
                console.error("Error exiting fullscreen:", err);
            }
        }
        if (containerRef.current && containerRef.current.parentNode === document.body) {
            document.body.removeChild(containerRef.current);
            containerRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current = null;
        }
        // FIX: The error "Expected 1 arguments, but got 0" is likely a misleading linter error.
        // Refactoring to store the callback, clear the ref, and then call the stored callback is a safer pattern
        // that can prevent race conditions or confusing compiler behavior.
        const exitCb = onExitRef.current;
        onExitRef.current = undefined;
        // The check is moved to after getting the callback, and a typeof check is used
        // which can sometimes help with TypeScript's control flow analysis for complex types.
        if (typeof exitCb === 'function') {
            exitCb();
        }
    }, []);

    const play = useCallback(async (options: PlayOptions) => {
        // FIX: Destructure settings and updateSettings from options to break circular dependency.
        const { item, parentLesson, onExit, settings, updateSettings } = options;
        onExitRef.current = onExit;

        const lessonForVideo = 'uploadDate' in item ? item : parentLesson;
        if (!lessonForVideo) {
            console.error("No lesson provided for video source.");
            return;
        }

        try {
            const videoUrl = await dataService.getVideoObjectUrl(lessonForVideo);
            
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100vw';
            container.style.height = '100vh';
            container.style.backgroundColor = 'black';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.zIndex = '9999';
            containerRef.current = container;

            const video = document.createElement('video');
            videoRef.current = video;
            video.src = videoUrl;
            video.controls = true;
            video.autoplay = true;
            video.style.maxWidth = '100%';
            video.style.maxHeight = '100%';
            video.muted = settings.isMuted;
            video.volume = settings.volume;

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

            container.appendChild(video);
            document.body.appendChild(container);
            
            if (container.requestFullscreen) {
                await container.requestFullscreen();
            }

            const onFullscreenChange = () => {
                if (!document.fullscreenElement) {
                    cleanup();
                    document.removeEventListener('fullscreenchange', onFullscreenChange);
                }
            };
            document.addEventListener('fullscreenchange', onFullscreenChange);

        } catch (error) {
            console.error("Failed to play video in fullscreen:", error);
            cleanup();
        }
    }, [cleanup]);

    return play;
};
import { useRef, useCallback } from 'react';
import { dataService } from '../data-service';
import type { Lesson, Figure } from '../types';
import { useVideoSettings } from '../contexts/VideoSettingsContext';

type OnExitCallback = () => void;

export const useFullscreenPlayer = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const currentItemRef = useRef<Lesson | Figure | null>(null);
    const { isMuted, setIsMuted, volume, setVolume } = useVideoSettings();

    const play = useCallback(async (item: Lesson | Figure, parentLesson?: Lesson, onExit?: OnExitCallback) => {
        if (videoRef.current || document.fullscreenElement) {
            return;
        }

        const lessonForVideo = 'uploadDate' in item ? item : parentLesson;
        if (!lessonForVideo) {
            console.error("Video source lesson not available.");
            return;
        }
        
        let videoUrl: string;
        try {
            videoUrl = await dataService.getVideoObjectUrl(lessonForVideo);
        } catch (err) {
            console.error("Failed to get video URL", err);
            return;
        }
        
        const video = document.createElement('video');
        videoRef.current = video;
        currentItemRef.current = item;

        video.src = videoUrl;
        video.controls = true;
        video.playsInline = true;
        video.style.backgroundColor = 'black';
        video.style.width = '100%';
        video.style.height = '100%';

        // Customizations for fullscreen player
        video.classList.add('custom-video-controls');
        video.setAttribute('controlslist', 'nodownload noplaybackrate');
        video.disablePictureInPicture = true;

        // Sync with global video settings
        video.muted = isMuted;
        video.volume = volume;

        const handleVolumeChange = () => {
            const videoElem = videoRef.current;
            if (!videoElem) return;
            if (videoElem.muted !== isMuted) setIsMuted(videoElem.muted);
            if (videoElem.volume !== volume) setVolume(videoElem.volume);
        };

        const cleanup = () => {
            const videoElem = videoRef.current;
            if (videoElem) {
                videoElem.removeEventListener('timeupdate', handleTimeUpdate);
                videoElem.removeEventListener('loadedmetadata', handleLoadedMetadata);
                document.removeEventListener('fullscreenchange', handleFullscreenChange);
                videoElem.removeEventListener('volumechange', handleVolumeChange);
                videoElem.pause();
                videoElem.src = '';
                
                // Let dataService handle revoking the URL and clearing its cache
                dataService.revokeVideoObjectUrl(lessonForVideo.id);

                if (videoElem.parentNode) {
                    videoElem.parentNode.removeChild(videoElem);
                }
                videoRef.current = null;
                currentItemRef.current = null;

                onExit?.();
            }
        };

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                cleanup();
            }
        };

        const handleTimeUpdate = () => {
            const currentItem = currentItemRef.current;
            if (!currentItem || !videoRef.current) return;
            const videoElem = videoRef.current;
            const startTimeSec = (currentItem.startTime || 0) / 1000;
            const endTimeSec = currentItem.endTime / 1000;

            if (endTimeSec > startTimeSec && videoElem.currentTime >= endTimeSec - 0.1) {
                videoElem.currentTime = startTimeSec;
                videoElem.play().catch(e => console.warn("Loop playback failed", e));
            }
        };

        const handleLoadedMetadata = () => {
            const currentItem = currentItemRef.current;
            if (!currentItem || !videoRef.current) return;
            videoRef.current.currentTime = (currentItem.startTime || 0) / 1000;
            videoRef.current.play().catch(e => console.warn("Autoplay was prevented", e));
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        video.addEventListener('volumechange', handleVolumeChange);

        document.body.appendChild(video);
        
        try {
            if (video.requestFullscreen) {
                await video.requestFullscreen();
            } else {
                throw new Error("Fullscreen API not supported");
            }
        } catch (err) {
            console.error("Failed to enter fullscreen:", err);
            cleanup();
        }
    }, [isMuted, volume, setIsMuted, setVolume]);

    return play;
};
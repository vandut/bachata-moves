
import { useRef, useCallback } from 'react';
import { dataService } from '../data-service';
import type { Lesson, Figure } from '../types';
import { useVideoSettings } from '../contexts/VideoSettingsContext';

type OnExitCallback = () => void;

interface PlayOptions {
    item: Lesson | Figure;
    parentLesson?: Lesson;
    onExit?: OnExitCallback;
    itemIds: string[];
    baseRoute: string;
}

export const useFullscreenPlayer = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const currentItemRef = useRef<Lesson | Figure | null>(null);
    const currentLessonForVideoRef = useRef<Lesson | null>(null);
    const itemIdsRef = useRef<string[]>([]);
    const baseRouteRef = useRef<string>('');
    const onExitRef = useRef<OnExitCallback | undefined>(undefined);
    const touchStartRef = useRef<{ x: number, y: number } | null>(null);

    const { isMuted, setIsMuted, volume, setVolume } = useVideoSettings();

    const play = useCallback(async ({ item, parentLesson, onExit, itemIds, baseRoute }: PlayOptions) => {
        if (videoRef.current || document.fullscreenElement) {
            return;
        }

        const initialLessonForVideo = 'uploadDate' in item ? item : parentLesson;
        if (!initialLessonForVideo) {
            console.error("Video source lesson not available.");
            return;
        }
        
        // Set up refs for navigation and state tracking
        currentItemRef.current = item;
        currentLessonForVideoRef.current = initialLessonForVideo;
        itemIdsRef.current = itemIds;
        baseRouteRef.current = baseRoute;
        onExitRef.current = onExit;

        let videoUrl: string;
        try {
            videoUrl = await dataService.getVideoObjectUrl(initialLessonForVideo);
        } catch (err) {
            console.error("Failed to get video URL", err);
            return;
        }
        
        const video = document.createElement('video');
        videoRef.current = video;

        video.src = videoUrl;
        video.controls = true;
        video.playsInline = true;
        video.style.backgroundColor = 'black';
        video.style.width = '100%';
        video.style.height = '100%';

        video.classList.add('custom-video-controls');
        video.setAttribute('controlslist', 'nodownload noplaybackrate');
        video.disablePictureInPicture = true;

        video.muted = isMuted;
        video.volume = volume;

        const navigateToItem = async (direction: 'next' | 'prev') => {
            if (!currentItemRef.current || !currentLessonForVideoRef.current || itemIdsRef.current.length < 2) return;

            const currentId = currentItemRef.current.id;
            const currentIndex = itemIdsRef.current.indexOf(currentId);
            if (currentIndex === -1) return;

            const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

            if (nextIndex < 0 || nextIndex >= itemIdsRef.current.length) {
                return; // Reached the beginning or end of the list
            }

            const nextId = itemIdsRef.current[nextIndex];
            const route = baseRouteRef.current;

            try {
                let newItem: Lesson | Figure | undefined;
                let newParentLesson: Lesson | undefined;

                if (route === '/lessons') {
                    const lessons = await dataService.getLessons();
                    newItem = lessons.find(l => l.id === nextId);
                    newParentLesson = newItem as Lesson;
                } else { // '/figures'
                    const [figures, lessons] = await Promise.all([dataService.getFigures(), dataService.getLessons()]);
                    newItem = figures.find(f => f.id === nextId);
                    if (newItem) {
                        newParentLesson = lessons.find(l => l.id === (newItem as Figure).lessonId);
                    }
                }

                if (!newItem || !newParentLesson || !videoRef.current) return;

                const currentParentLessonId = currentLessonForVideoRef.current.id;
                
                currentItemRef.current = newItem; // Update current item ref

                if (currentParentLessonId !== newParentLesson.id) {
                    // Load new video source if the parent lesson is different
                    const newVideoUrl = await dataService.getVideoObjectUrl(newParentLesson);
                    dataService.revokeVideoObjectUrl(currentLessonForVideoRef.current.videoId); // Clean up old video URL
                    currentLessonForVideoRef.current = newParentLesson; // Update parent lesson ref
                    videoRef.current.src = newVideoUrl;
                } else {
                    // Same video, just seek
                    videoRef.current.currentTime = (newItem.startTime || 0) / 1000;
                    videoRef.current.play().catch(e => console.warn("Autoplay was prevented", e));
                }
            } catch (err) {
                console.error("Failed to navigate to item:", err);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') navigateToItem('next');
            else if (e.key === 'ArrowLeft') navigateToItem('prev');
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length > 0) {
                touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (!touchStartRef.current || e.changedTouches.length === 0) return;
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const diffX = touchStartRef.current.x - endX;
            const diffY = touchStartRef.current.y - endY;

            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) { // Horizontal swipe
                if (diffX > 0) navigateToItem('next'); // Swipe left
                else navigateToItem('prev'); // Swipe right
            }
            touchStartRef.current = null;
        };

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
                document.removeEventListener('keydown', handleKeyDown);
                videoElem.removeEventListener('touchstart', handleTouchStart);
                videoElem.removeEventListener('touchend', handleTouchEnd);
                
                videoElem.pause();
                videoElem.src = '';
                
                if (currentLessonForVideoRef.current) {
                    dataService.revokeVideoObjectUrl(currentLessonForVideoRef.current.videoId);
                }

                if (videoElem.parentNode) {
                    videoElem.parentNode.removeChild(videoElem);
                }
                videoRef.current = null;
                currentItemRef.current = null;
                currentLessonForVideoRef.current = null;

                onExitRef.current?.();
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
        document.addEventListener('keydown', handleKeyDown);
        video.addEventListener('touchstart', handleTouchStart);
        video.addEventListener('touchend', handleTouchEnd);


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
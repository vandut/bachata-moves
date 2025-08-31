import React, { useState, useCallback, useEffect } from 'react';

interface UseTimelineScrubberProps {
    timelineRef: React.RefObject<HTMLDivElement>;
    videoRef: React.RefObject<HTMLVideoElement>;
    videoDurationMs: number;
    formData: { startTime: number; endTime: number; };
    // FIX: Correctly type the `setFormData` parameter to accept a function that receives the previous state. This resolves a
    // TypeScript error in `EditorScreen` by matching the type signature provided by React's `useState` hook.
    setFormData: React.Dispatch<React.SetStateAction<any>>;
    setCurrentTimeMs: React.Dispatch<React.SetStateAction<number>>;
}

export const useTimelineScrubber = ({
    timelineRef,
    videoRef,
    videoDurationMs,
    formData,
    setFormData,
    setCurrentTimeMs
}: UseTimelineScrubberProps) => {
    const [draggingElement, setDraggingElement] = useState<'start' | 'end' | 'scrub' | null>(null);

    const getTimeFromPosition = useCallback((clientX: number) => {
        if (!timelineRef.current || videoDurationMs === 0) return 0;
        const rect = timelineRef.current.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
        return (offsetX / rect.width) * videoDurationMs;
    }, [timelineRef, videoDurationMs]);

    const handleDragMove = useCallback((clientX: number, element: 'start' | 'end' | 'scrub') => {
        if (!videoRef.current) return;
        const newTimeMs = getTimeFromPosition(clientX);
        
        const seekVideoTo = (timeMs: number) => {
            if (videoRef.current) {
                videoRef.current.currentTime = timeMs / 1000;
                setCurrentTimeMs(timeMs);
            }
        };

        if (element === 'scrub') {
            const clampedTime = Math.max(formData.startTime, Math.min(newTimeMs, formData.endTime));
            seekVideoTo(clampedTime);
        } else if (element === 'start') {
            const clampedTime = Math.max(0, Math.min(newTimeMs, formData.endTime));
            setFormData(prev => ({ ...prev, startTime: clampedTime }));
            seekVideoTo(clampedTime);
        } else if (element === 'end') {
            const clampedTime = Math.max(formData.startTime, Math.min(newTimeMs, videoDurationMs));
            setFormData(prev => ({ ...prev, endTime: clampedTime }));
            seekVideoTo(clampedTime);
        }
    }, [getTimeFromPosition, formData.startTime, formData.endTime, videoDurationMs, videoRef, setFormData, setCurrentTimeMs]);
    
    const handleDragEnd = useCallback(() => setDraggingElement(null), []);

    useEffect(() => {
        if (!draggingElement) return;
        const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, draggingElement);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', handleDragEnd);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [draggingElement, handleDragMove, handleDragEnd]);
    
    const onTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        setDraggingElement('scrub');
        handleDragMove(e.clientX, 'scrub');
    };

    const onHandleMouseDown = (e: React.MouseEvent, handle: 'start' | 'end') => {
        e.stopPropagation();
        setDraggingElement(handle);
    };

    return { draggingElement, onTimelineMouseDown, onHandleMouseDown };
};
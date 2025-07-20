import React, { useRef, useCallback, useState } from 'react';

interface CustomSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (newValue: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  'aria-label': string;
}

const CustomSlider: React.FC<CustomSliderProps> = ({ 
  min, 
  max, 
  value, 
  onChange, 
  onDragStart, 
  onDragEnd, 
  'aria-label': ariaLabel 
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const getValueFromPosition = useCallback((clientX: number) => {
    if (!sliderRef.current) return min;

    const rect = sliderRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = rect.width > 0 ? offsetX / rect.width : 0;
    const range = max - min;
    const newValue = min + percentage * range;
    return Math.max(min, Math.min(newValue, max));
  }, [min, max]);

  const handleInteraction = useCallback((clientX: number) => {
    const newValue = getValueFromPosition(clientX);
    onChange(newValue);
  }, [getValueFromPosition, onChange]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    handleInteraction(event.clientX);
  }, [handleInteraction]);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    handleInteraction(event.touches[0].clientX);
  }, [handleInteraction]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    onDragEnd?.();
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove, onDragEnd]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd?.();
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('touchend', handleTouchEnd);
  }, [handleTouchMove, onDragEnd]);
  
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    onDragStart?.();
    handleInteraction(event.clientX);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [handleInteraction, handleMouseMove, handleMouseUp, onDragStart]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(true);
    onDragStart?.();
    handleInteraction(event.touches[0].clientX);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
  }, [handleInteraction, handleTouchMove, handleTouchEnd, onDragStart]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // A reasonable step value, e.g., 1% of the total range.
    const step = (max > min) ? (max - min) / 100 : 1; 
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onChange(Math.max(min, value - step));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onChange(Math.min(max, value + step));
    }
  };

  const progressPercentage = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div
      ref={sliderRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onKeyDown={handleKeyDown}
      className="relative w-full h-5 flex items-center cursor-pointer group focus:outline-none"
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={ariaLabel}
      tabIndex={0}
    >
      {/* Track */}
      <div className="relative w-full h-1 bg-gray-500 rounded-full">
        {/* Progress bar */}
        <div
          className="absolute h-full bg-white rounded-full"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      {/* Thumb */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-150 ease-in-out ${
          isDragging
            ? 'scale-110'
            : 'scale-0 group-hover:scale-110 group-focus:scale-110'
        }`}
        style={{ left: `calc(${progressPercentage}% - 8px)` }}
      >
        <span
          className={`absolute -inset-2 rounded-full transition-colors ${
            isDragging ? 'bg-gray-400/50' : 'group-focus:bg-gray-400/50'
          }`}
        ></span>
      </div>
    </div>
  );
};

export default CustomSlider;
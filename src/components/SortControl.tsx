import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../contexts/I18nContext';

interface SortOption {
  value: string;
  label: string;
}

interface SortControlProps {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
  isMobile?: boolean;
}

const SortControl: React.FC<SortControlProps> = ({ options, value, onChange, isMobile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const selectedLabel = options.find(opt => opt.value === value)?.label || t('sort.sort');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (newValue: string) => {
    onChange(newValue);
    setIsOpen(false);
  };

  const buttonClass = isMobile
    ? "inline-flex items-center justify-center w-10 h-10 rounded-md border border-gray-300 shadow-sm bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
    : "inline-flex items-center justify-center rounded-md border border-gray-300 shadow-sm px-4 h-10 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500";

  return (
    <div className="relative inline-block text-left" ref={wrapperRef}>
      <div>
        <button
          type="button"
          className={buttonClass}
          id="menu-button"
          aria-expanded={isOpen}
          aria-haspopup="true"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={t('sort.sort')}
        >
          {isMobile ? (
            <i className="material-icons" aria-hidden="true">swap_vert</i>
          ) : (
            <>
              <i className="material-icons -ml-1 mr-2 text-[20px]" aria-hidden="true">swap_vert</i>
              {selectedLabel}
              <i className="material-icons -mr-1 ml-2 text-[20px]" aria-hidden="true">arrow_drop_down</i>
            </>
          )}
        </button>
      </div>

      {isOpen && (
        <div
          className="origin-top-right absolute right-0 mt-2 w-auto min-w-full rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="menu-button"
        >
          <div className="py-1" role="none">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`${
                  value === option.value ? 'font-bold text-blue-600' : 'text-gray-700'
                } block w-full text-left px-4 py-2 text-sm hover:bg-gray-100`}
                role="menuitem"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SortControl;
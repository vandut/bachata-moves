

import React from 'react';

interface MobileTopNavProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  disabled?: boolean;
}

const MobileTopNav: React.FC<MobileTopNavProps> = ({ title, onBack, rightAction }) => {
  return (
    <header className="flex-shrink-0 flex items-center h-16 px-4 bg-white border-b border-gray-200 shadow-sm">
      <div className="w-1/5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 text-gray-700 hover:bg-gray-100 rounded-full"
            aria-label="Go back"
          >
            <i className="material-icons">arrow_back</i>
          </button>
        )}
      </div>
      <div className="w-3/5 text-center">
        <h1 className="text-lg font-semibold text-gray-800 truncate">{title}</h1>
      </div>
      <div className="w-1/5 flex justify-end">
        {rightAction}
      </div>
    </header>
  );
};

export default MobileTopNav;
import React, { useEffect, useRef } from 'react';

interface ContextMenuAction {
  label: string;
  onClick: () => void;
  isDestructive?: boolean;
  icon?: string;
}

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  actions: ContextMenuAction[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ isOpen, onClose, position, actions }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    // Using `true` for capture phase to catch scrolls on any element.
    const handleScroll = () => {
        onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, onClose]);


  if (!isOpen) {
    return null;
  }

  // Adjust position to ensure the menu doesn't render off-screen
  const adjustedPosition = { ...position };
  const menuWidth = 192; // w-48
  const menuHeight = actions.length * 44; // Approx height
  if (position.x + menuWidth > window.innerWidth) {
    adjustedPosition.x = window.innerWidth - menuWidth - 10;
  }
  if (position.y + menuHeight > window.innerHeight) {
    adjustedPosition.y = window.innerHeight - menuHeight - 10;
  }


  return (
    <div
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-2xl py-2 w-48 z-50 animate-fade-in-fast"
      style={{ top: adjustedPosition.y, left: adjustedPosition.x }}
      role="menu"
      aria-orientation="vertical"
    >
      <ul className="list-none m-0 p-0">
        {actions.map((action, index) => (
          <li key={index} role="none">
            <button
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
                onClose();
              }}
              className={`flex items-center w-full text-left px-4 py-3 text-sm transition-colors duration-150
                ${action.isDestructive
                  ? 'text-red-600 hover:bg-red-100'
                  : 'text-gray-800 hover:bg-gray-100'
                }`
              }
              role="menuitem"
            >
              {action.icon && <i className="material-icons mr-3 text-lg">{action.icon}</i>}
              <span className="flex-grow">{action.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <style>{`
        @keyframes fade-in-fast {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in-fast {
          animation: fade-in-fast 0.1s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default ContextMenu;

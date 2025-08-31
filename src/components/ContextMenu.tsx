import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from '../contexts/I18nContext';

export interface ContextMenuAction {
  label: string;
  onClick?: () => void | Promise<void>;
  isDestructive?: boolean;
  icon?: string;
  submenu?: ContextMenuAction[];
  isChecked?: boolean;
}

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  actions: ContextMenuAction[];
  isMobile?: boolean;
}

// Submenu for Desktop
const DesktopSubMenu = React.forwardRef<HTMLDivElement, {
  actions: ContextMenuAction[];
  parentItemRef: HTMLLIElement | null;
  onClose: () => void;
  onMouseEnter: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave: React.MouseEventHandler<HTMLDivElement>;
}>(({ actions, parentItemRef, onClose, onMouseEnter, onMouseLeave }, ref) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (parentItemRef) {
      const parentRect = parentItemRef.getBoundingClientRect();
      const menuWidth = 192; // w-48
      let left = parentRect.right;
      if (left + menuWidth > window.innerWidth) {
        left = parentRect.left - menuWidth;
      }
      setPosition({ top: parentRect.top, left });
    }
  }, [parentItemRef]);

  const handleActionClick = async (action: ContextMenuAction) => {
    if (action.onClick) {
      await action.onClick();
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed bg-white rounded-lg shadow-2xl py-2 w-48 z-[51] animate-fade-in-fast" // z-index higher than main menu
      style={{ top: position.top, left: position.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="menu"
    >
      <ul className="list-none m-0 p-0">
        {actions.map((action, index) => (
          <li key={index} role="none">
            <button
              type="button"
              onClick={() => handleActionClick(action)}
              disabled={action.submenu?.length === 0}
              className={`w-full text-left px-4 py-2 text-sm flex items-center transition-colors rounded-md ${
                action.isChecked ? 'font-semibold text-blue-600' : ''
              } ${
                action.isDestructive
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-100'
              } disabled:text-gray-400 disabled:cursor-not-allowed`}
              role="menuitem"
            >
              <span className="flex-grow truncate">{action.label}</span>
              {action.isChecked && <i className="material-icons text-lg text-blue-600 ml-2">check</i>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});

const ContextMenu: React.FC<ContextMenuProps> = ({ isOpen, onClose, position, actions, isMobile }) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubMenu, setActiveSubMenu] = useState<ContextMenuAction[] | null>(null);
  const parentItemRef = useRef<HTMLLIElement | null>(null);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const subMenuTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveSubMenu(null);
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isClickOutside =
        menuRef.current && !menuRef.current.contains(target) &&
        (!subMenuRef.current || !subMenuRef.current.contains(target));
      
      if (isClickOutside) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleActionClick = async (action: ContextMenuAction) => {
    if (action.onClick) {
      await action.onClick();
    }
    onClose();
  };

  const handleMouseEnterItem = (action: ContextMenuAction, e: React.MouseEvent<HTMLLIElement>) => {
    if (subMenuTimeoutRef.current) clearTimeout(subMenuTimeoutRef.current);
    if (action.submenu && action.submenu.length > 0) {
      setActiveSubMenu(action.submenu);
      parentItemRef.current = e.currentTarget;
    } else {
      setActiveSubMenu(null);
    }
  };

  const handleMouseLeaveItem = () => {
    subMenuTimeoutRef.current = window.setTimeout(() => {
      setActiveSubMenu(null);
    }, 200);
  };
  
  const handleSubMenuMouseEnter = () => {
    if (subMenuTimeoutRef.current) clearTimeout(subMenuTimeoutRef.current);
  };

  const handleSubMenuMouseLeave = () => {
     subMenuTimeoutRef.current = window.setTimeout(() => {
        setActiveSubMenu(null);
    }, 200);
  };

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex flex-col justify-end animate-fade-in-fast" onClick={onClose}>
        <div
          ref={menuRef}
          className="bg-white rounded-t-2xl p-2 pb-4 shadow-lg animate-slide-up-fast"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto my-2" />
          <ul className="list-none m-0 p-0 max-h-[60vh] overflow-y-auto">
            {actions.map((action, index) => (
              <li key={index}>
                <button
                  onClick={() => handleActionClick(action)}
                  className={`w-full text-left px-4 py-3 text-lg flex items-center transition-colors rounded-lg ${
                    action.isDestructive ? 'text-red-600' : 'text-gray-800'
                  }`}
                >
                  {action.icon && <i className="material-icons mr-4">{action.icon}</i>}
                  <span className="flex-grow">{action.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Desktop
  const menuPositionStyle = {
    top: position.y,
    left: position.x,
  };

  return (
    <>
      <div
        ref={menuRef}
        className="fixed bg-white rounded-lg shadow-2xl py-2 w-56 z-50 animate-fade-in-fast"
        style={menuPositionStyle}
        onMouseLeave={handleMouseLeaveItem}
        role="menu"
      >
        <ul className="list-none m-0 p-0">
          {actions.map((action, index) => (
            <li
              key={index}
              role="none"
              onMouseEnter={(e) => handleMouseEnterItem(action, e)}
            >
              <button
                type="button"
                onClick={() => handleActionClick(action)}
                disabled={!action.onClick && (!action.submenu || action.submenu.length === 0)}
                className={`w-full text-left px-4 py-2 text-sm flex items-center transition-colors rounded-md ${
                  action.isDestructive
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-100'
                } disabled:text-gray-400 disabled:cursor-not-allowed`}
                role="menuitem"
              >
                {action.icon && <i className="material-icons mr-3 text-lg">{action.icon}</i>}
                <span className="flex-grow truncate">{action.label}</span>
                {action.submenu && action.submenu.length > 0 && <i className="material-icons text-lg">chevron_right</i>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {activeSubMenu && (
        <DesktopSubMenu
          ref={subMenuRef}
          actions={activeSubMenu}
          parentItemRef={parentItemRef.current}
          onClose={onClose}
          onMouseEnter={handleSubMenuMouseEnter}
          onMouseLeave={handleSubMenuMouseLeave}
        />
      )}
    </>
  );
};

export default ContextMenu;
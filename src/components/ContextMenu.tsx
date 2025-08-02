import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from '../App';

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
          <MenuItem
            key={index}
            action={action}
            onActionClick={handleActionClick}
            isMobile={false}
          />
        ))}
      </ul>
    </div>
  );
});

// Unified MenuItem component
const MenuItem = React.forwardRef<HTMLLIElement, {
  action: ContextMenuAction;
  onActionClick: (action: ContextMenuAction) => void | Promise<void>;
  onSubmenuOpen?: () => void;
  isMobile: boolean;
}>((props, ref) => {
  const { action, onActionClick, onSubmenuOpen, isMobile } = props;
  const { label, isDestructive, icon, submenu, isChecked } = action;

  if (label === '-') {
    return <li role="separator" className="border-t border-gray-200 my-1"></li>;
  }

  // On desktop, items that open a submenu on hover should not be clickable.
  const isDisabled = !isMobile && !!submenu;

  return (
    <li role="none" ref={ref} onMouseEnter={!isMobile && onSubmenuOpen ? onSubmenuOpen : undefined}>
      <button
        onClick={() => onActionClick(action)}
        disabled={isDisabled}
        className={`flex items-center w-full text-left px-4 py-3 text-sm transition-colors duration-150
          ${isDestructive ? 'text-red-600 hover:bg-red-100' : 'text-gray-800 hover:bg-gray-100'}
          ${isDisabled ? 'cursor-default' : ''}`
        }
        role="menuitem"
      >
        <div className="w-6 flex-shrink-0">
          {isChecked && <i className="material-icons text-lg text-blue-600">check</i>}
        </div>
        {icon && <i className="material-icons mr-3 text-lg">{icon}</i>}
        <span className="flex-grow">{label}</span>
        {submenu && <i className="material-icons ml-auto text-lg">chevron_right</i>}
      </button>
    </li>
  );
});

// Main ContextMenu Component
const ContextMenu: React.FC<ContextMenuProps> = ({ isOpen, onClose, position, actions, isMobile }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // --- Mobile State ---
  const [menuStack, setMenuStack] = useState<ContextMenuAction[][]>([actions]);

  // --- Desktop State ---
  const [activeSubmenu, setActiveSubmenu] = useState<{ action: ContextMenuAction; parentRef: HTMLLIElement | null } | null>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const openSubmenuTimer = useRef<number | undefined>(undefined);
  const closeSubmenuTimer = useRef<number | undefined>(undefined);

  // Reset state when menu is opened or actions change
  useEffect(() => {
    if (isOpen) {
      setMenuStack([actions]);
      setActiveSubmenu(null);
    }
  }, [isOpen, actions]);
  
  // Close on click outside or scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Close if the click is outside both the main menu and the submenu (if it exists)
      if (!menuRef.current?.contains(target) && !submenuRef.current?.contains(target)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      if (openSubmenuTimer.current) clearTimeout(openSubmenuTimer.current);
      if (closeSubmenuTimer.current) clearTimeout(closeSubmenuTimer.current);
    };
  }, [isOpen, onClose]);

  const handleActionClick = useCallback(async (action: ContextMenuAction) => {
    if (isMobile && action.submenu) {
      setMenuStack(prev => [...prev, action.submenu!]);
    } else {
      if (action.onClick) {
        await action.onClick();
      }
      onClose();
    }
  }, [isMobile, onClose]);

  const handleBack = useCallback(() => {
    setMenuStack(prev => prev.slice(0, -1));
  }, []);

  const openDesktopSubmenu = useCallback((action: ContextMenuAction, index: number) => {
    if (!action.submenu) return;
    if (closeSubmenuTimer.current) clearTimeout(closeSubmenuTimer.current);
    openSubmenuTimer.current = window.setTimeout(() => {
      setActiveSubmenu({ action, parentRef: itemRefs.current[index] });
    }, 150);
  }, []);
  
  const closeDesktopSubmenu = useCallback((_event?: React.MouseEvent) => {
    if (openSubmenuTimer.current) clearTimeout(openSubmenuTimer.current);
    closeSubmenuTimer.current = window.setTimeout(() => {
      setActiveSubmenu(null);
    }, 200);
  }, []);

  if (!isOpen) return null;

  // --- Positioning ---
  const menuWidth = isMobile ? 256 : 192; // w-64 vs w-48
  const currentActions = menuStack[menuStack.length - 1] || [];
  const menuHeight = currentActions.reduce((h, a) => h + (a.label === '-' ? 9 : 44), 0);
  const adjustedPosition = { ...position };
  if (position.x + menuWidth > window.innerWidth) {
    adjustedPosition.x = window.innerWidth - menuWidth - 10;
  }
  if (position.y + menuHeight > window.innerHeight) {
    adjustedPosition.y = window.innerHeight - menuHeight - 10;
  }
  
  const parentMenu = menuStack.length > 1 ? menuStack[menuStack.length - 2] : null;
  const parentAction = parentMenu?.find(a => a.submenu === currentActions);

  return (
    <>
      <div
        ref={menuRef}
        className="fixed bg-white rounded-lg shadow-2xl py-2 z-50 animate-fade-in-fast"
        style={{ top: adjustedPosition.y, left: adjustedPosition.x, width: `${menuWidth}px` }}
        role="menu"
        aria-orientation="vertical"
        onMouseLeave={!isMobile ? closeDesktopSubmenu : undefined}
      >
        {isMobile && parentAction && (
          <div className="flex items-center px-2 pb-2 border-b border-gray-200 mb-2">
            <button
              onClick={handleBack}
              className="p-2 text-gray-700 hover:bg-gray-100 rounded-full"
              aria-label={t('common.goBack')}
            >
              <i className="material-icons">arrow_back</i>
            </button>
            <h3 className="ml-2 font-semibold text-gray-800">{parentAction.label}</h3>
          </div>
        )}
        <ul className="list-none m-0 p-0">
          {currentActions.map((action, index) => (
            <MenuItem
              key={index}
              ref={el => { if (!isMobile) itemRefs.current[index] = el; }}
              action={action}
              onActionClick={handleActionClick}
              onSubmenuOpen={() => openDesktopSubmenu(action, index)}
              isMobile={!!isMobile}
            />
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

      {!isMobile && activeSubmenu?.action.submenu && (
        <DesktopSubMenu
          ref={submenuRef}
          actions={activeSubmenu.action.submenu}
          parentItemRef={activeSubmenu.parentRef}
          onClose={onClose}
          onMouseEnter={() => {
            if (closeSubmenuTimer.current) clearTimeout(closeSubmenuTimer.current);
          }}
          onMouseLeave={closeDesktopSubmenu}
        />
      )}
    </>
  );
};

export default ContextMenu;

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { NavItem } from '../types';

interface MobileBottomNavProps {
  navItems: NavItem[];
  hasError: boolean;
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ navItems, hasError }) => {
  const location = useLocation();
  const activePath = location.pathname;

  return (
    <div
      className="bg-white border-t border-gray-200 shadow-[0_-1px_10px_rgba(0,0,0,0.05)] flex-shrink-0"
      style={{ userSelect: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <nav className="flex justify-around">
        {navItems.map((item) => {
            const isActive = activePath.startsWith(item.path);
            const isSettingsWithError = item.path === '/settings' && hasError;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex-1 flex flex-col items-center justify-center py-2 transition-colors duration-200 relative ${
                  isActive
                    ? 'text-blue-600'
                    : isSettingsWithError ? 'text-red-600' : 'text-gray-500 hover:text-blue-500'
                }`}
              >
                <i className={`material-icons ${isSettingsWithError && !isActive ? 'animate-pulse' : ''}`}>{item.icon}</i>
                <span className="text-xs mt-1">{item.label}</span>
              </Link>
            )
        })}
      </nav>
    </div>
  );
};

export default MobileBottomNav;
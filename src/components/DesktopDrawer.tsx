import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { NavItem } from '../types';
import { isDev } from '../utils/logger';
import { APP_VERSION } from '../version';

export const DESKTOP_DRAWER_WIDTH = 240;

interface DesktopDrawerProps {
  navItems: NavItem[];
  hasError: boolean;
}

const DesktopDrawer: React.FC<DesktopDrawerProps> = ({ navItems, hasError }) => {
  const location = useLocation();
  const activePath = location.pathname;
  const devMode = isDev();

  return (
    <div
      className="bg-white border-r border-gray-200 h-full flex flex-col shadow-lg flex-shrink-0"
      style={{ width: DESKTOP_DRAWER_WIDTH, userSelect: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-center h-20 border-b border-gray-200 flex-shrink-0">
        <i className="material-icons text-blue-600 text-3xl mr-2">music_note</i>
        <h1 className="text-2xl font-bold text-gray-800">Bachata</h1>
        {devMode && (
            <span className="ml-2 bg-yellow-200 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full">DEV</span>
        )}
      </div>
      <nav className="flex-grow p-4 overflow-y-auto">
        <ul>
          {navItems.map((item) => {
            const isSettingsWithError = item.path === '/settings' && hasError;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center w-full text-left p-4 my-1 rounded-lg transition-colors duration-200 ${
                    activePath.startsWith(item.path)
                      ? 'bg-blue-100 text-blue-600 font-semibold'
                      : `text-gray-600 hover:bg-gray-100 ${isSettingsWithError ? 'text-red-600' : ''}`
                  }`}
                >
                  <i className={`material-icons mr-4 ${isSettingsWithError ? 'text-red-500 animate-pulse' : ''}`}>{item.icon}</i>
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="flex-shrink-0 p-4 border-t border-gray-200">
        <p className="text-xs text-center text-gray-400">Version: {APP_VERSION}</p>
      </div>
    </div>
  );
};

export default DesktopDrawer;

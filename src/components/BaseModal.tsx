import React, { useState, useEffect, useRef } from 'react';
import MobileTopNav from './MobileTopNav';
import type { ModalAction } from '../types';
import { useTranslation } from '../contexts/I18nContext';

interface BaseModalProps {
  onClose: () => void;
  primaryAction?: ModalAction;
  secondaryActions?: ModalAction[];
  title: string;
  children: React.ReactNode;
  isMobile: boolean;
  modalName: string;
  desktopWidth?: string;
  desktopHeight?: string;
  desktopStyle?: React.CSSProperties;
  error?: string | null;
  fillHeight?: boolean;
}

const BaseModal: React.FC<BaseModalProps> = ({
  onClose,
  primaryAction,
  secondaryActions = [],
  title,
  children,
  isMobile,
  modalName,
  desktopWidth = 'max-w-lg',
  desktopHeight = '',
  desktopStyle,
  error,
  fillHeight = false,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close modal on escape key press
  useEffect(() => {
    if (isMobile) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isMobile]);
  
  // Close mobile menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const ErrorDisplay = error ? (
    <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
      <p>{error}</p>
    </div>
  ) : null;
  
  const renderActionButton = (action: ModalAction, isPrimary: boolean, key?: React.Key) => {
    const { label, onClick, isDestructive, disabled, isLoading, loadingLabel } = action;
    const buttonLabel = isLoading ? (loadingLabel || t('common.loading')) : label;
    const isDisabled = disabled || isLoading;
    const dataAttrs = isPrimary ? { 'data-action': 'modal-primary-action' } : { 'data-component': 'modal-secondary-action' };


    if (isMobile && !isPrimary) { // Secondary actions in mobile menu
      return (
        <button
          key={key}
          type="button"
          onClick={() => { onClick(); setMenuOpen(false); }}
          disabled={isDisabled}
          className={`block w-full text-left px-4 py-2 text-sm ${
            isDestructive ? 'text-red-700' : 'text-gray-700'
          } hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed`}
          {...dataAttrs}
        >
          {buttonLabel}
        </button>
      );
    }
    
    // Base classes
    let classes = 'px-4 py-2 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:cursor-not-allowed ';
    
    // Primary vs Secondary styles
    if (isPrimary) {
      classes += isDestructive
        ? 'text-white bg-red-600 hover:bg-red-700 border-transparent focus:ring-red-500 disabled:bg-red-400'
        : 'text-white bg-blue-600 hover:bg-blue-700 border-transparent focus:ring-blue-500 disabled:bg-blue-400';
    } else { // Secondary or Cancel button style
      classes += isDestructive
        ? 'text-red-700 bg-white border-red-300 hover:bg-red-50 focus:ring-red-500 disabled:opacity-50'
        : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 focus:ring-blue-500 disabled:opacity-50';
    }

    if(isMobile && isPrimary) { // Primary action on mobile is just text
        return (
            <button
                type="button"
                onClick={onClick}
                disabled={isDisabled}
                className="px-4 py-1.5 border border-transparent rounded-md text-sm font-medium text-blue-600 hover:text-blue-500 focus:outline-none disabled:text-gray-400 disabled:cursor-not-allowed font-semibold"
                {...dataAttrs}
            >
                {buttonLabel}
            </button>
        )
    }

    return (
      <button key={key} type="button" onClick={onClick} disabled={isDisabled} className={classes} {...dataAttrs}>
        {buttonLabel}
      </button>
    );
  };
  
  // --- Mobile Rendering ---
  if (isMobile) {
    const rightAction = (
      <div className="flex items-center space-x-1">
        {primaryAction && renderActionButton(primaryAction, true)}
        {secondaryActions.length > 0 && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(prev => !prev)}
              className="p-2 text-gray-700 hover:bg-gray-100 rounded-full"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-label={t('common.moreActions')}
            >
              <i className="material-icons">more_vert</i>
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-20"
                role="menu"
                aria-orientation="vertical"
              >
                <div className="py-1" role="none">
                  {secondaryActions.map((action, index) => renderActionButton(action, false, `sec-action-${index}`))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
    
    return (
      <div className="flex flex-col h-full" data-modal-name={modalName}>
        <MobileTopNav
          title={title}
          onBack={onClose}
          rightAction={rightAction}
        />
        <div className="p-4 flex-1 min-h-0">
          <div className="space-y-5 h-full">
            {children}
          </div>
          {ErrorDisplay && <div className="mt-4">{ErrorDisplay}</div>}
        </div>
      </div>
    );
  }

  // --- Desktop Rendering ---
  const widthClasses = desktopWidth 
    ? (desktopWidth.includes('w-auto') ? desktopWidth : `w-full ${desktopWidth}`) 
    : '';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="base-modal-title-desktop"
      data-modal-name={modalName}
    >
      <div
        className={`bg-white rounded-lg shadow-xl ${widthClasses} ${desktopHeight} flex flex-col`}
        style={desktopStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <h2 id="base-modal-title-desktop" className="text-2xl font-bold text-gray-800">{title}</h2>
        </div>
        <div className={`p-6 space-y-5 ${fillHeight ? 'flex-1 overflow-y-hidden' : 'overflow-y-auto'}`}>
          {children}
        </div>

        {ErrorDisplay && <div className="px-6 pb-4 flex-shrink-0">{ErrorDisplay}</div>}

        <div className="p-6 bg-gray-50 rounded-b-lg flex justify-between items-center flex-shrink-0">
          {/* Secondary Actions (Left) */}
          <div className="flex justify-start space-x-3">
            {secondaryActions.map((action, index) => renderActionButton(action, false, `sec-action-${index}`))}
          </div>
          {/* Primary & Cancel (Right) */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              data-action="modal-close"
              className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={primaryAction?.isLoading}
            >
              {t('common.cancel')}
            </button>
            {primaryAction && renderActionButton(primaryAction, true)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BaseModal;
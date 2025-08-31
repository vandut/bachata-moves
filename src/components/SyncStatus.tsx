import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../contexts/I18nContext';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import type { SyncTask } from '../services/SyncQueueService';

const SyncStatus: React.FC = () => {
    const { t } = useTranslation();
    const { syncQueue, isSyncActive, isSignedIn } = useGoogleDrive();
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getTaskName = (task: SyncTask) => {
        if (task.type === 'sync-settings') {
            const typeName = t(`sync.type_${task.payload.type}`);
            return t('sync.task_sync_settings', { type: typeName });
        }
        return task.type;
    };

    const getStatusName = (status: SyncTask['status']) => {
        switch (status) {
            case 'pending': return t('sync.statusPending');
            case 'in-progress': return t('sync.statusInProgress');
            case 'error': return t('sync.statusError');
        }
    };
    
    const hasError = syncQueue.some(task => task.status === 'error');
    
    let iconName = 'sync';
    let iconClass = '';

    if (!isSignedIn) {
        iconName = 'sync_disabled';
    } else if (hasError) {
        if (isSyncActive) {
            // Errors exist, but other tasks are still running. Show a spinning red icon.
            iconName = 'sync';
            iconClass = 'animate-spin-reverse text-red-600';
        } else {
            // Only error tasks are left in the queue. Show a static error icon.
            iconName = 'sync_problem';
            iconClass = 'text-red-600';
        }
    } else if (isSyncActive) {
        // No errors, just syncing normally.
        iconName = 'sync';
        iconClass = 'animate-spin-reverse';
    }

    return (
        <div className="relative inline-block text-left" ref={wrapperRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                disabled={!isSignedIn}
                className="inline-flex items-center justify-center w-10 h-10 rounded-md border border-gray-300 shadow-sm bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('sync.syncButton')}
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                <i className={`material-icons ${iconClass}`}>{iconName}</i>
            </button>
            {isOpen && isSignedIn && (
                <div
                    className="origin-top-right absolute right-0 mt-2 w-72 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="menu-button"
                >
                    <div className="p-3 border-b border-gray-200">
                        <h3 className="text-base font-medium text-gray-900">{t('sync.syncStatus')}</h3>
                    </div>
                    <div className="py-2 max-h-60 overflow-y-auto" role="none">
                        {syncQueue.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500 text-center">{t('sync.noPendingTasks')}</div>
                        ) : (
                            syncQueue.map(task => (
                                <div key={task.id} className="px-3 py-2 flex justify-between items-center text-sm">
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-gray-800 truncate" title={getTaskName(task)}>{getTaskName(task)}</p>
                                        {task.status === 'error' && (
                                            <p className="text-red-600 text-xs truncate" title={task.error}>{task.error}</p>
                                        )}
                                    </div>
                                    <div className="ml-2 flex-shrink-0">
                                        {task.status === 'in-progress' && <i className="material-icons text-blue-500 animate-spin-reverse text-base">sync</i>}
                                        {task.status === 'pending' && <i className="material-icons text-gray-400 text-base">hourglass_empty</i>}
                                        {task.status === 'error' && <i className="material-icons text-red-500 text-base">error_outline</i>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SyncStatus;

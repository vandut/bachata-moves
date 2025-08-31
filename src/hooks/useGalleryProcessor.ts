import { useState, useEffect, useCallback } from 'react';
import { useSettings, type AppSettings } from '../contexts/SettingsContext';
import { useTranslation } from '../contexts/I18nContext';
import { localDatabaseService } from '../services/LocalDatabaseService';
import { galleryOrchestrationService, ProcessedGalleryData } from '../services/GalleryOrchestrationService';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { useLocation } from 'react-router-dom';
import type { Lesson, Figure } from '../types';

export const useGalleryProcessor = <T extends Lesson | Figure>(type: 'lesson' | 'figure') => {
    const { settings } = useSettings();
    const { locale } = useTranslation();
    const { isSignedIn, addTask } = useGoogleDrive();
    const location = useLocation();

    const [galleryData, setGalleryData] = useState<ProcessedGalleryData<T> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [dataVersion, setDataVersion] = useState(0);

    const refreshGallery = useCallback(() => {
        setDataVersion(v => v + 1);
    }, []);

    useEffect(() => {
        let isCancelled = false;
        setIsLoading(true);
        
        const processor = type === 'lesson'
            ? galleryOrchestrationService.getProcessedLessons.bind(galleryOrchestrationService)
            : galleryOrchestrationService.getProcessedFigures.bind(galleryOrchestrationService);
        
        (processor as (settings: AppSettings, locale: string) => Promise<ProcessedGalleryData<T>>)(settings, locale)
            .then(processedData => {
                if (isCancelled) return;
                
                setGalleryData(processedData);
                
                const currentPath = type === 'lesson' ? '/lessons' : '/figures';
                // FIX: Removed `processedData.totalItemCount > 0` condition. The sync should trigger
                // on a fresh install (where itemCount is 0) to pull data from the cloud.
                if (location.pathname === currentPath && isSignedIn && !location.state?.skipSync) {
                    addTask('sync-grouping-config', { type }, true);
                    addTask('sync-gallery', { type });
                }
            })
            .catch(console.error)
            .finally(() => {
                if (!isCancelled) setIsLoading(false);
            });

        return () => { isCancelled = true; };
    }, [settings, dataVersion, locale, location.pathname, isSignedIn, location.state, addTask, type]);

    useEffect(() => {
        const unsubscribe = localDatabaseService.subscribe(refreshGallery);
        return () => unsubscribe();
    }, [refreshGallery]);
    
    const filterOptions = galleryData?.filterOptions || { years: [], categories: [], schools: [], instructors: [] };

    return { galleryData, isLoading, filterOptions, refreshGallery };
};
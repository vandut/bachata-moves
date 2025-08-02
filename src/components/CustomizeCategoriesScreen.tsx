import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import BaseModal from './BaseModal';
import { useTranslation } from '../App';
import type { ModalAction } from '../types';

interface GalleryContext {
    isMobile: boolean;
}

const CustomizeCategoriesScreen: React.FC = () => {
    const navigate = useNavigate();
    const { isMobile } = useOutletContext<GalleryContext>();
    const { t } = useTranslation();

    const handleClose = () => navigate('/figures');
    
    // For now, save just closes the modal.
    const handleSave = () => handleClose();

    const primaryAction: ModalAction = {
        label: t('common.save'),
        onClick: handleSave,
    };

    return (
        <BaseModal
            onClose={handleClose}
            primaryAction={primaryAction}
            title={t('customizeGrouping.title')}
            isMobile={isMobile}
            desktopWidth="max-w-lg"
        >
            <div className="text-center p-8 bg-gray-100 rounded-lg">
                <i className="material-icons text-5xl text-gray-400 mb-4">construction</i>
                <p className="text-gray-600">{t('customizeGrouping.notImplemented')}</p>
            </div>
        </BaseModal>
    );
};

export default CustomizeCategoriesScreen;
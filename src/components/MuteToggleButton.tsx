import React from 'react';
import { useTranslation } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';

const MuteToggleButton: React.FC = () => {
    const { t } = useTranslation();
    const { settings, updateSettings } = useSettings();
    const { isMuted } = settings;

    const toggleMute = () => {
        updateSettings({ isMuted: !isMuted });
    };
    
    const label = isMuted ? t('common.unmute') : t('common.mute');

    return (
        <button
            onClick={toggleMute}
            className="inline-flex items-center justify-center w-10 h-10 rounded-md border border-gray-300 shadow-sm bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-label={label}
        >
            <i className="material-icons">{isMuted ? 'volume_off' : 'volume_up'}</i>
        </button>
    );
};

export default MuteToggleButton;
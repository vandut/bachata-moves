import React from 'react';
import { useVideoSettings } from '../contexts/VideoSettingsContext';
import { useTranslation } from '../App';

const MuteToggleButton: React.FC = () => {
    const { isMuted, setIsMuted } = useVideoSettings();
    const { t } = useTranslation();

    const toggleMute = () => {
        setIsMuted(prev => !prev);
    };
    
    const label = isMuted ? t('common.unmute') : t('common.mute');

    return (
        <button
            onClick={toggleMute}
            className="inline-flex items-center justify-center p-2 rounded-md border border-gray-300 shadow-sm bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-label={label}
        >
            <i className="material-icons">{isMuted ? 'volume_off' : 'volume_up'}</i>
        </button>
    );
};

export default MuteToggleButton;

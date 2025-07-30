import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

interface VideoSettingsContextType {
  isMuted: boolean;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  volume: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
}

const VideoSettingsContext = createContext<VideoSettingsContextType | undefined>(undefined);

const VIDEO_SETTINGS_KEY = 'bachata-moves-video-settings';

interface StoredSettings {
    isMuted: boolean;
    volume: number;
}

export const VideoSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
        const item = window.localStorage.getItem(VIDEO_SETTINGS_KEY);
        if (item) {
            const parsed = JSON.parse(item);
            return typeof parsed.isMuted === 'boolean' ? parsed.isMuted : false;
        }
    } catch (error) {
        console.warn("Could not load 'isMuted' setting from localStorage:", error);
    }
    return false; // Default to unmuted
  });

  const [volume, setVolume] = useState<number>(() => {
    try {
        const item = window.localStorage.getItem(VIDEO_SETTINGS_KEY);
        if (item) {
            const parsed = JSON.parse(item);
            const vol = parsed.volume;
            // Ensure volume is a valid number between 0 and 1
            return typeof vol === 'number' && vol >= 0 && vol <= 1 ? vol : 1;
        }
    } catch (error) {
        console.warn("Could not load 'volume' setting from localStorage:", error);
    }
    return 1; // Default to full volume
  });
  
  // Effect to save settings to localStorage whenever they change
  useEffect(() => {
    try {
      const settings: StoredSettings = { isMuted, volume };
      window.localStorage.setItem(VIDEO_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error("Error saving video settings to localStorage:", error);
    }
  }, [isMuted, volume]);

  const value = { isMuted, setIsMuted, volume, setVolume };

  return (
    <VideoSettingsContext.Provider value={value}>
      {children}
    </VideoSettingsContext.Provider>
  );
};

export const useVideoSettings = (): VideoSettingsContextType => {
  const context = useContext(VideoSettingsContext);
  if (context === undefined) {
    throw new Error('useVideoSettings must be used within a VideoSettingsProvider');
  }
  return context;
};

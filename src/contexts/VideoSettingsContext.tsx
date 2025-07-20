import React, { createContext, useState, useContext, ReactNode } from 'react';

interface VideoSettingsContextType {
  isMuted: boolean;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  volume: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
}

const VideoSettingsContext = createContext<VideoSettingsContextType | undefined>(undefined);

export const VideoSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);

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
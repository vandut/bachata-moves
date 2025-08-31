import React, { createContext, useContext, ReactNode, useCallback, useMemo } from 'react';
import { translations } from '../i18n';
import { useSettings } from './SettingsContext';

// --- I18N Provider and Hook ---
type Language = 'english' | 'polish';
type Locale = 'en-US' | 'pl-PL';

export interface I18nContextType {
  language: Language;
  locale: Locale;
  setLanguage: (lang: Language) => void;
  t: (key: string, options?: { [key: string]: string | number }) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const getNestedTranslation = (lang: Language, key: string): string | undefined => {
  return key.split('.').reduce((obj: any, k: string) => obj?.[k], translations[lang]);
};

export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings, updateSettings } = useSettings();

  const setLanguage = useCallback((lang: Language) => {
    updateSettings({ language: lang });
  }, [updateSettings]);

  const language = settings.language;
  
  const t = useCallback((key: string, options?: { [key: string]: string | number }): string => {
    let translation = getNestedTranslation(language, key);
    if (translation === undefined) {
      console.warn(`Translation key not found for language '${language}': ${key}. Falling back to English.`);
      translation = getNestedTranslation('english', key);
    }
    if (translation === undefined) {
      console.error(`Translation key not found in English fallback: ${key}`);
      return key;
    }
    if (options) {
      return Object.entries(options).reduce((str, [k, v]) => str.replace(`{${k}}`, String(v)), translation);
    }
    return translation;
  }, [language]);

  const locale: Locale = language === 'polish' ? 'pl-PL' : 'en-US';
  
  const value = useMemo(() => ({ 
    language, 
    locale, 
    setLanguage, 
    t, 
  }), [language, locale, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

import { useState, useEffect, useCallback } from 'react';
import { GOOGLE_CLIENT_ID } from '../config';

// TypeScript definitions for Google Identity Services
declare global {
  interface Window {
    google: any; 
  }
}

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const FILENAME = 'bachata-moves-data.json';
const LOCAL_STORAGE_TOKEN_KEY = 'google_access_token';
const LOCAL_STORAGE_PROFILE_KEY = 'google_user_profile';

export interface UserProfile {
  email: string;
  name: string;
  imageUrl: string;
}

export const useGoogleDrive = () => {
  const [isGisReady, setIsGisReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // This effect runs once on mount to restore the session from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    const storedProfileJSON = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);

    if (storedToken && storedProfileJSON) {
      const validateAndHydrate = async () => {
        // Optimistically set state to avoid UI flicker
        setIsSignedIn(true);
        setAccessToken(storedToken);
        try {
          setUserProfile(JSON.parse(storedProfileJSON));
        } catch (e) { /* ignore parse error */ }
        
        // Validate token by making a lightweight API call
        try {
          const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          if (!response.ok) {
            throw new Error('Token validation failed');
          }
          const profile = await response.json();
          const freshUserProfile = {
              email: profile.email,
              name: profile.name,
              imageUrl: profile.picture,
          };
          setUserProfile(freshUserProfile);
          localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(freshUserProfile));
        } catch (e) {
          // Token is invalid/expired, clear storage and state
          localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
          localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
          setAccessToken(null);
          setIsSignedIn(false);
          setUserProfile(null);
          setError('Your session has expired. Please sign in again.');
        }
      };
      validateAndHydrate();
    }
  }, []); // Run only once on mount

  const fetchUserProfile = useCallback(async (token: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch user profile');
      }
      const profile = await response.json();
      const newProfile = {
        email: profile.email,
        name: profile.name,
        imageUrl: profile.picture,
      };
      setUserProfile(newProfile);
      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newProfile));
    } catch (e: any) {
      console.error("Error fetching user profile", e);
      setError(`Could not fetch user profile. Error: ${e.message}`);
    }
  }, []);

  // Effect to initialize the Google Identity Services (GIS) client
  useEffect(() => {
    const gisInit = () => {
        try {
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: async (tokenResponse: any) => {
                    if (tokenResponse.error) {
                        setError(`Auth Error: ${tokenResponse.error_description || tokenResponse.error}`);
                        setAccessToken(null);
                        setIsSignedIn(false);
                        return;
                    }
                    const token = tokenResponse.access_token;
                    localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, token);
                    setAccessToken(token);
                    setIsSignedIn(true);
                    setError(null);
                    await fetchUserProfile(token);
                },
            });
            setTokenClient(client);
            setIsGisReady(true);
        } catch(e: any) {
            setError(`Google Auth init failed: ${e.message}`);
        }
    };
    
    const checkGis = setInterval(() => {
        if (typeof window.google !== 'undefined' && typeof window.google.accounts !== 'undefined') {
            clearInterval(checkGis);
            gisInit();
        }
    }, 100);

    return () => clearInterval(checkGis);
  }, [fetchUserProfile]);

  const signIn = () => {
    if (!tokenClient) {
        setError('Google Auth is not ready.');
        return;
    }
    setError(null);
    tokenClient.requestAccessToken({ prompt: '' });
  };

  const signOut = () => {
    if (accessToken) {
      // Revoke the token to effectively sign out
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
    localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
    setAccessToken(null);
    setIsSignedIn(false);
    setUserProfile(null);
    setError(null);
  };

  const findFileId = async (token: string): Promise<string | null> => {
    try {
      const queryParams = new URLSearchParams({
        spaces: 'appDataFolder',
        fields: 'files(id, name)',
        q: `name='${FILENAME}' and trashed=false`,
      });
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to search for file');
      }

      const data = await response.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
    } catch (e: any) {
       console.error("Error finding file", e);
       setError('Could not search for the file in Google Drive.');
       return null;
    }
  };

  const saveFile = async (content: object): Promise<boolean> => {
    setError(null);
    if (!isSignedIn || !accessToken) {
      setError('You must be signed in to save.');
      return false;
    }

    try {
      const fileId = await findFileId(accessToken);
      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      const metadata = {
        name: FILENAME,
        mimeType: 'application/json',
        // When creating a file, it must have 'appDataFolder' as a parent.
        ...(fileId ? {} : { parents: ['appDataFolder'] })
      };
      
      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(content, null, 2) +
        close_delim;
      
      const uploadUrl = fileId 
          ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart` 
          : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
      
      const method = fileId ? 'PATCH' : 'POST';
      
      const response = await fetch(uploadUrl, {
          method: method,
          headers: { 
            'Content-Type': `multipart/related; boundary="${boundary}"`,
            'Authorization': `Bearer ${accessToken}`
          },
          body: multipartRequestBody
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to save file');
      }

      return true;
    } catch (e: any) {
      console.error("Error saving file", e);
      setError('Failed to save the file to Google Drive.');
      return false;
    }
  };

  const loadFile = async (): Promise<object | null> => {
    setError(null);
     if (!isSignedIn || !accessToken) {
      setError('You must be signed in to load.');
      return null;
    }

    try {
      const fileId = await findFileId(accessToken);
      if (!fileId) {
        setError('No saved state found in Google Drive.');
        return null;
      }
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to load file');
      }

      return response.json();
    } catch (e: any) {
       console.error("Error loading file", e);
       setError('Failed to load the file from Google Drive.');
       return null;
    }
  };
  
  return { isGisReady, isSignedIn, userProfile, error, signIn, signOut, saveFile, loadFile };
};

// Please replace this with your actual Google Client ID.
// You can obtain one from the Google Cloud Console: https://console.cloud.google.com/apis/credentials
export const GOOGLE_CLIENT_ID = '89499226609-09vhgo2pmh58ca6bcpulms18pvutt5ck.apps.googleusercontent.com';

export const isDev = (): boolean => {
  // A simple check for development environments.
  if (typeof window !== 'undefined' && window.location) {
      // Check for a secret query parameter to enable dev mode on production
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has('debug')) {
          return true;
      }

      return ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
  }
  // Fallback for other environments - assume dev if no hostname.
  return true;
};

export const isE2ETest = (): boolean => {
  return import.meta.env.VITE_E2E_TESTING === 'true';
};

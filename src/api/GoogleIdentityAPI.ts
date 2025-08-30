import { createLogger } from '../utils/logger';

const logger = createLogger('GoogleIdentity');

// --- Types and Interface ---

export interface UserProfile {
  email: string;
  name: string;
  imageUrl: string;
}

export interface TokenResponse {
  access_token: string;
  error?: string;
  error_description?: string;
}

export type TokenCallback = (response: TokenResponse) => void;

// Fix: Add type declarations for the Google Identity Services (GIS) client library
// to inform TypeScript about the `window.google` object and its properties.
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: TokenCallback;
          }) => {
            requestAccessToken: (options: { prompt: string }) => void;
          };
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

export interface GoogleIdentityAPI {
    initialize(clientId: string, scopes: string, callback: TokenCallback): Promise<void>;
    requestToken(): void;
    revokeToken(token: string): void;
    getUserProfile(token: string): Promise<UserProfile>;
}

// --- Implementation ---

export class GoogleIdentityApiImpl implements GoogleIdentityAPI {
    private tokenClient: any = null;

    initialize(clientId: string, scopes: string, callback: TokenCallback): Promise<void> {
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (window.google?.accounts?.oauth2) {
                    clearInterval(checkInterval);
                    try {
                        logger.info('Google Identity Services script loaded. Initializing token client...');
                        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                            client_id: clientId,
                            scope: scopes,
                            callback: callback,
                        });
                        logger.info('Token client initialized.');
                        resolve();
                    } catch (e) {
                        logger.error('Failed to initialize Google token client.', e);
                        reject(e);
                    }
                }
            }, 100);
        });
    }

    requestToken(): void {
        if (!this.tokenClient) {
            throw new Error("Google Identity API is not initialized. Cannot request token.");
        }
        this.tokenClient.requestAccessToken({ prompt: '' });
    }

    revokeToken(token: string): void {
        if (window.google?.accounts?.oauth2) {
            window.google.accounts.oauth2.revoke(token, () => {
                logger.info('Access token revoked.');
            });
        }
    }

    async getUserProfile(token: string): Promise<UserProfile> {
        logger.info('Fetching user profile...');
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Failed to fetch user profile:', errorText);
            throw new Error('Failed to fetch user profile');
        }

        const profile = await response.json();
        logger.info('Successfully fetched user profile.');
        return { email: profile.email, name: profile.name, imageUrl: profile.picture };
    }
}
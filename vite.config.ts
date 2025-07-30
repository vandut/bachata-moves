import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [
        VitePWA({
          registerType: 'autoUpdate',
          devOptions: {
            enabled: true,
          },
          includeAssets: [
            'icons/favicon.ico',
            'icons/apple-touch-icon.png',
            'icons/pwa-192x192.png',
            'icons/pwa-512x512.png',
            'icons/pwa-maskable-192x192.png',
            'icons/pwa-maskable-512x512.png',
          ],
          manifest: {
            name: 'Bachata Moves',
            short_name: 'Bachata Moves',
            description: "An application to browse and manage Bachata lessons and figures.",
            theme_color: '#ffffff',
            background_color: '#f9fafb',
            icons: [
              {
                src: 'icons/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: 'icons/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: 'icons/pwa-maskable-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable',
              },
              {
                src: 'icons/pwa-maskable-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
          },
        }),
      ],
      base: '/bachata-moves/',
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

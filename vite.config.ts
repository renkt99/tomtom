import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/tomtom/';

export default defineConfig({
  base: BASE,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'TomTom',
        short_name: 'TomTom',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        background_color: '#0b0d10',
        theme_color: '#0b0d10',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Precache the app shell (default globs cover the built JS/CSS/HTML).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/rastertiles\/voyager\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-voyager',
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 14 * 24 * 3600
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: false
  }
});

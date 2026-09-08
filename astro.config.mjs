// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  site: 'https://foto.vigolab.ovh',
  base: '/',
  integrations: [sitemap()],
  output: 'static',
  vite: {
    plugins: [
      tailwindcss(),
      {
        name: 'debug-pwa',
        configResolved(config) {
          console.log('[DEBUG] PWA plugin loaded, config.plugins:', config.plugins.map(p => p.name).filter(Boolean));
        },
        apply: 'build',
        async generateBundle() {
          console.log('[DEBUG] generateBundle called');
        },
        closeBundle() {
          console.log('[DEBUG] closeBundle called');
        }
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'robots.txt'],
        strategies: 'generateSW',
        manifest: {
          name: 'Wiktor Brzeziński — Fotografia',
          short_name: 'Wiktor Foto',
          description: 'Portfolio fotograficzne — portrety, sesje okolicznościowe, kadry z życia codziennego.',
          theme_color: '#3a5a40',
          background_color: '#eaf4f4',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          globDirectory: 'dist/',
          swDest: 'sw.js',
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false
        }
      })
    ]
  }
});

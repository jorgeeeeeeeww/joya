import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png', 'push-sw.js'],
      manifest: {
        id: '/',
        name: 'La Joya · Jardines & Cabañas',
        short_name: 'La Joya',
        description: 'Sistema de gestión de Jardines La Joya: salón de eventos, cabañas, casas y equipo.',
        lang: 'es-MX',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        prefer_related_applications: false,
        orientation: 'any',
        background_color: '#F6EAE3',
        theme_color: '#F6EAE3',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Limpieza', url: '/limpieza', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Eventos', url: '/eventos', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Mapa', url: '/mapa', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Prospectos', url: '/prospectos', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Hospedaje', url: '/hospedaje', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm}'], // wasm: lector de códigos sin internet
        importScripts: ['push-sw.js'],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/functions\//, /^\/rest\//],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'clima', expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 6 } },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1100 },
  server: { port: 5173 },
})

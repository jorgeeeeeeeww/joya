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
        background_color: '#ECE8E1',
        theme_color: '#ECE8E1',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Lo pesado y opcional (motor 3D y lector de códigos) no se descarga al instalar: se guarda la primera vez que se usa
        globIgnores: ['**/tres-d-*.js', '**/*.wasm'],
        importScripts: ['push-sw.js'],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/functions\//, /^\/rest\//],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/(tres-d-[^/]+\.js|[^/]+\.wasm)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'modulos-pesados', expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'clima', expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 6 } },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // Bloques con nombre estable: el motor 3D aparte (solo lo baja quien abre un mapa) y el núcleo de React aparte
        manualChunks(id: string) {
          if (/node_modules[\\/](three|@react-three|camera-controls|its-fine|suspend-react|react-use-measure)[\\/]/.test(id)) return 'tres-d'
          if (/node_modules[\\/]@supabase[\\/]/.test(id)) return 'nube'
          // zustand y use-sync-external-store los comparten la app y el motor 3D: van con React para que la
          // pantalla inicial no arrastre el módulo 3D completo
          if (/node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|zustand|use-sync-external-store)[\\/]/.test(id)) return 'react'
          if (/node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/.test(id)) return 'movimiento'
        },
      },
    },
  },
  server: { port: 5173 },
})

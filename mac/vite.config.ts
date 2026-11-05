import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

// La app de la Mac (Tauri) dibuja con el motor de Safari del sistema (macOS 12 o más nuevo).
// Mientras se desarrolla en Windows se abre en el navegador en http://localhost:5180.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [react(), tailwindcss()],
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  clearScreen: false,
  server: { port: 5180, strictPort: true, host: '127.0.0.1' },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: ['safari17', 'chrome120'],
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
})

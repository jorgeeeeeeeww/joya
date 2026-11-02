import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { initPwa, usePwa } from './lib/pwa'
import { consumeLinkFromUrl } from './lib/sync'
import { installErrorLog } from './lib/errorLog'

// Guarda los errores del dispositivo para el panel de desarrollador
installErrorLog()

// Service worker: avisa cuando hay versión nueva (el usuario decide cuándo actualizar)
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => usePwa.setState({ needRefresh: true }),
  onOfflineReady: () => usePwa.setState({ offlineReady: true }),
  onRegisteredSW: (_url, reg) => {
    // Busca actualizaciones cada hora mientras la app esté abierta
    if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000)
  },
})
usePwa.setState({ update: () => updateSW(true) })
initPwa()

// Enlace de vinculación desde un QR (#vincular=…)
consumeLinkFromUrl()

// Pide al navegador que no borre los datos locales por falta de espacio
if (navigator.storage?.persist) void navigator.storage.persist()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

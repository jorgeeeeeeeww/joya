import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyWaitingAtBoot, initPwa, initUpdates } from './lib/pwa'
import { consumeLinkFromUrl } from './lib/sync'
import { installErrorLog } from './lib/errorLog'

// Guarda los errores del dispositivo para el panel de desarrollador (y los manda al monitor central)
installErrorLog()

// Enlace de vinculación desde un QR (#vincular=…)
consumeLinkFromUrl()

// Pide al navegador que no borre los datos locales por falta de espacio
if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {})

void (async () => {
  // Recién abierta: si ya se descargó una versión nueva, se aplica antes de mostrar nada (recarga sola)
  if (await applyWaitingAtBoot()) return
  initUpdates()
  initPwa()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})()

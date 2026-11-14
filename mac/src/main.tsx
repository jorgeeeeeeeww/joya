import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App'
import { enMac } from './lib/mac'
import { repararColores } from './lib/compat'

document.documentElement.dataset.theme = 'light'
document.documentElement.dataset.appDesign = 'reservations'

// En la Mac no hay menú del navegador: el clic derecho solo abre los menús propios de la app
if (enMac) document.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement
  if (!t.closest('input, textarea, [contenteditable="true"]')) e.preventDefault()
})

// En un Safari viejo primero se arreglan los colores; en uno nuevo esto no espera nada
void repararColores().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </StrictMode>,
  )
})

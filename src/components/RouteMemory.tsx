// Abre donde la dejaste: iPhone siempre abre la app instalada en el inicio, aunque la persona estuviera
// a media limpieza o dentro de un evento. Se recuerda la última pantalla y se regresa ahí al abrir.
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const KEY = 'lajoya:ultimaPantalla'
/** Después de este tiempo se abre en el inicio (el día ya cambió de tarea) */
const MAX_AGE_MS = 12 * 60 * 60 * 1000
let restored = false

export function RouteMemory() {
  const location = useLocation()
  const navigate = useNavigate()

  // Al abrir la app (una sola vez): si arrancó en el inicio, regresa a la última pantalla
  useEffect(() => {
    if (restored) return
    restored = true
    // Solo en la app instalada (en el navegador, abrir la dirección del inicio es a propósito)
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
    if (!standalone || location.pathname !== '/' || location.search || location.hash) return
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as { path: string; at: number } | null
      if (saved && saved.path !== '/' && saved.path.startsWith('/') && Date.now() - saved.at < MAX_AGE_MS) navigate(saved.path, { replace: true })
    } catch {
      /* sin almacenamiento */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ path: location.pathname + location.search, at: Date.now() }))
    } catch {
      /* sin almacenamiento */
    }
  }, [location.pathname, location.search])

  return null
}

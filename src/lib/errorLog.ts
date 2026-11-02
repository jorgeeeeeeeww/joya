// Bitácora de errores del dispositivo, para el panel de desarrollador: guarda los últimos 150 fallos
// (de la pantalla, de promesas y de la sincronización) con la página y la hora, y los explica en palabras.
const KEY = 'lajoya:errores'
const MAX = 150

export interface ErrorEntry {
  at: string
  source: 'pantalla' | 'promesa' | 'sync' | 'consola'
  message: string
  page: string
  detail?: string
}

export function readErrors(): ErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as ErrorEntry[]
  } catch {
    return []
  }
}

export function clearErrors() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* sin almacenamiento */
  }
}

export function logError(source: ErrorEntry['source'], message: string, detail?: string) {
  try {
    const list = readErrors()
    const last = list[0]
    // El mismo error repetido en segundos no llena la bitácora
    if (last && last.message === message && Date.now() - Date.parse(last.at) < 5000) return
    list.unshift({ at: new Date().toISOString(), source, message: message.slice(0, 400), page: location.pathname + location.search, detail: detail?.slice(0, 1200) })
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* sin almacenamiento */
  }
}

/** Traducción a palabras de los errores más comunes y qué hacer */
export function explain(message: string): string {
  const m = message.toLowerCase()
  if (/failed to fetch|networkerror|load failed|network request failed/.test(m)) return 'Sin internet o el servidor no respondió. Se reintenta solo; los cambios quedan guardados en el dispositivo.'
  if (/jwt|token.*expired|invalid.*token|401/.test(m)) return 'La sesión de este dispositivo en la nube venció. Vuelve a vincular el dispositivo; no se pierde nada.'
  if (/permission denied|row-level security|rls|403/.test(m)) return 'La nube no dio permiso a este puesto para guardar ese registro. Revisa el puesto de la cuenta vinculada.'
  if (/quota|storage.*full|exceeded/.test(m)) return 'El dispositivo se quedó sin espacio. Libera espacio o descarga un respaldo y limpia fotos viejas.'
  if (/dynamically imported module|chunkload|importing a module script failed/.test(m)) return 'Se publicó una versión nueva mientras la app estaba abierta. Toca «Buscar versión nueva».'
  if (/timeout|timed out/.test(m)) return 'La conexión tardó demasiado. Suele ser internet lento; se reintenta solo.'
  if (/duplicate key|conflict|409/.test(m)) return 'Dos dispositivos guardaron lo mismo a la vez. La app combina ambos cambios; no hace falta hacer nada.'
  return 'Error de la app. Descarga la bitácora y compártela para revisarlo; los datos no se ven afectados.'
}

let installed = false
/** Escucha los errores de toda la app (se llama una sola vez al arrancar) */
export function installErrorLog() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => logError('pantalla', String(e.message || e.error), e.error?.stack))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined
    logError('promesa', String(r?.message ?? r), r?.stack)
  })
}

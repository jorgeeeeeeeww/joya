// Bitácora de errores del dispositivo, para el panel de desarrollador: guarda los últimos 150 fallos
// (de la pantalla, de promesas y de la sincronización) con la página y la hora, y los explica en palabras.
// Cada error también queda en una fila de envío para el monitor central (src/lib/monitor.ts): si no hay
// internet, se manda después. Solo viaja el error, la pantalla y la hora, nunca los datos del rancho.
const KEY = 'lajoya:errores'
const OUTBOX = 'lajoya:errores:porEnviar'
const MAX = 150
const OUTBOX_MAX = 100

export interface ErrorEntry {
  at: string
  source: 'pantalla' | 'promesa' | 'sync' | 'consola' | 'permiso'
  message: string
  page: string
  detail?: string
}

const readList = (key: string): ErrorEntry[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? (v as ErrorEntry[]) : []
  } catch {
    return []
  }
}

export function readErrors(): ErrorEntry[] {
  return readList(KEY)
}

export function clearErrors() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* sin almacenamiento */
  }
}

/** Errores que faltan por mandar al monitor central (los más viejos primero) */
export function pendingErrors(): ErrorEntry[] {
  return readList(OUTBOX)
}

/** Quita de la fila de envío los primeros n errores (ya llegaron a la nube) */
export function dropSentErrors(n: number) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(readList(OUTBOX).slice(n)))
  } catch {
    /* sin almacenamiento */
  }
}

/** Quita direcciones con datos (correos, tokens, llaves) antes de guardar o enviar un error */
const scrub = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<correo>')
    .replace(/(token|apikey|key|signature)=[^&\s"']+/gi, '$1=<oculto>')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>')
    .replace(/sb_(publishable|secret)_[\w-]+/g, 'sb_$1_<oculto>')

export function logError(source: ErrorEntry['source'], message: string, detail?: string) {
  try {
    const list = readErrors()
    const last = list[0]
    // El mismo error repetido en segundos no llena la bitácora
    if (last && last.message === message && Date.now() - Date.parse(last.at) < 5000) return
    const entry: ErrorEntry = { at: new Date().toISOString(), source, message: scrub(message).slice(0, 400), page: location.pathname, detail: detail ? scrub(detail).slice(0, 1200) : undefined }
    list.unshift(entry)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
    const outbox = readList(OUTBOX)
    outbox.push(entry)
    localStorage.setItem(OUTBOX, JSON.stringify(outbox.slice(-OUTBOX_MAX)))
  } catch {
    /* sin almacenamiento */
  }
}

/** Traducción a palabras de los errores más comunes y qué hacer */
export function explain(message: string): string {
  const m = message.toLowerCase()
  if (/failed to fetch|networkerror|load failed|network request failed|sin conexión/.test(m)) return 'Sin internet o el servidor no respondió. Se reintenta solo; los cambios quedan guardados en el dispositivo.'
  if (/sesión.*venció|jwt|token.*expired|invalid.*token|401/.test(m)) return 'La sesión de este dispositivo en la nube venció. Entra de nuevo con tu correo en Ajustes → Nube; no se pierde nada.'
  if (/permission denied|row-level security|rls|403|permisos|no aceptó/.test(m)) return 'La nube no dio permiso a este puesto para guardar ese registro. Revisa el puesto de la cuenta vinculada.'
  if (/quota|storage.*full|exceeded|sin espacio/.test(m)) return 'El dispositivo se quedó sin espacio. Libera espacio o descarga un respaldo y limpia fotos viejas.'
  if (/no se pudo guardar en el dispositivo|no se pudieron leer|indexeddb|database connection/.test(m)) return 'El dispositivo no dejó guardar por un momento (pasa en iPhone después de estar en segundo plano). Se reintenta solo.'
  if (/dynamically imported module|chunkload|importing a module script failed|recarga automática/.test(m)) return 'Se publicó una versión nueva mientras la app estaba abierta. La app se recargó sola con la versión nueva.'
  if (/versión más nueva|actualizar la app/.test(m)) return 'La nube pide una versión más nueva. La app se actualiza sola; los cambios esperan guardados aquí.'
  if (/timeout|timed out|tardó demasiado/.test(m)) return 'La conexión tardó demasiado. Suele ser internet lento; se reintenta solo.'
  if (/duplicate key|conflict|409/.test(m)) return 'Dos dispositivos guardaron lo mismo a la vez. La app combina ambos cambios; no hace falta hacer nada.'
  return 'Error de la app. Descarga la bitácora y compártela para revisarlo; los datos no se ven afectados.'
}

let installed = false
/** Escucha los errores de toda la app (se llama una sola vez al arrancar) */
export function installErrorLog() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => {
    // Imágenes o archivos que no cargaron no son errores de la app
    if (!e.message && !e.error) return
    logError('pantalla', String(e.message || e.error), e.error?.stack)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string; name?: string } | undefined
    // Cancelaciones a propósito (cerrar una pantalla a media carga) no son errores
    if (r?.name === 'AbortError') return
    logError('promesa', String(r?.message ?? r), r?.stack)
  })
}

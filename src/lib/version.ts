// Versión de la app y versión mínima que exige la nube.
// La nube guarda en app_config la versión mínima: si cambia el formato de los datos, los dispositivos
// atrasados se actualizan antes de subir cualquier cosa (así nunca mezclan datos con formato viejo).
import { create } from 'zustand'

export const BUILD_ID: string = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'

/** «4 nov 2026 · 15:30» a partir del número de versión (AAAAMMDDHHmm, hora UTC) */
export function buildLabel(build = BUILD_ID): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(build)
  if (!m) return build
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!))
  return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** ¿La versión a es más vieja que b? (dev nunca es vieja: se usa al programar) */
export const isOlder = (a: string, b: string) => a !== 'dev' && /^\d{12}$/.test(a) && /^\d{12}$/.test(b) && a < b

interface VersionState {
  /** La nube exige una versión más nueva que la de este dispositivo */
  required: boolean
  minBuild?: string
}

export const useVersion = create<VersionState>(() => ({ required: false }))

import type { Datos } from './tipos'

/** El reloj del servidor cambia en cada respuesta; no representa un cambio de reservaciones. */
export function compartirDatos(anteriores: Datos | null, siguientes: Datos): Datos {
  if (!anteriores) return siguientes
  const compartidos = { ...siguientes }
  let cambio = false
  for (const clave of Object.keys(siguientes) as (keyof Datos)[]) {
    if (clave === 'ahora') continue
    if (JSON.stringify(anteriores[clave]) === JSON.stringify(siguientes[clave])) {
      Object.assign(compartidos, { [clave]: anteriores[clave] })
    } else cambio = true
  }
  return cambio ? compartidos : anteriores
}

// Fechas que el dueño aparta (estancias que arregló por teléfono, en persona o que ya tenía).
// Se guardan como un cierre (tabla «bloqueos»), así la página las ve ocupadas igual que hoy ve los cierres,
// pero NO son reservaciones: sin código LJ, sin pagos, sin correos ni avisos.
// Lo que las distingue de un cierre es el motivo: «Apartado» o «Apartado: nombre o nota».
import type { Bloqueo, Datos, ISODate } from './tipos'

const MARCA = 'Apartado'
/** El motivo admite 120 letras; «Apartado: » ocupa 10 */
export const MAX_NOTA = 100

export function esApartado(b: Pick<Bloqueo, 'motivo'>): boolean {
  const m = b.motivo?.trim() ?? ''
  return m === MARCA || m.startsWith(`${MARCA}:`)
}

/** Lo que el dueño anotó (nombre o nota corta), o null */
export function notaDe(b: Pick<Bloqueo, 'motivo'>): string | null {
  if (!esApartado(b)) return null
  return b.motivo!.trim().slice(MARCA.length + 1).trim() || null
}

/** El motivo que se guarda en la nube */
export function motivoApartado(nota: string): string {
  const n = nota.trim().replace(/\s+/g, ' ').slice(0, MAX_NOTA)
  return n ? `${MARCA}: ${n}` : MARCA
}

/** «Apartado · Familia Ramírez» o «Apartado» */
export function etiquetaApartado(b: Pick<Bloqueo, 'motivo'>): string {
  const n = notaDe(b)
  return n ? `${MARCA} · ${n}` : MARCA
}

/** Los apartados que todavía no terminan (los de hoy en adelante), del más cercano al más lejano */
export function apartadosVigentes(d: Datos, hoy: ISODate = d.hoy): Bloqueo[] {
  return d.bloqueos.filter((b) => esApartado(b) && b.fin > hoy).sort((a, b) => a.inicio.localeCompare(b.inicio) || a.cabana_id.localeCompare(b.cabana_id))
}

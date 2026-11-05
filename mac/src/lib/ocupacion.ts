// Qué pasa en cada hospedaje cada noche: reservada, apartada (solicitud), cerrada o libre.
import type { Bloqueo, Cabana, Datos, ISODate, Reservacion, TipoHospedaje } from './tipos'
import { activa } from './estados'
import type { EstadoDia } from '@/components/campos'

export type Noche = { tipo: 'reservada'; r: Reservacion } | { tipo: 'apartada'; r: Reservacion } | { tipo: 'cerrada'; b: Bloqueo } | { tipo: 'libre' }

export function nocheDe(d: Datos, cabanaId: string, iso: ISODate, ahora = Date.now()): Noche {
  const r = d.reservaciones.find((x) => x.cabana_id === cabanaId && x.llegada <= iso && iso < x.salida && activa(x, ahora))
  if (r) return r.estado === 'solicitud' ? { tipo: 'apartada', r } : { tipo: 'reservada', r }
  const b = d.bloqueos.find((x) => x.cabana_id === cabanaId && x.inicio <= iso && iso < x.fin)
  if (b) return { tipo: 'cerrada', b }
  return { tipo: 'libre' }
}

/** Para el calendario de la hoja «Nueva reservación»: qué noches no se pueden elegir */
export function ocupacionDe(d: Datos | null, cabanaId: string | null, ignorar?: string) {
  return (iso: ISODate): EstadoDia => {
    if (!d || !cabanaId) return 'libre'
    if (d.reservaciones.some((x) => x.id !== ignorar && x.cabana_id === cabanaId && x.llegada <= iso && iso < x.salida && activa(x))) return 'ocupado'
    if (d.bloqueos.some((x) => x.cabana_id === cabanaId && x.inicio <= iso && iso < x.fin)) return 'cerrado'
    return 'libre'
  }
}

export const TIPO: Record<TipoHospedaje, { uno: string; varios: string; articulo: string }> = {
  cabana: { uno: 'Cabaña', varios: 'Cabañas', articulo: 'la cabaña' },
  casa: { uno: 'Casa', varios: 'Casas', articulo: 'la casa' },
  habitacion: { uno: 'Habitación', varios: 'Habitaciones', articulo: 'la habitación' },
}

export const nombreDe = (d: Datos | null, id: string) => d?.cabanas.find((c: Cabana) => c.id === id)?.nombre ?? 'Hospedaje'

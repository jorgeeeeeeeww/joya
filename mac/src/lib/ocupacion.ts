// Qué pasa en cada hospedaje cada noche: reservada, apartada (solicitud), apartada por el dueño, cerrada o libre.
import type { Bloqueo, Cabana, Datos, ISODate, Reservacion, TipoHospedaje } from './tipos'
import { activa } from './estados'
import { esApartado } from './apartados'
import type { EstadoDia } from '@/components/campos'

/** «apartada» es una solicitud que espera confirmación; «dueno» son noches que el dueño apartó (sin reservación) */
export type Noche = { tipo: 'reservada'; r: Reservacion } | { tipo: 'apartada'; r: Reservacion } | { tipo: 'dueno'; b: Bloqueo } | { tipo: 'cerrada'; b: Bloqueo } | { tipo: 'libre' }

export function nocheDe(d: Datos, cabanaId: string, iso: ISODate, ahora = Date.now()): Noche {
  const r = d.reservaciones.find((x) => x.cabana_id === cabanaId && x.llegada <= iso && iso < x.salida && activa(x, ahora))
  if (r) return r.estado === 'solicitud' ? { tipo: 'apartada', r } : { tipo: 'reservada', r }
  const b = d.bloqueos.find((x) => x.cabana_id === cabanaId && x.inicio <= iso && iso < x.fin)
  if (b) return esApartado(b) ? { tipo: 'dueno', b } : { tipo: 'cerrada', b }
  return { tipo: 'libre' }
}

/** Para el calendario de la hoja «Nueva reservación»: qué noches no se pueden elegir */
export function ocupacionDe(d: Datos | null, cabanaId: string | null, ignorar?: string) {
  return (iso: ISODate): EstadoDia => {
    if (!d || !cabanaId) return 'libre'
    if (d.reservaciones.some((x) => x.id !== ignorar && x.cabana_id === cabanaId && x.llegada <= iso && iso < x.salida && activa(x))) return 'ocupado'
    const b = d.bloqueos.find((x) => x.cabana_id === cabanaId && x.inicio <= iso && iso < x.fin)
    // Lo que apartó el dueño cuenta como ocupado: alguien se va a quedar
    if (b) return esApartado(b) ? 'ocupado' : 'cerrado'
    return 'libre'
  }
}

export const TIPO: Record<TipoHospedaje, { uno: string; varios: string; articulo: string }> = {
  cabana: { uno: 'Cabaña', varios: 'Cabañas', articulo: 'la cabaña' },
  casa: { uno: 'Casa', varios: 'Casas', articulo: 'la casa' },
  habitacion: { uno: 'Habitación', varios: 'Habitaciones', articulo: 'la habitación' },
}

export const nombreDe = (d: Datos | null, id: string) => d?.cabanas.find((c: Cabana) => c.id === id)?.nombre ?? 'Hospedaje'

// Qué pasa en cada hospedaje una noche dada, en la forma que usa el plano del rancho.
import type { Datos, ISODate } from './tipos'
import type { CasaEscena } from '@/components/plano'
import { activa } from './estados'
import { cuando, noches, venceEn } from './fechas'
import { nocheDe } from './ocupacion'
import { etiquetaApartado } from './apartados'

export function casasDe(d: Datos, noche: ISODate): CasaEscena[] {
  return d.cabanas.map((c) => {
    const n = nocheDe(d, c.id, noche)
    const llega = d.reservaciones.some((r) => r.cabana_id === c.id && r.llegada === noche && activa(r)) || (n.tipo === 'dueno' && n.b.inicio === noche)
    let linea = 'Libre esta noche'
    if (n.tipo === 'reservada' || n.tipo === 'apartada') {
      const quien = n.r.nombre
      const sale = noches(noche, n.r.salida) === 1 ? 'se va mañana' : `se va ${cuando(n.r.salida, noche)}`
      linea = n.tipo === 'apartada' ? `Solicitud de ${quien} · ${venceEn(n.r.vence)?.texto ?? 'apartada'}` : `${quien} · ${n.r.llegada === noche ? 'llega este día' : sale}`
    } else if (n.tipo === 'dueno') {
      const sale = noches(noche, n.b.fin) === 1 ? 'se va mañana' : `se va ${cuando(n.b.fin, noche)}`
      linea = `${etiquetaApartado(n.b)} · ${n.b.inicio === noche ? 'llega este día' : sale}`
    } else if (n.tipo === 'cerrada') linea = `Cerrada${n.b.motivo ? `: ${n.b.motivo.toLowerCase()}` : ''}`
    // Lo que apartó el dueño se ve ocupado en el mapa y cuenta en la ocupación: alguien se va a quedar
    if (n.tipo === 'dueno') return { id: c.id, slug: c.slug, nombre: c.nombre, tipo: c.tipo, estado: 'reservada', linea, llega, dueno: true }
    return { id: c.id, slug: c.slug, nombre: c.nombre, tipo: c.tipo, estado: n.tipo, linea, llega }
  })
}


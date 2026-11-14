// Qué pasa en cada hospedaje una noche dada, en la forma que usa el plano del rancho.
import type { Datos, ISODate } from './tipos'
import type { CasaEscena } from '@/components/plano'
import { activa } from './estados'
import { cuando, noches, venceEn } from './fechas'
import { nocheDe } from './ocupacion'

export function casasDe(d: Datos, noche: ISODate): CasaEscena[] {
  return d.cabanas.map((c) => {
    const n = nocheDe(d, c.id, noche)
    const llega = d.reservaciones.some((r) => r.cabana_id === c.id && r.llegada === noche && activa(r))
    let linea = noche === d.hoy ? 'Libre esta noche' : 'Libre esa noche'
    if (n.tipo === 'reservada' || n.tipo === 'apartada') {
      const quien = n.r.nombre
      const sale = noches(noche, n.r.salida) === 1 ? 'se va mañana' : `se va ${cuando(n.r.salida, noche)}`
      const llega = noche === d.hoy ? 'llega hoy' : 'llega esa noche'
      linea = n.tipo === 'apartada' ? `Solicitud de ${quien} · ${venceEn(n.r.vence)?.texto ?? 'apartada'}` : `${quien} · ${n.r.llegada === noche ? llega : sale}`
    } else if (n.tipo === 'cerrada') linea = `Cerrada${n.b.motivo ? `: ${n.b.motivo.toLowerCase()}` : ''}`
    return { id: c.id, slug: c.slug, nombre: c.nombre, tipo: c.tipo, estado: n.tipo, linea, llega }
  })
}


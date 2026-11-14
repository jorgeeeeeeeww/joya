import type { Estado, MetodoPago, Origen, Reservacion } from './tipos'
import type { Pastel } from '@/components/ui'

export const ESTADO: Record<Estado, { label: string; tono: Pastel; explica: string }> = {
  solicitud: { label: 'Solicitud', tono: 'peach', explica: 'Llegó de la web: las fechas están apartadas mientras la confirmas.' },
  confirmada: { label: 'Confirmada', tono: 'sky', explica: 'La aceptaste. Falta liquidar.' },
  pagada: { label: 'Pagada', tono: 'sage', explica: 'Liquidada por completo.' },
  cancelada: { label: 'Cancelada', tono: 'rose', explica: 'Las fechas quedaron libres.' },
}

export const ORIGEN: Record<Origen, string> = {
  web: 'Página web',
  telefono: 'Llamada',
  whatsapp: 'WhatsApp',
  directo: 'En persona',
}

export const METODO: Record<MetodoPago, string> = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  mercadopago: 'Mercado Pago',
  otro: 'Otro',
}

export const MOTIVO: Record<NonNullable<Reservacion['motivo_cancelacion']>, string> = {
  huesped: 'la canceló el huésped',
  rancho: 'la canceló el rancho',
  vencida: 'venció el apartado',
}

/** Una solicitud cuyo apartado ya venció cuenta como cancelada aunque el barrido no haya pasado */
export function activa(r: Reservacion, ahora = Date.now()) {
  if (r.estado === 'cancelada') return false
  if (r.estado === 'solicitud' && r.vence && new Date(r.vence).getTime() < ahora) return false
  return true
}

export const saldo = (r: Pick<Reservacion, 'total' | 'pagado'>) => Math.max(0, r.total - r.pagado)

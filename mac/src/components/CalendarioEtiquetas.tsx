import { BadgeCheck, Check, Clock3 } from 'lucide-react'
import type { Estado, TipoHospedaje } from '@/lib/tipos'

/** El color identifica al hospedaje; el estado se expresa con un icono y texto. */
export const TONOS_HOSPEDAJE = {
  cabana: { background: '#e7eee5', color: '#304d37', borderColor: '#799471' },
  casa: { background: '#f1e9da', color: '#674e2c', borderColor: '#b59a6c' },
  habitacion: { background: '#e6edf1', color: '#365466', borderColor: '#809bab' },
}
export const tonoHospedaje = (tipo?: TipoHospedaje) => tipo ? TONOS_HOSPEDAJE[tipo] : { background: '#efeee9', color: '#4e524e', borderColor: '#b1b6ad' }
export const estadoReserva = (estado: Estado) => estado === 'solicitud' ? 'Solicitud' : estado === 'pagada' ? 'Pagada' : estado === 'cancelada' ? 'Cancelada' : 'Confirmada'

export function EstadoReserva({ estado, soloIcono = false }: { estado: Estado; soloIcono?: boolean }) {
  const Icono = estado === 'solicitud' ? Clock3 : estado === 'pagada' ? BadgeCheck : Check
  return <span title={estadoReserva(estado)} className="inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] font-medium" aria-label={soloIcono ? estadoReserva(estado) : undefined}>
    <Icono size={13} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />{!soloIcono && <span className="min-w-0 truncate">{estadoReserva(estado)}</span>}
  </span>
}

export function LeyendaHospedajes() {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-soft" aria-label="Colores por tipo de hospedaje">
    {([['cabana', 'Cabañas'], ['casa', 'Casas'], ['habitacion', 'Habitaciones']] as const).map(([tipo, nombre]) => <span key={tipo} className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-[3px] border-l-[3px]" style={TONOS_HOSPEDAJE[tipo]} />{nombre}</span>)}
  </div>
}

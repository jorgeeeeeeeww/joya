import { BadgeCheck, Check, Clock3 } from 'lucide-react'
import type { Estado, TipoHospedaje } from '@/lib/tipos'

/** El color identifica al hospedaje; el estado se expresa con un icono y texto. */
export const TONOS_HOSPEDAJE = {
  cabana: { background: '#e3f2e9', color: '#205c43', borderColor: '#3d8965' },
  casa: { background: '#fff0d8', color: '#80511c', borderColor: '#bf8a36' },
  habitacion: { background: '#e5edfc', color: '#305d95', borderColor: '#557db8' },
}
export const tonoHospedaje = (tipo?: TipoHospedaje) => tipo ? TONOS_HOSPEDAJE[tipo] : { background: '#efeee9', color: '#4e524e', borderColor: '#b1b6ad' }
export const estadoReserva = (estado: Estado) => estado === 'solicitud' ? 'Solicitud' : estado === 'pagada' ? 'Pagada' : estado === 'cancelada' ? 'Cancelada' : 'Confirmada'

export function EstadoReserva({ estado, soloIcono = false }: { estado: Estado; soloIcono?: boolean }) {
  const Icono = estado === 'solicitud' ? Clock3 : estado === 'pagada' ? BadgeCheck : Check
  return <span data-estado={estado} title={estadoReserva(estado)} className="app-booking-status inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] font-medium" aria-label={soloIcono ? estadoReserva(estado) : undefined}>
    <Icono size={13} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />{!soloIcono && <span className="min-w-0 truncate keep-truncate">{estadoReserva(estado)}</span>}
  </span>
}

export function LeyendaHospedajes() {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-soft" aria-label="Colores por tipo de hospedaje">
    {([['cabana', 'Cabañas'], ['casa', 'Casas'], ['habitacion', 'Habitaciones']] as const).map(([tipo, nombre]) => <span key={tipo} className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-[3px] border-l-[3px]" style={TONOS_HOSPEDAJE[tipo]} />{nombre}</span>)}
  </div>
}

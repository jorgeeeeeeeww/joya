// Lo que el dueño cambia desde la app. Cada acción llama una función hosp_* de la nube, avisa con un
// toast (con «Deshacer» cuando se puede) y vuelve a bajar los datos.
import { rpc } from './nube'
import { recargar, useApp } from './store'
import type { Bloqueo, Detalle, Estado, ISODate, MetodoPago, Reservacion } from './tipos'
import { toast } from '@/components/ui'
import { rango } from './fechas'
import { mxn } from './dinero'

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function hacer<T>(fn: () => Promise<T>, error: string): Promise<T | null> {
  try {
    const r = await fn()
    void recargar()
    return r
  } catch (e) {
    toast.error(error, mensaje(e))
    void recargar()
    return null
  }
}

export async function cambiarEstado(r: Pick<Reservacion, 'id' | 'estado' | 'nombre'>, estado: Estado, motivo?: 'huesped' | 'rancho') {
  const antes = r.estado
  const d = await hacer(() => rpc<Detalle>('hosp_cambiar_estado', { p_id: r.id, p_estado: estado, p_motivo: motivo ?? null }), 'No se pudo cambiar la reservación')
  if (!d) return null
  const quien = r.nombre.split(' ')[0]
  const titulo = estado === 'confirmada' ? `Confirmaste a ${quien}` : estado === 'cancelada' ? `Cancelaste la reservación de ${quien}` : estado === 'pagada' ? `${quien} quedó pagada` : `${quien} volvió a solicitud`
  toast.undo(titulo, () => void hacer(() => rpc('hosp_cambiar_estado', { p_id: r.id, p_estado: antes }), 'No se pudo deshacer'), estado === 'cancelada' ? 'Las fechas quedaron libres' : undefined)
  return d
}

export async function registrarPago(id: string, monto: number, metodo: MetodoPago, referencia?: string, fecha?: ISODate) {
  const d = await hacer(() => rpc<Detalle>('hosp_registrar_pago', { p: { reservacion_id: id, monto, metodo, referencia: referencia || null, fecha: fecha || null } }), 'No se pudo registrar el pago')
  if (!d) return null
  const pago = d.pagos.at(-1)
  toast.undo(`Pago de ${mxn(monto)} registrado`, () => pago && void hacer(() => rpc('hosp_borrar_pago', { p_id: pago.id }), 'No se pudo quitar el pago'), d.estado === 'pagada' ? 'La reservación quedó pagada' : d.estado === 'confirmada' ? 'La reservación está confirmada' : undefined)
  return d
}

export async function borrarPago(pagoId: string, monto: number) {
  const d = await hacer(() => rpc<Detalle>('hosp_borrar_pago', { p_id: pagoId }), 'No se pudo quitar el pago')
  if (d) toast.success(`Se quitó el pago de ${mxn(monto)}`)
  return d
}

/** Mover o alargar (desde el calendario). Se ve al instante y la nube recalcula el total. */
export async function moverReservacion(r: Reservacion, cambio: { cabana_id?: string; llegada?: ISODate; salida?: ISODate }) {
  const antes = { cabana_id: r.cabana_id, llegada: r.llegada, salida: r.salida, total: r.total }
  useApp.getState().parchar(r.id, cambio)
  const d = await hacer(() => rpc<Detalle>('hosp_actualizar_reservacion', { p_id: r.id, p: cambio }), 'No se pudo mover la reservación')
  if (!d) return null
  const extra = d.total !== r.total ? ` · total ${mxn(r.total)} → ${mxn(d.total)}` : ''
  toast.undo(`${r.nombre.split(' ')[0]}: ${rango(d.llegada, d.salida)}${d.cabana_id !== r.cabana_id ? ` en ${d.cabana}` : ''}`, () => {
    useApp.getState().parchar(r.id, antes)
    void hacer(() => rpc('hosp_actualizar_reservacion', { p_id: r.id, p: antes }), 'No se pudo deshacer')
  }, extra ? extra.slice(3) : undefined)
  return d
}

export async function actualizarReservacion(id: string, p: Record<string, unknown>) {
  return hacer(() => rpc<Detalle>('hosp_actualizar_reservacion', { p_id: id, p }), 'No se pudo guardar')
}

export async function guardarCierre(b: Partial<Bloqueo> & { cabana_id: string; inicio: ISODate; fin: ISODate }, silencioso = false) {
  const r = await hacer(() => rpc<Bloqueo>('hosp_guardar_bloqueo', { p: b }), 'No se pudieron cerrar esas fechas')
  if (r && !silencioso) toast.undo(`Cerraste ${rango(r.inicio, r.fin)}`, () => void hacer(() => rpc('hosp_borrar_bloqueo', { p_id: r.id }), 'No se pudo deshacer'), r.motivo ?? undefined)
  return r
}

export async function moverCierre(b: Bloqueo, cambio: { cabana_id?: string; inicio?: ISODate; fin?: ISODate }) {
  const antes = { cabana_id: b.cabana_id, inicio: b.inicio, fin: b.fin }
  useApp.setState((s) => (s.datos ? { datos: { ...s.datos, bloqueos: s.datos.bloqueos.map((x) => (x.id === b.id ? { ...x, ...cambio } : x)) } } : {}))
  const r = await hacer(() => rpc<Bloqueo>('hosp_guardar_bloqueo', { p: { id: b.id, ...cambio } }), 'No se pudo mover el cierre')
  if (r) toast.undo(`Cierre movido a ${rango(r.inicio, r.fin)}`, () => void hacer(() => rpc('hosp_guardar_bloqueo', { p: { id: b.id, ...antes } }), 'No se pudo deshacer'))
  return r
}

export async function borrarCierre(b: Bloqueo) {
  useApp.setState((s) => (s.datos ? { datos: { ...s.datos, bloqueos: s.datos.bloqueos.filter((x) => x.id !== b.id) } } : {}))
  const ok = await hacer(() => rpc('hosp_borrar_bloqueo', { p_id: b.id }).then(() => true), 'No se pudo abrir esas fechas')
  if (ok) toast.undo(`Abriste ${rango(b.inicio, b.fin)}`, () => void hacer(() => rpc('hosp_guardar_bloqueo', { p: { cabana_id: b.cabana_id, inicio: b.inicio, fin: b.fin, motivo: b.motivo } }), 'No se pudo deshacer'))
  return ok
}

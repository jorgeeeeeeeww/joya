// Clic derecho sobre cualquier reservación (en Hoy, Calendario y Reservaciones): las mismas acciones.
import { Ban, Check, Copy, ExternalLink, MessageCircle, Wallet } from 'lucide-react'
import type { Detalle, Reservacion } from '@/lib/tipos'
import { useApp } from '@/lib/store'
import { rpc } from '@/lib/nube'
import { abrirLiga, copiar } from '@/lib/mac'
import { ligaWhatsApp } from '@/lib/mensajes'
import { cambiarEstado } from '@/lib/acciones'
import { activa } from '@/lib/estados'
import { toast, useMenuContextual, type MenuItem } from './ui'

/** Abre WhatsApp con el mensaje ya escrito según cómo va la reservación */
export async function avisarPorWhatsApp(id: string) {
  try {
    const d = await rpc<Detalle>('hosp_reservacion', { p_id: id })
    const aj = useApp.getState().datos?.ajustes
    if (!aj) return
    const liga = ligaWhatsApp(d, aj)
    if (!liga) return toast.error('Esta reservación no tiene WhatsApp', 'Agrégalo en los datos del huésped.')
    await abrirLiga(liga)
  } catch (e) {
    toast.error('No se pudo abrir WhatsApp', e instanceof Error ? e.message : String(e))
  }
}

export function accionesDe(r: Reservacion, extra: MenuItem[] = []): MenuItem[] {
  const viva = activa(r)
  return [
    { label: 'Abrir', icon: <ExternalLink />, onClick: () => useApp.getState().abrir(r.id) },
    { label: 'Confirmar', icon: <Check />, onClick: () => void cambiarEstado(r, 'confirmada'), hidden: r.estado !== 'solicitud' || !viva, hint: 'Aparta las fechas sin vencimiento' },
    { label: 'Registrar pago…', icon: <Wallet />, onClick: () => useApp.getState().abrir(r.id), hidden: r.estado === 'cancelada' || r.estado === 'pagada' },
    { label: 'Avisar por WhatsApp', icon: <MessageCircle />, onClick: () => void avisarPorWhatsApp(r.id), hidden: !r.telefono },
    { label: 'Copiar código', icon: <Copy />, hint: r.codigo, onClick: () => void copiar(r.codigo).then(() => toast.success(`Copiaste ${r.codigo}`)) },
    ...extra,
    { label: 'Cancelar reservación', icon: <Ban />, danger: true, separado: true, onClick: () => void cambiarEstado(r, 'cancelada', 'rancho'), hidden: r.estado === 'cancelada' },
  ]
}

export function useMenuReservacion() {
  const { abrir, menu } = useMenuContextual()
  return { menu, abrirMenu: (e: React.MouseEvent, r: Reservacion, extra?: MenuItem[]) => abrir(e, accionesDe(r, extra)) }
}

// Motor de mensajes de la Wedding planner: plantillas editables y bandeja "para enviar hoy"
// calculada con reglas sobre eventos, prospectos, pagos, invitados y proveedores.
// Las marcas de envío viven en datos sincronizados (notas del evento y fechas de los invitados),
// así ningún dispositivo vuelve a proponer un mensaje que ya se mandó.
import { useMemo, useSyncExternalStore } from 'react'
import { CalendarCheck, HeartHandshake, MessageCircle, PartyPopper, Store, Users, Wallet, type LucideIcon } from 'lucide-react'
import type { Guest, Pastel, RanchEvent } from '@/lib/types'
import { db, useCollection, useMe, useStore } from '@/lib/store'
import { VENUE } from '@/lib/meta'
import { addDaysISO, daysUntil, fmt, fmtDateLong, mxn, nowIso, today, waLink } from '@/lib/format'
import { isBooked, pendingInstallments, useEventMoney } from '@/lib/planner'

// ── Plantillas ───────────────────────────────────────────
export type TemplateKind = 'invitacion' | 'recordatorio-rsvp' | 'seguimiento' | 'pago' | 'conteo' | 'proveedor' | 'gracias' | 'bienvenida'

export const TEMPLATE_META: Record<TemplateKind, { label: string; hint: string; icon: LucideIcon; tone: Pastel; vars: string[] }> = {
  bienvenida: { label: 'Bienvenida al apartar', hint: 'Cuando la clienta aparta su fecha', icon: PartyPopper, tone: 'rose', vars: ['cliente', 'evento', 'fecha', 'lugar', 'rancho'] },
  seguimiento: { label: 'Seguimiento de prospecto', hint: 'Prospectos con seguimiento hoy o vencido', icon: MessageCircle, tone: 'lavender', vars: ['cliente', 'evento', 'fecha', 'lugar', 'rancho'] },
  pago: { label: 'Recordatorio de pago', hint: 'Pagos del plan que vencen en 3 días o ya vencieron', icon: Wallet, tone: 'butter', vars: ['cliente', 'evento', 'fecha', 'monto', 'concepto', 'vence'] },
  invitacion: { label: 'Invitación a invitados', hint: 'Desde la estación de invitados', icon: Users, tone: 'sky', vars: ['invitado', 'evento', 'fecha', 'lugar', 'rancho', 'personas'] },
  'recordatorio-rsvp': { label: 'Recordatorio de confirmación', hint: 'Invitados sin confirmar a 14 días o menos', icon: Users, tone: 'mint', vars: ['invitado', 'evento', 'fecha', 'limite'] },
  conteo: { label: 'Número final de invitados', hint: 'A la clienta, 7 días antes', icon: CalendarCheck, tone: 'peach', vars: ['cliente', 'evento', 'fecha', 'confirmados', 'pendientes'] },
  proveedor: { label: 'Confirmación a proveedor', hint: 'A cada proveedor, 3 días antes', icon: Store, tone: 'sage', vars: ['proveedor', 'servicio', 'evento', 'fecha', 'hora', 'lugar'] },
  gracias: { label: 'Agradecimiento y reseña', hint: 'Al día siguiente del evento', icon: HeartHandshake, tone: 'rose', vars: ['cliente', 'evento', 'rancho'] },
}

export const DEFAULT_TEMPLATES: Record<TemplateKind, string> = {
  bienvenida:
    'Hola {cliente}, ¡qué alegría! Tu fecha para {evento} el {fecha} en {lugar} ya quedó apartada en {rancho}. Desde hoy te acompaño en cada detalle. Cualquier duda, escríbeme por aquí ✦',
  seguimiento:
    'Hola {cliente}, soy de {rancho}. Te escribo para saber si pudiste revisar la propuesta para {evento} ({fecha}). Las fechas se apartan rápido; con gusto te ayudo a resolver cualquier duda ✦',
  pago: 'Hola {cliente}, te recordamos con cariño el {concepto} de {evento} por {monto}, con fecha {vence}. Si ya lo realizaste, mándame tu comprobante y lo registro. ¡Gracias! ✦',
  invitacion:
    'Hola {invitado}, con mucho cariño te invitamos a {evento} el {fecha} en {lugar}, {rancho}. ¿Nos confirmas tu asistencia ({personas}) respondiendo a este mensaje con SÍ o NO? ✦',
  'recordatorio-rsvp': 'Hola {invitado}, ¿pudiste ver la invitación a {evento} del {fecha}? Nos ayudas mucho confirmando antes del {limite}: responde SÍ o NO. ¡Gracias! ✦',
  conteo:
    'Hola {cliente}, ¡ya casi es {evento}! Llevamos {confirmados} personas confirmadas y {pendientes} por confirmar. ¿Me ayudas con el número final para cerrar banquete y montaje? ✦',
  proveedor: 'Hola {proveedor}, te confirmo {servicio} para {evento} el {fecha} a las {hora} en {lugar}. ¿Todo listo de tu lado? Gracias ✦',
  gracias:
    'Hola {cliente}, gracias por celebrar {evento} con nosotros. Fue un honor ser parte. Si te gustó, una reseña en Google nos ayuda muchísimo: busca "{rancho}". ¡Te esperamos pronto! ✦',
}

const tplKey = (userId?: string) => `lajoya:tpl:${userId ?? 'anon'}`
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const cache = new Map<string, string>()
const readLS = (k: string) => {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}

export function getTemplates(userId?: string): Record<TemplateKind, string> {
  try {
    return { ...DEFAULT_TEMPLATES, ...JSON.parse(readLS(tplKey(userId)) || '{}') }
  } catch {
    return { ...DEFAULT_TEMPLATES }
  }
}
export function saveTemplate(userId: string | undefined, kind: TemplateKind, text: string | null) {
  const cur = (() => {
    try {
      return JSON.parse(readLS(tplKey(userId)) || '{}')
    } catch {
      return {}
    }
  })()
  if (text === null) delete cur[kind]
  else cur[kind] = text
  try {
    localStorage.setItem(tplKey(userId), JSON.stringify(cur))
  } catch {
    /* almacenamiento bloqueado */
  }
  emit()
}

/** Plantillas del usuario actual (reactivas a cambios) */
export function useTemplates() {
  const me = useMe()
  const raw = useSyncExternalStore(subscribe, () => {
    const v = readLS(tplKey(me?.id))
    cache.set(tplKey(me?.id), v)
    return v
  })
  return useMemo(() => {
    try {
      return { ...DEFAULT_TEMPLATES, ...JSON.parse(raw || '{}') } as Record<TemplateKind, string>
    } catch {
      return { ...DEFAULT_TEMPLATES }
    }
  }, [raw])
}

export function fill(tpl: string, vars: Record<string, string | number | undefined>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== '' ? String(vars[k]) : `{${k}}`))
}

export const firstName = (s: string) => s.replace(/^(Familia|Fam\.)\s+/i, 'familia ').split(/\s+/).slice(0, s.toLowerCase().startsWith('familia') ? 2 : 1).join(' ')

export function eventVars(ev: RanchEvent, ranchName: string) {
  return {
    cliente: firstName(ev.clientName.split('(')[0]!.trim()),
    evento: ev.title,
    fecha: fmtDateLong(ev.date),
    lugar: `el ${VENUE[ev.venue].label.toLowerCase()}`,
    rancho: ranchName,
    hora: ev.startTime,
  }
}

// ── Historial (por dispositivo) ──────────────────────────
export interface SentLog {
  at: string
  kind: TemplateKind
  to: string
  label: string
  eventId?: string
}
const logKey = (userId?: string) => `lajoya:outbox-log:${userId ?? 'anon'}`
export function readLog(userId?: string): SentLog[] {
  try {
    return JSON.parse(readLS(logKey(userId)) || '[]')
  } catch {
    return []
  }
}
export function pushLog(userId: string | undefined, entry: SentLog) {
  try {
    localStorage.setItem(logKey(userId), JSON.stringify([entry, ...readLog(userId)].slice(0, 80)))
  } catch {
    /* sin almacenamiento */
  }
  emit()
}
export function useSentLog() {
  const me = useMe()
  const raw = useSyncExternalStore(subscribe, () => readLS(logKey(me?.id)))
  return useMemo(() => {
    try {
      return JSON.parse(raw || '[]') as SentLog[]
    } catch {
      return []
    }
  }, [raw])
}

// ── Omitir por hoy ───────────────────────────────────────
const snoozeKey = 'lajoya:outbox-snooze'
export function snooze(key: string) {
  try {
    const cur = JSON.parse(readLS(snoozeKey) || '{}')
    cur[key] = today()
    localStorage.setItem(snoozeKey, JSON.stringify(cur))
  } catch {
    /* sin almacenamiento */
  }
  emit()
}
function useSnoozed() {
  const raw = useSyncExternalStore(subscribe, () => readLS(snoozeKey))
  return useMemo(() => {
    try {
      const all = JSON.parse(raw || '{}') as Record<string, string>
      return new Set(Object.entries(all).filter(([, d]) => d === today()).map(([k]) => k))
    } catch {
      return new Set<string>()
    }
  }, [raw])
}

// ── Marcas de envío en el evento (sincronizadas) ─────────
export const isSent = (ev: RanchEvent, key: string) => (ev.notes ?? '').includes(`[${key}]`)

export function markSentOnEvent(ev: RanchEvent, key: string, label: string, extra: Partial<RanchEvent> = {}) {
  const fresh = db.get('events', ev.id) ?? ev
  if (isSent(fresh, key)) return
  const line = `✦ Enviado: ${label} · ${fmt(new Date(), "d MMM, HH:mm")} [${key}]`
  db.patch('events', ev.id, { ...extra, notes: [fresh.notes?.trim(), line].filter(Boolean).join('\n') }, { summary: `Mensaje enviado · ${label} · ${ev.title}` })
}

export function markGuestsReminded(ev: RanchEvent, ids: string[], field: 'remindedAt' | 'invitedAt' = 'remindedAt') {
  const fresh = db.get('events', ev.id) ?? ev
  const now = nowIso()
  const set = new Set(ids)
  db.patch('events', ev.id, { guestList: fresh.guestList.map((g) => (set.has(g.id) ? { ...g, [field]: now, ...(field === 'remindedAt' && !g.invitedAt ? { invitedAt: now } : {}) } : g)) }, { summary: `${field === 'invitedAt' ? 'Invitación' : 'Recordatorio'} a ${ids.length} invitados · ${ev.title}` })
}

// ── Bandeja "para enviar hoy" ────────────────────────────
export interface OutboxItem {
  key: string
  kind: TemplateKind
  title: string
  reason: string
  urgency: number // menor = más urgente
  eventId: string
  to: { name: string; phone?: string }
  message: string
  /** Lote de invitados (recordatorio de confirmación) */
  guests?: { guest: Guest; message: string }[]
  markSent: () => void
}

const RSVP_WINDOW = 14
const RSVP_REMIND_EVERY = 5

export function rsvpOf(g: Guest): NonNullable<Guest['rsvp']> {
  return g.rsvp ?? (g.confirmed ? 'confirmado' : 'pendiente')
}

export function useOutbox() {
  const events = useCollection('events')
  const vendors = useCollection('vendors')
  const ranchName = useStore((s) => s.settings.ranchName)
  const me = useMe()
  const money = useEventMoney()
  const tpl = useTemplates()
  const snoozed = useSnoozed()

  return useMemo(() => {
    const T = today()
    const items: OutboxItem[] = []
    const log = (kind: TemplateKind, to: string, label: string, eventId: string) => pushLog(me?.id, { at: nowIso(), kind, to, label, eventId })

    for (const ev of events) {
      if (ev.status === 'cancelado') continue
      const v = eventVars(ev, ranchName)
      const days = daysUntil(ev.date)

      // Seguimiento de prospectos
      if ((ev.status === 'prospecto' || ev.status === 'cotizado') && ev.followUpAt && ev.followUpAt <= T) {
        const key = `seg:${ev.id}:${ev.followUpAt}`
        const late = ev.followUpAt < T
        items.push({
          key,
          kind: 'seguimiento',
          title: `Seguimiento · ${ev.clientName}`,
          reason: late ? `Vencido desde ${fmt(ev.followUpAt, "d 'de' MMM")}` : 'Le tocaba hoy',
          urgency: late ? 1 : 2,
          eventId: ev.id,
          to: { name: ev.clientName, phone: ev.phone },
          message: fill(tpl.seguimiento, v),
          markSent: () => {
            markSentOnEvent(ev, key, 'Seguimiento', { followUpAt: addDaysISO(T, 3) })
            log('seguimiento', ev.clientName, ev.title, ev.id)
          },
        })
      }

      // Bienvenida al apartar
      if (ev.status === 'apartado' && days >= 0 && !isSent(ev, `bienv:${ev.id}`)) {
        const key = `bienv:${ev.id}`
        items.push({
          key,
          kind: 'bienvenida',
          title: `Bienvenida · ${ev.clientName}`,
          reason: 'Apartó su fecha: dale la bienvenida',
          urgency: 3,
          eventId: ev.id,
          to: { name: ev.clientName, phone: ev.phone },
          message: fill(tpl.bienvenida, v),
          markSent: () => {
            markSentOnEvent(ev, key, 'Bienvenida')
            log('bienvenida', ev.clientName, ev.title, ev.id)
          },
        })
      }

      if (!isBooked(ev)) continue

      // Pagos del plan por vencer o vencidos
      if (days >= -1) {
        for (const p of pendingInstallments(ev, money.paid(ev))) {
          const dueIn = daysUntil(p.due)
          if (dueIn > 3) continue
          const key = `pago:${p.id}:${dueIn < 0 ? 'v' : 'p'}`
          if (isSent(ev, key)) continue
          items.push({
            key,
            kind: 'pago',
            title: `${p.label} · ${ev.title}`,
            reason: dueIn < 0 ? `Venció hace ${-dueIn} ${-dueIn === 1 ? 'día' : 'días'} · ${mxn(p.remaining)}` : dueIn === 0 ? `Vence hoy · ${mxn(p.remaining)}` : `Vence en ${dueIn} días · ${mxn(p.remaining)}`,
            urgency: dueIn < 0 ? 0 : 2,
            eventId: ev.id,
            to: { name: ev.clientName, phone: ev.phone },
            message: fill(tpl.pago, { ...v, monto: mxn(p.remaining), concepto: p.label.toLowerCase(), vence: fmt(p.due, "d 'de' MMMM") }),
            markSent: () => {
              markSentOnEvent(ev, key, `Recordatorio de ${p.label.toLowerCase()}`)
              log('pago', ev.clientName, `${p.label} · ${ev.title}`, ev.id)
            },
          })
        }
      }

      // Invitados sin confirmar (≤ 14 días)
      if (days >= 0 && days <= RSVP_WINDOW) {
        const limit = fmt(addDaysISO(ev.date, -5) < T ? addDaysISO(T, 1) : addDaysISO(ev.date, -5), "d 'de' MMMM")
        const pending = ev.guestList.filter((g) => rsvpOf(g) === 'pendiente' && (!g.remindedAt || g.remindedAt.slice(0, 10) <= addDaysISO(T, -RSVP_REMIND_EVERY)))
        if (pending.length) {
          const key = `rsvp:${ev.id}:${T}`
          items.push({
            key,
            kind: 'recordatorio-rsvp',
            title: `${pending.length} ${pending.length === 1 ? 'invitado sin confirmar' : 'invitados sin confirmar'}`,
            reason: `${ev.title} es en ${days} ${days === 1 ? 'día' : 'días'}`,
            urgency: days <= 7 ? 1 : 3,
            eventId: ev.id,
            to: { name: `${pending.length} invitados` },
            message: fill(tpl['recordatorio-rsvp'], { ...v, invitado: '{invitado}', limite: limit }),
            guests: pending.map((g) => ({ guest: g, message: fill(tpl['recordatorio-rsvp'], { ...v, invitado: firstName(g.name), limite: limit }) })),
            markSent: () => {
              markGuestsReminded(ev, pending.map((g) => g.id))
              log('recordatorio-rsvp', `${pending.length} invitados`, ev.title, ev.id)
            },
          })
        }
      }

      // Número final de invitados (7 días antes)
      const headcountDone = ev.checklist.some((c) => /número final/i.test(c.text) && c.done)
      if (days >= 0 && days <= 7 && !headcountDone && !isSent(ev, `conteo:${ev.id}`)) {
        const people = ev.guestList.reduce((n, g) => n + (rsvpOf(g) === 'confirmado' ? g.count : 0), 0)
        const pend = ev.guestList.reduce((n, g) => n + (rsvpOf(g) === 'pendiente' ? g.count : 0), 0)
        const key = `conteo:${ev.id}`
        items.push({
          key,
          kind: 'conteo',
          title: `Número final · ${ev.title}`,
          reason: `Faltan ${days} días: cierra banquete y montaje`,
          urgency: 1,
          eventId: ev.id,
          to: { name: ev.clientName, phone: ev.phone },
          message: fill(tpl.conteo, { ...v, confirmados: people || ev.guests, pendientes: pend }),
          markSent: () => {
            markSentOnEvent(ev, key, 'Número final de invitados')
            log('conteo', ev.clientName, ev.title, ev.id)
          },
        })
      }

      // Confirmación a proveedores (3 días antes)
      if (days >= 0 && days <= 3) {
        const list = [
          ...vendors.filter((x) => ev.vendorIds?.includes(x.id)).map((x) => ({ id: x.id, name: x.name, phone: x.phone, service: x.category })),
          ...ev.providers.filter((p) => !p.confirmed).map((p) => ({ id: p.id, name: p.name, phone: p.phone, service: p.service })),
        ]
        for (const p of list) {
          const key = `prov:${ev.id}:${p.id}`
          if (isSent(ev, key)) continue
          items.push({
            key,
            kind: 'proveedor',
            title: `Confirmar a ${p.name}`,
            reason: `${ev.title} · en ${days} ${days === 1 ? 'día' : 'días'}`,
            urgency: 2,
            eventId: ev.id,
            to: { name: p.name, phone: p.phone },
            message: fill(tpl.proveedor, { ...v, proveedor: p.name.split(' ')[0], servicio: p.service.toLowerCase() }),
            markSent: () => {
              markSentOnEvent(ev, key, `Confirmación a ${p.name}`)
              log('proveedor', p.name, ev.title, ev.id)
            },
          })
        }
      }

      // Agradecimiento al día siguiente
      if (days <= -1 && days >= -4 && !isSent(ev, `gracias:${ev.id}`)) {
        const key = `gracias:${ev.id}`
        items.push({
          key,
          kind: 'gracias',
          title: `Agradecer a ${ev.clientName}`,
          reason: days === -1 ? 'El evento fue ayer' : `El evento fue hace ${-days} días`,
          urgency: 3,
          eventId: ev.id,
          to: { name: ev.clientName, phone: ev.phone },
          message: fill(tpl.gracias, v),
          markSent: () => {
            markSentOnEvent(ev, key, 'Agradecimiento y reseña')
            log('gracias', ev.clientName, ev.title, ev.id)
          },
        })
      }
    }

    return items.filter((i) => !snoozed.has(i.key)).sort((a, b) => a.urgency - b.urgency || a.title.localeCompare(b.title))
  }, [events, vendors, ranchName, me?.id, money, tpl, snoozed])
}

/** Abre WhatsApp con el mensaje y marca el envío */
export function sendItem(item: OutboxItem) {
  window.open(waLink(item.to.phone, item.message), '_blank', 'noopener')
  item.markSent()
}

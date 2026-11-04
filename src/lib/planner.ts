// Helpers del espacio del wedding planner: dinero por evento, embudo, seguimientos,
// disponibilidad de sábados y cobros del plan de pagos.
import { modulesOf } from './modules'
import { useMemo } from 'react'
import { parseISO } from 'date-fns'
import type { EventStatus, RanchEvent, Venue } from './types'
import { useCollection, useStore } from './store'
import { eventTotal } from './automations'
import { addDaysISO, today, toISODate } from './format'
import { eventVenues } from './floorplan'

export const PIPELINE: EventStatus[] = ['prospecto', 'cotizado', 'apartado', 'confirmado', 'realizado']
export const LEAD_STAGES: EventStatus[] = ['prospecto', 'cotizado', 'apartado']

/** Total y pagado por evento (memoizado sobre pagos e IVA) */
export function useEventMoney() {
  const payments = useCollection('payments')
  const iva = useStore((s) => s.settings.ivaPercent)
  return useMemo(() => {
    const paidBy = new Map<string, number>()
    for (const p of payments) if (p.refType === 'evento') paidBy.set(p.refId, (paidBy.get(p.refId) ?? 0) + p.amount)
    return {
      total: (ev: RanchEvent) => eventTotal(ev, iva),
      paid: (ev: RanchEvent) => paidBy.get(ev.id) ?? 0,
      balance: (ev: RanchEvent) => Math.max(0, eventTotal(ev, iva) - (paidBy.get(ev.id) ?? 0)),
    }
  }, [payments, iva])
}

export type FollowBucket = 'vencido' | 'hoy' | 'proximo' | 'sin-fecha'

export function followBucket(ev: RanchEvent, t = today()): FollowBucket {
  if (!ev.followUpAt) return 'sin-fecha'
  if (ev.followUpAt < t) return 'vencido'
  if (ev.followUpAt === t) return 'hoy'
  return 'proximo'
}

export const FOLLOW_META: Record<FollowBucket, { label: string; tone: 'rose' | 'butter' | 'sky' | 'lavender' }> = {
  vencido: { label: 'Seguimiento vencido', tone: 'rose' },
  hoy: { label: 'Seguimiento hoy', tone: 'butter' },
  proximo: { label: 'Próximo seguimiento', tone: 'sky' },
  'sin-fecha': { label: 'Sin seguimiento', tone: 'lavender' },
}

/** Próximos N fines de semana (viernes a domingo, marcados por su sábado) con su estado por recinto */
export function upcomingSaturdays(events: RanchEvent[], count = 8) {
  const d = parseISO(today())
  const add = (6 - d.getDay() + 7) % 7
  let iso = addDaysISO(today(), add)
  const out: { date: string; salon?: RanchEvent; jardin?: RanchEvent }[] = []
  for (let i = 0; i < count; i++) {
    const from = addDaysISO(iso, -1)
    const to = addDaysISO(iso, 1)
    const day = events.filter((e) => e.date >= from && e.date <= to && e.status !== 'cancelado')
    out.push({
      date: iso,
      salon: day.find((e) => eventVenues(e).includes('salon')),
      jardin: day.find((e) => eventVenues(e).includes('jardin')),
    })
    iso = addDaysISO(iso, 7)
  }
  return out
}

export function isBooked(ev: RanchEvent | undefined) {
  return !!ev && ['apartado', 'confirmado', 'realizado'].includes(ev.status)
}

/** Cobros del plan de pagos que aún no están cubiertos por los pagos registrados */
export function pendingInstallments(ev: RanchEvent, paid: number) {
  let covered = paid
  const plan = [...(ev.paymentPlan ?? [])].sort((a, b) => a.due.localeCompare(b.due))
  return plan
    .map((p) => {
      const fromPaid = Math.min(covered, p.amount)
      covered -= fromPaid
      return { ...p, paidPart: fromPaid, remaining: p.amount - fromPaid }
    })
    .filter((p) => p.remaining > 0.5)
}

/** Progreso general de un evento (0–1) combinando checklist, pagos e invitados */
export function eventReadiness(ev: RanchEvent, paidRatio: number) {
  const chk = ev.checklist.length ? ev.checklist.filter((c) => c.done).length / ev.checklist.length : 0
  const people = ev.guestList.reduce((n, g) => n + g.count, 0)
  const conf = people ? ev.guestList.filter((g) => g.confirmed).reduce((n, g) => n + g.count, 0) / people : 0
  // Lo que el evento no usa (módulo apagado) no cuenta en el avance general
  const m = modulesOf(ev)
  const parts = [m.checklist ? chk : null, m.pagos || m.cotizacion ? Math.min(1, paidRatio) : null, m.invitados ? conf : null].filter((x): x is number => x !== null)
  return { checklist: chk, payments: Math.min(1, paidRatio), guests: conf, overall: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0 }
}

export function weekRange(t = today()) {
  const end = addDaysISO(t, 6)
  return { start: t, end }
}

export const VENUE_ORDER: Venue[] = ['salon', 'jardin']

export function monthKey(d = new Date()) {
  return toISODate(d).slice(0, 7)
}

/** Texto de cuenta regresiva en es-MX */
export function countdownLabel(days: number) {
  if (days === 0) return 'Es hoy'
  if (days === 1) return 'Mañana'
  if (days > 1) return `Faltan ${days} días`
  if (days === -1) return 'Fue ayer'
  return `Hace ${-days} días`
}

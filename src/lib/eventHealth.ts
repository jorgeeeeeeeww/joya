// Salud de un evento y su ruta crítica: se calcula solo con lo que ya se captura
// (pagos, firmas, checklist, invitados, plano y proveedores). No pide datos nuevos.
import { modulesOf } from './modules'
import type { ISODate, RanchEvent } from './types'
import { addDaysISO, daysUntil, fmtDate, mxn, today } from './format'
import { pendingInstallments } from './planner'
import { layoutStats } from './floorplan'
import { rsvpOf } from '@/components/messages/outbox'

export type HealthState = 'ok' | 'warn' | 'bad' | 'na'
export interface HealthPart {
  key: 'contrato' | 'pagos' | 'invitados' | 'mesas' | 'proveedores' | 'beo'
  label: string
  state: HealthState
  note: string
}
export type MilestoneState = 'done' | 'now' | 'late' | 'next'
export interface Milestone {
  key: string
  label: string
  due: ISODate
  state: MilestoneState
  note: string
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const checked = (ev: RanchEvent, word: string) => ev.checklist.some((c) => c.done && norm(c.text).includes(word))
const signed = (ev: RanchEvent, doc: 'contrato' | 'beo') => (ev.signatures ?? []).some((s) => s.document === doc)

function people(ev: RanchEvent) {
  let all = 0
  let conf = 0
  let pend = 0
  let unseated = 0
  for (const g of ev.guestList) {
    const r = rsvpOf(g)
    if (r === 'declinado') continue
    all += g.count
    if (r === 'confirmado') {
      conf += g.count
      if (g.table === undefined || g.table === null) unseated += g.count
    } else pend += g.count
  }
  return { all, conf, pend, unseated }
}

export function eventHealth(ev: RanchEvent, paid: number, total: number, t = today()): HealthPart[] {
  const days = daysUntil(ev.date)
  const out: HealthPart[] = []

  const contract = signed(ev, 'contrato') || checked(ev, 'contrato')
  out.push({ key: 'contrato', label: 'Contrato', state: contract ? 'ok' : days <= 30 ? 'bad' : 'warn', note: contract ? 'Firmado' : 'Sin firmar' })

  const pending = pendingInstallments(ev, paid)
  const overdue = pending.filter((p) => p.due < t)
  const balance = Math.max(0, total - paid)
  if (overdue.length) out.push({ key: 'pagos', label: 'Pagos', state: 'bad', note: `${mxn(overdue.reduce((n, p) => n + p.remaining, 0))} vencido` })
  else if (balance <= 0.5) out.push({ key: 'pagos', label: 'Pagos', state: 'ok', note: total ? 'Liquidado' : 'Sin cotizar' })
  else if (pending[0] && pending[0].due <= addDaysISO(t, 7)) out.push({ key: 'pagos', label: 'Pagos', state: 'warn', note: `${mxn(pending[0].remaining)} · ${fmtDate(pending[0].due)}` })
  else if (!pending.length && days <= 7) out.push({ key: 'pagos', label: 'Pagos', state: 'bad', note: `Saldo ${mxn(balance)}` })
  else out.push({ key: 'pagos', label: 'Pagos', state: 'ok', note: `${total ? Math.round((paid / total) * 100) : 0}% pagado` })

  const p = people(ev)
  if (!ev.guestList.length) out.push({ key: 'invitados', label: 'Invitados', state: days <= 45 ? 'warn' : 'na', note: 'Sin lista' })
  else {
    const ratio = p.all ? p.conf / p.all : 0
    const state: HealthState = ratio >= 0.9 ? 'ok' : days <= 7 ? 'bad' : days <= 21 ? 'warn' : 'ok'
    out.push({ key: 'invitados', label: 'Invitados', state, note: `${Math.round(ratio * 100)}% confirmó` })
  }

  const stats = layoutStats(ev.layout)
  if (!stats.tables && !stats.seats) out.push({ key: 'mesas', label: 'Mesas', state: days <= 30 ? 'warn' : 'na', note: 'Sin plano' })
  else if (stats.seats < Math.max(ev.guests, p.conf)) out.push({ key: 'mesas', label: 'Mesas', state: 'bad', note: `Faltan ${Math.max(ev.guests, p.conf) - stats.seats} lugares` })
  else if (p.unseated) out.push({ key: 'mesas', label: 'Mesas', state: days <= 7 ? 'bad' : 'warn', note: `${p.unseated} sin mesa` })
  else out.push({ key: 'mesas', label: 'Mesas', state: 'ok', note: stats.tables ? `${stats.tables} mesas` : `${stats.seats} lugares` })

  const unconfirmed = ev.providers.filter((x) => !x.confirmed)
  if (!ev.providers.length) out.push({ key: 'proveedores', label: 'Proveedores', state: days <= 30 ? 'warn' : 'na', note: 'Sin registrar' })
  else if (unconfirmed.length) out.push({ key: 'proveedores', label: 'Proveedores', state: days <= 7 ? 'bad' : 'warn', note: unconfirmed.length === 1 ? `${unconfirmed[0]!.name} sin confirmar` : `${unconfirmed.length} sin confirmar` })
  else out.push({ key: 'proveedores', label: 'Proveedores', state: 'ok', note: `${ev.providers.length} confirmados` })

  const beo = signed(ev, 'beo')
  out.push({ key: 'beo', label: 'Orden de evento', state: beo ? 'ok' : days <= 7 ? 'bad' : days <= 21 ? 'warn' : 'na', note: beo ? 'Firmada' : days <= 21 ? 'Sin firmar' : 'Aún no' })
  // Lo que el evento no usa (módulo apagado) no cuenta
  const m = modulesOf(ev)
  const off: Partial<Record<HealthPart['key'], boolean>> = { pagos: !m.pagos && !m.cotizacion, invitados: !m.invitados, mesas: !m.plano, proveedores: !m.proveedores, beo: !m.beo }
  return out.map((x) => (off[x.key] ? { ...x, state: 'na' as const, note: 'No aplica' } : x))
}

/** Pasos clave de un evento con su fecha límite (días antes del evento) */
export function eventMilestones(ev: RanchEvent, paid: number, total: number, t = today()): Milestone[] {
  const p = people(ev)
  const lastDue = [...(ev.paymentPlan ?? [])].sort((a, b) => a.due.localeCompare(b.due)).at(-1)?.due
  const steps: { key: string; label: string; due: ISODate; done: boolean }[] = [
    { key: 'anticipo', label: 'Anticipo', due: addDaysISO(ev.date, -150), done: paid > 0 || checked(ev, 'anticipo') },
    { key: 'contrato', label: 'Contrato', due: addDaysISO(ev.date, -120), done: signed(ev, 'contrato') || checked(ev, 'contrato') },
    { key: 'menu', label: 'Menú', due: addDaysISO(ev.date, -60), done: checked(ev, 'menu') },
    { key: 'invitaciones', label: 'Invitaciones', due: addDaysISO(ev.date, -45), done: ev.guestList.some((g) => g.invitedAt) },
    { key: 'proveedores', label: 'Proveedores', due: addDaysISO(ev.date, -30), done: (ev.providers.length > 0 && ev.providers.every((x) => x.confirmed)) || checked(ev, 'proveedores') },
    { key: 'confirmaciones', label: 'Confirmaciones', due: addDaysISO(ev.date, -14), done: ev.guestList.length > 0 && p.pend === 0 },
    { key: 'plano', label: 'Plano aprobado', due: addDaysISO(ev.date, -14), done: checked(ev, 'plano') },
    { key: 'liquidacion', label: 'Liquidación', due: lastDue ?? addDaysISO(ev.date, -7), done: (total > 0 && total - paid <= 0.5) || checked(ev, 'liquidacion') },
    { key: 'numero', label: 'Número final', due: addDaysISO(ev.date, -7), done: checked(ev, 'numero final') },
    { key: 'beo', label: 'Orden de evento', due: addDaysISO(ev.date, -5), done: signed(ev, 'beo') },
    { key: 'montaje', label: 'Montaje', due: addDaysISO(ev.date, -1), done: checked(ev, 'montaje') },
  ]
  // Sin lista de invitados (cócteles, eventos pequeños) no aplican invitaciones ni confirmaciones
  const m = modulesOf(ev)
  const skip = new Set<string>([
    ...(!ev.guestList.length || !m.invitados ? ['invitaciones', 'confirmaciones'] : []),
    ...(!m.plano ? ['plano'] : []),
    ...(!m.proveedores ? ['proveedores'] : []),
    ...(!m.beo ? ['beo'] : []),
    ...(!m.pagos && !m.cotizacion ? ['anticipo', 'liquidacion'] : []),
  ])
  const list = steps.filter((s) => !skip.has(s.key))
  list.sort((a, b) => a.due.localeCompare(b.due))
  let nowSet = false
  return list.map((s) => {
    let state: MilestoneState
    if (s.done) state = 'done'
    else if (s.due < t) state = 'late'
    else if (!nowSet) {
      state = 'now'
      nowSet = true
    } else state = 'next'
    const note = state === 'done' ? 'Listo' : state === 'late' ? `Venció ${fmtDate(s.due)}` : s.due === t ? 'Hoy' : fmtDate(s.due)
    return { key: s.key, label: s.label, due: s.due, state, note }
  })
}

/** La siguiente cosa por hacer del evento, en una frase */
export function nextStep(ms: Milestone[]) {
  const late = ms.find((m) => m.state === 'late')
  if (late) return { tone: 'bad' as const, text: `Atrasado: ${late.label.toLowerCase()} (${late.note.toLowerCase()})` }
  const now = ms.find((m) => m.state === 'now')
  if (now) return { tone: 'warn' as const, text: `Sigue: ${now.label.toLowerCase()} · ${now.note === 'Hoy' ? 'hoy' : now.note}` }
  return { tone: 'ok' as const, text: 'Todo listo para el evento' }
}

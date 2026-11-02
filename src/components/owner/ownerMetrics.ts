// Métricas del dueño: utilidad, proyección de cobros, flujo de caja, rentabilidad y reporte mensual.
// Funciones puras sobre DataState (sin hooks) para reutilizarlas en el Centro de control y en Finanzas.
import { parseISO } from 'date-fns'
import type { DataState, Expense, Payment, RanchEvent, Reservation, Settings } from '@/lib/types'
import { eventTotal } from '@/lib/automations'
import { EXPENSE_CATEGORY, RES_SOURCE } from '@/lib/meta'
import { addDaysISO, fmt, localDay, nights, toISODate, today } from '@/lib/format'

const live = <T extends { deleted?: boolean }>(rec: Record<string, T>) => Object.values(rec).filter((d) => !d.deleted)

export const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export const monthBounds = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  const first = new Date(y!, m! - 1, 1)
  const last = new Date(y!, m!, 0)
  return { from: toISODate(first), to: toISODate(last), days: last.getDate() }
}

const isBlock = (r: Reservation) => r.guests === 0 || /bloque/i.test(r.guestName)

function paidMap(payments: Payment[]) {
  const m = new Map<string, number>()
  for (const p of payments) m.set(p.refId, (m.get(p.refId) ?? 0) + p.amount)
  return m
}

/** Noches de una reserva dentro de [from, to] (to inclusivo) y su ingreso prorrateado */
export function reservationInRange(r: Reservation, from: string, to: string) {
  const end = addDaysISO(to, 1)
  const a = r.checkIn > from ? r.checkIn : from
  const b = r.checkOut < end ? r.checkOut : end
  const n = b > a ? nights(a, b) : 0
  const total = nights(r.checkIn, r.checkOut)
  return { nights: n, revenue: total ? (r.total * n) / total : 0 }
}

// ── Utilidad del mes ─────────────────────────────────────
export function monthProfit(data: DataState, key = today().slice(0, 7)) {
  const payments = live(data.payments).filter((p) => p.date.startsWith(key))
  const expenses = live(data.expenses).filter((e) => e.date.startsWith(key))
  const income = payments.reduce((n, p) => n + p.amount, 0)
  const spent = expenses.reduce((n, e) => n + e.amount, 0)
  return {
    income,
    spent,
    profit: income - spent,
    margin: income ? (income - spent) / income : 0,
    incomeLodging: payments.filter((p) => p.refType === 'reserva').reduce((n, p) => n + p.amount, 0),
    incomeEvents: payments.filter((p) => p.refType === 'evento').reduce((n, p) => n + p.amount, 0),
  }
}

// ── Cobros esperados (proyección) ────────────────────────
export interface Inflow {
  date: string
  amount: number
  kind: 'evento' | 'hospedaje'
  label: string
  refId: string
}

/** Lo que falta por cobrar con fecha estimada: plan de pagos (o fecha del evento) y llegadas de hospedaje */
export function expectedInflows(data: DataState, settings: Settings, horizonDays = 90): Inflow[] {
  const T = today()
  const end = addDaysISO(T, horizonDays)
  const paid = paidMap(live(data.payments))
  const out: Inflow[] = []

  for (const ev of live(data.events)) {
    if (ev.status !== 'apartado' && ev.status !== 'confirmado') continue
    const total = eventTotal(ev, settings.ivaPercent)
    let remaining = Math.max(0, total - (paid.get(ev.id) ?? 0))
    if (remaining <= 0) continue
    if (ev.paymentPlan?.length) {
      // Los pagos ya hechos cubren las cuotas en orden
      let covered = paid.get(ev.id) ?? 0
      for (const it of [...ev.paymentPlan].sort((a, b) => a.due.localeCompare(b.due))) {
        const due = Math.max(0, it.amount - covered)
        covered = Math.max(0, covered - it.amount)
        if (due <= 0) continue
        const date = it.due < T ? T : it.due // vencidos se esperan ya
        if (date <= end) out.push({ date, amount: due, kind: 'evento', label: `${it.label} · ${ev.title}`, refId: ev.id })
        remaining -= due
      }
    }
    if (remaining > 0.5) {
      const date = addDaysISO(ev.date, -7) < T ? T : addDaysISO(ev.date, -7)
      if (date <= end) out.push({ date, amount: remaining, kind: 'evento', label: `Liquidación · ${ev.title}`, refId: ev.id })
    }
  }

  for (const r of live(data.reservations)) {
    if (r.status === 'cancelada' || r.status === 'finalizada' || isBlock(r)) continue
    const remaining = Math.max(0, r.total - (paid.get(r.id) ?? 0))
    if (remaining <= 0) continue
    const date = r.source === 'airbnb' ? addDaysISO(r.checkIn, 1) : r.checkIn < T ? T : r.checkIn
    if (date <= end) out.push({ date, amount: remaining, kind: 'hospedaje', label: `${r.guestName} · ${data.units[r.unitId]?.name ?? ''}`, refId: r.id })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function projectionBuckets(inflows: Inflow[]) {
  const T = today()
  const sum = (d: number) => inflows.filter((i) => i.date <= addDaysISO(T, d)).reduce((n, i) => n + i.amount, 0)
  return { d30: sum(30), d60: sum(60), d90: sum(90) }
}

/** Cobros esperados por semana (12 semanas) separados por línea */
export function weeklyProjection(inflows: Inflow[], weeks = 12) {
  const T = today()
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDaysISO(T, i * 7)
    const to = addDaysISO(T, i * 7 + 6)
    const inWeek = inflows.filter((x) => x.date >= from && x.date <= to)
    return {
      label: i === 0 ? 'Esta sem.' : fmt(from, 'd MMM'),
      eventos: inWeek.filter((x) => x.kind === 'evento').reduce((n, x) => n + x.amount, 0),
      hospedaje: inWeek.filter((x) => x.kind === 'hospedaje').reduce((n, x) => n + x.amount, 0),
    }
  })
}

/** Gasto semanal promedio de los últimos 3 meses completos (gastos fijos recurrentes) */
export function avgWeeklyExpense(expenses: Expense[]) {
  const now = new Date()
  let total = 0
  let days = 0
  for (let i = 1; i <= 3; i++) {
    const key = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1))
    const b = monthBounds(key)
    total += expenses.filter((e) => e.date.startsWith(key)).reduce((n, e) => n + e.amount, 0)
    days += b.days
  }
  return days ? (total / days) * 7 : 0
}

/** Flujo de caja de las próximas 4 semanas */
export function cashflow4w(data: DataState, settings: Settings) {
  const inflows = expectedInflows(data, settings, 28)
  const weekly = avgWeeklyExpense(live(data.expenses))
  const T = today()
  let running = 0
  return Array.from({ length: 4 }, (_, i) => {
    const from = addDaysISO(T, i * 7)
    const to = addDaysISO(T, i * 7 + 6)
    const income = inflows.filter((x) => x.date >= from && x.date <= to).reduce((n, x) => n + x.amount, 0)
    running += income - weekly
    return { from, to, label: i === 0 ? 'Esta semana' : `Semana del ${fmt(from, 'd MMM')}`, income, out: weekly, net: income - weekly, running }
  })
}

// ── Rentabilidad por unidad (mes en curso) ───────────────
export function unitProfitability(data: DataState, key = today().slice(0, 7)) {
  const { from, to, days } = monthBounds(key)
  const res = live(data.reservations).filter((r) => r.status !== 'cancelada' && !isBlock(r))
  return live(data.units)
    .map((u) => {
      let n = 0
      let revenue = 0
      for (const r of res) {
        if (r.unitId !== u.id) continue
        const x = reservationInRange(r, from, to)
        n += x.nights
        revenue += x.revenue
      }
      return { unit: u, nights: n, revenue, occupancy: n / days, adr: n ? revenue / n : 0 }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

// ── Eventos del trimestre ────────────────────────────────
export function quarterEvents(data: DataState, settings: Settings) {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const from = toISODate(new Date(now.getFullYear(), q * 3, 1))
  const to = toISODate(new Date(now.getFullYear(), q * 3 + 3, 0))
  const paid = paidMap(live(data.payments))
  return live(data.events)
    .filter((e) => e.date >= from && e.date <= to && (e.status === 'realizado' || e.status === 'confirmado' || e.status === 'apartado'))
    .map((e) => ({ ev: e, total: eventTotal(e, settings.ivaPercent), paid: paid.get(e.id) ?? 0, perGuest: e.guests ? eventTotal(e, settings.ivaPercent) / e.guests : 0 }))
    .sort((a, b) => b.total - a.total)
    .map((x) => ({ ...x, quarter: `T${q + 1} ${now.getFullYear()}` }))
}

// ── Clientes que regresan ────────────────────────────────
export function returningGuests(data: DataState) {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const map = new Map<string, { name: string; phone?: string; stays: number; spent: number; last: string }>()
  for (const r of live(data.reservations)) {
    if (r.status === 'cancelada' || isBlock(r) || /^hu[eé]sped (airbnb|booking)/i.test(r.guestName)) continue
    const key = r.phone?.replace(/\D/g, '').slice(-10) || norm(r.guestName)
    const cur = map.get(key) ?? { name: r.guestName, phone: r.phone, stays: 0, spent: 0, last: r.checkIn }
    cur.stays++
    cur.spent += r.total
    if (r.checkIn > cur.last) cur.last = r.checkIn
    map.set(key, cur)
  }
  return [...map.values()].filter((g) => g.stays > 1).sort((a, b) => b.stays - a.stays || b.spent - a.spent)
}

// ── Reporte mensual (HTML imprimible) ────────────────────
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function monthReportHtml(data: DataState, settings: Settings, key = today().slice(0, 7), notes = '') {
  const { from, to, days } = monthBounds(key)
  const effectiveTo = to > today() ? today() : to
  const profit = monthProfit(data, key)
  const expenses = live(data.expenses).filter((e) => e.date.startsWith(key))
  const byCat = Object.entries(EXPENSE_CATEGORY)
    .map(([k, m]) => ({ label: m.label, value: expenses.filter((e) => e.category === k).reduce((n, e) => n + e.amount, 0) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
  const units = unitProfitability(data, key)
  const soldNights = units.reduce((n, u) => n + u.nights, 0)
  const available = days * Math.max(1, units.length)
  const lodgingRevenue = units.reduce((n, u) => n + u.revenue, 0)
  const adr = soldNights ? lodgingRevenue / soldNights : 0
  const revpar = lodgingRevenue / available
  const res = live(data.reservations).filter((r) => r.status !== 'cancelada' && !isBlock(r) && r.checkIn >= from && r.checkIn <= to)
  const byChannel = Object.entries(RES_SOURCE).map(([k, m]) => ({ label: m.label, n: res.filter((r) => r.source === k).length })).filter((x) => x.n)
  const events = live(data.events).filter((e) => e.date >= from && e.date <= effectiveTo && (e.status === 'realizado' || e.status === 'confirmado'))
  const incidents = live(data.tasks).filter((t) => t.type === 'mantenimiento' && localDay(t.createdAt).slice(0, 7) === key)
  const openIncidents = incidents.filter((t) => t.status === 'pendiente' || t.status === 'en-progreso')
  const monthName = fmt(from, "MMMM 'de' yyyy")
  const row = (a: string, b: string, cls = '') => `<tr class="${cls}"><td>${a}</td><td class="r">${b}</td></tr>`

  return `
    <div class="brand"><div><h1>Reporte de ${esc(monthName)}</h1><div class="muted">${esc(settings.ranchName)} · ${esc(settings.address)}</div></div>
    <div style="text-align:right"><span class="pill">Resumen ejecutivo</span><div class="muted" style="margin-top:6px">Generado el ${esc(fmt(new Date(), "d 'de' MMMM yyyy, HH:mm"))}</div></div></div>

    <table style="margin-top:6px"><tr>
      <td style="border:0;padding:0 18px 0 0"><div class="muted">Ingresos</div><div style="font-family:Fraunces,Georgia,serif;font-size:30px;font-weight:300">${money.format(profit.income)}</div></td>
      <td style="border:0;padding:0 18px"><div class="muted">Gastos</div><div style="font-family:Fraunces,Georgia,serif;font-size:30px;font-weight:300">${money.format(profit.spent)}</div></td>
      <td style="border:0;padding:0 18px"><div class="muted">Utilidad</div><div style="font-family:Fraunces,Georgia,serif;font-size:30px;font-weight:300;color:#B04D3D">${money.format(profit.profit)}</div></td>
      <td style="border:0;padding:0 0 0 18px"><div class="muted">Margen</div><div style="font-family:Fraunces,Georgia,serif;font-size:30px;font-weight:300">${Math.round(profit.margin * 100)}%</div></td>
    </tr></table>

    <h2>Ingresos por línea</h2>
    <table>${row('Hospedaje (cabañas y casas)', money.format(profit.incomeLodging))}${row('Salón y jardín (eventos)', money.format(profit.incomeEvents))}${row('Total', money.format(profit.income), 'tot')}</table>

    <h2>Gastos por categoría</h2>
    <table>${byCat.length ? byCat.map((c) => row(esc(c.label), money.format(c.value))).join('') : row('Sin gastos registrados', '—')}${row('Total', money.format(profit.spent), 'tot')}</table>

    <h2>Hospedaje</h2>
    <table>
      ${row('Ocupación del mes', `${Math.round((soldNights / available) * 100)}% · ${soldNights} de ${available} noches`)}
      ${row('Tarifa promedio por noche (ADR)', money.format(adr))}
      ${row('Ingreso por unidad disponible (RevPAR)', money.format(revpar))}
      ${row('Reservas con llegada en el mes', String(res.length))}
    </table>
    <table style="margin-top:10px"><tr><th>Unidad</th><th class="r">Noches</th><th class="r">Ocupación</th><th class="r">Ingreso</th></tr>
      ${units.map((u) => `<tr><td>${esc(u.unit.name)}</td><td class="r">${u.nights}</td><td class="r">${Math.round(u.occupancy * 100)}%</td><td class="r">${money.format(u.revenue)}</td></tr>`).join('')}
    </table>

    <h2>Reservas por canal</h2>
    <table>${byChannel.length ? byChannel.map((c) => row(esc(c.label), String(c.n))).join('') : row('Sin reservas', '—')}</table>

    <h2>Eventos del mes</h2>
    <table><tr><th>Fecha</th><th>Evento</th><th class="r">Invitados</th><th class="r">Total</th></tr>
      ${events.length ? events.map((e: RanchEvent) => `<tr><td>${esc(fmt(e.date, 'd MMM'))}</td><td>${esc(e.title)}</td><td class="r">${e.guests}</td><td class="r">${money.format(eventTotal(e, settings.ivaPercent))}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">Sin eventos realizados o confirmados en el mes.</td></tr>'}
    </table>

    <h2>Mantenimiento e incidencias</h2>
    <table>${row('Incidencias reportadas en el mes', String(incidents.length))}${row('Siguen abiertas', String(openIncidents.length))}</table>
    ${openIncidents.length ? `<p class="muted">${openIncidents.map((t) => esc(t.title)).join(' · ')}</p>` : ''}

    ${notes.trim() ? `<h2>Notas</h2><p>${esc(notes).replace(/\n/g, '<br/>')}</p>` : ''}
    <p class="muted" style="margin-top:28px">Datos de ${esc(fmt(from, "d 'de' MMMM"))} al ${esc(fmt(effectiveTo, "d 'de' MMMM yyyy"))}. Ingresos = pagos recibidos; gastos = egresos registrados.</p>
  `
}

export const monthOptions = (count = 6) => {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { key: monthKeyOf(d), label: fmt(d, "MMMM yyyy") }
  })
}

export const isoWeekday = (iso: string) => parseISO(iso).getDay()

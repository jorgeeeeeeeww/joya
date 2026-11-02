// Centro de control · panel de administración (step1, atmósfera Flor).
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { parseISO } from 'date-fns'
import {
  ArrowRight,
  BedDouble,
  CalendarHeart,
  CloudRain,
  CloudSun,
  ListChecks,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Receipt,
  Sun,
} from 'lucide-react'
import { useStore, type StoreState } from '@/lib/store'
import { computeAlerts, eventTotal } from '@/lib/automations'
import { EVENT_STATUS, EVENT_TYPE, TONE, VENUE } from '@/lib/meta'
import { addDaysISO, capitalize, compactMxn, fmt, fmtDate, fmtDateLong, localDay, mxn, relativeDay, today } from '@/lib/format'
import { useWeather, weatherLabel } from '@/lib/weather'
import { fadeRise, stagger } from '@/lib/motion'
import type { Pastel, RanchEvent } from '@/lib/types'
import { Sparkline } from '@/components/charts'
import { Avatar, Button, Card, CardHeader, cx, Dot, Estela, ProgressBar, Stat } from '@/components/ui'
import { FlipCard } from '@/components/interact'
import { ActivityToday, MoneyWeek, Occupancy7 } from '@/components/owner/OwnerToday'
import { CountUp, NightSlab, Sparkle } from '@/components/step1'
import { RanchoScene } from '@/components/scenes'
import { CleaningSheet } from '@/components/stays/CleaningFlow'


interface AgendaItem {
  id: string
  time: string
  title: string
  sub: string
  tone: Pastel
  icon: typeof LogIn
  to: string
}

function Section({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeRise} className={className}>
      {children}
    </motion.div>
  )
}

export default function Dashboard() {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const navigate = useNavigate()
  const weather = useWeather()
  const T = today()
  const M = addDaysISO(T, 1)

  const units = useMemo(() => Object.values(data.units).filter((u) => !u.deleted).sort((a, b) => a.mapId.localeCompare(b.mapId)), [data.units])
  const reservations = useMemo(() => Object.values(data.reservations).filter((r) => !r.deleted && r.status !== 'cancelada'), [data.reservations])
  const events = useMemo(() => Object.values(data.events).filter((e) => !e.deleted && e.status !== 'cancelado'), [data.events])
  const payments = useMemo(() => Object.values(data.payments).filter((p) => !p.deleted), [data.payments])
  const tasks = useMemo(() => Object.values(data.tasks).filter((t) => !t.deleted), [data.tasks])
  const employees = useMemo(() => Object.values(data.employees).filter((e) => !e.deleted && e.active), [data.employees])
  const alerts = useMemo(() => computeAlerts({ data, settings } as unknown as StoreState), [data, settings])
  const paidFor = (id: string) => payments.filter((p) => p.refId === id).reduce((n, p) => n + p.amount, 0)

  // ── Pulso de hoy ──
  const occupied = units.filter((u) => u.status === 'ocupada').length
  const arrivals = reservations.filter((r) => r.checkIn === T && r.guests > 0)
  const departures = reservations.filter((r) => r.checkOut === T && (r.status === 'en-casa' || r.status === 'finalizada'))
  const eventsToday = events.filter((e) => e.date === T)

  // ── Dinero ──
  const month = T.slice(0, 7)
  const prevMonthDate = new Date()
  prevMonthDate.setDate(1)
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`
  const dayOfMonth = Number(T.slice(8, 10))
  const incomeMonth = payments.filter((p) => p.date.startsWith(month)).reduce((n, p) => n + p.amount, 0)
  const incomePrevToDate = payments.filter((p) => p.date.startsWith(prevMonth) && Number(p.date.slice(8, 10)) <= dayOfMonth).reduce((n, p) => n + p.amount, 0)
  const incomeDelta = incomePrevToDate ? (incomeMonth - incomePrevToDate) / incomePrevToDate : 0
  const upcoming = events.filter((e) => e.date >= T).sort((a, b) => a.date.localeCompare(b.date))
  const receivable = upcoming
    .filter((e) => e.status === 'apartado' || e.status === 'confirmado')
    .reduce((n, e) => n + Math.max(0, eventTotal(e, settings.ivaPercent) - paidFor(e.id)), 0)
  const next30Res = reservations.filter((r) => r.checkIn > T && r.checkIn <= addDaysISO(T, 30) && r.guests > 0).length
  // Minigráficas de los indicadores: ingresos por día (últimos 21 días) y llegadas por día (próximos 21)
  const incomeSpark = Array.from({ length: 21 }, (_, i) => {
    const d = addDaysISO(T, i - 20)
    return payments.filter((p) => p.date === d).reduce((n, p) => n + p.amount, 0)
  })
  const arrivalsSpark = Array.from({ length: 21 }, (_, i) => {
    const d = addDaysISO(T, i + 1)
    return reservations.filter((r) => r.checkIn === d && r.guests > 0).length
  })
  const eventsMonth = events.filter((e) => e.date.startsWith(month)).length

  // ── Agenda unificada (hoy y mañana) ──
  const agenda = useMemo(() => {
    const build = (day: string): AgendaItem[] => {
      const items: AgendaItem[] = []
      for (const r of reservations) {
        const unit = data.units[r.unitId]
        if (!unit || r.guests === 0) continue
        if (r.checkIn === day && (r.status === 'confirmada' || r.status === 'pendiente' || r.status === 'en-casa'))
          items.push({ id: 'in' + r.id, time: r.arrivalTime ?? settings.checkInTime, title: `Llega ${r.guestName.split(' ').slice(0, 2).join(' ')}`, sub: `${unit.name} · ${r.guests} huéspedes`, tone: 'sky', icon: LogIn, to: `/hospedaje?r=${r.id}` })
        if (r.checkOut === day && (r.status === 'en-casa' || r.status === 'finalizada'))
          items.push({ id: 'out' + r.id, time: settings.checkOutTime, title: `Sale ${r.guestName.split(' ').slice(0, 2).join(' ')}`, sub: `${unit.name} · limpieza automática`, tone: 'peach', icon: LogOut, to: `/hospedaje?r=${r.id}` })
      }
      for (const e of events)
        if (e.date === day) items.push({ id: 'ev' + e.id, time: e.startTime, title: e.title, sub: `${VENUE[e.venue].label} · ${e.guests} invitados`, tone: EVENT_TYPE[e.type].tone, icon: EVENT_TYPE[e.type].icon, to: `/eventos/${e.id}` })
      for (const t of tasks)
        if (t.due?.slice(0, 10) === day && (t.status === 'pendiente' || t.status === 'en-progreso')) {
          const who = t.assigneeId ? data.employees[t.assigneeId] : undefined
          items.push({ id: 'tk' + t.id, time: fmt(t.due, 'HH:mm'), title: t.title, sub: who ? who.name.split(' ')[0]! : 'Sin asignar', tone: t.status === 'en-progreso' ? 'butter' : 'mint', icon: ListChecks, to: `/tareas?t=${t.id}` })
        }
      return items.sort((a, b) => a.time.localeCompare(b.time))
    }
    return [
      { label: 'Hoy', day: T, items: build(T) },
      { label: 'Mañana', day: M, items: build(M) },
    ]
  }, [reservations, events, tasks, data.units, data.employees, settings.checkInTime, settings.checkOutTime, T, M])

  // ── Equipo en vivo ──
  const team = useMemo(
    () =>
      employees
        .filter((e) => e.role !== 'admin')
        .map((e) => {
          const mine = tasks.filter((t) => t.assigneeId === e.id)
          const doing = mine.find((t) => t.status === 'en-progreso')
          const next = mine.filter((t) => t.status === 'pendiente').sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))[0]
          const doneToday = mine.filter((t) => (t.status === 'hecha' || t.status === 'verificada') && localDay(t.completedAt) === T).length
          const mins = doing?.startedAt ? Math.max(1, Math.round((Date.now() - new Date(doing.startedAt).getTime()) / 60000)) : 0
          return { e, doing, next, doneToday, mins, open: mine.filter((t) => t.status === 'pendiente' || t.status === 'en-progreso').length }
        }),
    [employees, tasks, T],
  )

  // ── Disponibilidad de los próximos 8 sábados ──
  const weekends = useMemo(() => {
    const d = parseISO(T)
    const toSat = (6 - d.getDay() + 7) % 7
    return Array.from({ length: 8 }, (_, i) => {
      const sat = addDaysISO(T, toSat + i * 7)
      const ev = (v: RanchEvent['venue']) => events.find((e) => e.date >= addDaysISO(sat, -1) && e.date <= addDaysISO(sat, 1) && e.venue === v && e.status !== 'prospecto')
      const freeUnits = units.filter((u) => !reservations.some((r) => r.unitId === u.id && r.checkIn <= sat && r.checkOut > sat)).length
      return { sat, salon: ev('salon'), jardin: ev('jardin'), freeUnits }
    })
  }, [T, events, units, reservations])

  // ── Embudo de eventos ──
  const funnel = useMemo(() => {
    const stages: RanchEvent['status'][] = ['prospecto', 'cotizado', 'apartado', 'confirmado']
    const rows = stages.map((s) => {
      const list = upcoming.filter((e) => e.status === s)
      return { s, count: list.length, value: list.reduce((n, e) => n + eventTotal(e, settings.ivaPercent), 0) }
    })
    const max = Math.max(1, ...rows.map((r) => r.value))
    return { rows, max, total: rows.reduce((n, r) => n + r.value, 0) }
  }, [upcoming, settings.ivaPercent])

  const rainEvents = upcoming
    .filter((e) => e.venue === 'jardin')
    .map((e) => ({ e, w: weather?.daily.find((d) => d.date === e.date) }))
    .filter((x) => x.w && x.w.rain >= 30)

  const WeatherIcon = !weather ? Sun : weather.code >= 51 ? CloudRain : weather.code <= 1 ? (new Date().getHours() >= 19 ? Moon : Sun) : CloudSun

  const [reviewTask, setReviewTask] = useState<string>()

  // ── Te toca decidir: una sola lista vertical, una entrada por casa o evento ──
  const toReview = useMemo(() => tasks.filter((t) => t.type === 'limpieza' && t.status === 'hecha'), [tasks])
  const toBuy = useMemo(() => tasks.filter((t) => t.type === 'compra' && (t.status === 'pendiente' || t.status === 'en-progreso')), [tasks])
  const decisions = useMemo(() => {
    const out: { id: string; tone: Pastel; title: string; body: string; action: string; to?: string; review?: string }[] = []
    for (const t of toReview) {
      const u = t.unitId ? data.units[t.unitId] : undefined
      out.push({ id: 'rv' + t.id, tone: 'sage', title: `Revisar ${u?.name ?? t.title}`, body: `${t.photoIds.length ? `${t.photoIds.length} ${t.photoIds.length === 1 ? 'foto' : 'fotos'} de evidencia · ` : ''}Limpieza terminada; falta tu visto bueno para liberarla.`, action: 'Revisar', review: t.id })
    }
    // Avisos de la misma casa se juntan en uno (antes salían dos tarjetas para la misma casa)
    const byKey = new Map<string, (typeof out)[number]>()
    // Llegadas y salidas son información (van en el resumen); solo se suman si la casa ya tiene un pendiente
    const info = (a: (typeof alerts)[number]) => a.id.startsWith('ci') || a.id.startsWith('co')
    const actionable = alerts.filter((a) => !info(a) && !(a.link === '/inventario' && toBuy.length))
    for (const a of actionable) {
      const place = a.title.includes(' · ') ? a.title.split(' · ')[1]! : a.title.replace(/ aún no está lista$/, '')
      const key = a.link === '/hospedaje' || a.link === '/limpieza' ? place : a.id
      const prev = byKey.get(key)
      if (prev) {
        if (!prev.body.includes(a.body)) prev.body = `${prev.body} ${a.body}`
        if (a.tone === 'rose') prev.tone = 'rose'
        if (/no está lista/.test(a.title)) prev.title = a.title
      } else byKey.set(key, { id: a.id, tone: a.tone, title: a.title, body: a.body, action: 'Ver', to: a.link || '/' })
    }
    out.push(...byKey.values())
    for (const { e, w } of rainEvents) out.push({ id: 'rain' + e.id, tone: 'sky', title: `Posible lluvia · ${e.title}`, body: `${w!.rain}% el ${fmtDate(e.date)} en el jardín. Conviene tener la carpa lista.`, action: 'Ver evento', to: `/eventos/${e.id}` })
    for (const t of toBuy) out.push({ id: 'buy' + t.id, tone: 'butter', title: t.title, body: t.checklist.map((c) => c.text).join(', ') || t.notes || 'Compra pendiente', action: 'Ver compra', to: `/tareas?t=${t.id}` })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toReview, toBuy, alerts, weather, data.units])

  // ── Te cuento el día: frases armadas con los datos ──
  const nextEv = upcoming.find((e) => e.date >= T && (e.status === 'apartado' || e.status === 'confirmado'))
  const briefing: string[] = []
  {
    const ins = arrivals.map((r) => `${data.units[r.unitId]?.name ?? 'una casa'}${r.arrivalTime ? ` (${r.arrivalTime})` : ''}`)
    briefing.push(arrivals.length ? `Hoy ${arrivals.length === 1 ? 'llega 1 reserva' : `llegan ${arrivals.length} reservas`}: ${ins.join(' y ')}.` : 'Hoy no llega ningún huésped.')
    const notReady = alerts.filter((a) => / aún no está lista$/.test(a.title)).map((a) => a.title.replace(/ aún no está lista$/, ''))
    if (notReady.length) briefing.push(`${notReady.join(' y ')} ${notReady.length === 1 ? 'todavía no está lista' : 'todavía no están listas'}.`)
    if (departures.length) briefing.push(`${departures.length === 1 ? 'Sale 1 reserva' : `Salen ${departures.length} reservas`}; su limpieza ya está asignada.`)
    briefing.push(eventsToday.length ? `Hoy hay evento: ${eventsToday.map((e) => e.title).join(' y ')}.` : nextEv ? `El próximo evento es ${nextEv.title}, ${relativeDay(nextEv.date).toLowerCase()}.` : 'No hay eventos apartados.')
  }
  const verdict = decisions.length ? `${decisions.length} ${decisions.length === 1 ? 'cosa necesita' : 'cosas necesitan'} tu decisión` : 'Todo en orden hoy'

  const tomorrow = agenda[1]!
  const tomorrowNode = (
    <Card className="h-full">
      <CardHeader eyebrow="Mañana" title={capitalize(fmt(tomorrow.day, "EEEE d 'de' MMMM"))} subtitle={`${tomorrow.items.length} cosas agendadas`} />
      <ol className="flex flex-col gap-0.5 p-3 md:p-4">
        {tomorrow.items.length === 0 && <li className="rounded-[12px] bg-sunken px-4 py-3 text-sm text-ink-soft">Día tranquilo. Nada agendado.</li>}
        {tomorrow.items.map((it) => {
          const Icon = it.icon
          return (
            <li key={it.id}>
              <Link to={it.to} className="flex items-start gap-3 rounded-[12px] px-2 py-2 hover:bg-wash">
                <span className="w-11 shrink-0 pt-0.5 text-right text-xs text-ink-soft tabular">{it.time}</span>
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[it.tone].solid)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <Icon size={13} strokeWidth={1.6} className="shrink-0 text-ink-soft" />
                    <span className="truncate text-[14px] font-medium">{it.title}</span>
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-soft">{it.sub}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </Card>
  )

  const teamNode = (
    <Card className="h-full">
      <CardHeader eyebrow="Equipo" title="En este momento" subtitle={`${team.filter((t) => t.doing).length} personas trabajando`} action={<Link to="/equipo" className="pressable inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink">Ver equipo <ArrowRight size={15} strokeWidth={1.6} /></Link>} />
      <ul className="flex flex-col gap-1 p-3 md:p-4">
        {team.map(({ e, doing, next, doneToday, mins, open }) => (
          <li key={e.id} className="flex items-center gap-3 rounded-[14px] px-2 py-2.5">
            <span className="relative">
              <Avatar name={e.name} tone={e.color} size={40} />
              <span className={cx('absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-surface', doing ? 'bg-success' : open ? 'bg-chispa-soft' : 'bg-line-strong')} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{e.name}</span>
              <span className="block truncate text-[13px] text-ink-soft">{doing ? `${doing.title} · ${mins} min` : next ? `Sigue: ${next.title}` : 'Sin pendientes'}</span>
            </span>
            <span className="text-right">
              <span className="block text-xl font-semibold tabular">{doneToday}</span>
              <span className="block text-[11px] text-ink-3">hechas hoy</span>
            </span>
          </li>
        ))}
        {team.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-soft">Agrega a tu equipo en la sección Equipo.</li>}
      </ul>
    </Card>
  )

  // Indicadores que se voltean para ver el desglose
  const monthPayments = payments.filter((p) => p.date.startsWith(month))
  const back = (title: string, rows: { label: string; value: string }[], to: string) => (
    <Card className="flex h-full flex-col p-4 md:p-5">
      <span className="kicker">{title}</span>
      <ul className="mt-2 flex flex-1 flex-col gap-1.5 text-[13px]">
        {rows.length === 0 && <li className="text-ink-3">Sin datos todavía.</li>}
        {rows.slice(0, 4).map((r) => (
          <li key={r.label} className="flex justify-between gap-2">
            <span className="truncate text-ink-soft">{r.label}</span>
            <span className="shrink-0 font-medium tabular">{r.value}</span>
          </li>
        ))}
      </ul>
      <Link to={to} data-noflip className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
        Ver detalle <ArrowRight size={13} strokeWidth={1.7} />
      </Link>
    </Card>
  )
  const kpisNode = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:gap-4">
      <FlipCard
        front={<Stat label="Ingresos del mes" value={<CountUp value={incomeMonth} format={compactMxn} />} accent delta={incomePrevToDate && dayOfMonth >= 7 ? { value: `${incomeDelta >= 0 ? '+' : ''}${Math.round(incomeDelta * 100)}%`, good: incomeDelta >= 0 } : undefined} sub={dayOfMonth >= 7 ? `vs. mismos ${dayOfMonth} días del mes pasado` : 'Toca para ver el desglose'} spark={<Sparkline values={incomeSpark} tone="peach" highlight={3} />} />}
        back={back('Ingresos del mes', [{ label: 'Hospedaje', value: compactMxn(monthPayments.filter((p) => p.refType === 'reserva').reduce((n, p) => n + p.amount, 0)) }, { label: 'Eventos', value: compactMxn(monthPayments.filter((p) => p.refType === 'evento').reduce((n, p) => n + p.amount, 0)) }, { label: 'Pagos recibidos', value: String(monthPayments.length) }], '/finanzas')}
      />
      <FlipCard
        front={<Stat label="Por cobrar" value={<CountUp value={receivable} format={compactMxn} />} sub="Toca para ver quién debe" tone="butter" icon={<Receipt size={16} strokeWidth={1.6} />} />}
        back={back('Por cobrar', upcoming.filter((e) => e.status === 'apartado' || e.status === 'confirmado').map((e) => ({ label: e.title, value: compactMxn(Math.max(0, eventTotal(e, settings.ivaPercent) - paidFor(e.id))) })).filter((r) => r.value !== '$0'), '/eventos?vista=lista')}
      />
      <FlipCard
        front={<Stat label="Reservas próximas" value={<CountUp value={next30Res} />} sub="Llegadas en 30 días" tone="sky" icon={<BedDouble size={16} strokeWidth={1.6} />} spark={<Sparkline values={arrivalsSpark} tone="sky" highlight={7} />} />}
        back={back('Siguientes llegadas', reservations.filter((r) => r.checkIn > T && r.guests > 0).sort((a, b) => a.checkIn.localeCompare(b.checkIn)).map((r) => ({ label: `${r.guestName.split(' ')[0]} · ${data.units[r.unitId]?.short ?? ''}`, value: fmtDate(r.checkIn) })), '/hospedaje')}
      />
      <FlipCard
        front={<Stat label="Eventos del mes" value={<CountUp value={eventsMonth} />} sub={capitalize(fmt(T, 'MMMM'))} tone="rose" icon={<CalendarHeart size={16} strokeWidth={1.6} />} />}
        back={back('Este mes', events.filter((e) => e.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({ label: e.title, value: fmtDate(e.date) })), '/eventos')}
      />
    </div>
  )

  const weekendsNode = (
    <Card className="h-full">
      <CardHeader eyebrow="Disponibilidad" title="Próximos sábados" subtitle="Lo que más se vende: salón, jardín y hospedaje" action={<Link to="/eventos" className="pressable inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink">Calendario <ArrowRight size={15} strokeWidth={1.6} /></Link>} />
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 md:p-6">
        {weekends.map((w) => {
          const d = parseISO(w.sat)
          const allFree = !w.salon && !w.jardin
          return (
            <div key={w.sat} className={cx('rounded-[16px] p-3.5 ring-1 ring-line', allFree ? 'bg-[color-mix(in_oklab,var(--luz)_26%,var(--surface))]' : 'bg-sunken')}>
              <div className="flex items-baseline justify-between">
                <span className="text-[1.6rem] font-semibold tabular">{d.getDate()}</span>
                <span className="text-xs text-ink-soft capitalize">{fmt(w.sat, 'MMM')}</span>
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5 text-xs">
                {(['salon', 'jardin'] as const).map((v) => {
                  const ev = w[v]
                  return ev ? (
                    <Link key={v} to={`/eventos/${ev.id}`} className="flex items-center gap-1.5 truncate text-ink-soft hover:text-ink" title={ev.title}>
                      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', TONE[EVENT_STATUS[ev.status].tone].solid)} />
                      <span className="truncate">
                        {VENUE[v].label}: {ev.title}
                      </span>
                    </Link>
                  ) : (
                    <Link key={v} to={`/eventos?nuevo=${v}`} className="flex items-center gap-1.5 text-success hover:underline">
                      <Sparkle className="text-[9px]" /> {VENUE[v].label} libre
                    </Link>
                  )
                })}
                <span className="flex items-center gap-1.5 text-ink-soft">
                  <BedDouble size={12} strokeWidth={1.6} /> {w.freeUnits}/{units.length} libres
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
  const funnelNode = (
    <Card className="h-full">
      <CardHeader eyebrow="Ventas" title="Embudo de eventos" subtitle={`${mxn(funnel.total)} en juego`} />
      <div className="flex flex-col gap-4 p-5 md:p-6">
        {funnel.rows.map((r) => (
          <Link key={r.s} to={r.s === 'prospecto' || r.s === 'cotizado' ? '/eventos?vista=prospectos' : '/eventos'} className="group block">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-sm">
                <span className={cx('h-2 w-2 rounded-full', TONE[EVENT_STATUS[r.s].tone].solid)} />
                {EVENT_STATUS[r.s].label}
                <span className="text-ink-3">· {r.count}</span>
              </span>
              <span className="text-sm text-ink-soft tabular group-hover:text-ink">{compactMxn(r.value)}</span>
            </div>
            <ProgressBar value={r.value / funnel.max} />
          </Link>
        ))}
        <Estela className="my-1" />
        <Link to="/eventos?vista=prospectos" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
          Seguimiento de prospectos <ArrowRight size={14} strokeWidth={1.6} />
        </Link>
      </div>
    </Card>
  )

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* ── El veredicto del día ── */}
      <Section>
        <NightSlab scene={<RanchoScene />} className="px-5 pt-7 pb-24 sm:px-9 sm:pt-9 md:pb-28 xl:px-12" luzSize="clamp(48px, 9vw, 120px)" luzClassName="absolute top-[6%] right-[5%]">
          <p className="eyebrow !text-on-night-soft">
            {capitalize(fmtDateLong(T))}
            {weather && (
              <span className="ml-1.5 inline-flex items-center gap-1.5 tracking-normal normal-case">
                · <WeatherIcon size={14} strokeWidth={1.6} className="text-luz" /> {weather.temp}° {weatherLabel(weather.code).toLowerCase()}
              </span>
            )}
          </p>
          <h1 className="heading mt-3 max-w-[18ch] pr-14 text-[clamp(2.1rem,1.6rem+2.4vw,3.6rem)] leading-[1.04] text-on-night">{verdict}</h1>
          <ul className="mt-4 flex max-w-[62ch] flex-col gap-1.5 text-[16px] leading-snug text-on-night-soft">
            {briefing.map((l) => (
              <li key={l} className="flex gap-2.5">
                <Sparkle className="mt-[3px] text-[10px] text-luz" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
          <div className="mt-7 grid max-w-[720px] grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {[
              { label: 'Ocupación', value: `${occupied}/${units.length}`, to: '/hospedaje' },
              { label: 'Llegadas', value: String(arrivals.length), to: '/hospedaje' },
              { label: 'Salidas', value: String(departures.length), to: '/hospedaje' },
              { label: 'Eventos hoy', value: String(eventsToday.length), to: '/eventos' },
            ].map((k) => (
              <Link key={k.label} to={k.to} className="group rounded-[14px]">
                <div className="text-[13px] text-on-night-soft">{k.label}</div>
                <div className="display-num mt-1 text-[2.4rem] leading-none text-on-night transition-transform duration-[var(--dur-3)] group-hover:-translate-y-0.5">{k.value}</div>
              </Link>
            ))}
          </div>
          <div className="mt-7 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
            <Button variant="luz" icon={<Plus size={18} strokeWidth={1.6} />} onClick={() => navigate('/hospedaje')}>
              Nueva reserva
            </Button>
            <Button variant="ghost" className="!text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_28%,transparent)] ring-inset hover:!bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)]" icon={<CalendarHeart size={18} strokeWidth={1.6} />} onClick={() => navigate('/eventos?nuevo=salon')}>
              Nuevo evento
            </Button>
          </div>
        </NightSlab>
      </Section>

      {/* ── Te toca decidir ── */}
      <Section>
        <Card>
          <CardHeader eyebrow="Te toca decidir" title={decisions.length ? `${decisions.length} ${decisions.length === 1 ? 'pendiente' : 'pendientes'}` : 'Nada pendiente'} subtitle="Limpiezas por revisar, avisos de hoy y compras" />
          <ul className="flex flex-col gap-2 p-3 md:p-4">
            {decisions.length === 0 && (
              <li className="flex items-center gap-3 rounded-[16px] bg-sunken/60 p-4 text-[15px] text-ink-soft">
                <Sparkle className="text-chispa-soft" /> Todo en orden. Te avisamos cuando algo necesite tu decisión.
              </li>
            )}
            {decisions.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-[16px] bg-surface p-3 ring-1 ring-line">
                <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-[12px]', TONE[d.tone].soft)}>
                  <Dot tone={d.tone} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug font-semibold">{d.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{d.body}</span>
                </span>
                {d.review ? (
                  <Button size="sm" variant="tinta" className="shrink-0" onClick={() => setReviewTask(d.review)}>
                    {d.action}
                  </Button>
                ) : (
                  <Link to={d.to!} className="pressable inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ring-1 ring-line-strong ring-inset hover:bg-wash">
                    {d.action}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {/* ── Lo que pasó hoy, el dinero y la ocupación de la semana ── */}
      <Section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <ActivityToday data={data} />
        <MoneyWeek data={data} />
      </Section>
      <Section>
        <Occupancy7 data={data} />
      </Section>

      {/* ── El mes ── */}
      <Section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <h2 className="heading text-[1.7rem] leading-none">El mes</h2>
          <Link to="/finanzas" className="pressable inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink">
            Ver el negocio completo <ArrowRight size={15} strokeWidth={1.6} />
          </Link>
        </div>
        {kpisNode}
      </Section>

      {/* ── Equipo y mañana ── */}
      <Section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {teamNode}
        {tomorrowNode}
      </Section>

      {/* ── Eventos ── */}
      <Section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {weekendsNode}
        {funnelNode}
      </Section>

      <CleaningSheet taskId={reviewTask} onClose={() => setReviewTask(undefined)} />
    </motion.div>
  )
}

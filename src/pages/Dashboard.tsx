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
  SlidersHorizontal,
  Sun,
} from 'lucide-react'
import { useMe, useStore, type StoreState } from '@/lib/store'
import { computeAlerts, eventTotal } from '@/lib/automations'
import { EVENT_STATUS, EVENT_TYPE, RES_SOURCE, TONE, VENUE } from '@/lib/meta'
import { addDaysISO, capitalize, compactMxn, fmt, fmtDate, fmtDateLong, greeting, localDay, mxn, pct, today } from '@/lib/format'
import { useWeather, weatherLabel } from '@/lib/weather'
import { ease, fadeRise, stagger } from '@/lib/motion'
import type { Pastel, RanchEvent } from '@/lib/types'
import { AreaChart, BarChart, Donut, Legend, Sparkline } from '@/components/charts'
import { Avatar, Button, Card, CardHeader, cx, Dot, Empty, Estela, IconBubble, ProgressBar, ProgressRing, Segmented, Stat } from '@/components/ui'
import { FlipCard } from '@/components/interact'
import { DayLine } from '@/components/home/DayLine'
import { CustomizeSheet, HomeGrid, useHomeLayout, type HomeBlock } from '@/components/home/HomeLayout'
import { CountUp, NightSlab, Sparkle } from '@/components/step1'
import { OwnerOverview } from '@/components/owner/OwnerOverview'

type HomeTab = 'hoy' | 'negocio' | 'eventos'

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
  const me = useMe()
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
  const openTasksToday = tasks.filter((t) => (t.status === 'pendiente' || t.status === 'en-progreso') && t.due && t.due.slice(0, 10) <= T)

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

  const incomeSeries = useMemo(() => {
    const out: { label: string; hospedaje: number; eventos: number }[] = []
    const d = new Date()
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
      const ps = payments.filter((p) => p.date.startsWith(key))
      out.push({ label: fmt(m, 'MMM'), hospedaje: ps.filter((p) => p.refType === 'reserva').reduce((n, p) => n + p.amount, 0), eventos: ps.filter((p) => p.refType === 'evento').reduce((n, p) => n + p.amount, 0) })
    }
    return out
  }, [payments])

  const occupancy = useMemo(() => {
    const out: { label: string; value: number }[] = []
    for (let i = -7; i <= 14; i++) {
      const day = addDaysISO(T, i)
      const occ = new Set(reservations.filter((r) => r.checkIn <= day && r.checkOut > day).map((r) => r.unitId)).size
      out.push({ label: i === 0 ? 'Hoy' : fmt(day, 'd MMM'), value: Math.round((occ / Math.max(1, units.length)) * 100) })
    }
    return out
  }, [reservations, units.length, T])

  const sources = useMemo(() => {
    const since = addDaysISO(T, -90)
    const recent = reservations.filter((r) => r.checkIn >= since && r.guests > 0)
    return (Object.keys(RES_SOURCE) as (keyof typeof RES_SOURCE)[]).map((k) => ({ label: RES_SOURCE[k].label, tone: RES_SOURCE[k].tone, value: recent.filter((r) => r.source === k).length }))
  }, [reservations, T])

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
      const ev = (v: RanchEvent['venue']) => events.find((e) => e.date === sat && e.venue === v && e.status !== 'prospecto')
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

  const [tab, setTabState] = useState<HomeTab>(() => {
    try {
      return (localStorage.getItem('lajoya:homeTab') as HomeTab) || 'hoy'
    } catch {
      return 'hoy'
    }
  })
  const setTab = (v: HomeTab) => {
    setTabState(v)
    try {
      localStorage.setItem('lajoya:homeTab', v)
    } catch {
      /* sin almacenamiento */
    }
  }
  const [customize, setCustomize] = useState(false)

  const alertsNode =
    alerts.length > 0 || rainEvents.length > 0 ? (
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:px-0">
        {rainEvents.map(({ e, w }) => (
          <Link key={'rain' + e.id} to={`/eventos/${e.id}`} className="glass lift pressable flex w-[290px] shrink-0 snap-start items-start gap-3 rounded-[var(--r-lg)] p-4 ring-1 ring-line">
            <IconBubble tone="sky" size="sm">
              <CloudRain size={16} strokeWidth={1.6} />
            </IconBubble>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">Posible lluvia · {e.title}</span>
              <span className="mt-0.5 block text-sm text-ink-soft">
                {w!.rain}% el {fmtDate(e.date)} en el jardín. Conviene tener carpa lista.
              </span>
            </span>
          </Link>
        ))}
        {alerts.map((a) => (
          <Link key={a.id} to={a.link || '/'} className="glass lift pressable flex w-[290px] shrink-0 snap-start items-start gap-3 rounded-[var(--r-lg)] p-4 ring-1 ring-line">
            <Dot tone={a.tone} pulse className="mt-1.5" />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{a.title}</span>
              <span className="mt-0.5 line-clamp-2 block text-sm text-ink-soft">{a.body}</span>
            </span>
          </Link>
        ))}
      </div>
    ) : null

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
      <CardHeader eyebrow="Equipo" title="En este momento" subtitle={`${team.filter((t) => t.doing).length} personas trabajando`} action={<Link to="/equipo" className="pressable inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink">Ver <ArrowRight size={15} strokeWidth={1.6} /></Link>} />
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

  const incomeNode = (
    <Card className="h-full">
      <CardHeader eyebrow="Finanzas" title="Ingresos por mes" subtitle="Hospedaje y eventos · últimos 6 meses" action={<span className="shrink-0 text-2xl font-semibold tabular">{compactMxn(incomeSeries.reduce((n, m) => n + m.hospedaje + m.eventos, 0))}</span>} />
      <div className="px-3 pt-4 pb-5 md:px-5">
        <BarChart data={incomeSeries} series={[{ key: 'hospedaje', label: 'Hospedaje', tone: 'sky' }, { key: 'eventos', label: 'Eventos', tone: 'rose' }]} />
        <div className="mt-3 flex justify-center gap-6 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-sky" /> Hospedaje
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose" /> Eventos
          </span>
        </div>
      </div>
    </Card>
  )
  const sourcesNode = (
    <Card className="h-full">
      <CardHeader eyebrow="Canales" title="Origen de reservas" subtitle="Últimos 90 días" />
      <div className="flex flex-col items-center gap-6 p-6 sm:flex-row xl:flex-col 2xl:flex-row">
        <Donut segments={sources} center={<><span className="display-num text-[1.8rem]">{sources.reduce((n, s) => n + s.value, 0)}</span><span className="text-xs text-ink-soft">reservas</span></>} />
        <div className="w-full">
          <Legend items={sources.map((s) => ({ label: s.label, tone: s.tone, value: s.value }))} />
        </div>
      </div>
    </Card>
  )
  const occupancyNode = (
    <Card>
      <CardHeader eyebrow="Hospedaje" title="Ocupación" subtitle="Semana pasada y próximas dos semanas" />
      <div className="px-3 pt-3 pb-5 md:px-5">
        <AreaChart data={occupancy} tone="sage" max={100} format={(n) => `${n}% ocupado`} />
      </div>
    </Card>
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

  const hoy = useHomeLayout(
    'hoy',
    [
      alertsNode && { id: 'alertas', label: 'Avisos', hint: 'Lluvia, cobros, limpiezas atrasadas', node: alertsNode },
      { id: 'linea', label: 'Línea del día', hint: 'Mapa y agenda a cualquier hora', node: <DayLine units={units} reservations={reservations} events={events} tasks={tasks} settings={settings} items={agenda[0]!.items} /> },
      { id: 'equipo', label: 'Equipo en este momento', node: teamNode, span: 'wide' as const },
      { id: 'manana', label: 'Mañana', node: tomorrowNode, span: 'narrow' as const },
    ].filter(Boolean) as HomeBlock[],
  )
  const negocio = useHomeLayout('negocio', [
    { id: 'kpis', label: 'Indicadores', hint: 'Tócalos para ver el desglose', node: kpisNode },
    { id: 'panorama', label: 'Panorama del dueño', hint: 'Utilidad, proyección y rentabilidad', node: <OwnerOverview /> },
    { id: 'ingresos', label: 'Ingresos por mes', node: incomeNode, span: 'wide' },
    { id: 'origen', label: 'Origen de reservas', node: sourcesNode, span: 'narrow' },
    { id: 'ocupacion', label: 'Ocupación', node: occupancyNode },
  ])
  const eventosTab = useHomeLayout('eventos', [
    { id: 'sabados', label: 'Próximos sábados', node: weekendsNode, span: 'wide' },
    { id: 'embudo', label: 'Embudo de eventos', node: funnelNode, span: 'narrow' },
  ])
  const current = tab === 'hoy' ? hoy : tab === 'negocio' ? negocio : eventosTab
  const tabLabel = tab === 'hoy' ? 'Hoy' : tab === 'negocio' ? 'Negocio' : 'Eventos'

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-5 xl:gap-6">
      {/* ── Hero: losa noche con la luz y el pulso del rancho ── */}
      <Section>
        <NightSlab className="px-6 pt-7 pb-24 sm:px-9 sm:pt-9 md:pb-28 xl:px-12 xl:pt-11" luzSize="clamp(48px, 10vw, 136px)">
          <div className="max-w-[min(100%,820px)] pr-[18vw] sm:pr-[22%] lg:pr-0">
            <p className="eyebrow !text-on-night-soft">{capitalize(fmtDateLong(T))}</p>
            <h1 className="heading mt-3 text-[clamp(2.3rem,1.7rem+2.6vw,4rem)] text-on-night">
              {greeting()}, {me?.name.split(' ')[0]}
            </h1>
            <p className="mt-3 max-w-[48ch] text-[15px] text-on-night-soft sm:text-base">
              Esto es lo que pasa hoy en {settings.ranchName}.
              {weather && (
                <span className="ml-1 inline-flex items-center gap-1.5 whitespace-nowrap">
                  <WeatherIcon size={16} strokeWidth={1.6} className="text-luz" /> {weather.temp}° · {weatherLabel(weather.code).toLowerCase()}
                </span>
              )}
            </p>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-6">
            <div className="flex items-center gap-4">
              <ProgressRing value={occupied / Math.max(1, units.length)} size={104} stroke={5} gradient>
                <span className="flex flex-col items-center text-on-night">
                  <span className="display-num text-[1.9rem]">
                    {occupied}
                    <span className="text-on-night-soft">/{units.length}</span>
                  </span>
                </span>
              </ProgressRing>
              <div>
                <div className="text-sm text-on-night">Ocupación hoy</div>
                <div className="text-xs text-on-night-soft">{pct(occupied / Math.max(1, units.length))} de cabañas y casas</div>
              </div>
            </div>
            <span aria-hidden className="hidden h-14 w-px bg-[color-mix(in_oklab,var(--on-night)_16%,transparent)] sm:block" />
            {[
              { label: 'Llegadas', value: arrivals.length, icon: LogIn, to: '/hospedaje' },
              { label: 'Salidas', value: departures.length, icon: LogOut, to: '/limpieza' },
              { label: 'Eventos hoy', value: eventsToday.length, icon: CalendarHeart, to: '/eventos' },
              { label: 'Pendientes', value: openTasksToday.length, icon: ListChecks, to: '/tareas' },
            ].map((k) => (
              <Link key={k.label} to={k.to} className="group min-w-[84px] rounded-[14px] focus-visible:outline-none">
                <div className="flex items-center gap-1.5 text-xs text-on-night-soft">
                  <k.icon size={14} strokeWidth={1.6} /> {k.label}
                </div>
                <div className="display-num mt-1 text-[2.4rem] text-on-night transition-transform duration-[var(--dur-3)] group-hover:-translate-y-0.5">
                  <CountUp value={k.value} />
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <Button variant="luz" icon={<Plus size={18} strokeWidth={1.6} />} onClick={() => navigate('/eventos?nuevo=salon')}>
              Nuevo evento
            </Button>
            <Button variant="ghost" className="!text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_28%,transparent)] ring-inset hover:!bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)]" icon={<BedDouble size={18} strokeWidth={1.6} />} onClick={() => navigate('/hospedaje')}>
              Nueva reserva
            </Button>
          </div>
        </NightSlab>
      </Section>

      <Section className="flex items-center justify-between gap-3">
        <Segmented<HomeTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'hoy', label: <><Sun size={16} strokeWidth={1.6} /> Hoy</> },
            { value: 'negocio', label: <><Receipt size={16} strokeWidth={1.6} /> Negocio</> },
            { value: 'eventos', label: <><CalendarHeart size={16} strokeWidth={1.6} /> Eventos</> },
          ]}
        />
        <Button variant="ghost" size="sm" icon={<SlidersHorizontal size={16} strokeWidth={1.6} />} onClick={() => setCustomize(true)}>
          <span className="max-sm:hidden">Personalizar</span>
        </Button>
      </Section>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.36, ease: ease.calma } }}>
        {current.visible.length ? (
          <HomeGrid blocks={current.visible} />
        ) : (
          <Card>
            <Empty title="Ocultaste todas las tarjetas" body="Usa Personalizar para volver a mostrarlas." action={<Button size="sm" onClick={() => setCustomize(true)}>Personalizar</Button>} />
          </Card>
        )}
      </motion.div>

      <CustomizeSheet open={customize} onClose={() => setCustomize(false)} title={tabLabel} layout={current} />
    </motion.div>
  )
}

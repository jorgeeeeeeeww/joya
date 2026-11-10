// Centro de control · panel de administración (step1, atmósfera Flor).
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
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
import { EVENT_STATUS, EVENT_TYPE, TONE, UNIT_STATUS, VENUE } from '@/lib/meta'
import { addDaysISO, capitalize, compactMxn, fmt, fmtDate, fmtDateLong, localDay, mxn, relativeDay, today } from '@/lib/format'
import { useWeather, weatherLabel } from '@/lib/weather'
import { fadeRise, stagger } from '@/lib/motion'
import type { Pastel, RanchEvent } from '@/lib/types'
import { Sparkline } from '@/components/charts'
import { Avatar, Button, Card, CardHeader, cx, Dot, ProgressBar, SectionTitle, Stat, StatStrip } from '@/components/ui'
import { Occupancy7 } from '@/components/owner/OwnerToday'
import { CountUp, NightSlab } from '@/components/step1'
import { RanchoVivoScene, type UnidadViva } from '@/components/scenes'
import { arrivalText, CleaningSheet, nextArrival } from '@/components/stays/CleaningFlow'
import { DeviceMonitorSummary } from '@/components/owner/DeviceMonitor'


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
  const cloud = useStore((s) => !!s.settings.supabaseUrl)
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
    // Igual que en Hospedaje: primero lo que falta por llegar y aparte quién ya llegó
    const toCome = arrivals.filter((r) => r.status === 'confirmada' || r.status === 'pendiente')
    const came = arrivals.filter((r) => r.status === 'en-casa')
    const ins = toCome.map((r) => `${data.units[r.unitId]?.name ?? 'una casa'}${r.arrivalTime ? ` (${r.arrivalTime})` : ''}`)
    briefing.push(toCome.length ? `Hoy ${toCome.length === 1 ? 'falta que llegue 1 reserva' : `faltan por llegar ${toCome.length} reservas`}: ${ins.join(' y ')}.` : came.length ? 'Ya llegaron todos los huéspedes de hoy.' : 'Hoy no llega ningún huésped.')
    if (toCome.length && came.length) briefing.push(`${came.length === 1 ? 'Ya llegó 1' : `Ya llegaron ${came.length}`}: ${came.map((r) => data.units[r.unitId]?.name ?? '').join(' y ')}.`)
    const notReady = alerts.filter((a) => / aún no está lista$/.test(a.title)).map((a) => a.title.replace(/ aún no está lista$/, ''))
    if (notReady.length) briefing.push(`${notReady.join(' y ')} ${notReady.length === 1 ? 'todavía no está lista' : 'todavía no están listas'}.`)
    if (departures.length) briefing.push(`${departures.length === 1 ? 'Sale 1 reserva' : `Salen ${departures.length} reservas`}; su limpieza ya está asignada.`)
    briefing.push(eventsToday.length ? `Hoy hay evento: ${eventsToday.map((e) => e.title).join(' y ')}.` : nextEv ? `El próximo evento es ${nextEv.title}, ${relativeDay(nextEv.date).toLowerCase()}.` : 'No hay eventos apartados.')
  }
  const verdict = decisions.length ? `${decisions.length} ${decisions.length === 1 ? 'cosa necesita' : 'cosas necesitan'} tu decisión` : 'Todo en orden hoy'

  const tomorrow = agenda[1]!
  const linkCls = 'pressable inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-ink-soft hover:bg-wash hover:text-ink'
  const tomorrowNode = (
    <Card className="h-full">
      <CardHeader title={`Mañana · ${capitalize(fmt(tomorrow.day, 'EEEE d'))}`} subtitle={tomorrow.items.length === 1 ? '1 cosa agendada' : `${tomorrow.items.length} cosas agendadas`} />
      <ol className="flex flex-col p-2 md:p-3">
        {tomorrow.items.length === 0 && <li className="px-3 py-3 text-sm text-ink-soft">Día tranquilo. Nada agendado.</li>}
        {tomorrow.items.map((it) => {
          const Icon = it.icon
          return (
            <li key={it.id}>
              <Link to={it.to} className="flex items-start gap-3 rounded-[12px] px-2.5 py-2 hover:bg-wash">
                <span className="w-11 shrink-0 pt-px text-[13px] font-medium text-key tabular">{it.time}</span>
                <Icon size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-ink-soft" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{it.title}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{it.sub}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </Card>
  )

  const working = team.filter((t) => t.doing).length
  const teamNode = (
    <Card className="h-full">
      <CardHeader title="Equipo ahora" subtitle={working === 0 ? 'Nadie con una tarea en curso' : working === 1 ? '1 persona trabajando' : `${working} personas trabajando`} action={<Link to="/equipo" className={linkCls}>Equipo <ArrowRight size={14} strokeWidth={1.7} /></Link>} />
      <ul className="flex flex-col divide-y divide-line px-4 pt-2 pb-2 md:px-5">
        {team.map(({ e, doing, next, doneToday, mins, open }) => (
          <li key={e.id} className="flex items-center gap-3 py-3">
            <span className="relative">
              <Avatar name={e.name} tone={e.color} size={36} />
              <span className={cx('absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface', doing ? 'bg-success' : open ? 'bg-chispa-soft' : 'bg-line-strong')} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{e.name}</span>
              <span className="block truncate text-[12.5px] text-ink-3">{doing ? `${doing.title} · lleva ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}` : next ? `Sigue: ${next.title}` : 'Sin pendientes'}</span>
            </span>
            <span className="text-right">
              <span className="block text-[17px] font-semibold tabular">{doneToday}</span>
              <span className="block text-[11px] text-ink-3">hechas hoy</span>
            </span>
          </li>
        ))}
        {team.length === 0 && <li className="py-6 text-center text-sm text-ink-soft">Agrega a tu equipo en la sección Equipo.</li>}
      </ul>
    </Card>
  )

  // Cifras del mes: cada una lleva a su pantalla
  const kpisNode = (
    <StatStrip>
      <Stat label="Ingresos del mes" value={<CountUp value={incomeMonth} format={compactMxn} />} delta={incomePrevToDate && dayOfMonth >= 7 ? { value: `${incomeDelta >= 0 ? '+' : ''}${Math.round(incomeDelta * 100)}%`, good: incomeDelta >= 0 } : undefined} sub={dayOfMonth >= 7 ? `vs. mismos ${dayOfMonth} días del mes pasado` : capitalize(fmt(T, 'MMMM'))} spark={<Sparkline values={incomeSpark} tone="peach" highlight={3} />} onClick={() => navigate('/finanzas')} />
      <Stat label="Por cobrar" value={<CountUp value={receivable} format={compactMxn} />} sub="De eventos apartados y confirmados" icon={<Receipt size={16} strokeWidth={1.6} />} onClick={() => navigate('/eventos?vista=lista')} />
      <Stat label="Reservas próximas" value={<CountUp value={next30Res} />} sub="Llegadas en 30 días" icon={<BedDouble size={16} strokeWidth={1.6} />} spark={<Sparkline values={arrivalsSpark} tone="sky" highlight={7} />} onClick={() => navigate('/hospedaje')} />
      <Stat label="Eventos del mes" value={<CountUp value={eventsMonth} />} sub={capitalize(fmt(T, 'MMMM'))} icon={<CalendarHeart size={16} strokeWidth={1.6} />} onClick={() => navigate('/eventos')} />
    </StatStrip>
  )

  const funnelNode = (
    <Card className="h-full">
      <CardHeader title="Ventas de eventos" subtitle={`${mxn(funnel.total)} en juego`} action={<Link to="/eventos?vista=prospectos" className={linkCls}>Prospectos <ArrowRight size={14} strokeWidth={1.7} /></Link>} />
      <div className="flex flex-col gap-4 px-4 pt-3 pb-5 md:px-5">
        {funnel.rows.map((r) => (
          <Link key={r.s} to={r.s === 'prospecto' || r.s === 'cotizado' ? '/eventos?vista=prospectos' : '/eventos'} className="group block">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-[13.5px]">
                <span className={cx('h-2 w-2 rounded-full', TONE[EVENT_STATUS[r.s].tone].solid)} />
                {EVENT_STATUS[r.s].label}
                <span className="text-ink-3">· {r.count}</span>
              </span>
              <span className="text-[13.5px] text-ink-soft tabular group-hover:text-ink">{compactMxn(r.value)}</span>
            </div>
            <ProgressBar value={r.value / funnel.max} tone={EVENT_STATUS[r.s].tone} />
          </Link>
        ))}
      </div>
    </Card>
  )

  const toCome = arrivals.filter((r) => r.status === 'confirmada' || r.status === 'pendiente').length

  // El rancho de la portada: cada casa con lo que pasa en ella ahora mismo
  const vivas: UnidadViva[] = useMemo(
    () =>
      units.map((u) => {
        const here = reservations.find((r) => r.unitId === u.id && r.status === 'en-casa' && r.guests > 0)
        const next = nextArrival(reservations, u.id)
        const status = UNIT_STATUS[u.status].label
        const line = here ? `${here.guestName.split(' ').slice(0, 2).join(' ')} · sale ${relativeDay(here.checkOut).toLowerCase()}` : next?.checkIn === T ? `${status} · ${arrivalText(next).toLowerCase()}` : status
        return { id: u.id, name: u.name, status: u.status, cabana: u.kind === 'cabana', line }
      }),
    [units, reservations, T],
  )
  const salonHoy = eventsToday.find((e) => e.venue === 'salon') ?? eventsToday[0]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-8">
      {/* ── 1 · El veredicto del día ── */}
      <Section>
        <NightSlab
          sceneInteractive
          scene={
            <div className="relative h-full">
              <RanchoVivoScene units={vivas} salon={{ lit: !!salonHoy, line: salonHoy ? `Hoy: ${salonHoy.title}` : 'Sin evento hoy' }} onPick={(id) => navigate(id === 'salon' ? '/espacios' : `/mapa?u=${id}`)} />
              <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[12px] text-on-night-soft">Encendida: con huéspedes · toca una casa</p>
            </div>
          }
          className="px-5 pt-7 pb-[172px] sm:px-9 sm:pt-9 sm:pb-28 md:pb-32 xl:px-11"
          luzSize="clamp(48px, 8vw, 104px)"
          luzClassName="absolute top-[7%] right-[5%]"
        >
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-on-night-soft">
            {capitalize(fmtDateLong(T))}
            {weather && (
              <span className="inline-flex items-center gap-1.5">
                · <WeatherIcon size={14} strokeWidth={1.7} className="text-luz" /> {weather.temp}° {weatherLabel(weather.code).toLowerCase()}
              </span>
            )}
          </p>
          <h1 className="heading mt-2.5 max-w-[18ch] pr-14 text-[clamp(2rem,1.6rem+2vw,3.2rem)] leading-[1.05] text-on-night">{verdict}</h1>
          <ul className="mt-4 flex max-w-[60ch] flex-col gap-1.5 text-[15px] leading-snug text-on-night-soft">
            {briefing.slice(0, 3).map((l) => (
              <li key={l} className="flex gap-2.5">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-luz" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
          <div className="mt-7 grid max-w-[680px] grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {[
              { label: 'Ocupadas ahora', value: `${occupied}/${units.length}`, to: '/hospedaje' },
              { label: 'Por llegar hoy', value: String(toCome), to: '/hospedaje' },
              { label: 'Salidas de hoy', value: String(departures.length), to: '/hospedaje' },
              { label: 'Eventos hoy', value: String(eventsToday.length), to: '/eventos' },
            ].map((k) => (
              <Link key={k.label} to={k.to} className="group rounded-[14px]">
                <div className="text-[13px] text-on-night-soft">{k.label}</div>
                <div className="display-num mt-1.5 text-[2.2rem] leading-none text-on-night transition-transform duration-[var(--dur-3)] group-hover:-translate-y-0.5">{k.value}</div>
              </Link>
            ))}
          </div>
          <div className="mt-7 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
            <Button variant="luz" icon={<Plus size={18} strokeWidth={1.7} />} onClick={() => navigate('/hospedaje')}>
              Nueva reserva
            </Button>
            <Button variant="ghost" className="!text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_28%,transparent)] ring-inset hover:!bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)]" icon={<CalendarHeart size={18} strokeWidth={1.7} />} onClick={() => navigate('/eventos?nuevo=salon')}>
              Nuevo evento
            </Button>
          </div>
        </NightSlab>
      </Section>

      {/* Monitor central: solo aparece si algún dispositivo o tarea de la nube necesita atención */}
      {cloud && (
        <Section>
          <DeviceMonitorSummary onOpen={() => navigate('/desarrollador')} />
        </Section>
      )}

      {/* ── 2 · Lo que necesita tu decisión, y mañana ── */}
      <Section className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader title="Te toca decidir" subtitle={decisions.length ? `${decisions.length} ${decisions.length === 1 ? 'pendiente' : 'pendientes'} · limpiezas por revisar, avisos y compras` : 'Nada pendiente'} />
          <ul className="flex flex-col divide-y divide-line px-4 pt-2 pb-2 md:px-5">
            {decisions.length === 0 && <li className="py-4 text-[14px] text-ink-soft">Todo en orden. Te avisamos cuando algo necesite tu decisión.</li>}
            {decisions.map((d) => (
              <li key={d.id} className="flex items-center gap-3.5 py-3.5">
                <Dot tone={d.tone} className="mt-1.5 self-start" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] leading-snug font-semibold">{d.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{d.body}</span>
                </span>
                {d.review ? (
                  <Button size="sm" variant="tinta" className="shrink-0" onClick={() => setReviewTask(d.review)}>
                    {d.action}
                  </Button>
                ) : (
                  <Link to={d.to!} className="pressable inline-flex h-10 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold ring-1 ring-line-strong ring-inset hover:bg-wash pointer-fine:h-8 pointer-fine:px-3">
                    {d.action}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
        {tomorrowNode}
      </Section>

      {/* ── 3 · La semana ── */}
      <Section>
        <Occupancy7 data={data} />
      </Section>

      {/* ── 4 · El mes ── */}
      <Section>
        <SectionTitle title="El mes" subtitle="Toca una cifra para ver su detalle" action={<Link to="/finanzas" className={linkCls}>Finanzas <ArrowRight size={14} strokeWidth={1.7} /></Link>} />
        {kpisNode}
      </Section>

      {/* ── 5 · Equipo y ventas ── */}
      <Section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {teamNode}
        {funnelNode}
      </Section>

      <CleaningSheet taskId={reviewTask} onClose={() => setReviewTask(undefined)} />
    </motion.div>
  )
}

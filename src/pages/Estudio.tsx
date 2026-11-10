// Estudio de la wedding planner.
// · Temporada: cada evento es una serie de focos que se prende conforme se prepara, y abajo la carga de cada semana.
// · Camino: un evento completo en una sola línea de tiempo; todo se arrastra y se resuelve aquí.
// Regla de esta pantalla: la app decide qué mostrar. Lo que no ayuda a decidir ahora queda a un toque.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Clapperboard, Plus, Sparkles } from 'lucide-react'
import type { CaminoLane, ISODate, RanchEvent } from '@/lib/types'
import { addDaysISO, capitalize, daysUntil, fmt, fmtDate, today } from '@/lib/format'
import { useCollection, useDoc, useMe } from '@/lib/store'
import { EVENT_TYPE, VENUE, seesMoney } from '@/lib/meta'
import { eventCoach } from '@/lib/coach'
import { nextStep, eventMilestones, type HealthPart } from '@/lib/eventHealth'
import { useEventMoney } from '@/lib/planner'
import { buildCamino, eventLights, LANES, laneOfHealth, mondayOf, moveNode, phaseRibbons, planSteps, useCaminoData, weekLoads, type CaminoNode, type EventLights, type NodeState, type WeekLoad } from '@/lib/estudio'
import { fadeRise, haptic, stagger } from '@/lib/motion'
import { Button, Card, Empty, FilterMenu, Sheet, cx, toast, useMedia } from '@/components/ui'
import { Horizon, NIGHT_TONES, NightSlab, Sparkle } from '@/components/step1'
import { EventOrb } from '@/components/events/EventOrb'
import { NewEventSheet } from '@/components/events/NewEventSheet'
import { Luces, LucesMini } from '@/components/estudio/Luces'
import { Riel, type RielGeom, type RielRow } from '@/components/estudio/Riel'
import { AddStepSheet, NodeDetail, NodeRow, PlanSheet, StateMark, dueText } from '@/components/estudio/Detalle'

const shortName = (ev: RanchEvent) => ev.title.replace(/^(Boda civil|Boda|Bautizo de|Baby shower de|Cumpleaños \d+ de|XV años de)\s+/i, '').trim() || ev.title

/** Mover con deshacer: lo mismo para arrastrar, teclado y botones */
function move(n: CaminoNode, date: ISODate) {
  if (date === n.due) return
  const undo = moveNode(n, date)
  toast.undo(`${n.label}: ${fmtDate(date)}`, undo)
}

// ── Temporada ─────────────────────────────────────────────
/** La serie de focos de un evento, colgada junto a la de los demás */
function Serie({ ev, lights, index, onOpen, onHover }: { ev: RanchEvent; lights: EventLights; index: number; onOpen: () => void; onHover?: (on: boolean) => void }) {
  const d = daysUntil(ev.date)
  return (
    <motion.button
      variants={fadeRise}
      onClick={onOpen}
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
      aria-label={`${ev.title}: ${d === 0 ? 'es hoy' : `faltan ${d} días`}, ${lights.score.label}`}
      className="pressable group flex min-w-0 flex-col items-stretch rounded-[14px] pb-1 text-center outline-none hover:bg-[color-mix(in_oklab,var(--on-night)_6%,transparent)] focus-visible:bg-[color-mix(in_oklab,var(--on-night)_8%,transparent)]"
    >
      <Luces lights={lights} delay={index * 260} />
      <span className="mt-2 block px-1 text-[14px] leading-tight font-medium text-on-night group-hover:underline group-hover:underline-offset-2">{shortName(ev)}</span>
      <span className="mt-1 block text-[12px] leading-tight text-on-night-soft tabular">
        {d === 0 ? 'Es hoy' : `${d} ${d === 1 ? 'día' : 'días'}`} · {lights.score.ok} de {lights.score.total}
      </span>
    </motion.button>
  )
}

/** Barra de carga de una semana. En PC va alineada con el tiempo del riel. */
function LoadBar({ w, max, selected, busiest, onPick, style, dateLabel }: { w: WeekLoad; max: number; selected: boolean; busiest: boolean; onPick: () => void; style?: React.CSSProperties; dateLabel?: boolean }) {
  const h = max ? Math.max(w.open ? 5 : 2, (w.open / max) * 44) : 2
  const lateH = w.open ? (w.late / w.open) * h : 0
  return (
    <button onClick={onPick} aria-pressed={selected} aria-label={`Semana del ${fmtDate(w.from)}: ${w.open} pendientes en ${w.events.length} ${w.events.length === 1 ? 'evento' : 'eventos'}${w.late ? `, ${w.late} atrasados` : ''}`} style={style} className={cx('pressable group flex min-w-0 flex-col items-center justify-end rounded-[8px] pt-1', selected ? 'bg-[color-mix(in_oklab,var(--luz)_42%,transparent)]' : 'hover:bg-wash')}>
      <span className={cx('text-[11.5px] leading-none tabular', busiest ? 'font-semibold text-key' : w.open ? 'text-ink-soft' : 'text-transparent')}>{w.open}</span>
      <span className="mt-1 flex w-[62%] max-w-[46px] flex-col overflow-hidden rounded-t-[5px] rounded-b-[2px] transition-[height] duration-[var(--dur-3)] ease-[var(--ease-calma)]" style={{ height: h }}>
        {lateH > 0 && <span className="w-full bg-chispa-soft" style={{ height: lateH }} />}
        <span className={cx('w-full flex-1', w.open ? (busiest ? 'bg-primary' : 'bg-[color-mix(in_oklab,var(--primary)_34%,var(--sunken))]') : 'bg-line')} />
      </span>
      {dateLabel && <span className="mt-1 pb-1 text-[11px] leading-tight text-ink-3 tabular">{fmt(w.from, 'd MMM').replace('.', '')}</span>}
    </button>
  )
}

function Temporada() {
  const me = useMe()
  const showMoney = seesMoney(me?.role)
  const { booked, nodesOf, money, t } = useCaminoData(showMoney)
  const navigate = useNavigate()
  const isMobile = useMedia('(max-width: 767px)')
  const [selId, setSelId] = useState<string>()
  const [weekSel, setWeekSel] = useState<ISODate | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; date: ISODate } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  // La ventana se ajusta sola: de esta semana a la del último evento, sin semanas vacías
  const from = mondayOf(t)
  const lastDate = booked.at(-1)?.date ?? addDaysISO(t, 28)
  const weeks = Math.min(26, Math.max(5, Math.ceil((new Date(`${lastDate}T12:00`).getTime() - new Date(`${from}T12:00`).getTime()) / (7 * 864e5)) + 1))
  const to = addDaysISO(from, weeks * 7 - 1)

  const all = useMemo(() => booked.flatMap((e) => nodesOf(e)), [booked, nodesOf])
  const byId = useMemo(() => new Map(booked.map((e) => [e.id, e])), [booked])

  // Al arrastrar, las barras de carga ya se mueven con el dedo
  const withPreview = useMemo(() => (preview ? all.map((n) => (n.id === preview.id ? { ...n, due: preview.date, state: n.state === 'late' && preview.date >= t ? ('next' as NodeState) : n.state } : n)) : all), [all, preview, t])
  const loads = useMemo(() => weekLoads(withPreview, from, weeks, t), [withPreview, from, weeks, t])
  const maxLoad = Math.max(1, ...loads.map((w) => w.open))
  const busiest = loads.reduce<WeekLoad | null>((b, w) => (w.open && (!b || w.open > b.open) ? w : b), null)
  const thisWeek = loads[0]
  const lateCount = all.filter((n) => n.state === 'late').length

  const lightsOf = useMemo(() => new Map(booked.map((e) => [e.id, eventLights(e, money.paid(e), money.total(e), t)])), [booked, money, t])
  // El evento que más atención pide: el más cercano con pasos atrasados
  const attention = useMemo(() => {
    const scored = booked.map((e) => ({ e, late: nodesOf(e).filter((n) => n.state === 'late').length, d: daysUntil(e.date) }))
    return scored.filter((x) => x.late).sort((a, b) => a.d - b.d)[0] ?? null
  }, [booked, nodesOf])

  const shownWeek = weekSel ? loads.find((w) => w.from === weekSel) : thisWeek
  const agenda = useMemo(() => [...(shownWeek?.nodes ?? [])].sort((a, b) => Number(b.state === 'late') - Number(a.state === 'late') || a.due.localeCompare(b.due)), [shownWeek])
  const selected = selId ? all.find((n) => n.id === selId) : undefined
  const selectedEv = selected ? byId.get(selected.eventId) : undefined

  const rows: RielRow[] = useMemo(
    () =>
      booked
        .filter((e) => e.date <= to)
        .map((e) => {
          const d = daysUntil(e.date)
          return {
            key: e.id,
            nodes: nodesOf(e),
            endDate: e.date,
            strong: hover === e.id,
            title: (
              <Link to={`/estudio/${e.id}`} className="pressable group block min-w-0 rounded-[10px] leading-tight">
                <span className="block text-[13.5px] font-semibold group-hover:underline">{shortName(e)}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-detail tabular">
                  <LucesMini lights={lightsOf.get(e.id)!} />
                  {d === 0 ? 'Es hoy' : `${d} días`}
                </span>
              </Link>
            ),
          }
        }),
    [booked, lightsOf, nodesOf, to, hover],
  )

  const pickWeek = (from: ISODate) => {
    haptic.select()
    setWeekSel(from)
    setShowAll(false)
  }
  const renderTop = useCallback(
    (g: RielGeom) => (
      <div className="absolute inset-0">
        {loads.map((w) => (
          <LoadBar key={w.from} w={w} max={maxLoad} selected={shownWeek?.from === w.from} busiest={busiest?.from === w.from} onPick={() => pickWeek(w.from)} style={{ position: 'absolute', left: g.xOf(w.from) - g.px / 2 + 1, width: g.px * 7 - 2, bottom: 6, top: 0 }} />
        ))}
      </div>
    ),
    [loads, maxLoad, shownWeek, busiest],
  )

  if (!booked.length)
    return (
      <div className="flex flex-col gap-6">
        <NightSlab className="px-6 pt-8 pb-24 md:px-10" luzSize="clamp(44px,7vw,92px)">
          <h1 className="heading max-w-[20ch] text-[clamp(2rem,1.6rem+2vw,3rem)] text-on-night">Todavía no hay luces colgadas</h1>
          <p className="mt-3 max-w-[52ch] text-on-night-soft">Cuando apartes una fecha, aquí aparece su serie de focos.</p>
          <Button variant="luz" className="mt-6" icon={<Plus size={17} strokeWidth={1.7} />} onClick={() => setNewOpen(true)}>
            Nuevo evento
          </Button>
        </NightSlab>
        <NewEventSheet open={newOpen} onClose={() => setNewOpen(false)} />
      </div>
    )

  const busiestIsNow = busiest?.from === thisWeek?.from

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-5 md:gap-6">
      {/* Las luces de la temporada: una serie por evento, colgadas una junto a la otra */}
      <motion.div variants={fadeRise}>
        <NightSlab horizon={false} className="px-4 pt-6 pb-5 sm:px-7 md:pt-8 md:pb-7" luzSize="clamp(40px,6vw,78px)" luzClassName="absolute top-[7%] right-[5%]">
          <Horizon variante="colinas" tonos={NIGHT_TONES} className="pointer-events-none absolute inset-x-[-40px] bottom-[-28px] -z-10 h-[min(46%,170px)] opacity-70 md:bottom-[-36px]" />
          <div className="pr-14 md:pr-28">
            <h1 className="heading max-w-[24ch] text-[clamp(1.75rem,1.4rem+1.8vw,2.7rem)] leading-[1.08] text-on-night">{attention ? `${attention.e.title} es lo que más atención pide` : 'Todo va a tiempo'}</h1>
            <p className="mt-2.5 max-w-[60ch] text-[14.5px] leading-snug text-on-night-soft">
              {booked.length} {booked.length === 1 ? 'evento' : 'eventos'} · {lateCount ? `${lateCount} ${lateCount === 1 ? 'paso atrasado' : 'pasos atrasados'}` : 'nada atrasado'}. Cada serie de focos se prende conforme su evento se prepara.
            </p>
          </div>
          <motion.div variants={stagger} className="mt-7 grid gap-y-5 md:mt-9" style={{ gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : `repeat(${Math.min(booked.length, 6)}, minmax(0, 1fr))` }}>
            {booked.slice(0, 6).map((e, i) => (
              <Serie key={e.id} ev={e} lights={lightsOf.get(e.id)!} index={i} onHover={(on) => setHover(on ? e.id : null)} onOpen={() => navigate(`/estudio/${e.id}`)} />
            ))}
          </motion.div>
        </NightSlab>
      </motion.div>

      {/* La carga de las próximas semanas */}
      <motion.div variants={fadeRise}>
        <Card className="overflow-hidden">
          <div className="px-4 pt-4 pb-3 md:px-5 md:pt-5">
            <h2 className="text-[17px] leading-tight font-semibold tracking-[-0.02em]">
              {busiest ? (
                <>
                  {busiestIsNow ? 'Esta semana' : `La semana del ${fmtDate(busiest.from)}`} es la más cargada: <span className="text-key">{busiest.open} pendientes</span>
                </>
              ) : (
                'Sin pendientes en estas semanas'
              )}
            </h2>
            {!isMobile && busiest && <p className="mt-1 text-[13.5px] text-ink-soft">Arrastra un punto a otra semana para repartir mejor: la barra se mueve contigo.</p>}
          </div>
          {isMobile ? (
            <div className="px-3 pb-3">
              <div className="grid h-[100px] gap-[2px]" style={{ gridTemplateColumns: `repeat(${Math.min(loads.length, 8)}, minmax(0, 1fr))` }}>
                {loads.slice(0, 8).map((w) => (
                  <LoadBar key={w.from} w={w} max={maxLoad} dateLabel selected={shownWeek?.from === w.from} busiest={busiest?.from === w.from} onPick={() => pickWeek(w.from)} />
                ))}
              </div>
            </div>
          ) : (
            <Riel compact rows={rows} from={from} to={to} today={t} selectedId={selId} onSelect={(n) => setSelId(n.id)} onMove={move} onPreview={(n, d) => setPreview(n && d ? { id: n.id, date: d } : null)} top={renderTop} topHeight={66} />
          )}
        </Card>
      </motion.div>

      {/* Lo de la semana elegida */}
      <motion.div variants={fadeRise}>
        <Card className="p-3 md:p-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 px-2">
            <h2 className="text-[15px] font-semibold tracking-[-0.015em]">{!shownWeek || shownWeek.from === thisWeek?.from ? 'Esta semana' : `Semana del ${fmtDate(shownWeek.from)}`}</h2>
            <span className="text-[13px] text-detail tabular">
              {agenda.length} {agenda.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          </div>
          {agenda.length === 0 && <p className="px-2 py-4 text-sm text-ink-soft">Nada pendiente en esta semana.</p>}
          <div className="grid gap-x-3 gap-y-0.5 lg:grid-cols-2">
            {(showAll ? agenda : agenda.slice(0, 6)).map((n) => (
              <NodeRow key={n.id} node={n} eventTitle={shortName(byId.get(n.eventId) ?? ({ title: '' } as RanchEvent))} onOpen={(x) => setSelId(x.id)} />
            ))}
          </div>
          {agenda.length > 6 && (
            <button onClick={() => setShowAll((v) => !v)} className="pressable mt-2 min-h-11 w-full rounded-full text-sm font-medium hover:bg-wash">
              {showAll ? 'Ver menos' : `Ver los ${agenda.length}`}
            </button>
          )}
        </Card>
      </motion.div>

      <Sheet open={!!selected} onClose={() => setSelId(undefined)}>
        <div className="pt-5">{selected && selectedEv && <NodeDetail node={selected} ev={selectedEv} showEvent onMove={move} />}</div>
      </Sheet>
    </motion.div>
  )
}

// ── Camino de un evento ───────────────────────────────────
function CaminoEvento({ ev }: { ev: RanchEvent }) {
  const me = useMe()
  const showMoney = seesMoney(me?.role)
  const money = useEventMoney()
  const tasks = useCollection('tasks')
  const events = useCollection('events')
  const navigate = useNavigate()
  const isMobile = useMedia('(max-width: 767px)')
  const t = today()
  const paid = money.paid(ev)
  const total = money.total(ev)
  const nodes = useMemo(() => buildCamino(ev, { paid, total, tasks, money: showMoney, t }), [ev, paid, total, tasks, showMoney, t])
  const lights = useMemo(() => eventLights(ev, paid, total, t), [ev, paid, total, t])
  const coach = useMemo(() => eventCoach(ev, paid, total, { money: showMoney, t }), [ev, paid, total, showMoney, t])
  const step = nextStep(eventMilestones(ev, paid, total, t))
  const d = daysUntil(ev.date)

  const [selId, setSelId] = useState<string>()
  const [part, setPart] = useState<HealthPart['key'] | null>(null)
  const [partHover, setPartHover] = useState<HealthPart['key'] | null>(null)
  const [wide, setWide] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [appear, setAppear] = useState<Set<string>>(new Set())
  const [showAllNext, setShowAllNext] = useState(false)
  useEffect(() => {
    if (!appear.size) return
    const id = setTimeout(() => setAppear(new Set()), 3000)
    return () => clearTimeout(id)
  }, [appear])

  const focusLane: CaminoLane | null = part ? laneOfHealth(part) : null
  const activeKey = partHover ?? part

  // De cerca: de unos días antes de hoy a poco después del evento. Lo atrasado de antes cae en su columna.
  const firstDue = nodes[0]?.due ?? t
  const lastDue = nodes.at(-1)?.due ?? ev.date
  const base = t < ev.date ? t : ev.date
  const from = wide ? addDaysISO(firstDue < base ? firstDue : base, -3) : addDaysISO(base, -4)
  const endTarget = addDaysISO(ev.date, 9)
  const to = wide ? (lastDue > endTarget ? addDaysISO(lastDue, 3) : endTarget) : endTarget > addDaysISO(base, 21) ? endTarget : addDaysISO(base, 21)

  const rows: RielRow[] = useMemo(
    () =>
      LANES.map((l) => {
        const list = nodes.filter((n) => n.lane === l.key)
        const done = list.filter((n) => n.state === 'done').length
        const Icon = l.icon
        return {
          key: l.key,
          nodes: list,
          dim: !!focusLane && focusLane !== l.key,
          title: (
            <span className="flex min-w-0 items-start gap-2">
              <Icon size={16} strokeWidth={1.6} className="mt-0.5 shrink-0 text-ink-soft" />
              <span className="min-w-0 leading-tight">
                <span className="block text-[13px] font-semibold">{l.label}</span>
                {list.length > 0 && (
                  <span className="mt-0.5 block text-[12px] text-detail tabular">
                    {done} de {list.length}
                  </span>
                )}
              </span>
            </span>
          ),
        }
      }),
    [nodes, focusLane],
  )

  const counts = useMemo(() => ({ done: nodes.filter((n) => n.state === 'done').length, late: nodes.filter((n) => n.state === 'late').length, open: nodes.filter((n) => n.state === 'now' || n.state === 'next').length }), [nodes])
  const availableNow = useMemo(() => planSteps(ev, t).filter((s) => !s.passed).length, [ev, t])
  const ribbons = useMemo(() => phaseRibbons(ev, from, to, t), [ev, from, to, t])

  const nextList = useMemo(
    () =>
      nodes
        .filter((n) => n.state !== 'done' && (!focusLane || n.lane === focusLane))
        .sort((a, b) => Number(b.state === 'late') - Number(a.state === 'late') || a.due.localeCompare(b.due)),
    [nodes, focusLane],
  )
  const selected = selId ? nodes.find((n) => n.id === selId) : undefined

  const pickPart = (key: HealthPart['key']) => {
    haptic.select()
    setPart((p) => (p === key ? null : key))
  }
  const eventOptions = useMemo(
    () =>
      events
        .filter((e) => e.date >= t && e.id !== ev.id && (e.status === 'apartado' || e.status === 'confirmado'))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => ({ value: e.id, label: e.title })),
    [events, ev.id, t],
  )
  const noun = ev.type === 'boda' ? 'la boda' : ev.type === 'xv' ? 'los XV años' : 'el evento'

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-5">
      <motion.div variants={fadeRise} className="-mb-1 flex flex-wrap items-center justify-between gap-2">
        <Link to="/estudio" className="pressable inline-flex h-10 items-center gap-1.5 rounded-full pr-4 pl-2 text-sm text-ink-soft hover:bg-wash hover:text-ink">
          <ArrowLeft size={18} strokeWidth={1.6} /> Temporada
        </Link>
        {eventOptions.length > 0 && <FilterMenu value="" onChange={(v) => v && navigate(`/estudio/${v}`)} options={eventOptions} allLabel="Cambiar de evento" label="Cambiar de evento" />}
      </motion.div>

      {/* Las luces del evento, de lado a lado del cielo */}
      <motion.div variants={fadeRise}>
        <NightSlab horizon={false} className="pt-6 pb-6 md:pt-8 md:pb-7" luzSize="clamp(38px,5.5vw,70px)" luzClassName="absolute top-[6%] right-[5%]">
          <div className="px-5 pr-16 md:px-9 md:pr-32">
            <div className="flex items-center gap-3">
              <EventOrb type={ev.type} orb size="sm" />
              <span className="text-[13.5px] text-on-night-soft">
                {EVENT_TYPE[ev.type].label} · {VENUE[ev.venue].label}
              </span>
            </div>
            <h1 className="heading mt-3 max-w-[20ch] text-[clamp(2rem,1.5rem+2.4vw,3.3rem)] text-on-night">{ev.title}</h1>
            <p className="mt-2 text-[14.5px] text-on-night-soft">
              {capitalize(fmt(ev.date, "EEEE d 'de' MMMM"))} · {ev.startTime}–{ev.endTime} · {ev.guests} invitados
            </p>
          </div>

          <Luces grande lights={lights} perRow={isMobile ? 3 : undefined} active={activeKey} onPart={pickPart} onHover={isMobile ? undefined : setPartHover} className="mt-5 md:mt-6" />

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4 px-5 md:px-9">
            <div className="flex shrink-0 items-baseline gap-2.5">
              <span className="display-num text-[3rem] leading-[0.9] font-light text-luz">{Math.abs(d)}</span>
              <span className="text-[14.5px] leading-tight text-on-night-soft">
                {Math.abs(d) === 1 ? 'día' : 'días'}
                {d < 0 ? ' desde el evento' : ''}
              </span>
            </div>
            {/* Lo que sigue, en una frase */}
            <div className="min-w-0 flex-1 basis-64 rounded-[16px] bg-[color-mix(in_oklab,var(--on-night)_7%,transparent)] px-4 py-2.5">
              <p className="text-[12.5px] text-on-night-soft">
                {coach.current.label} · {lights.score.label}
              </p>
              <p className={cx('mt-0.5 text-[15px] leading-snug font-medium', step.tone === 'bad' ? '[color:color-mix(in_oklab,var(--danger)_45%,var(--on-night))]' : 'text-luz')}>{step.text}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="luz" icon={<Clapperboard size={17} strokeWidth={1.7} />} onClick={() => navigate(`/estudio/${ev.id}/dia`)}>
                {d === 0 ? 'Abrir Modo día' : 'Ensayar el día'}
              </Button>
              <Link to={`/eventos/${ev.id}`} className="pressable inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_28%,transparent)] ring-inset hover:bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)] pointer-fine:h-10">
                Abrir evento <ArrowRight size={15} strokeWidth={1.7} />
              </Link>
            </div>
          </div>
        </NightSlab>
      </motion.div>

      {/* El camino */}
      <motion.div variants={fadeRise}>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 pt-4 pb-3 md:px-5 md:pt-5">
            <div className="min-w-0 flex-1 basis-56">
              <h2 className="text-[17px] leading-tight font-semibold tracking-[-0.02em]">El camino de {noun}</h2>
              <p className="mt-1 text-[13.5px] leading-snug text-ink-soft">
                {counts.late > 0 && <span className="font-semibold text-key">{counts.late} {counts.late === 1 ? 'atrasado' : 'atrasados'} · </span>}
                {counts.open} por venir · {counts.done} {counts.done === 1 ? 'hecho' : 'hechos'}
                {focusLane ? (
                  <button onClick={() => setPart(null)} className="ml-2 font-medium text-ink underline underline-offset-2">
                    Ver todo
                  </button>
                ) : (
                  !isMobile && (
                    <button onClick={() => setWide((v) => !v)} className="ml-2 font-medium text-ink underline underline-offset-2">
                      {wide ? 'Ver de cerca' : 'Ver desde el inicio'}
                    </button>
                  )
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => setAddOpen(true)}>
                Paso
              </Button>
              {availableNow > 0 && (
                <Button size="sm" variant="tinta" icon={<Sparkles size={15} strokeWidth={1.7} />} onClick={() => setPlanOpen(true)}>
                  Plan profesional · {availableNow}
                </Button>
              )}
            </div>
          </div>

          {isMobile ? (
            <CaminoVertical nodes={nodes} ev={ev} focusLane={focusLane} onOpen={(n) => setSelId(n.id)} />
          ) : (
            <Riel rows={rows} from={from} to={to} today={t} selectedId={selId} onSelect={(n) => setSelId(n.id)} onMove={move} eventDate={ev.date} eventLabel={EVENT_TYPE[ev.type].label} ribbons={ribbons} appear={appear} minPx={wide ? 5 : 15} leftWidth={146} hint />
          )}
        </Card>
      </motion.div>

      {/* Lo que sigue (en el celular el camino ya lo dice) */}
      {!isMobile && (
        <motion.div variants={fadeRise}>
          <Card className="p-3 md:p-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 px-2">
              <h2 className="text-[15px] font-semibold tracking-[-0.015em]">Lo que sigue</h2>
              <span className="text-[13px] text-detail tabular">{nextList.length} abiertos</span>
            </div>
            {nextList.length === 0 && (
              <p className="flex items-center gap-2 px-2 py-4 text-sm text-ink-soft">
                <Sparkle className="text-chispa-soft" /> Nada pendiente{focusLane ? ' en esta parte' : ''}.
              </p>
            )}
            <div className="grid gap-x-3 gap-y-0.5 lg:grid-cols-2">
              {(showAllNext ? nextList : nextList.slice(0, 6)).map((n) => (
                <NodeRow key={n.id} node={n} onOpen={(x) => setSelId(x.id)} />
              ))}
            </div>
            {nextList.length > 6 && (
              <button onClick={() => setShowAllNext((v) => !v)} className="pressable mt-2 min-h-11 w-full rounded-full text-sm font-medium hover:bg-wash">
                {showAllNext ? 'Ver menos' : `Ver los ${nextList.length}`}
              </button>
            )}
          </Card>
        </motion.div>
      )}

      <Sheet open={!!selected} onClose={() => setSelId(undefined)}>
        <div className="pt-5">{selected && <NodeDetail node={selected} ev={ev} onMove={move} />}</div>
      </Sheet>
      <PlanSheet ev={ev} open={planOpen} onClose={() => setPlanOpen(false)} onApplied={(ids) => setAppear(new Set(ids))} />
      <AddStepSheet ev={ev} open={addOpen} onClose={() => setAddOpen(false)} initial={{ lane: focusLane ?? undefined }} onAdded={(id) => setAppear(new Set([id]))} />
    </motion.div>
  )
}

/** En el celular el camino va hacia abajo: nada se mueve de lado */
function CaminoVertical({ nodes, ev, focusLane, onOpen }: { nodes: CaminoNode[]; ev: RanchEvent; focusLane: CaminoLane | null; onOpen: (n: CaminoNode) => void }) {
  const [showDone, setShowDone] = useState(false)
  const t = today()
  const list = focusLane ? nodes.filter((n) => n.lane === focusLane) : nodes
  const late = list.filter((n) => n.state === 'late')
  const open = list.filter((n) => n.state === 'now' || n.state === 'next')
  const done = list.filter((n) => n.state === 'done')
  // Lo que viene, por fase
  const groups = phaseRibbons(ev, '0000-01-01', '9999-12-31', t)
    .map((p) => ({ ...p, items: open.filter((n) => n.due >= p.from && n.due <= p.to) }))
    .filter((g) => g.items.length)
  const today_ = open.filter((n) => n.due === ev.date)
  const Rail = ({ items }: { items: CaminoNode[] }) => (
    <div className="flex flex-col gap-0.5">
      {items.map((n) => (
        <NodeRow key={n.id} node={n} onOpen={onOpen} />
      ))}
    </div>
  )
  return (
    <div className="flex flex-col gap-4 px-3 pb-4">
      {late.length > 0 && (
        <section>
          <h3 className="mb-1 flex items-center gap-2 px-1.5 text-[14px] font-semibold text-key">
            <StateMark state="late" /> Atrasado · {late.length}
          </h3>
          <Rail items={late} />
        </section>
      )}
      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="mb-1 flex items-baseline justify-between gap-2 px-1.5">
            <span className={cx('text-[14px] font-semibold', g.current && 'text-key')}>{g.label}</span>
            <span className="text-[12.5px] text-detail">{dueText(g.items[0]!.due, 'done')}</span>
          </h3>
          <Rail items={g.items} />
        </section>
      ))}
      {today_.length > 0 && (
        <section>
          <h3 className="mb-1 px-1.5 text-[14px] font-semibold">El día del evento</h3>
          <Rail items={today_} />
        </section>
      )}
      {done.length > 0 && (
        <button onClick={() => setShowDone((v) => !v)} className="pressable min-h-11 rounded-full text-sm font-medium hover:bg-wash">
          {showDone ? 'Ocultar lo hecho' : `Ver lo hecho · ${done.length}`}
        </button>
      )}
      {showDone && <Rail items={done} />}
    </div>
  )
}

export default function Estudio() {
  const { id } = useParams()
  const ev = useDoc('events', id)
  const navigate = useNavigate()
  if (!id) return <Temporada />
  if (!ev) return <Empty kind="busqueda" title="No encontramos este evento" body="Puede que se haya eliminado o que el enlace esté incompleto." action={<Button onClick={() => navigate('/estudio')}>Volver al Estudio</Button>} />
  return <CaminoEvento ev={ev} />
}

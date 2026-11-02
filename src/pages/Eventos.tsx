import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { addDays, addMonths, endOfMonth, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Inbox, List, PartyPopper, Plus, Users, Wallet } from 'lucide-react'
import type { EventType, RanchEvent, Venue } from '@/lib/types'
import { db, useCollection, useMe } from '@/lib/store'
import { EVENT_STATUS, EVENT_TYPE, TONE, VENUE, seesMoney } from '@/lib/meta'
import { capitalize, compactMxn, fmtDate, relativeDay, toISODate, today } from '@/lib/format'
import { useEventMoney } from '@/lib/planner'
import { ease, haptic } from '@/lib/motion'
import { withUndo } from '@/lib/undo'
import { morphNavigate, vt, vtName } from '@/lib/transitions'
import { Badge, Button, Card, Chip, Empty, PageHeader, Segmented, Stat, cx, toast } from '@/components/ui'
import { Combobox, SearchField } from '@/components/fields'
import Prospectos from './Prospectos'
import { CountUp } from '@/components/step1'
import { NewEventSheet } from '@/components/events/NewEventSheet'
import { EventOrb } from '@/components/events/EventOrb'

export { useEventMoney }

type View = 'calendario' | 'prospectos' | 'lista'

export default function Eventos() {
  const navigate = useNavigate()
  const me = useMe()
  const showMoney = seesMoney(me?.role)
  const events = useCollection('events')
  const money = useEventMoney()
  const [params, setParams] = useSearchParams()
  const vista = params.get('vista') as View | null
  const [view, setViewState] = useState<View>(() => vista ?? (window.matchMedia('(max-width: 767px)').matches ? 'lista' : 'calendario'))
  useEffect(() => {
    if (vista && vista !== view) setViewState(vista)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista])
  const setView = (v: View) => {
    setViewState(v)
    const p = new URLSearchParams(params)
    if (v === 'calendario') p.delete('vista')
    else p.set('vista', v)
    setParams(p, { replace: true })
  }
  const openEvent = (id: string) => morphNavigate(navigate, `/eventos/${id}`, vtName('ev', id))
  const nuevo = params.get('nuevo')
  const presetVenue: Venue | undefined = nuevo === 'salon' || nuevo === 'jardin' ? nuevo : undefined
  const [newOpen, setNewOpen] = useState(() => !!nuevo)
  const [newDate, setNewDate] = useState<string | undefined>()
  const closeNew = () => {
    setNewOpen(false)
    if (params.has('nuevo')) {
      params.delete('nuevo')
      setParams(params, { replace: true })
    }
  }
  const openNew = (date?: string) => {
    setNewDate(date)
    setNewOpen(true)
  }

  const kpis = useMemo(() => {
    const ym = today().slice(0, 7)
    const month = events.filter((e) => e.date.startsWith(ym) && e.status !== 'cancelado')
    const committed = month.filter((e) => ['apartado', 'confirmado', 'realizado'].includes(e.status))
    const pendingAll = events.filter((e) => ['apartado', 'confirmado'].includes(e.status) && e.date >= today())
    return {
      count: month.length,
      guests: month.reduce((n, e) => n + e.guests, 0),
      income: committed.reduce((n, e) => n + money.total(e), 0),
      receivable: pendingAll.reduce((n, e) => n + money.balance(e), 0),
      next: events.filter((e) => e.date >= today() && e.status !== 'cancelado').sort((a, b) => a.date.localeCompare(b.date))[0],
    }
  }, [events, money])

  return (
    <div>
      <PageHeader
        eyebrow="Salón y jardín"
        title="Eventos"
        subtitle={kpis.next ? `Próximo: ${kpis.next.title}, ${relativeDay(kpis.next.date).toLowerCase()}` : 'Sin eventos próximos'}
        primary={{ label: 'Nuevo evento', icon: <Plus size={18} strokeWidth={1.6} />, onClick: () => openNew() }}
      />

      {view !== 'prospectos' && <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Eventos este mes" value={<CountUp value={kpis.count} />} icon={<PartyPopper size={16} strokeWidth={1.6} />} tone="rose" />
        <Stat label="Invitados del mes" value={<CountUp value={kpis.guests} format={(n) => Math.round(n).toLocaleString('es-MX')} />} icon={<Users size={16} strokeWidth={1.6} />} tone="sky" />
        {showMoney && <Stat label="Ingresos comprometidos" value={<CountUp value={kpis.income} format={compactMxn} />} sub="Apartados, confirmados y realizados" icon={<Wallet size={16} strokeWidth={1.6} />} tone="sage" accent />}
        {showMoney && <Stat label="Por cobrar" value={<CountUp value={kpis.receivable} format={compactMxn} />} sub="De eventos próximos" icon={<Clock size={16} strokeWidth={1.6} />} tone="peach" />}
      </div>}

      <div className="mb-5 flex items-center justify-between gap-3">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: 'calendario', label: <><CalendarDays size={16} strokeWidth={1.6} /> <span className="hidden sm:inline">Calendario</span></> },
            { value: 'prospectos', label: <><Inbox size={16} strokeWidth={1.6} /> <span className="hidden sm:inline">Prospectos</span></> },
            { value: 'lista', label: <><List size={16} strokeWidth={1.6} /> <span className="hidden sm:inline">Lista</span></> },
          ]}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.calma } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
          {view === 'calendario' && <CalendarView events={events} onNew={openNew} onOpen={openEvent} />}
          {view === 'prospectos' && <Prospectos embedded />}
          {view === 'lista' && <ListView events={events} money={money} showMoney={showMoney} onOpen={openEvent} />}
        </motion.div>
      </AnimatePresence>

      <NewEventSheet open={newOpen || !!nuevo} onClose={closeNew} initialDate={newDate} initialVenue={presetVenue} />
    </div>
  )
}

// ── Calendario ───────────────────────────────────────────
function CalendarView({ events, onNew, onOpen }: { events: RanchEvent[]; onNew: (d: string) => void; onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<string>(today())
  const byDay = useMemo(() => {
    const m = new Map<string, RanchEvent[]>()
    for (const e of events) if (e.status !== 'cancelado') m.set(e.date, [...(m.get(e.date) ?? []), e])
    return m
  }, [events])
  const drag = useEventDrag(events)
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfMonth(month)
  const days: Date[] = []
  for (let d = start; d <= end || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d)
  const t = today()
  const selectedEvents = byDay.get(selected) ?? []
  const monthEvents = events.filter((e) => e.date.startsWith(toISODate(month).slice(0, 7)) && e.status !== 'cancelado')
  const freeSaturdays = days.filter((d) => isSameMonth(d, month) && d.getDay() === 6 && toISODate(d) >= t && !(byDay.get(toISODate(d)) ?? []).some((e) => e.venue === 'salon')).length

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 md:px-6">
          <div>
            <h3 className="heading text-[1.6rem]">{capitalize(format(month, 'MMMM yyyy', { locale: es }))}</h3>
            <p className="mt-0.5 text-sm text-ink-soft">
              {monthEvents.length} eventos · {monthEvents.filter((e) => e.venue === 'salon').length} en salón · {monthEvents.filter((e) => e.venue === 'jardin').length} en jardín · {freeSaturdays} sábados libres
            </p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Mes anterior">
              <ChevronLeft size={20} strokeWidth={1.6} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
              Hoy
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Mes siguiente">
              <ChevronRight size={20} strokeWidth={1.6} />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-t border-line text-center">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
            <div key={d} className="eyebrow py-2.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const iso = toISODate(d)
            const list = byDay.get(iso) ?? []
            const inMonth = isSameMonth(d, month)
            const isToday = iso === t
            const salon = list.some((e) => e.venue === 'salon')
            const jardin = list.some((e) => e.venue === 'jardin')
            const isSel = selected === iso
            return (
              <div
                key={iso}
                data-day={iso}
                role="button"
                tabIndex={0}
                aria-label={`${capitalize(format(d, "EEEE d 'de' MMMM", { locale: es }))}: ${list.length ? list.map((e) => e.title).join(', ') : 'libre'}`}
                aria-pressed={isSel}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(iso)}
                onClick={() => {
                  setSelected(iso)
                  if (!list.length && window.matchMedia('(min-width: 768px)').matches && iso >= t) onNew(iso)
                }}
                className={cx(
                  'group relative min-h-[66px] cursor-pointer border-t border-r border-line p-1.5 text-left transition-colors duration-[var(--dur-2)] md:min-h-[118px] md:p-2 [&:nth-child(7n)]:border-r-0',
                  !inMonth && 'bg-sunken/50',
                  isSel ? 'bg-[color-mix(in_oklab,var(--luz)_30%,var(--surface))]' : 'hover:bg-wash',
                  drag.over === iso && (drag.blocked ? 'bg-[color-mix(in_oklab,var(--danger)_10%,var(--surface))] shadow-[inset_0_0_0_1.5px_var(--danger)]' : 'drop-glow bg-[color-mix(in_oklab,var(--luz)_18%,var(--surface))]'),
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cx('inline-flex h-8 w-8 items-center justify-center rounded-full text-sm tabular', isToday ? 'bg-ink text-paper' : inMonth ? 'text-ink' : 'text-ink-3')}>{d.getDate()}</span>
                  <span className="flex gap-1">
                    {salon && <span title="Salón ocupado" className="h-2 w-2 rounded-full bg-lavender" />}
                    {jardin && <span title="Jardín ocupado" className="h-2 w-2 rounded-full bg-sage" />}
                  </span>
                </div>
                <div className="mt-1 hidden flex-col gap-1 md:flex">
                  {list.slice(0, 3).map((e) => {
                    const Icon = EVENT_TYPE[e.type].icon
                    return (
                      <button
                        key={e.id}
                        onPointerDown={(ev) => drag.start(ev, e)}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          if (!drag.justDropped()) onOpen(e.id)
                        }}
                        title="Toca para abrir · arrastra a otro día para cambiar la fecha"
                        className={cx('pressable no-callout flex cursor-grab items-center gap-1.5 truncate rounded-full px-2 py-1 text-left text-[11px] touch-manipulation', drag.id === e.id && 'opacity-35', TONE[VENUE[e.venue].tone].soft, TONE[VENUE[e.venue].tone].ink, (e.status === 'prospecto' || e.status === 'cotizado') && 'opacity-75 ring-1 ring-current ring-inset [--tw-ring-opacity:.3]')}
                      >
                        <Icon size={12} strokeWidth={1.6} className="shrink-0" />
                        <span className="truncate">{e.title}</span>
                      </button>
                    )
                  })}
                  {list.length > 3 && <span className="px-2 text-[11px] text-ink-soft">+{list.length - 3} más</span>}
                </div>
                {!list.length && inMonth && iso >= t && <Plus size={14} strokeWidth={1.6} className="absolute right-2 bottom-2 hidden text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 md:block" />}
              </div>
            )
          })}
        </div>
        {drag.ghost}
        <div className="flex flex-wrap gap-4 border-t border-line px-5 py-3 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-lavender" /> Salón
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sage" /> Jardín
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full ring-1 ring-ink-soft ring-inset" /> Prospecto o cotizado
          </span>
          <span className="hidden md:inline">Toca un día libre para crear un evento · arrastra un evento a otro día para moverlo</span>
        </div>
      </Card>

      <Card className="p-5 md:p-6 xl:sticky xl:top-24 xl:self-start">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <div className="eyebrow">{relativeDay(selected)}</div>
            <div className="heading mt-1 text-xl">{capitalize(format(parseISO(selected), "EEEE d 'de' MMMM", { locale: es }))}</div>
          </div>
          {selected >= t && (
            <Button variant="secondary" size="sm" icon={<Plus size={16} strokeWidth={1.6} />} onClick={() => onNew(selected)}>
              Agregar
            </Button>
          )}
        </div>
        {selectedEvents.length === 0 ? (
          <div className="rounded-[14px] bg-[color-mix(in_oklab,var(--success)_10%,var(--surface))] p-4 text-sm text-success">Salón y jardín libres este día.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedEvents.map((e) => (
              <EventRow key={e.id} e={e} onOpen={onOpen} />
            ))}
            {(['salon', 'jardin'] as Venue[])
              .filter((v) => !selectedEvents.some((e) => e.venue === v))
              .map((v) => (
                <div key={v} className="rounded-[14px] p-3 text-sm text-ink-soft ring-1 ring-line ring-inset [border-style:dashed]">
                  {VENUE[v].label} libre
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/** Arrastrar un evento del calendario a otro día (avisa si el espacio ya está ocupado) */
function useEventDrag(events: RanchEvent[]) {
  const [state, setState] = useState<{ ev: RanchEvent; x: number; y: number; over?: string; active: boolean } | null>(null)
  const ref = useRef<{ ev: RanchEvent; x0: number; y0: number; pointerId: number; touch: boolean; timer?: number; active: boolean; over?: string } | null>(null)
  const dropped = useRef(0)
  const eventsRef = useRef(events)
  eventsRef.current = events
  const conflictOn = (ev: RanchEvent, day: string) => eventsRef.current.find((o) => o.id !== ev.id && o.date === day && o.venue === ev.venue && o.status !== 'cancelado')
  const live = useRef({ move: (_e: PointerEvent) => {}, up: (_e: PointerEvent) => {} })
  const [stable] = useState(() => ({ move: (e: PointerEvent) => live.current.move(e), up: (e: PointerEvent) => live.current.up(e) }))
  const stop = () => {
    clearTimeout(ref.current?.timer)
    ref.current = null
    setState(null)
    window.removeEventListener('pointermove', stable.move)
    window.removeEventListener('pointerup', stable.up)
    window.removeEventListener('pointercancel', stable.up)
  }
  live.current.move = (e) => {
    const d = ref.current
    if (!d || e.pointerId !== d.pointerId) return
    if (!d.active) {
      const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
      if (d.touch) return dist > 9 ? stop() : undefined
      if (dist < 6) return
      d.active = true
      haptic.light()
    }
    const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-day]') as HTMLElement | null
    const over = cell?.dataset.day
    if (over !== d.over) {
      d.over = over
      if (over) haptic.select()
    }
    setState({ ev: d.ev, x: e.clientX, y: e.clientY, over, active: true })
  }
  live.current.up = (e) => {
    const d = ref.current
    if (!d || e.pointerId !== d.pointerId) return
    if (d.active) {
      dropped.current = Date.now()
      const day = d.over
      if (day && day !== d.ev.date) {
        const clash = conflictOn(d.ev, day)
        if (clash) toast.error(`El ${VENUE[d.ev.venue].label.toLowerCase()} ya está ocupado ese día`, clash.title)
        else {
          const prev = d.ev.date
          db.patch('events', d.ev.id, { date: day })
          withUndo('Evento movido', () => db.patch('events', d.ev.id, { date: prev }), `${d.ev.title} · ${fmtDate(day)}`)
        }
      }
    }
    stop()
  }
  useEffect(() => () => stop(), []) // eslint-disable-line react-hooks/exhaustive-deps
  const start = (e: React.PointerEvent, ev: RanchEvent) => {
    if (e.button !== 0 || ref.current || ev.status === 'realizado') return
    const touch = e.pointerType !== 'mouse'
    ref.current = { ev, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, touch, active: false }
    if (touch)
      ref.current.timer = window.setTimeout(() => {
        if (!ref.current) return
        ref.current.active = true
        haptic.light()
        setState({ ev, x: e.clientX, y: e.clientY, active: true })
      }, 320)
    window.addEventListener('pointermove', stable.move)
    window.addEventListener('pointerup', stable.up)
    window.addEventListener('pointercancel', stable.up)
  }
  const blocked = !!state?.over && state.over !== state.ev.date && !!conflictOn(state.ev, state.over)
  const ghost = state?.active ? (
    <div className="pointer-events-none fixed top-0 left-0 z-[80]" style={{ transform: `translate(${state.x + 12}px, ${state.y - 14}px)` }}>
      <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-3)] ring-1', blocked ? 'bg-[color-mix(in_oklab,var(--danger)_14%,var(--surface))] text-danger ring-danger' : 'bg-surface text-ink ring-primary')}>
        {state.ev.title}
        {state.over && state.over !== state.ev.date && <span className="text-ink-3">→ {blocked ? 'ocupado' : fmtDate(state.over)}</span>}
      </span>
    </div>
  ) : null
  return { start, over: state?.active ? state.over : undefined, blocked, id: state?.active ? state.ev.id : undefined, ghost, justDropped: () => Date.now() - dropped.current < 250 }
}

function EventRow({ e, onOpen, right }: { e: RanchEvent; onOpen: (id: string) => void; right?: ReactNode }) {
  return (
    <button onClick={() => onOpen(e.id)} className="card lift pressable flex w-full items-center gap-3 p-3.5 text-left">
      <span style={vt('ev', e.id)} className="shrink-0 rounded-full">
        <EventOrb type={e.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{e.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-soft">
          <span>{fmtDate(e.date)}</span>·<span>{e.startTime}</span>·<span>{e.guests} invitados</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge>
        <Badge tone={VENUE[e.venue].tone} className="hidden sm:inline-flex">
          {VENUE[e.venue].label}
        </Badge>
        {right}
      </span>
    </button>
  )
}

// ── Lista ────────────────────────────────────────────────
function ListView({ events, money, showMoney, onOpen }: { events: RanchEvent[]; money: ReturnType<typeof useEventMoney>; showMoney: boolean; onOpen: (id: string) => void }) {
  const [venue, setVenue] = useState<Venue | 'todos'>('todos')
  const [type, setType] = useState<EventType | 'todos'>('todos')
  const [q, setQ] = useState('')
  const [past, setPast] = useState(false)
  const t = today()
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const list = events
    .filter((e) => (past ? e.date < t : e.date >= t))
    .filter((e) => venue === 'todos' || e.venue === venue)
    .filter((e) => type === 'todos' || e.type === type)
    .filter((e) => !q || norm(e.title + ' ' + e.clientName).includes(norm(q)))
    .sort((a, b) => (past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))

  const groups = new Map<string, RanchEvent[]>()
  for (const e of list) {
    const k = e.date.slice(0, 7)
    groups.set(k, [...(groups.get(k) ?? []), e])
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Buscar por evento o cliente" className="flex-1" shortcut />
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          <Chip active={!past} onClick={() => setPast(false)}>
            Próximos
          </Chip>
          <Chip active={past} onClick={() => setPast(true)}>
            Pasados
          </Chip>
          <span className="mx-1 w-px shrink-0 bg-line" />
          <Chip active={venue === 'todos'} onClick={() => setVenue('todos')}>
            Todos
          </Chip>
          <Chip active={venue === 'salon'} onClick={() => setVenue('salon')}>
            Salón
          </Chip>
          <Chip active={venue === 'jardin'} onClick={() => setVenue('jardin')}>
            Jardín
          </Chip>
        </div>
        <Combobox
          label="Tipo de evento"
          className="lg:w-56"
          value={type === 'todos' ? '' : type}
          onChange={(v) => setType((v || 'todos') as EventType | 'todos')}
          clearable
          options={(Object.keys(EVENT_TYPE) as EventType[]).map((k) => {
            const Icon = EVENT_TYPE[k].icon
            return { value: k, label: EVENT_TYPE[k].label, icon: <Icon />, tone: EVENT_TYPE[k].tone }
          })}
        />
      </div>
      {list.length === 0 && <Empty kind="evento" title="Sin eventos aquí" body="Cambia los filtros o crea un evento nuevo." />}
      <div className="flex flex-col gap-7">
        {Array.from(groups.entries()).map(([ym, evs]) => (
          <section key={ym}>
            <h3 className="heading mb-3 px-1 text-xl">{capitalize(format(parseISO(ym + '-01'), 'MMMM yyyy', { locale: es }))}</h3>
            <div className="grid gap-2.5 lg:grid-cols-2">
              {evs.map((e) => (
                <EventRow
                  key={e.id}
                  e={e}
                  onOpen={onOpen}
                  right={
                    showMoney && e.status !== 'prospecto' && e.status !== 'cancelado' ? (
                      <span className={cx('text-xs tabular', money.balance(e) <= 0 ? 'text-success' : 'text-ink-soft')}>{money.balance(e) <= 0 ? 'Pagado' : `Debe ${compactMxn(money.balance(e))}`}</span>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

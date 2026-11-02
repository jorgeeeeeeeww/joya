import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Ban, SlidersHorizontal, CalendarDays, Check, Clock, ListChecks, MapPin, MessageCircle, Pencil, Phone, Trash2, Users } from 'lucide-react'
import type { EventStatus, EventType, RanchEvent, Venue } from '@/lib/types'
import { db, useCollection, useDoc, useMe } from '@/lib/store'
import { EVENT_STATUS, EVENT_TYPE, PRIORITY, TASK_STATUS, VENUE, seesMoney } from '@/lib/meta'
import { layoutStats } from '@/lib/floorplan'
import { byProgramTime, visibleNotes, capitalize, daysUntil, fmt, fmtDate, mxn, waLink } from '@/lib/format'
import { countdownLabel, eventReadiness, PIPELINE } from '@/lib/planner'
import { ease, spring } from '@/lib/motion'
import { Avatar, Badge, Button, Card, CardHeader, Confirm, Empty, Field, Input, ProgressBar, ProgressRing, Segmented, Select, Sheet, Textarea, cx, toast } from '@/components/ui'
import { NightSlab, Sparkle } from '@/components/step1'
import { EventScene } from '@/components/scenes'
import { QuoteTab, useQuote } from '@/components/events/QuoteTab'
import { ChecklistTab, GuestsTab, TimelineTab } from '@/components/events/EventTabs'
import { BeoTab, BudgetTab, InspirationTab, MiniPlan, PaymentPlanTab, VendorsTab } from '@/components/events/PlannerTabs'
import { EventOrb, PaletteDots } from '@/components/events/EventOrb'
import { vt } from '@/lib/transitions'
import { modulesOf, type EventModule } from '@/lib/modules'
import { ModulesPicker } from '@/components/events/ModulesPicker'
import { LiveQuote } from '@/components/event-detail/LiveQuote'

const FloorPlanEditor = lazy(() => import('@/components/floorplan/FloorPlanEditor'))

type Tab = 'resumen' | 'plano' | 'invitados' | 'cotizacion' | 'pagos' | 'presupuesto' | 'inspiracion' | 'programa' | 'beo' | 'proveedores' | 'checklist'

export default function EventoDetalle() {
  const { id } = useParams()
  const ev = useDoc('events', id)
  const navigate = useNavigate()
  if (!ev)
    return (
      <Empty
        kind="busqueda"
        title="No encontramos este evento"
        body="Puede que se haya eliminado o que el enlace esté incompleto."
        action={
          <Link to="/eventos">
            <Button>Volver a eventos</Button>
          </Link>
        }
      />
    )
  return <Detail ev={ev} onDeleted={() => navigate('/eventos')} />
}

function Detail({ ev, onDeleted }: { ev: RanchEvent; onDeleted: () => void }) {
  const me = useMe()
  const navigate = useNavigate()
  const showMoney = seesMoney(me?.role)
  const [params, setParams] = useSearchParams()
  const mods = modulesOf(ev)
  const visible = (t: Tab) => t === 'resumen' || mods[t as EventModule]
  const asked = (params.get('tab') as Tab) || 'resumen'
  const tab: Tab = visible(asked) ? asked : 'resumen'
  const [modsOpen, setModsOpen] = useState(false)
  const setTab = (t: Tab) => {
    params.set('tab', t)
    setParams(params, { replace: true })
  }
  const [editOpen, setEditOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const type = EVENT_TYPE[ev.type]
  const d = daysUntil(ev.date)

  // 7 grupos en lugar de 11 pestañas; dentro de cada grupo, un selector pequeño
  const LABEL: Record<Tab, string> = { resumen: 'Resumen', plano: 'Plano de mesas', invitados: 'Invitados', cotizacion: 'Cotización', pagos: 'Plan de pagos', presupuesto: 'Presupuesto', inspiracion: 'Inspiración', programa: 'Programa', beo: 'Orden de evento', proveedores: 'Proveedores', checklist: 'Checklist' }
  type Group = { value: string; label: string; tabs: Tab[] }
  const groups: Group[] = ([
    { value: 'resumen', label: 'Resumen', tabs: ['resumen'] },
    { value: 'plano', label: 'Plano de mesas', tabs: ['plano'] },
    { value: 'invitados', label: 'Invitados', tabs: ['invitados'] },
    ...(showMoney ? [{ value: 'dinero', label: 'Cotización y pagos', tabs: ['cotizacion', 'pagos', 'presupuesto'] as Tab[] }] : []),
    { value: 'dia', label: 'Día del evento', tabs: ['programa', 'beo', 'checklist'] },
    { value: 'proveedores', label: 'Proveedores', tabs: ['proveedores'] },
    { value: 'inspiracion', label: 'Inspiración', tabs: ['inspiracion'] as Tab[] },
  ] as Group[])
    .map((g) => ({ ...g, tabs: g.tabs.filter(visible) }))
    .filter((g) => g.tabs.length)
  const group = groups.find((g) => g.tabs.includes(tab)) ?? groups[0]!

  const setStatus = (s: EventStatus) => {
    if (s === ev.status) return
    db.patch('events', ev.id, { status: s })
    toast.success(EVENT_STATUS[s].label, s === 'confirmado' ? 'Se generó el plan de trabajo del equipo' : ev.title)
  }
  const stepIdx = PIPELINE.indexOf(ev.status)

  return (
    <div>
      <Link to="/eventos" className="pressable mb-4 inline-flex h-10 items-center gap-1.5 rounded-full pr-4 pl-2 text-sm text-ink-soft hover:bg-wash hover:text-ink">
        <ArrowLeft size={18} strokeWidth={1.6} /> Eventos
      </Link>

      {/* Encabezado: losa noche con la luz */}
      <NightSlab scene={<EventScene type={ev.type} />} className="px-5 pt-6 pb-24 md:px-9 md:pt-9 md:pb-28" luzSize="clamp(40px, 7vw, 88px)" luzClassName="absolute top-[42%] right-[34%] hidden md:block">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span style={vt('ev', ev.id)} className="shrink-0 rounded-full">
                <EventOrb type={ev.type} orb />
              </span>
              <span className="rounded-full bg-[color-mix(in_oklab,var(--on-night)_12%,transparent)] px-3 py-1 text-xs text-on-night">{type.label}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--on-night)_12%,transparent)] px-3 py-1 text-xs text-on-night">
                <MapPin size={12} strokeWidth={1.6} /> {VENUE[ev.venue].label}
              </span>
              {ev.status === 'cancelado' && <Badge tone="rose">Cancelado</Badge>}
            </div>
            <h1 className="heading max-w-[18ch] text-[clamp(2.1rem,1.6rem+2.4vw,3.6rem)] text-on-night">{ev.title}</h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px] text-on-night-soft">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={16} strokeWidth={1.6} /> {capitalize(fmt(ev.date, "EEEE d 'de' MMMM yyyy"))}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={16} strokeWidth={1.6} /> {ev.startTime} – {ev.endTime}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={16} strokeWidth={1.6} /> {ev.guests} invitados
              </span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[15px] text-on-night">{ev.clientName}</span>
              {ev.phone && (
                <>
                  <a href={`tel:${ev.phone}`} className="pressable inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_28%,transparent)] hover:bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)]">
                    <Phone size={15} strokeWidth={1.6} /> Llamar
                  </a>
                  <a href={waLink(ev.phone, `Hola ${ev.clientName.split(' ')[0]}, te escribimos de Jardines La Joya sobre ${ev.title}.`)} target="_blank" rel="noopener" className="pressable inline-flex h-10 items-center gap-1.5 rounded-full bg-luz px-4 text-sm font-medium text-night shadow-glow">
                    <MessageCircle size={15} strokeWidth={1.6} /> WhatsApp
                  </a>
                </>
              )}
              {ev.palette?.length ? <PaletteDots colors={ev.palette} size={20} className="ml-2" /> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-row items-end gap-4 md:flex-col md:items-end">
            <div className="md:text-right">
              <div className="eyebrow !text-on-night-soft">{fmtDate(ev.date)}</div>
              <div className="display-num mt-1 text-[clamp(2.4rem,2rem+1.6vw,3.6rem)] text-on-night">{d > 1 ? d : countdownLabel(d)}</div>
              {d > 1 && <div className="text-sm text-on-night-soft">días para el evento</div>}
            </div>
            <div className="flex gap-1.5">
              <HeroIcon label="Qué incluye este evento" onClick={() => setModsOpen(true)}>
                <SlidersHorizontal size={17} strokeWidth={1.6} />
              </HeroIcon>
              <HeroIcon label="Editar evento" onClick={() => setEditOpen(true)}>
                <Pencil size={17} strokeWidth={1.6} />
              </HeroIcon>
              {ev.status !== 'cancelado' && (
                <HeroIcon label="Cancelar evento" onClick={() => setCancelOpen(true)}>
                  <Ban size={17} strokeWidth={1.6} />
                </HeroIcon>
              )}
              {me?.role === 'admin' && (
                <HeroIcon label="Eliminar evento" onClick={() => setDelOpen(true)}>
                  <Trash2 size={17} strokeWidth={1.6} />
                </HeroIcon>
              )}
            </div>
          </div>
        </div>
      </NightSlab>

      {/* Pasos de estado (flotan sobre el borde de la losa) */}
      <div className="relative z-[3] -mt-14 px-3 md:px-6">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-full bg-surface p-1.5 shadow-[var(--shadow-2)] ring-1 ring-line" role="group" aria-label="Etapa del evento">
          {PIPELINE.map((s, i) => {
            const done = stepIdx >= i && ev.status !== 'cancelado'
            const current = ev.status === s
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                aria-current={current ? 'step' : undefined}
                className={cx('pressable relative flex h-12 min-w-[128px] flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm whitespace-nowrap transition-colors', current ? 'text-on-primary' : done ? 'text-ink' : 'text-ink-3 hover:text-ink-soft')}
              >
                {current && <motion.span layoutId="ev-step" className="absolute inset-0 rounded-full bg-primary" transition={spring.suave} />}
                <span className={cx('relative flex h-6 w-6 items-center justify-center rounded-full text-[11px]', current ? 'bg-on-primary/20' : done ? 'bg-[color-mix(in_oklab,var(--success)_16%,var(--surface))] text-success' : 'ring-1 ring-line-strong ring-inset')}>{done && !current ? <Check size={13} strokeWidth={2} /> : i + 1}</span>
                <span className="relative">{EVENT_STATUS[s].label}</span>
                {done && !current && s === 'confirmado' && <Sparkle className="relative text-[10px] text-chispa-soft" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Pestañas */}
      <div className="glass no-scrollbar sticky top-0 z-20 -mx-4 mt-5 mb-5 flex gap-1 overflow-x-auto px-4 py-2 md:mx-0 md:rounded-full md:px-1.5 md:ring-1 md:ring-line" role="tablist" aria-label="Secciones del evento">
        {groups.map((g) => (
          <button key={g.value} role="tab" aria-selected={group.value === g.value} onClick={() => setTab(g.tabs[0]!)} className={cx('relative h-11 shrink-0 rounded-full px-4 text-[15px] whitespace-nowrap transition-colors duration-[var(--dur-2)] pointer-fine:h-10 pointer-fine:text-sm', group.value === g.value ? 'text-paper' : 'text-ink-soft hover:text-ink')}>
            {group.value === g.value && <motion.span layoutId="ev-tab" className="absolute inset-0 rounded-full bg-ink" transition={spring.suave} />}
            <span className="relative">{g.label}</span>
          </button>
        ))}
      </div>
      {group.tabs.length > 1 && (
        <div className="mb-5 -mt-1">
          <Segmented size="sm" value={tab} onChange={setTab} options={group.tabs.map((t) => ({ value: t, label: LABEL[t] }))} />
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={tab} role="tabpanel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.calma } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
          {tab === 'resumen' && <Summary ev={ev} showMoney={showMoney} goTab={setTab} />}
          {tab === 'plano' && (
            <Suspense fallback={<div className="skeleton h-[60vh] rounded-[var(--r-lg)]" />}>
              <FloorPlanEditor event={ev} readOnly={ev.status === 'realizado' || ev.status === 'cancelado'} />
            </Suspense>
          )}
          {tab === 'invitados' && (
            <div className="flex flex-col gap-5">
              <Card className="flex flex-wrap items-center gap-4 p-5 md:p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[5px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]">
                  <Users size={20} strokeWidth={1.6} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="heading text-xl">Estación de invitados</p>
                  <p className="text-sm text-ink-soft">Confirmaciones por WhatsApp, acomodo en mesas arrastrando y recepción en la puerta el día del evento.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => navigate(`/invitados?e=${ev.id}&v=mesas`)}>
                    Acomodar mesas
                  </Button>
                  <Button variant="tinta" icon={<Users size={17} strokeWidth={1.6} />} onClick={() => navigate(`/invitados?e=${ev.id}`)}>
                    Abrir estación de invitados
                  </Button>
                </div>
              </Card>
              <GuestsTab ev={ev} />
            </div>
          )}
          {tab === 'cotizacion' && showMoney && (
            <div className="flex flex-col gap-5">
              <LiveQuote ev={ev} />
              <QuoteTab ev={ev} />
            </div>
          )}
          {tab === 'pagos' && showMoney && <PaymentPlanTab ev={ev} />}
          {tab === 'presupuesto' && showMoney && <BudgetTab ev={ev} />}
          {tab === 'inspiracion' && <InspirationTab ev={ev} />}
          {tab === 'programa' && <TimelineTab ev={ev} />}
          {tab === 'beo' && <BeoTab ev={ev} />}
          {tab === 'proveedores' && <VendorsTab ev={ev} />}
          {tab === 'checklist' && <ChecklistTab ev={ev} />}
        </motion.div>
      </AnimatePresence>

      <EditEventSheet open={editOpen} onClose={() => setEditOpen(false)} ev={ev} />
      <Sheet open={modsOpen} onClose={() => setModsOpen(false)} title="Qué incluye este evento" subtitle="Apaga lo que no vas a usar: desaparece de las pestañas y deja de contar en los pendientes.">
        <ModulesPicker value={mods} showMoney={showMoney} onChange={(m, on) => db.patch('events', ev.id, { modules: { ...ev.modules, [m]: on } })} />
      </Sheet>
      <Confirm open={cancelOpen} onClose={() => setCancelOpen(false)} title="¿Cancelar este evento?" body="La fecha quedará libre en el calendario. Los pagos registrados se conservan." confirmLabel="Cancelar evento" danger onConfirm={() => setStatus('cancelado')} />
      <Confirm
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="¿Eliminar evento?"
        body="Se quitará de la agenda. Queda registrado en la bitácora y se puede recuperar desde un respaldo."
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          db.remove('events', ev.id)
          toast.success('Evento eliminado')
          onDeleted()
        }}
      />
    </div>
  )
}

function HeroIcon({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="pressable flex h-11 w-11 items-center justify-center rounded-full text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_24%,transparent)] hover:bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)]">
      {children}
    </button>
  )
}

function Summary({ ev, showMoney, goTab }: { ev: RanchEvent; showMoney: boolean; goTab: (t: Tab) => void }) {
  const q = useQuote(ev, ev.lineItems, ev.discount, ev.includeIva)
  const allTasks = useCollection('tasks')
  const employees = useCollection('employees')
  const tasks = useMemo(() => allTasks.filter((t) => t.eventId === ev.id).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '')), [allTasks, ev.id])
  const stats = layoutStats(ev.layout)
  const ready = eventReadiness(ev, q.total ? q.paid / q.total : 0)
  const checklistDone = ev.checklist.filter((c) => c.done).length
  const people = ev.guestList.reduce((n, g) => n + g.count, 0)
  const confirmedGuests = ev.guestList.filter((g) => g.confirmed).reduce((n, g) => n + g.count, 0)
  const nextTl = [...ev.timeline].filter((t) => !t.done).sort(byProgramTime)[0]
  const coordinator = employees.find((e) => e.id === ev.coordinatorId)
  const tasksDone = tasks.filter((t) => t.status === 'hecha' || t.status === 'verificada').length

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Preparación general */}
      <Card className="p-6 lg:col-span-3">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center">
          <div className="flex items-center gap-5">
            <ProgressRing value={ready.overall} size={96} stroke={6} gradient>
              <span className="display-num text-2xl">{Math.round(ready.overall * 100)}%</span>
            </ProgressRing>
            <div>
              <div className="eyebrow">Preparación del evento</div>
              <div className="heading mt-1 text-2xl">{ready.overall >= 0.85 ? 'Casi todo listo' : ready.overall >= 0.5 ? 'Va muy bien' : 'Apenas empezamos'}</div>
              <p className="mt-1 text-sm text-ink-soft">Combina checklist, pagos e invitados confirmados.</p>
            </div>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 sm:gap-4">
            {[
              { label: 'Checklist', v: ready.checklist, sub: `${checklistDone}/${ev.checklist.length}`, tab: 'checklist' as Tab },
              { label: 'Pagos', v: ready.payments, sub: showMoney ? mxn(q.paid) : `${Math.round(ready.payments * 100)}%`, tab: (showMoney ? 'pagos' : 'resumen') as Tab },
              { label: 'Confirmados', v: ready.guests, sub: `${confirmedGuests} de ${people || ev.guests}`, tab: 'invitados' as Tab },
            ].map((x) => (
              <button key={x.label} onClick={() => goTab(x.tab)} className="pressable w-full min-w-0 rounded-[18px] p-3 text-left hover:bg-wash">
                <div className="text-xs text-ink-soft">{x.label}</div>
                <div className="display-num mt-1 text-[1.7rem]">{Math.round(x.v * 100)}%</div>
                <ProgressBar value={x.v} className="mt-2" />
                <div className="mt-1.5 text-xs text-ink-3 tabular">{x.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {showMoney && (
        <Card className="p-6" onClick={() => goTab('cotizacion')} as="button">
          <div className="text-xs text-ink-soft">Total del evento</div>
          <div className="display-num mt-2 text-[2.3rem]">{mxn(q.total)}</div>
          <ProgressBar value={q.total ? q.paid / q.total : 0} className="mt-4 h-2.5" />
          <div className="mt-2.5 flex justify-between text-sm">
            <span className="text-success">Pagado {mxn(q.paid)}</span>
            <span className={q.balance > 0 ? 'text-ink' : 'text-ink-soft'}>{q.balance > 0 ? `Saldo ${mxn(q.balance)}` : 'Liquidado'}</span>
          </div>
        </Card>
      )}
      <Card className="overflow-hidden" onClick={() => goTab('plano')} as="button">
        <div className="bg-sunken/70 p-3">
          <MiniPlan ev={ev} className="block h-28 w-full" />
        </div>
        <div className="flex items-baseline gap-4 px-6 pt-4">
          <span className="display-num text-[2rem]">{stats.tables}</span>
          <span className="text-sm text-ink-soft">mesas</span>
          <span className="display-num text-[2rem]">{stats.seats}</span>
          <span className="text-sm text-ink-soft">lugares</span>
        </div>
        <div className={cx('mx-6 mt-3 mb-6 rounded-[14px] p-3 text-sm', stats.seats >= ev.guests ? 'bg-[color-mix(in_oklab,var(--success)_10%,var(--surface))] text-success' : 'bg-[color-mix(in_oklab,var(--danger)_10%,var(--surface))] text-danger')}>{stats.seats >= ev.guests ? `Alcanza para los ${ev.guests} invitados` : `Faltan ${ev.guests - stats.seats} lugares`}</div>
      </Card>
      <Card className="p-6" onClick={() => goTab('inspiracion')} as="button">
        <div className="eyebrow">Inspiración</div>
        <div className="heading mt-2 text-xl">{ev.theme || 'Sin temática todavía'}</div>
        {ev.palette?.length ? <PaletteDots colors={ev.palette} size={34} className="mt-4" /> : <p className="mt-2 text-sm text-ink-soft">Agrega la paleta de colores de la clienta.</p>}
        {ev.moodNotes && <p className="mt-4 line-clamp-3 text-sm text-ink-soft">{ev.moodNotes}</p>}
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Plan de trabajo del equipo" subtitle={tasks.length ? `${tasksDone} de ${tasks.length} terminadas` : 'Se genera solo al confirmar el evento'} icon={<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary"><ListChecks size={19} strokeWidth={1.6} /></span>} />
        <div className="flex flex-col gap-2 p-4 md:p-5">
          {tasks.length === 0 && (
            <div className="rounded-[18px] p-5 text-sm text-ink-soft ring-1 ring-line ring-inset [border-style:dashed]">
              Cuando el evento pase a <span className="text-ink">Confirmado</span>, el sistema crea las tareas de menú (30 días antes), invitados (7 días antes), montaje (un día antes) y desmontaje (un día después).
            </div>
          )}
          {tasks.map((t) => {
            const who = employees.find((e) => e.id === t.assigneeId)
            const done = t.status === 'hecha' || t.status === 'verificada'
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-[18px] bg-sunken/60 p-3">
                <button onClick={() => db.patch('tasks', t.id, { status: done ? 'pendiente' : 'hecha', completedAt: done ? undefined : new Date().toISOString() })} aria-label={done ? `Reabrir ${t.title}` : `Terminar ${t.title}`} aria-pressed={done} className={cx('pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full', done ? 'bg-success text-paper' : 'ring-[1.5px] ring-line-strong ring-inset hover:bg-wash')}>
                  {done && <Check size={17} strokeWidth={2} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cx('truncate font-medium', done && 'text-ink-3 line-through')}>{t.title.replace(` · ${ev.title}`, '')}</div>
                  <div className="text-xs text-ink-soft">
                    {t.due ? fmtDate(t.due.slice(0, 10)) : 'Sin fecha'} · {t.checklist.filter((c) => c.done).length}/{t.checklist.length} pasos
                  </div>
                </div>
                <Badge tone={PRIORITY[t.priority].tone} className="hidden sm:inline-flex">
                  {PRIORITY[t.priority].label}
                </Badge>
                <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
                {who && <Avatar name={who.name} tone={who.color} size={32} />}
              </div>
            )
          })}
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        {nextTl && (
          <Card className="p-6" onClick={() => goTab('programa')} as="button">
            <div className="eyebrow">Siguiente en el programa</div>
            <div className="display-num mt-2 text-[2.2rem]">{nextTl.time}</div>
            <div className="heading mt-1 text-lg">{nextTl.title}</div>
          </Card>
        )}
        <Card className="p-6">
          <div className="eyebrow">Coordinación</div>
          {coordinator ? (
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={coordinator.name} tone={coordinator.color} size={42} />
              <span className="font-medium">{coordinator.name}</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Sin asignar</p>
          )}
          {visibleNotes(ev.notes) && <p className="mt-4 rounded-[14px] bg-sunken/70 p-3.5 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{visibleNotes(ev.notes)}</p>}
          {(ev.signatures?.length ?? 0) > 0 && (
            <button onClick={() => goTab('beo')} className="mt-4 flex items-center gap-2 text-sm text-success">
              <Sparkle /> {ev.signatures!.length} {ev.signatures!.length === 1 ? 'firma registrada' : 'firmas registradas'}
            </button>
          )}
        </Card>
      </div>
    </div>
  )
}

function EditEventSheet({ open, onClose, ev }: { open: boolean; onClose: () => void; ev: RanchEvent }) {
  const employees = useCollection('employees')
  const [f, setF] = useState(ev)
  const key = open ? ev.id : ''
  const [lastKey, setLastKey] = useState('')
  if (key !== lastKey) {
    setLastKey(key)
    if (open) setF(ev)
  }
  const set = <K extends keyof RanchEvent>(k: K, v: RanchEvent[K]) => setF((x) => ({ ...x, [k]: v }))
  const coordinators = employees.filter((e) => e.active && (e.role === 'eventos' || e.role === 'admin'))
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar evento"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<Check size={18} strokeWidth={1.6} />}
            onClick={() => {
              if (!f.title.trim() || !f.clientName.trim()) return toast.error('Faltan datos', 'El nombre del evento y del cliente son obligatorios.')
              db.patch('events', ev.id, {
                title: f.title.trim(),
                type: f.type,
                venue: f.venue,
                date: f.date,
                startTime: f.startTime,
                endTime: f.endTime,
                guests: Math.max(1, f.guests),
                clientName: f.clientName.trim(),
                phone: f.phone,
                email: f.email,
                notes: f.notes,
                coordinatorId: f.coordinatorId,
              })
              toast.success('Evento actualizado')
              onClose()
            }}
          >
            Guardar cambios
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 @xl:grid-cols-2">
        <Field label="Nombre del evento" className="sm:col-span-2">
          <Input value={f.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Tipo">
          <Select value={f.type} onChange={(e) => set('type', e.target.value as EventType)}>
            {(Object.keys(EVENT_TYPE) as EventType[]).map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE[t].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lugar" hint={f.venue !== ev.venue ? 'Al cambiar de lugar revisa el plano de mesas.' : undefined}>
          <Select value={f.venue} onChange={(e) => set('venue', e.target.value as Venue)}>
            {(Object.keys(VENUE) as Venue[]).map((v) => (
              <option key={v} value={v}>
                {VENUE[v].label} (hasta {VENUE[v].capacity})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha">
          <Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio">
            <Input type="time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
          <Field label="Fin">
            <Input type="time" value={f.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </Field>
        </div>
        <Field label="Invitados">
          <Input type="number" inputMode="numeric" value={f.guests} onChange={(e) => set('guests', Number(e.target.value))} />
        </Field>
        <Field label="Coordinación">
          <Select value={f.coordinatorId ?? ''} onChange={(e) => set('coordinatorId', e.target.value || undefined)}>
            <option value="">Sin asignar</option>
            {coordinators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cliente">
          <Input value={f.clientName} onChange={(e) => set('clientName', e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <Input type="tel" inputMode="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value || undefined)} />
        </Field>
        <Field label="Correo" className="sm:col-span-2">
          <Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value || undefined)} />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} />
        </Field>
      </div>
    </Sheet>
  )
}

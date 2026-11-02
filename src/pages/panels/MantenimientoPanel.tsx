// "Mi ruta" — panel de mantenimiento: lo urgente primero, la ruta del día como un hilo,
// mini mapa del rancho y lo hecho recientemente.
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, ChevronRight, Hammer, Map as MapIcon, Play, Plus, TreePalm, Wrench } from 'lucide-react'
import { db, useCollection, useMe } from '@/lib/store'
import { PRIORITY, TASK_STATUS, TASK_TYPE } from '@/lib/meta'
import { ago, capitalize, fmt, fmtDateLong, nowIso, relativeDay, toISODate, today } from '@/lib/format'
import { ease, fadeRise, haptic } from '@/lib/motion'
import { featureByUnit } from '@/lib/layout'
import type { Task } from '@/lib/types'
import { Badge, Button, Card, CardHeader, cx, ProgressBar } from '@/components/ui'
import { NightSlab, Reveal, Sparkle } from '@/components/step1'
import { TallerScene } from '@/components/scenes'
import { ReportProblemSheet } from '@/components/stays/CleaningFlow'
import { PhotoThumb } from '@/components/Photos'
import { SwipeRow } from '@/components/interact'
import { withUndo } from '@/lib/undo'
import { Moon } from 'lucide-react'

const RanchPlan2D = lazy(() => import('@/components/map/RanchPlan2D').then((m) => ({ default: m.RanchPlan2D })))

const PRIORITY_ORDER = { urgente: 0, alta: 1, media: 2, baja: 3 } as const
/** Día local de una fecha guardada (acepta ISO en UTC o fecha local sin zona) */
const dueDay = (iso?: string) => (iso ? toISODate(new Date(iso)) : '')
const isOpen = (t: Task) => t.status === 'pendiente' || t.status === 'en-progreso'

function advance(t: Task) {
  const now = nowIso()
  const prev = { status: t.status, startedAt: t.startedAt, completedAt: t.completedAt }
  if (t.status === 'pendiente') db.patch('tasks', t.id, { status: 'en-progreso', startedAt: now })
  else if (t.status === 'en-progreso') db.patch('tasks', t.id, { status: 'hecha', completedAt: now })
  haptic.light()
  withUndo(t.status === 'pendiente' ? 'Empezaste la tarea' : 'Tarea terminada', () => db.patch('tasks', t.id, prev), t.title)
}

/** Pasa la tarea a mañana a la misma hora */
function postpone(t: Task) {
  const prev = t.due
  const d = t.due ? new Date(t.due) : new Date()
  d.setDate(d.getDate() + 1)
  db.patch('tasks', t.id, { due: d.toISOString() })
  withUndo('Pasó para mañana', () => db.patch('tasks', t.id, { due: prev }), t.title)
}

export default function MantenimientoPanel() {
  const me = useMe()
  const tasks = useCollection('tasks')
  const units = useCollection('units')
  const navigate = useNavigate()
  const [report, setReport] = useState(false)
  const t = today()
  const firstName = (me?.name.split(' ')[0] ?? '').replace(/[“”"]/g, '')

  const mine = useMemo(() => tasks.filter((x) => x.type !== 'limpieza' && (x.assigneeId === me?.id || (!x.assigneeId && (x.type === 'mantenimiento' || x.type === 'jardin')))), [tasks, me?.id])
  const urgent = mine.filter((x) => isOpen(x) && x.priority === 'urgente').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const blocked = units.filter((u) => u.status === 'mantenimiento')
  const route = mine
    .filter((x) => isOpen(x) && x.priority !== 'urgente' && (!x.due || dueDay(x.due) <= t))
    .sort((a, b) => Number(b.status === 'en-progreso') - Number(a.status === 'en-progreso') || (a.due ?? '').localeCompare(b.due ?? '') || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  const upcoming = mine.filter((x) => isOpen(x) && x.priority !== 'urgente' && x.due && dueDay(x.due) > t).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const recent = mine
    .filter((x) => (x.status === 'hecha' || x.status === 'verificada') && (x.completedAt ?? x.updatedAt) >= weekAgo)
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
  const focusUnitId = urgent.find((x) => x.unitId)?.unitId ?? blocked[0]?.id
  const focusFeature = (focusUnitId && featureByUnit(focusUnitId)?.id) || null

  return (
    <div className="flex flex-col gap-7">
      {/* Losa noche con la luz */}
      <NightSlab scene={<TallerScene />} className="px-6 pt-8 pb-28 md:px-10 md:pt-10 md:pb-32" luzSize="clamp(48px, 12vw, 128px)">
        <motion.p variants={fadeRise} initial="hidden" animate="show" className="eyebrow !text-on-night-soft">
          {capitalize(fmtDateLong(t))}
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 18, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: ease.calma } }} className="heading mt-3 max-w-[14ch] text-[clamp(2.3rem,1.8rem+2.4vw,3.6rem)] text-on-night">
          Tu ruta de hoy, {firstName}
        </motion.h1>
        <p className="mt-3 max-w-[38ch] text-on-night-soft">
          {urgent.length ? `${urgent.length === 1 ? 'Hay una urgencia' : `Hay ${urgent.length} urgencias`} esperando. Empieza por ahí.` : route.length ? 'Sin urgencias. Vamos paso a paso.' : 'Nada pendiente por hoy. Buen trabajo.'}
        </p>
        <div className="mt-7 flex flex-wrap items-end gap-x-9 gap-y-4">
          <HeroNum value={urgent.length + blocked.filter((u) => !urgent.some((x) => x.unitId === u.id)).length} label="Urgente" />
          <HeroNum value={route.length} label="Para hoy" />
          <HeroNum value={recent.length} label="Hechas en 7 días" />
          <Button variant="luz" className="ml-auto" icon={<Plus size={18} strokeWidth={1.6} />} onClick={() => setReport(true)}>
            Nueva incidencia
          </Button>
        </div>
      </NightSlab>

      {/* Urgente primero */}
      {(urgent.length > 0 || blocked.length > 0) && (
        <section>
          <SectionTitle icon={<AlertTriangle size={18} strokeWidth={1.6} className="text-danger" />} title="Urgente" sub="Unidades que no se pueden rentar hasta repararse" />
          <Reveal className="grid gap-3 lg:grid-cols-2">
            {urgent.map((x) => (
              <UrgentCard key={x.id} task={x} unitName={units.find((u) => u.id === x.unitId)?.name} />
            ))}
            {blocked
              .filter((u) => !urgent.some((x) => x.unitId === u.id))
              .map((u) => (
                <motion.div key={u.id} variants={fadeRise}>
                  <Card className="flex items-center gap-4 border-l-[3px] border-l-danger p-5">
                    <Hammer size={22} strokeWidth={1.6} className="shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="heading text-[1.25rem]">{u.name}</p>
                      <p className="text-sm text-ink-soft">Bloqueada por mantenimiento, sin tarea asignada</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setReport(true)}>
                      Crear tarea
                    </Button>
                  </Card>
                </motion.div>
              ))}
          </Reveal>
        </section>
      )}

      <div className="grid gap-7 lg:grid-cols-[1.35fr_1fr]">
        {/* Ruta del día: hilo vertical con nodos de luz */}
        <section className="min-w-0">
          <SectionTitle icon={<Wrench size={18} strokeWidth={1.6} className="text-ink-soft" />} title="Ruta de hoy" sub={route.length ? `${route.length} ${route.length === 1 ? 'parada' : 'paradas'}` : 'Sin paradas pendientes'} />
          {route.length === 0 ? (
            <Card className="flex items-center gap-4 p-6">
              <span className="text-chispa-soft">
                <Sparkle className="text-xl" />
              </span>
              <p className="text-ink-soft">Todo al día. Revisa los próximos días o reporta algo nuevo.</p>
            </Card>
          ) : (
            <Card className="p-3 md:p-4">
              <Reveal as="ul" className="relative">
                <span aria-hidden className="absolute top-6 bottom-6 left-[27px] w-px bg-line-strong md:left-[31px]" />
                {route.map((x) => (
                  <RouteStop key={x.id} task={x} unitName={units.find((u) => u.id === x.unitId)?.name} hint={x === route[0]} />
                ))}
              </Reveal>
            </Card>
          )}

          {upcoming.length > 0 && (
            <div className="mt-6">
              <p className="eyebrow mb-2 px-1">Próximos días</p>
              <Card className="divide-y divide-line">
                {upcoming.slice(0, 6).map((x) => (
                  <Link key={x.id} to={`/tareas?t=${x.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-wash">
                    <span className="w-16 shrink-0 text-xs text-ink-soft capitalize">{relativeDay(dueDay(x.due))}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{x.title}</span>
                      <span className="block text-xs text-ink-soft">
                        {TASK_TYPE[x.type].label}
                        {x.unitId ? ` · ${units.find((u) => u.id === x.unitId)?.name ?? ''}` : ''}
                      </span>
                    </span>
                    <ChevronRight size={18} strokeWidth={1.6} className="text-ink-3" />
                  </Link>
                ))}
              </Card>
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-7">
          {/* Mini mapa */}
          <Card className="overflow-hidden">
            <CardHeader
              eyebrow="El rancho"
              title="Mapa"
              subtitle={focusFeature ? 'Marcado: la unidad con urgencia' : 'Toca un edificio para verlo'}
              action={
                <Link to={focusUnitId ? `/mapa?u=${focusUnitId}` : '/mapa'} className="pressable inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm text-ink ring-1 ring-line-strong ring-inset hover:bg-wash">
                  <MapIcon size={16} strokeWidth={1.6} /> Abrir
                </Link>
              }
            />
            <div className="m-4 h-[320px] overflow-hidden rounded-[18px] bg-sunken">
              <Suspense fallback={<div className="skeleton h-full w-full" />}>
                <RanchPlan2D
                  compact
                  selectedId={focusFeature}
                  className="h-full w-full"
                  onSelect={(fid: string) => {
                    const u = units.find((x) => x.mapId === fid)
                    navigate(u ? `/mapa?u=${u.id}` : `/mapa?f=${fid}`)
                  }}
                />
              </Suspense>
            </div>
          </Card>

          {/* Hecho recientemente */}
          <Card>
            <CardHeader eyebrow="Últimos 7 días" title="Hecho" subtitle={recent.length ? `${recent.length} ${recent.length === 1 ? 'tarea terminada' : 'tareas terminadas'}` : 'Aún nada esta semana'} />
            <div className="px-3 pt-2 pb-3">
              {recent.slice(0, 6).map((x) => (
                <Link key={x.id} to={`/tareas?t=${x.id}`} className="flex items-center gap-3 rounded-[14px] px-3 py-2.5 hover:bg-wash">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_14%,var(--surface))] text-success">
                    <Check size={15} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{x.title}</span>
                    <span className="block text-xs text-ink-soft">{ago(x.completedAt ?? x.updatedAt)}</span>
                  </span>
                </Link>
              ))}
              {recent.length === 0 && <p className="px-3 py-3 text-sm text-ink-soft">Lo que termines aparecerá aquí.</p>}
            </div>
          </Card>
        </div>
      </div>

      <ReportProblemSheet open={report} onClose={() => setReport(false)} />
    </div>
  )
}

function HeroNum({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="display-num text-[2.6rem] text-on-night">{value}</div>
      <div className="mt-1 text-xs text-on-night-soft">{label}</div>
    </div>
  )
}

function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <h2 className="heading flex items-center gap-2.5 text-[1.6rem]">
        {icon}
        {title}
      </h2>
      {sub && <p className="text-sm text-ink-soft">{sub}</p>}
    </div>
  )
}

function UrgentCard({ task, unitName }: { task: Task; unitName?: string }) {
  return (
    <motion.div variants={fadeRise}>
      <Card className="border-l-[3px] border-l-danger p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="rose" dot>
                Urgente
              </Badge>
              <Badge tone={TASK_STATUS[task.status].tone}>{TASK_STATUS[task.status].label}</Badge>
              <span className="text-xs text-ink-soft">{ago(task.createdAt)}</span>
            </div>
            <Link to={`/tareas?t=${task.id}`} className="heading mt-2.5 block text-[1.3rem] hover:underline">
              {task.title}
            </Link>
            {unitName && <p className="text-sm text-ink-soft">{unitName}</p>}
            {task.notes && task.notes !== task.title && <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{task.notes}</p>}
          </div>
          {task.photoIds[0] && <PhotoThumb id={task.photoIds[0]} size={64} />}
        </div>
        <Button size="md" variant={task.status === 'pendiente' ? 'tinta' : 'primary'} className="mt-4 w-full" icon={task.status === 'pendiente' ? <Play size={18} strokeWidth={1.6} /> : <Check size={18} strokeWidth={1.6} />} onClick={() => advance(task)}>
          {task.status === 'pendiente' ? 'Empezar reparación' : 'Marcar como reparado'}
        </Button>
      </Card>
    </motion.div>
  )
}

function RouteStop({ task, unitName, hint }: { task: Task; unitName?: string; hint?: boolean }) {
  const done = task.checklist.filter((c) => c.done).length
  const active = task.status === 'en-progreso'
  const Icon = task.type === 'jardin' ? TreePalm : Wrench
  return (
    <motion.li variants={fadeRise}>
    <SwipeRow className="!rounded-[14px]" hintKey={hint ? 'ruta' : undefined} left={{ label: active ? 'Terminada' : 'Empezar', icon: active ? <Check /> : <Play />, tone: 'success', onTrigger: () => advance(task) }} right={{ label: 'Mañana', icon: <Moon />, tone: 'lavender', onTrigger: () => postpone(task) }}>
    <div className="relative flex gap-4 bg-surface py-3 pr-2 pl-1 md:pl-2">
      <span className="relative z-[1] mt-1.5 flex h-[46px] w-[46px] shrink-0 items-center justify-center">
        <span
          className={cx(
            'flex h-11 w-11 items-center justify-center rounded-full',
            active ? 'bg-[color-mix(in_oklab,var(--luz)_65%,var(--surface))] shadow-[0_0_22px_-2px_color-mix(in_oklab,var(--luz)_80%,transparent)] ring-[5px] ring-[color-mix(in_oklab,var(--luz)_24%,transparent)]' : 'bg-surface ring-1 ring-line-strong',
          )}
        >
          <Icon size={18} strokeWidth={1.6} className={active ? 'text-ink' : 'text-ink-soft'} />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-soft tabular">{task.due ? (dueDay(task.due) < today() ? `Atrasada · ${fmt(task.due, 'd MMM')}` : fmt(task.due, 'HH:mm')) : 'Sin hora'}</span>
          <Badge tone={TASK_TYPE[task.type].tone}>{TASK_TYPE[task.type].label}</Badge>
          {task.priority === 'alta' && <Badge tone={PRIORITY.alta.tone}>Alta</Badge>}
        </div>
        <Link to={`/tareas?t=${task.id}`} className="mt-1 block text-[16px] font-medium hover:underline">
          {task.title}
        </Link>
        {unitName && <p className="text-sm text-ink-soft">{unitName}</p>}
        {task.checklist.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <ProgressBar value={done / task.checklist.length} className="flex-1" />
            <span className="text-xs text-ink-soft tabular">
              {done}/{task.checklist.length}
            </span>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant={active ? 'primary' : 'secondary'} icon={active ? <Check size={16} strokeWidth={1.6} /> : <Play size={16} strokeWidth={1.6} />} onClick={() => advance(task)}>
            {active ? 'Terminar' : 'Empezar'}
          </Button>
          <Link to={`/tareas?t=${task.id}`} className="pressable inline-flex h-10 items-center gap-1 rounded-full px-3.5 text-sm text-ink-soft hover:bg-wash hover:text-ink">
            Detalle <ArrowRight size={15} strokeWidth={1.6} />
          </Link>
        </div>
      </div>
    </div>
    </SwipeRow>
    </motion.li>
  )
}

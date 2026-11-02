// "Mi día" — panel de limpieza (móvil primero): cielo arriba, saludo serif, anillo del día,
// la siguiente unidad como tarjeta héroe y la acción principal en la zona del pulgar.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, PackageSearch, Play, Sparkles, Users, Wrench } from 'lucide-react'
import { useCollection, useMe } from '@/lib/store'
import { PRIORITY, TASK_STATUS, UNIT_STATUS } from '@/lib/meta'
import { ago, capitalize, fmtDateLong, greeting, toISODate, today } from '@/lib/format'
import { ease, fadeRise, heroRise, stagger } from '@/lib/motion'
import type { ID } from '@/lib/types'
import { Badge, Button, Card, cx, ProgressBar, ProgressRing } from '@/components/ui'
import { Reveal, SkyBlock, Sparkle } from '@/components/step1'
import { arrivalText, CleaningSheet, nextArrival, ReportProblemSheet, useElapsed } from '@/components/stays/CleaningFlow'
import { CleaningRow, sortCleaning } from '@/components/stays/CleaningCards'
import { LostItemSheet, LOST_STATUS } from '@/components/stays/LostFound'
import { PhotoThumb } from '@/components/Photos'

/** Fecha local (YYYY-MM-DD) de un ISO en UTC: evita que lo de la noche cuente como "mañana" */
const localDay = (iso?: string) => (iso ? toISODate(new Date(iso)) : '')

export default function LimpiezaPanel() {
  const me = useMe()
  const tasks = useCollection('tasks')
  const units = useCollection('units')
  const reservations = useCollection('reservations')
  const lost = useCollection('lostfound')
  const [openTask, setOpenTask] = useState<ID>()
  const [report, setReport] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const t = today()

  const mine = useMemo(
    () =>
      tasks
        .filter((x) => x.type === 'limpieza' && x.assigneeId === me?.id)
        .filter((x) => x.status === 'pendiente' || x.status === 'en-progreso' || localDay(x.completedAt) === t || localDay(x.verifiedAt) === t)
        .sort(sortCleaning),
    [tasks, me?.id, t],
  )
  const open = mine.filter((x) => x.status === 'pendiente' || x.status === 'en-progreso')
  const finished = mine.filter((x) => x.status === 'hecha' || x.status === 'verificada')
  const next = open[0]
  const nextUnit = next ? units.find((u) => u.id === next.unitId) : undefined
  const nextGuest = nextUnit ? nextArrival(reservations, nextUnit.id) : undefined
  const nextDone = next ? next.checklist.filter((c) => c.done).length : 0
  const elapsed = useElapsed(next?.startedAt, next?.completedAt)
  const dayProgress = mine.length ? finished.length / mine.length : 0
  const myLost = lost.filter((l) => l.foundById === me?.id).sort((a, b) => b.foundAt.localeCompare(a.foundAt)).slice(0, 3)
  const otherTasks = tasks.filter((x) => x.type !== 'limpieza' && x.assigneeId === me?.id && (x.status === 'pendiente' || x.status === 'en-progreso'))
  const firstName = me?.name.split(' ')[0] ?? ''

  const durations = finished.filter((x) => x.startedAt && x.completedAt).map((x) => (new Date(x.completedAt!).getTime() - new Date(x.startedAt!).getTime()) / 60000)
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Cielo que se funde con el papel */}
      <div className="-mx-4 -mt-5 overflow-hidden sm:-mx-6 md:mx-0 md:mt-0 md:rounded-[var(--r-slab)]">
        <SkyBlock height="clamp(150px, 24vh, 220px)" />
      </div>

      <motion.div variants={stagger} initial="hidden" animate="show" className="relative -mt-4 text-center">
        <motion.p variants={fadeRise} className="eyebrow">
          {capitalize(fmtDateLong(t))}
        </motion.p>
        <motion.h1 variants={heroRise} className="heading mt-2 text-[clamp(2.2rem,1.8rem+2vw,3rem)]">
          {greeting()}, {firstName}
        </motion.h1>
        <motion.p variants={fadeRise} className="mx-auto mt-2 max-w-[34ch] text-[15px] text-ink-soft">
          {open.length === 0 ? (finished.length ? 'Terminaste tus limpiezas de hoy. Gracias.' : 'Por ahora no tienes limpiezas asignadas.') : open.length === 1 ? 'Te queda una limpieza hoy.' : `Te quedan ${open.length} limpiezas hoy.`}
        </motion.p>
      </motion.div>

      {/* Anillo del día */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma, delay: 0.15 } }}>
        <Card className="mt-6 flex items-center gap-5 p-5">
          <ProgressRing value={dayProgress} size={88} stroke={6} gradient>
            <span className="flex flex-col items-center leading-none">
              <span className="display-num text-[1.7rem]">
                {finished.length}
                <span className="text-ink-3">/{mine.length || 0}</span>
              </span>
              <span className="mt-1 text-[10px] text-ink-soft">hechas</span>
            </span>
          </ProgressRing>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3">
            <MiniStat label="Pendientes" value={open.length} />
            <MiniStat label="Promedio" value={avg ? `${avg} min` : '—'} />
            <MiniStat label="Otras tareas" value={otherTasks.length} />
            <MiniStat label="Objetos hoy" value={lost.filter((l) => l.foundById === me?.id && localDay(l.foundAt) === t).length} />
          </div>
        </Card>
      </motion.div>

      {/* Siguiente unidad */}
      {next && nextUnit ? (
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma, delay: 0.25 } }} className="mt-6">
          <p className="eyebrow mb-3 flex items-center gap-2 px-1">
            <span className="h-1.5 w-1.5 rounded-full bg-chispa-soft shadow-[0_0_10px_var(--luz)]" />
            {next.status === 'en-progreso' ? 'Estás limpiando' : 'Sigue'}
          </p>
          <Card className="overflow-hidden">
            <button onClick={() => setOpenTask(next.id)} className="block w-full p-5 text-left md:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={UNIT_STATUS[nextUnit.status].tone} dot>
                  {UNIT_STATUS[nextUnit.status].label}
                </Badge>
                {(next.priority === 'urgente' || next.priority === 'alta') && <Badge tone={PRIORITY[next.priority].tone}>Prioridad {PRIORITY[next.priority].label.toLowerCase()}</Badge>}
                {next.status === 'en-progreso' && elapsed && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-ink-soft tabular">
                    <Clock size={14} strokeWidth={1.6} /> {elapsed}
                  </span>
                )}
              </div>
              <h2 className="heading mt-4 text-[clamp(2rem,1.7rem+1.6vw,2.6rem)]">{nextUnit.name}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {nextUnit.kind === 'cabana' ? 'Cabaña' : 'Casa'} · {nextUnit.bedrooms} {nextUnit.bedrooms === 1 ? 'recámara' : 'recámaras'} · {nextUnit.baths} {nextUnit.baths === 1 ? 'baño' : 'baños'}
              </p>
              <div className={cx('mt-5 flex items-start gap-3 rounded-[18px] p-4', nextGuest?.checkIn === t ? 'bg-butter-soft' : 'bg-sunken')}>
                {nextGuest?.checkIn === t ? <AlertTriangle size={20} strokeWidth={1.6} className="mt-0.5 shrink-0 text-warning" /> : <Users size={20} strokeWidth={1.6} className="mt-0.5 shrink-0 text-ink-soft" />}
                <div className="min-w-0">
                  <p className={cx('font-medium', nextGuest?.checkIn === t && 'text-warning')}>{arrivalText(nextGuest)}</p>
                  {nextGuest && (
                    <p className="truncate text-sm text-ink-soft">
                      {nextGuest.guestName} · {nextGuest.guests} {nextGuest.guests === 1 ? 'persona' : 'personas'}
                    </p>
                  )}
                </div>
              </div>
              {next.checklist.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 flex items-baseline justify-between text-sm">
                    <span className="text-ink-soft">Checklist</span>
                    <span className="tabular">
                      {nextDone} de {next.checklist.length} pasos
                    </span>
                  </div>
                  <ProgressBar value={nextDone / next.checklist.length} />
                </div>
              )}
              {next.notes && <p className="mt-4 text-sm text-ink-soft">“{next.notes}”</p>}
            </button>
            {/* En tablet/escritorio la acción va dentro de la tarjeta */}
            <div className="hidden px-6 pb-6 md:block">
              <Button size="lg" variant="tinta" className="w-full" icon={next.status === 'en-progreso' ? <Sparkles size={20} strokeWidth={1.6} /> : <Play size={20} strokeWidth={1.6} />} onClick={() => setOpenTask(next.id)}>
                {next.status === 'en-progreso' ? 'Continuar limpieza' : 'Empezar limpieza'}
              </Button>
            </div>
          </Card>
        </motion.section>
      ) : (
        <Card className="mt-6 flex flex-col items-center px-6 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[6px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]">
            <CheckCircle2 size={28} strokeWidth={1.6} />
          </span>
          <p className="heading mt-5 text-[1.6rem]">{finished.length ? 'Todo listo por hoy' : 'Todo limpio por ahora'}</p>
          <p className="mt-1 max-w-[30ch] text-sm text-ink-soft">Cuando un huésped haga check-out, tu siguiente limpieza aparecerá aquí sola.</p>
          <p className="mt-3 text-chispa-soft">
            <Sparkle />
          </p>
        </Card>
      )}

      {/* Mis limpiezas */}
      {mine.some((x) => x.id !== next?.id) && (
        <section className="mt-8">
          <h2 className="heading mb-3 px-1 text-[1.55rem]">Mis limpiezas</h2>
          <Reveal className="flex flex-col gap-3">
            {mine
              .filter((x) => x.id !== next?.id)
              .map((task) => (
                <CleaningRow key={task.id} task={task} unit={units.find((u) => u.id === task.unitId)} reservations={reservations} onOpen={() => setOpenTask(task.id)} />
              ))}
          </Reveal>
        </section>
      )}

      {/* Otras tareas asignadas */}
      {otherTasks.length > 0 && (
        <section className="mt-8">
          <h2 className="heading mb-3 px-1 text-[1.55rem]">También te toca</h2>
          <Card className="divide-y divide-line">
            {otherTasks.map((x) => (
              <Link key={x.id} to={`/tareas?t=${x.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-wash">
                <span className={cx('h-2 w-2 shrink-0 rounded-full', x.status === 'en-progreso' ? 'bg-butter' : 'bg-peach')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{x.title}</span>
                  <span className="block text-xs text-ink-soft">{TASK_STATUS[x.status].label}</span>
                </span>
                <ArrowRight size={18} strokeWidth={1.6} className="text-ink-3" />
              </Link>
            ))}
          </Card>
        </section>
      )}

      {/* Acciones secundarias */}
      <section className="mt-8 grid grid-cols-2 gap-3">
        <button onClick={() => setReport(true)} className="card lift pressable flex flex-col items-start gap-3 p-4 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-soft text-rose-ink">
            <Wrench size={19} strokeWidth={1.6} />
          </span>
          <span>
            <span className="block font-medium">Reportar problema</span>
            <span className="block text-xs text-ink-soft">Llega a mantenimiento</span>
          </span>
        </button>
        <button onClick={() => setLostOpen(true)} className="card lift pressable flex flex-col items-start gap-3 p-4 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-butter-soft text-butter-ink">
            <PackageSearch size={19} strokeWidth={1.6} />
          </span>
          <span>
            <span className="block font-medium">Objeto olvidado</span>
            <span className="block text-xs text-ink-soft">Regístralo con foto</span>
          </span>
        </button>
      </section>

      {myLost.length > 0 && (
        <section className="mt-6">
          <p className="eyebrow mb-2 px-1">Lo que encontraste</p>
          <Card className="divide-y divide-line">
            {myLost.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                {l.photoId ? <PhotoThumb id={l.photoId} size={44} /> : <PackageSearch size={20} strokeWidth={1.6} className="mx-3 text-ink-soft" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{l.description}</span>
                  <span className="block text-xs text-ink-soft">
                    {units.find((u) => u.id === l.unitId)?.name ?? 'Área común'} · {ago(l.foundAt)}
                  </span>
                </span>
                <Badge tone={LOST_STATUS[l.status].tone}>{LOST_STATUS[l.status].label}</Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Espacio para que el CTA fijo no tape el contenido */}
      {next && <div className="h-20 md:hidden" />}

      {/* CTA en la zona del pulgar (móvil) */}
      {next && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma, delay: 0.35 } }} className="fixed inset-x-4 bottom-[calc(92px+env(safe-area-inset-bottom))] z-30 md:hidden">
          <Button size="lg" variant="tinta" className="w-full !h-14 shadow-[var(--shadow-3)]" icon={next.status === 'en-progreso' ? <Sparkles size={20} strokeWidth={1.6} /> : <Play size={20} strokeWidth={1.6} />} onClick={() => setOpenTask(next.id)}>
            {next.status === 'en-progreso' ? `Continuar · ${nextUnit?.short ?? ''}` : `Empezar limpieza · ${nextUnit?.short ?? ''}`}
          </Button>
        </motion.div>
      )}

      <CleaningSheet taskId={openTask} onClose={() => setOpenTask(undefined)} />
      <ReportProblemSheet open={report} onClose={() => setReport(false)} />
      <LostItemSheet open={lostOpen} onClose={() => setLostOpen(false)} />
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="display-num text-[1.5rem]">{value}</div>
      <div className="mt-0.5 text-xs text-ink-soft">{label}</div>
    </div>
  )
}

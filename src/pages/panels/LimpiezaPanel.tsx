// "Mi día" — limpieza, un paso a la vez: la ruta del día ordenada por quién llega primero, una sola casa
// en grande con su reloj de llegada y deslizar para empezar. Sin cifras que no ayudan a quien limpia.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, BedDouble, Bath, Check, CheckCircle2, Clock, PackageSearch, ShoppingBasket, Users, Wrench } from 'lucide-react'
import { db, useCollection, useMe } from '@/lib/store'
import { TASK_STATUS } from '@/lib/meta'
import { ago, capitalize, fmtDateLong, greeting, nowIso, relativeDay, toISODate, today, uid } from '@/lib/format'
import { fadeRise, haptic, stagger } from '@/lib/motion'
import type { ID, Reservation, Task, Unit } from '@/lib/types'
import { Badge, Button, Card, cx, Sheet, toast } from '@/components/ui'
import { SlideToConfirm } from '@/components/interact'
import { CleaningSheet, nextArrival, ReportProblemSheet, useElapsed } from '@/components/stays/CleaningFlow'
import { LostItemSheet, LOST_STATUS } from '@/components/stays/LostFound'
import { PhotoThumb } from '@/components/Photos'

/** Fecha local (YYYY-MM-DD) de un ISO en UTC: evita que lo de la noche cuente como "mañana" */
const localDay = (iso?: string) => (iso ? toISODate(new Date(iso)) : '')

/** Momento de la próxima llegada (o muy lejos si no hay) para ordenar la ruta */
const arrivalAt = (r?: Reservation) => (r ? new Date(`${r.checkIn}T${r.arrivalTime ?? '15:00'}:00`).getTime() : Number.MAX_SAFE_INTEGER)

function useNow(every = 30_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(iv)
  }, [every])
  return now
}

const SUPPLIES = ['Papel de baño', 'Jabón', 'Shampoo', 'Bolsas de basura', 'Café', 'Lavatrastes', 'Toallas', 'Blancos']

export default function LimpiezaPanel() {
  const me = useMe()
  const tasks = useCollection('tasks')
  const units = useCollection('units')
  const reservations = useCollection('reservations')
  const lost = useCollection('lostfound')
  const [openTask, setOpenTask] = useState<ID>()
  const [report, setReport] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [supplyOpen, setSupplyOpen] = useState(false)
  const now = useNow()
  const t = today()

  const route = useMemo(() => {
    const mine = tasks.filter((x) => x.type === 'limpieza' && x.assigneeId === me?.id)
    const open = mine.filter((x) => x.status === 'pendiente' || x.status === 'en-progreso')
    const finished = mine.filter((x) => (x.status === 'hecha' || x.status === 'verificada') && (localDay(x.completedAt) === t || localDay(x.verifiedAt) === t))
    const withArrival = (x: Task) => ({ task: x, unit: units.find((u) => u.id === x.unitId), guest: x.unitId ? nextArrival(reservations, x.unitId) : undefined })
    const openSorted = open.map(withArrival).sort((a, b) => Number(b.task.status === 'en-progreso') - Number(a.task.status === 'en-progreso') || arrivalAt(a.guest) - arrivalAt(b.guest))
    return { finished: finished.map(withArrival), open: openSorted }
  }, [tasks, units, reservations, me?.id, t])

  const current = route.open[0]
  const later = route.open.slice(1)
  const otherTasks = tasks.filter((x) => x.type !== 'limpieza' && x.assigneeId === me?.id && (x.status === 'pendiente' || x.status === 'en-progreso'))
  const myLost = lost.filter((l) => l.foundById === me?.id).sort((a, b) => b.foundAt.localeCompare(a.foundAt)).slice(0, 3)
  const firstName = me?.name.split(' ')[0] ?? ''
  const all = route.finished.length + route.open.length

  const startOrOpen = (task: Task) => {
    if (task.status === 'pendiente') db.patch('tasks', task.id, { status: 'en-progreso', startedAt: task.startedAt ?? nowIso(), assigneeId: task.assigneeId ?? me?.id })
    haptic.light()
    setOpenTask(task.id)
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {/* Saludo corto */}
      <motion.header variants={fadeRise} className="pt-1">
        <p className="eyebrow">{capitalize(fmtDateLong(t))}</p>
        <h1 className="heading mt-2 text-[clamp(2.1rem,1.7rem+2vw,2.9rem)] leading-[1.05]">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-2 text-[17px] leading-snug text-ink-soft">
          {route.open.length === 0 ? (route.finished.length ? 'Terminaste tus casas de hoy. Gracias.' : 'Por ahora no tienes casas asignadas.') : route.open.length === 1 ? 'Te queda una casa.' : `Te quedan ${route.open.length} casas.`}
        </p>
      </motion.header>

      {/* Tu ruta: casas en orden, sin deslizar de lado */}
      {all > 0 && (
        <motion.section variants={fadeRise} aria-label="Tu ruta de hoy">
          <p className="eyebrow mb-3">Tu ruta de hoy · {route.finished.length} de {all}</p>
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {[...route.finished.map((r) => ({ ...r, state: 'done' as const })), ...route.open.map((r, i) => ({ ...r, state: i === 0 ? ('now' as const) : ('next' as const) }))].map((r, i, arr) => (
              <li key={r.task.id} className="flex items-center gap-1.5">
                <button onClick={() => setOpenTask(r.task.id)} className={cx('pressable inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px]', r.state === 'done' ? 'bg-[color-mix(in_oklab,var(--success)_14%,var(--surface))] text-success' : r.state === 'now' ? 'bg-ink font-semibold text-paper shadow-[var(--shadow-2)]' : 'bg-surface ring-1 ring-line-strong ring-inset')}>
                  {r.state === 'done' ? <Check size={16} strokeWidth={2} /> : r.state === 'now' ? <span className="h-2 w-2 rounded-full bg-luz shadow-[0_0_10px_2px_var(--luz)]" /> : null}
                  {r.unit?.name ?? r.task.title}
                </button>
                {i < arr.length - 1 && <ArrowRight size={16} strokeWidth={1.6} className="text-ink-3" aria-hidden />}
              </li>
            ))}
          </ol>
        </motion.section>
      )}

      {/* La casa de ahora, en grande */}
      {current?.unit ? (
        <motion.div variants={fadeRise}>
          <CurrentHouse task={current.task} unit={current.unit} guest={current.guest} now={now} onGo={() => startOrOpen(current.task)} />
        </motion.div>
      ) : (
        <motion.div variants={fadeRise}>
          <Card className="flex flex-col items-center px-6 py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[6px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]">
              <CheckCircle2 size={28} strokeWidth={1.6} />
            </span>
            <p className="heading mt-5 text-[1.7rem]">{route.finished.length ? 'Todo listo por hoy' : 'Todo limpio por ahora'}</p>
            <p className="mt-1 max-w-[32ch] text-[15px] text-ink-soft">Cuando un huésped se vaya, tu siguiente casa aparecerá aquí sola.</p>
          </Card>
        </motion.div>
      )}

      {/* Lo que sigue después */}
      {later.length > 0 && (
        <motion.section variants={fadeRise} aria-label="Después">
          <h2 className="heading mb-3 text-[1.5rem]">Después</h2>
          <div className="flex flex-col gap-2.5">
            {later.map((r) => (
              <button key={r.task.id} onClick={() => setOpenTask(r.task.id)} className="card pressable flex items-center gap-4 p-4 text-left">
                <span className="heading flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-lg text-primary">{(r.unit?.name ?? '?').replace(/^(Casa|Cabaña)\s+/, '')[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold">{r.unit?.name ?? r.task.title}</span>
                  <span className="block text-[15px] text-ink-soft">{arrivalLine(r.guest)}</span>
                </span>
                <ArrowRight size={20} strokeWidth={1.6} className="text-ink-3" />
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* Botones grandes: reportar, objeto olvidado y falta material */}
      <motion.section variants={fadeRise} aria-label="Ayuda rápida" className="grid grid-cols-3 gap-2.5">
        <BigTile icon={<Wrench size={22} strokeWidth={1.6} />} label="Reportar algo" tone="rose" onClick={() => setReport(true)} />
        <BigTile icon={<PackageSearch size={22} strokeWidth={1.6} />} label="Objeto olvidado" tone="butter" onClick={() => setLostOpen(true)} />
        <BigTile icon={<ShoppingBasket size={22} strokeWidth={1.6} />} label="Falta material" tone="sage" onClick={() => setSupplyOpen(true)} />
      </motion.section>

      {otherTasks.length > 0 && (
        <motion.section variants={fadeRise} aria-label="También te toca">
          <h2 className="heading mb-3 text-[1.5rem]">También te toca</h2>
          <Card className="divide-y divide-line">
            {otherTasks.map((x) => (
              <Link key={x.id} to={`/tareas?t=${x.id}`} className="flex min-h-14 items-center gap-3 px-5 py-3 hover:bg-wash">
                <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', x.status === 'en-progreso' ? 'bg-butter' : 'bg-peach')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium">{x.title}</span>
                  <span className="block text-sm text-ink-soft">{TASK_STATUS[x.status].label}</span>
                </span>
                <ArrowRight size={18} strokeWidth={1.6} className="text-ink-3" />
              </Link>
            ))}
          </Card>
        </motion.section>
      )}

      {route.finished.length > 0 && (
        <motion.section variants={fadeRise} aria-label="Terminadas hoy">
          <p className="eyebrow mb-2">Terminadas hoy</p>
          <div className="flex flex-col gap-2">
            {route.finished.map((r) => (
              <button key={r.task.id} onClick={() => setOpenTask(r.task.id)} className="pressable flex min-h-14 items-center gap-3 rounded-[18px] bg-[color-mix(in_oklab,var(--success)_9%,var(--surface))] px-4 text-left">
                <Check size={18} strokeWidth={2} className="text-success" />
                <span className="flex-1 font-medium">{r.unit?.name}</span>
                <Badge tone={r.task.status === 'verificada' ? 'sage' : 'butter'}>{r.task.status === 'verificada' ? 'Revisada' : 'Por revisar'}</Badge>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {myLost.length > 0 && (
        <motion.section variants={fadeRise}>
          <p className="eyebrow mb-2">Lo que encontraste</p>
          <Card className="divide-y divide-line">
            {myLost.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                {l.photoId ? <PhotoThumb id={l.photoId} size={44} /> : <PackageSearch size={20} strokeWidth={1.6} className="mx-3 text-ink-soft" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{l.description}</span>
                  <span className="block text-sm text-ink-soft">
                    {units.find((u) => u.id === l.unitId)?.name ?? 'Área común'} · {ago(l.foundAt)}
                  </span>
                </span>
                <Badge tone={LOST_STATUS[l.status].tone}>{LOST_STATUS[l.status].label}</Badge>
              </div>
            ))}
          </Card>
        </motion.section>
      )}

      <CleaningSheet taskId={openTask} onClose={() => setOpenTask(undefined)} />
      <ReportProblemSheet open={report} onClose={() => setReport(false)} unitId={current?.unit?.id} />
      <LostItemSheet open={lostOpen} onClose={() => setLostOpen(false)} unitId={current?.unit?.id} />
      <SupplySheet open={supplyOpen} onClose={() => setSupplyOpen(false)} unit={current?.unit} />
    </motion.div>
  )
}

function arrivalLine(r?: Reservation) {
  if (!r) return 'Sin llegada próxima'
  const day = r.checkIn === today() ? 'hoy' : relativeDay(r.checkIn).toLowerCase()
  return `Llegan ${day}${r.arrivalTime ? ` a las ${r.arrivalTime}` : ''} · ${r.guests} ${r.guests === 1 ? 'persona' : 'personas'}`
}

/** La casa de ahora: nombre en grande, reloj de llegada y deslizar para empezar */
function CurrentHouse({ task, unit, guest, now, onGo }: { task: Task; unit: Unit; guest?: Reservation; now: number; onGo: () => void }) {
  const elapsed = useElapsed(task.startedAt, task.completedAt)
  const done = task.checklist.filter((c) => c.done).length
  const total = task.checklist.length
  const at = arrivalAt(guest)
  const left = at - now
  const hours = left / 3_600_000
  const today_ = guest?.checkIn === today()
  // Reloj: la barra se llena conforme se acerca la llegada (ventana de 8 horas); color según urgencia
  const urgency = !guest ? 'calm' : left <= 0 ? 'late' : hours < 2 ? 'hot' : hours < 5 ? 'warm' : 'calm'
  const fill = !guest ? 0 : Math.min(1, Math.max(0, 1 - hours / 8))
  const timeLeft = left <= 0 ? 'Ya es la hora de llegada' : hours >= 24 ? `En ${Math.round(hours / 24)} ${Math.round(hours / 24) === 1 ? 'día' : 'días'}` : `En ${Math.floor(hours)} h ${Math.round((hours % 1) * 60)} min`
  const working = task.status === 'en-progreso'
  return (
    <Card className="overflow-hidden">
      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow flex items-center gap-2">
            <span className={cx('h-2 w-2 rounded-full', working ? 'bg-butter shadow-[0_0_10px_var(--luz)]' : 'bg-chispa-soft')} />
            {working ? 'Estás limpiando' : 'Sigue esta casa'}
          </span>
          {working && elapsed && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[15px] text-ink-soft tabular">
              <Clock size={16} strokeWidth={1.6} /> {elapsed}
            </span>
          )}
        </div>
        <h2 className="heading mt-3 text-[clamp(2.4rem,2rem+2.4vw,3.4rem)] leading-[1.02]">{unit.name}</h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[16px] text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <BedDouble size={18} strokeWidth={1.6} /> {unit.bedrooms} {unit.bedrooms === 1 ? 'recámara' : 'recámaras'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Bath size={18} strokeWidth={1.6} /> {unit.baths} {unit.baths === 1 ? 'baño' : 'baños'}
          </span>
          {guest && (
            <span className="inline-flex items-center gap-1.5">
              <Users size={18} strokeWidth={1.6} /> {guest.guests} {guest.guests === 1 ? 'huésped' : 'huéspedes'}
            </span>
          )}
        </div>

        {/* Reloj de llegada */}
        <div className={cx('mt-5 rounded-[20px] p-4', urgency === 'late' || urgency === 'hot' ? 'bg-[color-mix(in_oklab,var(--danger)_10%,var(--surface))]' : urgency === 'warm' ? 'bg-[color-mix(in_oklab,var(--warning)_12%,var(--surface))]' : 'bg-sunken')}>
          <p className={cx('text-[17px] font-semibold leading-snug', urgency === 'late' || urgency === 'hot' ? 'text-danger' : urgency === 'warm' ? 'text-warning' : 'text-ink')}>{arrivalLine(guest)}</p>
          {guest && <p className="mt-0.5 text-[15px] text-ink-soft">{today_ || hours < 24 ? timeLeft : `${guest.guestName}`}</p>}
          {guest && (
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ink)_8%,transparent)]" role="img" aria-label={`Tiempo para la llegada: ${timeLeft}`}>
              <div className={cx('h-full rounded-full transition-[width] duration-700', urgency === 'late' || urgency === 'hot' ? 'bg-danger' : urgency === 'warm' ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.max(4, fill * 100)}%` }} />
            </div>
          )}
        </div>

        {task.notes && <p className="mt-4 rounded-[16px] bg-[color-mix(in_oklab,var(--warning)_10%,var(--surface))] p-3.5 text-[15px] leading-snug text-warning">“{task.notes}”</p>}

        {total > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between text-[15px]">
              <span className="text-ink-soft">Avance</span>
              <span className="font-semibold tabular">
                {done} de {total}
              </span>
            </div>
            <div className="flex gap-1" aria-hidden>
              {task.checklist.map((c) => (
                <span key={c.id} className={cx('h-2 flex-1 rounded-full', c.done ? 'bg-primary' : 'bg-sunken')} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="px-5 pb-5 md:px-6 md:pb-6">
        {working ? (
          <Button size="lg" variant="tinta" className="!h-16 w-full text-[17px]" onClick={onGo}>
            Seguir limpiando {unit.name}
          </Button>
        ) : (
          <SlideToConfirm label="Desliza para empezar" onConfirm={onGo} />
        )}
      </div>
    </Card>
  )
}

function BigTile({ icon, label, tone, onClick }: { icon: React.ReactNode; label: string; tone: 'rose' | 'butter' | 'sage'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card pressable flex min-h-[112px] flex-col items-center justify-center gap-2.5 p-3 text-center">
      <span className={cx('flex h-12 w-12 items-center justify-center rounded-2xl', tone === 'rose' ? 'bg-rose-soft text-rose-ink' : tone === 'butter' ? 'bg-butter-soft text-butter-ink' : 'bg-sage-soft text-sage-ink')}>{icon}</span>
      <span className="text-[15px] leading-tight font-semibold">{label}</span>
    </button>
  )
}

/** Avisar que falta material: un toque por cosa, se crea la compra para administración */
function SupplySheet({ open, onClose, unit }: { open: boolean; onClose: () => void; unit?: Unit }) {
  const me = useMe()
  const [picked, setPicked] = useState<string[]>([])
  useEffect(() => {
    if (open) setPicked([])
  }, [open])
  const send = () => {
    if (!picked.length) return
    db.upsert('tasks', {
      id: uid('t_'),
      title: `Falta material${unit ? ` · ${unit.name}` : ''}`,
      type: 'compra',
      status: 'pendiente',
      priority: 'alta',
      checklist: picked.map((p) => ({ id: uid('chk_'), text: p, done: false })),
      photoIds: [],
      unitId: unit?.id,
      createdById: me?.id,
      notes: `Lo pidió ${me?.name ?? 'limpieza'}`,
    })
    haptic.success()
    toast.success('Aviso enviado', `${picked.length} ${picked.length === 1 ? 'cosa' : 'cosas'} para comprar`)
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="¿Qué falta?"
      subtitle="Toca lo que se terminó y avisamos a administración"
      footer={
        <Button size="lg" className="w-full" disabled={!picked.length} onClick={send}>
          {picked.length ? `Avisar (${picked.length})` : 'Elige lo que falta'}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        {SUPPLIES.map((s) => {
          const on = picked.includes(s)
          return (
            <button key={s} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s) : [...p, s]))} aria-pressed={on} className={cx('pressable flex min-h-16 items-center gap-3 rounded-[18px] px-4 text-left text-[16px] font-medium', on ? 'bg-primary text-on-primary' : 'bg-surface ring-1 ring-line-strong ring-inset')}>
              <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', on ? 'bg-on-primary/20' : 'ring-[1.5px] ring-line-strong ring-inset')}>{on && <Check size={16} strokeWidth={2.4} />}</span>
              {s}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

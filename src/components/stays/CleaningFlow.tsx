// Flujo de limpieza (step1): empezar → checklist → fotos → lista → verificar → avisar al huésped.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check, Clock, MessageCircle, PackageSearch, Play, ShieldCheck, Sparkles, Timer, Users } from 'lucide-react'
import { db, useDoc, useMe, useStore } from '@/lib/store'
import { PRIORITY, TASK_STATUS, UNIT_STATUS } from '@/lib/meta'
import { fmtDate, nowIso, relativeDay, today, waLink } from '@/lib/format'
import { ease, haptic } from '@/lib/motion'
import type { ID, Priority, Reservation } from '@/lib/types'
import { Badge, Button, CheckDraw, Confirm, cx, ProgressRing, Sheet, toast } from '@/components/ui'
import { Choices, Combobox, NotesField } from '@/components/fields'
import { SwipeRow } from '@/components/interact'
import { BeforeAfter } from '@/components/cleaning/BeforeAfter'
import { Sparkle } from '@/components/step1'
import { PhotoButton, PhotoThumb } from '@/components/Photos'
import { LostItemSheet } from './LostFound'

export function useElapsed(since?: string, until?: string) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!since || until) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [since, until])
  if (!since) return ''
  const ms = (until ? new Date(until).getTime() : now) - new Date(since).getTime()
  const m = Math.max(0, Math.floor(ms / 60000))
  const s = Math.max(0, Math.floor((ms % 60000) / 1000))
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(s).padStart(2, '0')}`
}

/** Próxima llegada a una unidad (hoy o después) */
export function nextArrival(reservations: Reservation[], unitId: ID) {
  const t = today()
  return reservations.filter((r) => r.unitId === unitId && r.checkIn >= t && (r.status === 'confirmada' || r.status === 'pendiente')).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0]
}

/** Texto corto de llegada: "Llegan hoy a las 17:00" */
export function arrivalText(next?: Reservation) {
  if (!next) return 'Sin llegada próxima'
  if (next.checkIn === today()) return `Llegan hoy${next.arrivalTime ? ' a las ' + next.arrivalTime : ''}`
  return `Llegan ${relativeDay(next.checkIn).toLowerCase()}${next.arrivalTime ? ' · ' + next.arrivalTime : ''}`
}

// ── Éxito: orbe de luz + ✦ escalonadas (sin confeti, sin giros) ──
function Success({ show, title, body }: { show: boolean; title: string; body: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-[color-mix(in_oklab,var(--ink)_22%,transparent)] backdrop-blur-[4px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.24 } }} role="status">
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.48, ease: ease.calma } }} className="flex flex-col items-center rounded-[var(--r-xl)] bg-surface px-10 pt-9 pb-8 shadow-[var(--shadow-3)] ring-1 ring-line">
            <div className="relative">
              <motion.span
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, transition: { duration: 0.6, ease: ease.calma } }}
                className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_70%,var(--surface))] text-ink shadow-[0_0_48px_-4px_color-mix(in_oklab,var(--luz)_80%,transparent)] ring-[6px] ring-[color-mix(in_oklab,var(--luz)_26%,transparent)]"
              >
                <Check size={40} strokeWidth={1.6} />
              </motion.span>
              {[
                { x: -58, y: -18, s: 'text-base', d: 0.25 },
                { x: 52, y: -34, s: 'text-sm', d: 0.38 },
                { x: 60, y: 30, s: 'text-xs', d: 0.5 },
              ].map((st, i) => (
                <motion.span key={i} className={cx('absolute top-1/2 left-1/2 text-chispa-soft', st.s)} style={{ x: st.x, y: st.y }} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, transition: { delay: st.d, duration: 0.48, ease: ease.calma } }}>
                  <Sparkle />
                </motion.span>
              ))}
            </div>
            <p className="heading mt-6 text-[2rem]">{title}</p>
            <p className="mt-1 text-sm text-ink-soft">{body}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Botón para avisar por WhatsApp al próximo huésped que su unidad está lista */
export function ReadyNotice({ unitId, className }: { unitId: ID; className?: string }) {
  const unit = useDoc('units', unitId)
  const reservations = useStore((s) => s.data.reservations)
  const settings = useStore((s) => s.settings)
  const next = unit ? nextArrival(Object.values(reservations).filter((r) => !r.deleted), unit.id) : undefined
  if (!unit) return null
  if (!next) return <p className={cx('text-sm text-ink-soft', className)}>No hay huéspedes próximos para avisar.</p>
  const first = next.guestName.split(' ')[0]
  const text = `Hola ${first}, te saludamos de ${settings.ranchName}. Tu ${unit.name} ya está lista para recibirte ✦ Te esperamos ${relativeDay(next.checkIn).toLowerCase()} a partir de las ${settings.checkInTime}. ¡Buen viaje!`
  return (
    <div className={cx('rounded-[var(--r-lg)] bg-sunken p-4', className)}>
      <p className="text-sm text-ink-soft">
        Próximo huésped: <span className="font-medium text-ink">{next.guestName}</span> · {arrivalText(next).toLowerCase()}
      </p>
      {next.phone ? (
        <a href={waLink(next.phone, text)} target="_blank" rel="noreferrer" onClick={() => haptic.light()} className="pressable mt-3 inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-ink px-6 font-medium text-paper shadow-[var(--shadow-1)]">
          <MessageCircle size={18} strokeWidth={1.6} /> Avisar al huésped que está lista
        </a>
      ) : (
        <p className="mt-2 text-xs text-ink-3">La reserva no tiene teléfono registrado.</p>
      )}
    </div>
  )
}


// ── El checklist agrupado por cuartos: menos lectura, se ve qué cuarto falta ──
const ROOMS: { name: string; words: string[] }[] = [
  { name: 'Recámaras', words: ['cama', 'blanco', 'toalla', 'almohad'] },
  { name: 'Baño', words: ['baño', 'regadera', 'papel', 'jabon', 'jabón', 'shampoo', 'wc'] },
  { name: 'Cocina', words: ['traste', 'cocina', 'refri', 'estufa', 'cafe', 'café'] },
  { name: 'Sala y pisos', words: ['barrer', 'trapear', 'piso', 'sacudir', 'mueble', 'ventana', 'cancel'] },
  { name: 'Afuera', words: ['terraza', 'asador', 'basura', 'jardin', 'jardín'] },
]
export function roomsOf<T extends { text: string }>(items: T[]) {
  const groups = new Map<string, T[]>()
  for (const it of items) {
    const t = it.text.toLowerCase()
    const room = ROOMS.find((r) => r.words.some((w) => t.includes(w)))?.name ?? 'Revisión final'
    groups.set(room, [...(groups.get(room) ?? []), it])
  }
  const order = [...ROOMS.map((r) => r.name), 'Revisión final']
  return order.filter((n) => groups.has(n)).map((name) => ({ name, items: groups.get(name)! }))
}

export function CleaningSheet({ taskId, onClose }: { taskId?: ID; onClose: () => void }) {
  const task = useDoc('tasks', taskId)
  const unit = useDoc('units', task?.unitId)
  const reservations = useStore((s) => s.data.reservations)
  const me = useMe()
  const [success, setSuccess] = useState(false)
  const [verified, setVerified] = useState(false)
  const [askNoPhoto, setAskNoPhoto] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const elapsed = useElapsed(task?.startedAt, task?.completedAt)
  const next = unit ? nextArrival(Object.values(reservations).filter((r) => !r.deleted), unit.id) : undefined
  const done = task?.checklist.filter((c) => c.done).length ?? 0
  const total = task?.checklist.length ?? 0
  const supervisor = me?.role === 'admin' || me?.role === 'mantenimiento'
  const locked = task?.status === 'hecha' || task?.status === 'verificada'

  useEffect(() => {
    if (taskId) setVerified(false)
  }, [taskId])

  if (!task) return <Sheet open={false} onClose={onClose}>{null}</Sheet>

  const start = () => {
    db.patch('tasks', task.id, { status: 'en-progreso', startedAt: task.startedAt ?? nowIso(), assigneeId: task.assigneeId ?? me?.id })
    haptic.light()
  }
  const toggle = (id: ID) => {
    if (task.status === 'pendiente') start()
    db.patch('tasks', task.id, { checklist: task.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) }, { silent: true })
    haptic.select()
  }
  const finish = () => {
    db.patch('tasks', task.id, { status: 'hecha', completedAt: nowIso(), checklist: task.checklist.map((c) => ({ ...c, done: true })) })
    haptic.success()
    setSuccess(true)
    setTimeout(() => {
      setSuccess(false)
      onClose()
    }, 1700)
  }
  const tryFinish = () => (task.photoIds.length ? finish() : setAskNoPhoto(true))
  const verify = () => {
    db.patch('tasks', task.id, { status: 'verificada', verifiedAt: nowIso(), verifiedById: me?.id })
    haptic.success()
    toast.success(`${unit?.name} lista para recibir`, 'Limpieza verificada')
    setVerified(true)
  }

  const arrivalToday = next?.checkIn === today()

  return (
    <>
      <Sheet
        open={!!taskId}
        onClose={onClose}
        title={unit?.name ?? task.title}
        subtitle={unit ? `${unit.kind === 'cabana' ? 'Cabaña' : 'Casa'} · ${UNIT_STATUS[unit.status].label}` : undefined}
        footer={
          verified ? (
            <Button size="lg" variant="outline" className="w-full" onClick={onClose}>
              Listo
            </Button>
          ) : task.status === 'pendiente' ? (
            <Button size="lg" variant="tinta" className="w-full" icon={<Play size={20} strokeWidth={1.6} />} onClick={start}>
              Empezar limpieza
            </Button>
          ) : task.status === 'en-progreso' ? (
            <Button size="lg" className="w-full" icon={<Sparkles size={20} strokeWidth={1.6} />} onClick={tryFinish}>
              Marcar como lista
            </Button>
          ) : task.status === 'hecha' && supervisor ? (
            <Button size="lg" className="w-full" icon={<ShieldCheck size={20} strokeWidth={1.6} />} onClick={verify}>
              Verificar y liberar
            </Button>
          ) : (
            <p className="flex items-center justify-center gap-2 py-2 text-center text-sm text-ink-soft">
              {task.status === 'hecha' ? (
                'Esperando revisión de administración'
              ) : (
                <>
                  <Sparkle className="text-chispa-soft" /> Limpieza verificada
                </>
              )}
            </p>
          )
        }
      >
        {verified && unit ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }} className="flex flex-col items-center pt-4 pb-2 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_70%,var(--surface))] shadow-[0_0_42px_-6px_color-mix(in_oklab,var(--luz)_80%,transparent)] ring-[6px] ring-[color-mix(in_oklab,var(--luz)_24%,transparent)]">
              <Check size={36} strokeWidth={1.6} />
            </span>
            <p className="heading mt-5 text-[1.9rem]">{unit.name} está lista</p>
            <p className="mt-1 text-sm text-ink-soft">Ya aparece en verde en el mapa y en hospedaje.</p>
            <ReadyNotice unitId={unit.id} className="mt-6 w-full text-left" />
          </motion.div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap gap-2">
              <Badge tone={TASK_STATUS[task.status].tone} dot>
                {TASK_STATUS[task.status].label}
              </Badge>
              <Badge tone={PRIORITY[task.priority].tone}>Prioridad {PRIORITY[task.priority].label.toLowerCase()}</Badge>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-[18px] bg-sunken p-4">
                <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <Users size={14} strokeWidth={1.6} /> Próximos huéspedes
                </p>
                <p className={cx('mt-1.5 font-medium', arrivalToday && 'text-warning')}>{next ? (arrivalToday ? `Hoy ${next.arrivalTime ?? ''}` : fmtDate(next.checkIn)) : 'Sin llegada'}</p>
                {next && (
                  <p className="truncate text-xs text-ink-3">
                    {next.guestName} · {next.guests} pers.
                  </p>
                )}
              </div>
              <div className="rounded-[18px] bg-sunken p-4">
                <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <Timer size={14} strokeWidth={1.6} /> Tiempo
                </p>
                <p className="display-num mt-1.5 text-[1.6rem]">{elapsed || '—'}</p>
                <p className="text-xs text-ink-3">{task.startedAt ? (task.completedAt ? 'duración total' : 'desde que empezaste') : 'aún no empieza'}</p>
              </div>
            </div>

            {task.notes && (
              <div className="mb-5 flex gap-2.5 rounded-[14px] bg-butter-soft p-3.5 text-sm text-butter-ink">
                <AlertTriangle size={18} strokeWidth={1.6} className="mt-0.5 shrink-0" /> {task.notes}
              </div>
            )}

            <div className="mb-4 flex items-center gap-4">
              <ProgressRing value={total ? done / total : 0} size={60} stroke={5} gradient>
                <span className="display-num text-base">
                  {done}/{total}
                </span>
              </ProgressRing>
              <div>
                <h3 className="heading text-[1.4rem]">Checklist</h3>
                <p className="text-sm text-ink-soft">{locked ? 'Limpieza terminada' : 'Cuarto por cuarto: toca o desliza cada paso al terminarlo'}</p>
              </div>
            </div>
            <div className="flex flex-col gap-5">
              {roomsOf(task.checklist).map((room, ri) => {
                const rDone = room.items.filter((c) => c.done).length
                return (
                  <section key={room.name} aria-label={room.name}>
                    <div className="mb-2 flex items-center gap-2.5">
                      <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold', rDone === room.items.length ? 'bg-success text-paper' : 'bg-sunken text-ink-soft')}>{rDone === room.items.length ? <Check size={15} strokeWidth={2.4} /> : rDone}</span>
                      <h4 className="flex-1 text-[16px] font-semibold">{room.name}</h4>
                      <span className="text-sm text-ink-soft tabular">
                        {rDone} de {room.items.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {room.items.map((c, i) => (
                        <SwipeRow key={c.id} className="!rounded-[18px]" disabled={locked} hintKey={i === 0 && ri === 0 && !c.done ? 'checklist-limpieza' : undefined} left={{ label: c.done ? 'Desmarcar' : 'Hecho', icon: <Check />, tone: c.done ? 'butter' : 'success', onTrigger: () => toggle(c.id) }}>
                          <motion.button
                            whileTap={locked ? undefined : { scale: 0.98 }}
                            disabled={locked}
                            onClick={() => toggle(c.id)}
                            aria-pressed={c.done}
                            className={cx(
                              'flex min-h-[60px] w-full items-center gap-3.5 rounded-[18px] px-4 py-3 text-left text-[16px] transition-colors duration-[var(--dur-3)]',
                              c.done ? 'bg-secondary text-ink' : 'bg-surface ring-1 ring-line ring-inset hover:bg-wash',
                              locked && 'cursor-default',
                            )}
                          >
                            <span className={cx('flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] transition-colors duration-[var(--dur-3)]', c.done ? 'bg-primary text-on-primary' : 'ring-[1.5px] ring-line-strong ring-inset')}>
                              <AnimatePresence>{c.done && <CheckDraw size={17} strokeWidth={2.6} />}</AnimatePresence>
                            </span>
                            <span className={cx(c.done && 'text-ink-soft line-through decoration-1')}>{c.text}</span>
                          </motion.button>
                        </SwipeRow>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>

            <div className="mt-7">
              <h3 className="heading mb-3 text-[1.25rem]">Fotos de evidencia</h3>
              {task.photoIds.length >= 2 && (
                <div className="mb-3">
                  <BeforeAfter beforeId={task.photoIds[0]!} afterId={task.photoIds[task.photoIds.length - 1]!} />
                  <p className="mt-1.5 text-xs text-ink-3">Arrastra la luz para comparar la primera y la última foto.</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {task.photoIds.map((pid) => (
                  <PhotoThumb key={pid} id={pid} size={84} onRemove={locked ? undefined : () => db.patch('tasks', task.id, { photoIds: task.photoIds.filter((x) => x !== pid) }, { silent: true })} />
                ))}
                {task.status !== 'verificada' && (
                  <PhotoButton taskId={task.id} onAdded={(pid) => db.patch('tasks', task.id, { photoIds: [...(db.get('tasks', task.id)?.photoIds ?? []), pid] }, { silent: true })} label={task.photoIds.length ? 'Otra foto' : 'Tomar foto'} className="h-[84px] flex-col !rounded-[18px] px-5" />
                )}
              </div>
            </div>

            <button onClick={() => setLostOpen(true)} className="pressable mt-6 flex w-full items-center gap-3 rounded-[18px] px-4 py-3.5 text-left ring-1 ring-line ring-inset hover:bg-wash">
              <PackageSearch size={20} strokeWidth={1.6} className="shrink-0 text-ink-soft" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">¿Encontraste algo olvidado?</span>
                <span className="block text-xs text-ink-soft">Regístralo con foto para devolverlo al huésped</span>
              </span>
            </button>
          </>
        )}
      </Sheet>
      <Confirm open={askNoPhoto} onClose={() => setAskNoPhoto(false)} title="¿Terminar sin foto?" body="Una foto ayuda a administración a revisar más rápido. ¿Quieres marcarla como lista de todos modos?" confirmLabel="Sí, está lista" onConfirm={finish} />
      <LostItemSheet open={lostOpen} onClose={() => setLostOpen(false)} unitId={task.unitId} reservationId={task.reservationId} />
      <Success show={success} title="Lista" body="Gracias, buen trabajo" />
    </>
  )
}

export function ReportProblemSheet({ open, onClose, unitId: initialUnit }: { open: boolean; onClose: () => void; unitId?: ID }) {
  const units = useStore((s) => s.data.units)
  const me = useMe()
  const [unitId, setUnitId] = useState<ID>(initialUnit ?? '')
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority>('media')
  const [photos, setPhotos] = useState<ID[]>([])
  useEffect(() => {
    if (open) {
      setUnitId(initialUnit ?? '')
      setText('')
      setPriority('media')
      setPhotos([])
    }
  }, [open, initialUnit])
  const list = Object.values(units).filter((u) => !u.deleted)
  const submit = () => {
    if (!text.trim()) return toast.error('Describe el problema', 'Con una frase basta: qué pasa y dónde.')
    const unit = units[unitId]
    const tech = Object.values(useStore.getState().data.employees).find((e) => e.role === 'mantenimiento' && e.active && !e.deleted)
    db.upsert('tasks', {
      title: `${text.trim().slice(0, 60)}${unit ? ' · ' + unit.name : ''}`,
      type: 'mantenimiento',
      status: 'pendiente',
      priority,
      unitId: unitId || undefined,
      assigneeId: tech?.id,
      notes: text.trim(),
      checklist: [],
      photoIds: photos,
      createdById: me?.id,
      due: nowIso(),
    })
    useStore.getState().notify({ title: priority === 'urgente' ? 'Problema urgente' : 'Problema reportado', body: `${me?.name ?? 'Alguien'}: ${text.trim()}${unit ? ' (' + unit.name + ')' : ''}`, tone: priority === 'urgente' ? 'rose' : 'peach', link: '/tareas', roles: ['admin', 'mantenimiento'] })
    toast.success('Reporte enviado', priority === 'urgente' && unit ? `${unit.name} se bloqueó hasta repararse` : 'Mantenimiento ya fue avisado')
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Reportar problema"
      subtitle="Llega directo a mantenimiento"
      footer={
        <Button size="lg" variant="tinta" className="w-full" onClick={submit}>
          Enviar reporte
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Combobox label="¿Dónde?" value={unitId} onChange={setUnitId} clearable hint="Déjalo vacío si es un área común" options={list.map((u) => ({ value: u.id, label: u.name, hint: u.short, tone: u.color }))} />
        <NotesField label="¿Qué pasa?" value={text} onChange={setText} placeholder="Ej. la llave del lavabo gotea, falta un foco, el clima no enfría…" autoFocus templates={['Falta un foco', 'Gotea una llave', 'El clima no enfría', 'Algo roto', 'No hay agua caliente']} minRows={2} />
        <div>
          <Choices label="¿Qué tan urgente?" value={priority} onChange={setPriority} options={(Object.keys(PRIORITY) as Priority[]).map((p) => ({ value: p, label: PRIORITY[p].label, tone: PRIORITY[p].tone }))} />
          {priority === 'urgente' && unitId && <p className="mt-2 text-xs text-danger">La unidad se marcará en mantenimiento y no se podrá rentar hasta repararse.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {photos.map((p) => (
            <PhotoThumb key={p} id={p} onRemove={() => setPhotos((x) => x.filter((y) => y !== p))} />
          ))}
          <PhotoButton onAdded={(id) => setPhotos((x) => [...x, id])} label="Agregar foto" />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <Clock size={12} strokeWidth={1.6} /> Se guarda aunque no haya señal y se envía al reconectar.
        </p>
      </div>
    </Sheet>
  )
}

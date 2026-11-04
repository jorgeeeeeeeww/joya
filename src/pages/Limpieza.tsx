import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, ChevronRight, Clock, PackageSearch, Plus, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import { db, useCollection, useMe, useStore } from '@/lib/store'
import { createCleaningTask, type AutomationApi } from '@/lib/automations'
import { TASK_STATUS, TONE, UNIT_STATUS } from '@/lib/meta'
import { capitalize, fmtDateLong, fmtTime, nowIso, toISODate, today } from '@/lib/format'
import { ease, fadeRise, haptic } from '@/lib/motion'
import type { ID, Reservation, Task, Unit, UnitStatus } from '@/lib/types'
import { Avatar, Badge, Button, Card, CardHeader, cx, PageHeader, ProgressBar, Select, Sheet, Stat, toast } from '@/components/ui'
import { Reveal, Sparkle } from '@/components/step1'
import { arrivalText, CleaningSheet, nextArrival, ReadyNotice, ReportProblemSheet } from '@/components/stays/CleaningFlow'
import { CleaningRow, sortCleaning } from '@/components/stays/CleaningCards'
import { LostFoundList, LostItemSheet } from '@/components/stays/LostFound'
import { PhotoThumb } from '@/components/Photos'

const api: AutomationApi = {
  get: () => useStore.getState(),
  upsert: (col, doc) => db.upsert(col, doc),
  patch: (col, id, partial) => db.patch(col, id, partial),
  notify: (n) => useStore.getState().notify(n),
}

const localDay = (iso?: string) => (iso ? toISODate(new Date(iso)) : '')
const GROUPS: UnitStatus[] = ['sucia', 'limpiando', 'inspeccion', 'mantenimiento', 'lista', 'ocupada']

export default function Limpieza() {
  const me = useMe()
  const tasks = useCollection('tasks')
  const units = useCollection('units')
  const reservations = useCollection('reservations')
  const employees = useCollection('employees')
  const [openTask, setOpenTask] = useState<ID>()
  const [report, setReport] = useState<{ open: boolean; unitId?: ID }>({ open: false })
  const [lostOpen, setLostOpen] = useState(false)
  const [readyUnit, setReadyUnit] = useState<ID>()
  // Recepción también ve todas las casas: necesita saber cuál está lista antes de recibir huéspedes
  const supervisor = me?.role === 'admin' || me?.role === 'mantenimiento' || me?.role === 'recepcion'
  const t = today()

  const cleaning = useMemo(() => tasks.filter((x) => x.type === 'limpieza'), [tasks])
  const mine = cleaning.filter((x) => x.assigneeId === me?.id && (x.status !== 'verificada' || localDay(x.verifiedAt) === t)).sort(sortCleaning)
  const open = cleaning.filter((x) => x.status === 'pendiente' || x.status === 'en-progreso')
  const toReview = cleaning.filter((x) => x.status === 'hecha')
  const doneToday = cleaning.filter((x) => localDay(x.completedAt) === t)
  const durations = cleaning.filter((x) => x.startedAt && x.completedAt).map((x) => (new Date(x.completedAt!).getTime() - new Date(x.startedAt!).getTime()) / 60000)
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
  const cleaners = employees.filter((e) => e.role === 'limpieza' && e.active)
  const sortedUnits = [...units].sort((a, b) => a.name.localeCompare(b.name))

  const verify = (task: Task) => {
    db.patch('tasks', task.id, { status: 'verificada', verifiedAt: nowIso(), verifiedById: me?.id })
    haptic.success()
    toast.success(`${units.find((u) => u.id === task.unitId)?.name ?? 'Unidad'} lista`, 'Limpieza verificada')
    if (task.unitId) setReadyUnit(task.unitId)
  }

  return (
    <div className={cx(!supervisor && 'mx-auto max-w-3xl')}>
      <PageHeader
        eyebrow={capitalize(fmtDateLong(t))}
        title="Limpieza"
        subtitle={supervisor ? 'Cabañas y casas en tiempo real: quién limpia qué, qué falta revisar y qué está listo.' : open.filter((x) => x.assigneeId === me?.id).length ? 'Esto es lo que te toca hoy.' : 'No tienes limpiezas pendientes.'}
        actions={
          <>
            <Button variant="outline" icon={<PackageSearch size={18} strokeWidth={1.6} />} onClick={() => setLostOpen(true)}>
              Objeto olvidado
            </Button>
            <Button variant="secondary" icon={<Wrench size={18} strokeWidth={1.6} />} onClick={() => setReport({ open: true })}>
              Reportar problema
            </Button>
          </>
        }
      />

      <div className={cx('mb-8 grid gap-3', supervisor ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3')}>
        <Stat label="Pendientes" value={open.length} tone="peach" icon={<Clock size={16} strokeWidth={1.6} />} />
        <Stat label="Hechas hoy" value={doneToday.length} tone="sage" icon={<CheckCircle2 size={16} strokeWidth={1.6} />} accent={supervisor} />
        <Stat label="Tarda en promedio" value={avg ? (avg >= 60 ? `${Math.floor(avg / 60)} h ${avg % 60 ? `${avg % 60} min` : ''}`.trim() : `${avg} min`) : '—'} sub={avg ? 'por cada limpieza' : undefined} tone="sky" icon={<Sparkles size={16} strokeWidth={1.6} />} />
        {supervisor && <Stat label="Por revisar" value={toReview.length} tone="mint" icon={<ShieldCheck size={16} strokeWidth={1.6} />} />}
      </div>

      {/* Mi día */}
      {(me?.role === 'limpieza' || mine.length > 0) && (
        <section className="mb-10">
          <h2 className="heading mb-4 text-[1.7rem]">Mi día</h2>
          {mine.length === 0 ? (
            <Card className="flex items-center gap-4 p-6">
              <span className="text-chispa-soft">
                <Sparkle className="text-xl" />
              </span>
              <p className="text-ink-soft">Todo limpio por ahora. Cuando un huésped haga check-out, aquí aparecerá tu siguiente limpieza.</p>
            </Card>
          ) : (
            <Reveal className="flex flex-col gap-3">
              {mine.map((task) => (
                <CleaningRow key={task.id} task={task} unit={units.find((u) => u.id === task.unitId)} reservations={reservations} onOpen={() => setOpenTask(task.id)} />
              ))}
            </Reveal>
          )}
        </section>
      )}

      {supervisor && (
        <>
          {/* Por revisar */}
          <AnimatePresence>
            {toReview.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }} exit={{ opacity: 0 }} className="mb-10">
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="heading text-[1.7rem]">Por revisar</h2>
                  <Badge tone="mint">{toReview.length}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
                  {toReview.map((task) => {
                    const unit = units.find((u) => u.id === task.unitId)
                    const who = employees.find((e) => e.id === task.assigneeId)
                    const next = unit ? nextArrival(reservations, unit.id) : undefined
                    return (
                      <Card key={task.id} className="p-5">
                        <div className="flex items-start gap-4">
                          {who && <Avatar name={who.name} tone={who.color} size={40} />}
                          <button className="min-w-0 flex-1 text-left" onClick={() => setOpenTask(task.id)}>
                            <p className="heading truncate text-[1.3rem]">{unit?.name}</p>
                            <p className="truncate text-sm text-ink-soft">
                              {who?.name.split(' ')[0] ?? 'Sin asignar'} · terminó {task.completedAt ? fmtTime(task.completedAt) : ''}
                            </p>
                            <p className={cx('mt-1 text-xs', next?.checkIn === t ? 'text-warning' : 'text-ink-3')}>{arrivalText(next)}</p>
                          </button>
                        </div>
                        {task.photoIds.length > 0 && (
                          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
                            {task.photoIds.map((p) => (
                              <PhotoThumb key={p} id={p} size={64} />
                            ))}
                          </div>
                        )}
                        <div className="mt-4 flex gap-2">
                          <Button className="flex-1" icon={<ShieldCheck size={18} strokeWidth={1.6} />} onClick={() => verify(task)}>
                            Verificar y liberar
                          </Button>
                          <Button variant="ghost" onClick={() => setOpenTask(task.id)}>
                            Ver
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Tablero por estado */}
          <section className="mb-10">
            <h2 className="heading mb-1 text-[1.7rem]">Todas las unidades</h2>
            <p className="mb-5 text-sm text-ink-soft">Agrupadas por estado. Reasigna o crea una limpieza en un toque.</p>
            <div className="flex flex-col gap-7">
              {GROUPS.map((g) => {
                const list = sortedUnits.filter((u) => u.status === g)
                if (!list.length) return null
                const st = UNIT_STATUS[g]
                return (
                  <div key={g}>
                    <p className="eyebrow mb-3 flex items-center gap-2">
                      <span className={cx('h-2 w-2 rounded-full', TONE[st.tone].solid)} />
                      {st.label}
                      <span className="tabular text-ink-3">{list.length}</span>
                    </p>
                    <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
                      {list.map((u) => {
                        const task = cleaning.filter((x) => x.unitId === u.id && x.status !== 'verificada').sort(sortCleaning)[0]
                        return <UnitTile key={u.id} unit={u} task={task} cleaners={cleaners} reservations={reservations} onOpen={() => task && setOpenTask(task.id)} onReport={() => setReport({ open: true, unitId: u.id })} />
                      })}
                    </Reveal>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="mb-10 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader eyebrow="Equipo" title="Pendientes por persona" subtitle="Limpiezas abiertas de cada quien" />
              <div className="px-3 pt-3 pb-3">
                {cleaners.map((c) => {
                  const theirs = open.filter((x) => x.assigneeId === c.id)
                  const active = theirs.find((x) => x.status === 'en-progreso')
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-[14px] px-3 py-3">
                      <Avatar name={c.name} tone={c.color} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{c.name}</p>
                        <p className="truncate text-xs text-ink-soft">
                          {active ? `Limpiando ${units.find((u) => u.id === active.unitId)?.name ?? ''}` : theirs.length ? theirs.map((x) => units.find((u) => u.id === x.unitId)?.short).join(', ') : 'Libre'}
                        </p>
                      </div>
                      <span className="display-num text-[1.6rem]">{theirs.length}</span>
                    </div>
                  )
                })}
                {cleaners.length === 0 && <p className="px-3 py-3 text-sm text-ink-soft">Agrega personas de limpieza en Equipo.</p>}
              </div>
            </Card>
            <LostFoundList />
          </div>
        </>
      )}

      <CleaningSheet taskId={openTask} onClose={() => setOpenTask(undefined)} />
      <ReportProblemSheet open={report.open} unitId={report.unitId} onClose={() => setReport({ open: false })} />
      <LostItemSheet open={lostOpen} onClose={() => setLostOpen(false)} />
      <Sheet open={!!readyUnit} onClose={() => setReadyUnit(undefined)} title="Unidad lista" subtitle="¿Le avisamos al próximo huésped?" side="center">
        {readyUnit && <ReadyNotice unitId={readyUnit} />}
      </Sheet>
    </div>
  )
}

function UnitTile({ unit, task, cleaners, reservations, onOpen, onReport }: { unit: Unit; task?: Task; cleaners: { id: string; name: string }[]; reservations: Reservation[]; onOpen: () => void; onReport: () => void }) {
  const st = UNIT_STATUS[unit.status]
  const next = nextArrival(reservations, unit.id)
  const progress = task?.checklist.length ? task.checklist.filter((c) => c.done).length / task.checklist.length : 0
  return (
    <motion.div variants={fadeRise}>
      <Card className="h-full p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-ink-soft">{unit.kind === 'cabana' ? 'Cabaña' : 'Casa'}</p>
            <p className="heading truncate text-[1.3rem]">{unit.name}</p>
          </div>
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
        </div>
        <p className={cx('mt-2 text-sm', next?.checkIn === today() && unit.status !== 'lista' && unit.status !== 'ocupada' ? 'text-warning' : 'text-ink-soft')}>
          {arrivalText(next)}
          {next ? ` · ${next.guestName.split(' ')[0]}` : ''}
        </p>
        {task ? (
          <div className="mt-4 space-y-2.5">
            <button onClick={onOpen} className="pressable flex w-full items-center gap-3 rounded-[14px] bg-sunken px-3.5 py-2.5 text-left text-sm">
              <span className="font-medium">{TASK_STATUS[task.status].label}</span>
              <ProgressBar value={progress} className="flex-1" />
              <span className="text-xs text-ink-soft tabular">{Math.round(progress * 100)}%</span>
              <ChevronRight size={16} strokeWidth={1.6} className="text-ink-3" />
            </button>
            {task.status !== 'hecha' && (
              <Select aria-label={`Persona asignada a ${unit.name}`} value={task.assigneeId ?? ''} onChange={(e) => db.patch('tasks', task.id, { assigneeId: e.target.value || undefined }, { summary: `Reasignó ${task.title}` })} className="!h-10 text-sm">
                <option value="">Sin asignar</option>
                {cleaners.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        ) : (
          unit.status !== 'ocupada' && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-4 w-full"
              icon={<Plus size={16} strokeWidth={1.6} />}
              onClick={() => {
                createCleaningTask(api, unit.id, { automated: 'Limpieza manual' })
                if (unit.status === 'lista') db.patch('units', unit.id, { status: 'sucia' })
                toast.success('Limpieza creada', unit.name)
              }}
            >
              Crear limpieza
            </Button>
          )
        )}
        <button onClick={onReport} className="pressable mt-2 flex h-10 w-full items-center justify-center rounded-full text-xs text-ink-soft hover:bg-wash hover:text-ink">
          Reportar problema
        </button>
      </Card>
    </motion.div>
  )
}

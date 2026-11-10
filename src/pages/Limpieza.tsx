import { useMemo, useState } from 'react'
import { Check, PackageSearch, Plus, ShieldCheck, Wrench } from 'lucide-react'
import { db, useCollection, useMe, useStore } from '@/lib/store'
import { createCleaningTask, type AutomationApi } from '@/lib/automations'
import { canDo, UNIT_STATUS } from '@/lib/meta'
import { capitalize, fmtDateLong, fmtTime, nowIso, toISODate, today } from '@/lib/format'
import { haptic } from '@/lib/motion'
import type { Employee, ID, Reservation, Task, Unit } from '@/lib/types'
import { Avatar, Button, Card, cx, OverflowMenu, PageHeader, ProgressBar, Select, Sheet, toast, type MenuItem } from '@/components/ui'
import { DragBoard } from '@/components/interact'
import { Reveal, Sparkle } from '@/components/step1'
import { arrivalText, CleaningSheet, nextArrival, ReadyNotice, ReportProblemSheet, sendBackCleaning } from '@/components/stays/CleaningFlow'
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

type Col = 'sucia' | 'limpiando' | 'inspeccion' | 'lista'
const BOARD: Col[] = ['sucia', 'limpiando', 'inspeccion', 'lista']
const EMPTY: Record<Col, string> = { sucia: 'Nada por limpiar', limpiando: 'Nadie limpiando', inspeccion: 'Nada por revisar', lista: 'Ninguna lista' }

const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)

export default function Limpieza() {
  const me = useMe()
  const tasks = useCollection('tasks')
  const units = useCollection('units')
  const reservations = useCollection('reservations')
  const employees = useCollection('employees')
  const lost = useCollection('lostfound')
  const [openTask, setOpenTask] = useState<ID>()
  const [report, setReport] = useState<{ open: boolean; unitId?: ID }>({ open: false })
  const [lostOpen, setLostOpen] = useState(false)
  const [readyUnit, setReadyUnit] = useState<ID>()
  const [person, setPerson] = useState<ID>()
  // Recepción también ve todas las casas: necesita saber cuál está lista antes de recibir huéspedes
  const supervisor = me?.role === 'admin' || me?.role === 'mantenimiento' || me?.role === 'recepcion'
  const canVerify = canDo(me?.role, 'verificarLimpieza')
  const canCoordinate = canDo(me?.role, 'coordinarLimpieza')
  const canReport = canDo(me?.role, 'reportarProblema')
  const canLost = canDo(me?.role, 'registrarObjeto')
  const t = today()

  const cleaning = useMemo(() => tasks.filter((x) => x.type === 'limpieza'), [tasks])
  const mine = cleaning.filter((x) => x.assigneeId === me?.id && (x.status !== 'verificada' || localDay(x.verifiedAt) === t)).sort(sortCleaning)
  const open = cleaning.filter((x) => x.status === 'pendiente' || x.status === 'en-progreso')
  const doneToday = cleaning.filter((x) => localDay(x.completedAt) === t)
  const durations = cleaning.filter((x) => x.startedAt && x.completedAt).map((x) => (new Date(x.completedAt!).getTime() - new Date(x.startedAt!).getTime()) / 60000)
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
  const cleaners = employees.filter((e) => e.role === 'limpieza' && e.active)
  const sortedUnits = [...units].sort((a, b) => a.name.localeCompare(b.name))
  const taskOf = (id: ID) => cleaning.filter((x) => x.unitId === id && x.status !== 'verificada').sort(sortCleaning)[0]
  const arrivalOf = (u: Unit) => nextArrival(reservations, u.id)?.checkIn ?? '9999'

  const inBoard = sortedUnits.filter((u) => (BOARD as string[]).includes(u.status))
  const shown = person ? inBoard.filter((u) => taskOf(u.id)?.assigneeId === person) : inBoard
  const occupied = sortedUnits.filter((u) => u.status === 'ocupada')
  const repair = sortedUnits.filter((u) => u.status === 'mantenimiento')
  const summary = [doneToday.length ? `${doneToday.length} ${doneToday.length === 1 ? 'hecha' : 'hechas'} hoy` : 'Ninguna hecha hoy', avg ? `tardan ${minutes(avg)} en promedio` : ''].filter(Boolean).join(' · ')

  const verify = (task: Task) => {
    db.patch('tasks', task.id, { status: 'verificada', verifiedAt: nowIso(), verifiedById: me?.id })
    haptic.success()
    toast.success(`${units.find((u) => u.id === task.unitId)?.name ?? 'Unidad'} lista`, 'Limpieza verificada')
    if (task.unitId) setReadyUnit(task.unitId)
  }
  const newCleaning = (u: Unit) => {
    createCleaningTask(api, u.id, { automated: 'Limpieza manual' })
    if (u.status === 'lista') db.patch('units', u.id, { status: 'sucia' })
    toast.success('Limpieza creada', u.name)
  }
  // Solo los movimientos que son decisión de quien supervisa: empezar y terminar le toca a quien limpia
  const canMove = (u: Unit, to: Col) => (u.status === 'inspeccion' && (to === 'lista' || to === 'limpiando') && canVerify) || (u.status === 'lista' && to === 'sucia' && canCoordinate)
  const move = (u: Unit, to: Col) => {
    const task = taskOf(u.id)
    if (to === 'sucia') return newCleaning(u)
    if (to === 'limpiando') return task && sendBackCleaning(task, '', u.name)
    if (task) return verify(task)
    db.patch('units', u.id, { status: 'lista', lastCleanedAt: nowIso() })
    toast.success(`${u.name} lista`, 'Limpieza verificada')
  }

  return (
    <div className={cx(!supervisor && 'mx-auto max-w-3xl')}>
      <PageHeader
        eyebrow={capitalize(fmtDateLong(t))}
        title="Limpieza"
        subtitle={supervisor ? summary : `${open.filter((x) => x.assigneeId === me?.id).length ? 'Esto es lo que te toca hoy.' : 'No tienes limpiezas pendientes.'} ${summary}.`}
        menu={
          supervisor
            ? [
                { label: 'Objeto olvidado', icon: <PackageSearch />, onClick: () => setLostOpen(true), hidden: !canLost },
                { label: 'Reportar problema', icon: <Wrench />, onClick: () => setReport({ open: true }), hidden: !canReport },
              ]
            : undefined
        }
        actions={
          !supervisor && (canLost || canReport) ? (
            <>
              {canLost && (
                <Button variant="outline" icon={<PackageSearch size={18} strokeWidth={1.6} />} onClick={() => setLostOpen(true)}>
                  Objeto olvidado
                </Button>
              )}
              {canReport && (
                <Button variant="secondary" icon={<Wrench size={18} strokeWidth={1.6} />} onClick={() => setReport({ open: true })}>
                  Reportar problema
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {/* Mi día */}
      {(me?.role === 'limpieza' || mine.length > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 text-[17px] leading-tight font-semibold tracking-[-0.02em]">Mi día</h2>
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
          {/* El equipo: toca a alguien para ver solo lo suyo */}
          {cleaners.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {cleaners.map((c) => {
                const theirs = open.filter((x) => x.assigneeId === c.id)
                const active = theirs.find((x) => x.status === 'en-progreso')
                const on = person === c.id
                return (
                  <button key={c.id} aria-pressed={on} onClick={() => setPerson(on ? undefined : c.id)} className={cx('pressable flex min-h-12 items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-left ring-1 ring-inset', on ? 'bg-[color-mix(in_oklab,var(--luz)_26%,var(--surface))] ring-line-strong' : 'bg-surface ring-line hover:bg-wash')}>
                    <Avatar name={c.name} tone={c.color} size={34} />
                    <span className="leading-tight">
                      <span className="block text-[13px] font-semibold">{c.name.split(' ')[0]}</span>
                      <span className="block text-[12px] text-detail">{active ? `En ${units.find((u) => u.id === active.unitId)?.short ?? 'limpieza'}` : theirs.length ? `${theirs.length} por empezar` : 'Libre'}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="mb-4 text-[14px] text-ink-soft">Agrega personas de limpieza en Equipo para repartir el trabajo.</p>
          )}

          {/* El tablero: de sucia a lista */}
          <DragBoard<Unit, Col>
            stack
            columns={BOARD.map((c) => ({ id: c, title: UNIT_STATUS[c].label, tone: UNIT_STATUS[c].tone, empty: EMPTY[c] }))}
            items={shown}
            getId={(u) => u.id}
            getColumn={(u) => u.status as Col}
            canDrop={canMove}
            onMove={(_, to, u) => move(u, to)}
            sort={(a, b) => arrivalOf(a).localeCompare(arrivalOf(b))}
            renderCard={(u) => {
              const task = taskOf(u.id)
              return (
                <BoardCard
                  unit={u}
                  task={task}
                  who={employees.find((e) => e.id === task?.assigneeId)}
                  reservations={reservations}
                  cleaners={cleaners}
                  canVerify={canVerify}
                  canCoordinate={canCoordinate}
                  onOpen={() => task && setOpenTask(task.id)}
                  onVerify={() => move(u, 'lista')}
                  menu={[
                    { label: 'Crear limpieza', icon: <Plus />, onClick: () => newCleaning(u), hidden: !!task || !canCoordinate },
                    { label: 'Reportar problema', icon: <Wrench />, onClick: () => setReport({ open: true, unitId: u.id }), hidden: !canReport },
                  ]}
                />
              )
            }}
          />
          {canVerify && inBoard.some((u) => u.status === 'inspeccion') && <p className="mt-1 text-[13px] text-detail">Pasa una casa de «Por revisar» a «Lista» para liberarla, o de regreso a «Limpiando» si falta algo.</p>}

          {/* Lo que no entra al tablero */}
          {occupied.length + repair.length > 0 && (
            <div className="mt-6 space-y-2 text-[14px]">
              {occupied.length > 0 && (
                <p>
                  <span className="font-semibold">Con huéspedes:</span> <span className="text-ink-soft">{occupied.map((u) => u.name).join(' · ')}</span>
                </p>
              )}
              {repair.length > 0 && (
                <p>
                  <span className="font-semibold text-key">En mantenimiento:</span> <span className="text-ink-soft">{repair.map((u) => u.name).join(' · ')}</span>
                </p>
              )}
            </div>
          )}

          {lost.some((x) => x.status === 'guardado') && <LostFoundList className="mt-8" />}
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

function BoardCard({ unit, task, who, reservations, cleaners, canVerify, canCoordinate, onOpen, onVerify, menu }: { unit: Unit; task?: Task; who?: Employee; reservations: Reservation[]; cleaners: Employee[]; canVerify: boolean; canCoordinate: boolean; onOpen: () => void; onVerify: () => void; menu: MenuItem[] }) {
  const next = nextArrival(reservations, unit.id)
  const late = next?.checkIn === today() && unit.status !== 'lista'
  const done = task?.checklist.filter((c) => c.done).length ?? 0
  const total = task?.checklist.length ?? 0
  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-1">
        <button onClick={onOpen} disabled={!task} className="min-h-11 min-w-0 flex-1 text-left">
          <span className="block text-[15px] leading-snug font-semibold">{unit.name}</span>
          <span className={cx('mt-0.5 block text-[13px] leading-snug', late ? 'font-medium text-key' : 'text-detail')}>
            {arrivalText(next)}
            {next ? ` · ${next.guestName.split(' ')[0]}` : ''}
          </span>
        </button>
        {menu.some((m) => !m.hidden) && (
          <div data-nodrag className="-mt-1 -mr-1 shrink-0">
            <OverflowMenu items={menu} title={unit.name} />
          </div>
        )}
      </div>

      {task?.status === 'pendiente' &&
        (canCoordinate ? (
          <Select aria-label={`Persona asignada a ${unit.name}`} value={task.assigneeId ?? ''} onChange={(e) => db.patch('tasks', task.id, { assigneeId: e.target.value || undefined }, { summary: `Reasignó ${task.title}` })} className="mt-2 text-sm">
            <option value="">Sin asignar</option>
            {cleaners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : (
          who && <Person who={who} />
        ))}

      {task?.status === 'en-progreso' && (
        <button onClick={onOpen} className="mt-2 block w-full text-left">
          {who && <Person who={who} />}
          {total > 0 && (
            <span className="mt-2 flex items-center gap-2.5">
              <ProgressBar value={done / total} className="flex-1" />
              <span className="text-xs text-detail tabular">
                {done} de {total}
              </span>
            </span>
          )}
        </button>
      )}

      {unit.status === 'inspeccion' && (
        <>
          {who && <Person who={who} note={task?.completedAt ? `terminó ${fmtTime(task.completedAt)}` : undefined} />}
          {!!task?.photoIds.length && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {task.photoIds.slice(0, 4).map((p) => (
                <PhotoThumb key={p} id={p} size={48} />
              ))}
            </div>
          )}
          {canVerify && (
            <Button size="sm" className="mt-3 w-full" icon={<ShieldCheck size={16} strokeWidth={1.6} />} onClick={onVerify}>
              Verificar y liberar
            </Button>
          )}
        </>
      )}

      {unit.status === 'lista' && unit.lastCleanedAt && localDay(unit.lastCleanedAt) === today() && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-detail">
          <Check size={13} strokeWidth={1.6} /> Revisada hoy
        </p>
      )}
    </Card>
  )
}

function Person({ who, note }: { who: Employee; note?: string }) {
  return (
    <span className="mt-2 flex items-center gap-2 text-[13px]">
      <Avatar name={who.name} tone={who.color} size={24} />
      <span>
        {who.name.split(' ')[0]}
        {note ? <span className="text-detail"> · {note}</span> : null}
      </span>
    </span>
  )
}

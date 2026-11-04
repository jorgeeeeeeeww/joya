import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarClock, Check, CheckCircle2, Circle, CornerDownLeft, MapPin, Plus, Sparkles, Trash2, User, Wand2, X, Zap } from 'lucide-react'
import { db, useCollection, useDoc, useMe } from '@/lib/store'
import { PRIORITY, TASK_STATUS, TASK_TYPE, TONE } from '@/lib/meta'
import { addDaysISO, ago, fmt, today, uid } from '@/lib/format'
import { ease, haptic } from '@/lib/motion'
import { removeWithUndo, withUndo } from '@/lib/undo'
import type { ChecklistItem, Priority, Task, TaskStatus, TaskType } from '@/lib/types'
import { Avatar, Badge, Button, Chip, cx, Empty, PageHeader, ProgressBar, Segmented, Sheet, toast } from '@/components/ui'
import { Choices, Combobox, DateField, FormScope, NotesField, TextField, TimeField } from '@/components/fields'
import { DragBoard, SwipeRow } from '@/components/interact'
import { PhotoButton, PhotoThumb } from '@/components/Photos'
import { parseQuickTask } from '@/components/tasks/quickParse'

const COLUMNS: TaskStatus[] = ['pendiente', 'en-progreso', 'hecha', 'verificada']
const NEXT: Record<TaskStatus, TaskStatus | null> = { pendiente: 'en-progreso', 'en-progreso': 'hecha', hecha: 'verificada', verificada: null }
const PRIORITY_ORDER: Record<Priority, number> = { urgente: 0, alta: 1, media: 2, baja: 3 }

/** Cambia el estado de una tarea con sus marcas de tiempo y ofrece deshacer */
function setTaskStatus(t: Task, status: TaskStatus, by?: string, undo = true) {
  if (t.status === status) return
  const now = new Date().toISOString()
  const before = { status: t.status, startedAt: t.startedAt, completedAt: t.completedAt, verifiedAt: t.verifiedAt, verifiedById: t.verifiedById }
  db.patch('tasks', t.id, {
    status,
    ...(status === 'en-progreso' && !t.startedAt ? { startedAt: now } : {}),
    ...(status === 'hecha' ? { completedAt: now } : {}),
    ...(status === 'verificada' ? { verifiedAt: now, verifiedById: by } : {}),
  })
  if (undo) withUndo(`${t.title} · ${TASK_STATUS[status].label}`, () => db.patch('tasks', t.id, before))
}

export function advanceTask(t: Task, by?: string) {
  const next = NEXT[t.status]
  if (next) setTaskStatus(t, next, by)
}

function dueLabel(due?: string) {
  if (!due) return null
  const d = due.slice(0, 10)
  const t = today()
  const late = d < t
  const label = d === t ? `Hoy · ${fmt(due, 'HH:mm')}` : d === addDaysISO(t, 1) ? `Mañana · ${fmt(due, 'HH:mm')}` : fmt(due, 'EEE d MMM · HH:mm')
  return { label, late }
}

function TaskCard({ t, onOpen, compact, showAction = true }: { t: Task; onOpen: () => void; compact?: boolean; showAction?: boolean }) {
  const emp = useDoc('employees', t.assigneeId)
  const unit = useDoc('units', t.unitId)
  const me = useMe()
  const done = t.checklist.filter((c) => c.done).length
  const due = dueLabel(t.due)
  const next = NEXT[t.status]
  const canVerify = me?.role === 'admin' || me?.role === 'eventos'
  const late = due?.late && t.status !== 'verificada' && t.status !== 'hecha'
  const urgent = t.priority === 'urgente' || t.priority === 'alta'
  return (
    <article className="card relative overflow-hidden">
      {urgent && <span aria-hidden className={cx('absolute top-4 bottom-4 left-0 w-[3px] rounded-r-full', TONE[PRIORITY[t.priority].tone].solid)} />}
      <button onClick={onOpen} className="block w-full p-4 pb-3 text-left">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={TASK_TYPE[t.type].tone}>{TASK_TYPE[t.type].label}</Badge>
              {urgent && <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>}
              {t.automated && (
                <span title={t.automated} className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                  <Wand2 size={12} strokeWidth={1.6} /> Automática
                </span>
              )}
            </div>
            <p className={cx('mt-2 text-[15px] leading-snug font-medium', t.status === 'verificada' && 'text-ink-soft')}>{t.title}</p>
            {!compact && unit && <p className="mt-0.5 text-[13px] text-ink-soft">{unit.name}</p>}
          </div>
          {emp && <Avatar name={emp.name} tone={emp.color} size={30} />}
        </div>
        {t.checklist.length > 0 && !compact && (
          <div className="mt-3 flex items-center gap-2.5">
            <ProgressBar value={done / t.checklist.length} tone={done === t.checklist.length ? 'sage' : undefined} className="flex-1" />
            <span className="text-xs text-ink-soft tabular">
              {done}/{t.checklist.length}
            </span>
          </div>
        )}
        {due && !compact && (
          <p className={cx('mt-2.5 inline-flex items-center gap-1.5 text-xs', late ? 'text-danger' : 'text-ink-soft')}>
            <CalendarClock size={13} strokeWidth={1.6} /> {late ? 'Atrasada · ' : ''}
            {due.label}
          </p>
        )}
      </button>
      {showAction && next && (next !== 'verificada' || canVerify) && (
        <div className="px-4 pb-4" data-nodrag>
          <Button size="sm" variant={next === 'verificada' ? 'secondary' : 'outline'} className="w-full" onClick={() => advanceTask(t, me?.id)} icon={next === 'verificada' ? <Check size={16} strokeWidth={1.6} /> : undefined}>
            {next === 'en-progreso' ? 'Empezar' : next === 'hecha' ? 'Marcar como hecha' : 'Verificar'}
          </Button>
        </div>
      )}
    </article>
  )
}

export function TaskSheet({ taskId, open, onClose, draft }: { taskId?: string; open: boolean; onClose: () => void; draft?: Partial<Task> }) {
  const existing = useDoc('tasks', taskId)
  const allEmployees = useCollection('employees')
  const employees = useMemo(() => allEmployees.filter((e) => e.active), [allEmployees])
  const units = useCollection('units')
  const me = useMe()
  const [form, setForm] = useState<Partial<Task>>({})
  const [newItem, setNewItem] = useState('')
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(existing ?? { type: 'general', priority: 'media', status: 'pendiente', checklist: [], photoIds: [], due: `${today()}T12:00`, ...draft })
      setReveal(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId])

  const set = (p: Partial<Task>) => setForm((f) => ({ ...f, ...p }))
  const isEdit = !!existing
  const canEditAll = me?.role === 'admin' || me?.role === 'eventos' || me?.role === 'mantenimiento' || !isEdit
  const save = () => {
    if (!form.title?.trim()) {
      setReveal(true)
      return toast.error('Falta el nombre de la tarea', 'Escribe qué hay que hacer.')
    }
    const saved = db.upsert('tasks', { ...form, title: form.title.trim(), checklist: form.checklist ?? [], photoIds: form.photoIds ?? [], createdById: form.createdById ?? me?.id } as Task)
    toast.success(isEdit ? 'Tarea actualizada' : 'Tarea creada', saved.title)
    onClose()
  }
  const toggleItem = (id: string) => {
    haptic.select()
    set({ checklist: (form.checklist ?? []).map((c) => (c.id === id ? { ...c, done: !c.done } : c)) })
  }
  const addItem = () => {
    if (!newItem.trim()) return
    set({ checklist: [...(form.checklist ?? []), { id: uid('chk_'), text: newItem.trim(), done: false }] })
    setNewItem('')
  }
  const doneCount = form.checklist?.filter((c) => c.done).length ?? 0
  const dueDate = form.due?.slice(0, 10)
  const dueTime = form.due?.slice(11, 16)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Detalle de tarea' : 'Nueva tarea'}
      subtitle={existing ? `Creada ${ago(existing.createdAt)}${existing.automated ? ` · ${existing.automated}` : ''}` : 'Asigna, programa y agrega los pasos.'}
      footer={
        <div className="flex items-center gap-2">
          {isEdit && canEditAll && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar tarea"
              onClick={() => {
                removeWithUndo('tasks', existing.id, `La tarea "${existing.title}"`)
                onClose()
              }}
            >
              <Trash2 size={18} strokeWidth={1.6} />
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>{isEdit ? 'Guardar cambios' : 'Crear tarea'}</Button>
        </div>
      }
    >
      <FormScope reveal={reveal}>
        <div className="flex flex-col gap-4">
          <TextField label="¿Qué hay que hacer?" value={form.title ?? ''} onChange={(v) => set({ title: v })} placeholder="Ej. Revisar clima de la Casa Lavanda" autoFocus={!isEdit} disabled={!canEditAll} required requiredMsg="Escribe qué hay que hacer" />
          <Choices
            label="Tipo"
            value={form.type}
            onChange={(v) => set({ type: v })}
            size="sm"
            options={(Object.keys(TASK_TYPE) as TaskType[]).map((k) => ({ value: k, label: TASK_TYPE[k].label, tone: TASK_TYPE[k].tone, disabled: !canEditAll }))}
          />
          <Choices label="Prioridad" value={form.priority} onChange={(v) => set({ priority: v })} size="sm" options={(Object.keys(PRIORITY) as Priority[]).map((k) => ({ value: k, label: PRIORITY[k].label, tone: PRIORITY[k].tone, disabled: !canEditAll }))} />
          {/* ¿Quién la hace?: las personas a la vista, de un toque. Primero quienes suelen hacer ese tipo de tarea */}
          <div>
            <span className="mb-2 block text-[13px] font-medium">¿Quién la hace?</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quién la hace">
              {[...employees]
                .sort((a, b) => Number(fitsType(b.role, form.type)) - Number(fitsType(a.role, form.type)))
                .map((e) => {
                  const on = form.assigneeId === e.id
                  return (
                    <button
                      key={e.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!canEditAll}
                      onClick={() => set({ assigneeId: on ? undefined : e.id })}
                      className={cx('pressable inline-flex min-h-11 items-center gap-2 rounded-full py-1 pr-3.5 pl-1 text-sm ring-inset', on ? 'bg-ink text-paper' : 'ring-1 ring-line hover:bg-wash', !fitsType(e.role, form.type) && !on && 'opacity-70')}
                    >
                      <Avatar name={e.name} tone={e.color} size={30} />
                      {e.name.split(' ')[0]}
                    </button>
                  )
                })}
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">{form.assigneeId ? 'Le llega un aviso y la ve en su panel.' : 'Si no eliges a nadie, queda para quien la tome primero.'}</p>
          </div>
          <div className="grid gap-3 @xl:grid-cols-2">
            <Combobox label="Lugar" icon={<MapPin />} value={form.unitId ?? ''} onChange={(v) => set({ unitId: v || undefined })} clearable disabled={!canEditAll} options={units.map((u) => ({ value: u.id, label: u.name, hint: u.short, tone: u.color }))} />
            <DateField label="Fecha" value={dueDate} onChange={(d) => set({ due: d ? `${d}T${dueTime || '12:00'}` : undefined })} clearable disabled={!canEditAll} />
            <TimeField label="Hora" value={dueTime} onChange={(h) => set({ due: `${dueDate || today()}T${h || '12:00'}` })} presets={['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']} disabled={!canEditAll} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium">Lista de pasos</span>
              {(form.checklist?.length ?? 0) > 0 && (
                <span className="text-xs text-ink-soft tabular">
                  {doneCount} de {form.checklist!.length}
                </span>
              )}
            </div>
            {(form.checklist?.length ?? 0) > 0 && <ProgressBar value={doneCount / form.checklist!.length} className="mb-3" />}
            <div className="flex flex-col gap-1.5">
              <AnimatePresence initial={false}>
                {(form.checklist ?? []).map((c: ChecklistItem) => (
                  <motion.div key={c.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.24, ease: ease.calma }}>
                    <div className="flex min-h-12 items-center gap-3 rounded-[12px] bg-sunken px-3.5 py-2">
                      <button onClick={() => toggleItem(c.id)} className="pressable shrink-0 rounded-full" aria-label={c.done ? `Desmarcar ${c.text}` : `Marcar ${c.text}`}>
                        {c.done ? <CheckCircle2 className="text-success" size={22} strokeWidth={1.6} /> : <Circle className="text-ink-3" size={22} strokeWidth={1.6} />}
                      </button>
                      <span className={cx('flex-1 text-[15px] transition-colors', c.done && 'text-ink-3 line-through')}>{c.text}</span>
                      {canEditAll && (
                        <button onClick={() => set({ checklist: form.checklist!.filter((x) => x.id !== c.id) })} className="rounded-full p-1.5 text-ink-3 hover:bg-wash hover:text-danger" aria-label={`Quitar ${c.text}`}>
                          <X size={16} strokeWidth={1.6} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div className="flex items-start gap-2">
                <TextField label="Agregar un paso" value={newItem} onChange={setNewItem} onEnter={addItem} className="flex-1" clearable={false} />
                <Button variant="secondary" size="icon" className="mt-1" aria-label="Agregar paso" onClick={addItem} disabled={!newItem.trim()}>
                  <Plus size={18} strokeWidth={1.6} />
                </Button>
              </div>
            </div>
          </div>

          <NotesField label="Notas" value={form.notes ?? ''} onChange={(v) => set({ notes: v })} placeholder="Detalles, materiales, observaciones…" templates={['Traer herramienta', 'Comprar material', 'Avisar al terminar']} minRows={2} />

          <div>
            <span className="mb-2 block text-[13px] font-medium">Fotos de evidencia</span>
            <div className="flex flex-wrap items-center gap-2.5">
              {(form.photoIds ?? []).map((id) => (
                <PhotoThumb key={id} id={id} onRemove={() => set({ photoIds: form.photoIds!.filter((x) => x !== id) })} />
              ))}
              <PhotoButton taskId={existing?.id} label="Agregar foto" onAdded={(id) => set({ photoIds: [...(form.photoIds ?? []), id] })} />
            </div>
          </div>

          {isEdit && (
            <div>
              <span className="mb-2 block text-[13px] font-medium">Estado</span>
              <Segmented value={form.status as TaskStatus} onChange={(s) => set({ status: s })} options={COLUMNS.map((s) => ({ value: s, label: TASK_STATUS[s].label }))} size="sm" className="flex w-full" />
            </div>
          )}
        </div>
      </FormScope>
    </Sheet>
  )
}

/** Barra "Agregar rápido": escribe como hablas y la app entiende lugar, fecha, hora, prioridad y persona */
function QuickAdd({ onCreated }: { onCreated?: () => void }) {
  const units = useCollection('units')
  const employees = useCollection('employees')
  const me = useMe()
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim().length > 2 ? parseQuickTask(text, units, employees) : null), [text, units, employees])
  const create = () => {
    if (!parsed?.title) return
    const t = db.upsert('tasks', {
      title: parsed.title,
      type: parsed.type ?? 'general',
      priority: parsed.priority ?? 'media',
      status: 'pendiente',
      unitId: parsed.unitId,
      assigneeId: parsed.assigneeId ?? (me?.role === 'limpieza' || me?.role === 'mantenimiento' ? me.id : undefined),
      due: parsed.date || parsed.time ? `${parsed.date ?? today()}T${parsed.time ?? '12:00'}` : undefined,
      checklist: [],
      photoIds: [],
      createdById: me?.id,
    } as Partial<Task>)
    setText('')
    withUndo('Tarea creada', () => db.remove('tasks', t.id), t.title)
    onCreated?.()
  }
  const emp = employees.find((e) => e.id === parsed?.assigneeId)
  const unit = units.find((u) => u.id === parsed?.unitId)
  const chips = parsed
    ? [
        parsed.type && { k: 'type', label: TASK_TYPE[parsed.type].label, tone: TASK_TYPE[parsed.type].tone },
        unit && { k: 'unit', label: unit.name, icon: <MapPin size={12} strokeWidth={1.8} /> },
        (parsed.date || parsed.time) && { k: 'due', label: `${parsed.date ? (parsed.date === today() ? 'Hoy' : parsed.date === addDaysISO(today(), 1) ? 'Mañana' : fmt(parsed.date, 'EEE d MMM')) : 'Hoy'}${parsed.time ? ` · ${parsed.time}` : ''}`, icon: <CalendarClock size={12} strokeWidth={1.8} /> },
        parsed.priority && { k: 'pr', label: PRIORITY[parsed.priority].label, tone: PRIORITY[parsed.priority].tone },
        emp && { k: 'who', label: emp.name.split(' ')[0], icon: <User size={12} strokeWidth={1.8} /> },
      ].filter(Boolean)
    : []
  return (
    <div className="card mb-5 p-3 transition-shadow duration-[var(--dur-2)] focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_12%,transparent),0_0_22px_color-mix(in_oklab,var(--luz)_40%,transparent)]">
      <div className="flex items-center gap-2">
        <span className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_45%,var(--surface))] text-night">
          <Zap size={17} strokeWidth={1.7} />
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), create())}
          placeholder="Escribe una tarea nueva"
          aria-label="Agregar tarea rápido"
          className="h-11 min-w-0 flex-1 bg-transparent px-1 text-base !shadow-none !outline-none placeholder:text-ink-faint pointer-fine:text-[15px]"
        />
        <Button size="sm" onClick={create} disabled={!parsed?.title} icon={<CornerDownLeft size={15} strokeWidth={1.7} />} className="shrink-0">
          <span className="max-sm:hidden">Crear</span>
        </Button>
      </div>
      {!parsed && (
        <p className="px-1 pt-2 text-[12.5px] leading-snug text-ink-soft">
          Escríbela como la dirías: <span className="text-ink">«foco casa Lavanda mañana 10am @Chuy»</span>. La app entiende el lugar, el día, la hora y a quién se la asignas.
        </p>
      )}
      <AnimatePresence initial={false}>
        {parsed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.24, ease: ease.calma }} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-1.5 px-1 pt-2.5 pb-0.5">
              <Sparkles size={13} strokeWidth={1.7} className="text-chispa" />
              <span className="mr-1 text-[13px] font-medium">{parsed.title}</span>
              {chips.map((c) =>
                c && 'tone' in c && c.tone ? (
                  <Badge key={c.k} tone={c.tone}>
                    {c.label}
                  </Badge>
                ) : (
                  c && (
                    <span key={c.k} className="inline-flex h-[22px] items-center gap-1 rounded-full bg-sunken px-2 text-[11.5px] font-medium text-ink-soft">
                      {'icon' in c && c.icon}
                      {c.label}
                    </span>
                  )
                ),
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Agrupa la lista por cercanía de la fecha */
function groupByDue(list: Task[]) {
  const t = today()
  const groups: { key: string; label: string; items: Task[] }[] = [
    { key: 'late', label: 'Atrasadas', items: [] },
    { key: 'today', label: 'Hoy', items: [] },
    { key: 'soon', label: 'Próximas', items: [] },
    { key: 'none', label: 'Sin fecha', items: [] },
  ]
  for (const task of list) {
    const d = task.due?.slice(0, 10)
    if (!d) groups[3]!.items.push(task)
    else if (d < t && task.status !== 'hecha') groups[0]!.items.push(task)
    else if (d === t) groups[1]!.items.push(task)
    else groups[2]!.items.push(task)
  }
  return groups.filter((g) => g.items.length)
}

/** ¿Esta persona suele hacer este tipo de tarea? (para sugerirla primero) */
const fitsType = (role: string, type?: string) =>
  type === 'limpieza' ? role === 'limpieza' : type === 'mantenimiento' || type === 'jardin' ? role === 'mantenimiento' : type === 'evento' ? role === 'eventos' : type === 'compra' ? role === 'admin' || role === 'recepcion' : true

export default function Tareas() {
  const tasks = useCollection('tasks')
  const employees = useCollection('employees')
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const isManager = me?.role === 'admin' || me?.role === 'eventos'
  const [view, setView] = useState<'tablero' | 'lista'>(() => (window.innerWidth >= 1024 ? 'tablero' : 'lista'))
  const [scope, setScope] = useState<'mias' | 'todas'>(isManager ? 'todas' : 'mias')
  const [type, setType] = useState<TaskType | 'todas'>('todas')
  const [who, setWho] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const openId = params.get('t') ?? undefined

  const filtered = useMemo(
    () =>
      tasks
        .filter((t) => (scope === 'mias' ? t.assigneeId === me?.id || (!t.assigneeId && (me?.role === 'admin' || fitsType(me?.role ?? '', t.type))) : true))
        .filter((t) => type === 'todas' || t.type === type)
        .filter((t) => !who || t.assigneeId === who)
        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.due ?? '9').localeCompare(b.due ?? '9')),
    [tasks, scope, type, who, me],
  )
  const recent = new Date(Date.now() - 3 * 86400000).toISOString()
  const boardItems = filtered.filter((t) => t.status !== 'verificada' || (t.verifiedAt ?? t.updatedAt) > recent)
  const open = filtered.filter((t) => t.status === 'pendiente' || t.status === 'en-progreso')
  const toVerify = filtered.filter((t) => t.status === 'hecha')
  const doneRecently = filtered.filter((t) => t.status === 'verificada' && (t.verifiedAt ?? t.updatedAt) > recent)
  const openTask = (id: string) => setParams({ t: id })
  const canVerify = isManager

  const row = (t: Task, i: number, hint: boolean) => (
    <motion.div key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, transition: { duration: 0.2, ease: ease.salida } }}>
      <SwipeRow
        hintKey={hint && i === 0 ? 'tareas' : undefined}
        left={NEXT[t.status] && (NEXT[t.status] !== 'verificada' || canVerify) ? { label: NEXT[t.status] === 'en-progreso' ? 'Empezar' : NEXT[t.status] === 'hecha' ? 'Hecha' : 'Verificar', icon: <Check />, tone: 'success', onTrigger: () => advanceTask(t, me?.id) } : undefined}
        right={isManager || t.createdById === me?.id ? { label: 'Eliminar', icon: <Trash2 />, tone: 'danger', remove: true, onTrigger: () => removeWithUndo('tasks', t.id, `La tarea "${t.title}"`) } : undefined}
      >
        <TaskCard t={t} onOpen={() => openTask(t.id)} />
      </SwipeRow>
    </motion.div>
  )

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Tareas"
        subtitle={`${open.length} abiertas · ${toVerify.length} por verificar`}
        primary={{ label: 'Nueva tarea', icon: <Plus size={18} strokeWidth={1.6} />, onClick: () => setNewOpen(true) }}
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'lista', label: 'Lista' },
              { value: 'tablero', label: 'Tablero' },
            ]}
          />
        }
      />

      <QuickAdd />

      <div className="no-scrollbar -mx-4 mb-5 flex items-center gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:px-0">
        <Chip active={scope === 'mias'} onClick={() => setScope('mias')}>
          Mis tareas
        </Chip>
        <Chip active={scope === 'todas'} onClick={() => setScope('todas')}>
          Todo el equipo
        </Chip>
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
        <Chip active={type === 'todas'} onClick={() => setType('todas')}>
          Todos los tipos
        </Chip>
        {(Object.keys(TASK_TYPE) as TaskType[]).map((k) => (
          <Chip key={k} active={type === k} onClick={() => setType(k)} count={tasks.filter((t) => t.type === k && (t.status === 'pendiente' || t.status === 'en-progreso')).length}>
            {TASK_TYPE[k].label}
          </Chip>
        ))}
        {isManager && (
          <>
            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
            {employees
              .filter((e) => e.active)
              .map((e) => (
                <button key={e.id} onClick={() => (haptic.select(), setWho(who === e.id ? '' : e.id))} title={e.name} aria-pressed={who === e.id} className={cx('pressable shrink-0 rounded-full transition-opacity', who && who !== e.id && 'opacity-40')}>
                  <Avatar name={e.name} tone={e.color} size={32} className={who === e.id ? '!outline-2 !outline-primary' : ''} />
                </button>
              ))}
          </>
        )}
      </div>

      {view === 'tablero' ? (
        <>
          <p className="mb-3 hidden text-xs text-ink-3 md:block">Arrastra una tarjeta a otra columna para cambiar su estado.</p>
          <p className="mb-3 text-xs text-ink-3 md:hidden">Mantén presionada una tarjeta y muévela a otra columna.</p>
          <DragBoard
            columns={COLUMNS.map((c) => ({ id: c, title: TASK_STATUS[c].label, tone: TASK_STATUS[c].tone, meta: c === 'verificada' ? '3 días' : undefined }))}
            items={boardItems}
            getId={(t) => t.id}
            getColumn={(t) => t.status}
            canDrop={(_, to) => to !== 'verificada' || canVerify}
            onMove={(_, to, t) => setTaskStatus(t, to, me?.id)}
            emptyText="Suelta aquí"
            renderCard={(t) => <TaskCard t={t} onOpen={() => openTask(t.id)} compact={t.status === 'verificada'} showAction={false} />}
          />
        </>
      ) : (
        <div className="flex flex-col gap-7">
          {open.length === 0 && toVerify.length === 0 && <Empty kind="tareas" title="Sin pendientes" body="No hay tareas abiertas con estos filtros. Buen trabajo." action={<Button size="sm" onClick={() => setNewOpen(true)}>Crear tarea</Button>} />}
          {toVerify.length > 0 && isManager && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <span className="h-2 w-2 rounded-full bg-mint" /> Por verificar
                <span className="text-ink-3">{toVerify.length}</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence initial={false}>{toVerify.map((t, i) => row(t, i, false))}</AnimatePresence>
              </div>
            </section>
          )}
          {groupByDue(open).map((g, gi) => (
            <section key={g.key}>
              <h2 className={cx('mb-3 flex items-center gap-2 text-sm font-medium', g.key === 'late' && 'text-danger')}>
                {g.label}
                <span className="text-ink-3">{g.items.length}</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence initial={false}>{g.items.map((t, i) => row(t, i, gi === 0))}</AnimatePresence>
              </div>
            </section>
          ))}
          {doneRecently.length > 0 && (
            <button onClick={() => setShowDone((v) => !v)} className="pressable inline-flex h-11 items-center gap-2 self-start rounded-full px-4 text-sm text-ink-soft ring-1 ring-line ring-inset hover:bg-wash">
              <Check size={16} strokeWidth={1.6} /> {showDone ? 'Ocultar' : 'Ver'} {doneRecently.length} verificadas en los últimos 3 días
            </button>
          )}
          {showDone && (
            <div className="grid gap-3 opacity-70 md:grid-cols-2 xl:grid-cols-3">
              {doneRecently.map((t) => (
                <TaskCard key={t.id} t={t} onOpen={() => openTask(t.id)} compact />
              ))}
            </div>
          )}
        </div>
      )}

      <TaskSheet open={!!openId} taskId={openId} onClose={() => setParams({})} />
      <TaskSheet open={newOpen} onClose={() => setNewOpen(false)} draft={me?.role === 'limpieza' || me?.role === 'mantenimiento' ? { assigneeId: me.id } : undefined} />
    </div>
  )
}

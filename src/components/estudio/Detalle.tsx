// Lo que acompaña al riel: el detalle de un paso (qué es, cómo se hace y con qué se resuelve),
// la lista de lo que sigue, el plan profesional y agregar un paso nuevo.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarClock, Check, MessageCircle, Phone, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import type { CaminoLane, ISODate, RanchEvent } from '@/lib/types'
import { addStep, applyPlan, LANE_OF, LANES, planSteps, toggleNode, type CaminoNode, type NodeState } from '@/lib/estudio'
import { addDaysISO, capitalize, daysUntil, fmt, fmtDate, mxn, today, waLink } from '@/lib/format'
import { db, useCollection, useDoc } from '@/lib/store'
import { haptic } from '@/lib/motion'
import { rsvpOf } from '@/components/messages/outbox'
import { Avatar, Button, cx, ProgressBar, Sheet, toast } from '@/components/ui'
import { Choices, DateField, TextField } from '@/components/fields'

export function dueText(due: ISODate, state: NodeState) {
  const d = daysUntil(due)
  if (state === 'done') return capitalize(fmt(due, "EEE d 'de' MMM").replace('.', ''))
  if (d === 0) return 'Es hoy'
  if (d === 1) return 'Mañana'
  if (d < 0) return `Venció hace ${-d} ${d === -1 ? 'día' : 'días'}`
  return `${capitalize(fmt(due, "EEE d 'de' MMM").replace('.', ''))} · en ${d} días`
}

export function StateMark({ state, className }: { state: NodeState; className?: string }) {
  if (state === 'done')
    return (
      <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_16%,var(--surface))] text-success', className)}>
        <Check size={12} strokeWidth={2.6} />
      </span>
    )
  return <span className={cx('relative h-2.5 w-2.5 shrink-0 rounded-full', state === 'late' ? 'pulse-dot bg-chispa text-chispa' : state === 'now' ? 'bg-luz shadow-[0_0_0_2px_var(--primary)]' : 'ring-[1.5px] ring-line-strong ring-inset', className)} />
}

/** Proveedores del evento, con su confirmación y su contacto a la mano */
function ProveedoresDelEvento({ ev }: { ev: RanchEvent }) {
  const vendors = useCollection('vendors')
  const assigned = vendors.filter((v) => ev.vendorIds?.includes(v.id))
  const total = ev.providers.length + assigned.length
  if (!total) return <p className="text-sm text-ink-soft">Todavía no hay proveedores en este evento.</p>
  const toggle = (id: string) => {
    haptic.select()
    db.patch('events', ev.id, { providers: ev.providers.map((p) => (p.id === id ? { ...p, confirmed: !p.confirmed } : p)) })
  }
  const msg = (name: string) => `Hola ${name}, te escribimos de Jardines La Joya para confirmar tu participación en ${ev.title}, el ${fmtDate(ev.date)}. ¿Nos confirmas tu hora de llegada?`
  return (
    <ul className="flex flex-col gap-1.5">
      {ev.providers.map((p) => (
        <li key={p.id} className="flex items-center gap-2.5 rounded-[14px] bg-sunken/60 py-1.5 pr-1.5 pl-1.5">
          <button onClick={() => toggle(p.id)} aria-pressed={p.confirmed} aria-label={p.confirmed ? `Quitar confirmación de ${p.name}` : `Confirmar a ${p.name}`} className={cx('pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full', p.confirmed ? 'bg-success text-paper' : 'ring-[1.5px] ring-line-strong ring-inset hover:bg-wash')}>
            {p.confirmed && <Check size={17} strokeWidth={2} />}
          </button>
          <span className="min-w-0 flex-1 leading-snug">
            <span className="block text-[14px] font-medium">{p.name}</span>
            <span className={cx('block text-[12.5px]', p.confirmed ? 'text-detail' : 'text-key')}>{p.confirmed ? p.service || 'Confirmado' : `${p.service ? `${p.service} · ` : ''}sin confirmar`}</span>
          </span>
          {p.phone && (
            <a href={waLink(p.phone, msg(p.name))} target="_blank" rel="noopener" aria-label={`WhatsApp a ${p.name}`} className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary">
              <MessageCircle size={16} strokeWidth={1.6} />
            </a>
          )}
          {p.phone && (
            <a href={`tel:${p.phone}`} aria-label={`Llamar a ${p.name}`} className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-line ring-inset hover:bg-wash">
              <Phone size={16} strokeWidth={1.6} />
            </a>
          )}
        </li>
      ))}
      {assigned.map((v) => (
        <li key={v.id} className="flex items-center gap-2.5 rounded-[14px] bg-sunken/60 py-1.5 pr-1.5 pl-3.5">
          <span className="min-w-0 flex-1 leading-snug">
            <span className="block text-[14px] font-medium">{v.name}</span>
            <span className="block text-[12.5px] text-detail">Del directorio</span>
          </span>
          {v.phone && (
            <a href={waLink(v.phone, msg(v.name))} target="_blank" rel="noopener" aria-label={`WhatsApp a ${v.name}`} className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary">
              <MessageCircle size={16} strokeWidth={1.6} />
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

function InvitadosDelEvento({ ev }: { ev: RanchEvent }) {
  const stats = useMemo(() => {
    let conf = 0
    let pend = 0
    let declined = 0
    for (const g of ev.guestList) {
      const r = rsvpOf(g)
      if (r === 'confirmado') conf += g.count
      else if (r === 'declinado') declined += g.count
      else pend += g.count
    }
    return { conf, pend, declined }
  }, [ev.guestList])
  if (!ev.guestList.length) return <p className="text-sm text-ink-soft">Este evento todavía no tiene lista de invitados.</p>
  const total = stats.conf + stats.pend
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="display-num text-[1.7rem]">{total ? Math.round((stats.conf / total) * 100) : 0}%</span>
        <span className="text-[13px] text-ink-soft">
          {stats.conf} confirmados · <span className={stats.pend ? 'text-key' : undefined}>{stats.pend} por confirmar</span>
        </span>
      </div>
      <ProgressBar value={total ? stats.conf / total : 0} className="mt-2" />
    </div>
  )
}

/** Cambiar la fecha sin arrastrar: lo que se usa en el celular y lo más exacto en la computadora */
function DateControls({ node, onMove }: { node: CaminoNode; onMove: (n: CaminoNode, d: ISODate) => void }) {
  const btn = 'pressable inline-flex h-11 items-center justify-center rounded-full px-3.5 text-[13.5px] font-medium ring-1 ring-line-strong ring-inset hover:bg-wash pointer-fine:h-9'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button className={btn} onClick={() => onMove(node, addDaysISO(node.due, -1))}>
        −1 día
      </button>
      <button className={btn} onClick={() => onMove(node, addDaysISO(node.due, 1))}>
        +1 día
      </button>
      <button className={btn} onClick={() => onMove(node, addDaysISO(node.due, 7))}>
        +1 semana
      </button>
      {node.state === 'late' && (
        <button className={cx(btn, 'text-key')} onClick={() => onMove(node, today())}>
          Para hoy
        </button>
      )}
    </div>
  )
}

/** Todo lo de un paso: cómo se hace y con qué se resuelve */
export function NodeDetail({ node, ev, onClose, onMove, showEvent }: { node: CaminoNode; ev: RanchEvent; onClose?: () => void; onMove: (n: CaminoNode, d: ISODate) => void; showEvent?: boolean }) {
  const navigate = useNavigate()
  const task = useDoc('tasks', node.source.type === 'tarea' ? node.source.id : undefined)
  const who = useDoc('employees', node.assigneeId)
  const lane = LANE_OF[node.lane]
  const Icon = lane.icon
  const done = node.state === 'done'
  const go = node.go
  const showProviders = node.source.type === 'hito' ? node.source.key === 'proveedores' : /proveedor/i.test(node.label)
  const showGuests = node.source.type === 'hito' && (node.source.key === 'confirmaciones' || node.source.key === 'invitaciones' || node.source.key === 'numero')
  const planItem = node.source.type === 'pago' ? (ev.paymentPlan ?? []).find((p) => node.source.type === 'pago' && p.id === node.source.id) : undefined
  const canDelete = node.source.type === 'paso'

  const open = () => {
    if (!go) return
    if (go.to) navigate(go.to)
    else if (go.tab) navigate(`/eventos/${ev.id}?tab=${go.tab}`)
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-sunken text-ink-soft">
          <Icon size={18} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-detail">
            {lane.label}
            {showEvent ? ` · ${ev.title}` : ''}
          </p>
          <h3 className="mt-0.5 text-[1.2rem] leading-snug font-semibold tracking-[-0.02em]">{node.label}</h3>
          <p className={cx('mt-1 flex items-center gap-2 text-[13.5px]', node.state === 'late' ? 'font-medium text-key' : 'text-ink-soft')}>
            <StateMark state={node.state} />
            {done ? `Hecho · ${dueText(node.due, node.state)}` : dueText(node.due, node.state)}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" aria-label="Cerrar detalle" onClick={onClose} className="-mt-1 -mr-1 shrink-0">
            <X size={17} strokeWidth={1.7} />
          </Button>
        )}
      </div>

      {node.how && <p className="mt-3.5 text-[14px] leading-relaxed text-ink-soft">{node.how}</p>}

      {planItem && node.amount !== undefined && (
        <div className="mt-3.5 flex items-baseline justify-between gap-3 rounded-[14px] bg-sunken/60 px-3.5 py-3">
          <span className="text-[13px] text-ink-soft">{done ? 'Pagado' : 'Por cobrar'}</span>
          <span className="display-num text-[1.5rem]">{mxn(node.amount)}</span>
        </div>
      )}

      {task && (
        <div className="mt-3.5 flex items-center gap-2.5 rounded-[14px] bg-sunken/60 px-3.5 py-2.5">
          {who && <Avatar name={who.name} tone={who.color} size={32} />}
          <span className="min-w-0 flex-1 text-[13.5px] leading-snug">
            <span className="block font-medium">{who ? who.name : 'Sin asignar'}</span>
            <span className="block text-[12.5px] text-detail">{task.checklist.length ? `${task.checklist.filter((c) => c.done).length} de ${task.checklist.length} pasos` : 'Tarea del equipo'}</span>
          </span>
        </div>
      )}

      {showProviders && (
        <div className="mt-3.5">
          <ProveedoresDelEvento ev={ev} />
        </div>
      )}
      {showGuests && (
        <div className="mt-3.5 rounded-[14px] bg-sunken/60 p-3.5">
          <InvitadosDelEvento ev={ev} />
        </div>
      )}

      {!done && (
        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] text-detail">
            <CalendarClock size={14} strokeWidth={1.6} /> Mover la fecha
          </p>
          <DateControls node={node} onMove={onMove} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {node.canToggle &&
          (done ? (
            <Button variant="outline" icon={<RotateCcw size={16} strokeWidth={1.7} />} onClick={() => toggleNode(node)}>
              Reabrir
            </Button>
          ) : (
            <Button icon={<Check size={17} strokeWidth={2} />} onClick={() => (toggleNode(node), toast.success('Hecho', node.label))}>
              Marcar como hecho
            </Button>
          ))}
        {node.source.type === 'pago' && !done && ev.phone && (
          <a href={waLink(ev.phone, `Hola ${ev.clientName.split(' ')[0]}, te recordamos con cariño el ${node.label.toLowerCase()} de ${ev.title}${node.amount !== undefined ? ` por ${mxn(node.amount)}` : ''}, con fecha ${fmtDate(node.due)}. Gracias.`)} target="_blank" rel="noopener" className="pressable inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-on-primary pointer-fine:h-10 pointer-fine:px-4 pointer-fine:text-sm">
            <MessageCircle size={16} strokeWidth={1.7} /> Recordar por WhatsApp
          </a>
        )}
        {go && (
          <Button variant={node.canToggle || node.source.type === 'pago' ? 'ghost' : 'primary'} iconRight={<ArrowRight size={15} strokeWidth={1.7} />} onClick={open}>
            {go.label}
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Quitar ${node.label}`}
            className="ml-auto hover:!text-danger"
            onClick={() => {
              const prev = ev.checklist
              db.patch('events', ev.id, { checklist: prev.filter((c) => node.source.type !== 'paso' || c.id !== node.source.id) })
              toast.undo('Paso quitado', () => db.patch('events', ev.id, { checklist: prev }), node.label)
              onClose?.()
            }}
          >
            <Trash2 size={16} strokeWidth={1.6} />
          </Button>
        )}
      </div>
    </div>
  )
}

/** Renglón de la lista de lo que sigue */
export function NodeRow({ node, onOpen, selected, eventTitle }: { node: CaminoNode; onOpen: (n: CaminoNode) => void; selected?: boolean; eventTitle?: string }) {
  const lane = LANE_OF[node.lane]
  const done = node.state === 'done'
  return (
    <div className={cx('flex items-center gap-2 rounded-[14px] py-0.5 pr-1 pl-1 transition-colors duration-[var(--dur-2)]', selected ? 'bg-[color-mix(in_oklab,var(--luz)_32%,var(--surface))]' : 'hover:bg-wash')}>
      {node.canToggle ? (
        <button
          onClick={() => {
            haptic.select()
            toggleNode(node)
            if (!done) toast.success('Hecho', node.label)
          }}
          aria-pressed={done}
          aria-label={done ? `Reabrir ${node.label}` : `Marcar hecho: ${node.label}`}
          className="pressable group/check flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        >
          <span className={cx('flex h-[26px] w-[26px] items-center justify-center rounded-full transition-colors duration-[var(--dur-2)]', done ? 'bg-success text-paper' : 'ring-[1.5px] ring-line-strong ring-inset group-hover/check:bg-wash group-hover/check:ring-ink-soft')}>{done && <Check size={14} strokeWidth={2.4} />}</span>
        </button>
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center">
          <StateMark state={node.state} />
        </span>
      )}
      <button onClick={() => onOpen(node)} className="pressable flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] py-1 pr-2 text-left">
        <span className="min-w-0 flex-1 leading-snug">
          <span className={cx('block text-[14.5px] font-medium', done && 'text-ink-3 line-through')}>
            {node.label}
            {node.amount !== undefined && <span className="font-normal text-ink-soft tabular"> · {mxn(node.amount)}</span>}
          </span>
          <span className={cx('block text-[12.5px]', node.state === 'late' ? 'font-medium text-key' : 'text-detail')}>
            {dueText(node.due, node.state)} · {eventTitle ?? lane.short}
          </span>
        </span>
        <ArrowRight size={15} strokeWidth={1.7} className="shrink-0 text-ink-3" />
      </button>
    </div>
  )
}

/** El plan de una planner profesional para este tipo de evento: se elige qué entra y cae solo en sus fechas */
export function PlanSheet({ ev, open, onClose, onApplied }: { ev: RanchEvent; open: boolean; onClose: () => void; onApplied: (ids: string[]) => void }) {
  const steps = useMemo(() => (open ? planSteps(ev) : []), [ev, open])
  const [on, setOn] = useState<Record<string, boolean>>({})
  const [showPassed, setShowPassed] = useState(false)
  useEffect(() => {
    if (open) {
      setOn(Object.fromEntries(steps.map((s) => [s.text, !s.passed])))
      setShowPassed(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const chosen = steps.filter((s) => on[s.text])
  const passed = steps.filter((s) => s.passed).length
  // Solo lo que todavía se puede hacer; lo que ya pasó queda a un toque
  const visible = showPassed ? steps : steps.filter((s) => !s.passed || on[s.text])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title="Plan profesional"
      subtitle={`Calculado hacia atrás desde el ${fmtDate(ev.date)}. Quita lo que no aplique.`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!chosen.length}
            icon={<Sparkles size={16} strokeWidth={1.7} />}
            onClick={() => {
              const before = new Set(ev.checklist.map((c) => c.id))
              applyPlan(ev, chosen)
              const fresh = db.get('events', ev.id)
              onApplied((fresh?.checklist ?? []).filter((c) => !before.has(c.id)).map((c) => `${ev.id}:c:${c.id}`))
              toast.success(`${chosen.length} pasos en el camino`, 'También los ves en Pendientes')
              onClose()
            }}
          >
            Agregar {chosen.length} {chosen.length === 1 ? 'paso' : 'pasos'}
          </Button>
        </div>
      }
    >
      {steps.length === 0 && <p className="py-6 text-center text-ink-soft">Este evento ya tiene todos los pasos del plan.</p>}
      <div className="grid gap-5 @xl:grid-cols-2">
        {LANES.map((l) => {
          const list = visible.filter((s) => s.lane === l.key)
          if (!list.length) return null
          const Icon = l.icon
          return (
            <section key={l.key}>
              <h4 className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold">
                <Icon size={16} strokeWidth={1.6} className="text-ink-soft" /> {l.label}
              </h4>
              <ul className="flex flex-col">
                {list.map((s) => (
                  <li key={s.text}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] px-1.5 py-1 hover:bg-wash">
                      <input type="checkbox" checked={!!on[s.text]} onChange={(e) => setOn((o) => ({ ...o, [s.text]: e.target.checked }))} className="h-[18px] w-[18px] shrink-0 accent-[var(--primary)]" />
                      <span className="min-w-0 flex-1 text-[14px] leading-snug">
                        <span className={cx(!on[s.text] && 'text-ink-3')}>{s.text}</span>
                        <span className={cx('block text-[12.5px]', s.passed ? 'text-ink-3' : 'text-detail')}>{s.passed ? `Ya pasó · ${fmtDate(s.due)}` : fmtDate(s.due)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      {passed > 0 && (
        <button onClick={() => setShowPassed((v) => !v)} className="pressable mt-4 min-h-11 w-full rounded-full text-sm font-medium hover:bg-wash">
          {showPassed ? 'Ocultar lo que ya pasó' : `Ver ${passed} que ya pasaron`}
        </button>
      )}
    </Sheet>
  )
}

/** Un paso nuevo con fecha y carril */
export function AddStepSheet({ ev, open, onClose, initial, onAdded }: { ev: RanchEvent; open: boolean; onClose: () => void; initial?: { lane?: CaminoLane; date?: ISODate }; onAdded?: (id: string) => void }) {
  const [text, setText] = useState('')
  const [lane, setLane] = useState<CaminoLane>('dia')
  const [date, setDate] = useState<ISODate>(today())
  const key = open ? 'o' : 'c'
  const [last, setLast] = useState(key)
  if (last !== key) {
    setLast(key)
    if (open) {
      setText('')
      setLane(initial?.lane ?? 'dia')
      setDate(initial?.date ?? addDaysISO(today(), 3))
    }
  }
  const save = () => {
    if (!text.trim()) return toast.error('Falta el nombre', 'Escribe qué hay que hacer.')
    const before = new Set(ev.checklist.map((c) => c.id))
    addStep(ev, text.trim(), lane, date)
    const fresh = db.get('events', ev.id)
    const added = fresh?.checklist.find((c) => !before.has(c.id))
    if (added) onAdded?.(`${ev.id}:c:${added.id}`)
    toast.success('Paso agregado', text.trim())
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="center"
      title="Agregar un paso"
      subtitle="Aparece en el camino y en Pendientes"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={<Check size={17} strokeWidth={2} />} onClick={save}>
            Agregar paso
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="¿Qué hay que hacer?" value={text} onChange={setText} autoFocus />
        <Choices label="¿De qué se trata?" value={lane} onChange={setLane} options={LANES.map((l) => ({ value: l.key, label: l.short }))} />
        <DateField label="¿Para cuándo?" value={date} onChange={setDate} />
      </div>
    </Sheet>
  )
}


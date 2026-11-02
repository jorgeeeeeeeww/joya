// Horario semanal del equipo: una fila por persona y siete días. Cada turno es un bloque que se
// arrastra para moverlo (también a otro día), se estira de los bordes para cambiar el horario
// y se crea arrastrando sobre un día vacío. Pasos de 30 minutos. Clic derecho o mantener presionado: eliminar.
import { useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Employee, Shift } from '@/lib/types'
import { TONE } from '@/lib/meta'
import { haptic } from '@/lib/motion'
import { withUndo } from '@/lib/undo'
import { db } from '@/lib/store'
import { Avatar, cx } from '@/components/ui'
import { useContextMenu } from '@/components/interact'

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const START = 6 * 60 // 6:00
const SPAN = 18 * 60 // hasta las 24:00
const NAME_W = 132
const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}
const toHHMM = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const jsDay = (col: number) => (col + 1) % 7 // columna 0 = lunes
const colOf = (day: number) => (day + 6) % 7
const hours = (s: Shift) => Math.max(0, toMin(s.end === '00:00' ? '24:00' : s.end) - toMin(s.start)) / 60

type Mode = 'create' | 'move' | 'start' | 'end'
interface Drag {
  empId: string
  mode: Mode
  pointerId: number
  touch: boolean
  active: boolean
  x0: number
  y0: number
  orig?: Shift
  draft: Shift
  timer?: number
}

export function ShiftGrid({ employees, editable }: { employees: Employee[]; editable: boolean }) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const rows = useRef<Record<string, HTMLDivElement | null>>({})
  const ctx = useContextMenu()
  const todayCol = colOf(new Date().getDay())
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()

  const update = (d: Drag | null) => {
    dragRef.current = d
    setDrag(d)
  }
  const at = (empId: string, clientX: number) => {
    const el = rows.current[empId]
    if (!el) return { col: 0, min: START }
    const r = el.getBoundingClientRect()
    const cellW = r.width / 7
    const rel = Math.min(r.width - 1, Math.max(0, clientX - r.left))
    const col = Math.floor(rel / cellW)
    const min = START + Math.round((((rel - col * cellW) / cellW) * SPAN) / 30) * 30
    return { col, min: Math.min(START + SPAN, Math.max(START, min)) }
  }
  const save = (emp: Employee, next: Shift[], msg: string) => {
    const prev = emp.shifts ?? []
    db.patch('employees', emp.id, { shifts: next.sort((a, b) => a.day - b.day) })
    withUndo(msg, () => db.patch('employees', emp.id, { shifts: prev }), emp.name)
  }

  const live = useRef({ move: (_e: PointerEvent) => {}, up: (_e: PointerEvent) => {} })
  const [stable] = useState(() => ({ move: (e: PointerEvent) => live.current.move(e), up: (e: PointerEvent) => live.current.up(e) }))
  const stop = () => {
    clearTimeout(dragRef.current?.timer)
    window.removeEventListener('pointermove', stable.move)
    window.removeEventListener('pointerup', stable.up)
    window.removeEventListener('pointercancel', stable.up)
    update(null)
  }
  const compute = (d: Drag, clientX: number): Shift => {
    const p = at(d.empId, clientX)
    if (d.mode === 'create') {
      const a = at(d.empId, d.x0)
      const s = Math.min(a.min, p.min)
      const e = Math.max(a.min, p.min)
      return { day: jsDay(a.col), start: toHHMM(s), end: toHHMM(Math.max(e, s + 60)) }
    }
    const o = d.orig!
    const len = toMin(o.end === '00:00' ? '24:00' : o.end) - toMin(o.start)
    const a0 = at(d.empId, d.x0)
    if (d.mode === 'move') {
      const delta = p.min - a0.min
      const s = Math.min(START + SPAN - len, Math.max(START, toMin(o.start) + delta))
      return { day: jsDay(p.col), start: toHHMM(s), end: toHHMM(s + len) }
    }
    if (d.mode === 'start') return { ...o, start: toHHMM(Math.min(toMin(o.end === '00:00' ? '24:00' : o.end) - 60, p.min)) }
    return { ...o, end: toHHMM(Math.max(toMin(o.start) + 60, p.min)) }
  }
  live.current.move = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    if (!d.active) {
      const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
      if (d.touch) return dist > 9 ? stop() : undefined
      if (dist < 5) return
    }
    const draft = compute(d, e.clientX)
    if (draft.day !== d.draft.day || draft.start !== d.draft.start || draft.end !== d.draft.end) haptic.select()
    update({ ...d, active: true, draft })
  }
  const menuFor = (emp: Employee, s: Shift) => [{ label: 'Eliminar turno', icon: <Trash2 />, danger: true, onClick: () => save(emp, (emp.shifts ?? []).filter((x) => x !== s), 'Turno eliminado') }]
  const titleFor = (s: Shift) => `${DAYS[colOf(s.day)]} ${s.start}–${s.end}`
  live.current.up = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const emp = employees.find((x) => x.id === d.empId)
    // Un toque sin arrastrar sobre un turno abre sus acciones
    if (!d.active && d.mode === 'move' && d.orig && emp) ctx.open(menuFor(emp, d.orig), { x: e.clientX, y: e.clientY }, titleFor(d.orig))
    if (d.active && emp) {
      const list = (emp.shifts ?? []).filter((s) => s !== d.orig && !(d.orig && s.day === d.orig.day && s.start === d.orig.start))
      const clash = list.some((s) => s.day === d.draft.day)
      const next = [...list.filter((s) => s.day !== d.draft.day), d.draft]
      save(emp, next, d.mode === 'create' ? (clash ? 'Turno reemplazado' : 'Turno agregado') : 'Turno cambiado')
    }
    stop()
  }

  const begin = (e: React.PointerEvent, emp: Employee, mode: Mode, orig?: Shift) => {
    if (!editable || e.button !== 0 || dragRef.current) return
    e.stopPropagation()
    const touch = e.pointerType !== 'mouse'
    const d: Drag = { empId: emp.id, mode, pointerId: e.pointerId, touch, active: false, x0: e.clientX, y0: e.clientY, orig, draft: orig ?? { day: jsDay(at(emp.id, e.clientX).col), start: '08:00', end: '16:00' } }
    if (touch)
      d.timer = window.setTimeout(() => {
        const cur = dragRef.current
        if (cur && !cur.active) {
          haptic.light()
          update({ ...cur, active: true, draft: compute(cur, cur.x0) })
        }
      }, 300)
    update(d)
    window.addEventListener('pointermove', stable.move)
    window.addEventListener('pointerup', stable.up)
    window.addEventListener('pointercancel', stable.up)
  }

  const block = (s: Shift, ghost?: boolean, conflict?: boolean) => {
    const left = (colOf(s.day) / 7) * 100
    const a = Math.max(0, toMin(s.start) - START) / SPAN
    const b = Math.min(1, (toMin(s.end === '00:00' ? '24:00' : s.end) - START) / SPAN)
    return { left: `calc(${left}% + ${(a * 100) / 7}% + 2px)`, width: `calc(${((b - a) * 100) / 7}% - 4px)`, ghost, conflict }
  }
  const totals = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, (e.shifts ?? []).reduce((n, s) => n + hours(s), 0)])), [employees])

  return (
    <div className="card overflow-hidden">
      <div className="scroll-area overflow-x-auto">
        <div style={{ minWidth: NAME_W + 7 * 72 + 56 }}>
          <div className="flex border-b border-line">
            <div className="kicker flex shrink-0 items-end px-4 pb-2.5" style={{ width: NAME_W }}>
              Persona
            </div>
            <div className="grid flex-1 grid-cols-7">
              {DAYS.map((d, i) => (
                <div key={d} className={cx('py-2.5 text-center text-[12px] font-semibold', i === todayCol ? 'text-primary' : 'text-ink-soft')}>
                  {d}
                  {i === todayCol && <span className="ml-1 text-[10px] font-normal">· hoy</span>}
                </div>
              ))}
            </div>
            <div className="kicker flex w-14 shrink-0 items-end justify-center pb-2.5">Hrs</div>
          </div>
          {employees.map((emp) => {
            const shifts = emp.shifts ?? []
            const working = shifts.some((s) => s.day === new Date().getDay() && toMin(s.start) <= nowMin && nowMin < toMin(s.end === '00:00' ? '24:00' : s.end))
            const isDragRow = drag?.active && drag.empId === emp.id
            return (
              <div key={emp.id} className="flex border-b border-line last:border-b-0">
                <div className="flex shrink-0 items-center gap-2.5 px-4 py-3" style={{ width: NAME_W }}>
                  <span className="relative">
                    <Avatar name={emp.name} tone={emp.color} size={30} />
                    {working && <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" title="Trabajando ahora" />}
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-medium">{emp.name.split(' ')[0]}</span>
                </div>
                <div
                  ref={(el) => {
                    rows.current[emp.id] = el
                  }}
                  onPointerDown={(e) => begin(e, emp, 'create')}
                  className={cx('no-callout relative flex-1 touch-manipulation', editable && 'cursor-crosshair')}
                  style={{ height: 56 }}
                >
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-7">
                    {DAYS.map((d, i) => (
                      <div key={d} className={cx('border-l border-line first:border-l-0', i === todayCol && 'bg-[color-mix(in_oklab,var(--luz)_12%,transparent)]', i >= 5 && 'bg-sunken/50')} />
                    ))}
                  </div>
                  {shifts.map((s) => {
                    const g = block(s)
                    const dragged = isDragRow && drag?.orig === s
                    return (
                      <div
                        key={`${s.day}-${s.start}`}
                        onContextMenu={(e) => {
                          if (!editable) return
                          e.preventDefault()
                          ctx.open(menuFor(emp, s), { x: e.clientX, y: e.clientY }, titleFor(s))
                        }}
                        onPointerDown={(e) => begin(e, emp, 'move', s)}
                        className={cx('group/s no-callout absolute top-2 bottom-2 flex touch-manipulation items-center justify-center overflow-hidden rounded-[10px] text-[11px] font-semibold tabular whitespace-nowrap', TONE[emp.color].soft, TONE[emp.color].ink, 'ring-1 ring-inset', TONE[emp.color].ring, editable && 'cursor-grab active:cursor-grabbing', dragged && 'opacity-30')}
                        style={{ left: g.left, width: g.width }}
                        title={`${s.start}–${s.end}`}
                      >
                        <span className="px-1.5">{s.start.replace(':00', '')}–{s.end.replace(':00', '')}</span>
                        {editable && (
                          <>
                            <span onPointerDown={(e) => begin(e, emp, 'start', s)} className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize" />
                            <span onPointerDown={(e) => begin(e, emp, 'end', s)} className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize" />
                          </>
                        )}
                      </div>
                    )
                  })}
                  {isDragRow && drag && (
                    <div className="pointer-events-none absolute top-1.5 bottom-1.5 z-10 flex items-center justify-center rounded-[10px] bg-surface text-[11px] font-semibold whitespace-nowrap text-ink shadow-[0_0_20px_color-mix(in_oklab,var(--luz)_55%,transparent)] ring-2 ring-primary tabular" style={{ left: block(drag.draft).left, width: block(drag.draft).width }}>
                      {drag.draft.start}–{drag.draft.end}
                    </div>
                  )}
                </div>
                <div className="flex w-14 shrink-0 items-center justify-center text-[13px] font-semibold tabular">{totals[emp.id]?.toFixed(totals[emp.id]! % 1 ? 1 : 0)}</div>
              </div>
            )
          })}
        </div>
      </div>
      {editable && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Arrastra sobre un día para crear un turno · mueve o estira un bloque para cambiarlo · toca un turno para eliminarlo</p>}
      {ctx.node}
    </div>
  )
}

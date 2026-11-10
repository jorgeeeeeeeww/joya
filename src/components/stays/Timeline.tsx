// Calendario multi-unidad (step1): barras pill por canal, fines de semana en sunken,
// línea de hoy con punto de luz. Se maneja directo:
// - arrastrar sobre días libres dibuja una estancia nueva (noches y precio en vivo);
// - arrastrar una barra la mueve de fechas o de unidad; estirar sus bordes cambia llegada o salida;
// - con el dedo, mantener presionado un momento para empezar (así no pelea con el desplazamiento).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { ID, Reservation, Unit } from '@/lib/types'
import { RES_SOURCE, TONE, UNIT_STATUS } from '@/lib/meta'
import { addDaysISO, fmt, mxn, nights, today } from '@/lib/format'
import { ease, haptic } from '@/lib/motion'
import { cx } from '@/components/ui'
import { suggestedTotal } from './ReservationSheet'

const ROW_H = 64
const NAME_W = 156
const HEAD_H = 60

/** Sin puntos suspensivos: si no cabe el nombre completo va el principal, y si tampoco, las iniciales */
function barLabel(name: string, room: number) {
  const fits = (t: string) => t.length * 6.3 <= room
  if (fits(name)) return name
  const [first = '', second = ''] = name.split(' ')
  const main = /^familia$/i.test(first) && second ? second : first
  if (fits(main)) return main
  return (first[0] ?? '') + (second[0] ?? '')
}

type Kind = 'create' | 'move' | 'start' | 'end'
interface DragState {
  kind: Kind
  id?: ID
  pointerId: number
  touch: boolean
  x0: number
  y0: number
  unit0: number
  day0: number
  unitNow: number
  dayNow: number
  active: boolean
  timer?: number
}

export function Timeline({ units, reservations, start, days, onCell, onBar, onCreate, onMove, money = true }: { units: Unit[]; reservations: Reservation[]; start: string; days: number; onCell: (unitId: ID, date: string) => void; onBar: (id: ID) => void; onCreate?: (unitId: ID, checkIn: string, checkOut: string) => void; onMove?: (id: ID, patch: Pick<Reservation, 'unitId' | 'checkIn' | 'checkOut'>) => void; money?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  // Las columnas se estiran para llenar la tarjeta: en pantallas anchas no queda un hueco a la derecha
  const [boxW, setBoxW] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setBoxW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const colW = Math.max(days <= 14 ? 60 : 42, boxW ? (boxW - NAME_W) / days : 0)
  const end = addDaysISO(start, days)
  const t = today()
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDaysISO(start, i)), [start, days])
  const todayIdx = differenceInCalendarDays(parseISO(t), parseISO(start))
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (el && todayIdx > 2) el.scrollLeft = (todayIdx - 1) * colW
  }, [start, colW, todayIdx])

  const visible = reservations.filter((r) => r.status !== 'cancelada' && r.checkIn < end && r.checkOut > start)
  const isWeekend = (d: string) => {
    const dow = parseISO(d).getDay()
    return dow === 5 || dow === 6
  }
  const dayIndex = (iso: string) => differenceInCalendarDays(parseISO(iso), parseISO(start))
  const locked = (r: Reservation) => !!r.externalUid || r.status === 'cancelada' || r.status === 'finalizada'

  // ── Lo que se está dibujando (estancia nueva o reserva movida) ──
  const draft = useMemo(() => {
    if (!drag?.active) return null
    const unit = units[Math.min(units.length - 1, Math.max(0, drag.kind === 'move' ? drag.unitNow : drag.unit0))]
    if (!unit) return null
    let checkIn: string
    let checkOut: string
    if (drag.kind === 'create') {
      const a = Math.min(drag.day0, drag.dayNow)
      const b = Math.max(drag.day0, drag.dayNow)
      checkIn = addDaysISO(start, a)
      checkOut = addDaysISO(start, b + 1)
    } else {
      const r = reservations.find((x) => x.id === drag.id)
      if (!r) return null
      const delta = drag.dayNow - drag.day0
      if (drag.kind === 'move') {
        checkIn = addDaysISO(r.checkIn, delta)
        checkOut = addDaysISO(r.checkOut, delta)
      } else if (drag.kind === 'start') {
        checkIn = addDaysISO(r.checkIn, delta)
        checkOut = r.checkOut
        if (checkIn >= checkOut) checkIn = addDaysISO(checkOut, -1)
      } else {
        checkIn = r.checkIn
        checkOut = addDaysISO(r.checkOut, delta)
        if (checkOut <= checkIn) checkOut = addDaysISO(checkIn, 1)
      }
    }
    const conflict = reservations.find((r) => r.id !== drag.id && r.unitId === unit.id && r.status !== 'cancelada' && r.checkIn < checkOut && r.checkOut > checkIn)
    return { unit, unitIdx: units.indexOf(unit), checkIn, checkOut, n: nights(checkIn, checkOut), price: suggestedTotal(unit.id, checkIn, checkOut), conflict, overCapacity: drag.kind === 'move' && (reservations.find((x) => x.id === drag.id)?.guests ?? 0) > unit.capacity }
  }, [drag, units, reservations, start])
  const draftRef = useRef(draft)
  draftRef.current = draft

  // ── Puntero ──
  const at = (x: number, y: number) => {
    const r = gridRef.current!.getBoundingClientRect()
    return { day: Math.floor((x - r.left - NAME_W) / colW), unit: Math.floor((y - r.top - HEAD_H) / ROW_H) }
  }
  const update = (d: DragState | null) => {
    dragRef.current = d
    setDrag(d)
  }
  const activate = () => {
    const d = dragRef.current
    if (!d || d.active) return
    haptic.light()
    update({ ...d, active: true })
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
  live.current.move = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
    if (!d.active) {
      if (d.touch) {
        if (dist > 9) stop() // está desplazando el calendario
        return
      }
      if (dist < 6) return
      activate()
    }
    // Desplazamiento automático cerca de las orillas
    const sc = scrollRef.current
    if (sc) {
      const r = sc.getBoundingClientRect()
      if (e.clientX < r.left + NAME_W + 30) sc.scrollLeft -= 14
      else if (e.clientX > r.right - 36) sc.scrollLeft += 14
    }
    const p = at(e.clientX, e.clientY)
    const cur = dragRef.current!
    const day = Math.max(cur.kind === 'create' ? 0 : -60, Math.min(cur.kind === 'create' ? days - 1 : days + 60, p.day))
    const unit = Math.max(0, Math.min(units.length - 1, p.unit))
    if (day !== cur.dayNow || unit !== cur.unitNow) {
      haptic.select()
      update({ ...cur, dayNow: day, unitNow: unit })
    }
  }
  live.current.up = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const dr = draftRef.current
    if (d.active && dr) {
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 80)
      if (d.kind === 'create') {
        if (dr.conflict) {
          haptic.warning()
        } else onCreate?.(dr.unit.id, dr.checkIn, dr.checkOut)
      } else if (d.id) {
        const r = reservations.find((x) => x.id === d.id)
        const changed = r && (r.unitId !== dr.unit.id || r.checkIn !== dr.checkIn || r.checkOut !== dr.checkOut)
        if (changed && !dr.conflict) onMove?.(d.id, { unitId: dr.unit.id, checkIn: dr.checkIn, checkOut: dr.checkOut })
        else if (changed) haptic.warning()
      }
    }
    stop()
  }
  useEffect(() => () => stop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Chrome en Android: el escucha no pasivo debe existir antes del gesto; solo bloquea mientras se arrastra
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const h = (e: TouchEvent) => {
      if (dragRef.current?.active && e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchmove', h, { passive: false })
    return () => el.removeEventListener('touchmove', h)
  }, [])

  const begin = (e: React.PointerEvent, kind: Kind, unitIdx: number, id?: ID) => {
    if (e.button !== 0 || dragRef.current) return
    if (kind === 'create' ? !onCreate : !onMove) return
    e.stopPropagation()
    const p = at(e.clientX, e.clientY)
    const touch = e.pointerType !== 'mouse'
    const d: DragState = { kind, id, pointerId: e.pointerId, touch, x0: e.clientX, y0: e.clientY, unit0: unitIdx, day0: p.day, unitNow: unitIdx, dayNow: p.day, active: false }
    if (touch) d.timer = window.setTimeout(activate, 300)
    update(d)
    window.addEventListener('pointermove', stable.move)
    window.addEventListener('pointerup', stable.up)
    window.addEventListener('pointercancel', stable.up)
  }

  // Una estancia que empezó antes de lo que se ve arranca en la orilla, con su nombre a la vista
  const barGeom = (checkIn: string, checkOut: string) => {
    const from = dayIndex(checkIn) + 0.5
    const to = dayIndex(checkOut) + 0.5
    const cutL = from < 0
    const cutR = to > days
    const a = Math.max(0, from)
    const b = Math.min(days, to)
    return { left: NAME_W + a * colW + (cutL ? 0 : 3), width: Math.max(colW * 0.7, (b - a) * colW - (cutL ? 0 : 3) - (cutR ? 0 : 3)), cutL, cutR }
  }

  return (
    <div className="card overflow-hidden">
      <div ref={scrollRef} className="scroll-area relative overflow-x-auto">
        <div ref={gridRef} style={{ width: NAME_W + colW * days }} className={cx('relative', drag?.active && 'select-none')}>
          {/* Fines de semana (columnas completas en sunken) */}
          {dates.map((d, i) => (isWeekend(d) ? <div key={`w${d}`} aria-hidden className="pointer-events-none absolute top-0 bottom-0 bg-sunken/70" style={{ left: NAME_W + i * colW, width: colW }} /> : null))}

          {/* Encabezado de días */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] backdrop-blur-sm">
            <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-line bg-surface px-5 pb-3" style={{ width: NAME_W, height: HEAD_H }}>
              <span className="eyebrow">Unidad</span>
            </div>
            {dates.map((d) => {
              const isToday = d === t
              const inDraft = draft && d >= draft.checkIn && d < draft.checkOut
              return (
                <div key={d} className="relative flex shrink-0 flex-col items-center justify-center text-center" style={{ width: colW, height: HEAD_H }}>
                  <span className="text-[10px] text-detail uppercase">{fmt(d, 'EEEEE')}</span>
                  <span className={cx('mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular transition-colors duration-[var(--dur-1)]', isToday ? 'bg-ink text-paper shadow-[0_0_14px_color-mix(in_oklab,var(--luz)_70%,transparent)]' : inDraft ? 'bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] font-semibold text-primary' : d < t ? 'text-ink-3' : 'text-ink')}>{fmt(d, 'd')}</span>
                </div>
              )
            })}
          </div>

          {/* Filas */}
          {units.map((u, ui) => (
            <div key={u.id} className={cx('relative flex border-b border-line transition-colors duration-[var(--dur-2)] last:border-b-0', draft?.unitIdx === ui && drag?.kind === 'move' && 'bg-[color-mix(in_oklab,var(--luz)_10%,transparent)]')} style={{ height: ROW_H }}>
              <div className="sticky left-0 z-10 flex shrink-0 items-center gap-3 border-r border-line bg-surface px-5" style={{ width: NAME_W }}>
                <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', TONE[UNIT_STATUS[u.status].tone].solid)} title={UNIT_STATUS[u.status].label} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[15px] font-medium">{u.name.replace('Cabaña ', '').replace('Casa ', '')}</span>
                  <span className="block text-[11px] text-detail">
                    {u.kind === 'cabana' ? 'Cabaña' : 'Casa'} · {u.capacity} pers.
                  </span>
                </span>
              </div>
              {dates.map((d) => (
                <button
                  key={d}
                  aria-label={`Nueva reserva ${u.name} ${d}`}
                  onPointerDown={(e) => begin(e, 'create', ui)}
                  onClick={() => !suppressClick.current && onCell(u.id, d)}
                  className={cx('no-callout relative shrink-0 touch-manipulation border-r border-[color-mix(in_oklab,var(--ink)_6%,transparent)] transition-colors duration-[var(--dur-2)] hover:bg-wash', d < t && 'bg-[color-mix(in_oklab,var(--sunken)_40%,transparent)]')}
                  style={{ width: colW, height: ROW_H }}
                />
              ))}
              {/* Barras de reservas */}
              {visible
                .filter((r) => r.unitId === u.id)
                .map((r) => {
                  const g = barGeom(r.checkIn, r.checkOut)
                  const tone = RES_SOURCE[r.source].tone
                  const block = r.guests === 0 && r.externalUid
                  const inHouse = r.status === 'en-casa'
                  const movable = !locked(r) && !!onMove
                  const isDragged = drag?.active && drag.id === r.id
                  const narrow = g.width < 76
                  const room = g.width - (narrow ? 14 : 38)
                  const label = barLabel(block ? 'Bloqueado' : r.guestName, room)
                  const showTag = inHouse && room - label.length * 6.3 >= 50
                  return (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: isDragged ? 0.3 : 1, x: 0, transition: { duration: 0.36, ease: ease.calma } }}
                      className={cx('group/bar absolute top-1/2 z-[5] h-9 -translate-y-1/2 rounded-full shadow-[var(--shadow-1)] hover:shadow-[var(--shadow-2)]', g.cutL && 'rounded-l-[6px]', g.cutR && 'rounded-r-[6px]', block ? 'bg-sunken text-ink-soft [background-image:repeating-linear-gradient(135deg,transparent_0_6px,var(--line)_6px_8px)]' : [TONE[tone].soft, TONE[tone].ink], inHouse && 'ring-[1.5px] ring-primary')}
                      style={{ left: g.left, width: g.width }}
                    >
                      <button
                        onPointerDown={(e) => movable && begin(e, 'move', ui, r.id)}
                        onClick={() => !suppressClick.current && onBar(r.id)}
                        className={cx('no-callout flex h-full w-full touch-manipulation items-center gap-2 overflow-hidden rounded-[inherit] text-left text-xs font-medium', narrow ? 'justify-center px-1.5' : 'px-3', movable && 'cursor-grab active:cursor-grabbing')}
                        title={`${r.guestName} · ${r.checkIn} → ${r.checkOut}${movable ? ' · arrastra para mover' : ''}`}
                      >
                        {!narrow && <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', block ? 'bg-ink-faint' : TONE[tone].solid)} />}
                        <span className="whitespace-nowrap">{label}</span>
                        {showTag && <span className="ml-auto shrink-0 text-[10px] opacity-75">en casa</span>}
                      </button>
                      {movable && (
                        <>
                          <span aria-hidden onPointerDown={(e) => begin(e, 'start', ui, r.id)} className="no-callout absolute inset-y-0 left-0 w-3 cursor-ew-resize touch-manipulation rounded-l-full after:absolute after:top-1/2 after:left-1 after:h-3.5 after:w-[3px] after:-translate-y-1/2 after:rounded-full after:bg-current after:opacity-0 after:transition-opacity group-hover/bar:after:opacity-40" />
                          <span aria-hidden onPointerDown={(e) => begin(e, 'end', ui, r.id)} className="no-callout absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-manipulation rounded-r-full after:absolute after:top-1/2 after:right-1 after:h-3.5 after:w-[3px] after:-translate-y-1/2 after:rounded-full after:bg-current after:opacity-0 after:transition-opacity group-hover/bar:after:opacity-40" />
                        </>
                      )}
                    </motion.div>
                  )
                })}
              {/* Estancia que se está dibujando o moviendo */}
              {draft && draft.unitIdx === ui && (
                <div
                  aria-live="polite"
                  className={cx('pointer-events-none absolute top-1/2 z-[7] flex h-10 -translate-y-1/2 items-center gap-2 overflow-hidden rounded-full px-3 text-xs font-semibold whitespace-nowrap shadow-[var(--shadow-3)] ring-2', draft.conflict ? 'bg-[color-mix(in_oklab,var(--danger)_14%,var(--surface))] text-danger ring-danger' : 'bg-surface text-ink ring-primary shadow-[0_0_24px_color-mix(in_oklab,var(--luz)_55%,transparent)]')}
                  style={{ left: barGeom(draft.checkIn, draft.checkOut).left, width: barGeom(draft.checkIn, draft.checkOut).width }}
                >
                  <span className="truncate keep-truncate">
                    {draft.conflict ? `Choca con ${draft.conflict.guestName.split(' ')[0]}` : `${draft.n} ${draft.n === 1 ? 'noche' : 'noches'}`}
                    {!draft.conflict && money && ` · ${mxn(draft.price)}`}
                    {!draft.conflict && draft.overCapacity && ' · excede capacidad'}
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Línea de hoy con punto de luz */}
          {todayIdx >= 0 && todayIdx < days && (
            <div className="pointer-events-none absolute bottom-0 z-[6] w-px bg-chispa-soft" style={{ top: HEAD_H, left: NAME_W + todayIdx * colW + colW / 2 }}>
              <span className="absolute -top-[3px] -left-[3px] h-[7px] w-[7px] rounded-full bg-chispa-soft shadow-[0_0_10px_2px_var(--luz)]" />
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-5 py-3 text-xs text-detail">
        {Object.entries(RES_SOURCE).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cx('h-2.5 w-2.5 rounded-full', TONE[v.tone].solid)} /> {v.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full ring-[1.5px] ring-primary" /> En casa
        </span>
        <span className="ml-auto hidden md:inline">Arrastra sobre días libres para reservar · mueve o estira una reserva para cambiarla</span>
        <span className="ml-auto md:hidden">Mantén presionado y arrastra para reservar o mover</span>
      </div>
    </div>
  )
}

// El riel: línea de tiempo por carriles. Cada paso se arrastra a otra fecha (con el dedo: se mantiene presionado).
// Lo atrasado que ya quedó fuera de la vista se junta en la columna «Atrasado»: de ahí se saca a una fecha real.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import type { ISODate } from '@/lib/types'
import { addDaysISO, capitalize, compactMxn, fmt } from '@/lib/format'
import { haptic } from '@/lib/motion'
import type { CaminoNode, NodeState } from '@/lib/estudio'
import { cx, useMedia } from '@/components/ui'

export interface RielRow {
  key: string
  title: ReactNode
  nodes: CaminoNode[]
  /** Fecha del evento de esta fila (vista de temporada): se marca al final de su camino */
  endDate?: ISODate
  dim?: boolean
  strong?: boolean
}

export interface RielGeom {
  xOf: (date: ISODate) => number
  px: number
  trackW: number
}

const diff = (a: ISODate, b: ISODate) => differenceInCalendarDays(parseISO(a), parseISO(b))

// Medir con la letra real: las píldoras nunca se enciman ni cortan su texto
let ctx: CanvasRenderingContext2D | null | undefined
const widthCache = new Map<string, number>()
function textWidth(text: string, weight = 500) {
  const key = `${weight}|${text}`
  const hit = widthCache.get(key)
  if (hit !== undefined) return hit
  if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d')
  let w = text.length * 6.7
  if (ctx) {
    ctx.font = `${weight} 12.5px "Geist Variable", Geist, ui-sans-serif, system-ui, sans-serif`
    w = ctx.measureText(text).width
  }
  widthCache.set(key, w)
  return w
}

const STATE_TEXT: Record<NodeState, string> = { done: 'Hecho', late: 'Atrasado', now: 'Lo que sigue', next: 'Pendiente' }

const dotClass = (s: NodeState) =>
  cx(
    'relative shrink-0 rounded-full',
    s === 'late' && 'bg-chispa pulse-dot text-chispa',
    s === 'now' && 'bg-luz shadow-[0_0_0_2px_var(--primary),0_0_12px_var(--luz)]',
    s === 'next' && 'bg-surface ring-[1.5px] ring-line-strong ring-inset',
  )

function dateBubble(date: ISODate, today: ISODate) {
  const d = diff(date, today)
  return `${capitalize(fmt(date, "EEE d 'de' MMM").replace('.', ''))} · ${d === 0 ? 'hoy' : d === 1 ? 'mañana' : d > 0 ? `en ${d} días` : `hace ${-d} días`}`
}

interface DragHandlers {
  dragging: boolean
  preview: ISODate | null
  bind: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
    onClick: () => void
  }
  ref: (el: HTMLElement | null) => void
}

/** Arrastrar un paso: con mouse de inmediato; con el dedo después de mantenerlo presionado, para no pelear con el desplazamiento */
function useNodeDrag(opts: { node: CaminoNode; geom: RielGeom; from: ISODate; to: ISODate; inBucket: boolean; scroller: () => HTMLElement | null; track: () => HTMLElement | null; onMove: (n: CaminoNode, d: ISODate) => void; onPreview?: (n: CaminoNode | null, d: ISODate | null) => void; onSelect: (n: CaminoNode) => void; disabled?: boolean }): DragHandlers {
  const o = useRef(opts)
  o.current = opts
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<ISODate | null>(null)
  const elRef = useRef<HTMLElement | null>(null)
  const s = useRef<null | { id: number; x0: number; y0: number; mode: 'wait' | 'drag'; touch: boolean; timer?: ReturnType<typeof setTimeout>; lastX: number; raf?: number; grab: number }>(null)
  const suppress = useRef(false)
  const previewRef = useRef<ISODate | null>(null)

  const dateAt = (clientX: number, grab: number) => {
    const { geom, from, to } = o.current
    const left = o.current.track()?.getBoundingClientRect().left ?? 0
    const iso = addDaysISO(from, Math.round((clientX - left - grab) / geom.px))
    return iso < from ? from : iso > to ? to : iso
  }
  const update = (clientX: number) => {
    const st = s.current
    if (!st) return
    const d = dateAt(clientX, st.grab)
    if (d !== previewRef.current) {
      previewRef.current = d
      setPreview(d)
      haptic.select()
      o.current.onPreview?.(o.current.node, d)
    }
  }
  const tick = () => {
    const st = s.current
    if (!st || st.mode !== 'drag') return
    const el = o.current.scroller()
    if (el) {
      const r = el.getBoundingClientRect()
      const margin = 56
      const speed = st.lastX > r.right - margin ? 10 : st.lastX < r.left + margin ? -10 : 0
      if (speed) {
        el.scrollLeft += speed
        update(st.lastX)
      }
    }
    st.raf = requestAnimationFrame(tick)
  }
  const start = () => {
    const st = s.current
    if (!st) return
    st.mode = 'drag'
    setDragging(true)
    haptic.light()
    document.documentElement.classList.add('is-dragging')
    try {
      elRef.current?.setPointerCapture(st.id)
    } catch {
      /* el puntero ya se soltó */
    }
    update(st.lastX)
    st.raf = requestAnimationFrame(tick)
  }
  const end = (commit: boolean) => {
    const st = s.current
    s.current = null
    if (!st) return
    if (st.timer) clearTimeout(st.timer)
    if (st.raf) cancelAnimationFrame(st.raf)
    if (st.mode === 'drag') {
      document.documentElement.classList.remove('is-dragging')
      suppress.current = true
      setTimeout(() => (suppress.current = false), 60)
      const target = previewRef.current
      setDragging(false)
      setPreview(null)
      previewRef.current = null
      o.current.onPreview?.(null, null)
      if (commit && target && target !== o.current.node.due) o.current.onMove(o.current.node, target)
    }
  }

  // Ya armado el arrastre con el dedo, la página no se desplaza
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const h = (e: TouchEvent) => {
      if (s.current?.mode === 'drag' && e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchmove', h, { passive: false })
    return () => el.removeEventListener('touchmove', h)
  }, [])

  return {
    dragging,
    preview,
    ref: (el) => {
      if (el) elRef.current = el
    },
    bind: {
      onPointerDown: (e) => {
        if (o.current.disabled || e.button !== 0) return
        const { geom, node, from, inBucket } = o.current
        const left = o.current.track()?.getBoundingClientRect().left ?? 0
        // El paso se queda bajo el dedo; desde la columna de atrasados cae justo en el día al que se apunta
        const grab = inBucket ? geom.px / 2 : e.clientX - (left + diff(node.due, from) * geom.px)
        const st: NonNullable<typeof s.current> = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: 'wait', touch: e.pointerType === 'touch', lastX: e.clientX, grab }
        s.current = st
        if (st.touch) st.timer = setTimeout(start, 260)
        else {
          // Con mouse se captura desde el inicio: aunque el movimiento sea rápido, el paso no se pierde
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* sin captura */
          }
        }
      },
      onPointerMove: (e) => {
        const st = s.current
        if (!st || st.id !== e.pointerId) return
        st.lastX = e.clientX
        const mx = e.clientX - st.x0
        const my = e.clientY - st.y0
        if (st.mode === 'wait') {
          if (st.touch) {
            if (Math.hypot(mx, my) > 8) {
              if (st.timer) clearTimeout(st.timer)
              s.current = null
            }
            return
          }
          if (Math.abs(mx) < 5) return
          start()
        }
        update(e.clientX)
      },
      onPointerUp: () => end(true),
      onPointerCancel: () => end(false),
      onKeyDown: (e) => {
        const { node, from, to } = o.current
        if (o.current.disabled) return
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          const next = addDaysISO(node.due, e.key === 'ArrowLeft' ? -1 : 1)
          if (next >= from && next <= to) o.current.onMove(node, next)
        }
      },
      onClick: () => {
        if (suppress.current) return
        o.current.onSelect(o.current.node)
      },
    },
  }
}

const DOT_OFFSET = 15 // del borde de la píldora al centro de su punto

function Nodo({ node, compact, flip, style, selected, geom, from, to, today, inBucket, scroller, track, onMove, onPreview, onSelect, appear, delay, pillH, disabled, hint }: {
  node: CaminoNode
  compact?: boolean
  flip?: boolean
  style?: CSSProperties
  selected?: boolean
  geom: RielGeom
  from: ISODate
  to: ISODate
  today: ISODate
  inBucket: boolean
  scroller: () => HTMLElement | null
  track: () => HTMLElement | null
  onMove: (n: CaminoNode, d: ISODate) => void
  onPreview?: (n: CaminoNode | null, d: ISODate | null) => void
  onSelect: (n: CaminoNode) => void
  appear?: boolean
  delay?: number
  pillH: number
  disabled?: boolean
  hint?: boolean
}) {
  const drag = useNodeDrag({ node, geom, from, to, inBucket, scroller, track, onMove, onPreview, onSelect, disabled })
  const [rest, setRest] = useState(0)
  const btn = useRef<HTMLButtonElement | null>(null)

  // Desde la columna de atrasados el botón no se mueve con el riel: la distancia se mide en pantalla
  useLayoutEffect(() => {
    if (!drag.dragging || !inBucket) return
    const r = btn.current?.getBoundingClientRect()
    if (r) setRest(r.left + DOT_OFFSET)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.dragging])

  let tx = 0
  if (drag.dragging && drag.preview) {
    if (inBucket) tx = (track()?.getBoundingClientRect().left ?? 0) + geom.xOf(drag.preview) - rest
    else tx = geom.xOf(drag.preview) - geom.xOf(node.due)
  }
  const label = `${node.label}. ${STATE_TEXT[node.state]}. ${fmt(node.due, "EEEE d 'de' MMMM")}`
  const wrapStyle: CSSProperties = { ...style, zIndex: drag.dragging ? 40 : selected ? 6 : node.state === 'late' ? 4 : 2 }
  const bubble = drag.dragging && drag.preview && (
    <span className="pointer-events-none absolute bottom-[calc(100%+7px)] left-0 z-50 rounded-full bg-night px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-on-night tabular shadow-[var(--shadow-2)]">{dateBubble(drag.preview, today)}</span>
  )

  if (compact) {
    return (
      <motion.div className={cx('group', inBucket ? 'relative' : 'absolute')} style={wrapStyle} initial={false}>
        <button
          ref={(el) => {
            btn.current = el
            drag.ref(el)
          }}
          {...drag.bind}
          aria-label={label}
          aria-pressed={selected}
          className={cx('no-callout relative flex h-7 w-7 touch-pan-x touch-pan-y items-center justify-center rounded-full pointer-coarse:h-9 pointer-coarse:w-9', !disabled && 'cursor-grab', drag.dragging && 'cursor-grabbing')}
          style={{ transform: tx ? `translateX(${tx}px)` : undefined }}
        >
          {node.state === 'done' ? (
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_70%,var(--surface))] text-surface">
              <Check size={9} strokeWidth={3} />
            </span>
          ) : (
            <span className={cx(dotClass(node.state), node.state === 'late' || node.state === 'now' ? 'h-3.5 w-3.5' : 'h-3 w-3', selected && 'outline-2 outline-offset-2 outline-ink', drag.dragging && 'scale-125')} />
          )}
          {bubble}
          {!drag.dragging && (
            <span className="pointer-events-none absolute bottom-[calc(100%+2px)] left-1/2 z-50 hidden -translate-x-1/2 rounded-[10px] bg-night px-2.5 py-1.5 text-left text-[12px] leading-snug font-medium whitespace-nowrap text-on-night shadow-[var(--shadow-2)] group-hover:block pointer-coarse:!hidden">
              {node.label}
              <span className="block font-normal text-on-night-soft">{capitalize(fmt(node.due, "EEE d 'de' MMM").replace('.', ''))}</span>
            </span>
          )}
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div className={cx(inBucket ? 'relative' : 'absolute transition-[left] duration-[var(--dur-4)] ease-[var(--ease-calma)]')} style={wrapStyle} initial={appear ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: [0.22, 1, 0.36, 1], delay: delay ?? 0 } }}>
      <button
        ref={(el) => {
          btn.current = el
          drag.ref(el)
        }}
        {...drag.bind}
        aria-label={label}
        aria-pressed={selected}
        style={{ height: pillH, transform: tx ? `translateX(${tx}px)` : undefined }}
        className={cx(
          'no-callout relative flex touch-pan-x touch-pan-y items-center gap-1.5 rounded-full pr-2.5 pl-2 text-[12.5px] leading-none font-medium whitespace-nowrap select-none',
          !disabled && 'cursor-grab',
          flip && 'flex-row-reverse pr-2 pl-2.5',
          'transition-[box-shadow,background-color,color] duration-[var(--dur-2)]',
          drag.dragging ? 'cursor-grabbing bg-surface text-ink shadow-[var(--shadow-3)] ring-1 ring-primary' : node.state === 'done' ? 'bg-[color-mix(in_oklab,var(--ink)_4%,transparent)] text-ink-3 hover:bg-wash' : node.state === 'late' ? 'bg-[color-mix(in_oklab,var(--chispa)_11%,var(--surface))] font-semibold text-key ring-1 ring-[color-mix(in_oklab,var(--chispa)_34%,transparent)] hover:shadow-[var(--shadow-1)]' : node.state === 'now' ? 'bg-surface font-semibold text-ink shadow-[var(--shadow-1)] ring-1 ring-primary hover:shadow-[var(--shadow-2)]' : 'bg-surface text-ink-soft ring-1 ring-line hover:text-ink hover:shadow-[var(--shadow-1)]',
          selected && !drag.dragging && 'outline-2 outline-offset-2 outline-ink',
        )}
      >
        {node.state === 'done' ? (
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[color-mix(in_oklab,var(--success)_85%,var(--ink))]">
            <Check size={12} strokeWidth={2.6} />
          </span>
        ) : (
          <span className={cx(dotClass(node.state), 'h-2.5 w-2.5', 'mx-[2px]')} />
        )}
        <span className="inline-flex items-center gap-1.5">
          <span>{node.label}</span>
          {node.amount !== undefined && <span className={cx('tabular', node.state === 'late' ? 'text-key' : 'text-detail')}>{compactMxn(node.amount)}</span>}
        </span>
        {bubble}
        {hint && !drag.dragging && (
          <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: [0.22, 1, 0.36, 1], delay: 1 } }} className="pointer-events-none absolute top-[calc(100%+7px)] left-0 z-50 rounded-full bg-night px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-on-night shadow-[var(--shadow-2)]">
            Arrástrame a otra fecha
          </motion.span>
        )}
      </button>
    </motion.div>
  )
}

function pillWidth(n: CaminoNode) {
  return 8 + 14 + 6 + textWidth(n.label, n.state === 'late' || n.state === 'now' ? 600 : 500) + (n.amount !== undefined ? 6 + textWidth(compactMxn(n.amount)) : 0) + 11
}

export function Riel({ rows, compact, from, to, selectedId, onSelect, onMove, onPreview, today, eventDate, eventLabel, ribbons, top, topHeight = 0, leftWidth, minPx = 7, maxPx = 54, appear, disabled, hint }: {
  rows: RielRow[]
  compact?: boolean
  from: ISODate
  to: ISODate
  today: ISODate
  selectedId?: string
  onSelect: (n: CaminoNode) => void
  onMove: (n: CaminoNode, date: ISODate) => void
  onPreview?: (n: CaminoNode | null, d: ISODate | null) => void
  eventDate?: ISODate
  eventLabel?: string
  ribbons?: { label: string; from: ISODate; to: ISODate; current: boolean }[]
  /** Contenido alineado con el tiempo, arriba de los carriles (la carga por semana) */
  top?: (g: RielGeom) => ReactNode
  topHeight?: number
  leftWidth?: number
  minPx?: number
  maxPx?: number
  /** Pasos recién agregados: entran en cascada */
  appear?: Set<string>
  disabled?: boolean
  /** Enseña una sola vez que los pasos se arrastran */
  hint?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  const [guide, setGuide] = useState<ISODate | null>(null)
  const coarse = useMedia('(pointer: coarse)')
  const pillH = coarse ? 36 : 30
  const gap = 6

  // La pista de «arrástrame» sale una vez en la vida, hasta el primer arrastre
  const [showHint, setShowHint] = useState(() => {
    if (!hint) return false
    try {
      return !localStorage.getItem('lajoya:hint:riel')
    } catch {
      return false
    }
  })
  const dismissHint = useCallback(() => {
    setShowHint(false)
    try {
      localStorage.setItem('lajoya:hint:riel', '1')
    } catch {
      /* sin almacenamiento */
    }
  }, [])
  useEffect(() => {
    if (!showHint) return
    const id = setTimeout(() => setShowHint(false), 9000)
    return () => clearTimeout(id)
  }, [showHint])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const m = () => setW(el.clientWidth)
    m()
    const ro = new ResizeObserver(m)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const left = leftWidth ?? (compact ? 172 : 138)
  const bucketed = useMemo(() => rows.some((r) => r.nodes.some((n) => n.state === 'late' && n.due < from)), [rows, from])
  const bucketW = bucketed ? (compact ? 76 : 196) : 0
  const days = Math.max(1, diff(to, from) + 1)
  const px = Math.max(minPx, Math.min(maxPx, W ? (W - left - bucketW - 8) / days : 16))
  const trackW = days * px
  const xOf = useCallback((d: ISODate) => (diff(d, from) + 0.5) * px, [from, px])
  const geom: RielGeom = useMemo(() => ({ xOf, px, trackW }), [xOf, px, trackW])

  const handlePreview = useCallback(
    (n: CaminoNode | null, d: ISODate | null) => {
      setGuide(d)
      if (d) dismissHint()
      onPreview?.(n, d)
    },
    [onPreview, dismissHint],
  )

  // Meses, marcas del tiempo y fines de semana
  const { months, ticks, weekends } = useMemo(() => {
    const months: { iso: ISODate; label: string }[] = []
    const ticks: { iso: ISODate; label: string; sub?: string; weekend: boolean }[] = []
    const weekends: { iso: ISODate; n: number }[] = []
    const roomy = !compact && px >= 19
    for (let i = 0; i < days; i++) {
      const iso = addDaysISO(from, i)
      const date = parseISO(iso)
      const dow = date.getDay()
      if (i === 0 || date.getDate() === 1) {
        // Si el mes de arriba ya casi termina, su nombre chocaría con el siguiente: se queda solo el nuevo
        if (months.length === 1 && i * px < 76) months.pop()
        months.push({ iso, label: capitalize(fmt(iso, 'MMMM')) })
      }
      if (dow === 6) weekends.push({ iso, n: 2 })
      else if (i === 0 && dow === 0) weekends.push({ iso, n: 1 })
      if (roomy) ticks.push({ iso, label: String(date.getDate()), sub: px >= 27 ? capitalize(fmt(iso, 'EEEEE')) : undefined, weekend: dow === 0 || dow === 6 })
      else if (dow === 1) ticks.push({ iso, label: String(date.getDate()), weekend: false })
    }
    return { months, ticks, weekends }
  }, [from, days, px, compact])

  // Acomodo de cada fila: nada se encima; lo que no cabe sube a otra línea
  const layouts = useMemo(() => {
    return rows.map((row) => {
      const inBucket: CaminoNode[] = []
      const shown: CaminoNode[] = []
      for (const n of row.nodes) {
        if (n.due < from) {
          if (n.state === 'late') inBucket.push(n)
          continue
        }
        if (n.due > to) continue
        shown.push(n)
      }
      const tracks: number[] = []
      const dotted = compact ? 20 : 0
      const placed = shown.map((n) => {
        const x = xOf(n.due)
        const w = compact ? dotted : pillWidth(n)
        const flip = !compact && x - DOT_OFFSET + w > trackW - 2
        const l = compact ? x - dotted / 2 : flip ? x + DOT_OFFSET - w : Math.max(0, x - DOT_OFFSET)
        let t = tracks.findIndex((right) => right + (compact ? 0 : gap) <= l)
        if (t < 0) {
          t = tracks.length
          tracks.push(0)
        }
        tracks[t] = l + w
        return { n, l, t, flip }
      })
      return { row, placed, inBucket, tracks: Math.max(1, tracks.length) }
    })
  }, [rows, from, to, xOf, trackW, compact])

  const lineH = compact ? 20 : pillH + gap
  const showToday = today >= from && today <= to
  const headerH = (compact ? 34 : 42) + (ribbons?.length ? 32 : 0)
  // La pista sale en lo que sigue; si no está a la vista, en el primer paso visible sin hacer
  const hintId = useMemo(() => {
    if (!showHint) return null
    const list = layouts.flatMap((l) => l.placed.map((p) => p.n))
    return (list.find((n) => n.state === 'now') ?? list.find((n) => n.state !== 'done'))?.id ?? null
  }, [showHint, layouts])

  return (
    <div ref={scrollRef} className="scroll-area overflow-x-auto overscroll-x-contain" role="group" aria-label="Línea de tiempo">
      <div className="relative" style={{ width: left + bucketW + trackW + 4, minWidth: '100%' }}>
        {/* Encabezado del tiempo */}
        <div className="flex">
          <div className="sticky left-0 z-20 shrink-0 bg-surface" style={{ width: left }} />
          {bucketed && (
            <div className="sticky z-20 flex shrink-0 items-end bg-surface pb-1.5 pl-3" style={{ left, width: bucketW }}>
              {!compact && <span className="text-[12.5px] font-semibold text-key">Atrasado</span>}
              {compact && <span className="text-[11.5px] leading-tight font-semibold text-key">Atrasado</span>}
            </div>
          )}
          <div className="relative shrink-0" style={{ width: trackW, height: headerH + topHeight }}>
            {top && (
              <div className="absolute inset-x-0 top-0" style={{ height: topHeight }}>
                {top(geom)}
              </div>
            )}
            {months.map((m) => (
              <span key={m.iso} className="absolute text-[12.5px] font-semibold text-ink" style={{ left: Math.max(2, xOf(m.iso) - px / 2 + 2), top: topHeight }}>
                {m.label}
              </span>
            ))}
            {ticks.map((tk) => {
              const isT = tk.iso === today
              const isE = tk.iso === eventDate
              return (
                <span key={tk.iso} className={cx('absolute flex -translate-x-1/2 flex-col items-center text-[11.5px] leading-none tabular', isT ? 'font-semibold text-key' : isE ? 'font-semibold text-ink' : tk.weekend ? 'text-ink-soft' : 'text-ink-3')} style={{ left: xOf(tk.iso), top: topHeight + (compact ? 19 : tk.sub ? 17 : 22) }}>
                  {tk.sub && <span className="mb-[3px] text-[10.5px] font-normal text-ink-3">{tk.sub}</span>}
                  {tk.label}
                </span>
              )
            })}
            {ribbons?.map((r) => {
              const l = xOf(r.from) - px / 2
              const w = xOf(r.to) + px / 2 - l - 2
              const fits = w > textWidth(r.label) + 20
              return (
                <span key={r.label} title={r.label} className={cx('absolute flex h-6 items-center overflow-hidden rounded-full px-2.5 text-[11.5px] font-medium whitespace-nowrap', r.current ? 'bg-primary text-on-primary' : 'bg-sunken text-ink-soft')} style={{ left: l + 1, width: Math.max(4, w), top: topHeight + 44 }}>
                  {fits ? r.label : ''}
                </span>
              )
            })}
            {/* El destino: el día del evento, sobre la franja de las fases */}
            {eventDate && eventLabel && eventDate >= from && eventDate <= to && (
              <span className="absolute z-[1] flex h-6 -translate-x-1/2 items-center rounded-full bg-night px-2.5 text-[11.5px] font-medium whitespace-nowrap text-on-night shadow-[var(--shadow-1)]" style={{ left: xOf(eventDate), top: topHeight + (ribbons?.length ? 44 : 19) }}>
                {eventLabel}
              </span>
            )}
          </div>
        </div>

        {/* Carriles */}
        <div className="relative">
          {/* Fines de semana, hoy y el día del evento, debajo de todo */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: left + bucketW, width: trackW }}>
            {px >= 7 && weekends.map((w) => <span key={w.iso} className="absolute inset-y-0 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)]" style={{ left: xOf(w.iso) - px / 2, width: px * w.n }} />)}
            {eventDate && eventDate >= from && eventDate <= to && <span className="absolute inset-y-0 bg-[color-mix(in_oklab,var(--luz)_26%,transparent)]" style={{ left: xOf(eventDate) - px / 2, width: Math.max(px, 3) }} />}
            {showToday && <span className="absolute inset-y-0 w-px bg-chispa-soft" style={{ left: xOf(today) }} />}
            {guide && <span className="absolute inset-y-0 w-px bg-ink" style={{ left: xOf(guide) }} />}
          </div>

          {layouts.map(({ row, placed, inBucket, tracks }) => {
            const trackH = tracks * lineH + (compact ? 20 : 14)
            const bucketH = compact ? 0 : inBucket.length * (pillH + gap) + 16
            const h = Math.max(trackH, bucketH, compact ? 56 : 48)
            return (
              <div key={row.key} className={cx('flex border-t border-line transition-opacity duration-[var(--dur-3)]', row.dim && 'opacity-35', row.strong && 'bg-[color-mix(in_oklab,var(--luz)_14%,transparent)]')} style={{ minHeight: h }}>
                <div className={cx('sticky left-0 z-20 flex shrink-0 items-center bg-surface py-2 pr-2 pl-4 md:pl-5', row.strong && 'bg-[color-mix(in_oklab,var(--luz)_14%,var(--surface))]')} style={{ width: left }}>
                  {row.title}
                </div>
                {bucketed && (
                  <div className={cx('sticky z-20 flex shrink-0 flex-col justify-center gap-1.5 bg-[color-mix(in_oklab,var(--chispa)_6%,var(--surface))] px-2 py-2', compact && 'flex-row flex-wrap items-center')} style={{ left, width: bucketW }}>
                    {compact && inBucket.length > 0 && <span className="text-[13px] font-semibold text-key tabular">{inBucket.length}</span>}
                    {!compact && inBucket.map((n) => <Nodo key={n.id} node={n} inBucket selected={selectedId === n.id} geom={geom} from={from} to={to} today={today} scroller={() => scrollRef.current} track={() => trackRef.current} onMove={onMove} onPreview={handlePreview} onSelect={onSelect} pillH={pillH} disabled={disabled} />)}
                  </div>
                )}
                <div ref={row === rows[0] ? trackRef : undefined} className="relative shrink-0" style={{ width: trackW }}>
                  {compact && row.endDate && row.endDate >= from && row.endDate <= to && (
                    <>
                      {/* El camino de esta fila: de hoy hasta su evento */}
                      <span aria-hidden className="absolute top-1/2 h-px bg-line-strong" style={{ left: showToday ? xOf(today) : 0, width: Math.max(0, xOf(row.endDate) - (showToday ? xOf(today) : 0)) }} />
                      <span aria-hidden className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-night shadow-[0_0_0_3px_color-mix(in_oklab,var(--luz)_55%,transparent)]" style={{ left: xOf(row.endDate) }} />
                    </>
                  )}
                  {placed.map(({ n, l, t: tr, flip }, i) => {
                    const hit = coarse ? 36 : 28
                    const offset = compact ? (h - tracks * lineH) / 2 + tr * lineH + lineH / 2 - hit / 2 : (h - tracks * lineH) / 2 + tr * lineH + gap / 2
                    return (
                      <Nodo
                        key={n.id}
                        node={n}
                        compact={compact}
                        flip={flip}
                        inBucket={false}
                        style={{ left: compact ? xOf(n.due) - hit / 2 : l, top: offset }}
                        selected={selectedId === n.id}
                        geom={geom}
                        from={from}
                        to={to}
                        today={today}
                        scroller={() => scrollRef.current}
                        track={() => trackRef.current}
                        onMove={onMove}
                        onPreview={handlePreview}
                        onSelect={onSelect}
                        appear={appear?.has(n.id)}
                        delay={appear?.has(n.id) ? i * 0.035 : 0}
                        pillH={pillH}
                        disabled={disabled}
                        hint={hintId === n.id}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

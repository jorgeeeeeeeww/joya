// Interacciones directas de La Joya: deslizar un renglón, arrastrar tarjetas entre columnas,
// voltear tarjetas, mantener presionado para ver acciones y reordenar listas.
// Funcionan con dedo y con mouse; el movimiento sigue la "deriva" de step1 (sin rebotes ni giros).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { animate, AnimatePresence, motion, Reorder, useDragControls, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import { GripVertical } from 'lucide-react'
import type { Pastel } from '@/lib/types'
import { TONE } from '@/lib/meta'
import { ease, haptic } from '@/lib/motion'
import { cx, MenuList, Popover, type MenuItem } from './ui'

// ── Deslizar un renglón ──────────────────────────────────
export interface SwipeAction {
  label: string
  icon: ReactNode
  tone?: Pastel | 'danger' | 'success'
  onTrigger: () => void
  /** El renglón sale de la pantalla al confirmar (eliminar, archivar) */
  remove?: boolean
}

function toneBg(tone: SwipeAction['tone'], armed: boolean) {
  if (tone === 'danger') return armed ? 'bg-danger text-surface' : 'bg-[color-mix(in_oklab,var(--danger)_16%,var(--surface))] text-danger'
  if (tone === 'success' || !tone) return armed ? 'bg-success text-surface' : 'bg-[color-mix(in_oklab,var(--success)_16%,var(--surface))] text-success'
  const t = TONE[tone]
  return armed ? cx(t.solid, 'text-surface') : cx(t.soft, t.ink)
}

function SwipePanel({ side, action, x, armed, threshold }: { side: 'left' | 'right'; action: SwipeAction; x: MotionValue<number>; armed: boolean; threshold: number }) {
  const opacity = useTransform(x, (v) => (side === 'left' ? (v > 1 ? 1 : 0) : v < -1 ? 1 : 0))
  const scale = useTransform(x, (v) => 0.72 + Math.min(1, Math.abs(v) / threshold) * 0.28)
  return (
    <motion.div style={{ opacity }} aria-hidden className={cx('absolute inset-0 flex items-center px-5 transition-colors duration-[var(--dur-2)]', side === 'left' ? 'justify-start' : 'justify-end', toneBg(action.tone, armed))}>
      <motion.span style={{ scale }} className={cx('flex items-center gap-2 text-sm font-semibold', side === 'right' && 'flex-row-reverse')}>
        <span className="flex [&>svg]:h-5 [&>svg]:w-5">{action.icon}</span>
        {action.label}
      </motion.span>
    </motion.div>
  )
}

/**
 * Renglón que se desliza con el dedo: a la derecha (`left`) y a la izquierda (`right`).
 * El contenido debe tener fondo (una tarjeta). `hintKey` enseña el gesto una sola vez: ponlo solo en el primer renglón.
 */
export function SwipeRow({ children, left, right, className, disabled, hintKey }: { children: ReactNode; left?: SwipeAction; right?: SwipeAction; className?: string; disabled?: boolean; hintKey?: string }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const [armed, setArmed] = useState<'left' | 'right' | null>(null)
  const armedRef = useRef<'left' | 'right' | null>(null)
  const [threshold, setThreshold] = useState(120)
  const drag = useRef<{ x0: number; y0: number; id: number; mode: 'idle' | 'h'; samples: { x: number; t: number }[] } | null>(null)
  const suppress = useRef(false)

  useLayoutEffect(() => {
    const el = rowRef.current
    if (!el) return
    const measure = () => setThreshold(Math.min(132, Math.max(72, el.offsetWidth * 0.34)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!hintKey || disabled || !(left || right) || !window.matchMedia('(pointer: coarse)').matches) return
    const k = `lajoya:hint:${hintKey}`
    try {
      if (localStorage.getItem(k)) return
    } catch {
      return
    }
    const t = setTimeout(async () => {
      const dir = right ? -1 : 1
      await animate(x, dir * 46, { duration: 0.4, ease: ease.calma })
      await animate(x, 0, { duration: 0.5, ease: ease.calma })
      try {
        localStorage.setItem(k, '1')
      } catch {
        /* sin almacenamiento */
      }
    }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKey, disabled])

  const setPos = (dx: number) => {
    let v = dx
    if ((dx > 0 && !left) || (dx < 0 && !right)) v = dx * 0.12
    else {
      const lim = threshold * 1.5
      if (Math.abs(v) > lim) v = Math.sign(v) * (lim + (Math.abs(v) - lim) * 0.3)
    }
    x.set(v)
    const a = v > threshold && left ? 'left' : v < -threshold && right ? 'right' : null
    if (a !== armedRef.current) {
      armedRef.current = a
      setArmed(a)
      if (a) haptic.select()
    }
  }

  const finish = () => {
    const d = drag.current
    drag.current = null
    if (!d || d.mode !== 'h') return
    suppress.current = true
    setTimeout(() => (suppress.current = false), 80)
    // Un movimiento rápido también cuenta, aunque no llegue al umbral
    const s = d.samples
    const vel = s.length > 1 ? (s[s.length - 1]!.x - s[0]!.x) / Math.max(1, s[s.length - 1]!.t - s[0]!.t) : 0
    const v = x.get()
    let a = armedRef.current
    if (!a && Math.abs(vel) > 0.7 && Math.abs(v) > 36) a = v > 0 && left && vel > 0 ? 'left' : v < 0 && right && vel < 0 ? 'right' : null
    armedRef.current = null
    setArmed(null)
    const action = a === 'left' ? left : a === 'right' ? right : undefined
    if (!action) {
      animate(x, 0, { type: 'spring', stiffness: 380, damping: 36 })
      return
    }
    haptic.success()
    if (action.remove) {
      const w = rowRef.current?.offsetWidth ?? 360
      animate(x, a === 'left' ? w : -w, { duration: 0.22, ease: ease.salida }).then(() => action.onTrigger())
    } else {
      animate(x, 0, { type: 'spring', stiffness: 380, damping: 36 })
      action.onTrigger()
    }
  }

  return (
    <div
      ref={rowRef}
      className={cx('relative touch-pan-y overflow-hidden rounded-[var(--r-lg)]', className)}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0 || (!left && !right)) return
        if ((e.target as HTMLElement).closest('[data-noswipe], input, textarea, select')) return
        drag.current = { x0: e.clientX, y0: e.clientY, id: e.pointerId, mode: 'idle', samples: [] }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        const dx = e.clientX - d.x0
        const dy = e.clientY - d.y0
        if (d.mode === 'idle') {
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            d.mode = 'h'
            rowRef.current?.setPointerCapture(e.pointerId)
          } else if (Math.abs(dy) > 10) {
            drag.current = null
            return
          } else return
        }
        d.samples = [...d.samples.slice(-4), { x: e.clientX, t: e.timeStamp }]
        setPos(dx - Math.sign(dx) * 10)
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={(e) => {
        if (suppress.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      {left && <SwipePanel side="left" action={left} x={x} armed={armed === 'left'} threshold={threshold} />}
      {right && <SwipePanel side="right" action={right} x={x} armed={armed === 'right'} threshold={threshold} />}
      <motion.div style={{ x }} className="relative">
        {children}
      </motion.div>
    </div>
  )
}

// ── Tablero: arrastrar tarjetas entre columnas ───────────
export interface BoardColumn<C extends string> {
  id: C
  title: ReactNode
  tone?: Pastel
  /** Texto pequeño junto al título (p. ej. un total) */
  meta?: ReactNode
  footer?: ReactNode
  empty?: ReactNode
}

/**
 * Columnas con tarjetas que se arrastran (mouse: arrastrar; dedo: mantener presionado y mover).
 * En el celular las columnas se deslizan de lado; en escritorio se ven todas.
 * Dentro de la tarjeta, marca con `data-nodrag` los controles que no deben iniciar el arrastre.
 */
export function DragBoard<T, C extends string>({ columns, items, getId, getColumn, renderCard, onMove, canDrop, className, emptyText = 'Suelta aquí', sort }: { columns: BoardColumn<C>[]; items: T[]; getId: (item: T) => string; getColumn: (item: T) => C; renderCard: (item: T, state: { dragging: boolean; ghost?: boolean }) => ReactNode; onMove: (id: string, to: C, item: T) => void; canDrop?: (item: T, to: C) => boolean; className?: string; emptyText?: ReactNode; sort?: (a: T, b: T) => number }) {
  const [drag, setDrag] = useState<{ id: string; item: T; from: C; w: number; offX: number; offY: number } | null>(null)
  const [over, setOver] = useState<C | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag
  const overRef = useRef(over)
  overRef.current = over
  const ghostRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: 0, y: 0 })
  const press = useRef<{ id: string; item: T; el: HTMLElement; x0: number; y0: number; pointerId: number; touch: boolean; timer?: number } | null>(null)
  const raf = useRef<number | undefined>(undefined)
  const suppress = useRef(false)
  const canDropRef = useRef(canDrop)
  canDropRef.current = canDrop
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove
  // Manejadores estables: se agregan y se quitan siempre las mismas funciones (si no, el
  // escucha quedaría colgado después de arrastrar)
  const live = useRef({ move: (_e: PointerEvent) => {}, up: (_e: PointerEvent) => {}, cancel: () => {} })
  const [stable] = useState(() => ({
    move: (e: PointerEvent) => live.current.move(e),
    up: (e: PointerEvent) => live.current.up(e),
    cancel: () => live.current.cancel(),
  }))

  const cleanup = () => {
    const p = press.current
    if (p?.timer) clearTimeout(p.timer)
    press.current = null
    cancelAnimationFrame(raf.current!)
    window.removeEventListener('pointermove', stable.move)
    window.removeEventListener('pointerup', stable.up)
    window.removeEventListener('pointercancel', stable.cancel)
    document.documentElement.classList.remove('is-dragging')
    dragRef.current = null
    setDrag(null)
    setOver(null)
  }

  const updateOver = () => {
    const el = document.elementFromPoint(pos.current.x, pos.current.y)?.closest('[data-col]') as HTMLElement | null
    const col = (el?.dataset.col as C | undefined) ?? null
    if (col !== overRef.current) {
      overRef.current = col
      setOver(col)
      const d = dragRef.current
      if (col && d && col !== d.from && (canDropRef.current?.(d.item, col) ?? true)) haptic.select()
    }
  }

  const loop = () => {
    const d = dragRef.current
    if (!d) return
    const { x, y } = pos.current
    if (ghostRef.current) ghostRef.current.style.transform = `translate3d(${x - d.offX}px, ${y - d.offY}px, 0)`
    // Desplazamiento automático cerca de las orillas
    const sc = scrollerRef.current
    if (sc && sc.scrollWidth > sc.clientWidth) {
      const r = sc.getBoundingClientRect()
      if (x < r.left + 44) sc.scrollLeft -= 12
      else if (x > r.right - 44) sc.scrollLeft += 12
    }
    const main = document.getElementById('contenido')
    if (main) {
      if (y < 110) main.scrollTop -= 10
      else if (y > innerHeight - 90) main.scrollTop += 10
    }
    updateOver()
    raf.current = requestAnimationFrame(loop)
  }

  const begin = () => {
    const p = press.current
    if (!p) return
    const r = p.el.getBoundingClientRect()
    pos.current = { x: pos.current.x || p.x0, y: pos.current.y || p.y0 }
    const next = { id: p.id, item: p.item, from: getColumn(p.item), w: r.width, offX: p.x0 - r.left, offY: p.y0 - r.top }
    dragRef.current = next
    setDrag(next)
    haptic.light()
    document.documentElement.classList.add('is-dragging')
    raf.current = requestAnimationFrame(loop)
  }

  // Chrome en Android decide al tocar si el gesto puede cancelarse: el escucha "no pasivo" debe
  // existir desde antes. Solo bloquea el desplazamiento mientras se arrastra una tarjeta.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const h = (e: TouchEvent) => {
      if (dragRef.current && e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchmove', h, { passive: false })
    return () => el.removeEventListener('touchmove', h)
  }, [])

  function onPointerMove(e: PointerEvent) {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    pos.current = { x: e.clientX, y: e.clientY }
    if (!dragRef.current) {
      const dist = Math.hypot(e.clientX - p.x0, e.clientY - p.y0)
      if (p.touch) {
        if (dist > 9) cleanup() // está desplazando la pantalla, no arrastrando
        return
      }
      if (dist > 5) begin()
    } else updateOver()
  }
  function onPointerUp(e: PointerEvent) {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    pos.current = { x: e.clientX, y: e.clientY }
    const d = dragRef.current
    if (d) {
      updateOver() // la posición final cuenta aunque el cuadro de animación no haya corrido
      suppress.current = true
      setTimeout(() => (suppress.current = false), 80)
      const to = overRef.current
      if (to && to !== d.from && (canDropRef.current?.(d.item, to) ?? true)) {
        haptic.success()
        onMoveRef.current(d.id, to, d.item)
      }
    }
    cleanup()
  }
  function onPointerCancel() {
    cleanup()
  }
  live.current = { move: onPointerMove, up: onPointerUp, cancel: onPointerCancel }
  useEffect(() => () => live.current.cancel(), [])

  const onCardDown = (e: React.PointerEvent, item: T) => {
    if (e.button !== 0 || press.current) return
    if ((e.target as HTMLElement).closest('input, textarea, select, [data-nodrag]')) return
    const touch = e.pointerType !== 'mouse'
    pos.current = { x: e.clientX, y: e.clientY }
    press.current = { id: getId(item), item, el: e.currentTarget as HTMLElement, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, touch }
    if (touch) press.current.timer = window.setTimeout(() => live.current && begin(), 300)
    window.addEventListener('pointermove', stable.move)
    window.addEventListener('pointerup', stable.up)
    window.addEventListener('pointercancel', stable.cancel)
  }

  const n = columns.length
  const layout = n <= 3 ? 'md:grid md:grid-cols-3 md:overflow-visible md:snap-none md:mx-0 md:px-0' : n === 4 ? 'xl:grid xl:grid-cols-4 xl:overflow-visible xl:snap-none xl:mx-0 xl:px-0' : 'xl:grid xl:grid-cols-5 xl:overflow-visible xl:snap-none xl:mx-0 xl:px-0'
  const colWidth = n <= 3 ? 'md:w-auto md:max-w-none' : 'xl:w-auto xl:max-w-none'
  const grouped = useMemo(() => {
    const map = new Map<C, T[]>()
    for (const c of columns) map.set(c.id, [])
    for (const it of items) map.get(getColumn(it))?.push(it)
    if (sort) for (const list of map.values()) list.sort(sort)
    return map
  }, [columns, items, getColumn, sort])

  return (
    <>
      <div ref={scrollerRef} className={cx('no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6', layout, className)}>
        {columns.map((c) => {
          const list = grouped.get(c.id) ?? []
          const droppable = !!drag && drag.from !== c.id && (canDrop?.(drag.item, c.id) ?? true)
          const blocked = !!drag && drag.from !== c.id && !droppable
          return (
            <section key={c.id} data-col={c.id} aria-label={typeof c.title === 'string' ? c.title : undefined} className={cx('flex w-[82vw] max-w-[340px] shrink-0 snap-center flex-col rounded-[var(--r-lg)] bg-[color-mix(in_oklab,var(--sunken)_70%,transparent)] p-2 ring-1 ring-line ring-inset transition-[box-shadow,opacity,background-color] duration-[var(--dur-2)]', colWidth, over === c.id && droppable && 'drop-glow bg-[color-mix(in_oklab,var(--luz)_14%,var(--sunken))]', blocked && 'opacity-50')}>
              <header className="mb-2 flex items-center justify-between gap-2 px-1.5 pt-1">
                <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">
                  {c.tone && <span className={cx('h-2 w-2 shrink-0 rounded-full', TONE[c.tone].solid)} />}
                  <span className="truncate">{c.title}</span>
                  <span className="text-xs font-normal text-ink-3 tabular">{list.length}</span>
                </span>
                {c.meta && <span className="shrink-0 text-xs text-ink-3 tabular">{c.meta}</span>}
              </header>
              <div className="flex min-h-[84px] flex-1 flex-col gap-2">
                <AnimatePresence initial={false}>
                  {list.map((item) => {
                    const id = getId(item)
                    const isDragging = drag?.id === id
                    return (
                      <motion.div
                        key={id}
                        layout="position"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: isDragging ? 0.35 : 1, scale: 1, transition: { duration: 0.24, ease: ease.calma } }}
                        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.14, ease: ease.salida } }}
                        className="no-callout touch-manipulation"
                        onPointerDown={(e) => onCardDown(e, item)}
                        onClickCapture={(e) => {
                          if (suppress.current) {
                            e.preventDefault()
                            e.stopPropagation()
                          }
                        }}
                      >
                        {renderCard(item, { dragging: isDragging })}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
                {list.length === 0 && <div className={cx('flex flex-1 items-center justify-center rounded-[12px] border border-dashed px-3 py-6 text-center text-xs transition-colors', over === c.id && droppable ? 'border-primary text-primary' : 'border-line-strong text-ink-3')}>{c.empty ?? emptyText}</div>}
              </div>
              {c.footer}
            </section>
          )
        })}
      </div>
      {drag &&
        createPortal(
          <div ref={ghostRef} className="pointer-events-none fixed top-0 left-0 z-[80]" style={{ width: drag.w, transform: `translate3d(${pos.current.x - drag.offX}px, ${pos.current.y - drag.offY}px, 0)` }}>
            <motion.div initial={{ scale: 1, rotate: 0 }} animate={{ scale: 1.03, rotate: 1.2, transition: { duration: 0.2, ease: ease.calma } }} className="rounded-[var(--r-lg)] shadow-[var(--shadow-3)]">
              {renderCard(drag.item, { dragging: false, ghost: true })}
            </motion.div>
          </div>,
          document.body,
        )}
    </>
  )
}

// ── Tarjeta que se voltea ────────────────────────────────
/** Toca para ver el reverso (detalle, desglose). Los botones dentro no voltean la tarjeta. */
export function FlipCard({ front, back, className, flipped: controlled, onFlip, label = 'Voltear para ver el detalle' }: { front: ReactNode; back: ReactNode; className?: string; flipped?: boolean; onFlip?: (v: boolean) => void; label?: string }) {
  const [inner, setInner] = useState(false)
  const flipped = controlled ?? inner
  const reduce = useReducedMotion()
  const toggle = (e: React.SyntheticEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('a, input, textarea, select, [data-noflip]') || (t.closest('button') && t.closest('button') !== e.currentTarget)) return
    haptic.select()
    setInner(!flipped)
    onFlip?.(!flipped)
  }
  const faceProps = {
    role: 'button',
    tabIndex: 0,
    'aria-pressed': flipped,
    'aria-label': label,
    onClick: toggle,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle(e)
      }
    },
  }
  if (reduce)
    return (
      <div className={className} {...faceProps}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={flipped ? 'b' : 'f'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
            {flipped ? back : front}
          </motion.div>
        </AnimatePresence>
      </div>
    )
  return (
    <div className={cx('relative [perspective:1400px]', className)}>
      <motion.div className="relative grid h-full [transform-style:preserve-3d]" initial={false} animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.62, ease: ease.calma }}>
        <div className={cx('h-full cursor-pointer [grid-area:1/1] [backface-visibility:hidden]', flipped && 'pointer-events-none')} {...faceProps} aria-hidden={flipped}>
          {front}
        </div>
        {/* El reverso toma la altura del frente (sin estirar la tarjeta); si no cabe, se desplaza por dentro */}
        <div className={cx('scroll-area absolute inset-0 cursor-pointer overflow-y-auto rounded-[var(--r-lg)] [transform:rotateY(180deg)] [backface-visibility:hidden]', !flipped && 'pointer-events-none')} {...faceProps} aria-hidden={!flipped}>
          {back}
        </div>
      </motion.div>
    </div>
  )
}

// ── Mantener presionado (o clic derecho) para ver acciones ──
/**
 * Menú contextual: en el celular se abre al mantener presionado; en escritorio con clic derecho.
 * Uso: `const ctx = useContextMenu()`, `<div {...ctx.bind(items)}>` y renderiza `{ctx.node}` una vez.
 */
export function useContextMenu() {
  const [state, setState] = useState<{ items: MenuItem[]; x: number; y: number; title?: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  const resolve = (items: MenuItem[] | (() => MenuItem[])) => (typeof items === 'function' ? items() : items)
  const bind = (items: MenuItem[] | (() => MenuItem[]), title?: string) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      clearTimeout(timer.current)
      setState({ items: resolve(items), x: e.clientX, y: e.clientY, title })
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        fired.current = true
        haptic.light()
        setState({ items: resolve(items), x: start.current!.x, y: start.current!.y, title })
      }, 480)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clearTimeout(timer.current)
    },
    onPointerUp: () => clearTimeout(timer.current),
    onPointerCancel: () => clearTimeout(timer.current),
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault()
        e.stopPropagation()
        fired.current = false
      }
    },
  })
  const node = (
    <Popover open={!!state} onClose={() => setState(null)} anchor={state ? { x: state.x, y: state.y } : { x: 0, y: 0 }} width={248} title={state?.title} label={state?.title ?? 'Acciones'}>
      <MenuList items={state?.items ?? []} onPick={() => setState(null)} />
    </Popover>
  )
  return { bind, node, open: (items: MenuItem[], at: { x: number; y: number }, title?: string) => setState({ items, ...at, title }) }
}

// ── Lista que se reordena arrastrando la manija ──────────
function SortableItem({ id, children, onEnd }: { id: string; children: (handle: ReactNode) => ReactNode; onEnd: () => void }) {
  const controls = useDragControls()
  const handle = (
    <button
      type="button"
      aria-label="Arrastrar para reordenar"
      className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-3 hover:bg-wash hover:text-ink active:cursor-grabbing"
      onPointerDown={(e) => {
        haptic.light()
        controls.start(e)
      }}
    >
      <GripVertical size={16} strokeWidth={1.7} />
    </button>
  )
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={controls} onDragEnd={onEnd} whileDrag={{ scale: 1.02, zIndex: 5 }} transition={{ duration: 0.24, ease: ease.calma }} className="relative list-none">
      {children(handle)}
    </Reorder.Item>
  )
}

/**
 * Lista vertical que se reordena con una manija (⋮⋮). Avisa el orden nuevo al soltar.
 * `renderItem(item, handle)` debe colocar `handle` donde se agarra.
 */
export function SortableList<T>({ items, getId, onReorder, renderItem, className }: { items: T[]; getId: (item: T) => string; onReorder: (items: T[]) => void; renderItem: (item: T, handle: ReactNode) => ReactNode; className?: string }) {
  const [order, setOrder] = useState(() => items.map(getId))
  const orderRef = useRef(order)
  orderRef.current = order
  const key = items.map(getId).join('|')
  useEffect(() => {
    setOrder(items.map(getId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const byId = new Map(items.map((i) => [getId(i), i]))
  const commit = () => {
    const next = orderRef.current.map((id) => byId.get(id)).filter(Boolean) as T[]
    if (next.map(getId).join('|') !== key) {
      haptic.success()
      onReorder(next)
    }
  }
  return (
    <Reorder.Group axis="y" values={order} onReorder={setOrder} className={cx('flex flex-col gap-2', className)}>
      {order.map((id) => {
        const item = byId.get(id)
        if (!item) return null
        return (
          <SortableItem key={id} id={id} onEnd={commit}>
            {(handle) => renderItem(item, handle)}
          </SortableItem>
        )
      })}
    </Reorder.Group>
  )
}

// ── Deslizar para confirmar ──────────────────────────────
/**
 * Botón grande que se confirma deslizando la luz hasta el final (evita toques accidentales con guantes).
 * Con teclado o lector de pantalla funciona como un botón normal (Enter o Espacio).
 */
export function SlideToConfirm({ label, onConfirm, className, tone = 'tinta' }: { label: string; onConfirm: () => void; className?: string; tone?: 'tinta' | 'luz' }) {
  const track = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const [max, setMax] = useState(200)
  const drag = useRef<{ x0: number; id: number } | null>(null)
  const fill = useTransform(x, (v) => v + 56)
  const labelOpacity = useTransform(x, (v) => 1 - Math.min(1, v / Math.max(1, max * 0.6)))
  useLayoutEffect(() => {
    const el = track.current
    if (!el) return
    const measure = () => setMax(Math.max(80, el.offsetWidth - 64))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const done = () => {
    haptic.success()
    animate(x, max, { duration: 0.18 })
    setTimeout(() => {
      onConfirm()
      animate(x, 0, { duration: 0.42, ease: ease.calma })
    }, 160)
  }
  const night = tone === 'tinta'
  return (
    <div ref={track} className={cx('relative h-16 w-full select-none overflow-hidden rounded-full', night ? 'bg-ink text-paper' : 'bg-luz text-[color:var(--ink-base,var(--ink))]', className)}>
      <motion.span aria-hidden style={{ width: fill }} className={cx('absolute inset-y-0 left-0 rounded-full', night ? 'bg-[color-mix(in_oklab,var(--luz)_22%,transparent)]' : 'bg-[color-mix(in_oklab,var(--ink)_10%,transparent)]')} />
      <motion.span aria-hidden style={{ opacity: labelOpacity }} className="pointer-events-none absolute inset-0 flex items-center justify-center pr-2 pl-16 text-[16px] font-semibold">
        {label} →
      </motion.span>
      <motion.button
        type="button"
        aria-label={label}
        style={{ x }}
        onClick={(e) => {
          // Clic sin arrastre (mouse, teclado o lector): confirma igual
          if (e.detail === 0 || x.get() < 4) done()
        }}
        onPointerDown={(e) => {
          drag.current = { x0: e.clientX - x.get(), id: e.pointerId }
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          x.set(Math.max(0, Math.min(max, e.clientX - drag.current.x0)))
        }}
        onPointerUp={() => {
          if (!drag.current) return
          drag.current = null
          if (x.get() > max * 0.82) done()
          else animate(x, 0, { duration: 0.42, ease: ease.calma })
        }}
        onPointerCancel={() => ((drag.current = null), animate(x, 0, { duration: 0.3 }))}
        className="absolute top-1.5 left-1.5 flex h-[52px] w-[52px] touch-none items-center justify-center rounded-full bg-luz text-night shadow-[0_0_22px_-2px_color-mix(in_oklab,var(--luz)_80%,transparent)]"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </motion.button>
    </div>
  )
}

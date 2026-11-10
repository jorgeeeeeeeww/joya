// Editor de plano de mesas profesional: escenas por espacio (salón / jardín), multiselección, guías
// inteligentes, alinear/distribuir, copias en serie, invitados sobre el plano, revisión de pasillos y
// puertas, medir, reglas, minimapa y exportación. Táctil (arrastrar, pellizcar, toque largo) y mouse.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  BoxSelect,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  Grid3x3,
  LayoutTemplate,
  ListOrdered,
  Locate,
  Lock,
  LockOpen,
  Magnet,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Redo2,
  RotateCw,
  Ruler,
  ShieldCheck,
  Spline,
  Trash2,
  Undo2,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { FloorItem, FloorItemType, FloorScene, Guest, RanchEvent } from '@/lib/types'
import { ITEM_SPECS, LAYOUT_STYLES, MAIN_SCENE_ID, SCENE_KIND, autoLayout, eventScenes, furnitureNeeds, itemRect, layoutStats, sceneUpdate, type LayoutStyle } from '@/lib/floorplan'
import { VENUE_SPACES } from '@/lib/layout'
import { db, useCollection } from '@/lib/store'
import { TONE, VENUE } from '@/lib/meta'
import { uid } from '@/lib/format'
import { haptic } from '@/lib/motion'
import { Badge, Button, Segmented, Sheet, cx, toast, useMedia } from '@/components/ui'
import { ItemShape, PAPER, PaletteIcon, SvgDefs, VenueBackground, venueBounds, type SeatInfo } from './canvas'
import { svgToPng, printHtml } from './export'
import {
  alignItems,
  arrayCopies,
  blockedZones,
  clamp,
  collisions,
  computeGuides,
  distributeItems,
  footprint,
  isNumbered,
  narrowAisles,
  overlaps,
  rectOf,
  renumberTables,
  snapV,
  unionRect,
  venueZones,
  type AlignKind,
  type Guide,
} from './geometry'
import { ArraySheet, PaletteSheet, PropertiesContent, SceneSheet, TemplateSheet, type TableGuest } from './sheets'

export { printHtml }

interface View {
  s: number
  tx: number
  ty: number
}
type ColorMode = 'tipo' | 'ocupacion' | 'lado'

// El portapapeles vive mientras la app esté abierta (permite copiar entre escenas)
let clipboard: FloorItem[] = []

const SIDE_TONES = ['rose', 'sky', 'sage', 'butter', 'lavender', 'mint', 'peach'] as const
const rsvp = (g: Guest) => g.rsvp ?? (g.confirmed ? 'confirmado' : 'pendiente')
const initialsOf = (name: string) =>
  name
    .replace(/^Familia\s+/i, '')
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

export default function FloorPlanEditor({ event, sceneId, onSceneChange, readOnly = false }: { event: RanchEvent; sceneId?: string; onSceneChange?: (id: string) => void; readOnly?: boolean }) {
  const scenes = useMemo(() => eventScenes(event), [event])
  const [activeId, setActiveId] = useState(sceneId ?? MAIN_SCENE_ID)
  useEffect(() => {
    if (sceneId) setActiveId(sceneId)
  }, [sceneId])
  const scene: FloorScene = scenes.find((s) => s.id === activeId) ?? scenes[0]!
  const isMain = scene.id === MAIN_SCENE_ID
  const venue = scene.venue
  const { w: W, h: H } = VENUE_SPACES[venue]
  const bounds = useMemo(() => venueBounds(venue), [venue])

  const isPhone = useMedia('(max-width: 639px)')
  const isWide = useMedia('(min-width: 1024px)')

  const [items, setItems] = useState<FloorItem[]>(scene.items)
  const [sel, setSel] = useState<string[]>([])
  const [snap, setSnap] = useState(true)
  const [guidesOn, setGuidesOn] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [showGuests, setShowGuests] = useState(false)
  const [colorMode, setColorMode] = useState<ColorMode>('ocupacion')
  const [checks, setChecks] = useState(true)
  const [areaMode, setAreaMode] = useState(false)
  const [tool, setTool] = useState<'select' | 'measure'>('select')
  const [measure, setMeasure] = useState<{ x: number; y: number }[]>([])
  const [guides, setGuides] = useState<Guide[]>([])
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [view, setView] = useState<View>({ s: 20, tx: 0, ty: 0 })
  const [size, setSize] = useState({ w: 800, h: 560 })
  const [big, setBig] = useState(false)
  const [sheet, setSheet] = useState<null | 'palette' | 'props' | 'array' | 'templates' | 'scene-new' | 'scene-edit' | 'summary' | 'more'>(null)
  const [, force] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const past = useRef<FloorItem[][]>([])
  const future = useRef<FloorItem[][]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const sceneRef = useRef(scene.id)
  const dirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ── Guardado (con retraso, por escena) ──
  const flush = useCallback(() => {
    clearTimeout(saveTimer.current)
    if (!dirty.current || readOnly) return
    dirty.current = false
    const fresh = db.get('events', event.id) ?? event
    db.patch('events', event.id, sceneUpdate(fresh, sceneRef.current, itemsRef.current), { summary: `Actualizó el plano de ${event.title}` })
  }, [event, readOnly])

  // Cambio de evento o de escena: guarda lo pendiente y carga las piezas
  useEffect(() => {
    flush()
    sceneRef.current = scene.id
    setItems(scene.items)
    past.current = []
    future.current = []
    setSel([])
    setMeasure([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, scene.id])

  useEffect(() => {
    if (!dirty.current) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 700)
  }, [items, flush])
  useEffect(() => () => flush(), [flush])

  const commit = useCallback(
    (next: FloorItem[], snapshot?: FloorItem[]) => {
      if (readOnly) return
      past.current.push(snapshot ?? itemsRef.current)
      if (past.current.length > 80) past.current.shift()
      future.current = []
      dirty.current = true
      setItems(next)
    },
    [readOnly],
  )
  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(itemsRef.current)
    dirty.current = true
    setItems(prev)
    force((n) => n + 1)
  }
  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(itemsRef.current)
    dirty.current = true
    setItems(next)
    force((n) => n + 1)
  }

  const selectScene = (id: string) => {
    if (id === activeId) return
    flush()
    setActiveId(id)
    onSceneChange?.(id)
  }

  // ── Vista ──
  const userView = useRef(false)
  const bigRef = useRef(big)
  bigRef.current = big
  const wheelHint = useRef(false)
  const fit = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    userView.current = false
    const cw = el.clientWidth
    const ch = el.clientHeight
    const pad = isPhone ? 10 : 22
    const s = Math.min((cw - pad * 2 - 20) / bounds.w, (ch - pad * 2 - 20) / bounds.h)
    setView({ s, tx: 20 + (cw - 20 - bounds.w * s) / 2 - bounds.x * s, ty: 20 + (ch - 20 - bounds.h * s) / 2 - bounds.y * s })
  }, [bounds, isPhone])
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measureSize = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measureSize()
    fit()
    const ro = new ResizeObserver(() => {
      measureSize()
      if (!userView.current) fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit, big])

  const zoomAt = (factor: number, center?: { x: number; y: number }) => {
    const el = wrapRef.current
    if (!el) return
    const c = center ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 }
    userView.current = true
    setView((v) => {
      const s = clamp(v.s * factor, 4, 140)
      const wx = (c.x - v.tx) / v.s
      const wy = (c.y - v.ty) / v.s
      return { s, tx: c.x - wx * s, ty: c.y - wy * s }
    })
  }
  const centerOn = (wx: number, wy: number) => {
    userView.current = true
    setView((v) => ({ ...v, tx: size.w / 2 - wx * v.s, ty: size.h / 2 - wy * v.s }))
  }

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    // La rueda sola baja la página (no secuestra el scroll). Ctrl + rueda o pellizcar en el trackpad acerca;
    // en pantalla amplia la rueda mueve el plano.
    const onWheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect()
      const at = { x: e.clientX - r.left, y: e.clientY - r.top }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoomAt(Math.exp(-e.deltaY * 0.01), at)
        return
      }
      if (!bigRef.current) {
        if (!wheelHint.current) {
          wheelHint.current = true
          toast.info('Para acercar el plano', 'Usa Ctrl + rueda, pellizca en el trackpad o los botones + y −.')
        }
        return
      }
      e.preventDefault()
      userView.current = true
      if (e.shiftKey) setView((v) => ({ ...v, tx: v.tx - e.deltaY }))
      else setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // ── Revisiones ──
  const badIds = useMemo(() => collisions(items, venue), [items, venue])
  const aisles = useMemo(() => (checks ? narrowAisles(items) : []), [items, checks])
  const blocked = useMemo(() => blockedZones(items, venue), [items, venue])
  const zones = useMemo(() => venueZones(venue).filter((z) => z.w > 0.1), [venue])

  // ── Invitados (solo la recepción) ──
  const guestsByTable = useMemo(() => {
    const m = new Map<number, Guest[]>()
    if (!isMain) return m
    for (const g of event.guestList ?? []) {
      if (g.table === undefined || g.table === null || rsvp(g) === 'declinado') continue
      m.set(g.table, [...(m.get(g.table) ?? []), g])
    }
    return m
  }, [event.guestList, isMain])
  const sides = useMemo(() => [...new Set((event.guestList ?? []).map((g) => g.side).filter(Boolean) as string[])], [event.guestList])
  const tableKey = (it: FloorItem) => (it.type === 'mesa-principal' && !it.number ? 0 : it.number)

  const decorate = (it: FloorItem): { fill?: string; seats?: (SeatInfo | null)[]; diet?: boolean } => {
    if (!showGuests || !isMain || !ITEM_SPECS[it.type].isTable) return {}
    const key = tableKey(it)
    const guests = key === undefined ? [] : guestsByTable.get(key) ?? []
    const people = guests.reduce((n, g) => n + g.count, 0)
    const cap = it.seats ?? 0
    const slots: (SeatInfo | null)[] = Array.from({ length: cap }, () => null)
    const sideTone = (side?: string) => TONE[SIDE_TONES[Math.max(0, sides.indexOf(side ?? '')) % SIDE_TONES.length]!].hex
    let cursor = 0
    const place = (g: Guest, start: number) => {
      for (let k = 0; k < g.count && start + k < cap; k++) slots[start + k] = { label: k === 0 ? initialsOf(g.name) : '·', fill: `color-mix(in oklab, ${sideTone(g.side)} 35%, var(--surface))` }
    }
    for (const g of guests.filter((g) => g.seat !== undefined)) place(g, g.seat!)
    for (const g of guests.filter((g) => g.seat === undefined)) {
      while (cursor < cap && slots[cursor]) cursor++
      place(g, cursor)
      cursor += g.count
    }
    let fill: string | undefined
    if (colorMode === 'ocupacion') fill = people === 0 ? TONE.sky.hex : people < cap ? TONE.sage.hex : people === cap ? TONE.butter.hex : 'var(--danger)'
    else if (colorMode === 'lado' && guests.length) {
      const count = new Map<string, number>()
      for (const g of guests) count.set(g.side ?? '', (count.get(g.side ?? '') ?? 0) + g.count)
      const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      fill = sideTone(top)
    }
    return { fill, seats: slots, diet: guests.some((g) => !!g.diet) }
  }

  // ── Punteros ──
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const longPress = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const gesture = useRef<
    | { kind: 'drag'; ids: string[]; primary: string; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; snapshot: FloorItem[]; moved: boolean; tapSel: string[]; dragSel: string[] | null }
    | { kind: 'pan'; startX: number; startY: number; tx: number; ty: number; moved: boolean; bg?: boolean; additive?: boolean; origin?: { x: number; y: number }; tapSel?: string[] }
    | { kind: 'pinch'; d0: number; s0: number; wx: number; wy: number }
    | { kind: 'marquee'; x0: number; y0: number; additive: boolean }
    | { kind: 'hold' }
    | null
  >(null)

  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const toWorld = (p: { x: number; y: number }, v = view) => ({ x: (p.x - v.tx) / v.s, y: (p.y - v.ty) / v.s })
  const cancelHold = () => clearTimeout(longPress.current)

  const startPinch = () => {
    cancelHold()
    const pts = Array.from(pointers.current.values())
    if (pts.length < 2) return
    const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const w = toWorld(mid)
    const g = gesture.current
    if (g?.kind === 'drag' && g.moved) commit(itemsRef.current, g.snapshot)
    setGuides([])
    setMarquee(null)
    gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: view.s, wx: w.x, wy: w.y }
  }

  const addMeasurePoint = (e: { clientX: number; clientY: number }) => {
    const w = toWorld(local(e))
    const p = { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10 }
    setMeasure((m) => (m.length >= 2 ? [p] : [...m, p]))
  }

  const onPointerDownItem = (e: RPointerEvent, it: FloorItem) => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, local(e))
    if (pointers.current.size >= 2) return startPinch()
    if (tool === 'measure') return addMeasurePoint(e)
    const inSel = sel.includes(it.id)
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSel(inSel ? sel.filter((x) => x !== it.id) : [...sel, it.id])
      gesture.current = { kind: 'hold' }
      return
    }
    // Si la pieza ya está en la selección se arrastra todo el grupo; si no, se elige al soltar o al arrastrar
    const ids = inSel ? sel : [it.id]
    // Toque largo: agrega o quita la pieza de la selección (multiselección táctil)
    cancelHold()
    longPress.current = setTimeout(() => {
      const g = gesture.current
      if ((g?.kind === 'drag' || g?.kind === 'pan') && !g.moved) {
        haptic.select()
        setSel(inSel ? (sel.length > 1 ? sel.filter((x) => x !== it.id) : sel) : [...sel, it.id])
        gesture.current = { kind: 'hold' }
      }
    }, 480)
    const movable = itemsRef.current.filter((i) => ids.includes(i.id) && !i.locked)
    if (readOnly || !movable.length) {
      const p = local(e)
      gesture.current = { kind: 'pan', startX: p.x, startY: p.y, tx: view.tx, ty: view.ty, moved: false, tapSel: [it.id] }
      return
    }
    gesture.current = {
      kind: 'drag',
      ids: movable.map((i) => i.id),
      primary: movable.some((i) => i.id === it.id) ? it.id : movable[0]!.id,
      start: toWorld(local(e)),
      orig: new Map(movable.map((i) => [i.id, { x: i.x, y: i.y }])),
      snapshot: itemsRef.current,
      moved: false,
      tapSel: [it.id],
      dragSel: inSel ? null : [it.id],
    }
  }

  const onPointerDownBg = (e: RPointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, local(e))
    if (pointers.current.size >= 2) return startPinch()
    if (tool === 'measure') return addMeasurePoint(e)
    const p = local(e)
    const w = toWorld(p)
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    if ((areaMode || e.shiftKey) && !readOnly) {
      gesture.current = { kind: 'marquee', x0: w.x, y0: w.y, additive }
      setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y })
      return
    }
    gesture.current = { kind: 'pan', startX: p.x, startY: p.y, tx: view.tx, ty: view.ty, moved: false, bg: true, additive, origin: w }
    // Toque largo en el fondo (táctil): empieza un lazo de selección
    if (e.pointerType === 'touch' && !readOnly) {
      cancelHold()
      longPress.current = setTimeout(() => {
        const g = gesture.current
        if (g?.kind === 'pan' && !g.moved && g.origin) {
          haptic.select()
          gesture.current = { kind: 'marquee', x0: g.origin.x, y0: g.origin.y, additive: true }
          setMarquee({ x0: g.origin.x, y0: g.origin.y, x1: g.origin.x, y1: g.origin.y })
        }
      }, 480)
    }
  }

  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (!g || g.kind === 'hold') return
    if (g.kind === 'pinch') {
      const pts = Array.from(pointers.current.values())
      if (pts.length < 2) return
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const s = clamp((g.s0 * d) / Math.max(1, g.d0), 4, 140)
      userView.current = true
      setView({ s, tx: mid.x - g.wx * s, ty: mid.y - g.wy * s })
      return
    }
    if (g.kind === 'marquee') {
      const w = toWorld(p)
      setMarquee({ x0: g.x0, y0: g.y0, x1: w.x, y1: w.y })
      return
    }
    if (g.kind === 'pan') {
      const dx = p.x - g.startX
      const dy = p.y - g.startY
      if (!g.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        g.moved = true
        userView.current = true
        cancelHold()
      }
      if (g.moved) setView((v) => ({ ...v, tx: g.tx + dx, ty: g.ty + dy }))
      return
    }
    // Arrastre de una o varias piezas
    const w = toWorld(p)
    let dx = w.x - g.start.x
    let dy = w.y - g.start.y
    if (!g.moved && Math.hypot(dx, dy) * view.s < 5) return
    if (!g.moved) {
      g.moved = true
      cancelHold()
      if (g.dragSel) setSel(g.dragSel)
    }
    const byId = new Map(g.snapshot.map((i) => [i.id, i]))
    const rectAt = (ddx: number, ddy: number) => unionRect(g.ids.map((id) => rectOf({ ...byId.get(id)!, x: g.orig.get(id)!.x + ddx, y: g.orig.get(id)!.y + ddy })))
    let lines: Guide[] = []
    let gx = false
    let gy = false
    if (guidesOn) {
      const others = g.snapshot.filter((i) => !g.ids.includes(i.id)).map(rectOf)
      const res = computeGuides(rectAt(dx, dy), others, W, H, 9 / view.s)
      if (res.dx !== null) {
        dx += res.dx
        gx = true
      }
      if (res.dy !== null) {
        dy += res.dy
        gy = true
      }
      lines = res.guides
    }
    if (snap) {
      const o = g.orig.get(g.primary)!
      if (!gx) dx = snapV(o.x + dx) - o.x
      if (!gy) dy = snapV(o.y + dy) - o.y
    }
    setGuides(lines)
    setItems((list) => list.map((it) => (g.orig.has(it.id) ? { ...it, x: clamp(g.orig.get(it.id)!.x + dx, -3, W + 3), y: clamp(g.orig.get(it.id)!.y + dy, -3, H + 3) } : it)))
  }

  const onPointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId)
    cancelHold()
    const g = gesture.current
    if (g?.kind === 'drag') {
      if (g.moved) commit(itemsRef.current, g.snapshot)
      else setSel(g.tapSel)
    }
    if (g?.kind === 'pan' && !g.moved) {
      if (g.tapSel) setSel(g.tapSel)
      else if (g.bg && !g.additive) setSel([])
    }
    if (g?.kind === 'marquee') {
      const box = marquee ? { x: Math.min(marquee.x0, marquee.x1), y: Math.min(marquee.y0, marquee.y1), w: Math.abs(marquee.x1 - marquee.x0), h: Math.abs(marquee.y1 - marquee.y0) } : null
      if (box && box.w + box.h > 0.2) {
        const hit = itemsRef.current.filter((it) => overlaps(rectOf(it), box, 0)).map((i) => i.id)
        setSel((cur) => (g.additive ? [...new Set([...cur, ...hit])] : hit))
        if (hit.length) haptic.select()
      }
      setMarquee(null)
    }
    setGuides([])
    if (pointers.current.size === 1 && g?.kind === 'pinch') {
      const [p] = Array.from(pointers.current.values()) as [{ x: number; y: number }]
      gesture.current = { kind: 'pan', startX: p.x, startY: p.y, tx: view.tx, ty: view.ty, moved: true }
    } else if (pointers.current.size === 0) gesture.current = null
  }

  // ── Acciones ──
  const selected = items.filter((i) => sel.includes(i.id))
  const primary = selected[selected.length - 1] ?? null
  const nextNumber = (list = items) => Math.max(0, ...list.filter((i) => isNumbered(i.type)).map((i) => i.number ?? 0)) + 1

  const addItem = (type: FloorItemType) => {
    if (readOnly) return
    const c = toWorld({ x: size.w / 2, y: size.h / 2 })
    const spec = ITEM_SPECS[type]
    const it: FloorItem = {
      id: uid('fi_'),
      type,
      x: clamp(snapV(c.x), 1, W - 1),
      y: clamp(snapV(c.y), 1, H - 1),
      rot: 0,
      seats: spec.seats,
      number: isNumbered(type) ? nextNumber() : undefined,
      label: type === 'mesa-principal' ? 'Principal' : type === 'mesa-novios' ? 'Novios' : undefined,
    }
    commit([...items, it])
    setSel([it.id])
    haptic.light()
  }

  const patchSel = (patch: Partial<FloorItem> | ((it: FloorItem) => Partial<FloorItem>)) => {
    if (!sel.length) return
    commit(items.map((i) => (sel.includes(i.id) ? { ...i, ...(typeof patch === 'function' ? patch(i) : patch) } : i)))
  }
  const rotateSel = (deg: number) => patchSel((it) => (it.locked ? {} : { rot: (((it.rot + deg) % 360) + 360) % 360 }))
  const duplicateSel = () => {
    if (!selected.length) return
    let n = nextNumber()
    const shift = selected.length > 1 ? 1.5 : Math.max(2.4, footprint(selected[0]!).w + 1.2)
    const copies = selected.map((s) => ({ ...s, id: uid('fi_'), x: clamp(s.x + shift, 0, W), y: selected.length > 1 ? s.y + 1.5 : s.y, locked: false, number: isNumbered(s.type) ? n++ : s.number }))
    commit([...items, ...copies])
    setSel(copies.map((c) => c.id))
  }
  const removeSel = () => {
    if (!sel.length) return
    const locked = selected.filter((s) => s.locked).length
    commit(items.filter((i) => !sel.includes(i.id) || i.locked))
    setSel([])
    if (locked) toast.info(`${locked} piezas bloqueadas no se eliminaron`)
  }
  const seatsDelta = (d: number) => {
    if (!primary) return
    const spec = ITEM_SPECS[primary.type]
    if (spec.seats === undefined) return
    patchSel((it) => (ITEM_SPECS[it.type].seats === undefined ? {} : { seats: clamp((it.seats ?? 0) + d * (it.type === 'sillas-ceremonia' ? 10 : 1), 1, ITEM_SPECS[it.type].maxSeats ?? 300) }))
  }
  const toFront = () => commit([...items.filter((i) => !sel.includes(i.id)), ...items.filter((i) => sel.includes(i.id))])
  const toBack = () => commit([...items.filter((i) => sel.includes(i.id)), ...items.filter((i) => !sel.includes(i.id))])
  const copySel = () => {
    if (!selected.length) return
    clipboard = selected.map((s) => ({ ...s }))
    toast.info(`${selected.length} ${selected.length === 1 ? 'pieza copiada' : 'piezas copiadas'}`)
    force((n) => n + 1)
  }
  const paste = () => {
    if (!clipboard.length || readOnly) return
    let n = nextNumber()
    const c = toWorld({ x: size.w / 2, y: size.h / 2 })
    const box = unionRect(clipboard.map(rectOf))
    const ox = c.x - (box.x + box.w / 2)
    const oy = c.y - (box.y + box.h / 2)
    const copies = clipboard.map((s) => ({ ...s, id: uid('fi_'), x: snapV(s.x + ox), y: snapV(s.y + oy), locked: false, number: isNumbered(s.type) ? n++ : s.number }))
    commit([...items, ...copies])
    setSel(copies.map((x) => x.id))
  }
  const align = (k: AlignKind) => commit(alignItems(items, sel, k))
  const distribute = (axis: 'x' | 'y') => commit(distributeItems(items, sel, axis))
  const renumber = () => {
    const { items: next, map } = renumberTables(items)
    commit(next)
    if (isMain && map.size && event.guestList?.length) {
      const guestList = event.guestList.map((g) => (g.table !== undefined && map.has(g.table) ? { ...g, table: map.get(g.table) } : g))
      db.patch('events', event.id, { guestList }, { summary: `Renumeró las mesas de ${event.title}` })
    }
    toast.success('Mesas renumeradas', isMain ? 'Los invitados conservan su lugar' : 'De arriba hacia abajo, de izquierda a derecha')
  }
  const makeArray = (count: number, mode: 'fila' | 'columna' | 'cuadricula', gap: number, cols: number) => {
    if (!primary) return
    const copies = arrayCopies(primary, count, mode, gap, cols, nextNumber())
    commit([...items, ...copies])
    setSel([primary.id, ...copies.map((c) => c.id)])
    toast.success(`${count} copias creadas`)
  }
  const applyTemplate = (style: LayoutStyle) => {
    commit(autoLayout(venue, event.guests, style))
    setSel([])
    setSheet(null)
    toast.success('Plano generado', `${LAYOUT_STYLES[style].label} para ${event.guests} invitados`)
  }
  const nudge = (dx: number, dy: number) => patchSel((it) => (it.locked ? {} : { x: Math.round((it.x + dx) * 100) / 100, y: Math.round((it.y + dy) * 100) / 100 }))

  // ── Escenas ──
  const saveScene = (data: { name: string; kind: FloorScene['kind']; venue: FloorScene['venue']; time?: string; template: boolean }, editing: boolean) => {
    flush()
    const fresh = db.get('events', event.id) ?? event
    if (editing) {
      if (isMain) {
        if (data.venue !== fresh.venue) {
          db.patch('events', event.id, { venue: data.venue }, { summary: `Cambió el espacio de la recepción de ${event.title}` })
          onSceneChange?.(scene.id)
        }
        return
      }
      db.patch('events', event.id, { scenes: (fresh.scenes ?? []).map((s) => (s.id === scene.id ? { ...s, name: data.name, kind: data.kind, venue: data.venue, time: data.time } : s)) })
      onSceneChange?.(scene.id)
      return
    }
    const style: LayoutStyle = data.kind === 'ceremonia' ? 'ceremonia' : data.kind === 'coctel' ? 'coctel' : 'banquete'
    const sc: FloorScene = { id: uid('sc_'), name: data.name, kind: data.kind, venue: data.venue, time: data.time, items: data.template ? autoLayout(data.venue, event.guests, style) : [] }
    db.patch('events', event.id, { scenes: [...(fresh.scenes ?? []), sc] }, { summary: `Agregó la escena ${sc.name} a ${event.title}` })
    setActiveId(sc.id)
    onSceneChange?.(sc.id)
    toast.success('Escena creada', `${sc.name} en el ${VENUE[sc.venue].label.toLowerCase()}`)
  }
  const deleteScene = () => {
    if (isMain) return
    clearTimeout(saveTimer.current)
    dirty.current = false
    const fresh = db.get('events', event.id) ?? event
    db.patch('events', event.id, { scenes: (fresh.scenes ?? []).filter((s) => s.id !== scene.id) }, { summary: `Eliminó la escena ${scene.name} de ${event.title}` })
    setActiveId(MAIN_SCENE_ID)
    onSceneChange?.(MAIN_SCENE_ID)
    setSheet(null)
  }

  // ── Teclado ──
  const rootRef = useRef<HTMLDivElement>(null)
  const engaged = useRef(false)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      engaged.current = !!rootRef.current?.contains(e.target as Node)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!engaged.current) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (e.key === 'Escape') {
        setSel([])
        setTool('select')
        setMeasure([])
        return
      }
      if (readOnly) return
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        redo()
      } else if (mod && k === 'c') copySel()
      else if (mod && k === 'v') paste()
      else if (mod && k === 'a') {
        e.preventDefault()
        setSel(items.map((i) => i.id))
      } else if (mod && k === 'd') {
        e.preventDefault()
        duplicateSel()
      } else if (sel.length && (e.key === 'Delete' || e.key === 'Backspace')) removeSel()
      else if (sel.length && k === 'r') rotateSel(e.shiftKey ? -15 : 15)
      else if (sel.length && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 0.5 : 0.1
        nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Estadísticas ──
  const stats = layoutStats(items)
  const inventory = useCollection('inventory')
  const furniture = useMemo(() => furnitureNeeds(items, (id) => inventory.find((i) => i.id === id)?.stock ?? 0), [items, inventory])
  const guestsHere = event.guests
  const missingSeats = scene.kind === 'coctel' ? 0 : Math.max(0, guestsHere - stats.seats)
  const areaPer = (W * H) / Math.max(1, Math.max(stats.seats, guestsHere))
  const totalIssues = badIds.size + aisles.filter((a) => a.severe).length + blocked.length

  // ── Exportar ──
  const exportPng = async () => {
    if (!svgRef.current) return
    try {
      const url = await svgToPng(svgRef.current, bounds)
      const a = document.createElement('a')
      a.href = url
      a.download = `Plano · ${event.title} · ${scene.name}.png`
      a.click()
      toast.success('Plano descargado')
    } catch {
      toast.error('No se pudo exportar el plano')
    }
  }
  const printPlan = async () => {
    if (!svgRef.current) return
    let url: string
    try {
      url = await svgToPng(svgRef.current, bounds, 50)
    } catch {
      toast.error('No se pudo preparar la impresión')
      return
    }
    const rows = furniture.map((f) => `<tr><td>${f.label}</td><td class="r">${f.need}</td></tr>`).join('')
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    const tablesHtml = isMain
      ? items
          .filter((i) => ITEM_SPECS[i.type].isTable)
          .map((t) => ({ t, key: tableKey(t) }))
          .filter((x) => x.key !== undefined)
          .sort((a, b) => (a.key ?? 0) - (b.key ?? 0))
          .map(({ t, key }) => {
            const gs = guestsByTable.get(key!) ?? []
            const people = gs.reduce((n, g) => n + g.count, 0)
            return `<div class="tbl"><h3>${key === 0 ? 'Mesa principal' : `Mesa ${key}`}${t.name ? ` · ${esc(t.name)}` : ''} <span class="muted">(${people}/${t.seats ?? 0})</span></h3>${gs.length ? `<ul>${gs.map((g) => `<li>${esc(g.name)}${g.count > 1 ? ` · ${g.count}` : ''}${g.diet ? ` · <em>${esc(g.diet)}</em>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Sin invitados asignados</p>'}</div>`
          })
          .join('')
      : ''
    printHtml(
      `Plano · ${event.title}`,
      `<div class="brand"><div><h1>${esc(event.title)}</h1><div class="muted">${esc(scene.name)} · ${VENUE_SPACES[venue].label} · ${event.date}${scene.time ? ` · ${scene.time}` : ''} · ${event.guests} invitados</div></div><span class="pill">Jardines La Joya</span></div>
       <img src="${url}" />
       <h2>Resumen</h2><table><tr><th>Concepto</th><th class="r">Cantidad</th></tr><tr><td>Mesas</td><td class="r">${stats.tables}</td></tr><tr><td>Lugares</td><td class="r">${stats.seats}</td></tr>${rows}</table>
       ${tablesHtml ? `<h2>Invitados por mesa</h2><div class="tables">${tablesHtml}</div>` : ''}`,
    )
  }

  // ── Datos de la mesa seleccionada ──
  const tableGuests: TableGuest[] | undefined =
    isMain && primary && selected.length === 1 && ITEM_SPECS[primary.type].isTable
      ? (tableKey(primary) !== undefined ? guestsByTable.get(tableKey(primary)!) ?? [] : []).map((g) => ({ id: g.id, name: g.name, count: g.count, diet: g.diet }))
      : undefined

  // ── Reglas ──
  const rulerStep = view.s >= 22 ? 1 : view.s >= 9 ? 2 : 5
  const ticksX: number[] = []
  const ticksY: number[] = []
  for (let x = Math.ceil(((20 - view.tx) / view.s) / rulerStep) * rulerStep; x <= (size.w - view.tx) / view.s; x += rulerStep) ticksX.push(x)
  for (let y = Math.ceil(((20 - view.ty) / view.s) / rulerStep) * rulerStep; y <= (size.h - view.ty) / view.s; y += rulerStep) ticksY.push(y)

  const props = (
    <PropertiesContent
      items={selected}
      palette={event.palette}
      readOnly={readOnly}
      onPatch={patchSel}
      onAlign={align}
      onDistribute={distribute}
      onDuplicate={duplicateSel}
      onArray={() => setSheet('array')}
      onDelete={removeSel}
      onFront={toFront}
      onBack={toBack}
      tableGuests={tableGuests}
      guestsLink={isMain ? `/invitados?e=${event.id}&v=mesas` : undefined}
    />
  )

  const summary = (
    <>
      <div className="card p-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="display-num text-[1.9rem]">{stats.tables}</div>
            <div className="mt-1 text-xs text-detail">Mesas</div>
          </div>
          <div>
            <div className={cx('display-num text-[1.9rem]', missingSeats ? 'text-danger' : 'text-success')}>{stats.seats}</div>
            <div className="mt-1 text-xs text-detail">Lugares</div>
          </div>
          <div>
            <div className="display-num text-[1.9rem]">{guestsHere}</div>
            <div className="mt-1 text-xs text-detail">Invitados</div>
          </div>
        </div>
        {missingSeats > 0 ? (
          <div className="mt-4 flex items-start gap-2 rounded-[14px] bg-[color-mix(in_oklab,var(--danger)_10%,var(--surface))] p-3 text-sm text-danger">
            <AlertTriangle size={16} strokeWidth={1.6} className="mt-0.5 shrink-0" />
            Faltan {missingSeats} lugares para todos los invitados.
          </div>
        ) : (
          <div className="mt-4 rounded-[14px] bg-[color-mix(in_oklab,var(--success)_10%,var(--surface))] p-3 text-sm text-success">{scene.kind === 'coctel' ? 'Cóctel: invitados de pie con periqueras y lounges.' : `Hay lugar para todos (${stats.seats - guestsHere} libres).`}</div>
        )}
        <p className="mt-3 text-xs text-detail">
          {areaPer.toFixed(1)} m² por persona · recomendado {scene.kind === 'coctel' ? '0.9' : scene.kind === 'ceremonia' ? '0.8' : '1.3'} m² o más
        </p>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="heading text-lg">Revisión del plano</h4>
          {totalIssues === 0 ? <Badge tone="sage">Todo en orden</Badge> : <Badge tone="rose">{totalIssues} por revisar</Badge>}
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-start gap-2">
            <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', badIds.size ? 'bg-danger' : 'bg-success')} />
            {badIds.size ? `${badIds.size} piezas se enciman o salen del espacio` : 'Ninguna pieza encimada ni fuera del espacio'}
          </li>
          <li className="flex items-start gap-2">
            <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', aisles.some((a) => a.severe) ? 'bg-danger' : aisles.length ? 'bg-warning' : 'bg-success')} />
            {checks ? (aisles.length ? `${aisles.length} pasillos de menos de 1.2 m (${aisles.filter((a) => a.severe).length} muy angostos)` : 'Pasillos de 1.2 m o más entre mesas') : 'Revisión de pasillos apagada'}
          </li>
          <li className="flex items-start gap-2">
            <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', blocked.some((b) => b.zone.kind === 'puerta') ? 'bg-danger' : blocked.length ? 'bg-warning' : 'bg-success')} />
            {blocked.length ? blocked.map((b) => `${b.zone.label}: ${b.ids.length} ${b.ids.length === 1 ? 'pieza' : 'piezas'}`).join(' · ') : venue === 'salon' ? 'Puertas despejadas' : 'Caminos del jardín despejados'}
          </li>
        </ul>
      </div>

      {showGuests && isMain && (
        <div className="card p-5">
          <h4 className="heading mb-3 text-lg">Colores de las mesas</h4>
          {colorMode === 'ocupacion' ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Libre', TONE.sky.hex],
                ['Con lugar', TONE.sage.hex],
                ['Llena', TONE.butter.hex],
                ['Excedida', 'var(--danger)'],
              ].map(([l, c]) => (
                <span key={l} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </div>
          ) : colorMode === 'lado' ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {sides.map((s, i) => (
                <span key={s} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: TONE[SIDE_TONES[i % SIDE_TONES.length]!].hex }} />
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Cada pieza con su color de tipo o de mantel.</p>
          )}
        </div>
      )}

      <div className="card p-5">
        <h4 className="heading mb-3 text-lg">Mobiliario vs inventario</h4>
        {furniture.length === 0 && <p className="text-sm text-ink-soft">Agrega mesas para calcular el mobiliario.</p>}
        <div className="flex flex-col gap-2.5">
          {furniture.map((f) => {
            const ok = f.have >= f.need
            return (
              <div key={f.label}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{f.label}</span>
                  <Badge tone={ok ? 'sage' : 'rose'}>
                    {f.need} / {f.have}
                  </Badge>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
                  <div className={cx('h-full rounded-full', ok ? 'bg-success' : 'bg-danger')} style={{ width: `${Math.min(100, (f.need / Math.max(1, f.have)) * 100)}%` }} />
                </div>
                {!ok && <p className="mt-1 text-xs text-danger">Faltan {f.need - f.have}: hay que rentar o reacomodar.</p>}
                {f.hint && ok && <p className="mt-1 text-xs text-ink-3">{f.hint}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )

  const measureDist = measure.length === 2 ? Math.hypot(measure[1]!.x - measure[0]!.x, measure[1]!.y - measure[0]!.y) : null
  const canvasH = big ? 'h-[calc(100dvh-210px)] min-h-[420px]' : isPhone ? 'h-[62dvh] min-h-[360px]' : 'h-[min(68dvh,760px)] min-h-[420px]'

  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-3">
      {/* ── Escenas ── */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2 py-0.5">
          {scenes.map((sc) => {
            const on = sc.id === scene.id
            return (
              <button
                key={sc.id}
                onClick={() => selectScene(sc.id)}
                className={cx('pressable flex h-11 shrink-0 items-center gap-2 rounded-full pr-4 pl-1.5 text-sm transition-colors', on ? 'bg-ink text-paper' : 'bg-surface ring-1 ring-line hover:bg-wash')}
              >
                <span className={cx('flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-medium', on ? 'bg-[color-mix(in_oklab,var(--paper)_18%,transparent)]' : TONE[SCENE_KIND[sc.kind].tone].soft)}>
                  {sc.time ?? SCENE_KIND[sc.kind].label.slice(0, 1)}
                </span>
                <span>
                  {sc.name} <span className={on ? 'opacity-70' : 'text-ink-soft'}>· {VENUE[sc.venue].label}</span>
                </span>
              </button>
            )
          })}
        </div>
        {!readOnly && (
          <>
            <Button variant="outline" size="icon" aria-label="Editar escena" onClick={() => setSheet('scene-edit')}>
              <Pencil size={17} strokeWidth={1.6} />
            </Button>
            <Button variant="secondary" size={isPhone ? 'icon' : 'md'} icon={<Plus size={17} strokeWidth={1.6} />} onClick={() => setSheet('scene-new')} aria-label="Nueva escena">
              {!isPhone && 'Escena'}
            </Button>
          </>
        )}
      </div>

      {/* ── Herramientas ── */}
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
          {!readOnly && (
            <>
              <ToolBtn label="Deshacer" onClick={undo} disabled={!past.current.length}>
                <Undo2 size={18} strokeWidth={1.6} />
              </ToolBtn>
              <ToolBtn label="Rehacer" onClick={redo} disabled={!future.current.length}>
                <Redo2 size={18} strokeWidth={1.6} />
              </ToolBtn>
              <Divider />
              <button onClick={() => setSheet('palette')} className="pressable inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-sm text-on-primary shadow-[var(--shadow-1)]">
                <Plus size={17} strokeWidth={1.6} /> Agregar
              </button>
              <ToolBtn label="Plantillas" onClick={() => setSheet('templates')} showLabel={isWide}>
                <LayoutTemplate size={18} strokeWidth={1.6} />
              </ToolBtn>
              <Divider />
              <ToolBtn label="Seleccionar área" active={areaMode} onClick={() => setAreaMode((v) => !v)}>
                <BoxSelect size={18} strokeWidth={1.6} />
              </ToolBtn>
            </>
          )}
          <ToolBtn
            label="Medir"
            active={tool === 'measure'}
            onClick={() => {
              setTool((t) => (t === 'measure' ? 'select' : 'measure'))
              setMeasure([])
            }}
            showLabel={isWide}
          >
            <Ruler size={18} strokeWidth={1.6} />
          </ToolBtn>
          {isMain && (
            <ToolBtn label="Ver invitados" active={showGuests} onClick={() => setShowGuests((v) => !v)} showLabel={isWide}>
              <Users size={18} strokeWidth={1.6} />
            </ToolBtn>
          )}
          <ToolBtn label="Revisar pasillos" active={checks} onClick={() => setChecks((v) => !v)} showLabel={isWide}>
            <ShieldCheck size={18} strokeWidth={1.6} />
          </ToolBtn>
          {!readOnly && (
            <>
              <Divider />
              <ToolBtn label="Imán" active={snap} onClick={() => setSnap((v) => !v)}>
                <Magnet size={18} strokeWidth={1.6} />
              </ToolBtn>
              <ToolBtn label="Guías inteligentes" active={guidesOn} onClick={() => setGuidesOn((v) => !v)}>
                <Spline size={18} strokeWidth={1.6} />
              </ToolBtn>
            </>
          )}
          <ToolBtn label="Cuadrícula" active={showGrid} onClick={() => setShowGrid((v) => !v)}>
            <Grid3x3 size={18} strokeWidth={1.6} />
          </ToolBtn>
          <Divider />
          <ToolBtn label="Más opciones" onClick={() => setSheet('more')}>
            <MoreHorizontal size={18} strokeWidth={1.6} />
          </ToolBtn>
          <ToolBtn label={big ? 'Vista normal' : 'Pantalla amplia'} onClick={() => setBig((b) => !b)}>
            {big ? <Minimize2 size={18} strokeWidth={1.6} /> : <Maximize2 size={18} strokeWidth={1.6} />}
          </ToolBtn>
        </div>
        {showGuests && isMain && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-detail">Color por</span>
            <Segmented
              size="sm"
              value={colorMode}
              onChange={setColorMode}
              options={[
                { value: 'ocupacion', label: 'Ocupación' },
                { value: 'lado', label: 'Lado' },
                { value: 'tipo', label: 'Tipo' },
              ]}
            />
          </div>
        )}
      </div>

      <div className={cx('flex min-w-0 flex-col gap-4', !big && 'lg:flex-row')}>
        <div className="min-w-0 flex-1">
          {/* ── Lienzo ── */}
          <div ref={wrapRef} className={cx('relative overflow-hidden rounded-[var(--r-lg)] bg-sunken shadow-[var(--shadow-1)] ring-1 ring-line transition-[height] duration-[var(--dur-4)] ease-[var(--ease-calma)]', canvasH)}>
            <svg
              ref={svgRef}
              className="h-full w-full touch-none select-none"
              style={{ cursor: tool === 'measure' ? 'crosshair' : areaMode ? 'cell' : gesture.current?.kind === 'pan' ? 'grabbing' : 'grab' }}
              onPointerDown={onPointerDownBg}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="application"
              aria-label={`Plano de ${scene.name} en ${VENUE[venue].label}`}
            >
              <SvgDefs />
              <rect data-ui="" x={0} y={0} width="100%" height="100%" fill={PAPER.canvas} />
              <g data-world="" transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
                <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill={PAPER.world} />
                <g style={{ pointerEvents: 'none' }}>
                  <VenueBackground venue={venue} grid={showGrid} />
                </g>
                {checks && (
                  <g style={{ pointerEvents: 'none' }}>
                    {zones.map((z) => {
                      const hit = blocked.some((b) => b.zone.label === z.label)
                      return <rect key={z.label} x={z.x} y={z.y} width={z.w} height={z.h} rx={0.2} fill={hit ? 'url(#fp-hatch)' : z.kind === 'puerta' ? PAPER.door : PAPER.path2} opacity={hit ? 1 : 0.7} />
                    })}
                    {aisles.map((a, i) => (
                      <rect key={i} x={a.x} y={a.y} width={a.w} height={a.h} fill={PAPER.bad} fillOpacity={a.severe ? 0.32 : 0.16} />
                    ))}
                  </g>
                )}
                {items.map((it) => {
                  const d = decorate(it)
                  return (
                    <g key={it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`} onPointerDown={(e) => onPointerDownItem(e, it)} style={{ cursor: readOnly ? 'pointer' : it.locked ? 'not-allowed' : 'move' }}>
                      <ItemShape it={it} selected={sel.includes(it.id)} bad={badIds.has(it.id)} fill={d.fill} seats={d.seats} diet={d.diet} />
                    </g>
                  )
                })}
                <g data-ui="" style={{ pointerEvents: 'none' }}>
                  {guides.map((g, i) => (g.axis === 'x' ? <line key={i} x1={g.at} x2={g.at} y1={g.from} y2={g.to} stroke={PAPER.guide} strokeWidth={1.2 / view.s} strokeDasharray={`${4 / view.s} ${3 / view.s}`} /> : <line key={i} y1={g.at} y2={g.at} x1={g.from} x2={g.to} stroke={PAPER.guide} strokeWidth={1.2 / view.s} strokeDasharray={`${4 / view.s} ${3 / view.s}`} />))}
                  {marquee && <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)} fill={PAPER.selected} fillOpacity={0.08} stroke={PAPER.selected} strokeWidth={1.2 / view.s} strokeDasharray={`${5 / view.s} ${3 / view.s}`} />}
                  {measure.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={5 / view.s} fill={PAPER.guide} />
                  ))}
                  {measure.length === 2 && measureDist !== null && (
                    <g>
                      <line x1={measure[0]!.x} y1={measure[0]!.y} x2={measure[1]!.x} y2={measure[1]!.y} stroke={PAPER.guide} strokeWidth={2 / view.s} />
                      <g transform={`translate(${(measure[0]!.x + measure[1]!.x) / 2} ${(measure[0]!.y + measure[1]!.y) / 2})`}>
                        <rect x={-34 / view.s} y={-13 / view.s} width={68 / view.s} height={26 / view.s} rx={13 / view.s} fill={PAPER.floor} stroke={PAPER.guide} strokeWidth={1 / view.s} />
                        <text textAnchor="middle" dominantBaseline="central" fontSize={12 / view.s} fontWeight={600} fill={PAPER.ink} style={{ fontFamily: 'Geist Variable, system-ui' }}>
                          {measureDist.toFixed(2)} m
                        </text>
                      </g>
                    </g>
                  )}
                </g>
              </g>
              {/* Reglas en metros */}
              <g data-ui="" style={{ pointerEvents: 'none' }}>
                <rect x={0} y={0} width="100%" height={20} fill={PAPER.world} opacity={0.92} />
                <rect x={0} y={0} width={20} height="100%" fill={PAPER.world} opacity={0.92} />
                {ticksX.map((x) => (
                  <g key={'tx' + x} transform={`translate(${view.tx + x * view.s} 0)`}>
                    <line y1={x % (rulerStep * 5) === 0 ? 8 : 14} y2={20} stroke={PAPER.ink3} strokeWidth={1} />
                    {x % (rulerStep * 5) === 0 && (
                      <text x={3} y={10} fontSize={9} fill={PAPER.ink3} style={{ fontFamily: 'Geist Variable, system-ui' }}>
                        {x}
                      </text>
                    )}
                  </g>
                ))}
                {ticksY.map((y) => (
                  <g key={'ty' + y} transform={`translate(0 ${view.ty + y * view.s})`}>
                    <line x1={y % (rulerStep * 5) === 0 ? 8 : 14} x2={20} stroke={PAPER.ink3} strokeWidth={1} />
                    {y % (rulerStep * 5) === 0 && (
                      <text x={2} y={-3} fontSize={9} fill={PAPER.ink3} style={{ fontFamily: 'Geist Variable, system-ui' }}>
                        {y}
                      </text>
                    )}
                  </g>
                ))}
                <rect x={0} y={0} width={20} height={20} fill={PAPER.world} />
                <text x={10} y={13} textAnchor="middle" fontSize={8} fill={PAPER.ink3} style={{ fontFamily: 'Geist Variable, system-ui' }}>
                  m
                </text>
              </g>
            </svg>

            {/* Barra de la selección */}
            <AnimatePresence>
              {selected.length > 0 && (
                <motion.div
                  key="sel"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute top-7 left-1/2 z-10 max-w-[calc(100%-48px)] -translate-x-1/2"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="glass no-scrollbar flex items-center gap-0.5 overflow-x-auto rounded-full p-1 shadow-[var(--shadow-3)] ring-1 ring-line">
                    <span className="shrink-0 px-3 text-xs font-medium whitespace-nowrap text-detail">
                      {selected.length > 1 ? `${selected.length} piezas` : `${ITEM_SPECS[primary!.type].label}${primary!.number ? ` ${primary!.number}` : ''}`}
                    </span>
                    {!readOnly && (
                      <>
                        <TbBtn label="Girar 15°" onClick={() => rotateSel(15)}>
                          <RotateCw size={17} strokeWidth={1.6} />
                        </TbBtn>
                        {selected.length === 1 && ITEM_SPECS[primary!.type].seats !== undefined && (
                          <>
                            <TbBtn label="Quitar lugar" onClick={() => seatsDelta(-1)}>
                              <Minus size={17} strokeWidth={1.6} />
                            </TbBtn>
                            <span className="min-w-7 shrink-0 text-center text-sm font-medium tabular">{primary!.seats}</span>
                            <TbBtn label="Agregar lugar" onClick={() => seatsDelta(1)}>
                              <Plus size={17} strokeWidth={1.6} />
                            </TbBtn>
                          </>
                        )}
                        <TbBtn label="Duplicar" onClick={duplicateSel}>
                          <Copy size={17} strokeWidth={1.6} />
                        </TbBtn>
                        <TbBtn label={selected.every((s) => s.locked) ? 'Desbloquear' : 'Bloquear'} onClick={() => patchSel({ locked: !selected.every((s) => s.locked) })}>
                          {selected.every((s) => s.locked) ? <LockOpen size={17} strokeWidth={1.6} /> : <Lock size={17} strokeWidth={1.6} />}
                        </TbBtn>
                      </>
                    )}
                    {(!isWide || big) && (
                      <TbBtn label="Propiedades" onClick={() => setSheet('props')}>
                        <Pencil size={17} strokeWidth={1.6} />
                      </TbBtn>
                    )}
                    {!readOnly && (
                      <TbBtn label="Eliminar" onClick={removeSel} danger>
                        <Trash2 size={17} strokeWidth={1.6} />
                      </TbBtn>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Minimapa */}
            {!isPhone && tool !== 'measure' && !areaMode && <Minimap bounds={bounds} items={items} view={view} size={size} onJump={centerOn} className="absolute bottom-3 left-7" />}

            {/* Zoom */}
            <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
              <FloatBtn label="Acercar" onClick={() => zoomAt(1.25)}>
                <ZoomIn size={18} strokeWidth={1.6} />
              </FloatBtn>
              <FloatBtn label="Alejar" onClick={() => zoomAt(0.8)}>
                <ZoomOut size={18} strokeWidth={1.6} />
              </FloatBtn>
              <FloatBtn label="Ajustar al recinto" onClick={fit}>
                <Locate size={18} strokeWidth={1.6} />
              </FloatBtn>
            </div>

            {/* Avisos de herramientas */}
            <AnimatePresence>
              {(tool === 'measure' || areaMode) && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="glass pointer-events-none absolute bottom-3 left-1/2 max-w-[60%] -translate-x-1/2 rounded-full px-4 py-2 text-center text-xs text-ink shadow-[var(--shadow-2)] ring-1 ring-line">
                  {tool === 'measure' ? (measureDist !== null ? `${measureDist.toFixed(2)} m · toca para medir de nuevo` : 'Toca dos puntos para medir') : 'Arrastra para seleccionar varias piezas'}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Paleta rápida (tablet y escritorio) */}
          {!readOnly && !isPhone && (
            <div className="mt-3 flex flex-wrap gap-2 pb-1">
              {(['mesa-redonda', 'mesa-rectangular', 'mesa-imperial', 'periquera', 'pista', 'barra', 'dj'] as FloorItemType[])
                .map((t) => (
                  <button key={t} onClick={() => addItem(t)} className="pressable flex h-12 shrink-0 items-center gap-2 rounded-full bg-surface py-1 pr-4 pl-1.5 text-sm shadow-[var(--shadow-1)] ring-1 ring-line hover:shadow-[var(--shadow-2)]" title={`Agregar ${ITEM_SPECS[t].label.toLowerCase()}`}>
                    <PaletteIcon type={t} size={34} />
                    <span>{ITEM_SPECS[t].label}</span>
                  </button>
                ))}
              <button onClick={() => setSheet('palette')} className="pressable flex h-12 items-center gap-2 rounded-full px-4 text-sm text-ink-soft ring-1 ring-line-strong ring-inset hover:bg-wash hover:text-ink">
                <Plus size={16} strokeWidth={1.6} /> Ver todo
              </button>
            </div>
          )}

          {/* Resumen debajo del lienzo en pantallas medianas y angostas */}
          {(!isWide || big) && (
            <div className="mt-4">
              {isPhone ? (
                <button onClick={() => setSheet('summary')} className="card pressable flex w-full items-center justify-between gap-3 p-4 text-left">
                  <span>
                    <span className="block font-medium">
                      {stats.tables} mesas · {stats.seats} lugares
                    </span>
                    <span className={cx('block text-sm', totalIssues || missingSeats ? 'text-danger' : 'text-success')}>{totalIssues || missingSeats ? `${totalIssues + (missingSeats ? 1 : 0)} cosas por revisar` : 'Todo en orden'}</span>
                  </span>
                  <Eye size={18} strokeWidth={1.6} className="text-ink-soft" />
                </button>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">{summary}</div>
              )}
            </div>
          )}
          <p className="mt-3 px-1 text-xs leading-relaxed text-detail">
            Arrastra con el dedo o el mouse · pellizca para acercar · toque largo para seleccionar varias.{isWide && !readOnly ? ' Atajos: R gira, flechas mueven, Ctrl+C / Ctrl+V copia y pega, Ctrl+Z deshace, Supr elimina.' : ''}
          </p>
        </div>

        {/* Panel lateral (escritorio y tablet horizontal) */}
        {isWide && !big && (
          <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[300px] xl:w-[320px]">
            {selected.length > 0 && <div className="card p-5">{props}</div>}
            {summary}
          </aside>
        )}
      </div>

      {/* ── Hojas ── */}
      <PaletteSheet open={sheet === 'palette'} onClose={() => setSheet(null)} onPick={addItem} venue={venue} />
      <TemplateSheet open={sheet === 'templates'} onClose={() => setSheet(null)} onApply={applyTemplate} guests={event.guests} venue={venue} />
      <ArraySheet open={sheet === 'array'} onClose={() => setSheet(null)} onApply={makeArray} />
      <SceneSheet open={sheet === 'scene-new'} onClose={() => setSheet(null)} onSave={(d) => saveScene(d, false)} guests={event.guests} />
      <SceneSheet open={sheet === 'scene-edit'} onClose={() => setSheet(null)} scene={scene} isMain={isMain} onSave={(d) => saveScene(d, true)} onDelete={deleteScene} guests={event.guests} />
      <Sheet open={sheet === 'props' && selected.length > 0} onClose={() => setSheet(null)} title="Propiedades">
        {props}
      </Sheet>
      <Sheet open={sheet === 'summary'} onClose={() => setSheet(null)} title="Resumen del plano" subtitle={`${scene.name} · ${VENUE[venue].label}`}>
        <div className="flex flex-col gap-4">{summary}</div>
      </Sheet>
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title="Más opciones" subtitle={`${scene.name} · ${VENUE[venue].label}`}>
        <div className="grid gap-2 @xl:grid-cols-2">
          {!readOnly && (
            <>
              <MoreRow icon={<ListOrdered size={18} strokeWidth={1.6} />} title="Renumerar mesas" body="Por filas, de arriba hacia abajo; los invitados conservan su mesa" onClick={() => (renumber(), setSheet(null))} />
              <MoreRow icon={<ClipboardPaste size={18} strokeWidth={1.6} />} title="Pegar" body={clipboard.length ? `${clipboard.length} piezas copiadas` : 'Copia piezas primero (también entre escenas)'} disabled={!clipboard.length} onClick={() => (paste(), setSheet(null))} />
              <MoreRow icon={<Copy size={18} strokeWidth={1.6} />} title="Copiar selección" body={selected.length ? `${selected.length} piezas` : 'Selecciona piezas primero'} disabled={!selected.length} onClick={() => (copySel(), setSheet(null))} />
              <MoreRow icon={<BoxSelect size={18} strokeWidth={1.6} />} title="Seleccionar todo" body={`${items.length} piezas en esta escena`} onClick={() => (setSel(items.map((i) => i.id)), setSheet(null))} />
            </>
          )}
          <MoreRow icon={<Download size={18} strokeWidth={1.6} />} title="Descargar imagen" body="PNG del plano para proveedores" onClick={() => (void exportPng(), setSheet(null))} />
          <MoreRow icon={<Printer size={18} strokeWidth={1.6} />} title="Imprimir o PDF" body={isMain ? 'Plano, resumen e invitados por mesa' : 'Plano y resumen'} onClick={() => (void printPlan(), setSheet(null))} />
        </div>
      </Sheet>
    </div>
  )
}

// ── Piezas de UI ─────────────────────────────────────────
function Divider() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-line-strong" />
}

function ToolBtn({ children, label, onClick, active, disabled, showLabel }: { children: ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean; showLabel?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cx(
        'pressable inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm disabled:opacity-40',
        showLabel ? 'px-4' : 'w-11',
        active ? 'bg-ink text-paper' : 'text-ink-soft ring-1 ring-line-strong ring-inset hover:bg-wash hover:text-ink',
      )}
    >
      {children}
      {showLabel && <span className="whitespace-nowrap">{label}</span>}
    </button>
  )
}

function TbBtn({ children, onClick, label, danger }: { children: ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cx('pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full', danger ? 'text-danger hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]' : 'text-ink-soft hover:bg-wash hover:text-ink')}>
      {children}
    </button>
  )
}

function FloatBtn({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} onPointerDown={(e) => e.stopPropagation()} aria-label={label} title={label} className="glass pressable flex h-11 w-11 items-center justify-center rounded-full text-ink-soft shadow-[var(--shadow-1)] ring-1 ring-line hover:text-ink">
      {children}
    </button>
  )
}

function MoreRow({ icon, title, body, onClick, disabled }: { icon: ReactNode; title: string; body: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="pressable flex items-start gap-3 rounded-[var(--r-md)] p-3 text-left ring-1 ring-line hover:bg-wash disabled:opacity-45">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-soft">{icon}</span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-ink-soft">{body}</span>
      </span>
    </button>
  )
}

function Minimap({ bounds, items, view, size, onJump, className }: { bounds: { x: number; y: number; w: number; h: number }; items: FloorItem[]; view: View; size: { w: number; h: number }; onJump: (x: number, y: number) => void; className?: string }) {
  const W = 132
  const k = W / bounds.w
  const Hh = bounds.h * k
  const vx = (-view.tx / view.s - bounds.x) * k
  const vy = (-view.ty / view.s - bounds.y) * k
  const vw = (size.w / view.s) * k
  const vh = (size.h / view.s) * k
  const dragging = useRef(false)
  const jump = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onJump(bounds.x + (e.clientX - r.left) / k, bounds.y + (e.clientY - r.top) / k)
  }
  return (
    <div className={cx('glass rounded-[14px] p-1.5 shadow-[var(--shadow-2)] ring-1 ring-line', className)} onPointerDown={(e) => e.stopPropagation()}>
      <svg
        width={W}
        height={Hh}
        className="block touch-none"
        aria-label="Minimapa"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          jump(e)
        }}
        onPointerMove={(e) => dragging.current && jump(e)}
        onPointerUp={() => (dragging.current = false)}
      >
        <rect width={W} height={Hh} rx={6} fill={PAPER.floor} />
        {items.map((it) => {
          const r = itemRect(it)
          return <rect key={it.id} x={(r.x - bounds.x) * k} y={(r.y - bounds.y) * k} width={Math.max(1.5, r.w * k)} height={Math.max(1.5, r.h * k)} rx={1} fill={TONE[ITEM_SPECS[it.type].tone].hex} opacity={0.8} />
        })}
        <rect x={vx} y={vy} width={vw} height={vh} fill="none" stroke={PAPER.selected} strokeWidth={1.5} rx={3} />
      </svg>
    </div>
  )
}

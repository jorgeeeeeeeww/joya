// Geometría del plano de mesas: huellas, choques, pasillos, guías inteligentes, alinear/distribuir y renumerar.
import type { FloorItem, FloorItemType, Venue } from '@/lib/types'
import { ITEM_SPECS, itemRect } from '@/lib/floorplan'
import { VENUE_SPACES } from '@/lib/layout'
import { uid } from '@/lib/format'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const SNAP = 0.5
export const MIN_AISLE = 1.2 // metros libres entre mesas (con sillas) para que pasen meseros e invitados
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const snapV = (v: number, step = SNAP) => Math.round(v / step) * step

/** Piezas que pueden encimarse con otras (decoración, lona de la carpa) */
export const NO_COLLIDE = new Set<FloorItemType>(['carpa', 'arco', 'letrero', 'planta'])
/** Piezas que no cuentan para revisar pasillos */
const NO_AISLE = new Set<FloorItemType>(['carpa', 'arco', 'letrero', 'planta', 'pasillo'])

/** Grupos de la paleta */
export const PALETTE_GROUPS: { name: string; types: FloorItemType[] }[] = [
  { name: 'Mesas', types: ['mesa-redonda', 'mesa-rectangular', 'mesa-cuadrada', 'mesa-imperial', 'mesa-principal', 'mesa-novios', 'mesa-media-luna', 'periquera'] },
  { name: 'Ceremonia', types: ['sillas-ceremonia', 'arco', 'pasillo', 'tarima'] },
  { name: 'Zonas', types: ['pista', 'escenario', 'lounge', 'photobooth', 'carpa'] },
  { name: 'Servicio', types: ['dj', 'buffet', 'barra', 'pastel', 'regalos', 'mesa-dulces'] },
  { name: 'Decoración', types: ['letrero', 'planta'] },
]

/** Mesas que se numeran (la principal y la de novios llevan nombre, no número) */
export const isNumbered = (t: FloorItemType) => ITEM_SPECS[t].isTable && t !== 'mesa-principal' && t !== 'mesa-novios'

export function rectOf(it: FloorItem): Rect {
  return itemRect(it)
}

/** Huella con sillas (para choques y pasillos realistas) */
export function footprint(it: FloorItem): Rect {
  const r = itemRect(it)
  const spec = ITEM_SPECS[it.type]
  const pad = spec.isTable && it.type !== 'periquera' ? 0.45 : 0
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }
}

export const overlaps = (a: Rect, b: Rect, eps = 0.05) => a.x < b.x + b.w - eps && a.x + a.w > b.x + eps && a.y < b.y + b.h - eps && a.y + a.h > b.y + eps

export function unionRect(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 }
  const x0 = Math.min(...rects.map((r) => r.x))
  const y0 = Math.min(...rects.map((r) => r.y))
  const x1 = Math.max(...rects.map((r) => r.x + r.w))
  const y1 = Math.max(...rects.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Piezas que se enciman, salen del recinto o pisan la glorieta */
export function collisions(items: FloorItem[], venue: Venue): Set<string> {
  const { w: W, h: H } = VENUE_SPACES[venue]
  const bad = new Set<string>()
  const obstacle = venue === 'jardin' ? VENUE_SPACES.jardin.obstacle : null
  const list = items.map((it) => ({ it, r: itemRect(it), f: footprint(it) }))
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!
    if (a.r.x < -0.01 || a.r.y < -0.01 || a.r.x + a.r.w > W + 0.01 || a.r.y + a.r.h > H + 0.01) bad.add(a.it.id)
    if (NO_COLLIDE.has(a.it.type)) continue
    if (obstacle) {
      const cx = clamp(obstacle.x, a.r.x, a.r.x + a.r.w)
      const cy = clamp(obstacle.y, a.r.y, a.r.y + a.r.h)
      if (Math.hypot(cx - obstacle.x, cy - obstacle.y) < obstacle.r) bad.add(a.it.id)
    }
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!
      if (NO_COLLIDE.has(b.it.type)) continue
      if (overlaps(a.f, b.r) || overlaps(b.f, a.r)) {
        bad.add(a.it.id)
        bad.add(b.it.id)
      }
    }
  }
  return bad
}

export interface Aisle extends Rect {
  gap: number
  severe: boolean
}

/** Pasillos más angostos que MIN_AISLE entre piezas que se dan la cara */
export function narrowAisles(items: FloorItem[]): Aisle[] {
  const solid = items.filter((i) => !NO_AISLE.has(i.type)).map((it) => footprint(it))
  const out: Aisle[] = []
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i]!
      const b = solid[j]!
      const ovY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      const ovX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      // separación horizontal (se miran de lado)
      if (ovY > 0.4) {
        const left = a.x + a.w <= b.x ? a : b
        const right = left === a ? b : a
        const gap = right.x - (left.x + left.w)
        if (gap > 0.02 && gap < MIN_AISLE - 0.01) out.push({ x: left.x + left.w, y: Math.max(a.y, b.y), w: gap, h: ovY, gap, severe: gap < 0.7 })
      }
      if (ovX > 0.4) {
        const top = a.y + a.h <= b.y ? a : b
        const bottom = top === a ? b : a
        const gap = bottom.y - (top.y + top.h)
        if (gap > 0.02 && gap < MIN_AISLE - 0.01) out.push({ x: Math.max(a.x, b.x), y: top.y + top.h, w: ovX, h: gap, gap, severe: gap < 0.7 })
      }
    }
  return out
}

export interface Zone extends Rect {
  label: string
  kind: 'puerta' | 'paso'
}

/** Zonas que deben quedar libres: puertas del salón y caminos del jardín */
export function venueZones(venue: Venue): Zone[] {
  if (venue === 'salon') {
    const { w: W, h: H } = VENUE_SPACES.salon
    return [
      { x: W / 2 - 1.6, y: H - 2, w: 3.2, h: 2, label: 'Entrada principal', kind: 'puerta' },
      { x: 0, y: H / 2 - 1.2, w: 2, h: 2.4, label: 'Puerta al jardín', kind: 'puerta' },
      { x: W - 0.01, y: 3, w: 0.01, h: 2, label: 'Paso a cocina', kind: 'puerta' },
    ]
  }
  const { h: H, obstacle: o } = VENUE_SPACES.jardin
  return [
    { x: o.x - 1.5, y: 0, w: 3, h: o.y - o.r, label: 'Camino a la glorieta', kind: 'paso' },
    { x: o.x - 1.5, y: o.y + o.r, w: 3, h: H - o.y - o.r, label: 'Camino al salón', kind: 'paso' },
  ]
}

export function blockedZones(items: FloorItem[], venue: Venue) {
  const zones = venueZones(venue).filter((z) => z.w > 0.1)
  return zones
    .map((zone) => ({ zone, ids: items.filter((it) => !NO_COLLIDE.has(it.type) && it.type !== 'pasillo' && overlaps(footprint(it), zone)).map((it) => it.id) }))
    .filter((z) => z.ids.length)
}

// ── Guías inteligentes ────────────────────────────────────
export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

/** Ajuste para alinear el rectángulo en movimiento con otras piezas o con el centro del recinto */
export function computeGuides(moving: Rect, others: Rect[], W: number, H: number, threshold: number): { dx: number | null; dy: number | null; guides: Guide[] } {
  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w]
  const my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h]
  let best: { d: number; adj: number; at: number; r?: Rect } | null = null
  let bestY: { d: number; adj: number; at: number; r?: Rect } | null = null
  const consider = (vals: number[], cand: number, r: Rect | undefined, axis: 'x' | 'y') => {
    for (const v of vals) {
      const d = Math.abs(cand - v)
      if (d > threshold) continue
      if (axis === 'x' && (!best || d < best.d)) best = { d, adj: cand - v, at: cand, r }
      if (axis === 'y' && (!bestY || d < bestY.d)) bestY = { d, adj: cand - v, at: cand, r }
    }
  }
  for (const r of others) {
    for (const c of [r.x, r.x + r.w / 2, r.x + r.w]) consider(mx, c, r, 'x')
    for (const c of [r.y, r.y + r.h / 2, r.y + r.h]) consider(my, c, r, 'y')
  }
  consider([mx[1]!], W / 2, undefined, 'x')
  consider([my[1]!], H / 2, undefined, 'y')
  const guides: Guide[] = []
  const bx = best as { d: number; adj: number; at: number; r?: Rect } | null
  const by = bestY as { d: number; adj: number; at: number; r?: Rect } | null
  if (bx) {
    const m = { ...moving, x: moving.x + bx.adj }
    guides.push(bx.r ? { axis: 'x', at: bx.at, from: Math.min(m.y, bx.r.y) - 0.6, to: Math.max(m.y + m.h, bx.r.y + bx.r.h) + 0.6 } : { axis: 'x', at: bx.at, from: 0, to: H })
  }
  if (by) {
    const m = { ...moving, y: moving.y + by.adj }
    guides.push(by.r ? { axis: 'y', at: by.at, from: Math.min(m.x, by.r.x) - 0.6, to: Math.max(m.x + m.w, by.r.x + by.r.w) + 0.6 } : { axis: 'y', at: by.at, from: 0, to: W })
  }
  return { dx: bx ? bx.adj : null, dy: by ? by.adj : null, guides }
}

// ── Alinear y distribuir ──────────────────────────────────
export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

export function alignItems(items: FloorItem[], ids: string[], kind: AlignKind): FloorItem[] {
  const sel = items.filter((i) => ids.includes(i.id) && !i.locked)
  if (sel.length < 2) return items
  const box = unionRect(sel.map(rectOf))
  return items.map((it) => {
    if (!ids.includes(it.id) || it.locked) return it
    const r = rectOf(it)
    switch (kind) {
      case 'left':
        return { ...it, x: it.x + (box.x - r.x) }
      case 'right':
        return { ...it, x: it.x + (box.x + box.w - (r.x + r.w)) }
      case 'hcenter':
        return { ...it, x: box.x + box.w / 2 }
      case 'top':
        return { ...it, y: it.y + (box.y - r.y) }
      case 'bottom':
        return { ...it, y: it.y + (box.y + box.h - (r.y + r.h)) }
      case 'vcenter':
        return { ...it, y: box.y + box.h / 2 }
    }
  })
}

/** Reparte con la misma separación entre centros (la primera y la última no se mueven) */
export function distributeItems(items: FloorItem[], ids: string[], axis: 'x' | 'y'): FloorItem[] {
  const sel = items.filter((i) => ids.includes(i.id) && !i.locked).sort((a, b) => a[axis] - b[axis])
  if (sel.length < 3) return items
  const first = sel[0]![axis]
  const last = sel[sel.length - 1]![axis]
  const step = (last - first) / (sel.length - 1)
  const pos = new Map(sel.map((it, i) => [it.id, first + step * i]))
  return items.map((it) => (pos.has(it.id) ? { ...it, [axis]: Math.round(pos.get(it.id)! * 100) / 100 } : it))
}

/** Renumera las mesas por filas (de arriba hacia abajo, de izquierda a derecha). Devuelve el mapa viejo → nuevo. */
export function renumberTables(items: FloorItem[]): { items: FloorItem[]; map: Map<number, number> } {
  const tables = items.filter((i) => isNumbered(i.type)).sort((a, b) => (Math.abs(a.y - b.y) < 1.4 ? a.x - b.x : a.y - b.y))
  const map = new Map<number, number>()
  const next = new Map<string, number>()
  tables.forEach((t, i) => {
    if (t.number !== undefined) map.set(t.number, i + 1)
    next.set(t.id, i + 1)
  })
  return { items: items.map((it) => (next.has(it.id) ? { ...it, number: next.get(it.id) } : it)), map }
}

/** Copias en fila, columna o cuadrícula */
export function arrayCopies(base: FloorItem, count: number, mode: 'fila' | 'columna' | 'cuadricula', gap: number, cols: number, firstNumber: number): FloorItem[] {
  const r = footprint(base)
  const stepX = r.w + gap
  const stepY = r.h + gap
  const out: FloorItem[] = []
  let n = firstNumber
  for (let k = 1; k <= count; k++) {
    let col = 0
    let row = 0
    if (mode === 'fila') col = k
    else if (mode === 'columna') row = k
    else {
      col = k % cols
      row = Math.floor(k / cols)
    }
    out.push({ ...base, id: uid('fi_'), x: base.x + col * stepX, y: base.y + row * stepY, locked: false, number: isNumbered(base.type) ? n++ : base.number })
  }
  return out
}

/** Posiciones de sillas (coordenadas locales de la pieza, sin rotar) */
export function chairSlots(it: FloorItem): { x: number; y: number }[] {
  const spec = ITEM_SPECS[it.type]
  const n = it.seats ?? 0
  if (!n || !spec.isTable || it.type === 'periquera') return []
  const w = it.w ?? spec.w
  const h = it.h ?? spec.h
  const out: { x: number; y: number }[] = []
  if (spec.shape === 'circle') {
    const r = w / 2 + 0.3
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
    }
  } else if (spec.shape === 'half') {
    const R = w / 2 + 0.3
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * (i + 0.5)) / n
      out.push({ x: Math.cos(a) * R, y: -h / 2 + Math.sin(a) * R })
    }
  } else if (it.type === 'mesa-principal' || it.type === 'mesa-novios') {
    for (let i = 0; i < n; i++) out.push({ x: -w / 2 + (w / n) * (i + 0.5), y: h / 2 + 0.3 })
  } else if (it.type === 'mesa-cuadrada') {
    const per = [0, 0, 0, 0]
    for (let i = 0; i < n; i++) per[i % 4]!++
    const side = (count: number, k: number) => -w / 2 + (w / count) * (k + 0.5)
    for (let k = 0; k < per[0]!; k++) out.push({ x: side(per[0]!, k), y: -h / 2 - 0.3 })
    for (let k = 0; k < per[1]!; k++) out.push({ x: w / 2 + 0.3, y: side(per[1]!, k) })
    for (let k = 0; k < per[2]!; k++) out.push({ x: -side(per[2]!, k), y: h / 2 + 0.3 })
    for (let k = 0; k < per[3]!; k++) out.push({ x: -w / 2 - 0.3, y: -side(per[3]!, k) })
  } else {
    const top = Math.ceil(n / 2)
    const bottom = n - top
    for (let i = 0; i < top; i++) out.push({ x: -w / 2 + (w / top) * (i + 0.5), y: -h / 2 - 0.3 })
    for (let i = 0; i < bottom; i++) out.push({ x: -w / 2 + (w / bottom) * (i + 0.5), y: h / 2 + 0.3 })
  }
  return out
}

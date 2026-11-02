// Catálogo de piezas del plano de mesas y acomodo automático.
import type { FloorItem, FloorItemType, FloorScene, RanchEvent, SceneKind, Venue } from './types'
import { VENUE_SPACES } from './layout'
import { uid } from './format'

export interface ItemSpec {
  label: string
  shape: 'circle' | 'rect' | 'half' // half = media luna (lado recto hacia -y)
  w: number // metros (diámetro si es círculo)
  h: number
  seats?: number
  maxSeats?: number
  tone: 'lavender' | 'rose' | 'sage' | 'butter' | 'sky' | 'peach' | 'mint'
  group: 'Mesas' | 'Zonas' | 'Servicio'
  isTable?: boolean
}

export const ITEM_SPECS: Record<FloorItemType, ItemSpec> = {
  'mesa-redonda': { label: 'Mesa redonda', shape: 'circle', w: 1.8, h: 1.8, seats: 10, maxSeats: 12, tone: 'lavender', group: 'Mesas', isTable: true },
  'mesa-rectangular': { label: 'Mesa rectangular', shape: 'rect', w: 2.4, h: 0.9, seats: 8, maxSeats: 10, tone: 'sky', group: 'Mesas', isTable: true },
  'mesa-imperial': { label: 'Mesa imperial', shape: 'rect', w: 6, h: 1.2, seats: 20, maxSeats: 24, tone: 'rose', group: 'Mesas', isTable: true },
  'mesa-principal': { label: 'Mesa principal', shape: 'rect', w: 6, h: 0.9, seats: 10, maxSeats: 14, tone: 'rose', group: 'Mesas', isTable: true },
  periquera: { label: 'Periquera', shape: 'circle', w: 0.8, h: 0.8, seats: 4, maxSeats: 6, tone: 'mint', group: 'Mesas', isTable: true },
  pista: { label: 'Pista de baile', shape: 'rect', w: 8, h: 8, tone: 'butter', group: 'Zonas' },
  escenario: { label: 'Escenario', shape: 'rect', w: 6, h: 3, tone: 'peach', group: 'Zonas' },
  'sillas-ceremonia': { label: 'Sillas de ceremonia', shape: 'rect', w: 10, h: 8, seats: 80, maxSeats: 300, tone: 'sage', group: 'Zonas' },
  lounge: { label: 'Lounge', shape: 'rect', w: 3, h: 3, seats: 6, tone: 'sage', group: 'Zonas' },
  photobooth: { label: 'Photobooth', shape: 'rect', w: 2.5, h: 2.5, tone: 'sky', group: 'Zonas' },
  dj: { label: 'DJ / Banda', shape: 'rect', w: 2.5, h: 1.4, tone: 'peach', group: 'Servicio' },
  buffet: { label: 'Buffet', shape: 'rect', w: 5, h: 1, tone: 'mint', group: 'Servicio' },
  barra: { label: 'Barra', shape: 'rect', w: 4, h: 1, tone: 'butter', group: 'Servicio' },
  pastel: { label: 'Pastel', shape: 'circle', w: 1.2, h: 1.2, tone: 'rose', group: 'Servicio' },
  regalos: { label: 'Mesa de regalos', shape: 'rect', w: 2.2, h: 1, tone: 'lavender', group: 'Servicio' },
  'mesa-cuadrada': { label: 'Mesa cuadrada', shape: 'rect', w: 1.4, h: 1.4, seats: 8, maxSeats: 8, tone: 'sky', group: 'Mesas', isTable: true },
  'mesa-novios': { label: 'Mesa de novios', shape: 'rect', w: 1.8, h: 0.8, seats: 2, maxSeats: 2, tone: 'rose', group: 'Mesas', isTable: true },
  'mesa-media-luna': { label: 'Media luna', shape: 'half', w: 1.8, h: 0.9, seats: 5, maxSeats: 6, tone: 'lavender', group: 'Mesas', isTable: true },
  'mesa-dulces': { label: 'Mesa de dulces', shape: 'rect', w: 3, h: 0.8, tone: 'butter', group: 'Servicio' },
  carpa: { label: 'Carpa', shape: 'rect', w: 14, h: 10, tone: 'sky', group: 'Zonas' },
  arco: { label: 'Arco floral', shape: 'rect', w: 2.6, h: 0.6, tone: 'rose', group: 'Zonas' },
  tarima: { label: 'Tarima', shape: 'rect', w: 4, h: 2.4, tone: 'peach', group: 'Zonas' },
  letrero: { label: 'Letrero de neón', shape: 'rect', w: 1.8, h: 0.3, tone: 'butter', group: 'Servicio' },
  pasillo: { label: 'Pasillo nupcial', shape: 'rect', w: 1.6, h: 10, tone: 'rose', group: 'Zonas' },
  planta: { label: 'Planta o flores', shape: 'circle', w: 0.7, h: 0.7, tone: 'sage', group: 'Servicio' },
}

// ── Escenas: un evento puede usar el salón y el jardín (ceremonia, cóctel, recepción) ──
export const MAIN_SCENE_ID = 'principal'

export const SCENE_KIND: Record<SceneKind, { label: string; tone: ItemSpec['tone'] }> = {
  recepcion: { label: 'Recepción', tone: 'lavender' },
  ceremonia: { label: 'Ceremonia', tone: 'rose' },
  coctel: { label: 'Cóctel', tone: 'butter' },
  otro: { label: 'Otro momento', tone: 'sky' },
}

/** Todas las escenas del evento; la primera es la principal (layout + venue del evento) */
export function eventScenes(ev: Pick<RanchEvent, 'venue' | 'layout' | 'scenes' | 'startTime'>): FloorScene[] {
  return [{ id: MAIN_SCENE_ID, name: 'Recepción', kind: 'recepcion', venue: ev.venue, time: ev.startTime, items: ev.layout }, ...(ev.scenes ?? [])]
}

/** Cambios para guardar las piezas de una escena con db.patch('events', id, …) */
export function sceneUpdate(ev: Pick<RanchEvent, 'scenes'>, sceneId: string, items: FloorItem[]): Partial<RanchEvent> {
  if (sceneId === MAIN_SCENE_ID) return { layout: items }
  return { scenes: (ev.scenes ?? []).map((sc) => (sc.id === sceneId ? { ...sc, items } : sc)) }
}

/** Espacios que ocupa el evento (para disponibilidad y para "Salón y jardín") */
export function eventVenues(ev: Pick<RanchEvent, 'venue' | 'scenes'>): Venue[] {
  const set = new Set<Venue>([ev.venue])
  for (const sc of ev.scenes ?? []) set.add(sc.venue)
  return [...set]
}

/** Escena del evento en un espacio (la primera que coincida) */
export function sceneForVenue(ev: Pick<RanchEvent, 'venue' | 'layout' | 'scenes' | 'startTime'>, venue: Venue): FloorScene | undefined {
  return eventScenes(ev).find((sc) => sc.venue === venue)
}

export function newScene(kind: SceneKind, venue: Venue, guests: number): FloorScene {
  const style: LayoutStyle = kind === 'ceremonia' ? 'ceremonia' : kind === 'coctel' ? 'coctel' : 'banquete'
  return { id: uid('sc_'), name: SCENE_KIND[kind].label, kind, venue, items: autoLayout(venue, guests, style) }
}

export type LayoutStyle = 'banquete' | 'imperial' | 'coctel' | 'ceremonia'

export const LAYOUT_STYLES: Record<LayoutStyle, { label: string; description: string }> = {
  banquete: { label: 'Banquete', description: 'Mesas redondas de 10 alrededor de la pista' },
  imperial: { label: 'Imperial', description: 'Mesas largas en filas, estilo campestre' },
  coctel: { label: 'Cóctel', description: 'Periqueras y lounges, invitados de pie' },
  ceremonia: { label: 'Ceremonia', description: 'Sillas en filas frente al altar' },
}

const make = (type: FloorItemType, x: number, y: number, extra: Partial<FloorItem> = {}): FloorItem => ({
  id: uid('fi_'),
  type,
  x,
  y,
  rot: 0,
  seats: ITEM_SPECS[type].seats,
  ...extra,
})

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function itemRect(it: FloorItem): Rect {
  const s = ITEM_SPECS[it.type]
  const w = it.w ?? s.w
  const h = it.h ?? s.h
  const rotated = Math.abs(((it.rot % 180) + 180) % 180 - 90) < 45
  const W = rotated ? h : w
  const H = rotated ? w : h
  return { x: it.x - W / 2, y: it.y - H / 2, w: W, h: H }
}

const overlaps = (a: Rect, b: Rect, pad = 0) =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y

export function autoLayout(venue: Venue, guests: number, style: LayoutStyle = 'banquete'): FloorItem[] {
  const space = VENUE_SPACES[venue]
  const W = space.w
  const H = space.h
  const cx = W / 2
  const items: FloorItem[] = []

  if (style === 'ceremonia') {
    // Altar con arco floral, pasillo nupcial al centro y sillas a los lados (en el jardín, junto a la glorieta)
    const top = venue === 'jardin' ? 3 : 2
    items.push(make('tarima', cx, top, { w: 5, h: 2.2, label: 'Altar' }))
    items.push(make('arco', cx, top + 0.2, { label: 'Arco floral' }))
    const rows = Math.ceil(guests / 12)
    const blockH = Math.min((venue === 'jardin' ? VENUE_SPACES.jardin.obstacle.y - VENUE_SPACES.jardin.obstacle.r - 2 : H - 3) - (top + 3), rows * 0.9)
    const y0 = top + 3 + blockH / 2
    items.push(make('pasillo', cx, y0, { w: 1.8, h: blockH + 1 }))
    items.push(make('sillas-ceremonia', cx - 4.2, y0, { w: 6, h: blockH, seats: Math.ceil(guests / 2), label: 'Lado de la novia' }))
    items.push(make('sillas-ceremonia', cx + 4.2, y0, { w: 6, h: blockH, seats: Math.floor(guests / 2), label: 'Lado del novio' }))
    items.push(make('planta', cx - 1.4, top + 2.2), make('planta', cx + 1.4, top + 2.2))
    return items
  }

  // Zonas fijas
  items.push(make('escenario', cx, 1.8))
  items.push(make('dj', cx + 5, 1.6))
  const pistaY = venue === 'jardin' ? 9 : 7.5
  if (style !== 'coctel') items.push(make('pista', cx, pistaY, { w: 8, h: 7 }))
  items.push(make('barra', W - 2.8, H - 1.2))
  items.push(make('buffet', 4, H - 1.2))
  items.push(make('pastel', 1.6, 4))
  items.push(make('regalos', 2, 7, { rot: 90 }))
  if (style === 'coctel') {
    items.push(make('lounge', 3.5, H / 2), make('lounge', W - 3.5, H / 2), make('photobooth', W - 2, 4))
  }

  const reserved: Rect[] = items.map(itemRect)
  if (venue === 'jardin') {
    const o = VENUE_SPACES.jardin.obstacle
    reserved.push({ x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 })
  }

  // Mesa principal frente a la pista
  if (style === 'banquete') {
    const mp = make('mesa-principal', cx, pistaY + 5.2, { label: 'Principal' })
    items.push(mp)
    reserved.push(itemRect(mp))
  }

  const type: FloorItemType = style === 'imperial' ? 'mesa-imperial' : style === 'coctel' ? 'periquera' : 'mesa-redonda'
  const spec = ITEM_SPECS[type]
  const seated = style === 'banquete' ? Math.max(0, guests - 10) : guests
  const needed = Math.ceil(seated / (spec.seats ?? 10))
  const stepX = style === 'imperial' ? 7.2 : style === 'coctel' ? 2.6 : 3.3
  const stepY = style === 'imperial' ? 3.3 : style === 'coctel' ? 2.6 : 3.2
  const candidates: { x: number; y: number; d: number }[] = []
  for (let y = 2.2; y <= H - 2.4; y += stepY) {
    for (let x = 2.2; x <= W - 2.2; x += stepX) {
      const probe = make(type, x, y)
      const r = itemRect(probe)
      if (reserved.some((z) => overlaps(r, z, 0.7))) continue
      if (r.x < 0.4 || r.y < 0.4 || r.x + r.w > W - 0.4 || r.y + r.h > H - 0.4) continue
      candidates.push({ x, y, d: Math.hypot(x - cx, y - pistaY) })
    }
  }
  const chosen = candidates.sort((a, b) => a.d - b.d).slice(0, needed)
  chosen.sort((a, b) => a.y - b.y || a.x - b.x)
  chosen.forEach((c, i) => items.push(make(type, c.x, c.y, { number: i + 1 })))
  return items
}

export function layoutStats(items: FloorItem[]) {
  const tables = items.filter((i) => ITEM_SPECS[i.type].isTable)
  const seats = items.filter((i) => ITEM_SPECS[i.type].isTable || i.type === 'sillas-ceremonia' || i.type === 'lounge').reduce((n, i) => n + (i.seats ?? 0), 0)
  return { tables: tables.length, seats }
}

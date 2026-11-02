// Utilidades de la estación de invitados: mesas del plano, ocupación, acomodo automático,
// importación/exportación y documentos imprimibles.
import type { FloorItem, Guest, RanchEvent } from '@/lib/types'
import { ITEM_SPECS } from '@/lib/floorplan'
import { fmtDateFull, uid } from '@/lib/format'
import { rsvpOf } from '@/components/messages/outbox'

export { rsvpOf }

export interface TableInfo {
  key: number // número de mesa; 0 = mesa principal
  label: string
  seats: number
  item: FloorItem
}

const SEATED_TYPES = new Set(['mesa-redonda', 'mesa-rectangular', 'mesa-cuadrada', 'mesa-media-luna', 'mesa-imperial', 'mesa-principal'])

/** Mesas del plano con su número y capacidad (la principal es la mesa 0) */
export function tablesOf(ev: RanchEvent): TableInfo[] {
  const out: TableInfo[] = []
  for (const it of ev.layout) {
    if (!SEATED_TYPES.has(it.type)) continue
    const key = it.type === 'mesa-principal' && !it.number ? 0 : it.number
    if (key === undefined) continue
    out.push({ key, label: key === 0 ? 'Principal' : `Mesa ${key}`, seats: it.seats ?? ITEM_SPECS[it.type].seats ?? 10, item: it })
  }
  return out.sort((a, b) => a.key - b.key)
}

export const tableLabel = (key: number | undefined) => (key === undefined ? 'Sin mesa' : key === 0 ? 'Principal' : `Mesa ${key}`)

/** Personas sentadas por mesa (solo invitados que no declinaron) */
export function occupancy(guests: Guest[]) {
  const m = new Map<number, number>()
  for (const g of guests) if (g.table !== undefined && g.table !== null && rsvpOf(g) !== 'declinado') m.set(g.table, (m.get(g.table) ?? 0) + g.count)
  return m
}

export function guestStats(guests: Guest[]) {
  let people = 0
  let conf = 0
  let pend = 0
  let decl = 0
  let kids = 0
  let diets = 0
  let unseated = 0
  let arrived = 0
  for (const g of guests) {
    const r = rsvpOf(g)
    people += g.count
    if (r === 'confirmado') conf += g.count
    if (r === 'pendiente') pend += g.count
    if (r === 'declinado') decl += g.count
    if (r !== 'declinado') kids += g.kids ?? 0
    if (g.diet && r !== 'declinado') diets++
    if (r === 'confirmado' && (g.table === undefined || g.table === null)) unseated += g.count
    if (g.arrived) arrived += g.count
  }
  return { invites: guests.length, people, conf, pend, decl, kids, diets, unseated, arrived }
}

/**
 * Acomodo automático:
 * - VIP primero, en las mesas más cercanas a la principal / pista.
 * - Luego familias y grupos grandes, juntos y del mismo lado.
 * - Respeta la capacidad de sillas; nunca separa a una familia.
 */
export function autoSeat(ev: RanchEvent, opts: { includePending: boolean; redoAll: boolean }): { guests: Guest[]; seated: number; left: number } {
  const tables = tablesOf(ev)
  const focus = ev.layout.find((i) => i.type === 'mesa-principal') ?? ev.layout.find((i) => i.type === 'pista') ?? { x: 0, y: 0 }
  const order = [...tables].sort((a, b) => Math.hypot(a.item.x - focus.x, a.item.y - focus.y) - Math.hypot(b.item.x - focus.x, b.item.y - focus.y))
  const remaining = new Map<number, number>(tables.map((t) => [t.key, t.seats]))
  const sideOf = new Map<number, string | undefined>()
  const next = ev.guestList.map((g) => ({ ...g }))

  if (opts.redoAll) for (const g of next) delete g.table
  for (const g of next) {
    if (g.table === undefined || g.table === null) continue
    if (rsvpOf(g) === 'declinado') continue
    remaining.set(g.table, (remaining.get(g.table) ?? 0) - g.count)
    if (!sideOf.has(g.table)) sideOf.set(g.table, g.side)
  }

  const toSeat = next.filter((g) => (g.table === undefined || g.table === null) && (rsvpOf(g) === 'confirmado' || (opts.includePending && rsvpOf(g) === 'pendiente')))
  const groupKey = (g: Guest) => g.group || `${g.side ?? ''}::${g.id}`
  const groups = new Map<string, Guest[]>()
  for (const g of toSeat) groups.set(groupKey(g), [...(groups.get(groupKey(g)) ?? []), g])
  const units = [...groups.values()].sort((a, b) => {
    const va = a.some((g) => g.vip) ? 1 : 0
    const vb = b.some((g) => g.vip) ? 1 : 0
    if (va !== vb) return vb - va
    if ((a[0]!.side ?? '') !== (b[0]!.side ?? '')) return (a[0]!.side ?? '').localeCompare(b[0]!.side ?? '')
    return b.reduce((n, g) => n + g.count, 0) - a.reduce((n, g) => n + g.count, 0)
  })

  let seated = 0
  let left = 0
  for (const unit of units) {
    const size = unit.reduce((n, g) => n + g.count, 0)
    const side = unit[0]!.side
    const fits = (t: TableInfo, need: number) => (remaining.get(t.key) ?? 0) >= need
    const pick =
      order.find((t) => fits(t, size) && sideOf.get(t.key) === side) ??
      order.find((t) => fits(t, size) && !sideOf.has(t.key)) ??
      order.find((t) => fits(t, size))
    if (pick) {
      for (const g of unit) g.table = pick.key
      remaining.set(pick.key, (remaining.get(pick.key) ?? 0) - size)
      if (!sideOf.has(pick.key)) sideOf.set(pick.key, side)
      seated += unit.length
      continue
    }
    // Grupo más grande que cualquier mesa libre: cada invitado (familia) por separado, sin partir familias
    for (const g of unit) {
      const t = order.find((x) => fits(x, g.count) && sideOf.get(x.key) === side) ?? order.find((x) => fits(x, g.count))
      if (t) {
        g.table = t.key
        remaining.set(t.key, (remaining.get(t.key) ?? 0) - g.count)
        if (!sideOf.has(t.key)) sideOf.set(t.key, side)
        seated++
      } else left++
    }
  }
  return { guests: next, seated, left }
}

// ── Importar / exportar ──────────────────────────────────
const HEADER_ALIASES: Record<string, keyof Guest> = {
  nombre: 'name',
  invitado: 'name',
  name: 'name',
  telefono: 'phone',
  teléfono: 'phone',
  celular: 'phone',
  whatsapp: 'phone',
  personas: 'count',
  pases: 'count',
  lado: 'side',
  grupo: 'group',
  familia: 'group',
  mesa: 'table',
  dieta: 'diet',
  correo: 'email',
  email: 'email',
  niños: 'kids',
  ninos: 'kids',
}

function splitLine(line: string) {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
  const out: string[] = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === sep && !q) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** Acepta: una línea por invitado ("Nombre", "Nombre, teléfono, personas") o CSV con encabezados */
export function parseGuestList(text: string, defaults: { side?: string } = {}): Guest[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []
  const first = splitLine(lines[0]!).map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const hasHeader = first.some((h) => HEADER_ALIASES[h] === 'name')
  const cols: (keyof Guest | undefined)[] = hasHeader ? first.map((h) => HEADER_ALIASES[h]) : ['name', 'phone', 'count']
  const rows = hasHeader ? lines.slice(1) : lines
  const out: Guest[] = []
  for (const row of rows) {
    const cells = splitLine(row)
    const g: Guest = { id: uid('g_'), name: '', count: 1, confirmed: false, rsvp: 'pendiente', side: defaults.side || undefined }
    cells.forEach((c, i) => {
      const k = cols[i]
      if (!k || !c) return
      if (k === 'count' || k === 'kids') (g as any)[k] = Math.max(k === 'count' ? 1 : 0, parseInt(c, 10) || (k === 'count' ? 1 : 0))
      else if (k === 'table') g.table = /principal/i.test(c) ? 0 : parseInt(c.replace(/\D/g, ''), 10) || undefined
      else if (k === 'phone') g.phone = c.replace(/[^\d+]/g, '')
      else (g as any)[k] = c
    })
    // "Nombre, teléfono" sin encabezado: si la 2a columna no parece teléfono, era el número de personas
    if (!hasHeader && g.phone && g.phone.length < 7) {
      g.count = Math.max(1, parseInt(g.phone, 10) || 1)
      g.phone = undefined
    }
    if (g.name) out.push(g)
  }
  return out
}

export function guestsToCsv(ev: RanchEvent) {
  const rows = [['Nombre', 'Personas', 'Niños', 'Confirmación', 'Lado', 'Grupo', 'Mesa', 'Teléfono', 'Dieta', 'VIP', 'Llegó', 'Notas']]
  for (const g of ev.guestList)
    rows.push([g.name, String(g.count), String(g.kids ?? 0), rsvpOf(g), g.side ?? '', g.group ?? '', tableLabel(g.table), g.phone ?? '', g.diet ?? '', g.vip ? 'Sí' : '', g.arrived ? 'Sí' : '', g.notes ?? ''])
  return '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
}

export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// ── Documentos imprimibles ───────────────────────────────
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function seatingByTable(ev: RanchEvent) {
  const tables = tablesOf(ev)
  const live = ev.guestList.filter((g) => rsvpOf(g) !== 'declinado')
  return tables.map((t) => ({ table: t, guests: live.filter((g) => g.table === t.key).sort((a, b) => a.name.localeCompare(b.name)) }))
}

/** Tarjetas de mesa: una por mesa, número grande y nombres (para imprimir y doblar) */
export function tableCardsHtml(ev: RanchEvent) {
  const cards = seatingByTable(ev)
    .filter((x) => x.guests.length)
    .map(
      ({ table, guests }) => `<div class="tc"><div class="ev">${esc(ev.title)}</div><div class="num">${table.key === 0 ? '✦' : table.key}</div><div class="lbl">${esc(table.label)}</div><div class="names">${guests
        .map((g) => `<div>${esc(g.name)}${g.count > 1 ? ` <span class="muted">· ${g.count}</span>` : ''}</div>`)
        .join('')}</div></div>`,
    )
    .join('')
  return `<style>
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10mm}
    .tc{border:1px solid #EEDBD0;border-radius:6mm;padding:9mm 8mm;text-align:center;break-inside:avoid;min-height:95mm}
    .ev{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#74484E}
    .num{font-family:'Fraunces Variable','Fraunces',Georgia,serif;font-weight:300;font-size:64px;line-height:1;margin:6mm 0 1mm;color:#8A4649}
    .lbl{font-family:'Fraunces Variable','Fraunces',Georgia,serif;font-size:16px;margin-bottom:5mm}
    .names{font-size:13px;line-height:1.75}
  </style><div class="grid">${cards}</div>`
}

/** Lista por mesa en una hoja (para el capitán de meseros y la entrada) */
export function seatingListHtml(ev: RanchEvent) {
  const blocks = seatingByTable(ev)
    .map(({ table, guests }) => {
      const people = guests.reduce((n, g) => n + g.count, 0)
      return `<tr><td style="width:22%"><b>${esc(table.label)}</b><div class="muted">${people}/${table.seats} lugares</div></td><td>${guests.map((g) => `${esc(g.name)}${g.count > 1 ? ` (${g.count})` : ''}${g.diet ? ` <span class="pill">${esc(g.diet)}</span>` : ''}`).join(' · ') || '<span class="muted">Libre</span>'}</td></tr>`
    })
    .join('')
  const unseated = ev.guestList.filter((g) => rsvpOf(g) === 'confirmado' && (g.table === undefined || g.table === null))
  return `<div class="brand"><div><h1>${esc(ev.title)}</h1><div class="muted">${esc(fmtDateFull(ev.date))} · Lista de invitados por mesa</div></div><div class="muted">Jardines La Joya</div></div>
    <table><thead><tr><th>Mesa</th><th>Invitados</th></tr></thead><tbody>${blocks}</tbody></table>
    ${unseated.length ? `<h2>Confirmados sin mesa</h2><p>${unseated.map((g) => esc(g.name)).join(' · ')}</p>` : ''}`
}

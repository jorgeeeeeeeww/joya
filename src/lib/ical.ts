// Calendarios iCal (RFC 5545) para sincronizar con Airbnb y Booking.
// - parseICS: lee el feed que exporta Airbnb/Booking.
// - buildICS: genera el feed de reservas directas que Airbnb/Booking importan para bloquear fechas.
// - importAirbnb: convierte el feed en reservas `source: 'airbnb'` sin duplicar (por UID).
import type { ID, Reservation, Unit } from './types'
import { db } from './store'
import { addDaysISO, today } from './format'

export interface ICalEvent {
  uid: string
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD (exclusivo, igual que la fecha de salida)
  summary: string
  description: string
}

/** Une las líneas plegadas (las que empiezan con espacio o tab continúan la anterior). */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function unescapeText(v: string) {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

function toDate(v: string): string {
  // 20261105 | 20261105T150000Z | 20261105T150000
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return ''
  return `${m[1]}-${m[2]}-${m[3]}`
}

export function parseICS(text: string): ICalEvent[] {
  const out: ICalEvent[] = []
  let cur: Partial<ICalEvent> | null = null
  for (const raw of unfold(text)) {
    const line = raw.trimEnd()
    if (line === 'BEGIN:VEVENT') {
      cur = { summary: '', description: '' }
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur?.start) {
        const start = cur.start
        const end = cur.end && cur.end > start ? cur.end : addDaysISO(start, 1)
        out.push({ uid: cur.uid || `${start}-${end}-${cur.summary}`, start, end, summary: cur.summary || '', description: cur.description || '' })
      }
      cur = null
      continue
    }
    if (!cur) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const name = line.slice(0, idx).split(';')[0]!.toUpperCase()
    const value = line.slice(idx + 1)
    if (name === 'UID') cur.uid = value.trim()
    else if (name === 'DTSTART') cur.start = toDate(value)
    else if (name === 'DTEND') cur.end = toDate(value)
    else if (name === 'SUMMARY') cur.summary = unescapeText(value)
    else if (name === 'DESCRIPTION') cur.description = unescapeText(value)
  }
  return out
}

/** ¿Es un bloqueo (no disponible) y no una reserva real? */
export const isBlock = (ev: ICalEvent) => /not available|blocked|no disponible|closed/i.test(ev.summary)

const escapeText = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const icsDate = (iso: string) => iso.replace(/-/g, '')

/** Feed iCal de las reservas que NO vienen de Airbnb (para que Airbnb bloquee esas fechas). */
export function buildICS(unit: Unit, reservations: Reservation[], excludeSource: Reservation['source'] = 'airbnb'): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jardines La Joya//Reservas//ES', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText(unit.name)}`]
  for (const r of reservations) {
    if (r.deleted || r.unitId !== unit.id || r.status === 'cancelada' || r.source === excludeSource) continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@lajoya`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(r.checkIn)}`,
      `DTEND;VALUE=DATE:${icsDate(r.checkOut)}`,
      'SUMMARY:Reservado (La Joya)',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export interface ImportSummary {
  created: number
  updated: number
  blocks: number
  cancelled: number
  skipped: number
}

/** Crea/actualiza reservas de Airbnb a partir de un feed iCal. Idempotente por UID. */
export function importAirbnb(unitId: ID, text: string, source: Reservation['source'] = 'airbnb'): ImportSummary {
  const events = parseICS(text)
  const summary: ImportSummary = { created: 0, updated: 0, blocks: 0, cancelled: 0, skipped: 0 }
  const existing = db.list('reservations').filter((r) => r.unitId === unitId && r.externalUid)
  const seen = new Set<string>()
  const t = today()

  for (const ev of events) {
    seen.add(ev.uid)
    const block = isBlock(ev)
    if (block) summary.blocks++
    const prev = existing.find((r) => r.externalUid === ev.uid)
    const code = ev.description.match(/reservations\/details\/([A-Z0-9]+)/i)?.[1]
    const phoneLast = ev.description.match(/Phone Number \(Last 4 Digits\):\s*(\d{4})/i)?.[1]
    const guestName = block ? 'Bloqueado en ' + (source === 'booking' ? 'Booking' : 'Airbnb') : ev.summary && !/reserved/i.test(ev.summary) ? ev.summary : `Huésped ${source === 'booking' ? 'Booking' : 'Airbnb'}${code ? ' · ' + code : ''}`
    const status: Reservation['status'] = ev.end <= t ? 'finalizada' : ev.start <= t ? 'en-casa' : 'confirmada'
    if (prev) {
      if (prev.checkIn !== ev.start || prev.checkOut !== ev.end) {
        db.patch('reservations', prev.id, { checkIn: ev.start, checkOut: ev.end }, { summary: `Actualizó reserva de ${source} ${prev.guestName}` })
        summary.updated++
      } else summary.skipped++
      continue
    }
    if (ev.end < addDaysISO(t, -60)) {
      summary.skipped++
      continue
    }
    db.upsert(
      'reservations',
      {
        unitId,
        guestName,
        guests: block ? 0 : 2,
        checkIn: ev.start,
        checkOut: ev.end,
        source,
        status: block ? 'confirmada' : status === 'en-casa' ? 'confirmada' : status,
        total: 0,
        externalUid: ev.uid,
        notes: block ? 'Fechas bloqueadas desde el calendario externo' : [phoneLast && `Teléfono termina en ${phoneLast}`, code && `Código ${code}`].filter(Boolean).join(' · ') || undefined,
      },
      { summary: `Importó reserva de ${source} (${ev.start} → ${ev.end})` },
    )
    summary.created++
  }

  // Reservas futuras que ya no vienen en el feed = canceladas en Airbnb
  for (const r of existing) {
    if (r.source !== source || seen.has(r.externalUid!) || r.status === 'cancelada' || r.checkIn < t) continue
    db.patch('reservations', r.id, { status: 'cancelada' }, { summary: `Canceló ${r.guestName}: ya no aparece en ${source}` })
    summary.cancelled++
  }
  return summary
}

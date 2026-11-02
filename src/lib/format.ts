import { format, formatDistanceToNowStrict, parseISO, differenceInCalendarDays, isToday, isTomorrow, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ISODate } from './types'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const moneyCents = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 })
const compact = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 })

export const mxn = (n: number) => money.format(Math.round(n || 0))
export const mxnCents = (n: number) => moneyCents.format(n || 0)
export const compactMxn = (n: number) => '$' + compact.format(n || 0)
export const pct = (n: number) => `${Math.round(n * 100)}%`

export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export const nowIso = () => new Date().toISOString()

/** Fecha local (no UTC) en formato YYYY-MM-DD */
export const toISODate = (d: Date = new Date()): ISODate => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const today = () => toISODate(new Date())

export const addDaysISO = (iso: ISODate, days: number): ISODate => {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export const fmt = (iso: string | Date, pattern: string) =>
  format(typeof iso === 'string' ? parseISO(iso) : iso, pattern, { locale: es })

export const fmtDate = (iso: string) => fmt(iso, "d 'de' MMM")
export const fmtDateLong = (iso: string) => fmt(iso, "EEEE d 'de' MMMM")
export const fmtDateFull = (iso: string) => fmt(iso, "d 'de' MMMM yyyy")
export const fmtTime = (iso: string) => fmt(iso, 'HH:mm')

export const relativeDay = (iso: ISODate) => {
  const d = parseISO(iso)
  if (isToday(d)) return 'Hoy'
  if (isTomorrow(d)) return 'Mañana'
  if (isYesterday(d)) return 'Ayer'
  const diff = differenceInCalendarDays(d, new Date())
  if (diff > 0 && diff < 7) return fmt(iso, 'EEEE')
  return fmtDate(iso)
}

export const ago = (iso: string) => formatDistanceToNowStrict(parseISO(iso), { locale: es, addSuffix: true })

export const nights = (checkIn: ISODate, checkOut: ISODate) =>
  Math.max(0, differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)))

export const daysUntil = (iso: ISODate) => differenceInCalendarDays(parseISO(iso), new Date())

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

export const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Liga de WhatsApp con mensaje prellenado (México: lada 52) */
export const waLink = (phone: string | undefined, text: string) => {
  const digits = (phone || '').replace(/\D/g, '')
  const full = digits.length === 10 ? '52' + digits : digits
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}

export const isWeekendNight = (iso: ISODate) => {
  const d = parseISO(iso).getDay()
  return d === 5 || d === 6 // viernes y sábado
}

/** Minutos para ordenar el programa de un evento: lo que pasa de 00:00 a 05:59 va al final (después de medianoche) */
export const programMinutes = (time: string) => {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return (h < 6 ? h + 24 : h) * 60 + m
}
export const byProgramTime = <T extends { time: string }>(a: T, b: T) => programMinutes(a.time) - programMinutes(b.time)

/** Día local (YYYY-MM-DD) de una marca de tiempo ISO en UTC. En Jalisco, lo terminado a las 7 pm ya es "mañana" en UTC. */
export const localDay = (iso?: string) => (iso ? toISODate(new Date(iso)) : '')

/** Notas de un evento sin las marcas internas de envío ("✦ Enviado: … [clave]") que guarda el centro de mensajes */
export const visibleNotes = (notes?: string) =>
  (notes ?? '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('✦ Enviado:'))
    .join('\n')
    .trim()

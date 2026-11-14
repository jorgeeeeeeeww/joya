// Fechas como texto 'YYYY-MM-DD' (sin zonas horarias de por medio) y su forma de decirlas en español.
import type { ISODate } from './tipos'

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

const aFecha = (iso: ISODate) => new Date(iso + 'T12:00:00Z')
const aIso = (d: Date) => d.toISOString().slice(0, 10)

export function masDias(iso: ISODate, n: number): ISODate {
  const d = aFecha(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return aIso(d)
}
export const noches = (a: ISODate, b: ISODate) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000)
export const diaSemana = (iso: ISODate) => aFecha(iso).getUTCDay()
export const dia = (iso: ISODate) => aFecha(iso).getUTCDate()
export const mesCorto = (iso: ISODate) => MES[aFecha(iso).getUTCMonth()]!
export const mesLargo = (iso: ISODate) => MES_LARGO[aFecha(iso).getUTCMonth()]!
export const diaCorto = (iso: ISODate) => DIA_CORTO[diaSemana(iso)]!
export const inicioDeMes = (iso: ISODate) => iso.slice(0, 8) + '01'

/** «12 dic» */
export const corta = (iso: ISODate) => `${dia(iso)} ${mesCorto(iso)}`
/** «viernes 12 de diciembre» */
export const larga = (iso: ISODate) => `${DIA[diaSemana(iso)]} ${dia(iso)} de ${mesLargo(iso)}`
/** «12 – 14 dic» o «30 dic – 2 ene» */
export function rango(a: ISODate, b: ISODate) {
  return a.slice(0, 7) === b.slice(0, 7) ? `${dia(a)} – ${corta(b)}` : `${corta(a)} – ${corta(b)}`
}
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Hoy en Jalisco (la nube manda el suyo; este es el respaldo) */
export function hoyLocal(): ISODate {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return p
}

/** «hoy», «mañana», «el viernes», «el 12 dic» */
export function cuando(iso: ISODate, hoy: ISODate) {
  const n = noches(hoy, iso)
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  if (n === -1) return 'ayer'
  if (n > 1 && n < 7) return `el ${DIA[diaSemana(iso)]}`
  return `el ${corta(iso)}`
}

/** Cuánto falta para que venza un apartado: «vence en 18 h», «vence en 25 min» */
export function venceEn(vence: string | null, ahora = Date.now()) {
  if (!vence) return null
  const ms = new Date(vence).getTime() - ahora
  if (ms <= 0) return { texto: 'venció', urgente: true }
  const min = Math.round(ms / 60_000)
  if (min < 60) return { texto: `vence en ${min} min`, urgente: true }
  const h = Math.round(min / 60)
  if (h < 48) return { texto: `vence en ${h} h`, urgente: h <= 3 }
  return { texto: `vence en ${Math.round(h / 24)} días`, urgente: false }
}

/** «hace 5 min», «hace 3 h», «el 12 dic» */
export function hace(momento: string, ahora = Date.now()) {
  const min = Math.round((ahora - new Date(momento).getTime()) / 60_000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = new Date(momento)
  return `el ${d.getDate()} ${MES[d.getMonth()]}`
}

/** Día local de un momento (la nube los guarda en UTC: de noche ya sería «mañana» si solo se corta el texto) */
export const diaLocal = (momento: string): ISODate => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(momento))

/** Hora local de un momento: «14:30» */
export const hora = (momento: string) => new Date(momento).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })

export const DIAS_SEMANA = DIA
export const DIAS_CORTOS = DIA_CORTO

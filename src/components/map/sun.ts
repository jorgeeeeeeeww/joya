// Posición real del sol en Tototlán (20.55, −102.78) y fases de luz del mapa 3D.
// Fórmulas astronómicas simplificadas (las de SunCalc): precisión de ~1°, suficiente para la ambientación.

export const RANCH_LAT = 20.5498
export const RANCH_LNG = -102.784

export type TimeMode = 'ahora' | 'dia' | 'atardecer' | 'noche'

const rad = Math.PI / 180
const DAY_MS = 86400000
const J1970 = 2440588
const J2000 = 2451545

/** Altura (alt) y azimut desde el norte en sentido horario (az), en radianes */
export function solarPosition(date: Date, lat = RANCH_LAT, lng = RANCH_LNG) {
  const d = date.getTime() / DAY_MS - 0.5 + J1970 - J2000
  const M = rad * (357.5291 + 0.98560028 * d)
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  const L = M + C + rad * 102.9372 + Math.PI
  const e = rad * 23.4397
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L))
  const th = rad * (280.16 + 360.9856235 * d) - rad * -lng
  const H = th - ra
  const phi = rad * lat
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const azSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi))
  return { alt, az: azSouth + Math.PI }
}

export interface SunState {
  /** 0 = día pleno, 1 = noche cerrada */
  night: number
  /** 0..1 cuánto "atardecer dorado" hay */
  golden: number
  alt: number
  az: number
  label: 'Día' | 'Atardecer' | 'Amanecer' | 'Noche'
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Fase de luz para un modo dado (o la hora real del rancho si es "ahora") */
export function sunState(mode: TimeMode, now = new Date()): SunState {
  if (mode === 'dia') return { night: 0, golden: 0, alt: 52 * rad, az: 162 * rad, label: 'Día' }
  if (mode === 'atardecer') return { night: 0.08, golden: 1, alt: 5 * rad, az: 248 * rad, label: 'Atardecer' }
  if (mode === 'noche') return { night: 1, golden: 0, alt: -30 * rad, az: 250 * rad, label: 'Noche' }
  const { alt, az } = solarPosition(now)
  const deg = alt / rad
  const night = clamp01((2 - deg) / 10) // a partir de 2° comienza a oscurecer, noche cerrada a −8°
  const golden = deg > 14 || deg < -6 ? 0 : deg >= 3 ? clamp01((14 - deg) / 11) : clamp01((deg + 6) / 9)
  const morning = az < Math.PI
  const label = night > 0.85 ? 'Noche' : golden > 0.45 ? (morning ? 'Amanecer' : 'Atardecer') : 'Día'
  return { night, golden, alt, az, label }
}

/** Hora local del rancho (Jalisco, UTC−6 sin horario de verano) en "HH:mm" */
export function ranchTime(now = new Date()) {
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const local = new Date(utc - 6 * 3600000)
  return `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`
}

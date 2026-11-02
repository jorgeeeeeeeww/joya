// Reglas de validación de los campos inteligentes. Cada regla devuelve un mensaje que explica
// qué falta (en español claro) o undefined si el dato está bien.

export type Validator = (v: unknown) => string | undefined

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0)

export const rules = {
  required:
    (msg = 'Este dato es necesario'): Validator =>
    (v) =>
      isEmpty(v) ? msg : undefined,
  email:
    (msg = 'Revisa el correo: debe verse como nombre@gmail.com'): Validator =>
    (v) =>
      isEmpty(v) || EMAIL_RE.test(String(v).trim()) ? undefined : msg,
  /** Teléfono de México: 10 dígitos con lada */
  phoneMx: (): Validator => (v) => {
    const d = String(v ?? '').replace(/\D/g, '')
    if (!d) return undefined
    if (d.length < 10) {
      const n = 10 - d.length
      return `Faltan ${n} ${n === 1 ? 'número' : 'números'}: son 10 con lada`
    }
    if (d.length > 10) return 'Sobran números: son 10 con lada'
    return undefined
  },
  min:
    (n: number, msg?: string): Validator =>
    (v) =>
      typeof v === 'number' && v < n ? (msg ?? `Debe ser al menos ${n}`) : undefined,
  max:
    (n: number, msg?: string): Validator =>
    (v) =>
      typeof v === 'number' && v > n ? (msg ?? `Debe ser máximo ${n}`) : undefined,
  minLength:
    (n: number, msg?: string): Validator =>
    (v) =>
      typeof v === 'string' && v.trim() && v.trim().length < n ? (msg ?? `Escribe al menos ${n} letras`) : undefined,
}

/** Primer error de una lista de reglas (se ignoran las reglas vacías o false) */
export function firstError(v: unknown, validators: (Validator | false | null | undefined)[]): string | undefined {
  for (const fn of validators) {
    if (!fn) continue
    const m = fn(v)
    if (m) return m
  }
  return undefined
}

export const isValidEmail = (v: string) => EMAIL_RE.test(v.trim())
export const phoneDigits = (v: string | undefined) => (v ?? '').replace(/\D/g, '')

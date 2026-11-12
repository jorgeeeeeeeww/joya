const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const fmtCentavos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** «$1,250» (con centavos solo si los hay) */
export function mxn(n: number | null | undefined) {
  const v = Number(n ?? 0)
  return Number.isInteger(v) ? fmt.format(v) : fmtCentavos.format(v)
}

/** Lee lo que la persona escribió («1,250.50», «$ 900») como número */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/[^0-9.]/g, '')
  if (!limpio) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** ¿La CLABE de 18 dígitos tiene bien su dígito verificador? */
export function clabeValida(c: string) {
  if (!/^\d{18}$/.test(c)) return false
  const w = [3, 7, 1]
  let s = 0
  for (let i = 0; i < 17; i++) s += (Number(c[i]) * w[i % 3]!) % 10
  return (10 - (s % 10)) % 10 === Number(c[17])
}

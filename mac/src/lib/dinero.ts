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

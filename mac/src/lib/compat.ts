// Macs con Safari viejo (macOS 12 sin actualizar): no entienden `color-mix()`, que es con lo que se hacen los tonos
// transparentes (líneas, fondos suaves, sombras). Sin eso los colores salen planos: botones blancos, mapa negro.
// Aquí se reescribe la hoja de estilos ya compilada: cada `color-mix()` se calcula con los colores reales del tema
// que está puesto (y se vuelve a calcular si cambia entre claro y oscuro). En un Safari nuevo no hace nada.

// «?compat» en la dirección fuerza la reescritura (para probarla en un navegador nuevo)
export const sinColorMix =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && (!CSS.supports('color', 'color-mix(in oklab, red 50%, blue)') || new URLSearchParams(location.search).has('compat'))

type RGBA = [number, number, number, number] // 0–255, alfa 0–1

const NOMBRES: Record<string, RGBA> = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] }

function leerColor(texto: string): RGBA | null {
  const t = texto.trim().toLowerCase()
  if (NOMBRES[t]) return NOMBRES[t]
  let m = t.match(/^#([0-9a-f]{3,8})$/)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length === 6 || h.length === 8) {
      const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
      return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
    }
    return null
  }
  m = t.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean)
    if (p.length < 3) return null
    const c = (s: string) => (s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s))
    const a = p[3] === undefined ? 1 : p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3])
    if ([c(p[0]), c(p[1]), c(p[2]), a].some(Number.isNaN)) return null
    return [c(p[0]), c(p[1]), c(p[2]), a]
  }
  return null
}

const aLineal = (v: number) => {
  const x = v / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const deLineal = (x: number) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

function aOklab([r, g, b]: RGBA): [number, number, number] {
  const R = aLineal(r)
  const G = aLineal(g)
  const B = aLineal(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function deOklab([L, a, b]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lim = (x: number) => Math.max(0, Math.min(255, deLineal(Math.max(0, Math.min(1, x)))))
  return [lim(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), lim(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), lim(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]
}

/** Mezcla dos colores como lo hace `color-mix(in oklab, A pA%, B pB%)` (con transparencia premultiplicada) */
function mezclar(a: RGBA, pa: number, b: RGBA, pb: number, espacio: 'oklab' | 'srgb'): RGBA {
  const suma = pa + pb
  if (suma <= 0) return [0, 0, 0, 0]
  const wa = pa / suma
  const wb = pb / suma
  const alfa = a[3] * wa + b[3] * wb
  const mult = Math.min(1, suma) // si los porcentajes no llegan a 100, el resultado se vuelve más transparente
  if (alfa === 0) return [0, 0, 0, 0]
  const ca = espacio === 'oklab' ? aOklab(a) : [a[0], a[1], a[2]]
  const cb = espacio === 'oklab' ? aOklab(b) : [b[0], b[1], b[2]]
  const mezcla = [0, 1, 2].map((i) => (ca[i] * a[3] * wa + cb[i] * b[3] * wb) / alfa) as [number, number, number]
  const [r, g, bl] = espacio === 'oklab' ? deOklab(mezcla) : mezcla
  return [r, g, bl, alfa * mult]
}

const rgba = ([r, g, b, a]: RGBA) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.round(a * 1000) / 1000})`

/** Separa por comas que no estén dentro de paréntesis */
function partir(s: string): string[] {
  const out: string[] = []
  let nivel = 0
  let ini = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') nivel++
    else if (c === ')') nivel--
    else if (c === ',' && nivel === 0) {
      out.push(s.slice(ini, i))
      ini = i + 1
    }
  }
  out.push(s.slice(ini))
  return out.map((x) => x.trim())
}

/** Cierra el paréntesis que abre en `desde` (el de «color-mix(») */
function cierre(css: string, desde: number): number {
  let nivel = 0
  for (let i = desde; i < css.length; i++) {
    if (css[i] === '(') nivel++
    else if (css[i] === ')' && --nivel === 0) return i
  }
  return -1
}

type Leer = (nombre: string) => string

/** Quita los `var(--x)` poniendo el valor que tienen ahora (o su valor de respaldo) */
function sustituirVars(texto: string, valor: Leer, profundidad = 0): string | null {
  if (profundidad > 6) return null
  let t = texto
  for (let guardia = 0; guardia < 20 && t.includes('var('); guardia++) {
    const i = t.indexOf('var(')
    const f = cierre(t, i + 3)
    if (f < 0) return null
    const [nombre, ...resto] = partir(t.slice(i + 4, f))
    let v = valor(nombre)
    if (!v && resto.length) v = resto.join(',')
    if (!v) return null
    const limpio = sustituirVars(v, valor, profundidad + 1)
    if (limpio === null) return null
    t = t.slice(0, i) + limpio + t.slice(f + 1)
  }
  return t
}

function colorDe(texto: string, valor: Leer): RGBA | null {
  const t = texto.trim()
  if (t.toLowerCase().startsWith('color-mix(')) {
    const ev = evaluar(t, valor)
    return ev ? leerColor(ev) : null
  }
  if (t.includes('var(')) {
    const s = sustituirVars(t, valor)
    return s === null ? null : colorDe(s, valor)
  }
  return leerColor(t)
}

/** `color-mix(in oklab, A p%, B q%)` → `rgba(...)`; null si algún color no se puede resolver */
function evaluar(expr: string, valor: Leer): string | null {
  const dentro = expr.slice(expr.indexOf('(') + 1, expr.lastIndexOf(')'))
  const [modo, ...cols] = partir(dentro)
  if (cols.length !== 2) return null
  const espacio = /srgb/i.test(modo) ? 'srgb' : 'oklab'
  const leerParte = (p: string): { color: RGBA; pct: number | null } | null => {
    // «COLOR 55%» (el porcentaje puede ser una variable): se separa el último trozo
    const m = p.match(/^(.*\S)\s+(var\([^)]*\)|[\d.]+%)\s*$/)
    let colorTxt = p
    let pct: number | null = null
    if (m) {
      colorTxt = m[1]
      const pt = m[2].startsWith('var(') ? sustituirVars(m[2], valor) : m[2]
      if (pt === null) return null
      const n = parseFloat(pt)
      if (Number.isNaN(n)) return null
      pct = n
    }
    const color = colorDe(colorTxt, valor)
    return color ? { color, pct } : null
  }
  const a = leerParte(cols[0])
  const b = leerParte(cols[1])
  if (!a || !b) return null
  let pa = a.pct
  let pb = b.pct
  if (pa === null && pb === null) pa = pb = 50
  else if (pa === null) pa = 100 - (pb as number)
  else if (pb === null) pb = 100 - pa
  return rgba(mezclar(a.color, pa as number, b.color, pb as number, espacio))
}

/** Reescribe todos los `color-mix(...)` del css con los colores de ahora */
function reescribir(css: string, valor: Leer): string {
  const sinGuardia = css.replace(/@supports\s*\(\s*color\s*:\s*color-mix\(\s*in lab\s*,\s*red\s*,\s*red\s*\)\s*\)/g, '@supports (color:red)')
  let salida = ''
  let pos = 0
  for (;;) {
    const i = sinGuardia.indexOf('color-mix(', pos)
    if (i < 0) break
    const f = cierre(sinGuardia, i + 9)
    if (f < 0) break
    const original = sinGuardia.slice(i, f + 1)
    const nuevo = evaluar(original, valor)
    salida += sinGuardia.slice(pos, i) + (nuevo ?? original)
    pos = f + 1
  }
  return salida + sinGuardia.slice(pos)
}

/** Antes de dibujar la app: si el Safari no entiende `color-mix()`, se reescriben los estilos */
export async function repararColores(): Promise<void> {
  if (!sinColorMix) return
  try {
    const enlaces = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    const textos = await Promise.all(enlaces.map((l) => fetch(l.href).then((r) => r.text())))
    const hoja = document.createElement('style')
    hoja.setAttribute('data-compat', 'color-mix')
    document.head.append(hoja)
    enlaces.forEach((l) => (l.disabled = true))
    const raiz = document.documentElement
    const calcular = () => {
      // Varias vueltas: unos colores se arman con otros que a su vez eran color-mix
      for (let vuelta = 0; vuelta < 4; vuelta++) {
        const estilo = getComputedStyle(raiz)
        hoja.textContent = textos.map((t) => reescribir(t, (n) => estilo.getPropertyValue(n).trim())).join('\n')
      }
    }
    calcular()
    // Si cambia entre claro y oscuro (a mano o con el sistema), se recalcula
    new MutationObserver(calcular).observe(raiz, { attributes: true, attributeFilter: ['data-theme'] })
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', calcular)
  } catch {
    // Si algo falla, la app abre igual con los estilos tal cual
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((l) => (l.disabled = false))
  }
}

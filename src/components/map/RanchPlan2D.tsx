// Plano cenital ilustrado del rancho (step1): papel, capas, sombras teñidas hacia el sureste,
// pasto con franjas de corte, techos a dos aguas con cumbrera, árboles con sombra proyectada.
// Zoom con rueda y pellizco, arrastre, "vuelo" del viewBox al seleccionar, brújula y escala.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Locate, Minus, Plus } from 'lucide-react'
import { FEATURES, LOT_POLYGON, PATHS, TREES, type MapFeature, type Tree } from '@/lib/layout'
import { TONE, UNIT_STATUS } from '@/lib/meta'
import { useCollection } from '@/lib/store'
import type { UnitStatus } from '@/lib/types'
import { cx } from '@/components/ui'

interface VB {
  x: number
  y: number
  w: number
  h: number
}

const HOME: VB = { x: -46, y: -92, w: 92, h: 184 }
const MIN_W = 14
const MAX_W = 260

export interface RanchPlan2DProps {
  selectedId?: string | null
  onSelect?: (featureId: string) => void
  /** Quitar la selección (tocar fondo o "centrar") */
  onClear?: () => void
  compact?: boolean
  className?: string
  reducedMotion?: boolean
  /** Atenúa las unidades que no tengan este estado */
  statusFilter?: UnitStatus | null
  /** Muestra la leyenda de estados con conteos dentro del plano */
  legend?: boolean
  /** Estado a pintar por unidad (p. ej. a otra hora del día); si no, el estado actual */
  statusOf?: (unitId: string) => UnitStatus | undefined
}

// ── Paleta en tokens (se adapta a la atmósfera y al tema) ──
const C = {
  field: 'color-mix(in oklab, var(--sunken) 80%, var(--butter) 20%)',
  furrow: 'color-mix(in oklab, var(--sunken) 66%, var(--sage) 34%)',
  fieldAlt: 'color-mix(in oklab, var(--sunken) 72%, var(--chispa-soft) 28%)',
  street: 'color-mix(in oklab, var(--ink) 13%, var(--sunken))',
  streetLine: 'color-mix(in oklab, var(--paper) 80%, transparent)',
  lot: 'color-mix(in oklab, var(--sage) 22%, var(--paper))',
  fence: 'color-mix(in oklab, var(--matiz-ink) 55%, var(--paper))',
  lawn: 'color-mix(in oklab, var(--sage) 42%, var(--paper))',
  lawnStripe: 'color-mix(in oklab, var(--sage) 34%, var(--paper))',
  lawnAlt: 'color-mix(in oklab, var(--sage) 34%, var(--paper))',
  path: 'color-mix(in oklab, var(--luz) 60%, var(--paper))',
  pathEdge: 'color-mix(in oklab, var(--luz) 50%, var(--matiz) 30%)',
  sand: 'color-mix(in oklab, var(--butter) 34%, var(--paper))',
  parking: 'color-mix(in oklab, var(--ink) 9%, var(--sunken))',
  stall: 'color-mix(in oklab, var(--paper) 85%, transparent)',
  stone: 'color-mix(in oklab, var(--sunken) 60%, var(--paper))',
  water: 'color-mix(in oklab, var(--mint) 46%, var(--paper))',
  waterDeep: 'color-mix(in oklab, var(--mint) 64%, var(--paper))',
  gate: 'color-mix(in oklab, var(--rose) 70%, var(--ink) 10%)',
  shade: 'color-mix(in oklab, var(--shade) 20%, transparent)',
  shadeSoft: 'color-mix(in oklab, var(--shade) 12%, transparent)',
  cypress: 'color-mix(in oklab, var(--sage) 78%, var(--ink) 22%)',
  palm: 'color-mix(in oklab, var(--sage) 70%, var(--paper))',
  tree: 'color-mix(in oklab, var(--sage) 58%, var(--paper))',
  treeLight: 'color-mix(in oklab, var(--sage) 30%, var(--luz))',
  trunk: 'color-mix(in oklab, var(--matiz-ink) 70%, var(--paper))',
  wall: 'color-mix(in oklab, var(--surface) 90%, var(--sunken))',
}
/** Techos apagados: tono base de cada edificio */
const ROOF: Record<string, string> = {
  'cabana-1': 'var(--rose)',
  'cabana-2': 'var(--sage)',
  'cabana-3': 'var(--chispa-soft)',
  'casa-1': 'color-mix(in oklab, var(--chispa-soft) 60%, var(--paper))',
  'casa-2': 'color-mix(in oklab, var(--rose) 68%, var(--paper))',
  'casa-3': 'color-mix(in oklab, var(--chispa-soft) 80%, var(--paper))',
  'casa-4': 'color-mix(in oklab, var(--rose) 90%, var(--ink))',
  salon: 'color-mix(in oklab, var(--butter) 55%, var(--paper))',
  bodega: 'color-mix(in oklab, var(--chispa) 60%, var(--paper))',
}
const lightOf = (c: string) => `color-mix(in oklab, ${c} 78%, var(--luz))`
const darkOf = (c: string) => `color-mix(in oklab, ${c} 80%, var(--ink))`

const shortName = (f: MapFeature) => (f.kind === 'cabana' || f.kind === 'casa' ? f.name.replace(/^(Cabaña|Casa) /, '') : f.name)
const BUILDING_KINDS = ['cabana', 'casa', 'salon', 'bodega']

// La luz viene del noroeste: las sombras caen hacia el sureste (+x, +z)
const SH = { x: 0.42, z: 0.52 }

function starPoints(cx: number, cy: number, outer: number, inner: number, n = 7, rot = 0) {
  const pts: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer
    const a = rot + (i * Math.PI) / n
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`)
  }
  return pts.join(' ')
}

function TreeShape({ t }: { t: Tree }) {
  const s = t.s
  if (t.kind === 'cypress') {
    return (
      <g>
        <ellipse cx={t.x + 1.5 * s} cy={t.z + 1.9 * s} rx={1.05 * s} ry={2.6 * s} transform={`rotate(-38 ${t.x + 1.5 * s} ${t.z + 1.9 * s})`} style={{ fill: C.shade }} />
        <circle cx={t.x} cy={t.z} r={1.25 * s} style={{ fill: C.cypress }} />
        <circle cx={t.x - 0.35 * s} cy={t.z - 0.35 * s} r={0.5 * s} style={{ fill: C.tree }} opacity={0.7} />
      </g>
    )
  }
  if (t.kind === 'palm') {
    return (
      <g>
        <polygon points={starPoints(t.x + 1.8 * s, t.z + 2.3 * s, 2.1 * s, 0.85 * s, 7, 0.3)} style={{ fill: C.shadeSoft }} />
        <polygon points={starPoints(t.x, t.z, 2.1 * s, 0.85 * s, 7, 0.3)} style={{ fill: C.palm }} />
        <polygon points={starPoints(t.x - 0.2 * s, t.z - 0.2 * s, 1.1 * s, 0.45 * s, 7, 0.75)} style={{ fill: C.treeLight }} opacity={0.65} />
        <circle cx={t.x} cy={t.z} r={0.32 * s} style={{ fill: C.trunk }} />
      </g>
    )
  }
  return (
    <g>
      <circle cx={t.x + 1.1 * s} cy={t.z + 1.4 * s} r={2.3 * s} style={{ fill: C.shade }} />
      <circle cx={t.x} cy={t.z} r={2.3 * s} style={{ fill: C.tree }} />
      <circle cx={t.x - 0.6 * s} cy={t.z - 0.6 * s} r={1.25 * s} style={{ fill: C.treeLight }} opacity={0.55} />
    </g>
  )
}

/** Techo visto desde arriba: dos aguas (claro al norte, oscuro al sur) o cuatro aguas */
function Roof({ f, color, selected }: { f: MapFeature; color: string; selected: boolean }) {
  const ov = 0.45
  const x0 = f.x - f.w / 2 - ov
  const x1 = f.x + f.w / 2 + ov
  const z0 = f.z - f.d / 2 - ov
  const z1 = f.z + f.d / 2 + ov
  const zm = (z0 + z1) / 2
  const outline = <rect x={x0} y={z0} width={x1 - x0} height={z1 - z0} fill="none" style={{ stroke: selected ? 'var(--ink)' : darkOf(color) }} strokeWidth={selected ? 0.55 : 0.22} rx={0.3} />
  if (f.roof === 'hip') {
    const inset = (z1 - z0) / 2
    const rx0 = x0 + inset
    const rx1 = x1 - inset
    return (
      <g strokeLinejoin="round">
        <polygon points={`${x0},${z0} ${x1},${z0} ${rx1},${zm} ${rx0},${zm}`} style={{ fill: lightOf(color) }} />
        <polygon points={`${x0},${z1} ${x1},${z1} ${rx1},${zm} ${rx0},${zm}`} style={{ fill: darkOf(color) }} />
        <polygon points={`${x0},${z0} ${rx0},${zm} ${x0},${z1}`} style={{ fill: color }} />
        <polygon points={`${x1},${z0} ${rx1},${zm} ${x1},${z1}`} style={{ fill: `color-mix(in oklab, ${color} 88%, var(--ink))` }} />
        <path d={`M${x0} ${z0} L${rx0} ${zm} L${x0} ${z1} M${x1} ${z0} L${rx1} ${zm} L${x1} ${z1}`} fill="none" style={{ stroke: darkOf(color) }} strokeWidth={0.16} opacity={0.6} />
        <line x1={rx0} y1={zm} x2={rx1} y2={zm} style={{ stroke: darkOf(color) }} strokeWidth={0.28} />
        {outline}
      </g>
    )
  }
  return (
    <g>
      <rect x={x0} y={z0} width={x1 - x0} height={zm - z0} style={{ fill: lightOf(color) }} />
      <rect x={x0} y={zm} width={x1 - x0} height={z1 - zm} style={{ fill: darkOf(color) }} />
      {/* tejas: líneas finas paralelas a la cumbrera */}
      {[0.3, 0.62].map((k) => (
        <g key={k} style={{ stroke: `color-mix(in oklab, ${color} 70%, var(--ink))` }} strokeWidth={0.1} opacity={0.5}>
          <line x1={x0} x2={x1} y1={zm - (zm - z0) * k} y2={zm - (zm - z0) * k} />
          <line x1={x0} x2={x1} y1={zm + (z1 - zm) * k} y2={zm + (z1 - zm) * k} />
        </g>
      ))}
      <line x1={x0} x2={x1} y1={zm} y2={zm} style={{ stroke: darkOf(color) }} strokeWidth={0.32} />
      {outline}
    </g>
  )
}

const CARS: [number, number, string][] = [
  [-22.6, 58.2, 'var(--sky)'],
  [-17, 58.2, 'var(--surface)'],
  [-8.6, 58.2, 'var(--rose)'],
  [-19.8, 73.8, 'var(--sage)'],
  [-5.8, 73.8, 'var(--butter)'],
]

function niceLength(m: number) {
  const steps = [5, 10, 20, 25, 50, 100]
  return steps.find((s) => s >= m) ?? 100
}

export function RanchPlan2D({ selectedId, onSelect, onClear, compact, className, reducedMotion, statusFilter, legend, statusOf }: RanchPlan2DProps) {
  const st = (u: { id: string; status: UnitStatus }) => statusOf?.(u.id) ?? u.status
  const units = useCollection('units')
  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units])
  const svgRef = useRef<SVGSVGElement>(null)
  const uid = useId().replace(/:/g, '')
  const ID = { furrows: 'fw' + uid, furrowsAlt: 'fa' + uid, grass: 'gr' + uid, grassAlt: 'ga' + uid, sun: 'sn' + uid, halo: 'hl' + uid }
  const [vb, setVb] = useState<VB>(HOME)
  const [px, setPx] = useState({ w: 400, h: 800 })
  const vbRef = useRef(vb)
  vbRef.current = vb
  const anim = useRef<number | undefined>(undefined)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ moved: number; startDist?: number; startVb?: VB } | null>(null)

  const animateTo = (target: VB) => {
    cancelAnimationFrame(anim.current!)
    if (reducedMotion) return setVb(target)
    const from = vbRef.current
    const t0 = performance.now()
    const dur = 700
    // Salida suave y lenta (aproxima la curva "calma")
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - k, 4)
      setVb({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e })
      if (k < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }

  const fitHome = (): VB => {
    const el = svgRef.current
    const aspect = el ? el.clientWidth / Math.max(1, el.clientHeight) : 0.5
    const h = Math.max(HOME.h, HOME.w / aspect)
    return { x: (-h * aspect) / 2, y: -h / 2, w: h * aspect, h }
  }

  // Vuela al elemento seleccionado
  useEffect(() => {
    if (compact) return
    const f = selectedId ? FEATURES.find((x) => x.id === selectedId) : undefined
    if (!f) return animateTo(fitHome())
    const el = svgRef.current
    const aspect = el ? el.clientWidth / Math.max(1, el.clientHeight) : 0.5
    const w = Math.max(30, Math.max(f.w, f.d) * 2.6)
    const h = w / aspect
    animateTo({ x: f.x - w / 2, y: f.z - h / 2, w, h })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, compact])

  // Ajusta la proporción del viewBox y mide el lienzo (para la escala)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setPx({ w: el.clientWidth, h: el.clientHeight })
      if (compact) return
      const aspect = el.clientWidth / Math.max(1, el.clientHeight)
      setVb((v) => {
        const cx0 = v.x + v.w / 2
        const cy0 = v.y + v.h / 2
        const w = Math.max(v.w, aspect < 0.5 ? v.w : v.h * aspect)
        const h = w / aspect
        return { x: cx0 - w / 2, y: cy0 - h / 2, w, h }
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact])

  const toSvg = (clientX: number, clientY: number, v = vbRef.current) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: v.x + ((clientX - r.left) / r.width) * v.w, y: v.y + ((clientY - r.top) / r.height) * v.h }
  }

  const zoomAt = (factor: number, cx0?: number, cy0?: number) => {
    const v = vbRef.current
    const w = Math.min(MAX_W, Math.max(MIN_W, v.w * factor))
    const k = w / v.w
    const pxx = cx0 ?? v.x + v.w / 2
    const pyy = cy0 ?? v.y + v.h / 2
    setVb({ x: pxx - (pxx - v.x) * k, y: pyy - (pyy - v.y) * k, w, h: v.h * k })
  }

  const interactive = !compact
  const handlers = interactive
    ? {
        onWheel: (e: React.WheelEvent) => {
          cancelAnimationFrame(anim.current!)
          const p = toSvg(e.clientX, e.clientY)
          zoomAt(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y)
        },
        onPointerDown: (e: React.PointerEvent) => {
          cancelAnimationFrame(anim.current!)
          // No se captura el dedo aquí: si se capturara, el toque nunca llegaría a la casa y no se podría elegir.
          // Se captura en cuanto empieza a arrastrar (abajo)
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()]
            gesture.current = { moved: 99, startDist: Math.hypot(a!.x - b!.x, a!.y - b!.y), startVb: vbRef.current }
          } else gesture.current = { moved: 0 }
        },
        onPointerMove: (e: React.PointerEvent) => {
          const prev = pointers.current.get(e.pointerId)
          if (!prev || !gesture.current) return
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          const r = svgRef.current!.getBoundingClientRect()
          if (pointers.current.size === 2 && gesture.current.startDist && gesture.current.startVb) {
            const [a, b] = [...pointers.current.values()]
            const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
            const s = gesture.current.startVb
            const mid = toSvg((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, s)
            const w = Math.min(MAX_W, Math.max(MIN_W, s.w * (gesture.current.startDist / dist)))
            const k = w / s.w
            setVb({ x: mid.x - (mid.x - s.x) * k, y: mid.y - (mid.y - s.y) * k, w, h: s.h * k })
            return
          }
          const dx = ((e.clientX - prev.x) / r.width) * vbRef.current.w
          const dy = ((e.clientY - prev.y) / r.height) * vbRef.current.h
          gesture.current.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y)
          const el = e.currentTarget as Element
          if (gesture.current.moved > 6 && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId)
          setVb((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
        },
        onPointerUp: (e: React.PointerEvent) => {
          pointers.current.delete(e.pointerId)
          if (pointers.current.size === 0) setTimeout(() => (gesture.current = null), 0)
        },
        onPointerCancel: (e: React.PointerEvent) => {
          pointers.current.delete(e.pointerId)
          gesture.current = null
        },
      }
    : {}

  const pick = (id: string | null) => {
    if (gesture.current && gesture.current.moved > 6) return
    if (!id || (id === selectedId && !compact)) onClear?.()
    else onSelect?.(id)
  }

  const view = compact ? HOME : vb
  const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`
  const lot = LOT_POLYGON.map((p) => p.join(',')).join(' ')
  const metersPerPx = Math.max(view.w / Math.max(1, px.w), view.h / Math.max(1, px.h))
  // Etiquetas de tamaño casi constante en pantalla (~11 px) sin importar el zoom
  const labelScale = compact ? 1 : Math.max(0.3, Math.min(1.9, (11 * metersPerPx) / 1.85))
  const scaleLen = niceLength(metersPerPx * 90)
  const scalePx = scaleLen / metersPerPx
  const counts = useMemo(() => {
    const c: Partial<Record<UnitStatus, number>> = {}
    for (const u of units) c[st(u)] = (c[st(u)] ?? 0) + 1
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, statusOf])

  const selectedFeature = selectedId ? FEATURES.find((f) => f.id === selectedId) : undefined
  const isDim = (f: MapFeature) => {
    if (!statusFilter) return false
    const u = f.unitId ? unitById[f.unitId] : undefined
    return !u || st(u) !== statusFilter
  }
  const buildings = FEATURES.filter((f) => BUILDING_KINDS.includes(f.kind))

  return (
    <div className={cx('relative h-full w-full select-none', className)}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className={cx('h-full w-full', interactive && 'cursor-grab touch-none active:cursor-grabbing')}
        role="img"
        aria-label="Plano ilustrado del rancho Jardines La Joya"
        {...handlers}
        onClick={(e) => e.target === e.currentTarget && pick(null)}
      >
        <defs>
          {/* Surcos de cultivo */}
          <pattern id={ID.furrows} width="4.4" height="10" patternUnits="userSpaceOnUse">
            <rect width="4.4" height="10" style={{ fill: C.field }} />
            <rect width="1.5" height="10" style={{ fill: C.furrow }} />
          </pattern>
          <pattern id={ID.furrowsAlt} width="10" height="4" patternUnits="userSpaceOnUse">
            <rect width="10" height="4" style={{ fill: C.field }} />
            <rect width="10" height="1.3" style={{ fill: C.fieldAlt }} />
          </pattern>
          {/* Pasto con franjas de corte */}
          <pattern id={ID.grass} width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" style={{ fill: C.lawn }} />
            <rect width="3.5" height="7" style={{ fill: C.lawnStripe }} />
          </pattern>
          <pattern id={ID.grassAlt} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
            <rect width="7" height="7" style={{ fill: C.lawnAlt }} />
            <rect width="3.5" height="7" style={{ fill: C.lawnStripe }} />
          </pattern>
          <radialGradient id={ID.sun}>
            <stop offset="0%" style={{ stopColor: 'var(--luz)', stopOpacity: 1 }} />
            <stop offset="55%" style={{ stopColor: 'var(--luz)', stopOpacity: 0.85 }} />
            <stop offset="100%" style={{ stopColor: 'var(--luz)', stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id={ID.halo}>
            <stop offset="0%" style={{ stopColor: 'var(--luz)', stopOpacity: 0.95 }} />
            <stop offset="60%" style={{ stopColor: 'var(--luz)', stopOpacity: 0.45 }} />
            <stop offset="100%" style={{ stopColor: 'var(--luz)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* Campos alrededor (parcelas con surcos en distinta dirección) */}
        <rect x={-260} y={-260} width={520} height={520} fill={`url(#${ID.furrows})`} onClick={() => pick(null)} />
        <rect x={42} y={-260} width={220} height={150} fill={`url(#${ID.furrowsAlt})`} onClick={() => pick(null)} />
        <rect x={-260} y={95} width={215} height={170} fill={`url(#${ID.furrowsAlt})`} onClick={() => pick(null)} />

        {/* Calle C. Crisantemo */}
        <rect x={-44.5} y={-260} width={7} height={520} style={{ fill: C.street }} onClick={() => pick(null)} />
        <line x1={-41} x2={-41} y1={-260} y2={260} style={{ stroke: C.streetLine }} strokeWidth={0.22} strokeDasharray="2.4 2" pointerEvents="none" />
        {!compact && (
          <text x={-42.4} y={-30} fontSize={1.6 * labelScale} style={{ fill: 'var(--ink-soft)', letterSpacing: '0.14em' }} fontWeight={500} textAnchor="middle" transform="rotate(-90 -42.4 -30)" pointerEvents="none">
            C. CRISANTEMO
          </text>
        )}

        {/* La Luz: el sol de la tarde sobre los campos (solo en el plano completo) */}
        {!compact && (
          <g pointerEvents="none" aria-hidden>
            <circle cx={60} cy={-76} r={17} fill={`url(#${ID.sun})`} opacity={0.7} />
            <circle cx={60} cy={-76} r={6.4} style={{ fill: 'var(--luz)' }} />
          </g>
        )}

        {/* Lote con su cerca punteada */}
        <polygon points={lot} transform={`translate(${SH.x * 2} ${SH.z * 2})`} style={{ fill: C.shadeSoft }} pointerEvents="none" />
        <polygon points={lot} style={{ fill: C.lot }} onClick={() => pick(null)} />
        <polygon points={lot} fill="none" style={{ stroke: C.fence }} strokeWidth={0.4} strokeDasharray="1.2 0.9" pointerEvents="none" />

        {/* Áreas verdes */}
        {FEATURES.filter((f) => ['jardin', 'pasto'].includes(f.kind)).map((f) => {
          const sel = selectedId === f.id
          return (
            <g key={f.id} onClick={() => pick(f.id)} className="cursor-pointer">
              <rect x={f.x - f.w / 2} y={f.z - f.d / 2} width={f.w} height={f.d} rx={2.4} fill={`url(#${f.kind === 'jardin' ? ID.grass : ID.grassAlt})`} />
              {sel && <rect x={f.x - f.w / 2} y={f.z - f.d / 2} width={f.w} height={f.d} rx={2.4} fill="none" style={{ stroke: 'var(--ink)' }} strokeWidth={0.5} strokeDasharray="1.6 1" />}
            </g>
          )
        })}

        {/* Caminos de arena con borde suave */}
        <g pointerEvents="none" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {PATHS.map((p, i) => (
            <polyline key={`e${i}`} points={p.points.map((pt) => pt.join(',')).join(' ')} style={{ stroke: C.pathEdge }} strokeWidth={p.width + 0.7} opacity={0.55} />
          ))}
          {PATHS.map((p, i) => (
            <polyline key={`p${i}`} points={p.points.map((pt) => pt.join(',')).join(' ')} style={{ stroke: C.path }} strokeWidth={p.width} />
          ))}
        </g>

        {/* Glorieta, juegos, estacionamiento y entrada */}
        {FEATURES.filter((f) => ['parking', 'juegos', 'glorieta', 'entrada'].includes(f.kind)).map((f) => {
          const sel = selectedId === f.id
          if (f.kind === 'glorieta')
            return (
              <g key={f.id} onClick={() => pick(f.id)} className="cursor-pointer">
                <circle cx={f.x} cy={f.z} r={7.25} style={{ fill: C.pathEdge }} opacity={0.55} />
                <circle cx={f.x} cy={f.z} r={6.9} style={{ fill: C.path }} />
                <circle cx={f.x} cy={f.z} r={5} fill={`url(#${ID.grassAlt})`} />
                <circle cx={f.x + 0.5} cy={f.z + 0.6} r={2.2} style={{ fill: C.shade }} />
                <circle cx={f.x} cy={f.z} r={2.2} style={{ fill: C.stone }} />
                <circle cx={f.x} cy={f.z} r={1.65} style={{ fill: C.water }} />
                <circle cx={f.x} cy={f.z} r={1.05} fill="none" style={{ stroke: C.waterDeep }} strokeWidth={0.12} />
                <circle cx={f.x} cy={f.z} r={0.35} style={{ fill: C.stone }} />
                {sel && <circle cx={f.x} cy={f.z} r={7.5} fill="none" style={{ stroke: 'var(--ink)' }} strokeWidth={0.5} />}
              </g>
            )
          if (f.kind === 'juegos') {
            const roof = ROOF['cabana-3']!
            return (
              <g key={f.id} onClick={() => pick(f.id)} className="cursor-pointer">
                <ellipse cx={f.x} cy={f.z} rx={f.w / 2} ry={f.d / 2} style={{ fill: C.sand, stroke: sel ? 'var(--ink)' : 'none' }} strokeWidth={0.5} />
                <polygon points={starPoints(f.x + 0.9, f.z + 1.1, 3, 3, 3, Math.PI / 6)} style={{ fill: C.shade }} />
                <polygon points={starPoints(f.x, f.z, 3, 3, 3, Math.PI / 6)} style={{ fill: darkOf(roof) }} />
                <polygon points={starPoints(f.x - 0.3, f.z - 0.3, 1.7, 1.7, 3, Math.PI / 6)} style={{ fill: lightOf(roof) }} />
              </g>
            )
          }
          if (f.kind === 'parking') {
            const stalls = Math.floor((f.w - 1.6) / 2.8)
            return (
              <g key={f.id} onClick={() => pick(f.id)} className="cursor-pointer">
                <rect x={f.x - f.w / 2} y={f.z - f.d / 2} width={f.w} height={f.d} rx={1.2} style={{ fill: C.parking, stroke: sel ? 'var(--ink)' : 'none' }} strokeWidth={0.5} />
                {[f.z - f.d / 2, f.z + f.d / 2 - 5].map((row) =>
                  Array.from({ length: stalls + 1 }).map((_, i) => <rect key={`${row}-${i}`} x={f.x - f.w / 2 + 0.8 + i * 2.8} y={row} width={0.14} height={5} style={{ fill: C.stall }} />),
                )}
                {CARS.map(([x, z, color], i) => (
                  <g key={i}>
                    <rect x={x - 0.55} y={z - 1.6} width={1.9} height={4.2} rx={0.7} style={{ fill: C.shade }} />
                    <rect x={x - 0.95} y={z - 2.1} width={1.9} height={4.2} rx={0.7} style={{ fill: `color-mix(in oklab, ${color} 70%, var(--paper))` }} />
                    <rect x={x - 0.7} y={z - 0.9} width={1.4} height={1.6} rx={0.3} style={{ fill: 'color-mix(in oklab, var(--ink) 30%, var(--paper))' }} opacity={0.6} />
                  </g>
                ))}
              </g>
            )
          }
          return (
            <g key={f.id} onClick={() => pick(f.id)} className="cursor-pointer">
              <rect x={f.x - 0.8} y={f.z - f.d / 2 - 0.5} width={1.6} height={1.6} rx={0.3} style={{ fill: C.gate }} />
              <rect x={f.x - 0.8} y={f.z + f.d / 2 - 1.1} width={1.6} height={1.6} rx={0.3} style={{ fill: C.gate }} />
              <line x1={f.x} x2={f.x} y1={f.z - f.d / 2 + 1} y2={f.z + f.d / 2 - 1} style={{ stroke: C.gate }} strokeWidth={0.3} strokeDasharray="0.6 0.4" />
            </g>
          )
        })}

        {/* Sombras de edificios (hacia el sureste) */}
        <g pointerEvents="none">
          {buildings.map((f) => {
            const h = f.height ?? 3
            return <rect key={`s${f.id}`} x={f.x - f.w / 2 + h * SH.x} y={f.z - f.d / 2 + h * SH.z} width={f.w + 0.9} height={f.d + 0.9} rx={0.8} style={{ fill: C.shade }} opacity={isDim(f) ? 0.4 : 1} />
          })}
        </g>

        {/* Árboles con sombra proyectada */}
        <g pointerEvents="none">
          {TREES.map((t, i) => (
            <TreeShape key={i} t={t} />
          ))}
        </g>

        {/* Halo de luz bajo lo seleccionado */}
        {!compact && selectedFeature && BUILDING_KINDS.includes(selectedFeature.kind) && (
          <ellipse cx={selectedFeature.x} cy={selectedFeature.z} rx={selectedFeature.w * 0.95 + 4} ry={selectedFeature.d * 0.95 + 4} fill={`url(#${ID.halo})`} pointerEvents="none" />
        )}

        {/* Edificios: anillo de estado + techo */}
        {buildings.map((f) => {
          const u = f.unitId ? unitById[f.unitId] : undefined
          const tone = u ? TONE[UNIT_STATUS[st(u)].tone].hex : f.kind === 'salon' ? 'var(--matiz)' : undefined
          const sel = selectedId === f.id
          return (
            <g key={f.id} onClick={() => pick(f.id)} className="cursor-pointer" opacity={isDim(f) ? 0.38 : 1} style={{ transition: 'opacity 280ms' }}>
              {tone && <rect x={f.x - f.w / 2 - 1.7} y={f.z - f.d / 2 - 1.7} width={f.w + 3.4} height={f.d + 3.4} rx={2.2} style={{ fill: `color-mix(in oklab, ${tone} 22%, transparent)`, stroke: tone }} strokeWidth={sel ? 0.75 : 0.5} />}
              <rect x={f.x - f.w / 2} y={f.z - f.d / 2} width={f.w} height={f.d} rx={0.4} style={{ fill: C.wall }} />
              <Roof f={f} color={ROOF[f.id] ?? C.sand} selected={sel} />
            </g>
          )
        })}

        {/* Etiquetas pill */}
        {!compact &&
          FEATURES.filter((f) => ['cabana', 'casa', 'salon', 'jardin', 'parking', 'juegos', 'bodega'].includes(f.kind)).map((f) => {
            const u = f.unitId ? unitById[f.unitId] : undefined
            const sel = selectedId === f.id
            const fs = 1.85 * labelScale * (sel ? 1.12 : 1)
            const text = shortName(f)
            const w = text.length * fs * 0.56 + (u ? fs * 1.6 : 0) + fs * 1.6
            // Casas apiladas: etiqueta al poniente; cabañas 2 y 3: al oriente; el resto, arriba
            const side = f.kind === 'casa' ? 'left' : f.id === 'cabana-2' || f.id === 'cabana-3' ? 'right' : 'top'
            const lx = side === 'left' ? f.x - f.w / 2 - 1.4 - w / 2 : side === 'right' ? f.x + f.w / 2 + 1.4 + w / 2 : f.x
            const y = side !== 'top' ? f.z : f.kind === 'jardin' ? f.z - f.d / 2 + 4 : f.z - f.d / 2 - fs * 1.4
            return (
              <g key={`l-${f.id}`} pointerEvents="none" transform={`translate(${lx} ${y})`} opacity={isDim(f) && f.unitId ? 0.4 : 1}>
                <rect x={-w / 2 + 0.25} y={-fs * 0.95 + 0.35} width={w} height={fs * 1.9} rx={fs * 0.95} style={{ fill: C.shadeSoft }} />
                <rect x={-w / 2} y={-fs * 0.95} width={w} height={fs * 1.9} rx={fs * 0.95} style={{ fill: sel ? 'var(--ink)' : 'var(--surface)', stroke: sel ? 'none' : 'var(--line)' }} strokeWidth={0.1} />
                {u && <circle cx={-w / 2 + fs * 1.05} cy={0} r={fs * 0.38} style={{ fill: TONE[UNIT_STATUS[st(u)].tone].hex }} />}
                <text x={u ? fs * 0.42 : 0} y={fs * 0.35} fontSize={fs} fontWeight={500} textAnchor="middle" style={{ fill: sel ? 'var(--paper)' : 'var(--ink)' }}>
                  {text}
                </text>
              </g>
            )
          })}
      </svg>

      {interactive && (
        <>
          {/* Brújula y controles */}
          <div className="absolute right-3 bottom-3 flex flex-col items-center gap-2 md:right-4 md:bottom-4">
            <span aria-label="El norte está arriba" role="img" className="glass flex h-11 w-11 flex-col items-center justify-center rounded-full shadow-[var(--shadow-2)] ring-1 ring-line">
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                <path d="M10 1.5 L14 12 L10 9.6 L6 12 Z" style={{ fill: 'var(--chispa)' }} />
              </svg>
              <span className="text-[9px] leading-none font-medium text-ink">N</span>
            </span>
            <div className="glass flex flex-col overflow-hidden rounded-full shadow-[var(--shadow-2)] ring-1 ring-line">
              <button aria-label="Acercar" className="flex h-11 w-11 items-center justify-center text-ink-soft hover:bg-wash hover:text-ink" onClick={() => zoomAt(1 / 1.35)}>
                <Plus size={18} strokeWidth={1.6} />
              </button>
              <button aria-label="Alejar" className="flex h-11 w-11 items-center justify-center border-t border-line text-ink-soft hover:bg-wash hover:text-ink" onClick={() => zoomAt(1.35)}>
                <Minus size={18} strokeWidth={1.6} />
              </button>
              <button
                aria-label="Centrar el plano"
                className="flex h-11 w-11 items-center justify-center border-t border-line text-ink-soft hover:bg-wash hover:text-ink"
                onClick={() => {
                  onClear?.()
                  animateTo(fitHome())
                }}
              >
                <Locate size={17} strokeWidth={1.6} />
              </button>
            </div>
          </div>

          {/* Barra de escala */}
          <div className="glass pointer-events-none absolute bottom-3 left-3 rounded-full px-3 py-1.5 shadow-[var(--shadow-1)] ring-1 ring-line md:bottom-4 md:left-4" aria-label={`Escala: ${scaleLen} metros`}>
            <div className="flex items-center gap-2 text-[10px] text-detail">
              <span className="relative block h-1.5 overflow-hidden rounded-full bg-ink" style={{ width: Math.max(24, Math.min(160, scalePx)) }}>
                <span className="absolute inset-y-0 right-0 w-1/2 bg-paper" />
              </span>
              <span className="tabular">{scaleLen} m</span>
            </div>
          </div>

          {legend && (
            <div className="glass absolute top-3 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-x-3 gap-y-1 rounded-full px-4 py-1.5 text-[11px] text-detail shadow-[var(--shadow-1)] ring-1 ring-line">
              {(Object.keys(UNIT_STATUS) as UnitStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cx('h-2 w-2 rounded-full', TONE[UNIT_STATUS[s].tone].solid)} />
                  {UNIT_STATUS[s].label}
                  <span className="tabular text-ink-3">{counts[s] ?? 0}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default RanchPlan2D

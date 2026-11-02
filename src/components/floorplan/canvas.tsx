// Dibujo del plano de mesas en SVG (metros). En pantalla usa tokens de step1; al exportar se
// sustituyen por colores fijos (ver export.ts).
import type { FloorItem, FloorItemType, Venue } from '@/lib/types'
import { ITEM_SPECS } from '@/lib/floorplan'
import { VENUE_SPACES } from '@/lib/layout'
import { TONE } from '@/lib/meta'
import { chairSlots } from './geometry'

export const SWATCH = {
  canvas: ['var(--sunken)', '#EEDBD0'],
  world: ['var(--paper)', '#F6EAE3'],
  floor: ['var(--surface)', '#FCF6F1'],
  wall: ['var(--ink-soft)', '#74484E'],
  grid: ['var(--line)', '#EBDCD5'],
  grid5: ['var(--line-strong)', '#DCC6BE'],
  lawn: ['color-mix(in oklab, var(--sage) 20%, var(--surface))', '#E8E3D3'],
  lawnDark: ['color-mix(in oklab, var(--sage) 36%, var(--surface))', '#D5CFB7'],
  lawnGrid: ['color-mix(in oklab, var(--sage) 28%, var(--surface))', '#DED8C4'],
  lawnGrid5: ['color-mix(in oklab, var(--sage) 40%, var(--surface))', '#CFC8AE'],
  ink: ['var(--ink)', '#43222A'],
  ink3: ['var(--ink-soft)', '#74484E'],
  chair: ['var(--surface)', '#FCF6F1'],
  chairStroke: ['var(--line-strong)', '#D3BDB5'],
  bad: ['var(--danger)', '#963636'],
  selected: ['var(--primary)', '#8A4649'],
  path: ['var(--sunken)', '#EEDBD0'],
  pathStroke: ['var(--line-strong)', '#D3BDB5'],
  water: ['color-mix(in oklab, var(--t-sky) 26%, var(--surface))', '#DADBE2'],
  waterStroke: ['color-mix(in oklab, var(--t-sky) 50%, var(--surface))', '#ACB1C3'],
  palm: ['color-mix(in oklab, var(--sage) 55%, var(--surface))', '#B9B596'],
  palm2: ['var(--sage)', '#7C7A55'],
  kitchen: ['color-mix(in oklab, var(--lavender) 18%, var(--surface))', '#EFE6E6'],
  banos: ['color-mix(in oklab, var(--t-sky) 14%, var(--surface))', '#E8E6EA'],
  check1: ['color-mix(in oklab, var(--butter) 18%, var(--surface))', '#F3E6D2'],
  check2: ['color-mix(in oklab, var(--butter) 38%, var(--surface))', '#E9D2AE'],
  tent: ['color-mix(in oklab, var(--t-sky) 12%, transparent)', 'rgba(92,105,137,0.12)'],
  tentLine: ['color-mix(in oklab, var(--t-sky) 45%, transparent)', 'rgba(92,105,137,0.45)'],
  neon: ['var(--luz)', '#F3D8BC'],
  neonGlow: ['var(--chispa-soft)', '#D98474'],
  guide: ['var(--chispa)', '#B04D3D'],
  door: ['color-mix(in oklab, var(--danger) 16%, transparent)', 'rgba(150,54,54,0.16)'],
  path2: ['color-mix(in oklab, var(--butter) 22%, transparent)', 'rgba(201,151,79,0.22)'],
} as const
export type SwatchKey = keyof typeof SWATCH
export const PAPER = Object.fromEntries(Object.entries(SWATCH).map(([k, v]) => [k, v[0]])) as Record<SwatchKey, string>

const FONT = 'DM Sans Variable, system-ui, sans-serif'

export interface SeatInfo {
  label: string
  fill: string
}

// ── Sillas ───────────────────────────────────────────────
function Chairs({ it, seats }: { it: FloorItem; seats?: (SeatInfo | null)[] }) {
  const slots = chairSlots(it)
  if (!slots.length) return null
  return (
    <g>
      {slots.map((p, i) => {
        const s = seats?.[i]
        return (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <circle r={0.21} fill={s ? s.fill : PAPER.chair} stroke={PAPER.chairStroke} strokeWidth={0.035} />
            {s && (
              <text textAnchor="middle" dominantBaseline="central" fontSize={0.15} fontWeight={600} fill={PAPER.ink} transform={`rotate(${-it.rot})`} style={{ userSelect: 'none', pointerEvents: 'none', fontFamily: FONT }}>
                {s.label}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

// ── Pieza ────────────────────────────────────────────────
export function ItemShape({ it, selected, bad, fill: fillOverride, seats, diet, dim }: { it: FloorItem; selected: boolean; bad: boolean; fill?: string; seats?: (SeatInfo | null)[]; diet?: boolean; dim?: boolean }) {
  const spec = ITEM_SPECS[it.type]
  const w = it.w ?? spec.w
  const h = it.h ?? spec.h
  const tone = TONE[spec.tone].hex
  const fill = fillOverride ?? it.color ?? tone
  const linen = !!it.color && !fillOverride
  const stroke = bad ? PAPER.bad : selected ? PAPER.selected : tone
  const sw = selected ? 0.09 : 0.05
  const numbered = spec.isTable && it.number
  const title = numbered ? String(it.number) : it.label ?? it.name ?? (spec.isTable ? '' : spec.label)
  const sub = numbered ? it.name : undefined
  const minSide = Math.min(w, h)
  const fontSize = numbered ? Math.min(0.72, Math.max(0.34, minSide * 0.4)) : Math.min(0.5, Math.max(0.26, minSide * 0.22))
  const fo = linen ? 0.62 : spec.isTable ? 0.32 : 0.4

  let body
  switch (it.type) {
    case 'pista':
      body = <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.2} fill="url(#fp-checker)" stroke={stroke} strokeWidth={sw} />
      break
    case 'sillas-ceremonia': {
      const cols = Math.max(1, Math.floor(w / 0.55))
      const rows = Math.max(1, Math.floor(h / 0.9))
      const total = Math.min(it.seats ?? cols * rows, cols * rows)
      const dots = []
      for (let i = 0; i < total; i++) {
        const c = i % cols
        const r = Math.floor(i / cols)
        dots.push(<rect key={i} x={-w / 2 + c * 0.55 + 0.08} y={-h / 2 + r * 0.9 + 0.2} width={0.4} height={0.4} rx={0.08} fill={PAPER.chair} stroke={PAPER.chairStroke} strokeWidth={0.03} />)
      }
      body = (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.2} fill={fill} fillOpacity={0.16} stroke={stroke} strokeWidth={sw} strokeDasharray="0.2 0.15" />
          {dots}
        </g>
      )
      break
    }
    case 'lounge':
      body = (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.3} fill={fill} fillOpacity={0.22} stroke={stroke} strokeWidth={sw} />
          <rect x={-w / 2 + 0.25} y={-h / 2 + 0.25} width={w - 0.5} height={0.6} rx={0.2} fill={fill} fillOpacity={0.7} />
          <rect x={-w / 2 + 0.25} y={-h / 2 + 0.25} width={0.6} height={h - 0.5} rx={0.2} fill={fill} fillOpacity={0.7} />
          <circle cx={0.35} cy={0.35} r={0.45} fill={PAPER.chair} stroke={tone} strokeWidth={0.05} />
        </g>
      )
      break
    case 'carpa':
      body = (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.4} fill={PAPER.tent} stroke={selected ? PAPER.selected : PAPER.tentLine} strokeWidth={sw} strokeDasharray="0.35 0.2" />
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.4} fill="url(#fp-tent)" />
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke={PAPER.tentLine} strokeWidth={0.05} />
          {[
            [-w / 2, -h / 2],
            [w / 2, -h / 2],
            [-w / 2, h / 2],
            [w / 2, h / 2],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={0.16} fill={PAPER.wall} />
          ))}
        </g>
      )
      break
    case 'arco': {
      const flowers = Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI + (Math.PI * i) / 8
        return [Math.cos(a) * (w / 2), Math.sin(a) * (h * 1.1) + h / 2] as const
      })
      body = (
        <g>
          <path d={`M ${-w / 2} ${h / 2} A ${w / 2} ${h * 1.1} 0 0 1 ${w / 2} ${h / 2}`} fill="none" stroke={stroke} strokeWidth={0.14} strokeLinecap="round" />
          {flowers.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={0.13} fill={fill} fillOpacity={0.85} />
          ))}
        </g>
      )
      break
    }
    case 'tarima':
    case 'escenario':
      body = (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.18} fill={fill} fillOpacity={0.42} stroke={stroke} strokeWidth={sw} />
          <rect x={-w / 2 + 0.2} y={-h / 2 + 0.2} width={Math.max(0.1, w - 0.4)} height={Math.max(0.1, h - 0.4)} rx={0.12} fill="none" stroke={tone} strokeWidth={0.04} strokeOpacity={0.7} />
        </g>
      )
      break
    case 'letrero':
      body = (
        <g>
          <rect x={-w / 2 - 0.12} y={-h / 2 - 0.12} width={w + 0.24} height={h + 0.24} rx={0.2} fill={PAPER.neonGlow} fillOpacity={0.22} />
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.12} fill={PAPER.neon} stroke={selected ? PAPER.selected : PAPER.neonGlow} strokeWidth={sw} />
        </g>
      )
      break
    case 'pasillo': {
      const petals = []
      for (let y = -h / 2 + 0.4; y < h / 2; y += 0.7) petals.push(<circle key={'l' + y} cx={-w / 2 + 0.12} cy={y} r={0.07} fill={tone} />, <circle key={'r' + y} cx={w / 2 - 0.12} cy={y} r={0.07} fill={tone} />)
      body = (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.08} fill={fill} fillOpacity={0.28} stroke={stroke} strokeWidth={sw} />
          {petals}
        </g>
      )
      break
    }
    case 'planta':
      body = (
        <g>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2
            return <ellipse key={i} cx={Math.cos(a) * w * 0.25} cy={Math.sin(a) * w * 0.25} rx={w * 0.22} ry={w * 0.13} transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * w * 0.25} ${Math.sin(a) * w * 0.25})`} fill={tone} fillOpacity={0.75} />
          })}
          <circle r={w * 0.16} fill={PAPER.palm2} />
          {selected && <circle r={w / 2 + 0.08} fill="none" stroke={PAPER.selected} strokeWidth={0.06} />}
        </g>
      )
      break
    case 'mesa-dulces':
      body = (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.18} fill={fill} fillOpacity={0.4} stroke={stroke} strokeWidth={sw} />
          {Array.from({ length: Math.max(3, Math.floor(w / 0.45)) }, (_, i) => i).map((i, _, arr) => (
            <circle key={i} cx={-w / 2 + (w / arr.length) * (i + 0.5)} cy={0} r={0.12} fill={TONE[(['rose', 'butter', 'lavender', 'mint'] as const)[i % 4]!].hex} />
          ))}
        </g>
      )
      break
    default:
      if (spec.shape === 'circle') body = <circle r={w / 2} fill={fill} fillOpacity={it.type === 'periquera' ? 0.55 : fo} stroke={stroke} strokeWidth={sw} />
      else if (spec.shape === 'half') body = <path d={`M ${-w / 2} ${-h / 2} L ${w / 2} ${-h / 2} A ${w / 2} ${w / 2} 0 0 1 ${-w / 2} ${-h / 2} Z`} fill={fill} fillOpacity={fo} stroke={stroke} strokeWidth={sw} />
      else body = <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(0.25, h / 3)} fill={fill} fillOpacity={spec.isTable ? fo : 0.4} stroke={stroke} strokeWidth={sw} />
  }

  const showLabel = title && it.type !== 'planta' && it.type !== 'arco'
  const labelY = spec.shape === 'half' ? -h / 2 + Math.min(0.5, h * 0.45) : 0
  return (
    <g opacity={dim ? 0.35 : 1}>
      {bad && (spec.shape === 'circle' ? <circle r={w / 2 + 0.55} fill={PAPER.bad} fillOpacity={0.12} /> : <rect x={-w / 2 - 0.3} y={-h / 2 - 0.3} width={w + 0.6} height={h + 0.6} rx={0.3} fill={PAPER.bad} fillOpacity={0.12} />)}
      <Chairs it={it} seats={seats} />
      {body}
      {selected && it.type !== 'planta' && (spec.shape === 'circle' ? <circle r={w / 2 + 0.62} fill="none" stroke={PAPER.selected} strokeWidth={0.05} strokeDasharray="0.18 0.12" /> : <rect x={-w / 2 - 0.5} y={-h / 2 - 0.5} width={w + 1} height={h + 1} rx={0.35} fill="none" stroke={PAPER.selected} strokeWidth={0.05} strokeDasharray="0.18 0.12" />)}
      {showLabel && (
        <g transform={`translate(0 ${labelY}) rotate(${-it.rot})`} style={{ userSelect: 'none', pointerEvents: 'none' }}>
          <text textAnchor="middle" dominantBaseline="central" y={sub ? -fontSize * 0.28 : 0} fontSize={fontSize} fontWeight={numbered ? 600 : 500} fill={PAPER.ink} style={{ fontFamily: FONT }}>
            {title}
          </text>
          {sub && (
            <text textAnchor="middle" dominantBaseline="central" y={fontSize * 0.55} fontSize={Math.max(0.17, fontSize * 0.36)} fill={PAPER.ink3} style={{ fontFamily: FONT }}>
              {sub.length > 14 ? sub.slice(0, 13) + '…' : sub}
            </text>
          )}
        </g>
      )}
      {it.locked && (
        <g transform={`translate(${w / 2 - 0.05} ${-h / 2 + 0.05}) rotate(${-it.rot})`} style={{ pointerEvents: 'none' }}>
          <circle r={0.26} fill={PAPER.floor} stroke={PAPER.chairStroke} strokeWidth={0.03} />
          <rect x={-0.1} y={-0.02} width={0.2} height={0.15} rx={0.03} fill={PAPER.ink3} />
          <path d="M -0.06 -0.02 V -0.08 A 0.06 0.06 0 0 1 0.06 -0.08 V -0.02" fill="none" stroke={PAPER.ink3} strokeWidth={0.03} />
        </g>
      )}
      {diet && (
        <g transform={`translate(${-w / 2 + 0.05} ${-h / 2 + 0.05}) rotate(${-it.rot})`} style={{ pointerEvents: 'none' }}>
          <circle r={0.24} fill={PAPER.floor} stroke={PAPER.chairStroke} strokeWidth={0.03} />
          <path d="M -0.11 0.09 C -0.11 -0.06 0 -0.12 0.12 -0.12 C 0.12 0.02 0.04 0.11 -0.11 0.09 Z M -0.11 0.09 L 0.04 -0.04" fill={PAPER.palm2} stroke={PAPER.palm2} strokeWidth={0.02} />
        </g>
      )}
    </g>
  )
}

// ── Recinto ──────────────────────────────────────────────
function Grid({ W, H, lawn }: { W: number; H: number; lawn?: boolean }) {
  const lines = []
  for (let x = 1; x < W; x++) lines.push(<line key={'x' + x} x1={x} x2={x} y1={0} y2={H} stroke={x % 5 === 0 ? (lawn ? PAPER.lawnGrid5 : PAPER.grid5) : lawn ? PAPER.lawnGrid : PAPER.grid} strokeWidth={x % 5 === 0 ? 0.04 : 0.025} />)
  for (let y = 1; y < H; y++) lines.push(<line key={'y' + y} y1={y} y2={y} x1={0} x2={W} stroke={y % 5 === 0 ? (lawn ? PAPER.lawnGrid5 : PAPER.grid5) : lawn ? PAPER.lawnGrid : PAPER.grid} strokeWidth={y % 5 === 0 ? 0.04 : 0.025} />)
  return <g>{lines}</g>
}

export function VenueBackground({ venue, grid }: { venue: Venue; grid: boolean }) {
  if (venue === 'salon') {
    const { w: W, h: H } = VENUE_SPACES.salon
    return (
      <g>
        <rect x={-0.4} y={-0.4} width={W + 0.8} height={H + 0.8} rx={0.4} fill={PAPER.wall} />
        <rect x={0} y={0} width={W} height={H} fill={PAPER.floor} />
        {grid && <Grid W={W} H={H} />}
        {/* Columnas */}
        {[W / 3, (2 * W) / 3].map((x) => [0.35, H - 0.35].map((y) => <rect key={`${x}-${y}`} x={x - 0.25} y={y - 0.25} width={0.5} height={0.5} fill={PAPER.wall} opacity={0.75} />))}
        {/* Puertas */}
        <rect x={W / 2 - 1.6} y={H - 0.1} width={3.2} height={0.6} fill={PAPER.floor} />
        <path d={`M ${W / 2 - 1.6} ${H} A 1.6 1.6 0 0 1 ${W / 2} ${H - 1.6}`} fill="none" stroke={PAPER.ink3} strokeWidth={0.04} strokeDasharray="0.12 0.1" />
        <path d={`M ${W / 2 + 1.6} ${H} A 1.6 1.6 0 0 0 ${W / 2} ${H - 1.6}`} fill="none" stroke={PAPER.ink3} strokeWidth={0.04} strokeDasharray="0.12 0.1" />
        <rect x={-0.5} y={H / 2 - 1.2} width={0.6} height={2.4} fill={PAPER.floor} />
        <text x={W / 2} y={H + 1.1} textAnchor="middle" fontSize={0.55} fontWeight={700} fill={PAPER.ink3} style={{ fontFamily: FONT }}>
          Entrada principal
        </text>
        <text x={-1} y={H / 2} textAnchor="middle" fontSize={0.45} fontWeight={700} fill={PAPER.ink3} transform={`rotate(-90 ${-1} ${H / 2})`} style={{ fontFamily: FONT }}>
          Al jardín
        </text>
        <g>
          <rect x={W + 0.4} y={0} width={4} height={8} fill={PAPER.kitchen} stroke={PAPER.wall} strokeWidth={0.1} />
          <text x={W + 2.4} y={4} textAnchor="middle" dominantBaseline="central" fontSize={0.55} fontWeight={700} fill={PAPER.ink3} style={{ fontFamily: FONT }}>
            Cocina
          </text>
          <rect x={W + 0.4} y={10} width={4} height={8} fill={PAPER.banos} stroke={PAPER.wall} strokeWidth={0.1} />
          <text x={W + 2.4} y={14} textAnchor="middle" dominantBaseline="central" fontSize={0.55} fontWeight={700} fill={PAPER.ink3} style={{ fontFamily: FONT }}>
            Baños
          </text>
        </g>
      </g>
    )
  }
  const { w: W, h: H, obstacle } = VENUE_SPACES.jardin
  const palms: [number, number][] = []
  for (let x = 2; x < W; x += 6.5) palms.push([x, -1.4], [x, H + 1.4])
  return (
    <g>
      <rect x={-2.5} y={-2.5} width={W + 5} height={H + 5} rx={2} fill={PAPER.lawnDark} />
      <rect x={0} y={0} width={W} height={H} rx={1} fill={PAPER.lawn} />
      {grid && <Grid W={W} H={H} lawn />}
      <rect x={obstacle.x - 1.5} y={0} width={3} height={obstacle.y - obstacle.r} fill={PAPER.path} opacity={0.9} />
      <rect x={obstacle.x - 1.5} y={obstacle.y + obstacle.r} width={3} height={H - obstacle.y - obstacle.r} fill={PAPER.path} opacity={0.9} />
      <circle cx={obstacle.x} cy={obstacle.y} r={obstacle.r} fill={PAPER.path} stroke={PAPER.pathStroke} strokeWidth={0.12} />
      <circle cx={obstacle.x} cy={obstacle.y} r={obstacle.r * 0.42} fill={PAPER.water} stroke={PAPER.waterStroke} strokeWidth={0.12} />
      <text x={obstacle.x} y={obstacle.y + obstacle.r * 0.68} textAnchor="middle" fontSize={0.6} fontWeight={700} fill={PAPER.ink3} style={{ fontFamily: FONT }}>
        {obstacle.label}
      </text>
      {palms.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r={0.9} fill={PAPER.palm} />
          <circle r={0.35} fill={PAPER.palm2} />
        </g>
      ))}
      <text x={W / 2} y={H + 3.4} textAnchor="middle" fontSize={0.7} fontWeight={700} fill={PAPER.ink3} style={{ fontFamily: FONT }}>
        Hacia el salón
      </text>
    </g>
  )
}

export function venueBounds(venue: Venue) {
  const { w: W, h: H } = VENUE_SPACES[venue]
  return venue === 'salon' ? { x: -2, y: -2, w: W + 7.5, h: H + 4.5 } : { x: -4, y: -4, w: W + 8, h: H + 9 }
}

export function SvgDefs() {
  return (
    <defs>
      <pattern id="fp-checker" width={1} height={1} patternUnits="userSpaceOnUse">
        <rect width={1} height={1} fill={PAPER.check1} />
        <rect width={0.5} height={0.5} fill={PAPER.check2} />
        <rect x={0.5} y={0.5} width={0.5} height={0.5} fill={PAPER.check2} />
      </pattern>
      <pattern id="fp-tent" width={0.8} height={0.8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={0.8} stroke={PAPER.tentLine} strokeWidth={0.04} />
      </pattern>
      <pattern id="fp-hatch" width={0.5} height={0.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={0.5} stroke={PAPER.bad} strokeWidth={0.08} strokeOpacity={0.45} />
      </pattern>
    </defs>
  )
}

/** Ícono de paleta: la pieza real dibujada en miniatura */
export function PaletteIcon({ type, size = 36 }: { type: FloorItemType; size?: number }) {
  const spec = ITEM_SPECS[type]
  const demo: FloorItem =
    type === 'sillas-ceremonia'
      ? { id: 'demo', type, x: 0, y: 0, rot: 0, w: 4, h: 3, seats: 21 }
      : type === 'carpa'
        ? { id: 'demo', type, x: 0, y: 0, rot: 0, w: 4, h: 3 }
        : type === 'pasillo'
          ? { id: 'demo', type, x: 0, y: 0, rot: 0, w: 1.2, h: 4 }
          : { id: 'demo', type, x: 0, y: 0, rot: 0, seats: Math.min(spec.seats ?? 0, 10) || undefined }
  const w = demo.w ?? spec.w
  const h = demo.h ?? spec.h
  const ext = Math.max(w, h) / 2 + (spec.isTable ? 0.6 : 0.25)
  return (
    <svg viewBox={`${-ext} ${-ext} ${ext * 2} ${ext * 2}`} width={size} height={size} aria-hidden>
      <SvgDefs />
      <ItemShape it={demo} selected={false} bad={false} />
    </svg>
  )
}

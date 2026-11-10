// Escenas ilustradas de La Joya: reemplazan al horizonte genérico de step1 en cada panel.
// Todo en vector con los tonos del tema (se adaptan solas a claro/oscuro y a cada atmósfera).
// Capas: lejos → cerca (perspectiva atmosférica) y las luces cálidas con var(--luz).
import { useState, type ReactNode } from 'react'
import type { EventType, UnitStatus } from '@/lib/types'
import { TONE, UNIT_STATUS } from '@/lib/meta'
import { PAPER_TONES } from './step1'

type Tones = readonly [string, string, string, string]
const LUZ = 'var(--luz)'
/** Tonos de las escenas sobre losa noche: más contraste que el horizonte genérico para que se lean los edificios */
export const SCENE_NIGHT: Tones = [
  'color-mix(in oklab, var(--night) 55%, var(--sky-2))',
  'color-mix(in oklab, var(--night) 42%, var(--sky-3))',
  'color-mix(in oklab, var(--night) 30%, var(--sky-3))',
  'var(--night)',
]
/** Tonos para escenas sobre el cielo claro (se funden con el papel) */
export const SKY_TONES: Tones = ['var(--layer-1)', 'var(--layer-2)', 'var(--layer-3)', 'var(--paper)']

/** Contenedor: anclado abajo, recorta los lados en pantallas angostas (lo importante va al centro) */
function Scene({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" className={`pointer-events-none block h-full w-full ${className}`} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <defs>
        <radialGradient id="sc-glow">
          <stop offset="0" stopColor={LUZ} stopOpacity="0.9" />
          <stop offset="1" stopColor={LUZ} stopOpacity="0" />
        </radialGradient>
      </defs>
      {children}
    </svg>
  )
}

// ── Piezas ──────────────────────────────────────────────
function Hills({ t }: { t: Tones }) {
  return (
    <>
      <path d="M0 190 C200 150 340 160 520 178 S860 140 1040 160 S1300 150 1440 172 V320 H0Z" fill={t[0]} />
      <path d="M0 236 C220 214 420 226 640 230 S1040 210 1240 222 S1400 220 1440 226 V320 H0Z" fill={t[1]} />
    </>
  )
}
function Tree({ x, y, s = 1, fill }: { x: number; y: number; s?: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
      <rect x="-3" y="-26" width="6" height="28" rx="2" />
      <circle cx="0" cy="-40" r="20" />
      <circle cx="-14" cy="-30" r="14" />
      <circle cx="14" cy="-31" r="15" />
    </g>
  )
}
function Cypress({ x, y, s = 1, fill }: { x: number; y: number; s?: number; fill: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -70 C10 -50 12 -20 9 0 H-9 C-12 -20 -10 -50 0 -70Z" fill={fill} />
}
function Palm({ x, y, s = 1, fill }: { x: number; y: number; s?: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
      <path d="M-2 0 C-4 -30 0 -60 4 -78 L8 -78 C4 -58 2 -30 3 0Z" />
      <path d="M6 -78 C-14 -92 -34 -86 -46 -72 C-28 -80 -12 -78 6 -74Z" />
      <path d="M6 -78 C26 -94 46 -88 56 -74 C38 -82 22 -80 6 -74Z" />
      <path d="M6 -78 C-6 -100 -26 -104 -38 -98 C-20 -96 -6 -90 6 -76Z" />
      <path d="M6 -78 C18 -100 38 -104 50 -96 C32 -96 18 -90 6 -76Z" />
    </g>
  )
}
/** Serie de focos colgada entre dos puntos */
function StringLights({ x1, x2, y, sag = 22, n = 9, line }: { x1: number; x2: number; y: number; sag?: number; n?: number; line: string }) {
  const mx = (x1 + x2) / 2
  const pts = Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / (n + 1)
    const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2
    const yy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y + sag * 2) + t * t * y
    return [x, yy] as const
  })
  return (
    <g>
      <path d={`M${x1} ${y} Q${mx} ${y + sag * 2} ${x2} ${y}`} stroke={line} strokeWidth="1.5" fill="none" />
      {pts.map(([x, yy], i) => (
        <g key={i}>
          <circle cx={x} cy={yy + 4} r="9" fill="url(#sc-glow)" opacity="0.55" />
          <circle cx={x} cy={yy + 4} r="2.6" fill={LUZ} />
        </g>
      ))}
    </g>
  )
}
function Windows({ x, y, cols, rows = 1, w = 12, h = 14, gap = 10, lit = LUZ }: { x: number; y: number; cols: number; rows?: number; w?: number; h?: number; gap?: number; lit?: string }) {
  const out: ReactNode[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(<rect key={`${r}-${c}`} x={x + c * (w + gap)} y={y + r * (h + gap)} width={w} height={h} rx="2" fill={lit} opacity={(r + c) % 3 === 1 ? 0.55 : 0.92} />)
  return <>{out}</>
}
function House({ x, y, w = 70, h = 40, fill, roof }: { x: number; y: number; w?: number; h?: number; fill: string; roof: string }) {
  return (
    <g>
      <path d={`M${x - 6} ${y - h} L${x + w / 2} ${y - h - 26} L${x + w + 6} ${y - h}Z`} fill={roof} />
      <rect x={x} y={y - h} width={w} height={h} fill={fill} />
      <rect x={x + w / 2 - 7} y={y - 22} width="14" height="22" rx="2" fill={LUZ} opacity="0.85" />
      <Windows x={x + 9} y={y - h + 10} cols={1} />
      <Windows x={x + w - 21} y={y - h + 10} cols={1} />
    </g>
  )
}

// ── Escenas ─────────────────────────────────────────────

export interface UnidadViva {
  id: string
  name: string
  status: UnitStatus
  cabana: boolean
  /** Lo que pasa ahí, en una línea: «Familia Hernández · sale mañana» */
  line: string
}

/** Una casa de verdad: se enciende si tiene huéspedes, deja una luz si está limpiando y lleva un punto con su estado */
function CasaViva({ u, x, y, w, h, near, hover, onHover, onPick }: { u: UnidadViva; x: number; y: number; w: number; h: number; near: string; hover: boolean; onHover: (on: boolean) => void; onPick: () => void }) {
  const lit = u.status === 'ocupada'
  const half = u.status === 'limpiando' || u.status === 'inspeccion'
  const off = 'color-mix(in oklab, var(--night) 68%, var(--sky-2))'
  const tone = TONE[UNIT_STATUS[u.status].tone].hex
  const win = 12
  return (
    <g
      role="link"
      tabIndex={0}
      aria-label={`${u.name}: ${u.line}`}
      className="cursor-pointer outline-none"
      style={{ transform: hover ? 'translateY(-5px)' : undefined, transition: 'transform 280ms var(--ease-calma)' }}
      onClick={onPick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick())}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <rect x={x - 7} y={y - h - 62} width={w + 14} height={h + 96} fill="transparent" />
      {lit && <circle cx={x + w / 2} cy={y - h / 2} r={w * 1.05} fill="url(#rv-glow)" opacity="0.5" />}
      <path d={`M${x - 6} ${y - h} L${x + w / 2} ${y - h - 24} L${x + w + 6} ${y - h}Z`} fill={near} />
      <rect x={x} y={y - h} width={w} height={h} fill={near} />
      <rect x={x + 8} y={y - h + 9} width={win} height={win + 2} rx="2" fill={lit || half ? LUZ : off} opacity={lit ? 0.95 : half ? 0.8 : 1} />
      <rect x={x + w - 8 - win} y={y - h + 9} width={win} height={win + 2} rx="2" fill={lit ? LUZ : off} opacity={lit ? 0.85 : 1} />
      <rect x={x + w / 2 - 6} y={y - 20} width="12" height="20" rx="2" fill={lit ? LUZ : off} opacity={lit ? 0.9 : 1} />
      {u.status === 'lista' && (
        <>
          <circle cx={x + w / 2} cy={y - 25} r="9" fill="url(#rv-glow)" opacity="0.8" />
          <circle cx={x + w / 2} cy={y - 25} r="2.6" fill={LUZ} />
        </>
      )}
      {!lit && <circle cx={x + w / 2} cy={y - h - 36} r="5.5" fill={tone} stroke="var(--night)" strokeWidth="2" />}
    </g>
  )
}

/** Inicio del dueño: el rancho tal como está ahora. Cada casa es una de verdad y se puede tocar. */
export function RanchoVivoScene({ units, salon, onPick, tones = SCENE_NIGHT }: { units: UnidadViva[]; salon: { lit: boolean; line: string }; onPick: (id: string) => void; tones?: Tones }) {
  const [hover, setHover] = useState<string | null>(null)
  const [, mid, near, front] = tones
  const y = 266
  // Lo importante queda al centro: en el celular la escena recorta los lados
  const place = (list: UnidadViva[], from: number, to: number, maxW: number, h: number) => {
    const step = (to - from) / Math.max(1, list.length)
    const w = Math.min(maxW, step - 12)
    return list.map((u, i) => ({ u, x: from + i * step + (step - w) / 2, w, h }))
  }
  const houses = [...place(units.filter((u) => u.cabana), 372, 606, 64, 36), ...place(units.filter((u) => !u.cabana), 834, 1070, 58, 42)]
  const shown = hover === 'salon' ? { x: 620, w: 200, top: 148, name: 'Salón', line: salon.line } : (() => {
    const h = houses.find((p) => p.u.id === hover)
    return h ? { x: h.x, w: h.w, top: y - h.h - 44, name: h.u.name, line: h.u.line } : null
  })()
  const tipW = shown ? Math.max(shown.name.length, shown.line.length) * 8.4 + 30 : 0
  const tipX = shown ? Math.max(12, Math.min(1428 - tipW, shown.x + shown.w / 2 - tipW / 2)) : 0
  return (
    <svg viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" className="block h-full w-full" role="group" aria-label="El rancho ahora">
      <defs>
        <radialGradient id="rv-glow">
          <stop offset="0" stopColor={LUZ} stopOpacity="0.9" />
          <stop offset="1" stopColor={LUZ} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="pointer-events-none">
        <Hills t={tones} />
        <Tree x={110} y={268} s={1.3} fill={front} />
        <Tree x={1330} y={270} s={1.4} fill={front} />
        <Cypress x={214} y={266} fill={near} />
        <Cypress x={1228} y={266} s={1.2} fill={near} />
        <Palm x={290} y={266} s={0.95} fill={near} />
        <Palm x={1162} y={266} s={1.05} fill={near} />
        <StringLights x1={606} x2={372} y={204} sag={12} n={6} line={mid} />
        <StringLights x1={834} x2={1070} y={204} sag={12} n={6} line={mid} />
      </g>
      {/* Salón: encendido si hay evento hoy */}
      <g
        role="link"
        tabIndex={0}
        aria-label={`Salón: ${salon.line}`}
        className="cursor-pointer outline-none"
        onClick={() => onPick('salon')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick('salon'))}
        onPointerEnter={() => setHover('salon')}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover('salon')}
        onBlur={() => setHover(null)}
      >
        <path d="M612 200 L720 150 L828 200Z" fill={near} />
        <rect x="624" y="200" width="192" height="66" fill={near} />
        {salon.lit && <circle cx="720" cy="232" r="130" fill="url(#rv-glow)" opacity="0.4" />}
        <Windows x={640} y={214} cols={6} w={14} h={24} gap={12} lit={salon.lit ? LUZ : 'color-mix(in oklab, var(--night) 68%, var(--sky-2))'} />
        <rect x="708" y="232" width="24" height="34" rx="12" fill={salon.lit ? LUZ : 'color-mix(in oklab, var(--night) 68%, var(--sky-2))'} />
      </g>
      {houses.map((p) => (
        <CasaViva key={p.u.id} u={p.u} x={p.x} y={y} w={p.w} h={p.h} near={near} hover={hover === p.u.id} onHover={(on) => setHover(on ? p.u.id : null)} onPick={() => onPick(p.u.id)} />
      ))}
      <path className="pointer-events-none" d="M0 262 C300 256 520 266 720 264 S1180 256 1440 262 V320 H0Z" fill={front} />
      {shown && (
        <g className="pointer-events-none" style={{ fontFamily: 'var(--font-sans)' }}>
          <rect x={tipX} y={Math.max(4, shown.top - 58)} width={tipW} height="52" rx="12" fill="var(--on-night)" />
          <text x={tipX + 15} y={Math.max(4, shown.top - 58) + 22} fontSize="16" fontWeight="600" fill="var(--night)">
            {shown.name}
          </text>
          <text x={tipX + 15} y={Math.max(4, shown.top - 58) + 41} fontSize="14" fill="color-mix(in oklab, var(--night) 72%, var(--on-night))">
            {shown.line}
          </text>
        </g>
      )}
    </svg>
  )
}

/** Administración: el rancho al anochecer — salón con luces, jardín y casas encendidas */
export function RanchoScene({ tones = SCENE_NIGHT }: { tones?: Tones }) {
  const [, mid, near, front] = tones
  return (
    <Scene>
      <Hills t={tones} />
      {/* Salón */}
      <g>
        <path d="M560 196 L700 140 L840 196Z" fill={near} />
        <rect x="575" y="196" width="250" height="70" fill={near} />
        <Windows x={598} y={212} cols={7} w={16} h={26} gap={14} />
        <rect x="688" y="228" width="24" height="38" rx="12" fill={LUZ} />
      </g>
      <StringLights x1={420} x2={575} y={214} sag={14} n={7} line={mid} />
      <StringLights x1={825} x2={990} y={214} sag={14} n={7} line={mid} />
      {/* Casas y cabañas */}
      <House x={250} y={266} fill={near} roof={near} />
      <House x={340} y={266} w={60} h={34} fill={near} roof={near} />
      <House x={1010} y={266} w={64} fill={near} roof={near} />
      <House x={1100} y={266} w={74} h={44} fill={near} roof={near} />
      <Palm x={480} y={266} s={1.05} fill={near} />
      <Palm x={930} y={266} s={0.95} fill={near} />
      <Cypress x={180} y={266} fill={near} />
      <Cypress x={1230} y={266} s={1.2} fill={near} />
      <Tree x={110} y={268} s={1.3} fill={front} />
      <Tree x={1330} y={270} s={1.4} fill={front} />
      <path d="M0 262 C300 256 520 266 720 264 S1180 256 1440 262 V320 H0Z" fill={front} />
      {/* Camino de luces */}
      {[600, 650, 700, 750, 800].map((x, i) => (
        <circle key={x} cx={x} cy={292 + (i % 2) * 2} r="2.4" fill={LUZ} opacity="0.8" />
      ))}
    </Scene>
  )
}

/** Organización de eventos: jardín de boda con arco de flores, luces y mesas con velas */
export function JardinBodaScene({ tones = SCENE_NIGHT }: { tones?: Tones }) {
  const [, mid, near, front] = tones
  return (
    <Scene>
      <Hills t={tones} />
      <Tree x={140} y={250} s={1.4} fill={near} />
      <Tree x={1300} y={252} s={1.5} fill={near} />
      <Cypress x={260} y={250} s={1.1} fill={near} />
      <Cypress x={1190} y={250} s={1.15} fill={near} />
      <StringLights x1={160} x2={720} y={150} sag={26} n={11} line={mid} />
      <StringLights x1={720} x2={1280} y={150} sag={26} n={11} line={mid} />
      {/* Arco */}
      <path d="M650 262 V190 A70 70 0 0 1 790 190 V262" stroke={near} strokeWidth="9" fill="none" />
      {[[650, 200], [656, 168], [672, 142], [696, 126], [720, 121], [744, 126], [768, 142], [784, 168], [790, 200], [650, 232], [790, 232]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={i % 2 ? 9 : 11} fill={i % 3 === 0 ? 'var(--chispa-soft)' : 'var(--sky-4)'} opacity="0.95" />
          <circle cx={x! + 6} cy={y! - 5} r="5" fill={near} />
        </g>
      ))}
      {/* Mesas redondas con velas */}
      {[330, 470, 970, 1110].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={262} rx="46" ry="10" fill={near} />
          <rect x={x - 40} y={262} width="80" height="16" fill={near} />
          <circle cx={x} cy={250} r="16" fill="url(#sc-glow)" opacity="0.7" />
          <rect x={x - 1.5} y={244} width="3" height="10" fill={LUZ} />
        </g>
      ))}
      <path d="M0 274 C320 268 560 278 720 276 S1120 268 1440 274 V320 H0Z" fill={front} />
      <path d="M690 320 L708 276 H732 L750 320Z" fill="var(--sky-4)" opacity="0.18" />
    </Scene>
  )
}

/** Cumpleaños y fiestas: globos sobre mesas */
function FiestaScene({ tones = SCENE_NIGHT }: { tones?: Tones }) {
  const [, mid, near, front] = tones
  const balloons = [
    [420, 150, 'var(--chispa-soft)'], [460, 120, 'var(--sky-4)'], [500, 158, 'var(--matiz)'],
    [940, 140, 'var(--sky-4)'], [980, 112, 'var(--chispa-soft)'], [1020, 150, 'var(--matiz)'],
  ] as const
  return (
    <Scene>
      <Hills t={tones} />
      <StringLights x1={120} x2={1320} y={120} sag={40} n={18} line={mid} />
      {balloons.map(([x, y, c], i) => (
        <g key={i}>
          <path d={`M${x} ${y + 26} C${x - 8} ${y + 70} ${x + 8} ${y + 100} ${x} ${y + 132}`} stroke={mid} strokeWidth="1.2" fill="none" />
          <ellipse cx={x} cy={y} rx="20" ry="25" fill={c} />
          <ellipse cx={x - 7} cy={y - 9} rx="5" ry="7" fill="#fff" opacity="0.35" />
        </g>
      ))}
      <rect x="560" y="216" width="320" height="10" rx="3" fill={near} />
      <rect x="600" y="226" width="240" height="50" fill={near} />
      <rect x="690" y="186" width="60" height="30" rx="4" fill={near} />
      <rect x="704" y="172" width="32" height="14" rx="3" fill={near} />
      {[708, 720, 732].map((x) => (
        <g key={x}>
          <circle cx={x} cy={164} r="8" fill="url(#sc-glow)" />
          <rect x={x - 1} y={162} width="2" height="10" fill={LUZ} />
        </g>
      ))}
      <Tree x={170} y={272} s={1.5} fill={near} />
      <Tree x={1280} y={272} s={1.4} fill={near} />
      <path d="M0 272 C300 266 600 278 760 276 S1180 266 1440 272 V320 H0Z" fill={front} />
    </Scene>
  )
}

/** Bautizo y primera comunión: capilla con palomas */
function CapillaScene({ tones = SCENE_NIGHT }: { tones?: Tones }) {
  const [, , near, front] = tones
  const dove = (x: number, y: number, s: number) => (
    <path key={`${x}`} transform={`translate(${x} ${y}) scale(${s})`} d="M0 0 C10 -14 22 -14 30 -6 C38 -18 52 -22 62 -16 C50 -12 42 -4 38 4 C30 12 14 12 0 0Z" fill="var(--sky-4)" opacity="0.9" />
  )
  return (
    <Scene>
      <Hills t={tones} />
      <g>
        <rect x="640" y="160" width="160" height="110" fill={near} />
        <path d="M630 162 L720 104 L810 162Z" fill={near} />
        <rect x="706" y="58" width="28" height="56" fill={near} />
        <rect x="717" y="40" width="6" height="24" fill={LUZ} />
        <rect x="709" y="48" width="22" height="6" fill={LUZ} />
        <path d="M700 270 V222 A20 20 0 0 1 740 222 V270Z" fill={LUZ} opacity="0.9" />
        <circle cx="720" cy="186" r="14" fill={LUZ} opacity="0.75" />
      </g>
      {dove(480, 120, 1)}
      {dove(540, 92, 0.75)}
      {dove(900, 110, 0.9)}
      <Cypress x={600} y={270} s={1.3} fill={near} />
      <Cypress x={840} y={270} s={1.3} fill={near} />
      <Tree x={250} y={272} s={1.5} fill={near} />
      <Tree x={1200} y={272} s={1.5} fill={near} />
      <path d="M0 270 C320 264 600 276 720 274 S1120 264 1440 270 V320 H0Z" fill={front} />
    </Scene>
  )
}

/** Eventos de empresa y graduaciones: escenario con pantalla y sillas */
function EscenarioScene({ tones = SCENE_NIGHT }: { tones?: Tones }) {
  const [, mid, near, front] = tones
  return (
    <Scene>
      <Hills t={tones} />
      <rect x="520" y="110" width="400" height="120" rx="6" fill={near} />
      <rect x="540" y="126" width="360" height="88" rx="4" fill="var(--sky-4)" opacity="0.32" />
      <path d="M560 190 L640 160 L700 176 L790 140 L880 150" stroke={LUZ} strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="480" y="236" width="480" height="14" fill={near} />
      <path d="M520 110 L470 60 M920 110 L970 60" stroke={mid} strokeWidth="3" />
      <circle cx="470" cy="60" r="22" fill="url(#sc-glow)" />
      <circle cx="970" cy="60" r="22" fill="url(#sc-glow)" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={430 + i * 42} y={i % 2 ? 270 : 262} width="22" height="20" rx="4" fill={front} />
      ))}
      <Tree x={200} y={272} s={1.5} fill={near} />
      <Tree x={1250} y={272} s={1.5} fill={near} />
      <path d="M0 282 C320 276 600 286 720 284 S1120 276 1440 282 V320 H0Z" fill={front} />
    </Scene>
  )
}

/** La escena que corresponde a cada tipo de evento */
export function EventScene({ type }: { type: EventType }) {
  if (type === 'boda' || type === 'xv' || type === 'aniversario') return <JardinBodaScene />
  if (type === 'bautizo' || type === 'primera-comunion') return <CapillaScene />
  if (type === 'empresarial' || type === 'graduacion') return <EscenarioScene />
  return <FiestaScene />
}

/** Mantenimiento: bodega con herramientas, escalera, carretilla y tinaco */
export function TallerScene({ tones = SCENE_NIGHT }: { tones?: Tones }) {
  const [, mid, near, front] = tones
  return (
    <Scene>
      <Hills t={tones} />
      {/* Tinaco */}
      <rect x="1000" y="120" width="8" height="140" fill={near} />
      <rect x="1060" y="120" width="8" height="140" fill={near} />
      <rect x="990" y="88" width="88" height="40" rx="14" fill={near} />
      {/* Bodega */}
      <path d="M520 170 L660 120 L800 170Z" fill={near} />
      <rect x="534" y="170" width="252" height="100" fill={near} />
      <rect x="600" y="196" width="120" height="74" fill={LUZ} opacity="0.9" />
      <g stroke={near} strokeWidth="4" strokeLinecap="round">
        <path d="M620 206 V236 M640 206 L650 232 M690 204 V240 M704 206 L700 238" />
      </g>
      <rect x="612" y="246" width="96" height="6" fill={near} />
      {/* Escalera recargada */}
      <g stroke={near} strokeWidth="5" strokeLinecap="round">
        <path d="M820 270 L860 150 M850 270 L890 150" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${826 + i * 8} ${252 - i * 24} H${856 + i * 8}`} />
        ))}
      </g>
      {/* Carretilla */}
      <g fill={near}>
        <path d="M400 236 H480 L466 262 H410Z" />
        <circle cx="414" cy="270" r="9" />
        <path d="M480 238 L520 226" stroke={near} strokeWidth="4" />
      </g>
      <circle cx="660" cy="150" r="18" fill="url(#sc-glow)" />
      <circle cx="660" cy="150" r="5" fill={LUZ} />
      <Tree x={250} y={272} s={1.4} fill={near} />
      <Palm x={1200} y={270} fill={near} />
      <path d="M0 270 C320 264 600 276 720 274 S1120 264 1440 270 V320 H0Z" fill={front} />
      <path d="M300 300 Q360 284 420 300" stroke={mid} strokeWidth="2" fill="none" />
    </Scene>
  )
}

/** Mensajes: sobres con sello volando sobre el rancho */
export function MensajesScene({ tones = SCENE_NIGHT }: { tones?: Tones }) {
  const [, mid, near, front] = tones
  const env = (x: number, y: number, r: number, s = 1) => (
    <g key={`${x}`} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <rect x="-30" y="-20" width="60" height="40" rx="4" fill="var(--sky-4)" />
      <path d="M-30 -20 L0 4 L30 -20" stroke={near} strokeWidth="2" fill="none" />
      <circle cx="0" cy="4" r="6" fill="var(--chispa-soft)" />
    </g>
  )
  return (
    <Scene>
      <Hills t={tones} />
      <path d="M260 240 C380 190 520 230 600 170 S820 120 900 140" stroke={mid} strokeWidth="1.5" strokeDasharray="4 8" fill="none" />
      <path d="M980 230 C1060 190 1140 200 1200 160" stroke={mid} strokeWidth="1.5" strokeDasharray="4 8" fill="none" />
      {env(600, 170, -10)}
      {env(900, 140, 8, 0.85)}
      {env(1200, 160, -6, 0.75)}
      <House x={180} y={268} fill={near} roof={near} />
      <House x={1260} y={268} w={60} fill={near} roof={near} />
      <Tree x={420} y={270} s={1.3} fill={near} />
      <Tree x={1050} y={270} s={1.2} fill={near} />
      <path d="M0 268 C320 262 600 274 720 272 S1120 262 1440 268 V320 H0Z" fill={front} />
    </Scene>
  )
}

/** Entrada: el portón del rancho con su arco y faroles */
export function PortonScene({ tones = SCENE_NIGHT }: { tones?: Tones }) {
  const [, mid, near, front] = tones
  return (
    <Scene>
      <Hills t={tones} />
      <Palm x={520} y={262} s={1.1} fill={near} />
      <Palm x={930} y={262} s={1.15} fill={near} />
      {/* Barda */}
      <rect x="0" y="232" width="610" height="34" fill={near} />
      <rect x="830" y="232" width="610" height="34" fill={near} />
      {/* Pilares y arco */}
      <rect x="600" y="140" width="34" height="130" fill={near} />
      <rect x="806" y="140" width="34" height="130" fill={near} />
      <path d="M600 146 Q720 86 840 146 V160 Q720 102 600 160Z" fill={near} />
      <text x="720" y="128" textAnchor="middle" fontFamily="var(--font-heading, serif)" fontSize="22" fill={LUZ} opacity="0.9">
        La Joya
      </text>
      {/* Reja */}
      <g stroke={mid} strokeWidth="3">
        {Array.from({ length: 11 }, (_, i) => (
          <path key={i} d={`M${646 + i * 15} 180 V266`} />
        ))}
        <path d="M640 196 H800 M640 240 H800" />
      </g>
      {/* Faroles */}
      {[617, 823].map((x) => (
        <g key={x}>
          <circle cx={x} cy={128} r="22" fill="url(#sc-glow)" />
          <rect x={x - 6} y={120} width="12" height="16" rx="3" fill={LUZ} />
        </g>
      ))}
      <path d="M0 266 C320 262 600 270 720 270 S1120 262 1440 266 V320 H0Z" fill={front} />
      <path d="M680 320 L700 270 H740 L760 320Z" fill={LUZ} opacity="0.12" />
    </Scene>
  )
}

/** Recepción (bloque de cielo claro): cabañas con porche encendido y el camino de llegada */
export function CabanasScene() {
  const t = PAPER_TONES
  return (
    <Scene>
      <path d="M0 200 C260 168 480 182 720 190 S1200 170 1440 190 V320 H0Z" fill={t[1]} />
      {[[360, 0.9], [560, 1.05], [880, 1], [1080, 0.88]].map(([x, s]) => (
        <g key={x} transform={`translate(${x} 262) scale(${s})`}>
          <path d="M-62 -58 L0 -100 L62 -58Z" fill="var(--sky-3)" />
          <rect x="-52" y="-58" width="104" height="58" fill="var(--sky-4)" />
          <rect x="-12" y="-36" width="24" height="36" rx="2" fill={LUZ} />
          <rect x="-40" y="-46" width="16" height="16" rx="2" fill={LUZ} opacity="0.8" />
          <rect x="24" y="-46" width="16" height="16" rx="2" fill={LUZ} opacity="0.8" />
          <circle cx="0" cy="-44" r="12" fill="url(#sc-glow)" opacity="0.6" />
        </g>
      ))}
      <Palm x={720} y={262} s={1.1} fill="var(--sky-3)" />
      <path d="M0 256 C320 248 600 262 720 260 S1120 250 1440 256 V320 H0Z" fill={t[2]} />
      <path d="M690 320 C700 300 712 280 720 262 C728 280 740 300 750 320Z" fill={t[0]} opacity="0.7" />
      <path d="M0 290 C400 284 1000 296 1440 290 V320 H0Z" fill={t[3]} />
    </Scene>
  )
}

// ── Viñetas para estados vacíos ─────────────────────────
export type VignetteKind = 'evento' | 'reserva' | 'limpieza' | 'invitados' | 'inventario' | 'tareas' | 'proveedores' | 'mensajes' | 'finanzas' | 'mesas' | 'avisos' | 'busqueda' | 'pagos' | 'firmas' | 'error' | 'rancho'

function VignetteArt({ kind }: { kind: VignetteKind }) {
  const ink = 'var(--sky-1)'
  const soft = 'var(--sky-3)'
  const warm = 'var(--chispa-soft)'
  const paper = 'var(--surface)'
  switch (kind) {
    case 'evento': // silla de ceremonia con moño
      return (
        <g>
          <rect x="52" y="44" width="36" height="8" rx="3" fill={ink} />
          <path d="M56 52 V88 M84 52 V88 M56 70 H84" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          <rect x="50" y="66" width="40" height="7" rx="3" fill={ink} />
          <path d="M70 52 l-12 -8 v14z M70 52 l12 -8 v14z" fill={warm} />
          <circle cx="70" cy="52" r="3.5" fill={warm} />
        </g>
      )
    case 'reserva': // cabaña con la puerta abierta
      return (
        <g>
          <path d="M40 58 L70 34 L100 58Z" fill={ink} />
          <rect x="46" y="58" width="48" height="32" fill={soft} />
          <rect x="62" y="68" width="16" height="22" fill="var(--luz)" />
          <path d="M62 68 L54 72 V92 L62 90Z" fill={ink} />
        </g>
      )
    case 'limpieza': // escoba con destellos
      return (
        <g>
          <path d="M84 30 L62 74" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          <path d="M54 72 L72 80 L62 96 L40 88Z" fill={warm} />
          <path d="M44 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="var(--luz)" />
          <path d="M96 62 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="var(--luz)" />
        </g>
      )
    case 'invitados':
    case 'mensajes': // sobre con sello
      return (
        <g>
          <rect x="38" y="46" width="64" height="44" rx="5" fill={paper} stroke={ink} strokeWidth="2.5" />
          <path d="M38 48 L70 72 L102 48" stroke={ink} strokeWidth="2.5" fill="none" />
          <circle cx="70" cy="72" r="7" fill={warm} />
          {kind === 'mensajes' && <path d="M96 38 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="var(--luz)" />}
        </g>
      )
    case 'inventario': // repisa con frascos
      return (
        <g>
          <rect x="34" y="66" width="72" height="5" rx="2" fill={ink} />
          <rect x="34" y="92" width="72" height="5" rx="2" fill={ink} />
          <rect x="42" y="46" width="16" height="20" rx="4" fill={soft} />
          <rect x="62" y="40" width="14" height="26" rx="4" fill={warm} />
          <rect x="80" y="50" width="18" height="16" rx="4" fill={soft} />
          <rect x="46" y="76" width="22" height="16" rx="3" fill={warm} opacity="0.8" />
          <rect x="74" y="74" width="16" height="18" rx="4" fill={soft} />
        </g>
      )
    case 'tareas':
    case 'firmas': // tablero con lista y flor
      return (
        <g>
          <rect x="46" y="36" width="48" height="60" rx="6" fill={paper} stroke={ink} strokeWidth="2.5" />
          <rect x="60" y="32" width="20" height="9" rx="3" fill={ink} />
          <path d="M54 56 l4 4 7 -8 M54 72 l4 4 7 -8" stroke={warm} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M70 56 H86 M70 72 H86 M54 86 H86" stroke={soft} strokeWidth="3" strokeLinecap="round" />
          <circle cx="98" cy="88" r="6" fill={warm} />
          <circle cx="98" cy="88" r="2.5" fill="var(--luz)" />
        </g>
      )
    case 'proveedores': // camioncito de entregas
      return (
        <g>
          <rect x="32" y="54" width="48" height="30" rx="3" fill={soft} />
          <path d="M80 62 H96 L106 74 V84 H80Z" fill={ink} />
          <rect x="86" y="66" width="10" height="8" rx="1" fill="var(--luz)" />
          <circle cx="48" cy="88" r="7" fill={ink} />
          <circle cx="94" cy="88" r="7" fill={ink} />
          <path d="M44 66 h20" stroke={paper} strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    case 'finanzas':
    case 'pagos': // frasco de monedas
      return (
        <g>
          <rect x="48" y="44" width="44" height="50" rx="10" fill={paper} stroke={ink} strokeWidth="2.5" />
          <rect x="52" y="38" width="36" height="8" rx="3" fill={ink} />
          {[[60, 84], [76, 84], [68, 74], [84, 74], [60, 66]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="7" ry="4" fill="var(--luz)" stroke={warm} strokeWidth="1.5" />
          ))}
        </g>
      )
    case 'mesas': // mesa redonda vista de arriba con sillas
      return (
        <g>
          <circle cx="70" cy="66" r="18" fill={paper} stroke={ink} strokeWidth="2.5" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2
            return <circle key={i} cx={70 + Math.cos(a) * 28} cy={66 + Math.sin(a) * 28} r="5" fill={soft} />
          })}
          <circle cx="70" cy="66" r="4" fill={warm} />
        </g>
      )
    case 'avisos': // campana tranquila
      return (
        <g>
          <path d="M52 82 C52 58 58 44 70 44 C82 44 88 58 88 82Z" fill={soft} />
          <rect x="46" y="80" width="48" height="6" rx="3" fill={ink} />
          <circle cx="70" cy="92" r="5" fill={warm} />
          <path d="M98 44 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="var(--luz)" />
        </g>
      )
    case 'busqueda': // lupa
      return (
        <g>
          <circle cx="64" cy="60" r="20" fill={paper} stroke={ink} strokeWidth="4" />
          <path d="M79 75 L96 92" stroke={ink} strokeWidth="6" strokeLinecap="round" />
          <path d="M56 54 a10 10 0 0 1 10 -6" stroke={soft} strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      )
    case 'error': // serie de luces con un foco fundido
      return (
        <g>
          <path d="M24 46 Q70 82 116 46" stroke={ink} strokeWidth="2" fill="none" />
          {[[38, 58], [56, 67], [84, 67], [102, 58]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y! + 6} r="8" fill="url(#vg-glow)" />
              <circle cx={x} cy={y! + 6} r="4" fill="var(--luz)" />
            </g>
          ))}
          <circle cx="70" cy="76" r="4.5" fill="none" stroke={ink} strokeWidth="2" />
          <path d="M66 86 l-4 6 M74 86 l4 6" stroke={soft} strokeWidth="2" strokeLinecap="round" />
        </g>
      )
    default: // rancho: casita y palmera
      return (
        <g>
          <path d="M44 66 L66 48 L88 66Z" fill={ink} />
          <rect x="50" y="66" width="32" height="24" fill={soft} />
          <rect x="62" y="74" width="9" height="16" fill="var(--luz)" />
          <path d="M98 90 C97 76 99 64 101 56" stroke={ink} strokeWidth="3" fill="none" />
          <path d="M101 56 c-8 -6 -16 -4 -20 2 c8 -2 14 -1 20 1z M101 56 c8 -7 16 -5 20 1 c-8 -2 -14 -1 -20 1z" fill={ink} />
        </g>
      )
  }
}

/** Viñeta de estado vacío: arco de cielo suave + un dibujo de lo que corresponde */
export function Vignette({ kind = 'rancho', size = 132 }: { kind?: VignetteKind; size?: number }) {
  return (
    <div aria-hidden="true" className="relative mx-auto overflow-hidden" style={{ width: size, height: size * 0.72, borderRadius: 'var(--r-arch)' }}>
      <div className="bg-cielo-soft absolute inset-0" />
      <svg viewBox="0 0 140 101" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="vg-glow">
            <stop offset="0" stopColor="var(--luz)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--luz)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M0 92 C40 86 100 96 140 90 V101 H0Z" fill="var(--layer-2)" />
        <VignetteArt kind={kind} />
      </svg>
    </div>
  )
}

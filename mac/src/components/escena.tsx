// El rancho de noche: una casa por hospedaje (cabaña, casa o habitación del edificio), hecha con los
// datos reales. Las ventanas se encienden si esa noche hay huéspedes, laten si hay una solicitud apartada
// y quedan apagadas si está libre o cerrada. Se puede pasar el mouse y hacer clic en cada una.
import { useMemo, useState, type ReactNode } from 'react'
import type { TipoHospedaje } from '@/lib/tipos'
import { cx } from './ui'

export type EstadoCasa = 'reservada' | 'apartada' | 'cerrada' | 'libre'
export interface CasaEscena {
  id: string
  nombre: string
  tipo: TipoHospedaje
  estado: EstadoCasa
  /** Lo que pasa ahí, en una línea: «Ana López · se va el domingo» */
  linea: string
  /** Alguien llega ese día: se prende el farol de la puerta */
  llega?: boolean
}

const LUZ = 'var(--luz)'
const TONOS = {
  lejos: 'color-mix(in oklab, var(--night) 55%, var(--sky-2))',
  medio: 'color-mix(in oklab, var(--night) 42%, var(--sky-3))',
  cerca: 'color-mix(in oklab, var(--night) 24%, var(--sky-3))',
  frente: 'var(--night)',
  apagada: 'color-mix(in oklab, var(--night) 70%, var(--sky-2))',
}
const W = 1440
const H = 360
const SUELO = 300

interface Lugar {
  casa: CasaEscena
  x: number
  w: number
  /** Para las habitaciones: la ventana del edificio */
  ventana?: { x: number; y: number; w: number; h: number }
  alto: number
}

function acomodar(casas: CasaEscena[]) {
  const sueltas = casas.filter((c) => c.tipo !== 'habitacion')
  const habitaciones = casas.filter((c) => c.tipo === 'habitacion')
  const ancho = (c: CasaEscena) => (c.tipo === 'casa' ? 128 : 86)
  // El edificio de habitaciones va al centro; las casas y cabañas a los lados
  const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(habitaciones.length * 1.6))))
  const filas = Math.ceil(habitaciones.length / cols)
  const edificioW = habitaciones.length ? cols * 36 + 34 : 0
  const piezas: ({ tipo: 'casa'; c: CasaEscena; w: number } | { tipo: 'edificio'; w: number })[] = sueltas.map((c) => ({ tipo: 'casa' as const, c, w: ancho(c) }))
  if (habitaciones.length) piezas.splice(Math.ceil(piezas.length / 2), 0, { tipo: 'edificio', w: edificioW })
  const total = piezas.reduce((s, p) => s + p.w, 0)
  const libre = 1180 - total
  const hueco = Math.max(18, Math.min(110, libre / Math.max(1, piezas.length + 1)))
  let x = (W - total - hueco * (piezas.length - 1)) / 2
  const lugares: Lugar[] = []
  let edificio: { x: number; w: number; alto: number } | null = null
  for (const p of piezas) {
    if (p.tipo === 'casa') lugares.push({ casa: p.c, x, w: p.w, alto: p.c.tipo === 'casa' ? 92 : 94 })
    else {
      const alto = filas * 42 + 34
      edificio = { x, w: p.w, alto }
      habitaciones.forEach((c, i) => {
        const f = Math.floor(i / cols)
        const col = i % cols
        lugares.push({ casa: c, x, w: p.w, alto, ventana: { x: x + 17 + col * 36 + 4, y: SUELO - alto + 14 + f * 42, w: 22, h: 26 } })
      })
    }
    x += p.w + hueco
  }
  return { lugares, edificio }
}

function Arbol({ x, s = 1, fill }: { x: number; s?: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${SUELO + 2}) scale(${s})`} fill={fill}>
      <rect x="-3" y="-26" width="6" height="28" rx="2" />
      <circle cx="0" cy="-42" r="21" />
      <circle cx="-15" cy="-31" r="15" />
      <circle cx="15" cy="-32" r="16" />
    </g>
  )
}
function Cipres({ x, s = 1, fill }: { x: number; s?: number; fill: string }) {
  return <path transform={`translate(${x} ${SUELO}) scale(${s})`} d="M0 -76 C11 -54 13 -22 10 0 H-10 C-13 -22 -11 -54 0 -76Z" fill={fill} />
}

/** Serie de focos colgada de lado a lado (el sello del rancho) */
function Focos({ x1, x2, y, comba, n }: { x1: number; x2: number; y: number; comba: number; n: number }) {
  const mx = (x1 + x2) / 2
  return (
    <g>
      <path d={`M${x1} ${y} Q${mx} ${y + comba * 2} ${x2} ${y}`} stroke={TONOS.medio} strokeWidth="1.5" fill="none" />
      {Array.from({ length: n }, (_, i) => {
        const t = (i + 1) / (n + 1)
        const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2
        const yy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y + comba * 2) + t * t * y
        return (
          <g key={i} className="foco" style={{ transformOrigin: `${x}px ${yy}px`, transformBox: 'view-box' }}>
            <circle cx={x} cy={yy + 5} r="10" fill="url(#rn-brillo)" opacity="0.5" />
            <circle cx={x} cy={yy + 5} r="2.8" fill={LUZ} />
          </g>
        )
      })}
    </g>
  )
}

const relleno = (e: EstadoCasa) => (e === 'reservada' || e === 'apartada' ? LUZ : TONOS.apagada)
const clase = (e: EstadoCasa) => (e === 'apartada' ? 'ventana-apartada' : e === 'reservada' ? 'ventana-encendida' : undefined)

function Casa({ l, sobre, onSobre, onPick }: { l: Lugar; sobre: boolean; onSobre: (on: boolean) => void; onPick: () => void }) {
  const { casa: c, x, w } = l
  const y = SUELO
  const lit = c.estado === 'reservada' || c.estado === 'apartada'
  const props = {
    role: 'button',
    tabIndex: 0,
    'aria-label': `${c.nombre}: ${c.linea}`,
    className: 'cursor-pointer outline-none',
    onClick: onPick,
    onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick()),
    onPointerEnter: () => onSobre(true),
    onPointerLeave: () => onSobre(false),
    onFocus: () => onSobre(true),
    onBlur: () => onSobre(false),
  }
  if (l.ventana) {
    const v = l.ventana
    return (
      <g {...props}>
        <rect x={v.x - 4} y={v.y - 4} width={v.w + 8} height={v.h + 8} fill="transparent" />
        <rect x={v.x} y={v.y} width={v.w} height={v.h} rx="3" fill={relleno(c.estado)} className={clase(c.estado)} />
        {sobre && <rect x={v.x - 3} y={v.y - 3} width={v.w + 6} height={v.h + 6} rx="5" fill="none" stroke="var(--on-night)" strokeWidth="1.5" />}
      </g>
    )
  }
  const mover = { transform: sobre ? 'translateY(-6px)' : undefined, transition: 'transform 280ms var(--ease-calma)' }
  const farol = c.llega && (
    <g>
      <circle cx={x + w / 2 - 17} cy={y - 34} r="11" fill="url(#rn-brillo)" opacity="0.9" />
      <circle cx={x + w / 2 - 17} cy={y - 34} r="3" fill={LUZ} />
    </g>
  )
  if (c.tipo === 'casa') {
    const muro = 56
    return (
      <g {...props} style={mover}>
        <rect x={x - 10} y={y - 120} width={w + 20} height={124} fill="transparent" />
        {lit && <circle cx={x + w / 2} cy={y - 40} r={w * 0.85} fill="url(#rn-brillo)" opacity="0.38" />}
        <rect x={x + w * 0.7} y={y - muro - 36} width="13" height="26" fill={TONOS.cerca} />
        <path d={`M${x - 9} ${y - muro} L${x + w / 2} ${y - muro - 36} L${x + w + 9} ${y - muro}Z`} fill={TONOS.cerca} />
        <rect x={x} y={y - muro} width={w} height={muro} fill={TONOS.cerca} />
        <rect x={x + 14} y={y - muro + 13} width="20" height="20" rx="2" fill={relleno(c.estado)} className={clase(c.estado)} />
        <rect x={x + w - 34} y={y - muro + 13} width="20" height="20" rx="2" fill={relleno(c.estado)} className={clase(c.estado)} />
        <rect x={x + w / 2 - 9} y={y - 30} width="18" height="30" rx="3" fill={lit ? LUZ : TONOS.apagada} opacity={lit ? 0.85 : 1} className={clase(c.estado)} />
        {c.estado === 'cerrada' && <path d={`M${x + 6} ${y - 4} H${x + w - 6}`} stroke={TONOS.medio} strokeWidth="3" strokeLinecap="round" />}
        {farol}
      </g>
    )
  }
  // Cabaña de dos aguas muy inclinadas
  const alto = 94
  return (
    <g {...props} style={mover}>
      <rect x={x - 8} y={y - alto - 10} width={w + 16} height={alto + 14} fill="transparent" />
      {lit && <circle cx={x + w / 2} cy={y - 34} r={w * 0.9} fill="url(#rn-brillo)" opacity="0.4" />}
      <path d={`M${x - 6} ${y} L${x + w / 2} ${y - alto} L${x + w + 6} ${y}Z`} fill={TONOS.cerca} />
      <path d={`M${x + 10} ${y} L${x + w / 2} ${y - alto + 22} L${x + w - 10} ${y}Z`} fill="color-mix(in oklab, var(--night) 34%, var(--sky-3))" />
      <circle cx={x + w / 2} cy={y - alto * 0.52} r="9" fill={relleno(c.estado)} className={clase(c.estado)} />
      <rect x={x + w / 2 - 10} y={y - 32} width="20" height="32" rx="3" fill={lit ? LUZ : TONOS.apagada} opacity={lit ? 0.88 : 1} className={clase(c.estado)} />
      {c.estado === 'cerrada' && <path d={`M${x + 12} ${y - 4} H${x + w - 12}`} stroke={TONOS.medio} strokeWidth="3" strokeLinecap="round" />}
      {farol}
    </g>
  )
}

/**
 * La escena completa con nombres y globo de detalle. `casas` viene ya calculado con el estado de la
 * noche que se está viendo. Con `decorativa` no hay clics ni nombres (pantalla de entrada).
 */
export function RanchoNoche({ casas, onPick, decorativa, pie }: { casas: CasaEscena[]; onPick?: (id: string) => void; decorativa?: boolean; pie?: ReactNode }) {
  const [sobre, setSobre] = useState<string | null>(null)
  const { lugares, edificio } = useMemo(() => acomodar(casas), [casas])
  const elegido = lugares.find((l) => l.casa.id === sobre)
  const pct = (n: number, total: number) => `${(n / total) * 100}%`
  // Con nombres, el dibujo termina en el suelo y los nombres van abajo en su propio renglón
  const alto = decorativa ? H : SUELO + 6
  return (
    <>
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${alto}` }}>
      <svg viewBox={`0 0 ${W} ${alto}`} className={cx('absolute inset-0 block h-full w-full', decorativa && 'pointer-events-none')} role="group" aria-label="El rancho esta noche">
        <defs>
          <radialGradient id="rn-brillo">
            <stop offset="0" stopColor={LUZ} stopOpacity="0.9" />
            <stop offset="1" stopColor={LUZ} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="pointer-events-none">
          <path d="M0 214 C200 176 360 186 540 202 S880 164 1060 184 S1300 172 1440 196 V360 H0Z" fill={TONOS.lejos} />
          <path d="M0 262 C220 240 420 252 640 256 S1040 236 1240 248 S1400 246 1440 252 V360 H0Z" fill={TONOS.medio} />
          <Focos x1={40} x2={1400} y={26} comba={30} n={15} />
          <Arbol x={70} s={1.25} fill={TONOS.frente} />
          <Cipres x={150} s={1.05} fill={TONOS.cerca} />
          <Cipres x={1300} s={1.15} fill={TONOS.cerca} />
          <Arbol x={1378} s={1.35} fill={TONOS.frente} />
        </g>
        {edificio && (
          <g className="pointer-events-none">
            <rect x={edificio.x - 6} y={SUELO - edificio.alto - 8} width={edificio.w + 12} height="10" rx="2" fill={TONOS.cerca} />
            <rect x={edificio.x} y={SUELO - edificio.alto} width={edificio.w} height={edificio.alto} fill={TONOS.cerca} />
          </g>
        )}
        {lugares.map((l) => (
          <Casa key={l.casa.id} l={l} sobre={sobre === l.casa.id} onSobre={(on) => setSobre(on ? l.casa.id : null)} onPick={() => onPick?.(l.casa.id)} />
        ))}
        <path className="pointer-events-none" d={`M0 ${SUELO - 2} C300 ${SUELO - 8} 520 ${SUELO + 4} 720 ${SUELO + 2} S1180 ${SUELO - 6} 1440 ${SUELO - 1} V360 H0Z`} fill={TONOS.frente} />
      </svg>

      {/* Globo con el detalle */}
      {elegido && !decorativa && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[300px] -translate-x-1/2 -translate-y-full rounded-[12px] bg-on-night px-3.5 py-2.5 text-night shadow-[var(--shadow-3)]"
          style={{ left: `clamp(150px, ${pct(elegido.ventana ? elegido.ventana.x + elegido.ventana.w / 2 : elegido.x + elegido.w / 2, W)}, calc(100% - 150px))`, top: pct((elegido.ventana ? elegido.ventana.y : SUELO - elegido.alto) - 14, alto) }}
        >
          <div className="text-[14px] font-semibold">{elegido.casa.nombre}</div>
          <div className="text-[13px] opacity-75">{elegido.casa.linea}</div>
        </div>
      )}
      {pie}
    </div>
    {/* Nombres: HTML para que bajen de línea en vez de cortarse. Comparten la misma celda, y así el
        renglón crece con el nombre más largo y nunca se encima con lo de abajo. */}
    {!decorativa && (
      <div className="pointer-events-none grid pt-1 pb-3" style={{ backgroundColor: TONOS.frente }}>
        {[
          ...lugares.filter((l) => !l.ventana).map((l) => ({ id: l.casa.id, nombre: l.casa.nombre, centro: l.x + l.w / 2, ancho: Math.max(l.w + 30, 110) })),
          ...(edificio ? [{ id: 'edificio', nombre: 'Habitaciones', centro: edificio.x + edificio.w / 2, ancho: Math.max(edificio.w + 30, 120) }] : []),
        ].map((n) => (
          <span key={n.id} className="col-start-1 row-start-1 -translate-x-1/2 justify-self-start text-center text-[11.5px] leading-tight font-medium text-on-night-soft" style={{ marginLeft: pct(n.centro, W), width: `max(${pct(n.ancho, W)}, 78px)` }}>
            {n.nombre}
          </span>
        ))}
      </div>
    )}
    </>
  )
}

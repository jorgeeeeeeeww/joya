// Mapa ilustrado del rancho: vista de pájaro "de costado" (oblicua), dibujada en vector con las medidas reales
// del plano. Reemplaza al render 3D: carga al instante, se ve igual en cualquier teléfono y cada casa se toca.
// Encima de cada casa va su estado; si se está limpiando, aparece alguien barriendo en la puerta.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Minus, Plus, LocateFixed } from 'lucide-react'
import { FEATURES, LOT_POLYGON, PATHS, TREES, type MapFeature } from '@/lib/layout'
import type { Unit, UnitStatus } from '@/lib/types'
import { TONE, UNIT_STATUS } from '@/lib/meta'
import { cx } from '@/components/ui'

export interface UnitInfo {
  guest?: string
  detail?: string
  cleaning?: number // 0..1
  /** Una línea útil que se ve siempre sobre la casa: "Sale hoy", "Llegan 17:00", "Limpiando · 40%" */
  short?: string
}

// ── Proyección: vista de pájaro inclinada. El norte queda arriba y de cada edificio se ve el techo,
// el frente (sur) y el costado oeste; las alturas se exageran un poco para que todo tenga volumen ──
const SK = 0.42 // cuánto se corre a la derecha lo que está más al sur (deja ver el costado)
const TZ = 0.58 // escorzo de la profundidad
const TY = 1.5 // altura (exagerada para que las casas no se vean planas)
const P = (x: number, y: number, z: number): [number, number] => [x + z * SK, z * TZ - y * TY]
const pts = (list: [number, number][]) => list.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(' ')
const mix = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

const MIN_X = -86
const MAX_X = 82
const MIN_Y = -64
const MAX_Y = 56
const W = MAX_X - MIN_X
const H = MAX_Y - MIN_Y

/** Colores propios de la ilustración, en sintonía con el tema (claro/oscuro) */
const PALETTE: CSSProperties = {
  ['--iso-ground' as string]: 'light-dark(#D6D5C0, #2B302A)',
  ['--iso-grass' as string]: 'light-dark(#BFC6A1, #36402F)',
  ['--iso-grass-2' as string]: 'light-dark(#AFB78F, #313A2B)',
  ['--iso-path' as string]: 'light-dark(#ECE5D6, #4E4B45)',
  ['--iso-path-edge' as string]: 'light-dark(#D8CFBD, #3F3C37)',
  ['--iso-park' as string]: 'light-dark(#D3CEC4, #3B3A37)',
  ['--iso-wall' as string]: 'light-dark(#F7F3EC, #C9C2B6)',
  ['--iso-wall-side' as string]: 'light-dark(#E2D9CA, #9E978B)',
  ['--iso-trim' as string]: 'light-dark(#FFFFFF, #E4DED3)',
  ['--iso-wood' as string]: 'light-dark(#9A7B5F, #7A6250)',
  ['--iso-tree' as string]: 'light-dark(#8FA27C, #44523D)',
  ['--iso-tree-2' as string]: 'light-dark(#7A8D68, #3A4734)',
  ['--iso-tree-hi' as string]: 'light-dark(#B4C3A0, #5A6B50)',
  ['--iso-shadow' as string]: 'light-dark(rgba(60,55,45,.22), rgba(0,0,0,.42))',
  ['--iso-window' as string]: 'light-dark(#7F909E, #3A4652)',
  ['--iso-glass' as string]: 'light-dark(#A9BAC6, #4A5866)',
  ['--iso-water' as string]: 'light-dark(#AFC6D0, #4D6470)',
  ['--iso-street' as string]: 'light-dark(#CBC5B9, #34332F)',
}

/** Color del estado (para el tapete y el farol de cada casa) */
const toneVar = (tone: string) => `var(--${tone === 'sky' ? 't-sky' : tone})`

const roofFill = (c?: string) => `color-mix(in oklab, ${c ?? '#d9cbb8'} 62%, light-dark(#d4c8b8, #6d6660))`
const roofShade = (c?: string) => `color-mix(in oklab, ${roofFill(c)} 78%, #000)`
const roofEdge = (c?: string) => `color-mix(in oklab, ${roofFill(c)} 60%, #000)`
const FLOWERS = ['var(--data-2)', 'var(--data-3)', 'var(--data-5)', 'var(--luz)']

function Building({ f, selected, dim, onPick, status, night }: { f: MapFeature; selected: boolean; dim: boolean; onPick: () => void; status?: UnitStatus; night: boolean }) {
  const h = f.height ?? 3
  const x0 = f.x - f.w / 2
  const x1 = f.x + f.w / 2
  const z0 = f.z - f.d / 2
  const z1 = f.z + f.d / 2
  const o = 0.7 // alero
  const isHip = f.roof === 'hip'
  const rh = Math.min(f.w, f.d) * (isHip ? 0.3 : 0.5)
  const alongX = f.w >= f.d
  const home = f.kind === 'casa' || f.kind === 'cabana'
  const lit = night || status === 'ocupada'

  // Muros
  const front = [P(x0, 0, z1), P(x1, 0, z1), P(x1, h, z1), P(x0, h, z1)] as [number, number][]
  const west = [P(x0, 0, z0), P(x0, 0, z1), P(x0, h, z1), P(x0, h, z0)] as [number, number][]
  const soft = [P(x0 - 0.4, 0, z0 + 1), P(x1 + 2.4, 0, z0 + 1), P(x1 + 2.6, 0, z1 + 2.2), P(x0 + 0.2, 0, z1 + 2.2)] as [number, number][]

  // Techo (con alero)
  const E = { x0: x0 - o, x1: x1 + o, z0: z0 - o, z1: z1 + o }
  type Face = { d: [number, number][]; fill: string; tiles?: [[number, number], [number, number], [number, number], [number, number]] }
  let roof: Face[]
  let ridge: [[number, number], [number, number]] | null = null
  if (isHip) {
    const inset = Math.min(f.w, f.d) / 2
    const r0 = P(x0 + inset, h + rh, f.z)
    const r1 = P(x1 - inset, h + rh, f.z)
    ridge = [r0, r1]
    roof = [
      { d: [P(E.x0, h, E.z0), P(E.x1, h, E.z0), r1, r0], fill: roofShade(f.roofColor) },
      { d: [P(E.x1, h, E.z0), P(E.x1, h, E.z1), r1], fill: roofFill(f.roofColor) },
      { d: [P(E.x0, h, E.z0), r0, P(E.x0, h, E.z1)], fill: roofShade(f.roofColor) },
      { d: [P(E.x0, h, E.z1), P(E.x1, h, E.z1), r1, r0], fill: roofFill(f.roofColor), tiles: [P(E.x0, h, E.z1), P(E.x1, h, E.z1), r1, r0] },
    ]
  } else if (alongX) {
    const a = P(E.x0, h + rh, f.z)
    const b = P(E.x1, h + rh, f.z)
    ridge = [a, b]
    roof = [
      { d: [P(E.x0, h, E.z0), P(E.x1, h, E.z0), b, a], fill: roofShade(f.roofColor) },
      { d: [P(E.x0, h, E.z1), P(E.x1, h, E.z1), b, a], fill: roofFill(f.roofColor), tiles: [P(E.x0, h, E.z1), P(E.x1, h, E.z1), b, a] },
    ]
  } else {
    const a = P(f.x, h + rh, E.z0)
    const b = P(f.x, h + rh, E.z1)
    ridge = [a, b]
    roof = [
      { d: [P(E.x0, h, E.z0), a, b, P(E.x0, h, E.z1)], fill: roofShade(f.roofColor) },
      { d: [P(E.x1, h, E.z0), a, b, P(E.x1, h, E.z1)], fill: roofFill(f.roofColor), tiles: [P(E.x1, h, E.z1), b, a, P(E.x1, h, E.z0)] },
    ]
  }
  // Hastial (triángulo del muro bajo el techo de dos aguas)
  const gable = !isHip ? (alongX ? [P(x0, h, z0), P(x0, h + rh * 0.92, f.z), P(x0, h, z1)] : [P(x0, h, z1), P(f.x, h + rh * 0.92, z1), P(x1, h, z1)]) : null

  // Ventanas en el frente con marco, cruz y contraventanas
  const nWin = Math.max(1, Math.round(f.w / (f.kind === 'salon' ? 3.6 : 4.4)))
  const winW = f.kind === 'salon' ? 1.5 : 1.3
  const winY0 = h * (f.kind === 'salon' ? 0.22 : 0.36)
  const winY1 = Math.min(h - 0.45, winY0 + (f.kind === 'salon' ? h * 0.55 : 1.5))
  const wins: number[] = []
  for (let i = 0; i < nWin; i++) {
    const cx0 = x0 + (f.w / nWin) * (i + 0.5)
    if (Math.abs(cx0 - f.x) < (f.kind === 'salon' ? 2.2 : 1.7)) continue
    wins.push(cx0)
  }
  const doorW = f.kind === 'salon' ? 3 : 1.6
  const doorH = Math.min(f.kind === 'salon' ? h * 0.62 : 2.3, h * 0.72)
  const zf = z1 + 0.02
  const sideWins = Math.max(1, Math.round(f.d / 4.5))

  return (
    <g
      onClick={(e) => {
        e.stopPropagation()
        onPick()
      }}
      className="cursor-pointer transition-opacity duration-300"
      opacity={dim ? 0.32 : 1}
      role="button"
      aria-label={f.name}
    >
      {/* Sombra suave al pie */}
      <polygon points={pts(soft)} fill="var(--iso-shadow)" filter="url(#iso-blur)" />
      {selected && <polygon points={pts([P(x0 - 1.4, 0, z1 + 2), P(x1 + 1.4, 0, z1 + 2), P(x1 + 1.4, 0, z0 - 1.4), P(x0 - 1.4, 0, z0 - 1.4)])} fill="color-mix(in oklab, var(--primary) 10%, transparent)" stroke="var(--primary)" strokeWidth={0.4} strokeDasharray="1.2 0.8" />}
      {/* Costado oeste (en sombra) y frente (con luz) */}
      <polygon points={pts(west)} fill="var(--iso-wall-side)" />
      <polygon points={pts(west)} fill="url(#iso-shade-v)" />
      <polygon points={pts(front)} fill="var(--iso-wall)" />
      <polygon points={pts(front)} fill="url(#iso-light-v)" />
      {/* Zócalo */}
      <polygon points={pts([P(x0, 0, zf), P(x1, 0, zf), P(x1, 0.45, zf), P(x0, 0.45, zf)])} fill="var(--iso-wall-side)" />
      <polygon points={pts([P(x0, 0, z0), P(x0, 0, z1), P(x0, 0.45, z1), P(x0, 0.45, z0)])} fill="color-mix(in oklab, var(--iso-wall-side) 85%, #000)" />
      {/* Ventanas del costado */}
      {Array.from({ length: sideWins }, (_, i) => {
        const zc = z0 + (f.d / sideWins) * (i + 0.5)
        const y0 = winY0
        const y1 = Math.min(h - 0.45, y0 + 1.3)
        return <polygon key={'s' + i} points={pts([P(x0 - 0.02, y0, zc - 0.6), P(x0 - 0.02, y0, zc + 0.6), P(x0 - 0.02, y1, zc + 0.6), P(x0 - 0.02, y1, zc - 0.6)])} fill={lit ? 'var(--luz)' : 'var(--iso-window)'} opacity={lit ? 0.8 : 0.55} />
      })}
      {/* Ventanas del frente */}
      {wins.map((cx0, i) => {
        const g = [P(cx0 - winW / 2, winY0, zf), P(cx0 + winW / 2, winY0, zf), P(cx0 + winW / 2, winY1, zf), P(cx0 - winW / 2, winY1, zf)] as [number, number][]
        const mid = (winY0 + winY1) / 2
        return (
          <g key={i}>
            {lit && <ellipse cx={P(cx0, mid, zf)[0]} cy={P(cx0, mid, zf)[1]} rx={1.6} ry={1.6} fill="url(#iso-glow)" />}
            <polygon points={pts(g)} fill={lit ? 'var(--luz)' : 'var(--iso-glass)'} stroke="var(--iso-trim)" strokeWidth={0.18} />
            <line x1={P(cx0, winY0, zf)[0]} y1={P(cx0, winY0, zf)[1]} x2={P(cx0, winY1, zf)[0]} y2={P(cx0, winY1, zf)[1]} stroke="var(--iso-trim)" strokeWidth={0.1} />
            <line x1={P(cx0 - winW / 2, mid, zf)[0]} y1={P(cx0 - winW / 2, mid, zf)[1]} x2={P(cx0 + winW / 2, mid, zf)[0]} y2={P(cx0 + winW / 2, mid, zf)[1]} stroke="var(--iso-trim)" strokeWidth={0.1} />
            {home && (
              <>
                <polygon points={pts([P(cx0 - winW / 2 - 0.5, winY0, zf), P(cx0 - winW / 2 - 0.05, winY0, zf), P(cx0 - winW / 2 - 0.05, winY1, zf), P(cx0 - winW / 2 - 0.5, winY1, zf)])} fill={roofShade(f.roofColor)} />
                <polygon points={pts([P(cx0 + winW / 2 + 0.05, winY0, zf), P(cx0 + winW / 2 + 0.5, winY0, zf), P(cx0 + winW / 2 + 0.5, winY1, zf), P(cx0 + winW / 2 + 0.05, winY1, zf)])} fill={roofShade(f.roofColor)} />
                {/* Macetero con flores bajo la ventana */}
                <polygon points={pts([P(cx0 - winW / 2, winY0 - 0.35, zf + 0.25), P(cx0 + winW / 2, winY0 - 0.35, zf + 0.25), P(cx0 + winW / 2, winY0 - 0.05, zf + 0.25), P(cx0 - winW / 2, winY0 - 0.05, zf + 0.25)])} fill="var(--iso-wood)" />
                {[-0.4, 0, 0.4].map((dx, k) => (
                  <circle key={k} cx={P(cx0 + dx, winY0 + 0.05, zf + 0.25)[0]} cy={P(cx0 + dx, winY0 + 0.05, zf + 0.25)[1]} r={0.32} fill={FLOWERS[(i + k) % FLOWERS.length]} />
                ))}
              </>
            )}
          </g>
        )
      })}
      {/* Puerta */}
      <polygon points={pts([P(f.x - doorW / 2, 0, zf), P(f.x + doorW / 2, 0, zf), P(f.x + doorW / 2, doorH, zf), P(f.x - doorW / 2, doorH, zf)])} fill={lit ? 'color-mix(in oklab, var(--luz) 60%, var(--iso-wood))' : 'var(--iso-wood)'} stroke="var(--iso-trim)" strokeWidth={0.16} />
      {f.kind === 'salon' && <line x1={P(f.x, 0, zf)[0]} y1={P(f.x, 0, zf)[1]} x2={P(f.x, doorH, zf)[0]} y2={P(f.x, doorH, zf)[1]} stroke="var(--iso-trim)" strokeWidth={0.12} />}
      {/* Tapete del color del estado */}
      {status && <polygon points={pts([P(f.x - 1, 0.01, z1 + 0.3), P(f.x + 1, 0.01, z1 + 0.3), P(f.x + 1, 0.01, z1 + 1.3), P(f.x - 1, 0.01, z1 + 1.3)])} fill={toneVar(UNIT_STATUS[status].tone)} />}
      {/* Hastial */}
      {gable && <polygon points={pts(gable)} fill={alongX ? 'var(--iso-wall-side)' : 'var(--iso-wall)'} />}
      {/* Techo con tejas */}
      {roof.map((r, i) => (
        <g key={i}>
          <polygon points={pts(r.d)} fill={r.fill} stroke={roofEdge(f.roofColor)} strokeWidth={0.12} strokeLinejoin="round" />
          {r.tiles &&
            [0.18, 0.34, 0.5, 0.66, 0.82].map((t) => {
              const a = mix(r.tiles![0], r.tiles![3], t)
              const b = mix(r.tiles![1], r.tiles![2], t)
              return <line key={t} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={roofEdge(f.roofColor)} strokeWidth={0.09} opacity={0.55} />
            })}
          {r.tiles && <polygon points={pts(r.d)} fill="url(#iso-roof-light)" />}
        </g>
      ))}
      {ridge && <line x1={ridge[0][0]} y1={ridge[0][1]} x2={ridge[1][0]} y2={ridge[1][1]} stroke={roofEdge(f.roofColor)} strokeWidth={0.32} strokeLinecap="round" />}
      {/* Chimenea en las casas */}
      {f.kind === 'casa' && (
        <g>
          <polygon points={pts([P(x1 - 3, h + rh * 0.55, f.z - 1.4), P(x1 - 2, h + rh * 0.55, f.z - 1.4), P(x1 - 2, h + rh + 1, f.z - 1.4), P(x1 - 3, h + rh + 1, f.z - 1.4)])} fill="var(--iso-wall)" />
          <polygon points={pts([P(x1 - 3, h + rh * 0.55, f.z - 2.2), P(x1 - 3, h + rh * 0.55, f.z - 1.4), P(x1 - 3, h + rh + 1, f.z - 1.4), P(x1 - 3, h + rh + 1, f.z - 2.2)])} fill="var(--iso-wall-side)" />
          <polygon points={pts([P(x1 - 3.1, h + rh + 1, f.z - 2.3), P(x1 - 1.9, h + rh + 1, f.z - 2.3), P(x1 - 1.9, h + rh + 1, f.z - 1.3), P(x1 - 3.1, h + rh + 1, f.z - 1.3)])} fill={roofEdge(f.roofColor)} />
        </g>
      )}
      {/* Porche con techito y farol en casas y cabañas */}
      {home && (
        <g>
          <polygon points={pts([P(f.x - 1.8, doorH + 0.5, zf), P(f.x + 1.8, doorH + 0.5, zf), P(f.x + 1.8, doorH + 0.05, z1 + 1.5), P(f.x - 1.8, doorH + 0.05, z1 + 1.5)])} fill={roofFill(f.roofColor)} stroke={roofEdge(f.roofColor)} strokeWidth={0.1} />
          {[-1.6, 1.6].map((dx) => (
            <line key={dx} x1={P(f.x + dx, 0, z1 + 1.4)[0]} y1={P(f.x + dx, 0, z1 + 1.4)[1]} x2={P(f.x + dx, doorH + 0.05, z1 + 1.4)[0]} y2={P(f.x + dx, doorH + 0.05, z1 + 1.4)[1]} stroke="var(--iso-trim)" strokeWidth={0.2} />
          ))}
          <circle cx={P(f.x + 1.25, doorH * 0.7, zf + 0.05)[0]} cy={P(f.x + 1.25, doorH * 0.7, zf + 0.05)[1]} r={lit ? 1.3 : 0} fill="url(#iso-glow)" />
          <circle cx={P(f.x + 1.25, doorH * 0.7, zf + 0.05)[0]} cy={P(f.x + 1.25, doorH * 0.7, zf + 0.05)[1]} r={0.26} fill={lit ? 'var(--luz)' : status ? toneVar(UNIT_STATUS[status].tone) : 'var(--iso-trim)'} />
        </g>
      )}
      {/* Columnas del portal en el salón */}
      {f.kind === 'salon' &&
        Array.from({ length: 7 }, (_, i) => {
          const cx0 = x0 + 2 + i * ((f.w - 4) / 6)
          return <line key={i} x1={P(cx0, 0, z1 + 1.6)[0]} y1={P(cx0, 0, z1 + 1.6)[1]} x2={P(cx0, h * 0.85, z1 + 1.6)[0]} y2={P(cx0, h * 0.85, z1 + 1.6)[1]} stroke="var(--iso-trim)" strokeWidth={0.38} strokeLinecap="round" />
        })}
      {f.kind === 'salon' && <polygon points={pts([P(x0 + 1, h * 0.85, z1 + 2.2), P(x1 - 1, h * 0.85, z1 + 2.2), P(x1 - 1, h * 0.92, zf), P(x0 + 1, h * 0.92, zf)])} fill={roofFill(f.roofColor)} stroke={roofEdge(f.roofColor)} strokeWidth={0.1} />}
      {/* Arbustos con flores al frente */}
      {home &&
        [x0 + 1.2, x1 - 1.2].map((bx, i) => (
          <g key={'b' + i}>
            <ellipse cx={P(bx, 0.5, z1 + 0.9)[0]} cy={P(bx, 0.5, z1 + 0.9)[1]} rx={1.1} ry={0.75} fill="var(--iso-tree)" />
            <circle cx={P(bx - 0.3, 0.8, z1 + 0.9)[0]} cy={P(bx - 0.3, 0.8, z1 + 0.9)[1]} r={0.22} fill={FLOWERS[i % FLOWERS.length]} />
            <circle cx={P(bx + 0.35, 0.65, z1 + 0.9)[0]} cy={P(bx + 0.35, 0.65, z1 + 0.9)[1]} r={0.2} fill={FLOWERS[(i + 2) % FLOWERS.length]} />
          </g>
        ))}
    </g>
  )
}

/** Alguien barriendo frente a la puerta (solo mientras la casa está en limpieza) */
function Cleaner({ f }: { f: MapFeature }) {
  const [x, y] = P(f.x + 3, 0, f.z + f.d / 2 + 2.4)
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <ellipse cx={0} cy={0.1} rx={0.9} ry={0.3} fill="var(--iso-shadow)" />
      <rect x={-0.45} y={-1.9} width={0.9} height={1.9} rx={0.4} fill="var(--chispa)" />
      <circle cx={0} cy={-2.35} r={0.48} fill="light-dark(#E9D3BE, #D6BFA9)" />
      <g className="iso-barrer">
        <line x1={0.3} y1={-1.5} x2={1.4} y2={0} stroke="light-dark(#6B5A48, #CDB8A0)" strokeWidth={0.16} strokeLinecap="round" />
        <path d="M1.05 -0.15 L1.85 -0.15 L1.65 0.25 L1.15 0.25Z" fill="var(--luz)" />
      </g>
      <circle className="iso-burbuja" cx={-1.1} cy={-0.6} r={0.25} fill="none" stroke="light-dark(#9fb6c4, #cfe0ea)" strokeWidth={0.08} />
      <circle className="iso-burbuja iso-burbuja-2" cx={-1.6} cy={-1.1} r={0.18} fill="none" stroke="light-dark(#9fb6c4, #cfe0ea)" strokeWidth={0.08} />
    </g>
  )
}

function TreeShape({ x, z, kind, s }: { x: number; z: number; kind: string; s: number }) {
  const [px, py] = P(x, 0, z)
  if (kind === 'cypress')
    return (
      <g transform={`translate(${px} ${py}) scale(${s * 1.35})`}>
        <ellipse cx={0.4} cy={0.1} rx={1} ry={0.35} fill="var(--iso-shadow)" />
        <path d="M0 -5.5 C0.9 -4 1.1 -1.5 0.8 0 H-0.8 C-1.1 -1.5 -0.9 -4 0 -5.5Z" fill="var(--iso-tree-2)" />
      </g>
    )
  if (kind === 'palm')
    return (
      <g transform={`translate(${px} ${py}) scale(${s * 1.35})`}>
        <ellipse cx={0.6} cy={0.1} rx={1.3} ry={0.4} fill="var(--iso-shadow)" />
        <path d="M-0.12 0 L0.12 0 L0.2 -4.6 L0 -4.6Z" fill="light-dark(#9C8E78, #6B6150)" />
        <path d="M0.1 -4.6 C-1 -5.2 -2 -4.9 -2.6 -4.1 C-1.6 -4.5 -0.8 -4.4 0.1 -4.3Z M0.1 -4.6 C1.2 -5.3 2.2 -5 2.8 -4.2 C1.8 -4.6 1 -4.5 0.1 -4.3Z M0.1 -4.6 C-0.4 -5.8 -1.4 -6 -2 -5.6 C-1 -5.5 -0.4 -5.1 0.1 -4.5Z M0.1 -4.6 C0.7 -5.8 1.7 -6 2.3 -5.5 C1.3 -5.5 0.6 -5.1 0.1 -4.5Z" fill="var(--iso-tree)" />
      </g>
    )
  return (
    <g transform={`translate(${px} ${py}) scale(${s * 1.35})`}>
      <ellipse cx={0.9} cy={0.15} rx={2} ry={0.6} fill="var(--iso-shadow)" />
      <rect x={-0.18} y={-1.6} width={0.36} height={1.6} fill="light-dark(#9C8E78, #6B6150)" />
      <circle cx={0.5} cy={-2.8} r={1.6} fill="var(--iso-tree-2)" />
      <circle cx={-0.4} cy={-3.2} r={1.9} fill="var(--iso-tree)" />
      <circle cx={-0.9} cy={-3.9} r={0.9} fill="var(--iso-tree-hi)" opacity={0.7} />
    </g>
  )
}

function Area({ f, onPick }: { f: MapFeature; onPick?: () => void }) {
  const x0 = f.x - f.w / 2
  const x1 = f.x + f.w / 2
  const z0 = f.z - f.d / 2
  const z1 = f.z + f.d / 2
  const fill = f.kind === 'jardin' ? 'var(--iso-grass)' : f.kind === 'pasto' ? 'var(--iso-grass-2)' : f.kind === 'parking' ? 'var(--iso-park)' : f.kind === 'juegos' ? 'light-dark(#E6D8C2, #4D463C)' : 'var(--iso-path)'
  const click = onPick
    ? (e: React.MouseEvent) => {
        e.stopPropagation()
        onPick()
      }
    : undefined
  if (f.shape === 'ellipse') {
    const [cx0, cy0] = P(f.x, 0, f.z)
    return (
      <g onClick={click} className={onPick ? 'cursor-pointer' : undefined}>
        <ellipse cx={cx0} cy={cy0} rx={f.w / 2 + (f.d / 2) * SK * 0.5} ry={(f.d / 2) * TZ} fill={fill} />
        {f.kind === 'glorieta' && (
          <>
            <ellipse cx={cx0} cy={cy0} rx={2.6} ry={1.4} fill="var(--iso-water)" />
            <ellipse cx={cx0} cy={cy0 - 0.6} rx={0.7} ry={0.4} fill="light-dark(#fff, #cfe0ea)" opacity={0.8} />
          </>
        )}
      </g>
    )
  }
  return (
    <g onClick={click} className={onPick ? 'cursor-pointer' : undefined}>
      <polygon points={pts([P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)])} fill={fill} />
      {f.kind === 'parking' &&
        Array.from({ length: 6 }, (_, i) => {
          const xx = x0 + 2 + i * ((f.w - 4) / 5)
          return <line key={i} x1={P(xx, 0, z0 + 2)[0]} y1={P(xx, 0, z0 + 2)[1]} x2={P(xx, 0, z0 + 8)[0]} y2={P(xx, 0, z0 + 8)[1]} stroke="light-dark(#fff, #6b6863)" strokeWidth={0.25} />
        })}
    </g>
  )
}

export interface RanchIllustratedProps {
  units: Unit[]
  selectedId?: string | null
  onSelect: (featureId: string) => void
  onClear: () => void
  statusFilter?: UnitStatus | null
  unitInfo?: Record<string, UnitInfo>
  /** Hay evento hoy en el salón o el jardín: se marca sobre el lugar */
  eventToday?: { salon?: string; jardin?: string }
  night?: boolean
  className?: string
  /** Píxeles que tapa un panel a la derecha / abajo: al elegir una casa se centra en lo que queda libre */
  coverRight?: number
  coverBottom?: number
}

type View = { k: number; tx: number; ty: number }

export default function RanchIllustrated({ units, selectedId, onSelect, onClear, statusFilter, unitInfo, eventToday, night = false, className, coverRight = 0, coverBottom = 0 }: RanchIllustratedProps) {
  const host = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ moved: number; dist?: number; k0?: number } | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e!.contentRect.width, h: e!.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Tamaño base: la ilustración completa cabe en el espacio disponible
  const base = box.w && box.h ? Math.min(box.w / W, box.h / H) : 0
  const drawW = W * base
  const drawH = H * base
  const byUnit = useMemo(() => new Map(units.map((u) => [u.id, u])), [units])

  // Al elegir una casa: se acerca y la centra en lo que no tapan los paneles
  const focus = useCallback(
    (fid: string | null | undefined) => {
      if (!base) return
      const f = fid ? FEATURES.find((x) => x.id === fid) : undefined
      if (!f) return setView(home())
      const k = box.w < 640 ? 2.4 : f.kind === 'jardin' ? 1.4 : 1.9
      const [sx, sy] = P(f.x, (f.height ?? 0) / 2, f.z)
      const px = (sx - MIN_X) * base - drawW / 2
      const py = (sy - MIN_Y) * base - drawH / 2
      setView({ k, tx: -px * k - coverRight / 2, ty: -py * k - coverBottom / 2 })
    },
    [base, box.w, drawW, drawH, coverRight, coverBottom],
  )
  useEffect(() => focus(selectedId), [selectedId, focus])

  // Vista inicial: en pantallas angostas (celular) se acerca hasta llenar el alto, centrada en el salón y las casas
  function home(): View {
    if (!base || drawH * 1.15 >= box.h) return { k: 1, tx: 0, ty: 0 }
    const k = Math.min(2.2, (box.h * 0.92) / drawH)
    const [sx, sy] = P(-6, 0, 6)
    return { k, tx: -((sx - MIN_X) * base - drawW / 2) * k, ty: -((sy - MIN_Y) * base - drawH / 2) * k }
  }
  const zoomBy = (m: number) => setView((v) => ({ k: Math.min(4, Math.max(1, v.k * m)), tx: v.tx * m, ty: v.ty * m }))

  const ordered = useMemo(() => {
    const items: ({ t: 'b'; f: MapFeature; z: number } | { t: 'tree'; i: number; z: number })[] = []
    for (const f of FEATURES) if (f.height) items.push({ t: 'b', f, z: f.z + f.d / 2 })
    TREES.forEach((tr, i) => items.push({ t: 'tree', i, z: tr.z }))
    return items.sort((a, b) => a.z - b.z)
  }, [])

  const dimOf = (f: MapFeature) => {
    if (!statusFilter || !f.unitId) return false
    return byUnit.get(f.unitId)?.status !== statusFilter
  }
  const pxPerM = base * view.k
  const compact = pxPerM < 5.2

  return (
    <div
      ref={host}
      className={cx('relative h-full w-full touch-none overflow-hidden select-none', className)}
      style={PALETTE}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        zoomBy(e.deltaY > 0 ? 1 / 1.15 : 1.15)
      }}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()]
          gesture.current = { moved: 99, dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), k0: view.k }
        } else gesture.current = { moved: 0 }
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId)
        const g = gesture.current
        if (!prev || !g) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pointers.current.size === 2 && g.dist && g.k0) {
          const [a, b] = [...pointers.current.values()]
          const k = Math.min(4, Math.max(1, (g.k0 * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / g.dist))
          setView((v) => ({ k, tx: (v.tx * k) / v.k, ty: (v.ty * k) / v.k }))
          return
        }
        g.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y)
        // Se captura el dedo solo cuando de verdad arrastra: así un toque sí llega a la casa
        const el = e.currentTarget
        if (g.moved > 6 && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId)
        if (g.moved > 6 && view.k > 1) setView((v) => ({ ...v, tx: v.tx + e.clientX - prev.x, ty: v.ty + e.clientY - prev.y }))
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId)
        if (!pointers.current.size) setTimeout(() => (gesture.current = null), 0)
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId)
        gesture.current = null
      }}
      onClickCapture={(e) => {
        if (gesture.current && gesture.current.moved > 6) e.stopPropagation()
      }}
    >
      <div
        className="absolute top-1/2 left-1/2 transition-transform duration-[var(--dur-4)] ease-[var(--ease-calma)]"
        style={{ width: drawW, height: drawH, transform: `translate(-50%, -50%) translate(${view.tx}px, ${view.ty}px) scale(${view.k})` }}
      >
        <svg viewBox={`${MIN_X} ${MIN_Y} ${W} ${H}`} className="absolute inset-0 h-full w-full" onClick={onClear} role="img" aria-label="Mapa ilustrado del rancho">
          <defs>
            <filter id="iso-blur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.7" />
            </filter>
            <linearGradient id="iso-light-v" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
              <stop offset="1" stopColor="#000" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="iso-shade-v" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#000" stopOpacity="0.04" />
              <stop offset="1" stopColor="#000" stopOpacity="0.16" />
            </linearGradient>
            <linearGradient id="iso-roof-light" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#000" stopOpacity="0.06" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.2" />
            </linearGradient>
            <radialGradient id="iso-glow">
              <stop offset="0" stopColor="var(--luz)" stopOpacity="0.85" />
              <stop offset="1" stopColor="var(--luz)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Calle y terreno */}
          <polygon points={pts([P(-46, 0, -90), P(-40, 0, -90), P(-40, 0, 90), P(-46, 0, 90)])} fill="var(--iso-street)" />
          <polygon points={pts(LOT_POLYGON.map(([x, z]) => P(x, 0, z)))} fill="var(--iso-ground)" stroke="light-dark(#b9b39f, #4a5144)" strokeWidth={0.3} />
          {FEATURES.filter((f) => !f.height).map((f) => (
            <Area key={f.id} f={f} onPick={f.venue === 'jardin' || f.kind === 'glorieta' ? () => onSelect('jardin') : undefined} />
          ))}
          {PATHS.map((p, i) => (
            <polyline key={i} points={pts(p.points.map(([x, z]) => P(x, 0, z)))} fill="none" stroke="var(--iso-path)" strokeWidth={p.width * 0.8} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {ordered.map((it) =>
            it.t === 'tree' ? (
              <TreeShape key={'t' + it.i} {...TREES[it.i]!} />
            ) : (
              <g key={it.f.id}>
                <Building f={it.f} selected={selectedId === it.f.id} dim={dimOf(it.f)} night={night} status={it.f.unitId ? byUnit.get(it.f.unitId)?.status : undefined} onPick={() => onSelect(it.f.id)} />
                {it.f.unitId && byUnit.get(it.f.unitId)?.status === 'limpiando' && <Cleaner f={it.f} />}
              </g>
            ),
          )}
          {night && <rect x={MIN_X} y={MIN_Y} width={W} height={H} fill="var(--night)" opacity={0.22} pointerEvents="none" />}
        </svg>

        {/* Etiquetas: nombre y estado arriba de cada casa (no crecen con el zoom) */}
        {FEATURES.filter((f) => f.unitId || f.id === 'salon' || f.id === 'jardin').map((f) => {
          const u = f.unitId ? byUnit.get(f.unitId) : undefined
          const st = u ? UNIT_STATUS[u.status] : undefined
          const info = f.unitId ? unitInfo?.[f.unitId] : undefined
          // Las casas van en fila (una tras otra): su etiqueta va al costado para no encimarse
          const side = f.kind === 'casa'
          const top = f.height ? f.height + Math.min(f.w, f.d) * (f.roof === 'hip' ? 0.3 : 0.5) + 0.8 : 0
          const [sx, sy] = side ? P(f.x - f.w / 2 - 1.2, (f.height ?? 0) * 0.6, f.z + f.d / 2) : P(f.x, top, f.id === 'jardin' ? f.z - 6 : f.z)
          const sel = selectedId === f.id
          const ev = f.id === 'salon' ? eventToday?.salon : f.id === 'jardin' ? eventToday?.jardin : undefined
          const short = f.name.replace(/^(Cabaña|Casa) /, '').replace('Salón de eventos', 'Salón').replace('Jardín de eventos', 'Jardín')
          return (
            <button
              key={f.id}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(f.id)
              }}
              className={cx(
                'absolute flex flex-col items-center rounded-[12px] px-2 py-0.5 text-center whitespace-nowrap shadow-[var(--shadow-1)] transition-opacity duration-300',
                sel ? 'z-10 bg-ink text-paper' : 'bg-[color-mix(in_oklab,var(--surface)_94%,transparent)] text-ink ring-1 ring-line',
                dimOf(f) && 'opacity-40',
              )}
              style={{ left: ((sx - MIN_X) / W) * 100 + '%', top: ((sy - MIN_Y) / H) * 100 + '%', transform: side ? `translate(-100%, -50%) scale(${1 / view.k})` : `translate(-50%, -100%) scale(${1 / view.k})`, transformOrigin: side ? '100% 50%' : '50% 100%' }}
            >
              <span className="flex items-center gap-1 text-[11.5px] leading-tight font-semibold">
                {st && <span className={cx('h-1.5 w-1.5 rounded-full', TONE[st.tone].solid)} />}
                {short}
              </span>
              {(!compact || sel) && (info?.short || ev) && <span className="text-[10.5px] leading-tight opacity-80">{ev ?? info?.short}</span>}
            </button>
          )
        })}
      </div>

      {/* Acercar / alejar / centrar */}
      <div className="glass absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-full shadow-[var(--shadow-1)] ring-1 ring-line">
        <button aria-label="Acercar" className="flex h-11 w-11 items-center justify-center text-ink-soft hover:bg-wash hover:text-ink" onClick={() => zoomBy(1.35)}>
          <Plus size={18} strokeWidth={1.6} />
        </button>
        <button aria-label="Alejar" className="flex h-11 w-11 items-center justify-center border-t border-line text-ink-soft hover:bg-wash hover:text-ink" onClick={() => zoomBy(1 / 1.35)}>
          <Minus size={18} strokeWidth={1.6} />
        </button>
        <button aria-label="Ver todo el rancho" className="flex h-11 w-11 items-center justify-center border-t border-line text-ink-soft hover:bg-wash hover:text-ink" onClick={() => setView(home())}>
          <LocateFixed size={17} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  )
}

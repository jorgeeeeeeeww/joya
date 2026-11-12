// El loto del logo de Jardines La Joya, dibujado como vector (nítido a cualquier tamaño). Es el mismo de la página
// (web/src/components/Loto.astro): pétalos claros y oscuros, y el hueco entre pétalos toma el color del fondo.
import { useId, useMemo, type CSSProperties } from 'react'

type P = [number, number]

/** Pétalo de loto de la base B a la punta T: ancho y de base redonda, con punta fina (medio ancho w) */
function petalo(B: P, T: P, w: number) {
  const dx = T[0] - B[0]
  const dy = T[1] - B[1]
  const L = Math.hypot(dx, dy)
  const nx = -dy / L
  const ny = dx / L
  const at = (t: number, s: number): string => `${(B[0] + dx * t + nx * w * s).toFixed(1)} ${(B[1] + dy * t + ny * w * s).toFixed(1)}`
  return `M${B[0]} ${B[1]}C${at(-0.04, 1.05)} ${at(0.5, 1.32)} ${T[0]} ${T[1]}C${at(0.5, -1.32)} ${at(-0.04, -1.05)} ${B[0]} ${B[1]}Z`
}
const espejo = (p: P): P => [444 - p[0], p[1]]
const par = (B: P, T: P, w: number) => [petalo(B, T, w), petalo(espejo(B), espejo(T), w)]

// Coordenadas sobre el logo original (444 × 390), de atrás hacia adelante
const CAPAS: { d: string; tono: 'claro' | 'oscuro' }[] = [
  { d: petalo([222, 160], [222, 14], 54), tono: 'claro' },
  ...par([192, 232], [44, 70], 44).map((d) => ({ d, tono: 'claro' as const })),
  ...par([200, 206], [148, 94], 27).map((d) => ({ d, tono: 'claro' as const })),
  ...par([190, 266], [6, 262], 26).map((d) => ({ d, tono: 'claro' as const })),
  ...par([196, 248], [86, 182], 30).map((d) => ({ d, tono: 'oscuro' as const })),
  ...par([198, 276], [70, 330], 27).map((d) => ({ d, tono: 'oscuro' as const })),
  { d: petalo([222, 230], [222, 386], 35), tono: 'claro' },
]
const GOTA = 'M222 96C246 126 270 156 267 184C264 210 245 224 222 224C199 224 180 210 177 184C174 156 198 126 222 96Z'

/**
 * `hueco`: el color del fondo sobre el que va (el trazo que separa los pétalos).
 * `mono`: una sola tinta (para el ícono de la barra de menú o para impresión).
 */
export function Loto({ size, hueco = 'var(--surface)', className = '', style, titulo }: { size?: number | string; hueco?: string; className?: string; style?: CSSProperties; titulo?: string }) {
  const id = useId()
  const lado = useMemo(() => (size === undefined ? undefined : typeof size === 'number' ? `${size}px` : size), [size])
  return (
    <svg
      viewBox="0 0 444 390"
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      className={`shrink-0 overflow-visible ${className}`}
      style={{ width: lado, height: lado ? `calc(${lado} * 390 / 444)` : undefined, ...style }}
    >
      <g id={id}>
        {CAPAS.map((c, i) => (
          <path key={i} d={c.d} fill={c.tono === 'claro' ? '#A9BFA2' : '#56645A'} stroke={hueco} strokeWidth={9} strokeLinejoin="round" paintOrder="stroke" />
        ))}
        <path d={GOTA} fill="#A9BFA2" stroke={hueco} strokeWidth={9} strokeLinejoin="round" paintOrder="stroke" />
      </g>
    </svg>
  )
}

/** El logo completo: el loto y «Jardines la JOYA» (la marca de la página, en la letra de la app) */
export function Marca({ tamano = 30, hueco, className = '', color }: { tamano?: number; hueco?: string; className?: string; color?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} style={color ? { color } : undefined}>
      <Loto size={tamano} hueco={hueco} />
      <span className="flex flex-col leading-none">
        <span className="text-[11px] font-medium tracking-[0.04em] opacity-80">Jardines la</span>
        <span className="mt-[3px] text-[17px] font-bold tracking-[0.1em]">JOYA</span>
      </span>
    </span>
  )
}

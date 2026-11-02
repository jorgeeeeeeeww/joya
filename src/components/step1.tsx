// step1 · primitivas de la huella: Luz, Horizonte, cielo, losa noche, ✦, carga con luz.
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useStore } from '@/lib/store'
import { useCountUp, fadeRise, heroRise, stagger } from '@/lib/motion'

type Variante = 'colinas' | 'olas' | 'nubes'

/** Variante de horizonte según la atmósfera activa (Flor = nubes, Marea = olas, resto = colinas) */
export function useHorizonVariant(): Variante {
  const atmos = useStore((s) => {
    const uid = s.session.userId
    return (uid && s.settings.userPrefs?.[uid]?.atmos) || s.settings.atmos
  })
  return atmos === 'flor' ? 'nubes' : atmos === 'marea' ? 'olas' : 'colinas'
}

// ── La Luz: sol/luna. Máximo una por vista, nunca detrás de texto ──
export function Luz({ size, className = '', style }: { size?: number | string; className?: string; style?: CSSProperties }) {
  const vars = size !== undefined ? ({ '--size': typeof size === 'number' ? `${size}px` : size } as CSSProperties) : undefined
  return <div aria-hidden="true" className={`luz ${className}`} style={{ ...vars, ...style }} />
}

// ── Horizonte en capas (perspectiva atmosférica) ──
const PATHS: Record<Exclude<Variante, 'nubes'>, string[]> = {
  colinas: [
    'M0 170 C180 110 300 120 420 150 S700 90 860 120 S1180 80 1440 130 V320 H0Z',
    'M0 205 C160 170 330 180 470 200 S760 150 930 175 S1240 150 1440 185 V320 H0Z',
    'M0 245 C200 215 380 235 560 238 S880 205 1080 228 S1320 220 1440 232 V320 H0Z',
    'M0 280 C240 262 480 272 720 270 S1200 258 1440 268 V320 H0Z',
  ],
  olas: [
    'M0 160 Q90 140 180 160 T360 160 T540 160 T720 160 T900 160 T1080 160 T1260 160 T1440 160 V320 H0Z',
    'M0 200 Q120 172 240 200 T480 200 T720 200 T960 200 T1200 200 T1440 200 V320 H0Z',
    'M0 240 Q160 206 320 240 T640 240 T960 240 T1280 240 T1600 240 V320 H0Z',
    'M0 282 Q200 250 400 282 T800 282 T1200 282 T1600 282 V320 H0Z',
  ],
}
const NUBES: [number, number, number][][] = [
  [[40, 150, 70], [300, 140, 80], [620, 150, 72], [930, 138, 84], [1250, 148, 76], [1440, 150, 70]],
  [[120, 200, 76], [420, 190, 82], [760, 198, 78], [1080, 188, 86], [1380, 196, 80]],
  [[0, 250, 80], [260, 244, 86], [560, 252, 80], [880, 242, 90], [1200, 250, 84], [1440, 248, 80]],
  [[120, 305, 90], [460, 300, 96], [820, 306, 92], [1160, 300, 96], [1440, 306, 90]],
]

export function Horizon({ variante, tonos, className = '', drift = false }: { variante?: Variante; tonos?: [string, string, string, string]; className?: string; drift?: boolean }) {
  const auto = useHorizonVariant()
  const v = variante ?? auto
  const fills = tonos ?? ['var(--layer-1)', 'var(--layer-2)', 'var(--layer-3)', 'var(--layer-4)']
  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      <svg viewBox="0 0 1440 320" preserveAspectRatio="none" className="block h-full w-full overflow-visible">
        {v === 'nubes'
          ? NUBES.map((fila, i) => (
              <g key={i} fill={fills[i]} className={drift && i === 1 ? 'deriva' : undefined}>
                {fila.map(([cx, cy, r], j) => (
                  <circle key={j} cx={cx} cy={cy} r={r} />
                ))}
                <rect x="-200" y={Math.max(...fila.map((c) => c[1]))} width="1840" height="320" />
              </g>
            ))
          : PATHS[v].map((d, i) => <path key={i} d={d} fill={fills[i]} className={drift && i === 1 ? 'deriva' : undefined} />)}
      </svg>
    </div>
  )
}

/** Tonos de horizonte para usar sobre una losa noche */
export const NIGHT_TONES: [string, string, string, string] = [
  'color-mix(in oklab, var(--night) 40%, var(--sky-2))',
  'color-mix(in oklab, var(--night) 58%, var(--sky-1))',
  'color-mix(in oklab, var(--night) 78%, var(--sky-1))',
  'var(--night)',
]

/** Tonos de horizonte que se funden con el papel (la capa frontal es papel) */
export const PAPER_TONES: [string, string, string, string] = [
  'color-mix(in oklab, var(--sky-4) 55%, var(--luz))',
  'color-mix(in oklab, var(--sky-4) 40%, var(--paper))',
  'color-mix(in oklab, var(--sky-4) 18%, var(--paper))',
  'var(--paper)',
]

// ── ✦ micro-ornamento ──
export function Sparkle({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-block leading-none ${className}`}>
      ✦
    </span>
  )
}

/** Estrellas (solo en losas noche, intensidad expresiva) */
export function Stars({ count = 22, seed = 7 }: { count?: number; seed?: number }) {
  const stars = useMemo(() => {
    let s = seed
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    return Array.from({ length: count }, () => ({ x: r() * 100, y: r() * 62, s: 1.5 + r() * 1.6, o: 0.25 + r() * 0.55 }))
  }, [count, seed])
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {stars.map((st, i) => (
        <span key={i} className="absolute rounded-full bg-luz" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, opacity: st.o }} />
      ))}
    </div>
  )
}

// ── Cargando: tres puntos de luz (nunca un spinner) ──
export function LightDots({ className = '' }: { className?: string }) {
  return (
    <span role="status" aria-label="Cargando" className={`light-dots inline-flex items-center gap-1 ${className}`}>
      <span />
      <span />
      <span />
    </span>
  )
}

// ── Losa noche: hero de los paneles (luz + estrellas + horizonte) ──
export function NightSlab({ children, className = '', stars = true, luz = true, horizon = true, luzSize = 'clamp(48px, 11vw, 150px)', luzClassName = 'absolute top-[3%] right-[5%] md:top-[12%] md:right-[7%]' }: { children: ReactNode; className?: string; stars?: boolean; luz?: boolean; horizon?: boolean; luzSize?: string; luzClassName?: string }) {
  return (
    <section
      className={`losa--noche grain relative isolate overflow-hidden rounded-[var(--r-slab)] ${className}`}
      style={{ background: 'linear-gradient(180deg, var(--night), color-mix(in oklab, var(--night) 72%, var(--sky-1)))' }}
    >
      {stars && <Stars />}
      {luz && <Luz size={luzSize} className={luzClassName} />}
      {horizon && <Horizon tonos={NIGHT_TONES} className="absolute inset-x-0 bottom-0 h-[38%] opacity-90" />}
      <div className="relative z-[2]">{children}</div>
    </section>
  )
}

// ── Cielo: bloque superior que se funde con el papel (onboarding / panel móvil) ──
export function SkyBlock({ height = 'clamp(150px, 26vh, 240px)', className = '', luzSize = 'clamp(64px, 18vw, 104px)', children }: { height?: string; className?: string; luzSize?: string; children?: ReactNode }) {
  return (
    <div className={`relative isolate overflow-hidden ${className}`} style={{ height }}>
      <div className="bg-cielo absolute inset-0" />
      <Luz size={luzSize} className="absolute top-[18%] left-1/2 -translate-x-1/2" />
      <Horizon variante="nubes" tonos={PAPER_TONES} drift className="absolute inset-x-0 bottom-[-2px] h-[62%]" />
      {children && <div className="relative z-[2] h-full">{children}</div>}
    </div>
  )
}

// ── Mini horizonte para estados vacíos ──
export function MiniHorizon({ size = 132 }: { size?: number }) {
  return (
    <div aria-hidden="true" className="relative mx-auto overflow-hidden" style={{ width: size, height: size * 0.72, borderRadius: 'var(--r-arch)' }}>
      <div className="bg-cielo-soft absolute inset-0" />
      <Luz size={size * 0.3} className="absolute top-[18%] left-1/2 -translate-x-1/2" />
      <Horizon className="absolute inset-x-0 bottom-0 h-[58%]" />
    </div>
  )
}

// ── Hilo: línea fina curva que conecta (cuerdas del globo) ──
export function Hilo({ d = 'M0 10 C 60 40, 140 -10, 200 20', className = '', width = 200, height = 40 }: { d?: string; className?: string; width?: number; height?: number }) {
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} className={className} fill="none">
      <path d={d} className="hilo" />
    </svg>
  )
}

// ── Cifra grande que cuenta hacia arriba ──
export function CountUp({ value, format = (n: number) => String(Math.round(n)), className = '' }: { value: number; format?: (n: number) => string; className?: string }) {
  const { ref, value: v } = useCountUp(value)
  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} className={`display-num ${className}`}>
      {format(v)}
    </span>
  )
}

// ── Contenedores con entrada escalonada (deriva) ──
export function Reveal({ children, className = '', as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'ul' }) {
  const reduce = useReducedMotion()
  const Comp = motion[as]
  return (
    <Comp variants={stagger} initial={reduce ? false : 'hidden'} animate="show" className={className}>
      {children}
    </Comp>
  )
}
export function RevealItem({ children, className = '', hero }: { children: ReactNode; className?: string; hero?: boolean }) {
  return (
    <motion.div variants={hero ? heroRise : fadeRise} className={className}>
      {children}
    </motion.div>
  )
}

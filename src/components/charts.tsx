// Gráficas SVG ligeras (sin librerías) con tooltip táctil.
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { Pastel } from '@/lib/types'
import { TONE } from '@/lib/meta'
import { compactMxn } from '@/lib/format'

export interface Series {
  key: string
  label: string
  tone: Pastel
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * p
}

function Tooltip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = Math.min(Math.max(x, 70), width - 70)
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[10px] bg-night px-3 py-2 text-xs text-on-night shadow-[var(--shadow-3)]" style={{ left, top: y - 8 }}>
      {children}
    </div>
  )
}

/** Barras apiladas. Con `onBarClick` cada barra se puede tocar (y `activeIndex` la marca como elegida). */
export function BarChart({ data, series, height = 220, format = compactMxn, stacked = true, onBarClick, activeIndex }: { data: (Record<string, number | string> & { label: string })[]; series: Series[]; height?: number; format?: (n: number) => string; stacked?: boolean; onBarClick?: (index: number) => void; activeIndex?: number | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = height
  const pad = { l: 44, r: 8, t: 12, b: 28 }
  const max = niceMax(
    Math.max(...data.map((d) => (stacked ? series.reduce((n, s) => n + Number(d[s.key] || 0), 0) : Math.max(...series.map((s) => Number(d[s.key] || 0))))), 0),
  )
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length)
  const barW = Math.min(36, bw * 0.56)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)

  return (
    <div ref={ref} className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + bw * i + bw / 2
          let acc = 0
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onClick={() => (onBarClick ? onBarClick(i) : setHover(i))} className={onBarClick ? 'cursor-pointer' : undefined} opacity={activeIndex != null && activeIndex !== i ? 0.45 : 1} style={{ transition: 'opacity .28s' }}>
              <rect x={pad.l + bw * i} y={pad.t} width={bw} height={H - pad.t - pad.b} fill={activeIndex === i ? 'color-mix(in oklab, var(--luz) 30%, transparent)' : hover === i ? 'var(--surface-2)' : 'transparent'} rx="8" />
              {series.map((s, si) => {
                const v = Number(d[s.key] || 0)
                if (stacked) {
                  const y0 = y(acc)
                  acc += v
                  const y1 = y(acc)
                  const isTop = si === series.length - 1 || series.slice(si + 1).every((x) => !Number(d[x.key]))
                  return (
                    <motion.rect key={s.key} x={cx - barW / 2} width={barW} rx={isTop ? 6 : 0} fill={TONE[s.tone].hex} initial={{ y: y(0), height: 0 }} animate={{ y: y1, height: Math.max(0, y0 - y1) }} transition={{ type: 'spring', stiffness: 120, damping: 20, delay: i * 0.03 }} />
                  )
                }
                const w = barW / series.length
                return <motion.rect key={s.key} x={cx - barW / 2 + w * si} width={w - 2} rx={4} fill={TONE[s.tone].hex} initial={{ y: y(0), height: 0 }} animate={{ y: y(v), height: Math.max(0, y(0) - y(v)) }} transition={{ type: 'spring', stiffness: 120, damping: 20, delay: i * 0.03 }} />
              })}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-3)" className="capitalize">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      {hover !== null && ref.current && (
        <Tooltip x={((pad.l + bw * hover + bw / 2) / W) * ref.current.clientWidth} y={(y(series.reduce((n, s) => n + Number(data[hover]![s.key] || 0), 0)) / H) * height} width={ref.current.clientWidth}>
          <div className="mb-1 font-bold capitalize">{data[hover]!.label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 whitespace-nowrap">
              <span className="h-2 w-2 rounded-full" style={{ background: TONE[s.tone].hex }} />
              <span className="text-on-night-soft">{s.label}</span>
              <span className="ml-auto pl-3 font-bold tabular">{format(Number(data[hover]![s.key] || 0))}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  )
}

export function AreaChart({ data, tone = 'lavender', height = 160, format = (n: number) => String(Math.round(n)), max: fixedMax }: { data: { label: string; value: number }[]; tone?: Pastel; height?: number; format?: (n: number) => string; max?: number }) {
  const id = useId().replace(/:/g, '')
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = height
  const pad = { l: 8, r: 8, t: 14, b: 24 }
  const max = fixedMax ?? niceMax(Math.max(...data.map((d) => d.value), 0))
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, data.length - 1)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const path = useMemo(() => {
    if (!data.length) return ''
    let d = `M ${x(0)} ${y(data[0]!.value)}`
    for (let i = 1; i < data.length; i++) {
      const x0 = x(i - 1)
      const x1 = x(i)
      const mx = (x0 + x1) / 2
      d += ` C ${mx} ${y(data[i - 1]!.value)}, ${mx} ${y(data[i]!.value)}, ${x1} ${y(data[i]!.value)}`
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, max])
  const hex = TONE[tone].hex
  return (
    <div ref={ref} className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        style={{ height }}
        preserveAspectRatio="none"
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1)))))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={hex} stopOpacity="0.45" />
            <stop offset="100%" stopColor={hex} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        {path && <motion.path d={`${path} L ${x(data.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={`url(#g${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
        {path && <motion.path d={path} fill="none" stroke={hex} strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} vectorEffect="non-scaling-stroke" />}
        {data.map((d, i) =>
          i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--ink-3)">
              {d.label}
            </text>
          ) : null,
        )}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke="var(--line-2)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={y(data[hover]!.value)} r="5" fill="var(--surface)" stroke={hex} strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {hover !== null && ref.current && (
        <Tooltip x={(x(hover) / W) * ref.current.clientWidth} y={(y(data[hover]!.value) / H) * height} width={ref.current.clientWidth}>
          <div className="font-bold">{format(data[hover]!.value)}</div>
          <div className="text-on-night-soft">{data[hover]!.label}</div>
        </Tooltip>
      )}
    </div>
  )
}

export function Donut({ segments, size = 148, thickness = 18, center }: { segments: { label: string; value: number; tone: Pastel }[]; size?: number; thickness?: number; center?: ReactNode }) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const frac = s.value / total
          const dash = Math.max(0, frac * c - 3)
          const off = -acc * c
          acc += frac
          return (
            <motion.circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE[s.tone].hex} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${dash} ${c}`} initial={{ strokeDashoffset: off + dash }} animate={{ strokeDashoffset: off }} transition={{ duration: 0.8, delay: i * 0.08, ease: 'easeOut' }} />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; tone: Pastel; value?: ReactNode }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: TONE[i.tone].hex }} />
          <span className="text-ink-2">{i.label}</span>
          {i.value !== undefined && <span className="ml-auto pl-4 font-bold tabular">{i.value}</span>}
        </div>
      ))}
    </div>
  )
}

/** Minigráfica de barras para indicadores (estilo Fintrack). Las últimas barras resaltan en el tono. */
export function Sparkline({ values, tone = 'lavender', height = 34, highlight = 1 }: { values: number[]; tone?: Pastel; height?: number; highlight?: number }) {
  const max = Math.max(...values, 1)
  const n = values.length
  return (
    <div aria-hidden className="flex items-end gap-[2px]" style={{ height }}>
      {values.map((v, i) => {
        const on = i >= n - highlight
        return (
          <span
            key={i}
            className="flex-1 rounded-[2px] transition-[height] duration-[var(--dur-4)]"
            style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: on ? TONE[tone].hex : 'color-mix(in oklab, var(--ink) 14%, transparent)', opacity: on ? 1 : 0.9 }}
          />
        )
      })}
    </div>
  )
}

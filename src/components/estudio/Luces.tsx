// Las luces de un evento: una serie de focos colgados de un cable, como en una fiesta en el jardín.
// Hay un foco por cada parte de su preparación (contrato, pagos, invitados, mesas, proveedores y orden de evento):
// brilla según lo que ya está hecho y toma el tono de su estado. Es la misma medida de toda la app («X de N listos»).
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import type { HealthPart, HealthState } from '@/lib/eventHealth'
import type { EventLights } from '@/lib/estudio'
import { cx } from '@/components/ui'

export const PART_LABEL: Record<HealthPart['key'], string> = { contrato: 'Contrato', pagos: 'Pagos', invitados: 'Invitados', mesas: 'Mesas', proveedores: 'Proveedores', beo: 'Orden de evento' }

/** Luz cálida si va bien, ámbar si va justo, brasa si está atrasado */
const TONE: Record<Exclude<HealthState, 'na'>, { core: string; edge: string }> = {
  ok: { core: 'color-mix(in oklab, var(--luz) 55%, white)', edge: 'var(--luz)' },
  warn: { core: 'color-mix(in oklab, var(--data-3) 55%, var(--luz))', edge: 'color-mix(in oklab, var(--data-3) 85%, var(--night))' },
  bad: { core: 'color-mix(in oklab, var(--chispa-soft) 72%, var(--luz))', edge: 'color-mix(in oklab, var(--chispa) 78%, var(--danger))' },
}

/** Qué tanto brilla un foco (0–1): los listos casi a tope, los justos tenues, los atrasados como brasa */
function glowOf(state: HealthState, progress: number) {
  const p = Math.max(0, Math.min(1, progress))
  if (state === 'ok') return 0.74 + 0.26 * p
  if (state === 'warn') return 0.28 + 0.34 * p
  if (state === 'bad') return 0.6
  return 0
}

const GLASS = 'M-6 17 C-6 23 -14 27 -14 36 A14 14 0 1 0 14 36 C14 27 6 23 6 17 Z'
const FILAMENT = 'M-3 18 L-4.5 33 Q-3 29 -1.5 33 Q0 37 1.5 33 Q3 29 4.5 33 L3 18'

function Foco({ part, x, y, s, glow, on, index, delay, gid, dim, lift, reduce }: { part: HealthPart; x: number; y: number; s: number; glow: number; on: boolean; index: number; delay: number; gid: string; dim: boolean; lift: boolean; reduce: boolean }) {
  const lit = part.state !== 'na'
  const fade = reduce ? undefined : `opacity 1000ms var(--ease-calma) ${delay + index * 110}ms`
  return (
    <g transform={`translate(${x} ${y})`} style={{ opacity: dim ? 0.42 : 1, transition: 'opacity 280ms var(--ease-calma)' }}>
      <g className="foco" style={{ animationDuration: `${5.2 + (index % 3) * 0.9}s`, animationDelay: `${-index * 0.8}s` }}>
        <g transform={`scale(${lift ? s * 1.08 : s})`} style={{ transition: 'transform 280ms var(--ease-calma)' }}>
          {lit && <circle cx="0" cy="36" r="50" fill={`url(#${gid}-halo-${part.state})`} style={{ opacity: on ? glow : 0, transition: fade }} />}
          <line x1="0" y1="0" x2="0" y2="7" stroke="color-mix(in oklab, var(--on-night) 42%, transparent)" strokeWidth="1.4" />
          <rect x="-5.5" y="6" width="11" height="12" rx="2" fill="color-mix(in oklab, var(--on-night) 34%, var(--night))" />
          <path d="M-5.5 10 H5.5 M-5.5 13.5 H5.5" stroke="var(--night)" strokeWidth="0.8" opacity="0.6" />
          <path d={GLASS} fill="color-mix(in oklab, var(--on-night) 9%, transparent)" stroke="color-mix(in oklab, var(--on-night) 34%, transparent)" strokeWidth="1" />
          {lit && <path d={GLASS} fill={`url(#${gid}-glass-${part.state})`} style={{ opacity: on ? glow : 0, transition: fade }} />}
          <path d={FILAMENT} fill="none" stroke={lit && on && glow > 0.5 ? 'color-mix(in oklab, white 70%, var(--luz))' : 'color-mix(in oklab, var(--on-night) 42%, transparent)'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 800ms var(--ease-calma)' }} />
          <ellipse cx="-7" cy="31" rx="2.2" ry="5" fill="white" opacity="0.2" transform="rotate(16 -7 31)" />
        </g>
      </g>
    </g>
  )
}

/** Una o varias series de focos. `grande` lleva el nombre y la nota debajo de cada foco, y se puede tocar. */
export function Luces({ lights, grande, perRow, active, onPart, onHover, delay = 0, className }: {
  lights: EventLights
  grande?: boolean
  /** Focos por cable (en el celular se reparten en dos cables para que quepan los nombres) */
  perRow?: number
  active?: HealthPart['key'] | null
  onPart?: (key: HealthPart['key']) => void
  onHover?: (key: HealthPart['key'] | null) => void
  /** Retraso del encendido: en la temporada se prenden en secuencia */
  delay?: number
  className?: string
}) {
  const gid = useId().replace(/:/g, '')
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const reduce = !!useReducedMotion()
  const [on, setOn] = useState(reduce)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (reduce) return
    const id = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(id)
  }, [reduce])

  const parts = lights.health
  const per = perRow ?? parts.length
  const rows: HealthPart[][] = []
  for (let i = 0; i < parts.length; i += per) rows.push(parts.slice(i, i + per))
  const interactive = !!onPart
  const keyDown = (e: KeyboardEvent, key: HealthPart['key']) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPart?.(key)
    }
  }

  return (
    <div ref={box} className={cx('w-full min-w-0', className)} role={interactive ? 'group' : 'img'} aria-label={`Preparación: ${lights.score.label}. ${parts.filter((p) => p.state !== 'na').map((p) => `${PART_LABEL[p.key]}: ${p.note}`).join('. ')}`}>
      {w > 0 &&
        rows.map((row, r) => {
          const n = row.length
          const cell = w / n
          const s = grande ? Math.min(1.5, cell / 66) : Math.min(0.66, cell / 40)
          const sag = grande ? Math.max(10, Math.min(30, w * 0.028)) : Math.max(6, Math.min(16, w * 0.07))
          const top = 5
          const h = top + sag + 52 * s + (grande ? 6 : 8)
          return (
            <Fragment key={r}>
              <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block overflow-visible" aria-hidden>
                <defs>
                  {(['ok', 'warn', 'bad'] as const).map((st) => (
                    <Fragment key={st}>
                      <radialGradient id={`${gid}-glass-${st}`} cx="0" cy="36" r="17" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" style={{ stopColor: TONE[st].core }} />
                        <stop offset="100%" style={{ stopColor: TONE[st].edge }} />
                      </radialGradient>
                      <radialGradient id={`${gid}-halo-${st}`} cx="0" cy="36" r="50" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" style={{ stopColor: TONE[st].edge, stopOpacity: 0.62 }} />
                        <stop offset="45%" style={{ stopColor: TONE[st].edge, stopOpacity: 0.16 }} />
                        <stop offset="100%" style={{ stopColor: TONE[st].edge, stopOpacity: 0 }} />
                      </radialGradient>
                    </Fragment>
                  ))}
                </defs>
                <path d={`M0 ${top} Q ${w / 2} ${top + sag * 2} ${w} ${top}`} fill="none" stroke="color-mix(in oklab, var(--on-night) 40%, transparent)" strokeWidth="1.3" />
                {!grande && (
                  <>
                    <circle cx="0" cy={top} r="2.2" fill="color-mix(in oklab, var(--on-night) 55%, transparent)" />
                    <circle cx={w} cy={top} r="2.2" fill="color-mix(in oklab, var(--on-night) 55%, transparent)" />
                  </>
                )}
                {row.map((part, i) => {
                  const t = (i + 0.5) / n
                  const y = top + 4 * sag * t * (1 - t)
                  const isActive = active === part.key
                  return (
                    <g
                      key={part.key}
                      role={interactive ? 'button' : undefined}
                      tabIndex={interactive ? 0 : undefined}
                      aria-label={interactive ? `${PART_LABEL[part.key]}: ${part.note}` : undefined}
                      aria-pressed={interactive ? isActive : undefined}
                      className={cx(interactive && 'cursor-pointer outline-none')}
                      onClick={interactive ? () => onPart?.(part.key) : undefined}
                      onKeyDown={interactive ? (e) => keyDown(e, part.key) : undefined}
                      onPointerEnter={onHover ? () => onHover(part.key) : undefined}
                      onPointerLeave={onHover ? () => onHover(null) : undefined}
                    >
                      {interactive && <rect x={t * w - cell / 2} y="0" width={cell} height={h} fill="transparent" />}
                      <Foco part={part} x={t * w} y={y} s={s} glow={glowOf(part.state, lights.progress[part.key] ?? 0)} on={on} index={r * per + i} delay={delay} gid={gid} dim={!!active && !isActive} lift={isActive} reduce={reduce} />
                    </g>
                  )
                })}
              </svg>
              {grande && (
                <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                  {row.map((part) => (
                    <button key={part.key} onClick={() => onPart?.(part.key)} onPointerEnter={onHover ? () => onHover(part.key) : undefined} onPointerLeave={onHover ? () => onHover(null) : undefined} tabIndex={-1} className={cx('min-w-0 rounded-[10px] px-1 pt-1 pb-1.5 text-center leading-tight transition-opacity duration-[var(--dur-3)]', active && active !== part.key && 'opacity-45')}>
                      <span className={cx('block text-[13px] font-medium', part.state === 'na' ? 'text-on-night-soft' : 'text-on-night')}>{PART_LABEL[part.key]}</span>
                      <span className={cx('mt-0.5 block text-[12px]', part.state === 'bad' ? '[color:color-mix(in_oklab,var(--danger)_40%,var(--on-night))]' : 'text-on-night-soft')}>{part.note}</span>
                    </button>
                  ))}
                </div>
              )}
              {grande && r < rows.length - 1 && <div className="h-3" />}
            </Fragment>
          )
        })}
    </div>
  )
}

/** La serie en miniatura: para renglones y listas */
export function LucesMini({ lights, className }: { lights: EventLights; className?: string }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-[4px] rounded-full bg-night px-[7px] py-[5px]', className)} role="img" aria-label={lights.score.label}>
      {lights.health.map((p) => {
        const glow = glowOf(p.state, lights.progress[p.key] ?? 0)
        if (p.state === 'na') return <span key={p.key} className="h-[6px] w-[6px] rounded-full bg-[color-mix(in_oklab,var(--on-night)_16%,transparent)]" />
        const tone = TONE[p.state].edge
        return <span key={p.key} className="h-[6px] w-[6px] rounded-full" style={{ background: tone, opacity: Math.max(0.42, glow), boxShadow: glow > 0.5 ? `0 0 6px ${tone}` : undefined }} />
      })}
    </span>
  )
}

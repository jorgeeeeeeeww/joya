// Barra de salud de un evento: un segmento por cada parte que el evento usa.
// Es la misma en el panel de la planner, en la lista de eventos y en el detalle.
import type { HealthPart, HealthState } from '@/lib/eventHealth'
import { cx } from '@/components/ui'

/** Colores sobre la losa noche */
export const HEALTH_NIGHT: Record<HealthState, string> = {
  ok: 'color-mix(in oklab, var(--success) 45%, var(--on-night))',
  warn: 'color-mix(in oklab, var(--warning) 55%, var(--on-night))',
  bad: 'color-mix(in oklab, var(--danger) 55%, var(--on-night))',
  na: 'color-mix(in oklab, var(--on-night) 22%, transparent)',
}
/** Colores sobre papel */
export const HEALTH_DAY: Record<HealthState, string> = { ok: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)', na: 'var(--line-strong)' }

export function HealthBar({ health, night, className }: { health: HealthPart[]; night?: boolean; className?: string }) {
  const parts = health.filter((h) => h.state !== 'na')
  return (
    <span className={cx('flex gap-[3px]', className)} aria-hidden>
      {parts.map((p) => (
        <span key={p.key} className="h-[5px] flex-1 rounded-full" style={{ background: (night ? HEALTH_NIGHT : HEALTH_DAY)[p.state] }} />
      ))}
    </span>
  )
}

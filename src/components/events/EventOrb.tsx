// Icono de línea del tipo de evento dentro de un orbe de luz o de un icono-tile tintado.
import type { EventType } from '@/lib/types'
import { EVENT_TYPE, TONE } from '@/lib/meta'
import { cx } from '@/components/ui'

export function EventOrb({ type, size = 'md', orb, className }: { type: EventType; size?: 'sm' | 'md' | 'lg' | 'xl'; orb?: boolean; className?: string }) {
  const meta = EVENT_TYPE[type]
  const Icon = meta.icon
  const t = TONE[meta.tone]
  const dims = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14', xl: 'h-[72px] w-[72px]' }[size]
  const icon = { sm: 16, md: 19, lg: 24, xl: 30 }[size]
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center',
        dims,
        orb ? 'rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[5px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]' : [t.soft, t.ink, size === 'sm' ? 'rounded-[10px]' : size === 'xl' ? 'rounded-[22px]' : 'rounded-[14px]'],
        className,
      )}
    >
      <Icon size={icon} strokeWidth={1.6} />
    </span>
  )
}

/** Fila de orbes de la paleta de la clienta */
export function PaletteDots({ colors, size = 22, className }: { colors?: string[]; size?: number; className?: string }) {
  if (!colors?.length) return null
  return (
    <span className={cx('inline-flex items-center', className)} aria-label={`Paleta: ${colors.join(', ')}`}>
      {colors.slice(0, 6).map((c, i) => (
        <span key={i} className="rounded-full ring-2 ring-surface" style={{ width: size, height: size, background: c, marginLeft: i ? -size * 0.28 : 0 }} />
      ))}
    </span>
  )
}

// step1 · componentes base (Rediseño La Joya). Solo tokens: sin colores hex.
import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type RefObject, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'
import { clsx } from 'clsx'
import { X, AlertTriangle, MoreHorizontal, RotateCcw } from 'lucide-react'
import type { Pastel } from '@/lib/types'
import { TONE } from '@/lib/meta'
import { initials } from '@/lib/format'
import { ease, haptic, modal, spring } from '@/lib/motion'
import { LightDots, Sparkle } from './step1'
import { Vignette, type VignetteKind } from './scenes'

export const cx = clsx

// ── Capas (hojas, menús, calendarios) ────────────────────
// Escape cierra solo la capa de arriba: un calendario abierto dentro de una hoja no cierra la hoja.
const layerStack: { close: () => void }[] = []
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !layerStack.length) return
    e.preventDefault()
    layerStack[layerStack.length - 1]!.close()
  })
}
export function useLayer(open: boolean, onClose: () => void) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!open) return
    const entry = { close: () => ref.current() }
    layerStack.push(entry)
    return () => {
      const i = layerStack.indexOf(entry)
      if (i >= 0) layerStack.splice(i, 1)
    }
  }, [open])
}

// ── Botón (pill, 48 px) ──────────────────────────────────
type ButtonVariant = 'primary' | 'tinta' | 'chispa' | 'luz' | 'secondary' | 'soft' | 'ghost' | 'outline' | 'danger'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'
  tone?: Pastel
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', tone = 'lavender', icon, iconRight, loading, className, children, disabled, onClick, ...rest },
  ref,
) {
  const t = TONE[tone]
  const raised = variant === 'primary' || variant === 'tinta' || variant === 'chispa' || variant === 'luz'
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (raised) haptic.light()
        onClick?.(e)
      }}
      className={cx(
        'group/btn relative inline-flex select-none items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap tracking-[-.005em]',
        'transition-[transform,box-shadow,background-color,color] duration-[var(--dur-2)] ease-[var(--ease-calma)] active:scale-[.98] active:duration-[var(--dur-1)]',
        'disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none',
        raised && 'shadow-[inset_0_1px_0_color-mix(in_oklab,white_14%,transparent),var(--shadow-1)] hover:-translate-y-px hover:shadow-[inset_0_1px_0_color-mix(in_oklab,white_14%,transparent),var(--shadow-2)]',
        size === 'sm' && 'h-10 px-4 text-sm pointer-fine:h-8 pointer-fine:px-3 pointer-fine:text-[13px]',
        size === 'md' && 'h-11 px-5 text-[15px] pointer-fine:h-10 pointer-fine:px-4 pointer-fine:text-sm',
        size === 'lg' && 'h-13 px-6 text-base pointer-fine:h-12',
        size === 'icon' && 'h-11 w-11 pointer-fine:h-10 pointer-fine:w-10',
        size === 'icon-sm' && 'h-9 w-9 pointer-fine:h-8 pointer-fine:w-8',
        variant === 'primary' && 'bg-primary text-on-primary hover:bg-primary-hover',
        variant === 'tinta' && 'bg-ink text-paper hover:bg-[color-mix(in_oklab,var(--ink)_90%,var(--paper))]',
        variant === 'chispa' && 'bg-chispa text-on-chispa hover:bg-[color-mix(in_oklab,var(--chispa)_90%,var(--ink))]',
        variant === 'luz' && 'bg-luz text-night shadow-glow',
        variant === 'secondary' && 'bg-secondary text-ink hover:bg-[color-mix(in_oklab,var(--secondary)_88%,var(--ink))]',
        variant === 'soft' && [t.soft, t.ink, 'hover:bg-[color-mix(in_oklab,currentColor_14%,var(--surface))]'],
        variant === 'ghost' && 'text-ink-soft hover:bg-wash hover:text-ink',
        variant === 'outline' && 'text-ink ring-1 ring-line-strong ring-inset hover:bg-wash',
        variant === 'danger' && 'bg-[color-mix(in_oklab,var(--danger)_13%,var(--surface))] text-danger hover:bg-[color-mix(in_oklab,var(--danger)_20%,var(--surface))]',
        className,
      )}
      {...rest}
    >
      <span className={cx('inline-flex items-center gap-2 transition-opacity duration-[var(--dur-2)]', loading && 'opacity-0')}>
        {icon}
        {children}
        {iconRight && <span className="transition-transform duration-[var(--dur-2)] group-hover/btn:translate-x-[3px]">{iconRight}</span>}
      </span>
      {loading && <LightDots className="absolute" />}
    </button>
  )
})

// ── Tarjeta (radio 22) ───────────────────────────────────
export function Card({ className, children, onClick, as = 'div' }: { className?: string; children: ReactNode; onClick?: () => void; as?: 'div' | 'button' | 'section' | 'article' }) {
  const Comp = as as any
  return (
    <Comp onClick={onClick} className={cx('card', onClick && 'lift pressable cursor-pointer text-left', className)}>
      {children}
    </Comp>
  )
}

export function CardHeader({ title, subtitle, action, icon, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode; eyebrow?: ReactNode }) {
  return (
    // Si la acción no cabe junto al título baja a su propio renglón, en vez de aplastar el título
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5">
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-2.5">
        {icon}
        <div className="min-w-0">
          {eyebrow && <div className="kicker mb-0.5">{eyebrow}</div>}
          <h3 className="truncate text-[length:var(--fs-title)] leading-tight font-semibold tracking-[-0.012em]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

// ── Badge / punto / icono-tile ───────────────────────────
export function Badge({ tone = 'lavender', children, className, dot, sparkle }: { tone?: Pastel; children: ReactNode; className?: string; dot?: boolean; sparkle?: boolean }) {
  const t = TONE[tone]
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap', t.soft, t.ink, className)}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', t.solid)} />}
      {sparkle && <Sparkle className="text-[10px]" />}
      {children}
    </span>
  )
}

export function Dot({ tone, pulse, className }: { tone: Pastel; pulse?: boolean; className?: string }) {
  return <span className={cx('relative inline-block h-2.5 w-2.5 shrink-0 rounded-full', TONE[tone].solid, pulse && 'pulse-dot', className)} style={pulse ? { color: TONE[tone].hex } : undefined} />
}

/** Icono-tile tintado (radio 12) u orbe de luz */
export function IconBubble({ tone, children, size = 'md', orb }: { tone: Pastel; children: ReactNode; size?: 'sm' | 'md' | 'lg'; orb?: boolean }) {
  const t = TONE[tone]
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center',
        orb ? 'rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[5px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]' : [t.soft, t.ink],
        size === 'sm' && (orb ? 'h-8 w-8' : 'h-8 w-8 rounded-[10px]'),
        size === 'md' && (orb ? 'h-11 w-11' : 'h-10 w-10 rounded-xl'),
        size === 'lg' && (orb ? 'h-14 w-14' : 'h-14 w-14 rounded-[18px]'),
      )}
    >
      {children}
    </span>
  )
}

// ── Avatar (anillo surface + línea, iniciales en display) ──
export function Avatar({ name, tone = 'lavender', size = 36, className }: { name: string; tone?: Pastel; size?: number; className?: string }) {
  const t = TONE[tone]
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-display)] ring-2 ring-surface outline outline-1 outline-line', t.soft, t.ink, className)}
      style={{ width: size, height: size, fontSize: size * 0.4, fontVariationSettings: '"SOFT" 100, "WONK" 0', fontWeight: 420 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

// ── Formularios (48 px, radio 14) ────────────────────────
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-danger" role="alert">
          <AlertTriangle size={13} /> {error}
        </span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-ink-soft">{hint}</span>
      )}
    </label>
  )
}

const inputCls =
  'w-full h-11 pointer-fine:h-10 rounded-[var(--r-md)] border border-line-strong bg-surface px-3.5 text-base pointer-fine:text-sm outline-none placeholder:text-ink-faint transition-[border-color,box-shadow,background-color] duration-[var(--dur-2)] ease-[var(--ease-calma)] hover:border-[color-mix(in_oklab,var(--ink)_35%,transparent)] focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_16%,transparent),0_0_22px_color-mix(in_oklab,var(--luz)_45%,transparent)] disabled:opacity-55 aria-[invalid=true]:border-danger'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cx(inputCls, 'appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'h-auto min-h-[96px] py-3 leading-relaxed', className)} {...rest} />
}

/** Toggle: pista 52×32 sunken; encendido = primario con glow de luz */
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          {label && <span className="block font-medium">{label}</span>}
          {description && <span className="mt-0.5 block text-sm text-ink-soft">{description}</span>}
        </label>
      )}
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => {
          haptic.select()
          onChange(!checked)
        }}
        className={cx('relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-[var(--dur-4)] ease-[var(--ease-calma)]', checked ? 'bg-primary' : 'bg-sunken ring-1 ring-line ring-inset')}
      >
        <motion.span
          animate={{ x: checked ? 22 : 0 }}
          transition={{ duration: 0.48, ease: ease.calma }}
          className={cx('absolute top-1 left-1 h-6 w-6 rounded-full', checked ? 'bg-on-primary shadow-[0_0_14px_color-mix(in_oklab,var(--luz)_70%,transparent)]' : 'bg-surface shadow-[var(--shadow-1)]')}
        />
      </button>
    </div>
  )
}

// ── Segmentado (thumb primario que se desliza) ───────────
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  const id = useId()
  return (
    <div className={cx('inline-flex rounded-full bg-sunken p-[3px] ring-1 ring-line ring-inset', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => {
            haptic.select()
            onChange(o.value)
          }}
          className={cx('relative flex-1 rounded-full font-medium whitespace-nowrap transition-colors duration-[var(--dur-3)]', size === 'sm' ? 'h-8 px-3 text-[12.5px] pointer-fine:h-7' : 'h-10 px-4 text-[13.5px] pointer-fine:h-8 pointer-fine:px-3.5 pointer-fine:text-[13px]', value === o.value ? 'text-ink' : 'text-ink-soft hover:text-ink')}
        >
          {value === o.value && <motion.span layoutId={id} className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-1)] ring-1 ring-line" transition={spring.suave} />}
          <span className="relative z-10 inline-flex items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Chips de filtro (activo = tinta) ─────────────────────
export function Chip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; tone?: Pastel; count?: number }) {
  return (
    <button
      onClick={() => {
        haptic.select()
        onClick?.()
      }}
      className={cx(
        'pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap pointer-fine:h-8',
        active ? 'bg-ink text-paper' : 'text-ink-soft ring-1 ring-line-strong ring-inset hover:bg-wash hover:text-ink',
      )}
    >
      {children}
      {count !== undefined && <span className={cx('tabular text-xs', active ? 'opacity-70' : 'text-ink-3')}>{count}</span>}
    </button>
  )
}

// ── Progreso ─────────────────────────────────────────────
export function ProgressRing({ value, size = 44, stroke = 4, tone = 'sage', children, gradient }: { value: number; size?: number; stroke?: number; tone?: Pastel; children?: ReactNode; gradient?: boolean }) {
  const gid = useId().replace(/:/g, '')
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {gradient && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--sky-3)" />
              <stop offset="100%" stopColor="var(--chispa-soft)" />
            </linearGradient>
          </defs>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={gradient ? `url(#${gid})` : TONE[tone].hex} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - v) }} transition={{ duration: 0.48, ease: ease.calma }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular">{children ?? `${Math.round(v * 100)}%`}</span>
    </span>
  )
}

/** Barra de 8 px: pista sunken; relleno en degradado cielo → brasa (o tono) */
export function ProgressBar({ value, tone, className }: { value: number; tone?: Pastel; className?: string }) {
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-sunken', className)}>
      <motion.div
        className={cx('h-full rounded-full', tone && TONE[tone].solid)}
        style={tone ? undefined : { backgroundImage: 'linear-gradient(90deg, var(--sky-3), var(--chispa-soft))' }}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ duration: 0.48, ease: ease.calma }}
      />
    </div>
  )
}

// ── KPI ──────────────────────────────────────────────────
export function Stat({ label, value, sub, tone = 'lavender', icon, onClick, accent, delta, spark }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Pastel; icon?: ReactNode; onClick?: () => void; accent?: boolean; delta?: { value: string; good: boolean }; spark?: ReactNode }) {
  const t = TONE[tone]
  return (
    <Card className="flex flex-col p-4 md:p-5" onClick={onClick} as={onClick ? 'button' : 'div'}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-[length:var(--fs-ui)] font-medium text-ink-soft">
          {icon && <span className={cx('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5', t.soft, t.ink)}>{icon}</span>}
          <span className="truncate">{label}</span>
        </span>
        {delta && (
          <span className={cx('inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-semibold tabular ring-1 ring-inset', delta.good ? 'text-success ring-[color-mix(in_oklab,var(--success)_30%,transparent)]' : 'text-danger ring-[color-mix(in_oklab,var(--danger)_30%,transparent)]')}>
            {delta.good ? '↑' : '↓'} {delta.value.replace(/^[+-]/, '')}
          </span>
        )}
      </div>
      <div className={cx('display-num mt-3 text-[length:var(--fs-kpi)] leading-none', accent && 'text-chispa')}>{value}</div>
      {sub && <div className="mt-1.5 text-[length:var(--fs-meta)] leading-snug text-ink-3">{sub}</div>}
      {spark && <div className="mt-3">{spark}</div>}
    </Card>
  )
}

// ── Estado vacío: mini horizonte con luz + frase + CTA ───
export function Empty({ title, body, action, icon, kind }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode; /** Dibujo de lo que falta (evento, reserva, invitados…) */ kind?: VignetteKind }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && false}
      <Vignette kind={kind} />
      <p className="mt-5 text-lg font-medium">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ── Encabezado de página ─────────────────────────────────
/** Acción principal de la vista: botón en escritorio y botón flotante (+) en el celular */
export interface PageAction {
  label: string
  icon?: ReactNode
  onClick: () => void
}

/**
 * Una sola acción principal por vista (`primary`) y lo demás en el menú "…" (`menu`).
 * `actions` queda para controles propios de la página (filtros, segmentados).
 */
export function PageHeader({ title, subtitle, actions, eyebrow, primary, menu, fab = true }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; primary?: PageAction; menu?: MenuItem[]; fab?: boolean }) {
  const hasMenu = !!menu?.some((m) => !m.hidden)
  return (
    <div className="relative mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className={cx('min-w-0', hasMenu && 'max-md:pr-12')}>
        {eyebrow && (
          <div className="eyebrow mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-chispa-soft shadow-[0_0_10px_var(--luz)]" />
            {eyebrow}
          </div>
        )}
        <h1 className="heading text-[clamp(1.75rem,1.45rem+1.1vw,2.35rem)]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[62ch] text-[length:var(--fs-body)] text-ink-soft">{subtitle}</p>}
      </div>
      {(actions || hasMenu || primary) && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {/* En el celular, "más acciones" va en la esquina, junto al título (no en un renglón solo) */}
          {hasMenu && <OverflowMenu items={menu!} className="max-md:absolute max-md:-top-1 max-md:right-0" />}
          {primary && (
            <Button data-tour="primary-action" icon={primary.icon} onClick={primary.onClick} className={cx(fab && 'max-md:hidden')}>
              {primary.label}
            </Button>
          )}
        </div>
      )}
      {primary && fab && <Fab label={primary.label} icon={primary.icon} onClick={primary.onClick} />}
    </div>
  )
}

/** Separador que se desvanece en los extremos */
export function Estela({ className }: { className?: string }) {
  return <hr className={cx('estela', className)} />
}

// ── Sheet: hoja inferior (móvil) · panel lateral · diálogo ──
export function Sheet({ open, onClose, title, subtitle, children, footer, side = 'right', wide }: { open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; side?: 'right' | 'center'; wide?: boolean }) {
  const isMobile = useMedia('(max-width: 767px)')
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  useLayer(open, onClose)
  // Solo depende de `open`: si el padre se vuelve a dibujar no se pierde el foco del campo en el que se escribe
  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => {
      if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus()
    }, 50)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prev
      lastFocus.current?.focus?.()
    }
  }, [open])

  const variants = isMobile
    ? { initial: { y: '100%' }, animate: { y: 0, transition: spring.suave }, exit: { y: '100%', transition: { duration: 0.26, ease: ease.salida } } }
    : side === 'center'
      ? modal
      : { initial: { x: '104%' }, animate: { x: 0, transition: spring.suave }, exit: { x: '104%', transition: { duration: 0.24, ease: ease.salida } } }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cx('fixed inset-0 z-50', !isMobile && side === 'center' && 'flex items-center justify-center p-6')} role="dialog" aria-modal="true">
          <motion.div className="absolute inset-0 bg-[color-mix(in_oklab,var(--ink)_35%,transparent)] backdrop-blur-[6px]" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.28 } }} exit={{ opacity: 0, transition: { duration: 0.2 } }} onClick={onClose} />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            {...variants}
            drag={isMobile ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 140 || info.velocity.y > 800) onClose()
            }}
            className={cx(
              'flex flex-col bg-surface shadow-[var(--shadow-3)] outline-none',
              isMobile && 'absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px] pb-safe',
              !isMobile && side === 'right' && cx('absolute inset-y-3 right-3 rounded-[var(--r-lg)] ring-1 ring-line', wide ? 'w-[min(780px,calc(100vw-24px))]' : 'w-[min(500px,calc(100vw-24px))]'),
              !isMobile && side === 'center' && cx('relative max-h-[88dvh] rounded-[var(--r-lg)] ring-1 ring-line', wide ? 'w-[min(880px,100%)]' : 'w-[min(480px,100%)]'),
            )}
          >
            {isMobile && <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line-strong" />}
            {(title || subtitle) && (
              <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-5 pb-3 md:px-7 md:pt-7">
                <div className="min-w-0">
                  {title && <h2 className="heading text-[1.65rem]">{title}</h2>}
                  {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar" className="-mt-1 -mr-2">
                  <X size={20} strokeWidth={1.6} />
                </Button>
              </div>
            )}
            <div className="scroll-area @container min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-6 md:px-7">{children}</div>
            {footer && <div className="shrink-0 border-t border-line px-6 py-3.5 md:px-7">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirmar', danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: string; confirmLabel?: string; danger?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} side="center">
      {body && <p className="text-ink-soft">{body}</p>}
      <div className="mt-7 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}

// ── Toasts: noche, ✦ en luz, abajo ───────────────────────
interface ToastItem {
  id: number
  title: string
  body?: string
  tone: 'success' | 'error' | 'info'
  /** Botón dentro del aviso (p. ej. "Deshacer") */
  action?: { label: string; onClick: () => void }
  duration: number
}
const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random()
    const duration = t.duration ?? (t.action ? 6000 : 4000)
    set((s) => ({ items: [...s.items.slice(-2), { ...t, id, duration }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), duration)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}))

export const toast = {
  success: (title: string, body?: string) => {
    haptic.success()
    useToasts.getState().push({ title, body, tone: 'success' })
  },
  error: (title: string, body?: string) => {
    haptic.warning()
    useToasts.getState().push({ title, body, tone: 'error' })
  },
  info: (title: string, body?: string) => useToasts.getState().push({ title, body, tone: 'info' }),
  /** Aviso con botón "Deshacer" (6 s): en lugar de preguntar "¿seguro?" antes de borrar */
  undo: (title: string, undo: () => void, body?: string) => {
    haptic.light()
    useToasts.getState().push({ title, body, tone: 'info', action: { label: 'Deshacer', onClick: undo } })
  },
  /** Aviso con un botón propio */
  action: (title: string, action: { label: string; onClick: () => void }, body?: string) => useToasts.getState().push({ title, body, tone: 'info', action }),
}

export function Toaster() {
  const items = useToasts((s) => s.items)
  const dismiss = useToasts((s) => s.dismiss)
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:right-6 md:bottom-6 md:left-auto md:items-end">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            role={t.tone === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.22, ease: ease.salida } }}
            className="pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-[14px] bg-night py-3 pr-2 pl-4 text-left text-on-night shadow-[var(--shadow-3)]"
          >
            <button onClick={() => dismiss(t.id)} className="flex min-w-0 flex-1 items-start gap-3 py-0.5 text-left">
              {t.tone === 'error' ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-chispa-soft" /> : <Sparkle className="mt-0.5 shrink-0 text-luz" />}
              <span className="min-w-0">
                <span className="block font-medium">{t.title}</span>
                {t.body && <span className="block text-sm text-on-night-soft">{t.body}</span>}
              </span>
            </button>
            {t.action && (
              <button
                onClick={() => {
                  haptic.select()
                  t.action!.onClick()
                  dismiss(t.id)
                }}
                className="pressable inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-luz hover:bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)]"
              >
                {t.action.label === 'Deshacer' && <RotateCcw size={15} strokeWidth={1.8} />}
                {t.action.label}
              </button>
            )}
            {t.action && <motion.span aria-hidden className="absolute bottom-0 left-0 h-[2px] bg-luz/70" initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: t.duration / 1000, ease: 'linear' }} />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const h = () => setMatch(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [query])
  return match
}

// ── Palomita que se dibuja sola ──────────────────────────
export function CheckDraw({ size = 18, className, delay = 0, strokeWidth = 2.2 }: { size?: number; className?: string; delay?: number; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path d="M5 12.5l4.2 4.2L19 7" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.42, ease: ease.calma, delay }} />
    </svg>
  )
}

// ── Popover: anclado en escritorio, hoja inferior en el celular ──
export type PopoverAnchor = RefObject<HTMLElement | null> | { x: number; y: number }

/**
 * Panel flotante para calendarios, horas, buscadores y menús.
 * En escritorio se ancla al elemento (o a un punto) y se voltea si no cabe; en el celular sube como hoja.
 */
export function Popover({ open, onClose, anchor, children, title, width = 320, align = 'start', className, mobile = 'sheet', label, footer }: { open: boolean; onClose: () => void; anchor: PopoverAnchor; children: ReactNode; title?: ReactNode; width?: number | 'anchor'; align?: 'start' | 'end'; className?: string; mobile?: 'sheet' | 'popover'; label?: string; footer?: ReactNode }) {
  const isMobile = useMedia('(max-width: 767px)')
  const asSheet = isMobile && mobile === 'sheet'
  const panelRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef(anchor)
  anchorRef.current = anchor
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null)
  useLayer(open, onClose)

  useLayoutEffect(() => {
    if (!open || asSheet) return
    const place = () => {
      const a = anchorRef.current
      const rect = 'current' in a ? a.current?.getBoundingClientRect() : new DOMRect(a.x, a.y, 0, 0)
      if (!rect) return
      const w = Math.min(width === 'anchor' ? Math.max(rect.width, 260) : width, innerWidth - 16)
      const h = panelRef.current?.offsetHeight ?? 320
      const below = innerHeight - rect.bottom - 8
      const above = rect.top - 8
      const up = below < Math.min(h, 360) && above > below
      const top = up ? Math.max(8, rect.top - h - 6) : rect.bottom + 6
      const left = Math.min(Math.max(8, align === 'end' ? rect.right - w : rect.left), innerWidth - w - 8)
      setPos((p) => (p && p.top === top && p.left === left && p.width === w && p.up === up ? p : { top, left, width: w, up }))
    }
    place()
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, asSheet, width, align])

  // Tocar fuera cierra (el ancla no cuenta: así el mismo botón abre y cierra)
  useEffect(() => {
    if (!open || asSheet) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      const a = anchorRef.current
      if ('current' in a && a.current?.contains(t)) return
      closeRef.current()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, asSheet])

  useEffect(() => {
    if (!open) setPos(null)
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open &&
        (asSheet ? (
          <div key="sheet" className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={label}>
            <motion.div className="absolute inset-0 bg-[color-mix(in_oklab,var(--ink)_32%,transparent)] backdrop-blur-[4px]" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.24 } }} exit={{ opacity: 0, transition: { duration: 0.18 } }} onClick={onClose} />
            <motion.div
              ref={panelRef}
              initial={{ y: '100%' }}
              animate={{ y: 0, transition: spring.suave }}
              exit={{ y: '100%', transition: { duration: 0.24, ease: ease.salida } }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110 || info.velocity.y > 700) onClose()
              }}
              className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col rounded-t-[28px] bg-surface pb-safe shadow-[var(--shadow-3)]"
            >
              <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line-strong" />
              {title && <div className="shrink-0 px-5 pt-3 pb-1 text-[16px] font-semibold tracking-[-0.01em]">{title}</div>}
              <div className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-4">{children}</div>
              {footer && <div className="shrink-0 border-t border-line px-4 py-3">{footer}</div>}
            </motion.div>
          </div>
        ) : (
          <motion.div
            key="pop"
            ref={panelRef}
            role="dialog"
            aria-label={label}
            className={cx('fixed z-[70] flex max-h-[min(70dvh,520px)] flex-col overflow-hidden rounded-[14px] bg-surface shadow-[var(--shadow-3)] ring-1 ring-line', className)}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? (typeof width === 'number' ? width : 280), transformOrigin: pos?.up ? 'bottom center' : 'top center' }}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: ease.calma } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14, ease: ease.salida } }}
          >
            {title && <div className="kicker shrink-0 px-3.5 pt-3 pb-1">{title}</div>}
            <div className="scroll-area min-h-0 flex-1 overflow-y-auto p-1.5">{children}</div>
            {footer && <div className="shrink-0 border-t border-line px-3 py-2.5">{footer}</div>}
          </motion.div>
        ))}
    </AnimatePresence>,
    document.body,
  )
}

// ── Menús ("…" y menú contextual) ────────────────────────
export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  hint?: string
  danger?: boolean
  disabled?: boolean
  hidden?: boolean
}

export function MenuList({ items, onPick }: { items: MenuItem[]; onPick: () => void }) {
  return (
    <div role="menu" className="flex flex-col">
      {items
        .filter((i) => !i.hidden)
        .map((it) => (
          <button
            key={it.label}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              haptic.select()
              onPick()
              it.onClick()
            }}
            className={cx('flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-left text-[15px] transition-colors duration-[var(--dur-2)] hover:bg-wash disabled:opacity-45 pointer-fine:min-h-9 pointer-fine:text-sm', it.danger ? 'text-danger' : 'text-ink')}
          >
            {it.icon && <span className={cx('flex shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]', it.danger ? 'text-danger' : 'text-ink-soft')}>{it.icon}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{it.label}</span>
              {it.hint && <span className="block truncate text-xs text-ink-3">{it.hint}</span>}
            </span>
          </button>
        ))}
    </div>
  )
}

/** Botón "…" con las acciones secundarias de una vista o de un registro */
export function OverflowMenu({ items, label = 'Más acciones', className, size = 'icon', title }: { items: MenuItem[]; label?: string; className?: string; size?: 'icon' | 'icon-sm'; title?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  if (!items.some((i) => !i.hidden)) return null
  return (
    <>
      <Button ref={ref} variant="ghost" size={size} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={className}>
        <MoreHorizontal size={size === 'icon' ? 20 : 18} strokeWidth={1.6} />
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} width={248} align="end" title={title} label={label}>
        <MenuList items={items} onPick={() => setOpen(false)} />
      </Popover>
    </>
  )
}

// ── Botón flotante (+) del celular ───────────────────────
/** Acción principal en la zona del pulgar. Se encoge al bajar y sube cuando aparece un aviso. */
export function Fab({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: () => void }) {
  const toasts = useToasts((s) => s.items.length)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = document.getElementById('contenido')
    if (!el) return
    let last = el.scrollTop
    const on = () => {
      const y = el.scrollTop
      if (Math.abs(y - last) > 6) {
        setCompact(y > last && y > 80)
        last = y
      }
    }
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [])
  return createPortal(
    <motion.button
      data-tour="fab"
      onClick={() => {
        haptic.light()
        onClick()
      }}
      aria-label={label}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1, y: toasts ? -74 * Math.min(toasts, 2) : 0 }}
      transition={spring.suave}
      className="fixed right-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-primary px-4 text-on-primary shadow-[inset_0_1px_0_color-mix(in_oklab,white_14%,transparent),var(--shadow-3)] md:hidden"
    >
      <span className="flex [&>svg]:h-[22px] [&>svg]:w-[22px]">{icon}</span>
      <AnimatePresence initial={false}>
        {!compact && (
          <motion.span key="l" initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1, transition: { duration: 0.28, ease: ease.calma } }} exit={{ width: 0, opacity: 0, transition: { duration: 0.18, ease: ease.salida } }} className="overflow-hidden pr-1 text-[15px] font-medium whitespace-nowrap">
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>,
    document.body,
  )
}

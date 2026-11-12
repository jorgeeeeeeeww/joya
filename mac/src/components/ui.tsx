// step1 · componentes base, copiados del PWA y ajustados a la Mac (mouse, teclado, ventana ancha).
// Solo tokens: sin colores sueltos.
import { createContext, forwardRef, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'
import { clsx } from 'clsx'
import { X, AlertTriangle, Check, MoreHorizontal, RotateCcw } from 'lucide-react'
import { ease, modal, spring } from '@/lib/motion'
import { LightDots } from './step1'
import { Loto } from './Loto'

export const cx = clsx

// ── Tonos categóricos (apuntan a los colores de datos de la atmósfera) ──
export type Pastel = 'lavender' | 'sage' | 'peach' | 'butter' | 'sky' | 'rose' | 'mint'
export const TONE: Record<Pastel, { soft: string; ink: string; solid: string; hex: string }> = {
  lavender: { soft: 'bg-lavender-soft', ink: 'text-lavender-ink', solid: 'bg-lavender', hex: 'var(--lavender)' },
  sage: { soft: 'bg-sage-soft', ink: 'text-sage-ink', solid: 'bg-sage', hex: 'var(--sage)' },
  peach: { soft: 'bg-peach-soft', ink: 'text-peach-ink', solid: 'bg-peach', hex: 'var(--peach)' },
  butter: { soft: 'bg-butter-soft', ink: 'text-butter-ink', solid: 'bg-butter', hex: 'var(--butter)' },
  sky: { soft: 'bg-sky-soft', ink: 'text-sky-ink', solid: 'bg-sky', hex: 'var(--t-sky)' },
  rose: { soft: 'bg-rose-soft', ink: 'text-rose-ink', solid: 'bg-rose', hex: 'var(--rose)' },
  mint: { soft: 'bg-mint-soft', ink: 'text-mint-ink', solid: 'bg-mint', hex: 'var(--mint)' },
}

// ── Capas (hojas, menús, calendarios): Escape cierra solo la de arriba ──
const layerStack: { close: () => void }[] = []
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !layerStack.length) return
    e.preventDefault()
    layerStack[layerStack.length - 1]!.close()
  })
}
export const hayCapaAbierta = () => layerStack.length > 0
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

// ── Botón (pill) ─────────────────────────────────────────
type ButtonVariant = 'primary' | 'tinta' | 'chispa' | 'luz' | 'secondary' | 'soft' | 'ghost' | 'outline' | 'danger'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'
  tone?: Pastel
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  /** Atajo de teclado que se ve dentro del botón («⌘N») */
  atajo?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', tone = 'lavender', icon, iconRight, loading, atajo, className, children, disabled, ...rest }, ref) {
  const t = TONE[tone]
  const raised = variant === 'primary' || variant === 'tinta' || variant === 'chispa' || variant === 'luz'
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'group/btn relative inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap tracking-[-.005em] select-none',
        'transition-[transform,box-shadow,background-color,color] duration-[var(--dur-2)] ease-[var(--ease-calma)] active:scale-[.98] active:duration-[var(--dur-1)]',
        'disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none',
        raised && 'shadow-[inset_0_1px_0_color-mix(in_oklab,white_14%,transparent),var(--shadow-1)] hover:-translate-y-px hover:shadow-[inset_0_1px_0_color-mix(in_oklab,white_14%,transparent),var(--shadow-2)]',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        size === 'icon' && 'h-10 w-10',
        size === 'icon-sm' && 'h-8 w-8',
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
        {atajo && <span className="text-[12px] font-medium opacity-60 tabular">{atajo}</span>}
        {iconRight && <span className="transition-transform duration-[var(--dur-2)] group-hover/btn:translate-x-[3px]">{iconRight}</span>}
      </span>
      {loading && <LightDots className="absolute" />}
    </button>
  )
})

export function Card({ className, children, onClick, as = 'div' }: { className?: string; children: ReactNode; onClick?: () => void; as?: 'div' | 'button' | 'section' | 'article' }) {
  const Comp = as as 'div'
  return (
    <Comp onClick={onClick} className={cx('card', onClick && 'lift pressable cursor-pointer text-left', className)}>
      {children}
    </Comp>
  )
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-5">
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <h3 className="text-[15px] leading-tight font-semibold tracking-[-0.015em]">{title}</h3>
          {subtitle && <p className="mt-1 text-[13px] leading-snug text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function SectionTitle({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1', className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] leading-tight font-semibold tracking-[-0.02em]">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Badge({ tone = 'lavender', children, className, dot }: { tone?: Pastel; children: ReactNode; className?: string; dot?: boolean }) {
  const t = TONE[tone]
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[12px] font-medium whitespace-nowrap', t.soft, t.ink, className)}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', t.solid)} />}
      {children}
    </span>
  )
}

export function Dot({ tone, pulse, className }: { tone: Pastel; pulse?: boolean; className?: string }) {
  return <span className={cx('relative inline-block h-2.5 w-2.5 shrink-0 rounded-full', TONE[tone].solid, pulse && 'pulse-dot', className)} style={pulse ? { color: TONE[tone].hex } : undefined} />
}

export function IconBubble({ tone, children, size = 'md' }: { tone: Pastel; children: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const t = TONE[tone]
  return <span className={cx('inline-flex shrink-0 items-center justify-center', t.soft, t.ink, size === 'sm' && 'h-8 w-8 rounded-[10px]', size === 'md' && 'h-10 w-10 rounded-xl', size === 'lg' && 'h-14 w-14 rounded-[18px]')}>{children}</span>
}

/** Interruptor: pista sunken; encendido = primario con brillo de luz */
export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId()
  return (
    <div className={cx('flex items-center justify-between gap-4', disabled && 'opacity-50')}>
      {(label || description) && (
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          {label && <span className="block text-[14px] font-medium">{label}</span>}
          {description && <span className="mt-0.5 block text-[13px] text-ink-soft">{description}</span>}
        </label>
      )}
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-[var(--dur-4)] ease-[var(--ease-calma)]', checked ? 'bg-primary' : 'bg-sunken ring-1 ring-line ring-inset')}
      >
        <motion.span
          animate={{ x: checked ? 18 : 0 }}
          transition={{ duration: 0.4, ease: ease.calma }}
          className={cx('absolute top-[3px] left-[3px] h-5 w-5 rounded-full', checked ? 'bg-on-primary shadow-[0_0_12px_color-mix(in_oklab,var(--luz)_70%,transparent)]' : 'bg-surface shadow-[var(--shadow-1)]')}
        />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  const id = useId()
  return (
    <div className={cx('inline-flex rounded-full bg-sunken p-[3px] ring-1 ring-line ring-inset', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative flex-1 rounded-full font-medium whitespace-nowrap transition-colors duration-[var(--dur-3)]', size === 'sm' ? 'h-7 px-3 text-[13px]' : 'h-8 px-3.5 text-[13px]', value === o.value ? 'text-ink' : 'text-ink-soft hover:text-ink')}
        >
          {value === o.value && <motion.span layoutId={id} className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-1)] ring-1 ring-line" transition={spring.suave} />}
          <span className="relative z-10 inline-flex items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

const StripContext = createContext(false)
export function StatStrip({ children, className, cols = 4 }: { children: ReactNode; className?: string; cols?: 2 | 3 | 4 }) {
  return (
    <StripContext.Provider value={true}>
      <div className={cx('card grid gap-px overflow-hidden bg-line', cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-4', className)}>{children}</div>
    </StripContext.Provider>
  )
}
export function Stat({ label, value, sub, icon, onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; onClick?: () => void }) {
  const inStrip = useContext(StripContext)
  const body = (
    <>
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink-soft">
        {icon && <span className="inline-flex shrink-0 text-ink-3 [&>svg]:h-[15px] [&>svg]:w-[15px]">{icon}</span>}
        <span>{label}</span>
      </span>
      <div className="display-num mt-2.5 text-[26px] leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[13px] leading-snug text-ink-3">{sub}</div>}
    </>
  )
  const cls = cx('flex min-w-0 flex-col p-5 text-left', inStrip ? 'bg-surface' : 'card')
  return onClick ? (
    <button onClick={onClick} className={cx(cls, 'pressable hover:bg-[color-mix(in_oklab,var(--surface)_94%,var(--ink))]')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Estado vacío: el loto del logo, en tono apagado, + frase + acción */
export function Empty({ title, body, action, className }: { title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <Loto size={56} hueco="var(--paper)" className="opacity-60" />
      <p className="mt-5 text-[17px] font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Encabezado de página: título, una línea y una sola acción principal */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="heading text-[30px] leading-[1.1]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[70ch] text-[14px] text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── Panel lateral (detalle) o diálogo al centro ──────────
export function Sheet({ open, onClose, title, subtitle, children, footer, side = 'right', wide, header }: { open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; side?: 'right' | 'center'; wide?: boolean; header?: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  useLayer(open, onClose)
  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement
    const t = setTimeout(() => {
      if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus()
    }, 50)
    return () => {
      clearTimeout(t)
      lastFocus.current?.focus?.()
    }
  }, [open])
  const variants =
    side === 'center' ? modal : { initial: { x: '104%' }, animate: { x: 0, transition: spring.suave }, exit: { x: '104%', transition: { duration: 0.24, ease: ease.salida } } }
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cx('fixed inset-0 z-50', side === 'center' && 'flex items-center justify-center p-6')} role="dialog" aria-modal="true">
          <motion.div className="absolute inset-0 bg-[color-mix(in_oklab,var(--ink)_28%,transparent)] backdrop-blur-[4px]" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.24 } }} exit={{ opacity: 0, transition: { duration: 0.18 } }} onClick={onClose} />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            {...variants}
            className={cx(
              'flex flex-col bg-surface shadow-[var(--shadow-3)] outline-none',
              side === 'right' && cx('absolute inset-y-3 right-3 rounded-[var(--r-lg)] ring-1 ring-line', wide ? 'w-[min(860px,calc(100vw-24px))]' : 'w-[min(520px,calc(100vw-24px))]'),
              side === 'center' && cx('relative max-h-[88vh] rounded-[var(--r-lg)] ring-1 ring-line', wide ? 'w-[min(880px,100%)]' : 'w-[min(460px,100%)]'),
            )}
          >
            {header ??
              ((title || subtitle) && (
                <div className="flex shrink-0 items-start justify-between gap-3 px-7 pt-6 pb-3">
                  <div className="min-w-0">
                    {title && <h2 className="heading text-[1.5rem]">{title}</h2>}
                    {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar (Esc)" title="Cerrar (Esc)" className="-mt-0.5 -mr-2">
                    <X size={18} strokeWidth={1.6} />
                  </Button>
                </div>
              ))}
            <div className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-6">{children}</div>
            {footer && <div className="shrink-0 border-t border-line px-7 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirmar', danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} side="center">
      {body && <div className="text-[14px] text-ink-soft">{body}</div>}
      <div className="mt-7 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          No
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          autoFocus
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

// ── Avisos (toasts): noche, ✦ en luz, abajo a la derecha ──
interface ToastItem {
  id: number
  title: string
  body?: string
  tone: 'success' | 'error' | 'info'
  action?: { label: string; onClick: () => void }
  duration: number
}
const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random()
    const duration = t.duration ?? (t.action ? 7000 : 4000)
    set((s) => ({ items: [...s.items.slice(-2), { ...t, id, duration }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), duration)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}))

export const toast = {
  success: (title: string, body?: string) => useToasts.getState().push({ title, body, tone: 'success' }),
  error: (title: string, body?: string) => useToasts.getState().push({ title, body, tone: 'error', duration: 6000 }),
  info: (title: string, body?: string) => useToasts.getState().push({ title, body, tone: 'info' }),
  /** Aviso con «Deshacer»: en lugar de preguntar «¿seguro?» antes de cambiar algo */
  /** `largo`: para lo que mueve dinero o libera fechas (pagos, cancelaciones): el aviso dura 14 s en vez de 7 */
  undo: (title: string, undo: () => void, body?: string, largo = false) => useToasts.getState().push({ title, body, tone: 'info', action: { label: 'Deshacer', onClick: undo }, ...(largo ? { duration: 14000 } : {}) }),
  action: (title: string, action: { label: string; onClick: () => void }, body?: string) => useToasts.getState().push({ title, body, tone: 'info', action }),
}

export function Toaster() {
  const items = useToasts((s) => s.items)
  const dismiss = useToasts((s) => s.dismiss)
  return createPortal(
    <div className="pointer-events-none fixed right-6 bottom-6 z-[80] flex flex-col items-end gap-2">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            role={t.tone === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.22, ease: ease.salida } }}
            className="interfaz pointer-events-auto relative flex w-[380px] items-center gap-3 overflow-hidden rounded-[14px] bg-night py-3 pr-2 pl-4 text-left text-on-night shadow-[var(--shadow-3)]"
          >
            <button onClick={() => dismiss(t.id)} className="flex min-w-0 flex-1 items-start gap-3 py-0.5 text-left">
              {t.tone === 'error' ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-chispa-soft" /> : <Check size={18} className="mt-0.5 shrink-0 text-luz" />}
              <span className="min-w-0">
                <span className="block text-[14px] font-medium">{t.title}</span>
                {t.body && <span className="block text-[13px] text-on-night-soft">{t.body}</span>}
              </span>
            </button>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
                className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-luz hover:bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)]"
              >
                {t.action.label === 'Deshacer' && <RotateCcw size={14} strokeWidth={1.8} />}
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

// ── Popover anclado (calendarios, menús) ─────────────────
export type PopoverAnchor = RefObject<HTMLElement | null> | { x: number; y: number }
export function Popover({ open, onClose, anchor, children, title, width = 300, align = 'start', className, label, footer }: { open: boolean; onClose: () => void; anchor: PopoverAnchor; children: ReactNode; title?: ReactNode; width?: number; align?: 'start' | 'end'; className?: string; label?: string; footer?: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef(anchor)
  anchorRef.current = anchor
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  useLayer(open, onClose)
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = anchorRef.current
      const rect = 'current' in a ? a.current?.getBoundingClientRect() : new DOMRect(a.x, a.y, 0, 0)
      if (!rect) return
      const w = Math.min(width, innerWidth - 16)
      const h = panelRef.current?.offsetHeight ?? 300
      const below = innerHeight - rect.bottom - 8
      const up = below < Math.min(h, 340) && rect.top - 8 > below
      const top = up ? Math.max(8, rect.top - h - 6) : rect.bottom + 6
      const left = Math.min(Math.max(8, align === 'end' ? rect.right - w : rect.left), innerWidth - w - 8)
      setPos((p) => (p && p.top === top && p.left === left && p.up === up ? p : { top, left, up }))
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
  }, [open, width, align])
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      const a = anchorRef.current
      if ('current' in a && a.current?.contains(t)) return
      closeRef.current()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])
  useEffect(() => {
    if (!open) setPos(null)
  }, [open])
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          className={cx('interfaz fixed z-[70] flex max-h-[min(72vh,560px)] flex-col overflow-hidden rounded-[14px] bg-surface shadow-[var(--shadow-3)] ring-1 ring-line', className)}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, transformOrigin: pos?.up ? 'bottom center' : 'top center' }}
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: ease.calma } }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12, ease: ease.salida } }}
        >
          {title && <div className="kicker shrink-0 px-3.5 pt-3 pb-1">{title}</div>}
          <div className="scroll-area min-h-0 flex-1 overflow-y-auto p-1.5">{children}</div>
          {footer && <div className="shrink-0 border-t border-line px-3 py-2.5">{footer}</div>}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ── Menús («…» y clic derecho) ───────────────────────────
export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  hint?: string
  atajo?: string
  danger?: boolean
  disabled?: boolean
  hidden?: boolean
  separado?: boolean
}
export function MenuList({ items, onPick }: { items: MenuItem[]; onPick: () => void }) {
  return (
    <div role="menu" className="flex flex-col">
      {items
        .filter((i) => !i.hidden)
        .map((it) => (
          <div key={it.label}>
            {it.separado && <div className="mx-2 my-1 h-px bg-line" />}
            <button
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                onPick()
                it.onClick()
              }}
              className={cx('flex min-h-9 w-full items-center gap-3 rounded-[8px] px-2.5 text-left text-[14px] transition-colors duration-[var(--dur-1)] hover:bg-wash disabled:opacity-45', it.danger ? 'text-danger' : 'text-ink')}
            >
              {it.icon && <span className={cx('flex shrink-0 [&>svg]:h-4 [&>svg]:w-4', it.danger ? 'text-danger' : 'text-ink-soft')}>{it.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block">{it.label}</span>
                {it.hint && <span className="block text-xs text-ink-3">{it.hint}</span>}
              </span>
              {it.atajo && <span className="text-[12px] text-ink-3 tabular">{it.atajo}</span>}
            </button>
          </div>
        ))}
    </div>
  )
}

export function OverflowMenu({ items, label = 'Más acciones', className, size = 'icon-sm' }: { items: MenuItem[]; label?: string; className?: string; size?: 'icon' | 'icon-sm' }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  if (!items.some((i) => !i.hidden)) return null
  return (
    <>
      <Button ref={ref} variant="ghost" size={size} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={className}>
        <MoreHorizontal size={18} strokeWidth={1.6} />
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} width={250} align="end" label={label}>
        <MenuList items={items} onPick={() => setOpen(false)} />
      </Popover>
    </>
  )
}

/** Menú de clic derecho: se abre donde está el mouse */
export function useMenuContextual() {
  const [estado, setEstado] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const abrir = (e: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]) => {
    e.preventDefault()
    setEstado({ x: e.clientX, y: e.clientY, items })
  }
  const menu = (
    <Popover open={!!estado} onClose={() => setEstado(null)} anchor={estado ? { x: estado.x, y: estado.y } : { x: 0, y: 0 }} width={240} label="Acciones">
      {estado && <MenuList items={estado.items} onPick={() => setEstado(null)} />}
    </Popover>
  )
  return { abrir, menu }
}

/** Atajo de teclado dibujado como tecla («⌘K») */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="tecla">{children}</kbd>
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

/** Palomita que se dibuja sola */
export function CheckDraw({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path d="M5 12.5l4.2 4.2L19 7" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.42, ease: ease.calma }} />
    </svg>
  )
}

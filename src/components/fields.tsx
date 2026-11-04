// Campos inteligentes de La Joya (step1 × Fintrack).
// Etiqueta flotante, ícono, botón para borrar, halo de luz al enfocar, errores que explican qué
// falta y palomita cuando el dato está bien. Dinero con separadores, teléfono con formato y
// WhatsApp, correo que sugiere el dominio, contador +/−, calendario con disponibilidad, rueda
// de horas, buscador que crea opciones, opciones como tarjetas, notas que crecen y se dictan.
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Mail, MessageCircle, Mic, Minus, Phone, Plus, Search, Square, X } from 'lucide-react'
import { parseISO, startOfMonth, startOfWeek } from 'date-fns'
import type { Pastel } from '@/lib/types'
import { TONE } from '@/lib/meta'
import { addDaysISO, daysUntil, fmt, nights as countNights, today, toISODate, waLink } from '@/lib/format'
import { ease, haptic, spring } from '@/lib/motion'
import { firstError, rules, type Validator } from '@/lib/validate'
import { Button, CheckDraw, cx, Popover, useMedia } from './ui'
import { LightDots, Sparkle } from './step1'

// ── Utilidades ───────────────────────────────────────────
/** Texto sin acentos y en minúsculas (para buscar "Maria" y encontrar "María") */
export const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el', 'en'])
/** "ana de la torre" → "Ana de la Torre" (respeta lo que ya trae mayúsculas, como "XV") */
export const titleCase = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => (/[A-ZÁÉÍÓÚÑ]/.test(w) ? w : i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')

/** 10 dígitos de México con espacios: "33 1234 5678" (GDL, CDMX, MTY) o "391 123 4567" */
export function formatPhone(v: string | undefined) {
  const d = normalizePhone(v)
  const two = /^(33|55|81)/.test(d)
  const parts = two ? [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10)] : [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)]
  return parts.filter(Boolean).join(' ')
}
function normalizePhone(v: string | undefined) {
  let d = (v ?? '').replace(/\D/g, '')
  if (d.length > 10 && d.startsWith('521')) d = d.slice(3)
  else if (d.length > 10 && d.startsWith('52')) d = d.slice(2)
  return d.slice(0, 10)
}

/** "15:30" → "3:30 p. m." (ayuda a quien piensa en 12 horas) */
export const ampm = (hhmm?: string) => {
  if (!hhmm) return ''
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

const pad = (n: number) => String(n).padStart(2, '0')
const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const compactPrice = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0).replace('.0', '')}k` : String(n))

/** Coloca el cursor después del mismo número de dígitos tras reformatear el texto */
function caretAfterDigits(el: HTMLInputElement, text: string, digits: number) {
  let pos = 0
  let seen = 0
  while (pos < text.length && seen < digits) {
    if (/\d/.test(text[pos]!)) seen++
    pos++
  }
  requestAnimationFrame(() => {
    if (document.activeElement === el) el.setSelectionRange(pos, pos)
  })
}

// ── Validación compartida ────────────────────────────────
const FormCtx = createContext<{ reveal: boolean }>({ reveal: false })

/** Envuelve un formulario. Con `reveal` (al intentar guardar) todos los campos muestran lo que falta. */
export function FormScope({ reveal, children }: { reveal: boolean; children: ReactNode }) {
  return <FormCtx.Provider value={{ reveal }}>{children}</FormCtx.Provider>
}

export interface FieldCommon {
  label: string
  icon?: ReactNode
  hint?: ReactNode
  /** Error que viene de fuera (p. ej. "esas fechas ya están ocupadas"): se muestra siempre */
  error?: string | false | null
  required?: boolean
  requiredMsg?: string
  validate?: Validator | Validator[]
  /** Fuerza la palomita (✓) */
  valid?: boolean
  disabled?: boolean
  className?: string
  id?: string
}

function useValidation(value: unknown, p: Pick<FieldCommon, 'error' | 'required' | 'requiredMsg' | 'validate'>) {
  const { reveal } = useContext(FormCtx)
  const [touched, setTouched] = useState(false)
  const list = Array.isArray(p.validate) ? p.validate : p.validate ? [p.validate] : []
  const computed = firstError(value, [p.required && rules.required(p.requiredMsg), ...list])
  const external = p.error || undefined
  const message = external || (touched || reveal ? computed : undefined)
  const filled = !(value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length))
  const ok = !computed && !external && filled && (!!p.required || list.length > 0)
  return { message, ok, touch: () => setTouched(true) }
}

// ── Contenedor del campo ─────────────────────────────────
function Shell({
  label,
  icon,
  floated,
  focused,
  error,
  ok,
  hint,
  meta,
  trailing,
  leading,
  multiline,
  disabled,
  className,
  children,
  htmlFor,
  asButton,
  noLabel,
  after,
  boxRef,
  onBoxClick,
  onBoxPointerDown,
}: {
  label: string
  icon?: ReactNode
  floated: boolean
  focused: boolean
  error?: string
  ok?: boolean
  hint?: ReactNode
  meta?: ReactNode
  trailing?: ReactNode
  leading?: ReactNode
  multiline?: boolean
  disabled?: boolean
  className?: string
  children: ReactNode
  htmlFor?: string
  asButton?: boolean
  noLabel?: boolean
  after?: ReactNode
  boxRef?: RefObject<HTMLDivElement | null>
  onBoxClick?: (e: React.MouseEvent) => void
  onBoxPointerDown?: (e: React.PointerEvent) => void
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <div ref={boxRef} className={cx('fx', focused && 'fx--focus', error && 'fx--error', disabled && 'fx--disabled', multiline && 'fx--multi', icon && 'fx--icon', asButton && 'fx--button', noLabel && 'fx--nolabel')} onClick={onBoxClick} onPointerDown={onBoxPointerDown}>
        {icon && <span className="fx-icon [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
        {!noLabel && (
          <label htmlFor={htmlFor} className={cx('fx-label', floated && 'fx-label--up')}>
            {label}
          </label>
        )}
        <div className="fx-body">
          {leading && (floated || noLabel) && <span className="fx-affix">{leading}</span>}
          {children}
        </div>
        <div className="fx-trail">
          {trailing}
          <AnimatePresence initial={false}>
            {ok && !focused && !error && (
              <motion.span key="ok" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, transition: { duration: 0.24, ease: ease.calma } }} exit={{ opacity: 0, transition: { duration: 0.12 } }} className="mr-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-success" aria-hidden>
                <CheckDraw size={14} strokeWidth={2.6} />
              </motion.span>
            )}
            {error && !focused && (
              <motion.span key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mr-0.5 flex h-6 w-6 items-center justify-center text-danger" aria-hidden>
                <AlertTriangle size={16} strokeWidth={1.8} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <FieldMeta error={error} hint={hint} meta={meta} />
      {after}
    </div>
  )
}

function FieldMeta({ error, hint, meta }: { error?: string; hint?: ReactNode; meta?: ReactNode }) {
  const show = !!(error || hint || meta)
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div key="meta" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', transition: { duration: 0.24, ease: ease.calma } }} exit={{ opacity: 0, height: 0, transition: { duration: 0.16, ease: ease.salida } }} className="overflow-hidden">
          <div className="fx-meta">
            {error ? (
              <span role="alert" className="flex items-start gap-1.5 text-danger">
                <AlertTriangle size={13} strokeWidth={1.8} className="mt-[2px] shrink-0" />
                {error}
              </span>
            ) : (
              <span className="min-w-0 text-ink-soft">{hint}</span>
            )}
            {meta && <span className="shrink-0 text-ink-3 tabular">{meta}</span>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Tocar el relleno, la etiqueta o el ícono enfoca el campo */
const focusFrom = (ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>) => (e: React.PointerEvent) => {
  const t = e.target as HTMLElement
  if (t.closest('button, a, input, textarea')) return
  e.preventDefault()
  ref.current?.focus()
}

function ClearButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" tabIndex={-1} className="fx-btn" aria-label={`Borrar ${label.toLowerCase()}`} onPointerDown={(e) => e.preventDefault()} onClick={onClear}>
      <X size={16} strokeWidth={1.8} />
    </button>
  )
}

function SuggestionChips({ items, onPick, prefix }: { items: string[]; onPick: (s: string) => void; prefix?: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((s) => (
        <button key={s} type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => onPick(s)} className="pressable inline-flex h-8 items-center gap-1 rounded-full bg-sunken px-3 text-[13px] text-ink-soft ring-1 ring-line ring-inset hover:text-ink">
          {prefix}
          {s}
        </button>
      ))}
    </div>
  )
}

// ── Texto ────────────────────────────────────────────────
export function TextField({
  label,
  value,
  onChange,
  icon,
  hint,
  error,
  required,
  requiredMsg,
  validate,
  valid,
  disabled,
  className,
  id,
  placeholder,
  type = 'text',
  inputMode,
  autoComplete,
  autoFocus,
  maxLength,
  counter,
  clearable = true,
  onEnter,
  onBlur,
  capitalizeWords,
  suggestions,
  leading,
  trailing,
  name,
}: FieldCommon & {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'search' | 'url' | 'password' | 'email' | 'tel'
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  autoFocus?: boolean
  maxLength?: number
  /** Muestra "42/80" */
  counter?: boolean
  clearable?: boolean
  onEnter?: () => void
  onBlur?: () => void
  /** Pone mayúscula a cada palabra al salir ("ana torres" → "Ana Torres") */
  capitalizeWords?: boolean
  /** Sugerencias que aparecen mientras escribe */
  suggestions?: string[]
  leading?: ReactNode
  trailing?: ReactNode
  name?: string
}) {
  const autoId = useId()
  const fid = id ?? autoId
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const v = useValidation(value, { error, required, requiredMsg, validate })
  const sugg = useMemo(() => (suggestions && focused && value.trim() ? suggestions.filter((s) => norm(s).includes(norm(value)) && norm(s) !== norm(value)).slice(0, 4) : []), [suggestions, value, focused])
  return (
    <Shell
      label={label}
      icon={icon}
      floated={focused || !!value}
      focused={focused}
      error={v.message}
      ok={valid ?? v.ok}
      hint={hint}
      meta={counter && maxLength ? `${value.length}/${maxLength}` : undefined}
      htmlFor={fid}
      leading={leading}
      disabled={disabled}
      className={className}
      onBoxPointerDown={focusFrom(ref)}
      trailing={
        <>
          {clearable && value && focused && !disabled && (
            <ClearButton
              label={label}
              onClear={() => {
                onChange('')
                ref.current?.focus()
              }}
            />
          )}
          {trailing}
        </>
      }
      after={
        sugg.length > 0 && (
          <SuggestionChips
            items={sugg}
            onPick={(s) => {
              haptic.select()
              onChange(s)
            }}
          />
        )
      }
    >
      <input
        ref={ref}
        id={fid}
        name={name}
        className="fx-input"
        value={value}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={!!v.message || undefined}
        aria-required={required || undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          v.touch()
          if (capitalizeWords && value) {
            const c = titleCase(value)
            if (c !== value) onChange(c)
          }
          onBlur?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault()
            onEnter()
          }
        }}
      />
    </Shell>
  )
}

// ── Dinero ───────────────────────────────────────────────
function moneyText(raw: string, decimals: boolean): { text: string; value: number } {
  let clean = raw.replace(decimals ? /[^\d.]/g : /[^\d]/g, '')
  if (decimals) {
    const i = clean.indexOf('.')
    if (i >= 0) clean = clean.slice(0, i + 1) + clean.slice(i + 1).replace(/\./g, '').slice(0, 2)
  }
  if (!clean) return { text: '', value: 0 }
  const [int = '', dec] = clean.split('.')
  const intNum = Number(int.replace(/^0+(?=\d)/, '') || '0')
  return { text: nf0.format(intNum) + (dec !== undefined ? '.' + dec : ''), value: Number(dec ? `${intNum}.${dec}` : intNum) }
}

/** Pesos con separadores mientras escribes: 12500 → "12,500". Sugerencia y montos rápidos opcionales. */
export function MoneyField({
  label,
  value,
  onChange,
  icon,
  hint,
  error,
  required,
  requiredMsg,
  validate,
  valid,
  disabled,
  className,
  id,
  decimals = false,
  suggestion,
  presets,
  min,
  max,
  placeholder,
  autoFocus,
}: FieldCommon & {
  value: number | undefined
  onChange: (n: number) => void
  decimals?: boolean
  /** Monto sugerido que se aplica con un toque */
  suggestion?: { amount: number; label?: string }
  /** Montos rápidos (chips) */
  presets?: number[]
  min?: number
  max?: number
  placeholder?: string
  autoFocus?: boolean
}) {
  const autoId = useId()
  const fid = id ?? autoId
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const show = (n?: number) => (n ? (decimals ? nf2 : nf0).format(n) : '')
  const [text, setText] = useState(show(value))
  useEffect(() => {
    if (!focused) setText(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused])
  const vRules = [min !== undefined && rules.min(min, `Debe ser al menos $${nf0.format(min)}`), max !== undefined && rules.max(max, `No puede pasar de $${nf0.format(max)}`), ...(Array.isArray(validate) ? validate : validate ? [validate] : [])].filter(Boolean) as Validator[]
  const v = useValidation(value || undefined, { error, required, requiredMsg, validate: vRules })
  const chips = [...(presets ?? [])]
  const useSuggestion = suggestion && suggestion.amount > 0 && suggestion.amount !== value
  return (
    <Shell
      label={label}
      icon={icon}
      floated={focused || !!text}
      focused={focused}
      error={v.message}
      ok={valid ?? v.ok}
      hint={hint}
      htmlFor={fid}
      leading="$"
      disabled={disabled}
      className={className}
      onBoxPointerDown={focusFrom(ref)}
      trailing={(focused || !!text) && <span className="px-1.5 text-[11px] font-medium tracking-wide text-ink-3">MXN</span>}
      after={
        (useSuggestion || chips.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {useSuggestion && (
              <button type="button" onClick={() => (haptic.select(), onChange(suggestion!.amount))} className="pressable inline-flex h-8 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--luz)_40%,var(--surface))] px-3 text-[13px] font-medium text-ink ring-1 ring-[color-mix(in_oklab,var(--luz)_70%,transparent)] ring-inset">
                <Sparkle className="text-[10px] text-chispa" />
                {suggestion!.label ?? 'Usar sugerido'} ${nf0.format(suggestion!.amount)}
              </button>
            )}
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => (haptic.select(), onChange(c))} className={cx('pressable inline-flex h-8 items-center rounded-full px-3 text-[13px] tabular ring-1 ring-inset', value === c ? 'bg-ink text-paper ring-ink' : 'bg-surface text-ink-soft ring-line-strong hover:text-ink')}>
                ${nf0.format(c)}
              </button>
            ))}
          </div>
        )
      }
    >
      <input
        ref={ref}
        id={fid}
        className="fx-input tabular"
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={text}
        placeholder={placeholder ?? '0'}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={!!v.message || undefined}
        onFocus={(e) => {
          setFocused(true)
          const el = e.currentTarget
          requestAnimationFrame(() => el.select())
        }}
        onBlur={() => {
          setFocused(false)
          v.touch()
        }}
        onChange={(e) => {
          const el = e.target
          const caret = el.selectionStart ?? el.value.length
          const digits = el.value.slice(0, caret).replace(/[^\d]/g, '').length
          const r = moneyText(el.value, decimals)
          setText(r.text)
          onChange(r.value)
          caretAfterDigits(el, r.text, digits)
        }}
      />
    </Shell>
  )
}

// ── Teléfono ─────────────────────────────────────────────
/** Teléfono de México con formato "33 1234 5678". Guarda solo los 10 dígitos. Con botón de WhatsApp. */
export function PhoneField({
  label = 'Teléfono',
  value,
  onChange,
  icon = <Phone />,
  hint,
  error,
  required,
  requiredMsg,
  valid,
  disabled,
  className,
  id,
  whatsappText,
  autoFocus,
}: Omit<FieldCommon, 'label' | 'validate'> & { label?: string; value: string | undefined; onChange: (digits: string) => void; whatsappText?: string; autoFocus?: boolean }) {
  const autoId = useId()
  const fid = id ?? autoId
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const digits = normalizePhone(value)
  const v = useValidation(digits, { error, required, requiredMsg, validate: rules.phoneMx() })
  const text = formatPhone(digits)
  return (
    <Shell
      label={label}
      icon={icon}
      floated={focused || !!text}
      focused={focused}
      error={v.message}
      ok={valid ?? digits.length === 10}
      hint={hint}
      htmlFor={fid}
      disabled={disabled}
      className={className}
      onBoxPointerDown={focusFrom(ref)}
      trailing={
        <>
          {text && focused && <ClearButton label={label} onClear={() => (onChange(''), ref.current?.focus())} />}
          {digits.length === 10 && !focused && (
            <a href={waLink(digits, whatsappText ?? '')} target="_blank" rel="noreferrer" className="fx-btn text-success hover:!text-success" aria-label="Abrir WhatsApp" title="Abrir WhatsApp" onClick={(e) => e.stopPropagation()}>
              <MessageCircle size={17} strokeWidth={1.7} />
            </a>
          )}
        </>
      }
    >
      <input
        ref={ref}
        id={fid}
        className="fx-input tabular"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={text}
        placeholder="33 1234 5678"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={!!v.message || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          v.touch()
        }}
        onChange={(e) => {
          const el = e.target
          const caret = el.selectionStart ?? el.value.length
          const before = el.value.slice(0, caret).replace(/\D/g, '').length
          const d = normalizePhone(el.value)
          const shift = el.value.replace(/\D/g, '').length - d.length // si pegó +52, se quitan esos dígitos
          onChange(d)
          caretAfterDigits(el, formatPhone(d), Math.max(0, before - Math.max(0, shift)))
        }}
      />
    </Shell>
  )
}

// ── Correo ───────────────────────────────────────────────
const DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com.mx', 'yahoo.com.mx', 'hotmail.es', 'outlook.es', 'prodigy.net.mx']

function distance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length]![b.length]!
}

/** Correo que completa el dominio (@gmail.com…) y detecta errores comunes ("gmial.com") */
export function EmailField({ label = 'Correo', value, onChange, icon = <Mail />, hint, error, required, requiredMsg, valid, disabled, className, id, autoFocus }: Omit<FieldCommon, 'label' | 'validate'> & { label?: string; value: string | undefined; onChange: (v: string) => void; autoFocus?: boolean }) {
  const autoId = useId()
  const fid = id ?? autoId
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const val = value ?? ''
  const v = useValidation(val, { error, required, requiredMsg, validate: rules.email() })
  const [local = '', domain] = val.split('@')
  const completions = focused && domain !== undefined && local ? DOMAINS.filter((d) => d.startsWith(domain.toLowerCase()) && d !== domain.toLowerCase()).slice(0, 3) : []
  const typo = !focused && domain && !DOMAINS.includes(domain.toLowerCase()) ? DOMAINS.find((d) => distance(d, domain.toLowerCase()) <= 2) : undefined
  return (
    <Shell
      label={label}
      icon={icon}
      floated={focused || !!val}
      focused={focused}
      error={v.message}
      ok={valid ?? v.ok}
      hint={
        typo ? (
          <span>
            ¿Quisiste decir{' '}
            <button type="button" className="font-medium text-ink underline decoration-[color-mix(in_oklab,var(--chispa)_60%,transparent)] underline-offset-2" onClick={() => (haptic.select(), onChange(`${local}@${typo}`))}>
              {local}@{typo}
            </button>
            ?
          </span>
        ) : (
          hint
        )
      }
      htmlFor={fid}
      disabled={disabled}
      className={className}
      onBoxPointerDown={focusFrom(ref)}
      trailing={val && focused && <ClearButton label={label} onClear={() => (onChange(''), ref.current?.focus())} />}
      after={completions.length > 0 && <SuggestionChips items={completions.map((d) => `@${d}`)} onPick={(s) => (haptic.select(), onChange(`${local}${s}`))} />}
    >
      <input
        ref={ref}
        id={fid}
        className="fx-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        value={val}
        placeholder="nombre@gmail.com"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={!!v.message || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          v.touch()
          const t = val.trim().toLowerCase()
          if (t !== val) onChange(t)
        }}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
      />
    </Shell>
  )
}

// ── Contador +/− ─────────────────────────────────────────
/**
 * Botones grandes de más y menos (mantener presionado acelera). Tocar la cifra deja escribirla.
 * Con `label` se dibuja como un renglón de formulario; sin él, solo el control.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99999,
  step = 1,
  label,
  hint,
  unit,
  size = 'md',
  className,
  format,
  disabled,
  icon,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  hint?: ReactNode
  /** "personas" o una función: (n) => n === 1 ? 'noche' : 'noches' */
  unit?: string | ((n: number) => string)
  size?: 'sm' | 'md' | 'lg'
  className?: string
  format?: (n: number) => string
  disabled?: boolean
  icon?: ReactNode
}) {
  const [dir, setDir] = useState(1)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const valueRef = useRef(value)
  valueRef.current = value
  const timer = useRef<number | undefined>(undefined)
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const bump = (d: 1 | -1) => {
    const next = clamp(Math.round((valueRef.current + d * step) * 1000) / 1000)
    if (next === valueRef.current) {
      haptic.warning()
      return false
    }
    valueRef.current = next
    setDir(d)
    haptic.select()
    onChange(next)
    return true
  }
  const stop = () => clearTimeout(timer.current)
  const start = (d: 1 | -1) => {
    stop()
    bump(d)
    let delay = 360
    const loop = () => {
      if (!bump(d)) return
      delay = Math.max(45, delay * 0.8)
      timer.current = window.setTimeout(loop, delay)
    }
    timer.current = window.setTimeout(loop, 420)
  }
  useEffect(() => stop, [])
  const commit = () => {
    const n = Number(draft.replace(/[^\d.-]/g, ''))
    if (draft.trim() && !Number.isNaN(n)) onChange(clamp(n))
    setEditing(false)
  }
  const unitText = typeof unit === 'function' ? unit(value) : unit
  const btn = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10 pointer-fine:h-9 pointer-fine:w-9'
  const num = size === 'lg' ? 'text-[34px] min-w-[3.2ch]' : size === 'sm' ? 'text-[15px] min-w-[2.4ch]' : 'text-[19px] min-w-[2.6ch]'
  const control = (
    <div className={cx('flex items-center', size === 'lg' ? 'gap-3' : 'gap-1.5')} role="group" aria-label={label}>
      {(['-', '+'] as const).map((sign) => {
        const d = sign === '+' ? 1 : -1
        const atEdge = d === 1 ? value >= max : value <= min
        const button = (
          <button
            key={sign}
            type="button"
            disabled={disabled || atEdge}
            aria-label={d === 1 ? 'Más' : 'Menos'}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              start(d)
            }}
            onPointerUp={stop}
            onPointerLeave={stop}
            onPointerCancel={stop}
            onClick={(e) => {
              if (e.detail === 0) bump(d)
            }}
            className={cx('pressable no-callout flex shrink-0 items-center justify-center rounded-full ring-1 ring-line-strong ring-inset transition-colors duration-[var(--dur-2)] disabled:opacity-35', btn, d === 1 ? 'bg-ink text-paper ring-ink hover:bg-[color-mix(in_oklab,var(--ink)_88%,var(--paper))]' : 'bg-surface text-ink hover:bg-wash')}
          >
            {d === 1 ? <Plus size={size === 'lg' ? 24 : 17} strokeWidth={1.8} /> : <Minus size={size === 'lg' ? 24 : 17} strokeWidth={1.8} />}
          </button>
        )
        if (sign === '+') return button
        return (
          <span key="mid" className="flex items-center gap-1.5">
            {button}
            {editing ? (
              <input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className={cx('w-[4.5ch] rounded-lg bg-sunken text-center font-semibold tabular outline-none', num)}
              />
            ) : (
              <button
                type="button"
                role="spinbutton"
                aria-valuenow={value}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-label={label ? `${label}: ${value}` : String(value)}
                disabled={disabled}
                onClick={() => {
                  setDraft(String(value))
                  setEditing(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') (e.preventDefault(), bump(1))
                  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') (e.preventDefault(), bump(-1))
                }}
                className={cx('relative h-10 overflow-hidden text-center leading-none font-semibold tabular', num)}
                title="Toca para escribir"
              >
                <AnimatePresence initial={false} custom={dir} mode="popLayout">
                  <motion.span key={value} custom={dir} initial={{ y: dir * 14, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { duration: 0.22, ease: ease.calma } }} exit={{ y: dir * -14, opacity: 0, transition: { duration: 0.16, ease: ease.salida } }} className="absolute inset-0 flex items-center justify-center">
                    {format ? format(value) : value}
                  </motion.span>
                </AnimatePresence>
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
  if (!label) return <div className={cx('inline-flex items-center gap-2', className)}>{control}{unitText && <span className="text-sm text-ink-soft">{unitText}</span>}</div>
  return (
    <div className={cx('min-w-0', className)}>
      <div className={cx('flex min-h-[52px] items-center justify-between gap-3 rounded-[var(--r-md)] bg-surface py-1.5 pr-1.5 pl-3.5 ring-1 ring-line-strong ring-inset pointer-fine:min-h-12', disabled && 'opacity-55')}>
        <span className="flex min-w-0 items-center gap-2.5">
          {icon && <span className="flex shrink-0 text-ink-3 [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
          <span className="min-w-0">
            <span className="block truncate text-[15px] text-ink">{label}</span>
            {unitText && <span className="block text-xs text-ink-3">{unitText}</span>}
          </span>
        </span>
        {control}
      </div>
      <FieldMeta hint={hint} />
    </div>
  )
}

// ── Opciones como pills o tarjetas (≤ 6 opciones) ────────
export interface ChoiceOption<T extends string> {
  value: T
  label: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: Pastel
  disabled?: boolean
}

function GroupLabel({ label, hint }: { label?: string; hint?: ReactNode }) {
  if (!label) return null
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </div>
  )
}

/** Elegir una opción tocándola (en lugar de un menú desplegable). `cards` muestra ícono y explicación. */
export function Choices<T extends string>({ label, hint, value, onChange, options, variant = 'pills', columns = 2, className, error, size = 'md' }: { label?: string; hint?: ReactNode; value: T | undefined; onChange: (v: T) => void; options: ChoiceOption<T>[]; variant?: 'pills' | 'cards'; columns?: 2 | 3 | 4; className?: string; error?: string; size?: 'sm' | 'md' }) {
  const gid = useId()
  const move = (d: 1 | -1) => {
    const enabled = options.filter((o) => !o.disabled)
    const i = enabled.findIndex((o) => o.value === value)
    const next = enabled[(i + d + enabled.length) % enabled.length]
    if (next) {
      haptic.select()
      onChange(next.value)
    }
  }
  return (
    <div className={cx('min-w-0', className)}>
      <GroupLabel label={label} hint={hint} />
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') (e.preventDefault(), move(1))
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') (e.preventDefault(), move(-1))
        }}
        className={cx(variant === 'pills' ? 'flex flex-wrap gap-1.5' : cx('grid gap-2', columns === 2 && 'grid-cols-2', columns === 3 && 'grid-cols-2 sm:grid-cols-3', columns === 4 && 'grid-cols-2 sm:grid-cols-4'))}
      >
        {options.map((o) => {
          const on = o.value === value
          const t = o.tone ? TONE[o.tone] : undefined
          if (variant === 'pills')
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (!value && o === options[0]) ? 0 : -1}
                disabled={o.disabled}
                onClick={() => (haptic.select(), onChange(o.value))}
                className={cx('pressable relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 font-medium whitespace-nowrap ring-1 ring-inset disabled:opacity-40', size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-sm pointer-fine:h-9', on ? (t ? cx(t.ink, 'ring-transparent') : 'text-paper ring-transparent') : 'text-ink-soft ring-line-strong hover:text-ink')}
              >
                {on && <motion.span layoutId={gid} className={cx('absolute inset-0 rounded-full', t ? cx(t.soft, 'ring-1 ring-inset', t.ring) : 'bg-ink')} transition={spring.suave} />}
                {o.tone && !on && <span className={cx('relative h-2 w-2 rounded-full', TONE[o.tone].solid)} />}
                {o.icon && <span className="relative flex [&>svg]:h-4 [&>svg]:w-4">{o.icon}</span>}
                <span className="relative">{o.label}</span>
              </button>
            )
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (!value && o === options[0]) ? 0 : -1}
              disabled={o.disabled}
              onClick={() => (haptic.select(), onChange(o.value))}
              className={cx('pressable relative flex min-h-[72px] items-start gap-3 rounded-[var(--r-md)] p-3.5 text-left ring-inset transition-[box-shadow,background-color] duration-[var(--dur-2)] disabled:opacity-40', on ? 'bg-[color-mix(in_oklab,var(--primary)_6%,var(--surface))] ring-2 ring-primary shadow-[0_0_20px_color-mix(in_oklab,var(--luz)_35%,transparent)]' : 'bg-surface ring-1 ring-line-strong hover:bg-wash')}
            >
              {o.icon && <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] [&>svg]:h-[18px] [&>svg]:w-[18px]', t ? cx(t.soft, t.ink) : 'bg-sunken text-ink-soft')}>{o.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] leading-snug font-medium">{o.label}</span>
                {o.hint && <span className="mt-0.5 block text-xs leading-snug text-ink-3">{o.hint}</span>}
              </span>
              <AnimatePresence>
                {on && (
                  <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary">
                    <CheckDraw size={12} strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </div>
      {error && <FieldMeta error={error} />}
    </div>
  )
}

/** Varias opciones a la vez (pills con palomita) */
export function ChoicesMulti<T extends string>({ label, hint, value, onChange, options, className, size = 'md' }: { label?: string; hint?: ReactNode; value: T[]; onChange: (v: T[]) => void; options: ChoiceOption<T>[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('min-w-0', className)}>
      <GroupLabel label={label} hint={hint} />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((o) => {
          const on = value.includes(o.value)
          const t = o.tone ? TONE[o.tone] : undefined
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={o.disabled}
              onClick={() => (haptic.select(), onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value]))}
              className={cx('pressable inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 font-medium whitespace-nowrap ring-1 ring-inset transition-colors duration-[var(--dur-2)] disabled:opacity-40', size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-sm pointer-fine:h-9', on ? (t ? cx(t.soft, t.ink, t.ring) : 'bg-ink text-paper ring-ink') : 'text-ink-soft ring-line-strong hover:text-ink')}
            >
              {on ? <Check size={14} strokeWidth={2.4} /> : o.icon && <span className="flex [&>svg]:h-4 [&>svg]:w-4">{o.icon}</span>}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Buscador con opciones (y crear nuevas) ───────────────
export interface ComboOption<T extends string = string> {
  value: T
  label: string
  hint?: string
  icon?: ReactNode
  tone?: Pastel
  keywords?: string
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = norm(text).indexOf(norm(q))
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

/** Campo para elegir de una lista larga: busca sin importar acentos y permite agregar una opción nueva */
export function Combobox<T extends string>({
  label,
  value,
  onChange,
  options,
  icon,
  hint,
  error,
  required,
  requiredMsg,
  disabled,
  className,
  id,
  searchPlaceholder = 'Buscar…',
  onCreate,
  createLabel = (q) => `Agregar «${q}»`,
  emptyText = 'Sin resultados',
  clearable,
}: Omit<FieldCommon, 'validate' | 'valid'> & {
  value: T | '' | undefined | null
  onChange: (v: T | '') => void
  options: ComboOption<T>[]
  searchPlaceholder?: string
  onCreate?: (q: string) => T | void
  createLabel?: (q: string) => string
  emptyText?: string
  clearable?: boolean
}) {
  const autoId = useId()
  const fid = id ?? autoId
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const touchUi = useMedia('(pointer: coarse)')
  const v = useValidation(value || undefined, { error, required, requiredMsg })
  const selected = options.find((o) => o.value === value)
  const filtered = useMemo(() => {
    const nq = norm(q.trim())
    return nq ? options.filter((o) => norm(`${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`).includes(nq)) : options
  }, [options, q])
  const canCreate = !!onCreate && q.trim().length > 0 && !options.some((o) => norm(o.label) === norm(q.trim()))
  const total = filtered.length + (canCreate ? 1 : 0)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      setQ('')
      setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    } else if (wasOpen.current) v.touch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])
  const pick = (val: T) => {
    haptic.select()
    onChange(val)
    setOpen(false)
  }
  const create = () => {
    const made = onCreate?.(q.trim())
    if (made) onChange(made)
    setOpen(false)
  }
  const showSearch = options.length > 7 || !!onCreate
  return (
    <>
      <Shell
        label={label}
        icon={selected?.icon ?? icon}
        floated={!!selected}
        focused={open}
        error={v.message}
        hint={hint}
        htmlFor={fid}
        disabled={disabled}
        className={className}
        asButton
        boxRef={boxRef}
        onBoxClick={(e) => {
          if ((e.target as HTMLElement).closest('.fx-btn')) return
          setOpen((o) => !o)
        }}
        trailing={
          <>
            {clearable && selected && (
              <button type="button" className="fx-btn" aria-label={`Quitar ${label.toLowerCase()}`} onClick={(e) => (e.stopPropagation(), onChange(''))}>
                <X size={16} strokeWidth={1.8} />
              </button>
            )}
            <ChevronDown size={17} strokeWidth={1.7} className={cx('mx-1 text-ink-3 transition-transform duration-[var(--dur-3)]', open && 'rotate-180')} />
          </>
        }
      >
        <button type="button" id={fid} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-invalid={!!v.message || undefined} className="fx-value flex w-full items-center gap-2 text-left outline-none">
          {selected?.tone && <span className={cx('h-2 w-2 shrink-0 rounded-full', TONE[selected.tone].solid)} />}
          <span className="keep-truncate truncate">{selected?.label ?? ''}</span>
        </button>
      </Shell>
      <Popover open={open} onClose={() => setOpen(false)} anchor={boxRef} width="anchor" title={label} label={label}>
        {showSearch && (
          <div className="relative mb-1.5 px-0.5 pt-0.5">
            <Search size={16} strokeWidth={1.7} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input
              autoFocus={!touchUi}
              value={q}
              onChange={(e) => (setQ(e.target.value), setActive(0))}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(total - 1, a + 1)))
                if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)))
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (active < filtered.length) pick(filtered[active]!.value)
                  else if (canCreate) create()
                }
              }}
              placeholder={searchPlaceholder}
              className="h-11 w-full rounded-[10px] bg-sunken pr-3 pl-9 text-base outline-none placeholder:text-ink-faint pointer-fine:h-9 pointer-fine:text-sm"
            />
          </div>
        )}
        <div ref={listRef} role="listbox" aria-label={label} className="flex flex-col">
          {filtered.map((o, i) => (
            <button
              key={o.value}
              data-i={i}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.value)}
              className={cx('flex min-h-12 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left transition-colors duration-[var(--dur-1)] pointer-fine:min-h-9', i === active && 'bg-wash')}
            >
              {o.tone && <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', TONE[o.tone].solid)} />}
              {o.icon && <span className="flex shrink-0 text-ink-soft [&>svg]:h-[18px] [&>svg]:w-[18px]">{o.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] pointer-fine:text-sm">
                  <Highlight text={o.label} q={q} />
                </span>
                {o.hint && <span className="block truncate text-xs text-ink-3">{o.hint}</span>}
              </span>
              {o.value === value && <Check size={16} strokeWidth={2.2} className="shrink-0 text-primary" />}
            </button>
          ))}
          {canCreate && (
            <button type="button" data-i={filtered.length} onMouseEnter={() => setActive(filtered.length)} onClick={create} className={cx('flex min-h-12 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[15px] font-medium text-primary pointer-fine:min-h-9 pointer-fine:text-sm', active === filtered.length && 'bg-wash')}>
              <Plus size={17} strokeWidth={1.8} />
              {createLabel(q.trim())}
            </button>
          )}
          {total === 0 && <p className="px-3 py-6 text-center text-sm text-ink-3">{emptyText}</p>}
        </div>
      </Popover>
    </>
  )
}

// ── Calendario con disponibilidad ────────────────────────
export interface DayInfo {
  /** No se puede elegir */
  disabled?: boolean
  /** Noche ocupada (se tacha); el último día de una estancia sí puede ser ocupado */
  busy?: boolean
  /** Punto de color (evento, nota) */
  tone?: Pastel
  dot?: boolean
  note?: string
  /** Precio de esa noche (se muestra pequeño bajo el número) */
  price?: number
}
export interface DatePreset {
  label: string
  value: string
}

const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Hoy, mañana, este sábado, en una semana */
export function defaultDatePresets(): DatePreset[] {
  const T = today()
  const dow = new Date().getDay()
  const toSat = dow === 6 ? 7 : 6 - dow
  return [
    { label: 'Hoy', value: T },
    { label: 'Mañana', value: addDaysISO(T, 1) },
    { label: dow === 6 ? 'Próximo sábado' : 'Este sábado', value: addDaysISO(T, toSat) },
    { label: 'En una semana', value: addDaysISO(T, 7) },
  ]
}

const monthKey = (iso: string) => iso.slice(0, 8) + '01'
const shiftMonth = (key: string, d: number) => {
  const dt = parseISO(key)
  dt.setMonth(dt.getMonth() + d)
  return toISODate(dt).slice(0, 8) + '01'
}

/** Mes con días seleccionables; se cambia de mes con flechas o deslizando */
export function Calendar({ selected, rangeStart, rangeEnd, hover, onHover, onPick, min, max, dayInfo, initialMonth }: { selected?: string; rangeStart?: string; rangeEnd?: string; hover?: string; onHover?: (iso?: string) => void; onPick: (iso: string) => void; min?: string; max?: string; dayInfo?: (iso: string) => DayInfo | undefined; initialMonth?: string }) {
  const T = today()
  const [month, setMonth] = useState(() => monthKey(initialMonth ?? selected ?? rangeStart ?? T))
  const [dir, setDir] = useState(0)
  const dragged = useRef(false)
  const go = (d: number) => {
    const next = shiftMonth(month, d)
    if (min && next < monthKey(min)) return
    if (max && next > monthKey(max)) return
    haptic.select()
    setDir(d)
    setMonth(next)
  }
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(parseISO(month)), { weekStartsOn: 1 })
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [month])
  const m = parseISO(month).getMonth()
  const endEff = rangeEnd ?? (rangeStart && hover && hover > rangeStart ? hover : undefined)
  const canPrev = !min || shiftMonth(month, -1) >= monthKey(min)
  return (
    <div className="select-none" onMouseLeave={() => onHover?.(undefined)}>
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <button type="button" onClick={() => go(-1)} disabled={!canPrev} aria-label="Mes anterior" className="fx-btn !h-9 !w-9 disabled:opacity-30">
          <ChevronLeft size={18} strokeWidth={1.7} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-[-0.01em] capitalize">{fmt(month, 'MMMM yyyy')}</span>
          {monthKey(T) !== month && (
            <button type="button" onClick={() => (setDir(month > monthKey(T) ? -1 : 1), setMonth(monthKey(T)))} className="rounded-full px-2 py-0.5 text-[11.5px] font-medium text-ink-soft ring-1 ring-line hover:text-ink">
              Hoy
            </button>
          )}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Mes siguiente" className="fx-btn !h-9 !w-9">
          <ChevronRight size={18} strokeWidth={1.7} />
        </button>
      </div>
      <div className="mb-0.5 grid grid-cols-7 text-center">
        {WEEK.map((w, i) => (
          <span key={i} className={cx('py-1 text-[11px] font-semibold tracking-wide', i >= 5 ? 'text-chispa' : 'text-ink-3')}>
            {w}
          </span>
        ))}
      </div>
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={month}
            custom={dir}
            initial={{ opacity: 0, x: dir * 28 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.22, ease: ease.calma } }}
            exit={{ opacity: 0, x: dir * -28, transition: { duration: 0.14, ease: ease.salida } }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.22}
            onDragStart={() => (dragged.current = true)}
            onDragEnd={(_, info) => {
              if (info.offset.x < -46) go(1)
              else if (info.offset.x > 46) go(-1)
              setTimeout(() => (dragged.current = false), 0)
            }}
            className="grid grid-cols-7 gap-y-0.5"
          >
            {days.map((d) => {
              const iso = toISODate(d)
              const info = dayInfo?.(iso) ?? {}
              const out = d.getMonth() !== m
              const disabled = !!info.disabled || (!!min && iso < min) || (!!max && iso > max)
              const start = rangeStart ?? selected
              const isStart = !!start && iso === start
              const isEnd = !!endEff && iso === endEff
              const inBand = !!rangeStart && !!endEff && iso > rangeStart && iso < endEff
              const sel = isStart || isEnd
              return (
                <div key={iso} className="relative flex h-11 items-center justify-center pointer-fine:h-10">
                  {(inBand || (isStart && !!rangeStart && !!endEff) || (isEnd && !!rangeStart)) && <span className={cx('absolute inset-y-[3px] bg-[color-mix(in_oklab,var(--primary)_11%,transparent)]', inBand && 'inset-x-0', isStart && 'right-0 left-1/2', isEnd && 'right-1/2 left-0')} />}
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={sel}
                    aria-label={`${fmt(iso, "EEEE d 'de' MMMM")}${info.busy ? ', ocupado' : ''}${info.note ? `, ${info.note}` : ''}`}
                    onClick={() => !dragged.current && onPick(iso)}
                    onMouseEnter={() => onHover?.(iso)}
                    className={cx(
                      'relative z-[1] flex h-10 w-10 flex-col items-center justify-center rounded-full text-[14px] tabular transition-[background-color,color,box-shadow] duration-[var(--dur-2)] pointer-fine:h-9 pointer-fine:w-9',
                      out && !sel && 'opacity-40',
                      sel ? 'bg-primary font-semibold text-on-primary shadow-[0_0_14px_color-mix(in_oklab,var(--luz)_60%,transparent)]' : disabled ? 'cursor-not-allowed text-ink-faint' : 'hover:bg-wash',
                      iso === T && !sel && 'font-semibold ring-1 ring-[color-mix(in_oklab,var(--primary)_45%,transparent)] ring-inset',
                      info.busy && !sel && 'text-ink-3 line-through decoration-[color-mix(in_oklab,var(--danger)_60%,transparent)] decoration-[1.5px]',
                    )}
                  >
                    <span className="leading-none">{d.getDate()}</span>
                    {info.price != null && !sel && !info.busy && <span className="mt-[3px] text-[9px] leading-none text-ink-3 no-underline">{compactPrice(info.price)}</span>}
                    {(info.dot || info.tone) && info.price == null && <span className={cx('absolute bottom-[5px] h-1 w-1 rounded-full', sel ? 'bg-on-primary' : info.tone ? TONE[info.tone].solid : 'bg-chispa-soft')} />}
                  </button>
                </div>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function PresetChips({ presets, value, onPick }: { presets: DatePreset[]; value?: string; onPick: (v: string) => void }) {
  return (
    <div className="no-scrollbar -mx-0.5 mb-2 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5">
      {presets.map((p) => (
        <button key={p.label} type="button" onClick={() => onPick(p.value)} className={cx('pressable inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-medium ring-1 ring-inset', value === p.value ? 'bg-ink text-paper ring-ink' : 'text-ink-soft ring-line-strong hover:text-ink')}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

const dateLabel = (iso: string) => {
  const sameYear = iso.slice(0, 4) === today().slice(0, 4)
  return fmt(iso, sameYear ? "EEE d 'de' MMM" : "EEE d 'de' MMM yyyy")
}
const relLabel = (iso: string) => {
  const n = daysUntil(iso)
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  if (n === -1) return 'Ayer'
  if (n > 1 && n < 60) return `en ${n} días`
  if (n < -1 && n > -60) return `hace ${-n} días`
  return ''
}

/** Fecha con calendario propio: atajos (hoy, mañana, sábado), días ocupados y precio por noche */
export function DateField({ label, value, onChange, icon = <CalendarIcon />, hint, error, required, requiredMsg, disabled, className, id, min, max, dayInfo, presets, clearable }: Omit<FieldCommon, 'validate' | 'valid'> & { value: string | undefined; onChange: (iso: string) => void; min?: string; max?: string; dayInfo?: (iso: string) => DayInfo | undefined; presets?: DatePreset[] | false; clearable?: boolean }) {
  const autoId = useId()
  const fid = id ?? autoId
  const boxRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const v = useValidation(value || undefined, { error, required, requiredMsg })
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) wasOpen.current = true
    else if (wasOpen.current) v.touch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const choose = (iso: string) => {
    haptic.select()
    onChange(iso)
    setTimeout(() => setOpen(false), 140)
  }
  const list = presets === false ? [] : (presets ?? defaultDatePresets()).filter((p) => (!min || p.value >= min) && (!max || p.value <= max))
  return (
    <>
      <Shell
        label={label}
        icon={icon}
        floated={!!value}
        focused={open}
        error={v.message}
        hint={hint}
        htmlFor={fid}
        disabled={disabled}
        className={className}
        asButton
        boxRef={boxRef}
        onBoxClick={(e) => {
          if ((e.target as HTMLElement).closest('.fx-btn')) return
          setOpen((o) => !o)
        }}
        trailing={
          <>
            {value && !open && relLabel(value) && <span className="mr-1 text-[12px] whitespace-nowrap text-ink-3">{relLabel(value)}</span>}
            {clearable && value && (
              <button type="button" className="fx-btn" aria-label={`Quitar ${label.toLowerCase()}`} onClick={(e) => (e.stopPropagation(), onChange(''))}>
                <X size={16} strokeWidth={1.8} />
              </button>
            )}
          </>
        }
      >
        <button type="button" id={fid} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} className="fx-value w-full text-left outline-none first-letter:uppercase">
          {value ? dateLabel(value) : ''}
        </button>
      </Shell>
      <Popover open={open} onClose={() => setOpen(false)} anchor={boxRef} width={340} title={label} label={label}>
        <div className="p-1.5">
          {list.length > 0 && <PresetChips presets={list} value={value} onPick={choose} />}
          <Calendar selected={value} onPick={choose} min={min} max={max} dayInfo={dayInfo} />
        </div>
      </Popover>
    </>
  )
}

/**
 * Rango de fechas (llegada → salida) en un solo calendario. Marca noches ocupadas, impide cruzar
 * una noche ocupada y muestra el resumen (noches, total) mientras eliges.
 */
export function DateRangeField({
  labels = ['Llegada', 'Salida'],
  start,
  end,
  onChange,
  icon = <CalendarIcon />,
  hint,
  error,
  disabled,
  className,
  min,
  max,
  dayInfo,
  summary,
  presets,
}: {
  labels?: [string, string]
  start: string | undefined
  end: string | undefined
  onChange: (start: string, end: string) => void
  icon?: ReactNode
  hint?: ReactNode
  error?: string | false | null
  disabled?: boolean
  className?: string
  min?: string
  max?: string
  /** `busy` = la noche de ese día está ocupada */
  dayInfo?: (iso: string) => DayInfo | undefined
  /** Resumen al elegir: (llegada, salida) => "2 noches · $5,550" */
  summary?: (start: string, end: string) => ReactNode
  presets?: { label: string; start: string; end: string }[]
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const isMobile = useMedia('(max-width: 767px)')
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<'start' | 'end'>('start')
  const [draft, setDraft] = useState<{ s?: string; e?: string }>({ s: start, e: end })
  const [hover, setHover] = useState<string>()
  const [warn, setWarn] = useState<string>()
  useEffect(() => {
    if (open) {
      setDraft({ s: start, e: end })
      setWarn(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const busy = (iso: string) => !!dayInfo?.(iso)?.busy
  const firstBusyFrom = (s: string) => {
    for (let i = 0; i < 400; i++) {
      const d = addDaysISO(s, i)
      if (max && d > max) return undefined
      if (busy(d)) return d
    }
    return undefined
  }
  const limit = picking === 'end' && draft.s ? firstBusyFrom(draft.s) : undefined
  const info = (iso: string): DayInfo => {
    const base = dayInfo?.(iso) ?? {}
    if (picking === 'end' && draft.s && iso > draft.s) {
      if (limit && iso > limit) return { ...base, disabled: true }
      return { ...base, disabled: false } // la salida puede caer en un día ocupado
    }
    return { ...base, disabled: base.disabled || base.busy }
  }
  const openAt = (p: 'start' | 'end') => {
    if (disabled) return
    setPicking(p)
    setOpen(true)
  }
  const pick = (iso: string) => {
    haptic.select()
    setWarn(undefined)
    if (picking === 'start' || !draft.s || iso <= draft.s) {
      if (busy(iso)) return setWarn('Esa noche ya está ocupada')
      const keepEnd = draft.e && draft.e > iso && !(firstBusyFrom(iso) && firstBusyFrom(iso)! < draft.e)
      setDraft({ s: iso, e: keepEnd ? draft.e : undefined })
      setPicking('end')
      return
    }
    if (limit && iso > limit) return setWarn(`La estancia cruza una noche ocupada (${fmt(limit, "d 'de' MMM")})`)
    setDraft({ s: draft.s, e: iso })
    onChange(draft.s, iso)
    haptic.success()
    if (!isMobile) setTimeout(() => setOpen(false), 260)
  }
  const n = draft.s && draft.e ? countNights(draft.s, draft.e) : 0
  const summaryNode = draft.s && draft.e ? (summary?.(draft.s, draft.e) ?? `${n} ${n === 1 ? 'noche' : 'noches'}`) : picking === 'end' ? 'Ahora elige la salida' : 'Elige la llegada'
  const half = (p: 'start' | 'end') => {
    const val = p === 'start' ? start : end
    const active = open && picking === p
    return (
      <button type="button" onClick={() => openAt(p)} disabled={disabled} aria-haspopup="dialog" aria-expanded={active} className={cx('relative flex min-w-0 flex-1 flex-col justify-center px-3.5 py-2 text-left transition-colors duration-[var(--dur-2)]', p === 'start' && icon && 'pl-[42px]', active && 'bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]')}>
        <span className={cx('text-[11.5px] leading-4 font-medium', active ? 'text-primary' : 'text-ink-soft')}>{labels[p === 'start' ? 0 : 1]}</span>
        <span className={cx('fx-value first-letter:uppercase', !val && 'text-ink-faint')}>{val ? dateLabel(val) : 'Elegir'}</span>
      </button>
    )
  }
  return (
    <div className={cx('min-w-0', className)}>
      <div ref={boxRef} className={cx('fx !cursor-pointer overflow-hidden', open && 'fx--focus', error && 'fx--error', disabled && 'fx--disabled', icon && 'fx--icon')}>
        {icon && <span className="fx-icon [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
        <div className="flex w-full items-stretch divide-x divide-line">
          {half('start')}
          {half('end')}
        </div>
      </div>
      <FieldMeta error={error || undefined} hint={hint} />
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={boxRef}
        width={360}
        title={picking === 'start' ? labels[0] : labels[1]}
        label="Elegir fechas"
        footer={
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="keep-truncate truncate text-[14px] font-medium">{summaryNode}</div>
              {warn ? <div className="text-xs text-danger">{warn}</div> : draft.s && <div className="keep-truncate truncate text-xs text-ink-3 first-letter:uppercase">{dateLabel(draft.s)} → {draft.e ? dateLabel(draft.e) : '…'}</div>}
            </div>
            {isMobile && (
              <Button size="sm" onClick={() => setOpen(false)} disabled={!draft.e}>
                Listo
              </Button>
            )}
          </div>
        }
      >
        <div className="p-1.5">
          {presets && presets.length > 0 && (
            <div className="no-scrollbar -mx-0.5 mb-2 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5">
              {presets.map((p) => (
                <button key={p.label} type="button" onClick={() => (haptic.select(), setDraft({ s: p.start, e: p.end }), onChange(p.start, p.end), !isMobile && setTimeout(() => setOpen(false), 200))} className="pressable inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-medium text-ink-soft ring-1 ring-line-strong ring-inset hover:text-ink">
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <Calendar rangeStart={draft.s} rangeEnd={draft.e} hover={picking === 'end' ? hover : undefined} onHover={setHover} onPick={pick} min={min} max={max} dayInfo={info} initialMonth={draft.s} />
        </div>
      </Popover>
    </div>
  )
}

// ── Hora: atajos + rueda ─────────────────────────────────
function Wheel({ items, value, onChange, format, label }: { items: number[]; value: number; onChange: (v: number) => void; format: (n: number) => string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const ITEM = 40
  const settle = useRef<number | undefined>(undefined)
  const programmatic = useRef(false)
  const idx = Math.max(0, items.indexOf(value))
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = idx * ITEM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (Math.round(el.scrollTop / ITEM) !== idx) {
      programmatic.current = true
      el.scrollTo({ top: idx * ITEM, behavior: 'smooth' })
      const t = setTimeout(() => (programmatic.current = false), 420)
      return () => clearTimeout(t)
    }
  }, [idx])
  const onScroll = () => {
    clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const el = ref.current
      if (!el || programmatic.current) return
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)))
      if (items[i] !== value) {
        haptic.select()
        onChange(items[i]!)
      }
    }, 110)
  }
  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') (e.preventDefault(), onChange(items[Math.min(items.length - 1, idx + 1)]!))
        if (e.key === 'ArrowUp') (e.preventDefault(), onChange(items[Math.max(0, idx - 1)]!))
      }}
      className="wheel relative h-[200px] w-[76px] overflow-y-auto rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ paddingBlock: 80 }}
    >
      {items.map((n, i) => (
        <button key={n} type="button" role="option" aria-selected={n === value} tabIndex={-1} onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })} className={cx('flex h-10 w-full snap-center items-center justify-center text-[21px] tabular transition-colors duration-[var(--dur-2)]', n === value ? 'font-semibold text-ink' : 'text-ink-3')}>
          {format(n)}
        </button>
      ))}
    </div>
  )
}

/** Hora con atajos (los horarios de siempre) y una rueda de horas y minutos */
export function TimeField({ label, value, onChange, icon = <Clock />, hint, error, required, requiredMsg, disabled, className, id, presets, step = 15, defaultTime = '12:00', clearable }: Omit<FieldCommon, 'validate' | 'valid'> & { value: string | undefined; onChange: (hhmm: string) => void; presets?: string[]; step?: 5 | 10 | 15 | 30; defaultTime?: string; clearable?: boolean }) {
  const autoId = useId()
  const fid = id ?? autoId
  const boxRef = useRef<HTMLDivElement>(null)
  const isMobile = useMedia('(max-width: 767px)')
  const [open, setOpen] = useState(false)
  const v = useValidation(value || undefined, { error, required, requiredMsg })
  const cur = value || defaultTime
  const [h = 12, mRaw = 0] = cur.split(':').map(Number)
  const minutes = useMemo(() => Array.from({ length: 60 / step }, (_, i) => i * step), [step])
  const m = minutes.reduce((a, b) => (Math.abs(b - mRaw) < Math.abs(a - mRaw) ? b : a), 0)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      if (!value) onChange(defaultTime)
    } else if (wasOpen.current) v.touch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return (
    <>
      <Shell
        label={label}
        icon={icon}
        floated={!!value}
        focused={open}
        error={v.message}
        hint={hint}
        htmlFor={fid}
        disabled={disabled}
        className={className}
        asButton
        boxRef={boxRef}
        onBoxClick={(e) => {
          if ((e.target as HTMLElement).closest('.fx-btn')) return
          setOpen((o) => !o)
        }}
        trailing={
          <>
            {value && <span className="mr-1 text-[12px] whitespace-nowrap text-ink-3">{ampm(value)}</span>}
            {clearable && value && (
              <button type="button" className="fx-btn" aria-label={`Quitar ${label.toLowerCase()}`} onClick={(e) => (e.stopPropagation(), onChange(''))}>
                <X size={16} strokeWidth={1.8} />
              </button>
            )}
          </>
        }
      >
        <button type="button" id={fid} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} className="fx-value w-full text-left tabular outline-none">
          {value ?? ''}
        </button>
      </Shell>
      <Popover open={open} onClose={() => setOpen(false)} anchor={boxRef} width={300} title={label} label={label} footer={isMobile ? <Button className="w-full" onClick={() => setOpen(false)}>Listo · {cur}</Button> : undefined}>
        <div className="p-1.5">
          {presets && presets.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button key={p} type="button" onClick={() => (haptic.select(), onChange(p), !isMobile && setTimeout(() => setOpen(false), 140))} className={cx('pressable inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium tabular ring-1 ring-inset', value === p ? 'bg-ink text-paper ring-ink' : 'text-ink-soft ring-line-strong hover:text-ink')}>
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="relative flex items-center justify-center gap-1">
            <div aria-hidden className="pointer-events-none absolute inset-x-6 top-1/2 h-10 -translate-y-1/2 rounded-[10px] bg-sunken" />
            <Wheel items={Array.from({ length: 24 }, (_, i) => i)} value={h} onChange={(nh) => onChange(`${pad(nh)}:${pad(m)}`)} format={pad} label="Hora" />
            <span className="relative pb-1 text-xl font-semibold text-ink-3">:</span>
            <Wheel items={minutes} value={m} onChange={(nm) => onChange(`${pad(h)}:${pad(nm)}`)} format={pad} label="Minutos" />
          </div>
        </div>
      </Popover>
    </>
  )
}

// ── Notas: crecen solas, se dictan y tienen atajos ───────
type SpeechCtor = new () => { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: (e: any) => void; onend: () => void; onerror: (e: any) => void }
const speechCtor = (): SpeechCtor | undefined => (typeof window === 'undefined' ? undefined : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition))

export function NotesField({ label, value, onChange, icon, hint, error, required, requiredMsg, disabled, className, id, placeholder, maxLength, minRows = 3, maxRows = 12, templates, dictation = true, autoFocus }: Omit<FieldCommon, 'validate' | 'valid'> & { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; minRows?: number; maxRows?: number; /** Frases rápidas que se agregan con un toque */ templates?: string[]; dictation?: boolean; autoFocus?: boolean }) {
  const autoId = useId()
  const fid = id ?? autoId
  const ref = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)
  const [listening, setListening] = useState(false)
  const [speechError, setSpeechError] = useState<string>()
  const recRef = useRef<InstanceType<SpeechCtor> | null>(null)
  const baseRef = useRef('')
  const valueRef = useRef(value)
  valueRef.current = value
  const v = useValidation(value, { error, required, requiredMsg })
  const Speech = dictation ? speechCtor() : undefined
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 24
    el.style.height = 'auto'
    el.style.height = `${Math.min(maxRows * lh, Math.max(minRows * lh, el.scrollHeight))}px`
  }, [value, minRows, maxRows])
  useEffect(() => () => recRef.current?.stop(), [])
  const limit = (s: string) => (maxLength ? s.slice(0, maxLength) : s)
  const toggleDictation = () => {
    if (!Speech) return
    if (listening) return recRef.current?.stop()
    setSpeechError(undefined)
    const rec = new Speech()
    rec.lang = 'es-MX'
    rec.interimResults = true
    rec.continuous = true
    baseRef.current = valueRef.current ? valueRef.current.replace(/\s*$/, ' ') : ''
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t: string = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          const clean = t.trim()
          const startOfSentence = !baseRef.current.trim() || /[.!?]\s*$/.test(baseRef.current)
          baseRef.current += (startOfSentence ? clean.charAt(0).toUpperCase() + clean.slice(1) : clean) + ' '
        } else interim += t
      }
      onChange(limit(baseRef.current + interim))
    }
    rec.onend = () => {
      setListening(false)
      onChange(limit(baseRef.current.trimEnd()))
    }
    rec.onerror = (e: any) => {
      setListening(false)
      setSpeechError(e?.error === 'not-allowed' || e?.error === 'service-not-allowed' ? 'Permite el micrófono para dictar' : 'No se pudo escuchar: intenta de nuevo')
    }
    try {
      rec.start()
      recRef.current = rec
      setListening(true)
      haptic.light()
    } catch {
      setSpeechError('No se pudo usar el micrófono')
    }
  }
  return (
    <Shell
      label={label}
      icon={icon}
      floated={focused || !!value || listening}
      focused={focused || listening}
      error={v.message}
      ok={v.ok}
      hint={speechError ? <span className="text-danger">{speechError}</span> : listening ? <span className="inline-flex items-center gap-1.5 text-primary"><span className="pulse-dot relative inline-block h-2 w-2 rounded-full bg-chispa text-chispa" /> Escuchando… habla con calma</span> : hint}
      meta={maxLength ? `${value.length}/${maxLength}` : undefined}
      htmlFor={fid}
      multiline
      disabled={disabled}
      className={className}
      onBoxPointerDown={focusFrom(ref)}
      trailing={
        Speech && (
          <button type="button" onClick={toggleDictation} className={cx('fx-btn', listening && '!bg-[color-mix(in_oklab,var(--chispa)_14%,transparent)] !text-chispa')} aria-label={listening ? 'Detener dictado' : 'Dictar con la voz'} aria-pressed={listening} title={listening ? 'Detener' : 'Dictar'}>
            {listening ? <Square size={14} strokeWidth={2} fill="currentColor" /> : <Mic size={17} strokeWidth={1.7} />}
          </button>
        )
      }
      after={
        templates &&
        templates.length > 0 && (
          <SuggestionChips
            items={templates}
            prefix={<Plus size={13} strokeWidth={1.8} />}
            onPick={(t) => {
              haptic.select()
              onChange(limit(value.trim() ? `${value.replace(/\s*$/, '')}\n${t}` : t))
            }}
          />
        )
      }
    >
      <textarea
        ref={ref}
        id={fid}
        className="fx-input"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled}
        rows={minRows}
        aria-invalid={!!v.message || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          v.touch()
        }}
        onChange={(e) => onChange(e.target.value)}
      />
    </Shell>
  )
}

// ── Etiquetas ────────────────────────────────────────────
/** Lista de etiquetas: escribe y Enter (o coma) para agregar; borrar quita la última */
export function TagInput({ label, value, onChange, icon, hint, error, disabled, className, id, suggestions = [], placeholder = 'Escribe y presiona Enter', max }: Omit<FieldCommon, 'validate' | 'valid' | 'required' | 'requiredMsg'> & { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string; max?: number }) {
  const autoId = useId()
  const fid = id ?? autoId
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, '')
    if (!t || value.some((x) => norm(x) === norm(t)) || (max && value.length >= max)) return setText('')
    haptic.select()
    onChange([...value, t])
    setText('')
  }
  const sugg = suggestions.filter((s) => !value.some((x) => norm(x) === norm(s)) && (!text || norm(s).includes(norm(text)))).slice(0, 6)
  return (
    <Shell
      label={label}
      icon={icon}
      floated={focused || value.length > 0 || !!text}
      focused={focused}
      error={error || undefined}
      hint={hint}
      meta={max ? `${value.length}/${max}` : undefined}
      htmlFor={fid}
      disabled={disabled}
      className={className}
      onBoxPointerDown={focusFrom(ref)}
      after={(focused || !value.length) && sugg.length > 0 && <SuggestionChips items={sugg} prefix={<Plus size={13} strokeWidth={1.8} />} onPick={add} />}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 pt-0.5">
        <AnimatePresence initial={false}>
          {value.map((t) => (
            <motion.span key={t} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="inline-flex h-7 items-center gap-1 rounded-full bg-sunken pr-1 pl-2.5 text-[13px] text-ink ring-1 ring-line ring-inset">
              {t}
              <button type="button" aria-label={`Quitar ${t}`} onPointerDown={(e) => e.preventDefault()} onClick={() => onChange(value.filter((x) => x !== t))} className="flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:bg-wash hover:text-ink">
                <X size={12} strokeWidth={2} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          ref={ref}
          id={fid}
          className="fx-input min-w-[8ch] flex-1"
          value={text}
          disabled={disabled}
          placeholder={focused ? placeholder : ''}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            if (text.trim()) add(text)
          }}
          onChange={(e) => {
            const t = e.target.value
            if (t.endsWith(',')) add(t)
            else setText(t)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.preventDefault(), add(text))
            if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
        />
      </div>
    </Shell>
  )
}

// ── Búsqueda (barra de herramientas) ─────────────────────
/** Barra de búsqueda en forma de pill. Con `shortcut`, la tecla "/" la enfoca. */
export function SearchField({ value, onChange, placeholder = 'Buscar…', className, autoFocus, shortcut, onEnter, label = 'Buscar' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean; shortcut?: boolean; onEnter?: () => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!shortcut) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/input|textarea|select/i.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])
  return (
    <label className={cx('group relative flex h-11 min-w-0 items-center rounded-full bg-surface ring-1 ring-line-strong transition-[box-shadow] duration-[var(--dur-2)] ring-inset focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_14%,transparent),0_0_20px_color-mix(in_oklab,var(--luz)_40%,transparent)] focus-within:ring-primary hover:ring-[color-mix(in_oklab,var(--ink)_34%,transparent)] pointer-fine:h-10', className)}>
      <Search size={17} strokeWidth={1.7} className="pointer-events-none ml-3.5 shrink-0 text-ink-3 transition-colors group-focus-within:text-primary" />
      <span className="sr-only">{label}</span>
      <input
        ref={ref}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) (e.preventDefault(), onEnter())
          if (e.key === 'Escape' && value) (e.stopPropagation(), onChange(''))
        }}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-base outline-none placeholder:text-ink-faint pointer-fine:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" onClick={() => (onChange(''), ref.current?.focus())} className="fx-btn mr-1.5" aria-label="Borrar búsqueda">
          <X size={16} strokeWidth={1.8} />
        </button>
      ) : (
        shortcut && <kbd className="mr-3 hidden rounded-md bg-sunken px-1.5 py-0.5 text-[10.5px] font-medium text-detail pointer-fine:inline">/</kbd>
      )}
    </label>
  )
}

// ── Deslizador ───────────────────────────────────────────
/** Deslizador con la luz como perilla y la cifra arriba mientras se arrastra (simuladores, cotización en vivo) */
export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, format = String, hint, className, marks }: { label?: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; format?: (n: number) => string; hint?: ReactNode; className?: string; marks?: { value: number; label: string }[] }) {
  const [active, setActive] = useState(false)
  const pct = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-ink">{label}</span>
          <span className="text-[15px] font-semibold tabular">{format(value)}</span>
        </div>
      )}
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundImage: 'linear-gradient(90deg, var(--sky-3), var(--chispa-soft))' }} />
        </div>
        <div className={cx('pointer-events-none absolute top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface ring-1 ring-line-strong transition-shadow duration-[var(--dur-2)]', active ? 'shadow-[0_0_0_6px_color-mix(in_oklab,var(--luz)_35%,transparent),0_0_18px_var(--luz)]' : 'shadow-[var(--shadow-2)]')} style={{ left: `${pct}%` }}>
          <span className="absolute inset-[5px] rounded-full bg-[color-mix(in_oklab,var(--luz)_70%,var(--chispa-soft))]" />
          <AnimatePresence>
            {active && (
              <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="absolute bottom-[30px] left-1/2 -translate-x-1/2 rounded-full bg-night px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-on-night tabular shadow-[var(--shadow-2)]">
                {format(value)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          aria-valuetext={format(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={() => setActive(true)}
          onPointerUp={() => setActive(false)}
          onPointerCancel={() => setActive(false)}
          onBlur={() => setActive(false)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      {marks && (
        <div className="relative mt-0.5 h-4 text-[11px] text-ink-3">
          {marks.map((mk) => (
            <span key={mk.value} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((mk.value - min) / (max - min)) * 100}%` }}>
              {mk.label}
            </span>
          ))}
        </div>
      )}
      {hint && <FieldMeta hint={hint} />}
    </div>
  )
}

// ── Guardado automático ──────────────────────────────────
export type SaveStatus = 'idle' | 'saving' | 'saved'

/**
 * Guarda solo, poco después de dejar de escribir (y al cerrar, si quedó algo pendiente).
 * Úsalo al editar algo que ya existe; para crear algo nuevo deja un botón "Guardar".
 */
export function useAutosave<T>(value: T, save: (v: T) => void, { delay = 700, enabled = true }: { delay?: number; enabled?: boolean } = {}): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const saveRef = useRef(save)
  saveRef.current = save
  const first = useRef(true)
  const pending = useRef<{ v: T } | null>(null)
  const key = JSON.stringify(value)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!enabled) return
    pending.current = { v: value }
    setStatus('saving')
    const t = setTimeout(() => {
      if (pending.current) saveRef.current(pending.current.v)
      pending.current = null
      setStatus('saved')
    }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  useEffect(() => {
    if (status !== 'saved') return
    const t = setTimeout(() => setStatus('idle'), 2200)
    return () => clearTimeout(t)
  }, [status])
  useEffect(
    () => () => {
      if (pending.current) saveRef.current(pending.current.v)
    },
    [],
  )
  return status
}

/** "Guardando…" con puntos de luz → "Guardado ✦" */
export function SaveState({ status, className }: { status: SaveStatus; className?: string }) {
  return (
    <span aria-live="polite" className={cx('inline-flex h-6 items-center text-xs text-ink-3', className)}>
      <AnimatePresence mode="wait" initial={false}>
        {status === 'saving' && (
          <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5">
            <LightDots className="scale-75 text-chispa-soft" /> Guardando…
          </motion.span>
        )}
        {status === 'saved' && (
          <motion.span key="ok" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-ink-soft">
            <Sparkle className="text-[10px] text-chispa-soft" /> Guardado
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

// ── Pasos de un formulario largo ─────────────────────────
/** Indicador de pasos (1 · 2 · 3) con línea que se llena; los pasos hechos se pueden volver a tocar */
export function StepTrail({ steps, current, onStep, className }: { steps: string[]; current: number; onStep?: (i: number) => void; className?: string }) {
  return (
    <ol className={cx('flex items-center gap-2', className)}>
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s} className={cx('flex min-w-0 items-center gap-2', i < steps.length - 1 && 'flex-1')}>
            <button type="button" disabled={!onStep || i > current} onClick={() => onStep?.(i)} className="flex min-w-0 items-center gap-2 disabled:cursor-default" aria-current={active ? 'step' : undefined}>
              <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold transition-[background-color,box-shadow] duration-[var(--dur-3)]', done ? 'bg-primary text-on-primary' : active ? 'bg-ink text-paper shadow-[0_0_0_4px_color-mix(in_oklab,var(--luz)_40%,transparent)]' : 'bg-sunken text-ink-3 ring-1 ring-line ring-inset')}>
                {done ? <CheckDraw size={14} strokeWidth={2.8} /> : i + 1}
              </span>
              <span className={cx('truncate text-[13px] font-medium', active ? 'text-ink' : 'text-ink-3', !active && 'max-sm:hidden')}>{s}</span>
            </button>
            {i < steps.length - 1 && (
              <span className="relative h-[2px] min-w-4 flex-1 overflow-hidden rounded-full bg-line">
                <motion.span className="absolute inset-y-0 left-0 bg-primary" initial={false} animate={{ width: done ? '100%' : '0%' }} transition={{ duration: 0.42, ease: ease.calma }} />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

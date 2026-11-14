// Campos inteligentes (los mismos del PWA, en versión para la Mac): etiqueta flotante, halo de luz al
// enfocar, el error explicado en español y una palomita cuando el dato ya está bien.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react'
import { ease } from '@/lib/motion'
import { CheckDraw, cx } from './ui'
import { DIAS_CORTOS, dia, diaSemana, inicioDeMes, masDias, mesLargo, noches as contarNoches } from '@/lib/fechas'
import type { ISODate } from '@/lib/tipos'

interface Comun {
  label: string
  icon?: ReactNode
  hint?: ReactNode
  error?: string | null
  ok?: boolean
  className?: string
  disabled?: boolean
}

function Caja({ label, icon, hint, error, ok, className, disabled, floated, focused, multiline, children, trailing, meta, htmlFor }: Comun & { floated: boolean; focused: boolean; multiline?: boolean; children: ReactNode; trailing?: ReactNode; meta?: ReactNode; htmlFor: string }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className={cx('min-w-0', className)}>
      <div
        ref={ref}
        className={cx('fx', focused && 'fx--focus', error && 'fx--error', disabled && 'fx--disabled', multiline && 'fx--multi', icon && 'fx--icon')}
        onPointerDown={(e) => {
          const t = e.target as HTMLElement
          if (t.closest('button, a, input, textarea')) return
          e.preventDefault()
          ref.current?.querySelector<HTMLElement>('input, textarea')?.focus()
        }}
      >
        {icon && <span className="fx-icon [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
        <label htmlFor={htmlFor} className={cx('fx-label', floated && 'fx-label--up')}>
          {label}
        </label>
        <div className="fx-body">{children}</div>
        <div className="fx-trail">
          {trailing}
          <AnimatePresence initial={false}>
            {ok && !focused && !error && (
              <motion.span key="ok" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, transition: { duration: 0.24, ease: ease.calma } }} exit={{ opacity: 0 }} className="mr-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-success" aria-hidden>
                <CheckDraw size={14} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {(error || hint || meta) && (
          <motion.div key="meta" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', transition: { duration: 0.24, ease: ease.calma } }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
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
    </div>
  )
}

const Borrar = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button type="button" tabIndex={-1} className="fx-btn" aria-label={`Borrar ${label.toLowerCase()}`} onPointerDown={(e) => e.preventDefault()} onClick={onClick}>
    <X size={16} strokeWidth={1.8} />
  </button>
)

/** Texto de una línea */
export function Campo({ value, onChange, placeholder, type = 'text', autoFocus, maxLength, onEnter, onBlur, inputMode, autoComplete, counter, trailing, ...c }: Comun & { value: string; onChange: (v: string) => void; placeholder?: string; type?: 'text' | 'email' | 'password' | 'url' | 'tel'; autoFocus?: boolean; maxLength?: number; onEnter?: () => void; onBlur?: () => void; inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url'; autoComplete?: string; counter?: boolean; trailing?: ReactNode }) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  return (
    <Caja
      {...c}
      htmlFor={id}
      floated={focused || !!value}
      focused={focused}
      meta={counter && maxLength ? `${value.length}/${maxLength}` : undefined}
      trailing={
        <>
          {value && focused && !c.disabled && type !== 'password' && <Borrar label={c.label} onClick={() => onChange('')} />}
          {trailing}
        </>
      }
    >
      <input
        id={id}
        className="fx-input"
        value={value}
        type={type}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        spellCheck={type === 'text'}
        disabled={c.disabled}
        aria-invalid={!!c.error || undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          onBlur?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault()
            onEnter()
          }
        }}
      />
    </Caja>
  )
}

/** Texto largo que crece mientras se escribe */
export function CampoLargo({ value, onChange, placeholder, maxLength, minRows = 3, ...c }: Comun & { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; minRows?: number }) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 520)}px`
  }, [value])
  return (
    <Caja {...c} htmlFor={id} floated={focused || !!value} focused={focused} multiline meta={maxLength && value.length > maxLength * 0.8 ? `${value.length}/${maxLength}` : undefined}>
      <textarea
        ref={ref}
        id={id}
        rows={minRows}
        className="fx-input resize-none py-1 leading-relaxed"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={c.disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </Caja>
  )
}

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })
/** Pesos con separadores mientras se escribe: 12500 → «12,500» */
export function CampoDinero({ value, onChange, placeholder, autoFocus, onEnter, ...c }: Comun & { value: number | null; onChange: (v: number | null) => void; placeholder?: string; autoFocus?: boolean; onEnter?: () => void }) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const [texto, setTexto] = useState(value == null ? '' : nf.format(value))
  useEffect(() => {
    if (!focused) setTexto(value == null ? '' : nf.format(value))
  }, [value, focused])
  return (
    <Caja {...c} htmlFor={id} floated={focused || !!texto} focused={focused} trailing={texto && focused ? <Borrar label={c.label} onClick={() => (setTexto(''), onChange(null))} /> : undefined}>
      {(focused || texto) && <span className="fx-affix">$</span>}
      <input
        id={id}
        className="fx-input tabular"
        inputMode="decimal"
        value={texto}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={c.disabled}
        onChange={(e) => {
          let limpio = e.target.value.replace(/[^\d.]/g, '')
          const i = limpio.indexOf('.')
          if (i >= 0) limpio = limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/\./g, '').slice(0, 2)
          if (!limpio) {
            setTexto('')
            onChange(null)
            return
          }
          const [ent = '', dec] = limpio.split('.')
          const n = Number(ent || '0')
          setTexto(nf.format(n) + (dec !== undefined ? '.' + dec : ''))
          onChange(Number(dec ? `${n}.${dec}` : n))
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter && (e.preventDefault(), onEnter())}
      />
    </Caja>
  )
}

/** «33 1234 5678»: guarda solo los dígitos */
export function formatoTelefono(v: string | null | undefined) {
  const d = (v ?? '').replace(/\D/g, '')
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`
  if (d.length === 12 && d.startsWith('52')) return `+52 ${d.slice(2, 4)} ${d.slice(4, 8)} ${d.slice(8)}`
  return v ?? ''
}
export function CampoTelefono({ value, onChange, ...c }: Comun & { value: string; onChange: (digitos: string) => void }) {
  const d = value.replace(/\D/g, '')
  const error = c.error ?? (d && d.length !== 10 && d.length < 12 ? 'Un WhatsApp de México tiene 10 dígitos' : null)
  return <Campo {...c} error={error} ok={d.length === 10 || d.length === 12} value={formatoTelefono(value)} inputMode="tel" type="tel" autoComplete="tel" onChange={(v) => onChange(v.replace(/\D/g, '').slice(0, 13))} />
}

/** Número con − y + (personas, noches, horas) */
export function Contador({ label, value, onChange, min = 0, max = 99, sufijo, hint, className }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; sufijo?: (n: number) => string; hint?: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      {/* Si no cabe en un renglón, los botones bajan completos: nunca se salen de la caja */}
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 rounded-[var(--r-md)] bg-surface px-3.5 py-1 ring-1 ring-line-strong ring-inset">
        <span className="text-[13px] font-medium text-ink-soft">{label}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label={`Menos ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="pressable flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink disabled:opacity-35">
            <Minus size={15} strokeWidth={2} />
          </button>
          <span className={cx('text-center text-[15px] font-semibold whitespace-nowrap tabular', sufijo ? 'min-w-[4.5rem]' : 'min-w-7')}>{sufijo ? sufijo(value) : value}</span>
          <button type="button" aria-label={`Más ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="pressable flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink disabled:opacity-35">
            <Plus size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
      {hint && <div className="fx-meta text-ink-soft">{hint}</div>}
    </div>
  )
}

/** Opciones como pastillas (una sola) */
export function Pastillas<T extends string>({ value, onChange, opciones, label, className }: { value: T | null; onChange: (v: T) => void; opciones: { value: T; label: ReactNode; detalle?: string }[]; label?: string; className?: string }) {
  return (
    <div className={className}>
      {label && <div className="mb-2 text-[13px] font-medium text-ink-soft">{label}</div>}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {opciones.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            title={o.detalle}
            onClick={() => onChange(o.value)}
            className={cx('pressable inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-inset transition-colors duration-[var(--dur-2)]', value === o.value ? 'bg-ink text-paper ring-ink' : 'bg-surface text-ink-soft ring-line-strong hover:text-ink')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Varias etiquetas (amenidades): Enter agrega, × quita, sugerencias con un clic */
export function Etiquetas({ value, onChange, sugerencias = [], label, placeholder = 'Escribe y presiona Enter' }: { value: string[]; onChange: (v: string[]) => void; sugerencias?: string[]; label: string; placeholder?: string }) {
  const [texto, setTexto] = useState('')
  const agregar = (t: string) => {
    const limpio = t.trim()
    if (!limpio || value.some((v) => v.toLowerCase() === limpio.toLowerCase())) return setTexto('')
    onChange([...value, limpio])
    setTexto('')
  }
  const faltan = sugerencias.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
  return (
    <div>
      <div className="mb-2 text-[13px] font-medium text-ink-soft">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--r-md)] bg-surface p-2 ring-1 ring-line-strong ring-inset focus-within:ring-primary">
        {value.map((v) => (
          <span key={v} className="inline-flex h-8 items-center gap-1 rounded-full bg-sunken pr-1 pl-3 text-[13px]">
            {v}
            <button type="button" aria-label={`Quitar ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="flex h-6 w-6 items-center justify-center rounded-full text-ink-3 hover:bg-wash hover:text-ink">
              <X size={13} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              agregar(texto)
            } else if (e.key === 'Backspace' && !texto && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => agregar(texto)}
          placeholder={value.length ? '' : placeholder}
          className="h-8 min-w-[10rem] flex-1 bg-transparent px-2 text-[14px] outline-none placeholder:text-ink-3"
        />
      </div>
      {faltan.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {faltan.slice(0, 10).map((s) => (
            <button key={s} type="button" onClick={() => onChange([...value, s])} className="pressable inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] text-ink-soft ring-1 ring-line ring-inset hover:bg-wash hover:text-ink">
              <Plus size={12} strokeWidth={2} /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Calendario para elegir llegada y salida ─────────────────
export type EstadoDia = 'ocupado' | 'cerrado' | 'libre'

/**
 * Dos meses lado a lado. El primer clic marca la llegada y el segundo la salida.
 * Las noches ocupadas no se pueden elegir; el día de salida de otra reserva sí sirve como llegada.
 */
export function RangoFechas({ llegada, salida, onChange, hoy, ocupacion, minimo = 1 }: { llegada: ISODate | null; salida: ISODate | null; onChange: (llegada: ISODate | null, salida: ISODate | null) => void; hoy: ISODate; ocupacion?: (iso: ISODate) => EstadoDia; minimo?: number }) {
  const [mes, setMes] = useState(() => inicioDeMes(llegada ?? hoy))
  const [sobre, setSobre] = useState<ISODate | null>(null)
  const eligiendoSalida = !!llegada && !salida
  const estado = (iso: ISODate) => ocupacion?.(iso) ?? 'libre'
  /** ¿Se puede ir de llegada a fin sin pasar por una noche ocupada? */
  const libreHasta = (a: ISODate, b: ISODate) => {
    for (let d = a; d < b; d = masDias(d, 1)) if (estado(d) !== 'libre') return false
    return true
  }
  const pick = (iso: ISODate) => {
    if (eligiendoSalida && iso > llegada! && libreHasta(llegada!, iso)) return onChange(llegada, iso)
    if (estado(iso) !== 'libre') return
    onChange(iso, null)
  }
  const meses = [mes, siguienteMes(mes)]
  const n = llegada && (salida || (eligiendoSalida && sobre && sobre > llegada ? sobre : null)) ? contarNoches(llegada, salida ?? sobre!) : 0
  return (
    <div className="interfaz">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Mes anterior" onClick={() => setMes(siguienteMes(mes, -1))} className="pressable flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink">
          <ChevronLeft size={17} />
        </button>
        <span className="text-[13px] text-ink-3">
          {eligiendoSalida ? 'Ahora elige el día de salida' : llegada && salida ? `${n} ${n === 1 ? 'noche' : 'noches'}${n < minimo ? ` · el mínimo es de ${minimo}` : ''}` : 'Elige el día de llegada'}
        </span>
        <button type="button" aria-label="Mes siguiente" onClick={() => setMes(siguienteMes(mes))} className="pressable flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink">
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-5" onPointerLeave={() => setSobre(null)}>
        {meses.map((m) => (
          <Mes key={m} mes={m} hoy={hoy} llegada={llegada} salida={salida ?? (eligiendoSalida ? sobre : null)} estado={estado} onPick={pick} onSobre={setSobre} eligiendoSalida={eligiendoSalida} libreHasta={libreHasta} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[color-mix(in_oklab,var(--ink)_14%,transparent)]" /> Ocupada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rayas h-2.5 w-2.5 rounded-full text-ink-3 ring-1 ring-line-strong" /> Cerrada
        </span>
        {(llegada || salida) && (
          <button type="button" onClick={() => onChange(null, null)} className="ml-auto text-ink-soft underline-offset-2 hover:text-ink hover:underline">
            Borrar fechas
          </button>
        )}
      </div>
    </div>
  )
}

function siguienteMes(mes: ISODate, n = 1): ISODate {
  const [y, m] = mes.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

function Mes({ mes, hoy, llegada, salida, estado, onPick, onSobre, eligiendoSalida, libreHasta }: { mes: ISODate; hoy: ISODate; llegada: ISODate | null; salida: ISODate | null; estado: (iso: ISODate) => EstadoDia; onPick: (iso: ISODate) => void; onSobre: (iso: ISODate | null) => void; eligiendoSalida: boolean; libreHasta: (a: ISODate, b: ISODate) => boolean }) {
  const dias = useMemo(() => {
    const ini = mes
    const vacios = (diaSemana(ini) + 6) % 7 // la semana empieza en lunes
    const out: (ISODate | null)[] = Array.from({ length: vacios }, () => null)
    for (let d = ini; d.slice(0, 7) === mes.slice(0, 7); d = masDias(d, 1)) out.push(d)
    return out
  }, [mes])
  return (
    <div>
      <div className="mb-1.5 text-center text-[14px] font-semibold capitalize">
        {mesLargo(mes)} {mes.slice(0, 4)}
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-ink-3">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <span key={d} className="py-1">
            {DIAS_CORTOS[d]!.slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {dias.map((iso, i) => {
          if (!iso) return <span key={`v${i}`} />
          const e = estado(iso)
          const pasado = iso < hoy
          const enRango = llegada && salida && iso > llegada && iso < salida
          const extremo = iso === llegada || iso === salida
          const puedeSalida = eligiendoSalida && iso > llegada! && libreHasta(llegada!, iso)
          const deshabilitado = pasado || (eligiendoSalida ? !puedeSalida && e !== 'libre' : e !== 'libre')
          return (
            <button
              key={iso}
              type="button"
              disabled={deshabilitado}
              onClick={() => onPick(iso)}
              onPointerEnter={() => onSobre(iso)}
              aria-label={`${dia(iso)} ${mesLargo(iso)}${e === 'ocupado' ? ', ocupada' : e === 'cerrado' ? ', cerrada' : ''}`}
              aria-pressed={extremo}
              className={cx(
                'relative h-9 text-[13px] tabular transition-colors duration-[var(--dur-1)]',
                enRango && 'bg-[color-mix(in_oklab,var(--primary)_14%,transparent)]',
                iso === llegada && salida && 'rounded-l-full bg-[color-mix(in_oklab,var(--primary)_14%,transparent)]',
                iso === salida && llegada && 'rounded-r-full bg-[color-mix(in_oklab,var(--primary)_14%,transparent)]',
                deshabilitado ? 'cursor-default text-ink-faint' : 'text-ink',
              )}
            >
              <span
                className={cx(
                  'mx-auto flex h-9 w-9 items-center justify-center rounded-full',
                  extremo && 'bg-primary font-semibold text-on-primary shadow-[0_0_14px_color-mix(in_oklab,var(--luz)_55%,transparent)]',
                  !extremo && !deshabilitado && 'hover:bg-wash',
                  !extremo && e === 'ocupado' && !pasado && 'bg-[color-mix(in_oklab,var(--ink)_9%,transparent)] line-through decoration-ink-3/60',
                  !extremo && e === 'cerrado' && !pasado && 'rayas text-ink-3',
                  iso === hoy && !extremo && 'font-semibold text-key ring-1 ring-[color-mix(in_oklab,var(--chispa)_45%,transparent)] ring-inset',
                )}
              >
                {dia(iso)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

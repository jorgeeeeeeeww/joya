import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Delete } from 'lucide-react'
import { cx } from './ui'
import { ease, haptic } from '@/lib/motion'

export function PinPad({ length = 4, onComplete, error, hint }: { length?: number; onComplete: (pin: string) => boolean | void; error?: string; hint?: string }) {
  const [pin, setPin] = useState('')
  const [bad, setBad] = useState(false)
  // Ref para no perder dígitos cuando se teclea más rápido que el render
  const pinRef = useRef('')
  pinRef.current = pin

  const press = (d: string) => {
    if (pinRef.current.length >= length) return
    const next = pinRef.current + d
    pinRef.current = next
    setPin(next)
    haptic.select()
    if (next.length === length) {
      setTimeout(() => {
        const ok = onComplete(next)
        if (ok === false) {
          setBad(true)
          haptic.warning()
          setTimeout(() => {
            setPin('')
            setBad(false)
          }, 700)
        }
      }, 120)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 flex gap-4" aria-label={`${pin.length} de ${length} dígitos`}>
        {Array.from({ length }).map((_, i) => (
          <motion.span
            key={i}
            animate={{ scale: i < pin.length ? 1 : 0.86, opacity: i < pin.length ? 1 : 0.55 }}
            transition={{ duration: 0.28, ease: ease.calma }}
            className={cx('h-3.5 w-3.5 rounded-full transition-colors duration-[var(--dur-3)]', bad ? 'bg-danger' : i < pin.length ? 'bg-ink shadow-[0_0_12px_var(--luz)]' : 'ring-[1.5px] ring-line-strong ring-inset')}
          />
        ))}
      </div>
      <p className={cx('mb-7 h-5 text-sm transition-colors', bad || error ? 'text-danger' : 'text-ink-soft')} role={bad ? 'alert' : undefined}>
        {bad ? 'Ese PIN no coincide. Intenta de nuevo.' : error || hint || ''}
      </p>
      <div className="grid grid-cols-3 gap-x-5 gap-y-3.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <span />
        <Key onClick={() => press('0')}>0</Key>
        <button aria-label="Borrar" onClick={() => setPin((p) => p.slice(0, -1))} className="pressable flex h-[72px] w-[72px] items-center justify-center rounded-full text-ink-soft hover:bg-wash">
          <Delete size={24} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  )
}

function Key({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pressable heading h-[72px] w-[72px] rounded-full bg-surface text-[28px] shadow-[var(--shadow-1)] ring-1 ring-line hover:shadow-[var(--shadow-2)] active:bg-[color-mix(in_oklab,var(--luz)_45%,var(--surface))]"
    >
      {children}
    </button>
  )
}

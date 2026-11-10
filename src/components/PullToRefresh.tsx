// Deslizar hacia abajo para sincronizar y buscar versión nueva.
// La app instalada en iPhone no tiene botón de recargar: este gesto lo reemplaza (sin recargar la página).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { syncNow } from '@/lib/sync'
import { checkForUpdate } from '@/lib/pwa'
import { cx } from './ui'

const THRESHOLD = 72
const MAX = 120

type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'done'

/** Elementos donde arrastrar significa otra cosa (mapas, firmas, campos, hojas abiertas) */
const BLOCKED = 'canvas, input, textarea, select, [contenteditable="true"], [role="dialog"], [data-no-pull], [data-ocupado]'

export function PullToRefresh({ target, disabled }: { target: RefObject<HTMLElement | null>; disabled?: boolean }) {
  const [pull, setPull] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const busy = useRef(false)

  useEffect(() => {
    const el = target.current
    if (!el || disabled || !window.matchMedia?.('(pointer: coarse)').matches) return
    let startY = 0
    let startX = 0
    let tracking = false
    let engaged = false
    let dist = 0

    const reset = () => {
      tracking = false
      engaged = false
      dist = 0
      setPull(0)
      setPhase('idle')
    }
    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || el.scrollTop > 0) return
      if (e.target instanceof Element && e.target.closest(BLOCKED)) return
      startY = e.touches[0]!.clientY
      startX = e.touches[0]!.clientX
      tracking = true
      engaged = false
      dist = 0
    }
    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const dy = e.touches[0]!.clientY - startY
      const dx = e.touches[0]!.clientX - startX
      if (!engaged) {
        // Solo cuenta un gesto claramente hacia abajo; lo lateral o hacia arriba es desplazamiento normal
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || el.scrollTop > 0) {
          tracking = false
          return
        }
        engaged = true
      }
      if (el.scrollTop > 0 || dy <= 0) return reset()
      if (e.cancelable) e.preventDefault()
      // Resistencia: cuesta más mientras más se jala
      dist = MAX * (1 - Math.exp(-dy / 220))
      setPull(dist)
      setPhase(dist >= THRESHOLD ? 'ready' : 'pulling')
    }
    const onEnd = () => {
      if (!tracking || !engaged) {
        tracking = false
        return
      }
      tracking = false
      engaged = false
      if (dist < THRESHOLD) return reset()
      busy.current = true
      setPhase('refreshing')
      setPull(THRESHOLD * 0.82)
      navigator.vibrate?.(8)
      const minWait = new Promise((r) => setTimeout(r, 700))
      void Promise.allSettled([syncNow(), checkForUpdate(true), minWait]).then(() => {
        setPhase('done')
        setTimeout(() => {
          busy.current = false
          reset()
        }, 700)
      })
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', reset)
    }
  }, [target, disabled])

  if (phase === 'idle' && pull === 0) return null
  const progress = Math.min(1, pull / THRESHOLD)
  const label = phase === 'ready' ? 'Suelta para sincronizar' : phase === 'refreshing' ? 'Sincronizando…' : phase === 'done' ? 'Todo al día' : 'Desliza para sincronizar'

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+56px)] z-20 flex flex-col items-center gap-1.5 md:top-3"
      style={{ transform: `translateY(${pull - 44}px)`, opacity: 0.4 + 0.6 * progress, transition: phase === 'pulling' || phase === 'ready' ? 'none' : 'transform 0.32s cubic-bezier(.2,.8,.2,1), opacity 0.32s' }}
    >
      <span
        className={cx(
          'flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-[var(--shadow-3)] ring-1 ring-line',
          phase === 'ready' || phase === 'refreshing' ? 'text-primary' : 'text-ink-soft',
          phase === 'done' && 'text-success',
        )}
      >
        {phase === 'done' ? (
          <Check size={19} strokeWidth={1.9} />
        ) : (
          <RefreshCw size={18} strokeWidth={1.7} className={phase === 'refreshing' ? 'animate-spin' : ''} style={phase === 'refreshing' ? undefined : { transform: `rotate(${progress * 300}deg)` }} />
        )}
      </span>
      <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink shadow-[var(--shadow-2)] ring-1 ring-line">{label}</span>
    </div>
  )
}

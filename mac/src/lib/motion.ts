// step1 · "deriva": presets de movimiento (Motion), copiados del PWA. Nada rebota, nada gira, nada parpadea.
import { animate, useInView, useReducedMotion, type Transition, type Variants } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

export const ease = {
  calma: [0.22, 1, 0.36, 1],
  marea: [0.65, 0, 0.35, 1],
  salida: [0.55, 0, 1, 0.45],
} as const

export const dur = { press: 0.12, hover: 0.18, state: 0.28, enter: 0.48, hero: 0.8 } as const

export const spring = {
  suave: { type: 'spring', stiffness: 170, damping: 26, mass: 1 },
  globo: { type: 'spring', stiffness: 120, damping: 18, mass: 1 },
} satisfies Record<string, Transition>

export const RISE = 12

export const fadeRise: Variants = {
  hidden: { opacity: 0, y: RISE },
  show: { opacity: 1, y: 0, transition: { duration: dur.enter, ease: ease.calma } },
}

/** Solo titulares principales: el blur es caro, no usar en listas */
export const heroRise: Variants = {
  hidden: { opacity: 0, y: RISE * 1.5, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: dur.hero, ease: ease.calma } },
}

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}

export const exitFade = { opacity: 0, y: -6, transition: { duration: 0.2, ease: ease.salida } }

export const modal = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: dur.enter, ease: ease.calma } },
  exit: { opacity: 0, y: 8, scale: 0.99, transition: { duration: 0.2, ease: ease.salida } },
}

/** Cifra que cuenta hacia arriba al entrar en vista (1.2 s, calma) */
export function useCountUp(to: number, { duration = 1.2, decimals = 0 } = {}) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const reduce = useReducedMotion()
  const [value, setValue] = useState(reduce ? to : 0)
  // Respaldo: si la vista nunca se "ve" (pestaña oculta, sin IntersectionObserver), muestra el valor final
  useEffect(() => {
    const t = setTimeout(() => setValue((v) => (v === 0 ? to : v)), 1600)
    return () => clearTimeout(t)
  }, [to])
  useEffect(() => {
    if (!inView) return
    if (reduce || document.visibilityState !== 'visible') {
      setValue(to)
      return
    }
    const controls = animate(0, to, { duration, ease: ease.calma, onUpdate: (v) => setValue(Number(v.toFixed(decimals))) })
    return () => controls.stop()
  }, [inView, reduce, to, duration, decimals])
  return { ref, value }
}

/** Háptico ligero (Android/Chrome). iOS Safari no lo soporta y se ignora. */
// Vibración breve; solo después de que la persona tocó la pantalla (si no, Chrome lo marca como error)
const buzz = (p: number | number[]) => {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  if (ua && !ua.hasBeenActive) return
  try {
    navigator.vibrate?.(p)
  } catch {
    /* sin vibración */
  }
}
export const haptic = {
  light: () => buzz(8),
  select: () => buzz(4),
  success: () => buzz([10, 40, 18]),
  warning: () => buzz([24, 50, 24]),
}

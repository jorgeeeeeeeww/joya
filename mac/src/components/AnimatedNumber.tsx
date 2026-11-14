import { useEffect, useRef } from 'react'
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

/** Indicadores: cuentan al entrar en pantalla y enlazan cambios sin saltar de cero.
 * Los lectores de pantalla reciben el valor final, nunca los pasos intermedios. */
export function AnimatedNumber({ value, format = 'number', className = '' }: { value: number; format?: 'number' | 'money' | 'percent'; className?: string }) {
  const target = Number.isFinite(value) ? value : 0
  const decimals = format === 'money' && !Number.isInteger(target) ? 2 : 0
  const formatter = new Intl.NumberFormat('es-MX', {
    ...(format === 'money' ? { style: 'currency', currency: 'MXN' } : {}),
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })
  const render = (n: number) => formatter.format(Math.round(n * 10 ** decimals) / 10 ** decimals) + (format === 'percent' ? '%' : '')
  const ref = useRef<HTMLSpanElement>(null)
  const visible = useInView(ref, { once: true, amount: 0.25 })
  const reduce = useReducedMotion()
  const number = useMotionValue(0)
  const text = useTransform(number, render)
  useEffect(() => {
    if (reduce) { number.set(target); return }
    if (!visible) return
    const control = animate(number, target, { duration: 0.95, ease: [0.22, 1, 0.36, 1] })
    return () => control.stop()
  }, [number, target, visible, reduce])
  return <span ref={ref} className={`animated-number ${className}`}>
    <span className="sr-only">{render(target)}</span>
    <span className="animated-number-reserve" aria-hidden="true">{render(target)}</span>
    <motion.span aria-hidden="true">{text}</motion.span>
  </span>
}

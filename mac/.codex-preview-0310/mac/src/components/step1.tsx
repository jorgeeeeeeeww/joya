// Piezas de carga y de entrada de la app. (Antes había aquí la luna, las estrellas y los horizontes de la
// huella «step1»; ya no: la app usa solo el logo y los colores de La Joya.)
import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { fadeRise, stagger } from '@/lib/motion'

/** Cargando: tres puntos que suben en secuencia (nunca un spinner) */
export function LightDots({ className = '' }: { className?: string }) {
  return (
    <span role="status" aria-label="Cargando" className={`light-dots inline-flex items-center gap-1 ${className}`}>
      <span />
      <span />
      <span />
    </span>
  )
}

export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div variants={stagger} initial={reduce ? false : 'hidden'} animate="show" className={className}>
      {children}
    </motion.div>
  )
}
export function RevealItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeRise} className={className}>
      {children}
    </motion.div>
  )
}

// Botón de tema claro/oscuro. Guarda la preferencia de cada persona (o la del rancho en el inicio de sesión)
// y cambia con un fundido suave (View Transitions), sin giros ni rebotes.
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Moon, Sun } from 'lucide-react'
import { useStore } from '@/lib/store'
import { ease, haptic } from '@/lib/motion'
import { cx } from './ui'

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => setDark(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return dark
}

/** Tema efectivo (claro u oscuro) considerando la preferencia de la persona, la del rancho y el sistema */
export function useEffectiveTheme(): 'light' | 'dark' {
  const pref = useStore((s) => (s.session.userId && s.settings.userPrefs?.[s.session.userId]?.theme) || s.settings.theme)
  const systemDark = useSystemDark()
  return pref === 'auto' ? (systemDark ? 'dark' : 'light') : pref
}

export function ThemeToggle({ className }: { className?: string }) {
  const effective = useEffectiveTheme()
  const next = effective === 'dark' ? 'light' : 'dark'

  const toggle = () => {
    haptic.select()
    const apply = () => {
      const s = useStore.getState()
      const uid = s.session.userId
      if (uid) s.setSettings({ userPrefs: { ...(s.settings.userPrefs ?? {}), [uid]: { ...(s.settings.userPrefs?.[uid] ?? {}), theme: next } } })
      else s.setSettings({ theme: next })
      // Aplica de inmediato para que la transición capture el estado final
      document.documentElement.setAttribute('data-theme', next)
    }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(() => flushSync(apply))
    else apply()
  }

  return (
    <button
      onClick={toggle}
      aria-label={effective === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={effective === 'dark' ? 'Tema claro' : 'Tema oscuro'}
      className={cx('pressable relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-ink-soft hover:bg-wash hover:text-ink', className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={effective}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: ease.calma } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.16, ease: ease.salida } }}
          className="flex"
        >
          {effective === 'dark' ? <Sun size={20} strokeWidth={1.6} /> : <Moon size={20} strokeWidth={1.6} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

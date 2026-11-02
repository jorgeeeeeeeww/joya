import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ShieldCheck, CloudOff } from 'lucide-react'
import { useCollection, useStore } from '@/lib/store'
import { ROLE } from '@/lib/meta'
import { greeting } from '@/lib/format'
import { ease, fadeRise, heroRise, stagger } from '@/lib/motion'
import { Avatar, cx } from '@/components/ui'
import { PinPad } from '@/components/PinPad'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NightSlab, SkyBlock, Sparkle } from '@/components/step1'
import type { Employee } from '@/lib/types'

const DEMO_PINS: Record<string, string> = { e_admin: '1234', e_lupita: '2222', e_maria: '3333', e_carmen: '4444', e_chuy: '5555', e_ana: '6666' }
const ORDER: Employee['role'][] = ['admin', 'eventos', 'recepcion', 'limpieza', 'mantenimiento']

/** Perfiles colgando de un hilo (eco de las cuerdas del globo) */
function HangingProfiles({ people, onPick }: { people: Employee[]; onPick: (e: Employee) => void }) {
  return (
    <div className="relative">
      <svg aria-hidden viewBox="0 0 1000 60" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[44px] w-full">
        <path d="M-10 8 C 250 58, 750 58, 1010 8" className="hilo" />
      </svg>
      <motion.div variants={stagger} initial="hidden" animate="show" className="relative flex flex-wrap justify-center gap-x-3 gap-y-5 pt-6">
        {people.map((e, i) => (
          <motion.div key={e.id} variants={fadeRise} className="flex flex-col items-center">
            <span aria-hidden className="h-5 w-px bg-line-strong" />
            <motion.button
              onClick={() => onPick(e)}
              animate={{ rotate: [-1.6, 1.6] }}
              transition={{ duration: 4.6 + (i % 3) * 0.7, repeat: Infinity, repeatType: 'mirror', ease: ease.marea, delay: i * 0.4 }}
              whileHover={{ y: -6, rotate: 0 }}
              whileTap={{ scale: 0.98 }}
              style={{ transformOrigin: '50% -20px' }}
              className="card flex w-[136px] flex-col items-center gap-2 px-3 pt-4 pb-3.5 text-center hover:shadow-[var(--shadow-2)] sm:w-[148px]"
            >
              <Avatar name={e.name} tone={e.color} size={52} />
              <span className="text-[15px] leading-tight font-medium">{e.name.split(' ').slice(0, 2).join(' ')}</span>
              <span className="text-xs text-ink-soft">{ROLE[e.role].label}</span>
            </motion.button>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

export default function Login() {
  const employees = useCollection('employees').filter((e) => e.active)
  const login = useStore((s) => s.login)
  const cloud = useStore((s) => !!s.settings.supabaseUrl)
  const [selected, setSelected] = useState<Employee | null>(null)
  const people = [...employees].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role))

  const right = (
    <div className="mx-auto w-full max-w-[560px] px-5">
      <AnimatePresence mode="wait">
        {!selected ? (
          <motion.div key="who" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.18 } }}>
            <motion.div variants={stagger} initial="hidden" animate="show" className="text-center">
              <motion.p variants={fadeRise} className="eyebrow">
                {greeting()}
              </motion.p>
              <motion.h1 variants={heroRise} className="heading mt-3 text-[clamp(2.1rem,1.6rem+2.4vw,3.2rem)]">
                ¿Quién abre <br className="sm:hidden" />
                el rancho hoy?
              </motion.h1>
              <motion.p variants={fadeRise} className="mx-auto mt-3 max-w-[34ch] text-[15px] text-ink-soft">
                Elige tu perfil para entrar a tu panel.
              </motion.p>
            </motion.div>
            <div className="mt-8">
              <HangingProfiles people={people} onPick={setSelected} />
            </div>
          </motion.div>
        ) : (
          <motion.div key="pin" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }} exit={{ opacity: 0, transition: { duration: 0.18 } }} className="flex flex-col items-center">
            <button onClick={() => setSelected(null)} className="pressable mb-5 inline-flex h-10 items-center gap-1 self-start rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink">
              <ChevronLeft size={18} strokeWidth={1.6} /> Cambiar perfil
            </button>
            <Avatar name={selected.name} tone={selected.color} size={72} />
            <h1 className="heading mt-4 text-[2rem]">Hola, {selected.name.split(' ')[0]}</h1>
            <p className="mt-1 mb-7 text-sm text-ink-soft">Escribe tu PIN de 4 dígitos</p>
            <PinPad onComplete={(pin) => login(selected.id, pin)} hint={!cloud && DEMO_PINS[selected.id] ? `Demostración: ${DEMO_PINS[selected.id]}` : undefined} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-10 flex justify-center pb-6">
        <span className={cx('glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs ring-1 ring-line', cloud ? 'text-success' : 'text-ink-soft')}>
          {cloud ? <ShieldCheck size={14} strokeWidth={1.6} /> : <CloudOff size={14} strokeWidth={1.6} />}
          {cloud ? 'Conexión cifrada con la nube' : 'Modo demostración · los datos viven en este equipo'}
        </span>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr] lg:gap-0 lg:p-[var(--frame)]">
      {/* Escritorio: losa noche con la luz y el horizonte */}
      <NightSlab className="hidden lg:flex lg:min-h-[calc(100dvh-2*var(--frame))] lg:flex-col lg:justify-between lg:p-14" luzSize="clamp(96px, 9vw, 168px)" luzClassName="absolute right-[9%] bottom-[33%]">
        <div className="flex items-center gap-2.5 text-on-night">
          <Sparkle className="text-luz" />
          <span className="heading text-xl">La Joya</span>
        </div>
        <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-[640px] pb-[18vh]">
          <motion.p variants={fadeRise} className="eyebrow !text-on-night-soft">
            Jardines La Joya · Tototlán
          </motion.p>
          <motion.h2 variants={heroRise} className="heading mt-4 max-w-[12ch] text-[clamp(3rem,2rem+3vw,5.2rem)] text-on-night">
            Todo el rancho, en calma.
          </motion.h2>
          <motion.p variants={fadeRise} className="mt-5 max-w-[40ch] text-lg text-on-night-soft">
            Salón, jardín, cabañas y casas en un solo lugar. Cada persona con su propio panel.
          </motion.p>
        </motion.div>
      </NightSlab>

      {/* Móvil: cielo arriba que se funde con el papel */}
      <div className="lg:hidden">
        <SkyBlock height="clamp(170px, 30vh, 260px)" />
      </div>
      <div className="relative flex flex-col justify-center pt-safe lg:min-h-[calc(100dvh-2*var(--frame))] lg:pt-10">
        <div className="absolute top-[calc(env(safe-area-inset-top)+10px)] right-3 z-10">
          <ThemeToggle className="glass ring-1 ring-line" />
        </div>
        {right}
      </div>
    </div>
  )
}

export function LockScreen() {
  const me = useStore((s) => (s.session.userId ? s.data.employees[s.session.userId] : undefined))
  const login = useStore((s) => s.login)
  const logout = useStore((s) => s.logout)
  if (!me) return null
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-y-auto bg-[color-mix(in_oklab,var(--paper)_94%,transparent)] px-5 backdrop-blur-xl">
      <Avatar name={me.name} tone={me.color} size={72} />
      <h1 className="heading mt-4 text-[2rem]">{me.name.split(' ')[0]}</h1>
      <p className="mt-1 mb-7 text-sm text-ink-soft">La sesión se bloqueó para cuidar tus datos</p>
      <PinPad onComplete={(pin) => login(me.id, pin)} />
      <button onClick={logout} className="pressable mt-8 rounded-full px-4 py-2 text-sm text-ink-soft hover:bg-wash hover:text-ink">
        Entrar con otra persona
      </button>
    </div>
  )
}

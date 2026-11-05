// Entrar: el dueño escribe su correo y su contraseña de la nube. La sesión se queda guardada en la Mac.
import { useState } from 'react'
import { motion } from 'motion/react'
import { KeyRound, Mail, ShieldCheck, FlaskConical } from 'lucide-react'
import { nube, esNubeLocal } from '@/lib/nube'
import { fadeRise, heroRise, stagger } from '@/lib/motion'
import { enMac } from '@/lib/mac'
import { Button } from '@/components/ui'
import { NightSlab, Sparkle } from '@/components/step1'
import { Campo } from '@/components/campos'
import { RanchoNoche, type CasaEscena } from '@/components/escena'

const ADORNO: CasaEscena[] = [
  { id: 'a', nombre: '', tipo: 'cabana', estado: 'reservada', linea: '' },
  { id: 'b', nombre: '', tipo: 'casa', estado: 'libre', linea: '' },
  { id: 'h1', nombre: '', tipo: 'habitacion', estado: 'reservada', linea: '' },
  { id: 'h2', nombre: '', tipo: 'habitacion', estado: 'libre', linea: '' },
  { id: 'h3', nombre: '', tipo: 'habitacion', estado: 'reservada', linea: '' },
  { id: 'h4', nombre: '', tipo: 'habitacion', estado: 'apartada', linea: '' },
  { id: 'c', nombre: '', tipo: 'cabana', estado: 'reservada', linea: '' },
  { id: 'd', nombre: '', tipo: 'casa', estado: 'reservada', linea: '' },
]

function explicar(m: string) {
  if (/invalid login|credentials/i.test(m)) return 'El correo o la contraseña no coinciden.'
  if (/fetch|network|load failed/i.test(m)) return 'Sin conexión con la nube. Revisa el internet.'
  if (/rate|too many/i.test(m)) return 'Demasiados intentos seguidos. Espera un minuto.'
  return m
}

export default function Entrar() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const correoOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())

  const entrar = async () => {
    if (!correoOk || !clave) return setError(!correoOk ? 'Escribe tu correo completo.' : 'Escribe tu contraseña.')
    setEntrando(true)
    setError(null)
    const { error: e } = await nube.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password: clave })
    setEntrando(false)
    if (e) setError(explicar(e.message))
  }

  return (
    <div className="grid h-dvh grid-cols-[1.1fr_1fr] gap-0 bg-paper p-[var(--frame)]">
      <NightSlab className="flex flex-col justify-between p-12" luzSize="clamp(64px, 6vw, 110px)" luzClassName="absolute right-[12%] bottom-[34%]" scene={<div className="absolute bottom-0 left-1/2 w-[150%] -translate-x-1/2"><RanchoNoche casas={ADORNO} decorativa /></div>}>
        <div data-tauri-drag-region className={enMac ? 'pt-6' : ''}>
          <div className="flex items-center gap-2.5 text-on-night">
            <Sparkle className="text-luz" />
            <span className="heading text-xl">La Joya</span>
          </div>
        </div>
        <motion.div variants={stagger} initial="hidden" animate="show" className="mt-16 max-w-[560px] pb-[26vh]">
          <motion.p variants={fadeRise} className="eyebrow !text-on-night-soft">
            Jardines La Joya · Tototlán
          </motion.p>
          <motion.h1 variants={heroRise} className="heading mt-4 max-w-[13ch] text-[clamp(2.6rem,1.8rem+2.6vw,4.4rem)] text-on-night">
            Las reservaciones del rancho, en calma.
          </motion.h1>
          <motion.p variants={fadeRise} className="mt-5 max-w-[42ch] text-[17px] text-on-night-soft">
            Las solicitudes de la página llegan aquí al instante. Tú confirmas, registras el pago y avisas por WhatsApp.
          </motion.p>
        </motion.div>
      </NightSlab>

      <div className="relative flex flex-col justify-center px-[clamp(24px,5vw,72px)]">
        <motion.form
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mx-auto w-full max-w-[400px]"
          onSubmit={(e) => {
            e.preventDefault()
            void entrar()
          }}
        >
          <motion.p variants={fadeRise} className="eyebrow">
            Para el dueño y recepción
          </motion.p>
          <motion.h2 variants={heroRise} className="heading mt-2 text-[2.1rem]">
            Entrar
          </motion.h2>
          <motion.div variants={fadeRise} className="mt-7 flex flex-col gap-3">
            <Campo label="Correo" type="email" icon={<Mail />} value={correo} onChange={setCorreo} autoComplete="username" autoFocus ok={correoOk} />
            <Campo label="Contraseña" type="password" icon={<KeyRound />} value={clave} onChange={setClave} autoComplete="current-password" error={error} onEnter={() => void entrar()} />
          </motion.div>
          <motion.div variants={fadeRise}>
            <Button type="submit" size="lg" className="mt-6 w-full" loading={entrando}>
              Entrar
            </Button>
            <p className="mt-4 text-[13px] text-ink-3">La sesión se queda guardada en esta Mac. Si olvidaste la contraseña, Jorge la cambia desde la nube.</p>
          </motion.div>
          {esNubeLocal && (
            <motion.div variants={fadeRise} className="mt-7 flex items-start gap-3 rounded-[14px] bg-butter-soft p-4 text-[13px]">
              <FlaskConical size={18} className="mt-0.5 shrink-0 text-butter-ink" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-butter-ink">Nube local de prueba</div>
                <div className="mt-0.5 text-ink-soft">Esta copia se conecta a la nube de la computadora (npm run nube), no a la del rancho.</div>
                <button
                  type="button"
                  className="mt-2 font-semibold text-key underline-offset-2 hover:underline"
                  onClick={() => {
                    setCorreo('dueno@lajoya.local')
                    setClave('la-joya-local')
                  }}
                >
                  Usar la cuenta de prueba del dueño
                </button>
              </div>
            </motion.div>
          )}
        </motion.form>
        {/* La nube local va sin cifrar: ahí no se presume */}
        {!esNubeLocal && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs text-success ring-1 ring-line">
              <ShieldCheck size={14} strokeWidth={1.6} /> Conexión cifrada con la nube
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

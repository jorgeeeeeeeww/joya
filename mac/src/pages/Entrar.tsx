// Entrar: el dueño escribe su correo y su contraseña de la nube. La sesión se queda guardada en la Mac.
import { useState } from 'react'
import { motion } from 'motion/react'
import { KeyRound, Mail, ShieldCheck, FlaskConical } from 'lucide-react'
import { nube, esNubeLocal, URL_NUBE, LLAVE_PUBLICA } from '@/lib/nube'
import { correoGuardado, motivoDeEntrada, recordarCorreo } from '@/lib/store'
import { fadeRise, heroRise, stagger } from '@/lib/motion'
import { enMac } from '@/lib/mac'
import { Button } from '@/components/ui'
import { Marca } from '@/components/Loto'
import { Campo } from '@/components/campos'
import { PlanoRancho, type CasaEscena } from '@/components/plano'
import { HOSPEDAJES } from '@/lib/plano'

// Decoración: el plano del rancho con algunos lugares encendidos
const ESTADOS: CasaEscena['estado'][] = ['reservada', 'libre', 'reservada', 'reservada', 'apartada', 'libre', 'reservada']
const ADORNO: CasaEscena[] = HOSPEDAJES.map((p, i) => ({ id: p.id, nombre: p.nombre, tipo: p.tipo as CasaEscena['tipo'], estado: ESTADOS[i % ESTADOS.length]!, linea: '' }))

function explicar(m: string) {
  if (/invalid login|credentials/i.test(m)) return 'El correo o la contraseña no coinciden.'
  if (/fetch|network|load failed/i.test(m)) return 'Sin conexión con la nube. Revisa el internet.'
  if (/rate|too many/i.test(m)) return 'Demasiados intentos seguidos. Espera un minuto.'
  return m
}

/** Texto técnico corto de por qué no hubo conexión (para que Jorge lo pueda mandar tal cual) */
async function diagnosticar(e: { name?: string; message: string; status?: number }) {
  const partes = [`Dirección: ${URL_NUBE.replace(/^https?:\/\//, '')}`, `Error: ${e.name ?? 'Error'}: ${e.message}${e.status ? ` (${e.status})` : ''}`]
  try {
    const r = await fetch(`${URL_NUBE}/auth/v1/settings`, { headers: { apikey: LLAVE_PUBLICA } })
    partes.push(`Prueba directa: respondió ${r.status}`)
  } catch (x) {
    partes.push(`Prueba directa: ${x instanceof Error ? `${x.name}: ${x.message}` : String(x)}`)
  }
  partes.push(`Internet: ${navigator.onLine ? 'sí' : 'no'} · ${navigator.userAgent.match(/Version\/[\d.]+|Chrome\/[\d.]+|AppleWebKit\/[\d.]+/)?.[0] ?? 'motor desconocido'}`)
  return partes.join('\n')
}

export default function Entrar() {
  // Si la sesión venció, el correo ya está escrito y se explica por qué se llegó aquí
  const [correo, setCorreo] = useState(() => correoGuardado())
  const [vencio] = useState(() => motivoDeEntrada() === 'vencio')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const correoOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())

  const entrar = async () => {
    if (!correoOk || !clave) return setError(!correoOk ? 'Escribe tu correo completo.' : 'Escribe tu contraseña.')
    setEntrando(true)
    setError(null)
    const { error: e } = await nube.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password: clave })
    if (e) {
      setError(explicar(e.message))
      setDetalle(null)
      // Si no hubo conexión, se prueba por separado para que quede claro qué falló y dónde
      if (/fetch|network|load failed|conexi/i.test(e.message)) setDetalle(await diagnosticar(e))
    }
    else recordarCorreo(correo.trim().toLowerCase())
    setEntrando(false)
  }

  return (
    <div className="grid h-dvh grid-cols-[1.1fr_1fr] gap-0 bg-paper p-[var(--frame)]">
      <section className="relative isolate flex flex-col justify-between overflow-hidden rounded-[var(--r-slab)] bg-night p-12 text-on-night">
        <div data-tauri-drag-region className={enMac ? 'pt-6' : ''}>
          <Marca tamano={40} hueco="var(--night)" className="text-on-night" />
        </div>
        <motion.div variants={stagger} initial="hidden" animate="show" className="relative z-[2] my-10 max-w-[560px]">
          <motion.h1 variants={heroRise} className="heading max-w-[14ch] text-[clamp(2.4rem,1.7rem+2.4vw,4rem)] text-on-night">
            Las reservaciones de La Joya, en un solo lugar.
          </motion.h1>
          <motion.p variants={fadeRise} className="mt-5 max-w-[42ch] text-[16px] leading-relaxed text-on-night-soft">
            Las solicitudes de la página llegan aquí al instante. Tú confirmas, registras el pago y avisas por WhatsApp.
          </motion.p>
        </motion.div>
        <div className="pointer-events-none relative z-[1] opacity-90">
          <PlanoRancho casas={ADORNO} decorativa tono="oscuro" />
        </div>
      </section>

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
          <motion.h2 variants={heroRise} className="heading mt-2 text-[2.1rem]">
            Entrar
          </motion.h2>
          {vencio && <motion.p variants={fadeRise} className="mt-5 rounded-[12px] bg-butter-soft px-4 py-3 text-[14px] text-butter-ink">Tu sesión venció. Escribe tu contraseña para volver a entrar.</motion.p>}
          <motion.div variants={fadeRise} className="mt-7 flex flex-col gap-3">
            <Campo label="Correo" type="email" icon={<Mail />} value={correo} onChange={setCorreo} autoComplete="username" autoFocus={!correo} ok={correoOk} />
            <Campo label="Contraseña" type="password" icon={<KeyRound />} value={clave} onChange={setClave} autoComplete="current-password" autoFocus={!!correo} error={error} onEnter={() => void entrar()} />
          </motion.div>
          <motion.div variants={fadeRise}>
            <Button type="submit" size="lg" className="mt-6 w-full" loading={entrando}>
              Entrar
            </Button>
            {detalle && <pre className="mt-3 rounded-[10px] bg-sunken px-3 py-2 text-[12px] leading-snug whitespace-pre-wrap break-all text-ink-soft select-text">{detalle}</pre>}
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

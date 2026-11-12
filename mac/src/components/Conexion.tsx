// Franja de arriba cuando no hay internet o la nube no contesta. Dice desde cuándo son los datos que se están viendo
// (antes solo había un puntito rojo y se podía confirmar o cobrar creyendo que todo funcionaba) y se quita sola
// cuando vuelve la conexión.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useApp } from '@/lib/store'
import { ease } from '@/lib/motion'
import { Button } from './ui'

function desde(ultima: number) {
  if (!ultima) return 'Se ven los últimos datos guardados'
  const min = Math.floor((Date.now() - ultima) / 60_000)
  if (min < 1) return 'Datos de hace un momento'
  if (min < 60) return `Datos de hace ${min} min`
  return `Datos de hace ${Math.floor(min / 60)} h`
}

export function Conexion() {
  const conexion = useApp((s) => s.conexion)
  const ultima = useApp((s) => s.ultimaCarga)
  const cargar = useApp((s) => s.cargar)
  const [hayInternet, setHayInternet] = useState(() => navigator.onLine !== false)
  const [probando, setProbando] = useState(false)
  const [, tic] = useState(0)

  useEffect(() => {
    const si = () => setHayInternet(true)
    const no = () => setHayInternet(false)
    window.addEventListener('online', si)
    window.addEventListener('offline', no)
    // La hora de «Datos de hace X min» se actualiza sola
    const t = setInterval(() => tic((n) => n + 1), 30_000)
    return () => {
      window.removeEventListener('online', si)
      window.removeEventListener('offline', no)
      clearInterval(t)
    }
  }, [])

  const caida = conexion === 'sin-conexion' || !hayInternet
  return (
    <AnimatePresence>
      {caida && (
        <motion.div
          role="status"
          className="interfaz pointer-events-none fixed top-3 right-0 left-[236px] z-40 flex justify-center px-4"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: ease.calma } }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
        >
          <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-[14px] bg-night py-2 pr-2 pl-4 text-on-night shadow-[var(--shadow-2)] ring-1 ring-[color-mix(in_oklab,var(--on-night)_16%,transparent)]">
            <WifiOff size={16} className="shrink-0 text-luz" />
            <div className="min-w-0 leading-tight">
              <div className="text-[13.5px] font-semibold">{hayInternet ? 'La nube no contesta' : 'Sin internet'}</div>
              <div className="text-[12px] text-on-night-soft">
                {desde(ultima)}. No se puede cambiar nada hasta que vuelva la conexión.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 !border-[color-mix(in_oklab,var(--on-night)_30%,transparent)] !text-on-night"
              icon={<RefreshCw size={14} />}
              loading={probando}
              onClick={async () => {
                setProbando(true)
                await cargar()
                setProbando(false)
              }}
            >
              Reintentar
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

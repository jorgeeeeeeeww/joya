// Entrada de la app: sesión del dueño, barra lateral, tiempo real y atajos de la Mac.
import { lazy, Suspense, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { LogOut } from 'lucide-react'
import { nube } from './lib/nube'
import { useApp, type Vista } from './lib/store'
import { enMac, ponerMenu, buscarActualizacion, instalarActualizacion, alPedirNuevaReservacion, encenderAbreAlIniciarLaPrimeraVez } from './lib/mac'
import { ease } from './lib/motion'
import { Button, Sheet, Toaster, toast } from './components/ui'
import { LightDots, Luz } from './components/step1'
import { Barra } from './components/Barra'
import Entrar from './pages/Entrar'
import Hoy from './pages/Hoy'
import { DetalleReservacion } from './components/Detalle'
import { NuevaHoja } from './components/NuevaHoja'
import { Buscar } from './components/Buscar'
import { Tropiezo } from './components/Tropiezo'

const Calendario = lazy(() => import('./pages/Calendario'))
const Reservaciones = lazy(() => import('./pages/Reservaciones'))
const Cabanas = lazy(() => import('./pages/Cabanas'))
const Ajustes = lazy(() => import('./pages/Ajustes'))

export default function App() {
  const sesion = useApp((s) => s.sesion)
  useEffect(() => {
    void nube.auth.getSession().then(({ data }) => useApp.setState({ sesion: data.session }))
    const { data } = nube.auth.onAuthStateChange((_e, s) => useApp.setState({ sesion: s }))
    return () => data.subscription.unsubscribe()
  }, [])
  return (
    <>
      {sesion === undefined ? (
        <div className="flex h-dvh items-center justify-center">
          <LightDots />
        </div>
      ) : sesion ? (
        <Marco />
      ) : (
        <Entrar />
      )}
      <Toaster />
    </>
  )
}

const VISTAS: Vista[] = ['hoy', 'calendario', 'reservaciones', 'cabanas']

function Marco() {
  const sesion = useApp((s) => s.sesion)!
  const vista = useApp((s) => s.vista)
  const datos = useApp((s) => s.datos)
  const sinPermiso = useApp((s) => s.sinPermiso)
  const abierta = useApp((s) => s.abierta)
  const cargar = useApp((s) => s.cargar)
  const mainRef = useRef<HTMLElement>(null)
  // El panel sigue mostrando la última reservación mientras se cierra
  const ultimaAbierta = useRef(abierta)
  if (abierta) ultimaAbierta.current = abierta

  // Datos: al entrar, cada 30 s, al volver a la ventana y cuando vuelve el internet.
  // En la Mac sigue revisando con la ventana escondida: de eso depende el aviso de cada solicitud.
  useEffect(() => {
    void cargar()
    const cada = setInterval(() => (enMac || document.visibilityState === 'visible') && void cargar(), 30_000)
    const alVolver = () => document.visibilityState === 'visible' && void cargar()
    window.addEventListener('focus', alVolver)
    window.addEventListener('online', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(cada)
      window.removeEventListener('focus', alVolver)
      window.removeEventListener('online', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [cargar])

  // Tiempo real: la nube avisa «hubo cambios» en el canal privado «hospedaje» y aquí se vuelve a bajar
  useEffect(() => {
    let canal: RealtimeChannel | null = null
    let espera: ReturnType<typeof setTimeout> | undefined
    let vivo = true
    void (async () => {
      await nube.realtime.setAuth(sesion.access_token)
      if (!vivo) return
      canal = nube
        .channel('hospedaje', { config: { private: true } })
        .on('broadcast', { event: 'cambio' }, () => {
          clearTimeout(espera)
          espera = setTimeout(() => void useApp.getState().cargar(), 250)
        })
        .subscribe((estado) => useApp.setState({ enVivo: estado === 'SUBSCRIBED' }))
    })()
    return () => {
      vivo = false
      clearTimeout(espera)
      useApp.setState({ enVivo: false })
      if (canal) void nube.removeChannel(canal)
    }
  }, [sesion.user.id, sesion.access_token])

  // Menú de arriba de la Mac y atajos de teclado (en el navegador también funcionan con Ctrl)
  useEffect(() => {
    const a = useApp.getState
    const acciones = {
      ir: (v: Vista) => a().ir(v),
      nuevaReservacion: () => a().crear({ tipo: 'reservacion' }),
      nuevoCierre: () => a().crear({ tipo: 'cierre' }),
      buscar: () => a().setBuscar(true),
      irAHoy: () => {
        a().ir('calendario')
        a().pedirHoy()
      },
      actualizar: () => {
        void a().cargar().then(() => toast.success('Datos al día'))
      },
    }
    void ponerMenu(acciones)
    // «Nueva reservación» desde el ícono de la barra de menú
    let vivo = true
    let dejarDeEscuchar: (() => void) | undefined
    void alPedirNuevaReservacion(acciones.nuevaReservacion).then((quitar) => {
      if (vivo) dejarDeEscuchar = quitar
      else quitar()
    })
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      // En la Mac estos atajos los atiende el menú de arriba
      if (enMac) return
      const k = e.key.toLowerCase()
      const n = Number(e.key)
      if (n >= 1 && n <= 4) acciones.ir(VISTAS[n - 1]!)
      else if (k === ',') acciones.ir('ajustes')
      else if (k === 'n') (e.shiftKey ? acciones.nuevoCierre : acciones.nuevaReservacion)()
      else if (k === 'f' || k === 'k') acciones.buscar()
      else if (k === 'r') acciones.actualizar()
      else if (k === 't') acciones.irAHoy()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      vivo = false
      dejarDeEscuchar?.()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    void encenderAbreAlIniciarLaPrimeraVez()
  }, [])

  // Una vez al día revisa si hay versión nueva de la app. Si no se puede revisar no molesta:
  // volverá a intentar mañana, y en Ajustes se puede buscar a mano y ver qué pasó.
  useEffect(() => {
    if (!enMac) return
    const revisar = async () => {
      try {
        const u = await buscarActualizacion()
        if (u) toast.action(`Hay una versión nueva (${u.version})`, { label: 'Instalar', onClick: () => void instalarActualizacion(u, (d) => toast.error('No se pudo instalar', d)) }, 'Se instala y la app vuelve a abrir sola')
      } catch (e) {
        console.warn('No se pudo revisar si hay versión nueva', e)
      }
    }
    const t = setTimeout(revisar, 8000)
    const cada = setInterval(revisar, 24 * 3600_000)
    return () => {
      clearTimeout(t)
      clearInterval(cada)
    }
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [vista])

  if (sinPermiso) return <SinPermiso correo={sesion.user.email ?? ''} />

  const llena = vista === 'calendario' || vista === 'reservaciones' || vista === 'cabanas'
  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      <Barra />
      <main ref={mainRef} id="contenido" className={llena ? 'relative min-w-0 flex-1 overflow-hidden' : 'scroll-area relative min-w-0 flex-1 overflow-y-auto'}>
        {enMac && <div data-tauri-drag-region className="absolute inset-x-0 top-0 z-20 h-3" />}
        {!datos ? (
          <div className="flex h-full items-center justify-center">
            <LightDots />
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={vista} className={llena ? 'h-full' : ''} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: ease.calma } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
              <Tropiezo llave={vista}>
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center py-24">
                    <LightDots />
                  </div>
                }
              >
                {vista === 'hoy' && <Hoy />}
                {vista === 'calendario' && <Calendario />}
                {vista === 'reservaciones' && <Reservaciones />}
                {vista === 'cabanas' && <Cabanas />}
                {vista === 'ajustes' && <Ajustes />}
              </Suspense>
              </Tropiezo>
            </motion.div>
          </AnimatePresence>
        )}
      </main>
      {/* Fuera de «Reservaciones», el detalle se abre como panel a la derecha sin perder la pantalla */}
      <Sheet open={!!abierta && vista !== 'reservaciones'} onClose={() => useApp.getState().abrir(null)} wide header={<span />}>
        {ultimaAbierta.current && (
          <Tropiezo llave={ultimaAbierta.current}>
            <DetalleReservacion id={ultimaAbierta.current} enPanel onCerrar={() => useApp.getState().abrir(null)} />
          </Tropiezo>
        )}
      </Sheet>
      <Tropiezo>
        <NuevaHoja />
        <Buscar />
      </Tropiezo>
    </div>
  )
}

function SinPermiso({ correo }: { correo: string }) {
  const salir = useApp((s) => s.salir)
  return (
    <div className="flex h-dvh items-center justify-center bg-paper p-8">
      <div className="card max-w-md p-8 text-center">
        <Luz size={44} className="mx-auto" />
        <h1 className="heading mt-5 text-[1.6rem]">Esta cuenta no es del hospedaje</h1>
        <p className="mt-2 text-[14px] text-ink-soft">
          Entraste como <span className="font-medium text-ink">{correo}</span>, pero esa cuenta no tiene el puesto de dueño ni de recepción. Pídele al dueño que te dé acceso, o entra con otra cuenta.
        </p>
        <Button className="mt-6" variant="outline" icon={<LogOut size={16} />} onClick={() => void salir()}>
          Entrar con otra cuenta
        </Button>
      </div>
    </div>
  )
}

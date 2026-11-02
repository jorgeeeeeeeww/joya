import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { useMe, useStore } from '@/lib/store'
import { can, ROLE_SECTIONS, type Section } from '@/lib/meta'
import { startSync } from '@/lib/sync'
import AppShell, { NAV } from '@/components/AppShell'
import Login, { LockScreen } from '@/pages/Login'
import { Toaster } from '@/components/ui'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Luz } from '@/components/step1'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const PlannerPanel = lazy(() => import('@/pages/panels/PlannerPanel'))
const LimpiezaPanel = lazy(() => import('@/pages/panels/LimpiezaPanel'))
const MantenimientoPanel = lazy(() => import('@/pages/panels/MantenimientoPanel'))
const MapPage = lazy(() => import('@/pages/MapPage'))
const Hospedaje = lazy(() => import('@/pages/Hospedaje'))
const Limpieza = lazy(() => import('@/pages/Limpieza'))
const Eventos = lazy(() => import('@/pages/Eventos'))
const EventoDetalle = lazy(() => import('@/pages/EventoDetalle'))
const Espacios = lazy(() => import('@/pages/Espacios'))
const Invitados = lazy(() => import('@/pages/Invitados'))
const Mensajes = lazy(() => import('@/pages/Mensajes'))
const RecepcionPanel = lazy(() => import('@/pages/panels/RecepcionPanel'))
const Proveedores = lazy(() => import('@/pages/Proveedores'))
const Tareas = lazy(() => import('@/pages/Tareas'))
const Finanzas = lazy(() => import('@/pages/Finanzas'))
const Inventario = lazy(() => import('@/pages/Inventario'))
const Equipo = lazy(() => import('@/pages/Equipo'))
const Ajustes = lazy(() => import('@/pages/Ajustes'))
const Diseno = lazy(() => import('@/pages/Diseno'))

function PageFallback() {
  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="skeleton h-10 w-64 rounded-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-[var(--r-lg)]" />
        ))}
      </div>
      <div className="skeleton h-72 rounded-[var(--r-lg)]" />
    </div>
  )
}

function Guard({ section, children }: { section: Section; children: ReactNode }) {
  const me = useMe()
  if (!me) return null
  if (!can(me.role, section)) return <Navigate to={NAV[ROLE_SECTIONS[me.role][0]!].to} replace />
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
}

/** Cada persona tiene su propio panel de inicio */
function Home() {
  const me = useMe()
  if (!me) return null
  const Panel = me.role === 'admin' ? Dashboard : me.role === 'eventos' ? PlannerPanel : me.role === 'recepcion' ? RecepcionPanel : me.role === 'limpieza' ? LimpiezaPanel : MantenimientoPanel
  return (
    <Suspense fallback={<PageFallback />}>
      <Panel />
    </Suspense>
  )
}

/** Atmósfera y tema: la preferencia de cada persona gana sobre la del rancho */
function useAppearance() {
  const theme = useStore((s) => (s.session.userId && s.settings.userPrefs?.[s.session.userId]?.theme) || s.settings.theme)
  const atmos = useStore((s) => (s.session.userId && s.settings.userPrefs?.[s.session.userId]?.atmos) || s.settings.atmos || 'flor')
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    root.setAttribute('data-atmos', atmos)
    // --paper usa light-dark(): se resuelve con un elemento de prueba para obtener el color real
    requestAnimationFrame(() => {
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;background:var(--paper)'
      document.body.appendChild(probe)
      const paper = getComputedStyle(probe).backgroundColor
      probe.remove()
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        m.setAttribute('content', paper)
        m.removeAttribute('media')
      })
    })
  }, [theme, atmos])
}

function useAutoLock() {
  const userId = useStore((s) => s.session.userId)
  const minutes = useStore((s) => s.settings.autoLockMinutes)
  useEffect(() => {
    if (!userId || !minutes) return
    let last = Date.now()
    let lastPersist = 0
    const bump = () => {
      last = Date.now()
      if (last - lastPersist > 30_000) {
        lastPersist = last
        useStore.getState().touch()
      }
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const iv = setInterval(() => {
      if (Date.now() - last > minutes * 60_000 && !useStore.getState().session.locked) useStore.getState().lock()
    }, 15_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump))
      clearInterval(iv)
    }
  }, [userId, minutes])
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const hydrate = useStore((s) => s.hydrate)
  const me = useMe()
  const locked = useStore((s) => s.session.locked)
  useAppearance()
  useAutoLock()

  useEffect(() => {
    void hydrate()
  }, [hydrate])
  useEffect(() => {
    if (ready) return startSync()
  }, [ready])

  if (!ready)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6">
        <Luz size={96} />
        <span className="heading text-2xl text-ink-soft">La Joya</span>
      </div>
    )

  const home = me ? NAV[ROLE_SECTIONS[me.role][0]!].to : '/'

  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
      <BrowserRouter>
        <Toaster />
        {!me ? (
          <Login />
        ) : (
          <>
            {locked && <LockScreen />}
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="mapa" element={<Guard section="mapa"><MapPage /></Guard>} />
                <Route path="hospedaje" element={<Guard section="hospedaje"><Hospedaje /></Guard>} />
                <Route path="limpieza" element={<Guard section="limpieza"><Limpieza /></Guard>} />
                <Route path="eventos" element={<Guard section="eventos"><Eventos /></Guard>} />
                <Route path="eventos/:id" element={<Guard section="eventos"><EventoDetalle /></Guard>} />
                <Route path="invitados" element={<Guard section="invitados"><Invitados /></Guard>} />
                <Route path="mensajes" element={<Guard section="mensajes"><Mensajes /></Guard>} />
                <Route path="espacios" element={<Guard section="espacios"><Espacios /></Guard>} />
                {/* Los prospectos viven dentro de Eventos */}
                <Route path="prospectos" element={<Navigate to="/eventos?vista=prospectos" replace />} />
                <Route path="proveedores" element={<Guard section="proveedores"><Proveedores /></Guard>} />
                <Route path="tareas" element={<Guard section="tareas"><Tareas /></Guard>} />
                <Route path="finanzas" element={<Guard section="finanzas"><Finanzas /></Guard>} />
                <Route path="inventario" element={<Guard section="inventario"><Inventario /></Guard>} />
                <Route path="equipo" element={<Guard section="equipo"><Equipo /></Guard>} />
                <Route path="ajustes" element={<Guard section="ajustes"><Ajustes /></Guard>} />
                <Route path="diseno" element={<Suspense fallback={<PageFallback />}><Diseno /></Suspense>} />
                <Route path="*" element={<Navigate to={home} replace />} />
              </Route>
            </Routes>
          </>
        )}
      </BrowserRouter>
      </ErrorBoundary>
    </MotionConfig>
  )
}

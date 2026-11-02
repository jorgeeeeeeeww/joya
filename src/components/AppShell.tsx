import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Armchair,
  ChevronDown,
  ChevronRight,
  Bell,
  BedDouble,
  CloudOff,
  Home,
  ListChecks,
  Lock,
  LogOut,
  Map,
  MoreHorizontal,
  Package,
  PartyPopper,
  Search,
  Send,
  Settings,
  Sparkles,
  Store,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { useCollection, useMe, useStore } from '@/lib/store'
import { ROLE, ROLE_MORE, ROLE_SECTIONS, TONE, type Section } from '@/lib/meta'
import { ago, localDay, today } from '@/lib/format'
import { ease, haptic, spring } from '@/lib/motion'
import { Avatar, Badge, Button, cx, Empty, Sheet } from './ui'
import { LightDots, Luz, Sparkle } from './step1'
import { CommandPalette } from './CommandPalette'
import { PresenceStack, PwaPrompts } from './PwaPrompts'
import { ThemeToggle } from './ThemeToggle'
import { trackPage } from '@/lib/sync'
import { ErrorBoundary } from './ErrorBoundary'

export const NAV: Record<Section, { label: string; to: string; icon: typeof Home; group: string }> = {
  inicio: { label: 'Inicio', to: '/', icon: Home, group: 'General' },
  mapa: { label: 'Mapa', to: '/mapa', icon: Map, group: 'Operación' },
  hospedaje: { label: 'Hospedaje', to: '/hospedaje', icon: BedDouble, group: 'Operación' },
  limpieza: { label: 'Limpieza', to: '/limpieza', icon: Sparkles, group: 'Operación' },
  tareas: { label: 'Tareas', to: '/tareas', icon: ListChecks, group: 'Operación' },
  eventos: { label: 'Eventos', to: '/eventos', icon: PartyPopper, group: 'Eventos' },
  invitados: { label: 'Invitados', to: '/invitados', icon: UsersRound, group: 'Eventos' },
  espacios: { label: 'Salón y jardín', to: '/espacios', icon: Armchair, group: 'Eventos' },
  mensajes: { label: 'Mensajes', to: '/mensajes', icon: Send, group: 'Eventos' },
  proveedores: { label: 'Proveedores', to: '/proveedores', icon: Store, group: 'Eventos' },
  finanzas: { label: 'Finanzas', to: '/finanzas', icon: Wallet, group: 'Negocio' },
  inventario: { label: 'Inventario', to: '/inventario', icon: Package, group: 'Negocio' },
  equipo: { label: 'Equipo', to: '/equipo', icon: Users, group: 'Negocio' },
  ajustes: { label: 'Ajustes', to: '/ajustes', icon: Settings, group: 'Sistema' },
}

/** Marca: la luz + palabra en display */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Luz size={compact ? 26 : 24} className="!animate-none" />
      {!compact && (
        <span className="leading-none">
          <span className="heading block text-[1.35rem]">La Joya</span>
          <span className="eyebrow mt-1 block !text-[10px]">Jardines & Cabañas</span>
        </span>
      )}
    </span>
  )
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Pill de estado de sincronización (calma, sin alarmas) */
function SyncPill({ compact }: { compact?: boolean }) {
  const sync = useStore((s) => s.sync)
  const pending = useStore((s) => Object.keys(s.dirty).length)
  const online = useOnline()
  const state = !online ? 'offline' : sync.status
  const text = {
    local: 'Guardado en este equipo',
    idle: pending ? `${pending} cambios por subir` : 'Sincronizado',
    syncing: 'Sincronizando',
    error: 'Revisar sincronización',
    offline: 'Sin conexión',
    follower: 'Sincronizado',
  }[state]
  const live = sync.realtime === 'live'
  return (
    <NavLink to="/ajustes?tab=nube" title={sync.error || text} className="glass inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs text-ink-soft ring-1 ring-line hover:text-ink">
      {state === 'syncing' ? (
        <LightDots className="text-chispa-soft" />
      ) : (
        <span className={cx('h-1.5 w-1.5 rounded-full', (state === 'idle' || state === 'follower') && !pending ? cx('bg-success', live && 'shadow-[0_0_8px_var(--luz)]') : state === 'error' ? 'bg-danger' : 'bg-chispa-soft')} />
      )}
      {!compact && text}
    </NavLink>
  )
}

/** Aviso flotante al perder/recuperar la conexión */
function OfflineBanner() {
  const online = useOnline()
  const [back, setBack] = useState(false)
  const was = useRef(online)
  useEffect(() => {
    if (online && !was.current) {
      setBack(true)
      const t = setTimeout(() => setBack(false), 2200)
      was.current = online
      return () => clearTimeout(t)
    }
    was.current = online
  }, [online])
  return (
    <AnimatePresence>
      {(!online || back) && (
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }} exit={{ opacity: 0, y: -8 }} className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[65] flex justify-center px-4">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-ink shadow-[var(--shadow-2)] ring-1 ring-line">
            {online ? <Sparkle className="text-chispa-soft" /> : <CloudOff size={15} className="text-ink-soft" />}
            {online ? 'Sincronizado' : 'Sin conexión · tus cambios se guardan'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function NotificationsButton() {
  const me = useMe()
  const all = useCollection('notifications')
  const patch = useStore((s) => s.patch)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const mine = useMemo(() => all.filter((n) => me && n.roles.includes(me.role)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60), [all, me])
  const unread = mine.filter((n) => !n.read).length
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Avisos${unread ? `, ${unread} sin leer` : ''}`} className="pressable relative flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink">
        <Bell size={20} strokeWidth={1.6} />
        {unread > 0 && <span className="absolute top-2 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-chispa px-1 text-[10px] font-medium text-on-chispa ring-2 ring-paper">{unread}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Avisos" subtitle={unread ? `${unread} sin leer` : 'Todo al día'}>
        {mine.length === 0 && <Empty kind="avisos" title="Sin avisos" body="Aquí aparecerán las novedades del rancho." />}
        <div className="flex flex-col">
          {mine.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                patch('notifications', n.id, { read: true }, { silent: true })
                if (n.link) {
                  navigate(n.link)
                  setOpen(false)
                }
              }}
              className={cx('pressable -mx-3 flex items-start gap-3 rounded-[14px] p-3 text-left hover:bg-wash', n.read && 'opacity-55')}
            >
              <span className={cx('mt-2 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-line-strong' : TONE[n.tone].solid)} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{n.title}</span>
                <span className="block text-sm text-ink-soft">{n.body}</span>
                <span className="mt-1 block text-xs text-ink-3">{ago(n.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
        {unread > 0 && (
          <Button variant="outline" className="mt-5 w-full" onClick={() => mine.forEach((n) => !n.read && patch('notifications', n.id, { read: true }, { silent: true }))}>
            Marcar todo como leído
          </Button>
        )}
      </Sheet>
    </>
  )
}

function UserCard() {
  const me = useMe()
  const lock = useStore((s) => s.lock)
  const logout = useStore((s) => s.logout)
  if (!me) return null
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] p-2">
      <Avatar name={me.name} tone={me.color} size={38} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="keep-truncate truncate text-sm font-medium" title={me.name}>{me.name}</div>
        <div className="keep-truncate truncate text-xs text-ink-soft">{ROLE[me.role].label}</div>
      </div>
      <button onClick={lock} title="Bloquear" aria-label="Bloquear sesión" className="pressable rounded-full p-2 text-ink-3 hover:bg-wash hover:text-ink">
        <Lock size={16} strokeWidth={1.6} />
      </button>
      <button onClick={logout} title="Salir" aria-label="Cerrar sesión" className="pressable rounded-full p-2 text-ink-3 hover:bg-wash hover:text-ink">
        <LogOut size={16} strokeWidth={1.6} />
      </button>
    </div>
  )
}

/** Contadores de la barra lateral (estilo Fintrack): lo pendiente de cada sección */
function useNavCounts(): Partial<Record<Section, { n: number; urgent?: boolean }>> {
  const me = useMe()
  const tasks = useStore((s) => s.data.tasks)
  const reservations = useStore((s) => s.data.reservations)
  const events = useStore((s) => s.data.events)
  return useMemo(() => {
    const T = today()
    const open = Object.values(tasks).filter((t) => !t.deleted && (t.status === 'pendiente' || t.status === 'en-progreso'))
    const mine = me?.role === 'admin' ? open : open.filter((t) => t.assigneeId === me?.id || !t.assigneeId)
    const dueToday = mine.filter((t) => !t.due || t.due.slice(0, 10) <= T)
    const cleaning = open.filter((t) => t.type === 'limpieza' && (me?.role !== 'limpieza' || t.assigneeId === me?.id))
    const arrivals = Object.values(reservations).filter((r) => !r.deleted && r.checkIn === T && (r.status === 'confirmada' || r.status === 'pendiente'))
    const follow = Object.values(events).filter((e) => !e.deleted && (e.status === 'prospecto' || e.status === 'cotizado') && e.followUpAt && e.followUpAt <= T)
    const week = Object.values(events).filter((e) => !e.deleted && e.status !== 'cancelado' && e.date >= T && e.date <= localDay(new Date(Date.now() + 7 * 864e5).toISOString()))
    return {
      tareas: { n: dueToday.length, urgent: dueToday.some((t) => t.priority === 'urgente') },
      limpieza: { n: cleaning.length, urgent: cleaning.some((t) => t.priority === 'urgente') },
      hospedaje: { n: arrivals.length },
      // Eventos de la semana + prospectos por contestar (urgente si alguno ya venció)
      eventos: { n: week.length + follow.length, urgent: follow.some((e) => (e.followUpAt ?? T) < T) },
    }
  }, [me, tasks, reservations, events])
}

/** Migas de pan de la barra superior */
function Crumbs({ current }: { current?: Section }) {
  const location = useLocation()
  const events = useStore((s) => s.data.events)
  if (!current) return null
  const item = NAV[current]
  const Icon = item.icon
  const detailId = current === 'eventos' ? location.pathname.split('/')[2] : undefined
  const detail = detailId ? events[detailId]?.title : undefined
  return (
    <nav aria-label="Ubicación" className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
      <span className="text-ink-3">{item.group === 'General' ? 'La Joya' : item.group}</span>
      <ChevronRight size={14} strokeWidth={1.6} className="shrink-0 text-ink-faint" />
      {detail ? (
        <>
          <NavLink to={item.to} className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink">
            <Icon size={15} strokeWidth={1.6} />
            {item.label}
          </NavLink>
          <ChevronRight size={14} strokeWidth={1.6} className="shrink-0 text-ink-faint" />
          <span className="truncate keep-truncate font-medium text-ink">{detail}</span>
        </>
      ) : (
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <Icon size={15} strokeWidth={1.6} />
          {item.label}
        </span>
      )}
    </nav>
  )
}

export default function AppShell() {
  const me = useMe()
  const location = useLocation()
  const [more, setMore] = useState(false)
  const [search, setSearch] = useState(false)
  const [hideTabs, setHideTabs] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const sections = me ? ROLE_SECTIONS[me.role] : []
  const moreSections = me ? ROLE_MORE[me.role] : []
  const primary = sections.filter((s) => !moreSections.includes(s))
  const mobileMain: Section[] = primary.filter((s) => s !== 'ajustes').slice(0, 4)
  const mobileMore = sections.filter((s) => !mobileMain.includes(s))
  const fullBleed = location.pathname.startsWith('/mapa')
  const current = sections.find((s) => (NAV[s].to === '/' ? location.pathname === '/' : location.pathname.startsWith(NAV[s].to)))
  const counts = useNavCounts()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('lajoya:navCollapsed') || '{}')
    } catch {
      return {}
    }
  })
  const toggleGroup = (g: string) =>
    setCollapsed((c) => {
      const next = { ...c, [g]: !(c[g] ?? g === 'Más') }
      try {
        localStorage.setItem('lajoya:navCollapsed', JSON.stringify(next))
      } catch {
        /* sin almacenamiento */
      }
      return next
    })
  const groups = useMemo(() => {
    const order = ['General', 'Operación', 'Eventos', 'Negocio']
    const main = order.map((name) => ({ name, items: primary.filter((s) => NAV[s].group === name) })).filter((g) => g.items.length)
    if (moreSections.length) main.push({ name: 'Más', items: moreSections })
    const sistema = primary.filter((s) => NAV[s].group === 'Sistema')
    if (sistema.length) main.push({ name: 'Sistema', items: sistema })
    return main
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // La barra inferior se esconde al bajar y reaparece al subir
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    let lastY = el.scrollTop
    const onScroll = () => {
      const y = el.scrollTop
      if (Math.abs(y - lastY) > 8) {
        setHideTabs(y > lastY && y > 120)
        lastY = y
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    setHideTabs(false)
    mainRef.current?.scrollTo({ top: 0 })
    trackPage(location.pathname)
  }, [location.pathname])

  return (
    <div className="flex h-dvh overflow-hidden">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[80] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Saltar al contenido
      </a>

      {/* Barra lateral compacta: rail en tablet, completa en escritorio (medidas estilo Fintrack) */}
      <aside className="hidden shrink-0 flex-col border-r border-line bg-surface pt-safe md:flex md:w-[72px] xl:w-[240px]">
        <div className="flex h-14 items-center justify-center border-b border-line px-4 xl:justify-start">
          <span className="xl:hidden">
            <Brand compact />
          </span>
          <span className="hidden xl:block">
            <Brand />
          </span>
        </div>
        <nav className="scroll-area flex-1 overflow-y-auto px-2.5 py-3" aria-label="Principal">
          {groups.map((g) => {
            // "Más" empieza plegado; se abre solo si estás en una de sus secciones
            const inside = g.items.includes(current as Section)
            const isCollapsed = g.name !== 'General' && !inside && (collapsed[g.name] ?? g.name === 'Más')
            return (
              <div key={g.name} className="mb-2.5">
                {g.name !== 'General' && (
                  <button onClick={() => toggleGroup(g.name)} className="mb-0.5 hidden h-7 w-full items-center gap-1 rounded-md px-2.5 text-[12px] font-medium text-ink-3 hover:text-ink-soft xl:flex" aria-expanded={!isCollapsed}>
                    {g.name}
                    <ChevronDown size={13} strokeWidth={1.8} className={cx('transition-transform duration-[var(--dur-3)]', isCollapsed && '-rotate-90')} />
                  </button>
                )}
                {!isCollapsed &&
                  g.items.map((sec) => {
                    const item = NAV[sec]
                    const Icon = item.icon
                    const c = counts[sec]
                    return (
                      <NavLink key={sec} to={item.to} end={item.to === '/'} title={item.label} className={({ isActive }) => cx('relative mb-px flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-medium transition-colors duration-[var(--dur-2)] md:justify-center xl:justify-start', isActive ? 'text-ink' : 'text-ink-soft hover:bg-wash hover:text-ink')}>
                        {({ isActive }) => (
                          <>
                            {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-secondary ring-1 ring-line" transition={spring.suave} />}
                            <Icon size={17} strokeWidth={1.7} className="relative shrink-0" />
                            <span className="relative hidden flex-1 truncate xl:inline">{item.label}</span>
                            {c && c.n > 0 && (
                              <span className={cx('relative hidden min-w-5 justify-center text-[11.5px] tabular xl:flex', c.urgent ? 'font-semibold text-chispa' : 'text-ink-3')}>{c.n}</span>
                            )}
                            {c && c.n > 0 && <span className={cx('absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full xl:hidden', c.urgent ? 'bg-chispa' : 'bg-chispa-soft')} />}
                            {isActive && !(c && c.n > 0) && <span className="absolute right-2.5 hidden h-[5px] w-[5px] rounded-full bg-chispa-soft shadow-[0_0_10px_2px_var(--luz)] xl:block" />}
                          </>
                        )}
                      </NavLink>
                    )
                  })}
              </div>
            )
          })}
        </nav>
        <div className="border-t border-line p-2.5">
          <div className="mb-1.5 flex justify-center xl:justify-start xl:px-1">
            <span className="xl:hidden">
              <SyncPill compact />
            </span>
            <span className="hidden xl:block">
              <SyncPill />
            </span>
          </div>
          <div className="hidden rounded-xl ring-1 ring-line xl:block">
            <UserCard />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cx('z-30 flex shrink-0 items-center gap-1.5 px-4 pt-safe md:px-6', fullBleed ? 'absolute inset-x-0 md:left-[72px] xl:left-[240px]' : 'glass border-b border-line')}>
          <div className="flex h-14 min-w-0 flex-1 items-center gap-2.5">
            <span className="md:hidden">
              <Brand compact />
            </span>
            <span className="heading text-[1.3rem] md:hidden">{current ? NAV[current].label : 'La Joya'}</span>
            {!fullBleed && <Crumbs current={current} />}
          </div>
          <button onClick={() => setSearch(true)} className={cx('pressable mr-1 hidden h-9 w-[min(280px,28vw)] items-center gap-2 rounded-lg bg-surface px-3 text-[13px] text-ink-3 ring-1 ring-line hover:text-ink-soft md:flex', fullBleed && 'glass')} aria-label="Buscar">
            <Search size={15} strokeWidth={1.6} />
            <span className="keep-truncate flex-1 truncate text-left">Buscar huésped, evento, tarea…</span>
            <kbd className="rounded-md bg-sunken px-1.5 py-0.5 text-[10.5px] font-medium text-ink-soft">Ctrl K</kbd>
          </button>
          <span className="hidden sm:block md:hidden">
            <SyncPill compact />
          </span>
          <button onClick={() => setSearch(true)} aria-label="Buscar" className={cx('pressable flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink md:hidden', fullBleed && 'glass ring-1 ring-line')}>
            <Search size={20} strokeWidth={1.6} />
          </button>
          <span className="hidden sm:block">
            <PresenceStack />
          </span>
          <span className={cx(fullBleed && 'glass rounded-full ring-1 ring-line')}>
            <ThemeToggle />
          </span>
          <span className={cx(fullBleed && 'glass rounded-full ring-1 ring-line')}>
            <NotificationsButton />
          </span>
          {me && (
            <button onClick={() => setMore(true)} aria-label="Tu cuenta" className="pressable ml-1 hidden rounded-full md:block xl:hidden">
              <Avatar name={me.name} tone={me.color} size={36} />
            </button>
          )}
        </header>

        <main id="contenido" ref={mainRef} className={cx('scroll-area relative min-h-0 flex-1 overflow-y-auto', !fullBleed && 'pb-[calc(112px+env(safe-area-inset-bottom))] md:pb-12')}>
          <motion.div
            key={location.pathname.split('/')[1] || 'inicio'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.36, ease: ease.calma } }}
            className={fullBleed ? 'h-full' : 'mx-auto w-full max-w-[1440px] px-4 pt-5 sm:px-6 md:px-7 md:pt-6'}
          >
            <ErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </motion.div>
        </main>
      </div>

      {/* Tab bar flotante en noche con punto de luz (móvil) */}
      <motion.nav
        aria-label="Navegación"
        animate={{ y: hideTabs ? 'calc(100% + 32px)' : 0 }}
        transition={{ duration: 0.28, ease: ease.calma }}
        className="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-40 md:hidden"
      >
        <div className="flex h-16 items-stretch justify-around rounded-full bg-night px-2 shadow-[var(--shadow-3)] ring-1 ring-[color-mix(in_oklab,var(--on-night)_10%,transparent)]">
          {mobileMain.map((s) => (
            <TabItem key={s} to={NAV[s].to} label={NAV[s].label} icon={NAV[s].icon} />
          ))}
          {mobileMore.length > 0 && (
            <button
              onClick={() => {
                haptic.select()
                setMore(true)
              }}
              className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] text-on-night-soft"
              aria-label="Más opciones"
            >
              <MoreHorizontal size={22} strokeWidth={1.6} />
              Más
            </button>
          )}
        </div>
      </motion.nav>

      <Sheet open={more} onClose={() => setMore(false)} title="Más">
        <div className="grid grid-cols-3 gap-3">
          {mobileMore.map((s) => {
            const Icon = NAV[s].icon
            return (
              <NavLink key={s} to={NAV[s].to} onClick={() => setMore(false)} className="card pressable flex flex-col items-center gap-2.5 p-4 text-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[5px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]">
                  <Icon size={20} strokeWidth={1.6} />
                </span>
                {NAV[s].label}
              </NavLink>
            )
          })}
        </div>
        <div className="card mt-5">
          <UserCard />
        </div>
        <div className="mt-4 flex justify-center">
          <SyncPill />
        </div>
      </Sheet>

      <OfflineBanner />
      <PwaPrompts />
      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </div>
  )
}

function TabItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }): ReactNode {
  return (
    <NavLink to={to} end={to === '/'} onClick={() => haptic.select()} className={({ isActive }) => cx('relative flex flex-1 flex-col items-center justify-center gap-1 text-[10px] transition-colors duration-[var(--dur-2)]', isActive ? 'text-on-night' : 'text-on-night-soft')}>
      {({ isActive }) => (
        <>
          <Icon size={22} strokeWidth={1.6} />
          <span>{label}</span>
          {isActive && <motion.span layoutId="tab-light" className="absolute bottom-1.5 h-[5px] w-[5px] rounded-full bg-luz shadow-[0_0_10px_2px_var(--luz)]" transition={spring.suave} />}
        </>
      )}
    </NavLink>
  )
}

export function RoleBadge({ role }: { role: keyof typeof ROLE }) {
  return <Badge tone={ROLE[role].tone}>{ROLE[role].label}</Badge>
}

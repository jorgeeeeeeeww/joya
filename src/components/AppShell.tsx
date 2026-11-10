import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Armchair,
  Bell,
  BedDouble,
  Compass,
  ChevronsUpDown,
  CloudOff,
  HelpCircle,
  Lightbulb,
  Home,
  ListChecks,
  Lock,
  LogOut,
  Map,
  Monitor,
  Moon,
  MoreHorizontal,
  Package,
  PartyPopper,
  Search,
  Send,
  Settings,
  Sparkles,
  Store,
  Sun,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { useCollection, useMe, useStore } from '@/lib/store'
import { ROLE, ROLE_MORE, ROLE_SECTIONS, TONE, type Section } from '@/lib/meta'
import { ago, capitalize, fmt, localDay, today } from '@/lib/format'
import { ease, haptic, spring } from '@/lib/motion'
import { useWeather } from '@/lib/weather'
import { Avatar, Badge, Button, cx, Empty, Popover, Segmented, Sheet } from './ui'
import { LightDots, Luz, Sparkle } from './step1'
import { CommandPalette } from './CommandPalette'
import { PresenceStack, PwaPrompts } from './PwaPrompts'
import { setThemePref, useThemePref } from './ThemeToggle'
import { trackPage } from '@/lib/sync'
import { ErrorBoundary } from './ErrorBoundary'
import { PullToRefresh } from './PullToRefresh'
import { AssistantDock, AssistantIntro, useHelp } from './assistant/Asistente'

/** Una tarea sin asignar le toca a quien hace ese tipo de trabajo (para el contador del menú) */
const fitsRole = (role: string | undefined, type: string) =>
  type === 'limpieza' ? role === 'limpieza' || role === 'recepcion' : type === 'mantenimiento' || type === 'jardin' ? role === 'mantenimiento' : type === 'evento' ? role === 'eventos' : type === 'compra' ? role === 'recepcion' : true

/**
 * Tres grupos fijos en el menú, sin plegar:
 * - Hoy: lo del día a día (inicio, tareas, limpieza, mapa)
 * - Rentas: lo que se renta (hospedaje y eventos, con sus herramientas)
 * - Negocio: dinero, insumos y equipo
 * Ajustes y Ayuda viven abajo, junto a tu cuenta.
 */
type Group = 'Hoy' | 'Rentas' | 'Negocio' | 'Sistema'
export const NAV: Record<Section, { label: string; to: string; icon: typeof Home; group: Group }> = {
  inicio: { label: 'Inicio', to: '/', icon: Home, group: 'Hoy' },
  tareas: { label: 'Tareas', to: '/tareas', icon: ListChecks, group: 'Hoy' },
  limpieza: { label: 'Limpieza', to: '/limpieza', icon: Sparkles, group: 'Hoy' },
  mapa: { label: 'Mapa', to: '/mapa', icon: Map, group: 'Hoy' },
  hospedaje: { label: 'Hospedaje', to: '/hospedaje', icon: BedDouble, group: 'Rentas' },
  eventos: { label: 'Eventos', to: '/eventos', icon: PartyPopper, group: 'Rentas' },
  estudio: { label: 'Estudio', to: '/estudio', icon: Lightbulb, group: 'Rentas' },
  invitados: { label: 'Invitados', to: '/invitados', icon: UsersRound, group: 'Rentas' },
  espacios: { label: 'Salón y jardín', to: '/espacios', icon: Armchair, group: 'Rentas' },
  mensajes: { label: 'Mensajes', to: '/mensajes', icon: Send, group: 'Rentas' },
  proveedores: { label: 'Proveedores', to: '/proveedores', icon: Store, group: 'Rentas' },
  finanzas: { label: 'Finanzas', to: '/finanzas', icon: Wallet, group: 'Negocio' },
  inventario: { label: 'Inventario', to: '/inventario', icon: Package, group: 'Negocio' },
  equipo: { label: 'Equipo', to: '/equipo', icon: Users, group: 'Negocio' },
  ajustes: { label: 'Ajustes', to: '/ajustes', icon: Settings, group: 'Sistema' },
}
const GROUP_ORDER: Group[] = ['Hoy', 'Rentas', 'Negocio']

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

/** Estado de la sincronización en palabras + color del punto */
function useSyncState() {
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
  const ok = (state === 'idle' || state === 'follower') && !pending
  const dot = ok ? 'bg-success' : state === 'error' ? 'bg-danger' : 'bg-chispa-soft'
  return { state, text, dot, error: sync.error, live: sync.realtime === 'live' }
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

function NotificationsButton({ className }: { className?: string }) {
  const me = useMe()
  const all = useCollection('notifications')
  const patch = useStore((s) => s.patch)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const mine = useMemo(() => all.filter((n) => me && n.roles.includes(me.role) && (!n.userId || n.userId === me.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60), [all, me])
  const unread = mine.filter((n) => !n.read).length
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Avisos${unread ? `, ${unread} sin leer` : ''}`} title="Avisos" className={cx('pressable relative flex shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink', className ?? 'h-11 w-11')}>
        <Bell size={18} strokeWidth={1.7} />
        {unread > 0 && <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-chispa px-1 text-[10px] font-semibold text-on-chispa tabular ring-2 ring-surface">{unread}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Avisos" subtitle={unread ? `${unread} sin leer` : 'Todo al día'}>
        {mine.length === 0 && <Empty kind="avisos" title="Sin avisos" body="Aquí aparecerán las novedades del rancho." />}
        <div className="flex flex-col divide-y divide-line">
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
              className={cx('pressable flex items-start gap-3 py-3 text-left hover:bg-wash', n.read && 'opacity-55')}
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

/** Tu cuenta: tema, sincronización, bloquear y salir. Popover en PC, hoja en el celular. */
function AccountMenu({ open, onClose, anchor }: { open: boolean; onClose: () => void; anchor: RefObject<HTMLElement | null> }) {
  const me = useMe()
  const lock = useStore((s) => s.lock)
  const logout = useStore((s) => s.logout)
  const theme = useThemePref()
  const sync = useSyncState()
  const navigate = useNavigate()
  if (!me) return null
  const row = 'flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[15px] text-ink transition-colors duration-[var(--dur-2)] hover:bg-wash pointer-fine:min-h-9 pointer-fine:text-sm'
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} width={268} label="Tu cuenta">
      <div className="flex items-center gap-3 px-2.5 pt-1.5 pb-3">
        <Avatar name={me.name} tone={me.color} size={36} />
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] font-semibold">{me.name}</div>
          <div className="mt-0.5 text-xs text-ink-3">{ROLE[me.role].label}</div>
        </div>
      </div>
      <div className="px-2 pb-2">
        <Segmented
          size="sm"
          className="w-full"
          value={theme}
          onChange={(v) => setThemePref(v)}
          options={[
            { value: 'light', label: <><Sun size={14} strokeWidth={1.8} /> Claro</> },
            { value: 'dark', label: <><Moon size={14} strokeWidth={1.8} /> Oscuro</> },
            { value: 'auto', label: <><Monitor size={14} strokeWidth={1.8} /> Auto</> },
          ]}
        />
      </div>
      <div className="my-1 h-px bg-line" />
      <button
        className={row}
        title={sync.error || sync.text}
        onClick={() => {
          onClose()
          navigate('/ajustes?tab=nube')
        }}
      >
        <span className="flex w-[18px] justify-center">{sync.state === 'syncing' ? <LightDots className="text-chispa-soft" /> : <span className={cx('h-2 w-2 rounded-full', sync.dot)} />}</span>
        <span className="flex-1">{sync.text}</span>
      </button>
      <button
        className={row}
        onClick={() => {
          onClose()
          lock()
        }}
      >
        <Lock size={17} strokeWidth={1.7} className="text-ink-soft" />
        Bloquear
      </button>
      <button
        className={row}
        onClick={() => {
          onClose()
          logout()
        }}
      >
        <LogOut size={17} strokeWidth={1.7} className="text-ink-soft" />
        Cambiar de persona
      </button>
    </Popover>
  )
}

/** Contadores del menú: lo pendiente de cada sección */
function useNavCounts(): Partial<Record<Section, { n: number; urgent?: boolean }>> {
  const me = useMe()
  const tasks = useStore((s) => s.data.tasks)
  const reservations = useStore((s) => s.data.reservations)
  const events = useStore((s) => s.data.events)
  return useMemo(() => {
    const T = today()
    const open = Object.values(tasks).filter((t) => !t.deleted && (t.status === 'pendiente' || t.status === 'en-progreso'))
    const mine = me?.role === 'admin' ? open : open.filter((t) => t.assigneeId === me?.id || (!t.assigneeId && fitsRole(me?.role, t.type)))
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

/** Un renglón del menú lateral. En el riel de tablet: ícono con su nombre debajo. */
function SideItem({ to, label, icon: Icon, count }: { to: string; label: string; icon: typeof Home; count?: { n: number; urgent?: boolean } }) {
  const has = !!count && count.n > 0
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={label}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center rounded-[10px] transition-colors duration-[var(--dur-2)]',
          'md:min-h-[54px] md:flex-col md:justify-center md:gap-1 md:px-1',
          'xl:h-9 xl:min-h-0 xl:flex-row xl:justify-start xl:gap-2.5 xl:px-2.5',
          isActive ? 'text-ink' : 'text-ink-soft hover:bg-wash hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <>
              <motion.span layoutId="side-active" className="absolute inset-0 rounded-[10px] bg-[color-mix(in_oklab,var(--ink)_6.5%,transparent)]" transition={spring.suave} />
              <motion.span layoutId="side-bar" className="absolute top-1/2 -left-2.5 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-chispa-soft shadow-[0_0_10px_var(--luz)]" transition={spring.suave} />
            </>
          )}
          <Icon size={17} strokeWidth={isActive ? 2 : 1.7} className="relative shrink-0" />
          <span className="relative text-center text-[10.5px] leading-tight font-medium xl:hidden">{label}</span>
          <span className={cx('relative hidden flex-1 text-[13.5px] xl:inline', isActive ? 'font-semibold' : 'font-medium')}>{label}</span>
          {has && <span className={cx('relative hidden min-w-5 justify-end text-[12px] tabular xl:flex', count!.urgent ? 'font-semibold text-chispa' : 'font-medium text-key')}>{count!.n}</span>}
          {has && <span className={cx('absolute top-2 right-3 h-1.5 w-1.5 rounded-full xl:hidden', count!.urgent ? 'bg-chispa' : 'bg-chispa-soft')} />}
        </>
      )}
    </NavLink>
  )
}

/** Botón con el mismo aspecto que un renglón del menú (para acciones que no son una página) */
function SideButton({ label, icon: Icon, onClick, title }: { label: string; icon: typeof Home; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title ?? label} className="group relative flex items-center rounded-[10px] text-ink-soft transition-colors duration-[var(--dur-2)] hover:bg-wash hover:text-ink md:min-h-[54px] md:flex-col md:justify-center md:gap-1 md:px-1 xl:h-9 xl:min-h-0 xl:flex-row xl:justify-start xl:gap-2.5 xl:px-2.5">
      <Icon size={17} strokeWidth={1.7} className="relative shrink-0" />
      <span className="relative text-center text-[10.5px] leading-tight font-medium xl:hidden">{label}</span>
      <span className="relative hidden flex-1 text-left text-[13.5px] font-medium xl:inline">{label}</span>
    </button>
  )
}

/** Barra lateral flotante: marca + fecha arriba, búsqueda, tres grupos y tu cuenta abajo */
function Sidebar({ sections, counts, onSearch }: { sections: Section[]; counts: ReturnType<typeof useNavCounts>; onSearch: () => void }) {
  const me = useMe()
  const weather = useWeather()
  const sync = useSyncState()
  const accountRef = useRef<HTMLButtonElement>(null)
  const [account, setAccount] = useState(false)
  const help = useHelp()
  const groups = GROUP_ORDER.map((name) => ({ name, items: sections.filter((s) => NAV[s].group === name) })).filter((g) => g.items.length)
  const canSettings = sections.includes('ajustes')
  const day = capitalize(fmt(new Date(), "EEE d 'de' MMM").replace('.', ''))

  return (
    <aside className="hidden shrink-0 p-2.5 pr-0 pt-[max(10px,env(safe-area-inset-top))] md:flex md:w-[92px] xl:w-[256px]">
      <div className="flex w-full flex-col rounded-[20px] bg-surface shadow-[var(--shadow-1)] ring-1 ring-line">
        {/* Marca y día */}
        <div className="flex items-center gap-2.5 px-3 pt-4 pb-3 md:flex-col xl:flex-row xl:px-4">
          <Luz size={26} className="!animate-none shrink-0" />
          <div className="hidden min-w-0 flex-1 leading-tight xl:block">
            <div className="text-[15px] font-semibold tracking-[-0.02em]">La Joya</div>
            <div className="mt-0.5 text-[12px] text-ink-3 tabular">
              {day}
              {weather ? ` · ${weather.temp}°` : ''}
            </div>
          </div>
          <NotificationsButton className="h-9 w-9" />
        </div>

        {/* Búsqueda */}
        <div className="px-2.5 pb-3">
          <button onClick={onSearch} aria-label="Buscar" title="Buscar (Ctrl K)" className="pressable flex h-9 w-full items-center justify-center gap-2 rounded-[10px] px-2.5 text-[13px] text-ink-3 ring-1 ring-line ring-inset hover:bg-wash hover:text-ink-soft xl:justify-start">
            <Search size={15} strokeWidth={1.8} />
            <span className="hidden flex-1 text-left xl:inline">Buscar</span>
            <kbd className="hidden rounded-[6px] bg-sunken px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-detail xl:inline">Ctrl K</kbd>
          </button>
        </div>

        {/* Secciones */}
        <nav className="scroll-area min-h-0 flex-1 overflow-y-auto px-2.5 pb-3" aria-label="Principal">
          {groups.map((g, i) => (
            <div key={g.name} className={cx(i > 0 && 'mt-4')}>
              {g.name !== 'Hoy' && <div className="mb-1 hidden px-2.5 text-[11.5px] font-medium text-ink-3 xl:block">{g.name}</div>}
              {i > 0 && <div className="mx-3 mb-2 h-px bg-line xl:hidden" />}
              <div className="flex flex-col gap-px">
                {g.items.map((sec) => (
                  <SideItem key={sec} to={NAV[sec].to} label={NAV[sec].label} icon={NAV[sec].icon} count={counts[sec]} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Ayuda, ajustes y tu cuenta */}
        <div className="flex flex-col gap-px border-t border-line px-2.5 pt-2.5 pb-2.5">
          <SideButton label="Ayuda" icon={Compass} onClick={help} title="Qué ves en esta pantalla y qué sigue" />
          {canSettings && <SideItem to="/ajustes" label="Ajustes" icon={Settings} />}
          {me && (
            <div className="mt-1.5 flex items-center gap-1">
              <button ref={accountRef} onClick={() => setAccount((o) => !o)} aria-label="Tu cuenta" aria-haspopup="dialog" aria-expanded={account} className="pressable flex min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[12px] p-1.5 text-left hover:bg-wash xl:justify-start">
                <span className="relative shrink-0">
                  <Avatar name={me.name} tone={me.color} size={32} />
                  <span title={sync.text} className={cx('absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface', sync.dot)} />
                </span>
                <span className="hidden min-w-0 flex-1 leading-tight xl:block">
                  <span className="block text-[13px] font-semibold">{me.name}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-3">{sync.state === 'idle' || sync.state === 'follower' ? ROLE[me.role].label : sync.text}</span>
                </span>
                <ChevronsUpDown size={14} strokeWidth={1.8} className="hidden shrink-0 text-ink-3 xl:block" />
              </button>
            </div>
          )}
          <div className="hidden justify-center pt-1 xl:flex">
            <PresenceStack />
          </div>
        </div>
      </div>
      <AccountMenu open={account} onClose={() => setAccount(false)} anchor={accountRef} />
    </aside>
  )
}

export default function AppShell() {
  const me = useMe()
  const location = useLocation()
  const [more, setMore] = useState(false)
  const [search, setSearch] = useState(false)
  const [hideTabs, setHideTabs] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const accountRef = useRef<HTMLButtonElement>(null)
  const [account, setAccount] = useState(false)
  const sections = me ? ROLE_SECTIONS[me.role] : []
  const moreSections = me ? ROLE_MORE[me.role] : []
  const primary = sections.filter((s) => !moreSections.includes(s))
  const mobileMain: Section[] = primary.filter((s) => s !== 'ajustes').slice(0, 4)
  const mobileMore = sections.filter((s) => !mobileMain.includes(s))
  const fullBleed = location.pathname.startsWith('/mapa')
  const current = sections.find((s) => (NAV[s].to === '/' ? location.pathname === '/' : location.pathname.startsWith(NAV[s].to)))
  const counts = useNavCounts()
  const sync = useSyncState()
  const help = useHelp()

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

      <Sidebar sections={sections} counts={counts} onSearch={() => setSearch(true)} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Barra superior solo en el celular: la luz, buscar, avisos y tu cuenta. El título lo pone cada página. */}
        <header className={cx('z-30 flex shrink-0 items-center gap-1 px-3 pt-safe md:hidden', fullBleed ? 'absolute inset-x-0' : 'bg-paper')}>
          <div className="flex h-14 min-w-0 flex-1 items-center gap-2.5 pl-1">
            <Luz size={24} className="!animate-none shrink-0" />
            {fullBleed && current && <span className="glass rounded-full px-3 py-1 text-[15px] font-semibold ring-1 ring-line">{NAV[current].label}</span>}
          </div>
          <button onClick={() => setSearch(true)} aria-label="Buscar" className={cx('pressable flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink', fullBleed && 'glass ring-1 ring-line')}>
            <Search size={19} strokeWidth={1.7} />
          </button>
          <button onClick={help} aria-label="Ayuda de esta pantalla" className={cx('pressable flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink', fullBleed && 'glass ring-1 ring-line')}>
            <Compass size={19} strokeWidth={1.7} />
          </button>
          <span className={cx(fullBleed && 'glass rounded-full ring-1 ring-line')}>
            <NotificationsButton />
          </span>
          {me && (
            <button ref={accountRef} onClick={() => setAccount((o) => !o)} aria-label="Tu cuenta" className="pressable relative ml-0.5 rounded-full p-1">
              <Avatar name={me.name} tone={me.color} size={32} />
              <span className={cx('absolute right-0.5 bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-paper', sync.dot)} />
            </button>
          )}
        </header>
        <AccountMenu open={account} onClose={() => setAccount(false)} anchor={accountRef} />

        <PullToRefresh target={mainRef} disabled={fullBleed} />
        <main id="contenido" ref={mainRef} className={cx('scroll-area relative min-h-0 flex-1 overflow-y-auto', !fullBleed && 'pb-[calc(112px+env(safe-area-inset-bottom))] md:pb-16')}>
          <motion.div
            key={location.pathname.split('/')[1] || 'inicio'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: ease.calma } }}
            className={fullBleed ? 'h-full' : 'mx-auto w-full max-w-[1320px] px-4 pt-2 sm:px-6 md:px-8 md:pt-9 xl:px-10'}
          >
            {!fullBleed && <AssistantIntro />}
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
        className="fixed inset-x-4 bottom-[calc(14px+env(safe-area-inset-bottom))] z-40 md:hidden"
      >
        <div className="flex h-16 items-stretch justify-around rounded-full bg-night px-2 shadow-[var(--shadow-3)] ring-1 ring-[color-mix(in_oklab,var(--on-night)_10%,transparent)]">
          {mobileMain.map((s) => (
            <TabItem key={s} to={NAV[s].to} label={NAV[s].label} icon={NAV[s].icon} badge={counts[s]?.n ? counts[s] : undefined} />
          ))}
          {mobileMore.length > 0 && (
            <button
              onClick={() => {
                haptic.select()
                setMore(true)
              }}
              className={cx('flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium', mobileMore.includes(current as Section) ? 'text-on-night' : 'text-on-night-soft')}
              aria-label="Más secciones"
            >
              <MoreHorizontal size={22} strokeWidth={1.6} />
              Más
            </button>
          )}
        </div>
      </motion.nav>

      {/* "Más" en el celular: lista agrupada, como en la barra lateral */}
      <Sheet open={more} onClose={() => setMore(false)} title="Más">
        {GROUP_ORDER.concat('Sistema').map((g) => {
          const items = mobileMore.filter((s) => NAV[s].group === g)
          if (!items.length) return null
          return (
            <div key={g} className="mb-4">
              {g !== 'Sistema' && <div className="mb-1 px-1 text-[13px] font-medium text-ink-3">{g}</div>}
              <div className="divide-y divide-line overflow-hidden rounded-[var(--r-lg)] ring-1 ring-line">
                {items.map((s) => (
                  <MoreRow key={s} to={NAV[s].to} label={NAV[s].label} icon={NAV[s].icon} count={counts[s]?.n} onPick={() => setMore(false)} />
                ))}
              </div>
            </div>
          )
        })}
        <div className="divide-y divide-line overflow-hidden rounded-[var(--r-lg)] ring-1 ring-line">
          <MoreRow to="/ayuda" label="Ayuda" icon={HelpCircle} hint="Guías paso a paso de tu trabajo" onPick={() => setMore(false)} />
        </div>
      </Sheet>

      <OfflineBanner />
      <AssistantDock />
      <PwaPrompts />
      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </div>
  )
}

function MoreRow({ to, label, icon: Icon, hint, count, onPick }: { to: string; label: string; icon: typeof Home; hint?: string; count?: number; onPick: () => void }) {
  return (
    <NavLink to={to} onClick={onPick} className={({ isActive }) => cx('pressable flex min-h-14 items-center gap-3.5 bg-surface px-4 text-[16px]', isActive && 'font-semibold')}>
      <Icon size={20} strokeWidth={1.7} className="shrink-0 text-ink-soft" />
      <span className="min-w-0 flex-1 py-3">
        <span className="block">{label}</span>
        {hint && <span className="block text-[13px] text-ink-3">{hint}</span>}
      </span>
      {!!count && <span className="text-[13px] text-ink-3 tabular">{count}</span>}
    </NavLink>
  )
}

function TabItem({ to, label, icon: Icon, badge }: { to: string; label: string; icon: typeof Home; badge?: { n: number; urgent?: boolean } }): ReactNode {
  return (
    <NavLink to={to} end={to === '/'} onClick={() => haptic.select()} className={({ isActive }) => cx('relative flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors duration-[var(--dur-2)]', isActive ? 'text-on-night' : 'text-on-night-soft')}>
      {({ isActive }) => (
        <>
          <span className="relative">
            <Icon size={22} strokeWidth={isActive ? 1.9 : 1.6} />
            {badge && <span className={cx('absolute -top-0.5 -right-1 h-2 w-2 rounded-full ring-2 ring-night', badge.urgent ? 'bg-chispa' : 'bg-chispa-soft')} />}
          </span>
          <span>{label}</span>
          {isActive && <motion.span layoutId="tab-light" className="absolute bottom-1.5 h-[4px] w-[4px] rounded-full bg-luz shadow-[0_0_10px_2px_var(--luz)]" transition={spring.suave} />}
        </>
      )}
    </NavLink>
  )
}

export function RoleBadge({ role }: { role: keyof typeof ROLE }) {
  return <Badge tone={ROLE[role].tone}>{ROLE[role].label}</Badge>
}

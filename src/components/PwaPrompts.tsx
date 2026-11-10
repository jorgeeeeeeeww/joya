// Avisos de app instalada: versión nueva, lista sin conexión, instalar (con guía para iPhone),
// insignia con avisos sin leer y presencia del equipo conectado.
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CircleAlert, Download, PlusSquare, Share, X } from 'lucide-react'
import { isIOS, promptInstall, useAppBadge, usePwa, visitCount } from '@/lib/pwa'
import { usePresence } from '@/lib/sync'
import { useCollection, useMe, useStore } from '@/lib/store'
import { ROLE } from '@/lib/meta'
import { NAV } from './AppShell'
import { ease } from '@/lib/motion'
import { Avatar, Button, Sheet, toast } from './ui'
import { Luz, Sparkle } from './step1'

function UpdateBanner() {
  const needRefresh = usePwa((s) => s.needRefresh)
  const required = usePwa((s) => s.required)
  const update = usePwa((s) => s.update)
  const [busy, setBusy] = useState(false)
  // La nube pide una versión más nueva pero todavía no se descarga: se avisa por qué no se suben los cambios
  const show = needRefresh || required
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[62] flex justify-center md:inset-x-0 md:bottom-6 md:pointer-events-none md:[&>*]:pointer-events-auto"
        >
          <div className="flex w-full max-w-md items-center gap-3 rounded-[28px] bg-night py-2 pr-2 pl-4 text-on-night shadow-[var(--shadow-3)]">
            <Sparkle className="shrink-0 text-luz" />
            <span className="min-w-0 flex-1 py-1 text-sm">
              {required ? (needRefresh ? 'Actualiza para seguir sincronizando. Tus cambios están guardados aquí.' : 'Descargando la versión que pide la nube…') : 'Hay una versión nueva de La Joya'}
            </span>
            {needRefresh && (
            <Button
              size="sm"
              variant="luz"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                await update?.()
              }}
            >
              Actualizar
            </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** El dispositivo no dejó guardar (iPhone después de segundo plano, o sin espacio): se reintenta solo */
function SaveErrorBanner() {
  const saveError = useStore((s) => s.sync.saveError)
  return (
    <AnimatePresence>
      {saveError && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.calma } }}
          exit={{ opacity: 0, y: -8 }}
          className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+12px)] z-[63] flex justify-center md:right-6 md:left-auto"
        >
          <div className="flex w-full max-w-md items-start gap-3 rounded-[22px] bg-[color-mix(in_oklab,var(--danger)_12%,var(--surface))] px-4 py-3 text-sm shadow-[var(--shadow-3)] ring-1 ring-[color-mix(in_oklab,var(--danger)_30%,transparent)]">
            <CircleAlert size={18} strokeWidth={1.7} className="mt-0.5 shrink-0 text-danger" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{saveError}</span>
              <span className="block text-ink-soft">No cierres la app un momento. Lo que capturaste sigue en pantalla.</span>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function OfflineReady() {
  const ready = usePwa((s) => s.offlineReady)
  useEffect(() => {
    if (ready) {
      toast.success('Lista para usar sin internet', 'La app ya vive en este dispositivo')
      usePwa.setState({ offlineReady: false })
    }
  }, [ready])
  return null
}

function InstallCard() {
  const installed = usePwa((s) => s.installed)
  const installEvent = usePwa((s) => s.installEvent)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Number(localStorage.getItem('lajoya:installDismissed') || '0') > Date.now()
    } catch {
      return false
    }
  })
  const [iosSheet, setIosSheet] = useState(false)
  const ios = isIOS()
  const show = !installed && !dismissed && visitCount() >= 2 && (!!installEvent || ios)

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem('lajoya:installDismissed', String(Date.now() + 7 * 86400000))
    } catch {
      /* sin almacenamiento */
    }
  }

  return (
    <>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma, delay: 1.2 } }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[61] md:right-6 md:bottom-6 md:left-auto md:w-[380px]"
          >
            <div className="glass relative flex items-center gap-4 rounded-[var(--r-lg)] p-4 pr-3 shadow-[var(--shadow-3)] ring-1 ring-line">
              <Luz size={44} />
              <div className="min-w-0 flex-1">
                <p className="heading text-lg">Instala La Joya</p>
                <p className="text-sm text-ink-soft">Ábrela desde tu pantalla de inicio, rápida y sin internet.</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <button onClick={dismiss} aria-label="Ahora no" className="pressable rounded-full p-1.5 text-ink-3 hover:bg-wash">
                  <X size={16} strokeWidth={1.6} />
                </button>
                <Button
                  size="sm"
                  variant="tinta"
                  icon={<Download size={16} strokeWidth={1.6} />}
                  onClick={async () => {
                    if (ios) setIosSheet(true)
                    else if (await promptInstall()) toast.success('¡Listo! La Joya quedó instalada')
                  }}
                >
                  Instalar
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Sheet open={iosSheet} onClose={() => setIosSheet(false)} title="Instalar en iPhone o iPad" subtitle="Tres toques en Safari">
        <ol className="flex flex-col gap-3">
          {[
            { icon: <Share size={20} strokeWidth={1.6} />, t: 'Toca Compartir', s: 'El cuadro con la flecha, abajo en Safari.' },
            { icon: <PlusSquare size={20} strokeWidth={1.6} />, t: 'Agregar a inicio', s: 'Desliza la lista y elige “Agregar a pantalla de inicio”.' },
            { icon: <Sparkle className="text-lg text-chispa-soft" />, t: 'Ábrela desde su ícono', s: 'Pantalla completa, avisos y funciona sin internet.' },
          ].map((step, i) => (
            <li key={step.t} className="flex items-center gap-4 rounded-[var(--r-md)] bg-sunken p-4">
              <span className="display-num w-6 text-2xl text-ink-3">{i + 1}</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[5px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]">{step.icon}</span>
              <span className="min-w-0">
                <span className="block font-medium">{step.t}</span>
                <span className="block text-sm text-ink-soft">{step.s}</span>
              </span>
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  )
}

function BadgeSync() {
  const me = useMe()
  const all = useCollection('notifications')
  const unread = useMemo(() => all.filter((n) => me && !n.read && n.roles.includes(me.role) && (!n.userId || n.userId === me.id)).length, [all, me])
  useAppBadge(unread)
  return null
}

export function PwaPrompts() {
  return (
    <>
      <UpdateBanner />
      <SaveErrorBanner />
      <OfflineReady />
      <InstallCard />
      <BadgeSync />
    </>
  )
}

/** Avatares del equipo conectado ahora (presencia en tiempo real) */
export function PresenceStack() {
  const users = usePresence((s) => s.users)
  const me = useMe()
  const employees = useCollection('employees')
  const others = users.filter((u) => u.userId !== me?.id)
  const [open, setOpen] = useState(false)
  if (!others.length) return null
  const sectionName = (page: string) => {
    const entry = Object.values(NAV).find((n) => (n.to === '/' ? page === '/' : page.startsWith(n.to)))
    return entry?.label ?? 'Inicio'
  }
  return (
    <>
      <button onClick={() => setOpen(true)} className="pressable mr-1 flex items-center rounded-full py-1 pr-2 pl-1 hover:bg-wash" aria-label={`${others.length} personas conectadas`}>
        <span className="flex -space-x-2">
          {others.slice(0, 3).map((u) => (
            <span key={u.userId} className="relative">
              <Avatar name={u.name} tone={employees.find((e) => e.id === u.userId)?.color ?? 'lavender'} size={30} />
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-paper" />
            </span>
          ))}
        </span>
        {others.length > 3 && <span className="ml-1.5 text-xs text-detail">+{others.length - 3}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Conectados ahora" subtitle="En tiempo real">
        <div className="flex flex-col gap-2">
          {others.map((u) => (
            <div key={u.userId} className="flex items-center gap-3 rounded-[var(--r-md)] p-2">
              <Avatar name={u.name} tone={employees.find((e) => e.id === u.userId)?.color ?? 'lavender'} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{u.name}</p>
                <p className="text-sm text-ink-soft">
                  {ROLE[u.role]?.label} · en {sectionName(u.page)} · {u.device}
                </p>
              </div>
              <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px_var(--luz)]" />
            </div>
          ))}
        </div>
      </Sheet>
    </>
  )
}

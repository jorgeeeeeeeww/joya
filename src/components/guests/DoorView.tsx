// Recepción en la puerta (día del evento): búsqueda gigante, un toque marca la llegada
// y muestra la mesa en grande para guiar al invitado. Mantiene la pantalla encendida.
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ScanLine, Search, UserPlus, Zap } from 'lucide-react'
import { ScannerSheet } from '@/components/Scanner'
import { parsePass } from './GuestPass'
import type { Guest, RanchEvent } from '@/lib/types'
import { fmt, nowIso, uid } from '@/lib/format'
import { ease, haptic } from '@/lib/motion'
import { useWakeLock } from '@/lib/pwa'
import { Button, Card, ProgressRing, cx, toast } from '@/components/ui'
import { Sparkle } from '@/components/step1'
import { guestStats, rsvpOf, tableLabel } from './guestUtils'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function DoorView({ ev, onChange, onAddWalkIn }: { ev: RanchEvent; onChange: (next: Guest[], summary?: string) => void; onAddWalkIn: (g: Guest) => void }) {
  useWakeLock(true)
  const [q, setQ] = useState('')
  const [flash, setFlash] = useState<Guest | null>(null)
  const [scanning, setScanning] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const guests = ev.guestList
  const stats = useMemo(() => guestStats(guests), [guests])
  const expected = stats.conf || stats.people - stats.decl
  const recent = useMemo(() => guests.filter((g) => g.arrived && g.arrivedAt).sort((a, b) => (b.arrivedAt ?? '').localeCompare(a.arrivedAt ?? '')).slice(0, 6), [guests])

  const list = useMemo(() => {
    const n = norm(q.trim())
    const live = guests.filter((g) => rsvpOf(g) !== 'declinado')
    const found = n ? live.filter((g) => norm(g.name).includes(n) || norm(g.group ?? '').includes(n) || (g.phone ?? '').includes(n)) : live.filter((g) => !g.arrived)
    return found.sort((a, b) => Number(!!a.arrived) - Number(!!b.arrived) || Number(rsvpOf(b) === 'confirmado') - Number(rsvpOf(a) === 'confirmado') || a.name.localeCompare(b.name)).slice(0, n ? 40 : 30)
  }, [guests, q])

  const toggle = (g: Guest) => {
    const arriving = !g.arrived
    onChange(
      guests.map((x) => (x.id === g.id ? { ...x, arrived: arriving, arrivedAt: arriving ? nowIso() : undefined, ...(arriving && rsvpOf(x) !== 'confirmado' ? { rsvp: 'confirmado' as const, confirmed: true } : {}) } : x)),
      arriving ? `Llegó ${g.name}` : `Desmarcó la llegada de ${g.name}`,
    )
    if (arriving) {
      haptic.success()
      setFlash(g)
      clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(null), 2200)
      setQ('')
    } else toast.info('Llegada desmarcada', g.name)
  }

  // Pase escaneado: registra la llegada o avisa si ya entró / no es de este evento
  const onScan = (text: string) => {
    const p = parsePass(text)
    if (!p) return toast.error('Ese código no es un pase de La Joya')
    if (p.eventId !== ev.id) return toast.error('Ese pase es de otro evento')
    const g = guests.find((x) => x.id === p.guestId)
    if (!g) return toast.error('No encontramos a ese invitado en la lista')
    if (g.arrived) return toast.info(`${g.name} ya había entrado`, g.arrivedAt ? `a las ${fmt(g.arrivedAt, 'HH:mm')}` : undefined)
    toggle(g)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <ScannerSheet open={scanning} onClose={() => setScanning(false)} onResult={onScan} continuous title="Escanear pases" hint="Apunta al código del pase: cada lectura registra la llegada" manualLabel="Escribir el código del pase" />
      <div className="flex min-w-0 flex-col gap-4">
        <Button size="lg" icon={<ScanLine size={20} strokeWidth={1.6} />} onClick={() => setScanning(true)} className="self-start">
          Escanear pases
        </Button>
        <div className="relative">
          <Search size={26} strokeWidth={1.6} className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Escribe el nombre del invitado"
            className="h-[72px] w-full rounded-full border border-line-strong bg-surface pr-6 pl-16 text-[1.4rem] shadow-[var(--shadow-1)] outline-none placeholder:text-ink-faint focus:border-primary focus:shadow-[0_0_0_5px_color-mix(in_oklab,var(--primary)_14%,transparent),0_0_28px_color-mix(in_oklab,var(--luz)_50%,transparent)]"
            aria-label="Buscar invitado"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <p className="px-2 text-sm text-ink-soft">{q ? `${list.length} coincidencias` : 'Por llegar · toca el nombre para registrar su llegada'}</p>
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {list.map((g) => (
              <motion.li key={g.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.28, ease: ease.calma }}>
                <button onClick={() => toggle(g)} className={cx('card pressable flex min-h-[84px] w-full items-center gap-4 px-5 py-3 text-left', g.arrived && 'opacity-60')}>
                  <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors', g.arrived ? 'bg-success text-paper' : 'ring-[1.5px] ring-line-strong ring-inset')}>{g.arrived ? <Check size={22} strokeWidth={2} /> : <span className="display-num text-lg text-ink-soft">{g.count}</span>}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xl">{g.name}</span>
                    <span className="block truncate text-sm text-ink-soft">
                      {g.arrived && g.arrivedAt ? `Llegó a las ${fmt(g.arrivedAt, 'HH:mm')}` : [`${g.count} ${g.count === 1 ? 'persona' : 'personas'}`, g.kids ? `${g.kids} niños` : null, g.side, rsvpOf(g) === 'pendiente' ? 'No había confirmado' : null, g.diet].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-xs text-detail">{g.table === undefined || g.table === null ? 'Sin mesa' : 'Mesa'}</span>
                    <span className="display-num block text-[2.4rem] leading-none">{g.table === undefined || g.table === null ? '—' : g.table === 0 ? '✦' : g.table}</span>
                  </span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {q && list.length === 0 && (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-lg">No está en la lista</p>
            <p className="text-sm text-ink-soft">Si es invitado de último momento, regístralo para que tenga lugar.</p>
            <Button
              variant="tinta"
              icon={<UserPlus size={18} strokeWidth={1.6} />}
              onClick={() => {
                const g: Guest = { id: uid('g_'), name: q.trim(), count: 1, rsvp: 'confirmado', confirmed: true, arrived: true, arrivedAt: nowIso(), notes: 'Llegó sin estar en la lista' }
                onAddWalkIn(g)
                setQ('')
                haptic.success()
                toast.success('Registrado', `${g.name} quedó en la lista; asígnale mesa en Acomodo.`)
              }}
            >
              Registrar a “{q.trim()}”
            </Button>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <Card className="flex flex-col items-center p-6 text-center">
          <div className="eyebrow">Llegadas</div>
          <div className="mt-4">
            <ProgressRing value={expected ? stats.arrived / expected : 0} size={148} stroke={7} gradient>
              <span className="flex flex-col items-center">
                <span className="display-num text-[2.6rem]">{stats.arrived}</span>
                <span className="text-xs text-detail">de {expected}</span>
              </span>
            </ProgressRing>
          </div>
          <p className="mt-4 text-sm text-ink-soft">personas han llegado</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-sunken px-3 py-1.5 text-xs text-detail">
            <Zap size={13} strokeWidth={1.6} /> La pantalla se mantiene encendida
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="heading text-xl">Recién llegados</h3>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Aún no llega nadie.</p>
          ) : (
            <ul className="mt-3 flex flex-col">
              {recent.map((g) => (
                <li key={g.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                  <Sparkle className="text-chispa-soft" />
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="tabular text-xs text-detail">{tableLabel(g.table)}</span>
                  <span className="tabular text-xs text-ink-3">{g.arrivedAt ? fmt(g.arrivedAt, 'HH:mm') : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {createPortal(
        <AnimatePresence>
          {flash && (
            <motion.div
              className="fixed inset-0 z-[85] flex items-center justify-center bg-[color-mix(in_oklab,var(--ink)_35%,transparent)] p-6 backdrop-blur-[6px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              onClick={() => setFlash(null)}
            >
              <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.48, ease: ease.calma } }} className="w-full max-w-md rounded-[var(--r-xl)] bg-surface p-10 text-center shadow-[var(--shadow-3)]">
                <Sparkle className="text-2xl text-chispa-soft" />
                <p className="mt-3 text-lg text-ink-soft">Bienvenidos</p>
                <p className="heading mt-1 text-[2rem]">{flash.name}</p>
                <div className="mt-6 eyebrow">{flash.table === undefined || flash.table === null ? 'Aún sin mesa' : 'Su mesa'}</div>
                <div className="display-num mt-2 text-[7rem] text-chispa">{flash.table === undefined || flash.table === null ? '—' : flash.table === 0 ? '✦' : flash.table}</div>
                {flash.table === 0 && <p className="heading text-xl">Mesa principal</p>}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

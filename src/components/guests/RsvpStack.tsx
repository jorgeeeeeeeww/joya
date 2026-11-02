// "Confirmar con tarjetas": los invitados pendientes en una pila. Deslizar a la derecha confirma,
// a la izquierda marca que no asiste y hacia arriba lo deja para después. Con botones grandes abajo.
import { useMemo, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { Check, Clock, MessageCircle, Users, X } from 'lucide-react'
import type { Guest, RanchEvent } from '@/lib/types'
import { haptic, ease } from '@/lib/motion'
import { withUndo } from '@/lib/undo'
import { Button, Empty, ProgressBar, cx } from '@/components/ui'
import { Sparkle } from '@/components/step1'
import { rsvpOf, tableLabel } from './guestUtils'

type Verdict = 'confirmado' | 'declinado' | 'despues'

function TopCard({ g, onVerdict }: { g: Guest; onVerdict: (v: Verdict) => void }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], [-6, 6])
  const yes = useTransform(x, [30, 120], [0, 1])
  const no = useTransform(x, [-120, -30], [1, 0])
  const later = useTransform(y, [-120, -30], [1, 0])
  const fly = (v: Verdict) => {
    haptic.success()
    const to = v === 'confirmado' ? { x: 520, y: 0 } : v === 'declinado' ? { x: -520, y: 0 } : { x: 0, y: -520 }
    void animate(x, to.x, { duration: 0.28, ease: ease.salida })
    void animate(y, to.y, { duration: 0.28, ease: ease.salida }).then(() => onVerdict(v))
  }
  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, y, rotate }}
      drag
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={(_, i) => {
        if (i.offset.x > 110 || i.velocity.x > 700) fly('confirmado')
        else if (i.offset.x < -110 || i.velocity.x < -700) fly('declinado')
        else if (i.offset.y < -100 || i.velocity.y < -700) fly('despues')
      }}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, transition: { duration: 0.3, ease: ease.calma } }}
    >
      <div className="card relative flex h-full flex-col overflow-hidden p-6 shadow-[var(--shadow-3)]">
        <motion.span style={{ opacity: yes }} className="absolute top-5 left-5 rounded-full bg-success px-3 py-1 text-sm font-semibold text-surface">
          Confirma
        </motion.span>
        <motion.span style={{ opacity: no }} className="absolute top-5 right-5 rounded-full bg-danger px-3 py-1 text-sm font-semibold text-surface">
          No asiste
        </motion.span>
        <motion.span style={{ opacity: later }} className="absolute inset-x-0 top-5 mx-auto w-fit rounded-full bg-ink px-3 py-1 text-sm font-semibold text-paper">
          Después
        </motion.span>
        <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[6px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]">
            <Users size={26} strokeWidth={1.5} />
          </span>
          <h3 className="heading mt-5 text-[1.9rem] leading-tight">{g.name}</h3>
          <p className="mt-2 text-sm text-ink-soft">
            {g.count === 1 ? '1 pase' : `${g.count} pases`}
            {g.kids ? ` · ${g.kids} ${g.kids === 1 ? 'niño' : 'niños'}` : ''}
            {g.side ? ` · ${g.side}` : ''}
          </p>
          {(g.group || g.table) && (
            <p className="mt-1 text-xs text-ink-3">
              {g.group}
              {g.group && g.table ? ' · ' : ''}
              {g.table ? tableLabel(g.table) : ''}
            </p>
          )}
          {g.remindedAt && <p className="mt-3 text-xs text-ink-3">Ya se le recordó por WhatsApp</p>}
        </div>
        <p className="text-center text-xs text-ink-3">Desliza → confirma · ← no asiste · ↑ después</p>
      </div>
      <span className="sr-only" aria-live="polite">
        {g.name}
      </span>
    </motion.div>
  )
}

export function RsvpStack({ ev, onChange, onWhatsApp }: { ev: RanchEvent; onChange: (next: Guest[], summary?: string) => void; onWhatsApp: (g: Guest) => void }) {
  const [skipped, setSkipped] = useState<string[]>([])
  const pending = useMemo(() => ev.guestList.filter((g) => rsvpOf(g) === 'pendiente' && !skipped.includes(g.id)), [ev.guestList, skipped])
  const totalPending = ev.guestList.filter((g) => rsvpOf(g) === 'pendiente').length
  const answered = ev.guestList.filter((g) => rsvpOf(g) !== 'pendiente').length
  const top = pending[0]

  const decide = (g: Guest, v: Verdict) => {
    if (v === 'despues') {
      setSkipped((s) => [...s, g.id])
      return
    }
    const prev = ev.guestList
    onChange(
      prev.map((x) => (x.id === g.id ? { ...x, rsvp: v, confirmed: v === 'confirmado' } : x)),
      `${v === 'confirmado' ? 'Confirmó' : 'Marcó que no asiste'} ${g.name}`,
    )
    withUndo(v === 'confirmado' ? `${g.name} confirmó` : `${g.name} no asiste`, () => onChange(prev, `Deshizo la respuesta de ${g.name}`))
  }

  if (!ev.guestList.length) return <Empty title="Aún no hay invitados" body="Agrega o importa la lista para empezar a confirmar." />

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5">
      <div className="w-full">
        <div className="mb-1.5 flex justify-between text-xs text-ink-soft">
          <span>{answered} respondieron</span>
          <span className="tabular">{totalPending} por confirmar</span>
        </div>
        <ProgressBar value={ev.guestList.length ? answered / ev.guestList.length : 0} />
      </div>
      <div className="relative h-[380px] w-full">
        {pending.slice(1, 3).map((g, i) => (
          <div key={g.id} aria-hidden className="card absolute inset-0" style={{ transform: `translateY(${(i + 1) * 10}px) scale(${1 - (i + 1) * 0.04})`, opacity: 1 - (i + 1) * 0.25, zIndex: -i - 1 }} />
        ))}
        <AnimatePresence mode="popLayout">
          {top ? (
            <TopCard key={top.id} g={top} onVerdict={(v) => decide(top, v)} />
          ) : (
            <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card flex h-full flex-col items-center justify-center p-6 text-center">
              <Sparkle className="text-2xl text-chispa-soft" />
              <p className="heading mt-4 text-2xl">{totalPending ? 'Dejaste algunos para después' : 'Todos respondieron'}</p>
              <p className="mt-1 text-sm text-ink-soft">{totalPending ? `${totalPending} siguen pendientes.` : 'La lista de confirmaciones está completa.'}</p>
              {skipped.length > 0 && (
                <Button className="mt-5" variant="outline" onClick={() => setSkipped([])}>
                  Volver a ver los pendientes
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {top && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => decide(top, 'declinado')} aria-label={`${top.name} no asiste`} className="pressable flex h-14 w-14 items-center justify-center rounded-full bg-surface text-danger shadow-[var(--shadow-2)] ring-1 ring-line">
            <X size={24} strokeWidth={1.8} />
          </button>
          <button onClick={() => decide(top, 'despues')} aria-label="Dejar para después" className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-soft shadow-[var(--shadow-1)] ring-1 ring-line">
            <Clock size={18} strokeWidth={1.7} />
          </button>
          {top.phone && (
            <button onClick={() => onWhatsApp(top)} aria-label={`Recordar por WhatsApp a ${top.name}`} className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-surface text-success shadow-[var(--shadow-1)] ring-1 ring-line">
              <MessageCircle size={18} strokeWidth={1.7} />
            </button>
          )}
          <button onClick={() => decide(top, 'confirmado')} aria-label={`${top.name} confirma`} className={cx('pressable flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-[var(--shadow-2)]')}>
            <Check size={24} strokeWidth={1.8} />
          </button>
        </div>
      )}
    </div>
  )
}

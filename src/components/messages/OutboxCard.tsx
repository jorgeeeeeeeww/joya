// Tarjeta de un mensaje por enviar: motivo, vista previa, envío por WhatsApp y marcas.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, Clock, MessageCircle, Send } from 'lucide-react'
import { useCollection } from '@/lib/store'
import { TONE } from '@/lib/meta'
import { ago, waLink } from '@/lib/format'
import { ease, haptic } from '@/lib/motion'
import { Badge, Button, Card, cx, toast } from '@/components/ui'
import { SwipeRow } from '@/components/interact'
import { TEMPLATE_META, markGuestsReminded, sendItem, snooze, type OutboxItem } from './outbox'

/** Mensaje por enviar. Deslizar a la derecha lo envía (o lo marca como enviado); a la izquierda lo deja para mañana. */
export function OutboxCard({ item, compact, hint }: { item: OutboxItem; compact?: boolean; hint?: boolean }) {
  const meta = TEMPLATE_META[item.kind]
  const Icon = meta.icon
  const [open, setOpen] = useState(false)
  const ev = useCollection('events').find((e) => e.id === item.eventId)
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }} transition={{ duration: 0.36, ease: ease.calma }}>
      <SwipeRow
        className="h-full"
        hintKey={hint ? 'mensajes' : undefined}
        left={
          !item.guests && item.to.phone
            ? { label: 'Enviar', icon: <Send />, tone: 'success', onTrigger: () => (sendItem(item), toast.success('Mensaje listo en WhatsApp', `Registrado como enviado a ${item.to.name}`)) }
            : { label: item.guests ? 'Ya les escribí' : 'Ya lo envié', icon: <Check />, tone: 'success', onTrigger: () => (item.markSent(), toast.success('Marcado como enviado')) }
        }
        right={{ label: 'Mañana', icon: <Clock />, tone: 'lavender', onTrigger: () => (snooze(item.key), toast.info('Lo verás mañana')) }}
      >
      <Card className={cx('h-full', compact ? 'p-4' : 'p-5')}>
        <div className="flex items-start gap-3">
          <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', TONE[meta.tone].soft, TONE[meta.tone].ink)}>
            <Icon size={20} strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.title}</span>
              {item.urgency <= 1 && <Badge tone="rose">Urgente</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-ink-soft">
              {item.reason}
              {ev && !compact && (
                <>
                  {' · '}
                  <Link to={`/eventos/${ev.id}`} className="underline-offset-4 hover:text-ink hover:underline">
                    {ev.title}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        {!item.guests && !compact && (
          <div className="mt-4 rounded-[16px] rounded-tl-[6px] bg-[color-mix(in_oklab,var(--success)_10%,var(--surface))] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line ring-1 ring-[color-mix(in_oklab,var(--success)_18%,transparent)] ring-inset">
            <span className={cx(!open && 'line-clamp-3')}>{item.message}</span>
            {item.message.length > 160 && (
              <button onClick={() => setOpen((v) => !v)} className="mt-1 block text-xs text-ink-soft hover:text-ink">
                {open ? 'Ver menos' : 'Ver mensaje completo'}
              </button>
            )}
          </div>
        )}

        {item.guests && (
          <div className="mt-3">
            <button onClick={() => setOpen((v) => !v)} className="pressable inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink" aria-expanded={open}>
              <ChevronDown size={16} strokeWidth={1.6} className={cx('transition-transform duration-[var(--dur-3)]', open && 'rotate-180')} />
              {open ? 'Ocultar invitados' : `Ver ${item.guests.length} invitados`}
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {item.guests.map(({ guest, message }) => (
                    <li key={guest.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{guest.name}</span>
                        <span className="block text-xs text-detail">{guest.remindedAt ? `Último recordatorio ${ago(guest.remindedAt)}` : guest.invitedAt ? `Invitado ${ago(guest.invitedAt)}` : 'Sin invitación registrada'}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!guest.phone}
                        icon={<MessageCircle size={15} strokeWidth={1.6} />}
                        onClick={() => {
                          window.open(waLink(guest.phone, message), '_blank', 'noopener')
                          if (ev) markGuestsReminded(ev, [guest.id])
                          haptic.light()
                        }}
                      >
                        {guest.phone ? 'Recordar' : 'Sin teléfono'}
                      </Button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!item.guests && (
            <Button
              size={compact ? 'sm' : 'md'}
              variant="tinta"
              disabled={!item.to.phone}
              icon={<Send size={16} strokeWidth={1.6} />}
              onClick={() => {
                sendItem(item)
                toast.success('Mensaje listo en WhatsApp', `Registrado como enviado a ${item.to.name}`)
              }}
            >
              {item.to.phone ? 'Enviar por WhatsApp' : 'Sin teléfono'}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Check size={15} strokeWidth={1.6} />}
            onClick={() => {
              item.markSent()
              toast.success(item.guests ? 'Recordatorios registrados' : 'Marcado como enviado')
            }}
          >
            {item.guests ? 'Ya les escribí' : 'Ya lo envié'}
          </Button>
          {!compact && (
            <Button size="sm" variant="ghost" icon={<Clock size={15} strokeWidth={1.6} />} onClick={() => (snooze(item.key), toast.info('Lo verás mañana'))}>
              Mañana
            </Button>
          )}
        </div>
      </Card>
      </SwipeRow>
    </motion.div>
  )
}

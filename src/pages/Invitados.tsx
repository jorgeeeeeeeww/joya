// Invitados: se trabajan dentro de cada evento (pestaña «Invitados y mesas»).
// Esta página del menú solo sirve para elegir a qué evento entrar.
import { useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { Armchair, ArrowRight, ClipboardPaste, DoorOpen, Download, Heart, List, Printer, QrCode, UserPlus } from 'lucide-react'
import { RsvpStack } from '@/components/guests/RsvpStack'
import { PassesSheet } from '@/components/guests/GuestPass'
import type { Guest, RanchEvent } from '@/lib/types'
import { db, useCollection, useStore } from '@/lib/store'
import { VENUE } from '@/lib/meta'
import { daysUntil, fmt, waLink } from '@/lib/format'
import { countdownLabel } from '@/lib/planner'
import { ease, fadeRise, stagger } from '@/lib/motion'
import { layoutStats } from '@/lib/floorplan'
import { Button, Card, Empty, PageHeader, ProgressBar, Segmented, cx, toast } from '@/components/ui'
import { CountUp } from '@/components/step1'
import { EventOrb } from '@/components/events/EventOrb'
import { printHtml } from '@/components/floorplan/FloorPlanEditor'
import { eventVars, fill, firstName, markGuestsReminded, useTemplates } from '@/components/messages/outbox'
import { GuestSheet, ImportSheet } from '@/components/guests/GuestSheets'
import { GuestListView } from '@/components/guests/GuestListView'
import { SeatingView } from '@/components/guests/SeatingView'
import { DoorView } from '@/components/guests/DoorView'
import { downloadText, guestStats, guestsToCsv, seatingListHtml, tableCardsHtml, tableLabel } from '@/components/guests/guestUtils'

export type GuestView = 'confirmar' | 'lista' | 'mesas' | 'puerta'

/** Página del menú: elegir el evento. Los enlaces viejos (?e=…) llevan directo al evento. */
export default function Invitados() {
  const events = useCollection('events')
  const [params] = useSearchParams()
  const candidates = useMemo(() => {
    const live = events.filter((e) => e.status !== 'cancelado')
    const future = live.filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))
    const past = live.filter((e) => daysUntil(e.date) < 0 && e.guestList.length).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
    return { future, past }
  }, [events])

  const asked = params.get('e')
  if (asked && events.some((e) => e.id === asked)) {
    const v = params.get('v')
    return <Navigate to={`/eventos/${asked}?tab=invitados${v ? `&v=${v}` : ''}`} replace />
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6 [&>div:first-child>div]:!mb-0">
      <motion.div variants={fadeRise}>
        <PageHeader eyebrow="Lista, mesas y recepción" title="Invitados" subtitle="Elige el evento para ver su lista, sus mesas y la recepción en la puerta." />
      </motion.div>
      {candidates.future.length === 0 && candidates.past.length === 0 ? (
        <Card>
          <Empty kind="evento" title="Aún no hay eventos" body="Cuando apartes una fecha podrás llevar aquí su lista de invitados, mesas y recepción." />
        </Card>
      ) : (
        <>
          {candidates.future.length > 0 && <EventPicker title="Próximos" list={candidates.future} />}
          {candidates.past.length > 0 && <EventPicker title="Ya realizados" list={candidates.past} />}
        </>
      )}
    </motion.div>
  )
}

function EventPicker({ title, list }: { title: string; list: RanchEvent[] }) {
  const [showRest, setShowRest] = useState(false)
  const withList = list.filter((e) => e.guestList.length > 0)
  const without = list.filter((e) => e.guestList.length === 0)
  // Si ninguno tiene lista todavía, no hay nada que esconder
  const shown = withList.length === 0 || showRest ? [...withList, ...without] : withList
  return (
    <motion.section variants={fadeRise}>
      <h2 className="mb-3 text-[17px] leading-tight font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((e) => {
          const s = guestStats(e.guestList)
          const d = daysUntil(e.date)
          return (
            <Link key={e.id} to={`/eventos/${e.id}?tab=invitados`} className="card lift pressable flex items-center gap-3 p-4">
              <EventOrb type={e.type} />
              <span className="min-w-0 flex-1">
                <span className="block leading-snug font-semibold">{e.title}</span>
                <span className="mt-0.5 block text-[13px] text-detail">
                  {fmt(e.date, "EEE d 'de' MMM")} · {d >= 0 ? countdownLabel(d) : 'Realizado'}
                </span>
                {e.guestList.length > 0 ? (
                  <span className="mt-2 block">
                    <ProgressBar value={s.people ? s.conf / s.people : 0} />
                    <span className="mt-1 block text-[13px] text-ink-soft tabular">
                      {s.conf} de {s.people} confirmadas
                    </span>
                  </span>
                ) : (
                  <span className="mt-0.5 block text-[13px] text-ink-soft">Sin lista todavía</span>
                )}
              </span>
              <ArrowRight size={18} strokeWidth={1.6} className="shrink-0 text-ink-3" />
            </Link>
          )
        })}
      </div>
      {withList.length > 0 && without.length > 0 && (
        <button onClick={() => setShowRest((v) => !v)} className="pressable mt-3 inline-flex h-11 items-center rounded-full px-4 text-sm text-ink-soft ring-1 ring-line ring-inset hover:bg-wash">
          {showRest ? 'Ocultar los que no tienen lista' : `Sin lista · ${without.length}`}
        </button>
      )}
    </motion.section>
  )
}

/** Estación de invitados de un evento: confirmar, lista, acomodo en mesas y recepción en la puerta */
export function GuestStation({ ev, view: asked, onView }: { ev: RanchEvent; view?: GuestView; onView: (v: GuestView) => void }) {
  const ranchName = useStore((s) => s.settings.ranchName)
  const tpl = useTemplates()
  const [editing, setEditing] = useState<Guest | null>(null)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [passes, setPasses] = useState(false)
  const days = daysUntil(ev.date)
  const view: GuestView = asked ?? (days === 0 ? 'puerta' : 'lista')

  const stats = useMemo(() => guestStats(ev.guestList), [ev.guestList])
  const sides = useMemo(() => [...new Set(ev.guestList.map((g) => g.side).filter(Boolean) as string[])], [ev.guestList])
  const save = (next: Guest[], summary?: string) => db.patch('events', ev.id, { guestList: next }, summary ? { summary: `${summary} · ${ev.title}` } : undefined)
  const seats = layoutStats(ev.layout).seats
  const short = stats.conf + stats.pend > seats

  const whatsApp = (g: Guest, kind: 'invitacion' | 'recordatorio-rsvp') => {
    const v = eventVars(ev, ranchName)
    const msg = fill(tpl[kind], { ...v, invitado: firstName(g.name), personas: g.count === 1 ? '1 pase' : `${g.count} pases`, limite: fmt(ev.date, "d 'de' MMMM"), mesa: tableLabel(g.table) })
    window.open(waLink(g.phone, msg), '_blank', 'noopener')
    markGuestsReminded(ev, [g.id], kind === 'invitacion' ? 'invitedAt' : 'remindedAt')
    toast.success(kind === 'invitacion' ? 'Invitación lista en WhatsApp' : 'Recordatorio listo en WhatsApp', g.name)
  }

  // Solo lo que se decide con un vistazo; el resto vive en la lista
  const kpis: { label: string; value: number; hint?: string; key?: boolean }[] = [
    { label: 'Personas confirmadas', value: stats.conf, hint: `de ${stats.people} invitadas · ${stats.pend} por confirmar` },
    { label: short ? 'Faltan lugares' : 'Lugares libres', value: Math.abs(seats - stats.conf - stats.pend), hint: `${seats} en el plano, contando a los pendientes`, key: short && seats > 0 },
    { label: 'Sin mesa', value: stats.unseated, hint: 'confirmados', key: stats.unseated > 0 },
    { label: 'Dietas especiales', value: stats.diets, hint: 'avisar al banquete' },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Acciones de la lista */}
      <div className="flex flex-wrap gap-2">
        <Button variant="tinta" icon={<UserPlus size={17} strokeWidth={1.6} />} onClick={() => setAdding(true)}>
          Agregar invitado
        </Button>
        <Button variant="outline" icon={<ClipboardPaste size={16} strokeWidth={1.6} />} onClick={() => setImporting(true)}>
          Importar lista
        </Button>
        <Button variant="outline" icon={<QrCode size={16} strokeWidth={1.6} />} onClick={() => setPasses(true)}>
          Pases con QR
        </Button>
        <Button variant="ghost" icon={<Download size={16} strokeWidth={1.6} />} onClick={() => (downloadText(`invitados-${ev.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`, guestsToCsv(ev)), toast.success('Lista descargada', 'Ábrela en Excel o Numbers'))}>
          Descargar
        </Button>
        <Button variant="ghost" icon={<Printer size={16} strokeWidth={1.6} />} onClick={() => printHtml(`Lista por mesa · ${ev.title}`, seatingListHtml(ev))}>
          Imprimir por mesa
        </Button>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-xs text-detail">{k.label}</div>
            <div className={cx('display-num mt-2 text-[1.85rem]', k.key && 'text-key')}>
              <CountUp value={k.value} />
            </div>
            {k.hint && <div className="mt-1 text-xs leading-snug text-ink-3">{k.hint}</div>}
          </div>
        ))}
      </div>
      {short && seats > 0 && <p className="-mt-2 text-sm text-key">Si todos los pendientes confirman no alcanzan los lugares: agrega mesas en «Plano del lugar».</p>}

      {/* Vistas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<GuestView>
          className="max-sm:flex max-sm:w-full"
          value={view}
          onChange={onView}
          options={[
            { value: 'lista', label: <><List size={16} strokeWidth={1.6} className="max-sm:hidden" /> Lista</> },
            { value: 'confirmar', label: <><Heart size={16} strokeWidth={1.6} className="max-sm:hidden" /> Confirmar</> },
            { value: 'mesas', label: <><Armchair size={16} strokeWidth={1.6} className="max-sm:hidden" /> Mesas</> },
            { value: 'puerta', label: <><DoorOpen size={16} strokeWidth={1.6} className="max-sm:hidden" /> Recepción</> },
          ]}
        />
        {view === 'mesas' && (
          <Button variant="ghost" size="sm" icon={<Printer size={15} strokeWidth={1.6} />} onClick={() => printHtml(`Tarjetas de mesa · ${ev.title}`, tableCardsHtml(ev))}>
            Imprimir tarjetas de mesa
          </Button>
        )}
      </div>
      <p className="-mt-2 text-[13px] leading-snug text-detail">
        {view === 'lista'
          ? 'Todos los invitados con sus pases, mesa y dieta. Toca uno para editarlo.'
          : view === 'confirmar'
            ? 'Desliza cada tarjeta: a la derecha confirma, a la izquierda no asiste.'
            : view === 'mesas'
              ? 'Arrastra a cada invitado a su mesa. Las mesas se dibujan en «Plano del lugar».'
              : 'El día del evento: busca o escanea el pase y marca quién llegó.'}
      </p>

      <motion.div key={view + ev.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.calma } }}>
        {view === 'confirmar' && <RsvpStack ev={ev} onChange={save} onWhatsApp={(g) => whatsApp(g, 'recordatorio-rsvp')} />}
        {view === 'lista' && <GuestListView ev={ev} onChange={save} onEdit={setEditing} onWhatsApp={whatsApp} />}
        {view === 'mesas' && <SeatingView ev={ev} onChange={save} />}
        {view === 'puerta' && <DoorView ev={ev} onChange={save} onAddWalkIn={(g) => save([...ev.guestList, g], `Registró en la puerta a ${g.name}`)} />}
      </motion.div>

      <p className="text-xs text-ink-3">
        {VENUE[ev.venue].label} · contratado para {ev.guests} personas
      </p>

      <GuestSheet
        ev={ev}
        open={adding || !!editing}
        guest={editing ?? undefined}
        sides={sides}
        onClose={() => (setAdding(false), setEditing(null))}
        onSave={(g) => {
          const exists = ev.guestList.some((x) => x.id === g.id)
          save(exists ? ev.guestList.map((x) => (x.id === g.id ? g : x)) : [...ev.guestList, g], exists ? `Editó a ${g.name}` : `Agregó a ${g.name}`)
          toast.success(exists ? 'Invitado actualizado' : 'Invitado agregado', g.name)
        }}
        onDelete={(id) => {
          const g = ev.guestList.find((x) => x.id === id)
          save(ev.guestList.filter((x) => x.id !== id), `Eliminó a ${g?.name ?? 'un invitado'}`)
        }}
      />
      <PassesSheet ev={ev} open={passes} onClose={() => setPasses(false)} ranchName={ranchName} />
      <ImportSheet
        ev={ev}
        open={importing}
        sides={sides}
        onClose={() => setImporting(false)}
        onImport={(list) => {
          save([...ev.guestList, ...list], `Importó ${list.length} invitados`)
          toast.success(`${list.length} invitados importados`, `${list.reduce((n, g) => n + g.count, 0)} personas agregadas a la lista`)
        }}
      />
    </div>
  )
}

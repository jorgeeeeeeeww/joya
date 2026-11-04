// Estación de invitados de la Wedding planner: lista, acomodo en mesas y recepción en la puerta.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { Armchair, ClipboardPaste, DoorOpen, Download, Heart, List, Printer, QrCode, UserPlus } from 'lucide-react'
import { RsvpStack } from '@/components/guests/RsvpStack'
import { PassesSheet } from '@/components/guests/GuestPass'
import type { Guest } from '@/lib/types'
import { db, useCollection, useStore } from '@/lib/store'
import { VENUE } from '@/lib/meta'
import { daysUntil, fmt, waLink } from '@/lib/format'
import { countdownLabel } from '@/lib/planner'
import { ease, fadeRise, stagger } from '@/lib/motion'
import { layoutStats } from '@/lib/floorplan'
import { Button, Card, Empty, PageHeader, Segmented, cx, toast } from '@/components/ui'
import { Donut } from '@/components/charts'
import { CountUp } from '@/components/step1'
import { EventOrb } from '@/components/events/EventOrb'
import { printHtml } from '@/components/floorplan/FloorPlanEditor'
import { eventVars, fill, firstName, markGuestsReminded, useTemplates } from '@/components/messages/outbox'
import { GuestSheet, ImportSheet } from '@/components/guests/GuestSheets'
import { GuestListView } from '@/components/guests/GuestListView'
import { SeatingView } from '@/components/guests/SeatingView'
import { DoorView } from '@/components/guests/DoorView'
import { downloadText, guestStats, guestsToCsv, seatingListHtml, tableCardsHtml, tableLabel } from '@/components/guests/guestUtils'

type View = 'confirmar' | 'lista' | 'mesas' | 'puerta'

export default function Invitados() {
  const events = useCollection('events')
  const ranchName = useStore((s) => s.settings.ranchName)
  const tpl = useTemplates()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<Guest | null>(null)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [passes, setPasses] = useState(false)

  const candidates = useMemo(() => {
    const live = events.filter((e) => e.status !== 'cancelado')
    const future = live.filter((e) => daysUntil(e.date) >= 0).sort((a, b) => Number(b.guestList.length > 0) - Number(a.guestList.length > 0) || a.date.localeCompare(b.date))
    const past = live.filter((e) => daysUntil(e.date) < 0 && e.guestList.length).sort((a, b) => b.date.localeCompare(a.date))
    return [...future, ...past]
  }, [events])

  const ev = candidates.find((e) => e.id === params.get('e')) ?? candidates.find((e) => e.guestList.length && daysUntil(e.date) >= 0) ?? candidates[0]
  const view = (params.get('v') as View) || (ev && daysUntil(ev.date) === 0 ? 'puerta' : 'lista')
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if (ev && !params.get('e')) setParam('e', ev.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id])

  const stats = useMemo(() => guestStats(ev?.guestList ?? []), [ev?.guestList])
  const sides = useMemo(() => [...new Set((ev?.guestList ?? []).map((g) => g.side).filter(Boolean) as string[])], [ev?.guestList])

  if (!ev)
    return (
      <div>
        <PageHeader eyebrow="Estación de invitados" title="Invitados" />
        <Card>
          <Empty kind="evento" title="Aún no hay eventos" body="Cuando apartes una fecha podrás llevar aquí su lista de invitados, mesas y recepción." />
        </Card>
      </div>
    )

  const save = (next: Guest[], summary?: string) => db.patch('events', ev.id, { guestList: next }, summary ? { summary: `${summary} · ${ev.title}` } : undefined)
  const seats = layoutStats(ev.layout).seats
  const days = daysUntil(ev.date)

  const whatsApp = (g: Guest, kind: 'invitacion' | 'recordatorio-rsvp') => {
    const v = eventVars(ev, ranchName)
    const msg = fill(tpl[kind], { ...v, invitado: firstName(g.name), personas: g.count === 1 ? '1 pase' : `${g.count} pases`, limite: fmt(ev.date, "d 'de' MMMM"), mesa: tableLabel(g.table) })
    window.open(waLink(g.phone, msg), '_blank', 'noopener')
    markGuestsReminded(ev, [g.id], kind === 'invitacion' ? 'invitedAt' : 'remindedAt')
    toast.success(kind === 'invitacion' ? 'Invitación lista en WhatsApp' : 'Recordatorio listo en WhatsApp', g.name)
  }

  // Solo lo que se decide con un vistazo; el resto vive en la lista
  const kpis: { label: string; value: number; hint?: string; tone?: string }[] = [
    { label: 'Invitaciones', value: stats.invites, hint: `${stats.people} personas · ${stats.kids} niños` },
    { label: 'Dietas especiales', value: stats.diets, hint: 'avisar al banquete' },
    { label: 'Sin mesa', value: stats.unseated, hint: 'confirmados', tone: stats.unseated ? 'text-chispa' : undefined },
    { label: 'Llegaron', value: stats.arrived, hint: days === 0 ? 'hoy en la puerta' : 'el día del evento' },
  ]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <motion.div variants={fadeRise}>
        <PageHeader
          eyebrow="Estación de invitados"
          title="Invitados"
          subtitle="Confirma deslizando, acomoda en mesas y recibe en la puerta con pases QR."
          primary={{ label: 'Agregar invitado', icon: <UserPlus size={17} strokeWidth={1.6} />, onClick: () => setAdding(true) }}
          menu={[
            { label: 'Pases con QR', icon: <QrCode />, hint: 'Compartir por WhatsApp', onClick: () => setPasses(true) },
            { label: 'Importar lista', icon: <ClipboardPaste />, hint: 'Pegar desde Excel o WhatsApp', onClick: () => setImporting(true) },
            { label: 'Descargar para Excel', icon: <Download />, onClick: () => (downloadText(`invitados-${ev.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`, guestsToCsv(ev)), toast.success('Lista descargada', 'Ábrela en Excel o Numbers')) },
            { label: 'Imprimir lista por mesa', icon: <Printer />, onClick: () => printHtml(`Lista por mesa · ${ev.title}`, seatingListHtml(ev)) },
          ]}
        />
      </motion.div>

      {/* Selector de evento */}
      <motion.div variants={fadeRise} className="flex flex-wrap gap-2">
        {candidates.slice(0, 8).map((e) => {
          const active = e.id === ev.id
          const d = daysUntil(e.date)
          return (
            <button
              key={e.id}
              onClick={() => setParam('e', e.id)}
              className={cx('pressable flex min-h-14 min-w-0 items-center gap-3 rounded-[16px] py-2 pr-4 pl-2 text-left transition-colors max-sm:w-full', active ? 'bg-ink text-paper shadow-[var(--shadow-2)]' : 'bg-surface ring-1 ring-line hover:bg-wash')}
              aria-pressed={active}
            >
              <EventOrb type={e.type} size="sm" orb={active} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{e.title}</span>
                <span className={cx('block text-xs', active ? 'text-paper/70' : 'text-ink-soft')}>
                  {fmt(e.date, "d MMM")} · {d >= 0 ? countdownLabel(d) : 'Realizado'} · {e.guestList.length} inv.
                </span>
              </span>
            </button>
          )
        })}
      </motion.div>

      {/* Resumen del evento */}
      <motion.div variants={fadeRise} className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card className="relative overflow-hidden p-5 sm:p-6 md:p-7">
          <div className="flex items-start gap-4">
            <EventOrb type={ev.type} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">
                {VENUE[ev.venue].label} · {fmt(ev.date, "EEEE d 'de' MMMM")}
              </p>
              <h2 className="heading mt-1 text-[clamp(1.6rem,1.3rem+1.2vw,2.3rem)]">{ev.title}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {days >= 0 ? countdownLabel(days) : 'Evento realizado'} · contratado para {ev.guests} personas
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-[var(--r-md)] bg-sunken p-3 sm:p-4">
              <div className="text-xs text-detail">Lugares en el plano</div>
              <div className="display-num mt-1.5 text-[1.9rem]">{seats}</div>
            </div>
            <div className="rounded-[var(--r-md)] bg-sunken p-3 sm:p-4">
              <div className="text-xs text-detail">Personas confirmadas</div>
              <div className="display-num mt-1.5 text-[1.9rem]">{stats.conf}</div>
            </div>
            <div className="rounded-[var(--r-md)] bg-sunken p-3 sm:p-4">
              <div className="text-xs text-detail">{stats.conf + stats.pend > seats ? 'Faltan lugares' : 'Sobran lugares'}</div>
              <div className={cx('display-num mt-1.5 text-[1.9rem]', stats.conf + stats.pend > seats && 'text-danger')}>{Math.abs(seats - stats.conf - stats.pend)}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-ink-3">contando a {stats.pend} por confirmar</div>
            </div>
          </div>
          {stats.conf + stats.pend > seats && seats > 0 && <p className="mt-3 text-sm text-danger">Si todos los pendientes confirman no alcanzan los lugares: agrega mesas en el plano del evento.</p>}
        </Card>
        <Card className="flex items-center gap-6 p-6 md:p-7">
          <Donut
            size={150}
            thickness={16}
            segments={[
              { label: 'Confirmados', value: stats.conf, tone: 'sage' },
              { label: 'Pendientes', value: stats.pend, tone: 'butter' },
              { label: 'No asisten', value: stats.decl, tone: 'rose' },
            ]}
            center={
              <>
                <span className="display-num text-[2rem]">{stats.people ? Math.round((stats.conf / stats.people) * 100) : 0}%</span>
                <span className="text-xs text-detail">confirmado</span>
              </>
            }
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {[
              ['Confirmados', stats.conf, 'bg-sage'],
              ['Pendientes', stats.pend, 'bg-butter'],
              ['No asisten', stats.decl, 'bg-rose'],
            ].map(([l, v, c]) => (
              <div key={l as string} className="flex items-center gap-2 text-sm">
                <span className={cx('h-2.5 w-2.5 rounded-full', c as string)} />
                <span className="text-ink-soft">{l}</span>
                <span className="tabular ml-auto">{v as number}</span>
              </div>
            ))}
            <p className="text-xs text-ink-3">en personas (pases)</p>
          </div>
        </Card>
      </motion.div>

      {/* Indicadores */}
      <motion.div variants={fadeRise} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-xs text-detail">{k.label}</div>
            <div className={cx('display-num mt-2 text-[1.85rem]', k.tone)}>
              <CountUp value={k.value} />
            </div>
            {k.hint && <div className="mt-1 text-xs leading-snug text-ink-3">{k.hint}</div>}
          </div>
        ))}
      </motion.div>

      {/* Vistas */}
      <motion.div variants={fadeRise} className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<View>
          className="max-sm:flex max-sm:w-full"
          value={view}
          onChange={(v) => setParam('v', v)}
          options={[
            { value: 'confirmar', label: <><Heart size={16} strokeWidth={1.6} className="max-sm:hidden" /> Confirmar</> },
            { value: 'lista', label: <><List size={16} strokeWidth={1.6} className="max-sm:hidden" /> Lista</> },
            { value: 'mesas', label: <><Armchair size={16} strokeWidth={1.6} className="max-sm:hidden" /> Mesas</> },
            { value: 'puerta', label: <><DoorOpen size={16} strokeWidth={1.6} className="max-sm:hidden" /> Recepción</> },
          ]}
        />
        {view === 'mesas' && (
          <Button variant="ghost" size="sm" icon={<Printer size={15} strokeWidth={1.6} />} onClick={() => printHtml(`Tarjetas de mesa · ${ev.title}`, tableCardsHtml(ev))}>
            Imprimir tarjetas de mesa
          </Button>
        )}
      </motion.div>

      <motion.div key={view + ev.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.calma } }}>
        {view === 'confirmar' && <RsvpStack ev={ev} onChange={save} onWhatsApp={(g) => whatsApp(g, 'recordatorio-rsvp')} />}
        {view === 'lista' && <GuestListView ev={ev} onChange={save} onEdit={setEditing} onWhatsApp={whatsApp} />}
        {view === 'mesas' && <SeatingView ev={ev} onChange={save} />}
        {view === 'puerta' && <DoorView ev={ev} onChange={save} onAddWalkIn={(g) => save([...ev.guestList, g], `Registró en la puerta a ${g.name}`)} />}
      </motion.div>

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
    </motion.div>
  )
}

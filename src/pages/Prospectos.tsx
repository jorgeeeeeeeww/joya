// CRM de prospectos del wedding planner (vive dentro de Eventos → "Prospectos"):
// bandeja por seguimiento con tarjetas que se deslizan, tablero arrastrable por etapa con
// probabilidad de cierre y valor ponderado, y origen de los prospectos.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarClock, Check, Clock, Columns3, Inbox, List, MessageCircle, Moon, Phone, Plus, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import type { EventStatus, LeadSource, RanchEvent } from '@/lib/types'
import { db, useCollection, useMe } from '@/lib/store'
import { EVENT_STATUS, LEAD_SOURCE, TONE, VENUE, seesMoney } from '@/lib/meta'
import { addDaysISO, compactMxn, daysUntil, fmtDate, fmtDateFull, mxn, pct, today, waLink } from '@/lib/format'
import { followBucket, FOLLOW_META, useEventMoney, type FollowBucket } from '@/lib/planner'
import { ease } from '@/lib/motion'
import { withUndo } from '@/lib/undo'
import { Badge, Button, Card, CardHeader, Empty, PageHeader, Segmented, Sheet, Stat, cx, StatStrip } from '@/components/ui'
import { DateField, NotesField, SearchField, Slider } from '@/components/fields'
import { DragBoard, SwipeRow } from '@/components/interact'
import { CountUp } from '@/components/step1'
import { Donut, Legend } from '@/components/charts'
import { EventOrb } from '@/components/events/EventOrb'
import { NewEventSheet } from '@/components/events/NewEventSheet'

type View = 'bandeja' | 'tablero'
const BUCKETS: FollowBucket[] = ['vencido', 'hoy', 'proximo', 'sin-fecha']
const BOARD: EventStatus[] = ['prospecto', 'cotizado', 'apartado', 'confirmado']
const OPEN_STAGES: EventStatus[] = ['prospecto', 'cotizado', 'apartado']
/** Probabilidad por etapa si no se ha fijado una */
const defaultProb = (l: RanchEvent) => l.probability ?? (l.status === 'prospecto' ? 25 : l.status === 'cotizado' ? 50 : l.status === 'apartado' ? 85 : 100)

export default function Prospectos({ embedded }: { embedded?: boolean }) {
  const me = useMe()
  const showMoney = seesMoney(me?.role)
  const events = useCollection('events')
  const money = useEventMoney()
  const [view, setView] = useState<View>('bandeja')
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [follow, setFollow] = useState<RanchEvent | null>(null)
  const T = today()

  const leads = useMemo(() => events.filter((e) => OPEN_STAGES.includes(e.status)), [events])
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const matches = (l: RanchEvent) => !q || norm(`${l.title} ${l.clientName} ${l.phone ?? ''}`).includes(norm(q))
  const open = leads.filter((l) => l.status !== 'apartado' && matches(l))
  const recentConfirmed = useMemo(() => events.filter((e) => e.status === 'confirmado' && e.date >= T && e.updatedAt.slice(0, 10) >= addDaysISO(T, -30)), [events, T])

  const stats = useMemo(() => {
    const since = addDaysISO(T, -180)
    const recent = events.filter((e) => e.createdAt.slice(0, 10) >= since || e.date >= since)
    const won = recent.filter((e) => ['apartado', 'confirmado', 'realizado'].includes(e.status)).length
    const lost = recent.filter((e) => e.status === 'cancelado').length
    const sources = (Object.keys(LEAD_SOURCE) as LeadSource[])
      .map((s) => ({ label: LEAD_SOURCE[s].label, tone: LEAD_SOURCE[s].tone, value: events.filter((e) => e.leadSource === s).length, won: events.filter((e) => e.leadSource === s && ['apartado', 'confirmado', 'realizado'].includes(e.status)).length }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value)
    const openLeads = leads.filter((l) => l.status !== 'apartado')
    return {
      overdue: openLeads.filter((l) => followBucket(l, T) === 'vencido').length,
      weighted: openLeads.reduce((n, l) => n + (money.total(l) * defaultProb(l)) / 100, 0),
      conversion: recent.length ? won / Math.max(1, won + lost + leads.length) : 0,
      sources,
    }
  }, [events, leads, money, T])

  const setFollowUp = (l: RanchEvent, days: number, msg: string) => {
    const prev = l.followUpAt
    db.patch('events', l.id, { followUpAt: addDaysISO(T, days) })
    withUndo(msg, () => db.patch('events', l.id, { followUpAt: prev }), `${l.clientName} · ${fmtDate(addDaysISO(T, days))}`)
  }
  const moveStage = (l: RanchEvent, status: EventStatus) => {
    const prev = { status: l.status, probability: l.probability }
    db.patch('events', l.id, { status, probability: status === 'apartado' ? Math.max(defaultProb(l), 85) : status === 'confirmado' ? 100 : l.probability })
    withUndo(`${l.title} · ${EVENT_STATUS[status].label}`, () => db.patch('events', l.id, prev))
  }

  return (
    <div>
      {!embedded && <PageHeader eyebrow="CRM" title="Prospectos" subtitle="Cada pareja o familia que pregunta por una fecha. Da seguimiento a tiempo y conviértela en evento." primary={{ label: 'Nuevo prospecto', icon: <Plus size={18} strokeWidth={1.6} />, onClick: () => setNewOpen(true) }} />}

      <StatStrip className="mb-6">
        <Stat label="Prospectos abiertos" value={<CountUp value={leads.filter((l) => l.status !== 'apartado').length} />} sub={`${leads.filter((l) => l.status === 'cotizado').length} con cotización`} tone="rose" icon={<Inbox size={16} strokeWidth={1.6} />} />
        <Stat label="Seguimientos vencidos" value={<CountUp value={stats.overdue} />} sub={stats.overdue ? 'Contesta hoy' : 'Todo al día'} tone="peach" icon={<Clock size={16} strokeWidth={1.6} />} accent={stats.overdue > 0} />
        <Stat label="Conversión" value={pct(stats.conversion)} sub="Últimos 6 meses" tone="sage" icon={<TrendingUp size={16} strokeWidth={1.6} />} />
        {showMoney && <Stat label="Valor ponderado" value={<CountUp value={stats.weighted} format={compactMxn} />} sub="Cotizado × probabilidad de cierre" tone="butter" icon={<Wallet size={16} strokeWidth={1.6} />} />}
      </StatStrip>

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: 'bandeja', label: <><List size={16} strokeWidth={1.6} /> Por contestar</> },
            { value: 'tablero', label: <><Columns3 size={16} strokeWidth={1.6} /> Por etapa</> },
          ]}
        />
        <div className="flex items-center gap-2">
          <SearchField value={q} onChange={setQ} placeholder="Buscar nombre o teléfono" className="flex-1 md:w-72" />
          {embedded && (
            <Button variant="secondary" icon={<Plus size={17} strokeWidth={1.6} />} onClick={() => setNewOpen(true)} className="shrink-0">
              <span className="max-sm:hidden">Nuevo prospecto</span>
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.36, ease: ease.calma } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
          {view === 'bandeja' ? (
            <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
              <div className="flex flex-col gap-7">
                {open.length === 0 && (
                  <Card>
                    <Empty kind="busqueda" title={q ? 'Nadie coincide con la búsqueda' : 'Sin prospectos por contestar'} body="Cuando alguien pregunte por una fecha, regístralo aquí para no perderle la pista." action={<Button onClick={() => setNewOpen(true)}>Registrar prospecto</Button>} />
                  </Card>
                )}
                {BUCKETS.map((b, bi) => {
                  const list = open.filter((l) => followBucket(l, T) === b).sort((x, y) => (x.followUpAt ?? '9').localeCompare(y.followUpAt ?? '9'))
                  if (!list.length) return null
                  return (
                    <section key={b} aria-label={FOLLOW_META[b].label}>
                      <div className="mb-3 flex items-center gap-2 px-1">
                        <span className={cx('h-2 w-2 rounded-full', TONE[FOLLOW_META[b].tone].solid)} />
                        <h3 className="text-[15px] font-semibold">{FOLLOW_META[b].label}</h3>
                        <span className="text-sm text-ink-3 tabular">{list.length}</span>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        <AnimatePresence initial={false}>
                          {list.map((l, i) => (
                            <motion.div key={l.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                              <SwipeRow hintKey={bi === 0 && i === 0 ? 'prospectos' : undefined} left={{ label: 'Seguimiento hecho', icon: <Check />, tone: 'success', onTrigger: () => setFollowUp(l, 3, 'Seguimiento registrado') }} right={{ label: 'Mañana', icon: <Moon />, tone: 'lavender', onTrigger: () => setFollowUp(l, 1, 'Pospuesto para mañana') }}>
                                <LeadCard lead={l} total={money.total(l)} showMoney={showMoney} onFollow={() => setFollow(l)} onBook={() => moveStage(l, 'apartado')} />
                              </SwipeRow>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </section>
                  )
                })}
                {open.length > 0 && <p className="px-1 text-center text-xs text-detail">Desliza una tarjeta a la derecha cuando ya diste seguimiento, o a la izquierda para dejarla para mañana.</p>}
              </div>
              <SourcesCard sources={stats.sources} />
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-ink-3">Arrastra un prospecto a la siguiente etapa · ajusta su probabilidad de cierre con el deslizador.</p>
              <DragBoard
                columns={BOARD.map((s) => {
                  const list = (s === 'confirmado' ? recentConfirmed : leads.filter((l) => l.status === s)).filter(matches)
                  const weighted = list.reduce((n, l) => n + (money.total(l) * defaultProb(l)) / 100, 0)
                  return { id: s, title: EVENT_STATUS[s].label, tone: EVENT_STATUS[s].tone, meta: showMoney && weighted > 0 ? compactMxn(weighted) : undefined, empty: s === 'confirmado' ? 'Suelta aquí al confirmar' : 'Vacío' }
                })}
                items={[...leads, ...recentConfirmed].filter(matches)}
                getId={(l) => l.id}
                getColumn={(l) => l.status}
                sort={(a, b) => a.date.localeCompare(b.date)}
                onMove={(_, to, l) => moveStage(l, to)}
                renderCard={(l) => <BoardCard lead={l} total={money.total(l)} showMoney={showMoney} />}
              />
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <NewEventSheet open={newOpen} asLead onClose={() => setNewOpen(false)} />
      <FollowSheet lead={follow} onClose={() => setFollow(null)} />
    </div>
  )
}

function SourcesCard({ sources }: { sources: { label: string; tone: any; value: number; won: number }[] }) {
  return (
    <div className="flex flex-col gap-5 xl:sticky xl:top-24 xl:self-start">
      <Card>
        <CardHeader eyebrow="Origen" title="¿Cómo nos encuentran?" />
        <div className="flex flex-col items-center gap-5 p-5 sm:flex-row xl:flex-col">
          <Donut segments={sources.length ? sources : [{ label: 'Sin datos', value: 1, tone: 'sky' }]} center={<><span className="display-num text-2xl">{sources.reduce((n, s) => n + s.value, 0)}</span><span className="text-xs text-detail">contactos</span></>} />
          <div className="w-full">
            <Legend items={sources.map((s) => ({ label: s.label, tone: s.tone, value: `${s.won}/${s.value}` }))} />
            <p className="mt-3 text-xs text-detail">Apartados / contactos por origen.</p>
          </div>
        </div>
      </Card>
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[5px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]">
            <Sparkles size={18} strokeWidth={1.6} />
          </span>
          <p className="text-sm text-ink-soft">Las parejas que reciben respuesta el mismo día apartan mucho más. Atiende primero los vencidos y propón una visita al rancho.</p>
        </div>
      </Card>
    </div>
  )
}

function LeadCard({ lead: l, total, showMoney, onFollow, onBook }: { lead: RanchEvent; total: number; showMoney: boolean; onFollow: () => void; onBook: () => void }) {
  const navigate = useNavigate()
  const me = useMe()
  const b = followBucket(l)
  const d = daysUntil(l.date)
  return (
    <div className="card relative p-4 md:p-5">
      <div className="flex items-start gap-3.5">
        <EventOrb type={l.type} />
        <button onClick={() => navigate(`/eventos/${l.id}`)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[16px] font-medium">{l.clientName}</span>
            <Badge tone={EVENT_STATUS[l.status].tone}>{EVENT_STATUS[l.status].label}</Badge>
          </div>
          <div className="mt-0.5 truncate text-sm text-ink-soft">
            {l.title} · {VENUE[l.venue].label} · {l.guests} invitados
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-detail">
            <span>
              Fecha deseada: {fmtDate(l.date)}
              {d >= 0 ? ` (en ${d} días)` : ''}
            </span>
            {l.clientBudget && showMoney && <span>Presupuesto {compactMxn(l.clientBudget)}</span>}
            {showMoney && <span>Cotizado {compactMxn(total)}</span>}
            <span>Cierre {defaultProb(l)}%</span>
          </div>
        </button>
        <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
          <Badge tone={LEAD_SOURCE[l.leadSource ?? 'otro'].tone}>{LEAD_SOURCE[l.leadSource ?? 'otro'].label}</Badge>
          <span className={cx('text-xs tabular', b === 'vencido' ? 'text-danger' : 'text-ink-soft')}>{l.followUpAt ? (b === 'vencido' ? `Vencido ${fmtDate(l.followUpAt)}` : b === 'hoy' ? 'Hoy' : fmtDate(l.followUpAt)) : 'Sin fecha'}</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5" data-noswipe>
        {l.phone && (
          <a href={waLink(l.phone, `Hola ${l.clientName.split(' ')[0]}, soy ${me?.name.split(' ')[0] ?? 'el equipo'} de Jardines La Joya. Te escribo por ${l.title} el ${fmtDateFull(l.date)}. ¿Te gustaría venir a conocer el ${VENUE[l.venue].label.toLowerCase()}?`)} target="_blank" rel="noopener">
            <Button size="sm" variant="secondary" icon={<MessageCircle size={15} strokeWidth={1.6} />}>
              WhatsApp
            </Button>
          </a>
        )}
        {l.phone && (
          <a href={`tel:${l.phone}`}>
            <Button size="icon-sm" variant="outline" aria-label={`Llamar a ${l.clientName}`}>
              <Phone size={15} strokeWidth={1.6} />
            </Button>
          </a>
        )}
        <Button size="sm" variant="ghost" icon={<CalendarClock size={15} strokeWidth={1.6} />} onClick={onFollow}>
          Seguimiento
        </Button>
        <Button size="sm" variant="primary" className="ml-auto" onClick={onBook}>
          Apartar fecha
        </Button>
      </div>
    </div>
  )
}

function BoardCard({ lead: l, total, showMoney }: { lead: RanchEvent; total: number; showMoney: boolean }) {
  const navigate = useNavigate()
  const [prob, setProb] = useState(defaultProb(l))
  const b = followBucket(l)
  const open = l.status === 'prospecto' || l.status === 'cotizado'
  return (
    <div className="card p-3.5">
      <button onClick={() => navigate(`/eventos/${l.id}`)} className="flex w-full items-start gap-3 text-left">
        <EventOrb type={l.type} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium">{l.clientName}</span>
          <span className="block truncate text-xs text-detail">
            {l.title} · {fmtDate(l.date)}
          </span>
        </span>
      </button>
      <div className="mt-2 flex items-center justify-between text-xs">
        {showMoney ? <span className="tabular">{mxn(total)}</span> : <span className="text-ink-3">{l.guests} invitados</span>}
        {open && l.followUpAt && <span className={cx('tabular', b === 'vencido' ? 'text-danger' : 'text-ink-3')}>{b === 'vencido' ? 'Seguimiento vencido' : b === 'hoy' ? 'Contestar hoy' : `Seguir ${fmtDate(l.followUpAt)}`}</span>}
      </div>
      {open && (
        <div data-nodrag className="mt-1">
          <Slider value={prob} onChange={setProb} min={0} max={100} step={5} format={(n) => `${n}%`} label="Probabilidad de cierre" />
          {prob !== defaultProb(l) && (
            <button onClick={() => db.patch('events', l.id, { probability: prob })} className="mt-1 text-xs font-medium text-primary">
              Guardar {prob}%{showMoney ? ` · vale ${compactMxn((total * prob) / 100)}` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FollowSheet({ lead, onClose }: { lead: RanchEvent | null; onClose: () => void }) {
  const [date, setDate] = useState(addDaysISO(today(), 2))
  const [note, setNote] = useState('')
  const [last, setLast] = useState<string | null>(null)
  if (lead && lead.id !== last) {
    setLast(lead.id)
    setDate(lead.followUpAt && lead.followUpAt > today() ? lead.followUpAt : addDaysISO(today(), 2))
    setNote('')
  }
  const T = today()
  return (
    <Sheet open={!!lead} onClose={onClose} title="Registrar seguimiento" subtitle={lead ? `${lead.clientName} · ${lead.title}` : undefined} side="center">
      {lead && (
        <div className="flex flex-col gap-4">
          <DateField
            label="Próximo seguimiento"
            value={date}
            onChange={setDate}
            min={T}
            presets={[
              { label: 'Mañana', value: addDaysISO(T, 1) },
              { label: 'En 3 días', value: addDaysISO(T, 3) },
              { label: 'En una semana', value: addDaysISO(T, 7) },
              { label: 'En 2 semanas', value: addDaysISO(T, 14) },
            ]}
          />
          <NotesField label="¿Qué platicaron?" hint="Se agrega a las notas del evento con la fecha" value={note} onChange={setNote} placeholder="Ej. Quiere visitar el jardín el sábado; pidió precio con barra libre." templates={['Agendó visita al rancho', 'Pidió cotización con barra libre', 'Lo va a platicar con su familia', 'No contestó']} minRows={2} />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const stamp = `${fmtDate(today())}: ${note.trim()}`
                const prev = { followUpAt: lead.followUpAt, notes: lead.notes }
                db.patch('events', lead.id, { followUpAt: date, notes: note.trim() ? [lead.notes, stamp].filter(Boolean).join('\n') : lead.notes })
                withUndo('Seguimiento guardado', () => db.patch('events', lead.id, prev), `Próximo: ${fmtDate(date)}`)
                onClose()
              }}
            >
              Guardar seguimiento
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

// Nuevo evento en 3 pasos (tipo y fecha → cliente → invitados y paquete) con un resumen vivo.
// El calendario marca qué días ya están ocupados en el salón o el jardín.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Clock, Home, Trees, Users, Wallet } from 'lucide-react'
import type { EventType, LeadSource, RanchEvent, Venue } from '@/lib/types'
import { db, useCollection, useMe, useStore } from '@/lib/store'
import { EVENT_TYPE, LEAD_SOURCE, VENUE, seesMoney } from '@/lib/meta'
import { priceOf, usePackagePrices } from '@/lib/packages'
import { defaultModules, type EventModule } from '@/lib/modules'
import { ModulesPicker } from './ModulesPicker'
import { DEFAULT_TIMELINE, EVENT_PACKAGES, eventChecklist } from '@/lib/templates'
import { autoLayout } from '@/lib/floorplan'
import { addDaysISO, fmtDateLong, mxn, today, uid } from '@/lib/format'
import { ease } from '@/lib/motion'
import { Avatar, Button, Sheet, cx, toast } from '@/components/ui'
import { Choices, Combobox, DateField, FormScope, MoneyField, NotesField, PhoneField, Slider, StepTrail, TextField, TimeField } from '@/components/fields'
import { EventOrb } from './EventOrb'

const STEPS = ['Tipo y fecha', 'Cliente', 'Invitados y paquete']

export function NewEventSheet({ open, onClose, initialDate, initialVenue, asLead }: { open: boolean; onClose: () => void; initialDate?: string; initialVenue?: Venue; asLead?: boolean }) {
  const navigate = useNavigate()
  const me = useMe()
  const events = useCollection('events')
  const employees = useCollection('employees')
  const ivaPercent = useStore((s) => s.settings.ivaPercent)
  const showMoney = seesMoney(me?.role)

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [reveal, setReveal] = useState(false)
  const [type, setType] = useState<EventType>('boda')
  const [venue, setVenue] = useState<Venue>('salon')
  const [date, setDate] = useState(initialDate ?? today())
  const [startTime, setStart] = useState('17:00')
  const [endTime, setEnd] = useState('01:00')
  const [guests, setGuests] = useState(120)
  const [clientName, setClient] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [packageId, setPackage] = useState('clasico')
  const [notes, setNotes] = useState('')
  const [coordinatorId, setCoordinator] = useState<string>('')
  const [leadSource, setLeadSource] = useState<LeadSource>('whatsapp')
  const [budget, setBudget] = useState(0)
  // Qué partes usará el evento; cambia con el tipo hasta que la persona toque algún interruptor
  const [modsTouched, setModsTouched] = useState<Partial<Record<EventModule, boolean>>>({})
  const mods = { ...defaultModules(type), ...modsTouched }

  useEffect(() => {
    if (open) {
      setStep(0)
      setReveal(false)
      setDate(initialDate ?? today())
      if (initialVenue) setVenue(initialVenue)
      setClient('')
      setPhone('')
      setTitle('')
      setNotes('')
      setBudget(0)
      setModsTouched({})
    }
  }, [open, initialDate, initialVenue])

  // Días ocupados por espacio para el calendario
  const busy = useMemo(() => {
    const m = new Map<string, Venue[]>()
    for (const e of events) if (e.status !== 'cancelado') m.set(e.date, [...(m.get(e.date) ?? []), e.venue])
    return m
  }, [events])
  const conflicts = useMemo(() => events.filter((e) => e.date === date && e.venue === venue && e.status !== 'cancelado'), [events, date, venue])
  const otherVenue = useMemo(() => events.filter((e) => e.date === date && e.venue !== venue && e.status !== 'cancelado'), [events, date, venue])
  const overCapacity = guests > VENUE[venue].capacity
  const pkg = EVENT_PACKAGES.find((p) => p.id === packageId)!
  const coordinators = employees.filter((e) => e.active && (e.role === 'eventos' || e.role === 'admin'))
  const autoTitle = `${EVENT_TYPE[type].label}${clientName ? ' de ' + clientName.split(' ')[0] : ''}`
  const prices = usePackagePrices()
  const price = priceOf(prices, packageId)
  // Solo hay estimado si el rancho ya puso el precio de ese paquete
  const estimate = price !== undefined ? price * guests : undefined
  const tables = Math.ceil(guests / 10)

  const go = (to: number) => {
    if (to > step && step === 1 && !clientName.trim()) {
      setReveal(true)
      return toast.error('Falta el cliente', 'Escribe el nombre de quien contrata.')
    }
    if (to > step && step === 0 && conflicts.length) return toast.error(`El ${VENUE[venue].label.toLowerCase()} ya está ocupado ese día`, 'Elige otra fecha o el otro espacio.')
    setDir(to > step ? 1 : -1)
    setStep(to)
  }

  const save = () => {
    if (!clientName.trim()) {
      setReveal(true)
      setStep(1)
      return toast.error('Falta el cliente', 'Escribe el nombre de quien contrata.')
    }
    const ev = db.upsert('events', {
      title: title.trim() || autoTitle,
      type,
      venue,
      date,
      startTime,
      endTime,
      guests,
      clientName: clientName.trim(),
      phone: phone || undefined,
      status: 'prospecto',
      packageId,
      modules: modsTouched,
      lineItems: [{ id: uid('li_'), concept: `Paquete ${pkg.name}`, category: 'Paquete', qty: guests, price: price ?? 0 }],
      discount: 0,
      includeIva: false,
      layout: autoLayout(venue, guests, type === 'empresarial' ? 'imperial' : 'banquete'),
      guestList: [],
      timeline: (DEFAULT_TIMELINE[type] ?? DEFAULT_TIMELINE.default)!.map((t) => ({ ...t, id: uid('tl_'), done: false })),
      checklist: eventChecklist(),
      providers: [],
      notes: notes.trim() || undefined,
      coordinatorId: coordinatorId || coordinators.find((c) => c.role === 'eventos')?.id,
      leadSource,
      followUpAt: addDaysISO(today(), 1),
      clientBudget: budget || undefined,
      probability: 25,
    } as Partial<RanchEvent>)
    toast.success(asLead ? 'Prospecto creado' : 'Evento creado', `${ev.title} · ${fmtDateLong(date)}`)
    onClose()
    if (!asLead) navigate(`/eventos/${ev.id}`)
  }

  const summary = (
    <div className="rounded-[var(--r-lg)] bg-sunken p-4">
      <div className="flex items-center gap-3">
        <EventOrb type={type} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{title.trim() || autoTitle}</p>
          <p className="text-xs text-detail first-letter:uppercase">{fmtDateLong(date)}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
        <span className="flex items-center gap-1.5 text-ink-soft">{venue === 'salon' ? <Home size={14} strokeWidth={1.6} /> : <Trees size={14} strokeWidth={1.6} />} {VENUE[venue].label}</span>
        <span className="flex items-center gap-1.5 text-ink-soft">
          <Clock size={14} strokeWidth={1.6} /> {startTime}–{endTime}
        </span>
        <span className="flex items-center gap-1.5 text-ink-soft">
          <Users size={14} strokeWidth={1.6} /> {guests} · {tables} mesas
        </span>
        {showMoney && estimate !== undefined && (
          <span className="flex items-center gap-1.5 font-medium tabular">
            <Wallet size={14} strokeWidth={1.6} className="text-ink-soft" /> {mxn(estimate)}
          </span>
        )}
      </div>
      {clientName && <p className="mt-2 truncate text-xs text-ink-3">Cliente: {clientName}</p>}
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={asLead ? 'Nuevo prospecto' : 'Nuevo evento'}
      subtitle="En 3 pasos. Se crea con lo que elijas listo: cotización, plano, programa y pendientes"
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button variant="ghost" icon={<ArrowLeft size={17} strokeWidth={1.6} />} onClick={() => go(step - 1)}>
              Atrás
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          )}
          {showMoney && estimate !== undefined && <span className="hidden text-sm text-ink-soft sm:inline">Estimado <span className="text-ink tabular">{mxn(estimate)}</span> · IVA {ivaPercent}% opcional</span>}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => go(step + 1)} iconRight={<ArrowRight size={17} strokeWidth={1.6} />}>
              Siguiente
            </Button>
          ) : (
            <Button onClick={save} icon={<Check size={18} strokeWidth={1.6} />}>
              {asLead ? 'Guardar prospecto' : 'Crear evento'}
            </Button>
          )}
        </div>
      }
    >
      <StepTrail steps={STEPS} current={step} onStep={go} className="mb-5" />
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <FormScope reveal={reveal}>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.3, ease: ease.calma } }} exit={{ opacity: 0, x: dir * -24, transition: { duration: 0.16, ease: ease.salida } }} className="flex min-w-0 flex-col gap-5">
              {step === 0 && (
                <>
                  <div>
                    <span className="mb-2 block text-[13px] font-medium">Tipo de evento</span>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Tipo de evento">
                      {(Object.keys(EVENT_TYPE) as EventType[]).map((t) => (
                        <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cx('pressable flex flex-col items-center gap-2 rounded-[14px] p-3 text-center text-xs ring-inset', type === t ? 'bg-[color-mix(in_oklab,var(--primary)_8%,var(--surface))] ring-[1.5px] ring-primary' : 'ring-1 ring-line hover:bg-wash')}>
                          <EventOrb type={t} size="sm" />
                          {EVENT_TYPE[t].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Choices
                    label="Espacio"
                    variant="cards"
                    value={venue}
                    onChange={setVenue}
                    options={(Object.keys(VENUE) as Venue[]).map((v) => ({ value: v, label: VENUE[v].label, hint: `${VENUE[v].description} · hasta ${VENUE[v].capacity}`, icon: v === 'salon' ? <Home /> : <Trees />, tone: VENUE[v].tone }))}
                  />
                  <DateField
                    label="Fecha"
                    value={date}
                    onChange={setDate}
                    min={today()}
                    hint="Los días con punto ya tienen evento en este espacio"
                    error={conflicts.length ? `El ${VENUE[venue].label.toLowerCase()} ya está ocupado: ${conflicts.map((c) => c.title).join(', ')}` : undefined}
                    dayInfo={(iso) => {
                      const v = busy.get(iso)
                      if (!v) return undefined
                      return v.includes(venue) ? { tone: 'rose', note: `${VENUE[venue].label} ocupado` } : { dot: true, note: 'Evento en el otro espacio' }
                    }}
                  />
                  {otherVenue.length > 0 && conflicts.length === 0 && <p className="rounded-[12px] bg-[color-mix(in_oklab,var(--warning)_10%,var(--surface))] p-3 text-sm text-warning">Ese día también hay evento en el {otherVenue[0]!.venue === 'salon' ? 'salón' : 'jardín'}: {otherVenue.map((c) => c.title).join(', ')}. Coordinen estacionamiento y sonido.</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <TimeField label="Inicio" value={startTime} onChange={setStart} presets={['13:00', '14:00', '17:00', '18:00', '19:00']} />
                    <TimeField label="Fin" value={endTime} onChange={setEnd} presets={['20:00', '22:00', '00:00', '01:00', '02:00']} />
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <TextField label="Cliente" value={clientName} onChange={setClient} capitalizeWords required requiredMsg="Escribe el nombre de quien contrata" autoFocus autoComplete="name" />
                  <PhoneField label="Teléfono o WhatsApp" value={phone} onChange={setPhone} />
                  <TextField label="Nombre del evento" value={title} onChange={setTitle} placeholder={autoTitle} hint={`Si lo dejas vacío queda "${autoTitle}"`} />
                  <Choices label="¿Cómo nos conoció?" value={leadSource} onChange={setLeadSource} size="sm" options={(Object.keys(LEAD_SOURCE) as LeadSource[]).map((s) => ({ value: s, label: LEAD_SOURCE[s].label, tone: LEAD_SOURCE[s].tone }))} />
                  {showMoney && <MoneyField label="Presupuesto de la clienta" value={budget} onChange={setBudget} hint="Opcional: para comparar con la cotización" presets={[80000, 150000, 250000]} />}
                  <Combobox label="Coordinación" value={coordinatorId} onChange={setCoordinator} clearable hint="Si no eliges, se asigna a la wedding planner" options={coordinators.map((c) => ({ value: c.id, label: c.name, icon: <Avatar name={c.name} tone={c.color} size={24} /> }))} />
                </>
              )}
              {step === 2 && (
                <>
                  <Slider label="Invitados" value={guests} onChange={setGuests} min={20} max={450} step={5} format={(n) => `${n} personas`} hint={overCapacity ? <span className="text-warning">Son más que la capacidad recomendada del {VENUE[venue].label.toLowerCase()} ({VENUE[venue].capacity}).</span> : `${tables} mesas de 10 · ${Math.ceil(guests / 15)} meseros sugeridos`} marks={[{ value: 20, label: '20' }, { value: 200, label: '200' }, { value: 450, label: '450' }]} />
                  <div>
                    <span className="mb-2 block text-[13px] font-medium">Paquete</span>
                    <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Paquete">
                      {EVENT_PACKAGES.map((p) => (
                        <button key={p.id} role="radio" aria-checked={packageId === p.id} onClick={() => setPackage(p.id)} className={cx('pressable rounded-[14px] p-3.5 text-left ring-inset', packageId === p.id ? 'bg-[color-mix(in_oklab,var(--primary)_8%,var(--surface))] ring-[1.5px] ring-primary' : 'ring-1 ring-line hover:bg-wash')}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[15px] font-semibold">{p.name}</span>
                            {showMoney && priceOf(prices, p.id) !== undefined && <span className="text-xs tabular">{mxn(priceOf(prices, p.id)!)}/pers.</span>}
                          </div>
                          <p className="mt-1 text-xs text-detail">{p.description}</p>
                          {showMoney && priceOf(prices, p.id) !== undefined && <p className="mt-2 text-[13px] font-medium tabular">{mxn(priceOf(prices, p.id)! * guests)}</p>}
                        </button>
                      ))}
                    </div>
                    {showMoney && price === undefined && <p className="mt-2 text-xs text-detail">Este paquete aún no tiene precio. Ponlo en Ajustes → Rancho → Paquetes y precios; mientras, la cotización queda en blanco para llenarla a mano.</p>}
                  </div>
                  <div>
                    <span className="mb-1 block text-[13px] font-medium">¿Qué vas a usar en este evento?</span>
                    <p className="mb-2.5 text-xs text-detail">Viene listo según el tipo de evento. Apaga lo que no necesites; lo puedes cambiar después.</p>
                    <ModulesPicker value={mods} showMoney={showMoney} onChange={(m, on) => setModsTouched((x) => ({ ...x, [m]: on }))} />
                  </div>
                  <NotesField label="Notas" value={notes} onChange={setNotes} placeholder="Temática, colores, peticiones especiales…" templates={['Quiere visitar el rancho', 'Ceremonia en el jardín', 'Barra libre', 'Menú infantil']} minRows={2} />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </FormScope>
        <div className="flex flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
          <span className="kicker">Así va quedando</span>
          {summary}
          {conflicts.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-danger">
              <AlertTriangle size={14} strokeWidth={1.7} className="mt-px shrink-0" /> Espacio ocupado ese día
            </p>
          )}
        </div>
      </div>
    </Sheet>
  )
}

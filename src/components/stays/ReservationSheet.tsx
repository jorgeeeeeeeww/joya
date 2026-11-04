import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BedDouble, CalendarCheck2, DoorOpen, Home, LogIn, LogOut, Plus, Trash2, Wallet, XCircle } from 'lucide-react'
import { db, useCollection, useRole, useStore } from '@/lib/store'
import { reservationConflicts } from '@/lib/automations'
import { PAYMENT_METHOD, RES_SOURCE, RES_STATUS, seesMoney } from '@/lib/meta'
import { addDaysISO, fmtDate, isWeekendNight, mxn, nights, today } from '@/lib/format'
import { removeWithUndo, withUndo } from '@/lib/undo'
import type { ID, PaymentMethod, Reservation, ReservationSource, ReservationStatus } from '@/lib/types'
import { Badge, Button, ProgressBar, Sheet, toast } from '@/components/ui'
import { Choices, DateRangeField, EmailField, FormScope, MoneyField, NotesField, PhoneField, Stepper, TextField, TimeField } from '@/components/fields'

export interface ReservationDefaults {
  unitId?: ID
  checkIn?: string
  checkOut?: string
}

type Form = Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'>

const blank = (d: ReservationDefaults, unitId: ID): Form => ({
  unitId: d.unitId ?? unitId,
  guestName: '',
  phone: '',
  email: '',
  guests: 2,
  checkIn: d.checkIn ?? today(),
  checkOut: d.checkOut ?? addDaysISO(d.checkIn ?? today(), 1),
  arrivalTime: '15:00',
  source: 'directo',
  status: 'confirmada',
  total: 0,
  notes: '',
})

export function suggestedTotal(unitId: ID, checkIn: string, checkOut: string) {
  const u = db.get('units', unitId)
  if (!u) return 0
  let total = 0
  for (let i = 0; i < nights(checkIn, checkOut); i++) total += isWeekendNight(addDaysISO(checkIn, i)) ? u.weekendPrice : u.basePrice
  return total
}

export function ReservationSheet({ open, onClose, reservationId, defaults = {} }: { open: boolean; onClose: () => void; reservationId?: ID; defaults?: ReservationDefaults }) {
  const units = useCollection('units')
  const payments = useCollection('payments')
  const reservations = useCollection('reservations')
  const settings = useStore((s) => s.settings)
  const role = useRole()
  const money = seesMoney(role)
  const existing = useStore((s) => (reservationId ? s.data.reservations[reservationId] : undefined))
  const [form, setForm] = useState<Form>(() => blank(defaults, units[0]?.id ?? ''))
  const [totalTouched, setTotalTouched] = useState(false)
  const [pay, setPay] = useState<{ amount: number; method: PaymentMethod }>({ amount: 0, method: 'transferencia' })
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    if (!open) return
    if (existing) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = existing
      setForm({ ...rest })
      setTotalTouched(true)
    } else {
      const b = blank(defaults, units[0]?.id ?? '')
      setForm({ ...b, total: suggestedTotal(b.unitId, b.checkIn, b.checkOut) })
      setTotalTouched(false)
    }
    setPay({ amount: 0, method: 'transferencia' })
    setReveal(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reservationId])

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => {
      const next = { ...f, [k]: v }
      if (k === 'checkIn' && next.checkOut <= next.checkIn) next.checkOut = addDaysISO(next.checkIn, 1)
      if (!totalTouched && (k === 'unitId' || k === 'checkIn' || k === 'checkOut')) next.total = suggestedTotal(next.unitId, next.checkIn, next.checkOut)
      return next
    })
  const setDates = (checkIn: string, checkOut: string) =>
    setForm((f) => ({ ...f, checkIn, checkOut, total: totalTouched ? f.total : suggestedTotal(f.unitId, checkIn, checkOut) }))

  const unit = units.find((u) => u.id === form.unitId)
  const n = nights(form.checkIn, form.checkOut)
  const conflicts = useMemo(() => (form.status === 'cancelada' ? [] : reservationConflicts(useStore.getState(), { id: reservationId ?? '__new', unitId: form.unitId, checkIn: form.checkIn, checkOut: form.checkOut })), [form.unitId, form.checkIn, form.checkOut, form.status, reservationId])
  // Noches ocupadas de esta unidad (sin contar esta misma reserva) para el calendario
  const busyNights = useMemo(() => {
    const set = new Set<string>()
    for (const r of reservations) {
      if (r.id === reservationId || r.unitId !== form.unitId || r.status === 'cancelada') continue
      for (let d = r.checkIn; d < r.checkOut; d = addDaysISO(d, 1)) set.add(d)
    }
    return set
  }, [reservations, form.unitId, reservationId])
  const overCapacity = !!unit && form.guests > unit.capacity
  const myPayments = reservationId ? payments.filter((p) => p.refId === reservationId).sort((a, b) => a.date.localeCompare(b.date)) : []
  const paid = myPayments.reduce((s, p) => s + p.amount, 0)
  const errors = [!form.guestName.trim() && 'Escribe el nombre del huésped', n < 1 && 'La salida debe ser después de la llegada', conflicts.length > 0 && 'Las fechas se empalman con otra reserva'].filter(Boolean) as string[]

  const save = () => {
    if (errors.length) {
      setReveal(true)
      return toast.error(errors[0]!)
    }
    const saved = db.upsert('reservations', { ...form, id: reservationId, guestName: form.guestName.trim() })
    toast.success(reservationId ? 'Reserva actualizada' : 'Reserva creada', `${saved.guestName} · ${unit?.name}`)
    onClose()
  }

  const setStatus = (status: ReservationStatus, msg: string) => {
    if (!reservationId) return
    const prev = form.status
    db.patch('reservations', reservationId, { status })
    setForm((f) => ({ ...f, status }))
    withUndo(msg, () => {
      db.patch('reservations', reservationId, { status: prev })
      setForm((f) => ({ ...f, status: prev }))
    })
  }

  const addPayment = () => {
    const amount = pay.amount
    if (!reservationId || !amount || amount <= 0) return toast.error('Escribe un monto válido')
    const p = db.upsert('payments', { refType: 'reserva', refId: reservationId, amount, method: pay.method, date: today(), concept: paid === 0 ? 'Anticipo' : 'Pago de hospedaje', receivedBy: useStore.getState().session.userId })
    setPay({ amount: 0, method: pay.method })
    withUndo(`Pago de ${mxn(amount)} registrado`, () => db.remove('payments', p.id))
  }

  const welcome = `¡Hola ${form.guestName.split(' ')[0] || ''}! Te esperamos en ${settings.ranchName}\n\n${unit?.name}\nLlegada: ${fmtDate(form.checkIn)} a partir de las ${settings.checkInTime}\nSalida: ${fmtDate(form.checkOut)} antes de las ${settings.checkOutTime}\nUbicación: https://maps.google.com/?q=${settings.lat},${settings.lng}\nWi-Fi: LaJoya-Huespedes\n\nCualquier duda, aquí estamos.`
  const sortedUnits = [...units].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'cabana' ? -1 : 1))

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={reservationId ? form.guestName || 'Reserva' : 'Nueva reserva'}
      subtitle={unit ? `${unit.name} · ${n} ${n === 1 ? 'noche' : 'noches'}${money && form.total ? ` · ${mxn(form.total)}` : ''}` : undefined}
      footer={
        <div className="flex items-center gap-2">
          {reservationId && role === 'admin' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar reserva"
              onClick={() => {
                removeWithUndo('reservations', reservationId, `La reserva de ${form.guestName}`)
                onClose()
              }}
            >
              <Trash2 size={18} strokeWidth={1.6} />
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} icon={<CalendarCheck2 size={18} strokeWidth={1.6} />}>
            {reservationId ? 'Guardar' : 'Reservar'}
          </Button>
        </div>
      }
    >
      {reservationId && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Badge tone={RES_STATUS[form.status].tone} dot>
            {RES_STATUS[form.status].label}
          </Badge>
          <Badge tone={RES_SOURCE[form.source].tone}>{RES_SOURCE[form.source].label}</Badge>
          {form.externalUid && <Badge tone="sky">Importada por iCal</Badge>}
        </div>
      )}

      {reservationId && form.status !== 'cancelada' && form.status !== 'finalizada' && (
        <div className="mb-5 flex flex-wrap gap-2">
          {(form.status === 'confirmada' || form.status === 'pendiente') && (
            <Button icon={<LogIn size={18} strokeWidth={1.6} />} onClick={() => setStatus('en-casa', 'Check-in registrado')}>
              Check-in
            </Button>
          )}
          {form.status === 'en-casa' && (
            <Button icon={<LogOut size={18} strokeWidth={1.6} />} onClick={() => setStatus('finalizada', 'Check-out: se creó la limpieza')}>
              Check-out
            </Button>
          )}
          <Button variant="danger" icon={<XCircle size={18} strokeWidth={1.6} />} onClick={() => setStatus('cancelada', 'Reserva cancelada')}>
            Cancelar reserva
          </Button>
        </div>
      )}

      <FormScope reveal={reveal}>
        <div className="flex flex-col gap-5">
          <Choices
            label="Unidad"
            hint={unit ? `${unit.beds} · ${unit.baths} ${unit.baths === 1 ? 'baño' : 'baños'}` : undefined}
            variant="cards"
            columns={3}
            value={form.unitId}
            onChange={(v) => set('unitId', v)}
            options={sortedUnits.map((u) => ({ value: u.id, label: u.name.replace('Cabaña ', '').replace('Casa ', ''), hint: `${u.kind === 'cabana' ? 'Cabaña' : 'Casa'} · ${u.capacity} pers.${money ? ` · ${mxn(u.basePrice)}` : ''}`, icon: u.kind === 'cabana' ? <BedDouble /> : <Home />, tone: u.color }))}
          />
          <DateRangeField
            start={form.checkIn}
            end={form.checkOut}
            onChange={setDates}
            dayInfo={(iso) => ({ busy: busyNights.has(iso), price: money && unit ? (isWeekendNight(iso) ? unit.weekendPrice : unit.basePrice) : undefined })}
            summary={(s, e) => `${nights(s, e)} ${nights(s, e) === 1 ? 'noche' : 'noches'}${money ? ` · ${mxn(suggestedTotal(form.unitId, s, e))}` : ''}`}
            error={conflicts.length ? `Se empalma con ${conflicts.map((c) => `${c.guestName} (${fmtDate(c.checkIn)} → ${fmtDate(c.checkOut)})`).join(', ')}` : undefined}
            hint="Las noches tachadas ya están ocupadas"
          />
          <div className="grid gap-4 @xl:grid-cols-2">
            <TextField label="Huésped" value={form.guestName} onChange={(v) => set('guestName', v)} autoFocus={!reservationId} capitalizeWords required requiredMsg="Escribe el nombre del huésped" autoComplete="name" />
            <Stepper label="Huéspedes" value={form.guests} onChange={(v) => set('guests', v)} min={1} max={30} unit={unit ? `máximo ${unit.capacity}` : undefined} hint={overCapacity ? <span className="text-warning">Supera la capacidad de {unit?.capacity}: elige otra unidad o ajusta el número.</span> : undefined} />
            <PhoneField label="Teléfono (WhatsApp)" value={form.phone} onChange={(v) => set('phone', v)} whatsappText={welcome} />
            <EmailField value={form.email} onChange={(v) => set('email', v)} />
            <TimeField label="Hora de llegada" value={form.arrivalTime} onChange={(v) => set('arrivalTime', v)} presets={['13:00', '15:00', '17:00', '19:00', '21:00']} />
            {money && (
              <MoneyField
                label="Total"
                value={form.total}
                onChange={(v) => {
                  setTotalTouched(true)
                  set('total', v)
                }}
                suggestion={{ amount: suggestedTotal(form.unitId, form.checkIn, form.checkOut), label: 'Precio de lista' }}
                hint="Viernes y sábado van con precio de fin de semana"
              />
            )}
          </div>
          <Choices label="¿Por dónde llegó?" value={form.source} onChange={(v) => set('source', v as ReservationSource)} options={Object.entries(RES_SOURCE).map(([k, v]) => ({ value: k as ReservationSource, label: v.label, tone: v.tone }))} />
          {!reservationId && <Choices label="Estado" value={form.status} onChange={(v) => set('status', v as ReservationStatus)} size="sm" options={(['pendiente', 'confirmada'] as ReservationStatus[]).map((k) => ({ value: k, label: RES_STATUS[k].label, tone: RES_STATUS[k].tone }))} />}
          <NotesField label="Notas" value={form.notes ?? ''} onChange={(v) => set('notes', v)} placeholder="Peticiones especiales, mascotas, hora estimada…" templates={['Traen mascota', 'Piden cuna', 'Llegan tarde', 'Celebran aniversario', 'Factura']} minRows={2} />
        </div>
      </FormScope>

      {conflicts.length > 0 && (
        <div className="mt-5 flex gap-3 rounded-[14px] ring-1 ring-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,var(--surface))] p-4 text-danger" role="alert">
          <AlertTriangle size={20} strokeWidth={1.6} className="mt-0.5 shrink-0" />
          <p className="text-sm font-medium">Esas fechas ya están ocupadas en {unit?.name}. Elige otras noches u otra unidad.</p>
        </div>
      )}

      {money && reservationId && (
        <div className="mt-6 rounded-[var(--r-lg)] bg-sunken p-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-[15px] font-semibold">
              <Wallet size={17} strokeWidth={1.6} className="text-ink-soft" /> Pagos
            </h4>
            <span className="text-sm tabular">
              {mxn(paid)} <span className="text-ink-3">de {mxn(form.total)}</span>
            </span>
          </div>
          <ProgressBar value={form.total ? paid / form.total : 0} tone={paid >= form.total ? 'sage' : undefined} className="mt-3" />
          <div className="mt-3 flex flex-col gap-1.5">
            {myPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-[12px] bg-surface px-3.5 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{p.concept}</span> <span className="text-ink-3">· {fmtDate(p.date)} · {PAYMENT_METHOD[p.method]}</span>
                </span>
                <span className="tabular">{mxn(p.amount)}</span>
              </div>
            ))}
            {!myPayments.length && <p className="text-sm text-ink-3">Sin pagos registrados.</p>}
          </div>
          {paid < form.total && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <MoneyField label="Registrar pago" value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} className="flex-1" suggestion={{ amount: form.total - paid, label: 'Resta' }} presets={paid === 0 ? [Math.round((form.total * settings.depositPercent) / 100)] : undefined} />
                <Button size="icon" aria-label="Registrar pago" onClick={addPayment} disabled={!pay.amount} className="mt-1 shrink-0">
                  <Plus size={18} strokeWidth={1.6} />
                </Button>
              </div>
              <Choices size="sm" value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map((k) => ({ value: k, label: PAYMENT_METHOD[k] }))} />
            </div>
          )}
        </div>
      )}

      {unit && (
        <p className="mt-6 flex items-center gap-2 text-xs text-detail">
          <DoorOpen size={14} strokeWidth={1.6} /> Entrada {settings.checkInTime} · Salida {settings.checkOutTime} · {unit.beds}
        </p>
      )}
    </Sheet>
  )
}

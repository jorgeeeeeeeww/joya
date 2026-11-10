import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ChevronRight, Link2, LogIn, LogOut, MapPin, Plus } from 'lucide-react'
import { SwipeRow } from '@/components/interact'
import { withUndo } from '@/lib/undo'
import { db, useCollection, useRole } from '@/lib/store'
import { RES_SOURCE, seesMoney, TONE, UNIT_STATUS } from '@/lib/meta'
import { addDaysISO, capitalize, compactMxn, fmt, fmtDate, fmtDateLong, mxn, nights, pct, today } from '@/lib/format'
import type { ID, Reservation, Unit } from '@/lib/types'
import { Badge, Button, Card, CardHeader, Confirm, cx, Empty, IconBubble, PageHeader, Segmented, Sheet } from '@/components/ui'
import { Timeline } from '@/components/stays/Timeline'
import { ReservationSheet, type ReservationDefaults } from '@/components/stays/ReservationSheet'
import { ChannelSync } from '@/components/stays/ChannelSync'
import { LostFoundList } from '@/components/stays/LostFound'

export default function Hospedaje() {
  const units = useCollection('units')
  const reservations = useCollection('reservations')
  const role = useRole()
  const money = seesMoney(role)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [days, setDays] = useState<'14' | '30'>('14')
  const [offset, setOffset] = useState(0)
  const [sheet, setSheet] = useState<{ open: boolean; id?: ID; defaults?: ReservationDefaults }>({ open: false })
  const [below, setBelow] = useState<'llegadas' | 'casas' | 'objetos'>('llegadas')
  const [channels, setChannels] = useState(false)
  const t = today()
  const paramId = params.get('r') ?? undefined
  const paramUnit = params.get('u')

  // /hospedaje?u=<unitId> (desde el mapa) abre una reserva nueva para esa unidad
  useEffect(() => {
    if (!paramUnit) return
    setSheet({ open: true, defaults: { unitId: paramUnit, checkIn: t } })
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramUnit])

  const sortedUnits = useMemo(() => [...units].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'cabana' ? -1 : 1)), [units])
  const active = reservations.filter((r) => r.status !== 'cancelada')
  const start = addDaysISO(t, offset - 2)

  const arrivals = active.filter((r) => r.checkIn === t && (r.status === 'confirmada' || r.status === 'pendiente'))
  const departures = active.filter((r) => r.checkOut === t && r.status === 'en-casa')
  const inHouse = active.filter((r) => r.status === 'en-casa')

  // Ocupación del mes en curso por unidad
  const monthStart = t.slice(0, 8) + '01'
  const monthEnd = addDaysISO(monthStart, 31).slice(0, 8) + '01'
  const daysInMonth = nights(monthStart, monthEnd)
  const occupancy = (unitId: ID) => {
    let n = 0
    for (const r of active) {
      if (r.unitId !== unitId || (r.guests === 0 && r.externalUid)) continue
      const a = r.checkIn > monthStart ? r.checkIn : monthStart
      const b = r.checkOut < monthEnd ? r.checkOut : monthEnd
      if (b > a) n += nights(a, b)
    }
    return n / daysInMonth
  }
  const totalOcc = sortedUnits.length ? sortedUnits.reduce((s, u) => s + occupancy(u.id), 0) / sortedUnits.length : 0
  const monthRevenue = active.filter((r) => r.checkIn >= monthStart && r.checkIn < monthEnd).reduce((s, r) => s + r.total, 0)

  const openRes = (id: ID) => setSheet({ open: true, id })
  const closeSheet = () => {
    setSheet({ open: false })
    if (paramId) setParams({}, { replace: true })
  }

  // Check-in a una casa que aún no está lista: se pregunta antes (puede que la limpieza vaya a medias)
  const [notReadyAsk, setNotReadyAsk] = useState<Reservation | null>(null)
  const checkIn = (r: Reservation) => {
    const u = units.find((x) => x.id === r.unitId)
    if (u && u.status !== 'lista' && u.status !== 'ocupada') return setNotReadyAsk(r)
    quick(r, 'en-casa', 'Check-in registrado')
  }
  const quick = (r: Reservation, status: Reservation['status'], msg: string) => {
    const prev = r.status
    db.patch('reservations', r.id, { status })
    withUndo(msg, () => db.patch('reservations', r.id, { status: prev }), `${r.guestName} · ${units.find((u) => u.id === r.unitId)?.name}`)
  }
  // Arrastrar en el calendario
  const moveRes = (id: ID, patch: Pick<Reservation, 'unitId' | 'checkIn' | 'checkOut'>) => {
    const r = reservations.find((x) => x.id === id)
    if (!r) return
    const before = { unitId: r.unitId, checkIn: r.checkIn, checkOut: r.checkOut }
    db.patch('reservations', id, patch)
    const u = units.find((x) => x.id === patch.unitId)
    withUndo('Reserva movida', () => db.patch('reservations', id, before), `${r.guestName} · ${u?.name} · ${fmtDate(patch.checkIn)} → ${fmtDate(patch.checkOut)}`)
  }

  return (
    <div>
      <PageHeader
        eyebrow={capitalize(fmtDateLong(t))}
        title="Hospedaje"
        primary={{ label: 'Nueva reserva', icon: <Plus size={18} strokeWidth={1.6} />, onClick: () => setSheet({ open: true, defaults: {} }) }}
        menu={role === 'admin' ? [{ label: 'Airbnb y Booking', icon: <Link2 />, hint: 'Conectar calendarios', onClick: () => setChannels(true) }] : undefined}
      />

      {/* Las cifras del mes, en una sola línea */}
      <p className="-mt-3 mb-6 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-ink-soft">
        <span>
          <b className="font-semibold text-ink tabular">{pct(totalOcc)}</b> de ocupación en {fmt(t, 'MMMM')}
        </span>
        <span>
          <b className="font-semibold text-ink tabular">{inHouse.length}</b> en casa · {inHouse.reduce((n, r) => n + r.guests, 0)} huéspedes
        </span>
        {money ? (
          <span>
            <b className="font-semibold text-ink tabular">{compactMxn(monthRevenue)}</b> reservado este mes
          </span>
        ) : (
          <span>
            <b className="font-semibold text-ink tabular">{units.filter((u) => u.status === 'lista').length}</b> de {units.length} listas
          </span>
        )}
      </p>

      {/* Llegadas y salidas de hoy: solo lo que hay */}
      {arrivals.length + departures.length > 0 ? (
        <div className={cx('mb-7 grid gap-4 [&>*]:min-w-0', arrivals.length > 0 && departures.length > 0 && 'md:grid-cols-2')}>
          {arrivals.length > 0 && <TodayList title="Llegan hoy" tone="lavender" icon={<LogIn size={18} strokeWidth={1.6} />} items={arrivals} units={units} empty="Sin llegadas hoy" action={(r) => ({ label: 'Check-in', onClick: () => checkIn(r) })} onOpen={openRes} warnNotReady />}
          {departures.length > 0 && <TodayList title="Salen hoy" tone="peach" icon={<LogOut size={18} strokeWidth={1.6} />} items={departures} units={units} empty="Sin salidas pendientes" action={(r) => ({ label: 'Check-out', onClick: () => quick(r, 'finalizada', 'Check-out: se creó la limpieza') })} onOpen={openRes} />}
        </div>
      ) : (
        <p className="mb-7 text-[14px] text-ink-soft">Hoy no llega ni sale nadie.</p>
      )}

      {/* Calendario: lo principal de esta pantalla */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] leading-tight font-semibold tracking-[-0.02em]">Calendario</h2>
          <p className="mt-0.5 text-[13px] text-detail">
            {fmtDate(start)} – {fmtDate(addDaysISO(start, Number(days) - 1))} · arrastra para reservar o mover
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setOffset((o) => o - 7)}>
            <ChevronLeft size={18} strokeWidth={1.6} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffset(0)}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={() => setOffset((o) => o + 7)}>
            <ChevronRight size={18} strokeWidth={1.6} />
          </Button>
          <Segmented size="sm" value={days} onChange={setDays} options={[{ value: '14', label: '14 días' }, { value: '30', label: '30 días' }]} />
        </div>
      </div>
      <Timeline units={sortedUnits} reservations={reservations} start={start} days={Number(days)} onCell={(unitId, date) => setSheet({ open: true, defaults: { unitId, checkIn: date } })} onBar={openRes} onCreate={(unitId, checkIn, checkOut) => setSheet({ open: true, defaults: { unitId, checkIn, checkOut } })} onMove={moveRes} money={money} />

      {/* Lo demás, a un toque */}
      <div className="mt-8 mb-4">
        <Segmented
          value={below}
          onChange={setBelow}
          options={[
            { value: 'llegadas', label: <span>Próximas<span className="max-sm:hidden"> llegadas</span></span> },
            { value: 'casas', label: <span>Casas<span className="max-sm:hidden"> y cabañas</span></span> },
            ...(role === 'admin' || role === 'recepcion' ? [{ value: 'objetos' as const, label: <span>Objetos<span className="max-sm:hidden"> olvidados</span></span> }] : []),
          ]}
        />
      </div>
      {below === 'llegadas' && <UpcomingList reservations={active} units={units} onOpen={openRes} money={money} />}
      {below === 'casas' && (
        <Card className="overflow-hidden">
          <ul className="grid divide-y divide-line lg:grid-cols-2">
            {sortedUnits.map((u) => (
              <UnitRow key={u.id} unit={u} active={active} occ={occupancy(u.id)} onOpen={openRes} onReserve={() => setSheet({ open: true, defaults: { unitId: u.id, checkIn: t } })} onMap={() => navigate(`/mapa?u=${u.id}`)} />
            ))}
          </ul>
        </Card>
      )}
      {below === 'objetos' && <LostFoundList />}

      <Sheet open={channels} onClose={() => setChannels(false)} wide title="Airbnb y Booking" subtitle="Conecta los calendarios para evitar dobles reservas">
        <ChannelSync />
      </Sheet>

      <Confirm
        open={!!notReadyAsk}
        onClose={() => setNotReadyAsk(null)}
        title={`${units.find((u) => u.id === notReadyAsk?.unitId)?.name ?? 'La casa'} aún no está lista`}
        body={`Está «${notReadyAsk ? UNIT_STATUS[units.find((u) => u.id === notReadyAsk.unitId)?.status ?? 'lista'].label.toLowerCase() : ''}». ¿Hacer el check-in de todos modos? Si la limpieza va a medias, avísale al equipo.`}
        confirmLabel="Sí, hacer check-in"
        onConfirm={() => {
          if (notReadyAsk) quick(notReadyAsk, 'en-casa', 'Check-in registrado')
          setNotReadyAsk(null)
        }}
      />
      <ReservationSheet open={sheet.open || !!paramId} onClose={closeSheet} reservationId={sheet.id ?? paramId} defaults={sheet.defaults} />
    </div>
  )
}

function UnitRow({ unit: u, active, occ, onOpen, onReserve, onMap }: { unit: Unit; active: Reservation[]; occ: number; onOpen: (id: ID) => void; onReserve: () => void; onMap: () => void }) {
  const t = today()
  const current = active.find((r) => r.unitId === u.id && r.status === 'en-casa')
  const next = active.filter((r) => r.unitId === u.id && r.checkIn >= t && r.status !== 'en-casa' && r.status !== 'finalizada' && !(r.guests === 0 && r.externalUid)).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0]
  const st = UNIT_STATUS[u.status]
  const target = current ?? next
  return (
    <li className="flex min-w-0 items-center gap-3 px-4 py-3 md:px-5">
      <span title={st.label} className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TONE[st.tone].hex }} />
      <button onClick={() => target && onOpen(target.id)} className="min-w-0 flex-1 text-left" disabled={!target}>
        <span className="block text-[15px] leading-snug font-semibold">{u.name}</span>
        <span className="block text-[13px] leading-snug text-detail">
          {current ? `${current.guestName} · sale ${fmtDate(current.checkOut)}` : next ? `${st.label} · llegan ${next.checkIn === t ? 'hoy' : fmtDate(next.checkIn)}${next.arrivalTime ? ` ${next.arrivalTime}` : ''}` : st.label}
        </span>
      </button>
      <span className="hidden w-14 shrink-0 text-right text-[13px] text-ink-soft tabular sm:block" title="Ocupación del mes">
        {pct(occ)}
      </span>
      <Button size="sm" variant="secondary" onClick={onReserve}>
        Reservar
      </Button>
      <Button size="icon" variant="ghost" aria-label={`Ver ${u.name} en el mapa`} onClick={onMap}>
        <MapPin size={16} strokeWidth={1.6} />
      </Button>
    </li>
  )
}

function TodayList({ title, tone, icon, items, units, empty, action, onOpen, warnNotReady }: { title: string; tone: 'lavender' | 'peach'; icon: ReactNode; items: Reservation[]; units: Unit[]; empty: string; action: (r: Reservation) => { label: string; onClick: () => void }; onOpen: (id: ID) => void; warnNotReady?: boolean }) {
  return (
    <Card>
      <CardHeader
        icon={
          <IconBubble tone={tone} size="md">
            {icon}
          </IconBubble>
        }
        title={title}
        subtitle={items.length ? `${items.length} ${items.length === 1 ? 'reserva' : 'reservas'}` : empty}
      />
      <div className="px-3 pt-3 pb-3">
        {items.length === 0 && <p className="px-3 pb-2 text-sm text-ink-soft">{empty}.</p>}
        {items.map((r, i) => {
          const u = units.find((x) => x.id === r.unitId)
          const a = action(r)
          const notReady = warnNotReady && u && u.status !== 'lista' && u.status !== 'ocupada'
          return (
            <SwipeRow key={r.id} className="!rounded-[14px]" hintKey={i === 0 ? `hoy-${a.label}` : undefined} left={{ label: a.label, icon: tone === 'lavender' ? <LogIn /> : <LogOut />, tone: 'success', onTrigger: a.onClick }}>
            <div className="flex items-center gap-3 rounded-[14px] bg-surface px-3 py-2.5 hover:bg-wash">
              <button onClick={() => onOpen(r.id)} className="min-w-0 flex-1 text-left">
                <p className="font-medium">{r.guestName}</p>
                <p className={cx('text-xs', notReady ? 'text-warning' : 'text-ink-soft')}>
                  {notReady && <AlertTriangle size={12} strokeWidth={1.6} className="mr-1 inline align-[-2px]" />}
                  {u?.name} · {r.guests} huésp.{r.arrivalTime ? ` · ${r.arrivalTime}` : ''}
                  {notReady ? ` · ${UNIT_STATUS[u!.status].label.toLowerCase()}` : ''}
                </p>
              </button>
              <Button size="sm" variant="secondary" onClick={a.onClick}>
                {a.label}
              </Button>
            </div>
            </SwipeRow>
          )
        })}
      </div>
    </Card>
  )
}

function UpcomingList({ reservations, units, onOpen, money }: { reservations: Reservation[]; units: Unit[]; onOpen: (id: ID) => void; money: boolean }) {
  const t = today()
  const upcoming = reservations
    .filter((r) => r.checkIn > t && !(r.guests === 0 && r.externalUid))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .slice(0, 10)
  return (
    <Card>
      {upcoming.length === 0 ? (
        <Empty kind="reserva" title="Sin reservas próximas" body="Las nuevas reservas y las de Airbnb aparecerán aquí." />
      ) : (
        <div className="grid p-3 lg:grid-cols-2 lg:gap-x-3">
          {upcoming.map((r) => (
            <button key={r.id} onClick={() => onOpen(r.id)} className="flex w-full min-w-0 items-center gap-3 rounded-[14px] px-3 py-3 text-left hover:bg-wash">
              <div className="w-12 shrink-0 text-center">
                <p className="eyebrow !text-[10px]">{fmt(r.checkIn, 'MMM')}</p>
                <p className="display-num text-[1.8rem]">{r.checkIn.slice(8).replace(/^0/, '')}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.guestName}</p>
                <p className="text-xs text-detail">
                  {units.find((u) => u.id === r.unitId)?.name} · {nights(r.checkIn, r.checkOut)} {nights(r.checkIn, r.checkOut) === 1 ? 'noche' : 'noches'} · {r.guests} huéspedes
                </p>
              </div>
              <Badge tone={RES_SOURCE[r.source].tone}>{RES_SOURCE[r.source].label}</Badge>
              {money && <span className="hidden w-24 text-right tabular sm:block">{mxn(r.total)}</span>}
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

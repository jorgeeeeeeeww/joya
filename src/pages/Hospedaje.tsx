import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { AlertTriangle, BedDouble, CalendarDays, ChevronLeft, ChevronRight, LogIn, LogOut, MapPin, Plus, Users, Wallet } from 'lucide-react'
import { SwipeRow } from '@/components/interact'
import { withUndo } from '@/lib/undo'
import { db, useCollection, useRole } from '@/lib/store'
import { RES_SOURCE, seesMoney, TONE, UNIT_STATUS } from '@/lib/meta'
import { addDaysISO, capitalize, compactMxn, fmt, fmtDate, fmtDateLong, mxn, nights, pct, today } from '@/lib/format'
import { fadeRise } from '@/lib/motion'
import type { ID, Reservation, Unit } from '@/lib/types'
import { Badge, Button, Card, CardHeader, cx, Empty, IconBubble, PageHeader, ProgressBar, Segmented, Stat } from '@/components/ui'
import { Reveal } from '@/components/step1'
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
        subtitle="Llegadas, salidas y calendario. Arrastra en el calendario para reservar o mover una estancia."
        primary={{ label: 'Nueva reserva', icon: <Plus size={18} strokeWidth={1.6} />, onClick: () => setSheet({ open: true, defaults: {} }) }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Stat label="Ocupación del mes" value={pct(totalOcc)} sub={capitalize(fmt(t, 'MMMM'))} tone="sky" icon={<CalendarDays size={16} strokeWidth={1.6} />} />
        <Stat label="En casa ahora" value={inHouse.length} sub={`${inHouse.reduce((n, r) => n + r.guests, 0)} huéspedes`} tone="lavender" icon={<Users size={16} strokeWidth={1.6} />} />
        <Stat label="Llegan · salen hoy" value={`${arrivals.length} · ${departures.length}`} sub="llegadas · salidas" tone="peach" icon={<LogIn size={16} strokeWidth={1.6} />} />
        {money ? (
          <Stat label="Reservado este mes" value={compactMxn(monthRevenue)} sub="Hospedaje" tone="sage" icon={<Wallet size={16} strokeWidth={1.6} />} accent />
        ) : (
          <Stat label="Unidades listas" value={units.filter((u) => u.status === 'lista').length} sub={`de ${units.length}`} tone="sage" icon={<BedDouble size={16} strokeWidth={1.6} />} />
        )}
      </div>

      {/* Llegadas y salidas de hoy */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <TodayList title="Llegan hoy" tone="lavender" icon={<LogIn size={18} strokeWidth={1.6} />} items={arrivals} units={units} empty="Sin llegadas hoy" action={(r) => ({ label: 'Check-in', onClick: () => quick(r, 'en-casa', 'Check-in registrado') })} onOpen={openRes} warnNotReady />
        <TodayList title="Salen hoy" tone="peach" icon={<LogOut size={18} strokeWidth={1.6} />} items={departures} units={units} empty="Sin salidas pendientes" action={(r) => ({ label: 'Check-out', onClick: () => quick(r, 'finalizada', 'Check-out: se creó la limpieza') })} onOpen={openRes} />
      </div>

      {/* Unidades */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="heading text-[1.7rem]">Unidades</h2>
        <p className="hidden text-sm text-ink-soft sm:block">Ocupación del mes y próxima llegada</p>
      </div>
      <Reveal className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        {sortedUnits.map((u) => (
          <UnitCard key={u.id} unit={u} active={active} occ={occupancy(u.id)} onOpen={openRes} onReserve={() => setSheet({ open: true, defaults: { unitId: u.id, checkIn: t } })} onMap={() => navigate(`/mapa?u=${u.id}`)} />
        ))}
      </Reveal>

      {/* Calendario */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="heading text-[1.7rem]">Calendario</h2>
          <p className="text-sm text-ink-soft">{fmtDate(start)} – {fmtDate(addDaysISO(start, Number(days) - 1))}</p>
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

      <div className="mt-10 grid gap-5 xl:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <UpcomingList reservations={active} units={units} onOpen={openRes} money={money} />
        {role === 'admin' && <LostFoundList />}
      </div>

      {role === 'admin' && (
        <div className="mt-5">
          <ChannelSync />
        </div>
      )}

      <ReservationSheet open={sheet.open || !!paramId} onClose={closeSheet} reservationId={sheet.id ?? paramId} defaults={sheet.defaults} />
    </div>
  )
}

function UnitCard({ unit: u, active, occ, onOpen, onReserve, onMap }: { unit: Unit; active: Reservation[]; occ: number; onOpen: (id: ID) => void; onReserve: () => void; onMap: () => void }) {
  const t = today()
  const current = active.find((r) => r.unitId === u.id && r.status === 'en-casa')
  const next = active.filter((r) => r.unitId === u.id && r.checkIn >= t && r.status !== 'en-casa' && r.status !== 'finalizada' && !(r.guests === 0 && r.externalUid)).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0]
  const st = UNIT_STATUS[u.status]
  return (
    <motion.div variants={fadeRise} className="h-full">
      <Card className="flex h-full flex-col overflow-hidden">
        {/* Cabecera tintada con la luz del estado */}
        <div className="relative h-20 overflow-hidden" style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${TONE[u.color].hex} 34%, var(--surface)), color-mix(in oklab, ${TONE[u.color].hex} 10%, var(--surface)))` }}>
          <svg aria-hidden viewBox="0 0 320 80" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-10 w-full">
            <path d="M0 52 C60 36 110 40 160 50 S260 34 320 46 V80 H0Z" fill="var(--surface)" opacity="0.55" />
            <path d="M0 66 C80 56 150 60 220 64 S290 58 320 62 V80 H0Z" fill="var(--surface)" />
          </svg>
          <div className="absolute top-3 right-3">
            <Badge tone={st.tone} dot className="!bg-[color-mix(in_oklab,var(--surface)_86%,transparent)]">
              {st.label}
            </Badge>
          </div>
          <span className="absolute top-3 left-4 text-xs text-ink-soft">
            {u.kind === 'cabana' ? 'Cabaña' : 'Casa'} · {u.capacity} personas
          </span>
        </div>
        <div className="flex flex-1 flex-col px-5 pb-5">
          <p className="heading -mt-1 truncate text-[1.45rem]">{u.name}</p>
          <div className="mt-3 flex-1 space-y-2 text-sm">
            {current ? (
              <button onClick={() => onOpen(current.id)} className="flex w-full items-center gap-2 text-left">
                <Users size={15} strokeWidth={1.6} className="shrink-0 text-ink-soft" />
                <span className="truncate">
                  <span className="font-medium">{current.guestName}</span> <span className="text-ink-soft">· sale {fmtDate(current.checkOut)}</span>
                </span>
              </button>
            ) : (
              <p className="flex items-center gap-2 text-ink-soft">
                <BedDouble size={15} strokeWidth={1.6} /> Sin huéspedes ahora
              </p>
            )}
            {next && (
              <button onClick={() => onOpen(next.id)} className="flex w-full items-center gap-2 text-left text-ink-soft">
                <LogIn size={15} strokeWidth={1.6} className="shrink-0" />
                <span className="truncate">
                  {next.checkIn === t ? 'Hoy' : fmtDate(next.checkIn)}
                  {next.arrivalTime ? ` ${next.arrivalTime}` : ''} · {next.guestName}
                </span>
              </button>
            )}
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-ink-soft">
              <span>Ocupación del mes</span>
              <span className="tabular text-ink">{pct(occ)}</span>
            </div>
            <ProgressBar value={occ} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="secondary" className="flex-1" onClick={onReserve}>
              Reservar
            </Button>
            <Button size="icon" variant="outline" aria-label={`Ver ${u.name} en el mapa`} className="!h-10 !w-10" onClick={onMap}>
              <MapPin size={16} strokeWidth={1.6} />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
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
        action={<span className="display-num text-[2.2rem]">{items.length}</span>}
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
                <p className="truncate font-medium">{r.guestName}</p>
                <p className={cx('flex items-center gap-1 truncate text-xs', notReady ? 'text-warning' : 'text-ink-soft')}>
                  {notReady && <AlertTriangle size={12} strokeWidth={1.6} className="shrink-0" />}
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
      <CardHeader eyebrow="Agenda" title="Próximas llegadas" subtitle="Las siguientes 10 reservas" />
      {upcoming.length === 0 ? (
        <Empty title="Sin reservas próximas" body="Las nuevas reservas y las de Airbnb aparecerán aquí." />
      ) : (
        <div className="px-3 pt-3 pb-3">
          {upcoming.map((r) => (
            <button key={r.id} onClick={() => onOpen(r.id)} className="flex w-full items-center gap-4 rounded-[14px] px-3 py-3 text-left hover:bg-wash">
              <div className="w-12 shrink-0 text-center">
                <p className="eyebrow !text-[10px]">{fmt(r.checkIn, 'MMM')}</p>
                <p className="display-num text-[1.8rem]">{r.checkIn.slice(8).replace(/^0/, '')}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.guestName}</p>
                <p className="truncate text-xs text-ink-soft">
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

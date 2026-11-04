// Panel de Recepción: llegadas, salidas, unidades, saldos de hospedaje, canales y objetos olvidados.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, BedDouble, CalendarRange, CheckCircle2, CloudRain, CloudSun, Link2, LogIn, LogOut, MessageCircle, Moon, Plus, RefreshCw, Sparkles, Sun, Users, Wallet } from 'lucide-react'
import { db, useMe, useStore } from '@/lib/store'
import { PAYMENT_METHOD, RES_SOURCE, RES_STATUS, TONE, UNIT_STATUS } from '@/lib/meta'
import { addDaysISO, capitalize, compactMxn, fmt, fmtDate, fmtDateLong, greeting, mxn, nights, relativeDay, today, waLink } from '@/lib/format'
import { useWeather, weatherLabel } from '@/lib/weather'
import { ease, fadeRise, haptic, stagger } from '@/lib/motion'
import type { ID, PaymentMethod, Reservation, Task, Unit } from '@/lib/types'
import { Avatar, Badge, Button, Card, CardHeader, cx, Dot, Empty, Field, IconBubble, Input, ProgressBar, Select, Sheet, toast } from '@/components/ui'
import { SwipeRow } from '@/components/interact'
import { withUndo } from '@/lib/undo'
import { CountUp, SkyBlock, Sparkle } from '@/components/step1'
import { CabanasScene } from '@/components/scenes'
import { ReservationSheet } from '@/components/stays/ReservationSheet'
import { LostFoundList } from '@/components/stays/LostFound'

const isBlock = (r: Reservation) => r.guests === 0 || /bloque/i.test(r.guestName)
const openTask = (t: Task) => !t.deleted && (t.status === 'pendiente' || t.status === 'en-progreso')

interface Move {
  id: string
  kind: 'in' | 'out'
  time: string
  res: Reservation
  unit: Unit
}

function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeRise} className={className}>
      {children}
    </motion.div>
  )
}

/** Hoja rápida para registrar un pago de hospedaje */
function PaySheet({ res, balance, onClose }: { res?: Reservation; balance: number; onClose: () => void }) {
  const me = useMe()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('transferencia')
  const [prevId, setPrevId] = useState<string | undefined>()
  if (res?.id !== prevId) {
    setPrevId(res?.id)
    setAmount(balance ? String(Math.round(balance)) : '')
    setMethod(res?.source === 'airbnb' ? 'airbnb' : 'transferencia')
  }
  const n = Number(amount)
  return (
    <Sheet
      open={!!res}
      onClose={onClose}
      title="Registrar pago"
      subtitle={res ? `${res.guestName} · saldo ${mxn(balance)}` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="tinta"
            disabled={!n || n <= 0}
            onClick={() => {
              if (!res) return
              db.upsert('payments', { refType: 'reserva', refId: res.id, amount: n, method, date: today(), concept: n >= balance ? 'Liquidación de hospedaje' : 'Abono de hospedaje', receivedBy: me?.id })
              toast.success('Pago registrado', `${mxn(n)} · ${res.guestName}`)
              onClose()
            }}
          >
            Guardar pago
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Monto" hint={n > balance ? 'Es más que el saldo; se registrará igual.' : undefined}>
          <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {[balance, balance / 2].filter((v) => v > 0).map((v, i) => (
            <button key={i} onClick={() => setAmount(String(Math.round(v)))} className="pressable h-9 rounded-full px-4 text-sm ring-1 ring-line-strong ring-inset hover:bg-wash">
              {i === 0 ? 'Saldo completo' : 'La mitad'} · {mxn(v)}
            </button>
          ))}
        </div>
        <Field label="Método">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHOD).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  )
}

export default function RecepcionPanel() {
  const me = useMe()
  const navigate = useNavigate()
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const weather = useWeather()
  const T = today()
  const M = addDaysISO(T, 1)
  const [sheet, setSheet] = useState<{ open: boolean; id?: ID; unitId?: ID }>({ open: false })
  const [payFor, setPayFor] = useState<Reservation | undefined>()

  const units = useMemo(() => Object.values(data.units).filter((u) => !u.deleted).sort((a, b) => a.mapId.localeCompare(b.mapId)), [data.units])
  const reservations = useMemo(() => Object.values(data.reservations).filter((r) => !r.deleted && r.status !== 'cancelada'), [data.reservations])
  const paid = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of Object.values(data.payments)) if (!p.deleted && p.refType === 'reserva') m.set(p.refId, (m.get(p.refId) ?? 0) + p.amount)
    return m
  }, [data.payments])
  const balanceOf = (r: Reservation) => Math.max(0, r.total - (paid.get(r.id) ?? 0))
  const cleaningFor = (unitId: ID) => Object.values(data.tasks).find((t) => t.unitId === unitId && t.type === 'limpieza' && openTask(t))

  // ── Llegadas y salidas (hoy y mañana) ──
  const moves = useMemo(() => {
    const build = (day: string): Move[] => {
      const out: Move[] = []
      for (const r of reservations) {
        const unit = data.units[r.unitId]
        if (!unit || isBlock(r)) continue
        if (r.checkIn === day && r.status !== 'finalizada') out.push({ id: 'in' + r.id, kind: 'in', time: r.arrivalTime ?? settings.checkInTime, res: r, unit })
        if (r.checkOut === day && (r.status === 'en-casa' || r.status === 'finalizada')) out.push({ id: 'out' + r.id, kind: 'out', time: settings.checkOutTime, res: r, unit })
      }
      return out.sort((a, b) => a.time.localeCompare(b.time) || (a.kind === 'out' ? -1 : 1))
    }
    return [
      { label: 'Hoy', day: T, items: build(T) },
      { label: 'Mañana', day: M, items: build(M) },
    ]
  }, [reservations, data.units, settings.checkInTime, settings.checkOutTime, T, M])

  const arrivalsToday = moves[0]!.items.filter((m) => m.kind === 'in')
  const departuresToday = moves[0]!.items.filter((m) => m.kind === 'out')
  const pendingIn = arrivalsToday.filter((m) => m.res.status !== 'en-casa').length
  const pendingOut = departuresToday.filter((m) => m.res.status === 'en-casa').length
  const inHouse = reservations.filter((r) => r.status === 'en-casa' && !isBlock(r))
  const guestsInHouse = inHouse.reduce((n, r) => n + r.guests, 0)

  // ── Saldos por cobrar ──
  const balances = useMemo(
    () =>
      reservations
        .filter((r) => !isBlock(r) && r.status !== 'finalizada' && r.checkIn <= addDaysISO(T, 30) && balanceOf(r) > 0)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
        .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reservations, paid, T],
  )
  const totalDue = balances.reduce((n, r) => n + balanceOf(r), 0)

  // ── Próximas reservas (2 a 7 días) ──
  const upcoming = useMemo(() => reservations.filter((r) => !isBlock(r) && r.checkIn > M && r.checkIn <= addDaysISO(T, 7)).sort((a, b) => a.checkIn.localeCompare(b.checkIn)), [reservations, T, M])

  // ── Canales ──
  const channelUnits = units.filter((u) => u.icalImportUrl)
  const airbnbNext30 = reservations.filter((r) => (r.source === 'airbnb' || r.source === 'booking') && r.checkIn >= T && r.checkIn <= addDaysISO(T, 30) && !isBlock(r)).length

  const welcomeText = (r: Reservation, u: Unit) =>
    `¡Hola ${r.guestName.split(' ')[0]}! Te esperamos en ${settings.ranchName}.\n\n${u.name}\nLlegada: ${fmtDate(r.checkIn)} a partir de las ${settings.checkInTime}${r.arrivalTime ? ` (nos dijiste ${r.arrivalTime})` : ''}\nSalida: ${fmtDate(r.checkOut)} antes de las ${settings.checkOutTime}\nUbicación: https://maps.google.com/?q=${settings.lat},${settings.lng}\nWi-Fi: LaJoya-Huespedes\n\nReglamento: silencio después de las 23:00, no se permiten mascotas sin aviso y cuidamos el jardín entre todos. Cualquier duda, aquí estamos.`
  const readyText = (r: Reservation, u: Unit) => `Hola ${r.guestName.split(' ')[0]}, te saludamos de ${settings.ranchName}. Tu ${u.name} ya está lista para recibirte ✦ Te esperamos ${relativeDay(r.checkIn).toLowerCase()} a partir de las ${settings.checkInTime}.`
  const balanceText = (r: Reservation) => `Hola ${r.guestName.split(' ')[0]}, te recordamos que el saldo de tu estancia en ${settings.ranchName} es de ${mxn(balanceOf(r))}. Puedes pagarlo por transferencia o al llegar. ¡Gracias!`

  const checkIn = (r: Reservation) => {
    const prev = r.status
    db.patch('reservations', r.id, { status: 'en-casa' }, { summary: `Check-in de ${r.guestName}` })
    haptic.success()
    withUndo('Check-in listo', () => db.patch('reservations', r.id, { status: prev }), `${r.guestName} ya está en casa`)
  }
  const checkOut = (r: Reservation, u: Unit) => {
    const prev = r.status
    db.patch('reservations', r.id, { status: 'finalizada' }, { summary: `Check-out de ${r.guestName}` })
    haptic.success()
    withUndo('Check-out listo', () => db.patch('reservations', r.id, { status: prev }), `Se creó la limpieza de ${u.name}`)
  }

  const now = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
  const nextIdx = moves[0]!.items.findIndex((m) => (m.kind === 'in' ? m.res.status !== 'en-casa' : m.res.status === 'en-casa'))
  const WeatherIcon = !weather ? Sun : weather.code >= 51 ? CloudRain : weather.code <= 1 ? (new Date().getHours() >= 19 ? Moon : Sun) : CloudSun

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12 xl:gap-6">
      {/* ── Cielo de recepción ── */}
      <Section className="md:col-span-2 xl:col-span-12">
        <section className="grain relative overflow-hidden rounded-[var(--r-slab)] bg-paper ring-1 ring-line">
          <SkyBlock height="clamp(120px, 18vh, 170px)" luzSize="clamp(56px, 9vw, 88px)" scene={<CabanasScene />} />
          <div className="relative mt-1 px-6 pb-7 sm:px-9 xl:px-12">
            <p className="eyebrow">{capitalize(fmtDateLong(T))}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="heading text-[clamp(2.1rem,1.6rem+2.2vw,3.4rem)]">
                  {greeting()}, {me?.name.split(' ')[0]}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[15px] text-ink-soft">
                  Recepción de {settings.ranchName}
                  {weather && (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      · <WeatherIcon size={16} strokeWidth={1.6} /> {weather.temp}° {weatherLabel(weather.code).toLowerCase()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="chispa" icon={<Plus size={18} strokeWidth={1.6} />} onClick={() => setSheet({ open: true })}>
                  Nueva reserva
                </Button>
                <Button variant="outline" icon={<CalendarRange size={18} strokeWidth={1.6} />} onClick={() => navigate('/hospedaje')}>
                  Calendario
                </Button>
              </div>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Llegadas hoy', value: arrivalsToday.length, sub: pendingIn ? `${pendingIn} por recibir` : 'Todas recibidas', icon: LogIn },
                { label: 'Salidas hoy', value: departuresToday.length, sub: pendingOut ? `${pendingOut} por despedir` : 'Sin pendientes', icon: LogOut },
                { label: 'En casa ahora', value: inHouse.length, sub: `${guestsInHouse} huéspedes`, icon: Users },
                { label: 'Por cobrar (30 días)', value: totalDue, sub: `${balances.length} reservas con saldo`, icon: Wallet, money: true },
              ].map((k) => (
                <div key={k.label} className="rounded-[18px] bg-surface p-4 shadow-[var(--shadow-1)] ring-1 ring-line">
                  <div className="flex items-center gap-1.5 text-xs text-detail">
                    <k.icon size={14} strokeWidth={1.6} /> {k.label}
                  </div>
                  <div className="display-num mt-2 text-[2.1rem]">{k.money ? <CountUp value={k.value} format={compactMxn} /> : <CountUp value={k.value} />}</div>
                  <div className="mt-1 text-xs text-ink-3">{k.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Section>

      {/* ── Llegadas y salidas ── */}
      <Section className="md:col-span-2 xl:col-span-7">
        <Card className="h-full">
          <CardHeader eyebrow="Movimientos" title="Llegadas y salidas" subtitle="Hoy y mañana, en orden de hora" icon={<IconBubble tone="sky"><BedDouble size={20} strokeWidth={1.6} /></IconBubble>} />
          <div className="px-4 pt-4 pb-5 md:px-6">
            {moves.map((g, gi) => (
              <div key={g.label} className={cx(gi > 0 && 'mt-6')}>
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className="text-sm font-medium">{g.label}</span>
                  <span className="text-xs text-ink-3">{fmt(g.day, "EEEE d 'de' MMMM")}</span>
                </div>
                {g.items.length === 0 ? (
                  <p className="rounded-[14px] bg-sunken px-4 py-3 text-sm text-ink-soft">Sin llegadas ni salidas.</p>
                ) : (
                  <ol className="relative">
                    <span aria-hidden className="absolute top-4 bottom-4 left-[57px] w-px bg-line-strong" />
                    {g.items.map((m, i) => {
                      const { res: r, unit: u } = m
                      const bal = balanceOf(r)
                      const task = m.kind === 'in' ? cleaningFor(u.id) : undefined
                      const cleaner = task?.assigneeId ? data.employees[task.assigneeId] : undefined
                      const notReady = m.kind === 'in' && r.status !== 'en-casa' && u.status !== 'lista' && u.status !== 'ocupada'
                      const done = m.kind === 'in' ? r.status === 'en-casa' : r.status === 'finalizada'
                      const isNext = gi === 0 && i === nextIdx
                      const mins = task?.startedAt ? Math.max(1, Math.round((Date.now() - new Date(task.startedAt).getTime()) / 60000)) : 0
                      const progress = task?.checklist.length ? task.checklist.filter((c) => c.done).length / task.checklist.length : 0
                      return (
                        <motion.li key={m.id} layout className={cx('relative flex gap-3 py-2.5', done && 'opacity-60')}>
                          <span className="w-11 shrink-0 pt-1 text-right text-xs text-detail tabular">{m.time}</span>
                          <span className="relative z-[1] mt-2 flex h-[13px] w-[13px] shrink-0 items-center justify-center">
                            <span className={cx('h-[9px] w-[9px] rounded-full ring-[3px] ring-surface', isNext ? 'bg-chispa-soft shadow-[0_0_12px_3px_var(--luz)]' : done ? 'bg-success' : m.kind === 'in' ? 'bg-sky' : 'bg-peach')} />
                          </span>
                          <SwipeRow
                            className="min-w-0 flex-1 !rounded-[12px]"
                            hintKey={isNext ? 'recepcion' : undefined}
                            disabled={gi !== 0 || done}
                            left={m.kind === 'in' ? { label: 'Check-in', icon: <LogIn />, tone: 'success', onTrigger: () => checkIn(r) } : r.status === 'en-casa' ? { label: 'Check-out', icon: <LogOut />, tone: 'success', onTrigger: () => checkOut(r, u) } : undefined}
                          >
                          <div className="min-w-0 rounded-[12px] bg-surface">
                            <button onClick={() => setSheet({ open: true, id: r.id })} className="block w-full text-left">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                {m.kind === 'in' ? <LogIn size={14} strokeWidth={1.6} className="text-ink-soft" /> : <LogOut size={14} strokeWidth={1.6} className="text-ink-soft" />}
                                <span className="text-[15px] font-medium">
                                  {m.kind === 'in' ? 'Llega' : 'Sale'} {r.guestName}
                                </span>
                                <Badge tone={RES_SOURCE[r.source].tone}>{RES_SOURCE[r.source].label}</Badge>
                                {done && (
                                  <span className="inline-flex items-center gap-1 text-xs text-success">
                                    <CheckCircle2 size={13} strokeWidth={1.8} /> {m.kind === 'in' ? 'En casa' : 'Salió'}
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block text-[13px] text-ink-soft">
                                {u.name} · {r.guests} huéspedes · {nights(r.checkIn, r.checkOut)} {nights(r.checkIn, r.checkOut) === 1 ? 'noche' : 'noches'}
                                {bal > 0 && <span className="text-chispa"> · saldo {mxn(bal)}</span>}
                              </span>
                            </button>

                            {notReady && (
                              <div className="mt-2 rounded-[14px] bg-[color-mix(in_oklab,var(--warning)_12%,var(--surface))] px-3 py-2.5">
                                <div className="flex items-center gap-2 text-[13px]">
                                  <AlertTriangle size={14} strokeWidth={1.6} className="shrink-0 text-warning" />
                                  <span>
                                    {u.name} aún no está lista · <span className="font-medium">{UNIT_STATUS[u.status].label}</span>
                                    {cleaner && (
                                      <>
                                        {' '}
                                        · {cleaner.name.split(' ')[0]}
                                        {task?.status === 'en-progreso' ? ` lleva ${mins} min` : ' la tiene asignada'}
                                      </>
                                    )}
                                  </span>
                                </div>
                                {task && <ProgressBar value={progress} className="mt-2" />}
                              </div>
                            )}

                            {!done && (
                              <div className="mt-2.5 flex flex-wrap gap-2">
                                {m.kind === 'in' && gi === 0 && (
                                  <Button size="sm" variant="tinta" icon={<LogIn size={15} strokeWidth={1.6} />} onClick={() => checkIn(r)}>
                                    Check-in
                                  </Button>
                                )}
                                {m.kind === 'out' && gi === 0 && r.status === 'en-casa' && (
                                  <Button size="sm" variant="tinta" icon={<LogOut size={15} strokeWidth={1.6} />} onClick={() => checkOut(r, u)}>
                                    Check-out
                                  </Button>
                                )}
                                {m.kind === 'in' && r.phone && (
                                  <a href={waLink(r.phone, u.status === 'lista' ? readyText(r, u) : welcomeText(r, u))} target="_blank" rel="noreferrer" className="pressable inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm text-ink ring-1 ring-line-strong ring-inset hover:bg-wash">
                                    <MessageCircle size={15} strokeWidth={1.6} /> {u.status === 'lista' ? 'Avisar: casa lista' : 'Bienvenida'}
                                  </a>
                                )}
                                {bal > 0 && (
                                  <Button size="sm" variant="ghost" icon={<Wallet size={15} strokeWidth={1.6} />} onClick={() => setPayFor(r)}>
                                    Cobrar
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                          </SwipeRow>
                        </motion.li>
                      )
                    })}
                  </ol>
                )}
              </div>
            ))}
            <p className="mt-4 px-1 text-xs text-ink-3">Al hacer check-out se crea sola la limpieza y se asigna a quien tenga menos carga. Hora actual {now}.</p>
          </div>
        </Card>
      </Section>

      {/* ── Unidades ── */}
      <Section className="md:col-span-2 xl:col-span-5">
        <Card className="h-full">
          <CardHeader eyebrow="Unidades" title="Cabañas y casas" subtitle="Estado en vivo y quién está en cada una" action={<Link to="/mapa" className="pressable inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink">Mapa <ArrowRight size={15} strokeWidth={1.6} /></Link>} />
          <ul className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 md:p-5 xl:grid-cols-1 2xl:grid-cols-2">
            {units.map((u) => {
              const st = UNIT_STATUS[u.status]
              const current = reservations.find((r) => r.unitId === u.id && r.status === 'en-casa')
              const next = reservations.filter((r) => r.unitId === u.id && r.checkIn >= T && r.status !== 'en-casa' && r.status !== 'finalizada' && !isBlock(r)).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0]
              const task = cleaningFor(u.id)
              const cleaner = task?.assigneeId ? data.employees[task.assigneeId] : undefined
              const progress = task?.checklist.length ? task.checklist.filter((c) => c.done).length / task.checklist.length : 0
              return (
                <li key={u.id}>
                  <button onClick={() => setSheet(current ? { open: true, id: current.id } : { open: true, unitId: u.id })} className={cx('pressable lift flex h-full w-full flex-col gap-2 rounded-[18px] p-3.5 text-left ring-1 ring-line', TONE[st.tone].soft)}>
                    <span className="flex items-center gap-2">
                      <Dot tone={st.tone} pulse={u.status === 'limpiando'} />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{u.name}</span>
                      <span className={cx('text-xs', TONE[st.tone].ink)}>{st.label}</span>
                    </span>
                    <span className="text-[13px] text-ink-soft">
                      {current ? (
                        <>
                          {current.guestName} · sale {relativeDay(current.checkOut).toLowerCase()}
                        </>
                      ) : next ? (
                        <>
                          Llega {next.guestName.split(' ')[0]} · {relativeDay(next.checkIn).toLowerCase()}
                        </>
                      ) : (
                        'Sin reservas próximas'
                      )}
                    </span>
                    {task && (
                      <span className="flex items-center gap-2">
                        {cleaner && <Avatar name={cleaner.name} tone={cleaner.color} size={22} />}
                        <ProgressBar value={progress} className="flex-1" />
                        <span className="text-[11px] text-detail tabular">{Math.round(progress * 100)}%</span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      </Section>

      {/* ── Saldos por cobrar ── */}
      <Section className="xl:col-span-6">
        <Card className="h-full">
          <CardHeader eyebrow="Cobranza" title="Saldos de hospedaje" subtitle={balances.length ? `${mxn(totalDue)} en los próximos 30 días` : 'Todo cobrado'} icon={<IconBubble tone="butter"><Wallet size={20} strokeWidth={1.6} /></IconBubble>} />
          <ul className="flex flex-col p-3 md:p-4">
            {balances.length === 0 && <Empty kind="pagos" title="Sin saldos pendientes" body="Cuando una reserva tenga saldo, aparece aquí para cobrarlo." />}
            {balances.map((r) => {
              const u = data.units[r.unitId]
              const bal = balanceOf(r)
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line px-2 py-3 last:border-0">
                  {/* Si no cabe todo en un renglón, el saldo y los botones bajan y el nombre conserva su ancho */}
                  <div className="min-w-0 flex-1 basis-48">
                    <button onClick={() => setSheet({ open: true, id: r.id })} className="block truncate text-left text-[15px] font-medium hover:underline">
                      {r.guestName}
                    </button>
                    <span className="block text-[13px] text-ink-soft">
                      {u?.name} · {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)} · <Badge tone={RES_STATUS[r.status].tone}>{RES_STATUS[r.status].label}</Badge>
                    </span>
                  </div>
                  <span className="display-num text-xl">{mxn(bal)}</span>
                  <div className="ml-auto flex gap-1.5">
                    {r.phone && (
                      <a href={waLink(r.phone, balanceText(r))} target="_blank" rel="noreferrer" aria-label={`Recordar saldo a ${r.guestName}`} className="pressable flex h-10 w-10 items-center justify-center rounded-full text-ink-soft ring-1 ring-line-strong ring-inset hover:bg-wash">
                        <MessageCircle size={16} strokeWidth={1.6} />
                      </a>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => setPayFor(r)}>
                      Registrar pago
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      </Section>

      {/* ── Próximos 7 días ── */}
      <Section className="xl:col-span-6">
        <Card className="h-full">
          <CardHeader eyebrow="Semana" title="Próximas reservas" subtitle="Llegadas de los siguientes 7 días" icon={<IconBubble tone="mint"><CalendarRange size={20} strokeWidth={1.6} /></IconBubble>} />
          <ul className="flex flex-col gap-1 p-3 md:p-4">
            {upcoming.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-soft">Sin llegadas en los próximos días.</li>}
            {upcoming.map((r) => {
              const d = new Date(r.checkIn + 'T12:00:00')
              return (
                <li key={r.id}>
                  <button onClick={() => setSheet({ open: true, id: r.id })} className="pressable flex min-h-14 w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left hover:bg-wash">
                    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[14px] bg-sunken">
                      <span className="text-[10px] text-detail uppercase">{fmt(r.checkIn, 'EEE')}</span>
                      <span className="display-num text-lg leading-none">{d.getDate()}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{r.guestName}</span>
                      <span className="block truncate text-[13px] text-ink-soft">
                        {data.units[r.unitId]?.name} · {r.guests} huéspedes · {nights(r.checkIn, r.checkOut)} noches
                      </span>
                    </span>
                    <Badge tone={RES_SOURCE[r.source].tone}>{RES_SOURCE[r.source].label}</Badge>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      </Section>

      {/* ── Canales ── */}
      <Section className="xl:col-span-4">
        <Card className="h-full">
          <CardHeader eyebrow="Canales" title="Airbnb y Booking" subtitle={`${airbnbNext30} reservas de plataformas en 30 días`} icon={<IconBubble tone="rose"><Link2 size={20} strokeWidth={1.6} /></IconBubble>} />
          <ul className="flex flex-col gap-1 p-3 md:p-4">
            {units.map((u) => {
              const connected = !!u.icalImportUrl
              const sync = u.notes?.match(/sincroniz[^\n]*?(\d{1,2} \w+[^\n]*)/i)?.[1]
              return (
                <li key={u.id} className="flex min-h-11 items-center gap-3 rounded-[14px] px-2 py-1.5">
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', connected ? 'bg-success shadow-[0_0_8px_var(--luz)]' : 'bg-line-strong')} />
                  <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                  <span className="text-xs text-detail">{connected ? (sync ? `Sincronizada ${sync}` : 'Calendario conectado') : 'Sin conectar'}</span>
                </li>
              )
            })}
          </ul>
          <div className="px-5 pb-5 md:px-6">
            <Button variant="outline" size="sm" className="w-full" icon={<RefreshCw size={15} strokeWidth={1.6} />} onClick={() => navigate('/hospedaje')}>
              {channelUnits.length ? 'Ver sincronización' : 'Conectar calendarios'}
            </Button>
          </div>
        </Card>
      </Section>

      {/* ── Objetos olvidados ── */}
      <Section className="xl:col-span-8">
        <LostFoundList className="h-full" />
      </Section>

      {/* ── Accesos ── */}
      <Section className="md:col-span-2 xl:col-span-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Hospedaje', sub: 'Calendario de reservas', to: '/hospedaje', icon: CalendarRange },
            { label: 'Limpieza', sub: 'Estado y verificación', to: '/limpieza', icon: Sparkles },
            { label: 'Mapa', sub: 'Ubicar cada casa', to: '/mapa', icon: BedDouble },
            { label: 'Tareas', sub: 'Pendientes del equipo', to: '/tareas', icon: CheckCircle2 },
          ].map((q) => (
            <Link key={q.to} to={q.to} className="card lift pressable flex items-center gap-3 p-4">
              <IconBubble tone="sky" orb size="sm">
                <q.icon size={16} strokeWidth={1.6} />
              </IconBubble>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">{q.label}</span>
                <span className="block truncate text-xs text-detail">{q.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <motion.p variants={fadeRise} transition={{ ease: ease.calma }} className="flex items-center justify-center gap-2 pb-2 text-xs text-ink-3 md:col-span-2 xl:col-span-12">
        <Sparkle className="text-chispa-soft" /> Los cambios se guardan al instante y llegan a limpieza y administración.
      </motion.p>

      <ReservationSheet open={sheet.open} onClose={() => setSheet({ open: false })} reservationId={sheet.id} defaults={sheet.unitId ? { unitId: sheet.unitId, checkIn: T } : { checkIn: T }} />
      <PaySheet res={payFor} balance={payFor ? balanceOf(payFor) : 0} onClose={() => setPayFor(undefined)} />
    </motion.div>
  )
}

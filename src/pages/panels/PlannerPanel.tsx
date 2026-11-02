// Panel propio de la Wedding planner: el próximo evento en una losa noche con la luz,
// la semana conectada por un hilo, seguimientos, cobros, sábados disponibles y embudo.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Armchair, ArrowRight, CalendarHeart, CalendarPlus, Check, ChevronRight, FileSignature, Inbox, MessageCircle, Phone, Store, Users, UsersRound, Wallet } from 'lucide-react'
import type { RanchEvent } from '@/lib/types'
import { db, useCollection, useMe } from '@/lib/store'
import { EVENT_STATUS, LEAD_SOURCE, TONE, VENUE, seesMoney } from '@/lib/meta'
import { addDaysISO, capitalize, compactMxn, daysUntil, fmt, fmtDate, fmtDateLong, greeting, mxn, relativeDay, today, waLink } from '@/lib/format'
import { countdownLabel, eventReadiness, followBucket, isBooked, LEAD_STAGES, PIPELINE, pendingInstallments, upcomingSaturdays, useEventMoney } from '@/lib/planner'
import { fadeRise, stagger } from '@/lib/motion'
import { Badge, Button, Card, CardHeader, Empty, ProgressBar, Stat, cx, toast } from '@/components/ui'
import { CountUp, NightSlab, Sparkle } from '@/components/step1'
import { EventOrb, PaletteDots } from '@/components/events/EventOrb'
import { NewEventSheet } from '@/components/events/NewEventSheet'
import { useOutbox } from '@/components/messages/outbox'
import { OutboxCard } from '@/components/messages/OutboxCard'
import { guestStats } from '@/components/guests/guestUtils'

type AgendaItem = { id: string; date: string; time?: string; kind: 'evento' | 'cobro' | 'seguimiento' | 'tarea'; title: string; sub: string; to: string; done?: boolean }

export default function PlannerPanel() {
  const me = useMe()
  const navigate = useNavigate()
  const money = useEventMoney()
  const showMoney = seesMoney(me?.role)
  const events = useCollection('events')
  const tasks = useCollection('tasks')
  const [newOpen, setNewOpen] = useState<'evento' | 'prospecto' | null>(null)
  const T = today()

  const live = useMemo(() => events.filter((e) => e.status !== 'cancelado'), [events])
  const upcoming = useMemo(() => live.filter((e) => e.date >= T && e.status !== 'realizado').sort((a, b) => a.date.localeCompare(b.date)), [live, T])
  const nextEvent = upcoming.find((e) => isBooked(e)) ?? upcoming[0]
  const leads = useMemo(() => live.filter((e) => LEAD_STAGES.includes(e.status) && e.status !== 'apartado'), [live])
  const followUps = useMemo(
    () =>
      leads
        .filter((e) => {
          const b = followBucket(e, T)
          return b === 'vencido' || b === 'hoy'
        })
        .sort((a, b) => (a.followUpAt ?? '').localeCompare(b.followUpAt ?? '')),
    [leads, T],
  )

  const installments = useMemo(() => {
    const out: { ev: RanchEvent; id: string; label: string; due: string; remaining: number }[] = []
    for (const ev of live.filter((e) => isBooked(e) && e.date >= addDaysISO(T, -1)))
      for (const p of pendingInstallments(ev, money.paid(ev))) if (p.due <= addDaysISO(T, 30)) out.push({ ev, id: p.id, label: p.label, due: p.due, remaining: p.remaining })
    return out.sort((a, b) => a.due.localeCompare(b.due))
  }, [live, money, T])

  const agenda = useMemo(() => {
    const end = addDaysISO(T, 6)
    const items: AgendaItem[] = []
    for (const e of live) if (e.date >= T && e.date <= end) items.push({ id: 'e' + e.id, date: e.date, time: e.startTime, kind: 'evento', title: e.title, sub: `${VENUE[e.venue].label} · ${e.guests} invitados`, to: `/eventos/${e.id}` })
    for (const i of installments) if (i.due >= T && i.due <= end) items.push({ id: 'c' + i.id, date: i.due, kind: 'cobro', title: `${i.label} · ${i.ev.title}`, sub: showMoney ? mxn(i.remaining) : 'Cobro programado', to: `/eventos/${i.ev.id}?tab=pagos` })
    for (const l of leads) if (l.followUpAt && l.followUpAt >= T && l.followUpAt <= end) items.push({ id: 's' + l.id, date: l.followUpAt, kind: 'seguimiento', title: `Seguimiento · ${l.clientName}`, sub: l.title, to: '/prospectos' })
    for (const t of tasks)
      if (t.type === 'evento' && t.due && t.due.slice(0, 10) >= T && t.due.slice(0, 10) <= end)
        items.push({ id: 't' + t.id, date: t.due.slice(0, 10), time: t.due.slice(11, 16), kind: 'tarea', title: t.title, sub: t.checklist.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length} pasos` : 'Tarea del equipo', to: `/tareas?t=${t.id}`, done: t.status === 'hecha' || t.status === 'verificada' })
    return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
  }, [live, installments, leads, tasks, T, showMoney])

  const funnel = useMemo(
    () =>
      PIPELINE.slice(0, 4).map((s) => {
        const list = live.filter((e) => e.status === s && e.date >= T)
        return { status: s, count: list.length, value: list.reduce((n, e) => n + money.total(e), 0) }
      }),
    [live, money, T],
  )
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.value))
  const saturdays = useMemo(() => upcomingSaturdays(live, 8), [live])
  const freeSat = saturdays.filter((s) => !isBooked(s.salon) || !isBooked(s.jardin)).length
  const receivable30 = installments.reduce((n, i) => n + i.remaining, 0)
  const outbox = useOutbox()
  const outboxCount = outbox.reduce((n, i) => n + (i.guests?.length ?? 1), 0)
  const guestEvent = upcoming.find((e) => isBooked(e) && e.guestList.length) ?? upcoming.find((e) => e.guestList.length)
  const gStats = guestEvent ? guestStats(guestEvent.guestList) : null

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* Losa noche: saludo + próximo evento */}
      <motion.div variants={fadeRise}>
        <NightSlab className="px-5 pt-7 pb-8 md:px-10 md:pt-10 md:pb-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:items-end">
            <div>
              <p className="eyebrow !text-on-night-soft">{capitalize(fmtDateLong(T))}</p>
              <h1 className="heading mt-3 text-[clamp(2.3rem,1.8rem+2.4vw,3.8rem)] text-on-night">
                {greeting()}, {me?.name.split(' ')[0]}
              </h1>
              <p className="mt-3 max-w-[40ch] text-[15px] text-on-night-soft">
                {upcoming.length ? `Tienes ${upcoming.length} eventos en agenda` : 'Tu agenda está libre'}
                {followUps.length ? ` y ${followUps.length} ${followUps.length === 1 ? 'seguimiento pendiente' : 'seguimientos pendientes'} hoy.` : '.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button variant="luz" icon={<CalendarPlus size={18} strokeWidth={1.6} />} onClick={() => setNewOpen('evento')}>
                  Nuevo evento
                </Button>
                <HeroLink to="/prospectos" icon={<Inbox size={16} strokeWidth={1.6} />}>
                  Prospectos
                </HeroLink>
                <HeroLink to="/proveedores" icon={<Store size={16} strokeWidth={1.6} />}>
                  Proveedores
                </HeroLink>
              </div>
            </div>
            {nextEvent ? <NextEventCard ev={nextEvent} paidRatio={money.total(nextEvent) ? money.paid(nextEvent) / money.total(nextEvent) : 0} onOpen={() => navigate(`/eventos/${nextEvent.id}`)} /> : (
              <div className="glass rounded-[var(--r-lg)] p-6 text-ink ring-1 ring-line">
                <div className="heading text-2xl">Sin eventos próximos</div>
                <p className="mt-1 text-sm text-ink-soft">Cuando apartes una fecha, aparecerá aquí con su cuenta regresiva.</p>
              </div>
            )}
          </div>
        </NightSlab>
      </motion.div>

      {/* Cifras */}
      <motion.div variants={fadeRise} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Prospectos activos" value={<CountUp value={leads.length} />} sub={`${followUps.length} por atender hoy`} tone="rose" icon={<Inbox size={16} strokeWidth={1.6} />} onClick={() => navigate('/prospectos')} />
        <Stat label="Eventos próximos" value={<CountUp value={upcoming.filter(isBooked).length} />} sub="Apartados y confirmados" tone="lavender" icon={<CalendarHeart size={16} strokeWidth={1.6} />} onClick={() => navigate('/eventos')} />
        {showMoney ? (
          <Stat label="Por cobrar en 30 días" value={<CountUp value={receivable30} format={compactMxn} />} sub={`${installments.length} pagos programados`} tone="butter" icon={<Wallet size={16} strokeWidth={1.6} />} accent />
        ) : (
          <Stat label="Cobros programados" value={installments.length} tone="butter" icon={<Wallet size={16} strokeWidth={1.6} />} />
        )}
        <Stat label="Sábados con lugar libre" value={<CountUp value={freeSat} />} sub="De los próximos 8" tone="sage" icon={<Users size={16} strokeWidth={1.6} />} />
      </motion.div>

      {/* Automatizaciones de hoy + invitados del próximo evento */}
      <motion.div variants={fadeRise} className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card className="h-full">
          <CardHeader
            eyebrow="Automatizaciones de hoy"
            title={outboxCount ? `${outboxCount} ${outboxCount === 1 ? 'mensaje listo' : 'mensajes listos'} para enviar` : 'Nada pendiente por enviar'}
            subtitle="La app los arma sola con pagos, prospectos, invitados y proveedores"
            action={<Link to="/mensajes" className="pressable inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-ink-soft hover:bg-wash hover:text-ink">Ver todos <ChevronRight size={15} strokeWidth={1.6} /></Link>}
          />
          <div className="flex flex-col gap-3 p-4 md:p-5">
            {outbox.length === 0 ? (
              <div className="flex items-center gap-3 rounded-[18px] bg-sunken/60 p-4 text-sm text-ink-soft">
                <Sparkle className="text-chispa-soft" /> Todo enviado por hoy. Te avisaremos cuando algo necesite un mensaje.
              </div>
            ) : (
              outbox.slice(0, 3).map((i) => <OutboxCard key={i.key} item={i} compact />)
            )}
          </div>
        </Card>
        <Card className="h-full">
          <CardHeader eyebrow="Invitados" title={guestEvent ? guestEvent.title : 'Sin listas de invitados'} subtitle={guestEvent ? `${countdownLabel(daysUntil(guestEvent.date))} · ${guestEvent.guestList.length} invitaciones` : 'Importa la lista de la clienta en la estación de invitados'} icon={<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-soft text-sky-ink"><UsersRound size={19} strokeWidth={1.6} /></span>} />
          <div className="p-5 md:p-6">
            {guestEvent && gStats ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-[16px] bg-sunken p-3.5">
                    <div className="text-xs text-ink-soft">Confirmados</div>
                    <div className="display-num mt-1 text-[1.7rem] text-success">{gStats.conf}</div>
                  </div>
                  <div className="rounded-[16px] bg-sunken p-3.5">
                    <div className="text-xs text-ink-soft">Pendientes</div>
                    <div className="display-num mt-1 text-[1.7rem] text-warning">{gStats.pend}</div>
                  </div>
                  <div className="rounded-[16px] bg-sunken p-3.5">
                    <div className="text-xs text-ink-soft">Sin mesa</div>
                    <div className="display-num mt-1 text-[1.7rem]">{gStats.unseated}</div>
                  </div>
                </div>
                <ProgressBar value={gStats.people ? gStats.conf / gStats.people : 0} className="mt-4" />
                <p className="mt-2 text-xs text-ink-soft">{gStats.people ? Math.round((gStats.conf / gStats.people) * 100) : 0}% de las personas ya confirmó</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" variant="tinta" icon={<UsersRound size={16} strokeWidth={1.6} />} onClick={() => navigate(`/invitados?e=${guestEvent.id}`)}>
                    Estación de invitados
                  </Button>
                  <Button size="sm" variant="outline" icon={<Armchair size={16} strokeWidth={1.6} />} onClick={() => navigate(`/invitados?e=${guestEvent.id}&v=mesas`)}>
                    Acomodar mesas
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="outline" icon={<UsersRound size={16} strokeWidth={1.6} />} onClick={() => navigate('/invitados')}>
                Abrir estación de invitados
              </Button>
            )}
          </div>
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* Esta semana: timeline conectada por un hilo */}
        <motion.div variants={fadeRise}>
          <Card className="h-full">
            <CardHeader eyebrow="Próximos 7 días" title="Esta semana" subtitle={agenda.length ? `${agenda.length} cosas en tu agenda` : 'Semana tranquila'} action={<Link to="/eventos" className="pressable rounded-full px-3 py-2 text-sm text-ink-soft hover:bg-wash hover:text-ink">Calendario</Link>} />
            <div className="px-5 pt-4 pb-5 md:px-6">
              {agenda.length === 0 && <Empty title="Nada programado" body="Aprovecha para dar seguimiento a tus prospectos." />}
              <ol className="relative">
                {agenda.length > 1 && <span aria-hidden className="absolute top-3 bottom-3 left-[11px] w-px bg-line-strong" />}
                {agenda.map((it, i) => {
                  const newDay = i === 0 || agenda[i - 1]!.date !== it.date
                  return (
                    <li key={it.id} className="relative">
                      {newDay && <div className="eyebrow mt-3 mb-2 pl-9 first:mt-0">{relativeDay(it.date)} · {fmt(it.date, "d 'de' MMM")}</div>}
                      <Link to={it.to} className="pressable group relative flex items-start gap-3 rounded-[16px] py-2 pr-2 pl-0 hover:bg-wash">
                        <span className={cx('relative z-[1] mt-1.5 ml-[5px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ring-4 ring-surface', it.kind === 'evento' ? 'bg-chispa-soft shadow-[0_0_10px_var(--luz)]' : it.kind === 'cobro' ? 'bg-butter' : it.kind === 'seguimiento' ? 'bg-rose' : 'bg-sky')} />
                        <span className="min-w-0 flex-1 pl-2">
                          <span className="flex items-center gap-2">
                            {it.time && <span className="text-xs text-ink-soft tabular">{it.time}</span>}
                            <span className={cx('truncate font-medium', it.done && 'text-ink-3 line-through')}>{it.title}</span>
                            {it.done && <Sparkle className="text-[10px] text-chispa-soft" />}
                          </span>
                          <span className="block truncate text-xs text-ink-soft">{it.sub}</span>
                        </span>
                        <Badge tone={it.kind === 'evento' ? 'rose' : it.kind === 'cobro' ? 'butter' : it.kind === 'seguimiento' ? 'lavender' : 'sky'} className="shrink-0">
                          {it.kind === 'evento' ? 'Evento' : it.kind === 'cobro' ? 'Cobro' : it.kind === 'seguimiento' ? 'Seguimiento' : 'Tarea'}
                        </Badge>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </div>
          </Card>
        </motion.div>

        {/* Seguimientos */}
        <motion.div variants={fadeRise}>
          <Card className="h-full">
            <CardHeader eyebrow="Prospectos" title="Por atender hoy" subtitle={followUps.length ? 'Contesta primero los vencidos' : 'Todo al día'} action={<Link to="/prospectos" className="pressable inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-ink-soft hover:bg-wash hover:text-ink">Ver todos <ChevronRight size={15} strokeWidth={1.6} /></Link>} />
            <div className="flex flex-col gap-2 p-4 md:p-5">
              {followUps.length === 0 && (
                <div className="flex flex-col items-center py-8 text-center">
                  <Sparkle className="text-2xl text-chispa-soft" />
                  <p className="heading mt-2 text-lg">Sin seguimientos pendientes</p>
                  <p className="text-sm text-ink-soft">Buen trabajo, ya contestaste a todos.</p>
                </div>
              )}
              {followUps.slice(0, 6).map((l) => {
                const late = followBucket(l, T) === 'vencido'
                return (
                  <div key={l.id} className="rounded-[18px] bg-sunken/60 p-3.5">
                    <div className="flex items-start gap-3">
                      <EventOrb type={l.type} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{l.clientName}</div>
                        <div className="truncate text-xs text-ink-soft">
                          {l.title} · {fmtDate(l.date)} · {l.guests} pers.
                        </div>
                      </div>
                      <Badge tone={late ? 'rose' : 'butter'}>{late ? `Hace ${-daysUntil(l.followUpAt!)} d` : 'Hoy'}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {l.phone && (
                        <a href={waLink(l.phone, `Hola ${l.clientName.split(' ')[0]}, soy ${me?.name.split(' ')[0]} de Jardines La Joya. ¿Pudiste revisar la propuesta para ${l.title}? Con gusto resolvemos tus dudas.`)} target="_blank" rel="noopener">
                          <Button size="sm" variant="secondary" icon={<MessageCircle size={15} strokeWidth={1.6} />}>
                            WhatsApp
                          </Button>
                        </a>
                      )}
                      {l.phone && (
                        <a href={`tel:${l.phone}`} aria-label={`Llamar a ${l.clientName}`}>
                          <Button size="icon-sm" variant="outline" aria-label={`Llamar a ${l.clientName}`}>
                            <Phone size={15} strokeWidth={1.6} />
                          </Button>
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Check size={15} strokeWidth={1.6} />}
                        onClick={() => {
                          db.patch('events', l.id, { followUpAt: addDaysISO(T, 3) })
                          toast.success('Seguimiento hecho', `Te lo recordamos el ${fmtDate(addDaysISO(T, 3))}`)
                        }}
                      >
                        Hecho
                      </Button>
                      <Badge tone={LEAD_SOURCE[l.leadSource ?? 'otro'].tone} className="ml-auto self-center">
                        {LEAD_SOURCE[l.leadSource ?? 'otro'].label}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sábados disponibles */}
        <motion.div variants={fadeRise} className="lg:col-span-2">
          <Card>
            <CardHeader eyebrow="Disponibilidad" title="Próximos sábados" subtitle="Toca un lugar libre para apartarlo" />
            <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-4 md:p-5">
              {saturdays.map((s) => (
                <div key={s.date} className="rounded-[18px] bg-sunken/60 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="display-num text-2xl">{fmt(s.date, 'd')}</span>
                    <span className="text-xs text-ink-soft">{fmt(s.date, 'MMM')}</span>
                  </div>
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {(['salon', 'jardin'] as const).map((v) => {
                      const ev = s[v]
                      const booked = isBooked(ev)
                      return booked ? (
                        <Link key={v} to={`/eventos/${ev!.id}`} className="truncate rounded-full bg-surface px-2.5 py-1.5 text-[11px] text-ink-soft ring-1 ring-line hover:text-ink" title={ev!.title}>
                          {VENUE[v].label} · {ev!.title.split(' ').slice(0, 2).join(' ')}
                        </Link>
                      ) : (
                        <button key={v} onClick={() => navigate(`/eventos?nuevo=${v}`)} className={cx('pressable flex h-8 items-center justify-between rounded-full px-2.5 text-[11px]', ev ? 'bg-[color-mix(in_oklab,var(--warning)_12%,var(--surface))] text-warning' : 'bg-[color-mix(in_oklab,var(--success)_12%,var(--surface))] text-success')}>
                          {VENUE[v].label} {ev ? '· cotizado' : 'libre'}
                          <ArrowRight size={12} strokeWidth={1.6} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Embudo */}
        <motion.div variants={fadeRise}>
          <Card className="h-full">
            <CardHeader eyebrow="Ventas" title="Embudo" subtitle="Eventos por venir en cada etapa" />
            <div className="flex flex-col gap-4 p-5 md:p-6">
              {funnel.map((f) => (
                <Link key={f.status} to="/eventos" className="group block">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={cx('h-2 w-2 rounded-full', TONE[EVENT_STATUS[f.status].tone].solid)} />
                      {EVENT_STATUS[f.status].label}
                      <span className="text-ink-3 tabular">{f.count}</span>
                    </span>
                    {showMoney && <span className="tabular text-ink-soft">{compactMxn(f.value)}</span>}
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
                    <motion.div className={cx('h-full rounded-full', TONE[EVENT_STATUS[f.status].tone].solid)} initial={{ width: 0 }} animate={{ width: `${Math.max(4, (f.value / maxFunnel) * 100)}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Cobros próximos */}
      {installments.length > 0 && (
        <motion.div variants={fadeRise}>
          <Card>
            <CardHeader eyebrow="Plan de pagos" title="Cobros de los próximos 30 días" subtitle="Envía recordatorios con un toque" />
            <div className="grid gap-2.5 p-4 sm:grid-cols-2 md:p-5 xl:grid-cols-3">
              {installments.slice(0, 9).map((i) => {
                const late = i.due < T
                return (
                  <div key={i.id} className="flex items-center gap-3 rounded-[18px] bg-sunken/60 p-3.5">
                    <EventOrb type={i.ev.type} size="sm" />
                    <Link to={`/eventos/${i.ev.id}?tab=pagos`} className="min-w-0 flex-1">
                      <div className="truncate font-medium">{i.label}</div>
                      <div className="truncate text-xs text-ink-soft">
                        {i.ev.title} · <span className={late ? 'text-danger' : ''}>{late ? `vencido ${fmtDate(i.due)}` : fmtDate(i.due)}</span>
                      </div>
                    </Link>
                    <div className="text-right">
                      {showMoney && <div className="tabular">{mxn(i.remaining)}</div>}
                      <a href={waLink(i.ev.phone, `Hola ${i.ev.clientName.split(' ')[0]}, te recordamos con cariño el ${i.label.toLowerCase()} de ${i.ev.title} por ${mxn(i.remaining)}. Gracias ✦`)} target="_blank" rel="noopener" className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                        Recordar
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </motion.div>
      )}

      <div className="flex justify-center">
        <Button variant="outline" icon={<FileSignature size={17} strokeWidth={1.6} />} onClick={() => setNewOpen('prospecto')}>
          Registrar un prospecto nuevo
        </Button>
      </div>

      <NewEventSheet open={newOpen !== null} asLead={newOpen === 'prospecto'} onClose={() => setNewOpen(null)} />
    </motion.div>
  )
}

function HeroLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link to={to} className="pressable inline-flex h-12 items-center gap-2 rounded-full px-5 text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_28%,transparent)] hover:bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)]">
      {icon}
      {children}
    </Link>
  )
}

function NextEventCard({ ev, paidRatio, onOpen }: { ev: RanchEvent; paidRatio: number; onOpen: () => void }) {
  const d = daysUntil(ev.date)
  const r = eventReadiness(ev, paidRatio)
  return (
    <div className="glass relative rounded-[var(--r-lg)] p-5 text-ink shadow-[var(--shadow-3)] ring-1 ring-line md:p-6">
      <div className="flex items-start gap-4">
        <EventOrb type={ev.type} size="lg" orb />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Próximo evento</div>
          <div className="heading mt-1 truncate text-[1.6rem]">{ev.title}</div>
          <div className="mt-0.5 text-sm text-ink-soft">
            {capitalize(fmt(ev.date, "EEEE d 'de' MMMM"))} · {VENUE[ev.venue].label} · {ev.guests} invitados
          </div>
        </div>
        <div className="text-right">
          <div className="display-num text-[clamp(2.4rem,2rem+1.5vw,3.4rem)] text-chispa">{d > 1 ? d : ''}</div>
          <div className="text-xs text-ink-soft">{d > 1 ? 'días' : countdownLabel(d)}</div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          ['Checklist', r.checklist],
          ['Pagos', r.payments],
          ['Confirmados', r.guests],
        ].map(([k, v]) => (
          <div key={k as string}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
              <span className="truncate text-ink-soft">{k}</span>
              <span className="tabular">{Math.round((v as number) * 100)}%</span>
            </div>
            <ProgressBar value={v as number} className="mt-1.5" />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        {ev.palette?.length ? <PaletteDots colors={ev.palette} size={24} /> : <span className="text-xs text-ink-soft">{EVENT_STATUS[ev.status].label}</span>}
        <Button size="sm" iconRight={<ArrowRight size={16} strokeWidth={1.6} />} onClick={onOpen}>
          Abrir evento
        </Button>
      </div>
    </div>
  )
}

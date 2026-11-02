// Panel de la Wedding planner: cuatro preguntas en orden — ¿qué hago hoy?, ¿cómo van mis eventos?,
// ¿qué fechas me quedan?, ¿cómo van ventas y cobros? Sin carruseles ni textos cortados.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, CalendarDays, Check, Clock, FileSignature, Heart, MessageCircle, Phone, Send, Wallet } from 'lucide-react'
import type { RanchEvent } from '@/lib/types'
import { db, useCollection, useMe } from '@/lib/store'
import { EVENT_STATUS, EVENT_TYPE, VENUE, seesMoney } from '@/lib/meta'
import { addDaysISO, capitalize, compactMxn, daysUntil, fmt, fmtDate, fmtDateLong, greeting, mxn, today, waLink } from '@/lib/format'
import { followBucket, isBooked, LEAD_STAGES, PIPELINE, pendingInstallments, upcomingSaturdays, useEventMoney } from '@/lib/planner'
import { eventHealth, eventMilestones, nextStep, type HealthPart, type HealthState, type Milestone } from '@/lib/eventHealth'
import { fadeRise, stagger } from '@/lib/motion'
import { Button, PageHeader, cx, toast, useMedia } from '@/components/ui'
import { NightSlab, Sparkle } from '@/components/step1'
import { EventScene, JardinBodaScene } from '@/components/scenes'
import { SwipeRow } from '@/components/interact'
import { NewEventSheet } from '@/components/events/NewEventSheet'
import { useOutbox } from '@/components/messages/outbox'
import { guestStats } from '@/components/guests/guestUtils'

type Kind = 'cobro' | 'lead' | 'evento'
interface DayItem {
  id: string
  kind: Kind
  title: string
  sub: string
  tag: string
  tone: 'bad' | 'warn' | 'info'
  amount?: string
  action: { label: string; href?: string; to?: string }
  /** Hecho real (mueve el seguimiento) o solo para hoy */
  onDone?: () => void
  onSnooze?: () => void
}

const NIGHT: Record<HealthState, string> = {
  ok: 'color-mix(in oklab, var(--success) 45%, var(--on-night))',
  warn: 'color-mix(in oklab, var(--warning) 55%, var(--on-night))',
  bad: 'color-mix(in oklab, var(--danger) 55%, var(--on-night))',
  na: 'color-mix(in oklab, var(--on-night) 22%, transparent)',
}
const DAY: Record<HealthState, string> = { ok: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)', na: 'var(--line-strong)' }
const monogram = (ev: RanchEvent) => {
  const m = ev.title.match(/([A-ZÁÉÍÓÚÑ])\w*\s*&\s*([A-ZÁÉÍÓÚÑ])/)
  if (m) return `${m[1]}&${m[2]}`
  const words = ev.title.replace(/^(Boda|XV años de|Baby shower de|Bautizo de|Cumpleaños \d+ de|Fiesta|Posada|Graduación)\s+/i, '').split(/\s+/)
  return (words[0]?.[0] ?? ev.title[0] ?? '·').toUpperCase()
}

function useDoneToday() {
  const key = `tudia-${today()}`
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(done))
    } catch {
      /* sin almacenamiento: solo dura la sesión */
    }
  }, [done, key])
  return [done, setDone] as const
}

export default function PlannerPanel() {
  const me = useMe()
  const navigate = useNavigate()
  const money = useEventMoney()
  const showMoney = seesMoney(me?.role)
  const events = useCollection('events')
  const outbox = useOutbox()
  const [newOpen, setNewOpen] = useState<null | { lead?: boolean; date?: string; venue?: 'salon' | 'jardin' }>(null)
  const [selId, setSelId] = useState<string>()
  const [filter, setFilter] = useState<'todo' | Kind>('todo')
  const [done, setDone] = useDoneToday()
  const [showAll, setShowAll] = useState(false)
  const T = today()

  const live = useMemo(() => events.filter((e) => e.status !== 'cancelado'), [events])
  const upcoming = useMemo(() => live.filter((e) => e.date >= T && e.status !== 'realizado').sort((a, b) => a.date.localeCompare(b.date)), [live, T])
  const booked = useMemo(() => upcoming.filter(isBooked).slice(0, 6), [upcoming])
  const sel = booked.find((e) => e.id === selId) ?? booked[0]
  const leads = useMemo(() => live.filter((e) => LEAD_STAGES.includes(e.status) && e.status !== 'apartado'), [live])

  const healthOf = (ev: RanchEvent) => eventHealth(ev, money.paid(ev), money.total(ev), T)
  const msOf = (ev: RanchEvent) => eventMilestones(ev, money.paid(ev), money.total(ev), T)

  // ── Tu día: una sola lista por urgencia ──
  const items = useMemo(() => {
    const out: (DayItem & { rank: number })[] = []
    for (const ev of live.filter((e) => isBooked(e) && e.date >= addDaysISO(T, -1)))
      for (const p of pendingInstallments(ev, money.paid(ev)))
        if (p.due <= addDaysISO(T, 3)) {
          const late = p.due < T
          out.push({
            id: 'c' + p.id, kind: 'cobro', rank: late ? 0 : 3,
            title: `${p.label} · ${ev.title}`, sub: `${late ? 'Venció' : 'Vence'} ${p.due === T ? 'hoy' : fmtDate(p.due)} · ${ev.clientName}`,
            tag: late ? 'Vencido' : p.due === T ? 'Hoy' : 'Pronto', tone: late ? 'bad' : 'warn', amount: showMoney ? mxn(p.remaining) : undefined,
            action: { label: 'Recordar', href: waLink(ev.phone, `Hola ${ev.clientName.split(' ')[0]}, te recordamos con cariño el ${p.label.toLowerCase()} de ${ev.title} por ${mxn(p.remaining)}. Gracias ✦`) },
          })
        }
    for (const l of leads) {
      const b = followBucket(l, T)
      if (b !== 'vencido' && b !== 'hoy') continue
      const late = b === 'vencido'
      out.push({
        id: 's' + l.id, kind: 'lead', rank: late ? 1 : 4,
        title: l.clientName, sub: `${l.title} · ${fmtDate(l.date)} · ${l.guests} personas`,
        tag: late ? `Hace ${-daysUntil(l.followUpAt!)} d` : 'Hoy', tone: late ? 'bad' : 'warn',
        action: { label: 'Escribir', href: waLink(l.phone, `Hola ${l.clientName.split(' ')[0]}, soy ${me?.name.split(' ')[0]} de Jardines La Joya. ¿Pudiste revisar la propuesta para ${l.title}? Con gusto resolvemos tus dudas.`) },
        onDone: () => (db.patch('events', l.id, { followUpAt: addDaysISO(T, 3) }), toast.success('Seguimiento hecho', `Te lo recordamos el ${fmtDate(addDaysISO(T, 3))}`)),
        onSnooze: () => (db.patch('events', l.id, { followUpAt: addDaysISO(T, 3) }), toast.info('Pospuesto 3 días', l.clientName)),
      })
    }
    for (const ev of live.filter((e) => isBooked(e) && e.date >= T && daysUntil(e.date) <= 14)) {
      const d = daysUntil(ev.date)
      for (const h of healthOf(ev))
        if (h.state === 'bad' || (h.state === 'warn' && d <= 7)) {
          if (h.key === 'pagos') continue // los cobros ya salen arriba
          const to = h.key === 'mesas' || h.key === 'invitados' ? `/invitados?e=${ev.id}${h.key === 'mesas' ? '&v=mesas' : ''}` : h.key === 'beo' ? `/eventos/${ev.id}?tab=beo` : h.key === 'proveedores' ? `/eventos/${ev.id}?tab=proveedores` : `/eventos/${ev.id}`
          out.push({
            id: `e${ev.id}${h.key}`, kind: 'evento', rank: h.state === 'bad' ? 2 : 5,
            title: `${h.label}: ${h.note}`, sub: `${ev.title} · ${d === 0 ? 'es hoy' : d === 1 ? 'mañana' : `faltan ${d} días`}`,
            tag: d <= 1 ? 'Urgente' : `${d} días`, tone: h.state === 'bad' ? 'bad' : 'warn',
            action: { label: h.key === 'mesas' ? 'Acomodar' : h.key === 'invitados' ? 'Invitados' : 'Abrir', to },
          })
        }
    }
    return out.sort((a, b) => a.rank - b.rank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, leads, money, T, showMoney, me?.name])

  const visible = items.filter((i) => filter === 'todo' || i.kind === filter)
  const ordered = [...visible.filter((i) => !done[i.id]), ...visible.filter((i) => done[i.id])]
  const doneCount = items.filter((i) => done[i.id]).length
  const pending = items.length - doneCount
  const mark = (it: DayItem) => {
    it.onDone?.()
    setDone((d) => ({ ...d, [it.id]: !d[it.id] }))
  }

  // ── Temporada, ventas y cobros ──
  const weekends = useMemo(() => upcomingSaturdays(live, 12), [live])
  const sold = weekends.reduce((n, w) => n + (isBooked(w.salon) ? 1 : 0) + (isBooked(w.jardin) ? 1 : 0), 0)
  const quoting = weekends.reduce((n, w) => n + (w.salon && !isBooked(w.salon) ? 1 : 0) + (w.jardin && !isBooked(w.jardin) ? 1 : 0), 0)
  const funnel = PIPELINE.slice(0, 4).map((s) => {
    const list = live.filter((e) => e.status === s && e.date >= T)
    return { status: s, count: list.length, value: list.reduce((n, e) => n + money.total(e), 0) }
  })
  const inPlay = funnel.slice(0, 2).reduce((n, f) => n + f.value, 0)
  const weeks = useMemo(() => {
    const buckets = Array.from({ length: 6 }, (_, i) => ({ from: addDaysISO(T, i * 7), to: addDaysISO(T, i * 7 + 6), amount: 0 }))
    let overdue = 0
    const rows: { id: string; label: string; due: string; amount: number; late: boolean }[] = []
    for (const ev of live.filter(isBooked))
      for (const p of pendingInstallments(ev, money.paid(ev))) {
        if (p.due < T) overdue += p.remaining
        else {
          const b = buckets.find((x) => p.due >= x.from && p.due <= x.to)
          if (!b) continue
          b.amount += p.remaining
        }
        if (p.due <= addDaysISO(T, 41)) rows.push({ id: p.id, label: `${p.label} · ${ev.title}`, due: p.due, amount: p.remaining, late: p.due < T })
      }
    return { buckets, overdue, rows: rows.sort((a, b) => a.due.localeCompare(b.due)), total: overdue + buckets.reduce((n, b) => n + b.amount, 0) }
  }, [live, money, T])
  const maxBar = Math.max(1, weeks.overdue, ...weeks.buckets.map((b) => b.amount))

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6 md:gap-7">
      <motion.div variants={fadeRise}>
        <PageHeader
          eyebrow={capitalize(fmtDateLong(T))}
          title={`${greeting()}, ${me?.name.split(' ')[0] ?? ''}`}
          subtitle={
            <>
              {pending ? `Tienes ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'} hoy` : 'Tu día está al corriente'}
              {booked.length ? ` · ${booked.length} eventos en agenda` : ''}
              {showMoney && weeks.total ? ` · ${mxn(weeks.total)} por cobrar` : ''}.
            </>
          }
          primary={{ label: 'Nuevo evento', icon: <CalendarDays size={17} strokeWidth={1.6} />, onClick: () => setNewOpen({}) }}
          menu={[
            { label: 'Registrar prospecto', icon: <FileSignature />, onClick: () => setNewOpen({ lead: true }) },
            { label: 'Mensajes listos', icon: <Send />, hint: outbox.length ? `${outbox.length} por enviar` : undefined, onClick: () => navigate('/mensajes') },
          ]}
        />
      </motion.div>

      {sel ? <EventStage ev={sel} health={healthOf(sel)} ms={msOf(sel)} first={sel.id === booked[0]?.id} onOpen={(tab) => navigate(`/eventos/${sel.id}${tab ? `?tab=${tab}` : ''}`)} onGuests={() => navigate(`/invitados?e=${sel.id}`)} /> : (
        <motion.div variants={fadeRise}>
          <NightSlab scene={<JardinBodaScene />} className="px-6 py-10 md:px-10">
            <h2 className="heading text-[clamp(1.8rem,1.4rem+2vw,2.8rem)] text-on-night">Sin eventos apartados</h2>
            <p className="mt-2 max-w-[44ch] text-on-night-soft">Cuando apartes una fecha aparecerá aquí con su cuenta regresiva y su ruta crítica.</p>
          </NightSlab>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Tu día */}
        <motion.section variants={fadeRise} aria-label="Tu día" className="card p-5 md:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Lo que necesita tu atención</p>
              <h2 className="heading mt-1 text-[1.9rem] leading-none">Tu día</h2>
            </div>
            <p className="pb-0.5 text-sm text-ink-soft">
              <b className="text-ink">{doneCount}</b> de {items.length}
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--chispa-soft),var(--primary))] transition-[width] duration-500 ease-[var(--ease-calma)]" style={{ width: `${items.length ? (doneCount / items.length) * 100 : 100}%` }} />
          </div>
          {/* Filtros: cuatro celdas iguales, como un control segmentado de iOS */}
          <div role="group" aria-label="Filtrar" className="mt-4 grid grid-cols-4 gap-1 rounded-[18px] bg-sunken p-1">
            {([['todo', 'Todo'], ['cobro', 'Cobros'], ['lead', 'Prospectos'], ['evento', 'Eventos']] as const).map(([k, l]) => {
              const n = k === 'todo' ? items.length : items.filter((i) => i.kind === k).length
              const on = filter === k
              return (
                <button key={k} onClick={() => setFilter(k)} aria-pressed={on} className={cx('pressable flex min-h-14 min-w-0 flex-col items-center justify-center rounded-[14px] px-1 transition-colors', on ? 'bg-surface text-ink shadow-[var(--shadow-1)]' : 'text-ink-soft')}>
                  <span className="display-num text-[1.15rem] leading-none tabular">{n}</span>
                  <span className="mt-1 text-[12px] leading-none">{l}</span>
                </button>
              )
            })}
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {ordered.length === 0 && (
              <li className="flex flex-col items-center rounded-[18px] bg-sunken/60 px-4 py-8 text-center">
                <Sparkle className="text-2xl text-chispa-soft" />
                <p className="heading mt-2 text-lg">Nada pendiente aquí</p>
                <p className="text-sm text-ink-soft">Buen trabajo: tu día está al corriente.</p>
              </li>
            )}
            {(showAll ? ordered : ordered.slice(0, 6)).map((it, i) => (
              <li key={it.id}>
                <SwipeRow
                  className="!rounded-[18px]"
                  hintKey={i === 0 ? 'tudia' : undefined}
                  left={{ label: done[it.id] ? 'Reabrir' : 'Hecho', icon: <Check />, tone: 'success', onTrigger: () => mark(it) }}
                  right={it.onSnooze ? { label: 'Posponer', icon: <Clock />, tone: 'butter', onTrigger: it.onSnooze } : undefined}
                >
                  <DayRow it={it} done={!!done[it.id]} onToggle={() => mark(it)} />
                </SwipeRow>
              </li>
            ))}
          </ul>
          {ordered.length > 6 && (
            <button onClick={() => setShowAll((v) => !v)} className="pressable mt-3 min-h-11 w-full rounded-full text-sm font-medium ring-1 ring-line-strong ring-inset hover:bg-wash">
              {showAll ? 'Ver menos' : `Ver las ${ordered.length}`}
            </button>
          )}
          <p className="mt-3 text-[13px] leading-snug text-ink-soft">En el celular: desliza a la derecha para marcar hecho y a la izquierda para posponer.</p>
        </motion.section>

        {/* Mis eventos */}
        <motion.section variants={fadeRise} aria-label="Mis eventos" className="card p-4 md:p-5">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <p className="eyebrow">Salud de cada evento</p>
              <h2 className="heading mt-1 text-[1.9rem] leading-none">Mis eventos</h2>
            </div>
            <Link to="/eventos" className="pressable rounded-full px-3 py-2 text-sm text-ink-soft hover:bg-wash hover:text-ink">
              Calendario
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            {booked.length === 0 && <p className="px-2 py-6 text-sm text-ink-soft">Sin eventos apartados todavía.</p>}
            {booked.map((ev) => {
              const on = ev.id === sel?.id
              const h = healthOf(ev)
              const step = nextStep(msOf(ev))
              const d = daysUntil(ev.date)
              return (
                <button key={ev.id} onClick={() => (setSelId(ev.id), window.scrollTo({ top: 0, behavior: 'smooth' }))} aria-pressed={on} className={cx('pressable flex w-full items-center gap-3.5 rounded-[20px] p-3 text-left transition-colors', on ? 'bg-paper ring-2 ring-[color-mix(in_oklab,var(--primary)_45%,transparent)]' : 'hover:bg-wash')}>
                  <span className={cx('heading flex h-12 w-12 shrink-0 items-center justify-center rounded-full italic', on ? 'bg-night text-luz' : 'bg-secondary text-primary', monogram(ev).length > 1 ? 'text-[15px]' : 'text-xl')}>{monogram(ev)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{ev.title}</span>
                    <span className="block text-[13px] text-ink-soft">
                      {fmt(ev.date, "EEE d 'de' MMM")} · {VENUE[ev.venue].label} · {ev.guests} inv.
                    </span>
                    <span className="mt-1.5 flex gap-[3px]" aria-hidden>
                      {h.map((p) => (
                        <span key={p.key} className="h-[5px] flex-1 rounded-full" style={{ background: DAY[p.state] }} />
                      ))}
                    </span>
                    <span className={cx('mt-1 block text-[13px] leading-snug', step.tone === 'bad' ? 'text-danger' : 'text-ink')}>{step.text}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="display-num text-[2rem] leading-none text-primary">{d}</span>
                    <span className="text-xs text-ink-soft">{d === 1 ? 'día' : 'días'}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </motion.section>
      </div>

      {/* La temporada */}
      <motion.section variants={fadeRise} aria-label="La temporada" className="card p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Fines de semana de los próximos 3 meses</p>
            <h2 className="heading mt-1 text-[1.9rem] leading-none">La temporada</h2>
          </div>
          <div className="flex flex-wrap gap-6">
            <Figure value={sold} of={weekends.length * 2} label="fechas vendidas" />
            <Figure value={quoting} label="en negociación" />
            <Figure value={weekends.length * 2 - sold - quoting} label="libres por vender" accent />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-soft">
          <Legend className="bg-primary" label="Vendido" />
          <Legend className="border-[1.5px] border-dashed border-primary" label="Cotizado" />
          <Legend className="bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] ring-1 ring-[color-mix(in_oklab,var(--luz)_80%,var(--ink)_10%)]" label="Libre: tócalo para apartar" />
        </div>
        <div className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
          {weekends.map((w) => (
            <div key={w.date} className="rounded-[18px] bg-sunken/60 p-2.5">
              <div className="flex items-baseline justify-between px-1">
                <span className="display-num text-xl">
                  {fmt(addDaysISO(w.date, -1), 'd')}–{fmt(addDaysISO(w.date, 1), 'd')}
                </span>
                <span className="text-xs text-ink-soft">{fmt(w.date, 'MMM')}</span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {(['salon', 'jardin'] as const).map((v) => {
                  const ev = w[v]
                  const label = VENUE[v].label
                  if (ev && isBooked(ev))
                    return (
                      <Link key={v} to={`/eventos/${ev.id}`} className="pressable rounded-[12px] bg-primary px-2.5 py-2 text-[13px] leading-snug text-on-primary">
                        <span className="block text-[11px] opacity-80">{label}</span>
                        {ev.title}
                      </Link>
                    )
                  if (ev)
                    return (
                      <Link key={v} to={`/eventos/${ev.id}`} className="pressable rounded-[12px] border-[1.5px] border-dashed border-primary px-2.5 py-2 text-[13px] leading-snug text-primary">
                        <span className="block text-[11px] opacity-80">{label} · cotizado</span>
                        {ev.title}
                      </Link>
                    )
                  return (
                    <button key={v} onClick={() => setNewOpen({ date: w.date, venue: v })} className="pressable flex min-h-11 items-center justify-between rounded-[12px] bg-[color-mix(in_oklab,var(--luz)_45%,var(--surface))] px-2.5 text-[13px] text-ink">
                      {label} libre <ArrowRight size={14} strokeWidth={1.6} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Ventas y cobros */}
      <div className="grid gap-6 lg:grid-cols-2">
        <motion.section variants={fadeRise} aria-label="Ventas" className="card p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Ventas</p>
              <h2 className="heading mt-1 text-[1.9rem] leading-none">Embudo</h2>
            </div>
            {showMoney && <Figure value={compactMxn(inPlay)} label="en juego: prospectos y cotizados" />}
          </div>
          <div className="mt-5 flex flex-col items-center gap-2.5">
            {funnel.map((f, i) => (
              <Link key={f.status} to={f.status === 'prospecto' || f.status === 'cotizado' ? '/eventos?vista=prospectos' : '/eventos'} className={cx('pressable flex min-h-12 w-full items-center justify-between gap-3 rounded-[16px] px-4 py-2 text-[15px]', i === 0 ? 'bg-secondary' : i === 1 ? 'bg-[color-mix(in_oklab,var(--primary)_30%,var(--surface))]' : i === 2 ? 'bg-[color-mix(in_oklab,var(--primary)_65%,var(--surface))] text-on-primary' : 'bg-primary text-on-primary')} style={{ width: `${100 - i * 11}%` }}>
                <span className="font-semibold">
                  {EVENT_STATUS[f.status].label} · {f.count}
                </span>
                {showMoney && <span className="tabular">{compactMxn(f.value)}</span>}
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section variants={fadeRise} aria-label="Cobros" className="card p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Plan de pagos</p>
              <h2 className="heading mt-1 text-[1.9rem] leading-none">Cobros, 6 semanas</h2>
            </div>
            {showMoney && <Figure value={compactMxn(weeks.total)} label="por cobrar" accent />}
          </div>
          <div className="mt-5 flex h-36 items-end gap-2 border-b border-line px-1" aria-hidden>
            {[{ label: 'Vencido', amount: weeks.overdue, late: true }, ...weeks.buckets.map((b) => ({ label: fmt(b.from, 'd MMM'), amount: b.amount, late: false }))].map((b) => (
              <div key={b.label} className="flex flex-1 flex-col items-center justify-end gap-1">
                {showMoney && b.amount > 0 && <span className={cx('text-[11px] font-semibold tabular', b.late && 'text-danger')}>{compactMxn(b.amount)}</span>}
                <div className={cx('w-full rounded-t-[8px] rounded-b-[3px]', b.amount ? (b.late ? 'bg-danger' : 'bg-primary') : 'bg-sunken')} style={{ height: b.amount ? `${Math.max(8, (b.amount / maxBar) * 100)}px` : '4px' }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2 px-1 text-center text-[11px] leading-tight text-ink-soft">
            <span className="flex-1 text-danger">Vencido</span>
            {weeks.buckets.map((b) => (
              <span key={b.from} className="flex-1">
                {fmt(b.from, 'd MMM')}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {weeks.rows.length === 0 && <p className="text-sm text-ink-soft">Sin cobros programados en las próximas semanas.</p>}
            {weeks.rows.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-[16px] bg-sunken/60 px-3.5 py-3 text-sm leading-snug">
                <Wallet size={16} strokeWidth={1.6} className={cx('shrink-0', r.late ? 'text-danger' : 'text-primary')} />
                <span className="min-w-0 flex-1">
                  {r.label} <span className={r.late ? 'text-danger' : 'text-ink-soft'}>· {r.late ? `venció ${fmtDate(r.due)}` : fmtDate(r.due)}</span>
                </span>
                {showMoney && <b className="tabular">{mxn(r.amount)}</b>}
              </div>
            ))}
          </div>
        </motion.section>
      </div>

      <NewEventSheet open={newOpen !== null} asLead={newOpen?.lead} initialDate={newOpen?.date} initialVenue={newOpen?.venue} onClose={() => setNewOpen(null)} />
    </motion.div>
  )
}

function Figure({ value, of, label, accent }: { value: ReactNode; of?: number; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={cx('display-num text-[2.2rem] leading-none', accent && 'text-chispa')}>
        {value}
        {of !== undefined && <span className="text-lg text-ink-soft"> / {of}</span>}
      </div>
      <div className="mt-1 text-[13px] text-ink-soft">{label}</div>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cx('h-3.5 w-3.5 shrink-0 rounded-[5px]', className)} />
      {label}
    </span>
  )
}

function DayRow({ it, done, onToggle }: { it: DayItem; done: boolean; onToggle: () => void }) {
  const Icon = it.kind === 'cobro' ? Wallet : it.kind === 'lead' ? Heart : CalendarDays
  const ActIcon = it.kind === 'lead' ? MessageCircle : it.kind === 'cobro' ? Phone : ArrowRight
  const tag = done ? 'bg-[color-mix(in_oklab,var(--success)_16%,var(--surface))] text-success' : it.tone === 'bad' ? 'bg-[color-mix(in_oklab,var(--danger)_14%,var(--surface))] text-danger' : it.tone === 'warn' ? 'bg-[color-mix(in_oklab,var(--warning)_16%,var(--surface))] text-warning' : 'bg-sunken text-ink-soft'
  const actionCls = cx('pressable inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold max-sm:w-11 sm:px-4', it.kind === 'cobro' ? 'bg-primary text-on-primary' : 'text-ink ring-1 ring-line-strong ring-inset hover:bg-wash')
  const actionInner = (
    <>
      <ActIcon size={17} strokeWidth={1.7} />
      <span className="max-sm:sr-only">{it.action.label}</span>
    </>
  )
  // Renglón tipo lista de iOS / Material 3: ícono · título y apoyo · acciones al final, siempre en la misma posición
  return (
    <div className={cx('flex items-center gap-3 rounded-[18px] bg-surface py-3 pr-2.5 pl-3 ring-1 ring-line transition-opacity', done && 'opacity-55')}>
      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-[12px]', it.kind === 'cobro' ? 'bg-[color-mix(in_oklab,var(--danger)_14%,var(--surface))] text-danger' : it.kind === 'lead' ? 'bg-secondary text-primary' : 'bg-sunken text-ink')}>
        <Icon size={18} strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[15px] font-semibold leading-snug', done && 'line-through')}>{it.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug text-ink-soft">
          <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', tag)}>{done ? 'Hecho' : it.tag}</span>
          {it.amount && <b className="text-ink tabular">{it.amount}</b>}
          <span>{it.sub}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {!done &&
          (it.action.href ? (
            <a href={it.action.href} target="_blank" rel="noopener" aria-label={it.action.label} className={actionCls}>
              {actionInner}
            </a>
          ) : (
            <Link to={it.action.to!} aria-label={it.action.label} className={actionCls}>
              {actionInner}
            </Link>
          ))}
        <button onClick={onToggle} aria-pressed={done} aria-label={done ? `Reabrir ${it.title}` : `Marcar hecho ${it.title}`} className={cx('pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full', done ? 'bg-success text-paper' : 'text-ink-3 ring-[1.5px] ring-line-strong ring-inset hover:text-success')}>
          <Check size={18} strokeWidth={2} />
        </button>
      </span>
    </div>
  )
}

/** Losa noche: el evento en escena con cuenta regresiva, anillo de salud y ruta crítica */
function EventStage({ ev, health, ms, first, onOpen, onGuests }: { ev: RanchEvent; health: HealthPart[]; ms: Milestone[]; first: boolean; onOpen: (tab?: string) => void; onGuests: () => void }) {
  const d = daysUntil(ev.date)
  const ok = health.filter((h) => h.state === 'ok').length
  const step = nextStep(ms)
  const C = 2 * Math.PI * 52
  const seg = C / 6
  const doneIdx = ms.reduce((n, m, i) => (m.state === 'done' ? i : n), -1)
  const isPhone = useMedia('(max-width: 639px)')
  const [allSteps, setAllSteps] = useState(false)
  const focusIdx = Math.max(0, ms.findIndex((m) => m.state === 'late' || m.state === 'now'))
  const shown = isPhone && !allSteps ? ms.slice(Math.max(0, focusIdx - 1), focusIdx + 3) : ms
  const stats = guestStats(ev.guestList)
  return (
    <motion.div variants={fadeRise} key={ev.id}>
      <NightSlab horizon={!isPhone} scene={<EventScene type={ev.type} />} className="px-5 pt-7 pb-2 md:px-10 md:pt-10" luzSize="clamp(64px, 11vw, 140px)" luzClassName="absolute -top-6 right-[6%]">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="min-w-0 flex-[1_1_420px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow !text-on-night-soft">{first ? 'Próximo evento' : 'Evento en escena'}</span>
              <span className="rounded-full bg-[color-mix(in_oklab,var(--on-night)_12%,transparent)] px-3 py-1 text-xs text-on-night">{EVENT_STATUS[ev.status].label}</span>
              <span className="rounded-full bg-[color-mix(in_oklab,var(--on-night)_12%,transparent)] px-3 py-1 text-xs text-on-night">{EVENT_TYPE[ev.type].label}</span>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <span className="heading hidden h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--luz)_35%,transparent)] bg-[color-mix(in_oklab,var(--on-night)_8%,transparent)] text-2xl text-luz italic sm:flex">{monogram(ev)}</span>
              <h2 className="heading text-[clamp(2rem,1.5rem+2.6vw,3.8rem)] leading-[1.02] text-on-night">{ev.title}</h2>
            </div>
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-on-night-soft">
              <span>{capitalize(fmt(ev.date, "EEEE d 'de' MMMM"))}</span>
              <span>
                {ev.startTime} – {ev.endTime}
              </span>
              <span>{VENUE[ev.venue].label}</span>
              <span>{ev.guests} invitados</span>
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="luz" iconRight={<ArrowRight size={17} strokeWidth={1.6} />} onClick={() => onOpen()}>
                Abrir evento
              </Button>
              <NightBtn onClick={() => onOpen('plano')}>Plano de mesas</NightBtn>
              <NightBtn onClick={onGuests}>Invitados{stats.invites ? ` · ${stats.conf} conf.` : ''}</NightBtn>
              <NightBtn onClick={() => onOpen('programa')}>Programa del día</NightBtn>
            </div>
            <div className="mt-6 grid max-w-[640px] gap-x-5 gap-y-3 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
              {health.map((h) => (
                <div key={h.key} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={h.state === 'na' ? { boxShadow: `inset 0 0 0 1.5px ${NIGHT.na}` } : { background: NIGHT[h.state] }} />
                  <span className="leading-snug">
                    <span className="block text-[13px] text-on-night">{h.label}</span>
                    <span className="block text-[13px] text-on-night-soft">{h.note}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-7">
            <div className="text-right">
              <div className="display-num text-[clamp(6rem,4rem+8vw,12rem)] leading-[0.78] font-light text-luz">{d}</div>
              <div className="mt-3 text-sm text-on-night-soft">{d === 1 ? 'día para el evento' : d === 0 ? 'es hoy' : 'días para el evento'}</div>
            </div>
            <div className="relative h-[124px] w-[124px] shrink-0">
              <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90" role="img" aria-label={`Salud del evento: ${ok} de 6 en orden`}>
                {health.map((h, i) => (
                  <circle key={h.key} cx="66" cy="66" r="52" fill="none" strokeWidth="9" strokeLinecap="round" stroke={NIGHT[h.state]} strokeDasharray={`${seg - 10} ${C - seg + 10}`} strokeDashoffset={-i * seg} />
                ))}
              </svg>
              <span className="absolute inset-0 flex flex-col items-center justify-center text-on-night">
                <span className="display-num text-[2rem] leading-none">
                  {ok}
                  <span className="text-base text-on-night-soft">/6</span>
                </span>
                <span className="mt-1 text-[11px] tracking-[0.08em] text-on-night-soft uppercase">en orden</span>
              </span>
            </div>
          </div>
        </div>

        {/* Ruta crítica: un hilo con los pasos clave */}
        <div className="relative mt-9 pb-6 sm:pb-36 md:pb-44">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="eyebrow !text-on-night-soft">Ruta crítica</span>
            <span className={cx('text-sm', step.tone === 'bad' ? 'text-[color:var(--danger)] [color:color-mix(in_oklab,var(--danger)_55%,var(--on-night))]' : 'text-luz')}>{step.text}</span>
          </div>
          <ol className="relative mt-5 grid gap-x-2 gap-y-5 [grid-template-columns:repeat(auto-fit,minmax(96px,1fr))]">
            <span aria-hidden className="absolute top-[9px] right-2 left-2 hidden h-px bg-[color-mix(in_oklab,var(--on-night)_20%,transparent)] md:block" />
            <span aria-hidden className="absolute top-[9px] left-2 hidden h-px bg-[linear-gradient(90deg,color-mix(in_oklab,var(--luz)_40%,transparent),var(--luz))] md:block" style={{ width: `calc(${doneIdx < 0 ? 0 : ((doneIdx + 0.5) / ms.length) * 100}% - 8px)` }} />
            {shown.map((m) => (
              <li key={m.key} className="relative flex flex-col gap-2.5">
                <span
                  className={cx('h-[19px] w-[19px] rounded-full ring-[5px] ring-night', m.state === 'done' ? 'bg-luz' : m.state === 'late' ? 'bg-[color-mix(in_oklab,var(--danger)_55%,var(--on-night))]' : m.state === 'now' ? 'border-2 border-luz bg-night shadow-[0_0_18px_4px_color-mix(in_oklab,var(--luz)_55%,transparent)]' : 'border-[1.5px] border-[color-mix(in_oklab,var(--on-night)_35%,transparent)] bg-night')}
                />
                <span className="pr-1 leading-snug hyphens-auto [overflow-wrap:break-word]">
                  <span className="block text-[13px] font-medium text-on-night">{m.label}</span>
                  <span className={cx('block text-[13px]', m.state === 'late' ? 'text-[color:color-mix(in_oklab,var(--danger)_55%,var(--on-night))]' : m.state === 'now' ? 'text-luz' : 'text-on-night-soft')}>{m.note}</span>
                </span>
              </li>
            ))}
          </ol>
          {isPhone && ms.length > shown.length && (
            <button onClick={() => setAllSteps(true)} className="pressable mt-4 min-h-11 rounded-full px-4 text-sm text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_28%,transparent)] ring-inset">
              Ver los {ms.length} pasos
            </button>
          )}
        </div>
      </NightSlab>
    </motion.div>
  )
}

function NightBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pressable inline-flex min-h-12 items-center rounded-full px-5 text-[15px] text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_28%,transparent)] ring-inset hover:bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)]">
      {children}
    </button>
  )
}

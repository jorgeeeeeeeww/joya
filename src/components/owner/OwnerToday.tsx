// Panel del dueño: lo que pasó hoy (quién hizo qué), el dinero de la semana y la ocupación de los próximos 7 días.
// Reemplaza a la "línea del día": aquí la idea es que el dueño esté enterado de casi todo de un vistazo.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BedDouble, CalendarHeart, CheckCircle2, LogIn, Receipt, Sparkles, Wrench, type LucideIcon } from 'lucide-react'
import type { DataState, Settings } from '@/lib/types'
import { addDaysISO, fmt, fmtDate, mxn, today } from '@/lib/format'
import { pendingInstallments } from '@/lib/planner'
import { Card, CardHeader, cx } from '@/components/ui'

type Item = { id: string; at: string; who?: string; icon: LucideIcon; text: string; to?: string; tone: string }

const isToday = (iso?: string) => !!iso && iso.slice(0, 10) === today()

/** Lo que pasó hoy, en palabras: pagos, limpiezas, reservas, eventos e incidencias */
export function ActivityToday({ data }: { data: DataState }) {
  const items = useMemo(() => {
    const name = (id?: string) => (id ? data.employees[id]?.name.split(' ')[0] : undefined)
    const out: Item[] = []
    for (const p of Object.values(data.payments)) {
      if (p.deleted || !isToday(p.createdAt)) continue
      const ref = p.refType === 'evento' ? data.events[p.refId]?.title : data.reservations[p.refId]?.guestName
      out.push({ id: p.id, at: p.createdAt, who: name(p.receivedBy ?? p.updatedBy), icon: Receipt, tone: 'text-success', text: `registró un pago de ${mxn(p.amount)}${ref ? ` · ${ref}` : ''}`, to: p.refType === 'evento' ? `/eventos/${p.refId}?tab=pagos` : `/hospedaje?r=${p.refId}` })
    }
    for (const t of Object.values(data.tasks)) {
      if (t.deleted) continue
      if ((t.status === 'hecha' || t.status === 'verificada') && isToday(t.completedAt))
        out.push({ id: 'h' + t.id, at: t.completedAt!, who: name(t.assigneeId), icon: t.type === 'limpieza' ? Sparkles : CheckCircle2, tone: 'text-info', text: `terminó ${t.title.replace('Limpieza · ', 'la limpieza de ')}`, to: `/tareas?t=${t.id}` })
      if (t.type === 'mantenimiento' && isToday(t.createdAt) && !t.automated)
        out.push({ id: 'm' + t.id, at: t.createdAt, who: name(t.createdById), icon: Wrench, tone: 'text-warning', text: `reportó: ${t.title}`, to: `/tareas?t=${t.id}` })
    }
    for (const r of Object.values(data.reservations)) {
      if (r.deleted || !isToday(r.createdAt) || r.guests === 0) continue
      out.push({ id: r.id, at: r.createdAt, who: name(r.updatedBy), icon: BedDouble, tone: 'text-ink-soft', text: `apartó ${data.units[r.unitId]?.name ?? 'una casa'} para ${r.guestName.split(' ')[0]} (${fmtDate(r.checkIn)})`, to: `/hospedaje?r=${r.id}` })
      if (r.status === 'en-casa' && isToday(r.updatedAt) && r.checkIn === today())
        out.push({ id: 'in' + r.id, at: r.updatedAt, who: name(r.updatedBy), icon: LogIn, tone: 'text-ink-soft', text: `recibió a ${r.guestName.split(' ')[0]} en ${data.units[r.unitId]?.name ?? ''}`, to: `/hospedaje?r=${r.id}` })
    }
    for (const e of Object.values(data.events)) {
      if (e.deleted || !isToday(e.createdAt)) continue
      out.push({ id: e.id, at: e.createdAt, who: name(e.coordinatorId ?? e.updatedBy), icon: CalendarHeart, tone: 'text-ink-soft', text: `agendó ${e.title} (${fmtDate(e.date)})`, to: `/eventos/${e.id}` })
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)
  }, [data])

  return (
    <Card className="h-full">
      <CardHeader eyebrow="En vivo" title="Lo que pasó hoy" subtitle="Quién hizo qué en el rancho, al momento" action={<Link to="/ajustes?tab=bitacora" className="pressable inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink">Todo <ArrowRight size={15} strokeWidth={1.6} /></Link>} />
      {items.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-ink-soft md:px-6">Todavía no hay movimientos hoy. Aquí verás pagos, limpiezas terminadas, reservas nuevas e incidencias en cuanto pasen.</p>
      ) : (
        <ul className="flex flex-col px-3 pb-4 md:px-4">
          {items.map((it) => {
            const Icon = it.icon
            const body = (
              <>
                <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken', it.tone)}>
                  <Icon size={16} strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1 text-[14px] leading-snug">
                  {it.who ? (
                    <>
                      <span className="font-semibold">{it.who}</span> {it.text}
                    </>
                  ) : (
                    // Sin saber quién: "Se registró un pago…", "Se terminó la limpieza…"
                    `Se ${it.text}`
                  )}
                </span>
                <span className="shrink-0 text-xs text-ink-3 tabular">{fmt(it.at, 'HH:mm')}</span>
              </>
            )
            return (
              <li key={it.id}>
                {it.to ? (
                  <Link to={it.to} className="pressable flex min-h-12 items-start gap-3 rounded-[14px] px-2 py-2 hover:bg-wash">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-2 py-2">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** Dinero de la semana: cobrado y lo que viene o ya se pasó */
export function MoneyWeek({ data }: { data: DataState }) {
  const m = useMemo(() => {
    const T = today()
    const in7 = addDaysISO(T, 7)
    const pays = Object.values(data.payments).filter((p) => !p.deleted)
    const today$ = pays.filter((p) => p.date === T).reduce((n, p) => n + p.amount, 0)
    const week$ = pays.filter((p) => p.date > addDaysISO(T, -7) && p.date <= T).reduce((n, p) => n + p.amount, 0)
    let soon = 0
    let late = 0
    const lateList: { id: string; label: string; amount: number }[] = []
    for (const e of Object.values(data.events)) {
      if (e.deleted || e.status === 'cancelado') continue
      const paid = pays.filter((p) => p.refId === e.id).reduce((n, p) => n + p.amount, 0)
      for (const inst of pendingInstallments(e, paid)) {
        if (inst.due < T) {
          late += inst.remaining
          lateList.push({ id: e.id, label: e.title, amount: inst.remaining })
        } else if (inst.due <= in7) soon += inst.remaining
      }
    }
    return { today$, week$, soon, late, lateList: lateList.sort((a, b) => b.amount - a.amount).slice(0, 3) }
  }, [data])

  const cell = (label: string, value: number, tone = '') => (
    <div className="rounded-[16px] bg-sunken/60 p-3.5">
      <div className="text-xs text-detail">{label}</div>
      <div className={cx('display-num mt-1 text-[1.5rem] leading-none', tone)}>{mxn(value)}</div>
    </div>
  )
  return (
    <Card className="h-full">
      <CardHeader eyebrow="Dinero" title="Cómo va la semana" subtitle="Lo cobrado y lo que falta cobrar" action={<Link to="/finanzas" className="pressable inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink">Finanzas <ArrowRight size={15} strokeWidth={1.6} /></Link>} />
      <div className="grid grid-cols-2 gap-2.5 px-5 pb-4 md:px-6">
        {cell('Cobrado hoy', m.today$)}
        {cell('Cobrado en 7 días', m.week$)}
        {cell('Por cobrar en 7 días', m.soon)}
        {cell('Pagos vencidos', m.late, m.late ? 'text-danger' : '')}
      </div>
      {m.lateList.length > 0 && (
        <ul className="px-5 pb-5 md:px-6">
          {m.lateList.map((l) => (
            <li key={l.id}>
              <Link to={`/eventos/${l.id}?tab=pagos`} className="pressable flex min-h-11 items-center justify-between gap-3 rounded-[12px] px-2 text-sm hover:bg-wash">
                <span className="min-w-0">{l.label}</span>
                <span className="shrink-0 text-danger tabular">{mxn(l.amount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Ocupación de los próximos 7 días: casas ocupadas y eventos por día; los huecos son lo que se puede vender */
export function Occupancy7({ data }: { data: DataState; settings?: Settings }) {
  const [sel, setSel] = useState(0)
  const days = useMemo(() => {
    const units = Object.values(data.units).filter((u) => !u.deleted)
    const res = Object.values(data.reservations).filter((r) => !r.deleted && r.status !== 'cancelada' && r.guests > 0)
    const evs = Object.values(data.events).filter((e) => !e.deleted && e.status !== 'cancelado')
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDaysISO(today(), i)
      const busy = new Set(res.filter((r) => r.checkIn <= d && r.checkOut > d).map((r) => r.unitId)).size
      return { d, busy, total: units.length, events: evs.filter((e) => e.date === d) }
    })
  }, [data])

  return (
    <Card className="h-full">
      <CardHeader eyebrow="Próximos 7 días" title="Ocupación" subtitle="Casas ocupadas y eventos de cada día. Lo vacío se puede vender." action={<Link to="/hospedaje" className="pressable inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm text-ink-soft hover:bg-wash hover:text-ink">Hospedaje <ArrowRight size={15} strokeWidth={1.6} /></Link>} />
      <div className="grid grid-cols-7 gap-1 px-3 pb-3 md:gap-2 md:px-5" onPointerLeave={() => setSel(0)}>
        {days.map((x, i) => {
          const free = x.total - x.busy
          const full = x.total > 0 && free === 0
          const label = i === 0 ? 'Hoy' : fmt(x.d, 'EEE').replace('.', '').slice(0, 3)
          return (
            <Link
              key={x.d}
              to={`/hospedaje?d=${x.d}`}
              onPointerEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              className={cx(
                'pressable flex min-w-0 flex-col items-center gap-2 rounded-[16px] px-0.5 pb-2.5 pt-2.5 transition-colors hover:bg-wash',
                i === 0 && 'bg-wash ring-1 ring-line',
                sel === i && i !== 0 && 'bg-wash',
              )}
              aria-label={`${fmtDate(x.d)}: ${x.busy} de ${x.total} casas ocupadas${x.events.length ? `, ${x.events.length} evento` : ''}`}
            >
              <span className={cx('text-[12px] capitalize', i === 0 ? 'font-semibold text-key' : 'text-ink-soft')}>{label}</span>
              {/* una celda por casa: terracota = ocupada, hueco punteado = libre */}
              <span className="flex h-28 w-full max-w-9 flex-col-reverse gap-[3px]" aria-hidden>
                {Array.from({ length: x.total }, (_, k) => (
                  <span
                    key={k}
                    className={cx(
                      'min-h-[4px] flex-1 rounded-[6px] transition-colors duration-[var(--dur-4)]',
                      k < x.busy ? (full ? 'bg-chispa' : 'bg-chispa/60') : 'border border-dashed border-sage/45 bg-sage-soft/50',
                    )}
                  />
                ))}
              </span>
              <span className="tabular leading-none">
                <span className={cx('text-[17px] font-semibold', full ? 'text-key' : 'text-ink')}>{x.busy}</span>
                <span className="text-[11px] text-detail">/{x.total}</span>
              </span>
              <span className={cx('inline-flex h-5 items-center justify-center gap-0.5 rounded-full px-1.5 text-[10px] font-medium', x.events.length ? 'bg-chispa-soft/30 text-key' : 'invisible')} title={x.events.map((e) => e.title).join(', ')}>
                <CalendarHeart size={11} strokeWidth={1.8} />
                {x.events.length > 1 ? x.events.length : <span className="hidden md:inline">Evento</span>}
              </span>
            </Link>
          )
        })}
      </div>
      <p className="px-5 pb-4 text-sm leading-snug text-ink-soft md:px-6" aria-live="polite">
        <span className="font-semibold text-ink capitalize">{sel === 0 ? 'Hoy' : fmtDate(days[sel].d)}</span>
        <span className="text-detail"> · </span>
        {days[sel].total - days[sel].busy === 0 ? 'todo ocupado' : `${days[sel].total - days[sel].busy} ${days[sel].total - days[sel].busy === 1 ? 'casa libre' : 'casas libres'}`}
        {days[sel].events.length > 0 && <span className="text-key"> · {days[sel].events.map((e) => e.title).join(', ')}</span>}
      </p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-5 text-xs text-detail md:px-6">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-chispa/60" />Casa ocupada</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed border-sage/60 bg-sage-soft/50" />Libre, se puede vender</span>
        <span className="inline-flex items-center gap-1.5"><CalendarHeart size={12} strokeWidth={1.8} className="text-key" />Evento en el salón o el jardín</span>
      </p>
    </Card>
  )
}


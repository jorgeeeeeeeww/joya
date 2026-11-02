// Panorama del dueño: todo lo que hay que saber del negocio en una sola vista.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, BedDouble, FileText, Lock, Package, Repeat, TrendingUp, Wallet, Wrench } from 'lucide-react'
import { useStore } from '@/lib/store'
import { EVENT_TYPE, TONE, UNIT_STATUS } from '@/lib/meta'
import { compactMxn, fmt, fmtDate, mxn, pct } from '@/lib/format'
import { ease } from '@/lib/motion'
import { BarChart } from '@/components/charts'
import { Badge, Button, Card, CardHeader, cx, Estela, Field, IconBubble, ProgressBar, Select, Sheet, Textarea } from '@/components/ui'
import { CountUp, Sparkle } from '@/components/step1'
import { printHtml } from '@/components/floorplan/FloorPlanEditor'
import { cashflow4w, expectedInflows, monthOptions, monthProfit, monthReportHtml, projectionBuckets, quarterEvents, returningGuests, unitProfitability, weeklyProjection } from './ownerMetrics'

/** Botón + hoja para generar el reporte mensual imprimible */
export function MonthReportButton({ variant = 'tinta' as 'tinta' | 'outline' }) {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const months = useMemo(() => monthOptions(6), [])
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(months[0]!.key)
  const [notes, setNotes] = useState('')
  return (
    <>
      <Button variant={variant} size="sm" icon={<FileText size={16} strokeWidth={1.6} />} onClick={() => setOpen(true)}>
        Reporte del mes
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Reporte del mes"
        subtitle="Resumen ejecutivo listo para imprimir o guardar en PDF"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="tinta"
              icon={<FileText size={17} strokeWidth={1.6} />}
              onClick={() => {
                printHtml(`Reporte ${key} · ${settings.ranchName}`, monthReportHtml(data, settings, key, notes))
                setOpen(false)
              }}
            >
              Generar e imprimir
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <Field label="Mes">
            <Select value={key} onChange={(e) => setKey(e.target.value)}>
              {months.map((m) => (
                <option key={m.key} value={m.key} className="capitalize">
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notas del mes (opcional)" hint="Aparecen al final del reporte: decisiones, pendientes, ideas.">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Se pintó el salón; subir tarifa de fin de semana en diciembre." />
          </Field>
          <ul className="rounded-[var(--r-md)] bg-sunken p-4 text-sm text-ink-soft">
            {['Ingresos por línea y gastos por categoría', 'Utilidad y margen', 'Ocupación, tarifa promedio y RevPAR por unidad', 'Reservas por canal y eventos del mes', 'Incidencias de mantenimiento'].map((t) => (
              <li key={t} className="flex items-center gap-2 py-0.5">
                <Sparkle className="text-[10px] text-chispa-soft" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  )
}

/** Proyección de cobros a 30/60/90 días con gráfica semanal (se usa también en Finanzas) */
export function ProjectionCard({ className }: { className?: string }) {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const inflows = useMemo(() => expectedInflows(data, settings, 90), [data, settings])
  const buckets = projectionBuckets(inflows)
  const weekly = useMemo(() => weeklyProjection(inflows, 12), [inflows])
  const next = inflows.slice(0, 5)
  return (
    <Card className={className}>
      <CardHeader eyebrow="Proyección" title="Lo que viene en caja" subtitle="Cobros pendientes de eventos apartados y confirmados, y de reservas futuras" icon={<IconBubble tone="sage"><TrendingUp size={20} strokeWidth={1.6} /></IconBubble>} />
      <div className="p-5 pt-4 md:p-6 md:pt-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '30 días', v: buckets.d30 },
            { label: '60 días', v: buckets.d60 },
            { label: '90 días', v: buckets.d90 },
          ].map((b, i) => (
            <div key={b.label} className={cx('rounded-[var(--r-md)] p-4', i === 0 ? 'bg-[color-mix(in_oklab,var(--luz)_32%,var(--surface))]' : 'bg-sunken')}>
              <div className="text-xs text-ink-soft">Próximos {b.label}</div>
              <div className="display-num mt-1.5 text-[1.7rem] sm:text-[2rem]">
                <CountUp value={b.v} format={compactMxn} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <BarChart
            data={weekly}
            height={190}
            series={[
              { key: 'eventos', label: 'Eventos', tone: 'rose' },
              { key: 'hospedaje', label: 'Hospedaje', tone: 'sky' },
            ]}
          />
        </div>
        {next.length > 0 && (
          <>
            <Estela className="my-4" />
            <div className="eyebrow mb-2">Siguientes cobros</div>
            <ul className="flex flex-col">
              {next.map((i) => (
                <li key={i.refId + i.label} className="flex items-center gap-3 border-b border-line py-2.5 text-sm last:border-0">
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', i.kind === 'evento' ? 'bg-rose' : 'bg-sky')} />
                  <span className="w-16 shrink-0 text-xs text-ink-soft tabular">{fmtDate(i.date)}</span>
                  <Link to={i.kind === 'evento' ? `/eventos/${i.refId}` : `/hospedaje?r=${i.refId}`} className="min-w-0 flex-1 truncate hover:underline">
                    {i.label}
                  </Link>
                  <span className="shrink-0 font-medium tabular">{mxn(i.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  )
}

/** Flujo de caja estimado de las próximas 4 semanas */
export function CashflowCard({ className }: { className?: string }) {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const weeks = useMemo(() => cashflow4w(data, settings), [data, settings])
  const max = Math.max(1, ...weeks.flatMap((w) => [w.income, w.out]))
  const total = weeks.reduce((n, w) => n + w.net, 0)
  return (
    <Card className={className}>
      <CardHeader eyebrow="Flujo de caja" title="Próximas 4 semanas" subtitle="Cobros esperados contra el gasto semanal promedio" icon={<IconBubble tone="butter"><Wallet size={20} strokeWidth={1.6} /></IconBubble>} />
      <div className="p-5 pt-4 md:p-6 md:pt-4">
        <ul className="flex flex-col gap-4">
          {weeks.map((w, i) => (
            <li key={w.from}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span>{w.label}</span>
                <span className={cx('font-medium tabular', w.net < 0 ? 'text-danger' : 'text-success')}>
                  {w.net >= 0 ? '+' : ''}
                  {compactMxn(w.net)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="h-2 overflow-hidden rounded-full bg-sunken">
                  <motion.div className="h-full rounded-full bg-success" initial={{ width: 0 }} animate={{ width: `${(w.income / max) * 100}%` }} transition={{ duration: 0.6, ease: ease.calma, delay: i * 0.06 }} />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sunken">
                  <motion.div className="h-full rounded-full bg-chispa-soft" initial={{ width: 0 }} animate={{ width: `${(w.out / max) * 100}%` }} transition={{ duration: 0.6, ease: ease.calma, delay: i * 0.06 + 0.04 }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" /> Entra
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-chispa-soft" /> Sale (promedio)
          </span>
          <span className="ml-auto text-sm text-ink">
            Neto 4 semanas: <span className={cx('font-medium tabular', total < 0 ? 'text-danger' : 'text-success')}>{mxn(total)}</span>
          </span>
        </div>
      </div>
    </Card>
  )
}

export function OwnerOverview() {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const profit = useMemo(() => monthProfit(data), [data])
  const units = useMemo(() => unitProfitability(data), [data])
  const top = useMemo(() => quarterEvents(data, settings).slice(0, 5), [data, settings])
  const regulars = useMemo(() => returningGuests(data).slice(0, 5), [data])
  const incidents = useMemo(
    () =>
      Object.values(data.tasks)
        .filter((t) => !t.deleted && t.type === 'mantenimiento' && (t.priority === 'urgente' || t.priority === 'alta') && (t.status === 'pendiente' || t.status === 'en-progreso'))
        .sort((a, b) => (a.priority === 'urgente' ? -1 : 1) - (b.priority === 'urgente' ? -1 : 1)),
    [data.tasks],
  )
  const blocked = useMemo(() => Object.values(data.units).filter((u) => !u.deleted && u.status === 'mantenimiento'), [data.units])
  const lowStock = useMemo(() => Object.values(data.inventory).filter((i) => !i.deleted && i.stock <= i.min), [data.inventory])
  const maxRev = Math.max(1, ...units.map((u) => u.revenue))
  const monthLabel = fmt(new Date(), 'MMMM')
  const attention = incidents.length + blocked.length + lowStock.length

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:gap-6">
      {/* Encabezado de la sección */}
      <div className="flex flex-wrap items-end justify-between gap-3 xl:col-span-12">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-chispa-soft shadow-[0_0_10px_var(--luz)]" /> Panorama del dueño
          </div>
          <h2 className="heading mt-2 text-[clamp(1.7rem,1.4rem+1.2vw,2.3rem)]">Cómo va el negocio</h2>
        </div>
        <MonthReportButton />
      </div>

      {/* Utilidad del mes */}
      <Card className="xl:col-span-4">
        <CardHeader eyebrow={`Utilidad de ${monthLabel}`} title="Ingresos menos gastos" icon={<IconBubble tone="rose" orb><Wallet size={20} strokeWidth={1.6} /></IconBubble>} />
        <div className="p-5 pt-4 md:p-6 md:pt-4">
          <div className={cx('display-num text-[2.8rem]', profit.profit < 0 && 'text-danger')}>
            <CountUp value={profit.profit} format={(n) => mxn(n)} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <Badge tone={profit.margin >= 0.25 ? 'sage' : profit.margin >= 0 ? 'butter' : 'rose'}>Margen {pct(profit.margin)}</Badge>
            <span>en lo que va del mes</span>
          </div>
          <Estela className="my-4" />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-[14px] bg-sunken p-3">
              <dt className="text-xs text-ink-soft">Entró</dt>
              <dd className="display-num mt-1 text-xl">{compactMxn(profit.income)}</dd>
            </div>
            <div className="rounded-[14px] bg-sunken p-3">
              <dt className="text-xs text-ink-soft">Salió</dt>
              <dd className="display-num mt-1 text-xl">{compactMxn(profit.spent)}</dd>
            </div>
            <div className="rounded-[14px] bg-sunken p-3">
              <dt className="text-xs text-ink-soft">Hospedaje</dt>
              <dd className="display-num mt-1 text-xl">{compactMxn(profit.incomeLodging)}</dd>
            </div>
            <div className="rounded-[14px] bg-sunken p-3">
              <dt className="text-xs text-ink-soft">Eventos</dt>
              <dd className="display-num mt-1 text-xl">{compactMxn(profit.incomeEvents)}</dd>
            </div>
          </dl>
          <Link to="/finanzas" className="mt-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
            Ver finanzas <ArrowRight size={14} strokeWidth={1.6} />
          </Link>
        </div>
      </Card>

      {/* Proyección */}
      <ProjectionCard className="xl:col-span-8" />

      {/* Atención del dueño */}
      <Card className="xl:col-span-4">
        <CardHeader eyebrow="Atención" title={attention ? `${attention} cosas por resolver` : 'Todo en orden'} subtitle="Incidencias, unidades bloqueadas e insumos" icon={<IconBubble tone="peach"><AlertTriangle size={20} strokeWidth={1.6} /></IconBubble>} />
        <div className="flex flex-col gap-1 p-3 md:p-4">
          {attention === 0 && <p className="rounded-[14px] bg-sunken px-4 py-6 text-center text-sm text-ink-soft">Sin incidencias abiertas ni faltantes. ✦</p>}
          {blocked.map((u) => (
            <Link key={u.id} to={`/mapa?u=${u.id}`} className="pressable flex min-h-12 items-center gap-3 rounded-[14px] px-3 py-2 hover:bg-wash">
              <Lock size={16} strokeWidth={1.6} className="shrink-0 text-danger" />
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{u.name}</span> bloqueada por mantenimiento
              </span>
              <Badge tone={UNIT_STATUS[u.status].tone}>{UNIT_STATUS[u.status].label}</Badge>
            </Link>
          ))}
          {incidents.slice(0, 4).map((t) => (
            <Link key={t.id} to={`/tareas?t=${t.id}`} className="pressable flex min-h-12 items-center gap-3 rounded-[14px] px-3 py-2 hover:bg-wash">
              <Wrench size={16} strokeWidth={1.6} className={cx('shrink-0', t.priority === 'urgente' ? 'text-danger' : 'text-warning')} />
              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
              <Badge tone={t.priority === 'urgente' ? 'rose' : 'peach'}>{t.priority === 'urgente' ? 'Urgente' : 'Alta'}</Badge>
            </Link>
          ))}
          {lowStock.length > 0 && (
            <Link to="/inventario" className="pressable flex min-h-12 items-center gap-3 rounded-[14px] px-3 py-2 hover:bg-wash">
              <Package size={16} strokeWidth={1.6} className="shrink-0 text-warning" />
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{lowStock.length} insumos</span> bajo el mínimo: {lowStock.slice(0, 3).map((i) => i.name).join(', ')}
              </span>
              <ArrowRight size={14} strokeWidth={1.6} className="text-ink-3" />
            </Link>
          )}
        </div>
      </Card>

      {/* Rentabilidad por unidad */}
      <Card className="xl:col-span-8">
        <CardHeader eyebrow="Hospedaje" title={`Rentabilidad por unidad · ${monthLabel}`} subtitle="Ingreso prorrateado por noches del mes y ocupación" icon={<IconBubble tone="sky"><BedDouble size={20} strokeWidth={1.6} /></IconBubble>} />
        <div className="p-5 pt-4 md:p-6 md:pt-4">
          <ol className="flex flex-col gap-3.5">
            {units.map((u, i) => (
              <li key={u.unit.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3">
                <span className={cx('display-num text-lg', i === 0 ? 'text-ink' : 'text-ink-3')}>{i + 1}</span>
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{u.unit.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {u.nights} noches · {pct(u.occupancy)} · ADR {compactMxn(u.adr)}
                    </span>
                  </div>
                  <ProgressBar value={u.revenue / maxRev} />
                </div>
                <span className="w-20 text-right font-medium tabular">{compactMxn(u.revenue)}</span>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      {/* Top eventos del trimestre */}
      <Card className="xl:col-span-6">
        <CardHeader eyebrow={top[0]?.quarter ?? 'Trimestre'} title="Eventos que más dejan" subtitle="Por total cotizado en el trimestre" />
        <ul className="flex flex-col gap-1 p-3 md:p-4">
          {top.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-soft">Aún no hay eventos en este trimestre.</li>}
          {top.map(({ ev, total, paid, perGuest }) => {
            const Icon = EVENT_TYPE[ev.type].icon
            return (
              <li key={ev.id}>
                <Link to={`/eventos/${ev.id}`} className="pressable flex min-h-14 items-center gap-3 rounded-[14px] px-3 py-2 hover:bg-wash">
                  <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONE[EVENT_TYPE[ev.type].tone].soft, TONE[EVENT_TYPE[ev.type].tone].ink)}>
                    <Icon size={18} strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{ev.title}</span>
                    <span className="block text-xs text-ink-soft">
                      {fmtDate(ev.date)} · {ev.guests} invitados · {compactMxn(perGuest)} por persona
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-medium tabular">{compactMxn(total)}</span>
                    <span className="block text-[11px] text-ink-3">{pct(total ? paid / total : 0)} cobrado</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>

      {/* Flujo de caja */}
      <CashflowCard className="xl:col-span-6" />

      {/* Clientes que regresan */}
      <Card className="xl:col-span-12">
        <CardHeader eyebrow="Lealtad" title="Huéspedes que regresan" subtitle="Personas con más de una estancia: cuídalas con una atención especial" icon={<IconBubble tone="lavender"><Repeat size={20} strokeWidth={1.6} /></IconBubble>} />
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5 md:p-5">
          {regulars.length === 0 && <p className="col-span-full px-3 py-4 text-center text-sm text-ink-soft">Todavía no hay huéspedes recurrentes.</p>}
          {regulars.map((g) => (
            <div key={g.name + g.last} className="rounded-[18px] bg-sunken p-4">
              <div className="truncate font-medium">{g.name}</div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="display-num text-2xl">{g.stays}</span>
                <span className="text-xs text-ink-soft">estancias</span>
              </div>
              <div className="mt-1 text-xs text-ink-soft">
                {compactMxn(g.spent)} · última {fmtDate(g.last)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

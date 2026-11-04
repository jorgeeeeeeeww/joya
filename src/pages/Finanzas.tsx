import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Download, Plus, TrendingUp, Wallet, X } from 'lucide-react'
import { Choices, DateField, FormScope, MoneyField, TextField } from '@/components/fields'
import { WhatIfCard } from '@/components/finance/WhatIf'
import { withUndo } from '@/lib/undo'
import { db, useCollection } from '@/lib/store'
import { EXPENSE_CATEGORY, PAYMENT_METHOD } from '@/lib/meta'
import { addDaysISO, compactMxn, fmt, fmtDate, mxn, nights, pct, today, toISODate } from '@/lib/format'
import type { BusinessLine, Expense, ExpenseCategory, PaymentMethod } from '@/lib/types'
import { BarChart, Donut, Legend } from '@/components/charts'
import { Badge, Button, Card, CardHeader, Chip, cx, Empty, PageHeader, Segmented, Sheet, Stat, toast } from '@/components/ui'
import { CountUp } from '@/components/step1'
import { MonthReportButton, OwnerOverview } from '@/components/owner/OwnerOverview'

type Period = 'mes' | 'anterior' | '3m' | '6m' | 'anio'
const PERIODS: { value: Period; label: string }[] = [
  { value: 'mes', label: 'Este mes' },
  { value: 'anterior', label: 'Mes pasado' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: 'anio', label: 'Este año' },
]

function range(p: Period): [string, string] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  if (p === 'mes') return [toISODate(first), today()]
  if (p === 'anterior') return [toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), toISODate(new Date(now.getFullYear(), now.getMonth(), 0))]
  if (p === '3m') return [toISODate(new Date(now.getFullYear(), now.getMonth() - 2, 1)), today()]
  if (p === '6m') return [toISODate(new Date(now.getFullYear(), now.getMonth() - 5, 1)), today()]
  return [`${now.getFullYear()}-01-01`, today()]
}

const BLANK: Partial<Expense> = { date: today(), category: 'insumos', line: 'general', method: 'efectivo' }

function ExpenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState<Partial<Expense>>(BLANK)
  const [reveal, setReveal] = useState(false)
  const set = (p: Partial<Expense>) => setF((x) => ({ ...x, ...p }))
  const recent = useCollection('expenses')
  const suggestions = useMemo(() => [...new Set(recent.map((e) => e.concept))].slice(0, 40), [recent])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Registrar gasto"
      subtitle="Queda en la bitácora y en los reportes del periodo."
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!f.concept?.trim() || !f.amount) {
                setReveal(true)
                return toast.error('Faltan datos', 'Escribe el concepto y el monto del gasto.')
              }
              const saved = db.upsert('expenses', { ...f, concept: f.concept.trim() } as Expense)
              withUndo(`Gasto registrado · ${mxn(saved.amount)}`, () => db.remove('expenses', saved.id), saved.concept)
              setF({ ...BLANK, date: today() })
              setReveal(false)
              onClose()
            }}
          >
            Guardar gasto
          </Button>
        </div>
      }
    >
      <FormScope reveal={reveal}>
        <div className="flex flex-col gap-4">
          <TextField label="Concepto" value={f.concept ?? ''} onChange={(v) => {
            // Si escribe un gasto que ya existía, se sugiere su categoría
            const prev = recent.find((e) => e.concept.toLowerCase() === v.toLowerCase())
            set(prev ? { concept: v, category: prev.category, line: prev.line } : { concept: v })
          }} placeholder="Ej. Compra de focos" required requiredMsg="Escribe en qué se gastó" suggestions={suggestions} />
          <div className="grid gap-3 @xl:grid-cols-2">
            <MoneyField label="Monto" value={f.amount} onChange={(v) => set({ amount: v })} required requiredMsg="Escribe el monto" decimals />
            <DateField label="Fecha" value={f.date} onChange={(v) => set({ date: v })} max={today()} presets={[{ label: 'Hoy', value: today() }, { label: 'Ayer', value: addDaysISO(today(), -1) }]} />
          </div>
          <Choices label="Categoría" size="sm" value={f.category} onChange={(v) => set({ category: v })} options={(Object.keys(EXPENSE_CATEGORY) as ExpenseCategory[]).map((k) => ({ value: k, label: EXPENSE_CATEGORY[k].label, tone: EXPENSE_CATEGORY[k].tone }))} />
          <Choices label="¿De qué negocio?" value={f.line} onChange={(v) => set({ line: v })} options={[{ value: 'general' as BusinessLine, label: 'General' }, { value: 'hospedaje' as BusinessLine, label: 'Hospedaje', tone: 'sky' }, { value: 'eventos' as BusinessLine, label: 'Eventos', tone: 'rose' }]} />
          <Choices label="¿Cómo se pagó?" size="sm" value={f.method} onChange={(v) => set({ method: v })} options={(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map((k) => ({ value: k, label: PAYMENT_METHOD[k] }))} />
        </div>
      </FormScope>
    </Sheet>
  )
}

export default function Finanzas() {
  const payments = useCollection('payments')
  const expenses = useCollection('expenses')
  const reservations = useCollection('reservations')
  const events = useCollection('events')
  const units = useCollection('units')
  const [period, setPeriod] = useState<Period>('mes')
  const [line, setLine] = useState<'todo' | 'hospedaje' | 'eventos'>('todo')
  const [kind, setKind] = useState<'todos' | 'in' | 'out'>('todos')
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<number | null>(null) // mes tocado en la gráfica
  const [pFrom, pTo] = range(period)
  const focusMonth = useMemo(() => {
    if (focus === null) return null
    const now = new Date()
    const m = new Date(now.getFullYear(), now.getMonth() - (5 - focus), 1)
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0)
    return { from: toISODate(m), to: toISODate(last) > today() ? today() : toISODate(last), label: fmt(m, 'MMMM yyyy') }
  }, [focus])
  const [from, to] = focusMonth ? [focusMonth.from, focusMonth.to] : [pFrom, pTo]

  const inRange = (d: string) => d >= from && d <= to
  const matchPay = (refType: string) => line === 'todo' || (line === 'hospedaje' ? refType === 'reserva' : refType === 'evento')
  const matchExp = (l: BusinessLine) => line === 'todo' || l === line || l === 'general'
  const pays = payments.filter((p) => inRange(p.date) && matchPay(p.refType))
  const exps = expenses.filter((e) => inRange(e.date) && matchExp(e.line))
  const income = pays.reduce((n, p) => n + p.amount, 0)
  const spent = exps.reduce((n, e) => n + e.amount, 0)
  const profit = income - spent

  // Métricas hoteleras del periodo
  const nightsSold = reservations
    .filter((r) => r.status !== 'cancelada' && r.guests > 0)
    .reduce((n, r) => {
      const s = r.checkIn > from ? r.checkIn : from
      const e = r.checkOut < addDaysISO(to, 1) ? r.checkOut : addDaysISO(to, 1)
      return n + Math.max(0, nights(s, e))
    }, 0)
  const daysInRange = nights(from, addDaysISO(to, 1))
  const available = daysInRange * units.length
  const lodgingIncome = payments.filter((p) => inRange(p.date) && p.refType === 'reserva').reduce((n, p) => n + p.amount, 0)
  const adr = nightsSold ? lodgingIncome / nightsSold : 0
  const revpar = available ? lodgingIncome / available : 0
  const occ = available ? nightsSold / available : 0
  const eventsDone = events.filter((e) => inRange(e.date) && (e.status === 'realizado' || e.status === 'confirmado')).length

  const monthly = useMemo(() => {
    const out: { label: string; ingresos: number; gastos: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
      out.push({
        label: fmt(m, 'MMM'),
        ingresos: payments.filter((p) => p.date.startsWith(key) && matchPay(p.refType)).reduce((n, p) => n + p.amount, 0),
        gastos: expenses.filter((e) => e.date.startsWith(key) && matchExp(e.line)).reduce((n, e) => n + e.amount, 0),
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, expenses, line])

  const byCategory = (Object.keys(EXPENSE_CATEGORY) as ExpenseCategory[])
    .map((k) => ({ label: EXPENSE_CATEGORY[k].label, tone: EXPENSE_CATEGORY[k].tone, value: exps.filter((e) => e.category === k).reduce((n, e) => n + e.amount, 0) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)

  const movements = [
    ...pays.map((p) => ({ id: p.id, date: p.date, concept: p.concept, sub: p.refType === 'reserva' ? reservations.find((r) => r.id === p.refId)?.guestName ?? 'Hospedaje' : events.find((e) => e.id === p.refId)?.title ?? 'Evento', amount: p.amount, kind: 'in' as const, method: PAYMENT_METHOD[p.method] })),
    ...exps.map((e) => ({ id: e.id, date: e.date, concept: e.concept, sub: EXPENSE_CATEGORY[e.category].label, amount: -e.amount, kind: 'out' as const, method: PAYMENT_METHOD[e.method] })),
  ]
    .filter((m) => kind === 'todos' || m.kind === kind)
    .sort((a, b) => b.date.localeCompare(a.date))

  // Base del simulador: cómo va el rancho (promedios de los últimos 3 meses)
  const whatIfBase = useMemo(() => {
    const since = addDaysISO(today(), -90)
    const sold = reservations.filter((r) => r.status !== 'cancelada' && r.guests > 0).reduce((n, r) => {
      const s0 = r.checkIn > since ? r.checkIn : since
      const e0 = r.checkOut < today() ? r.checkOut : today()
      return n + Math.max(0, nights(s0, e0))
    }, 0)
    const lodging = payments.filter((p) => p.date >= since && p.refType === 'reserva').reduce((n, p) => n + p.amount, 0)
    const evs = events.filter((e) => e.date >= since && e.date <= today() && (e.status === 'realizado' || e.status === 'confirmado'))
    const evIncome = payments.filter((p) => p.date >= since && p.refType === 'evento').reduce((n, p) => n + p.amount, 0)
    const spent90 = expenses.filter((e) => e.date >= since).reduce((n, e) => n + e.amount, 0)
    return {
      units: units.length,
      occupancy: units.length ? Math.min(1, sold / (90 * units.length)) : 0,
      adr: sold ? lodging / sold : 1800,
      eventsPerMonth: evs.length / 3,
      eventTicket: evs.length ? evIncome / evs.length : 90000,
      expenses: spent90 / 3,
    }
  }, [reservations, payments, events, expenses, units.length])

  const exportCsv = () => {
    const rows = [['Fecha', 'Tipo', 'Concepto', 'Detalle', 'Método', 'Monto'], ...movements.map((m) => [m.date, m.kind === 'in' ? 'Ingreso' : 'Gasto', m.concept, m.sub, m.method, String(m.amount)])]
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `la-joya-finanzas-${from}-a-${to}.csv`
    a.click()
    toast.success('Archivo descargado', 'Ábrelo en Excel o Numbers.')
  }

  return (
    <div>
      <PageHeader
        eyebrow="Negocio"
        title="Finanzas"
        subtitle={`Del ${fmtDate(from)} al ${fmtDate(to)} · toca un mes en la gráfica para ver su detalle`}
        primary={{ label: 'Registrar gasto', icon: <Plus size={18} strokeWidth={1.6} />, onClick: () => setOpen(true) }}
        actions={<MonthReportButton variant="outline" />}
        menu={[{ label: 'Exportar a Excel', icon: <Download />, hint: 'Movimientos del periodo', onClick: exportCsv }]}
      />
      <div className="mb-7 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          {PERIODS.map((p) => (
            <Chip key={p.value} active={!focusMonth && period === p.value} onClick={() => (setFocus(null), setPeriod(p.value))}>
              {p.label}
            </Chip>
          ))}
          {focusMonth && (
            <button onClick={() => setFocus(null)} className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] text-paper capitalize pointer-fine:h-8">
              {focusMonth.label} <X size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>
        <Segmented
          value={line}
          onChange={setLine}
          options={[
            { value: 'todo', label: 'Todo' },
            { value: 'hospedaje', label: 'Hospedaje' },
            { value: 'eventos', label: 'Eventos' },
          ]}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Ingresos" value={<CountUp value={income} format={compactMxn} />} sub={`${pays.length} pagos recibidos`} tone="sage" icon={<ArrowUpRight size={16} strokeWidth={1.6} />} />
        <Stat label="Gastos" value={<CountUp value={spent} format={compactMxn} />} sub={`${exps.length} movimientos`} tone="rose" icon={<ArrowDownRight size={16} strokeWidth={1.6} />} />
        <Stat label="Utilidad" value={<CountUp value={profit} format={compactMxn} />} accent sub={income ? `Margen de ${pct(profit / income)}` : 'Sin ingresos aún'} />
        <Stat label="Tarifa promedio por noche" value={<CountUp value={adr} format={compactMxn} />} sub={`Casas ocupadas el ${pct(occ)} de las noches · cada casa deja ${mxn(revpar)} por noche en promedio`} tone="butter" icon={<Wallet size={16} strokeWidth={1.6} />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr] lg:gap-6">
        <Card>
          <CardHeader eyebrow="Tendencia" title="Ingresos contra gastos" subtitle="Últimos 6 meses" icon={undefined} action={<Badge tone="lavender">{eventsDone} eventos en el periodo</Badge>} />
          <div className="px-3 pt-4 pb-5 md:px-5">
            <BarChart
              data={monthly}
              activeIndex={focus}
              onBarClick={(i) => setFocus((f) => (f === i ? null : i))}
              stacked={false}
              series={[
                { key: 'ingresos', label: 'Ingresos', tone: 'sage' },
                { key: 'gastos', label: 'Gastos', tone: 'rose' },
              ]}
            />
            <div className="mt-3 flex justify-center gap-6 text-sm text-ink-soft">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-sage" />
                Ingresos
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose" />
                Gastos
              </span>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="Gastos" title="¿En qué se va el dinero?" subtitle="Por categoría en el periodo" />
          <div className="flex flex-col items-center gap-6 p-6 sm:flex-row lg:flex-col xl:flex-row">
            <Donut
              segments={byCategory.length ? byCategory : [{ label: 'Sin gastos', value: 1, tone: 'sky' }]}
              center={
                <>
                  <span className="display-num text-xl">{compactMxn(spent)}</span>
                  <span className="text-xs text-ink-soft">en gastos</span>
                </>
              }
            />
            <div className="w-full">
              <Legend items={byCategory.slice(0, 7).map((c) => ({ label: c.label, tone: c.tone, value: compactMxn(c.value) }))} />
            </div>
          </div>
        </Card>
      </div>

      {/* Proyección y flujo de caja (mismos cálculos que el Centro de control) */}
      <div className="mt-6">
        <WhatIfCard base={whatIfBase} />
      </div>

      {/* Panorama del dueño: utilidad, rentabilidad por casa, eventos que más dejan y pendientes */}
      <div className="mt-8">
        <OwnerOverview />
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader
          eyebrow="Detalle"
          title="Movimientos"
          subtitle={`${movements.length} en el periodo`}
          action={
            <Segmented
              size="sm"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'in', label: 'Ingresos' },
                { value: 'out', label: 'Gastos' },
              ]}
            />
          }
        />
        {movements.length === 0 ? (
          <Empty kind="finanzas" title="Sin movimientos en este periodo" body="Cambia el periodo o registra un gasto." />
        ) : (
          <>
            {/* Escritorio: tabla */}
            <div className="mt-4 hidden md:block">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="bg-sunken text-left">
                    <th className="eyebrow py-3 pr-3 pl-6 font-medium">Fecha</th>
                    <th className="eyebrow px-3 py-3 font-medium">Concepto</th>
                    <th className="eyebrow px-3 py-3 font-medium">Detalle</th>
                    <th className="eyebrow px-3 py-3 font-medium">Método</th>
                    <th className="eyebrow py-3 pr-6 pl-3 text-right font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.slice(0, 120).map((m) => (
                    <tr key={m.id} className="h-[52px] border-b border-line transition-colors last:border-0 hover:bg-wash">
                      <td className="py-2 pr-3 pl-6 text-sm text-ink-soft tabular">{fmtDate(m.date)}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2.5">
                          <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', m.kind === 'in' ? 'bg-sage-soft text-sage-ink' : 'bg-rose-soft text-rose-ink')}>
                            {m.kind === 'in' ? <ArrowUpRight size={14} strokeWidth={1.6} /> : <ArrowDownRight size={14} strokeWidth={1.6} />}
                          </span>
                          {m.concept}
                        </span>
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-sm text-ink-soft">{m.sub}</td>
                      <td className="px-3 py-2 text-sm text-ink-soft">{m.method}</td>
                      <td className={cx('py-2 pr-6 pl-3 text-right tabular', m.kind === 'in' ? 'text-success' : 'text-ink')}>{mxn(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Móvil: tarjetas */}
            <ul className="mt-3 flex flex-col px-3 pb-3 md:hidden">
              {movements.slice(0, 80).map((m) => (
                <li key={m.id} className="flex min-h-16 items-center gap-3 border-b border-line px-2 py-2.5 last:border-0">
                  <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', m.kind === 'in' ? 'bg-sage-soft text-sage-ink' : 'bg-rose-soft text-rose-ink')}>
                    {m.kind === 'in' ? <ArrowUpRight size={18} strokeWidth={1.6} /> : <ArrowDownRight size={18} strokeWidth={1.6} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{m.concept}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {m.sub} · {fmtDate(m.date)}
                    </p>
                  </div>
                  <span className={cx('text-right text-[15px] tabular', m.kind === 'in' ? 'text-success' : 'text-ink')}>{mxn(m.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <div className="mt-4 flex items-center gap-2 px-1 text-xs text-ink-3">
        <TrendingUp size={13} strokeWidth={1.6} /> RevPAR = ingreso de hospedaje entre noches disponibles de las {units.length} unidades.
      </div>
      <ExpenseSheet open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

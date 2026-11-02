// "¿Qué pasa si…?": simulador con deslizadores. Mueve ocupación, tarifa, eventos y gastos y ve al
// instante cuánto entraría y cuánto quedaría al mes y al año, contra cómo va hoy el rancho.
import { useEffect, useState } from 'react'
import { animate, motion } from 'motion/react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { compactMxn, mxn } from '@/lib/format'
import { ease } from '@/lib/motion'
import { Button, Card, CardHeader, cx } from '@/components/ui'
import { Slider } from '@/components/fields'

export interface WhatIfBase {
  units: number
  occupancy: number // 0–1
  adr: number // tarifa promedio por noche
  eventsPerMonth: number
  eventTicket: number
  expenses: number // gasto mensual promedio
}

function Money({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const c = animate(shown, value, { duration: 0.5, ease: ease.calma, onUpdate: setShown })
    return () => c.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <span className={cx('tabular', className)}>{mxn(shown)}</span>
}

export function WhatIfCard({ base }: { base: WhatIfBase }) {
  const init = () => ({ occ: Math.round(base.occupancy * 100), adr: Math.round(base.adr / 50) * 50 || 1800, events: Math.max(0, Math.round(base.eventsPerMonth)), ticket: Math.round(base.eventTicket / 1000) * 1000 || 90000, exp: 0 })
  const [v, setV] = useState(init)
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }))
  const lodging = base.units * 30 * (v.occ / 100) * v.adr
  const eventsIncome = v.events * v.ticket
  const income = lodging + eventsIncome
  const expenses = base.expenses * (1 + v.exp / 100)
  const profit = income - expenses
  const baseIncome = base.units * 30 * base.occupancy * base.adr + base.eventsPerMonth * base.eventTicket
  const baseProfit = baseIncome - base.expenses
  const diff = profit - baseProfit
  const changed = JSON.stringify(v) !== JSON.stringify(init())
  return (
    <Card>
      <CardHeader eyebrow="Simulador" title="¿Qué pasa si…?" subtitle="Mueve los deslizadores: el resultado se calcula al instante" action={changed && <Button size="sm" variant="ghost" icon={<RotateCcw size={15} strokeWidth={1.6} />} onClick={() => setV(init())}>Como hoy</Button>} />
      <div className="grid gap-6 p-5 md:p-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-5">
          <Slider label="Ocupación de cabañas y casas" value={v.occ} onChange={(n) => set({ occ: n })} min={0} max={100} step={5} format={(n) => `${n}%`} hint={`Hoy: ${Math.round(base.occupancy * 100)}%`} />
          <Slider label="Tarifa promedio por noche" value={v.adr} onChange={(n) => set({ adr: n })} min={800} max={5000} step={50} format={(n) => mxn(n)} hint={`Hoy: ${mxn(base.adr)}`} />
          <Slider label="Eventos al mes" value={v.events} onChange={(n) => set({ events: n })} min={0} max={12} step={1} format={(n) => `${n} ${n === 1 ? 'evento' : 'eventos'}`} hint={`Promedio reciente: ${base.eventsPerMonth.toFixed(1)}`} />
          <Slider label="Ingreso promedio por evento" value={v.ticket} onChange={(n) => set({ ticket: n })} min={20000} max={400000} step={5000} format={(n) => compactMxn(n)} hint={`Hoy: ${compactMxn(base.eventTicket)}`} />
          <Slider label="Gastos del mes" value={v.exp} onChange={(n) => set({ exp: n })} min={-30} max={50} step={5} format={(n) => (n === 0 ? 'Igual que hoy' : `${n > 0 ? '+' : ''}${n}%`)} hint={`Hoy: ${mxn(base.expenses)} al mes`} />
        </div>
        <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--r-lg)] bg-sunken p-4">
            <span className="kicker">Al mes entraría</span>
            <div className="mt-1 text-[1.9rem] leading-tight font-semibold">
              <Money value={income} />
            </div>
            <div className="mt-2 flex flex-col gap-1 text-[13px] text-ink-soft">
              <span className="flex justify-between">
                Hospedaje <Money value={lodging} className="text-ink" />
              </span>
              <span className="flex justify-between">
                Eventos <Money value={eventsIncome} className="text-ink" />
              </span>
              <span className="flex justify-between">
                Gastos <Money value={-expenses} className="text-ink" />
              </span>
            </div>
          </div>
          <div className={cx('rounded-[var(--r-lg)] p-4 ring-1 ring-inset', profit >= 0 ? 'bg-[color-mix(in_oklab,var(--success)_9%,var(--surface))] ring-[color-mix(in_oklab,var(--success)_25%,transparent)]' : 'bg-[color-mix(in_oklab,var(--danger)_8%,var(--surface))] ring-[color-mix(in_oklab,var(--danger)_25%,transparent)]')}>
            <span className="kicker">Quedaría de utilidad</span>
            <div className={cx('mt-1 text-[1.9rem] leading-tight font-semibold', profit >= 0 ? 'text-success' : 'text-danger')}>
              <Money value={profit} />
            </div>
            <p className="mt-1 text-[13px] text-ink-soft">
              Al año: <Money value={profit * 12} className="font-medium text-ink" />
            </p>
            {changed && (
              <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-center gap-1.5 text-[13px] font-medium">
                <Sparkles size={14} strokeWidth={1.7} className="text-chispa" />
                {diff >= 0 ? `${compactMxn(diff)} más al mes que hoy` : `${compactMxn(-diff)} menos al mes que hoy`}
              </motion.p>
            )}
          </div>
          <p className="text-xs text-ink-3">Estimado con {base.units} unidades y 30 noches al mes. No incluye impuestos.</p>
        </div>
      </div>
    </Card>
  )
}

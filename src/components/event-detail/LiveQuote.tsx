// Cotizador en vivo: mueve invitados, precio por persona, horas extra y descuento, y ve al instante
// el total, el anticipo, las mesas, sillas y meseros que se necesitan. "Aplicar" lo pasa a la cotización.
import { useEffect, useMemo, useState } from 'react'
import { animate } from 'motion/react'
import { Armchair, Check, ConciergeBell, RotateCcw, Table2 } from 'lucide-react'
import type { LineItem, RanchEvent } from '@/lib/types'
import { db, useStore } from '@/lib/store'
import { VENUE } from '@/lib/meta'
import { mxn, uid } from '@/lib/format'
import { ease } from '@/lib/motion'
import { withUndo } from '@/lib/undo'
import { Button, Card, CardHeader, cx } from '@/components/ui'
import { Slider } from '@/components/fields'

const EXTRA_HOUR = 3500

function Num({ value, money }: { value: number; money?: boolean }) {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const c = animate(shown, value, { duration: 0.45, ease: ease.calma, onUpdate: setShown })
    return () => c.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <span className="tabular">{money ? mxn(shown) : Math.round(shown)}</span>
}

export function LiveQuote({ ev }: { ev: RanchEvent }) {
  const { ivaPercent, depositPercent } = useStore((s) => s.settings)
  const pkgLine = ev.lineItems.find((l) => l.category === 'Paquete')
  const extraLine = ev.lineItems.find((l) => l.category === 'Horas extra')
  const others = ev.lineItems.filter((l) => l !== pkgLine && l !== extraLine).reduce((n, l) => n + l.qty * l.price, 0)
  const init = () => ({ guests: ev.guests, perPerson: pkgLine?.price ?? 450, hours: extraLine?.qty ?? 0, discountPct: 0 })
  const [v, setV] = useState(init)
  useEffect(() => setV(init()), [ev.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }))

  const calc = useMemo(() => {
    const pkg = v.guests * v.perPerson
    const extras = v.hours * EXTRA_HOUR
    const subtotal = pkg + extras + others
    const discount = Math.round((subtotal * v.discountPct) / 100)
    const base = subtotal - discount
    const iva = ev.includeIva ? base * (ivaPercent / 100) : 0
    const total = base + iva
    return { pkg, extras, subtotal, discount, total, deposit: total * (depositPercent / 100), tables: Math.ceil(v.guests / 10), chairs: v.guests, waiters: Math.ceil(v.guests / 15) }
  }, [v, others, ev.includeIva, ivaPercent, depositPercent])
  const changed = JSON.stringify(v) !== JSON.stringify(init())
  const overCapacity = v.guests > VENUE[ev.venue].capacity

  const apply = () => {
    const prev = { guests: ev.guests, lineItems: ev.lineItems, discount: ev.discount }
    let lines: LineItem[] = ev.lineItems.map((l) => (l === pkgLine ? { ...l, qty: v.guests, price: v.perPerson } : l === extraLine ? { ...l, qty: v.hours } : l))
    if (!pkgLine) lines = [{ id: uid('li_'), concept: 'Paquete por persona', category: 'Paquete', qty: v.guests, price: v.perPerson }, ...lines]
    if (!extraLine && v.hours > 0) lines = [...lines, { id: uid('li_'), concept: 'Hora extra', category: 'Horas extra', qty: v.hours, price: EXTRA_HOUR }]
    lines = lines.filter((l) => !(l.category === 'Horas extra' && l.qty === 0))
    db.patch('events', ev.id, { guests: v.guests, lineItems: lines, discount: calc.discount })
    withUndo('Cotización actualizada', () => db.patch('events', ev.id, prev), `Total ${mxn(calc.total)}`)
  }

  return (
    <Card>
      <CardHeader eyebrow="Cotizador en vivo" title="Juega con los números" subtitle="Todo se recalcula al momento; aplica cuando te guste" action={changed && <Button size="sm" variant="ghost" icon={<RotateCcw size={15} strokeWidth={1.6} />} onClick={() => setV(init())}>Como está</Button>} />
      <div className="grid gap-6 p-5 md:p-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-5">
          <Slider label="Invitados" value={v.guests} onChange={(n) => set({ guests: n })} min={20} max={450} step={5} format={(n) => `${n} personas`} hint={overCapacity ? <span className="text-warning">Pasa la capacidad recomendada del {VENUE[ev.venue].label.toLowerCase()} ({VENUE[ev.venue].capacity}).</span> : undefined} />
          <Slider label="Precio por persona" value={v.perPerson} onChange={(n) => set({ perPerson: n })} min={150} max={1500} step={10} format={(n) => mxn(n)} />
          <Slider label="Horas extra" value={v.hours} onChange={(n) => set({ hours: n })} min={0} max={6} step={1} format={(n) => (n ? `${n} h · ${mxn(n * EXTRA_HOUR)}` : 'Ninguna')} />
          <Slider label="Descuento" value={v.discountPct} onChange={(n) => set({ discountPct: n })} min={0} max={25} step={1} format={(n) => (n ? `${n}% · -${mxn(calc.discount)}` : 'Sin descuento')} />
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <Table2 size={16} strokeWidth={1.6} />, label: 'Mesas de 10', value: calc.tables },
              { icon: <Armchair size={16} strokeWidth={1.6} />, label: 'Sillas', value: calc.chairs },
              { icon: <ConciergeBell size={16} strokeWidth={1.6} />, label: 'Meseros', value: calc.waiters },
            ].map((k) => (
              <div key={k.label} className="rounded-[14px] bg-sunken p-3">
                <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                  {k.icon} {k.label}
                </span>
                <span className="mt-1 block text-[1.4rem] font-semibold">
                  <Num value={k.value} />
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--r-lg)] bg-sunken p-4">
            <span className="kicker">Total</span>
            <div className="mt-1 text-[2rem] leading-tight font-semibold">
              <Num value={calc.total} money />
            </div>
            <div className="mt-2 flex flex-col gap-1 text-[13px] text-ink-soft">
              <span className="flex justify-between">
                Paquete <Num value={calc.pkg} money />
              </span>
              {calc.extras > 0 && (
                <span className="flex justify-between">
                  Horas extra <Num value={calc.extras} money />
                </span>
              )}
              {others > 0 && (
                <span className="flex justify-between">
                  Otros conceptos <span className="tabular">{mxn(others)}</span>
                </span>
              )}
              {calc.discount > 0 && (
                <span className="flex justify-between">
                  Descuento <span className="tabular">-{mxn(calc.discount)}</span>
                </span>
              )}
              {ev.includeIva && <span className="flex justify-between">IVA {ivaPercent}% incluido</span>}
            </div>
          </div>
          <div className="rounded-[var(--r-lg)] bg-[color-mix(in_oklab,var(--luz)_26%,var(--surface))] p-4 ring-1 ring-[color-mix(in_oklab,var(--luz)_55%,transparent)] ring-inset">
            <span className="kicker">Anticipo para apartar ({depositPercent}%)</span>
            <div className="mt-1 text-[1.5rem] font-semibold">
              <Num value={calc.deposit} money />
            </div>
            {ev.clientBudget ? <p className={cx('mt-1 text-xs', calc.total > ev.clientBudget ? 'text-warning' : 'text-success')}>{calc.total > ev.clientBudget ? `${mxn(calc.total - ev.clientBudget)} arriba de su presupuesto` : `${mxn(ev.clientBudget - calc.total)} debajo de su presupuesto`}</p> : null}
          </div>
          <Button icon={<Check size={17} strokeWidth={1.7} />} disabled={!changed} onClick={apply}>
            Aplicar a la cotización
          </Button>
        </div>
      </div>
    </Card>
  )
}

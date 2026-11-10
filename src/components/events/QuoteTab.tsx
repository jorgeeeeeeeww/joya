import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Check, MessageCircle, Plus, Printer, Receipt, Trash2, Wallet } from 'lucide-react'
import type { LineItem, PaymentMethod, RanchEvent } from '@/lib/types'
import { db, useCollection, useMe, useStore } from '@/lib/store'
import { EVENT_TYPE, PAYMENT_METHOD, VENUE } from '@/lib/meta'
import { EVENT_PACKAGES, EXTRAS_CATALOG } from '@/lib/templates'
import { priceOf, usePackagePrices } from '@/lib/packages'
import { fmtDate, fmtDateFull, mxn, today, uid, waLink } from '@/lib/format'
import { Badge, Button, Card, CardHeader, Estela, Field, Input, ProgressBar, Select, Sheet, Toggle, cx, toast } from '@/components/ui'
import { MoneyField, MoneyInline } from '@/components/fields'
import { CountUp, Sparkle } from '@/components/step1'
import { useEventDraft } from './useDraft'
import { printHtml } from '@/components/floorplan/FloorPlanEditor'

export function useQuote(ev: RanchEvent, lineItems: LineItem[], discount: number, includeIva: boolean) {
  const { ivaPercent, depositPercent } = useStore((s) => s.settings)
  const payments = useCollection('payments')
  return useMemo(() => {
    const subtotal = lineItems.reduce((n, li) => n + li.qty * li.price, 0)
    const base = Math.max(0, subtotal - (discount || 0))
    const iva = includeIva ? base * (ivaPercent / 100) : 0
    const total = base + iva
    const list = payments.filter((p) => p.refType === 'evento' && p.refId === ev.id).sort((a, b) => a.date.localeCompare(b.date))
    const paid = list.reduce((n, p) => n + p.amount, 0)
    return { subtotal, base, iva, total, paid, balance: Math.max(0, total - paid), deposit: total * (depositPercent / 100), payments: list, ivaPercent, depositPercent }
  }, [lineItems, discount, includeIva, ivaPercent, depositPercent, payments, ev.id])
}

export function QuoteTab({ ev }: { ev: RanchEvent }) {
  const me = useMe()
  const [lineItems, setLines] = useEventDraft(ev, 'lineItems')
  const [discount, setDiscount] = useEventDraft(ev, 'discount')
  const [includeIva, setIva] = useEventDraft(ev, 'includeIva', 0)
  const q = useQuote(ev, lineItems, discount, includeIva)
  const [extrasOpen, setExtrasOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  const prices = usePackagePrices()
  const setPackage = (pkgId: string) => {
    const pkg = EVENT_PACKAGES.find((p) => p.id === pkgId)!
    const price = priceOf(prices, pkgId)
    const rest = lineItems.filter((l) => l.category !== 'Paquete')
    setLines([{ id: uid('li_'), concept: `Paquete ${pkg.name}`, category: 'Paquete', qty: ev.guests, price: price ?? 0 }, ...rest])
    db.patch('events', ev.id, { packageId: pkgId })
    toast.success(`Paquete ${pkg.name}`, price !== undefined ? `${mxn(price)} por persona` : 'Escribe el precio por persona en la línea del paquete')
  }
  const updateLine = (id: string, patch: Partial<LineItem>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const whatsapp = () => {
    const lines = lineItems.map((l) => `• ${l.concept}${l.qty > 1 ? ` (${l.qty})` : ''}: ${mxn(l.qty * l.price)}`).join('\n')
    const text = `Hola ${ev.clientName.split(' ')[0]}, te compartimos con gusto la cotización de *${ev.title}* en Jardines La Joya.\n\n${fmtDateFull(ev.date)} · ${ev.startTime}–${ev.endTime}\n${VENUE[ev.venue].label} · ${ev.guests} invitados\n\n${lines}${discount ? `\n• Descuento: -${mxn(discount)}` : ''}${includeIva ? `\n• IVA ${q.ivaPercent}%: ${mxn(q.iva)}` : ''}\n\n*Total: ${mxn(q.total)}*\nPagado: ${mxn(q.paid)} · Saldo: ${mxn(q.balance)}\nAnticipo para apartar (${q.depositPercent}%): ${mxn(q.deposit)}\n\nGracias por pensar en nosotros ✦`
    window.open(waLink(ev.phone, text), '_blank', 'noopener')
  }

  const print = () => {
    const rows = lineItems.map((l) => `<tr><td>${l.concept}<div class="muted">${l.category}</div></td><td class="r">${l.qty}</td><td class="r">${mxn(l.price)}</td><td class="r">${mxn(l.qty * l.price)}</td></tr>`).join('')
    const pays = q.payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${p.concept}</td><td>${PAYMENT_METHOD[p.method]}</td><td class="r">${mxn(p.amount)}</td></tr>`).join('')
    printHtml(
      `Cotización · ${ev.title}`,
      `<div class="brand"><div><h1>Cotización</h1><div class="muted">Folio ${ev.id.slice(-6).toUpperCase()} · Emitida ${fmtDateFull(today())}</div></div><div style="text-align:right"><b>Jardines La Joya</b><div class="muted">Salón de eventos · Cabañas · Casas<br/>Tototlán, Jalisco</div></div></div>
       <table><tr><td><b>${ev.title}</b><div class="muted">${EVENT_TYPE[ev.type].label} · ${VENUE[ev.venue].label}</div></td><td><b>${fmtDateFull(ev.date)}</b><div class="muted">${ev.startTime} – ${ev.endTime}</div></td><td><b>${ev.clientName}</b><div class="muted">${ev.phone ?? ''} · ${ev.guests} invitados</div></td></tr></table>
       <h2>Conceptos</h2><table><tr><th>Concepto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr>${rows}
       <tr class="tot"><td colspan="3" class="r">Subtotal</td><td class="r">${mxn(q.subtotal)}</td></tr>
       ${discount ? `<tr class="tot"><td colspan="3" class="r">Descuento</td><td class="r">-${mxn(discount)}</td></tr>` : ''}
       ${includeIva ? `<tr class="tot"><td colspan="3" class="r">IVA ${q.ivaPercent}%</td><td class="r">${mxn(q.iva)}</td></tr>` : ''}
       <tr class="tot"><td colspan="3" class="r" style="font-size:16px">Total</td><td class="r" style="font-size:16px">${mxn(q.total)}</td></tr></table>
       ${pays ? `<h2>Pagos recibidos</h2><table><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th class="r">Monto</th></tr>${pays}<tr class="tot"><td colspan="3" class="r">Saldo pendiente</td><td class="r">${mxn(q.balance)}</td></tr></table>` : ''}
       <h2>Condiciones</h2><p class="muted">Anticipo del ${q.depositPercent}% (${mxn(q.deposit)}) para apartar la fecha. Liquidación a más tardar 7 días antes del evento. El depósito en garantía se reembolsa después de revisar el mobiliario. Precios en pesos mexicanos.</p>`,
    )
  }

  const paidRatio = q.total ? q.paid / q.total : 0

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Paquete">
          {EVENT_PACKAGES.map((p) => {
            const active = ev.packageId === p.id
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={active}
                onClick={() => setPackage(p.id)}
                className={cx('card lift pressable relative p-5 text-left', active && 'ring-[1.5px] ring-primary shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_10%,transparent),var(--shadow-1)]')}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="heading text-xl">{p.name}</span>
                  {active ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-on-primary">
                      <Check size={14} strokeWidth={2} />
                    </span>
                  ) : (
                    p.id === 'joya' && <Badge tone="butter" sparkle>Favorito</Badge>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  {priceOf(prices, p.id) !== undefined ? (
                    <>
                      <span className="display-num text-[1.9rem]">{mxn(priceOf(prices, p.id)!)}</span>
                      <span className="text-xs text-detail">por persona</span>
                    </>
                  ) : (
                    <span className="text-sm text-ink-soft">Sin precio · se pone en Ajustes</span>
                  )}
                </div>
                <ul className={cx('mt-3 space-y-1.5 text-[13px] text-ink-soft', !active && 'max-sm:hidden')}>
                  {p.includes.map((i) => (
                    <li key={i} className="flex gap-2">
                      <Check size={14} strokeWidth={1.6} className="mt-0.5 shrink-0 text-success" />
                      {i}
                    </li>
                  ))}
                </ul>
              </button>
            )
          })}
        </div>

        <Card>
          <CardHeader
            title="Conceptos"
            subtitle={`${lineItems.length} partidas · edita cantidades y precios directo`}
            action={
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={<Plus size={16} strokeWidth={1.6} />} onClick={() => setExtrasOpen(true)}>
                  Extras
                </Button>
                <Button variant="outline" size="sm" onClick={() => setLines([...lineItems, { id: uid('li_'), concept: 'Concepto nuevo', category: 'Otros', qty: 1, price: 0 }])}>
                  Línea libre
                </Button>
              </div>
            }
          />
          <div className="mt-4 hidden grid-cols-[1fr_84px_120px_120px_44px] gap-2 border-b border-line px-6 pb-2 sm:grid">
            {['Concepto', 'Cant.', 'Precio', 'Importe', ''].map((h) => (
              <span key={h} className={cx('eyebrow', h !== 'Concepto' && 'text-right')}>
                {h}
              </span>
            ))}
          </div>
          <div className="flex flex-col divide-y divide-line px-4 pb-3 md:px-6">
            {lineItems.map((l) => (
              <motion.div layout key={l.id} className="grid grid-cols-[1fr_auto] items-center gap-2 py-3 sm:grid-cols-[1fr_84px_120px_120px_44px]">
                <div className="col-span-2 sm:col-span-1">
                  <input value={l.concept} onChange={(e) => updateLine(l.id, { concept: e.target.value })} aria-label="Concepto" className="w-full rounded-[10px] bg-transparent px-1.5 py-1 font-medium outline-none hover:bg-wash focus:bg-sunken" />
                  <span className="px-1.5 text-xs text-detail">{l.category}</span>
                </div>
                <Input type="number" inputMode="numeric" aria-label="Cantidad" value={l.qty} onChange={(e) => updateLine(l.id, { qty: Math.max(0, Number(e.target.value)) })} className="h-10 text-right tabular" />
                <MoneyInline label="Precio" value={l.price} onChange={(n) => updateLine(l.id, { price: n })} className="text-right" />
                <span className="text-right tabular">{mxn(l.qty * l.price)}</span>
                <Button size="icon-sm" variant="ghost" aria-label={`Quitar ${l.concept}`} onClick={() => setLines(lineItems.filter((x) => x.id !== l.id))} className="justify-self-end hover:!text-danger">
                  <Trash2 size={16} strokeWidth={1.6} />
                </Button>
              </motion.div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pagos recibidos" subtitle={q.payments.length ? `${q.payments.length} registrados` : 'Aún no hay pagos'} action={<Button size="sm" icon={<Wallet size={16} strokeWidth={1.6} />} onClick={() => setPayOpen(true)}>Registrar pago</Button>} />
          <div className="mt-4 flex flex-col gap-2 px-4 pb-5 md:px-6">
            {q.payments.length === 0 && <p className="rounded-[14px] bg-sunken/70 p-4 text-sm text-ink-soft">Cuando la clienta aparte la fecha, registra aquí su anticipo. El saldo se actualiza solo.</p>}
            {q.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-[14px] bg-sunken/70 p-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--success)_14%,var(--surface))] text-success">
                  <Receipt size={18} strokeWidth={1.6} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.concept}</div>
                  <div className="text-xs text-detail">
                    {fmtDate(p.date)} · {PAYMENT_METHOD[p.method]}
                  </div>
                </div>
                <span className="text-success tabular">{mxn(p.amount)}</span>
                {me?.role === 'admin' && (
                  <Button size="icon-sm" variant="ghost" aria-label="Eliminar pago" onClick={() => db.remove('payments', p.id)}>
                    <Trash2 size={15} strokeWidth={1.6} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-6">
          <div className="eyebrow">Resumen de la cotización</div>
          <div className="mt-4 flex flex-col">
            <Row label="Subtotal" value={mxn(q.subtotal)} />
            <div className="flex items-center justify-between py-2">
              <span className="text-ink-soft">Descuento</span>
              <MoneyInline label="Descuento" value={discount} onChange={setDiscount} className="w-32 text-right" />
            </div>
            <div className="py-2.5">
              <Toggle checked={includeIva} onChange={setIva} label={`IVA ${q.ivaPercent}%`} description="Para clientes que requieren factura" />
            </div>
            {includeIva && <Row label="IVA" value={mxn(q.iva)} />}
          </div>
          <Estela className="my-4" />
          <div className="flex items-baseline justify-between">
            <span className="text-ink-soft">Total</span>
            <CountUp value={q.total} format={(n) => mxn(n)} className="text-[2.5rem]" />
          </div>
          <ProgressBar value={paidRatio} className="mt-5 h-2.5" />
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-ink-soft">Pagado {mxn(q.paid)}</span>
            <span className="tabular">{Math.round(paidRatio * 100)}%</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[14px] bg-sunken p-3.5">
              <div className="text-xs text-detail">Saldo</div>
              <div className="display-num mt-1 text-xl">{mxn(q.balance)}</div>
            </div>
            <div className="rounded-[14px] bg-sunken p-3.5">
              <div className="text-xs text-detail">Anticipo {q.depositPercent}%</div>
              <div className="display-num mt-1 text-xl">{mxn(q.deposit)}</div>
            </div>
          </div>
          {q.balance <= 0 && q.total > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-[color-mix(in_oklab,var(--success)_10%,var(--surface))] p-3 text-sm text-success">
              <Sparkle /> Evento liquidado
            </div>
          )}
        </Card>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<MessageCircle size={18} strokeWidth={1.6} />} onClick={whatsapp}>
            WhatsApp
          </Button>
          <Button variant="outline" icon={<Printer size={18} strokeWidth={1.6} />} onClick={print}>
            Imprimir
          </Button>
        </div>
      </div>

      <ExtrasSheet
        open={extrasOpen}
        onClose={() => setExtrasOpen(false)}
        onAdd={(x) => {
          setLines([...lineItems, { id: uid('li_'), concept: x.concept, category: x.category, qty: x.perGuest ? ev.guests : 1, price: x.price }])
          toast.success('Agregado a la cotización', x.concept)
        }}
      />
      <PaymentSheet open={payOpen} onClose={() => setPayOpen(false)} ev={ev} suggested={q.paid === 0 ? Math.round(q.deposit) : Math.round(q.balance)} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-ink-soft">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  )
}

function ExtrasSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (x: (typeof EXTRAS_CATALOG)[number]) => void }) {
  const cats = Array.from(new Set(EXTRAS_CATALOG.map((x) => x.category)))
  return (
    <Sheet open={open} onClose={onClose} title="Catálogo de extras" subtitle="Toca para agregarlo a la cotización">
      <div className="flex flex-col gap-6">
        {cats.map((c) => (
          <div key={c}>
            <div className="eyebrow mb-2.5">{c}</div>
            <div className="flex flex-col gap-2">
              {EXTRAS_CATALOG.filter((x) => x.category === c).map((x) => (
                <button key={x.concept} onClick={() => onAdd(x)} className="pressable flex min-h-[56px] items-center justify-between gap-3 rounded-[14px] px-4 text-left ring-1 ring-line ring-inset hover:bg-wash">
                  <span>{x.concept}</span>
                  <span className="flex items-center gap-2 text-sm tabular">
                    {mxn(x.price)}
                    {x.perGuest && <span className="text-xs text-detail">/pers.</span>}
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary">
                      <Plus size={15} strokeWidth={1.6} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function PaymentSheet({ open, onClose, ev, suggested }: { open: boolean; onClose: () => void; ev: RanchEvent; suggested: number }) {
  const me = useMe()
  const [amount, setAmount] = useState<number | ''>('')
  const [method, setMethod] = useState<PaymentMethod>('transferencia')
  const [date, setDate] = useState(today())
  const [concept, setConcept] = useState('')
  const value = amount === '' ? suggested : amount
  return (
    <Sheet open={open} onClose={onClose} title="Registrar pago" subtitle={ev.title} side="center">
      <div className="flex flex-col gap-4">
        <MoneyField label="Monto" value={amount === '' ? undefined : amount} onChange={(n) => setAmount(n || '')} decimals hint={`Si lo dejas vacío se registra lo sugerido: ${mxn(suggested)}`} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Método">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(['transferencia', 'efectivo', 'tarjeta'] as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Concepto">
          <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Anticipo, abono, liquidación…" />
        </Field>
      </div>
      <div className="mt-7 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          icon={<Check size={18} strokeWidth={1.6} />}
          onClick={() => {
            if (!value || value <= 0) return toast.error('Falta el monto', 'Escribe una cantidad mayor a cero.')
            db.upsert('payments', { refType: 'evento', refId: ev.id, amount: value, method, date, concept: concept.trim() || 'Abono', receivedBy: me?.id })
            toast.success('Pago registrado', mxn(value))
            setAmount('')
            setConcept('')
            onClose()
          }}
        >
          Guardar pago
        </Button>
      </div>
    </Sheet>
  )
}

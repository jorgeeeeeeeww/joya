// Pestañas avanzadas del wedding planner: Inspiración, Presupuesto, Plan de pagos,
// Orden de evento (BEO) con firma digital y Proveedores asignados.
import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { CalendarClock, Check, FileSignature, AtSign, MessageCircle, Phone, Plus, Printer, Search, Sparkles, Star, Trash2, Wand2, X } from 'lucide-react'
import type { FloorItem, PaymentPlanItem, RanchEvent, Signature, VendorCategory } from '@/lib/types'
import { db, useCollection, useMe } from '@/lib/store'
import { EVENT_TYPE, TONE, VENDOR_CATEGORY, VENUE } from '@/lib/meta'
import { ITEM_SPECS, itemRect, layoutStats } from '@/lib/floorplan'
import { VENUE_SPACES } from '@/lib/layout'
import { addDaysISO, byProgramTime, visibleNotes, capitalize, daysUntil, fmt, fmtDate, fmtDateFull, mxn, nowIso, today, uid, waLink } from '@/lib/format'
import { pendingInstallments } from '@/lib/planner'
import { Badge, Button, Card, CardHeader, Chip, Empty, Estela, Field, Input, ProgressBar, Segmented, Sheet, Textarea, cx, toast } from '@/components/ui'
import { Donut, Legend } from '@/components/charts'
import { Sparkle } from '@/components/step1'
import { useEventDraft } from './useDraft'
import { useQuote } from './QuoteTab'
import { printHtml } from '@/components/floorplan/FloorPlanEditor'
import { SignaturePad } from './SignaturePad'
import { PhotoButton, PhotoThumb } from '@/components/Photos'

// ── Inspiración ──────────────────────────────────────────
const PRESETS: { name: string; colors: string[] }[] = [
  { name: 'Lavanda romántica', colors: ['#B9A7D6', '#F4ECE6', '#C9B79C', '#8A9A7B', '#E7C6C0'] },
  { name: 'Rosa y dorado', colors: ['#E8B4BC', '#F6E3E1', '#D4A5A5', '#C9A227', '#FBF6F0'] },
  { name: 'Terracota boho', colors: ['#B5654A', '#E2B49A', '#F3E2CF', '#7B6A4B', '#D9A066'] },
  { name: 'Olivo y marfil', colors: ['#6B6A4B', '#A7A77E', '#EFE8DA', '#C9B99A', '#F8F3EA'] },
  { name: 'Noche de gala', colors: ['#1F2A44', '#C9A227', '#EFE3CB', '#5C6989', '#8A4649'] },
]

export function InspirationTab({ ev }: { ev: RanchEvent }) {
  const [palette, setPalette] = useEventDraft(ev, 'palette')
  const [theme, setTheme] = useEventDraft(ev, 'theme')
  const [mood, setMood] = useEventDraft(ev, 'moodNotes')
  const colors = palette ?? []
  const Icon = EVENT_TYPE[ev.type].icon

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
      {/* Tablero: pétalos translúcidos superpuestos (eco del florero) */}
      <Card className="relative overflow-hidden">
        <div className="bg-cielo-soft relative isolate min-h-[340px] p-6 md:p-8">
          <div className="eyebrow">Tablero de inspiración</div>
          <h3 className="heading mt-2 max-w-[16ch] text-[clamp(1.8rem,1.4rem+1.6vw,2.6rem)]">{theme || 'Escribe la temática del evento'}</h3>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">{mood || 'Describe flores, texturas, luces y el ambiente que sueña la clienta.'}</p>
          <div aria-hidden className="pointer-events-none absolute right-[-30px] bottom-[-40px] h-[260px] w-[300px]">
            {colors.slice(0, 6).map((c, i) => {
              const a = (i / Math.max(colors.length, 1)) * Math.PI * 2
              return (
                <motion.span
                  key={i + c}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 0.82, scale: 1 }}
                  transition={{ duration: 0.8, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute rounded-full mix-blend-multiply dark:mix-blend-screen"
                  style={{ width: 150, height: 150, left: 90 + Math.cos(a) * 62, top: 60 + Math.sin(a) * 52, background: c }}
                />
              )
            })}
          </div>
          <div className="relative mt-8 flex items-center gap-2 text-sm text-ink-soft">
            <Icon size={16} strokeWidth={1.6} /> {EVENT_TYPE[ev.type].label} · {VENUE[ev.venue].label} · {ev.guests} invitados
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        <Card className="p-5 md:p-6">
          <div className="flex items-center justify-between">
            <h3 className="heading text-xl">Paleta del evento</h3>
            <Button size="sm" variant="secondary" icon={<Plus size={16} strokeWidth={1.6} />} onClick={() => setPalette([...colors, '#D49F8D'])} disabled={colors.length >= 8}>
              Color
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-4">
            {colors.length === 0 && <p className="text-sm text-ink-soft">Elige una paleta sugerida o agrega colores.</p>}
            {colors.map((c, i) => (
              <div key={i} className="group relative flex flex-col items-center gap-1.5">
                <label className="relative block h-16 w-16 cursor-pointer rounded-full shadow-[var(--shadow-1)] ring-4 ring-surface" style={{ background: c }}>
                  <input type="color" value={c} onChange={(e) => setPalette(colors.map((x, j) => (j === i ? e.target.value : x)))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`Cambiar color ${i + 1}`} />
                </label>
                <span className="text-[11px] text-detail tabular uppercase">{c}</span>
                <button onClick={() => setPalette(colors.filter((_, j) => j !== i))} aria-label="Quitar color" className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-paper opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <Estela className="my-5" />
          <div className="eyebrow mb-3">Paletas sugeridas</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => setPalette(p.colors)} className="pressable flex items-center gap-3 rounded-[14px] p-2.5 text-left ring-1 ring-line ring-inset hover:bg-wash">
                <span className="flex">
                  {p.colors.map((c, i) => (
                    <span key={i} className="h-6 w-6 rounded-full ring-2 ring-surface" style={{ background: c, marginLeft: i ? -7 : 0 }} />
                  ))}
                </span>
                <span className="text-sm">{p.name}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="heading text-xl">Fotos de referencia</h3>
              <p className="mt-0.5 text-sm text-ink-soft">Lo que la clienta te mandó: centros de mesa, flores, pastel…</p>
            </div>
            <PhotoButton label="Agregar" onAdded={(id) => db.patch('events', ev.id, { inspirationPhotoIds: [...(ev.inspirationPhotoIds ?? []), id] })} />
          </div>
          {(ev.inspirationPhotoIds?.length ?? 0) > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {ev.inspirationPhotoIds!.map((id) => (
                <PhotoThumb key={id} id={id} size={96} onRemove={() => db.patch('events', ev.id, { inspirationPhotoIds: ev.inspirationPhotoIds!.filter((x) => x !== id) })} />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-[14px] bg-sunken px-4 py-6 text-center text-sm text-ink-soft">Aún no hay fotos. Toca “Agregar” para tomar o subir una.</p>
          )}
        </Card>
        <Card className="p-5 md:p-6">
          <div className="grid gap-4">
            <Field label="Temática">
              <Input value={theme ?? ''} onChange={(e) => setTheme(e.target.value || undefined)} placeholder="Ej. Jardín romántico en lavanda" />
            </Field>
            <Field label="Ambiente, flores y detalles" hint="Lo verá todo el equipo en la orden de evento">
              <Textarea value={mood ?? ''} onChange={(e) => setMood(e.target.value || undefined)} placeholder="Flores silvestres, velas, caminos de lino, luces colgantes…" />
            </Field>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ── Presupuesto ──────────────────────────────────────────
export function BudgetTab({ ev }: { ev: RanchEvent }) {
  const [budget, setBudget] = useEventDraft(ev, 'clientBudget')
  const q = useQuote(ev, ev.lineItems, ev.discount, ev.includeIva)
  const cats = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of ev.lineItems) m.set(l.category, (m.get(l.category) ?? 0) + l.qty * l.price)
    const tones = ['sky', 'rose', 'butter', 'mint', 'lavender', 'sage', 'peach'] as const
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, tone: tones[i % tones.length]! }))
  }, [ev.lineItems])
  const b = budget ?? 0
  const diff = b - q.total
  const ratio = b ? q.total / b : 0
  const perGuest = ev.guests ? q.total / ev.guests : 0

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <Card className="p-6">
        <div className="eyebrow">Presupuesto de la clienta</div>
        <div className="mt-3 flex items-end gap-3">
          <span className="display-num text-[3rem]">{mxn(b)}</span>
        </div>
        <Field label="Ajustar presupuesto" className="mt-4">
          <Input type="number" inputMode="decimal" value={budget ?? ''} placeholder="Ej. 250000" onChange={(e) => setBudget(e.target.value ? Math.max(0, Number(e.target.value)) : undefined)} className="tabular" />
        </Field>
        <Estela className="my-6" />
        <div className="flex items-baseline justify-between">
          <span className="text-ink-soft">Cotización actual</span>
          <span className="display-num text-[2rem]">{mxn(q.total)}</span>
        </div>
        <ProgressBar value={Math.min(1, ratio)} tone={ratio > 1 ? 'rose' : undefined} className="mt-4 h-2.5" />
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-ink-soft">{b ? `${Math.round(ratio * 100)}% del presupuesto` : 'Sin presupuesto definido'}</span>
          {b > 0 && <span className={diff >= 0 ? 'text-success' : 'text-danger'}>{diff >= 0 ? `Quedan ${mxn(diff)}` : `Excede ${mxn(-diff)}`}</span>}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-[14px] bg-sunken p-4">
            <div className="text-xs text-detail">Por invitado</div>
            <div className="display-num mt-1 text-2xl">{mxn(perGuest)}</div>
          </div>
          <div className="rounded-[14px] bg-sunken p-4">
            <div className="text-xs text-detail">Presupuesto por invitado</div>
            <div className="display-num mt-1 text-2xl">{mxn(ev.guests ? b / ev.guests : 0)}</div>
          </div>
        </div>
        {b > 0 && diff < 0 && (
          <p className="mt-5 rounded-[14px] bg-[color-mix(in_oklab,var(--danger)_10%,var(--surface))] p-4 text-sm text-danger">
            Para acercarte al presupuesto, revisa los extras de mayor costo o propón el paquete anterior.
          </p>
        )}
      </Card>
      <Card>
        <CardHeader title="¿En qué se va el dinero?" subtitle={`${ev.lineItems.length} conceptos`} />
        <div className="flex flex-col items-center gap-6 p-6 sm:flex-row">
          <Donut segments={cats.length ? cats : [{ label: 'Sin conceptos', value: 1, tone: 'sky' }]} center={<><span className="display-num text-xl">{cats.length}</span><span className="text-xs text-detail">rubros</span></>} />
          <div className="w-full">
            <Legend items={cats.map((c) => ({ label: c.label, tone: c.tone, value: mxn(c.value) }))} />
          </div>
        </div>
        <div className="divide-y divide-line px-6 pb-4">
          {[...ev.lineItems]
            .sort((a, b2) => b2.qty * b2.price - a.qty * a.price)
            .map((l) => {
              const v = l.qty * l.price
              return (
                <div key={l.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{l.concept}</div>
                    <div className="text-xs text-detail">{l.category}</div>
                  </div>
                  <span className="text-xs text-ink-3 tabular">{q.subtotal ? Math.round((v / q.subtotal) * 100) : 0}%</span>
                  <span className="w-28 text-right tabular">{mxn(v)}</span>
                </div>
              )
            })}
        </div>
      </Card>
    </div>
  )
}

// ── Plan de pagos ────────────────────────────────────────
export function PaymentPlanTab({ ev }: { ev: RanchEvent }) {
  const me = useMe()
  const [plan, setPlan] = useEventDraft(ev, 'paymentPlan')
  const q = useQuote(ev, ev.lineItems, ev.discount, ev.includeIva)
  const items = useMemo(() => [...(plan ?? [])].sort((a, b) => a.due.localeCompare(b.due)), [plan])
  const pending = useMemo(() => pendingInstallments({ ...ev, paymentPlan: items }, q.paid), [ev, items, q.paid])
  const planSum = items.reduce((n, p) => n + p.amount, 0)
  const t = today()

  const generate = () => {
    const total = Math.round(q.total)
    const d1 = t
    const d2 = addDaysISO(ev.date, -30) > t ? addDaysISO(ev.date, -30) : addDaysISO(t, 7)
    const d3 = addDaysISO(ev.date, -7) > d2 ? addDaysISO(ev.date, -7) : addDaysISO(d2, 3)
    const a = Math.round(total * 0.3)
    setPlan([
      { id: uid('pp_'), label: 'Anticipo', due: d1, amount: a },
      { id: uid('pp_'), label: 'Segundo pago', due: d2, amount: a },
      { id: uid('pp_'), label: 'Liquidación', due: d3, amount: total - a * 2 },
    ])
    toast.success('Plan de pagos generado', '30% · 30% · 40%')
  }
  const update = (id: string, patch: Partial<PaymentPlanItem>) => setPlan(items.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const markPaid = (p: PaymentPlanItem, remaining: number) => {
    db.upsert('payments', { refType: 'evento', refId: ev.id, amount: Math.round(remaining), method: 'transferencia', date: today(), concept: p.label, receivedBy: me?.id })
    toast.success('Pago registrado', `${p.label} · ${mxn(remaining)}`)
  }
  const next = pending[0]
  const reminder = next
    ? `Hola ${ev.clientName.split(' ')[0]}, te recordamos con cariño el ${next.label.toLowerCase()} de ${ev.title} por ${mxn(next.remaining)}, con fecha ${fmtDateFull(next.due)}. Gracias por confiar en Jardines La Joya ✦`
    : ''

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader
          title="Plan de pagos"
          subtitle={items.length ? `${items.length} pagos programados` : 'Programa anticipo, abonos y liquidación'}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={<Wand2 size={16} strokeWidth={1.6} />} onClick={generate}>
                Generar
              </Button>
              <Button size="sm" variant="outline" icon={<Plus size={16} strokeWidth={1.6} />} onClick={() => setPlan([...items, { id: uid('pp_'), label: 'Abono', due: addDaysISO(t, 14), amount: 0 }])}>
                Pago
              </Button>
            </div>
          }
        />
        {items.length === 0 ? (
          <Empty kind="pagos" title="Sin plan de pagos" body="Genera uno automático (30 · 30 · 40) o agrega pagos a tu medida." action={<Button onClick={generate}>Generar plan</Button>} />
        ) : (
          <ol className="relative px-5 pt-5 pb-3 md:px-6">
            <span aria-hidden className="absolute top-8 bottom-8 left-[42px] w-px bg-line-strong md:left-[46px]" />
            {items.map((p) => {
              const pend = pending.find((x) => x.id === p.id)
              const paid = !pend
              const partial = pend && pend.paidPart > 0
              const late = !paid && p.due < t
              return (
                <li key={p.id} className="relative mb-4 flex gap-4">
                  <span className={cx('relative z-[1] mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-4 ring-surface', paid ? 'bg-success text-paper' : late ? 'bg-[color-mix(in_oklab,var(--danger)_14%,var(--surface))] text-danger' : 'bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night')}>
                    {paid ? <Check size={18} strokeWidth={2} /> : <CalendarClock size={18} strokeWidth={1.6} />}
                  </span>
                  <div className="min-w-0 flex-1 rounded-[18px] bg-sunken/70 p-4">
                    <div className="grid gap-2 sm:grid-cols-[1fr_150px_140px]">
                      <input value={p.label} onChange={(e) => update(p.id, { label: e.target.value })} className="rounded-[10px] bg-transparent px-1 py-1 font-medium outline-none focus:bg-surface" aria-label="Concepto" />
                      <Input type="date" value={p.due} onChange={(e) => update(p.id, { due: e.target.value })} className="h-10" aria-label="Fecha límite" />
                      <Input type="number" inputMode="decimal" value={p.amount} onChange={(e) => update(p.id, { amount: Math.max(0, Number(e.target.value)) })} className="h-10 text-right tabular" aria-label="Monto" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {paid ? <Badge tone="sage" sparkle>Pagado</Badge> : late ? <Badge tone="rose">Vencido · {fmtDate(p.due)}</Badge> : <Badge tone="sky">{capitalize(fmt(p.due, "EEEE d 'de' MMM"))}</Badge>}
                      {partial && <Badge tone="butter">Abonado {mxn(pend!.paidPart)}</Badge>}
                      <span className="ml-auto flex gap-1.5">
                        {!paid && (
                          <Button size="sm" variant="soft" tone="sage" icon={<Check size={15} strokeWidth={1.6} />} onClick={() => markPaid(p, pend!.remaining)}>
                            Marcar pagado
                          </Button>
                        )}
                        <Button size="icon-sm" variant="ghost" aria-label="Quitar pago" onClick={() => setPlan(items.filter((x) => x.id !== p.id))}>
                          <Trash2 size={15} strokeWidth={1.6} />
                        </Button>
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Card>
      <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <div className="text-xs text-detail">Pagado de {mxn(q.total)}</div>
          <div className="display-num mt-2 text-[2.4rem]">{mxn(q.paid)}</div>
          <ProgressBar value={q.total ? q.paid / q.total : 0} className="mt-4 h-2.5" />
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-ink-soft">Saldo</span>
            <span className="tabular">{mxn(q.balance)}</span>
          </div>
          {items.length > 0 && Math.abs(planSum - q.total) > 1 && (
            <p className="mt-4 rounded-[14px] bg-[color-mix(in_oklab,var(--warning)_12%,var(--surface))] p-3 text-xs text-warning">
              El plan suma {mxn(planSum)} y la cotización {mxn(q.total)}. Ajusta los montos o vuelve a generarlo.
            </p>
          )}
        </Card>
        {next && (
          <Card className="p-5">
            <div className="eyebrow">Siguiente cobro</div>
            <div className="heading mt-2 text-xl">{next.label}</div>
            <div className="display-num mt-1 text-[2rem]">{mxn(next.remaining)}</div>
            <div className="mt-1 text-sm text-ink-soft">
              {fmtDateFull(next.due)} · {daysUntil(next.due) < 0 ? `vencido hace ${-daysUntil(next.due)} días` : daysUntil(next.due) === 0 ? 'vence hoy' : `en ${daysUntil(next.due)} días`}
            </div>
            <a href={waLink(ev.phone, reminder)} target="_blank" rel="noopener" className="mt-4 block">
              <Button variant="secondary" className="w-full" icon={<MessageCircle size={17} strokeWidth={1.6} />}>
                Recordar por WhatsApp
              </Button>
            </a>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Plano miniatura (pantalla con tokens; impresión con colores fijos) ──
const RAW_FLOOR = { floor: '#FCF6F1', wall: '#74484E', lawn: '#E6E1D0', ink: '#43222A' }

export function MiniPlan({ ev, raw = false, className, id }: { ev: RanchEvent; raw?: boolean; className?: string; id?: string }) {
  const sp = VENUE_SPACES[ev.venue]
  const fill = (it: FloorItem) => (raw ? TONE[ITEM_SPECS[it.type].tone].raw : TONE[ITEM_SPECS[it.type].tone].hex)
  const floor = raw ? (ev.venue === 'jardin' ? RAW_FLOOR.lawn : RAW_FLOOR.floor) : ev.venue === 'jardin' ? 'color-mix(in oklab, var(--sage) 22%, var(--surface))' : 'var(--surface)'
  const wall = raw ? RAW_FLOOR.wall : 'var(--ink-soft)'
  return (
    <svg id={id} viewBox={`-1 -1 ${sp.w + 2} ${sp.h + 2}`} className={className} role="img" aria-label={`Plano de ${sp.label}`} xmlns="http://www.w3.org/2000/svg">
      <rect x={-0.4} y={-0.4} width={sp.w + 0.8} height={sp.h + 0.8} rx={0.6} fill={wall} />
      <rect x={0} y={0} width={sp.w} height={sp.h} rx={0.3} fill={floor} />
      {ev.venue === 'jardin' && <circle cx={VENUE_SPACES.jardin.obstacle.x} cy={VENUE_SPACES.jardin.obstacle.y} r={VENUE_SPACES.jardin.obstacle.r} fill={raw ? '#EEDBD0' : 'var(--sunken)'} />}
      {ev.layout.map((it) => {
        const spec = ITEM_SPECS[it.type]
        const r = itemRect(it)
        return spec.shape === 'circle' ? (
          <circle key={it.id} cx={it.x} cy={it.y} r={(it.w ?? spec.w) / 2 + (spec.isTable && it.type !== 'periquera' ? 0.35 : 0)} fill={fill(it)} fillOpacity={0.55} />
        ) : (
          <rect key={it.id} x={r.x} y={r.y} width={r.w} height={r.h} rx={0.2} fill={fill(it)} fillOpacity={spec.isTable ? 0.55 : 0.4} />
        )
      })}
      {ev.layout
        .filter((it) => ITEM_SPECS[it.type].isTable && it.number)
        .map((it) => (
          <text key={'t' + it.id} x={it.x} y={it.y} fontSize={0.7} textAnchor="middle" dominantBaseline="central" fill={raw ? RAW_FLOOR.ink : 'var(--ink)'} fontFamily="system-ui, sans-serif">
            {it.number}
          </text>
        ))}
    </svg>
  )
}

// ── Orden de evento (BEO) + firma ────────────────────────
export function BeoTab({ ev }: { ev: RanchEvent }) {
  const employees = useCollection('employees')
  const vendors = useCollection('vendors')
  const [menu, setMenu] = useEventDraft(ev, 'menu')
  const [setup, setSetup] = useEventDraft(ev, 'setupNotes')
  const [signOpen, setSignOpen] = useState(false)
  const coordinator = employees.find((e) => e.id === ev.coordinatorId)
  const assigned = vendors.filter((v) => ev.vendorIds?.includes(v.id))
  const stats = layoutStats(ev.layout)
  const timeline = [...ev.timeline].sort(byProgramTime)
  const pieces = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of ev.layout) m.set(ITEM_SPECS[it.type].label, (m.get(ITEM_SPECS[it.type].label) ?? 0) + 1)
    return Array.from(m.entries())
  }, [ev.layout])
  const sigs = ev.signatures ?? []

  const print = () => {
    const svg = document.getElementById('beo-mini-raw')?.outerHTML ?? ''
    const esc = (s?: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')
    printHtml(
      `Orden de evento · ${ev.title}`,
      `<div class="brand"><div><h1>Orden de evento</h1><div class="muted">${esc(ev.title)} · Folio ${ev.id.slice(-6).toUpperCase()}</div></div><div style="text-align:right"><b>Jardines La Joya</b><div class="muted">Tototlán, Jalisco</div></div></div>
       <table><tr><td><b>${fmtDateFull(ev.date)}</b><div class="muted">${ev.startTime} – ${ev.endTime}</div></td><td><b>${VENUE[ev.venue].label}</b><div class="muted">${ev.guests} invitados · ${stats.tables} mesas · ${stats.seats} lugares</div></td><td><b>${esc(ev.clientName)}</b><div class="muted">${esc(ev.phone)} ${esc(ev.email)}</div></td><td><b>Coordinación</b><div class="muted">${esc(coordinator?.name ?? 'Sin asignar')}</div></td></tr></table>
       ${ev.theme ? `<h2>Temática</h2><p>${esc(ev.theme)}${ev.moodNotes ? `<br/><span class="muted">${esc(ev.moodNotes)}</span>` : ''}</p>` : ''}
       <h2>Programa</h2><table>${timeline.map((t) => `<tr><td style="width:70px"><b>${t.time}</b></td><td>${esc(t.title)}</td><td class="muted">${esc(t.owner)}</td></tr>`).join('')}</table>
       <h2>Montaje</h2><div style="display:flex;gap:16px;align-items:flex-start"><div style="flex:1">${svg}</div><div style="flex:1"><p>${esc(setup) || '<span class="muted">Sin notas</span>'}</p><table>${pieces.map(([k, v]) => `<tr><td>${k}</td><td class="r">${v}</td></tr>`).join('')}</table></div></div>
       <h2>Menú</h2><p>${esc(menu) || '<span class="muted">Por definir</span>'}</p>
       <h2>Proveedores</h2><table>${[...assigned.map((v) => `<tr><td>${esc(v.name)}</td><td>${VENDOR_CATEGORY[v.category].label}</td><td class="r">${esc(v.phone)}</td></tr>`), ...ev.providers.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.service)}</td><td class="r">${esc(p.phone)}</td></tr>`)].join('') || '<tr><td class="muted">Sin proveedores</td></tr>'}</table>
       ${visibleNotes(ev.notes) ? `<h2>Notas</h2><p>${esc(visibleNotes(ev.notes))}</p>` : ''}
       <h2>Firmas</h2><div style="display:flex;gap:24px;flex-wrap:wrap">${sigs.map((s) => `<div style="text-align:center"><img src="${s.dataUrl}" style="height:70px"/><div style="border-top:1px solid #74484E;padding-top:4px;font-size:12px">${esc(s.name)} · ${s.document === 'beo' ? 'Orden de evento' : 'Contrato'} · ${fmtDate(s.at.slice(0, 10))}</div></div>`).join('') || '<div class="muted">Pendiente de firma</div>'}</div>`,
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 pt-6 pb-5">
          <div>
            <div className="eyebrow">Orden de evento · BEO</div>
            <h3 className="heading mt-2 text-2xl">{ev.title}</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {capitalize(fmt(ev.date, "EEEE d 'de' MMMM yyyy"))} · {ev.startTime}–{ev.endTime} · {VENUE[ev.venue].label}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" icon={<Printer size={17} strokeWidth={1.6} />} onClick={print}>
              Imprimir
            </Button>
            <Button icon={<FileSignature size={17} strokeWidth={1.6} />} onClick={() => setSignOpen(true)}>
              Firmar
            </Button>
          </div>
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-4">
          {[
            ['Invitados', String(ev.guests)],
            ['Mesas', String(stats.tables)],
            ['Lugares', String(stats.seats)],
            ['Coordinación', coordinator?.name.split(' ')[0] ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-6 py-4">
              <div className="text-xs text-detail">{k}</div>
              <div className="display-num mt-1 text-2xl">{v}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <section>
            <h4 className="eyebrow mb-3">Programa</h4>
            <ol className="flex flex-col gap-2">
              {timeline.map((t) => (
                <li key={t.id} className="flex gap-3 text-sm">
                  <span className="w-12 shrink-0 tabular text-ink-soft">{t.time}</span>
                  <span className="min-w-0 flex-1">{t.title}</span>
                </li>
              ))}
              {timeline.length === 0 && <li className="text-sm text-ink-soft">Agrega el programa en su pestaña.</li>}
            </ol>
          </section>
          <section>
            <h4 className="eyebrow mb-3">Montaje</h4>
            <div className="overflow-hidden rounded-[14px] bg-sunken p-3">
              <MiniPlan ev={ev} className="block h-auto w-full" />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pieces.map(([k, v]) => (
                <Badge key={k} tone="sky">
                  {v} · {k}
                </Badge>
              ))}
            </div>
          </section>
          <Field label="Notas de montaje" className="md:col-span-1">
            <Textarea value={setup ?? ''} onChange={(e) => setSetup(e.target.value || undefined)} placeholder="Ceremonia en el jardín, 180 sillas Tiffany, arco floral…" />
          </Field>
          <Field label="Menú">
            <Textarea value={menu ?? ''} onChange={(e) => setMenu(e.target.value || undefined)} placeholder="Entrada · plato fuerte · postre · bebidas" />
          </Field>
        </div>
        {/* Versión con colores fijos para imprimir (var() no existe fuera de la app) */}
        <div className="hidden" aria-hidden>
          <MiniPlan ev={ev} raw id="beo-mini-raw" />
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Firmas" subtitle={sigs.length ? `${sigs.length} registradas` : 'Pendiente de firma de la clienta'} icon={<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary"><FileSignature size={18} strokeWidth={1.6} /></span>} />
          <div className="flex flex-col gap-3 p-5">
            {sigs.length === 0 && <Empty kind="firmas" title="Sin firmas" body="La clienta puede firmar con el dedo en esta tablet." action={<Button onClick={() => setSignOpen(true)}>Firmar ahora</Button>} />}
            {sigs.map((s, i) => (
              <div key={i} className="flex items-center gap-4 rounded-[14px] bg-sunken/70 p-3">
                <img src={s.dataUrl} alt={`Firma de ${s.name}`} className="h-14 w-28 rounded-[10px] bg-paper object-contain ring-1 ring-line" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="text-xs text-detail">
                    {s.document === 'beo' ? 'Orden de evento' : 'Contrato'} · {fmtDate(s.at.slice(0, 10))}
                  </div>
                </div>
                <Badge tone="sage" sparkle>
                  Firmado
                </Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h4 className="eyebrow mb-3">Proveedores del evento</h4>
          <div className="flex flex-col gap-2">
            {[...assigned.map((v) => ({ id: v.id, name: v.name, service: VENDOR_CATEGORY[v.category].label })), ...ev.providers.map((p) => ({ id: p.id, name: p.name, service: p.service }))].map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-ink-soft">{p.service}</span>
              </div>
            ))}
            {!assigned.length && !ev.providers.length && <p className="text-sm text-ink-soft">Asígnalos en la pestaña Proveedores.</p>}
          </div>
        </Card>
      </div>
      <SignSheet open={signOpen} onClose={() => setSignOpen(false)} ev={ev} />
    </div>
  )
}

function SignSheet({ open, onClose, ev }: { open: boolean; onClose: () => void; ev: RanchEvent }) {
  const [name, setName] = useState(ev.clientName)
  const [doc, setDoc] = useState<Signature['document']>('beo')
  const [data, setData] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  return (
    <Sheet open={open} onClose={onClose} title="Firma digital" subtitle={`${doc === 'beo' ? 'Orden de evento' : 'Contrato'} · ${ev.title}`} side="center" wide>
      <div className="flex flex-col gap-4">
        <Segmented
          value={doc}
          onChange={setDoc}
          options={[
            { value: 'beo', label: 'Orden de evento' },
            { value: 'contrato', label: 'Contrato' },
          ]}
        />
        <Field label="Nombre de quien firma">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <SignaturePad onChange={setData} />
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-soft">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--primary)]" />
          <span>
            Confirmo que revisé {doc === 'beo' ? 'la orden de evento (programa, montaje, menú y proveedores)' : 'el contrato y sus condiciones de pago'} de {ev.title}.
          </span>
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!data || !name.trim() || !accepted}
          icon={<Check size={18} strokeWidth={1.6} />}
          onClick={() => {
            if (!data) return
            db.patch('events', ev.id, { signatures: [...(ev.signatures ?? []), { name: name.trim(), dataUrl: data, at: nowIso(), document: doc }] }, { summary: `Firma de ${name.trim()} en ${doc === 'beo' ? 'la orden de evento' : 'el contrato'} de ${ev.title}` })
            toast.success('Firma guardada', name.trim())
            setData(null)
            setAccepted(false)
            onClose()
          }}
        >
          Guardar firma
        </Button>
      </div>
    </Sheet>
  )
}

// ── Proveedores asignados ────────────────────────────────
export function VendorsTab({ ev }: { ev: RanchEvent }) {
  const vendors = useCollection('vendors')
  const [open, setOpen] = useState(false)
  const assigned = vendors.filter((v) => ev.vendorIds?.includes(v.id))
  const remove = (id: string) => db.patch('events', ev.id, { vendorIds: (ev.vendorIds ?? []).filter((x) => x !== id) })
  const missing = (['banquete', 'musica', 'flores', 'foto'] as VendorCategory[]).filter((c) => !assigned.some((v) => v.category === c))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="heading text-2xl">Proveedores del evento</h3>
          <p className="mt-1 text-sm text-ink-soft">{assigned.length ? `${assigned.length} asignados desde el directorio` : 'Elige del directorio a quienes participan'}</p>
        </div>
        <Button icon={<Plus size={18} strokeWidth={1.6} />} onClick={() => setOpen(true)}>
          Asignar proveedor
        </Button>
      </div>
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[18px] bg-sunken/70 p-4 text-sm">
          <Sparkles size={16} strokeWidth={1.6} className="text-chispa-soft" />
          <span className="text-ink-soft">Aún sin asignar:</span>
          {missing.map((c) => (
            <Badge key={c} tone={VENDOR_CATEGORY[c].tone}>
              {VENDOR_CATEGORY[c].label}
            </Badge>
          ))}
        </div>
      )}
      {assigned.length === 0 ? (
        <Card>
          <Empty kind="proveedores" title="Sin proveedores asignados" body="Banquete, música, flores y foto son los más comunes." action={<Button onClick={() => setOpen(true)}>Ver directorio</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assigned.map((v) => (
            <Card key={v.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Badge tone={VENDOR_CATEGORY[v.category].tone}>{VENDOR_CATEGORY[v.category].label}</Badge>
                  <div className="heading mt-2 truncate text-lg">{v.name}</div>
                  <Rating value={v.rating} />
                </div>
                <Button size="icon-sm" variant="ghost" aria-label="Quitar del evento" onClick={() => remove(v.id)}>
                  <X size={16} strokeWidth={1.6} />
                </Button>
              </div>
              <VendorActions phone={v.phone} instagram={v.instagram} message={`Hola ${v.name}, te escribimos de Jardines La Joya por ${ev.title} el ${fmtDateFull(ev.date)} (${ev.guests} invitados).`} />
            </Card>
          ))}
        </div>
      )}
      <AssignVendorSheet open={open} onClose={() => setOpen(false)} ev={ev} />
    </div>
  )
}

export function Rating({ value }: { value: number }) {
  return (
    <span className="mt-1 inline-flex items-center gap-0.5" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Sparkle key={i} className={cx('text-[13px]', i <= value ? 'text-chispa-soft' : 'text-line-strong')} />
      ))}
    </span>
  )
}

export function VendorActions({ phone, instagram, message }: { phone?: string; instagram?: string; message: string }) {
  return (
    <div className="mt-4 flex gap-2">
      {phone && (
        <a href={`tel:${phone}`} className="flex-1">
          <Button size="sm" variant="outline" className="w-full" icon={<Phone size={15} strokeWidth={1.6} />}>
            Llamar
          </Button>
        </a>
      )}
      {phone && (
        <a href={waLink(phone, message)} target="_blank" rel="noopener" className="flex-1">
          <Button size="sm" variant="secondary" className="w-full" icon={<MessageCircle size={15} strokeWidth={1.6} />}>
            WhatsApp
          </Button>
        </a>
      )}
      {instagram && (
        <a href={`https://instagram.com/${instagram.replace(/^@/, '')}`} target="_blank" rel="noopener">
          <Button size="icon-sm" variant="ghost" aria-label="Instagram">
            <AtSign size={16} strokeWidth={1.6} />
          </Button>
        </a>
      )}
    </div>
  )
}

function AssignVendorSheet({ open, onClose, ev }: { open: boolean; onClose: () => void; ev: RanchEvent }) {
  const vendors = useCollection('vendors')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<VendorCategory | 'todas'>('todas')
  const ids = ev.vendorIds ?? []
  const list = vendors
    .filter((v) => cat === 'todas' || v.category === cat)
    .filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.rating - a.rating)
  const toggle = (id: string) => db.patch('events', ev.id, { vendorIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] })
  const cats = Array.from(new Set(vendors.map((v) => v.category)))
  return (
    <Sheet open={open} onClose={onClose} title="Directorio de proveedores" subtitle="Toca para asignar o quitar">
      <div className="relative mb-3">
        <Search size={17} strokeWidth={1.6} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proveedor" className="pl-11" />
      </div>
      <div className="no-scrollbar -mx-6 mb-4 flex gap-2 overflow-x-auto px-6">
        <Chip active={cat === 'todas'} onClick={() => setCat('todas')}>
          Todos
        </Chip>
        {cats.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {VENDOR_CATEGORY[c].label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {list.map((v) => {
          const on = ids.includes(v.id)
          return (
            <button key={v.id} onClick={() => toggle(v.id)} className={cx('pressable flex items-center gap-3 rounded-[18px] p-3.5 text-left ring-1 ring-inset', on ? 'bg-[color-mix(in_oklab,var(--primary)_8%,var(--surface))] ring-primary' : 'ring-line hover:bg-wash')}>
              <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] ring-[1.5px] ring-inset', on ? 'bg-primary text-on-primary ring-primary' : 'ring-line-strong')}>{on && <Check size={14} strokeWidth={2} />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate font-medium">
                  {v.favorite && <Star size={13} strokeWidth={1.6} className="shrink-0 text-chispa-soft" />}
                  {v.name}
                </span>
                <span className="text-xs text-detail">
                  {VENDOR_CATEGORY[v.category].label}
                  {v.priceFrom ? ` · desde ${mxn(v.priceFrom)}` : ''}
                </span>
              </span>
              <Rating value={v.rating} />
            </button>
          )
        })}
        {list.length === 0 && <Empty kind="busqueda" title="Sin resultados" body="Agrega proveedores en el directorio." />}
      </div>
    </Sheet>
  )
}

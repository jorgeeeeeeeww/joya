// Centro de mensajes de la Wedding planner: lo que hay que enviar hoy (calculado solo),
// plantillas editables con variables e historial.
import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { RotateCcw, Send } from 'lucide-react'
import { useMe, useStore } from '@/lib/store'
import { TONE } from '@/lib/meta'
import { ago, fmt } from '@/lib/format'
import { ease, fadeRise, stagger } from '@/lib/motion'
import { Button, Card, CardHeader, Empty, PageHeader, Segmented, Textarea, cx, toast } from '@/components/ui'
import { Sparkle } from '@/components/step1'
import { DEFAULT_TEMPLATES, TEMPLATE_META, fill, saveTemplate, sendItem, useOutbox, useSentLog, useTemplates, type OutboxItem, type TemplateKind } from '@/components/messages/outbox'
import { OutboxCard } from '@/components/messages/OutboxCard'

type Tab = 'hoy' | 'plantillas' | 'historial'

export default function Mensajes() {
  const outbox = useOutbox()
  const log = useSentLog()
  const [tab, setTab] = useState<Tab>('hoy')
  const urgent = outbox.filter((i) => i.urgency <= 1).length
  const byKind = useMemo(() => {
    const m = new Map<TemplateKind, number>()
    for (const i of outbox) m.set(i.kind, (m.get(i.kind) ?? 0) + (i.guests?.length ?? 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [outbox])
  const totalMessages = outbox.reduce((n, i) => n + (i.guests?.length ?? 1), 0)
  const first = outbox[0]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <motion.div variants={fadeRise}>
        <PageHeader
          eyebrow="Mensajes"
          title={totalMessages ? `${totalMessages} ${totalMessages === 1 ? 'mensaje' : 'mensajes'} por enviar` : 'Todo enviado. Bien hecho.'}
          subtitle={`Cada mensaje ya va con nombre, fecha y monto. Tú solo tocas enviar.${urgent ? ` ${urgent} ${urgent === 1 ? 'es urgente' : 'son urgentes'}.` : ''}`}
          primary={first ? { label: first.guests ? 'Ver recordatorios' : 'Enviar el más urgente', icon: <Send size={17} strokeWidth={1.6} />, onClick: () => (first.guests ? setTab('hoy') : (sendItem(first), toast.success('Mensaje listo en WhatsApp', first.title))) } : undefined}
        />
        {byKind.length > 0 && (
          <div className="-mt-1 flex flex-wrap gap-2">
            {byKind.map(([k, n]) => {
              const meta = TEMPLATE_META[k]
              const Icon = meta.icon
              return (
                <span key={k} className="inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 py-1 text-[13px] text-ink-soft ring-1 ring-line ring-inset">
                  <Icon size={15} strokeWidth={1.6} /> {meta.label} <span className="tabular font-semibold text-ink">{n}</span>
                </span>
              )
            })}
          </div>
        )}
      </motion.div>

      <motion.div variants={fadeRise}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'hoy', label: `Para enviar${totalMessages ? ` · ${totalMessages}` : ''}` },
            { value: 'plantillas', label: 'Plantillas' },
            { value: 'historial', label: 'Historial' },
          ]}
        />
      </motion.div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.calma } }}>
        {tab === 'hoy' && <OutboxList items={outbox} />}
        {tab === 'plantillas' && <Templates />}
        {tab === 'historial' && <History log={log} />}
      </motion.div>
    </motion.div>
  )
}

// ── Para enviar hoy ──────────────────────────────────────
function OutboxList({ items }: { items: OutboxItem[] }) {
  if (!items.length)
    return (
      <Card>
        <Empty kind="mensajes" title="No hay mensajes pendientes" body="Cuando un pago esté por vencer, un prospecto necesite seguimiento o falten confirmaciones, aparecerá aquí con el mensaje listo." />
      </Card>
    )
  const sections: { label: string; filter: (i: OutboxItem) => boolean }[] = [
    { label: 'Urgente', filter: (i) => i.urgency <= 1 },
    { label: 'Hoy', filter: (i) => i.urgency === 2 },
    { label: 'Cuando puedas', filter: (i) => i.urgency >= 3 },
  ]
  return (
    <div className="flex flex-col gap-6">
      {sections.map((s) => {
        const list = items.filter(s.filter)
        if (!list.length) return null
        return (
          <section key={s.label}>
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className={cx('h-2 w-2 rounded-full', s.label === 'Urgente' ? 'bg-danger' : s.label === 'Hoy' ? 'bg-chispa-soft' : 'bg-line-strong')} />
              <h2 className="heading text-xl">{s.label}</h2>
              <span className="tabular text-sm text-ink-soft">{list.length}</span>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              <AnimatePresence initial={false}>
                {list.map((i) => (
                  <OutboxCard key={i.key} item={i} hint={i.key === items[0]?.key} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ── Plantillas ───────────────────────────────────────────
const SAMPLE: Record<string, string> = {
  cliente: 'Fernanda',
  evento: 'Boda Fernández & Ruiz',
  fecha: 'sábado 14 de noviembre',
  lugar: 'el salón',
  rancho: 'Jardines La Joya',
  monto: '$50,850',
  concepto: 'segundo pago',
  vence: '30 de octubre',
  invitado: 'Lucía',
  personas: '2 pases',
  limite: '9 de noviembre',
  confirmados: '148',
  pendientes: '22',
  proveedor: 'DJ Neón',
  servicio: 'audio e iluminación',
  hora: '17:30',
  mesa: 'Mesa 7',
}

function Templates() {
  const me = useMe()
  const tpl = useTemplates()
  const ranch = useStore((s) => s.settings.ranchName)
  const [kind, setKind] = useState<TemplateKind>('pago')
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const meta = TEMPLATE_META[kind]
  const text = draft ?? tpl[kind]
  const changed = tpl[kind] !== DEFAULT_TEMPLATES[kind]

  const insert = (v: string) => {
    const el = ref.current
    const token = `{${v}}`
    if (!el) return setDraft(text + token)
    const s = el.selectionStart ?? text.length
    const e = el.selectionEnd ?? text.length
    const next = text.slice(0, s) + token + text.slice(e)
    setDraft(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + token.length, s + token.length)
    })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="p-2">
        {(Object.keys(TEMPLATE_META) as TemplateKind[]).map((k) => {
          const m = TEMPLATE_META[k]
          const Icon = m.icon
          return (
            <button key={k} onClick={() => (setKind(k), setDraft(null))} className={cx('pressable flex w-full items-center gap-3 rounded-[16px] p-3 text-left', kind === k ? 'bg-secondary' : 'hover:bg-wash')}>
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONE[m.tone].soft, TONE[m.tone].ink)}>
                <Icon size={18} strokeWidth={1.6} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{m.label}</span>
                <span className="block truncate text-xs text-detail">{m.hint}</span>
              </span>
              {tpl[k] !== DEFAULT_TEMPLATES[k] && <Sparkle className="ml-auto text-xs text-chispa-soft" />}
            </button>
          )
        })}
      </Card>
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader eyebrow="Plantilla" title={meta.label} subtitle={meta.hint} />
          <div className="p-5 pt-4 md:p-6 md:pt-4">
            <Textarea {...({ ref } as Record<string, unknown>)} value={text} onChange={(e) => setDraft(e.target.value)} className="min-h-[150px]" aria-label="Texto de la plantilla" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="mr-1 self-center text-xs text-detail">Insertar:</span>
              {meta.vars.map((v) => (
                <button key={v} onClick={() => insert(v)} className="pressable h-8 rounded-full bg-sunken px-3 text-xs text-ink hover:bg-wash">
                  {`{${v}}`}
                </button>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button disabled={draft === null || draft === tpl[kind]} onClick={() => (saveTemplate(me?.id, kind, draft), setDraft(null), toast.success('Plantilla guardada'))}>
                Guardar plantilla
              </Button>
              {(changed || draft !== null) && (
                <Button variant="ghost" icon={<RotateCcw size={15} strokeWidth={1.6} />} onClick={() => (saveTemplate(me?.id, kind, null), setDraft(null), toast.info('Se restauró el texto original'))}>
                  Restaurar original
                </Button>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-5 md:p-6">
          <div className="eyebrow mb-3">Vista previa en WhatsApp</div>
          <div className="rounded-[var(--r-lg)] bg-cielo-soft p-5">
            <div className="ml-auto max-w-[420px] rounded-[18px] rounded-tr-[6px] bg-surface px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line shadow-[var(--shadow-1)]">
              {fill(text, { ...SAMPLE, rancho: ranch })}
              <div className="mt-1 text-right text-[11px] text-ink-3">{fmt(new Date(), 'HH:mm')} ✓✓</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ── Historial ────────────────────────────────────────────
function History({ log }: { log: ReturnType<typeof useSentLog> }) {
  if (!log.length)
    return (
      <Card>
        <Empty kind="mensajes" title="Aún no hay envíos" body="Cada mensaje que mandes desde aquí queda registrado con fecha y destinatario." />
      </Card>
    )
  return (
    <Card>
      <CardHeader eyebrow="Registro" title="Mensajes enviados" subtitle="Desde este dispositivo · también quedan anotados en cada evento" />
      <ul className="p-3 md:p-4">
        {log.map((l, i) => {
          const meta = TEMPLATE_META[l.kind]
          const Icon = meta.icon
          return (
            <li key={i} className="flex items-center gap-3 rounded-[14px] px-2 py-3 hover:bg-wash">
              <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', TONE[meta.tone].soft, TONE[meta.tone].ink)}>
                <Icon size={16} strokeWidth={1.6} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {meta.label} · {l.to}
                </span>
                <span className="block truncate text-xs text-detail">{l.label}</span>
              </span>
              <span className="tabular shrink-0 text-xs text-ink-3">{ago(l.at)}</span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

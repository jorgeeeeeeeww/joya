import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ClipboardPaste, Eye, MessageCircle, Phone, Plus, Search, Sun, Trash2, UserPlus, Zap } from 'lucide-react'
import type { Guest, Provider, RanchEvent, TimelineItem } from '@/lib/types'
import { ITEM_SPECS } from '@/lib/floorplan'
import { today, uid, waLink } from '@/lib/format'
import { haptic } from '@/lib/motion'
import { Badge, Button, Card, CardHeader, Chip, Empty, Field, Input, ProgressRing, Select, Sheet, Textarea, cx, toast } from '@/components/ui'
import { CountUp, Sparkle } from '@/components/step1'
import { useEventDraft } from './useDraft'
import { SortableList } from '@/components/interact'
import { withUndo } from '@/lib/undo'

/** Casilla redonda grande (44 px) con check que aparece en fundido */
function RoundCheck({ done, onClick, label, tone = 'success' }: { done: boolean; onClick: () => void; label: string; tone?: 'success' | 'primary' }) {
  return (
    <button
      onClick={() => {
        haptic.select()
        onClick()
      }}
      aria-label={label}
      aria-pressed={done}
      className={cx(
        'pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--dur-3)]',
        done ? (tone === 'success' ? 'bg-success text-paper' : 'bg-primary text-on-primary') : 'ring-[1.5px] ring-line-strong ring-inset hover:bg-wash',
      )}
    >
      <motion.span initial={false} animate={{ opacity: done ? 1 : 0, scale: done ? 1 : 0.6 }} transition={{ duration: 0.18 }}>
        <Check size={18} strokeWidth={2} />
      </motion.span>
    </button>
  )
}

// ── Invitados ────────────────────────────────────────────
export function GuestsTab({ ev }: { ev: RanchEvent }) {
  const [guests, setGuests] = useEventDraft(ev, 'guestList')
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [count, setCount] = useState(2)
  const [side, setSide] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [filter, setFilter] = useState<'todos' | 'confirmados' | 'pendientes' | 'sin-mesa'>('todos')

  const tables = useMemo(
    () =>
      ev.layout
        .filter((i) => ITEM_SPECS[i.type].isTable && i.number)
        .map((i) => ({ number: i.number!, seats: i.seats ?? 0, label: i.label }))
        .sort((a, b) => a.number - b.number),
    [ev.layout],
  )
  const occupancy = useMemo(() => {
    const m = new Map<number, number>()
    for (const g of guests) if (g.table) m.set(g.table, (m.get(g.table) ?? 0) + g.count)
    return m
  }, [guests])

  const people = guests.reduce((n, g) => n + g.count, 0)
  const confirmed = guests.filter((g) => g.confirmed).reduce((n, g) => n + g.count, 0)
  const seated = guests.filter((g) => g.table).reduce((n, g) => n + g.count, 0)

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const shown = guests
    .filter((g) => !q || norm(g.name).includes(norm(q)))
    .filter((g) => filter === 'todos' || (filter === 'confirmados' ? g.confirmed : filter === 'pendientes' ? !g.confirmed : !g.table))

  const update = (id: string, patch: Partial<Guest>) => setGuests((list) => list.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  const add = () => {
    if (!name.trim()) return
    setGuests([...guests, { id: uid('g_'), name: name.trim(), count: Math.max(1, count), confirmed: false, side: side || undefined }])
    setName('')
    haptic.light()
  }
  const doImport = () => {
    const parsed: Guest[] = importText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^(.*?)[,;\t]\s*(\d+)\s*$/)
        return { id: uid('g_'), name: (m ? m[1]! : l).trim(), count: m ? Math.max(1, Number(m[2])) : 1, confirmed: false }
      })
    if (!parsed.length) return toast.error('No encontramos nombres', 'Pega un nombre por línea.')
    setGuests([...guests, ...parsed])
    setImportText('')
    setImportOpen(false)
    toast.success(`${parsed.length} invitados importados`)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="Familias o grupos" value={guests.length} />
        <MiniStat label="Personas" value={people} sub={`de ${ev.guests} contratados`} warn={people > ev.guests} />
        <MiniStat label="Confirmados" value={confirmed} sub={people ? `${Math.round((confirmed / people) * 100)}% de la lista` : '—'} accent />
        <MiniStat label="Con mesa" value={seated} sub={`${people - seated} sin mesa`} />
      </div>

      <Card className="p-4 md:p-5">
        <div className="grid gap-2 sm:grid-cols-[1fr_96px_150px_auto]">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Nombre o familia" aria-label="Nombre" />
          <Input type="number" inputMode="numeric" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Personas" className="text-center tabular" />
          <Select value={side} onChange={(e) => setSide(e.target.value)} aria-label="Grupo">
            <option value="">Grupo…</option>
            {['Novia', 'Novio', 'Familia', 'Amigos', 'Trabajo', 'Padrinos'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button icon={<UserPlus size={18} strokeWidth={1.6} />} onClick={add} className="flex-1">
              Agregar
            </Button>
            <Button variant="outline" size="icon" onClick={() => setImportOpen(true)} aria-label="Pegar lista de invitados">
              <ClipboardPaste size={18} strokeWidth={1.6} />
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search size={17} strokeWidth={1.6} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar invitado" className="pl-11" aria-label="Buscar invitado" />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(['todos', 'confirmados', 'pendientes', 'sin-mesa'] as const).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f === 'todos' ? 'Todos' : f === 'confirmados' ? 'Confirmados' : f === 'pendientes' ? 'Por confirmar' : 'Sin mesa'}
            </Chip>
          ))}
        </div>
      </div>

      {guests.length === 0 ? (
        <Card>
          <Empty kind="invitados" title="Aún no hay invitados" body="Agrégalos uno por uno o pega la lista que te mandó la clienta." action={<Button icon={<ClipboardPaste size={18} strokeWidth={1.6} />} onClick={() => setImportOpen(true)}>Pegar lista</Button>} />
        </Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          <AnimatePresence initial={false}>
            {shown.map((g) => {
              const t = tables.find((x) => x.number === g.table)
              const over = t && (occupancy.get(t.number) ?? 0) > t.seats
              return (
                <motion.div key={g.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
                  <RoundCheck done={g.confirmed} onClick={() => update(g.id, { confirmed: !g.confirmed })} label={g.confirmed ? `Quitar confirmación de ${g.name}` : `Confirmar a ${g.name}`} />
                  <div className="min-w-0 flex-1">
                    <input value={g.name} onChange={(e) => update(g.id, { name: e.target.value })} aria-label="Nombre del invitado" className="w-full rounded-[10px] bg-transparent px-1.5 py-0.5 font-medium outline-none hover:bg-wash focus:bg-sunken" />
                    <div className="flex items-center gap-2 px-1.5 text-xs text-ink-soft">
                      {g.side && <span>{g.side}</span>}
                      <span>{g.confirmed ? 'Confirmado' : 'Por confirmar'}</span>
                    </div>
                  </div>
                  <div className="flex items-center rounded-full bg-sunken p-1" role="group" aria-label="Personas">
                    <button onClick={() => update(g.id, { count: Math.max(1, g.count - 1) })} aria-label="Una persona menos" className="pressable h-9 w-9 rounded-full text-ink-soft hover:bg-surface">
                      −
                    </button>
                    <span className="w-7 text-center tabular">{g.count}</span>
                    <button onClick={() => update(g.id, { count: g.count + 1 })} aria-label="Una persona más" className="pressable h-9 w-9 rounded-full text-ink-soft hover:bg-surface">
                      +
                    </button>
                  </div>
                  <Select value={g.table ?? ''} onChange={(e) => update(g.id, { table: e.target.value ? Number(e.target.value) : undefined })} className={cx('h-11 w-36', over && 'border-danger text-danger')} aria-label="Mesa">
                    <option value="">Sin mesa</option>
                    {tables.map((t) => (
                      <option key={t.number} value={t.number}>
                        Mesa {t.number} ({occupancy.get(t.number) ?? 0}/{t.seats})
                      </option>
                    ))}
                  </Select>
                  <Button size="icon-sm" variant="ghost" aria-label={`Quitar a ${g.name}`} onClick={() => setGuests(guests.filter((x) => x.id !== g.id))} className="hover:!text-danger">
                    <Trash2 size={16} strokeWidth={1.6} />
                  </Button>
                </motion.div>
              )
            })}
          </AnimatePresence>
          {shown.length === 0 && <p className="p-6 text-center text-sm text-ink-soft">Nadie coincide con ese filtro.</p>}
        </Card>
      )}

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title="Pegar lista de invitados" subtitle="Un nombre por línea. Si quieres, agrega coma y número de personas." side="center">
        <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={10} placeholder={'Familia Ramírez, 4\nTía Carmen, 2\nLuis Ortega'} className="min-h-[220px] font-mono text-sm" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={doImport}>Importar invitados</Button>
        </div>
      </Sheet>
    </div>
  )
}

function MiniStat({ label, value, sub, warn, accent }: { label: string; value: number; sub?: string; warn?: boolean; accent?: boolean }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-ink-soft">{label}</div>
      <CountUp value={value} className={cx('mt-2 block text-[2rem]', warn ? 'text-danger' : accent && 'text-chispa')} />
      {sub && <div className="mt-1 text-xs text-ink-3">{sub}</div>}
    </div>
  )
}

// ── Programa del día ─────────────────────────────────────
const timeKey = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return (h < 8 ? h + 24 : h) * 60 + m
}

/** Mantiene la pantalla encendida mientras `active` (Screen Wake Lock API) */
function useWakeLock(active: boolean) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!active) return
    let lock: { release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void } | null = null
    let cancelled = false
    const request = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } }).wakeLock
        if (!wl) return
        lock = await wl.request('screen')
        if (cancelled) {
          await lock?.release()
          return
        }
        setOn(true)
        lock?.addEventListener?.('release', () => setOn(false))
      } catch {
        setOn(false)
      }
    }
    void request()
    // El navegador suelta el bloqueo al ocultar la pestaña: se vuelve a pedir al regresar
    const onVis = () => document.visibilityState === 'visible' && void request()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release().catch(() => {})
      setOn(false)
    }
  }, [active])
  return on
}

export function TimelineTab({ ev }: { ev: RanchEvent }) {
  const [items, setItems] = useEventDraft(ev, 'timeline')
  const [live, setLive] = useState(ev.date === today())
  const awake = useWakeLock(live)
  const sorted = [...items].sort((a, b) => timeKey(a.time) - timeKey(b.time))
  const now = new Date()
  const nowKey = timeKey(`${now.getHours()}:${now.getMinutes()}`)
  const isToday = ev.date === today()
  const nextIdx = sorted.findIndex((i) => !i.done)
  const currentIdx = isToday ? sorted.reduce((acc, it, i) => (timeKey(it.time) <= nowKey ? i : acc), -1) : -1
  const update = (id: string, patch: Partial<TimelineItem>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const doneCount = items.filter((i) => i.done).length

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <Card className="p-5 md:p-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="heading text-2xl">Programa del evento</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {ev.startTime} – {ev.endTime} · {doneCount} de {items.length} completados
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={live ? 'tinta' : 'outline'} size="sm" icon={<Zap size={16} strokeWidth={1.6} />} onClick={() => setLive((v) => !v)} aria-pressed={live}>
              Modo día del evento
            </Button>
            <Button variant="secondary" size="sm" icon={<Plus size={16} strokeWidth={1.6} />} onClick={() => setItems([...items, { id: uid('tl_'), time: sorted.at(-1)?.time ?? ev.startTime, title: 'Nueva actividad', done: false }])}>
              Actividad
            </Button>
          </div>
        </div>
        {live && (
          <div className="mb-5 flex items-center gap-2 rounded-full bg-sunken px-4 py-2 text-xs text-ink-soft">
            {awake ? <Sun size={14} strokeWidth={1.6} className="text-chispa-soft" /> : <Eye size={14} strokeWidth={1.6} />}
            {awake ? 'La pantalla se mantiene encendida mientras dure el modo día del evento' : 'Modo día del evento activo'}
          </div>
        )}

        <p className="mb-4 text-xs text-ink-3">Arrastra la manija ⋮⋮ para cambiar el orden: las horas se quedan y las actividades se mueven.</p>
        <SortableList
          items={sorted}
          getId={(it) => it.id}
          className="!gap-0"
          onReorder={(next) => {
            const times = sorted.map((x) => x.time)
            const prev = items
            setItems(next.map((it, idx) => ({ ...it, time: times[idx] ?? it.time })))
            withUndo('Programa reordenado', () => setItems(prev))
          }}
          renderItem={(it, handle) => {
            const i = sorted.findIndex((x) => x.id === it.id)
            const isNext = i === nextIdx
            const isNow = live && i === currentIdx && !it.done
            return (
              <div className="relative flex gap-3 pb-5">
                <span className="mt-1.5 -ml-1.5">{handle}</span>
                {i < sorted.length - 1 && <span aria-hidden className={cx('absolute top-12 left-[21px] h-[calc(100%-40px)] w-px', it.done ? 'bg-success' : 'bg-line-strong')} />}
                <span className="relative">
                  <RoundCheck done={it.done} onClick={() => update(it.id, { done: !it.done })} label={it.done ? `Desmarcar ${it.title}` : `Marcar ${it.title} como hecho`} />
                  {isNow && <span aria-hidden className="pulse-dot pointer-events-none absolute inset-0 rounded-full text-[color:var(--luz)]" />}
                </span>
                <div className={cx('min-w-0 flex-1 rounded-[18px] p-3.5 transition-colors duration-[var(--dur-3)]', isNow ? 'bg-[color-mix(in_oklab,var(--luz)_45%,var(--surface))] shadow-[var(--glow)]' : isNext && live ? 'bg-secondary' : 'bg-sunken/60')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="time" value={it.time} onChange={(e) => update(it.id, { time: e.target.value })} aria-label="Hora" className="rounded-[10px] bg-surface px-2.5 py-1 text-sm tabular outline-none ring-1 ring-line" />
                    {isNow && <Badge tone="butter" sparkle>Ahora</Badge>}
                    {isNext && !isNow && live && <Badge tone="lavender">Sigue</Badge>}
                    {it.done && <Sparkle className="text-chispa-soft" />}
                    <Button size="icon-sm" variant="ghost" aria-label={`Quitar ${it.title}`} onClick={() => {
                      const prev = items
                      setItems(items.filter((x) => x.id !== it.id))
                      withUndo(`Se quitó "${it.title}"`, () => setItems(prev))
                    }} className="ml-auto hover:!text-danger">
                      <Trash2 size={15} strokeWidth={1.6} />
                    </Button>
                  </div>
                  <input value={it.title} onChange={(e) => update(it.id, { title: e.target.value })} aria-label="Actividad" className={cx('mt-1.5 w-full bg-transparent font-medium outline-none', it.done && 'text-ink-3 line-through', live && 'heading text-xl')} />
                  <input value={it.owner ?? ''} onChange={(e) => update(it.id, { owner: e.target.value })} placeholder="Responsable" aria-label="Responsable" className="w-full bg-transparent text-sm text-ink-soft outline-none" />
                </div>
              </div>
            )
          }}
        />
        {items.length === 0 && <Empty kind="tareas" title="Sin actividades" body="Agrega el programa del día para que todo el equipo lo vea." />}
      </Card>

      <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="flex items-center gap-4 p-5">
          <ProgressRing value={items.length ? doneCount / items.length : 0} size={72} stroke={5} gradient />
          <div>
            <div className="heading text-lg">Avance del programa</div>
            <div className="text-sm text-ink-soft">{isToday ? 'El evento es hoy' : 'Se activa en vivo el día del evento'}</div>
          </div>
        </Card>
        {nextIdx >= 0 && (
          <Card className="p-5">
            <div className="eyebrow">Siguiente</div>
            <div className="display-num mt-2 text-[2.6rem]">{sorted[nextIdx]!.time}</div>
            <div className="heading mt-1 text-xl">{sorted[nextIdx]!.title}</div>
            {sorted[nextIdx]!.owner && <div className="mt-0.5 text-sm text-ink-soft">{sorted[nextIdx]!.owner}</div>}
            <Button className="mt-5 w-full" icon={<Check size={18} strokeWidth={1.6} />} onClick={() => update(sorted[nextIdx]!.id, { done: true })}>
              Marcar como hecho
            </Button>
          </Card>
        )}
        {nextIdx < 0 && items.length > 0 && (
          <Card className="p-6 text-center">
            <Sparkle className="text-2xl text-chispa-soft" />
            <div className="heading mt-2 text-xl">Programa completo</div>
            <p className="mt-1 text-sm text-ink-soft">Todo salió como estaba planeado.</p>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Checklist y proveedores rápidos ──────────────────────
export function ChecklistTab({ ev }: { ev: RanchEvent }) {
  const [checklist, setChecklist] = useEventDraft(ev, 'checklist')
  const [providers, setProviders] = useEventDraft(ev, 'providers')
  const [newItem, setNewItem] = useState('')
  const [provOpen, setProvOpen] = useState(false)
  const done = checklist.filter((c) => c.done).length
  const addItem = () => {
    if (!newItem.trim()) return
    setChecklist([...checklist, { id: uid('chk_'), text: newItem.trim(), done: false }])
    setNewItem('')
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Checklist del evento" subtitle={done === checklist.length && checklist.length ? 'Todo listo' : `${done} de ${checklist.length} listos`} icon={<ProgressRing value={checklist.length ? done / checklist.length : 0} size={52} stroke={4} gradient />} />
        <div className="flex flex-col gap-1 p-3 md:p-4">
          {checklist.map((c) => (
            <div key={c.id} className="group flex items-center gap-3 rounded-[14px] px-2 py-1.5 hover:bg-wash">
              <RoundCheck done={c.done} tone="primary" onClick={() => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} label={c.done ? `Desmarcar ${c.text}` : `Marcar ${c.text}`} />
              <span className={cx('flex-1', c.done && 'text-ink-3 line-through')}>{c.text}</span>
              {c.done && <Sparkle className="text-[11px] text-chispa-soft" />}
              <Button size="icon-sm" variant="ghost" aria-label={`Quitar ${c.text}`} onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))} className="opacity-0 group-hover:opacity-100 focus:opacity-100 hover:!text-danger max-md:opacity-100">
                <Trash2 size={15} strokeWidth={1.6} />
              </Button>
            </div>
          ))}
          <div className="mt-3 flex gap-2">
            <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} placeholder="Agregar pendiente…" aria-label="Nuevo pendiente" />
            <Button variant="secondary" size="icon" aria-label="Agregar pendiente" onClick={addItem}>
              <Plus size={18} strokeWidth={1.6} />
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Proveedores rápidos" subtitle={providers.length ? `${providers.filter((p) => p.confirmed).length} de ${providers.length} confirmados` : 'Para los que no están en el directorio'} action={<Button size="sm" variant="secondary" icon={<Plus size={16} strokeWidth={1.6} />} onClick={() => setProvOpen(true)}>Agregar proveedor</Button>} />
        <div className="flex flex-col gap-2 p-3 md:p-4">
          {providers.length === 0 && <Empty kind="proveedores" title="Sin proveedores" body="Banquete, DJ, decoración, fotografía…" />}
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-[14px] bg-sunken/70 p-3">
              <RoundCheck done={p.confirmed} onClick={() => setProviders(providers.map((x) => (x.id === p.id ? { ...x, confirmed: !x.confirmed } : x)))} label={p.confirmed ? `Quitar confirmación de ${p.name}` : `Confirmar a ${p.name}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-xs text-ink-soft">{p.service}</div>
              </div>
              {p.phone && (
                <>
                  <a href={`tel:${p.phone}`} aria-label={`Llamar a ${p.name}`} className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-soft ring-1 ring-line hover:text-ink">
                    <Phone size={16} strokeWidth={1.6} />
                  </a>
                  <a href={waLink(p.phone, `Hola ${p.name}, te escribimos de Jardines La Joya sobre el evento "${ev.title}" del ${ev.date}.`)} target="_blank" rel="noopener" aria-label={`WhatsApp a ${p.name}`} className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-ink">
                    <MessageCircle size={16} strokeWidth={1.6} />
                  </a>
                </>
              )}
              <Button size="icon-sm" variant="ghost" aria-label={`Quitar a ${p.name}`} onClick={() => setProviders(providers.filter((x) => x.id !== p.id))} className="hover:!text-danger">
                <Trash2 size={15} strokeWidth={1.6} />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <ProviderSheet
        open={provOpen}
        onClose={() => setProvOpen(false)}
        onSave={(p) => {
          setProviders([...providers, p])
          toast.success('Proveedor agregado', p.name)
        }}
      />
    </div>
  )
}

function ProviderSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (p: Provider) => void }) {
  const [name, setName] = useState('')
  const [service, setService] = useState('')
  const [phone, setPhone] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Proveedor rápido" subtitle="Solo para este evento" side="center">
      <div className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Banquetes Los Altos" />
        </Field>
        <Field label="Servicio">
          <Input value={service} onChange={(e) => setService(e.target.value)} placeholder="Banquete, DJ, flores…" />
        </Field>
        <Field label="Teléfono">
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <div className="mt-7 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            if (!name.trim()) return toast.error('Falta el nombre', 'Escribe cómo se llama el proveedor.')
            onSave({ id: uid('pr_'), name: name.trim(), service: service.trim(), phone: phone.trim() || undefined, confirmed: false })
            setName('')
            setService('')
            setPhone('')
            onClose()
          }}
        >
          Guardar proveedor
        </Button>
      </div>
    </Sheet>
  )
}

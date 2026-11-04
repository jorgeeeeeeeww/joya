// Lista de invitados: búsqueda, filtros, agrupación, confirmación de un toque y WhatsApp.
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Baby, Crown, MessageCircle, Pencil, Search, Send, Utensils } from 'lucide-react'
import type { Guest, RanchEvent, Rsvp } from '@/lib/types'
import { ago } from '@/lib/format'
import { ease, haptic } from '@/lib/motion'
import { TONE } from '@/lib/meta'
import { Avatar, Card, Chip, Empty, Input, Segmented, Select, cx } from '@/components/ui'
import { RSVP_META } from './GuestSheets'
import { rsvpOf, tableLabel, tablesOf } from './guestUtils'

const NEXT: Record<Rsvp, Rsvp> = { pendiente: 'confirmado', confirmado: 'declinado', declinado: 'pendiente' }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type GroupBy = 'ninguno' | 'lado' | 'familia' | 'mesa'

export function GuestListView({ ev, onChange, onEdit, onWhatsApp }: { ev: RanchEvent; onChange: (next: Guest[], summary?: string) => void; onEdit: (g: Guest) => void; onWhatsApp: (g: Guest, kind: 'invitacion' | 'recordatorio-rsvp') => void }) {
  const guests = ev.guestList
  const [q, setQ] = useState('')
  const [rsvp, setRsvp] = useState<Rsvp | 'todos'>('todos')
  const [side, setSide] = useState('')
  const [table, setTable] = useState<string>('')
  const [diet, setDiet] = useState(false)
  const [vip, setVip] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>('ninguno')
  const sides = useMemo(() => [...new Set(guests.map((g) => g.side).filter(Boolean) as string[])], [guests])
  const tables = useMemo(() => tablesOf(ev), [ev])
  const counts = useMemo(() => {
    const c = { todos: guests.length, confirmado: 0, pendiente: 0, declinado: 0 }
    for (const g of guests) c[rsvpOf(g)]++
    return c
  }, [guests])

  const filtered = useMemo(() => {
    const n = norm(q.trim())
    return guests
      .filter((g) => rsvp === 'todos' || rsvpOf(g) === rsvp)
      .filter((g) => !side || g.side === side)
      .filter((g) => (table === '' ? true : table === 'sin' ? g.table === undefined || g.table === null : table === 'con' ? g.table !== undefined && g.table !== null : g.table === Number(table)))
      .filter((g) => !diet || !!g.diet)
      .filter((g) => !vip || !!g.vip)
      .filter((g) => !n || norm(g.name).includes(n) || norm(g.group ?? '').includes(n) || (g.phone ?? '').includes(n))
      .sort((a, b) => Number(!!b.vip) - Number(!!a.vip) || a.name.localeCompare(b.name))
  }, [guests, q, rsvp, side, table, diet, vip])

  const groups = useMemo(() => {
    if (groupBy === 'ninguno') return [{ key: 'all', label: '', items: filtered }]
    const m = new Map<string, Guest[]>()
    for (const g of filtered) {
      const k = groupBy === 'lado' ? g.side || 'Sin lado' : groupBy === 'familia' ? g.group || 'Individuales' : tableLabel(g.table)
      m.set(k, [...(m.get(k) ?? []), g])
    }
    return [...m.entries()].sort((a, b) => (groupBy === 'mesa' ? sortTable(a[0]) - sortTable(b[0]) : b[1].length - a[1].length)).map(([k, items]) => ({ key: k, label: k, items }))
  }, [filtered, groupBy])

  const cycle = (g: Guest) => {
    const next = NEXT[rsvpOf(g)]
    haptic.select()
    onChange(
      guests.map((x) => (x.id === g.id ? { ...x, rsvp: next, confirmed: next === 'confirmado' } : x)),
      `${g.name}: ${RSVP_META[next].label.toLowerCase()}`,
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={18} strokeWidth={1.6} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, familia o teléfono" className="pl-11" />
          </div>
          <Segmented<GroupBy>
            size="sm"
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: 'ninguno', label: 'Todos' },
              { value: 'lado', label: 'Por lado' },
              { value: 'familia', label: 'Por familia' },
              { value: 'mesa', label: 'Por mesa' },
            ]}
          />
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 md:-mx-5 md:px-5">
          {(['todos', 'confirmado', 'pendiente', 'declinado'] as const).map((r) => (
            <Chip key={r} active={rsvp === r} onClick={() => setRsvp(r)} count={counts[r]}>
              {r === 'todos' ? 'Todos' : RSVP_META[r].label}
            </Chip>
          ))}
          <span className="mx-1 h-6 w-px shrink-0 bg-line" />
          <Chip active={vip} onClick={() => setVip((v) => !v)}>
            <Crown size={14} strokeWidth={1.6} /> VIP
          </Chip>
          <Chip active={diet} onClick={() => setDiet((v) => !v)}>
            <Utensils size={14} strokeWidth={1.6} /> Dieta especial
          </Chip>
          {sides.length > 0 && (
            <Select value={side} onChange={(e) => setSide(e.target.value)} className="!h-9 w-auto shrink-0 !rounded-full !text-sm">
              <option value="">Cualquier lado</option>
              {sides.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
          <Select value={table} onChange={(e) => setTable(e.target.value)} className="!h-9 w-auto shrink-0 !rounded-full !text-sm">
            <option value="">Cualquier mesa</option>
            <option value="sin">Sin mesa</option>
            <option value="con">Con mesa</option>
            {tables.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <Empty kind="invitados" title={guests.length ? 'Nadie coincide con estos filtros' : 'Aún no hay invitados'} body={guests.length ? 'Prueba quitando algún filtro.' : 'Importa la lista que te mandó la clienta o agrega invitados uno por uno.'} />
        </Card>
      ) : (
        groups.map((grp) => (
          <section key={grp.key}>
            {grp.label && (
              <div className="mb-2 flex items-baseline gap-2 px-2">
                <h3 className="heading text-lg">{grp.label}</h3>
                <span className="tabular text-sm text-ink-soft">
                  {grp.items.length} · {grp.items.reduce((n, g) => n + g.count, 0)} personas
                </span>
              </div>
            )}
            <Card className="overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,2.4fr)_70px_minmax(0,1fr)_96px_132px_120px] gap-3 border-b border-line bg-sunken/60 px-5 py-2.5 text-[11px] font-medium tracking-[.08em] text-ink-soft uppercase lg:grid">
                <span>Invitado</span>
                <span className="text-right">Pers.</span>
                <span>Lado</span>
                <span>Mesa</span>
                <span>Confirmación</span>
                <span className="text-right">Acciones</span>
              </div>
              <ul>
                <AnimatePresence initial={false}>
                  {grp.items.map((g) => {
                    const r = rsvpOf(g)
                    const meta = RSVP_META[r]
                    return (
                      <motion.li key={g.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.24, ease: ease.calma }} className="border-b border-line last:border-0">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 lg:min-h-[64px] lg:grid-cols-[minmax(0,2.4fr)_70px_minmax(0,1fr)_96px_132px_120px] lg:px-5">
                          {/* En celular el nombre mismo abre la ficha: el lápiz y la foto se quedan en pantallas anchas para dejarle espacio al nombre */}
                          <button onClick={() => onEdit(g)} className="flex min-w-0 items-center gap-3 text-left">
                            <Avatar name={g.name.replace(/^Familia\s+/i, '')} tone={r === 'confirmado' ? 'sage' : r === 'pendiente' ? 'butter' : 'rose'} size={40} className="max-sm:hidden" />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                {g.vip && <Crown size={14} strokeWidth={1.6} className="shrink-0 text-chispa" aria-label="VIP" />}
                                <span className="truncate font-medium">{g.name}</span>
                              </span>
                              <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
                                <span className="lg:hidden">{g.count} pers.</span>
                                {g.kids ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Baby size={12} strokeWidth={1.6} /> {g.kids}
                                  </span>
                                ) : null}
                                {g.diet && <span className="text-warning">{g.diet}</span>}
                                {g.invitedAt && <span className="hidden lg:inline">Invitado {ago(g.invitedAt)}</span>}
                                <span className="lg:hidden">· {tableLabel(g.table)}</span>
                              </span>
                            </span>
                          </button>
                          <span className="tabular hidden text-right lg:block">{g.count}</span>
                          <span className="hidden truncate text-sm text-ink-soft lg:block">{g.side ?? '—'}</span>
                          <span className="hidden text-sm lg:block">{g.table === undefined || g.table === null ? <span className="text-ink-3">Sin mesa</span> : tableLabel(g.table)}</span>
                          <div className="flex items-center justify-end gap-1.5 lg:contents">
                            <button onClick={() => cycle(g)} className={cx('pressable inline-flex h-9 items-center gap-1.5 justify-self-start rounded-full px-3 text-xs font-medium', TONE[meta.tone].soft, TONE[meta.tone].ink)} aria-label={`Confirmación: ${meta.label}. Toca para cambiar`}>
                              <span className={cx('h-1.5 w-1.5 rounded-full', TONE[meta.tone].solid)} />
                              {meta.label}
                            </button>
                            <span className="flex justify-end gap-1">
                              {r !== 'declinado' && (
                                <button onClick={() => onWhatsApp(g, g.invitedAt ? 'recordatorio-rsvp' : 'invitacion')} disabled={!g.phone} className="pressable flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink disabled:opacity-30" aria-label={g.invitedAt ? `Recordar a ${g.name}` : `Invitar a ${g.name}`} title={g.phone ? (g.invitedAt ? 'Recordar por WhatsApp' : 'Invitar por WhatsApp') : 'Sin teléfono'}>
                                  {g.invitedAt ? <MessageCircle size={17} strokeWidth={1.6} /> : <Send size={16} strokeWidth={1.6} />}
                                </button>
                              )}
                              <button onClick={() => onEdit(g)} className="pressable flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink max-lg:hidden" aria-label={`Editar a ${g.name}`}>
                                <Pencil size={16} strokeWidth={1.6} />
                              </button>
                            </span>
                          </div>
                        </div>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  )
}

const sortTable = (label: string) => (label === 'Principal' ? -1 : label === 'Sin mesa' ? 999 : Number(label.replace(/\D/g, '')) || 500)

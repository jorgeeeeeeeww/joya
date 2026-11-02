// Acomodo en mesas: plano del evento con ocupación por mesa y lista de invitados sin mesa.
// Se asigna arrastrando (mouse, o la manija en pantallas táctiles) o tocando invitado → mesa.
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Crown, GripVertical, Printer, Search, Sparkles, Wand2, X } from 'lucide-react'
import type { Guest, RanchEvent } from '@/lib/types'
import { ITEM_SPECS, itemRect } from '@/lib/floorplan'
import { VENUE_SPACES } from '@/lib/layout'
import { haptic, spring } from '@/lib/motion'
import { Badge, Button, Card, Chip, Empty, Input, ProgressBar, Toggle, cx, toast } from '@/components/ui'
import { printHtml } from '@/components/floorplan/FloorPlanEditor'
import { autoSeat, occupancy, rsvpOf, seatingListHtml, tableCardsHtml, tableLabel, tablesOf, type TableInfo } from './guestUtils'

type Drag = { id: string; name: string; x: number; y: number; over: number | null }

export function SeatingView({ ev, onChange }: { ev: RanchEvent; onChange: (next: Guest[], summary?: string) => void }) {
  const guests = ev.guestList
  const tables = useMemo(() => tablesOf(ev), [ev])
  const occ = useMemo(() => occupancy(guests), [guests])
  const [picked, setPicked] = useState<string | null>(null)
  const [focusTable, setFocusTable] = useState<number | null>(null)
  const [includePending, setIncludePending] = useState(false)
  const [q, setQ] = useState('')
  const [side, setSide] = useState('')
  const [drag, setDrag] = useState<Drag | null>(null)
  const start = useRef<{ id: string; x: number; y: number; name: string; armed: boolean } | null>(null)
  const justDragged = useRef(false)

  const sides = useMemo(() => [...new Set(guests.map((g) => g.side).filter(Boolean) as string[])], [guests])
  const unseated = useMemo(
    () =>
      guests
        .filter((g) => (g.table === undefined || g.table === null) && (rsvpOf(g) === 'confirmado' || (includePending && rsvpOf(g) === 'pendiente')))
        .filter((g) => !side || g.side === side)
        .filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => Number(!!b.vip) - Number(!!a.vip) || (a.group ?? a.name).localeCompare(b.group ?? b.name)),
    [guests, includePending, side, q],
  )
  const seatsTotal = tables.reduce((n, t) => n + t.seats, 0)
  const seatedPeople = [...occ.values()].reduce((n, v) => n + v, 0)
  const pickedGuest = guests.find((g) => g.id === picked)

  const assign = (guestId: string, key: number | undefined) => {
    const g = guests.find((x) => x.id === guestId)
    if (!g) return
    const t = tables.find((x) => x.key === key)
    if (t && (occ.get(t.key) ?? 0) + g.count > t.seats && g.table !== key) toast.info(`${t.label} se pasa de lugares`, `Quedará con ${(occ.get(t.key) ?? 0) + g.count} de ${t.seats}. Puedes agregar sillas en el plano.`)
    else haptic.success()
    onChange(
      guests.map((x) => (x.id === guestId ? { ...x, table: key } : x)),
      key === undefined ? `Quitó de su mesa a ${g.name}` : `Sentó a ${g.name} en ${tableLabel(key)}`,
    )
    setPicked(null)
  }

  const tableAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-table-key]') as HTMLElement | SVGElement | null
    const k = el?.getAttribute('data-table-key')
    return k === null || k === undefined ? null : Number(k)
  }

  const onPointerDown = (e: React.PointerEvent, g: Guest, viaHandle: boolean) => {
    if (e.pointerType !== 'mouse' && !viaHandle) return // en táctil, solo la manija arrastra (el resto permite desplazar la lista)
    start.current = { id: g.id, name: g.name, x: e.clientX, y: e.clientY, armed: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    if (!s.armed && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return
    s.armed = true
    setDrag({ id: s.id, name: s.name, x: e.clientX, y: e.clientY, over: tableAt(e.clientX, e.clientY) })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current
    start.current = null
    if (!s) return
    if (s.armed) {
      justDragged.current = true
      const k = tableAt(e.clientX, e.clientY)
      if (k !== null) assign(s.id, k)
      setDrag(null)
    }
  }

  const runAuto = (redoAll: boolean) => {
    const r = autoSeat(ev, { includePending, redoAll })
    onChange(r.guests, redoAll ? 'Reacomodó todas las mesas automáticamente' : 'Acomodó invitados automáticamente')
    if (r.seated) toast.success(`Sentamos a ${r.seated} ${r.seated === 1 ? 'invitado' : 'invitados'}`, r.left ? `${r.left} no cupieron: agrega mesas o sillas en el plano.` : 'Familias juntas y VIP cerca de la pista.')
    else toast.info('No hubo a quién acomodar', r.left ? `${r.left} no caben en las mesas actuales.` : 'Todos los confirmados ya tienen mesa.')
  }

  if (!tables.length)
    return (
      <Card>
        <Empty kind="mesas" title="Este evento aún no tiene mesas" body="Dibuja el plano en el evento (pestaña Plano de mesas) o elige una plantilla, y aquí podrás sentar a cada invitado." />
      </Card>
    )

  const focused = focusTable !== null ? tables.find((t) => t.key === focusTable) : undefined
  const focusedGuests = focused ? guests.filter((g) => g.table === focused.key && rsvpOf(g) !== 'declinado') : []

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 pt-5 md:px-6">
            <div className="min-w-0 flex-1">
              <div className="eyebrow">Acomodo · {VENUE_SPACES[ev.venue].label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="display-num text-[2rem]">{seatedPeople}</span>
                <span className="text-sm text-ink-soft">de {seatsTotal} lugares ocupados · {tables.length} mesas</span>
              </div>
            </div>
            <Button variant="tinta" icon={<Wand2 size={17} strokeWidth={1.6} />} onClick={() => runAuto(false)}>
              Acomodar automáticamente
            </Button>
          </div>
          <div className="px-5 pt-3 md:px-6">
            <ProgressBar value={seatsTotal ? seatedPeople / seatsTotal : 0} />
          </div>
          <AnimatePresence>
            {pickedGuest && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden px-5 md:px-6">
                <div className="mt-3 flex items-center gap-3 rounded-full bg-[color-mix(in_oklab,var(--luz)_45%,var(--surface))] py-2 pr-2 pl-4 text-sm">
                  <Sparkles size={15} strokeWidth={1.6} className="text-night" />
                  <span className="min-w-0 flex-1 truncate text-night">
                    Toca una mesa para sentar a <b>{pickedGuest.name}</b> ({pickedGuest.count})
                  </span>
                  <button onClick={() => setPicked(null)} className="pressable rounded-full p-1.5 text-night hover:bg-wash" aria-label="Cancelar">
                    <X size={15} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="p-3 md:p-5">
            <SeatPlan ev={ev} tables={tables} occ={occ} highlight={drag?.over ?? null} focus={focusTable} armed={!!pickedGuest} onTable={(k) => (pickedGuest ? assign(pickedGuest.id, k) : setFocusTable((f) => (f === k ? null : k)))} />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3.5 text-xs text-ink-soft md:px-6">
            <Legend swatch="var(--surface)" ring label="Libre" />
            <Legend swatch="color-mix(in oklab, var(--sage) 28%, var(--surface))" label="Con lugares" />
            <Legend swatch="color-mix(in oklab, var(--sage) 62%, var(--surface))" label="Llena" />
            <Legend swatch="color-mix(in oklab, var(--danger) 30%, var(--surface))" label="Excedida" />
            <span className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={<Printer size={15} strokeWidth={1.6} />} onClick={() => printHtml(`Tarjetas de mesa · ${ev.title}`, tableCardsHtml(ev))}>
                Tarjetas de mesa
              </Button>
              <Button size="sm" variant="ghost" icon={<Printer size={15} strokeWidth={1.6} />} onClick={() => printHtml(`Lista por mesa · ${ev.title}`, seatingListHtml(ev))}>
                Lista por mesa
              </Button>
            </span>
          </div>
        </Card>

        <AnimatePresence>
          {focused && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
              <Card className="p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className="display-num flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-2xl text-night ring-[5px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]">{focused.key === 0 ? '✦' : focused.key}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="heading text-2xl">{focused.label}</h3>
                    <p className="text-sm text-ink-soft">
                      {occ.get(focused.key) ?? 0} de {focused.seats} lugares · {ITEM_SPECS[focused.item.type].label}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Cerrar mesa" onClick={() => setFocusTable(null)}>
                    <X size={18} strokeWidth={1.6} />
                  </Button>
                </div>
                <ProgressBar value={(occ.get(focused.key) ?? 0) / focused.seats} tone={(occ.get(focused.key) ?? 0) > focused.seats ? 'rose' : 'sage'} className="mt-4" />
                <div className="mt-4 flex flex-col">
                  {focusedGuests.length === 0 && <p className="py-3 text-sm text-ink-soft">Mesa libre. Toca un invitado de la lista y luego esta mesa.</p>}
                  {focusedGuests.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                      {g.vip && <Crown size={15} strokeWidth={1.6} className="text-chispa" />}
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      {g.diet && <Badge tone="butter">{g.diet}</Badge>}
                      <span className="tabular text-sm text-ink-soft">{g.count}</span>
                      <button onClick={() => assign(g.id, undefined)} className="pressable rounded-full p-2 text-ink-3 hover:bg-wash hover:text-danger" aria-label={`Quitar a ${g.name} de la mesa`}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sin mesa */}
      <Card className="flex max-h-[min(78vh,880px)] flex-col overflow-hidden lg:sticky lg:top-4">
        <div className="px-5 pt-5">
          <div className="flex items-baseline justify-between">
            <h3 className="heading text-xl">Sin mesa</h3>
            <span className="tabular text-sm text-ink-soft">
              {unseated.length} · {unseated.reduce((n, g) => n + g.count, 0)} personas
            </span>
          </div>
          <div className="relative mt-3">
            <Search size={16} strokeWidth={1.6} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar invitado" className="!h-11 pl-10" />
          </div>
          {sides.length > 1 && (
            <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
              <Chip active={!side} onClick={() => setSide('')}>
                Todos
              </Chip>
              {sides.map((s) => (
                <Chip key={s} active={side === s} onClick={() => setSide(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          )}
          <div className="mt-3">
            <Toggle checked={includePending} onChange={setIncludePending} label="Incluir pendientes" description="Apártales lugar aunque no confirmen" />
          </div>
        </div>
        <div className="scroll-area mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {unseated.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Sparkles size={22} strokeWidth={1.6} className="mx-auto text-chispa-soft" />
              <p className="mt-2 font-medium">Todos tienen mesa</p>
              <p className="text-sm text-ink-soft">Toca una mesa del plano para ver quién se sienta ahí.</p>
            </div>
          ) : (
            <motion.ul layout className="flex flex-col gap-1.5">
              {unseated.map((g) => (
                <motion.li
                  layout
                  key={g.id}
                  transition={spring.suave}
                  onPointerDown={(e) => onPointerDown(e, g, false)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => ((start.current = null), setDrag(null))}
                  onClick={() => {
                    if (justDragged.current) {
                      justDragged.current = false
                      return
                    }
                    setPicked((p) => (p === g.id ? null : g.id))
                  }}
                  className={cx(
                    'flex min-h-[56px] cursor-pointer select-none items-center gap-2 rounded-[16px] px-2 py-2 transition-colors',
                    picked === g.id ? 'bg-[color-mix(in_oklab,var(--luz)_45%,var(--surface))] ring-1 ring-[color-mix(in_oklab,var(--chispa-soft)_50%,transparent)]' : 'hover:bg-wash',
                    drag?.id === g.id && 'opacity-40',
                  )}
                >
                  <span onPointerDown={(e) => (e.stopPropagation(), onPointerDown(e, g, true))} onPointerMove={(e) => (e.stopPropagation(), onPointerMove(e))} onPointerUp={(e) => (e.stopPropagation(), onPointerUp(e))} className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-ink-3" aria-label={`Arrastrar a ${g.name}`}>
                    <GripVertical size={16} strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate font-medium">
                      {g.vip && <Crown size={14} strokeWidth={1.6} className="shrink-0 text-chispa" />}
                      <span className="truncate">{g.name}</span>
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {[g.side, g.group, rsvpOf(g) === 'pendiente' ? 'Sin confirmar' : null].filter(Boolean).join(' · ') || 'Invitado'}
                    </span>
                  </span>
                  <span className="tabular flex h-8 min-w-8 items-center justify-center rounded-full bg-sunken px-2 text-sm">{g.count}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>
        <div className="border-t border-line p-3">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => runAuto(true)}>
            Reacomodar todas las mesas
          </Button>
        </div>
      </Card>

      {drag &&
        createPortal(
          <div className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-[130%] rounded-full bg-night px-4 py-2 text-sm text-on-night shadow-[var(--shadow-3)]" style={{ left: drag.x, top: drag.y }}>
            {drag.name}
            {drag.over !== null && <span className="ml-2 text-luz">→ {tableLabel(drag.over)}</span>}
          </div>,
          document.body,
        )}
    </div>
  )
}

function Legend({ swatch, label, ring }: { swatch: string; label: string; ring?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('h-3 w-3 rounded-full', ring && 'ring-1 ring-line-strong')} style={{ background: swatch }} />
      {label}
    </span>
  )
}

/** Plano del recinto con mesas que muestran su ocupación (sillas ocupadas = puntos llenos) */
function SeatPlan({ ev, tables, occ, highlight, focus, armed, onTable }: { ev: RanchEvent; tables: TableInfo[]; occ: Map<number, number>; highlight: number | null; focus: number | null; armed: boolean; onTable: (k: number) => void }) {
  const sp = VENUE_SPACES[ev.venue]
  const tableIds = new Set(tables.map((t) => t.item.id))
  const garden = ev.venue === 'jardin'
  return (
    <svg viewBox={`-1.5 -1.5 ${sp.w + 3} ${sp.h + 3}`} className="h-auto max-h-[62vh] w-full touch-manipulation" role="img" aria-label={`Plano de mesas de ${sp.label}`}>
      <defs>
        <pattern id="seat-lawn" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
          <rect width="2.4" height="2.4" fill="color-mix(in oklab, var(--sage) 20%, var(--surface))" />
          <rect width="1.2" height="2.4" fill="color-mix(in oklab, var(--sage) 26%, var(--surface))" />
        </pattern>
      </defs>
      <rect x={-0.5} y={-0.5} width={sp.w + 1} height={sp.h + 1} rx={garden ? 2 : 0.6} fill={garden ? 'color-mix(in oklab, var(--sage) 40%, var(--surface))' : 'var(--ink-soft)'} opacity={garden ? 0.5 : 0.85} />
      <rect x={0} y={0} width={sp.w} height={sp.h} rx={garden ? 1.6 : 0.3} fill={garden ? 'url(#seat-lawn)' : 'var(--surface)'} />
      {garden && <circle cx={VENUE_SPACES.jardin.obstacle.x} cy={VENUE_SPACES.jardin.obstacle.y} r={VENUE_SPACES.jardin.obstacle.r} fill="color-mix(in oklab, var(--mint) 30%, var(--surface))" stroke="var(--line-strong)" strokeWidth={0.08} />}
      {/* Piezas que no son mesas: tenues */}
      {ev.layout
        .filter((it) => !tableIds.has(it.id))
        .map((it) => {
          const spec = ITEM_SPECS[it.type]
          const r = itemRect(it)
          return (
            <g key={it.id} opacity={0.75}>
              {spec.shape === 'circle' ? (
                <circle cx={it.x} cy={it.y} r={(it.w ?? spec.w) / 2} fill={`color-mix(in oklab, ${tone(spec.tone)} 30%, var(--surface))`} />
              ) : (
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={0.25} fill={`color-mix(in oklab, ${tone(spec.tone)} 26%, var(--surface))`} />
              )}
              {(r.w > 2.4 || r.h > 2.4) && (
                <text x={it.x} y={it.y} fontSize={0.62} textAnchor="middle" dominantBaseline="central" fill="var(--ink-soft)" style={{ fontFamily: 'var(--font-sans)' }}>
                  {it.label ?? spec.label}
                </text>
              )}
            </g>
          )
        })}
      {tables.map((t) => {
        const it = t.item
        const spec = ITEM_SPECS[it.type]
        const used = occ.get(t.key) ?? 0
        const over = used > t.seats
        const full = used >= t.seats
        const fill = over ? 'color-mix(in oklab, var(--danger) 30%, var(--surface))' : full ? 'color-mix(in oklab, var(--sage) 62%, var(--surface))' : used > 0 ? 'color-mix(in oklab, var(--sage) 28%, var(--surface))' : 'var(--surface)'
        const isHL = highlight === t.key
        const isFocus = focus === t.key
        const r = itemRect(it)
        const round = spec.shape === 'circle'
        const radius = (it.w ?? spec.w) / 2
        // Sillas alrededor: puntos llenos según ocupación
        const seats = Array.from({ length: t.seats }, (_, i) => {
          if (round) {
            const a = (i / t.seats) * Math.PI * 2 - Math.PI / 2
            return { x: it.x + Math.cos(a) * (radius + 0.42), y: it.y + Math.sin(a) * (radius + 0.42) }
          }
          const perSide = Math.ceil(t.seats / 2)
          const top = i < perSide
          const idx = top ? i : i - perSide
          const horizontal = r.w >= r.h
          const len = horizontal ? r.w : r.h
          const step = len / (perSide + 1)
          return horizontal ? { x: r.x + step * (idx + 1), y: top ? r.y - 0.38 : r.y + r.h + 0.38 } : { x: top ? r.x - 0.38 : r.x + r.w + 0.38, y: r.y + step * (idx + 1) }
        })
        return (
          <g key={it.id} data-table-key={t.key} onClick={() => onTable(t.key)} className="cursor-pointer" role="button" aria-label={`${t.label}: ${used} de ${t.seats} lugares`}>
            {(isHL || isFocus || armed) && (
              round ? (
                <circle cx={it.x} cy={it.y} r={radius + 1.05} fill="none" stroke={isHL || isFocus ? 'var(--chispa-soft)' : 'var(--line-strong)'} strokeWidth={isHL ? 0.16 : 0.08} strokeDasharray={armed && !isHL && !isFocus ? '0.3 0.25' : undefined} />
              ) : (
                <rect x={r.x - 0.8} y={r.y - 0.8} width={r.w + 1.6} height={r.h + 1.6} rx={0.5} fill="none" stroke={isHL || isFocus ? 'var(--chispa-soft)' : 'var(--line-strong)'} strokeWidth={isHL ? 0.16 : 0.08} strokeDasharray={armed && !isHL && !isFocus ? '0.3 0.25' : undefined} />
              )
            )}
            {seats.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={0.2} fill={i < used ? (over ? 'var(--danger)' : 'var(--sage)') : 'var(--surface)'} stroke="var(--line-strong)" strokeWidth={0.05} />
            ))}
            {round ? (
              <circle cx={it.x} cy={it.y} r={radius} fill={fill} stroke="var(--line-strong)" strokeWidth={0.06} />
            ) : (
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={0.25} fill={fill} stroke="var(--line-strong)" strokeWidth={0.06} />
            )}
            <text x={it.x} y={it.y - 0.18} fontSize={t.key === 0 ? 0.55 : 0.78} textAnchor="middle" dominantBaseline="central" fill="var(--ink)" style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}>
              {t.key === 0 ? 'Principal' : t.key}
            </text>
            <text x={it.x} y={it.y + 0.5} fontSize={0.4} textAnchor="middle" dominantBaseline="central" fill={over ? 'var(--danger)' : 'var(--ink-soft)'} style={{ fontFamily: 'var(--font-sans)' }}>
              {used}/{t.seats}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

const tone = (t: string) => `var(--${t === 'sky' ? 't-sky' : t})`

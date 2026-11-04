import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { BedDouble, CalendarHeart, ListChecks, Search, User, CornerDownLeft, Package } from 'lucide-react'
import { useStore, useMe } from '@/lib/store'
import { can, EVENT_TYPE, RES_STATUS, TASK_STATUS, UNIT_STATUS } from '@/lib/meta'
import { fmtDate } from '@/lib/format'
import { cx } from './ui'

interface Result {
  id: string
  group: string
  title: string
  sub: string
  to: string
  icon: typeof Search
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const data = useStore((s) => s.data)
  const me = useMe()

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const results = useMemo<Result[]>(() => {
    const n = norm(q.trim())
    const out: Result[] = []
    const match = (...fields: (string | undefined)[]) => !n || fields.some((f) => f && norm(f).includes(n))
    const role = me?.role
    if (can(role, 'mapa')) for (const u of Object.values(data.units)) if (!u.deleted && match(u.name, u.short)) out.push({ id: u.id, group: 'Unidades', title: u.name, sub: UNIT_STATUS[u.status].label, to: `/mapa?u=${u.id}`, icon: BedDouble })
    if (n && can(role, 'hospedaje'))
      for (const r of Object.values(data.reservations))
        if (!r.deleted && match(r.guestName, r.phone)) out.push({ id: r.id, group: 'Reservas', title: r.guestName, sub: `${data.units[r.unitId]?.name} · ${fmtDate(r.checkIn)} · ${RES_STATUS[r.status].label}`, to: `/hospedaje?r=${r.id}`, icon: BedDouble })
    if (can(role, 'eventos'))
      for (const e of Object.values(data.events))
        if (!e.deleted && (n ? match(e.title, e.clientName) : e.date >= new Date().toISOString().slice(0, 10))) out.push({ id: e.id, group: 'Eventos', title: e.title, sub: `${EVENT_TYPE[e.type].label} · ${fmtDate(e.date)}`, to: `/eventos/${e.id}`, icon: CalendarHeart })
    if (n)
      for (const t of Object.values(data.tasks)) if (!t.deleted && match(t.title)) out.push({ id: t.id, group: 'Tareas', title: t.title, sub: TASK_STATUS[t.status].label, to: `/tareas?t=${t.id}`, icon: ListChecks })
    if (n && can(role, 'inventario'))
      for (const i of Object.values(data.inventory)) if (!i.deleted && match(i.name)) out.push({ id: i.id, group: 'Inventario', title: i.name, sub: `${i.stock} ${i.unit}`, to: '/inventario', icon: Package })
    if (n && can(role, 'equipo'))
      for (const e of Object.values(data.employees)) if (!e.deleted && match(e.name)) out.push({ id: e.id, group: 'Equipo', title: e.name, sub: e.role, to: '/equipo', icon: User })
    return out.slice(0, 40)
  }, [q, data, me])

  const go = (r: Result) => {
    navigate(r.to)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => Math.min(results.length - 1, a + 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(0, a - 1))
      }
      if (e.key === 'Enter' && results[active]) go(results[active])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  let lastGroup = ''
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[10vh]">
          <motion.div className="absolute inset-0 bg-[color-mix(in_oklab,var(--ink)_35%,transparent)] backdrop-blur-[6px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ type: 'spring', stiffness: 500, damping: 36 }} className="relative w-full max-w-xl overflow-hidden rounded-[var(--r-lg)] bg-surface ring-1 ring-line shadow-[var(--shadow-3)]">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={20} className="text-ink-3" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setActive(0)
                }}
                placeholder="Buscar huésped, evento, cabaña, tarea…"
                className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
              />
              <kbd className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-bold text-ink-3">Esc</kbd>
            </div>
            <div className="scroll-area max-h-[55vh] overflow-y-auto p-2">
              {results.length === 0 && <p className="p-6 text-center text-sm text-ink-3">Sin resultados para “{q}”</p>}
              {results.map((r, i) => {
                const header = r.group !== lastGroup
                lastGroup = r.group
                const Icon = r.icon
                return (
                  <div key={r.group + r.id}>
                    {header && <div className="px-3 pt-3 pb-1 text-[12px] font-medium text-ink-3">{r.group}</div>}
                    <button onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left', i === active && 'bg-secondary')}>
                      <Icon size={18} className="shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{r.title}</span>
                        <span className="block truncate text-xs text-ink-3">{r.sub}</span>
                      </span>
                      {i === active && <CornerDownLeft size={16} className="text-ink-3" />}
                    </button>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

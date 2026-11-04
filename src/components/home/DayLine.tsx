// Línea del día: un deslizador de horas (6:00 → 24:00). Al moverlo, el plano pinta cómo estará
// cada cabaña y casa a esa hora (llegadas, salidas, limpiezas) y la agenda resalta lo que pasa.
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Clock, Sparkles } from 'lucide-react'
import type { Pastel, RanchEvent, Reservation, Settings, Task, Unit, UnitStatus } from '@/lib/types'
import { TONE, UNIT_STATUS } from '@/lib/meta'
import { today } from '@/lib/format'
import { ease, haptic } from '@/lib/motion'
import { Badge, Button, Card, CardHeader, cx } from '@/components/ui'

const RanchPlan2D = lazy(() => import('@/components/map/RanchPlan2D').then((m) => ({ default: m.RanchPlan2D })))

export interface DayItem {
  id: string
  time: string
  title: string
  sub: string
  tone: Pastel
  icon: typeof Clock
  to: string
}

const START = 6 * 60
const END = 24 * 60
const toMin = (t?: string) => {
  if (!t) return 0
  const [h = 0, m = 0] = t.split(':').map(Number)
  return (h < 5 ? h + 24 : h) * 60 + m
}
const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const localMin = (iso?: string) => {
  if (!iso) return Infinity
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export function DayLine({ units, reservations, events, tasks, settings, items }: { units: Unit[]; reservations: Reservation[]; events: RanchEvent[]; tasks: Task[]; settings: Settings; items: DayItem[] }) {
  const navigate = useNavigate()
  const T = today()
  const nowMin = Math.min(END, Math.max(START, new Date().getHours() * 60 + new Date().getMinutes()))
  const [t, setT] = useState(nowMin)
  const [active, setActive] = useState(false)
  const isNow = Math.abs(t - nowMin) < 10

  // Estado de cada unidad a la hora elegida
  const statusAt = useMemo(() => {
    const map: Record<string, UnitStatus> = {}
    for (const u of units) {
      if (u.status === 'mantenimiento') {
        map[u.id] = 'mantenimiento'
        continue
      }
      const mine = reservations.filter((r) => r.unitId === u.id && r.status !== 'cancelada' && r.guests > 0)
      const stay = mine.find((r) => r.checkIn < T && r.checkOut > T)
      const inn = mine.find((r) => r.checkIn === T)
      const out = mine.find((r) => r.checkOut === T)
      const clean = tasks.find((k) => k.type === 'limpieza' && k.unitId === u.id && (k.due?.slice(0, 10) === T || (k.completedAt && new Date(k.completedAt).toDateString() === new Date().toDateString())))
      let s: UnitStatus = u.status === 'ocupada' && !stay && !out ? 'lista' : u.status
      if (stay) s = 'ocupada'
      else if (out && t < toMin(settings.checkOutTime)) s = 'ocupada'
      else if (out || clean) {
        if (clean && localMin(clean.completedAt) <= t) s = clean.status === 'verificada' ? 'lista' : 'inspeccion'
        else if (clean && (localMin(clean.startedAt) <= t || (!clean.startedAt && localMin(clean.due) <= t && t > nowMin))) s = 'limpiando'
        else s = 'sucia'
      }
      if (inn && t >= toMin(inn.arrivalTime ?? settings.checkInTime)) s = 'ocupada'
      map[u.id] = s
    }
    return map
  }, [units, reservations, tasks, settings, t, T, nowMin])

  const live = events.filter((e) => e.date === T && toMin(e.startTime) <= t && t < (toMin(e.endTime) <= toMin(e.startTime) ? toMin(e.endTime) + 24 * 60 : toMin(e.endTime)))
  const counts = useMemo(() => {
    const c: Partial<Record<UnitStatus, number>> = {}
    for (const s of Object.values(statusAt)) c[s] = (c[s] ?? 0) + 1
    return c
  }, [statusAt])
  const pct = ((t - START) / (END - START)) * 100
  const nearest = items.reduce<DayItem | undefined>((best, it) => (Math.abs(toMin(it.time) - t) < Math.abs(toMin(best?.time) - t) ? it : best), undefined)

  return (
    <Card className="overflow-hidden">
      <CardHeader eyebrow="Línea del día" title="Mueve la hora y mira el rancho" subtitle="Llegadas, salidas, limpiezas y eventos a cualquier hora de hoy" action={!isNow && <Button size="sm" variant="outline" icon={<Clock size={15} strokeWidth={1.6} />} onClick={() => (haptic.select(), setT(nowMin))}>Ahora</Button>} />
      <div className="px-4 pt-4 md:px-5">
        <div className="flex items-baseline gap-3">
          <span className="text-[2.4rem] leading-none font-semibold tracking-[-0.03em] tabular">{fromMin(t)}</span>
          <span className="text-sm text-ink-soft">{isNow ? 'ahora mismo' : t < nowMin ? 'más temprano' : 'más tarde'}</span>
          <AnimatePresence>
            {live.map((e) => (
              <motion.span key={e.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Badge tone="rose" sparkle>
                  En curso: {e.title}
                </Badge>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        {/* Deslizador con marcas de lo que pasa en el día */}
        <div className="relative mt-4 h-14 select-none">
          <div className="absolute inset-x-0 top-6 h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full" style={{ width: `${((Math.min(nowMin, END) - START) / (END - START)) * 100}%`, backgroundImage: 'linear-gradient(90deg, var(--sky-3), var(--chispa-soft))', opacity: 0.55 }} />
          </div>
          {items.map((it) => {
            const m = toMin(it.time)
            if (m < START || m > END) return null
            return <span key={it.id} title={`${it.time} · ${it.title}`} className={cx('absolute top-[21px] h-[18px] w-[3px] -translate-x-1/2 rounded-full', TONE[it.tone].solid)} style={{ left: `${((m - START) / (END - START)) * 100}%` }} />
          })}
          <span className="absolute top-4 h-6 w-px bg-ink-3" style={{ left: `${((nowMin - START) / (END - START)) * 100}%` }} title="Ahora" />
          <div className={cx('pointer-events-none absolute top-[17px] h-[22px] w-[22px] -translate-x-1/2 rounded-full bg-surface ring-1 ring-line-strong transition-shadow', active ? 'shadow-[0_0_0_6px_color-mix(in_oklab,var(--luz)_35%,transparent),0_0_18px_var(--luz)]' : 'shadow-[var(--shadow-2)]')} style={{ left: `${pct}%` }}>
            <span className="absolute inset-[5px] rounded-full bg-[color-mix(in_oklab,var(--luz)_70%,var(--chispa-soft))]" />
          </div>
          <div className="absolute inset-x-0 top-11 flex justify-between text-[10.5px] text-ink-3 tabular">
            {['6:00', '9:00', '12:00', '15:00', '18:00', '21:00', '24:00'].map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          <input
            type="range"
            min={START}
            max={END}
            step={15}
            value={t}
            aria-label="Hora del día"
            aria-valuetext={fromMin(t)}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (items.some((it) => Math.abs(toMin(it.time) - v) < 8)) haptic.select()
              setT(v)
            }}
            onPointerDown={() => setActive(true)}
            onPointerUp={() => setActive(false)}
            onBlur={() => setActive(false)}
            className="absolute inset-x-0 top-2 h-10 w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
      <div className="grid gap-4 p-4 md:p-5 lg:grid-cols-[1fr_300px]">
        <div className="relative h-[300px] overflow-hidden rounded-[16px] bg-sunken ring-1 ring-line sm:h-[340px]">
          <Suspense fallback={<div className="skeleton h-full w-full" />}>
            <RanchPlan2D
              compact
              className="h-full w-full"
              statusOf={(id) => statusAt[id]}
              onSelect={(fid: string) => {
                const unit = units.find((u) => u.mapId === fid)
                navigate(unit ? `/mapa?u=${unit.id}` : `/mapa?f=${fid}`)
              }}
            />
          </Suspense>
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap gap-1.5">
            {(Object.keys(counts) as UnitStatus[]).map((s) => (
              <span key={s} className="glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] ring-1 ring-line">
                <span className={cx('h-2 w-2 rounded-full', TONE[UNIT_STATUS[s].tone].solid)} />
                {UNIT_STATUS[s].label} <span className="tabular text-ink-3">{counts[s]}</span>
              </span>
            ))}
          </div>
        </div>
        <ol className="flex max-h-[340px] flex-col gap-0.5 overflow-y-auto pr-1">
          {items.length === 0 && (
            <li className="flex items-center gap-2 rounded-[12px] bg-sunken px-3 py-3 text-sm text-ink-soft">
              <Sparkles size={15} strokeWidth={1.6} /> Día tranquilo: nada agendado.
            </li>
          )}
          {items.map((it) => {
            const m = toMin(it.time)
            const past = m < t
            const here = nearest?.id === it.id && Math.abs(m - t) <= 45
            const Icon = it.icon
            return (
              <li key={it.id} className={cx('flex items-start gap-1 rounded-[12px] transition-[background-color,opacity] duration-[var(--dur-2)] hover:bg-wash', past && !here && 'opacity-45', here && 'bg-[color-mix(in_oklab,var(--luz)_26%,var(--surface))] ring-1 ring-[color-mix(in_oklab,var(--luz)_60%,transparent)]')}>
                {/* La hora mueve la línea del día; el resto abre el detalle (botón y enlace separados: HTML válido) */}
                <button type="button" onClick={() => setT(Math.min(END, Math.max(START, m)))} className="min-h-10 w-12 shrink-0 rounded-[10px] px-2 pt-2.5 text-left text-xs text-ink-soft tabular hover:text-ink" title="Ir a esta hora" aria-label={`Ir a las ${it.time}`}>
                  {it.time}
                </button>
                <Link to={it.to} className="flex min-w-0 flex-1 items-start gap-2.5 py-2 pr-2.5">
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[it.tone].solid)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <Icon size={13} strokeWidth={1.6} className="shrink-0 text-ink-soft" />
                      <span className="text-[14px] font-medium">{it.title}</span>
                    </span>
                    <span className="block text-[12.5px] text-detail">{it.sub}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </div>
      <motion.p initial={false} animate={{ opacity: isNow ? 0 : 1 }} transition={{ duration: 0.3, ease: ease.calma }} className="px-5 pb-4 text-xs text-ink-3">
        Lo que ves después de ahora es lo programado; puede cambiar.
      </motion.p>
    </Card>
  )
}

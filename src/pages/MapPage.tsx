import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Box, CalendarHeart, Clock3, Map as MapIcon, Moon, Navigation2, Pause, Play, Sun, Sunset, TreePalm, X } from 'lucide-react'
import { FEATURES, featureById, featureByUnit } from '@/lib/layout'
import { useCollection } from '@/lib/store'
import { EVENT_TYPE, TONE, UNIT_STATUS } from '@/lib/meta'
import { daysUntil, relativeDay, today } from '@/lib/format'
import { ease, haptic, spring } from '@/lib/motion'
import type { RanchEvent, UnitStatus } from '@/lib/types'
import { Badge, Button, cx, Segmented, Sheet, Toggle, useMedia } from '@/components/ui'
import { LightDots } from '@/components/step1'
import { RanchPlan2D } from '@/components/map/RanchPlan2D'
import { UnitPanel } from '@/components/map/UnitPanel'
import { ranchTime, sunState, type TimeMode } from '@/components/map/sun'
import type { UnitInfo } from '@/components/map/RanchScene3D'

const RanchScene3D = lazy(() => import('@/components/map/RanchScene3D'))

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function SceneFallback() {
  return (
    <div className="bg-cielo-soft flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <LightDots className="text-chispa-soft" />
        <p className="text-sm text-ink-soft">Construyendo la maqueta del rancho</p>
      </div>
    </div>
  )
}

const load = <T,>(k: string, fallback: T, ok: (v: string) => boolean): T => {
  try {
    const v = localStorage.getItem(k)
    if (v && ok(v)) return v as unknown as T
  } catch {
    /* sin almacenamiento */
  }
  return fallback
}
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento */
  }
}

const TIME_OPTIONS: { value: TimeMode; label: React.ReactNode }[] = [
  { value: 'ahora', label: <><Clock3 size={14} strokeWidth={1.6} /> Ahora</> },
  { value: 'dia', label: <><Sun size={14} strokeWidth={1.6} /> Día</> },
  { value: 'atardecer', label: <><Sunset size={14} strokeWidth={1.6} /> Tarde</> },
  { value: 'noche', label: <><Moon size={14} strokeWidth={1.6} /> Noche</> },
]
const TIME_CYCLE: TimeMode[] = ['ahora', 'dia', 'atardecer', 'noche']

export default function MapPage() {
  const units = useCollection('units')
  const reservations = useCollection('reservations')
  const tasks = useCollection('tasks')
  const events = useCollection('events')
  const [params, setParams] = useSearchParams()
  const isMobile = useMedia('(max-width: 767px)')
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)')
  const webgl = useMemo(hasWebGL, [])
  const [mode, setMode] = useState<'3d' | '2d'>(() => load('lajoya:mapMode', '3d', (v) => v === '2d' || v === '3d'))
  const [timeMode, setTimeMode] = useState<TimeMode>(() => load('lajoya:mapTime', 'ahora', (v) => TIME_CYCLE.includes(v as TimeMode)))
  const [statusFilter, setStatusFilter] = useState<UnitStatus | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [touring, setTouring] = useState(false)
  const [azimuth, setAzimuth] = useState(0)
  const [clock, setClock] = useState(() => ranchTime())
  const effectiveMode = webgl ? mode : '2d'
  const [resetKey, setResetKey] = useState(0)
  const t = today()

  useEffect(() => save('lajoya:mapMode', mode), [mode])
  useEffect(() => save('lajoya:mapTime', timeMode), [timeMode])
  useEffect(() => {
    const iv = setInterval(() => setClock(ranchTime()), 30_000)
    return () => clearInterval(iv)
  }, [])

  const selectedId = useMemo(() => {
    const u = params.get('u')
    const f = params.get('f')
    if (u) return featureByUnit(u)?.id ?? null
    if (f && featureById(f)) return f
    return null
  }, [params])

  const select = useCallback(
    (featureId: string | null) => {
      const f = featureId ? featureById(featureId) : undefined
      const next = new URLSearchParams()
      if (f?.unitId) next.set('u', f.unitId)
      else if (f) next.set('f', f.id)
      setParams(next, { replace: true })
    },
    [setParams],
  )

  const unitList = useMemo(() => {
    const order = ['cabana', 'casa']
    return FEATURES.filter((f) => f.unitId)
      .map((f) => ({ f, u: units.find((u) => u.id === f.unitId)! }))
      .filter((x) => x.u)
      .sort((a, b) => order.indexOf(a.f.kind) - order.indexOf(b.f.kind))
  }, [units])

  const counts = useMemo(() => {
    const c: Partial<Record<UnitStatus, number>> = {}
    for (const u of units) c[u.status] = (c[u.status] ?? 0) + 1
    return c
  }, [units])

  // Tarjetas del mapa: huésped, próxima llegada y avance de limpieza
  const unitInfo = useMemo(() => {
    const out: Record<string, UnitInfo> = {}
    for (const u of units) {
      const mine = reservations.filter((r) => r.unitId === u.id && r.status !== 'cancelada')
      const cur = mine.find((r) => r.status === 'en-casa')
      const next = mine.filter((r) => (r.status === 'confirmada' || r.status === 'pendiente') && r.checkIn >= t && !(r.guests === 0 && r.externalUid)).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0]
      const clean = tasks.find((x) => x.unitId === u.id && x.type === 'limpieza' && x.status !== 'verificada')
      out[u.id] = {
        guest: cur ? `${cur.guestName} · ${cur.guests} huésp.` : next ? `Llega ${relativeDay(next.checkIn).toLowerCase()}: ${next.guestName}` : undefined,
        detail: cur ? `Sale ${relativeDay(cur.checkOut).toLowerCase()}` : next?.arrivalTime ? `A las ${next.arrivalTime}` : clean ? 'Limpieza en curso' : 'Sin reservas próximas',
        cleaning: clean && clean.checklist.length ? clean.checklist.filter((c) => c.done).length / clean.checklist.length : undefined,
      }
    }
    return out
  }, [units, reservations, tasks, t])

  // Evento de hoy o el próximo con plano de mesas
  const setupEvent = useMemo<RanchEvent | null>(
    () =>
      events
        .filter((e) => e.date >= t && e.status !== 'cancelado' && e.layout.length > 0)
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [events, t],
  )

  // Recorrido: vuela por cada unidad, 3.8 s en cada una
  const tourStops = useMemo(() => unitList.map((x) => x.f.id), [unitList])
  useEffect(() => {
    if (!touring) return
    let i = Math.max(0, tourStops.indexOf(selectedId ?? '') + 1) % tourStops.length
    select(tourStops[i] ?? null)
    const iv = setInterval(() => {
      i = (i + 1) % tourStops.length
      select(tourStops[i] ?? null)
      haptic.select()
    }, 3800)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touring])
  const stopTour = () => setTouring(false)

  const selectedFeature = selectedId ? featureById(selectedId) : undefined
  const spaces = [featureById('salon')!, featureById('jardin')!]
  const sun = sunState(timeMode)
  const timeLabel = timeMode === 'ahora' ? `${sun.label} · ${clock} en el rancho` : `Vista de ${sun.label.toLowerCase()}`
  const tourIndex = selectedId ? tourStops.indexOf(selectedId) : -1

  const toggle = (
    <Segmented
      size="sm"
      value={effectiveMode}
      onChange={(v) => {
        if (v === '3d' && !webgl) return
        setMode(v)
      }}
      options={[
        { value: '3d', label: <><Box size={14} strokeWidth={1.6} /> 3D</> },
        { value: '2d', label: <><MapIcon size={14} strokeWidth={1.6} /> Plano</> },
      ]}
    />
  )

  const toggleSetup = (v: boolean) => {
    setShowSetup(v)
    if (v && setupEvent) select(setupEvent.venue === 'salon' ? 'salon' : 'jardin')
  }

  const StatusChips = ({ className }: { className?: string }) => (
    <div className={cx('no-scrollbar flex gap-1.5 overflow-x-auto', className)} role="group" aria-label="Filtrar por estado">
      {(Object.keys(UNIT_STATUS) as UnitStatus[]).map((s) => {
        const active = statusFilter === s
        const n = counts[s] ?? 0
        return (
          <button
            key={s}
            aria-pressed={active}
            onClick={() => {
              haptic.select()
              setStatusFilter(active ? null : s)
            }}
            className={cx('pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs whitespace-nowrap', active ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-wash hover:text-ink', !n && !active && 'opacity-50')}
          >
            <span className={cx('h-2 w-2 rounded-full', TONE[UNIT_STATUS[s].tone].solid)} />
            {UNIT_STATUS[s].label}
            <span className={cx('tabular', active ? 'opacity-70' : 'text-ink-3')}>{n}</span>
          </button>
        )
      })}
    </div>
  )

  const Compass = (
    <button
      onClick={() => {
        stopTour()
        select(null)
        setResetKey((k) => k + 1)
      }}
      aria-label="Centrar el mapa y orientar al norte"
      title="Centrar"
      className="glass pressable flex h-12 w-12 items-center justify-center rounded-full shadow-[var(--shadow-2)] ring-1 ring-line"
    >
      <motion.span animate={{ rotate: (azimuth * 180) / Math.PI }} transition={{ duration: 0.2 }} className="relative flex flex-col items-center">
        <Navigation2 size={18} strokeWidth={1.6} className="text-chispa" fill="currentColor" />
        <span className="-mt-0.5 text-[9px] leading-none font-medium text-ink">N</span>
      </motion.span>
    </button>
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper">
      {/* Lienzo */}
      <div className="absolute inset-0">
        {effectiveMode === '3d' ? (
          <Suspense fallback={<SceneFallback />}>
            <RanchScene3D
              units={units}
              selectedId={selectedId}
              onSelect={(id) => {
                if (touring) stopTour()
                select(id)
              }}
              reducedMotion={reducedMotion}
              resetKey={resetKey}
              timeMode={timeMode}
              statusFilter={statusFilter}
              unitInfo={unitInfo}
              setupEvent={setupEvent}
              showSetup={showSetup}
              touring={touring}
              onAzimuth={setAzimuth}
            />
          </Suspense>
        ) : (
          <div className={cx('absolute inset-x-0', isMobile ? 'top-[calc(env(safe-area-inset-top)+112px)] bottom-[calc(150px+env(safe-area-inset-bottom))]' : 'top-[76px] bottom-[68px] left-[320px]')}>
            <RanchPlan2D selectedId={selectedId} onSelect={select} onClear={() => select(null)} reducedMotion={reducedMotion} statusFilter={statusFilter} className="h-full w-full" />
          </div>
        )}
      </div>

      {/* ── Móvil ─────────────────────────────────────── */}
      {isMobile && (
        <>
          <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+62px)] z-10">
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
              <div className="glass shrink-0 rounded-full p-0.5 shadow-[var(--shadow-1)] ring-1 ring-line">{toggle}</div>
              {unitList.map(({ f, u }) => (
                <button
                  key={f.id}
                  onClick={() => {
                    stopTour()
                    select(f.id)
                  }}
                  className={cx('glass pressable inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] shadow-[var(--shadow-1)]', selectedId === f.id ? 'ring-[1.5px] ring-ink' : 'ring-1 ring-line', statusFilter && u.status !== statusFilter && 'opacity-45')}
                >
                  <span className={cx('h-2 w-2 rounded-full', TONE[UNIT_STATUS[u.status].tone].solid)} />
                  {u.short}
                </button>
              ))}
              {spaces.map((f) => (
                <button key={f.id} onClick={() => select(f.id)} className={cx('glass pressable inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] shadow-[var(--shadow-1)]', selectedId === f.id ? 'ring-[1.5px] ring-ink' : 'ring-1 ring-line')}>
                  {f.id === 'salon' ? <CalendarHeart size={14} strokeWidth={1.6} /> : <TreePalm size={14} strokeWidth={1.6} />}
                  {f.id === 'salon' ? 'Salón' : 'Jardín'}
                </button>
              ))}
            </div>
          </div>

          {effectiveMode === '3d' && (
            <div className="absolute top-[calc(env(safe-area-inset-top)+118px)] right-4 z-10 flex flex-col gap-2">
              {Compass}
              <button
                onClick={() => {
                  haptic.select()
                  setTimeMode((m) => TIME_CYCLE[(TIME_CYCLE.indexOf(m) + 1) % TIME_CYCLE.length]!)
                }}
                aria-label={`Hora del mapa: ${sun.label}`}
                className="glass pressable flex h-12 w-12 items-center justify-center rounded-full text-ink shadow-[var(--shadow-2)] ring-1 ring-line"
              >
                {timeMode === 'noche' ? <Moon size={19} strokeWidth={1.6} /> : timeMode === 'atardecer' ? <Sunset size={19} strokeWidth={1.6} /> : timeMode === 'dia' ? <Sun size={19} strokeWidth={1.6} /> : <Clock3 size={19} strokeWidth={1.6} />}
              </button>
              <button onClick={() => setTouring((v) => !v)} aria-label={touring ? 'Detener recorrido' : 'Iniciar recorrido'} className={cx('pressable flex h-12 w-12 items-center justify-center rounded-full shadow-[var(--shadow-2)]', touring ? 'bg-ink text-paper' : 'glass text-ink ring-1 ring-line')}>
                {touring ? <Pause size={18} strokeWidth={1.6} /> : <Play size={18} strokeWidth={1.6} />}
              </button>
              {setupEvent && (
                <button onClick={() => toggleSetup(!showSetup)} aria-label="Ver montaje del evento" aria-pressed={showSetup} className={cx('pressable flex h-12 w-12 items-center justify-center rounded-full shadow-[var(--shadow-2)]', showSetup ? 'bg-ink text-paper' : 'glass text-ink ring-1 ring-line')}>
                  <CalendarHeart size={18} strokeWidth={1.6} />
                </button>
              )}
            </div>
          )}

          {/* Leyenda / filtro */}
          <div className="glass absolute inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-10 rounded-full p-1 shadow-[var(--shadow-2)] ring-1 ring-line">
            <StatusChips />
          </div>

          {/* Tarjeta del recorrido */}
          <AnimatePresence>
            {touring && selectedFeature?.unitId && (
              <motion.div key="tour" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }} exit={{ opacity: 0, y: 10 }} className="glass absolute inset-x-4 bottom-[calc(150px+env(safe-area-inset-bottom))] z-20 rounded-[var(--r-lg)] p-4 shadow-[var(--shadow-3)] ring-1 ring-line">
                <TourCard featureId={selectedFeature.id} index={tourIndex} total={tourStops.length} info={unitInfo[selectedFeature.unitId]} onStop={stopTour} />
              </motion.div>
            )}
          </AnimatePresence>

          <Sheet open={!!selectedFeature && !touring} onClose={() => select(null)} title={selectedFeature?.name}>
            {selectedFeature && <UnitPanel featureId={selectedFeature.id} compactHeader />}
          </Sheet>
        </>
      )}

      {/* ── Tablet / escritorio ───────────────────────── */}
      {!isMobile && (
        <>
          <motion.aside initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.48, ease: ease.calma } }} className="glass absolute top-[84px] left-5 z-10 flex max-h-[calc(100%-176px)] w-[296px] flex-col rounded-[var(--r-lg)] shadow-[var(--shadow-3)] ring-1 ring-line">
            <div className="px-5 pt-5">
              <p className="eyebrow flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-chispa-soft shadow-[0_0_10px_var(--luz)]" />
                {effectiveMode === '3d' ? timeLabel : 'Plano del rancho'}
              </p>
              <h1 className="heading mt-2 text-[1.75rem]">Mapa del rancho</h1>
              <p className="mt-1 text-sm text-ink-soft">Toca una cabaña o casa para verla de cerca.</p>
            </div>
            <div className="flex flex-col gap-2.5 px-5 pt-4">
              {toggle}
              {effectiveMode === '3d' && <Segmented size="sm" value={timeMode} onChange={setTimeMode} options={TIME_OPTIONS} className="w-full" />}
            </div>
            {!webgl && <p className="px-5 pt-2 text-xs text-warning">Este equipo no soporta 3D; se muestra el plano.</p>}
            <div className="scroll-area mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <ListGroup title="Hospedaje">
                {unitList.map(({ f, u }) => {
                  const st = UNIT_STATUS[u.status]
                  return (
                    <ListItem
                      key={f.id}
                      active={selectedId === f.id}
                      dim={!!statusFilter && u.status !== statusFilter}
                      onClick={() => {
                        stopTour()
                        select(f.id)
                      }}
                      dot={TONE[st.tone].solid}
                      title={u.name}
                      sub={unitInfo[u.id]?.guest ?? st.label}
                    />
                  )
                })}
              </ListGroup>
              <ListGroup title="Espacios para eventos">
                {spaces.map((f) => (
                  <ListItem key={f.id} active={selectedId === f.id} onClick={() => select(f.id)} icon={f.id === 'salon' ? <CalendarHeart size={15} strokeWidth={1.6} /> : <TreePalm size={15} strokeWidth={1.6} />} title={f.name} sub={f.id === 'salon' ? 'Hasta 300 invitados' : 'Hasta 400 invitados'} />
                ))}
              </ListGroup>
            </div>
            {effectiveMode === '3d' && (
              <div className="border-t border-line p-4">
                {setupEvent && (
                  <div className="mb-3 rounded-[14px] bg-sunken p-3">
                    <Toggle
                      checked={showSetup}
                      onChange={toggleSetup}
                      label={<span className="text-sm">Ver montaje del evento</span>}
                      description={
                        <span className="text-xs">
                          {EVENT_TYPE[setupEvent.type].label} · {setupEvent.title.length > 22 ? setupEvent.title.slice(0, 22) + '…' : setupEvent.title} · {daysUntil(setupEvent.date) === 0 ? 'hoy' : relativeDay(setupEvent.date).toLowerCase()}
                        </span>
                      }
                    />
                  </div>
                )}
                <Button variant={touring ? 'tinta' : 'secondary'} size="sm" className="w-full" icon={touring ? <Pause size={16} strokeWidth={1.6} /> : <Play size={16} strokeWidth={1.6} />} onClick={() => setTouring((v) => !v)}>
                  {touring ? 'Detener recorrido' : 'Recorrido por las unidades'}
                </Button>
              </div>
            )}
          </motion.aside>

          {/* Leyenda / filtro por estado */}
          <div className={cx('glass absolute bottom-5 z-10 max-w-[calc(100%-360px)] rounded-full p-1 shadow-[var(--shadow-2)] ring-1 ring-line', selectedFeature ? 'left-[332px]' : 'left-1/2 -translate-x-1/2')}>
            <StatusChips />
          </div>

          {/* Brújula */}
          {effectiveMode === '3d' && <div className={cx('absolute top-[84px] z-10 transition-[right] duration-[var(--dur-4)]', selectedFeature ? 'right-[min(436px,calc(100%-330px))]' : 'right-5')}>{Compass}</div>}

          {/* Recorrido en curso */}
          <AnimatePresence>
            {touring && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="glass absolute top-[84px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-sm shadow-[var(--shadow-2)] ring-1 ring-line">
                <span className="text-chispa-soft">✦</span>
                Recorrido · {Math.max(1, tourIndex + 1)} de {tourStops.length}
                <Button size="sm" variant="tinta" className="!h-8" icon={<X size={14} strokeWidth={1.6} />} onClick={stopTour}>
                  Detener
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Detalle */}
          <AnimatePresence>
            {selectedFeature && (
              <motion.aside key={selectedFeature.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.2, ease: ease.salida } }} transition={spring.suave} className="absolute top-[84px] right-5 z-20 flex max-h-[calc(100%-112px)] w-[min(400px,calc(100%-340px))] flex-col rounded-[var(--r-lg)] bg-surface shadow-[var(--shadow-3)] ring-1 ring-line">
                <div className="flex justify-end px-3 pt-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cerrar detalle"
                    onClick={() => {
                      stopTour()
                      select(null)
                    }}
                  >
                    <X size={18} strokeWidth={1.6} />
                  </Button>
                </div>
                <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                  <UnitPanel featureId={selectedFeature.id} />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

function TourCard({ featureId, index, total, info, onStop }: { featureId: string; index: number; total: number; info?: UnitInfo; onStop: () => void }) {
  const f = featureById(featureId)!
  const units = useCollection('units')
  const u = units.find((x) => x.id === f.unitId)
  if (!u) return null
  const st = UNIT_STATUS[u.status]
  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">
            Recorrido · {index + 1} de {total}
          </p>
          <p className="heading mt-1 truncate text-[1.45rem]">{u.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
            {info?.guest && <span className="truncate text-xs text-ink-soft">{info.guest}</span>}
          </div>
        </div>
        <Button size="icon" variant="tinta" aria-label="Detener recorrido" onClick={onStop}>
          <Pause size={18} strokeWidth={1.6} />
        </Button>
      </div>
      <div className="mt-3 flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={cx('h-1 flex-1 rounded-full transition-colors duration-[var(--dur-4)]', i <= index ? 'bg-ink' : 'bg-line-strong')} />
        ))}
      </div>
    </div>
  )
}

function ListGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="eyebrow px-3 pt-2 pb-1.5">{title}</p>
      {children}
    </div>
  )
}

function ListItem({ active, dim, onClick, dot, icon, title, sub }: { active: boolean; dim?: boolean; onClick: () => void; dot?: string; icon?: React.ReactNode; title: string; sub: string }) {
  return (
    <button onClick={onClick} className={cx('pressable flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-opacity duration-[var(--dur-3)]', active ? 'bg-surface shadow-[var(--shadow-1)] ring-1 ring-line' : 'hover:bg-wash', dim && 'opacity-40')}>
      {dot ? <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', dot)} /> : <span className="text-ink-soft">{icon}</span>}
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium">{title}</span>
        <span className="block truncate text-xs text-ink-soft">{sub}</span>
      </span>
    </button>
  )
}

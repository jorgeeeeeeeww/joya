import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Box, CalendarHeart, List, Map as MapIcon, Pause, Play, Sparkles, TreePalm, X } from 'lucide-react'
import { FEATURES, featureById, featureByUnit } from '@/lib/layout'
import { useCollection, useMe } from '@/lib/store'
import { TONE, UNIT_STATUS } from '@/lib/meta'
import { relativeDay, today } from '@/lib/format'
import { ease, haptic, spring } from '@/lib/motion'
import type { UnitStatus } from '@/lib/types'
import { Badge, Button, cx, Segmented, Sheet, useMedia } from '@/components/ui'
import { RanchPlan2D } from '@/components/map/RanchPlan2D'
import { UnitPanel } from '@/components/map/UnitPanel'
import RanchIllustrated, { type UnitInfo } from '@/components/map/RanchIllustrated'
import { LightDots } from '@/components/step1'

// El 3D solo para el dueño en pantalla grande (se carga aparte, solo si lo abre)
const RanchScene3D = lazy(() => import('@/components/map/RanchScene3D'))
const hasWebGL = () => {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
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

/** De noche (7 p.m. a 7 a.m.) el mapa se oscurece y las ventanas se encienden */
const isNight = () => {
  const h = new Date().getHours()
  return h >= 19 || h < 7
}

export default function MapPage() {
  const units = useCollection('units')
  const reservations = useCollection('reservations')
  const tasks = useCollection('tasks')
  const events = useCollection('events')
  const [params, setParams] = useSearchParams()
  const isMobile = useMedia('(max-width: 767px)')
  const isWide = useMedia('(min-width: 1280px)')
  const [mode0, setMode] = useState<'ilustrado' | 'plano' | '3d'>(() => load('lajoya:mapView', 'ilustrado', (v) => v === 'ilustrado' || v === 'plano' || v === '3d'))
  const isOwner = useMe()?.role === 'admin'
  const bigScreen = useMedia('(min-width: 1024px)')
  const can3d = useMemo(() => isOwner && bigScreen && hasWebGL(), [isOwner, bigScreen])
  const mode = mode0 === '3d' && !can3d ? 'ilustrado' : mode0
  const [statusFilter, setStatusFilter] = useState<UnitStatus | null>(null)
  const [touring, setTouring] = useState(false)
  const [listOpen, setListOpen] = useState(() => window.matchMedia('(min-width: 1280px)').matches)
  // Celular: tocar una casa muestra una tarjeta breve y deja el mapa a la vista; la ficha completa se abre aparte
  const [fichaOpen, setFichaOpen] = useState(false)
  const [night, setNight] = useState(isNight)
  const t = today()

  useEffect(() => save('lajoya:mapView', mode), [mode])
  useEffect(() => {
    const iv = setInterval(() => setNight(isNight()), 60_000)
    return () => clearInterval(iv)
  }, [])

  const selectedId = useMemo(() => {
    const u = params.get('u')
    const f = params.get('f')
    if (u) return featureByUnit(u)?.id ?? null
    if (f && featureById(f)) return f
    return null
  }, [params])
  // Otra casa (o ninguna): la ficha completa se cierra y vuelve la tarjeta breve
  const [fichaFor, setFichaFor] = useState<string | null>(null)
  if (fichaFor !== selectedId) {
    setFichaFor(selectedId)
    if (fichaOpen) setFichaOpen(false)
  }

  const select = useCallback(
    (featureId: string | null) => {
      const f = featureId ? featureById(featureId) : undefined
      const next = new URLSearchParams()
      if (f?.unitId) next.set('u', f.unitId)
      else if (f) next.set('f', f.id)
      setParams(next, { replace: true })
      // En tablet la lista se cierra al elegir: así la casa y su ficha quedan a la vista
      if (f && !isWide) setListOpen(false)
    },
    [setParams, isWide],
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
      const pct = clean && clean.checklist.length ? clean.checklist.filter((c) => c.done).length / clean.checklist.length : undefined
      out[u.id] = {
        guest: cur ? `${cur.guestName} · ${cur.guests} huésp.` : next ? `Llega ${relativeDay(next.checkIn).toLowerCase()}: ${next.guestName}` : undefined,
        detail: cur ? `Sale ${relativeDay(cur.checkOut).toLowerCase()}` : next?.arrivalTime ? `A las ${next.arrivalTime}` : clean ? 'Limpieza en curso' : 'Sin reservas próximas',
        cleaning: pct,
        short:
          u.status === 'limpiando' && clean
            ? `Limpiando · ${Math.round((pct ?? 0) * 100)}%`
            : cur
              ? `Sale ${cur.checkOut === t ? 'hoy' : relativeDay(cur.checkOut).toLowerCase()}`
              : next && next.checkIn === t
                ? `Llegan hoy${next.arrivalTime ? ` ${next.arrivalTime}` : ''}`
                : u.status === 'sucia'
                  ? 'Por limpiar'
                  : u.status === 'inspeccion'
                    ? 'Por revisar'
                    : u.status === 'mantenimiento'
                      ? 'En mantenimiento'
                      : next
                        ? `Llegan ${relativeDay(next.checkIn).toLowerCase()}`
                        : 'Libre',
      }
    }
    return out
  }, [units, reservations, tasks, t])

  // Evento de hoy en el salón o el jardín: se marca sobre el lugar
  const eventToday = useMemo(() => {
    const out: { salon?: string; jardin?: string } = {}
    for (const e of events) if (e.date === t && e.status !== 'cancelado') out[e.venue] = `Evento hoy · ${e.startTime}`
    return out
  }, [events, t])

  // Recorrido: pasa por cada casa, 3.8 s en cada una
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
  const tourIndex = selectedId ? tourStops.indexOf(selectedId) : -1

  const toggle = (
    <Segmented
      size="sm"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'ilustrado', label: <><Sparkles size={14} strokeWidth={1.6} /> Ilustrado</> },
        { value: 'plano', label: <><MapIcon size={14} strokeWidth={1.6} /> Plano</> },
        ...(can3d ? [{ value: '3d' as const, label: <><Box size={14} strokeWidth={1.6} /> 3D</> }] : []),
      ]}
    />
  )

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

  const detailW = 400
  const canvas =
    mode === 'ilustrado' ? (
      <RanchIllustrated
        units={units}
        selectedId={selectedId}
        onSelect={(id) => {
          if (touring) stopTour()
          select(id)
        }}
        onClear={() => select(null)}
        statusFilter={statusFilter}
        unitInfo={unitInfo}
        eventToday={eventToday}
        night={night}
        coverRight={!isMobile && selectedFeature ? detailW + 24 : 0}
        coverBottom={isMobile && selectedFeature ? 230 : 0}
      />
    ) : mode === '3d' ? (
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center">
            <LightDots className="text-chispa-soft" />
          </div>
        }
      >
        <RanchScene3D units={units} selectedId={selectedId} onSelect={(id) => select(id)} statusFilter={statusFilter} unitInfo={unitInfo} touring={touring} focusShiftPx={selectedFeature ? detailW + 24 - (listOpen ? 296 : 0) : 0} />
      </Suspense>
    ) : (
      <RanchPlan2D selectedId={selectedId} onSelect={select} onClear={() => select(null)} statusFilter={statusFilter} className="h-full w-full" />
    )

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper">
      {/* Lienzo */}
      <div className={cx('absolute inset-x-0', isMobile ? 'top-[calc(env(safe-area-inset-top)+112px)] bottom-[calc(150px+env(safe-area-inset-bottom))]' : 'top-[120px] bottom-[64px]')}>{canvas}</div>

      {/* ── Celular ─────────────────────────────────────── */}
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

          {/* Leyenda / filtro (con una casa elegida, su tarjeta ocupa este lugar) */}
          {(!selectedFeature || touring) && (
            <div className="glass absolute inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-10 rounded-full p-1 shadow-[var(--shadow-2)] ring-1 ring-line">
              <StatusChips />
            </div>
          )}

          <AnimatePresence>
            {selectedFeature && !touring && (
              <motion.div key={selectedFeature.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.36, ease: ease.calma } }} exit={{ opacity: 0, y: 10, transition: { duration: 0.18 } }} className="glass absolute inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 rounded-[var(--r-lg)] p-4 shadow-[var(--shadow-3)] ring-1 ring-line">
                <PeekCard featureId={selectedFeature.id} info={selectedFeature.unitId ? unitInfo[selectedFeature.unitId] : undefined} onOpen={() => setFichaOpen(true)} onClose={() => select(null)} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {touring && selectedFeature?.unitId && (
              <motion.div key="tour" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }} exit={{ opacity: 0, y: 10 }} className="glass absolute inset-x-4 bottom-[calc(150px+env(safe-area-inset-bottom))] z-20 rounded-[var(--r-lg)] p-4 shadow-[var(--shadow-3)] ring-1 ring-line">
                <TourCard featureId={selectedFeature.id} index={tourIndex} total={tourStops.length} info={unitInfo[selectedFeature.unitId]} onStop={stopTour} />
              </motion.div>
            )}
          </AnimatePresence>

          <Sheet open={!!selectedFeature && !touring && fichaOpen} onClose={() => setFichaOpen(false)} title={selectedFeature?.name}>
            {selectedFeature && <UnitPanel featureId={selectedFeature.id} compactHeader />}
          </Sheet>
        </>
      )}

      {/* ── Tablet / escritorio ───────────────────────── */}
      {!isMobile && (
        <>
          {/* Barra superior: título, vista y lista; ya no tapa el mapa */}
          {/* Debajo de la barra superior de la app (buscador, avisos), que en el mapa va encima */}
          <div className="absolute top-[64px] left-5 z-20 flex flex-wrap items-center gap-2">
            <div className="glass flex items-center gap-3 rounded-full py-1 pr-1 pl-4 shadow-[var(--shadow-1)] ring-1 ring-line">
              <span className="heading text-[1.15rem] leading-none">Mapa del rancho</span>
              {toggle}
            </div>
            <button onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen} className={cx('pressable inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm shadow-[var(--shadow-1)] ring-1 ring-line', listOpen ? 'bg-ink text-paper' : 'glass')}>
              <List size={16} strokeWidth={1.6} /> Casas y cabañas
            </button>
            <button onClick={() => setTouring((v) => !v)} aria-label={touring ? 'Detener recorrido' : 'Recorrido por las casas'} className={cx('pressable inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm shadow-[var(--shadow-1)]', touring ? 'bg-ink text-paper' : 'glass ring-1 ring-line')}>
              {touring ? <Pause size={16} strokeWidth={1.6} /> : <Play size={16} strokeWidth={1.6} />} {touring ? 'Detener' : 'Recorrido'}
            </button>
          </div>

          {/* Lista translúcida que se abre y se cierra */}
          <AnimatePresence>
            {listOpen && (
              <motion.aside initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.36, ease: ease.calma } }} exit={{ opacity: 0, x: -12, transition: { duration: 0.18 } }} className="absolute top-[124px] left-5 z-10 flex max-h-[calc(100%-200px)] w-[272px] flex-col rounded-[var(--r-lg)] bg-[color-mix(in_oklab,var(--surface)_78%,transparent)] shadow-[var(--shadow-2)] ring-1 ring-line backdrop-blur-md">
                <div className="scroll-area min-h-0 overflow-y-auto p-2">
                  <ListGroup title="Hospedaje">
                    {unitList.map(({ f, u }) => (
                      <ListItem key={f.id} active={selectedId === f.id} dim={!!statusFilter && u.status !== statusFilter} onClick={() => select(f.id)} dot={TONE[UNIT_STATUS[u.status].tone].solid} title={u.name} sub={unitInfo[u.id]?.short ?? UNIT_STATUS[u.status].label} />
                    ))}
                  </ListGroup>
                  <ListGroup title="Espacios">
                    {spaces.map((f) => (
                      <ListItem key={f.id} active={selectedId === f.id} onClick={() => select(f.id)} icon={f.id === 'salon' ? <CalendarHeart size={15} strokeWidth={1.6} /> : <TreePalm size={15} strokeWidth={1.6} />} title={f.name} sub={eventToday[f.venue as 'salon' | 'jardin'] ?? (f.id === 'salon' ? 'Hasta 300 invitados' : 'Hasta 400 invitados')} />
                    ))}
                  </ListGroup>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Leyenda / filtro por estado */}
          <div className="glass absolute bottom-3 left-1/2 z-10 max-w-[calc(100%-120px)] -translate-x-1/2 rounded-full p-1 shadow-[var(--shadow-2)] ring-1 ring-line">
            <StatusChips />
          </div>

          {/* Detalle */}
          <AnimatePresence>
            {selectedFeature && (
              <motion.aside key={selectedFeature.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.2, ease: ease.salida } }} transition={spring.suave} className="absolute top-[64px] right-5 z-20 flex max-h-[calc(100%-136px)] w-[min(400px,calc(100%-40px))] flex-col rounded-[var(--r-lg)] bg-surface shadow-[var(--shadow-3)] ring-1 ring-line">
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

/** Celular: tarjeta breve de la casa elegida (estado, quién está, avance de limpieza) */
function PeekCard({ featureId, info, onOpen, onClose }: { featureId: string; info?: UnitInfo; onOpen: () => void; onClose: () => void }) {
  const f = featureById(featureId)!
  const units = useCollection('units')
  const u = f.unitId ? units.find((x) => x.id === f.unitId) : undefined
  const st = u ? UNIT_STATUS[u.status] : undefined
  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="heading text-[1.35rem] leading-tight">{u?.name ?? f.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {st && (
              <Badge tone={st.tone} dot>
                {st.label}
              </Badge>
            )}
            {info?.short && !(st && info.short.startsWith(st.label)) && <span className="text-[13px] text-ink-soft">{info.short}</span>}
            {info?.cleaning !== undefined && <span className="text-[13px] text-ink-soft tabular-nums">{Math.round(info.cleaning * 100)}% listo</span>}
          </div>
          {info?.guest && <p className="mt-1.5 text-[13px] text-ink">{info.guest}</p>}
          {info?.detail && <p className="text-[12px] text-detail">{info.detail}</p>}
        </div>
        <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}>
          <X size={18} strokeWidth={1.6} />
        </Button>
      </div>
      {info?.cleaning !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full transition-[width] duration-[var(--dur-4)]" style={{ width: `${Math.round(info.cleaning * 100)}%`, backgroundImage: 'linear-gradient(90deg, var(--sky-3), var(--chispa-soft))' }} />
        </div>
      )}
      <Button className="mt-3 w-full" onClick={onOpen}>
        Ver ficha completa
      </Button>
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
            {info?.guest && <span className="truncate text-xs text-detail">{info.guest}</span>}
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
        <span className="block truncate text-xs text-detail">{sub}</span>
      </span>
    </button>
  )
}

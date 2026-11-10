// Modo día: la consola para llevar un evento en vivo. El cielo sigue la hora real del rancho (con el sol calculado
// para esa fecha en Tototlán), y arriba de todo está qué pasa ahora, qué sigue y cuánto falta.
// Antes del evento funciona como ensayo: se arrastra el sol para recorrer el día y nada se guarda.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Check, Clock3, MessageCircle, Pause, Phone, Play, RotateCcw, Sun, UsersRound, X } from 'lucide-react'
import type { RanchEvent, TimelineItem } from '@/lib/types'
import { byProgramTime, fmtDate, programMinutes, today, waLink } from '@/lib/format'
import { db, useCollection, useDoc } from '@/lib/store'
import { sunState } from '@/components/map/sun'
import { sunsetMinutes } from '@/lib/estudio'
import { ease, haptic } from '@/lib/motion'
import { rsvpOf } from '@/components/messages/outbox'
import { Button, Empty, cx, toast, useMedia } from '@/components/ui'
import { Luz, Sparkle, Stars } from '@/components/step1'
import { EventScene } from '@/components/scenes'
import { useWakeLock } from '@/components/events/EventTabs'

/** Controles sobre el cielo: siempre se leen, sea de día o de noche */
const GLASS = 'flex items-center rounded-full bg-[color-mix(in_oklab,var(--night)_62%,transparent)] text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_16%,transparent)] backdrop-blur-[10px]'

const hhmm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const span = (min: number) => {
  const m = Math.abs(Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

/** Momento real de ese minuto del programa, en hora de Jalisco (UTC−6) */
const momentOf = (date: string, min: number) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + (min + 360) * 60000)

/** El cielo de ese momento: de día a dorado y a noche, con los colores de la atmósfera */
function skyAt(night: number, golden: number) {
  const n = Math.round(night * 100)
  const g = golden
  return `linear-gradient(180deg,
    color-mix(in oklab, var(--night) ${n}%, color-mix(in oklab, var(--sky-1) ${100 - g * 30}%, var(--chispa-soft))) 0%,
    color-mix(in oklab, var(--night) ${Math.round(n * 0.94)}%, color-mix(in oklab, var(--sky-3) ${100 - g * 62}%, var(--chispa-soft))) 55%,
    color-mix(in oklab, var(--night) ${Math.round(n * 0.86)}%, color-mix(in oklab, var(--sky-4) ${100 - g * 45}%, var(--luz))) 100%)`
}

function Consola({ ev, onClose }: { ev: RanchEvent; onClose: () => void }) {
  const live = ev.date === today()
  const isPhone = useMedia('(max-width: 767px)')
  const vendors = useCollection('vendors')
  const [draft, setDraft] = useState<TimelineItem[]>(ev.timeline)
  const items = live ? ev.timeline : draft
  const sorted = useMemo(() => [...items].sort(byProgramTime), [items])
  const mins = useMemo(() => sorted.map((i) => programMinutes(i.time)), [sorted])
  const first = mins[0] ?? 16 * 60
  const last = mins.at(-1) ?? 24 * 60
  const rangeFrom = first - 30
  const rangeTo = Math.max(last + 30, first + 120)

  const [sim, setSim] = useState(first - 10)
  const [playing, setPlaying] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [live])
  const clock = live ? programMinutes(`${now.getHours()}:${now.getMinutes()}`) + now.getSeconds() / 60 : sim
  const awake = useWakeLock(true)

  // Reproducir el día como una película: 10 minutos del programa por segundo
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let prev = performance.now()
    const tick = (t: number) => {
      const dt = (t - prev) / 1000
      prev = t
      setSim((s) => {
        const next = s + dt * 10
        if (next >= rangeTo) {
          setPlaying(false)
          return rangeTo
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, rangeTo])

  // En ensayo, lo hecho sale de la hora; en vivo, de lo que marca la planner
  const rows = useMemo(
    () =>
      sorted.map((it, i) => {
        const start = mins[i]!
        const nextStart = mins[i + 1]
        const done = live ? it.done : nextStart !== undefined ? nextStart <= clock : clock >= start + 30
        return { ...it, start, done }
      }),
    [sorted, mins, live, clock],
  )
  const curIdx = rows.findIndex((r) => !r.done)
  const cur = curIdx >= 0 ? rows[curIdx] : undefined
  const after = curIdx >= 0 ? rows[curIdx + 1] : undefined
  const started = !!cur && clock >= cur.start
  const late = cur && after && live ? Math.max(0, clock - after.start) : 0

  const sun = sunState('ahora', momentOf(ev.date, clock))
  const altDeg = (sun.alt * 180) / Math.PI
  const sunset = useMemo(() => sunsetMinutes(ev.date), [ev.date])
  const goldenFrom = sunset - 40
  const goldenCue = sorted.find((_, i) => mins[i]! >= goldenFrom && mins[i]! <= sunset)
  // Con margen en las orillas: ni el sol ni los puntos del programa se cortan
  const pct = (min: number) => 3 + ((min - rangeFrom) / (rangeTo - rangeFrom)) * 94
  const moon = altDeg < -10
  const luzVisible = altDeg > -5 || moon
  // El sol toca las colinas justo a la hora de la puesta; a media tarde queda debajo de los controles.
  // En el celular las colinas quedan más abajo de la escena, y el sol también.
  const luzTop = moon ? 18 : isPhone ? Math.max(38, Math.min(84, 72 - (altDeg / 30) * 34)) : Math.max(34, Math.min(62, 46 - (altDeg / 30) * 12))

  // Arrastrar el sol: el ensayo se recorre con el dedo
  const stageRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const scrubTo = useCallback(
    (clientX: number) => {
      const r = stageRef.current?.getBoundingClientRect()
      if (!r) return
      const f = Math.max(0, Math.min(1, ((clientX - r.left) / r.width - 0.03) / 0.94))
      setSim(rangeFrom + f * (rangeTo - rangeFrom))
    },
    [rangeFrom, rangeTo],
  )
  const scrub = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (live || (e.target as HTMLElement).closest('button')) return
      scrubbing.current = true
      setPlaying(false)
      e.currentTarget.setPointerCapture(e.pointerId)
      scrubTo(e.clientX)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (scrubbing.current) scrubTo(e.clientX)
    },
    onPointerUp: () => {
      scrubbing.current = false
    },
    onPointerCancel: () => {
      scrubbing.current = false
    },
  }

  // Avanzar: en vivo marca el momento; en ensayo, salta al siguiente
  const advance = useCallback(() => {
    if (!cur) return
    haptic.success()
    if (live) {
      db.patch('events', ev.id, { timeline: ev.timeline.map((t) => (t.id === cur.id ? { ...t, done: true } : t)) })
    } else {
      setPlaying(false)
      setSim(after ? after.start : cur.start + 31)
    }
  }, [cur, after, live, ev.id, ev.timeline])

  const toggleRow = (row: (typeof rows)[number]) => {
    haptic.select()
    if (live) db.patch('events', ev.id, { timeline: ev.timeline.map((t) => (t.id === row.id ? { ...t, done: !t.done } : t)) })
    else {
      setPlaying(false)
      setSim(row.start)
    }
  }

  // Vamos tarde: recorre lo que falta y conserva el orden
  const shift = (minutes: number) => {
    if (!rows.some((r) => !r.done)) return
    const pendingIds = new Set(rows.filter((r) => !r.done).map((r) => r.id))
    if (cur && started) pendingIds.delete(cur.id)
    const apply = (list: TimelineItem[]) => list.map((t) => (pendingIds.has(t.id) ? { ...t, time: hhmm(programMinutes(t.time) + minutes) } : t))
    if (live) {
      const prev = ev.timeline
      db.patch('events', ev.id, { timeline: apply(prev) })
      toast.undo(`Se recorrió ${minutes} min lo que falta`, () => db.patch('events', ev.id, { timeline: prev }))
    } else {
      const prev = draft
      setDraft(apply(prev))
      toast.undo(`Ensayo: se recorrió ${minutes} min lo que falta`, () => setDraft(prev))
    }
  }

  // Atajos de teclado para llevarlo desde la computadora
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') onClose()
      else if (e.key === ' ' || e.key === 'Enter') {
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return
        e.preventDefault()
        advance()
      } else if (!live && e.key === 'ArrowRight') setSim((s) => Math.min(rangeTo, s + 5))
      else if (!live && e.key === 'ArrowLeft') setSim((s) => Math.max(rangeFrom, s - 5))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [advance, live, onClose, rangeFrom, rangeTo])

  const arrivals = useMemo(() => {
    let conf = 0
    let arrived = 0
    for (const g of ev.guestList) {
      if (rsvpOf(g) !== 'confirmado') continue
      conf += g.count
      if (g.arrived) arrived += g.count
    }
    return { conf, arrived }
  }, [ev.guestList])
  const people = useMemo(() => [...ev.providers.map((p) => ({ id: p.id, name: p.name, service: p.service, phone: p.phone })), ...vendors.filter((v) => ev.vendorIds?.includes(v.id)).map((v) => ({ id: v.id, name: v.name, service: '', phone: v.phone }))], [ev.providers, ev.vendorIds, vendors])

  const doneCount = rows.filter((r) => r.done).length
  const progress = rows.length ? doneCount / rows.length : 0
  const toNext = after ? after.start - clock : 0
  const stretch = cur && after ? Math.max(0, Math.min(1, (clock - cur.start) / Math.max(1, after.start - cur.start))) : 0

  return (
    <motion.div role="dialog" aria-modal="true" aria-label={`Modo día: ${ev.title}`} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.32, ease: ease.calma } }} className="losa--noche fixed inset-0 z-[45] flex flex-col overflow-y-auto overscroll-contain" style={{ background: 'var(--night)', borderRadius: 0 }}>
      {/* El cielo de este momento */}
      <div ref={stageRef} {...scrub} className={cx('relative isolate h-[228px] shrink-0 overflow-hidden select-none md:h-[272px]', !live && 'cursor-ew-resize touch-pan-y')} style={{ background: skyAt(sun.night, sun.golden) }}>
        <div className="pointer-events-none absolute inset-0 transition-opacity duration-[var(--dur-4)]" style={{ opacity: sun.night }}>
          <Stars count={36} seed={11} />
        </div>
        {luzVisible && <Luz size={moon ? 'clamp(36px,5vw,60px)' : 'clamp(40px,5.5vw,72px)'} className="absolute z-0 -translate-x-1/2 -translate-y-1/2 transition-[top] duration-[var(--dur-3)]" style={{ left: `${pct(clock)}%`, top: `${luzTop}%` }} />}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[62%]">
          <EventScene type={ev.type} />
        </div>

        {/* Barra superior */}
        <div className="absolute inset-x-0 top-0 z-[3] flex items-center gap-2 p-3 pt-[max(12px,env(safe-area-inset-top))] md:gap-3 md:p-5">
          <button onClick={onClose} aria-label="Salir del Modo día" className={cx(GLASS, 'pressable h-11 w-11 shrink-0 justify-center')}>
            <X size={20} strokeWidth={1.7} />
          </button>
          <div className={cx(GLASS, 'min-h-11 min-w-0 flex-col !items-start !justify-center !rounded-[16px] px-3.5 py-1 md:flex-none')}>
            <p className="text-[14px] leading-tight font-semibold">{ev.title}</p>
            <p className="text-[12px] leading-tight text-on-night-soft">{live ? (awake ? 'En vivo · la pantalla no se apaga' : 'En vivo') : 'Ensayo · arrastra el sol'}</p>
          </div>
          <span className="flex-1 max-md:hidden" />
          {!live && (
            <button onClick={() => setPlaying((p) => (sim >= rangeTo ? (setSim(rangeFrom), true) : !p))} aria-label={playing ? 'Pausar el ensayo' : 'Reproducir el día'} className={cx(GLASS, 'pressable h-11 shrink-0 gap-2 px-3 text-[13.5px] font-medium max-md:ml-auto md:pr-4')}>
              {playing ? <Pause size={17} strokeWidth={1.7} /> : <Play size={17} strokeWidth={1.7} />}
              <span className="max-md:sr-only">{playing ? 'Pausar' : 'Reproducir el día'}</span>
            </button>
          )}
          <div className={cx(GLASS, 'h-11 shrink-0 px-3.5', live && 'max-md:ml-auto')}>
            <span className="display-num text-[1.3rem] leading-none">{hhmm(clock)}</span>
          </div>
        </div>

        {/* El programa sobre el horizonte */}
        <div className="absolute inset-x-0 bottom-3 z-[2] h-8 md:bottom-4">
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-[color-mix(in_oklab,var(--on-night)_34%,transparent)]" />
          <span aria-hidden className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-luz" style={{ left: 0, width: `${pct(clock)}%` }} />
          {sunset >= rangeFrom && sunset <= rangeTo && (
            <span className="pointer-events-none absolute bottom-[calc(50%+9px)] -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,var(--night)_62%,transparent)] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-luz" style={{ left: `${pct(sunset)}%` }}>
              Puesta de sol {hhmm(sunset)}
            </span>
          )}
          {rows.map((r, i) => (
            <span key={r.id} aria-hidden className={cx('absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full', i === curIdx ? 'h-3.5 w-3.5 bg-luz shadow-[0_0_12px_3px_var(--luz)]' : r.done ? 'h-2 w-2 bg-luz' : 'h-2 w-2 bg-on-night ring-2 ring-[color-mix(in_oklab,var(--night)_50%,transparent)]')} style={{ left: `${pct(r.start)}%` }} />
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty kind="tareas" title="Este evento no tiene programa" body="Agrega los momentos del día en la pestaña Programa y aquí se llevan en vivo." action={<Button onClick={onClose}>Volver</Button>} />
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-[1500px] flex-1 items-start gap-x-8 gap-y-7 px-4 pt-6 pb-[calc(96px+env(safe-area-inset-bottom))] md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:px-8 md:pb-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(280px,0.8fr)]">
          {/* Lo que pasa ahora */}
          <section aria-live="polite" className="min-w-0">
            {cur ? (
              <>
                <p className="flex items-center gap-2 text-[14px] font-medium text-luz">
                  <span className={cx('relative h-2 w-2 rounded-full bg-luz', started && 'pulse-dot text-luz')} />
                  {started ? `Ahora · desde las ${cur.time}` : `Lo que sigue · a las ${cur.time}`}
                </p>
                <h2 className="heading mt-2 text-[clamp(2.1rem,1.5rem+3vw,4rem)] leading-[1.02] text-on-night">{cur.title}</h2>
                {cur.owner && <p className="mt-2.5 text-[16px] text-on-night-soft">A cargo de {cur.owner}</p>}
                <p className="mt-1 text-[15px] text-on-night-soft">{started ? `Lleva ${span(clock - cur.start)}` : `Empieza en ${span(cur.start - clock)}`}</p>
                {late > 0 && <p className="mt-3 rounded-[14px] bg-[color-mix(in_oklab,var(--danger)_26%,transparent)] px-3.5 py-2.5 text-[14.5px] font-medium text-on-night">Vamos {span(late)} tarde: «{after!.title}» ya debió empezar.</p>}

                {after && (
                  <div className="mt-5 rounded-[18px] bg-[color-mix(in_oklab,var(--on-night)_8%,transparent)] p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] text-on-night-soft">Sigue {toNext > 0 ? `en ${span(toNext)}` : 'ya'}</span>
                      <span className="display-num text-[1.15rem] text-on-night">{after.time}</span>
                    </div>
                    <p className="mt-1 text-[1.2rem] leading-snug font-semibold text-on-night">{after.title}</p>
                    {after.owner && <p className="text-[13.5px] text-on-night-soft">{after.owner}</p>}
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--on-night)_14%,transparent)]">
                      <div className="h-full rounded-full bg-luz" style={{ width: `${stretch * 100}%` }} />
                    </div>
                  </div>
                )}

                <div className="mt-5 hidden md:block">
                  <Button variant="luz" size="lg" className="w-full max-w-[420px]" icon={<Check size={19} strokeWidth={2} />} onClick={advance}>
                    Listo, que siga
                  </Button>
                </div>
                <div className="mt-4 grid max-w-[420px] grid-cols-[auto_1fr_1fr_1fr] items-center gap-2">
                  <span className="mr-1 text-[13.5px] text-on-night-soft">¿Vamos tarde?</span>
                  {[5, 10, 15].map((m) => (
                    <button key={m} onClick={() => shift(m)} className="pressable inline-flex h-11 items-center justify-center rounded-full text-[14px] font-medium text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_26%,transparent)] ring-inset hover:bg-[color-mix(in_oklab,var(--on-night)_10%,transparent)] pointer-fine:h-9">
                      +{m}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-6">
                <Sparkle className="text-3xl text-luz" />
                <h2 className="heading mt-3 text-[clamp(2rem,1.5rem+2.4vw,3.2rem)] text-on-night">Programa completo</h2>
                <p className="mt-2 text-[16px] text-on-night-soft">{live ? 'Todo salió como estaba planeado.' : 'Así se vería el día de principio a fin.'}</p>
                {!live && (
                  <Button variant="luz" className="mt-5" icon={<RotateCcw size={17} strokeWidth={1.7} />} onClick={() => setSim(first - 10)}>
                    Ensayar otra vez
                  </Button>
                )}
              </div>
            )}
          </section>

          {/* El programa completo */}
          <section aria-label="Programa del día" className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-on-night">Programa</h3>
              <span className="text-[13px] text-on-night-soft tabular">
                {doneCount} de {rows.length}
              </span>
            </div>
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--on-night)_12%,transparent)]">
              <div className="h-full rounded-full bg-luz transition-[width] duration-[var(--dur-3)]" style={{ width: `${progress * 100}%` }} />
            </div>
            <ol className="flex flex-col gap-1">
              {rows.map((r, i) => {
                const isCur = i === curIdx
                return (
                  <li key={r.id}>
                    <button onClick={() => toggleRow(r)} aria-current={isCur ? 'step' : undefined} className={cx('pressable flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left', isCur ? 'bg-[color-mix(in_oklab,var(--luz)_17%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--luz)_48%,transparent)]' : 'hover:bg-[color-mix(in_oklab,var(--on-night)_7%,transparent)]')}>
                      <span className={cx('display-num w-[52px] shrink-0 text-[1.02rem]', r.done ? 'text-on-night-soft' : isCur ? 'text-luz' : 'text-on-night')}>{r.time}</span>
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className={cx('block text-[14.5px] font-medium', r.done ? 'text-on-night-soft line-through decoration-[color-mix(in_oklab,var(--on-night)_40%,transparent)]' : 'text-on-night')}>{r.title}</span>
                        {r.owner && <span className="block text-[12.5px] text-on-night-soft">{r.owner}</span>}
                      </span>
                      {r.done && <Check size={16} strokeWidth={2.2} className="shrink-0 text-luz" />}
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>

          {/* A la mano */}
          <aside className="flex min-w-0 flex-col gap-4 md:col-span-2 xl:col-span-1">
            <div className="rounded-[18px] bg-[color-mix(in_oklab,var(--on-night)_7%,transparent)] p-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-on-night">
                <Sun size={16} strokeWidth={1.7} className="text-luz" /> Puesta de sol: {hhmm(sunset)}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-snug text-on-night-soft">
                La mejor luz para las fotos empieza a las {hhmm(goldenFrom)}.{goldenCue ? ` Cae justo en «${goldenCue.title}»: avísale al fotógrafo.` : ' Ningún momento del programa cae ahí: considera apartar 15 minutos para fotos.'}
              </p>
            </div>
            {arrivals.conf > 0 && (
              <div className="rounded-[18px] bg-[color-mix(in_oklab,var(--on-night)_7%,transparent)] p-4">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-on-night">
                  <UsersRound size={16} strokeWidth={1.7} className="text-on-night-soft" /> Llegadas
                </p>
                <p className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="display-num text-[1.8rem] text-on-night">{arrivals.arrived}</span>
                  <span className="text-[13.5px] text-on-night-soft">de {arrivals.conf} confirmados</span>
                </p>
                <a href={`/invitados?e=${ev.id}&v=puerta`} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-[13.5px] font-medium text-luz">
                  Abrir recepción en la puerta <ArrowRight size={14} strokeWidth={1.8} />
                </a>
              </div>
            )}
            <div className="rounded-[18px] bg-[color-mix(in_oklab,var(--on-night)_7%,transparent)] p-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-on-night">
                <Clock3 size={16} strokeWidth={1.7} className="text-on-night-soft" /> A la mano
              </p>
              <ul className="mt-2 flex flex-col">
                {ev.phone && <Contact name={ev.clientName} detail="Cliente" phone={ev.phone} text={`Hola ${ev.clientName.split(' ')[0]}, te escribimos de Jardines La Joya.`} />}
                {people.map((p) => (
                  <Contact key={p.id} name={p.name} detail={p.service} phone={p.phone} text={`Hola ${p.name}, te escribimos de Jardines La Joya por ${ev.title} de hoy.`} />
                ))}
                {!ev.phone && people.length === 0 && <li className="text-[13.5px] text-on-night-soft">Agrega el teléfono del cliente y a los proveedores para tenerlos aquí.</li>}
              </ul>
            </div>
            {!live && <p className="px-1 text-[12.5px] leading-snug text-on-night-soft">El {fmtDate(ev.date)} esta pantalla se enciende en vivo sola: lo que marques se guarda y el equipo lo ve.</p>}
          </aside>
        </div>
      )}

      {/* En el celular, la acción principal en la zona del pulgar */}
      {cur && (
        <div className="fixed inset-x-0 bottom-0 z-[46] bg-[linear-gradient(180deg,transparent,var(--night)_32%)] px-4 pt-6 pb-[calc(14px+env(safe-area-inset-bottom))] md:hidden">
          <Button variant="luz" size="lg" className="w-full" icon={<Check size={19} strokeWidth={2} />} onClick={advance}>
            Listo, que siga
          </Button>
        </div>
      )}
    </motion.div>
  )
}

function Contact({ name, detail, phone, text }: { name: string; detail?: string; phone?: string; text: string }) {
  return (
    <li className="flex items-center gap-2 border-t border-[color-mix(in_oklab,var(--on-night)_10%,transparent)] py-2 first:border-t-0">
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block text-[14px] font-medium text-on-night">{name}</span>
        {detail && <span className="block text-[12.5px] text-on-night-soft">{detail}</span>}
      </span>
      {phone && (
        <>
          <a href={waLink(phone, text)} target="_blank" rel="noopener" aria-label={`WhatsApp a ${name}`} className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--on-night)_12%,transparent)] text-on-night">
            <MessageCircle size={16} strokeWidth={1.7} />
          </a>
          <a href={`tel:${phone}`} aria-label={`Llamar a ${name}`} className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_22%,transparent)] ring-inset">
            <Phone size={16} strokeWidth={1.7} />
          </a>
        </>
      )}
    </li>
  )
}

export default function ModoDia() {
  const { id } = useParams()
  const ev = useDoc('events', id)
  const navigate = useNavigate()
  if (!ev)
    return <Empty kind="busqueda" title="No encontramos este evento" body="Puede que se haya eliminado o que el enlace esté incompleto." action={<Button onClick={() => navigate('/estudio')}>Volver al Estudio</Button>} />
  return createPortal(<Consola ev={ev} onClose={() => navigate(`/estudio/${ev.id}`)} />, document.body)
}

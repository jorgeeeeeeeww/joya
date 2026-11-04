// Asistente inteligente: un botón «Ayuda» en todas las pantallas que explica dónde estás, qué ves,
// qué sigue y te lleva a hacerlo. Dentro de un evento actúa como wedding planner: ubica la fase,
// lo atrasado y el siguiente paso. Cada persona elige: siempre a la vista, solo con el botón o apagado.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'
import { ArrowRight, Check, ChevronDown, CircleDashed, Clock, Compass, Flag, Lightbulb, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useDoc, useMe, useStore } from '@/lib/store'
import { seesMoney } from '@/lib/meta'
import type { AssistantMode, RanchEvent, Role } from '@/lib/types'
import { eventCoach, type Coach, type CoachGo, type CoachPhase, type CoachStep } from '@/lib/coach'
import { GUIDES, guideKeyFor, type PanelGuide } from '@/lib/guides'
import { pendingInstallments, useEventMoney } from '@/lib/planner'
import { daysUntil, fmtDate, mxn, today } from '@/lib/format'
import { ease, haptic, spring } from '@/lib/motion'
import { Button, Card, cx, ProgressBar, Segmented, Sheet } from '@/components/ui'

// ── Preferencias ─────────────────────────────────────────
export const ASSISTANT_MODES: { value: AssistantMode; label: string; help: string }[] = [
  { value: 'siempre', label: 'Siempre activo', help: 'Botón «Ayuda» en todas las pantallas, la guía de fase dentro de cada evento y la explicación la primera vez que entras a una pantalla.' },
  { value: 'boton', label: 'Solo con el botón', help: 'Nada aparece solo: el asistente se abre únicamente cuando tocas «Ayuda».' },
  { value: 'apagado', label: 'Apagado', help: 'Sin botón ni guías. Puedes volver a prenderlo aquí o en «¿Cómo se hace?».' },
]

export function useAssistant() {
  const me = useMe()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const prefs = (me && settings.userPrefs?.[me.id]) || {}
  const mode: AssistantMode = prefs.assistant ?? settings.assistantDefault ?? 'siempre'
  const seen = prefs.assistantSeen ?? []
  const savePrefs = (p: typeof prefs) => {
    if (!me) return
    const all = useStore.getState().settings.userPrefs ?? {}
    setSettings({ userPrefs: { ...all, [me.id]: { ...all[me.id], ...p } } })
  }
  return {
    mode,
    personal: !!prefs.assistant,
    seen,
    setMode: (m: AssistantMode) => savePrefs({ assistant: m }),
    markSeen: (key: string) => !seen.includes(key) && savePrefs({ assistantSeen: [...seen, key] }),
    resetSeen: () => savePrefs({ assistantSeen: [] }),
  }
}

/** Abrir el asistente desde cualquier parte (la tarjeta del evento, la página de ayuda…) */
export const useAssistantUI = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))

// ── Lo que pasa ahora mismo (según el puesto) ─────────────
interface Hint {
  tone: 'bad' | 'warn' | 'ok'
  text: string
  go?: CoachGo
}

function useLiveHints(role: Role | undefined, myId: string | undefined): Hint[] {
  const data = useStore((s) => s.data)
  const lastBackupAt = useStore((s) => s.settings.lastBackupAt)
  const linked = useStore((s) => !!s.settings.supabaseUrl)
  const money = useEventMoney()
  return useMemo(() => {
    if (!role) return []
    const T = today()
    const live = <T extends { deleted?: boolean }>(r: Record<string, T>) => Object.values(r).filter((x) => !x.deleted)
    const tasks = live(data.tasks)
    const events = live(data.events).filter((e) => e.status !== 'cancelado')
    const out: Hint[] = []
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

    // Eventos de los próximos 45 días con su siguiente paso de wedding planner
    const upcoming = (only?: (e: RanchEvent) => boolean) =>
      events
        .filter((e) => ['apartado', 'confirmado'].includes(e.status) && e.date >= T && daysUntil(e.date) <= 45 && (!only || only(e)))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4)
        .map((e) => ({ e, c: eventCoach(e, money.paid(e), money.total(e), { money: seesMoney(role) }) }))
        .filter((x) => x.c.next)
        .map(({ e, c }): Hint => ({ tone: c.late.length || c.next!.state === 'late' ? 'bad' : 'warn', text: `${e.title} (${daysUntil(e.date)} días): ${c.next!.label.toLowerCase()}`, go: { label: 'Abrir', to: `/eventos/${e.id}` } }))

    const overdueEvents = events.filter((e) => pendingInstallments(e, money.paid(e)).some((p) => p.due < T))
    const follow = events.filter((e) => (e.status === 'prospecto' || e.status === 'cotizado') && e.followUpAt && e.followUpAt <= T)

    if (role === 'admin') {
      const review = tasks.filter((t) => t.type === 'limpieza' && t.status === 'hecha')
      const verify = tasks.filter((t) => t.type !== 'limpieza' && t.status === 'hecha')
      const buy = tasks.filter((t) => t.type === 'compra' && (t.status === 'pendiente' || t.status === 'en-progreso'))
      const late = tasks.filter((t) => (t.status === 'pendiente' || t.status === 'en-progreso') && t.due && t.due.slice(0, 10) < T)
      const low = live(data.inventory).filter((i) => i.stock < i.min)
      const blocked = live(data.units).filter((u) => u.status === 'mantenimiento')
      if (review.length) out.push({ tone: 'warn', text: `${plural(review.length, 'limpieza espera', 'limpiezas esperan')} tu aprobación`, go: { label: 'Revisar', to: '/limpieza' } })
      if (overdueEvents.length) {
        const sum = overdueEvents.reduce((n, e) => n + pendingInstallments(e, money.paid(e)).filter((p) => p.due < T).reduce((m, p) => m + p.remaining, 0), 0)
        out.push({ tone: 'bad', text: `${mxn(sum)} vencido en ${plural(overdueEvents.length, 'evento', 'eventos')}`, go: { label: 'Ver', to: `/eventos/${overdueEvents[0]!.id}?tab=pagos` } })
      }
      if (follow.length) out.push({ tone: 'warn', text: `${plural(follow.length, 'prospecto espera', 'prospectos esperan')} seguimiento: son ventas en juego`, go: { label: 'Ver', to: '/eventos?vista=prospectos' } })
      if (late.length) out.push({ tone: 'bad', text: `${plural(late.length, 'tarea atrasada', 'tareas atrasadas')} del equipo`, go: { label: 'Ver', to: '/tareas' } })
      if (verify.length) out.push({ tone: 'warn', text: `${plural(verify.length, 'tarea terminada', 'tareas terminadas')} por verificar`, go: { label: 'Ver', to: '/tareas' } })
      if (buy.length) out.push({ tone: 'warn', text: `${plural(buy.length, 'compra pendiente', 'compras pendientes')}`, go: { label: 'Ver', to: '/inventario' } })
      if (low.length) out.push({ tone: 'warn', text: `${plural(low.length, 'artículo', 'artículos')} bajo el mínimo en inventario`, go: { label: 'Ver', to: '/inventario' } })
      if (blocked.length) out.push({ tone: 'warn', text: `${plural(blocked.length, 'casa bloqueada', 'casas bloqueadas')} por mantenimiento`, go: { label: 'Ver mapa', to: '/mapa' } })
      out.push(...upcoming().filter((h) => h.tone === 'bad'))
      if (linked && (!lastBackupAt || daysUntil(lastBackupAt.slice(0, 10)) < -7)) out.push({ tone: 'warn', text: lastBackupAt ? `El último respaldo fue el ${fmtDate(lastBackupAt.slice(0, 10))}` : 'Aún no hay respaldo de la información', go: { label: 'Respaldar', to: '/ajustes?tab=nube' } })
    }

    if (role === 'eventos') {
      if (overdueEvents.length) out.push({ tone: 'bad', text: `${plural(overdueEvents.length, 'evento tiene', 'eventos tienen')} pagos vencidos`, go: { label: 'Cobrar', to: `/eventos/${overdueEvents[0]!.id}?tab=pagos` } })
      if (follow.length) out.push({ tone: 'warn', text: `${plural(follow.length, 'prospecto', 'prospectos')} por contestar hoy`, go: { label: 'Ver', to: '/eventos?vista=prospectos' } })
      out.push(...upcoming())
    }

    if (role === 'recepcion') {
      const res = live(data.reservations)
      const units = data.units
      const arrivals = res.filter((r) => r.checkIn === T && (r.status === 'confirmada' || r.status === 'pendiente'))
      const notReady = arrivals.filter((r) => units[r.unitId] && units[r.unitId]!.status !== 'lista')
      const departures = res.filter((r) => r.checkOut === T && r.status === 'en-casa')
      if (notReady.length) out.push({ tone: 'bad', text: `${plural(notReady.length, 'casa que recibe hoy no está lista', 'casas que reciben hoy no están listas')}`, go: { label: 'Ver mapa', to: '/mapa' } })
      if (arrivals.length) out.push({ tone: 'warn', text: `${plural(arrivals.length, 'llegada', 'llegadas')} hoy`, go: { label: 'Ver', to: '/hospedaje' } })
      if (departures.length) out.push({ tone: 'warn', text: `${plural(departures.length, 'salida', 'salidas')} pendiente${departures.length === 1 ? '' : 's'} de check-out`, go: { label: 'Ver', to: '/hospedaje' } })
    }

    if (role === 'limpieza' || role === 'mantenimiento') {
      const type = role === 'limpieza' ? ['limpieza'] : ['mantenimiento', 'jardin']
      const mine = tasks.filter((t) => (t.status === 'pendiente' || t.status === 'en-progreso') && type.includes(t.type) && (t.assigneeId === myId || !t.assigneeId))
      const urgent = mine.filter((t) => t.priority === 'urgente')
      if (urgent.length) out.push({ tone: 'bad', text: `${plural(urgent.length, 'tarea urgente', 'tareas urgentes')}: empieza por ahí`, go: { label: 'Ver', to: '/' } })
      if (mine.length) out.push({ tone: 'warn', text: `${plural(mine.length, 'pendiente', 'pendientes')} en tu ruta de hoy`, go: { label: 'Ver ruta', to: '/' } })
    }
    return out.slice(0, 8)
  }, [role, myId, data, money, lastBackupAt, linked])
}

// ── Piezas visuales ──────────────────────────────────────
const toneDot = { bad: 'bg-danger', warn: 'bg-chispa-soft', ok: 'bg-success' } as const

function StepIcon({ state }: { state: CoachStep['state'] }) {
  if (state === 'done')
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_16%,var(--surface))] text-success">
        <Check size={15} strokeWidth={2} />
      </span>
    )
  if (state === 'late')
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--danger)_13%,var(--surface))] text-danger">
        <Clock size={15} strokeWidth={1.8} />
      </span>
    )
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 ring-[1.5px] ring-line-strong ring-inset">
      <CircleDashed size={14} strokeWidth={1.6} />
    </span>
  )
}

function SectionTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="eyebrow mt-6 mb-2.5 flex items-center gap-1.5">
      {icon}
      {children}
    </p>
  )
}

function StepRow({ s, onGo }: { s: CoachStep; onGo: (g: CoachGo) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cx('rounded-[16px] p-3', s.state === 'late' ? 'bg-[color-mix(in_oklab,var(--danger)_6%,var(--surface))] ring-1 ring-[color-mix(in_oklab,var(--danger)_22%,transparent)] ring-inset' : 'bg-sunken/60')}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <StepIcon state={s.state} />
        <span className="min-w-0 flex-1 pt-0.5">
          <span className={cx('block text-[15px] leading-snug font-medium', s.state === 'done' && 'text-ink-soft')}>{s.label}</span>
          {s.state === 'late' && <span className="text-xs text-danger">Atrasado{s.critical ? ' · importante' : ''}</span>}
        </span>
        <ChevronDown size={17} strokeWidth={1.6} className={cx('mt-1 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 pl-10">
          <p className="text-sm leading-relaxed text-ink-soft">{s.how}</p>
          {s.go && s.state !== 'done' && (
            <Button size="sm" variant="outline" className="mt-2.5" iconRight={<ArrowRight size={15} strokeWidth={1.7} />} onClick={() => onGo(s.go!)}>
              {s.go.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function PhaseRow({ p, onGo }: { p: CoachPhase; onGo: (g: CoachGo) => void }) {
  const [open, setOpen] = useState(false)
  const done = p.steps.filter((s) => s.state === 'done').length
  return (
    <div className={cx('rounded-[16px] ring-1 ring-inset', p.state === 'now' ? 'ring-primary' : 'ring-line')}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular', p.state === 'done' ? 'bg-[color-mix(in_oklab,var(--success)_16%,var(--surface))] text-success' : p.state === 'now' ? 'bg-primary text-on-primary' : 'text-ink-3 ring-1 ring-line-strong ring-inset')}>
          {p.state === 'done' ? <Check size={14} strokeWidth={2} /> : p.n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{p.label}</span>
          <span className="block text-xs text-ink-soft">
            {p.window}
            {p.from && p.state === 'next' ? ` · desde el ${fmtDate(p.from)}` : ''}
            {p.steps.length ? ` · ${done}/${p.steps.length} listo` : ''}
          </span>
        </span>
        {p.state === 'now' && <span className="rounded-full bg-[color-mix(in_oklab,var(--primary)_12%,var(--surface))] px-2 py-0.5 text-[11px] font-medium text-primary">Aquí vas</span>}
        <ChevronDown size={17} strokeWidth={1.6} className={cx('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <p className="text-sm text-ink-soft">{p.goal}</p>
          {p.steps.map((s) => (
            <StepRow key={s.key} s={s} onGo={onGo} />
          ))}
        </div>
      )}
    </div>
  )
}

/** La guía completa de wedding planner de un evento */
function CoachView({ coach, onGo }: { coach: Coach; onGo: (g: CoachGo) => void }) {
  const { current, next, after, phases } = coach
  // Lo que ya está arriba en «Lo que sigue» no se repite en la lista de atrasados
  const late = coach.late.filter((s) => s.key !== next?.key)
  const nowSteps = current.steps
  const doneNow = nowSteps.filter((s) => s.state === 'done').length
  return (
    <div>
      {coach.alert && (
        <div className="mb-4 flex gap-2.5 rounded-[16px] bg-[color-mix(in_oklab,var(--danger)_9%,var(--surface))] p-3.5 text-sm text-danger">
          <TriangleAlert size={18} strokeWidth={1.7} className="mt-px shrink-0" />
          <span>{coach.alert}</span>
        </div>
      )}

      <Card className="p-4 md:p-5">
        <p className="eyebrow">
          Fase {current.n} de {phases.length} · {current.window}
        </p>
        <p className="heading mt-1 text-xl">{current.label}</p>
        <div className="mt-3 flex gap-1" aria-hidden>
          {phases.map((p) => (
            <span key={p.key} className={cx('h-1.5 flex-1 rounded-full', p.state === 'done' ? 'bg-success' : p.state === 'now' ? 'bg-primary' : 'bg-line-strong')} />
          ))}
        </div>
        <p className="mt-3 text-[15px] leading-relaxed">{current.goal}</p>
        <p className="mt-1.5 text-sm text-ink-soft">{current.why}</p>
      </Card>

      {next && (
        <>
          <SectionTitle icon={<Flag size={13} strokeWidth={1.8} />}>Lo que sigue</SectionTitle>
          <div className="rounded-[18px] bg-[color-mix(in_oklab,var(--primary)_7%,var(--surface))] p-4 ring-[1.5px] ring-primary ring-inset">
            <p className="text-[16px] leading-snug font-semibold">{next.label}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{next.how}</p>
            {next.go && (
              <Button className="mt-3" iconRight={<ArrowRight size={16} strokeWidth={1.7} />} onClick={() => onGo(next.go!)}>
                Llévame: {next.go.label.toLowerCase()}
              </Button>
            )}
          </div>
        </>
      )}
      {!next && !coach.cancelled && (
        <div className="mt-5 flex items-center gap-3 rounded-[18px] bg-[color-mix(in_oklab,var(--success)_10%,var(--surface))] p-4 text-sm text-success">
          <Sparkles size={18} strokeWidth={1.6} />
          <span>Todo al corriente en esta fase.{after ? ` Lo siguiente es «${after.label}»${after.from ? `, desde el ${fmtDate(after.from)}` : ''}.` : ''}</span>
        </div>
      )}

      {late.length > 0 && (
        <>
          <SectionTitle icon={<TriangleAlert size={13} strokeWidth={1.8} />}>Atrasado de fases anteriores</SectionTitle>
          <div className="flex flex-col gap-2">
            {late.map((s) => (
              <StepRow key={s.key} s={s} onGo={onGo} />
            ))}
          </div>
        </>
      )}

      {nowSteps.length > 0 && (
        <>
          <SectionTitle>
            En esta fase · {doneNow} de {nowSteps.length} listo
          </SectionTitle>
          <div className="flex flex-col gap-2">
            {nowSteps.map((s) => (
              <StepRow key={s.key} s={s} onGo={onGo} />
            ))}
          </div>
        </>
      )}

      <SectionTitle icon={<Lightbulb size={13} strokeWidth={1.8} />}>Consejos de wedding planner</SectionTitle>
      <ul className="flex flex-col gap-2">
        {current.tips.map((t) => (
          <li key={t} className="flex gap-2.5 text-sm leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-chispa-soft" />
            <span>{t}</span>
          </li>
        ))}
      </ul>

      {after && (
        <>
          <SectionTitle>Después viene</SectionTitle>
          <p className="text-sm text-ink-soft">
            <span className="font-medium text-ink">{after.label}</span> ({after.window.toLowerCase()}
            {after.from ? `, desde el ${fmtDate(after.from)}` : ''}): {after.goal.charAt(0).toLowerCase() + after.goal.slice(1)}
          </p>
        </>
      )}

      <SectionTitle>Todas las fases · toca una para ver sus pasos</SectionTitle>
      <div className="flex flex-col gap-2">
        {phases.map((p) => (
          <PhaseRow key={p.key} p={p} onGo={onGo} />
        ))}
      </div>
    </div>
  )
}

function GuideView({ guide, hints, onGo, compact }: { guide: PanelGuide; hints: Hint[]; onGo: (g: CoachGo) => void; compact?: boolean }) {
  return (
    <div>
      {hints.length > 0 && (
        <>
          <SectionTitle icon={<Sparkles size={13} strokeWidth={1.8} />}>Ahora mismo</SectionTitle>
          <div className="flex flex-col gap-2">
            {hints.map((h, i) => (
              <div key={i} className="flex items-center gap-3 rounded-[14px] bg-sunken/60 p-3">
                <span className={cx('h-2 w-2 shrink-0 rounded-full', toneDot[h.tone])} />
                <span className="min-w-0 flex-1 text-sm leading-snug">{h.text}</span>
                {h.go && (
                  <Button size="sm" variant="ghost" iconRight={<ArrowRight size={14} strokeWidth={1.7} />} onClick={() => onGo(h.go!)}>
                    {h.go.label}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {!compact && (
        <>
          <SectionTitle>Qué es esta pantalla</SectionTitle>
          <p className="text-[15px] leading-relaxed">{guide.what}</p>
        </>
      )}
      {guide.see.length > 0 && (
        <>
          <SectionTitle>Lo que ves aquí</SectionTitle>
          <div className="flex flex-col gap-2">
            {guide.see.map((b) => (
              <div key={b.label} className="rounded-[14px] bg-sunken/60 p-3">
                <p className="text-[15px] font-medium">{b.label}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{b.text}</p>
                {b.to && (
                  <button onClick={() => onGo({ label: 'Ir', to: b.to })} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Ir ahí <ArrowRight size={14} strokeWidth={1.7} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <SectionTitle>{guide.order.title}</SectionTitle>
      <ol className="flex flex-col gap-2.5">
        {guide.order.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[14.5px] leading-snug">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-semibold tabular">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      {guide.routine?.map((r) => (
        <div key={r.when}>
          <SectionTitle icon={<Clock size={13} strokeWidth={1.8} />}>{r.when}</SectionTitle>
          <div className="flex flex-col gap-1.5">
            {r.steps.map((s) => (
              <button key={s.label} onClick={() => s.to && onGo({ label: 'Ir', to: s.to })} className="pressable flex items-center gap-3 rounded-[14px] p-2.5 text-left ring-1 ring-line ring-inset hover:bg-wash">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-[13px] text-ink-soft">{s.text}</span>
                </span>
                {s.to && <ArrowRight size={15} strokeWidth={1.7} className="shrink-0 text-ink-3" />}
              </button>
            ))}
          </div>
        </div>
      ))}
      {guide.tips.length > 0 && (
        <>
          <SectionTitle icon={<Lightbulb size={13} strokeWidth={1.8} />}>Consejos</SectionTitle>
          <ul className="flex flex-col gap-2">
            {guide.tips.map((t) => (
              <li key={t} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-chispa-soft" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Coach de un evento listo para usar (dinero y permisos de quien lo ve) */
export function useEventCoach(ev: RanchEvent | undefined) {
  const me = useMe()
  const money = useEventMoney()
  return useMemo(() => (ev ? eventCoach(ev, money.paid(ev), money.total(ev), { money: seesMoney(me?.role) }) : undefined), [ev, money, me?.role])
}

function useGo(onDone: () => void) {
  const navigate = useNavigate()
  const location = useLocation()
  return (g: CoachGo) => {
    haptic.select()
    if (g.tab) {
      const id = location.pathname.split('/')[2]
      navigate(`/eventos/${id}?tab=${g.tab}`, { replace: true })
    } else if (g.to) navigate(g.to)
    onDone()
  }
}

// ── Botón «Ayuda» + hoja del asistente (va en el AppShell) ──
export function AssistantDock() {
  const me = useMe()
  const location = useLocation()
  const { mode, setMode, seen, markSeen } = useAssistant()
  const { open, setOpen } = useAssistantUI()
  const key = me ? guideKeyFor(location.pathname, location.search, me.role) : ''
  const guide = GUIDES[key]
  const eventId = key === 'evento' ? location.pathname.split('/')[2] : undefined
  const ev = useDoc('events', eventId)
  const coach = useEventCoach(ev)
  const allHints = useLiveHints(me?.role, me?.id)
  // En Inicio se ve todo; en cada sección, solo los avisos que llevan a esa sección
  const hints = useMemo(() => {
    if (key.startsWith('inicio')) return allHints
    return allHints.filter((h) => {
      const to = h.go?.to ?? ''
      if (key === 'prospectos') return to.includes('vista=prospectos')
      return to.split(/[/?]/)[1] === key
    })
  }, [allHints, key])
  const go = useGo(() => setOpen(false))
  const [bubble, setBubble] = useState(false)
  const [howOpen, setHowOpen] = useState(false)

  // La primera vez en cada pantalla, el asistente se ofrece a explicarla (solo en modo «siempre»)
  useEffect(() => {
    setBubble(false)
    if (mode !== 'siempre' || !key || seen.includes(key)) return
    const t = setTimeout(() => setBubble(true), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode])
  useEffect(() => setHowOpen(false), [key])

  if (!me || !guide) return null
  // Dentro de un evento cuenta lo atrasado de ese evento; en las demás pantallas, lo urgente del puesto
  const urgent = coach ? (coach.cancelled ? 0 : coach.late.length + coach.current.steps.filter((s) => s.state === 'late').length) : hints.filter((h) => h.tone === 'bad').length
  const openIt = () => {
    haptic.light()
    setBubble(false)
    markSeen(key)
    setOpen(true)
  }
  const title = coach ? (coach.cancelled ? 'Evento cancelado' : `Asistente ${coach.noun.startsWith('el ') ? `del ${coach.noun.slice(3)}` : `de ${coach.noun}`}`) : guide.title

  return (
    <>
      {mode !== 'apagado' && (
        <div className="pointer-events-none fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-4 z-40 flex flex-col items-start gap-2 md:right-6 md:bottom-6 md:left-auto md:items-end">
          <AnimatePresence>
            {bubble && !open && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: ease.calma } }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.16 } }}
                className="pointer-events-auto card w-[min(290px,calc(100vw-32px))] p-3.5 shadow-[var(--shadow-3)]"
                role="status"
              >
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm leading-snug">
                    <span className="font-semibold">¿Primera vez aquí?</span> Te explico qué es {coach ? `${coach.noun}, en qué fase va` : `«${guide.title}»`} y qué sigue.
                  </p>
                  <button
                    onClick={() => {
                      setBubble(false)
                      markSeen(key)
                    }}
                    aria-label="No, gracias"
                    className="-mt-1 -mr-1 rounded-full p-1.5 text-ink-3 hover:bg-wash hover:text-ink"
                  >
                    <X size={15} strokeWidth={1.7} />
                  </button>
                </div>
                <Button size="sm" className="mt-2.5" onClick={openIt} iconRight={<ArrowRight size={14} strokeWidth={1.7} />}>
                  Explícame
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            onClick={openIt}
            aria-label={`Ayuda: ${title}${urgent ? `, ${urgent} pendientes urgentes` : ''}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.suave}
            className="pointer-events-auto glass relative inline-flex h-12 items-center gap-2 rounded-full pr-4 pl-3 text-[14.5px] font-medium text-ink shadow-[var(--shadow-2)] ring-1 ring-line-strong hover:shadow-[var(--shadow-3)]"
          >
            <Compass size={19} strokeWidth={1.7} className="text-primary" />
            {coach && !coach.cancelled ? `Ayuda · Fase ${coach.current.n}` : 'Ayuda'}
            {mode === 'siempre' && urgent > 0 && <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-chispa px-1 text-[11px] text-on-chispa ring-2 ring-paper">{urgent}</span>}
          </motion.button>
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        subtitle={coach ? coach.headline : 'Qué ves aquí, en qué orden se trabaja y qué sigue'}
        footer={
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-soft">Asistente</span>
            <Segmented size="sm" value={mode} onChange={setMode} options={ASSISTANT_MODES.map((m) => ({ value: m.value, label: m.label }))} />
          </div>
        }
      >
        {coach && ev ? (
          <>
            <CoachView coach={coach} onGo={go} />
            <button onClick={() => setHowOpen((v) => !v)} aria-expanded={howOpen} className="mt-6 flex w-full items-center justify-between rounded-[14px] p-3 text-left text-sm font-medium ring-1 ring-line ring-inset hover:bg-wash">
              Cómo se usa esta pantalla
              <ChevronDown size={16} strokeWidth={1.6} className={cx('transition-transform', howOpen && 'rotate-180')} />
            </button>
            {howOpen && <GuideView guide={guide} hints={[]} onGo={go} />}
          </>
        ) : (
          <GuideView guide={guide} hints={hints} onGo={go} />
        )}
        <button onClick={() => go({ label: 'Guías', to: '/ayuda' })} className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
          Ver todas las guías paso a paso <ArrowRight size={14} strokeWidth={1.7} />
        </button>
        {mode === 'apagado' && <p className="mt-3 text-xs text-ink-soft">El asistente está apagado: no verás el botón «Ayuda». Lo puedes prender abajo o en Ajustes → Tu panel.</p>}
      </Sheet>
    </>
  )
}

// ── Tarjeta dentro del evento: fase y siguiente paso a la vista ──
export function EventCoachCard({ ev }: { ev: RanchEvent }) {
  const { mode } = useAssistant()
  const coach = useEventCoach(ev)
  const setOpen = useAssistantUI((s) => s.setOpen)
  const go = useGo(() => {})
  if (mode !== 'siempre' || !coach || coach.cancelled) return null
  const fresh = Date.now() - new Date(ev.createdAt).getTime() < 15 * 60_000 && ev.status === 'prospecto'
  const { current, next } = coach
  const moreLate = coach.late.filter((s) => s.key !== next?.key).length
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[var(--r-lg)] bg-surface p-4 ring-1 ring-line md:gap-4 md:p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--primary)_12%,var(--surface))] text-primary">
        <Compass size={20} strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="eyebrow">{fresh ? '¡Evento creado! Esto sigue' : `Fase ${current.n} de ${coach.phases.length} · ${current.label}`}</p>
        {next ? (
          <p className="mt-1 text-[15px] leading-snug">
            <span className={cx('font-semibold', next.state === 'late' && 'text-danger')}>{next.state === 'late' ? 'Atrasado: ' : 'Sigue: '}</span>
            {next.label}
            {moreLate > 0 && <span className="text-ink-soft"> · y {moreLate} más atrasado{moreLate > 1 ? 's' : ''}</span>}
          </p>
        ) : (
          <p className="mt-1 text-[15px] text-success">Todo al corriente en esta fase{coach.after?.from ? `. «${coach.after.label}» empieza el ${fmtDate(coach.after.from)}` : ''}.</p>
        )}
        {coach.alert && <p className="mt-1 text-sm text-danger">{coach.alert}</p>}
        <ProgressBar value={current.steps.length ? current.steps.filter((s) => s.state === 'done').length / current.steps.length : 1} className="mt-2.5 max-w-xs" />
      </div>
      <div className="flex flex-wrap gap-2">
        {next?.go && (
          <Button size="sm" variant="outline" iconRight={<ArrowRight size={15} strokeWidth={1.7} />} onClick={() => go(next.go!)}>
            {next.go.label}
          </Button>
        )}
        <Button size="sm" variant="tinta" icon={<Compass size={15} strokeWidth={1.7} />} onClick={() => setOpen(true)}>
          Ver guía completa
        </Button>
      </div>
    </div>
  )
}

// ── Ajustes → Tu panel ──
export function AssistantSettings() {
  const me = useMe()
  const { mode, setMode, resetSeen, personal } = useAssistant()
  const def = useStore((s) => s.settings.assistantDefault ?? 'siempre')
  const setSettings = useStore((s) => s.setSettings)
  const admin = me?.role === 'admin'
  return (
    <Card className="p-5 md:p-6">
      <p className="eyebrow">Tu panel</p>
      <p className="heading mt-1 text-xl">Asistente</p>
      <p className="mt-1 text-sm text-ink-soft">Te explica cada pantalla, te dice qué sigue y, dentro de cada evento, te guía fase por fase como wedding planner.</p>
      <div className="mt-4 flex flex-col gap-2.5" role="radiogroup" aria-label="Modo del asistente">
        {ASSISTANT_MODES.map((m) => (
          <button key={m.value} role="radio" aria-checked={mode === m.value} onClick={() => setMode(m.value)} className={cx('pressable rounded-[16px] p-4 text-left ring-inset', mode === m.value ? 'bg-[color-mix(in_oklab,var(--primary)_8%,var(--surface))] ring-[1.5px] ring-primary' : 'ring-1 ring-line hover:bg-wash')}>
            <span className="block font-semibold">{m.label}</span>
            <span className="mt-0.5 block text-sm text-ink-soft">{m.help}</span>
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-3" onClick={resetSeen}>
        Volver a mostrar las explicaciones de cada pantalla
      </Button>
      {admin && (
        <div className="mt-5 border-t border-line pt-5">
          <p className="font-semibold">Para el equipo en este dispositivo</p>
          <p className="mt-0.5 text-sm text-ink-soft">Lo que verá quien no haya elegido su propio modo.{personal ? '' : ' Tú también lo usas mientras no elijas el tuyo.'}</p>
          <Segmented className="mt-3" size="sm" value={def} onChange={(v) => setSettings({ assistantDefault: v })} options={ASSISTANT_MODES.map((m) => ({ value: m.value, label: m.label }))} />
        </div>
      )}
    </Card>
  )
}

/** Aviso en «¿Cómo se hace?»: abre el asistente o lo vuelve a prender */
export function AssistantCallout() {
  const { mode, setMode } = useAssistant()
  const setOpen = useAssistantUI((s) => s.setOpen)
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 md:p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--primary)_12%,var(--surface))] text-primary">
        <Compass size={20} strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1 basis-52">
        <p className="font-semibold">Tu asistente</p>
        <p className="text-sm text-ink-soft">{mode === 'apagado' ? 'Está apagado. Préndelo y te explicará cada pantalla y qué sigue en cada evento.' : 'En cualquier pantalla toca «Ayuda» (abajo): te dice dónde estás, qué ves y qué sigue.'}</p>
      </div>
      {mode === 'apagado' ? (
        <Button size="sm" onClick={() => setMode('siempre')}>
          Prender asistente
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Abrir asistente
        </Button>
      )}
    </Card>
  )
}

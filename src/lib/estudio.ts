// El camino de un evento: todo lo que hay que hacer, con fecha y en su carril.
// No pide datos nuevos: une lo que ya existe (hitos de la salud del evento, plan de pagos, tareas del equipo
// y pendientes con fecha) en una sola línea de tiempo para verlo, moverlo y resolverlo desde un mismo lugar.
import { useMemo } from 'react'
import { parseISO } from 'date-fns'
import { ClipboardList, Palette, Store, UsersRound, Wallet, type LucideIcon } from 'lucide-react'
import type { CaminoLane, EventType, ISODate, RanchEvent, Task } from './types'
import { addDaysISO, today, uid } from './format'
import { db, useCollection } from './store'
import { eventHealth, eventMilestones, healthScore, type HealthPart } from './eventHealth'
import { layoutStats } from './floorplan'
import { modulesOf } from './modules'
import { isBooked, pendingInstallments, useEventMoney } from './planner'
import { rsvpOf } from '@/components/messages/outbox'
import { solarPosition } from '@/components/map/sun'

export type NodeState = 'done' | 'late' | 'now' | 'next'
export type NodeSource = { type: 'hito'; key: string } | { type: 'pago'; id: string } | { type: 'tarea'; id: string } | { type: 'paso'; id: string }

export interface CaminoGo {
  label: string
  /** Pestaña dentro del evento */
  tab?: string
  /** O una pantalla de la app */
  to?: string
}

export interface CaminoNode {
  id: string
  eventId: string
  lane: CaminoLane
  label: string
  due: ISODate
  state: NodeState
  source: NodeSource
  amount?: number
  assigneeId?: string
  how?: string
  go?: CaminoGo
  /** Se puede marcar como hecho aquí mismo (si no, se resuelve en su sección) */
  canToggle: boolean
  /** Importante: si no se hace, pone en riesgo el evento */
  critical?: boolean
}

export interface LaneMeta {
  key: CaminoLane
  label: string
  short: string
  icon: LucideIcon
  /** Focos de las luces del evento que se resuelven en este carril */
  health: HealthPart['key'][]
}

export const LANES: LaneMeta[] = [
  { key: 'dinero', label: 'Contrato y pagos', short: 'Pagos', icon: Wallet, health: ['contrato', 'pagos'] },
  { key: 'proveedores', label: 'Proveedores', short: 'Proveedores', icon: Store, health: ['proveedores'] },
  { key: 'invitados', label: 'Invitados y mesas', short: 'Invitados', icon: UsersRound, health: ['invitados', 'mesas'] },
  { key: 'diseno', label: 'Diseño y menú', short: 'Diseño', icon: Palette, health: [] },
  { key: 'dia', label: 'Día y equipo', short: 'Día', icon: ClipboardList, health: ['beo'] },
]
export const LANE_OF: Record<CaminoLane, LaneMeta> = Object.fromEntries(LANES.map((l) => [l.key, l])) as Record<CaminoLane, LaneMeta>
export const laneOfHealth = (key: HealthPart['key']): CaminoLane => LANES.find((l) => l.health.includes(key))?.key ?? 'dia'

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Cómo se resuelve cada hito de la salud del evento */
const HITOS: Record<string, { lane: CaminoLane; label: string; how: string; go: CaminoGo; word?: string; critical?: boolean }> = {
  anticipo: { lane: 'dinero', label: 'Cobrar anticipo', how: 'Sin anticipo la fecha no está apartada: cualquiera te la puede ganar. Regístralo el mismo día que dicen que sí.', go: { label: 'Registrar pago', tab: 'cotizacion' }, word: 'anticipo', critical: true },
  contrato: { lane: 'dinero', label: 'Firmar contrato', how: 'Fecha, precio, horarios y políticas por escrito. Se firma con el dedo desde la orden de evento y protege a las dos partes.', go: { label: 'Firmar contrato', tab: 'beo' }, word: 'contrato', critical: true },
  menu: { lane: 'diseno', label: 'Cerrar el menú', how: 'Entrada, plato fuerte, postre y bebidas, con alergias anotadas. Lo que se decida aquí pasa a la orden de evento.', go: { label: 'Escribir menú', tab: 'beo' }, word: 'menu' },
  invitaciones: { lane: 'invitados', label: 'Enviar invitaciones', how: 'Lo ideal es enviarlas de 6 a 8 semanas antes, y antes si hay invitados de fuera.', go: { label: 'Enviar invitaciones', tab: 'invitados' } },
  proveedores: { lane: 'proveedores', label: 'Confirmar proveedores', how: 'Cada proveedor confirma por escrito, con su hora de llegada. Uno sin confirmar es el riesgo número uno del día.', go: { label: 'Abrir proveedores', tab: 'proveedores' }, word: 'proveedores', critical: true },
  confirmaciones: { lane: 'invitados', label: 'Cerrar confirmaciones', how: 'La meta es 90% antes de esta fecha. A quien falte, un solo recordatorio por WhatsApp con fecha límite.', go: { label: 'Confirmar invitados', tab: 'invitados' }, critical: true },
  plano: { lane: 'invitados', label: 'Aprobar el plano', how: 'Enséñale el plano en pantalla o en 3D. Cuando lo apruebe, ya se puede preparar el montaje.', go: { label: 'Abrir plano', tab: 'plano' }, word: 'plano' },
  liquidacion: { lane: 'dinero', label: 'Cobrar liquidación', how: 'El saldo se cobra antes del evento, nunca el mismo día: mientras más cerca la fecha, más difícil cobrar.', go: { label: 'Registrar pago', tab: 'cotizacion' }, word: 'liquidacion', critical: true },
  numero: { lane: 'invitados', label: 'Dar número final', how: 'Se le da por escrito al banquete. Después de esta fecha ya no se cambia.', go: { label: 'Ver invitados', tab: 'invitados' }, word: 'numero final', critical: true },
  beo: { lane: 'dia', label: 'Firmar orden de evento', how: 'Es la hoja que siguen cocina y montaje: lo que no está ahí, no existe. Se revisa y se firma.', go: { label: 'Abrir orden de evento', tab: 'beo' }, critical: true },
  montaje: { lane: 'dia', label: 'Verificar montaje', how: 'Recorre el lugar con el plano en la mano: mesas, mantelería, sonido, luz y baños.', go: { label: 'Abrir plano', tab: 'plano' }, word: 'montaje', critical: true },
}

const taskLane = (title: string): CaminoLane => {
  const t = norm(title)
  if (t.includes('numero final')) return 'invitados'
  if (t.includes('proveedores') || t.includes('menu')) return 'proveedores'
  return 'dia'
}

const taskIsDone = (t: Task) => t.status === 'hecha' || t.status === 'verificada'

export interface CaminoOpts {
  paid: number
  total: number
  tasks: Task[]
  money: boolean
  t?: ISODate
}

/** Todo el camino de un evento, ordenado por fecha */
export function buildCamino(ev: RanchEvent, { paid, total, tasks, money, t = today() }: CaminoOpts): CaminoNode[] {
  const out: Omit<CaminoNode, 'state'>[] = []
  const stateOf = new Map<string, boolean>()
  const push = (n: Omit<CaminoNode, 'state'>, done: boolean) => {
    out.push(n)
    stateOf.set(n.id, done)
  }
  const m = modulesOf(ev)
  const plan = m.pagos ? [...(ev.paymentPlan ?? [])].sort((a, b) => a.due.localeCompare(b.due)) : []
  const myTasks = tasks.filter((x) => x.eventId === ev.id && x.due)
  const isChecked = (word: string) => ev.checklist.some((c) => c.done && norm(c.text).includes(word))

  // Tareas del equipo: son las que se ejecutan; absorben al hito equivalente para no verlo dos veces
  const absorbed = new Set<string>()
  for (const task of myTasks) {
    const title = task.title.replace(` · ${ev.title}`, '')
    const n = norm(title)
    let word: string | undefined
    if (n.includes('numero final')) {
      word = 'numero final'
      absorbed.add('numero')
    } else if (n.startsWith('montaje')) {
      word = 'montaje'
      absorbed.add('montaje')
    }
    const done = taskIsDone(task) || (!!word && isChecked(word))
    push(
      {
        id: `${ev.id}:t:${task.id}`,
        eventId: ev.id,
        lane: taskLane(title),
        label: title,
        due: task.due!.slice(0, 10),
        source: { type: 'tarea', id: task.id },
        assigneeId: task.assigneeId,
        how: task.notes || (word ? HITOS[word === 'montaje' ? 'montaje' : 'numero']?.how : undefined),
        go: { label: 'Abrir tarea', to: `/tareas?t=${task.id}` },
        canToggle: true,
        critical: task.priority === 'alta' || task.priority === 'urgente',
      },
      done,
    )
  }

  // Hitos de la salud del evento
  for (const ms of eventMilestones(ev, paid, total, t)) {
    if (absorbed.has(ms.key)) continue
    // El plan de pagos ya dice cuándo se cobra: no se repite como hito
    if (plan.length && (ms.key === 'anticipo' || ms.key === 'liquidacion')) continue
    const info = HITOS[ms.key]
    if (!info) continue
    const go: CaminoGo = info.go.tab === 'invitados' && (ms.key === 'invitaciones' || ms.key === 'confirmaciones') ? { label: info.go.label, to: `/invitados?e=${ev.id}&v=confirmar` } : info.go
    // Con proveedores registrados, lo que manda es la confirmación de cada uno, no una casilla
    const hasProviders = ev.providers.length + (ev.vendorIds?.length ?? 0) > 0
    const canToggle = !!info.word && !(ms.key === 'proveedores' && hasProviders)
    push({ id: `${ev.id}:h:${ms.key}`, eventId: ev.id, lane: info.lane, label: info.label, due: ms.due, source: { type: 'hito', key: ms.key }, how: info.how, go, canToggle, critical: info.critical }, ms.state === 'done')
  }

  // Plan de pagos
  const pending = new Map(pendingInstallments(ev, paid).map((p) => [p.id, p]))
  for (const p of plan) {
    const open = pending.get(p.id)
    push(
      {
        id: `${ev.id}:p:${p.id}`,
        eventId: ev.id,
        lane: 'dinero',
        label: p.label,
        due: p.due,
        source: { type: 'pago', id: p.id },
        amount: money ? (open?.remaining ?? p.amount) : undefined,
        how: 'Recuérdaselo con cariño unos días antes. La app avisa en «Tu día» cuando vence.',
        go: { label: 'Abrir plan de pagos', tab: 'pagos' },
        canToggle: false,
        critical: true,
      },
      !open,
    )
  }

  // Pendientes: los que ya tienen fecha; el depósito en garantía va después del evento
  for (const c of ev.checklist) {
    if (c.due) {
      push({ id: `${ev.id}:c:${c.id}`, eventId: ev.id, lane: c.lane ?? 'dia', label: c.text, due: c.due, source: { type: 'paso', id: c.id }, how: c.note, go: c.lane === 'proveedores' ? { label: 'Abrir proveedores', tab: 'proveedores' } : c.lane === 'invitados' ? { label: 'Abrir invitados', tab: 'invitados' } : c.lane === 'diseno' ? { label: 'Abrir inspiración', tab: 'inspiracion' } : c.lane === 'dia' ? { label: 'Abrir programa', tab: 'programa' } : undefined, canToggle: true }, c.done)
    } else if (norm(c.text).includes('deposito')) {
      push({ id: `${ev.id}:h:deposito`, eventId: ev.id, lane: 'dinero', label: 'Regresar depósito', due: ev.milestoneDates?.deposito ?? addDaysISO(ev.date, 3), source: { type: 'hito', key: 'deposito' }, how: 'Revisa el lugar con mantenimiento. Si todo está bien, regresa el depósito en garantía.', canToggle: true }, c.done)
    }
  }

  out.sort((a, b) => a.due.localeCompare(b.due) || a.label.localeCompare(b.label))
  let nowSet = false
  return out.map((n) => {
    let state: NodeState
    if (stateOf.get(n.id)) state = 'done'
    else if (n.due < t) state = 'late'
    else if (!nowSet) {
      state = 'now'
      nowSet = true
    } else state = 'next'
    return { ...n, state }
  })
}

/** Cuánto lleva cada parte (0–1): de ahí sale qué tanto brilla su foco */
export function partProgress(ev: RanchEvent, part: HealthPart, paid: number, total: number): number {
  if (part.state === 'na') return 0
  switch (part.key) {
    case 'contrato':
    case 'beo':
      return part.state === 'ok' ? 1 : 0
    case 'pagos':
      return total > 0 ? Math.min(1, paid / total) : part.state === 'ok' ? 1 : 0
    case 'invitados': {
      let all = 0
      let conf = 0
      for (const g of ev.guestList) {
        const r = rsvpOf(g)
        if (r === 'declinado') continue
        all += g.count
        if (r === 'confirmado') conf += g.count
      }
      return all ? conf / all : 0
    }
    case 'mesas': {
      if (!layoutStats(ev.layout).seats) return 0
      let conf = 0
      let seated = 0
      for (const g of ev.guestList) {
        if (rsvpOf(g) !== 'confirmado') continue
        conf += g.count
        if (g.table !== undefined && g.table !== null) seated += g.count
      }
      return conf ? seated / conf : part.state === 'ok' ? 1 : 0.5
    }
    case 'proveedores': {
      const n = ev.providers.length + (ev.vendorIds?.length ?? 0)
      if (!n) return 0
      return (ev.providers.filter((p) => p.confirmed).length + (ev.vendorIds?.length ?? 0)) / n
    }
  }
}

export interface EventLights {
  health: HealthPart[]
  progress: Partial<Record<HealthPart['key'], number>>
  /** La misma medida de toda la app: «X de N listos» */
  score: ReturnType<typeof healthScore>
}

export function eventLights(ev: RanchEvent, paid: number, total: number, t = today()): EventLights {
  const health = eventHealth(ev, paid, total, t)
  const progress: EventLights['progress'] = {}
  for (const h of health) progress[h.key] = partProgress(ev, h, paid, total)
  return { health, progress, score: healthScore(health) }
}

/** Carga de trabajo por semana (de lunes a domingo). Lo atrasado se suma a la semana actual. */
export interface WeekLoad {
  from: ISODate
  to: ISODate
  open: number
  late: number
  events: string[]
  nodes: CaminoNode[]
}

export const mondayOf = (iso: ISODate): ISODate => addDaysISO(iso, -((parseISO(iso).getDay() + 6) % 7))

export function weekLoads(nodes: CaminoNode[], from: ISODate, weeks: number, t = today()): WeekLoad[] {
  const start = mondayOf(from)
  const out: WeekLoad[] = Array.from({ length: weeks }, (_, i) => ({ from: addDaysISO(start, i * 7), to: addDaysISO(start, i * 7 + 6), open: 0, late: 0, events: [], nodes: [] }))
  const thisWeek = out.find((w) => t >= w.from && t <= w.to)
  for (const n of nodes) {
    if (n.state === 'done') continue
    const w = n.due < t ? thisWeek : out.find((x) => n.due >= x.from && n.due <= x.to)
    if (!w) continue
    w.open++
    if (n.state === 'late') w.late++
    w.nodes.push(n)
    if (!w.events.includes(n.eventId)) w.events.push(n.eventId)
  }
  return out
}

// ── Cambios ──────────────────────────────────────────────
/** Mueve un paso a otra fecha. Devuelve cómo deshacerlo. */
export function moveNode(n: CaminoNode, date: ISODate): () => void {
  const ev = db.get('events', n.eventId)
  if (n.source.type === 'tarea') {
    const task = db.get('tasks', n.source.id)
    if (!task) return () => {}
    const prev = task.due
    db.patch('tasks', task.id, { due: `${date}${prev?.slice(10) || 'T10:00:00'}` })
    return () => db.patch('tasks', task.id, { due: prev })
  }
  if (!ev) return () => {}
  const src = n.source
  if (src.type === 'pago') {
    const prev = ev.paymentPlan ?? []
    db.patch('events', ev.id, { paymentPlan: prev.map((p) => (p.id === src.id ? { ...p, due: date } : p)) })
    return () => db.patch('events', ev.id, { paymentPlan: prev })
  }
  if (src.type === 'paso') {
    const prev = ev.checklist
    db.patch('events', ev.id, { checklist: prev.map((c) => (c.id === src.id ? { ...c, due: date } : c)) })
    return () => db.patch('events', ev.id, { checklist: prev })
  }
  const prev = ev.milestoneDates
  db.patch('events', ev.id, { milestoneDates: { ...prev, [src.key]: date } })
  return () => db.patch('events', ev.id, { milestoneDates: prev ?? {} })
}

/** Marca o reabre un paso. Lo que depende de datos (firmas, pagos, invitados) se resuelve en su sección. */
export function toggleNode(n: CaminoNode) {
  const ev = db.get('events', n.eventId)
  if (!ev) return
  const done = n.state === 'done'
  const setWord = (word: string, label: string) => {
    const has = ev.checklist.some((c) => norm(c.text).includes(word))
    const next = has ? ev.checklist.map((c) => (norm(c.text).includes(word) ? { ...c, done: !done } : c)) : [...ev.checklist, { id: uid('chk_'), text: label, done: !done }]
    db.patch('events', ev.id, { checklist: next })
  }
  const src = n.source
  if (src.type === 'tarea') {
    const task = db.get('tasks', src.id)
    if (!task) return
    db.patch('tasks', task.id, { status: done ? 'pendiente' : 'hecha', completedAt: done ? undefined : new Date().toISOString() })
    const title = norm(task.title)
    if (title.includes('numero final')) setWord('numero final', 'Confirmar número final de invitados')
    else if (title.startsWith('montaje')) setWord('montaje', 'Montaje verificado')
    return
  }
  if (src.type === 'paso') {
    db.patch('events', ev.id, { checklist: ev.checklist.map((c) => (c.id === src.id ? { ...c, done: !done } : c)) })
    return
  }
  if (src.type === 'hito') {
    if (src.key === 'deposito') return setWord('deposito', 'Entrega de depósito en garantía')
    const word = HITOS[src.key]?.word
    if (word) setWord(word, n.label)
  }
}

/** Pendiente nuevo con fecha, directo al camino */
export function addStep(ev: RanchEvent, text: string, lane: CaminoLane, due: ISODate, note?: string) {
  db.patch('events', ev.id, { checklist: [...ev.checklist, { id: uid('chk_'), text, done: false, due, lane, note }] })
}

/** Hook: el camino de un evento con sus datos de dinero y tareas */
export function useCaminoData(money: boolean) {
  const tasks = useCollection('tasks')
  const events = useCollection('events')
  const m = useEventMoney()
  const t = today()
  const booked = useMemo(() => events.filter((e) => isBooked(e) && e.status !== 'realizado' && e.date >= t).sort((a, b) => a.date.localeCompare(b.date)), [events, t])
  const nodesOf = useMemo(() => {
    const cache = new Map<string, CaminoNode[]>()
    return (ev: RanchEvent) => {
      const hit = cache.get(ev.id)
      if (hit) return hit
      const list = buildCamino(ev, { paid: m.paid(ev), total: m.total(ev), tasks, money, t })
      cache.set(ev.id, list)
      return list
    }
  }, [tasks, m, money, t])
  return { booked, nodesOf, money: m, tasks, t, events }
}

// ── Plan profesional ─────────────────────────────────────
// Pasos que una wedding planner lleva en la cabeza, con su distancia al evento.
// Sus textos evitan a propósito las palabras clave de los hitos (contrato, anticipo, menú, proveedores, plano,
// número final, liquidación, montaje, depósito): marcarlos no debe dar por hecho un hito de la salud del evento.
export interface PlanStep {
  text: string
  lane: CaminoLane
  /** Días antes del evento (negativo = después) */
  days: number
  note?: string
}

const BODA: PlanStep[] = [
  { lane: 'diseno', days: 270, text: 'Reunión de concepto con los novios', note: 'Su estilo, sus colores y, sobre todo, lo que no quieren.' },
  { lane: 'diseno', days: 240, text: 'Elegir temática y paleta', note: 'Una sola paleta de 3 a 5 colores: todo lo demás sale de ahí.' },
  { lane: 'diseno', days: 120, text: 'Diseñar invitaciones y papelería' },
  { lane: 'diseno', days: 90, text: 'Elegir flores y centros de mesa' },
  { lane: 'diseno', days: 60, text: 'Definir mantelería, vajilla y sillas' },
  { lane: 'diseno', days: 45, text: 'Prueba de maquillaje y peinado' },
  { lane: 'diseno', days: 21, text: 'Aprobar muestra del centro de mesa' },
  { lane: 'diseno', days: 14, text: 'Imprimir letreros y tarjetas de mesa' },
  { lane: 'proveedores', days: 240, text: 'Reservar foto y video', note: 'Son los primeros que se agotan en temporada.' },
  { lane: 'proveedores', days: 210, text: 'Reservar banquete' },
  { lane: 'proveedores', days: 180, text: 'Reservar música: DJ, mariachi o grupo' },
  { lane: 'proveedores', days: 150, text: 'Reservar florería y decoración' },
  { lane: 'proveedores', days: 120, text: 'Reservar pastel y mesa de dulces' },
  { lane: 'proveedores', days: 90, text: 'Degustación con el banquete', note: 'Anota alergias y platillos especiales.' },
  { lane: 'proveedores', days: 30, text: 'Pedir a cada proveedor su hora de llegada', note: 'Pídela por escrito: con ella se arma el programa del día.' },
  { lane: 'proveedores', days: 7, text: 'Llamar a cada proveedor para reconfirmar', note: 'Llama, no solo escribas.' },
  { lane: 'invitados', days: 180, text: 'Reunir la lista de invitados', note: 'Pídela a cada familia en un solo formato y con teléfono.' },
  { lane: 'invitados', days: 150, text: 'Enviar «aparta la fecha»' },
  { lane: 'invitados', days: 120, text: 'Apartar casas y cabañas para la familia', note: 'Se rentan aquí mismo: ofrécelas antes de que se llenen.' },
  { lane: 'invitados', days: 30, text: 'Recordatorio a quien no ha confirmado' },
  { lane: 'invitados', days: 21, text: 'Fecha límite para confirmar' },
  { lane: 'invitados', days: 10, text: 'Cerrar el acomodo de mesas con la familia' },
  { lane: 'invitados', days: 2, text: 'Imprimir la lista final para la puerta' },
  { lane: 'dia', days: 60, text: 'Primer borrador del programa', note: 'Empieza por la hora de la ceremonia y se arma hacia adelante.' },
  { lane: 'dia', days: 30, text: 'Repasar el programa con los novios' },
  { lane: 'dia', days: 14, text: 'Recorrido final del lugar con los novios' },
  { lane: 'dia', days: 7, text: 'Mandar el programa a todos los que participan' },
  { lane: 'dia', days: 3, text: 'Preparar kit de emergencia', note: 'Costura, cinta, encendedor, curitas y cargadores.' },
  { lane: 'dia', days: 2, text: 'Ensayo de la ceremonia y la entrada' },
  { lane: 'dia', days: -2, text: 'Agradecer y pedir reseña con fotos', note: 'La recomendación de un cliente feliz es la venta más barata.' },
  { lane: 'dia', days: -7, text: 'Junta de cierre: qué salió bien y qué mejorar' },
]

const XV: PlanStep[] = [
  { lane: 'diseno', days: 240, text: 'Reunión de concepto con la quinceañera', note: 'Su estilo, sus colores y lo que no quiere.' },
  { lane: 'diseno', days: 210, text: 'Elegir temática y paleta' },
  { lane: 'diseno', days: 180, text: 'Elegir el vestido' },
  { lane: 'diseno', days: 120, text: 'Diseñar invitaciones' },
  { lane: 'diseno', days: 90, text: 'Elegir flores, globos y centros de mesa' },
  { lane: 'diseno', days: 60, text: 'Definir mantelería y sillas' },
  { lane: 'diseno', days: 45, text: 'Sesión de fotos previa' },
  { lane: 'diseno', days: 30, text: 'Prueba de maquillaje y peinado' },
  { lane: 'diseno', days: 14, text: 'Imprimir letreros y tarjetas de mesa' },
  { lane: 'proveedores', days: 210, text: 'Reservar foto y video', note: 'Son los primeros que se agotan en temporada.' },
  { lane: 'proveedores', days: 180, text: 'Reservar banquete' },
  { lane: 'proveedores', days: 180, text: 'Reservar DJ y audio' },
  { lane: 'proveedores', days: 150, text: 'Contratar coreógrafo del vals' },
  { lane: 'proveedores', days: 120, text: 'Reservar pastel y mesa de dulces' },
  { lane: 'proveedores', days: 90, text: 'Degustación con el banquete', note: 'Anota alergias y platillos especiales.' },
  { lane: 'proveedores', days: 30, text: 'Pedir a cada proveedor su hora de llegada' },
  { lane: 'proveedores', days: 7, text: 'Llamar a cada proveedor para reconfirmar', note: 'Llama, no solo escribas.' },
  { lane: 'invitados', days: 150, text: 'Reunir la lista de invitados' },
  { lane: 'invitados', days: 120, text: 'Apartar casas y cabañas para la familia', note: 'Se rentan aquí mismo: ofrécelas antes de que se llenen.' },
  { lane: 'invitados', days: 30, text: 'Recordatorio a quien no ha confirmado' },
  { lane: 'invitados', days: 21, text: 'Fecha límite para confirmar' },
  { lane: 'invitados', days: 10, text: 'Cerrar el acomodo de mesas con la familia' },
  { lane: 'invitados', days: 2, text: 'Imprimir la lista final para la puerta' },
  { lane: 'dia', days: 90, text: 'Primer ensayo del vals' },
  { lane: 'dia', days: 60, text: 'Primer borrador del programa' },
  { lane: 'dia', days: 30, text: 'Repasar el programa con la familia' },
  { lane: 'dia', days: 14, text: 'Recorrido final del lugar' },
  { lane: 'dia', days: 7, text: 'Mandar el programa a todos los que participan' },
  { lane: 'dia', days: 3, text: 'Ensayo general del vals' },
  { lane: 'dia', days: 3, text: 'Preparar kit de emergencia', note: 'Costura, cinta, encendedor, curitas y cargadores.' },
  { lane: 'dia', days: -2, text: 'Agradecer y pedir reseña con fotos' },
  { lane: 'dia', days: -7, text: 'Junta de cierre: qué salió bien y qué mejorar' },
]

const GENERAL: PlanStep[] = [
  { lane: 'diseno', days: 60, text: 'Definir temática y colores' },
  { lane: 'diseno', days: 30, text: 'Elegir decoración y centros de mesa' },
  { lane: 'diseno', days: 10, text: 'Imprimir letreros' },
  { lane: 'proveedores', days: 60, text: 'Reservar banquete' },
  { lane: 'proveedores', days: 45, text: 'Reservar música' },
  { lane: 'proveedores', days: 30, text: 'Reservar pastel' },
  { lane: 'proveedores', days: 21, text: 'Degustación con el banquete' },
  { lane: 'proveedores', days: 7, text: 'Llamar a cada proveedor para reconfirmar', note: 'Llama, no solo escribas.' },
  { lane: 'invitados', days: 45, text: 'Reunir la lista de invitados' },
  { lane: 'invitados', days: 21, text: 'Recordatorio a quien no ha confirmado' },
  { lane: 'invitados', days: 14, text: 'Fecha límite para confirmar' },
  { lane: 'dia', days: 21, text: 'Primer borrador del programa' },
  { lane: 'dia', days: 7, text: 'Mandar el programa a todos los que participan' },
  { lane: 'dia', days: 3, text: 'Recorrido final del lugar' },
  { lane: 'dia', days: -3, text: 'Agradecer y pedir reseña con fotos' },
]

export function planFor(type: EventType): PlanStep[] {
  return type === 'boda' ? BODA : type === 'xv' ? XV : GENERAL
}

/** Pasos del plan que aplican a este evento y todavía no están en su camino */
export function planSteps(ev: RanchEvent, t = today()) {
  const m = modulesOf(ev)
  const off = new Set<CaminoLane>([...(!m.invitados ? (['invitados'] as const) : []), ...(!m.proveedores ? (['proveedores'] as const) : [])])
  const have = new Set(ev.checklist.map((c) => norm(c.text)))
  return planFor(ev.type)
    .filter((s) => !off.has(s.lane) && !have.has(norm(s.text)))
    .map((s) => {
      const due = addDaysISO(ev.date, -s.days)
      return { ...s, due, passed: due < t }
    })
    .sort((a, b) => a.due.localeCompare(b.due))
}

export function applyPlan(ev: RanchEvent, steps: { text: string; lane: CaminoLane; due: ISODate; note?: string }[]) {
  db.patch('events', ev.id, { checklist: [...ev.checklist, ...steps.map((s) => ({ id: uid('chk_'), text: s.text, done: false, due: s.due, lane: s.lane, note: s.note }))] })
}

/** Las fases del camino, recortadas a la ventana visible */
export function phaseRibbons(ev: RanchEvent, from: ISODate, to: ISODate, t = today()) {
  const d = ev.date
  const list = [
    { label: 'Diseño y concepto', from: '0000-01-01', to: addDaysISO(d, -91) },
    { label: 'Proveedores y menú', from: addDaysISO(d, -90), to: addDaysISO(d, -46) },
    { label: 'Invitados', from: addDaysISO(d, -45), to: addDaysISO(d, -31) },
    { label: 'Afinar detalles', from: addDaysISO(d, -30), to: addDaysISO(d, -8) },
    { label: 'Semana del evento', from: addDaysISO(d, -7), to: addDaysISO(d, -1) },
    { label: 'Cierre', from: addDaysISO(d, 1), to: '9999-12-31' },
  ]
  return list
    .filter((p) => p.to >= from && p.from <= to)
    .map((p) => ({ label: p.label, from: p.from < from ? from : p.from, to: p.to > to ? to : p.to, current: t >= p.from && t <= p.to }))
}

/** Hora (minutos desde medianoche, hora de Jalisco) de la puesta de sol en el rancho ese día */
export function sunsetMinutes(date: ISODate): number {
  // Se busca el minuto en que el sol cruza el horizonte, de las 16:00 a las 21:00 hora local (UTC−6)
  const utcMidnight = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  let last = 21 * 60
  for (let min = 16 * 60; min <= 21 * 60; min += 2) {
    const when = new Date(utcMidnight + (min + 360) * 60000)
    if (solarPosition(when).alt < -0.0145) {
      last = min
      break
    }
  }
  return last
}

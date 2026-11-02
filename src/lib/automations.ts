// Motor de automatizaciones: "cuando pasa X → haz Y".
// Se ejecuta después de cada cambio local. Las reglas se pueden encender/apagar en Ajustes.
import type {
  AppNotification,
  BaseDoc,
  CollectionName,
  Collections,
  ID,
  InventoryItem,
  RanchEvent,
  Reservation,
  Settings,
  Task,
} from './types'
import type { StoreState } from './store'
import { addDaysISO, nowIso, today, uid } from './format'
import { CLEANING_CONSUMPTION, cleaningChecklist } from './templates'

export interface AutomationApi {
  get: () => StoreState
  upsert: <K extends CollectionName>(col: K, doc: Partial<Collections[K]> & { id?: ID }) => Collections[K]
  patch: <K extends CollectionName>(col: K, id: ID, partial: Partial<Collections[K]>) => Collections[K] | undefined
  notify: (n: Omit<AppNotification, keyof BaseDoc | 'read'>) => void
}

interface Ctx<K extends CollectionName> {
  col: K
  before: Collections[K] | undefined
  after: Collections[K]
  settings: Settings
  depth: number
  api: (rule: string) => AutomationApi
}

export const AUTOMATION_RULES = [
  { key: 'checkoutCleaning', when: 'El huésped hace check-out', then: 'Se crea la tarea de limpieza con su checklist y la unidad pasa a "Por limpiar"', tone: 'peach' },
  { key: 'autoAssign', when: 'Se crea una limpieza', then: 'Se asigna a la persona de limpieza con menos carga', tone: 'mint' },
  { key: 'cleaningUnlocksUnit', when: 'La limpieza se termina y se revisa', then: 'La unidad pasa a "Por revisar" y luego a "Lista"', tone: 'sky' },
  { key: 'inventoryDeduct', when: 'Se termina una limpieza', then: 'Se descuentan papel, jabón, shampoo y bolsas del inventario', tone: 'butter' },
  { key: 'lowStockShopping', when: 'Un insumo baja del mínimo', then: 'Se crea una tarea de compra y se avisa a administración', tone: 'rose' },
  { key: 'eventPlan', when: 'Un evento se confirma', then: 'Se genera el plan: menú (D-30), invitados (D-7), montaje (D-1) y desmontaje (D+1)', tone: 'lavender' },
  { key: 'paymentReminders', when: 'Un pago está por vencer', then: 'Aparece un aviso para cobrar con mensaje de WhatsApp listo', tone: 'sage' },
] as const

const openTask = (t: Task) => !t.deleted && (t.status === 'pendiente' || t.status === 'en-progreso')

export function pickCleaner(state: StoreState): ID | undefined {
  const cleaners = Object.values(state.data.employees).filter((e) => e.role === 'limpieza' && e.active && !e.deleted)
  if (!cleaners.length) return undefined
  const load = (id: ID) =>
    Object.values(state.data.tasks).filter((t) => t.assigneeId === id && t.type === 'limpieza' && openTask(t)).length
  return cleaners.sort((a, b) => load(a.id) - load(b.id))[0]!.id
}

export function createCleaningTask(api: AutomationApi, unitId: ID, opts: { reservationId?: ID; automated?: string } = {}) {
  const state = api.get()
  const unit = state.data.units[unitId]
  if (!unit) return
  const existing = Object.values(state.data.tasks).find((t) => t.unitId === unitId && t.type === 'limpieza' && openTask(t))
  if (existing) return existing
  const due = new Date()
  const [h, m] = state.settings.checkInTime.split(':').map(Number)
  due.setHours((h ?? 15) - 1, m ?? 0, 0, 0)
  const task = api.upsert('tasks', {
    title: `Limpieza · ${unit.name}`,
    type: 'limpieza',
    status: 'pendiente',
    priority: 'alta',
    unitId,
    reservationId: opts.reservationId,
    assigneeId: state.settings.automations.autoAssign ? pickCleaner(state) : undefined,
    due: due.toISOString(),
    checklist: cleaningChecklist(unit.kind),
    photoIds: [],
    automated: opts.automated,
  })
  api.notify({
    title: 'Nueva limpieza',
    body: `${unit.name} quedó libre y necesita limpieza.`,
    tone: 'peach',
    link: '/limpieza',
    roles: ['limpieza', 'admin'],
  })
  return task
}

function onReservation(ctx: Ctx<'reservations'>) {
  const { before, after, settings } = ctx
  if (before?.status === after.status || after.deleted) return
  const api = ctx.api('Reserva → estado de la unidad')
  const unit = api.get().data.units[after.unitId]
  if (!unit) return
  if (after.status === 'en-casa') {
    api.patch('units', unit.id, { status: 'ocupada' })
  }
  if (after.status === 'finalizada' && settings.automations.checkoutCleaning) {
    const a = ctx.api('Check-out → limpieza')
    a.patch('units', unit.id, { status: 'sucia' })
    createCleaningTask(a, unit.id, { reservationId: after.id, automated: 'Check-out → limpieza' })
  }
}

function onTask(ctx: Ctx<'tasks'>) {
  const { before, after, settings } = ctx
  if (!after.unitId || after.deleted) return
  const statusChanged = before?.status !== after.status
  const api = ctx.api('Limpieza → estado de la unidad')
  const state = api.get()
  const unit = state.data.units[after.unitId]
  if (!unit) return

  if (after.type === 'limpieza' && statusChanged && settings.automations.cleaningUnlocksUnit) {
    if (after.status === 'en-progreso' && unit.status !== 'ocupada') api.patch('units', unit.id, { status: 'limpiando' })
    if (after.status === 'hecha') {
      api.patch('units', unit.id, { status: 'inspeccion' })
      api.notify({
        title: 'Limpieza terminada',
        body: `${unit.name} está lista para revisión.`,
        tone: 'sky',
        link: '/limpieza',
        roles: ['admin'],
      })
    }
    if (after.status === 'verificada') api.patch('units', unit.id, { status: 'lista', lastCleanedAt: nowIso() })
  }

  if (after.type === 'limpieza' && statusChanged && after.status === 'hecha' && before?.status !== 'verificada' && settings.automations.inventoryDeduct) {
    const inv = ctx.api('Limpieza → inventario')
    for (const { itemId, qty } of CLEANING_CONSUMPTION[unit.kind]) {
      const item = inv.get().data.inventory[itemId]
      if (item && !item.deleted) inv.patch('inventory', itemId, { stock: Math.max(0, item.stock - qty) })
    }
  }

  if (after.type === 'mantenimiento' && after.priority === 'urgente') {
    const m = ctx.api('Incidencia urgente → bloquear unidad')
    if (!before && unit.status !== 'ocupada') m.patch('units', unit.id, { status: 'mantenimiento' })
    if (statusChanged && (after.status === 'hecha' || after.status === 'verificada') && unit.status === 'mantenimiento')
      m.patch('units', unit.id, { status: 'inspeccion' })
  }
}

function onInventory(ctx: Ctx<'inventory'>) {
  const { before, after, settings } = ctx
  if (!settings.automations.lowStockShopping || after.deleted) return
  const crossed = after.stock <= after.min && (!before || before.stock > before.min)
  if (!crossed) return
  const api = ctx.api('Inventario bajo → compra')
  const exists = Object.values(api.get().data.tasks).find((t) => t.type === 'compra' && openTask(t) && t.title.includes(after.name))
  if (exists) return
  api.upsert('tasks', {
    title: `Comprar ${after.name}`,
    type: 'compra',
    status: 'pendiente',
    priority: after.stock === 0 ? 'urgente' : 'media',
    checklist: [{ id: uid('chk_'), text: `Reponer al menos ${Math.max(after.min * 2 - after.stock, 1)} ${after.unit}`, done: false }],
    photoIds: [],
    automated: 'Inventario bajo → compra',
    notes: `Quedan ${after.stock} ${after.unit} (mínimo ${after.min}).`,
  })
  api.notify({
    title: 'Inventario bajo',
    body: `Quedan ${after.stock} ${after.unit} de ${after.name}.`,
    tone: 'rose',
    link: '/inventario',
    roles: ['admin'],
  })
}

export function eventPlanTasks(ev: RanchEvent): Partial<Task>[] {
  const tables = ev.layout.filter((i) => i.type.startsWith('mesa') || i.type === 'periquera').length
  const seats = ev.layout.reduce((n, i) => n + (i.seats ?? 0), 0)
  const place = ev.venue === 'salon' ? 'salón' : 'jardín'
  const plan: { offset: number; title: string; priority: Task['priority']; items: string[] }[] = [
    { offset: -30, title: `Confirmar menú y proveedores · ${ev.title}`, priority: 'media', items: ['Degustación agendada', 'Proveedores confirmados', 'Anticipo recibido'] },
    { offset: -7, title: `Número final de invitados · ${ev.title}`, priority: 'alta', items: ['Lista final de invitados', 'Plano de mesas aprobado', 'Pago de liquidación'] },
    {
      offset: -1,
      title: `Montaje del ${place} · ${ev.title}`,
      priority: 'alta',
      items: [
        `Colocar ${tables || Math.ceil(ev.guests / 10)} mesas`,
        `Colocar ${seats || ev.guests} sillas`,
        'Mantelería y centros de mesa',
        'Pista, escenario y audio',
        'Baños limpios y surtidos',
        ev.venue === 'jardin' ? 'Revisar riego apagado y pasto podado' : 'Clima y ventiladores funcionando',
      ],
    },
    { offset: 1, title: `Desmontaje y limpieza · ${ev.title}`, priority: 'alta', items: ['Retirar mobiliario', 'Limpieza profunda', 'Sacar basura', 'Revisar daños'] },
    { offset: 1, title: `Conteo de mobiliario · ${ev.title}`, priority: 'media', items: ['Contar sillas y mesas', 'Contar mantelería', 'Registrar faltantes o daños'] },
  ]
  return plan
    .map((p) => {
      const date = addDaysISO(ev.date, p.offset)
      return { ...p, date }
    })
    .filter((p) => p.date >= today())
    .map((p) => ({
      title: p.title,
      type: 'evento' as const,
      status: 'pendiente' as const,
      priority: p.priority,
      eventId: ev.id,
      assigneeId: ev.coordinatorId,
      due: `${p.date}T10:00:00`,
      checklist: p.items.map((text) => ({ id: uid('chk_'), text, done: false })),
      photoIds: [],
      automated: 'Evento confirmado → plan',
    }))
}

function onEvent(ctx: Ctx<'events'>) {
  const { before, after, settings } = ctx
  if (before?.status === after.status || after.deleted) return
  if (after.status === 'confirmado' && settings.automations.eventPlan) {
    const api = ctx.api('Evento confirmado → plan')
    const already = Object.values(api.get().data.tasks).some((t) => t.eventId === after.id && t.automated && !t.deleted)
    if (!already) for (const t of eventPlanTasks(after)) api.upsert('tasks', t)
    api.notify({
      title: 'Evento confirmado',
      body: `${after.title} quedó confirmado. Se generó su plan de trabajo.`,
      tone: 'lavender',
      link: `/eventos/${after.id}`,
      roles: ['admin', 'eventos'],
    })
  }
  if (after.status === 'apartado') {
    ctx.api('Evento apartado').notify({
      title: 'Fecha apartada',
      body: `${after.clientName} apartó ${after.date} para ${after.title}.`,
      tone: 'peach',
      link: `/eventos/${after.id}`,
      roles: ['admin', 'eventos'],
    })
  }
}

export function runAutomations<K extends CollectionName>(ctx: Ctx<K>) {
  switch (ctx.col) {
    case 'reservations':
      return onReservation(ctx as unknown as Ctx<'reservations'>)
    case 'tasks':
      return onTask(ctx as unknown as Ctx<'tasks'>)
    case 'inventory':
      return onInventory(ctx as unknown as Ctx<'inventory'>)
    case 'events':
      return onEvent(ctx as unknown as Ctx<'events'>)
  }
}

// ── Reglas de consulta (alertas calculadas al vuelo) ──────
export interface Alert {
  id: string
  title: string
  body: string
  tone: AppNotification['tone']
  link?: string
  action?: { label: string; href: string }
}

export function computeAlerts(state: StoreState): Alert[] {
  const out: Alert[] = []
  const t = today()
  const res = Object.values(state.data.reservations).filter((r) => !r.deleted && r.status !== 'cancelada')
  const payments = Object.values(state.data.payments).filter((p) => !p.deleted)
  const paidFor = (refId: ID) => payments.filter((p) => p.refId === refId).reduce((n, p) => n + p.amount, 0)

  for (const r of res) {
    const unit = state.data.units[r.unitId]
    if (r.checkOut === t && r.status === 'en-casa')
      out.push({ id: 'co' + r.id, title: `Salida hoy · ${unit?.name}`, body: `${r.guestName} sale a las ${state.settings.checkOutTime}.`, tone: 'peach', link: '/hospedaje' })
    if (r.checkIn === t && (r.status === 'confirmada' || r.status === 'pendiente'))
      out.push({ id: 'ci' + r.id, title: `Llegada hoy · ${unit?.name}`, body: `${r.guestName}, ${r.guests} huéspedes${r.arrivalTime ? ' a las ' + r.arrivalTime : ''}.`, tone: 'lavender', link: '/hospedaje' })
    if (r.checkIn === t && unit && unit.status !== 'lista' && unit.status !== 'ocupada')
      out.push({ id: 'nr' + r.id, title: `${unit.name} aún no está lista`, body: `Llega ${r.guestName} hoy. Estado: ${unit.status}.`, tone: 'rose', link: '/limpieza' })
  }

  if (state.settings.automations.paymentReminders) {
    for (const ev of Object.values(state.data.events)) {
      if (ev.deleted || ev.status === 'cancelado' || ev.status === 'realizado' || ev.status === 'prospecto') continue
      const total = eventTotal(ev, state.settings.ivaPercent)
      const paid = paidFor(ev.id)
      const days = Math.round((new Date(ev.date).getTime() - Date.now()) / 86400000)
      if (paid < total && days <= 10 && days >= 0)
        out.push({
          id: 'pay' + ev.id,
          title: `Liquidación pendiente · ${ev.title}`,
          body: `Faltan ${Math.round(total - paid).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })} y el evento es en ${days} días.`,
          tone: 'butter',
          link: `/eventos/${ev.id}`,
        })
    }
  }

  const low = Object.values(state.data.inventory).filter((i: InventoryItem) => !i.deleted && i.stock <= i.min)
  if (low.length)
    out.push({ id: 'inv', title: `${low.length} insumos por debajo del mínimo`, body: low.slice(0, 3).map((i) => i.name).join(', ') + (low.length > 3 ? '…' : ''), tone: 'rose', link: '/inventario' })

  return out
}

// ── Cálculos compartidos ─────────────────────────────────
export function eventSubtotal(ev: RanchEvent) {
  return ev.lineItems.reduce((n, li) => n + li.qty * li.price, 0)
}
export function eventTotal(ev: RanchEvent, ivaPercent: number) {
  const sub = Math.max(0, eventSubtotal(ev) - (ev.discount || 0))
  return ev.includeIva ? sub * (1 + ivaPercent / 100) : sub
}
export function paidAmount(state: StoreState, refId: ID) {
  return Object.values(state.data.payments)
    .filter((p) => !p.deleted && p.refId === refId)
    .reduce((n, p) => n + p.amount, 0)
}
export function reservationConflicts(state: StoreState, r: Pick<Reservation, 'id' | 'unitId' | 'checkIn' | 'checkOut'>) {
  return Object.values(state.data.reservations).filter(
    (o) => !o.deleted && o.id !== r.id && o.unitId === r.unitId && o.status !== 'cancelada' && o.checkIn < r.checkOut && r.checkIn < o.checkOut,
  )
}

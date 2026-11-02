// Modelo de datos de La Joya. Cada documento vive en una colección y se sincroniza
// como un registro independiente (offline-first, última escritura gana).

export type ID = string
export type ISODate = string // 'YYYY-MM-DD'
export type ISODateTime = string // ISO 8601 completo

export interface BaseDoc {
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  updatedBy?: ID
  deleted?: boolean
  /** Marca de tiempo por campo: permite combinar ediciones simultáneas sin perder datos */
  _ft?: Record<string, string>
}

export type Pastel = 'lavender' | 'sage' | 'peach' | 'butter' | 'sky' | 'rose' | 'mint'

// ── Equipo ───────────────────────────────────────────────
export type Role = 'admin' | 'eventos' | 'recepcion' | 'limpieza' | 'mantenimiento'

/** Turno semanal fijo: día (0 = domingo … 6 = sábado) y horario */
export interface Shift {
  day: number
  start: string // 'HH:mm'
  end: string // 'HH:mm'
}

export interface Employee extends BaseDoc {
  name: string
  role: Role
  pinHash: string
  color: Pastel
  phone?: string
  active: boolean
  authEmail?: string // cuenta en Supabase Auth (modo nube)
  shifts?: Shift[] // horario semanal (Equipo → turnos)
}

// ── Hospedaje ────────────────────────────────────────────
export type UnitKind = 'cabana' | 'casa'
export type UnitStatus = 'lista' | 'ocupada' | 'sucia' | 'limpiando' | 'inspeccion' | 'mantenimiento'

export interface Unit extends BaseDoc {
  kind: UnitKind
  name: string
  short: string // etiqueta corta para el mapa: "C1", "Casa 2"
  mapId: string // referencia a RANCH_LAYOUT
  capacity: number
  bedrooms: number
  beds: string
  baths: number
  basePrice: number // por noche, entre semana
  weekendPrice: number
  status: UnitStatus
  color: Pastel
  amenities: string[]
  description: string
  icalImportUrl?: string // URL iCal de Airbnb / Booking
  icalExportToken?: string // token para el feed que se le da a Airbnb
  lastCleanedAt?: ISODateTime
  notes?: string
}

export type ReservationSource = 'directo' | 'airbnb' | 'booking' | 'whatsapp'
export type ReservationStatus = 'pendiente' | 'confirmada' | 'en-casa' | 'finalizada' | 'cancelada'

export interface Reservation extends BaseDoc {
  unitId: ID
  guestName: string
  phone?: string
  email?: string
  guests: number
  checkIn: ISODate
  checkOut: ISODate
  arrivalTime?: string // 'HH:mm'
  source: ReservationSource
  status: ReservationStatus
  total: number
  notes?: string
  externalUid?: string // UID del evento iCal importado
}

// ── Pagos y finanzas ─────────────────────────────────────
export type PaymentMethod = 'efectivo' | 'transferencia' | 'tarjeta' | 'airbnb'
export type BusinessLine = 'hospedaje' | 'eventos' | 'general'

export interface Payment extends BaseDoc {
  refType: 'reserva' | 'evento'
  refId: ID
  amount: number
  method: PaymentMethod
  date: ISODate
  concept: string
  receivedBy?: ID
}

export type ExpenseCategory =
  | 'nomina'
  | 'servicios'
  | 'mantenimiento'
  | 'insumos'
  | 'jardineria'
  | 'publicidad'
  | 'comisiones'
  | 'otros'

export interface Expense extends BaseDoc {
  date: ISODate
  concept: string
  category: ExpenseCategory
  amount: number
  line: BusinessLine
  method: PaymentMethod
}

// ── Tareas ───────────────────────────────────────────────
export type TaskType = 'limpieza' | 'mantenimiento' | 'evento' | 'jardin' | 'compra' | 'general'
export type TaskStatus = 'pendiente' | 'en-progreso' | 'hecha' | 'verificada'
export type Priority = 'baja' | 'media' | 'alta' | 'urgente'

export interface ChecklistItem {
  id: ID
  text: string
  done: boolean
}

export interface Task extends BaseDoc {
  title: string
  type: TaskType
  status: TaskStatus
  priority: Priority
  unitId?: ID
  eventId?: ID
  reservationId?: ID
  assigneeId?: ID
  due?: ISODateTime
  checklist: ChecklistItem[]
  photoIds: ID[]
  notes?: string
  createdById?: ID
  startedAt?: ISODateTime
  completedAt?: ISODateTime
  verifiedAt?: ISODateTime
  verifiedById?: ID
  automated?: string // regla que la generó
}

export interface Photo extends BaseDoc {
  dataUrl?: string // local / modo demo
  storagePath?: string // ruta en Supabase Storage
  taskId?: ID
  caption?: string
}

// ── Eventos ──────────────────────────────────────────────
export type EventType =
  | 'boda'
  | 'xv'
  | 'cumpleanos'
  | 'bautizo'
  | 'primera-comunion'
  | 'graduacion'
  | 'empresarial'
  | 'baby-shower'
  | 'aniversario'
  | 'otro'
export type Venue = 'salon' | 'jardin'
export type EventStatus = 'prospecto' | 'cotizado' | 'apartado' | 'confirmado' | 'realizado' | 'cancelado'

export interface LineItem {
  id: ID
  concept: string
  category: string
  qty: number
  price: number
}

export type FloorItemType =
  | 'mesa-redonda'
  | 'mesa-rectangular'
  | 'mesa-imperial'
  | 'mesa-principal'
  | 'periquera'
  | 'pista'
  | 'escenario'
  | 'dj'
  | 'buffet'
  | 'barra'
  | 'pastel'
  | 'regalos'
  | 'photobooth'
  | 'lounge'
  | 'sillas-ceremonia'
  | 'mesa-cuadrada'
  | 'mesa-novios'
  | 'mesa-media-luna'
  | 'mesa-dulces'
  | 'carpa'
  | 'arco'
  | 'tarima'
  | 'letrero'
  | 'pasillo'
  | 'planta'

export interface FloorItem {
  id: ID
  type: FloorItemType
  x: number // metros, origen arriba-izquierda del recinto
  y: number
  rot: number // grados
  w?: number // metros (para rectangulares/zonas)
  h?: number
  seats?: number
  label?: string
  number?: number
  name?: string // nombre de la mesa ("Mesa Lavanda")
  color?: string // color del mantel o acento (hex de la paleta del evento)
  locked?: boolean // bloqueada: no se mueve por accidente
}

/** Una escena es un plano del evento en un espacio: recepción en el salón, ceremonia en el jardín… */
export type SceneKind = 'recepcion' | 'ceremonia' | 'coctel' | 'otro'
export interface FloorScene {
  id: ID
  name: string
  kind: SceneKind
  venue: Venue
  time?: string // 'HH:mm' (opcional)
  items: FloorItem[]
}

export type Rsvp = 'pendiente' | 'confirmado' | 'declinado'

export interface Guest {
  id: ID
  name: string
  count: number // personas (familia), incluye niños
  table?: number
  seat?: number // lugar dentro de la mesa (opcional)
  confirmed: boolean // compatibilidad: true cuando rsvp = 'confirmado'
  side?: string // novia/novio, familia, amigos, trabajo…
  rsvp?: Rsvp
  phone?: string
  email?: string
  kids?: number
  diet?: string // vegetariano, sin gluten, alergias…
  group?: string // familia o grupo (para sentarlos juntos)
  vip?: boolean
  invitedAt?: ISODateTime // cuándo se le mandó la invitación
  remindedAt?: ISODateTime // último recordatorio de confirmación
  arrived?: boolean // llegada el día del evento (recepción en la puerta)
  arrivedAt?: ISODateTime
  notes?: string
}

export interface TimelineItem {
  id: ID
  time: string // 'HH:mm'
  title: string
  owner?: string
  done: boolean
}

export interface Provider {
  id: ID
  name: string
  service: string
  phone?: string
  confirmed: boolean
}

export type LeadSource = 'instagram' | 'facebook' | 'whatsapp' | 'recomendacion' | 'visita' | 'web' | 'otro'

export interface PaymentPlanItem {
  id: ID
  label: string // 'Anticipo', '2o pago', 'Liquidación'
  due: ISODate
  amount: number
}

export interface Signature {
  name: string
  dataUrl: string // trazo de la firma (PNG)
  at: ISODateTime
  document: 'contrato' | 'beo'
}

export interface RanchEvent extends BaseDoc {
  title: string
  type: EventType
  venue: Venue
  date: ISODate
  startTime: string
  endTime: string
  guests: number
  clientName: string
  phone?: string
  email?: string
  status: EventStatus
  packageId?: string
  lineItems: LineItem[]
  discount: number
  includeIva: boolean
  layout: FloorItem[] // escena principal (recepción) en `venue`
  scenes?: FloorScene[] // escenas adicionales: ceremonia, cóctel… cada una con su espacio
  guestList: Guest[]
  timeline: TimelineItem[]
  checklist: ChecklistItem[]
  providers: Provider[]
  notes?: string
  coordinatorId?: ID
  // CRM del wedding planner
  leadSource?: LeadSource
  followUpAt?: ISODate
  clientBudget?: number
  probability?: number // 0–100: probabilidad de cierre del prospecto
  palette?: string[] // colores del evento (tablero de inspiración)
  moodNotes?: string
  inspirationPhotoIds?: ID[] // fotos de referencia del tablero de inspiración
  theme?: string // temática
  menu?: string
  setupNotes?: string // montaje (para la orden de evento)
  paymentPlan?: PaymentPlanItem[]
  signatures?: Signature[]
  vendorIds?: ID[]
}

// ── Proveedores (directorio del wedding planner) ─────────
export type VendorCategory = 'banquete' | 'musica' | 'flores' | 'foto' | 'pasteleria' | 'mobiliario' | 'iluminacion' | 'belleza' | 'transporte' | 'otro'

export interface Vendor extends BaseDoc {
  name: string
  category: VendorCategory
  contact?: string
  phone?: string
  email?: string
  instagram?: string
  priceFrom?: number
  rating: number // 1–5
  favorite: boolean
  notes?: string
}

// ── Inventario ───────────────────────────────────────────
export type InventoryCategory = 'blancos' | 'amenidades' | 'limpieza' | 'mobiliario' | 'manteleria' | 'bar' | 'mantenimiento'

export interface InventoryItem extends BaseDoc {
  name: string
  category: InventoryCategory
  unit: string // pza, rollo, litro
  stock: number
  min: number
  cost: number
  location?: string
  barcode?: string // código de barras del producto (para escanear al contar)
}

// ── Objetos olvidados (limpieza) ─────────────────────────
export interface LostItem extends BaseDoc {
  description: string
  unitId?: ID
  reservationId?: ID
  foundById?: ID
  foundAt: ISODateTime
  photoId?: ID
  status: 'guardado' | 'entregado' | 'desechado'
  notes?: string
}

// ── Sistema ──────────────────────────────────────────────
export interface AuditEntry extends BaseDoc {
  at: ISODateTime
  userId?: ID
  action: 'crear' | 'editar' | 'eliminar' | 'sesion' | 'respaldo' | 'restaurar' | 'automatizacion'
  collection: string
  docId?: ID
  summary: string
}

export interface AppNotification extends BaseDoc {
  title: string
  body: string
  tone: Pastel
  link?: string
  roles: Role[]
  read: boolean
}

export interface Collections {
  employees: Employee
  units: Unit
  reservations: Reservation
  payments: Payment
  expenses: Expense
  tasks: Task
  photos: Photo
  events: RanchEvent
  inventory: InventoryItem
  audit: AuditEntry
  notifications: AppNotification
  vendors: Vendor
  lostfound: LostItem
}
export type CollectionName = keyof Collections
export type DataState = { [K in CollectionName]: Record<ID, Collections[K]> }

export const COLLECTIONS: CollectionName[] = [
  'employees',
  'units',
  'reservations',
  'payments',
  'expenses',
  'tasks',
  'photos',
  'events',
  'inventory',
  'audit',
  'notifications',
  'vendors',
  'lostfound',
]

export interface AutomationSettings {
  checkoutCleaning: boolean
  cleaningUnlocksUnit: boolean
  eventPlan: boolean
  inventoryDeduct: boolean
  lowStockShopping: boolean
  paymentReminders: boolean
  autoAssign: boolean
}

export type Atmos = 'flor' | 'marea' | 'crepusculo' | 'nocturno'
export type ThemePref = 'auto' | 'light' | 'dark'
export interface UserPrefs {
  atmos?: Atmos
  theme?: ThemePref
  /** Tarjetas del inicio: orden y cuáles se ocultaron (por pestaña: 'hoy', 'negocio', 'eventos') */
  home?: Record<string, { order?: string[]; hidden?: string[] }>
  /** Ya vio el recorrido guiado de su panel */
  tourDone?: boolean
}

export interface Settings {
  ranchName: string
  address: string
  phone: string
  lat: number
  lng: number
  theme: ThemePref
  atmos: Atmos
  /** Preferencias visuales de cada persona en este dispositivo (su propio panel) */
  userPrefs?: Record<ID, UserPrefs>
  checkInTime: string
  checkOutTime: string
  depositPercent: number
  ivaPercent: number
  autoLockMinutes: number
  automations: AutomationSettings
  supabaseUrl?: string
  supabaseAnonKey?: string
  /** Llave pública VAPID para notificaciones push (opcional) */
  vapidPublicKey?: string
  lastBackupAt?: ISODateTime
  /** Muestra opciones técnicas (cómo funciona, vitrina de diseño, diagnósticos) */
  techMode?: boolean
}

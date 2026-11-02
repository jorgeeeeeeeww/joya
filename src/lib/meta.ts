import type {
  EventStatus,
  EventType,
  ExpenseCategory,
  InventoryCategory,
  Pastel,
  PaymentMethod,
  Priority,
  ReservationSource,
  ReservationStatus,
  Role,
  TaskStatus,
  TaskType,
  UnitStatus,
  Venue,
} from './types'
import { Baby, Briefcase, Cake, Church, Crown, Droplets, Gem, GraduationCap, PartyPopper, Wine, type LucideIcon } from 'lucide-react'

export interface Meta {
  label: string
  tone: Pastel
}

export const UNIT_STATUS: Record<UnitStatus, Meta & { hint: string }> = {
  lista: { label: 'Lista', tone: 'sage', hint: 'Limpia y lista para recibir' },
  ocupada: { label: 'Ocupada', tone: 'sky', hint: 'Huéspedes en casa' },
  sucia: { label: 'Por limpiar', tone: 'peach', hint: 'Salida registrada, pendiente de limpieza' },
  limpiando: { label: 'Limpiando', tone: 'butter', hint: 'Limpieza en curso' },
  inspeccion: { label: 'Por revisar', tone: 'mint', hint: 'Limpieza terminada, falta revisión' },
  mantenimiento: { label: 'Mantenimiento', tone: 'rose', hint: 'Bloqueada por reparación' },
}

export const RES_STATUS: Record<ReservationStatus, Meta> = {
  pendiente: { label: 'Pendiente', tone: 'butter' },
  confirmada: { label: 'Confirmada', tone: 'sky' },
  'en-casa': { label: 'En casa', tone: 'lavender' },
  finalizada: { label: 'Finalizada', tone: 'sage' },
  cancelada: { label: 'Cancelada', tone: 'rose' },
}

export const RES_SOURCE: Record<ReservationSource, Meta> = {
  directo: { label: 'Directo', tone: 'lavender' },
  airbnb: { label: 'Airbnb', tone: 'rose' },
  booking: { label: 'Booking', tone: 'sky' },
  whatsapp: { label: 'WhatsApp', tone: 'sage' },
}

export const TASK_STATUS: Record<TaskStatus, Meta> = {
  pendiente: { label: 'Pendiente', tone: 'peach' },
  'en-progreso': { label: 'En progreso', tone: 'butter' },
  hecha: { label: 'Hecha', tone: 'sky' },
  verificada: { label: 'Verificada', tone: 'mint' },
}

export const TASK_TYPE: Record<TaskType, Meta> = {
  limpieza: { label: 'Limpieza', tone: 'mint' },
  mantenimiento: { label: 'Mantenimiento', tone: 'rose' },
  evento: { label: 'Evento', tone: 'lavender' },
  jardin: { label: 'Jardín', tone: 'sage' },
  compra: { label: 'Compra', tone: 'butter' },
  general: { label: 'General', tone: 'sky' },
}

export const PRIORITY: Record<Priority, Meta> = {
  baja: { label: 'Baja', tone: 'sage' },
  media: { label: 'Media', tone: 'sky' },
  alta: { label: 'Alta', tone: 'peach' },
  urgente: { label: 'Urgente', tone: 'rose' },
}

/** `icon` es un ícono de línea (step1 no usa emojis como iconografía). `emoji` queda solo por compatibilidad. */
export const EVENT_TYPE: Record<EventType, Meta & { emoji: string; icon: LucideIcon }> = {
  boda: { label: 'Boda', tone: 'rose', emoji: '💍', icon: Gem },
  xv: { label: 'XV años', tone: 'lavender', emoji: '👑', icon: Crown },
  cumpleanos: { label: 'Cumpleaños', tone: 'butter', emoji: '🎂', icon: Cake },
  bautizo: { label: 'Bautizo', tone: 'sky', emoji: '🕊️', icon: Droplets },
  'primera-comunion': { label: 'Primera comunión', tone: 'mint', emoji: '✨', icon: Church },
  graduacion: { label: 'Graduación', tone: 'peach', emoji: '🎓', icon: GraduationCap },
  empresarial: { label: 'Empresarial', tone: 'sky', emoji: '💼', icon: Briefcase },
  'baby-shower': { label: 'Baby shower', tone: 'mint', emoji: '🍼', icon: Baby },
  aniversario: { label: 'Aniversario', tone: 'rose', emoji: '🥂', icon: Wine },
  otro: { label: 'Otro', tone: 'sage', emoji: '🎉', icon: PartyPopper },
}

export const EVENT_STATUS: Record<EventStatus, Meta & { step: number }> = {
  prospecto: { label: 'Prospecto', tone: 'sky', step: 0 },
  cotizado: { label: 'Cotizado', tone: 'butter', step: 1 },
  apartado: { label: 'Apartado', tone: 'peach', step: 2 },
  confirmado: { label: 'Confirmado', tone: 'lavender', step: 3 },
  realizado: { label: 'Realizado', tone: 'mint', step: 4 },
  cancelado: { label: 'Cancelado', tone: 'rose', step: -1 },
}

export const VENUE: Record<Venue, Meta & { capacity: number; description: string }> = {
  salon: { label: 'Salón', tone: 'lavender', capacity: 300, description: 'Salón techado con pista y cocina' },
  jardin: { label: 'Jardín', tone: 'sage', capacity: 400, description: 'Jardín superior con glorieta y palmeras' },
}

export const LEAD_SOURCE: Record<import('./types').LeadSource, Meta> = {
  instagram: { label: 'Instagram', tone: 'rose' },
  facebook: { label: 'Facebook', tone: 'sky' },
  whatsapp: { label: 'WhatsApp', tone: 'sage' },
  recomendacion: { label: 'Recomendación', tone: 'butter' },
  visita: { label: 'Visita al rancho', tone: 'lavender' },
  web: { label: 'Página web', tone: 'mint' },
  otro: { label: 'Otro', tone: 'peach' },
}

export const VENDOR_CATEGORY: Record<import('./types').VendorCategory, Meta> = {
  banquete: { label: 'Banquete', tone: 'peach' },
  musica: { label: 'DJ y música', tone: 'lavender' },
  flores: { label: 'Flores y decoración', tone: 'rose' },
  foto: { label: 'Foto y video', tone: 'sky' },
  pasteleria: { label: 'Pastelería', tone: 'butter' },
  mobiliario: { label: 'Mobiliario', tone: 'mint' },
  iluminacion: { label: 'Iluminación', tone: 'butter' },
  belleza: { label: 'Maquillaje y peinado', tone: 'rose' },
  transporte: { label: 'Transporte', tone: 'sage' },
  otro: { label: 'Otro', tone: 'sky' },
}

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  airbnb: 'Airbnb',
}

export const EXPENSE_CATEGORY: Record<ExpenseCategory, Meta> = {
  nomina: { label: 'Nómina', tone: 'lavender' },
  servicios: { label: 'Luz, agua y gas', tone: 'sky' },
  mantenimiento: { label: 'Mantenimiento', tone: 'rose' },
  insumos: { label: 'Insumos', tone: 'butter' },
  jardineria: { label: 'Jardinería', tone: 'sage' },
  publicidad: { label: 'Publicidad', tone: 'peach' },
  comisiones: { label: 'Comisiones', tone: 'mint' },
  otros: { label: 'Otros', tone: 'sky' },
}

export const INVENTORY_CATEGORY: Record<InventoryCategory, Meta> = {
  blancos: { label: 'Blancos', tone: 'sky' },
  amenidades: { label: 'Amenidades', tone: 'mint' },
  limpieza: { label: 'Limpieza', tone: 'sage' },
  mobiliario: { label: 'Mobiliario', tone: 'lavender' },
  manteleria: { label: 'Mantelería', tone: 'rose' },
  bar: { label: 'Bar', tone: 'peach' },
  mantenimiento: { label: 'Herramienta', tone: 'butter' },
}

export const ROLE: Record<Role, Meta & { description: string }> = {
  admin: { label: 'Administración', tone: 'lavender', description: 'Acceso total, finanzas y configuración' },
  eventos: { label: 'Wedding planner', tone: 'rose', description: 'Eventos, prospectos, proveedores, cotizaciones y planos' },
  recepcion: { label: 'Recepción', tone: 'sky', description: 'Reservas, llegadas, salidas, Airbnb y cobros de hospedaje' },
  limpieza: { label: 'Limpieza', tone: 'mint', description: 'Limpieza de cabañas y casas' },
  mantenimiento: { label: 'Mantenimiento', tone: 'butter', description: 'Reparaciones, jardín e incidencias' },
}

/** Clases Tailwind por tono (escritas completas para que Tailwind las detecte).
 *  `hex` es una variable CSS (sigue a la atmósfera y al tema); `raw` es un color fijo
 *  (atmósfera Flor, claro) para three.js y para exportar imágenes. */
export const TONE: Record<Pastel, { soft: string; ink: string; solid: string; ring: string; dot: string; hex: string; raw: string }> = {
  lavender: { soft: 'bg-lavender-soft', ink: 'text-lavender-ink', solid: 'bg-lavender', ring: 'ring-lavender', dot: 'bg-lavender', hex: 'var(--lavender)', raw: '#A2939F' },
  sage: { soft: 'bg-sage-soft', ink: 'text-sage-ink', solid: 'bg-sage', ring: 'ring-sage', dot: 'bg-sage', hex: 'var(--sage)', raw: '#7C7A55' },
  peach: { soft: 'bg-peach-soft', ink: 'text-peach-ink', solid: 'bg-peach', ring: 'ring-peach', dot: 'bg-peach', hex: 'var(--peach)', raw: '#D98474' },
  butter: { soft: 'bg-butter-soft', ink: 'text-butter-ink', solid: 'bg-butter', ring: 'ring-butter', dot: 'bg-butter', hex: 'var(--butter)', raw: '#C9974F' },
  sky: { soft: 'bg-sky-soft', ink: 'text-sky-ink', solid: 'bg-sky', ring: 'ring-sky', dot: 'bg-sky', hex: 'var(--t-sky)', raw: '#5C6989' },
  rose: { soft: 'bg-rose-soft', ink: 'text-rose-ink', solid: 'bg-rose', ring: 'ring-rose', dot: 'bg-rose', hex: 'var(--rose)', raw: '#C28B8B' },
  mint: { soft: 'bg-mint-soft', ink: 'text-mint-ink', solid: 'bg-mint', ring: 'ring-mint', dot: 'bg-mint', hex: 'var(--mint)', raw: '#4D7171' },
}

// ── Permisos por rol ─────────────────────────────────────
// Los prospectos viven dentro de Eventos (vista "Prospectos"); /prospectos redirige ahí.
export type Section =
  | 'inicio'
  | 'mapa'
  | 'hospedaje'
  | 'limpieza'
  | 'eventos'
  | 'espacios'
  | 'invitados'
  | 'mensajes'
  | 'proveedores'
  | 'tareas'
  | 'finanzas'
  | 'inventario'
  | 'equipo'
  | 'ajustes'

export const ROLE_SECTIONS: Record<Role, Section[]> = {
  admin: ['inicio', 'mapa', 'hospedaje', 'limpieza', 'tareas', 'eventos', 'invitados', 'espacios', 'mensajes', 'proveedores', 'finanzas', 'inventario', 'equipo', 'ajustes'],
  // La Wedding planner no ve el mapa del rancho: solo sus espacios (salón y jardín)
  eventos: ['inicio', 'eventos', 'invitados', 'espacios', 'mensajes', 'tareas', 'proveedores', 'inventario', 'ajustes'],
  recepcion: ['inicio', 'hospedaje', 'limpieza', 'mapa', 'tareas', 'ajustes'],
  limpieza: ['inicio', 'limpieza', 'mapa', 'tareas', 'ajustes'],
  mantenimiento: ['inicio', 'tareas', 'mapa', 'limpieza', 'inventario', 'ajustes'],
}

/** Secciones de uso ocasional: van juntas en el grupo plegable "Más" para que el menú no abrume */
export const ROLE_MORE: Record<Role, Section[]> = {
  admin: ['invitados', 'espacios', 'mensajes', 'proveedores'],
  eventos: ['proveedores', 'inventario'],
  recepcion: [],
  limpieza: [],
  mantenimiento: [],
}

export const can = (role: Role | undefined, section: Section) => !!role && ROLE_SECTIONS[role].includes(section)

/** ¿Puede este rol ver dinero (totales, pagos, precios)? */
export const seesMoney = (role: Role | undefined) => role === 'admin' || role === 'eventos' || role === 'recepcion'

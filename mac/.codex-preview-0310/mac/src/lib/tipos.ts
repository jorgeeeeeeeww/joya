// Lo que devuelve la nube (funciones hosp_* de supabase/migrations/20261105000000_hospedaje.sql)

export type ISODate = string // 'YYYY-MM-DD'
export type Estado = 'solicitud' | 'confirmada' | 'pagada' | 'cancelada'
export type Origen = 'web' | 'telefono' | 'whatsapp' | 'directo'
export type MetodoPago = 'transferencia' | 'efectivo' | 'tarjeta' | 'mercadopago' | 'otro'

export interface Foto {
  ruta: string
  ancho?: number
  alto?: number
  alt?: string
}

/** cabaña, casa amueblada o habitación de hotel */
export type TipoHospedaje = 'cabana' | 'casa' | 'habitacion'

export interface Cabana {
  id: string
  slug: string
  nombre: string
  tipo: TipoHospedaje
  resumen: string | null
  descripcion: string | null
  capacidad: number
  recamaras: number | null
  camas: string | null
  banos: number | null
  amenidades: string[]
  fotos: Foto[]
  precio_noche: number | null
  precio_fin_semana: number | null
  huespedes_incluidos: number | null
  precio_huesped_extra: number | null
  noches_minimas: number | null
  publicada: boolean
  orden: number
  notas: string | null
}

export interface Temporada {
  id: string
  cabana_id: string
  nombre: string
  desde: ISODate
  hasta: ISODate
  precio_noche: number
  noches_minimas: number | null
}

export interface Bloqueo {
  id: string
  cabana_id: string
  inicio: ISODate
  fin: ISODate
  motivo: string | null
}

export interface Reservacion {
  id: string
  codigo: string
  cabana_id: string
  llegada: ISODate
  salida: ISODate
  huespedes: number
  nombre: string
  telefono: string | null
  correo: string | null
  hora_llegada: string | null
  comentarios: string | null
  origen: Origen
  estado: Estado
  total: number
  anticipo: number
  pagado: number
  vence: string | null
  motivo_cancelacion: 'huesped' | 'rancho' | 'vencida' | null
  notas: string | null
  creada: string
  confirmada_en: string | null
  pagada_en: string | null
  cancelada_en: string | null
}

export interface Pago {
  id: string
  reservacion_id: string
  monto: number
  metodo: MetodoPago
  fecha: ISODate
  referencia: string | null
  creado: string
}

export interface EventoReservacion {
  creado: string
  tipo: string
  detalle: string
}

export interface Detalle extends Reservacion {
  cabana: string
  liga: string | null
  desglose: { fecha: ISODate; precio: number; tipo: 'normal' | 'fin_semana' | 'temporada'; temporada: string | null }[]
  pagos: Pago[]
  eventos: EventoReservacion[]
}

export interface Ajustes {
  reservas_web: boolean
  telefono_salon: string | null
  telefono_hospedaje: string | null
  correo_avisos: string | null
  url_web: string | null
  hora_llegada: string | null
  hora_salida: string | null
  anticipo_pct: number
  horas_apartado: number
  noches_minimas: number
  noches_fin_semana: number[]
  dias_anticipacion: number
  banco: string | null
  clabe: string | null
  titular: string | null
  politicas: string | null
  aviso_privacidad: string | null
}

export interface Datos {
  hoy: ISODate
  ahora: string
  desde: ISODate
  hasta: ISODate
  es_admin: boolean
  ajustes: Ajustes
  cabanas: Cabana[]
  temporadas: Temporada[]
  reservaciones: Reservacion[]
  bloqueos: Bloqueo[]
  avisos_sin_enviar: number
}

export interface Cotizacion {
  ok: boolean
  motivo?: string
  mensaje?: string
  noches?: number
  total?: number
  anticipo?: number
  extra?: number
  minimo_noches?: number
  cumple_minimo?: boolean
  disponible?: boolean
  desglose?: Detalle['desglose']
}

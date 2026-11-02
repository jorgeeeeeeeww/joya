import type { ChecklistItem, UnitKind } from './types'
import { uid } from './format'

const CLEAN_COMMON = [
  'Retirar blancos y toallas usadas',
  'Tender camas con blancos limpios',
  'Toallas limpias (2 por huésped)',
  'Limpiar y desinfectar baño y regadera',
  'Reponer papel, jabón y shampoo',
  'Barrer y trapear pisos',
  'Sacudir muebles y superficies',
  'Sacar basura y poner bolsa nueva',
  'Revisar focos, clima y control de TV',
  'Revisar objetos olvidados',
  'Ventilar y aromatizar',
]

const CLEAN_CABANA = ['Limpiar cocineta y cafetera', 'Reponer café y azúcar']
const CLEAN_CASA = ['Lavar trastes y revisar cocina', 'Vaciar y limpiar refrigerador', 'Limpiar ventanas y cancel', 'Barrer terraza y revisar asador']

export function cleaningChecklist(kind: UnitKind): ChecklistItem[] {
  const items = [...CLEAN_COMMON.slice(0, 7), ...(kind === 'casa' ? CLEAN_CASA : CLEAN_CABANA), ...CLEAN_COMMON.slice(7)]
  return items.map((text) => ({ id: uid('chk_'), text, done: false }))
}

/** Insumos que se descuentan del inventario en cada limpieza terminada */
export const CLEANING_CONSUMPTION: Record<UnitKind, { itemId: string; qty: number }[]> = {
  cabana: [
    { itemId: 'inv_papel', qty: 2 },
    { itemId: 'inv_jabon', qty: 2 },
    { itemId: 'inv_shampoo', qty: 1 },
    { itemId: 'inv_bolsas', qty: 2 },
    { itemId: 'inv_cafe', qty: 1 },
  ],
  casa: [
    { itemId: 'inv_papel', qty: 4 },
    { itemId: 'inv_jabon', qty: 3 },
    { itemId: 'inv_shampoo', qty: 2 },
    { itemId: 'inv_bolsas', qty: 3 },
    { itemId: 'inv_lavatrastes', qty: 1 },
  ],
}

export const EVENT_CHECKLIST_BASE = [
  'Firmar contrato',
  'Recibir anticipo',
  'Definir menú y degustación',
  'Confirmar proveedores (DJ, banquete, decoración)',
  'Plano de mesas aprobado por el cliente',
  'Confirmar número final de invitados',
  'Liquidación del evento',
  'Montaje verificado',
  'Entrega de depósito en garantía',
]

export function eventChecklist(): ChecklistItem[] {
  return EVENT_CHECKLIST_BASE.map((text) => ({ id: uid('chk_'), text, done: false }))
}

export const DEFAULT_TIMELINE: Record<string, { time: string; title: string; owner?: string }[]> = {
  boda: [
    { time: '16:00', title: 'Llegada de proveedores y montaje final', owner: 'Coordinación' },
    { time: '17:30', title: 'Recepción de invitados', owner: 'Meseros' },
    { time: '18:00', title: 'Ceremonia civil / religiosa', owner: 'Coordinación' },
    { time: '19:00', title: 'Entrada de los novios', owner: 'DJ' },
    { time: '19:30', title: 'Primer baile', owner: 'DJ' },
    { time: '20:00', title: 'Servicio de cena', owner: 'Banquete' },
    { time: '21:30', title: 'Brindis y pastel', owner: 'Coordinación' },
    { time: '22:00', title: 'Apertura de pista', owner: 'DJ' },
    { time: '02:00', title: 'Cierre del evento', owner: 'Coordinación' },
  ],
  xv: [
    { time: '17:00', title: 'Montaje final y prueba de sonido', owner: 'DJ' },
    { time: '18:30', title: 'Recepción de invitados', owner: 'Meseros' },
    { time: '19:30', title: 'Entrada de la quinceañera', owner: 'DJ' },
    { time: '19:45', title: 'Vals y baile sorpresa', owner: 'Coreógrafo' },
    { time: '20:30', title: 'Cena', owner: 'Banquete' },
    { time: '21:30', title: 'Brindis y pastel', owner: 'Coordinación' },
    { time: '22:00', title: 'Pista abierta', owner: 'DJ' },
    { time: '01:00', title: 'Cierre', owner: 'Coordinación' },
  ],
  default: [
    { time: '15:00', title: 'Montaje y decoración', owner: 'Coordinación' },
    { time: '16:30', title: 'Recepción de invitados', owner: 'Meseros' },
    { time: '17:30', title: 'Programa principal', owner: 'Cliente' },
    { time: '18:30', title: 'Servicio de alimentos', owner: 'Banquete' },
    { time: '20:00', title: 'Pastel / convivio', owner: 'Coordinación' },
    { time: '22:00', title: 'Cierre del evento', owner: 'Coordinación' },
  ],
}

export interface EventPackage {
  id: string
  name: string
  perPerson: number
  description: string
  includes: string[]
  tone: 'lavender' | 'rose' | 'butter'
}

export const EVENT_PACKAGES: EventPackage[] = [
  {
    id: 'esencial',
    name: 'Esencial',
    perPerson: 290,
    description: 'Renta del espacio con mobiliario básico',
    includes: ['Renta 7 horas', 'Mesas y sillas', 'Mantelería básica', 'Limpieza', 'Estacionamiento'],
    tone: 'butter',
  },
  {
    id: 'clasico',
    name: 'Clásico',
    perPerson: 520,
    description: 'Lo esencial más banquete a 3 tiempos y meseros',
    includes: ['Todo lo Esencial', 'Banquete 3 tiempos', 'Meseros (1 por cada 25)', 'Sillas Tiffany', 'Pista iluminada'],
    tone: 'lavender',
  },
  {
    id: 'joya',
    name: 'Joya Premium',
    perPerson: 890,
    description: 'Experiencia completa con barra, DJ y decoración',
    includes: ['Todo lo Clásico', 'Barra libre nacional 5 h', 'DJ e iluminación', 'Centros de mesa', 'Coordinador del evento'],
    tone: 'rose',
  },
]

export const EXTRAS_CATALOG: { concept: string; category: string; price: number; perGuest?: boolean }[] = [
  { concept: 'Hora extra', category: 'Espacio', price: 4500 },
  { concept: 'DJ y audio profesional', category: 'Entretenimiento', price: 9500 },
  { concept: 'Pista de baile iluminada', category: 'Entretenimiento', price: 6500 },
  { concept: 'Photobooth', category: 'Entretenimiento', price: 4800 },
  { concept: 'Barra libre nacional', category: 'Bebidas', price: 180, perGuest: true },
  { concept: 'Mesa de dulces', category: 'Alimentos', price: 5500 },
  { concept: 'Taquiza adicional', category: 'Alimentos', price: 95, perGuest: true },
  { concept: 'Pastel', category: 'Alimentos', price: 3800 },
  { concept: 'Centros de mesa florales', category: 'Decoración', price: 650 },
  { concept: 'Arco floral para ceremonia', category: 'Decoración', price: 7500 },
  { concept: 'Sillas Tiffany', category: 'Mobiliario', price: 35 },
  { concept: 'Lounge (sala)', category: 'Mobiliario', price: 3500 },
  { concept: 'Carpa para jardín', category: 'Mobiliario', price: 12000 },
  { concept: 'Planta de luz', category: 'Servicios', price: 5200 },
  { concept: 'Seguridad', category: 'Servicios', price: 2800 },
  { concept: 'Depósito en garantía (reembolsable)', category: 'Garantía', price: 5000 },
]

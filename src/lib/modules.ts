// Módulos de un evento: cada evento usa solo lo que necesita (una junta de empresa no lleva lista de invitados
// ni tablero de inspiración). Lo apagado desaparece de sus pestañas y no cuenta en la salud ni en la ruta.
import type { EventType, RanchEvent } from './types'

export type EventModule = 'invitados' | 'plano' | 'cotizacion' | 'pagos' | 'presupuesto' | 'inspiracion' | 'programa' | 'beo' | 'proveedores' | 'checklist'

export const MODULES: { id: EventModule; label: string; help: string; money?: boolean }[] = [
  { id: 'invitados', label: 'Lista de invitados', help: 'Nombres, confirmaciones por WhatsApp y recepción en la puerta.' },
  { id: 'plano', label: 'Plano de mesas', help: 'Acomodo de mesas en el salón o jardín y dónde se sienta cada quien.' },
  { id: 'cotizacion', label: 'Cotización', help: 'Paquete, extras y total para el cliente.', money: true },
  { id: 'pagos', label: 'Plan de pagos', help: 'Anticipo, abonos y liquidación con fechas; avisa lo vencido.', money: true },
  { id: 'presupuesto', label: 'Presupuesto del cliente', help: 'Cuánto quiere gastar el cliente y en qué.', money: true },
  { id: 'programa', label: 'Programa del día', help: 'La hora de cada momento: llegada, ceremonia, cena, vals…' },
  { id: 'beo', label: 'Orden de evento', help: 'La hoja para cocina y montaje: menú, horarios y notas.' },
  { id: 'proveedores', label: 'Proveedores', help: 'Banquete, música, flores, foto: quién viene y cuándo.' },
  { id: 'checklist', label: 'Pendientes', help: 'La lista de tareas para que no se olvide nada.' },
  { id: 'inspiracion', label: 'Inspiración', help: 'Colores, temática y fotos de referencia del cliente.' },
]

const ALL: Record<EventModule, boolean> = { invitados: true, plano: true, cotizacion: true, pagos: true, presupuesto: true, inspiracion: true, programa: true, beo: true, proveedores: true, checklist: true }

/** Lo que viene prendido según el tipo de evento */
export function defaultModules(type: EventType): Record<EventModule, boolean> {
  switch (type) {
    case 'empresarial':
      return { ...ALL, invitados: false, inspiracion: false, presupuesto: false }
    case 'cumpleanos':
    case 'baby-shower':
    case 'graduacion':
    case 'otro':
      return { ...ALL, inspiracion: false, presupuesto: false }
    case 'bautizo':
    case 'primera-comunion':
      return { ...ALL, presupuesto: false }
    default:
      return ALL
  }
}

export function modulesOf(ev: Pick<RanchEvent, 'type' | 'modules'>): Record<EventModule, boolean> {
  return { ...defaultModules(ev.type), ...(ev.modules ?? {}) }
}

export const hasModule = (ev: Pick<RanchEvent, 'type' | 'modules'>, m: EventModule) => modulesOf(ev)[m]

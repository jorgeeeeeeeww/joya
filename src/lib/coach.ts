// Asistente del wedding planner: ubica en qué fase va cada evento, qué está hecho, qué se atrasó
// y cuál es el siguiente paso. Todo se deduce de lo que ya se captura (no pide datos nuevos):
// etapa, fecha, pagos, firmas, checklist, invitados, plano, proveedores, programa e inspiración.
import type { ISODate, RanchEvent } from './types'
import { modulesOf, type EventModule } from './modules'
import { addDaysISO, daysUntil, fmtDate, mxn, today } from './format'
import { pendingInstallments } from './planner'
import { layoutStats } from './floorplan'
import { rsvpOf } from '@/components/messages/outbox'

/** Pestañas del detalle del evento a las que el asistente puede llevar */
export type EventTab = 'resumen' | EventModule

export interface CoachGo {
  label: string
  /** Pestaña dentro del evento */
  tab?: EventTab
  /** O una pantalla de la app */
  to?: string
}

export type StepState = 'done' | 'todo' | 'late'
export interface CoachStep {
  key: string
  label: string
  /** Cómo se hace, en una frase y con los nombres de los botones */
  how: string
  state: StepState
  go?: CoachGo
  /** Lo que, si no se hace, pone en riesgo el evento */
  critical?: boolean
}

export type PhaseKey = 'contacto' | 'propuesta' | 'apartado' | 'diseno' | 'proveedores' | 'invitados' | 'afinacion' | 'semana' | 'dia' | 'cierre'
export type PhaseState = 'done' | 'now' | 'next'

export interface CoachPhase {
  key: PhaseKey
  n: number
  label: string
  /** Cuándo toca, en palabras ("De 90 a 46 días antes") */
  window: string
  /** Desde qué fecha toca (solo las fases que dependen del calendario) */
  from?: ISODate
  goal: string
  why: string
  tips: string[]
  steps: CoachStep[]
  state: PhaseState
}

export interface Coach {
  phases: CoachPhase[]
  current: CoachPhase
  /** Pasos importantes de fases anteriores que siguen sin hacerse */
  late: CoachStep[]
  /** Lo siguiente que hay que hacer (lo atrasado crítico primero) */
  next?: CoachStep
  /** Fase que sigue después de la actual */
  after?: CoachPhase
  /** Frase corta para el encabezado */
  headline: string
  /** Aviso fuerte (evento cerca y sin confirmar, cancelado…) */
  alert?: string
  /** "la boda", "los XV", "el evento" */
  noun: string
  cancelled: boolean
}

// ── Contexto ─────────────────────────────────────────────
interface Ctx {
  ev: RanchEvent
  paid: number
  total: number
  days: number
  t: ISODate
  mods: Record<EventModule, boolean>
  money: boolean
  conf: number
  pend: number
  all: number
  unseated: number
  seats: number
  need: number
  overdue: number
  balance: number
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const checked = (ev: RanchEvent, word: string) => ev.checklist.some((c) => c.done && norm(c.text).includes(word))
const signed = (ev: RanchEvent, doc: 'contrato' | 'beo') => (ev.signatures ?? []).some((s) => s.document === doc)
const statusAtLeast = (ev: RanchEvent, s: RanchEvent['status']) => {
  const order = ['prospecto', 'cotizado', 'apartado', 'confirmado', 'realizado']
  return order.indexOf(ev.status) >= order.indexOf(s)
}

export function eventNoun(ev: Pick<RanchEvent, 'type'>) {
  return ev.type === 'boda' ? 'la boda' : ev.type === 'xv' ? 'los XV años' : ev.type === 'bautizo' ? 'el bautizo' : ev.type === 'primera-comunion' ? 'la primera comunión' : ev.type === 'aniversario' ? 'el aniversario' : 'el evento'
}
const couple = (ev: RanchEvent) => (ev.type === 'boda' ? 'los novios' : ev.type === 'xv' ? 'la quinceañera y su familia' : 'el cliente')

function buildCtx(ev: RanchEvent, paid: number, total: number, money: boolean, t = today()): Ctx {
  let all = 0
  let conf = 0
  let pend = 0
  let unseated = 0
  for (const g of ev.guestList) {
    const r = rsvpOf(g)
    if (r === 'declinado') continue
    all += g.count
    if (r === 'confirmado') {
      conf += g.count
      if (g.table === undefined || g.table === null) unseated += g.count
    } else pend += g.count
  }
  const pending = pendingInstallments(ev, paid)
  return {
    ev,
    paid,
    total,
    days: daysUntil(ev.date),
    t,
    mods: modulesOf(ev),
    money,
    conf,
    pend,
    all,
    unseated,
    seats: layoutStats(ev.layout).seats,
    need: Math.max(ev.guests, conf),
    overdue: pending.filter((p) => p.due < t).reduce((n, p) => n + p.remaining, 0),
    balance: Math.max(0, total - paid),
  }
}

// ── Catálogo de pasos ────────────────────────────────────
// `applies` decide si el paso tiene sentido para este evento (módulos apagados, quién ve dinero).
// `carry`: si se queda sin hacer, se arrastra como "atrasado" a las fases siguientes.
interface StepDef {
  key: string
  label: (c: Ctx) => string
  how: (c: Ctx) => string
  done: (c: Ctx) => boolean
  applies?: (c: Ctx) => boolean
  go?: (c: Ctx) => CoachGo | undefined
  critical?: boolean
  carry?: boolean
}

const money = (c: Ctx) => c.money && (c.mods.cotizacion || c.mods.pagos)
const guestsUrl = (c: Ctx, v?: string) => `/invitados?e=${c.ev.id}${v ? `&v=${v}` : ''}`

const S: Record<string, StepDef> = {
  datos: {
    key: 'datos',
    label: () => 'Guardar teléfono o correo del cliente',
    how: () => 'Toca el lápiz (Editar evento) arriba a la derecha y escribe su teléfono: con él le mandas cotización, recordatorios y confirmaciones por WhatsApp.',
    done: (c) => !!(c.ev.phone || c.ev.email),
    go: () => ({ label: 'Ir al resumen', tab: 'resumen' }),
    critical: true,
    carry: true,
  },
  presupuesto: {
    key: 'presupuesto',
    label: () => 'Anotar cuánto quiere invertir',
    how: (c) => `En «Cotización y pagos» → «Presupuesto», escribe el presupuesto que te dijeron ${couple(c.ev)}. Así cotizas algo que sí pueden pagar y no pierdes la venta por precio.`,
    done: (c) => (c.ev.clientBudget ?? 0) > 0,
    applies: (c) => c.money && c.mods.presupuesto,
    go: () => ({ label: 'Abrir presupuesto', tab: 'presupuesto' }),
  },
  cotizacion: {
    key: 'cotizacion',
    label: () => 'Armar la cotización',
    how: () => 'En «Cotización y pagos» → «Cotización», elige el paquete y agrega los extras. El total se calcula solo con los precios del rancho.',
    done: (c) => c.ev.lineItems.length > 0,
    applies: (c) => c.money && c.mods.cotizacion,
    go: () => ({ label: 'Armar cotización', tab: 'cotizacion' }),
    critical: true,
  },
  seguimiento: {
    key: 'seguimiento',
    label: (c) => (c.ev.followUpAt && c.ev.followUpAt < c.t ? `Seguimiento vencido desde el ${fmtDate(c.ev.followUpAt)}: escríbele hoy` : 'Agendar el próximo seguimiento'),
    how: () => 'Escríbele por WhatsApp (botón verde de arriba) y en Eventos → «Prospectos» ponle la siguiente fecha de seguimiento (mañana, en 3 días, en una semana). Te aparece en «Tu día» cuando toque.',
    done: (c) => !!c.ev.followUpAt && c.ev.followUpAt >= c.t,
    // Solo mientras se está vendiendo; ya apartado no hay seguimiento de venta
    applies: (c) => c.ev.status === 'prospecto' || c.ev.status === 'cotizado',
    go: () => ({ label: 'Ir a prospectos', to: '/eventos?vista=prospectos' }),
  },
  enviarCotizado: {
    key: 'enviar',
    label: () => 'Enviar la propuesta y marcarla «Cotizado»',
    how: () => 'Mándale la cotización por WhatsApp (botón verde de arriba) y toca la etapa «Cotizado». Así sabes qué prospectos ya tienen precio.',
    done: (c) => statusAtLeast(c.ev, 'cotizado'),
  },
  anticipo: {
    key: 'anticipo',
    label: (c) => (c.paid > 0 ? 'Anticipo recibido' : 'Cobrar el anticipo'),
    how: () => 'En «Cotización y pagos» → «Cotización», toca «Registrar pago», escribe el monto y cómo pagó. Sin anticipo la fecha no está apartada: cualquiera te la puede ganar.',
    done: (c) => c.paid > 0 || checked(c.ev, 'anticipo'),
    applies: money,
    go: () => ({ label: 'Registrar pago', tab: 'cotizacion' }),
    critical: true,
    carry: true,
  },
  plan: {
    key: 'plan',
    label: () => 'Acordar el plan de pagos',
    how: () => 'En «Cotización y pagos» → «Plan de pagos», toca «Generar plan»: reparte el saldo en abonos con fecha. La app te avisa cuando un pago vence.',
    done: (c) => (c.ev.paymentPlan?.length ?? 0) > 0 || (c.total > 0 && c.balance <= 0.5),
    applies: (c) => c.money && c.mods.pagos,
    go: () => ({ label: 'Generar plan', tab: 'pagos' }),
    carry: true,
  },
  contrato: {
    key: 'contrato',
    label: () => 'Firmar el contrato',
    how: () => 'En «Día del evento» → «Orden de evento», toca «Firmar», elige «Contrato» y que firme en la pantalla. Protege al rancho y al cliente: fecha, precio, horarios y políticas.',
    done: (c) => signed(c.ev, 'contrato') || checked(c.ev, 'contrato'),
    applies: (c) => c.mods.beo || c.mods.checklist,
    go: (c) => (c.mods.beo ? { label: 'Firmar contrato', tab: 'beo' } : { label: 'Abrir checklist', tab: 'checklist' }),
    critical: true,
    carry: true,
  },
  coordinador: {
    key: 'coordinador',
    label: () => 'Asignar quién coordina',
    how: () => 'Toca el lápiz (Editar evento) y elige la persona en «Coordinación». Un solo responsable evita que algo se quede «en el aire».',
    done: (c) => !!c.ev.coordinatorId,
    go: () => ({ label: 'Ir al resumen', tab: 'resumen' }),
    carry: true,
  },
  confirmar: {
    key: 'confirmar',
    label: () => 'Pasar el evento a «Confirmado»',
    how: () => 'Con anticipo y contrato, toca la etapa «Confirmado». La app arma sola el plan de trabajo del equipo: menú, invitados, montaje y desmontaje.',
    done: (c) => statusAtLeast(c.ev, 'confirmado'),
    critical: true,
  },
  tematica: {
    key: 'tematica',
    label: () => 'Definir temática y paleta de colores',
    how: () => 'En «Inspiración», escribe la temática y elige la paleta (hay paletas sugeridas). Todo lo demás —flores, mantelería, pastel, invitaciones— se decide a partir de aquí.',
    done: (c) => !!c.ev.theme?.trim() || (c.ev.palette?.length ?? 0) > 0,
    applies: (c) => c.mods.inspiracion,
    go: () => ({ label: 'Abrir inspiración', tab: 'inspiracion' }),
  },
  referencias: {
    key: 'referencias',
    label: () => 'Guardar fotos y notas de lo que les gusta',
    how: (c) => `En «Inspiración», sube fotos de referencia y anota lo que ${couple(c.ev)} sí y no quieren. Evita malentendidos con los proveedores.`,
    done: (c) => (c.ev.inspirationPhotoIds?.length ?? 0) > 0 || !!c.ev.moodNotes?.trim(),
    applies: (c) => c.mods.inspiracion,
    go: () => ({ label: 'Abrir inspiración', tab: 'inspiracion' }),
  },
  proveedoresClave: {
    key: 'proveedores-clave',
    label: () => 'Elegir los proveedores clave',
    how: () => 'En «Proveedores», toca «Asignar proveedor» desde tu directorio. Primero los que se agotan: banquete, foto y video, música; luego flores, pastel y mobiliario.',
    done: (c) => c.ev.providers.length > 0 || (c.ev.vendorIds?.length ?? 0) > 0,
    applies: (c) => c.mods.proveedores,
    go: () => ({ label: 'Abrir proveedores', tab: 'proveedores' }),
    carry: true,
  },
  proveedoresConf: {
    key: 'proveedores-conf',
    label: (c) => {
      const n = c.ev.providers.filter((p) => !p.confirmed).length
      return n ? `Confirmar ${n} ${n === 1 ? 'proveedor' : 'proveedores'}` : 'Proveedores confirmados'
    },
    how: () => 'En «Proveedores», márcalos como confirmados cuando te den su «sí» por escrito, con hora de llegada y montaje. Uno sin confirmar es el riesgo número uno del día.',
    done: (c) => c.ev.providers.length > 0 && c.ev.providers.every((p) => p.confirmed),
    applies: (c) => c.mods.proveedores,
    go: () => ({ label: 'Abrir proveedores', tab: 'proveedores' }),
    critical: true,
    carry: true,
  },
  menu: {
    key: 'menu',
    label: () => 'Definir el menú (y la degustación)',
    how: (c) => (c.mods.beo ? 'En «Día del evento» → «Orden de evento», escribe el menú: entrada, plato fuerte, postre y bebidas. Agenda la degustación con el banquete.' : 'Marca «Definir menú y degustación» en el checklist cuando quede listo.'),
    done: (c) => !!c.ev.menu?.trim() || checked(c.ev, 'menu'),
    applies: (c) => c.mods.beo || c.mods.checklist,
    go: (c) => (c.mods.beo ? { label: 'Escribir menú', tab: 'beo' } : { label: 'Abrir checklist', tab: 'checklist' }),
    carry: true,
  },
  programa: {
    key: 'programa',
    label: () => 'Hacer el borrador del programa del día',
    how: () => 'En «Día del evento» → «Programa», agrega los momentos con hora: llegada, ceremonia, cóctel, entrada, cena, vals, pastel, fiesta y cierre.',
    done: (c) => c.ev.timeline.length > 0,
    applies: (c) => c.mods.programa,
    go: () => ({ label: 'Abrir programa', tab: 'programa' }),
  },
  lista: {
    key: 'lista',
    label: () => 'Capturar la lista de invitados',
    how: () => 'Abre la estación de invitados y toca «Agregar invitado»: nombre, cuántas personas, lado (novia/novio) y teléfono. Pide la lista en una sola hoja a cada familia.',
    done: (c) => c.ev.guestList.length > 0,
    applies: (c) => c.mods.invitados,
    go: (c) => ({ label: 'Abrir invitados', to: guestsUrl(c) }),
    critical: true,
    carry: true,
  },
  invitaciones: {
    key: 'invitaciones',
    label: () => 'Enviar las invitaciones',
    how: () => 'Desde la estación de invitados manda la invitación por WhatsApp a cada familia. Lo ideal: 6 a 8 semanas antes (antes si hay invitados de fuera).',
    done: (c) => c.ev.guestList.some((g) => g.invitedAt),
    applies: (c) => c.mods.invitados && c.ev.guestList.length > 0,
    go: (c) => ({ label: 'Enviar invitaciones', to: guestsUrl(c, 'confirmar') }),
    carry: true,
  },
  confirmaciones: {
    key: 'confirmaciones',
    label: (c) => (c.all ? `Confirmaciones: ${Math.round((c.conf / c.all) * 100)}% (meta 90%)` : 'Recibir confirmaciones'),
    how: () => 'En «Confirmar», desliza a la derecha quien sí viene y a la izquierda quien no. A los pendientes mándales recordatorio por WhatsApp.',
    done: (c) => c.all > 0 && (c.conf / c.all >= 0.9 || c.pend === 0),
    applies: (c) => c.mods.invitados && c.ev.guestList.length > 0,
    go: (c) => ({ label: 'Confirmar invitados', to: guestsUrl(c, 'confirmar') }),
    critical: true,
    carry: true,
  },
  plano: {
    key: 'plano',
    label: (c) => (c.seats >= c.need ? `Plano con ${c.seats} lugares` : c.seats ? `Faltan ${c.need - c.seats} lugares en el plano` : 'Armar el plano de mesas'),
    how: () => 'En «Plano de mesas» acomoda mesas, pista, escenario y barra. Toca una mesa para cambiar sus sillas. Deja pasillos de servicio de al menos 1.2 m.',
    done: (c) => c.seats > 0 && c.seats >= c.need,
    applies: (c) => c.mods.plano,
    go: () => ({ label: 'Abrir plano', tab: 'plano' }),
    critical: true,
    carry: true,
  },
  sentar: {
    key: 'sentar',
    label: (c) => (c.unseated ? `Sentar a ${c.unseated} confirmados sin mesa` : 'Invitados acomodados en mesas'),
    how: () => 'En Invitados → «Mesas», arrastra a cada invitado a su mesa o toca «Acomodar automáticamente»: deja familias juntas y VIP cerca de la pista.',
    done: (c) => c.conf > 0 && c.unseated === 0,
    applies: (c) => c.mods.invitados && c.mods.plano && c.ev.guestList.length > 0,
    go: (c) => ({ label: 'Acomodar mesas', to: guestsUrl(c, 'mesas') }),
    carry: true,
  },
  planoOk: {
    key: 'plano-ok',
    label: () => 'Que el cliente apruebe el plano',
    how: () => 'Enséñale el plano (o la vista 3D en «Salón y jardín») y, cuando lo apruebe, marca «Plano de mesas aprobado por el cliente» en el checklist.',
    done: (c) => checked(c.ev, 'plano'),
    applies: (c) => c.mods.plano && c.mods.checklist,
    go: () => ({ label: 'Abrir checklist', tab: 'checklist' }),
  },
  numero: {
    key: 'numero',
    label: () => 'Cerrar el número final de invitados',
    how: () => 'Con las confirmaciones, acuerda el número final y avísale al banquete. Marca «Confirmar número final de invitados» en el checklist. Después de esta fecha ya no se cambia.',
    done: (c) => checked(c.ev, 'numero final'),
    applies: (c) => c.mods.checklist,
    go: () => ({ label: 'Abrir checklist', tab: 'checklist' }),
    critical: true,
    carry: true,
  },
  alCorriente: {
    key: 'al-corriente',
    label: (c) => (c.overdue > 0 ? `Cobrar ${mxn(c.overdue)} vencido` : 'Pagos al corriente'),
    how: () => 'En «Cotización y pagos» registra lo que ya pagaron. Si hay atraso, mándale el recordatorio por WhatsApp hoy: mientras más cerca la fecha, más difícil cobrar.',
    done: (c) => c.overdue <= 0.5,
    applies: money,
    go: () => ({ label: 'Ver pagos', tab: 'pagos' }),
    critical: true,
  },
  liquidacion: {
    key: 'liquidacion',
    label: (c) => (c.balance > 0.5 ? `Liquidar el saldo de ${mxn(c.balance)}` : 'Evento liquidado'),
    how: () => 'El saldo se cobra antes del evento (lo normal: 7 a 15 días antes). Regístralo en «Cotización y pagos» → «Registrar pago».',
    done: (c) => (c.total > 0 && c.balance <= 0.5) || checked(c.ev, 'liquidacion'),
    applies: money,
    go: () => ({ label: 'Registrar pago', tab: 'cotizacion' }),
    critical: true,
    carry: true,
  },
  beo: {
    key: 'beo',
    label: () => 'Firmar la orden de evento',
    how: () => 'En «Día del evento» → «Orden de evento» revisa menú, horarios y montaje, y toca «Firmar». Es la hoja que siguen cocina y montaje: lo que no está ahí, no existe.',
    done: (c) => signed(c.ev, 'beo'),
    applies: (c) => c.mods.beo,
    go: () => ({ label: 'Abrir orden de evento', tab: 'beo' }),
    critical: true,
    carry: true,
  },
  programaFinal: {
    key: 'programa-final',
    label: () => 'Dejar el programa completo con responsables',
    how: () => 'En «Programa», cada momento con hora y quién lo dirige. Compártelo con proveedores y familia el mismo día que lo cierres.',
    done: (c) => c.ev.timeline.length >= 5,
    applies: (c) => c.mods.programa,
    go: () => ({ label: 'Abrir programa', tab: 'programa' }),
  },
  montaje: {
    key: 'montaje',
    label: () => 'Verificar el montaje',
    how: () => 'Un día antes recorre el salón o jardín con el plano en la mano: mesas, mantelería, sonido, luz y baños. Marca «Montaje verificado» en el checklist.',
    done: (c) => checked(c.ev, 'montaje'),
    applies: (c) => c.mods.checklist && c.days <= 1,
    go: () => ({ label: 'Abrir checklist', tab: 'checklist' }),
    critical: true,
  },
  enVivo: {
    key: 'en-vivo',
    label: () => 'Llevar el programa en vivo',
    how: () => 'En «Programa» marca cada momento al terminar; la pantalla no se apaga. Tú das las entradas: música, fotógrafo y meseros siguen tu señal.',
    done: (c) => c.ev.timeline.some((x) => x.done),
    applies: (c) => c.mods.programa && c.ev.timeline.length > 0,
    go: () => ({ label: 'Abrir programa', tab: 'programa' }),
  },
  puerta: {
    key: 'puerta',
    label: () => 'Recibir invitados en la puerta',
    how: () => 'En Invitados → «Recepción», marca quién llega y dile en qué mesa va. Quien no esté en la lista se registra ahí mismo.',
    done: (c) => c.ev.guestList.some((g) => g.arrived),
    applies: (c) => c.mods.invitados && c.ev.guestList.length > 0,
    go: (c) => ({ label: 'Abrir recepción', to: guestsUrl(c, 'puerta') }),
  },
  realizado: {
    key: 'realizado',
    label: () => 'Marcar el evento como «Realizado»',
    how: () => 'Toca la etapa «Realizado». Así cuenta en los reportes del dueño y deja libre tu lista de pendientes.',
    done: (c) => c.ev.status === 'realizado',
  },
  deposito: {
    key: 'deposito',
    label: () => 'Revisar daños y regresar el depósito en garantía',
    how: () => 'Revisa el lugar con mantenimiento. Si todo está bien, regresa el depósito y marca «Entrega de depósito en garantía» en el checklist.',
    done: (c) => checked(c.ev, 'deposito'),
    applies: (c) => c.mods.checklist,
    go: () => ({ label: 'Abrir checklist', tab: 'checklist' }),
  },
}

// ── Fases ────────────────────────────────────────────────
interface PhaseDef {
  key: PhaseKey
  label: string
  window: string
  /** Días antes del evento en que empieza (solo fases de calendario) */
  startDays?: number
  goal: (noun: string) => string
  why: string
  tips: string[]
  steps: StepDef[]
}

const PHASES: PhaseDef[] = [
  {
    key: 'contacto',
    label: 'Primer contacto',
    window: 'En cuanto llega la solicitud',
    goal: (n) => `Entender qué sueñan para ${n}, cuántos serán, cuánto quieren invertir y si la fecha está libre.`,
    why: 'La primera agencia que contesta, escucha y propone una visita suele quedarse con el evento.',
    tips: [
      'Contesta en menos de 2 horas, aunque sea para agendar una llamada.',
      'Pregunta siempre tres cosas: fecha soñada, número de invitados y presupuesto aproximado. Sin eso no cotices a ciegas.',
      'Invítalos a conocer el rancho a la hora del evento: la luz del atardecer vende sola.',
      'Si su sábado está ocupado, ofrece de inmediato el viernes o domingo, o el sábado siguiente.',
    ],
    steps: [S.datos!, S.presupuesto!, S.cotizacion!, S.seguimiento!],
  },
  {
    key: 'propuesta',
    label: 'Propuesta y seguimiento',
    window: 'Después de cotizar',
    goal: () => 'Que reciban una propuesta clara y que tú lleves el seguimiento hasta el «sí».',
    why: 'La mayoría de las ventas se cierran entre el segundo y el cuarto seguimiento.',
    tips: [
      'Sigue a las 48 horas, a la semana y a las dos semanas. Después de tres sin respuesta, márcalo y pasa al siguiente.',
      'Habla de lo que incluye y de la experiencia, no solo del precio.',
      'Un anticipo pequeño con fecha límite ayuda a decidir: «la fecha la aparto con el anticipo».',
    ],
    steps: [S.cotizacion!, S.enviarCotizado!, S.seguimiento!],
  },
  {
    key: 'apartado',
    label: 'Apartar la fecha',
    window: 'Al decir que sí',
    goal: (n) => `Asegurar ${n}: anticipo, contrato firmado, plan de pagos y una persona responsable.`,
    why: 'Sin anticipo y contrato no hay fecha apartada. Es lo que protege al rancho y al cliente.',
    tips: [
      'Cobra el anticipo el mismo día que dicen que sí; la emoción baja en pocos días.',
      'El plan de pagos debe liquidar antes del evento, nunca el mismo día.',
      'Explica las políticas (cambios de fecha, cancelación, horario límite) antes de firmar, no después.',
    ],
    steps: [S.anticipo!, S.contrato!, S.plan!, S.coordinador!, S.confirmar!],
  },
  {
    key: 'diseno',
    label: 'Diseño y concepto',
    window: 'Más de 90 días antes',
    goal: (n) => `Definir cómo se va a ver y sentir ${n}, y reservar a los proveedores que se agotan primero.`,
    why: 'Los mejores proveedores se apartan con meses de anticipación; el concepto guía todas las demás decisiones.',
    tips: [
      'Una sola paleta de 3 a 5 colores: todo lo demás se elige a partir de ella.',
      'Reserva primero banquete, foto y video y música; las flores y el pastel pueden esperar.',
      'Guarda en «Inspiración» lo que NO les gusta: evita sorpresas el día del evento.',
    ],
    steps: [S.tematica!, S.referencias!, S.presupuesto!, S.proveedoresClave!],
  },
  {
    key: 'proveedores',
    label: 'Proveedores y menú',
    window: 'De 90 a 46 días antes',
    startDays: 90,
    goal: () => 'Cerrar a todos los proveedores, el menú y el primer borrador del programa.',
    why: 'Con proveedores y menú cerrados, el resto de la planeación ya no tiene sorpresas caras.',
    tips: [
      'Pide a cada proveedor su confirmación por escrito con hora de llegada y montaje.',
      'Agenda la degustación con el banquete y anota alergias y menús especiales.',
      'El programa empieza por la hora de la ceremonia y se arma hacia adelante.',
    ],
    steps: [S.proveedoresClave!, S.proveedoresConf!, S.menu!, S.programa!],
  },
  {
    key: 'invitados',
    label: 'Invitados e invitaciones',
    window: 'De 45 a 31 días antes',
    startDays: 45,
    goal: () => 'Tener la lista completa, mandar las invitaciones y empezar a recibir confirmaciones.',
    why: 'De las confirmaciones dependen el plano, el banquete y el número final.',
    tips: [
      'Pide la lista a cada familia en un solo formato y con teléfono.',
      'Pon fecha límite para confirmar (2 a 3 semanas antes del evento).',
      'Marca VIP a padres, padrinos y abuelos: el acomodo automático los deja cerca de la pista.',
    ],
    steps: [S.lista!, S.invitaciones!, S.confirmaciones!],
  },
  {
    key: 'afinacion',
    label: 'Afinar detalles',
    window: 'De 30 a 8 días antes',
    startDays: 30,
    goal: () => 'Cerrar confirmaciones, plano de mesas, número final y poner los pagos al corriente.',
    why: 'Es la fase donde más cosas se cruzan; un pendiente aquí se convierte en problema el día del evento.',
    tips: [
      'Recordatorio por WhatsApp a quien no ha confirmado, una sola vez y con fecha límite.',
      'Revisa el plano con el cliente en pantalla (o en 3D) y que te lo apruebe.',
      'El número final se le da al banquete por escrito; después ya no se cambia.',
    ],
    steps: [S.confirmaciones!, S.plano!, S.sentar!, S.planoOk!, S.numero!, S.alCorriente!],
  },
  {
    key: 'semana',
    label: 'Semana del evento',
    window: 'De 7 a 1 día antes',
    startDays: 7,
    goal: () => 'Liquidar, firmar la orden de evento, reconfirmar a todos los proveedores y verificar el montaje.',
    why: 'Esta semana se ejecuta lo planeado; ya no se planea nada nuevo.',
    tips: [
      'Llama (no solo escribas) a cada proveedor para reconfirmar hora y lugar.',
      'Imprime o guarda la orden de evento y el plano para cocina, montaje y capitán de meseros.',
      'Prepara un kit de emergencia: costura, cinta, encendedor, curitas, cargadores.',
    ],
    steps: [S.liquidacion!, S.beo!, S.proveedoresConf!, S.programaFinal!, S.montaje!],
  },
  {
    key: 'dia',
    label: 'Día del evento',
    window: 'El día del evento',
    startDays: 0,
    goal: (n) => `Que ${n} salga como se planeó y que el cliente solo disfrute.`,
    why: 'Tú eres quien da las entradas: música, fotógrafo y meseros siguen tu señal.',
    tips: [
      'Llega antes que todos los proveedores y recíbelos con el plano.',
      'Ten a la mano el teléfono de cada proveedor y del responsable de la familia.',
      'Si algo falla, se resuelve sin que el cliente se entere.',
    ],
    steps: [S.enVivo!, S.puerta!],
  },
  {
    key: 'cierre',
    label: 'Cierre y agradecimiento',
    window: 'Después del evento',
    goal: () => 'Cerrar cuentas, revisar el lugar y convertir al cliente en tu mejor recomendación.',
    why: 'Las recomendaciones de clientes felices son la venta más barata del rancho.',
    tips: [
      'Escríbele 2 o 3 días después para agradecer y pedir una reseña con fotos.',
      'Pregunta qué mejorarías: es la mejor capacitación para el equipo.',
      'Comparte las fotos (con permiso) en redes; etiqueta a los proveedores.',
    ],
    steps: [S.realizado!, S.liquidacion!, S.deposito!],
  },
]

function pickPhase(c: Ctx): PhaseKey {
  const { ev, days } = c
  if (ev.status === 'realizado' || days < 0) return 'cierre'
  if (days === 0) return 'dia'
  if (ev.status === 'prospecto') return 'contacto'
  if (ev.status === 'cotizado') return 'propuesta'
  if (ev.status === 'apartado') return 'apartado'
  if (days <= 7) return 'semana'
  if (days <= 30) return 'afinacion'
  if (days <= 45) return 'invitados'
  if (days <= 90) return 'proveedores'
  return 'diseno'
}

/** El asistente de un evento: fase actual, lo hecho, lo atrasado y lo que sigue */
export function eventCoach(ev: RanchEvent, paid: number, total: number, opts: { money: boolean; t?: ISODate }): Coach {
  const c = buildCtx(ev, paid, total, opts.money, opts.t)
  const noun = eventNoun(ev)

  const built = PHASES.map((p) => {
    const steps: CoachStep[] = p.steps
      .filter((s) => !s.applies || s.applies(c))
      .map((s) => ({ key: s.key, label: s.label(c), how: s.how(c), state: s.done(c) ? 'done' : 'todo', go: s.go?.(c), critical: s.critical }))
    return { def: p, steps }
  })
  // Una fase sin pasos que apliquen (p. ej. invitados en una junta de empresa) no se muestra
  const visible = built.filter((b) => b.steps.length > 0 || b.def.key === 'dia' || b.def.key === 'cierre')
  let wanted = pickPhase(c)
  if (!visible.some((b) => b.def.key === wanted)) {
    const order = PHASES.map((p) => p.key)
    const at = order.indexOf(wanted)
    wanted = (visible.find((b) => order.indexOf(b.def.key) > at) ?? visible.at(-1)!).def.key
  }
  const curIdx = visible.findIndex((b) => b.def.key === wanted)

  // Lo importante de fases anteriores que sigue sin hacerse se arrastra como atrasado
  const late: CoachStep[] = []
  const seen = new Set<string>()
  // Ya en el cierre, lo que no se hizo antes deja de ser accionable; el día del evento solo importa lo crítico
  const carryFrom = wanted === 'cierre' ? [] : visible.slice(0, curIdx)
  for (const b of carryFrom) {
    for (const s of b.def.steps) {
      if (wanted === 'dia' && !s.critical) continue
      if (!s.carry || seen.has(s.key) || (s.applies && !s.applies(c)) || s.done(c)) continue
      // Lo que también es paso de la fase actual se muestra ahí, no como atrasado
      if (visible[curIdx]!.def.steps.some((x) => x.key === s.key)) continue
      seen.add(s.key)
      late.push({ key: s.key, label: s.label(c), how: s.how(c), state: 'late', go: s.go?.(c), critical: s.critical })
    }
  }
  late.sort((a, b) => Number(!!b.critical) - Number(!!a.critical))

  const phases: CoachPhase[] = visible.map((b, i) => ({
    key: b.def.key,
    n: i + 1,
    label: b.def.label,
    window: b.def.window,
    from: b.def.startDays !== undefined ? addDaysISO(ev.date, -b.def.startDays) : undefined,
    goal: b.def.goal(noun),
    why: b.def.why,
    tips: b.def.tips,
    // En la fase actual, lo que ya pasó de fecha y sigue pendiente se marca atrasado
    steps: i === curIdx && c.days <= 7 ? b.steps.map((s) => (s.state === 'todo' && s.critical ? { ...s, state: 'late' as const } : s)) : b.steps,
    state: i < curIdx ? 'done' : i === curIdx ? 'now' : 'next',
  }))
  const current = phases[curIdx]!
  const after = phases[curIdx + 1]
  const todoNow = current.steps.filter((s) => s.state !== 'done')
  const next = late.find((s) => s.critical) ?? todoNow.find((s) => s.state === 'late') ?? todoNow.find((s) => s.critical) ?? todoNow[0] ?? late[0]

  const cancelled = ev.status === 'cancelado'
  let alert: string | undefined
  if (cancelled) alert = `Este evento está cancelado. La fecha quedó libre; los pagos registrados se conservan.`
  else if (c.days > 0 && c.days <= 30 && !statusAtLeast(ev, 'confirmado')) alert = `Faltan ${c.days} días y ${noun} sigue como «${ev.status}». Confírmalo o libera la fecha.`
  else if (c.days < 0 && ev.status !== 'realizado') alert = `La fecha ya pasó (${fmtDate(ev.date)}). Márcalo como «Realizado» para cerrar sus cuentas.`
  else if (c.overdue > 0.5) alert = `Hay ${mxn(c.overdue)} vencido en el plan de pagos.`

  const when = c.days > 1 ? `faltan ${c.days} días` : c.days === 1 ? 'es mañana' : c.days === 0 ? 'es hoy' : `fue el ${fmtDate(ev.date)}`
  const headline = cancelled ? `${ev.title} · evento cancelado` : `${ev.title} · ${when}`

  return { phases, current, late, next: cancelled ? undefined : next, after, headline, alert, noun, cancelled }
}

// Datos de demostración realistas, calculados alrededor de la fecha de hoy.
import type {
  DataState,
  Employee,
  Expense,
  Guest,
  InventoryItem,
  Payment,
  RanchEvent,
  Reservation,
  ReservationSource,
  Task,
  Unit,
} from './types'
import { addDaysISO, isWeekendNight, nights, toISODate, today, uid } from './format'
import { hashPin } from './crypto'
import { emptyData } from './store'
import { autoLayout } from './floorplan'
import { cleaningChecklist, DEFAULT_TIMELINE, EVENT_PACKAGES, eventChecklist } from './templates'
import { eventPlanTasks } from './automations'

// Generador pseudoaleatorio determinista (mismos datos en cada instalación)
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GUESTS = [
  'Familia Hernández', 'Andrea Morales', 'Carlos Navarro', 'Sofía Castillo', 'Luis Gutiérrez', 'Daniela Torres',
  'Jorge Ibarra', 'Fernanda Ruiz', 'Miguel Ángel Ramos', 'Paola Jiménez', 'Ricardo Vega', 'Valeria Ortiz',
  'Alejandro Cruz', 'Mariana Flores', 'Eduardo Soto', 'Gabriela Mendoza', 'Óscar Delgado', 'Karla Reyes',
  'Héctor Aguilar', 'Natalia Rivas', 'Roberto Salinas', 'Ximena Herrera', 'Familia Padilla', 'Diego Campos',
]

export function createSeed(): DataState {
  const r = rng(20261101)
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]!
  const data = emptyData()
  const T = today()
  const now = new Date().toISOString()
  const base = { createdAt: now, updatedAt: now }
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

  // ── Equipo ──
  const emps: [string, string, Employee['role'], string, Employee['color']][] = [
    ['e_admin', 'Administración', 'admin', '1234', 'lavender'],
    ['e_lupita', 'Lupita Ramírez', 'eventos', '2222', 'rose'],
    ['e_maria', 'María González', 'limpieza', '3333', 'mint'],
    ['e_carmen', 'Carmen López', 'limpieza', '4444', 'sky'],
    ['e_chuy', 'Jesús “Chuy” Pérez', 'mantenimiento', '5555', 'butter'],
    ['e_ana', 'Ana Torres', 'recepcion', '6666', 'sky'],
  ]
  // Horario semanal de cada persona (0 = domingo … 6 = sábado)
  const week = (days: number[], start: string, end: string) => days.map((day) => ({ day, start, end }))
  const shifts: Record<string, Employee['shifts']> = {
    e_lupita: [...week([2, 3, 4, 5], '10:00', '18:00'), ...week([6], '12:00', '23:00')],
    e_maria: week([1, 2, 3, 4, 5, 6], '08:00', '16:00'),
    e_carmen: week([0, 2, 3, 4, 5, 6], '09:00', '17:00'),
    e_chuy: week([1, 2, 3, 4, 5, 6], '07:00', '15:00'),
    e_ana: week([0, 1, 4, 5, 6], '10:00', '19:00'),
  }
  for (const [id, name, role, pin, color] of emps) {
    data.employees[id] = { ...base, id, name, role, color, pinHash: hashPin(id, pin), active: true, phone: '33' + Math.floor(10000000 + r() * 89999999), shifts: shifts[id] }
  }

  // ── Unidades ──
  const units: Omit<Unit, 'createdAt' | 'updatedAt'>[] = [
    { id: 'u_c1', kind: 'cabana', name: 'Cabaña Jacaranda', short: 'C1', mapId: 'cabana-1', capacity: 4, bedrooms: 1, beds: '1 queen + sofá cama', baths: 1, basePrice: 1450, weekendPrice: 1850, status: 'inspeccion', color: 'lavender', amenities: ['Wi-Fi', 'Aire acondicionado', 'Cocineta', 'Terraza', 'Vista al jardín'], description: 'Cabaña al norte del jardín, junto a la glorieta. Tranquila y con vista a las palmeras.', icalExportToken: uid('ical_') },
    { id: 'u_c2', kind: 'cabana', name: 'Cabaña Agave', short: 'C2', mapId: 'cabana-2', capacity: 4, bedrooms: 1, beds: '1 queen + litera', baths: 1, basePrice: 1450, weekendPrice: 1850, status: 'lista', color: 'sage', amenities: ['Wi-Fi', 'Aire acondicionado', 'Cocineta', 'Asador'], description: 'Cabaña junto al jardín lateral, ideal para familias pequeñas.', icalExportToken: uid('ical_') },
    { id: 'u_c3', kind: 'cabana', name: 'Cabaña Nogal', short: 'C3', mapId: 'cabana-3', capacity: 2, bedrooms: 1, beds: '1 king', baths: 1, basePrice: 1250, weekendPrice: 1650, status: 'ocupada', color: 'peach', amenities: ['Wi-Fi', 'Aire acondicionado', 'Cafetera', 'Tina'], description: 'Cabaña romántica para parejas, la más privada del rancho.', icalExportToken: uid('ical_') },
    { id: 'u_h1', kind: 'casa', name: 'Casa Girasol', short: 'Casa 1', mapId: 'casa-1', capacity: 8, bedrooms: 3, beds: '2 queen + 2 individuales', baths: 2, basePrice: 2900, weekendPrice: 3600, status: 'ocupada', color: 'butter', amenities: ['Wi-Fi', 'Aire acondicionado', 'Cocina equipada', 'Sala', 'Terraza', 'Smart TV'], description: 'La casa más cercana al salón, perfecta para la familia del festejado.', icalExportToken: uid('ical_') },
    { id: 'u_h2', kind: 'casa', name: 'Casa Lavanda', short: 'Casa 2', mapId: 'casa-2', capacity: 6, bedrooms: 2, beds: '2 queen + sofá cama', baths: 2, basePrice: 2400, weekendPrice: 3000, status: 'sucia', color: 'lavender', amenities: ['Wi-Fi', 'Aire acondicionado', 'Cocina equipada', 'Smart TV'], description: 'Casa de dos recámaras con cocina completa.', icalExportToken: uid('ical_') },
    { id: 'u_h3', kind: 'casa', name: 'Casa Magnolia', short: 'Casa 3', mapId: 'casa-3', capacity: 6, bedrooms: 2, beds: '1 king + 2 individuales', baths: 1, basePrice: 2400, weekendPrice: 3000, status: 'limpiando', color: 'rose', amenities: ['Wi-Fi', 'Aire acondicionado', 'Cocina equipada', 'Patio'], description: 'Casa acogedora con patio interior.', icalExportToken: uid('ical_') },
    { id: 'u_h4', kind: 'casa', name: 'Casa Bugambilia', short: 'Casa 4', mapId: 'casa-4', capacity: 10, bedrooms: 3, beds: '3 queen + 2 individuales', baths: 2, basePrice: 3200, weekendPrice: 3900, status: 'ocupada', color: 'rose', amenities: ['Wi-Fi', 'Aire acondicionado', 'Cocina equipada', 'Asador', 'Terraza', 'Smart TV'], description: 'La casa más grande, junto al estacionamiento. Ideal para grupos.', icalExportToken: uid('ical_') },
  ]
  for (const u of units) data.units[u.id] = { ...base, ...u, lastCleanedAt: hoursAgo(20 + r() * 40) }

  const priceFor = (u: (typeof units)[number], checkIn: string, n: number) => {
    let total = 0
    for (let i = 0; i < n; i++) total += isWeekendNight(addDaysISO(checkIn, i)) ? u.weekendPrice : u.basePrice
    return total
  }

  const addPayment = (p: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = uid('pay_')
    data.payments[id] = { ...base, id, ...p }
  }

  const addReservation = (res: Omit<Reservation, 'id' | 'createdAt' | 'updatedAt' | 'total'> & { total?: number }, payFull: boolean, deposit = 0) => {
    const u = units.find((x) => x.id === res.unitId)!
    const id = uid('res_')
    const total = res.total ?? priceFor(u, res.checkIn, nights(res.checkIn, res.checkOut))
    data.reservations[id] = { ...base, ...res, id, total, createdAt: addDaysISO(res.checkIn, -10) + 'T12:00:00.000Z' }
    if (payFull) {
      addPayment({ refType: 'reserva', refId: id, amount: total, method: res.source === 'airbnb' ? 'airbnb' : pick(['transferencia', 'efectivo', 'tarjeta'] as const), date: res.source === 'airbnb' ? addDaysISO(res.checkIn, 1) : res.checkIn, concept: 'Pago de hospedaje' })
    } else if (deposit > 0) {
      addPayment({ refType: 'reserva', refId: id, amount: Math.round(total * deposit), method: 'transferencia', date: addDaysISO(res.checkIn, -7) < T ? addDaysISO(res.checkIn, -7) : T, concept: 'Anticipo' })
    }
    return id
  }

  const sources: ReservationSource[] = ['airbnb', 'airbnb', 'airbnb', 'directo', 'directo', 'whatsapp', 'booking']

  // Historial (últimos 6 meses) y reservas futuras, evitando los días alrededor de hoy
  for (const u of units) {
    let d = addDaysISO(T, -180)
    while (d < addDaysISO(T, 60)) {
      d = addDaysISO(d, 1 + Math.floor(r() * 5))
      const n = 1 + Math.floor(r() * 3)
      const out = addDaysISO(d, n)
      const pastWindow = out <= addDaysISO(T, -3)
      const futureWindow = d >= addDaysISO(T, 3)
      if (!pastWindow && !futureWindow) continue
      const weekendBoost = isWeekendNight(d) ? 0.85 : 0.42
      if (r() > weekendBoost) continue
      const source = pick(sources)
      addReservation(
        {
          unitId: u.id,
          guestName: pick(GUESTS),
          phone: '33' + Math.floor(10000000 + r() * 89999999),
          guests: Math.max(1, Math.round(u.capacity * (0.5 + r() * 0.5))),
          checkIn: d,
          checkOut: out,
          source,
          status: pastWindow ? 'finalizada' : r() > 0.25 ? 'confirmada' : 'pendiente',
          arrivalTime: pastWindow ? undefined : pick(['14:00', '15:00', '16:00', '18:00', '20:00']),
        },
        pastWindow,
        pastWindow ? 0 : source === 'airbnb' ? 0 : 0.5,
      )
      d = out
    }
  }

  // Escenario de HOY (para la demostración)
  addReservation({ unitId: 'u_h1', guestName: 'Familia Hernández', phone: '3312345678', guests: 7, checkIn: addDaysISO(T, -2), checkOut: addDaysISO(T, 1), source: 'airbnb', status: 'en-casa', arrivalTime: '15:00' }, true)
  addReservation({ unitId: 'u_h2', guestName: 'Carlos Navarro', phone: '3398765432', guests: 5, checkIn: addDaysISO(T, -2), checkOut: T, source: 'directo', status: 'finalizada' }, true)
  addReservation({ unitId: 'u_h2', guestName: 'Gabriela Mendoza', phone: '3311223344', guests: 6, checkIn: T, checkOut: addDaysISO(T, 2), source: 'whatsapp', status: 'confirmada', arrivalTime: '17:00' }, false, 0.5)
  addReservation({ unitId: 'u_h3', guestName: 'Óscar Delgado', phone: '3355667788', guests: 4, checkIn: addDaysISO(T, -3), checkOut: addDaysISO(T, -1), source: 'booking', status: 'finalizada' }, true)
  addReservation({ unitId: 'u_h4', guestName: 'Familia Padilla', phone: '3344556677', guests: 9, checkIn: addDaysISO(T, -1), checkOut: addDaysISO(T, 2), source: 'directo', status: 'en-casa', arrivalTime: '16:00' }, false, 0.5)
  addReservation({ unitId: 'u_c1', guestName: 'Natalia Rivas', phone: '3366778899', guests: 2, checkIn: addDaysISO(T, -2), checkOut: T, source: 'airbnb', status: 'finalizada' }, true)
  addReservation({ unitId: 'u_c2', guestName: 'Diego Campos', phone: '3377889900', guests: 3, checkIn: T, checkOut: addDaysISO(T, 2), source: 'airbnb', status: 'confirmada', arrivalTime: '15:00' }, false)
  addReservation({ unitId: 'u_c3', guestName: 'Andrea Morales', phone: '3388990011', guests: 2, checkIn: addDaysISO(T, -1), checkOut: T, source: 'airbnb', status: 'en-casa', arrivalTime: '19:00' }, true)

  // ── Tareas de hoy ──
  const addTask = (t: Partial<Task> & Pick<Task, 'title' | 'type'>) => {
    const id = uid('tsk_')
    data.tasks[id] = { ...base, status: 'pendiente', priority: 'media', checklist: [], photoIds: [], ...t, id } as Task
    return id
  }
  const halfDone = cleaningChecklist('casa').map((c, i) => ({ ...c, done: i < 6 }))
  addTask({ title: 'Limpieza · Casa Lavanda', type: 'limpieza', priority: 'urgente', unitId: 'u_h2', assigneeId: 'e_carmen', due: `${T}T16:00:00`, checklist: cleaningChecklist('casa'), automated: 'Check-out → limpieza', notes: 'Llegan huéspedes a las 17:00' })
  addTask({ title: 'Limpieza · Casa Magnolia', type: 'limpieza', status: 'en-progreso', priority: 'alta', unitId: 'u_h3', assigneeId: 'e_maria', due: `${T}T14:00:00`, checklist: halfDone, startedAt: hoursAgo(1.2), automated: 'Check-out → limpieza' })
  addTask({ title: 'Limpieza · Cabaña Jacaranda', type: 'limpieza', status: 'hecha', priority: 'alta', unitId: 'u_c1', assigneeId: 'e_maria', due: `${T}T13:00:00`, checklist: cleaningChecklist('cabana').map((c) => ({ ...c, done: true })), startedAt: hoursAgo(3), completedAt: hoursAgo(2), automated: 'Check-out → limpieza' })
  addTask({ title: 'Revisar bomba de la fuente', type: 'mantenimiento', priority: 'alta', assigneeId: 'e_chuy', due: `${T}T12:00:00`, checklist: [{ id: uid('chk_'), text: 'Limpiar filtro', done: false }, { id: uid('chk_'), text: 'Revisar presión', done: false }], notes: 'La glorieta tiene poco flujo de agua; antes de los XV años del sábado.' })
  addTask({ title: 'Cambiar foco de la terraza', type: 'mantenimiento', priority: 'media', unitId: 'u_h4', assigneeId: 'e_chuy', due: `${addDaysISO(T, 1)}T10:00:00` })
  addTask({ title: 'Podar cipreses del lindero este', type: 'jardin', priority: 'baja', assigneeId: 'e_chuy', due: `${addDaysISO(T, 3)}T09:00:00` })
  addTask({ title: 'Cortar pasto del jardín de eventos', type: 'jardin', priority: 'alta', assigneeId: 'e_chuy', due: `${addDaysISO(T, 4)}T09:00:00`, notes: 'Antes de los XV años de Valeria' })
  addTask({ title: 'Lavar mantelería del fin de semana', type: 'general', priority: 'media', assigneeId: 'e_carmen', due: `${addDaysISO(T, 1)}T11:00:00` })

  // ── Eventos ──
  // Lista de invitados realista: familias, parejas e individuales, con confirmación, dieta, niños y mesa
  const FIRST = ['Alejandra', 'Roberto', 'Lucía', 'Fernando', 'Mónica', 'Arturo', 'Claudia', 'Javier', 'Rocío', 'Gustavo', 'Patricia', 'Raúl', 'Verónica', 'Sergio', 'Elena', 'Ignacio', 'Daniela', 'Martín', 'Itzel', 'Emilio', 'Regina', 'Tomás', 'Abril', 'Hugo']
  const LAST = ['Ruiz', 'Fernández', 'Gómez', 'Navarro', 'Orozco', 'Padilla', 'Becerra', 'Ramírez', 'Hernández', 'Gutiérrez', 'Medina', 'Aceves', 'Plascencia', 'Íñiguez', 'Barba', 'Gallardo']
  const evGuests = (n: number, sides: string[], tables: number): Guest[] =>
    Array.from({ length: n }, (_, i) => {
      const last = pick(LAST)
      const kind = r()
      const family = kind < 0.35
      const count = family ? 3 + Math.floor(r() * 3) : kind < 0.75 ? 2 : 1
      const kids = family ? Math.floor(r() * 3) : 0
      const roll = r()
      const rsvp: Guest['rsvp'] = roll < 0.68 ? 'confirmado' : roll < 0.9 ? 'pendiente' : 'declinado'
      const name = family ? `Familia ${last} ${pick(LAST)}` : count === 2 ? `${pick(FIRST)} ${last} y pareja` : `${pick(FIRST)} ${last}`
      return {
        id: uid('g_'),
        name,
        count,
        kids,
        rsvp,
        confirmed: rsvp === 'confirmado',
        side: pick(sides),
        group: family ? `Familia ${last}` : undefined,
        phone: '33' + Math.floor(10000000 + r() * 89999999),
        table: rsvp === 'confirmado' && r() < 0.8 ? 1 + (i % tables) : undefined,
        diet: r() < 0.12 ? pick(['Vegetariano', 'Sin gluten', 'Alergia a nueces', 'Vegano']) : undefined,
        vip: i < 3,
        invitedAt: addDaysISO(T, -40) + 'T12:00:00.000Z',
      }
    })

  const addEvent = (ev: Partial<RanchEvent> & Pick<RanchEvent, 'title' | 'type' | 'venue' | 'date' | 'guests' | 'clientName' | 'status'>, paidPct: number, layoutStyle?: 'banquete' | 'imperial' | 'coctel') => {
    const id = uid('evt_')
    const pkg = EVENT_PACKAGES.find((p) => p.id === (ev.packageId ?? 'clasico'))!
    const lineItems = [
      { id: uid('li_'), concept: `Paquete ${pkg.name}`, category: 'Paquete', qty: ev.guests, price: pkg.perPerson },
      ...(ev.lineItems ?? []),
    ]
    const timeline = (DEFAULT_TIMELINE[ev.type] ?? DEFAULT_TIMELINE.default)!.map((t) => ({ ...t, id: uid('tl_'), done: ev.status === 'realizado' }))
    const event: RanchEvent = {
      ...base,
      id,
      startTime: '17:00',
      endTime: '02:00',
      discount: 0,
      includeIva: false,
      layout: layoutStyle ? autoLayout(ev.venue, ev.guests, layoutStyle) : [],
      guestList: [],
      timeline,
      checklist: eventChecklist().map((c, i) => ({ ...c, done: ev.status === 'realizado' || (ev.status === 'confirmado' && i < 4) || (ev.status === 'apartado' && i < 2) })),
      providers: [],
      phone: '33' + Math.floor(10000000 + r() * 89999999),
      coordinatorId: 'e_lupita',
      ...ev,
      lineItems,
      packageId: pkg.id,
    }
    data.events[id] = event
    const total = lineItems.reduce((n, li) => n + li.qty * li.price, 0) - (event.discount || 0)
    if (paidPct > 0) {
      const dep = Math.round(total * Math.min(paidPct, 0.3))
      addPayment({ refType: 'evento', refId: id, amount: dep, method: 'transferencia', date: addDaysISO(ev.date, -60) < T ? addDaysISO(ev.date, -60) : addDaysISO(T, -5), concept: 'Anticipo (apartado de fecha)' })
      if (paidPct > 0.3) {
        const rest = Math.round(total * paidPct) - dep
        addPayment({ refType: 'evento', refId: id, amount: rest, method: pick(['transferencia', 'efectivo'] as const), date: ev.date < T ? ev.date : addDaysISO(T, -2), concept: paidPct >= 1 ? 'Liquidación' : 'Abono' })
      }
    }
    return event
  }

  // Eventos pasados (historial de ingresos)
  const pastTypes: RanchEvent['type'][] = ['boda', 'xv', 'cumpleanos', 'bautizo', 'empresarial', 'primera-comunion', 'graduacion', 'aniversario']
  for (let m = 6; m >= 1; m--) {
    const count = 2 + Math.floor(r() * 3)
    for (let k = 0; k < count; k++) {
      const date = addDaysISO(T, -m * 30 + Math.floor(r() * 26) - 2)
      if (date >= addDaysISO(T, -2)) continue
      const type = pick(pastTypes)
      const guests = 60 + Math.floor(r() * 200)
      const venue = r() > 0.35 ? 'salon' : 'jardin'
      const client = pick(GUESTS).replace('Familia ', '')
      addEvent({ title: `${type === 'boda' ? 'Boda' : type === 'xv' ? 'XV años' : type === 'empresarial' ? 'Evento' : 'Fiesta'} ${client}`, type, venue, date, guests, clientName: client, status: 'realizado', packageId: pick(['esencial', 'clasico', 'clasico', 'joya']) }, 1)
    }
  }

  // Próximos eventos
  const boda = addEvent(
    {
      title: 'Boda Fernández & Ruiz',
      type: 'boda',
      venue: 'salon',
      date: addDaysISO(T, 13),
      startTime: '17:30',
      endTime: '02:30',
      guests: 180,
      clientName: 'Fernanda Ruiz',
      email: 'fernanda.ruiz@example.com',
      status: 'confirmado',
      packageId: 'joya',
      lineItems: [
        { id: uid('li_'), concept: 'Arco floral para ceremonia', category: 'Decoración', qty: 1, price: 7500 },
        { id: uid('li_'), concept: 'Photobooth', category: 'Entretenimiento', qty: 1, price: 4800 },
        { id: uid('li_'), concept: 'Depósito en garantía (reembolsable)', category: 'Garantía', qty: 1, price: 5000 },
      ],
      discount: 8000,
      providers: [
        { id: uid('pr_'), name: 'Banquetes Los Altos', service: 'Banquete 3 tiempos', phone: '3781234567', confirmed: true },
        { id: uid('pr_'), name: 'DJ Neón', service: 'Audio e iluminación', phone: '3329876543', confirmed: true },
        { id: uid('pr_'), name: 'Flores Valentina', service: 'Decoración floral', phone: '3315554433', confirmed: false },
      ],
      notes: 'Ceremonia en el jardín a las 18:00 y recepción en el salón. Colores: lavanda y blanco.',
    },
    0.6,
    'banquete',
  )
  boda.guestList = evGuests(62, ['Novia', 'Novio', 'Amigos de los novios', 'Trabajo'], 17)
  // La boda usa los dos espacios: ceremonia en el jardín y recepción en el salón
  boda.scenes = [{ id: uid('sc_'), name: 'Ceremonia', kind: 'ceremonia', venue: 'jardin', time: '18:00', items: autoLayout('jardin', 180, 'ceremonia') }]
  const xv = addEvent(
    {
      title: 'XV años de Valeria',
      type: 'xv',
      venue: 'jardin',
      date: addDaysISO(T, 6),
      guests: 150,
      clientName: 'Valeria Ortiz (mamá: Laura)',
      status: 'confirmado',
      packageId: 'clasico',
      lineItems: [
        { id: uid('li_'), concept: 'DJ y audio profesional', category: 'Entretenimiento', qty: 1, price: 9500 },
        { id: uid('li_'), concept: 'Carpa para jardín', category: 'Mobiliario', qty: 1, price: 12000 },
        { id: uid('li_'), concept: 'Mesa de dulces', category: 'Alimentos', qty: 1, price: 5500 },
      ],
      providers: [{ id: uid('pr_'), name: 'Coreografías Danna', service: 'Vals y baile sorpresa', confirmed: true }],
      notes: 'Temática rosa pastel. Entrada de la quinceañera por el camino de palmeras.',
    },
    0.7,
    'banquete',
  )
  xv.guestList = evGuests(48, ['Familia de mamá', 'Familia de papá', 'Amigos de Valeria', 'Escuela'], 14)
  addEvent({ title: 'Baby shower de Sofía', type: 'baby-shower', venue: 'salon', date: addDaysISO(T, 2), startTime: '13:00', endTime: '18:00', guests: 45, clientName: 'Sofía Castillo', status: 'confirmado', packageId: 'esencial' }, 1, 'coctel')
  addEvent({ title: 'Bautizo de Mateo', type: 'bautizo', venue: 'salon', date: addDaysISO(T, 20), startTime: '14:00', endTime: '20:00', guests: 80, clientName: 'Paola Jiménez', status: 'apartado', packageId: 'clasico' }, 0.3, 'banquete')
  addEvent({ title: 'Cumpleaños 50 de Don Ernesto', type: 'cumpleanos', venue: 'salon', date: addDaysISO(T, 27), guests: 100, clientName: 'Ernesto Salinas', status: 'confirmado', packageId: 'clasico' }, 0.5, 'imperial')
  addEvent({ title: 'Posada Grupo Altos', type: 'empresarial', venue: 'salon', date: addDaysISO(T, 41), startTime: '19:00', endTime: '01:00', guests: 120, clientName: 'Grupo Altos (RH)', status: 'cotizado', packageId: 'joya', includeIva: true }, 0)
  addEvent({ title: 'Boda civil Mariana & Luis', type: 'boda', venue: 'jardin', date: addDaysISO(T, 62), guests: 90, clientName: 'Mariana Flores', status: 'prospecto', packageId: 'clasico' }, 0)

  // Prospectos del wedding planner (CRM)
  const leads: [string, RanchEvent['type'], 'salon' | 'jardin', number, number, string, RanchEvent['leadSource'], number, number][] = [
    ['Boda Andrea & Iván', 'boda', 'jardin', 95, 220, 'Andrea Morales', 'instagram', 1, 260000],
    ['XV años de Camila', 'xv', 'salon', 78, 180, 'Karla Reyes', 'facebook', 0, 140000],
    ['Graduación Prepa Tototlán', 'graduacion', 'salon', 205, 250, 'Comité de padres', 'recomendacion', 3, 180000],
    ['Aniversario 25 Fam. Herrera', 'aniversario', 'jardin', 120, 90, 'Ximena Herrera', 'whatsapp', -1, 85000],
    ['Bautizo de Regina', 'bautizo', 'salon', 33, 70, 'Natalia Rivas', 'visita', 2, 60000],
  ]
  for (const [title, type, venue, inDays, guests, clientName, leadSource, follow, budget] of leads) {
    const ev = addEvent({ title, type, venue, date: addDaysISO(T, inDays), guests, clientName, status: follow > 1 ? 'cotizado' : 'prospecto', packageId: 'clasico' }, 0)
    ev.leadSource = leadSource
    ev.followUpAt = addDaysISO(T, follow)
    ev.clientBudget = budget
  }
  for (const ev of Object.values(data.events)) {
    if (ev.status === 'prospecto' || ev.status === 'cotizado') {
      ev.leadSource ??= pick(['instagram', 'facebook', 'whatsapp', 'recomendacion'] as const)
      ev.followUpAt ??= addDaysISO(T, Math.floor(r() * 6) - 1)
      // Probabilidad de cierre: los cotizados van más avanzados
      ev.probability ??= ev.status === 'cotizado' ? 50 + Math.round(r() * 4) * 5 : 20 + Math.round(r() * 4) * 5
    }
  }

  // Tablero de inspiración y plan de pagos de los eventos grandes
  boda.palette = ['#B9A7D6', '#F4ECE6', '#C9B79C', '#8A9A7B', '#E7C6C0']
  boda.theme = 'Jardín romántico en lavanda'
  boda.moodNotes = 'Flores silvestres, velas en frascos, caminos de mesa de lino y luces colgantes sobre la pista.'
  boda.menu = 'Crema de chile poblano · Filete en salsa de vino tinto con puré rústico · Pastel de tres leches con frutos rojos'
  boda.setupNotes = 'Ceremonia en el jardín con 180 sillas Tiffany y arco floral; recepción en el salón con 18 mesas redondas y mesa principal.'
  xv.palette = ['#E8B4BC', '#F6E3E1', '#D4A5A5', '#C9A227', '#FFFFFF']
  xv.theme = 'Rosa pastel y dorado'
  xv.moodNotes = 'Globos rosa y dorado, letrero de neón cálido con su nombre y mesa de dulces.'
  for (const ev of [boda, xv]) {
    const total = ev.lineItems.reduce((n, li) => n + li.qty * li.price, 0) - (ev.discount || 0)
    ev.paymentPlan = [
      { id: uid('pp_'), label: 'Anticipo', due: addDaysISO(ev.date, -90) < T ? addDaysISO(ev.date, -90) : addDaysISO(T, -20), amount: Math.round(total * 0.3) },
      { id: uid('pp_'), label: 'Segundo pago', due: addDaysISO(ev.date, -30) < T ? addDaysISO(T, -3) : addDaysISO(ev.date, -30), amount: Math.round(total * 0.3) },
      { id: uid('pp_'), label: 'Liquidación', due: addDaysISO(ev.date, -7), amount: total - Math.round(total * 0.3) * 2 },
    ]
  }

  // ── Proveedores ──
  const vendors: [string, import('./types').VendorCategory, string, number, number, boolean, string?][] = [
    ['Banquetes Los Altos', 'banquete', '3781234567', 420, 5, true, 'Menú a 3 tiempos desde 420 por persona. Muy puntuales.'],
    ['Taquizas Don Lalo', 'banquete', '3912223344', 160, 4, false],
    ['DJ Neón', 'musica', '3329876543', 9500, 5, true, 'Incluye iluminación robótica y pista.'],
    ['Mariachi Nuevo Tototlán', 'musica', '3914567890', 6500, 4, false],
    ['Flores Valentina', 'flores', '3315554433', 7500, 5, true, 'Especialista en arcos florales.'],
    ['Foto Luz de Tarde', 'foto', '3318887766', 14000, 5, true, 'Foto y video con dron.'],
    ['Pastelería La Abuela', 'pasteleria', '3916667788', 3800, 4, false],
    ['Renta de Lounge Altos', 'mobiliario', '3787778899', 3500, 4, false],
    ['Glam Studio Ocotlán', 'belleza', '3923334455', 2500, 5, false],
  ]
  for (const [name, category, phone, priceFrom, rating, favorite, notes] of vendors) {
    const id = uid('ven_')
    data.vendors[id] = { ...base, id, name, category, phone, priceFrom, rating, favorite, notes }
  }

  // Plan de trabajo de los eventos confirmados (igual que la automatización)
  for (const ev of [boda, xv]) for (const t of eventPlanTasks(ev)) addTask(t as Task)

  // ── Inventario ──
  const inv: [string, string, InventoryItem['category'], string, number, number, number, string?][] = [
    ['inv_papel', 'Papel higiénico', 'amenidades', 'rollo', 64, 24, 9, 'Bodega'],
    ['inv_jabon', 'Jabón de tocador', 'amenidades', 'pza', 40, 20, 6, 'Bodega'],
    ['inv_shampoo', 'Shampoo amenidad', 'amenidades', 'pza', 14, 20, 8, 'Bodega'],
    ['inv_cafe', 'Café en sobre', 'amenidades', 'pza', 30, 15, 5, 'Bodega'],
    ['inv_bolsas', 'Bolsas de basura', 'limpieza', 'pza', 120, 40, 2, 'Bodega'],
    ['inv_lavatrastes', 'Lavatrastes', 'limpieza', 'botella', 6, 3, 38, 'Bodega'],
    ['inv_cloro', 'Cloro', 'limpieza', 'litro', 8, 4, 22, 'Bodega'],
    ['inv_multiusos', 'Limpiador multiusos', 'limpieza', 'litro', 6, 3, 45, 'Bodega'],
    ['inv_sabanas', 'Juego de sábanas queen', 'blancos', 'juego', 22, 14, 480, 'Lavandería'],
    ['inv_toallas', 'Toallas de baño', 'blancos', 'pza', 46, 24, 160, 'Lavandería'],
    ['inv_toallasmano', 'Toallas de mano', 'blancos', 'pza', 30, 16, 70, 'Lavandería'],
    ['inv_tiffany', 'Sillas Tiffany', 'mobiliario', 'pza', 300, 250, 650, 'Bodega del salón'],
    ['inv_plegables', 'Sillas plegables', 'mobiliario', 'pza', 200, 150, 280, 'Bodega del salón'],
    ['inv_redondas', 'Mesas redondas (10 pers.)', 'mobiliario', 'pza', 32, 25, 1900, 'Bodega del salón'],
    ['inv_rect', 'Mesas rectangulares', 'mobiliario', 'pza', 18, 10, 1500, 'Bodega del salón'],
    ['inv_periqueras', 'Periqueras', 'mobiliario', 'pza', 12, 8, 1200, 'Bodega del salón'],
    ['inv_manteles', 'Manteles redondos blancos', 'manteleria', 'pza', 36, 30, 260, 'Lavandería'],
    ['inv_cubre', 'Cubremanteles lavanda', 'manteleria', 'pza', 30, 20, 140, 'Lavandería'],
    ['inv_caminos', 'Caminos de mesa', 'manteleria', 'pza', 40, 20, 90, 'Lavandería'],
    ['inv_vasos', 'Vasos de cristal', 'bar', 'pza', 420, 300, 18, 'Cocina'],
    ['inv_copas', 'Copas', 'bar', 'pza', 260, 200, 28, 'Cocina'],
    ['inv_focos', 'Focos LED', 'mantenimiento', 'pza', 7, 6, 45, 'Bodega'],
    ['inv_clorofuente', 'Cloro para fuente', 'mantenimiento', 'kg', 3, 2, 120, 'Bodega'],
  ]
  // Códigos de barras de los consumibles (se escanean al contar la bodega)
  const barcodes: Record<string, string> = {
    inv_papel: '7501019006330',
    inv_jabon: '7501035908007',
    inv_shampoo: '7501001165038',
    inv_cafe: '7501059273952',
    inv_bolsas: '7501943400013',
    inv_lavatrastes: '7501025403017',
    inv_cloro: '7501025400016',
    inv_multiusos: '7501035910130',
  }
  for (const [id, name, category, unit, stock, min, cost, location] of inv) data.inventory[id] = { ...base, id, name, category, unit, stock, min, cost, location, barcode: barcodes[id] }
  addTask({ title: 'Comprar Shampoo amenidad', type: 'compra', priority: 'media', automated: 'Inventario bajo → compra', notes: 'Quedan 14 pza (mínimo 20).', checklist: [{ id: uid('chk_'), text: 'Reponer al menos 26 pza', done: false }] })

  // ── Gastos (6 meses) ──
  const addExpense = (e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = uid('exp_')
    data.expenses[id] = { ...base, id, ...e }
  }
  for (let m = 5; m >= 0; m--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - m)
    const ym = toISODate(d).slice(0, 8)
    const day = (n: number) => {
      const iso = ym + String(n).padStart(2, '0')
      return iso > T ? T : iso
    }
    if (day(15) <= T) addExpense({ date: day(15), concept: 'Nómina 1a quincena', category: 'nomina', amount: 18500, line: 'general', method: 'transferencia' })
    if (m > 0) addExpense({ date: day(28), concept: 'Nómina 2a quincena', category: 'nomina', amount: 18500, line: 'general', method: 'transferencia' })
    addExpense({ date: day(5), concept: 'CFE · energía eléctrica', category: 'servicios', amount: 3200 + Math.round(r() * 1800), line: 'general', method: 'transferencia' })
    addExpense({ date: day(8), concept: 'Agua potable', category: 'servicios', amount: 650, line: 'general', method: 'efectivo' })
    addExpense({ date: day(10), concept: 'Gas LP', category: 'servicios', amount: 1500 + Math.round(r() * 700), line: 'hospedaje', method: 'efectivo' })
    addExpense({ date: day(12), concept: 'Jardinería y fertilizante', category: 'jardineria', amount: 2500, line: 'eventos', method: 'efectivo' })
    addExpense({ date: day(3), concept: 'Insumos de limpieza y amenidades', category: 'insumos', amount: 1800 + Math.round(r() * 900), line: 'hospedaje', method: 'tarjeta' })
    addExpense({ date: day(2), concept: 'Publicidad en Facebook e Instagram', category: 'publicidad', amount: 1500, line: 'eventos', method: 'tarjeta' })
    if (r() > 0.4) addExpense({ date: day(18), concept: pick(['Reparación de clima', 'Plomería Casa 2', 'Pintura del salón', 'Refacción bomba de agua']), category: 'mantenimiento', amount: 900 + Math.round(r() * 3500), line: pick(['hospedaje', 'eventos']), method: 'efectivo' })
  }
  // Comisión de Airbnb (3% del anfitrión)
  const airbnbIncome = Object.values(data.payments).filter((p) => p.method === 'airbnb').reduce((n, p) => n + p.amount, 0)
  addExpense({ date: addDaysISO(T, -1), concept: 'Comisiones Airbnb (acumulado)', category: 'comisiones', amount: Math.round(airbnbIncome * 0.03), line: 'hospedaje', method: 'airbnb' })

  // ── Avisos iniciales ──
  const note = (title: string, body: string, tone: any, roles: any[], link?: string) => {
    const id = uid('ntf_')
    data.notifications[id] = { ...base, id, title, body, tone, roles, link, read: false }
  }
  note('Bienvenido a La Joya', 'Tu sistema está listo. Los datos que ves son de demostración.', 'lavender', ['admin', 'eventos', 'limpieza', 'mantenimiento'])
  note('Limpieza terminada', 'Cabaña Jacaranda está lista para revisión.', 'sky', ['admin'], '/limpieza')
  note('Nueva limpieza', 'Casa Lavanda quedó libre: llegan huéspedes a las 17:00.', 'peach', ['limpieza', 'admin'], '/limpieza')

  return data
}

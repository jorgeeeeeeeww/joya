// ¿Cómo se hace?: guías cortas, paso a paso, del trabajo de cada puesto. Cada guía lleva directo a la pantalla.
// Primero salen las del puesto de quien la abre; el dueño ve todas.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, ChevronDown, Search } from 'lucide-react'
import { useMe } from '@/lib/store'
import { ROLE } from '@/lib/meta'
import type { Role } from '@/lib/types'
import { cx, PageHeader } from '@/components/ui'
import { fadeRise, stagger } from '@/lib/motion'
import { AssistantCallout } from '@/components/assistant/Asistente'

interface Guide {
  id: string
  title: string
  roles: Role[]
  when: string
  steps: string[]
  to: string
  go: string
}

const GUIDES: Guide[] = [
  // ── Dueño ──
  {
    id: 'dia-dueno',
    title: 'Revisar el día en un minuto',
    roles: ['admin'],
    when: 'Al empezar el día o cuando quieras saber cómo va todo.',
    steps: [
      'Abre Inicio. Arriba dice cuántas cosas necesitan tu decisión y un resumen en frases: quién llega, quién sale y el próximo evento.',
      'En «Te toca decidir» resuelve cada renglón con su botón (Revisar, Ver, Ver compra).',
      'La ilustración de arriba es el rancho ahora: cada casa encendida tiene huéspedes y al tocarla ves su detalle.',
      '«El mes» te dice lo que entró y lo que falta cobrar. «Equipo ahora», quién hace qué.',
    ],
    to: '/',
    go: 'Ir a Inicio',
  },
  {
    id: 'asignar',
    title: 'Asignar una tarea a alguien',
    roles: ['admin', 'recepcion', 'eventos'],
    when: 'Cuando hay que arreglar, comprar, limpiar o preparar algo.',
    steps: [
      'Ve a Tareas.',
      'Escríbela como la dirías en el campo de arriba, por ejemplo: «foco casa Lavanda hoy 4pm @Chuy». La app entiende el lugar, el día, la hora y a quién va; revísalo en las etiquetas que aparecen y toca el botón de enviar.',
      'O toca «Nueva tarea»: escribe qué hay que hacer, elige el tipo y en «¿Quién la hace?» toca a la persona. Quien suele hacer ese tipo de tarea sale primero.',
      'A esa persona le llega un aviso y la ve en su ruta del día.',
      'Cuando la termina, aparece en «Por verificar»: revísala y toca «Verificar».',
    ],
    to: '/tareas',
    go: 'Ir a Tareas',
  },
  {
    id: 'revisar-limpieza',
    title: 'Aprobar una limpieza terminada',
    roles: ['admin', 'mantenimiento'],
    when: 'Cuando una casa queda «Por revisar».',
    steps: [
      'En Inicio, «Te toca decidir» muestra «Revisar Casa…». Toca «Revisar».',
      'Mira los pasos marcados y las fotos de evidencia.',
      'Si todo está bien, apruébala: la casa pasa a «Lista» para recibir huéspedes. Si falta algo, regrésala con una nota.',
    ],
    to: '/limpieza',
    go: 'Ir a Limpieza',
  },
  {
    id: 'equipo',
    title: 'Agregar a alguien al equipo',
    roles: ['admin'],
    when: 'Cuando entra una persona nueva a trabajar.',
    steps: ['Ve a Ajustes → Rancho → «Agregar a alguien al equipo».', 'Escribe su nombre, elige qué va a hacer (cada puesto dice lo que verá) y ponle un PIN de 4 números.', 'Dile su PIN en persona. Entra eligiendo su nombre en la pantalla de inicio.'],
    to: '/ajustes?tab=general',
    go: 'Ir a Ajustes',
  },
  {
    id: 'precios',
    title: 'Poner los precios de los paquetes',
    roles: ['admin'],
    when: 'Una vez, y cada que cambien tus precios.',
    steps: ['Ve a Ajustes → Rancho → «Paquetes y precios».', 'Escribe el precio por persona de cada paquete.', 'Desde ahí, las cotizaciones de los eventos se calculan solas. Sin precio, la app no inventa cifras.'],
    to: '/ajustes?tab=general',
    go: 'Ir a Ajustes',
  },
  {
    id: 'dinero',
    title: 'Ver el dinero del mes',
    roles: ['admin'],
    when: 'Para saber cuánto entró, cuánto salió y qué falta cobrar.',
    steps: ['Ve a Finanzas y elige el periodo (este mes, mes pasado, 3 meses…).', 'Arriba ves ingresos, gastos y utilidad; toca un mes en la gráfica para ver su detalle.', '«Registrar gasto» para anotar lo que pagaste. «Reporte del mes» arma un resumen para imprimir o guardar.'],
    to: '/finanzas',
    go: 'Ir a Finanzas',
  },
  {
    id: 'celular',
    title: 'Conectar el celular de alguien',
    roles: ['admin'],
    when: 'Para que una persona use la app en su teléfono.',
    steps: ['Ve a Ajustes → «Celulares y respaldo» → «Conectar un celular».', 'En el celular nuevo, abre la cámara y apunta al código.', 'Se abre La Joya conectada al rancho; entra con la cuenta del rancho y listo.'],
    to: '/ajustes?tab=nube',
    go: 'Ir a Ajustes',
  },

  // ── Eventos (wedding planner) ──
  {
    id: 'nuevo-evento',
    title: 'Crear un evento',
    roles: ['eventos', 'admin'],
    when: 'Cuando alguien pide fecha o una cotización.',
    steps: [
      'Toca «Nuevo evento».',
      'Paso 1: elige el tipo, el espacio (salón o jardín) y la fecha. Los días con punto ya tienen evento.',
      'Paso 2: escribe el nombre de quien contrata y su teléfono.',
      'Paso 3: número de invitados, paquete y «¿Qué vas a usar?»: apaga lo que el evento no necesite (por ejemplo, la lista de invitados).',
      'Toca «Crear evento». Queda como prospecto, con su plano, programa y pendientes listos.',
    ],
    to: '/eventos',
    go: 'Ir a Eventos',
  },
  {
    id: 'etapas',
    title: 'Avanzar un evento: de prospecto a confirmado',
    roles: ['eventos', 'admin'],
    when: 'Conforme el cliente decide.',
    steps: ['Abre el evento.', 'Abajo del título están las etapas: Prospecto → Cotizado → Apartado → Confirmado. Toca la etapa a la que avanzó.', 'Al confirmarlo, la app arma el plan de trabajo del equipo para ese día.'],
    to: '/eventos',
    go: 'Ir a Eventos',
  },
  {
    id: 'cobrar',
    title: 'Registrar un pago',
    roles: ['eventos', 'admin', 'recepcion'],
    when: 'Cuando el cliente paga un anticipo, un abono o la liquidación.',
    steps: ['Abre el evento → «Cotización y pagos» (o la reserva en Hospedaje).', 'Toca «Registrar pago».', 'Escribe el monto, elige si fue transferencia, efectivo o tarjeta, y el concepto (anticipo, abono, liquidación).', 'Toca «Guardar pago». El saldo y las cifras del dueño se actualizan al instante.'],
    to: '/eventos',
    go: 'Ir a Eventos',
  },
  {
    id: 'invitados',
    title: 'Lista de invitados y confirmaciones',
    roles: ['eventos', 'admin'],
    when: 'Semanas antes del evento.',
    steps: ['Ve a Invitados y elige el evento arriba.', '«Agregar invitado»: nombre, cuántas personas y su teléfono.', 'En «Confirmar» desliza a la derecha si viene y a la izquierda si no; también puedes mandarle el recordatorio por WhatsApp.', 'El día del evento, «Recepción en la puerta» marca quién llegó.'],
    to: '/invitados',
    go: 'Ir a Invitados',
  },
  {
    id: 'mesas',
    title: 'Acomodar mesas e invitados',
    roles: ['eventos', 'admin'],
    when: 'Cuando ya hay confirmados.',
    steps: ['Abre el evento → «Plano de mesas» para mover mesas, pista y escenario (toca una mesa para cambiar sus sillas).', 'Ve a Invitados → «Mesas» y arrastra a cada invitado (de la manija) a su mesa, o toca «Acomodar automáticamente».', 'Las familias quedan juntas y los VIP cerca de la pista.'],
    to: '/invitados',
    go: 'Ir a Invitados',
  },
  {
    id: 'tu-dia',
    title: 'Usar «Tu día»',
    roles: ['eventos'],
    when: 'Cada mañana.',
    steps: ['En Inicio, «Tu día» junta lo urgente: cobros, prospectos por contestar y eventos con algo pendiente.', 'Toca la acción del renglón (llamar, escribir, abrir) y luego ✓ cuando lo termines.', 'Desliza un renglón para posponerlo.'],
    to: '/',
    go: 'Ir a Inicio',
  },

  // ── Recepción ──
  {
    id: 'reserva',
    title: 'Hacer una reserva',
    roles: ['recepcion', 'admin'],
    when: 'Cuando un huésped aparta una casa o cabaña.',
    steps: ['Toca «Nueva reserva».', 'Elige la casa (cada una dice su capacidad y precio), las fechas y el nombre del huésped.', 'Toca «Reservar». Queda en el calendario de Hospedaje y en el mapa.'],
    to: '/hospedaje',
    go: 'Ir a Hospedaje',
  },
  {
    id: 'checkin',
    title: 'Recibir y despedir huéspedes',
    roles: ['recepcion', 'admin'],
    when: 'El día de llegada y el de salida.',
    steps: ['En Hospedaje, «Llegan hoy» → toca «Check-in» cuando lleguen. Si la casa aún no está lista, la app te avisa.', '«Salen hoy» → «Check-out» al irse: la app crea sola la limpieza y se la asigna a alguien.', 'Si queda saldo, cóbralo desde la reserva con «Registrar pago».'],
    to: '/hospedaje',
    go: 'Ir a Hospedaje',
  },
  {
    id: 'mapa',
    title: 'Ver cómo está cada casa',
    roles: ['recepcion', 'mantenimiento', 'admin'],
    when: 'Cuando necesitas saber qué casa está lista.',
    steps: ['Abre Mapa. Arriba de cada casa sale su estado: libre, ocupada, por limpiar, limpiando (con alguien barriendo) o por revisar.', 'Toca una casa para ver quién está, quién llega y cómo va su limpieza; «Ver ficha completa» para todo lo demás.', 'Abajo puedes filtrar por estado.'],
    to: '/mapa',
    go: 'Ir al Mapa',
  },

  // ── Limpieza ──
  {
    id: 'limpiar',
    title: 'Limpiar una casa',
    roles: ['limpieza'],
    when: 'Cada casa de tu ruta del día.',
    steps: ['En Inicio está tu ruta: primero la casa que sigue.', 'Desliza «Desliza para empezar».', 'Marca cada paso, cuarto por cuarto. Toma fotos si algo está mal o como evidencia.', 'Toca «Marcar como lista». La casa queda «Por revisar» y le avisa al encargado.'],
    to: '/',
    go: 'Ir a mi ruta',
  },
  {
    id: 'reportar',
    title: 'Reportar algo descompuesto u olvidado',
    roles: ['limpieza', 'recepcion', 'mantenimiento'],
    when: 'Cuando encuentras algo roto, algo que dejó un huésped o falta material.',
    steps: ['En Inicio toca «Reportar algo», «Objeto olvidado» o «Falta material».', 'Elige dónde y qué pasa (hay opciones de un toque), y toma una foto.', 'Toca «Enviar reporte». Le llega a mantenimiento o al encargado.'],
    to: '/',
    go: 'Ir a Inicio',
  },

  // ── Mantenimiento ──
  {
    id: 'ruta-mant',
    title: 'Hacer tu ruta del día',
    roles: ['mantenimiento'],
    when: 'Cada mañana.',
    steps: ['En Inicio, «Ruta de hoy» tiene tus tareas en orden.', 'Toca «Empezar» al llegar al lugar y «Terminar» al acabar.', 'Si necesitas material, anótalo en la tarea o crea una tarea de compra.'],
    to: '/',
    go: 'Ir a Inicio',
  },
  {
    id: 'incidencia',
    title: 'Registrar una incidencia',
    roles: ['mantenimiento', 'admin'],
    when: 'Cuando ves algo que hay que arreglar.',
    steps: ['En Inicio toca «Nueva incidencia».', 'Escribe qué pasa, dónde y qué tan urgente es; agrega foto si ayuda.', 'Queda en Tareas para que la tomes o la asignen.'],
    to: '/',
    go: 'Ir a Inicio',
  },
]

function GuideCard({ g, open, onToggle }: { g: Guide; open: boolean; onToggle: () => void }) {
  return (
    <motion.div variants={fadeRise} className="card overflow-hidden">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left md:p-5">
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] leading-snug font-semibold">{g.title}</span>
          <span className="mt-0.5 block text-[13px] text-ink-soft">{g.when}</span>
        </span>
        <ChevronDown size={18} strokeWidth={1.6} className={cx('mt-1 shrink-0 text-ink-soft transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 md:px-5 md:pb-5">
          <ol className="flex flex-col gap-2.5">
            {g.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] leading-snug">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-semibold tabular">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          <Link to={g.to} className="pressable mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-sm text-paper">
            {g.go} <ArrowRight size={15} strokeWidth={1.7} />
          </Link>
        </div>
      )}
    </motion.div>
  )
}

export default function Ayuda() {
  const me = useMe()
  const role = me?.role ?? 'limpieza'
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const list = useMemo(() => {
    const visible = role === 'admin' ? GUIDES : GUIDES.filter((g) => g.roles.includes(role))
    const mine = visible.filter((g) => g.roles[0] === role || g.roles.includes(role))
    const sorted = [...mine.filter((g) => g.roles[0] === role), ...mine.filter((g) => g.roles[0] !== role)]
    const t = q.trim().toLowerCase()
    return t ? sorted.filter((g) => (g.title + ' ' + g.when + ' ' + g.steps.join(' ')).toLowerCase().includes(t)) : sorted
  }, [role, q])

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Ayuda" title="¿Cómo se hace?" subtitle={`Guías cortas, paso a paso${role === 'admin' ? ', de todo el rancho' : ` para ${ROLE[role].label.toLowerCase()}`}. Toca una para verla.`} />
      <AssistantCallout />
      <label className="card mb-4 flex items-center gap-2 px-4">
        <Search size={17} strokeWidth={1.6} className="text-ink-soft" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca: tarea, pago, reserva…" className="h-12 min-w-0 flex-1 bg-transparent text-base !shadow-none !outline-none" aria-label="Buscar en la ayuda" />
      </label>
      <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-3">
        {list.map((g) => (
          <GuideCard key={g.id} g={g} open={open === g.id || (!!q && list.length <= 3)} onToggle={() => setOpen((o) => (o === g.id ? null : g.id))} />
        ))}
        {list.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">No encontramos esa guía. Prueba con otra palabra.</p>}
      </motion.div>
    </div>
  )
}

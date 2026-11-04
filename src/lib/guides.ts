// Explicación de cada pantalla para el asistente: qué es, qué se ve, en qué orden se trabaja y consejos.
// El texto usa los nombres reales de los botones y secciones para que nadie se pierda.
import type { Role } from './types'

export interface GuideBlock {
  label: string
  text: string
  to?: string
}
export interface PanelGuide {
  title: string
  /** Para qué sirve esta pantalla, en una o dos frases */
  what: string
  /** Lo que se ve en pantalla, sección por sección */
  see: GuideBlock[]
  /** Orden recomendado de trabajo */
  order: { title: string; steps: string[] }
  /** Rutina de control (dueño): cada día, cada semana, cada mes */
  routine?: { when: string; steps: GuideBlock[] }[]
  tips: string[]
}

export const GUIDES: Record<string, PanelGuide> = {
  // ── Inicio de cada puesto ──
  'inicio:admin': {
    title: 'Tu panel de dueño',
    what: 'Aquí ves todo el rancho de un vistazo: lo que necesita tu decisión, lo que pasó hoy, el dinero y lo que viene. Está hecho para que en 5 minutos sepas si todo va bien.',
    see: [
      { label: 'Te toca decidir', text: 'Lo único que espera por ti: limpiezas por aprobar, compras por autorizar y avisos. Resuélvelo de arriba hacia abajo con el botón de cada renglón.' },
      { label: 'Lo que pasó hoy', text: 'Quién hizo qué, al momento: pagos registrados, limpiezas terminadas, reservas nuevas e incidencias. Sirve para saber que el equipo está trabajando sin tener que preguntar.' },
      { label: 'Cómo va la semana', text: 'Lo cobrado, lo que falta cobrar y los pagos vencidos. Si ves algo vencido, tócalo y te lleva al evento o reserva.' },
      { label: 'Embudo de eventos', text: 'Cuántos eventos hay en cada etapa: prospecto, cotizado, apartado y confirmado. Si se juntan muchos en «cotizado», falta seguimiento de ventas.', to: '/eventos?vista=prospectos' },
      { label: 'Próximos sábados', text: 'Qué fines de semana están vendidos y cuáles libres en salón y jardín. Un sábado libre a menos de 2 meses es dinero que se puede vender.', to: '/espacios' },
      { label: 'Finanzas y reporte del mes', text: 'Ingresos, gastos, utilidad, flujo de caja y el reporte ejecutivo para imprimir o guardar en PDF.', to: '/finanzas' },
    ],
    order: {
      title: 'Tu orden para tener todo bajo control',
      steps: [
        'Abre Inicio y lee el resumen de arriba: cuántas decisiones tienes pendientes.',
        'Resuelve «Te toca decidir» completo (aprobar limpiezas, autorizar compras).',
        'Revisa «Lo que pasó hoy»: si algo no cuadra, tócalo para ver el detalle.',
        'Mira «Cómo va la semana»: si hay pagos vencidos, pídele a quien lleva ese evento o reserva que cobre hoy.',
        'Abre el asistente dentro de los eventos próximos para ver en qué fase va cada uno y qué falta.',
      ],
    },
    routine: [
      {
        when: 'Cada día · 5 minutos',
        steps: [
          { label: 'Decisiones', text: '«Te toca decidir» en cero.', to: '/' },
          { label: 'Cobranza', text: 'Pagos vencidos de eventos y saldos de hospedaje.', to: '/finanzas' },
          { label: 'Casas', text: 'Que las casas que reciben huésped hoy estén «Listas».', to: '/mapa' },
        ],
      },
      {
        when: 'Cada semana · 20 minutos',
        steps: [
          { label: 'Eventos de los próximos 30 días', text: 'Abre cada uno y revisa su fase en el asistente: nada atrasado.', to: '/eventos' },
          { label: 'Ventas', text: 'Prospectos con seguimiento vencido y sábados libres por vender.', to: '/eventos?vista=prospectos' },
          { label: 'Tareas y equipo', text: 'Tareas atrasadas y quién tiene más carga.', to: '/tareas' },
          { label: 'Inventario', text: 'Lo que está bajo el mínimo y la lista de compras.', to: '/inventario' },
        ],
      },
      {
        when: 'Cada mes · 30 minutos',
        steps: [
          { label: 'Reporte del mes', text: 'Utilidad, gasto por categoría y eventos que más dejan.', to: '/finanzas' },
          { label: 'Precios', text: 'Revisa precios de paquetes y extras si subieron tus costos.', to: '/ajustes?tab=general' },
          { label: 'Respaldo', text: 'Que el respaldo esté al día en «Celulares y respaldo».', to: '/ajustes?tab=nube' },
          { label: 'Actividad', text: 'La bitácora de quién cambió qué, por si algo no cuadra.', to: '/ajustes?tab=bitacora' },
        ],
      },
    ],
    tips: [
      'No necesitas hacer el trabajo de cada quien: tu panel te dice dónde mirar. Si algo está en rojo, toca y delega.',
      'Pide que todo pago se registre en la app el mismo día; así tu dinero siempre cuadra.',
      'Cada persona puede activar o apagar su asistente en Ajustes → Tu panel. Tú eliges el modo para todo el equipo.',
    ],
  },
  'inicio:eventos': {
    title: 'Tu panel de wedding planner',
    what: 'Tu oficina del día: lo urgente de tus eventos, tus cobros, tus prospectos y la temporada. Empieza siempre aquí.',
    see: [
      { label: 'Tu día', text: 'Lo que toca hoy en orden: cobros, prospectos por contestar y eventos con algo pendiente. Toca la acción del renglón y luego ✓ al terminar; desliza para posponer.' },
      { label: 'Mis eventos', text: 'Cada evento con su salud (contrato, pagos, invitados, mesas, proveedores, orden de evento). Abre uno y el asistente te dice en qué fase va y qué sigue.', to: '/eventos' },
      { label: 'La temporada', text: 'Sábados vendidos y libres. Un sábado libre se puede apartar tocándolo.' },
      { label: 'Ventas y cobros', text: 'Lo vendido, lo que está en negociación y lo que falta cobrar.' },
    ],
    order: {
      title: 'Así se trabaja un evento, de principio a fin',
      steps: [
        'Primer contacto → crea el evento con «Nuevo evento» (queda como prospecto).',
        'Propuesta → arma la cotización, mándala y agenda seguimiento.',
        'Apartar → anticipo, contrato firmado, plan de pagos y pasa a «Confirmado».',
        'Diseño → temática, paleta y proveedores clave (más de 90 días antes).',
        'Proveedores y menú → todo confirmado y menú cerrado (90 a 46 días).',
        'Invitados → lista, invitaciones y confirmaciones (45 a 31 días).',
        'Afinar → plano de mesas, número final y pagos al corriente (30 a 8 días).',
        'Semana del evento → liquidación, orden de evento firmada y montaje.',
        'Día del evento y cierre → programa en vivo, recepción, depósito y agradecimiento.',
      ],
    },
    tips: [
      'Dentro de cada evento, el botón «Ayuda» te muestra la fase exacta y te lleva a la pestaña donde se hace cada paso.',
      'Termina el día con «Tu día» en cero: lo que pospones, pospónlo con fecha.',
      'Registra cada pago al momento: el dueño lo ve al instante y nadie te lo vuelve a preguntar.',
    ],
  },
  'inicio:recepcion': {
    title: 'Tu panel de recepción',
    what: 'Todo lo de hospedaje de hoy y mañana: quién llega, quién sale, qué casas están listas y qué falta cobrar.',
    see: [
      { label: 'Llegadas y salidas', text: 'Hoy y mañana, en orden de hora. Desde aquí haces check-in y check-out.', to: '/hospedaje' },
      { label: 'Cabañas y casas', text: 'Estado en vivo de cada una: lista, ocupada, por limpiar, limpiando o por revisar.', to: '/mapa' },
      { label: 'Cobranza', text: 'Saldos de hospedaje pendientes; «Registrar pago» o mándale recordatorio al huésped.' },
      { label: 'Airbnb y Booking', text: 'Las reservas que llegan de los canales, ya en el calendario.' },
    ],
    order: {
      title: 'Tu orden del día',
      steps: [
        'Revisa las llegadas de hoy: ¿su casa está «Lista»? Si no, avisa a limpieza.',
        'Haz el check-out de quien sale: la app crea sola la limpieza.',
        'Haz el check-in al llegar el huésped y cobra el saldo si queda.',
        'Antes de cerrar, revisa las llegadas de mañana y los saldos pendientes.',
      ],
    },
    tips: ['Nunca entregues una casa que no esté «Lista»: la app te avisa si intentas hacer check-in antes.', 'Anota en la reserva la hora de llegada: limpieza organiza su ruta con ella.'],
  },
  'inicio:limpieza': {
    title: 'Tu ruta de limpieza',
    what: 'Aquí está tu día: qué casa limpiar primero, paso por paso, y cómo avisar si algo falta o está roto.',
    see: [
      { label: 'Tu ruta de hoy', text: 'Primero la casa que sigue. Dice cuánto tiempo hay antes de que llegue el huésped.' },
      { label: 'Desliza para empezar', text: 'Al deslizar empieza la limpieza y se abren los pasos, cuarto por cuarto.' },
      { label: 'Reportar algo / Objeto olvidado / Falta material', text: 'Un toque, una foto y le llega al encargado.' },
      { label: 'Terminadas hoy', text: 'Lo que ya hiciste hoy.' },
    ],
    order: {
      title: 'Cada casa, así',
      steps: ['Desliza «Desliza para empezar».', 'Marca cada paso al terminarlo. Toma foto si algo está mal.', 'Si encuentras algo olvidado o roto, repórtalo con foto.', 'Toca «Marcar como lista». La casa queda «Por revisar» y le avisa al encargado.'],
    },
    tips: ['Empieza siempre por la casa con la llegada más próxima.', 'Las fotos te protegen: si algo ya estaba roto, queda la evidencia.'],
  },
  'inicio:mantenimiento': {
    title: 'Tu ruta de mantenimiento',
    what: 'Tus reparaciones del día en orden, lo urgente primero, y el mapa del rancho para ubicarte.',
    see: [
      { label: 'Ruta de hoy', text: 'Tus tareas en orden. «Empezar» al llegar y «Terminar» al acabar.' },
      { label: 'Urgente', text: 'Lo que bloquea una casa o un evento. Va antes que todo.' },
      { label: 'El rancho', text: 'Mapa con las casas en mantenimiento o con incidencias.', to: '/mapa' },
      { label: 'Hechas en 7 días', text: 'Tu trabajo de la semana.' },
    ],
    order: { title: 'Tu orden del día', steps: ['Atiende primero lo urgente.', 'Sigue con la ruta en el orden que aparece.', 'Si necesitas material, anótalo en la tarea o crea una tarea de compra.', 'Si ves algo nuevo que arreglar, registra una incidencia con foto.'] },
    tips: ['Una casa en «Mantenimiento» no se puede rentar: termínala y avisa para liberarla.'],
  },

  // ── Secciones ──
  mapa: {
    title: 'Mapa del rancho',
    what: 'El rancho completo en vivo: el estado de cada casa y cabaña y lo que pasa en salón y jardín.',
    see: [
      { label: 'Etiquetas sobre cada casa', text: 'Libre, ocupada, por limpiar, limpiando o por revisar.' },
      { label: 'Tocar una casa', text: 'Quién está, quién llega y cómo va su limpieza; «Ver ficha completa» para todo.' },
      { label: 'Filtrar por estado', text: 'Abajo: muestra solo las casas por limpiar, ocupadas, etc.' },
      { label: 'Recorrido', text: 'Pasa casa por casa automáticamente, útil para revisar todo el rancho.' },
    ],
    order: { title: 'Para revisar el rancho', steps: ['Filtra «Por limpiar» y «Por revisar»: son las que frenan llegadas.', 'Toca cada una para ver quién la tiene asignada.', 'Revisa las de «Mantenimiento»: ¿cuándo se liberan?'] },
    tips: ['Pellizca para acercar y arrastra para girar en 3D.'],
  },
  hospedaje: {
    title: 'Hospedaje',
    what: 'Reservas, llegadas, salidas y el calendario de todas las casas y cabañas.',
    see: [
      { label: 'Hoy', text: '«Llegan hoy», «Salen hoy» y «En casa ahora».' },
      { label: 'Agenda', text: 'Calendario por casa. Arrastra una reserva para moverla de fecha o de casa.' },
      { label: 'Próximas llegadas', text: 'Las siguientes reservas, para prepararte.' },
      { label: 'Ocupación del mes', text: 'Qué tanto se está rentando.' },
    ],
    order: { title: 'Cómo se hace una reserva', steps: ['Toca «Nueva reserva».', 'Elige la casa (dice capacidad y precio), fechas y nombre del huésped.', 'Registra el anticipo con «Registrar pago».', 'El día de llegada: «Check-in». El de salida: «Check-out» (la limpieza se crea sola).'] },
    tips: ['Las reservas de Airbnb y Booking llegan solas si la casa tiene su enlace iCal.', 'Anota la hora de llegada: limpieza ordena su ruta con ella.'],
  },
  limpieza: {
    title: 'Limpieza',
    what: 'Todas las limpiezas abiertas, quién las tiene y cuáles están listas para revisar.',
    see: [
      { label: 'Pendientes', text: 'Las limpiezas por hacer y a quién están asignadas.' },
      { label: 'Por revisar', text: 'Terminadas, esperando tu aprobación con sus pasos y fotos.' },
      { label: 'Pendientes por persona', text: 'La carga de cada quien, para repartir mejor.' },
      { label: 'Tarda en promedio', text: 'Cuánto tarda una limpieza, para planear llegadas.' },
    ],
    order: { title: 'Para aprobar una limpieza', steps: ['Abre la casa en «Por revisar».', 'Mira los pasos marcados y las fotos.', 'Si está bien, apruébala: queda «Lista». Si falta algo, regrésala con una nota.'] },
    tips: ['Aprueba primero las casas que reciben huésped hoy.'],
  },
  tareas: {
    title: 'Tareas',
    what: 'Todo lo que hay que hacer en el rancho, quién lo hace y para cuándo.',
    see: [
      { label: 'Agregar tarea rápido', text: 'Escríbela como la dirías: «foco casa Lavanda hoy 4pm @Chuy». La app entiende lugar, día, hora y persona.' },
      { label: 'Por estado', text: 'Pendiente → En progreso → Hecha → Verificada.' },
      { label: 'Automáticas', text: 'Algunas se crean solas: limpiezas al hacer check-out, plan de trabajo al confirmar un evento, compras al bajar el inventario.' },
    ],
    order: { title: 'Cómo se trabaja una tarea', steps: ['Créala con el campo rápido o «Nueva tarea».', 'Asígnala en «¿Quién la hace?» (le llega un aviso).', 'Quien la hace toca «Empezar» y luego la marca «Hecha».', 'El encargado la revisa y toca «Verificar».'] },
    tips: ['Una tarea sin fecha se olvida: ponle siempre día.', 'Usa «urgente» solo para lo que bloquea una casa o un evento.'],
  },
  eventos: {
    title: 'Eventos',
    what: 'El calendario de todos los eventos y prospectos de salón y jardín.',
    see: [
      { label: 'Calendario del mes', text: 'Toca un evento para abrirlo; arrástralo a otro día para cambiar la fecha.' },
      { label: 'Indicadores', text: 'Eventos del mes, invitados, ingresos comprometidos y lo que falta cobrar.' },
      { label: 'Prospectos', text: 'Las solicitudes que aún no apartan, con su seguimiento.', to: '/eventos?vista=prospectos' },
    ],
    order: {
      title: 'Cómo crear un evento',
      steps: [
        'Toca «Nuevo evento».',
        'Paso 1: tipo, espacio (salón o jardín) y fecha. Los días con punto ya tienen evento.',
        'Paso 2: nombre de quien contrata y teléfono.',
        'Paso 3: invitados, paquete y «¿Qué vas a usar?» (apaga lo que no necesite).',
        'Toca «Crear evento». Se abre el evento y el asistente te dice qué sigue.',
      ],
    },
    tips: ['Dentro de cada evento, el botón «Ayuda» te guía fase por fase como wedding planner.'],
  },
  prospectos: {
    title: 'Prospectos',
    what: 'Las personas que pidieron fecha o cotización y todavía no apartan. Aquí se gana o se pierde la venta.',
    see: [
      { label: 'Seguimiento vencido / hoy / próximo / sin fecha', text: 'Cada prospecto en su grupo según cuándo toca escribirle.' },
      { label: 'Posponer', text: 'Mueve el seguimiento a mañana, 3 días o una semana con un toque.' },
    ],
    order: { title: 'Tu orden de ventas', steps: ['Atiende primero «Seguimiento vencido» y «Hoy».', 'Escríbele por WhatsApp desde el prospecto.', 'Si contestó, avanza su etapa (Cotizado, Apartado). Si no, agenda el siguiente seguimiento.', 'Que ningún prospecto quede «Sin seguimiento».'] },
    tips: ['Tres seguimientos sin respuesta: márcalo y pasa al siguiente.', 'Responder rápido vale más que el precio.'],
  },
  evento: {
    title: 'Detalle del evento',
    what: 'Todo lo de un evento: resumen, plano, invitados, cotización y pagos, día del evento, proveedores e inspiración.',
    see: [
      { label: 'Etapas', text: 'Prospecto → Cotizado → Apartado → Confirmado → Realizado. Tócala para avanzar.' },
      { label: 'Pestañas', text: 'Cada parte del evento. Con «Qué incluye este evento» (ícono de ajustes) apagas lo que no use.' },
    ],
    order: { title: 'Qué sigue', steps: ['Abre el asistente: te dice la fase y el siguiente paso exacto.'] },
    tips: [],
  },
  invitados: {
    title: 'Estación de invitados',
    what: 'La lista de invitados de cada evento: confirmaciones, acomodo en mesas y recepción en la puerta.',
    see: [
      { label: 'Lista', text: 'Todos los invitados: personas, lado, grupo, dieta y VIP.' },
      { label: 'Confirmar', text: 'Desliza a la derecha si viene, a la izquierda si no. Recordatorio por WhatsApp.' },
      { label: 'Mesas', text: 'Arrastra a cada invitado a su mesa o «Acomodar automáticamente».' },
      { label: 'Recepción', text: 'El día del evento: marca quién llega y registra a quien no estaba.' },
    ],
    order: { title: 'En este orden', steps: ['Elige el evento arriba.', 'Captura la lista con «Agregar invitado».', 'Manda invitaciones y confirma.', 'Acomoda en mesas con los confirmados.', 'El día del evento usa «Recepción».'] },
    tips: ['Marca VIP a padres, padrinos y abuelos.', 'Anota dietas y alergias: pasan a la orden de evento.'],
  },
  espacios: {
    title: 'Salón y jardín',
    what: 'Los espacios de eventos: disponibilidad de sábados, capacidad, vista 3D del montaje y mobiliario necesario.',
    see: [
      { label: 'Sábados', text: 'Qué fechas están vendidas y cuáles libres en cada espacio.' },
      { label: 'Vista 3D', text: 'El montaje del evento como se verá. «Recorrido» lo muestra a la altura de una persona.' },
      { label: 'Mobiliario necesario', text: 'Mesas, sillas y mantelería que pide el plano, contra lo que hay en inventario.' },
    ],
    order: { title: 'Para vender y preparar', steps: ['Revisa sábados libres para ofrecerlos a prospectos.', 'Enseña al cliente la vista 3D de su montaje.', 'Revisa que el mobiliario alcance antes del evento.'] },
    tips: ['La vista 3D vende: úsala en la visita del cliente.'],
  },
  mensajes: {
    title: 'Mensajes',
    what: 'Las plantillas de WhatsApp (invitaciones, recordatorios, cobros) y el registro de lo enviado.',
    see: [
      { label: 'Plantillas', text: 'Textos listos para enviar. Puedes editar el texto de cada una.' },
      { label: 'Registro', text: 'Mensajes enviados desde este dispositivo; también quedan anotados en cada evento.' },
    ],
    order: { title: 'Para enviar', steps: ['Elige la plantilla.', 'Revisa el texto.', 'Envía: se abre WhatsApp con el mensaje listo.'] },
    tips: ['Un recordatorio amable a tiempo evita cobrar con prisas.'],
  },
  proveedores: {
    title: 'Proveedores',
    what: 'Tu directorio de confianza: banquete, música, flores, foto, pastel, mobiliario y más.',
    see: [
      { label: 'Directorio', text: 'Cada proveedor con contacto, precio desde, calificación y notas.' },
      { label: 'Favoritos', text: 'Los que recomiendas primero.' },
    ],
    order: { title: 'Cómo se usa', steps: ['Da de alta a cada proveedor con teléfono e Instagram.', 'Califícalo después de cada evento.', 'Dentro del evento, «Asignar proveedor» lo toma de aquí.'] },
    tips: ['Anota en notas cómo trabajó: puntualidad, trato y si cumplió.'],
  },
  finanzas: {
    title: 'Finanzas',
    what: 'El dinero del rancho: ingresos, gastos, utilidad y tendencia, por negocio (hospedaje y eventos).',
    see: [
      { label: 'Periodo', text: 'Este mes, mes pasado, 3 meses… Todo se recalcula.' },
      { label: 'Ingresos, gastos y utilidad', text: 'Arriba, con la gráfica de los últimos meses. Toca un mes para ver su detalle.' },
      { label: '¿En qué se va el dinero?', text: 'Gastos por categoría: nómina, servicios, mantenimiento, insumos…' },
      { label: 'Movimientos', text: 'Cada pago y gasto, con quién lo registró.' },
    ],
    order: { title: 'Para cerrar el mes', steps: ['Registra todos los gastos con «Registrar gasto».', 'Revisa que la utilidad sea la esperada.', 'Saca el «Reporte del mes» para imprimir o guardar en PDF.'] },
    tips: ['Anota cada gasto el mismo día; al final del mes ya no te acuerdas.', 'Compara la utilidad de eventos contra hospedaje para decidir dónde invertir.'],
  },
  inventario: {
    title: 'Inventario',
    what: 'Insumos, blancos, mobiliario y mantelería: cuánto hay y qué hay que comprar.',
    see: [
      { label: 'Bajo el mínimo', text: 'Lo que hay que comprar. Al bajar del mínimo se crea una compra automática.' },
      { label: 'Conteo físico', text: 'Cuenta lo que hay; puedes escanear el código de barras.' },
      { label: 'Valor del inventario', text: 'Cuánto dinero hay en almacén.' },
    ],
    order: { title: 'Cada semana', steps: ['Haz el conteo físico.', 'Revisa «Bajo el mínimo» y la lista de compras.', 'Registra las entradas al comprar.'] },
    tips: ['Las limpiezas descuentan insumos solas al terminar.'],
  },
  equipo: {
    title: 'Equipo',
    what: 'Las personas del rancho, su puesto, su horario y quién está trabajando ahora.',
    see: [
      { label: 'Trabajando ahora', text: 'Quién tiene turno en este momento.' },
      { label: 'Cada persona', text: 'Puesto, teléfono, color y si está activa. Lo que ve cada puesto lo decide su rol.' },
      { label: 'Turnos', text: 'Horario semanal de cada quien.' },
    ],
    order: { title: 'Cuando entra alguien nuevo', steps: ['Agrégalo con nombre, puesto y PIN de 4 números.', 'Dile su PIN en persona.', 'Conecta su celular con un código desde Ajustes.', 'Ponle su horario.'] },
    tips: ['Si alguien se va, desactívalo: deja de entrar pero su historial se conserva.'],
  },
  ajustes: {
    title: 'Ajustes',
    what: 'Tu panel (atmósfera, tema y asistente), datos del rancho, avisos automáticos, celulares y respaldo.',
    see: [
      { label: 'Tu panel', text: 'Cómo se ve tu app y cómo quieres tu asistente (siempre, solo con botón o apagado).' },
      { label: 'Rancho', text: 'Datos, paquetes y precios, y el equipo (solo dueño).' },
      { label: 'Avisos automáticos', text: 'Qué hace la app sola: limpiezas al salir, plan de evento, compras… (solo dueño).' },
      { label: 'Celulares y respaldo', text: 'Conectar teléfonos y respaldar la información (solo dueño).' },
    ],
    order: { title: 'Lo básico, una sola vez', steps: ['Pon los precios de los paquetes.', 'Agrega al equipo.', 'Conecta los celulares.', 'Revisa que el respaldo esté activo.'] },
    tips: [],
  },
  ayuda: {
    title: 'Guías paso a paso',
    what: 'Guías cortas del trabajo de cada puesto. Busca por palabra y toca una para verla.',
    see: [],
    order: { title: 'Cómo usarlas', steps: ['Busca lo que quieres hacer (pago, reserva, tarea…).', 'Toca la guía y sigue los pasos.', 'Usa el botón del final para ir directo a la pantalla.'] },
    tips: [],
  },
}

/** Qué explicación corresponde a la pantalla abierta */
export function guideKeyFor(pathname: string, search: string, role: Role): string {
  const seg = pathname.split('/').filter(Boolean)
  if (!seg.length) return `inicio:${role}`
  if (seg[0] === 'eventos' && seg[1]) return 'evento'
  if (seg[0] === 'eventos' && new URLSearchParams(search).get('vista') === 'prospectos') return 'prospectos'
  return GUIDES[seg[0]!] ? seg[0]! : `inicio:${role}`
}

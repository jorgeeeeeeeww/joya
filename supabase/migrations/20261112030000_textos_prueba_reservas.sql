-- Datos provisionales para ensayar la página de reservaciones.
-- La página permanece apagada; sustituir estos borradores y completar los datos legales antes de recibir huéspedes.
update public.hospedaje_ajustes
set reservas_web = false,
    url_web = 'https://web-la-joya.jardineslajoya.workers.dev',
    telefono_hospedaje = '523335983198',
    politicas = $politicas$
BORRADOR DE PRUEBA TÉCNICA — NO USAR CON HUÉSPEDES REALES NI RECIBIR PAGOS

Este texto es provisional y solo sirve para revisar el funcionamiento del formulario. No hagas transferencias durante la prueba. Cualquier tarifa que aparezca se debe confirmar con el establecimiento antes de pagar.

Solicitud y fechas: al enviar el formulario se crea una solicitud y las fechas se apartan provisionalmente hasta la fecha y hora que aparecen en «Mi reservación». La solicitud requiere revisión y confirmación del establecimiento. Si vence el plazo indicado, la solicitud se cancela y las fechas se liberan.

Cancelación durante la prueba: una solicitud que todavía no tenga pagos puede cancelarse desde la liga «Mi reservación». Si por error se recibe dinero durante esta prueba, avisa por WhatsApp al 33 3598 3198; el monto recibido se devolverá completo después de identificar y verificar la transferencia.

No se deben considerar confirmadas las reservaciones de prueba ni presentarse a ocupar un hospedaje por haber enviado el formulario. Antes de aceptar reservaciones reales se publicarán la tarifa, las condiciones definitivas de confirmación, cambios, cancelación y cualquier cargo aplicable.
$politicas$,
    aviso_privacidad = $privacidad$
AVISO PROVISIONAL DE PRIVACIDAD — PRUEBA TÉCNICA

Este aviso se carga únicamente para probar el sistema. No debe usarse para recibir reservaciones reales. Antes de activar el servicio se debe completar la identidad legal y el domicilio del responsable.

Responsable: Jardines La Joya. La razón social o nombre legal completo y el domicilio del responsable están pendientes de confirmación.

Datos que puede solicitar el formulario: nombre, teléfono de contacto, correo electrónico si se proporciona, hospedaje elegido, fechas, número de huéspedes, hora estimada de llegada y comentarios opcionales. El sistema también genera un código y conserva el estado de la solicitud; puede procesar datos técnicos de conexión para proteger el sitio contra abuso. No escribas datos financieros, información sensible ni datos de otras personas en los comentarios.

Finalidades: consultar disponibilidad y tarifas, recibir y atender solicitudes, comunicarnos contigo sobre la estancia, compartir instrucciones de pago cuando correspondan, administrar cambios o cancelaciones y proteger la seguridad del sistema. Los datos no se usarán para publicidad en esta prueba.

Los datos se procesan en las plataformas tecnológicas necesarias para alojar, proteger y operar el sitio, la base de datos y sus notificaciones. No se solicitarán datos de tarjetas bancarias en el formulario. Solo se comunicarán datos a terceros cuando sea necesario para operar el servicio, exista una obligación legal o lo autorice la persona titular.

Conservación: los datos se conservarán durante el tiempo necesario para atender la solicitud y, cuando corresponda, cumplir obligaciones legales. Después se eliminarán o se disociarán cuando sea posible.

Derechos y contacto: para ejercer derechos de acceso, rectificación, cancelación u oposición, limitar el uso de los datos o hacer una pregunta, escribe al WhatsApp 33 3598 3198 con el asunto «Privacidad / ARCO». Indica tu nombre, el código de reservación si lo tienes, el derecho que deseas ejercer y la información necesaria para localizar la solicitud. Se verificará tu identidad antes de atenderla.

Cambios: la versión vigente de este aviso se mostrará en la página. La identidad legal y el domicilio del responsable, así como los procedimientos definitivos de atención, se completarán antes de abrir las reservaciones al público.
$privacidad$,
    actualizado = now()
where id = true;

# App de la Mac · audit antes de producción

Fecha: **12 de noviembre de 2026**. Revisé el código de `mac/src` y de `mac/src-tauri`, y corrí las pruebas:

- `tsc`: sin errores.
- `probar:base`: 22 de 22 bien.
- `probar`: 52 de 52 bien.

La base está sana. Lo que sigue es lo que falta para que, **el día que conectes la nube real, no haya sorpresas**. Está ordenado por importancia.


## Estado (12 de noviembre, noche)

Hecho y probado en localhost con la nube de prueba (tipos sin errores, `probar:base` 22/22, `probar` 52/52, compila):

- **Conexión:** franja «Sin internet · datos de hace X min» y acciones en pausa sin conexión (1, 2, 13); pantalla «Esta copia no está conectada al rancho» y compilación de `main` que falla sin las variables de Supabase (1); permiso de avisos explicado en el primer arranque y aviso en Hoy si está apagado (3); sesión vencida explicada en Entrar con el correo escrito (4).
- **Guardado:** Ajustes y Cabañas ya no pierden letras, avisan qué campo falta y guardan al salir o cambiar de ventana (9, 10, 11). Deshacer dura 14 s en pagos y cancelaciones (12).
- **Tarjeta «Para dejar todo listo»** en Hoy.
- **Focos:** el plano del rancho en Hoy y en Entrar; la tira de noches en el detalle de cada reservación.

Pendiente: recuperar contraseña (5) y buscar huéspedes antiguos en la nube (7), que necesitan una página en la web y una función nueva en la base. Cerrar con ⌘Q justo al escribir puede perder lo último.

---

## 1. Conexión

| # | Qué pasa hoy | Qué haría | Prioridad |
|---|---|---|---|
| 1 | Si GitHub compila sin `SUPABASE_URL`, la app sale apuntando a la nube local **sin que nadie se dé cuenta**: solo deja un aviso en la corrida. En la Mac del rancho se ve la pantalla de Entrar, pero no deja entrar. | En `main`, que la compilación **falle** si faltan las variables. Además, que la app muestre «Esta copia no está conectada al rancho» en vez de Entrar. | Alta |
| 2 | Cuando no hay internet, lo único que lo indica es un puntito rojo en la esquina de tu cuenta. Los datos guardados se siguen viendo, así que parece que todo funciona. Luego confirmas o registras un pago y falla. | Una franja arriba que diga «Sin internet · datos de hace 12 min» y que se quite sola cuando vuelva la conexión. Mientras no haya internet, confirmar, cobrar y mover quedan en pausa, con el motivo a la vista. | Alta |
| 3 | El permiso de avisos de macOS se pide **la primera vez que llega una solicitud**, en segundo plano. El cuadro de macOS sale de la nada, y si alguien le da «No permitir», las solicitudes ya no avisan nunca y nadie se entera. | Pedir el permiso al primer arranque, explicando para qué es. Si está apagado, avisarlo en Hoy y en Ajustes con un botón «Abrir Configuración de macOS». | Alta |
| 4 | Cuando la sesión vence, la app te saca a Entrar sin explicar por qué. | Que Entrar diga «Tu sesión venció, vuelve a entrar» y deje el correo ya escrito. | Media |
| 5 | No hay forma de recuperar la contraseña: hoy dice «Jorge la cambia desde la nube». Para recepción eso no sirve. | Agregar «¿Olvidaste tu contraseña?», que manda un correo con una liga a una página de la web para poner la nueva. Depende de que la web esté publicada. | Media |
| 6 | La Mac pide macOS 12. En macOS 12 y 13, con la ventana cerrada, la revisión cada 30 s se vuelve lenta. Las solicitudes llegan igual por tiempo real, pero es el plan B el que se debilita. | Revisar qué versión tiene la iMac del rancho. Si es la 14 o más nueva, no hay nada que hacer. | Revisar |
| 7 | La app baja las reservaciones desde 4 meses atrás. Si busques a un huésped que vino hace un año, ⌘F no lo encuentra. | Que la búsqueda, si no encuentra nada en lo bajado, pregunte también a la nube. Así reconoces a los clientes que regresan. | Media |
| 8 | La compilación del rancho deja abierta la puerta a la nube local (CSP). No es peligroso, pero sobra. | Quitarla cuando se compila con la nube real. | Baja |

## 2. Funciones: errores encontrados

| # | Qué pasa | Arreglo |
|---|---|---|
| 9 | **Ajustes puede perder letras.** Si sigues escribiendo mientras se está guardando, lo último que escribiste se marca como guardado sin haberse mandado. | Al terminar de guardar, comparar lo que se mandó con lo que hay en el campo, y volver a mandar si cambió. |
| 10 | **Ajustes se queda en «Cambios por guardar» para siempre** si un campo quedó a medias, como una CLABE incompleta. Y si sales de Ajustes antes de un segundo, lo último no se guarda. | Que el aviso diga exactamente qué campo falta. Que se guarde al salir de la pantalla y al cerrar la app (⌘Q). |
| 11 | En Cabañas, si cierras la app con ⌘Q justo después de escribir, puede no guardarse. | Lo mismo: guardar antes de cerrar. |
| 12 | «Deshacer» de un pago **nunca se probó**: el aviso se fue antes del clic. | Que el aviso de Deshacer dure más en pagos y cancelaciones, y probarlo. |
| 13 | Sin internet, mueves una reservación en el Calendario, se ve movida y luego brinca de regreso. | Se resuelve con el punto 2: sin conexión no se puede arrastrar. |

## 3. Lo que sumaría para dejarla lista

**«Listo para abrir»**: una sola tarjeta en Hoy, que solo aparece mientras falte algo. Reemplaza el aviso suelto de hoy y revisa todo lo que tienes que conectar:

- Nube del rancho conectada (no la local)
- Cuenta del dueño con permiso
- Cada hospedaje con precio, capacidad y al menos una foto
- CLABE válida y datos de contacto
- Correo de avisos funcionando (hoy existe `avisos_sin_enviar`)
- Avisos de macOS permitidos
- Abrir al prender la Mac
- Reservaciones de la web encendidas

Cada renglón lleva un botón que te manda a donde se arregla. Cuando todo está bien, la tarjeta desaparece. Así, el día que conectes todo, la misma app te dice si quedó bien.

## 4. Diseño: los focos

Hoy hay focos en dos lugares, y propongo cambiar los dos:

**A. Hoy: en vez del rancho de noche con la guirnalda, el plano del rancho visto desde arriba.**
Ya existe el plano real en metros (`web/src/data/plano.ts`), con lo que marcaste en el mapa. Cada lugar se pinta según la noche que elijas:

| Estado | Cómo se ve |
|---|---|
| Ocupado | Relleno de color |
| Solicitud | Contorno que late |
| Libre | Solo el contorno |
| Cerrado | Rayado |

Se queda el deslizador de las próximas 30 noches y el clic sobre cada lugar, que abre la reservación o crea una nueva. Ves *dónde* está cada quien, no solo cuántos hay.
Necesito ligar cada lugar del plano con su hospedaje en la nube, por el nombre corto (slug).

**B. Detalle de la reservación: en vez de los focos colgados, una tira de noches.**
Es una casilla por noche con su día («vie 14», «sáb 15»). Las casillas se llenan de color conforme se paga, y una marquita indica hasta dónde llega el anticipo. Si arrastras sobre la tira, registras el pago. Así se lee al instante qué noches están cubiertas.

**Entrar** también usa la escena con la guirnalda: pasaría a mostrar el mismo plano, sin datos.

Lo que **no** cambia: la luz (sol/luna) de la marca y los tres puntos de carga. No son focos.

Otro ajuste: cuando hay solicitudes por atender, ponerlas **arriba del plano**, no abajo. Lo urgente va primero.

---

## Orden en que lo haría

1. Conexión: puntos 1, 2, 3 y 4.
2. Errores de guardado: puntos 9 a 12.
3. La tarjeta «Listo para abrir».
4. Los focos: el plano en Hoy y la tira de noches en el Detalle.
5. Búsqueda en la nube y recuperar contraseña: puntos 5 y 7.

**Necesito de ti:**
- Tu aprobación.
- Que me digas qué versión de macOS tiene la iMac.

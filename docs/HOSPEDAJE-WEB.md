# Hospedaje: contrato para la web y guía de la app de la Mac

Este documento es la referencia exacta para conectar la web pública (`web/`) con la nube de hospedaje. Al final viene una guía corta de la app del dueño (`mac/`).

- **La base de datos** está en `supabase/migrations/20261105000000_hospedaje.sql`.
- **La función que crea solicitudes** está en `supabase/functions/reservar/`.
- **Las pruebas** son `cd mac && npm run probar`, que recorre todo el flujo de la web a la app, y `npm run probar:base`.

## 1. Qué puede hacer la web

La web no tiene cuenta ni lee tablas. Solo llama estas funciones con la **llave pública**:

| Llamada | Para qué |
|---|---|
| `ajustes_publicos()` | Horarios, anticipo, mínimo de noches, teléfonos, políticas y aviso de privacidad |
| `cabanas_publicas()` | Los hospedajes publicados (cabañas, casas y habitaciones) con fotos y precios |
| `disponibilidad(p_desde, p_hasta, p_cabana?)` | Las fechas ocupadas de cada hospedaje, sin nombres ni datos de nadie |
| `cotizar(p_cabana, p_llegada, p_salida, p_huespedes)` | El precio noche por noche, el total y el anticipo, calculados en la nube |
| `POST /functions/v1/reservar` | Crea la solicitud y aparta las fechas. Pasa por el anti-robots de Cloudflare |
| `consultar_reservacion(p_token)` | La página «Mi reservación» del huésped |
| `cancelar_mi_reservacion(p_token)` | El huésped cancela su solicitud si todavía no ha pagado |

Todo lo demás (confirmar, registrar pagos, ver nombres y teléfonos) lo hace el dueño desde la app de la Mac.

## 2. Conexión

### Variables de la web (Astro)

| Variable | En la computadora (`npm run nube:ejemplo`) | En producción |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54331` | `https://<proyecto>.supabase.co` |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_local` | `sb_publishable_…` (Supabase → Project Settings → API Keys) |
| `PUBLIC_TURNSTILE_SITE_KEY` | (vacía: la nube local no pide anti-robots) | La llave del sitio de Cloudflare Turnstile |

Las tres son públicas: pueden ir en el navegador. **La llave secreta (`sb_secret_…`) nunca va en la web.**

### Cómo se llama una función

Con `@supabase/supabase-js`:

```ts
import { createClient } from '@supabase/supabase-js'

const nube = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { data, error } = await nube.rpc('cotizar', { p_cabana: 'cabana-del-lago', p_llegada: '2026-12-12', p_salida: '2026-12-14', p_huespedes: 2 })
```

Sin librería, con `fetch`:

```ts
const URL_NUBE = import.meta.env.PUBLIC_SUPABASE_URL
const LLAVE = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY

async function llamar<T>(funcion: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${URL_NUBE}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: { apikey: LLAVE, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error('Sin conexión con la nube')
  return r.json()
}
```

- La llave nueva (`sb_publishable_…`) va **solo** en la cabecera `apikey`. No la pongas en `Authorization: Bearer`, porque no es un JWT.
- Los nombres de los parámetros llevan `p_` tal cual (`p_cabana`, `p_llegada`…).
- Si la llamada falla por la red o la nube devuelve un error HTTP, muestra «No pudimos conectar. Intenta de nuevo» y un botón de WhatsApp.

### Fechas y dinero

- **Fechas:** texto `YYYY-MM-DD`, en hora de Jalisco (`America/Mexico_City`).
- **Llegada y salida:** `llegada` es la primera noche y `salida` el día en que se van, así que esa noche queda libre. Del 12 al 14 son 2 noches.
- **Dinero:** pesos mexicanos (MXN) como número, con o sin centavos (`1450` o `1450.5`).
- **El precio lo da siempre la nube.** La web no calcula totales: muestra lo que devuelve `cotizar` y, después, lo que devuelve `reservar`.

### Respuestas con error

Las funciones públicas no lanzan errores de base de datos al huésped. Cuando algo no se puede, responden con:

```json
{ "ok": false, "motivo": "no_disponible", "mensaje": "Esas fechas ya están ocupadas en esta cabaña." }
```

- `mensaje` ya viene en español y se puede mostrar tal cual.
- `motivo` sirve para decidir qué hacer; por ejemplo, con `no_disponible` se reabre el calendario.

## 3. Funciones, una por una

### `ajustes_publicos()` (sin parámetros)

```json
{
  "reservas_web": true,
  "telefono_salon": "33 0000 0000",
  "telefono_hospedaje": "33 1111 1111",
  "hora_llegada": "15:00",
  "hora_salida": "12:00",
  "anticipo_pct": 50,
  "horas_apartado": 24,
  "noches_minimas": 1,
  "noches_fin_semana": [5, 6],
  "fecha_maxima": "2027-11-04",
  "max_noches": 30,
  "politicas": "Texto que escribe el rancho…",
  "aviso_privacidad": "Texto que escribe el rancho…"
}
```

| Campo | Qué es |
|---|---|
| `reservas_web` | Si es `false`, la web **no** muestra el botón «Reservar». En su lugar ofrece WhatsApp con `telefono_hospedaje`. Viene apagado hasta que el rancho lo prende desde la app |
| `telefono_salon` | Teléfono de contacto del salón de eventos. Solo se muestra; la web no reserva el salón |
| `telefono_hospedaje` | WhatsApp de reservaciones. Puede venir con espacios: para armar `https://wa.me/52…`, deja solo los dígitos |
| `hora_llegada`, `hora_salida` | Formato `HH:MM`, o `null` si el rancho no las ha capturado |
| `anticipo_pct` | Porcentaje del total que se paga para apartar (0 a 100). Con `0` no se pide anticipo |
| `horas_apartado` | Cuántas horas quedan apartadas las fechas de una solicitud sin confirmar |
| `noches_minimas` | Mínimo general de noches. Cada hospedaje o temporada puede pedir más |
| `noches_fin_semana` | Noches que cobran tarifa de fin de semana: 1 = lunes … 7 = domingo. `[5, 6]` son las noches de viernes y sábado |
| `fecha_maxima` | Última fecha de llegada que se puede pedir |
| `max_noches` | Estancia más larga que se acepta en línea (30). Para más noches, WhatsApp |
| `politicas`, `aviso_privacidad` | Textos del rancho, con saltos de línea. Pueden venir `null`; mientras no existan, no se ofrece reservar |

### `cabanas_publicas()` (sin parámetros)

Devuelve una lista ordenada como la acomoda el rancho. Solo trae los hospedajes con «Publicada» encendido.

```json
[
  {
    "slug": "cabana-del-lago",
    "nombre": "Cabaña del Lago",
    "tipo": "cabana",
    "resumen": "Una línea para la tarjeta",
    "descripcion": "Texto largo…",
    "capacidad": 4,
    "recamaras": 2,
    "camas": "1 matrimonial y 2 individuales",
    "banos": 1,
    "amenidades": ["Wi-Fi", "Asador"],
    "fotos": [{ "ruta": "cabana-del-lago/1730761234-portada.webp", "ancho": 1600, "alto": 1067, "alt": "Terraza con vista" }],
    "precio_noche": 1000,
    "precio_fin_semana": 1200,
    "precio_desde": 1000,
    "huespedes_incluidos": 2,
    "precio_huesped_extra": 150,
    "noches_minimas": 1,
    "reservable": true
  }
]
```

| Campo | Qué es |
|---|---|
| `slug` | Identificador para la dirección (`/hospedaje/cabana-del-lago`) y para `cotizar` y `reservar` |
| `tipo` | `"cabana"` (cabaña), `"casa"` (casa amueblada) o `"habitacion"` (habitación de hotel) |
| `fotos` | La primera es la portada. La dirección de cada foto es `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/cabanas/${ruta}`; si la ruta tiene espacios o acentos, codifica cada parte con `encodeURIComponent`. `ancho` y `alto` sirven para reservar el espacio y que la página no brinque |
| `precio_desde` | El menor entre noche normal y fin de semana. Sirve para «desde $1,000 la noche». Las temporadas pueden costar más |
| `huespedes_incluidos`, `precio_huesped_extra` | Si existen, cada persona arriba de las incluidas paga el extra por noche |
| `reservable` | `false` si el rancho no ha puesto precio: se muestra la ficha con «Pregunta por WhatsApp», sin calendario |
| Cualquier campo de texto o número | Puede venir `null`: la web lo omite, sin inventar nada |

### `disponibilidad(p_desde, p_hasta, p_cabana?)`

```ts
await nube.rpc('disponibilidad', { p_desde: '2026-11-01', p_hasta: '2027-01-31' })               // todas
await nube.rpc('disponibilidad', { p_desde: '2026-11-01', p_hasta: '2027-01-31', p_cabana: 'cabana-del-lago' }) // una
```

```json
[
  { "cabana": "cabana-del-lago", "ocupado": [{ "desde": "2026-12-12", "hasta": "2026-12-14" }, { "desde": "2026-12-24", "hasta": "2026-12-27" }] },
  { "cabana": "casa-grande", "ocupado": [] }
]
```

- **`hasta` no se cuenta:** es el día de salida, así que esa noche está libre y alguien puede llegar ese mismo día. En el ejemplo, las noches del 12 y del 13 están ocupadas y el 14 se puede llegar.
- Junta reservaciones, solicitudes apartadas y cierres del rancho, sin decir cuál es cuál.
- Pide como máximo 400 días por llamada.
- Las fechas pueden ocuparse mientras el huésped llena el formulario. La respuesta final la da siempre `cotizar` y, al final, `reservar`.

### `cotizar(p_cabana, p_llegada, p_salida, p_huespedes)`

```ts
await nube.rpc('cotizar', { p_cabana: 'cabana-del-lago', p_llegada: '2026-12-11', p_salida: '2026-12-13', p_huespedes: 3 })
```

Cuando sí se puede:

```json
{
  "ok": true,
  "cabana": "cabana-del-lago",
  "llegada": "2026-12-11",
  "salida": "2026-12-13",
  "huespedes": 3,
  "noches": 2,
  "desglose": [
    { "fecha": "2026-12-11", "precio": 1200, "tipo": "fin_semana", "temporada": null },
    { "fecha": "2026-12-12", "precio": 1200, "tipo": "fin_semana", "temporada": null }
  ],
  "subtotal": 2400,
  "extra": 300,
  "total": 2700,
  "anticipo": 1350,
  "anticipo_pct": 50,
  "horas_apartado": 24,
  "minimo_noches": 1
}
```

- **`desglose`:** el precio de cada noche. `tipo` puede ser `"normal"`, `"fin_semana"` o `"temporada"`, y en una temporada `temporada` trae su nombre (por ejemplo «Navidad»).
- **`extra`:** lo que se cobra por las personas adicionales en toda la estancia. Si es `0`, no se muestra.
- **`anticipo`:** lo que se paga para apartar. Si es `0`, no se pide transferencia.

Cuando no se puede, devuelve `{ ok: false, motivo, mensaje }`:

| `motivo` | Cuándo | Qué hace la web |
|---|---|---|
| `cerrado` | El rancho apagó las reservas en línea | Ofrecer WhatsApp |
| `no_existe` | El `slug` no existe o no está publicado | Volver a la lista |
| `fechas_invalidas` | La salida no es después de la llegada | Pedir otras fechas |
| `pasado` | La llegada es antes de hoy | Pedir otras fechas |
| `muy_lejos` | La llegada es después de `fecha_maxima` | Mostrar el mensaje |
| `muy_largo` | Más de 30 noches | Ofrecer WhatsApp |
| `huespedes` | Faltan las personas o el número no es válido | Pedir el número |
| `capacidad` | Son más personas de las que caben | Bajar personas o sugerir otro hospedaje |
| `sin_precio` | Falta el precio de alguna noche | Ofrecer WhatsApp |
| `minimo_noches` | No se cumple el mínimo (trae `minimo_noches`) | Alargar la estancia |
| `no_disponible` | Alguna noche ya está ocupada | Volver al calendario |

### `POST /functions/v1/reservar`: crea la solicitud

```ts
const r = await fetch(`${URL_NUBE}/functions/v1/reservar`, {
  method: 'POST',
  headers: { apikey: LLAVE, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cabana: 'cabana-del-lago',   // slug
    llegada: '2026-12-11',
    salida: '2026-12-13',
    huespedes: 3,
    nombre: 'Ana López',          // 2 a 120 letras
    telefono: '33 1234 5678',     // WhatsApp; se guardan solo los dígitos (10 a 13)
    correo: 'ana@correo.mx',      // opcional
    hora_llegada: '17:00',        // opcional, texto libre corto («como a las 5»)
    comentarios: 'Llegamos con un perro pequeño', // opcional, hasta 1000 letras
    acepto: true,                 // aceptó políticas y aviso de privacidad (obligatorio)
    turnstile: tokenDeTurnstile,  // obligatorio en producción
  }),
})
const respuesta = await r.json()
```

Respuesta **200**:

```json
{
  "ok": true,
  "codigo": "LJ-7K2Q",
  "token": "3f0c…-…",
  "estado": "solicitud",
  "vence": "2026-11-06T02:15:00.000+00:00",
  "cabana": { "slug": "cabana-del-lago", "nombre": "Cabaña del Lago" },
  "llegada": "2026-12-11",
  "salida": "2026-12-13",
  "noches": 2,
  "huespedes": 3,
  "total": 2700,
  "anticipo": 1350,
  "desglose": [ … ],
  "pago": { "banco": "BBVA", "clabe": "012345678901234567", "titular": "Nombre del titular", "referencia": "LJ-7K2Q", "monto": 1350 },
  "liga": "https://jardineslajoya.mx/mi-reservacion?t=3f0c…"
}
```

| Campo | Qué hace la web con él |
|---|---|
| `codigo` | Mostrarlo grande. Es lo que el huésped dicta por teléfono y pone como referencia de la transferencia |
| `vence` | Momento en UTC. Mostrarlo en hora de Jalisco: «Tus fechas quedan apartadas hasta el jueves 5 a las 20:15» |
| `pago` | Si existe, mostrar banco, CLABE (con botón «Copiar»), titular, monto y referencia. Es `null` si no hay anticipo o si el rancho no ha puesto CLABE; en ese caso: «Te confirmamos por WhatsApp» |
| `token` | Guárdalo en el navegador (`localStorage`) para volver a «Mi reservación» desde el mismo teléfono. Es privado: no lo muestres |
| `liga` | La dirección privada de «Mi reservación». Es `null` si el rancho no ha capturado la dirección de la web; entonces armala con `/mi-reservacion?t=${token}` |

Errores: siempre `{ ok: false, motivo, mensaje }`.

| HTTP | `motivo` | Cuándo |
|---|---|---|
| 400 | `datos` | El cuerpo no es JSON o las fechas no se entienden |
| 400 | `robot` | Falta el token de Turnstile o no pasó. Reinicia el widget (`turnstile.reset()`) y pide que lo intente otra vez |
| 400 | `nombre`, `telefono`, `correo` | Campo inválido: marca ese campo |
| 400 | `acepto` | No aceptó políticas y aviso de privacidad |
| 400 | Cualquier motivo de `cotizar` | Por ejemplo `capacidad`, `minimo_noches` o `cerrado` |
| 409 | `no_disponible` | Alguien apartó esas fechas segundos antes: vuelve al calendario |
| 429 | `demasiados` | Más de 8 solicitudes en una hora desde la misma conexión, o 3 solicitudes pendientes con el mismo WhatsApp |
| 403 | `origen` | La página que llama no está en `RESERVAS_ORIGENES` |
| 502 | `servidor` | La nube no respondió: «Intenta de nuevo en un momento» y WhatsApp |

Al crearse la solicitud, la nube aparta las fechas por `horas_apartado` horas. Además le manda al dueño un correo, un aviso en la Mac y un número en el Dock, y si el huésped dio correo, le manda el acuse con los datos de pago. Si el dueño no la confirma antes de que venza, se cancela sola y las fechas se liberan.

### `consultar_reservacion(p_token)`: página «Mi reservación»

La dirección es `/mi-reservacion?t=<token>`. La nube arma las ligas de los correos con `url_web` + `/mi-reservacion?t=` + token, así que **la web necesita esa página exacta**.

```ts
await nube.rpc('consultar_reservacion', { p_token: token })
```

```json
{
  "ok": true,
  "codigo": "LJ-7K2Q",
  "estado": "confirmada",
  "motivo_cancelacion": null,
  "cabana": { "slug": "cabana-del-lago", "nombre": "Cabaña del Lago" },
  "llegada": "2026-12-11",
  "salida": "2026-12-13",
  "noches": 2,
  "huespedes": 3,
  "nombre": "Ana",
  "total": 2700,
  "anticipo": 1350,
  "pagado": 1350,
  "saldo": 1350,
  "vence": null,
  "hora_llegada": "15:00",
  "hora_salida": "12:00",
  "pago": { "banco": "BBVA", "clabe": "012345678901234567", "titular": "…", "referencia": "LJ-7K2Q", "monto": 1350 },
  "puede_cancelar": false,
  "telefono_hospedaje": "33 1111 1111"
}
```

| `estado` | Qué se le dice al huésped |
|---|---|
| `solicitud` | «Recibimos tu solicitud. Tus fechas están apartadas hasta {vence}.» Si hay `pago`, mostrar los datos para transferir el anticipo |
| `confirmada` | «Tu reservación está confirmada.» Si `saldo > 0`, mostrar el saldo y `pago` (ahora trae el saldo) |
| `pagada` | «Todo listo. Te esperamos el {llegada} a partir de las {hora_llegada}.» |
| `cancelada` | Según `motivo_cancelacion`: `huesped` («La cancelaste»), `rancho` («El rancho la canceló; escríbenos») o `vencida` («Venció el apartado; puedes hacer una nueva solicitud») |

- `nombre` trae solo el primer nombre.
- `pago` sale solo mientras falta algo por pagar y la reservación está activa.
- Error: `{ ok: false, motivo: "no_existe" }` cuando la liga está mal o es inventada.

### `cancelar_mi_reservacion(p_token)`

Solo se muestra el botón cuando `puede_cancelar` es `true`, es decir, una solicitud sin pagos. Antes de llamar, pide que lo confirme («¿Cancelar tu solicitud LJ-7K2Q?»).

- **Si se puede:** devuelve lo mismo que `consultar_reservacion`, ya con `estado: "cancelada"` y `motivo_cancelacion: "huesped"`.
- **Si no se puede:** devuelve `{ ok: false, motivo: "no_se_puede" }` (ya está confirmada o tiene pagos). En ese caso se ofrece WhatsApp.

## 4. Anti-robots (Cloudflare Turnstile)

1. En Cloudflare → Turnstile, crea un widget para el dominio de la web (modo «Managed»). Te da dos llaves:
   - **Llave del sitio:** va en la web como `PUBLIC_TURNSTILE_SITE_KEY`.
   - **Llave secreta:** va en Supabase como el secreto `TURNSTILE_SECRET`. Nunca va en la web.
2. En el formulario de datos del huésped, carga `https://challenges.cloudflare.com/turnstile/v0/api.js` y pon el widget con la llave del sitio y en español (`language: 'es'`).
3. Cuando el widget entrega el token, mándalo en el campo `turnstile` de `reservar`.
4. **El token sirve una sola vez y dura 5 minutos.** Si `reservar` responde `robot`, o el huésped tarda, llama a `turnstile.reset()` antes de reintentar.
5. **En la computadora:** la nube local no pide Turnstile mientras no exista `TURNSTILE_SECRET`. Si la web no tiene `PUBLIC_TURNSTILE_SITE_KEY`, no dibuja el widget y manda la solicitud sin token.

## 5. El flujo completo del huésped

1. **Al abrir la web:** se llaman `ajustes_publicos()` y `cabanas_publicas()`, una sola vez por visita.
   - Si `reservas_web` es `false`, o faltan `politicas` o `aviso_privacidad`, los botones dicen «Reservar por WhatsApp».
2. **Elegir hospedaje y fechas:** el calendario pinta las noches ocupadas con `disponibilidad()` (de hoy a `fecha_maxima`). No deja elegir noches ocupadas y respeta el mínimo de noches.
3. **Cotizar:** con cada cambio de fechas o personas se llama `cotizar()`.
   - Si `ok` es `true`: se muestra el total, el desglose noche por noche, el extra si lo hay y el anticipo.
   - Si no: se muestra `mensaje` y se actúa según `motivo` (tabla de arriba).
4. **Datos del huésped:**
   - nombre y WhatsApp (obligatorios);
   - correo, hora aproximada de llegada y comentarios (opcionales);
   - la casilla «Acepto las políticas y el aviso de privacidad», con ligas a esos textos;
   - el widget de Turnstile.
5. **Enviar:** se llama `reservar`. Mientras responde, el botón queda ocupado para no mandar dos veces.
6. **Confirmación:**
   - el código `LJ-…` grande;
   - hasta cuándo quedan apartadas las fechas;
   - los datos para transferir el anticipo, con «Copiar CLABE»;
   - «Mándanos tu comprobante por WhatsApp», con el mensaje ya escrito: `Hola, hice la solicitud LJ-7K2Q y te mando mi comprobante`;
   - la liga a «Mi reservación».
7. **Después:** el huésped vuelve a «Mi reservación» con su liga. Ahí ve cómo va (solicitud → confirmada → pagada) y, mientras no haya pagado, puede cancelar.

Del lado del rancho, la app de la Mac recibe la solicitud al instante (aviso de macOS y número en el Dock). El dueño ve la transferencia en su banco, la registra en la app y la reservación pasa sola a confirmada. Cuando se cubre el total, pasa a pagada. Con «Avisar por WhatsApp», la app abre el mensaje ya escrito para el huésped.

## 6. Probar en la computadora

```bash
cd mac
npm install
npm run nube:ejemplo
```

- La nube local queda en `http://127.0.0.1:54331`, con la llave pública `sb_publishable_local`.
- Trae hospedajes de prueba: dos cabañas, una casa y una habitación, con precios de prueba.
- Las reservas en línea vienen encendidas.
- La web se arranca con `PUBLIC_SUPABASE_URL=http://127.0.0.1:54331` y `PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local`.

Para revisar lo que pasa por dentro:

- `http://127.0.0.1:54331/__estado`: cuántas cabañas, reservaciones y solicitudes hay.
- `http://127.0.0.1:54331/__correos`: los correos que se habrían mandado (al dueño y al huésped).
- `npm run probar`: recorre todo el flujo de la web a la app con su propia nube en memoria.

## 7. Puesta en marcha (lo hace Jorge o el dueño)

- **En Supabase:**
  - Aplica la migración y publica las funciones `reservar` y `avisos-hospedaje`.
  - Agrega los secretos: `TURNSTILE_SECRET`, `RESERVAS_ORIGENES` (la dirección de la web, por ejemplo `https://jardineslajoya.mx`), `RESEND_API_KEY` y `AVISOS_REMITENTE`.
- **En Cloudflare Pages (la web):** agrega las variables `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `PUBLIC_TURNSTILE_SITE_KEY`.
- **En la app de la Mac → Ajustes**, el dueño captura:
  - la dirección de la web (para las ligas «Mi reservación»);
  - el correo de avisos, los horarios, el anticipo y la CLABE;
  - las políticas y el aviso de privacidad;
  - al final, enciende «Recibir reservaciones en la web».

---

# Guía corta de la app de la Mac

La app se llama **La Joya** y se instala con el `.dmg`; los pasos completos están en [`mac/INSTALAR.md`](../mac/INSTALAR.md). La primera vez, macOS pide permiso una sola vez en Ajustes del Sistema → Privacidad y seguridad → «Abrir de todos modos». Funciona en Mac Intel y Apple Silicon con macOS 12 o más nuevo.

**Entrar:** con el correo y la contraseña de la cuenta del dueño en Supabase. La sesión se queda guardada.

**Las cinco pantallas** (⌘1 a ⌘4, y ⌘, para Ajustes):

| Pantalla | Para qué |
|---|---|
| **Hoy** | Solicitudes por atender, cada una con su cuenta regresiva y botones para confirmar o avisar por WhatsApp. Llegadas y salidas del día. El rancho de noche, con los hospedajes ocupados encendidos |
| **Calendario** | Hospedajes contra días. Arrastra sobre días libres para crear una reservación o cerrar fechas, arrastra una reservación para moverla y su orilla para alargarla. ⌘T vuelve a hoy |
| **Reservaciones** | Lista y detalle lado a lado, como en Mail. Confirmar, registrar pagos, cancelar y «Avisar por WhatsApp» con el mensaje ya escrito |
| **Cabañas** | Datos, fotos (se arrastran desde Finder), precios, temporadas y la vista previa de cómo sale en la web |
| **Ajustes** | Horarios, anticipo, horas de apartado, CLABE, políticas, aviso de privacidad, teléfonos, encender las reservas en la web y la apariencia |

**Atajos:** ⌘N nueva reservación · ⇧⌘N cerrar fechas · ⌘F buscar (nombre, código, WhatsApp o correo) · ⌘R actualizar · clic derecho sobre cualquier reservación para sus acciones.

**Avisos:** cada solicitud nueva llega como aviso de macOS y suma al número del Dock y de la barra de menú. La app abre sola al prender la Mac (se puede apagar en Ajustes) y sigue en la barra de menú aunque se cierre la ventana. Si la Mac está apagada, la solicitud espera en la nube y el dueño también recibe un correo.

**Actualizaciones:** en Ajustes → «Buscar actualización». Se instalan con un clic.

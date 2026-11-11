# Reservas en línea: guía definitiva

Actualizada el 10 de noviembre de 2026. La cuenta, el proyecto y la dirección de Supabase están en `joya/CUENTAS.local`, un archivo que no se sube a GitHub.

```
Página web (Cloudflare Pages)  ──►  Supabase  ◄──  App de la Mac (dueño)
  ve, cotiza, pide y consulta        una sola base     confirma, cobra, cierra fechas,
  «Mi reservación»                   para todo          cambia precios, fotos y textos
```

Las tres piezas usan la misma base, así que todo queda sincronizado solo:

- **Lo que cambia el dueño en la app** (precio, capacidad, fotos, textos, «Publicada», fechas cerradas) se ve en la página en cuanto alguien la abre o la recarga.
- **Lo que pide un huésped en la página** le llega a la app al instante.

---

## 1. Lo que ya quedó hecho

| Pieza | Estado |
|---|---|
| Base de datos en Supabase (`ugfqgophrpaotnvikehf`) | ✅ Lista, con todas las migraciones |
| Función `reservar` (la página crea solicitudes) | ✅ Publicada y probada: llega a la base |
| Función `avisos-hospedaje` (correos) | ✅ Publicada; falta configurar los correos (paso 4) |
| Tarea de cada 10 minutos (vence apartados) | ✅ Activa (`la-joya-hospedaje`) |
| **Los 12 hospedajes de la página, dados de alta en la base** | ✅ Con los mismos nombres de la página y del mapa |
| La página apunta a esta base al compilar (`web/.env.production`, no se sube a git) | ✅ Probado: lee los hospedajes reales |
| App de la Mac apuntando a esta base | ✅ La compilación del 5 de noviembre ya trae la dirección |
| Reservas en línea | ⏸ **Apagadas a propósito** hasta que el dueño ponga precios y textos. Mientras tanto la página ofrece WhatsApp |

### Los 12 hospedajes en la base

| Hospedaje | Para cuántos | En la página |
|---|---|---|
| Sabas | 6 | Publicada |
| Cabaña San Miguel | 10 | Publicada |
| Cabaña Elena | 4 | Publicada |
| Habitación 1, 2 y 3 | 2 | Publicadas |
| Habitación 11 a 16 | **Falta el dato** | **Sin publicar** |

- **Habitaciones 11 a 16:** la base exige un número de personas, así que quedaron con 1 provisional y sin publicar. Cada una lleva una nota en la app que dice qué falta.
- **Precios:** vacíos en los 12; los pone el rancho en la app.
- **Fotos:** la página usa las suyas. Si el dueño sube fotos desde la app, la página usa esas.
- **Nombres:** no les cambies el nombre a algo que el mapa no reconozca (por ejemplo «Suite Jardín»): la página lo dejaría de mostrar. Variantes como «Hab. 12» o «Cuarto 3» sí sirven.
- **Si hace falta volver a cargarlos:** el archivo `supabase/datos/lugares-del-rancho.sql` se puede correr otra vez sin duplicar nada.

---

## 2. Lo que tienes que hacer tú

### Paso 1 · Dar permiso de dueño a la cuenta de la app

En Supabase hay una sola cuenta, `migueldavalos@lajoya.com`, y todavía **no tiene puesto**: si entra a la app, la app le dice que no tiene permiso.

- **Si esa es la cuenta del dueño:** en Supabase → **SQL Editor**, corre:
  ```sql
  insert into public.profiles (id, role, display_name)
  select id, 'admin', 'Dueño' from auth.users where email = 'migueldavalos@lajoya.com'
  on conflict (id) do update set role = 'admin';
  ```
- **Si es otra persona:** crea la del dueño en Authentication → Users → **Add user** (contraseña de 10 o más letras, «Auto confirm») y corre lo mismo con su correo.

### Paso 2 · Instalar la app en la Mac

1. Baja el instalador: GitHub → repositorio `joya` → **Actions** → «App de la Mac» → la corrida en verde del 5 de noviembre → **Artifacts** → `la-joya-Mac`.
   - **Se borra alrededor del 5 de diciembre.** Después, en esa misma pantalla, da **Run workflow** para sacar uno nuevo.
2. Instálala con [`mac/INSTALAR.md`](../mac/INSTALAR.md), pasos 3 a 5.
3. Entra con la cuenta del dueño.

### Paso 3 · El dueño configura todo en la app

1. **Cabañas** (los 12 ya están ahí):
   - en cada uno, el precio por noche y el de fin de semana;
   - en las habitaciones 11 a 16, la capacidad real, y enciende **Publicada**;
   - si quiere: descripción, camas, baños, amenidades y fotos.
2. **Ajustes:**
   - horas de llegada y de salida;
   - anticipo (%) y horas que se apartan las fechas;
   - banco, CLABE y titular;
   - WhatsApp de hospedaje: pon **33 3598 3198**, el mismo del botón «Llamar» de la página;
   - correo de avisos;
   - **políticas** y **aviso de privacidad**: sin estos dos la página no ofrece reservar;
   - la dirección de la web: por ahora la de `…pages.dev` (paso 5), y cuando tengas dominio, el dominio.
3. **Al final:** enciende **«Recibir reservaciones en la web»**. Desde ese momento la página deja de mandar a WhatsApp y reserva en línea.

### Paso 4 · Correos (opcional; las reservas funcionan sin esto)

Sin esto, el dueño igual se entera de cada solicitud por la app (aviso y número en el Dock). No pude cargar las claves yo: el modo en que trabajo no me deja escribir secretos.

1. **Clave de las tareas programadas.** En Git Bash, genera una:
   ```bash
   openssl rand -hex 32
   ```
2. **Guárdala en Vault.** En Supabase → SQL Editor, cambiando `LA-CLAVE` por la que salió:
   ```sql
   select vault.create_secret('https://ugfqgophrpaotnvikehf.supabase.co', 'project_url');
   select vault.create_secret('LA-CLAVE', 'cron_secret');
   ```
3. **Crea la cuenta de Resend** (resend.com).
   - Cuando tengas dominio, verifícalo en Resend → Domains.
   - Mientras tanto, Resend solo deja mandar al correo con el que creaste la cuenta.
4. **Carga los secretos de las funciones.** En Git Bash, dentro de `joya`:
   ```bash
   npx supabase secrets set --project-ref ugfqgophrpaotnvikehf CRON_SECRET=LA-CLAVE RESEND_API_KEY=re_XXXX AVISOS_REMITENTE="La Joya <reservas@TU-DOMINIO>"
   ```

### Paso 5 · Subir la página a Cloudflare Pages

La página vive en su propio repositorio, `jorgeeeeeeeww/web-la-joya`. Lo más cómodo es conectarlo a Cloudflare: cada vez que subes cambios a `main`, Cloudflare la vuelve a publicar sola.

1. **Guarda y sube los cambios de `web/`.** Ahí está la corrección de «Mi reservación», que todavía no está en git.
2. Entra a **dash.cloudflare.com** → **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git**.
   - Autoriza a GitHub y elige `web-la-joya`.
3. **Configuración de compilación:**

   | Campo | Valor |
   |---|---|
   | Project name | `jardines-la-joya` (será `jardines-la-joya.pages.dev`) |
   | Production branch | `main` |
   | Framework preset | Astro |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | (vacío) |

4. **Variables de entorno** (en la misma pantalla, *Environment variables*):

   | Variable | Valor |
   |---|---|
   | `PUBLIC_SUPABASE_URL` | `https://ugfqgophrpaotnvikehf.supabase.co` |
   | `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | La llave pública `sb_publishable_…`. Está en `web/.env.production` y en GitHub → `joya` → Settings → Variables |
   | `NODE_VERSION` | `24` |

   - Las tres son públicas.
   - **La llave secreta `sb_secret_…` nunca va aquí.**
5. Da **Save and Deploy**. En 2 o 3 minutos queda en `https://jardines-la-joya.pages.dev`.
6. **Comprueba** en `…pages.dev/reservar`:
   - salen los hospedajes;
   - con las reservas apagadas, el botón es de WhatsApp;
   - después del paso 3, ya reserva en línea.

**Si cambias una variable,** vuelve a publicar: Deployments → los tres puntos del último → **Retry deployment**. Las variables quedan dentro de la página al compilar.

**Sin conectar GitHub** (subir a mano), desde la carpeta `web`:

```bash
npm run build
npx wrangler pages deploy dist --project-name jardines-la-joya
```

La primera vez, `wrangler` abre el navegador para entrar a Cloudflare. Este camino usa `web/.env.production`, que ya apunta a la base real.

### Paso 6 · Cuando tengas el dominio

1. **El dominio en Cloudflare:** agrégalo (Add a domain) y cambia los DNS donde lo compraste por los que te da Cloudflare.
2. **Conéctalo a la página:** Pages → `jardines-la-joya` → **Custom domains** → agrega `tudominio.com` y `www.tudominio.com`.
3. **El anti-robots (Turnstile):**
   1. Cloudflare → **Turnstile** → Add widget, con el dominio y el `…pages.dev`, en modo **Managed**.
   2. La **llave del sitio** va en Pages como `PUBLIC_TURNSTILE_SITE_KEY`; después vuelve a publicar.
   3. La **llave secreta** va en Supabase:
      ```bash
      npx supabase secrets set --project-ref ugfqgophrpaotnvikehf TURNSTILE_SECRET=0x4AAAA_XXXX
      ```
   4. **Pon las dos el mismo día.** Con solo la secreta, la base rechaza todas las solicitudes.
4. **Que solo tu página pueda reservar:**
   ```bash
   npx supabase secrets set --project-ref ugfqgophrpaotnvikehf RESERVAS_ORIGENES=https://tudominio.com,https://www.tudominio.com,https://jardines-la-joya.pages.dev
   ```
   Mientras no exista este secreto, se acepta desde cualquier página. No es grave porque la base igual valida todo, pero conviene ponerlo.
5. **El dominio en tres lugares más:**
   - en `web/astro.config.mjs` (`site:`), que hoy dice `jardineslajoya.com`;
   - en la app → Ajustes → dirección de la web;
   - en el remitente de los correos.

### Paso 7 · Prueba final con el celular

1. En la página, elige un hospedaje y fechas: debe salir el total noche por noche y el anticipo.
2. Envía la solicitud: debe salir el código `LJ-…` y los datos para transferir.
3. **En la Mac:** aparece en «Por atender» con aviso. Confírmala.
4. Abre «Ver mi reservación» en el celular: debe decir confirmada.
5. Desde la app, cancélala para que esas fechas queden libres otra vez.

Si algo falla, en Supabase → Edge Functions → `reservar` → **Logs** se ve el motivo.

---

## 3. Auditoría y pruebas

- **Todo se probó:** el contrato entre la página, la base y la app coincide; las pruebas del proyecto dan 22 de 22 y 52 de 52.
- **La simulación con los 12 lugares da 48 de 48:** cualquier fecha de un año, 400 solicitudes al azar, 60 a la vez, rechazos, confirmar, cobrar, cancelar, vencimientos y límites anti-abuso.
- **Nunca se vende dos veces la misma noche:** lo impide la propia base, venga de la página, de la Mac o de dos personas al mismo segundo.
- **Corregido en la página** (`web/src/scripts/mi-reservacion.ts`):
  - una reservación confirmada sin pagos pedía «liquidar el saldo» con el monto del anticipo;
  - una liga inválida decía «No pudimos conectar».
- **Para repetirlo en la computadora:**
  - `cd mac && node nube-local/simular-rancho.mjs`;
  - «rancho-real» en `.claude/launch.json`: la página y la app con una base de prueba de los 12 lugares.
- **Aparte:** el «Respaldo nocturno» de GitHub (del PWA) falla todos los días desde el 7 de noviembre.

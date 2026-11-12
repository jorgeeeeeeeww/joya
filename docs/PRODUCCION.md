# Puesta en producción: la página y la app de la Mac

Actualizada el 12 de noviembre de 2026. Es la guía de principio a fin. Los detalles de las reservas (cómo se calculan, qué valida la base, la auditoría) siguen en [GUIA-RESERVAS.md](GUIA-RESERVAS.md); la instalación de la app paso a paso, en [mac/INSTALAR.md](../mac/INSTALAR.md).

```
Página web (Cloudflare)  ──►  Supabase (ugfqgophrpaotnvikehf)  ◄──  App de la Mac (dueño)
  ve, cotiza, pide,             una sola base para todo             confirma, cobra, cierra
  «Mi reservación»                                                  fechas, precios, fotos, textos
```

La cuenta, el proyecto y las contraseñas están en `joya/CUENTAS.local`, que no se sube a GitHub.

---

## 0. Cómo está hoy (revisado el 12 nov)

| Pieza | Estado |
|---|---|
| **Nube (Supabase)** | ✅ Encendida y respondiendo. Tiene todas las funciones de hospedaje. Se ven 6 hospedajes publicados (Sabas, San Miguel, Elena y Habitaciones 1–3); las 11 a 16 están sin publicar a propósito |
| **Reservas en línea** | ⏸ Apagadas: no hay precios, horarios, políticas ni aviso de privacidad. Mientras, la página manda a WhatsApp |
| **App de la Mac** | ✅ La compilación del 11 nov ya apunta a la nube real. Tipos sin errores, pruebas 22 de 22 y 52 de 52, y la simulación de los 12 hospedajes 48 de 48 |
| **App de la Mac en una Mac de verdad** | ❌ Nunca se ha abierto con la cuenta real. Es lo primero que hay que probar (sección 3) |
| **Cuenta del dueño** | ⚠️ No se puede comprobar desde aquí si ya tiene permiso de dueño. Si al entrar la app dice «no tienes permiso», haz la sección 2 |
| **Actualizaciones automáticas de la app** | ❌ Faltan dos secretos en GitHub. Mientras, cada versión nueva se instala a mano (sección 7) |
| **Respaldo nocturno** | ❌ Falla todos los días desde el 7 nov: faltan secretos en GitHub (sección 8) |
| **Página web** | ✅ Lista en la rama `portada-movil` de `web-la-joya`, con la portada nueva, la carga rápida y el candado para Vercel. `main` todavía tiene la versión anterior |

**Orden recomendado:** 1 → 2 → 3 → 4 (con el cliente) → 5 → 6. Las secciones 7 y 8 se pueden hacer cualquier día; la 9 es opcional.

---

## 1. Vista temporal en Vercel, para enseñarla al cliente

Solo para mostrarla. Pide la contraseña **1144** (un cuadro sin texto); sin ella no sale ni la página ni las fotos. El candado vive en `web/middleware.js` y **solo funciona en Vercel**.

1. Entra a **vercel.com** → **Add New… → Project** → importa `jorgeeeeeeeww/web-la-joya`.
2. Configuración:

   | Campo | Valor |
   |---|---|
   | Framework Preset | Astro (lo detecta solo) |
   | Root Directory | (vacío) |
   | Build Command / Output | los que pone solo (`npm run build`, `dist`) |

3. **Environment Variables** (las tres son públicas; la llave secreta `sb_secret_…` nunca va aquí):

   | Variable | Valor |
   |---|---|
   | `PUBLIC_SUPABASE_URL` | `https://ugfqgophrpaotnvikehf.supabase.co` |
   | `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la de `web/.env.production` (empieza con `sb_publishable_`) |
   | `PUBLIC_TURNSTILE_SITE_KEY` | déjala vacía por ahora |

4. **Deploy.**
5. **La rama:** Vercel publica `main` como sitio principal. Los cambios nuevos están en `portada-movil`:
   - lo más simple es pasarlos a `main` (en GitHub: **Compare & pull request** → **Merge**), o
   - abrir la vista previa de la rama: Vercel → Deployments → la de `portada-movil`.
6. Abre la dirección `…vercel.app` en el celular, escribe 1144 y Enter. Recuerda el acceso 30 días en ese teléfono.

**Al terminar con el cliente:** Vercel → el proyecto → Settings → **Delete Project**, para que no quede una copia pública en dos lugares.

---

## 2. Permiso de dueño en la nube (una vez)

En Supabase hay una cuenta, `migueldavalos@lajoya.com`. Para que la app la deje entrar como dueño:

1. Supabase → tu proyecto → **SQL Editor** → pega y corre:
   ```sql
   insert into public.profiles (id, role, display_name)
   select id, 'admin', 'Dueño' from auth.users where email = 'migueldavalos@lajoya.com'
   on conflict (id) do update set role = 'admin';
   ```
2. Si el dueño es otra persona: Authentication → Users → **Add user** (contraseña de 10 o más letras, «Auto confirm») y corre lo mismo con su correo.
3. **Si no sabes la contraseña de esa cuenta:** Authentication → Users → la cuenta → **Send password recovery**, o bórrala y créala de nuevo.

Se puede correr varias veces sin problema.

---

## 3. Instalar la app en la Mac y probarla

### Bajar el instalador

1. GitHub → repositorio **`joya`** → **Actions** → **App de la Mac** → la corrida en verde del **11 de noviembre**.
2. Abajo, en **Artifacts**, baja **`la-joya-Mac`** (5 MB). Es un `.zip` con el `.dmg` adentro.
   - **Se borra el 11 de diciembre.** Después, en esa misma pantalla, da **Run workflow** para sacar uno nuevo.
   - Necesita **macOS 12 (Monterey) o más nuevo**. Sirve en Intel y en Apple Silicon.
3. Pásalo a la Mac (AirDrop, USB o bájalo directo en la Mac).

### Instalar y abrir la primera vez

1. Doble clic al `.dmg` → arrastra **La Joya** a **Aplicaciones** → expulsa el `.dmg`.
2. La app no está firmada por Apple, así que macOS la detiene la primera vez:
   - **macOS 15 o más nuevo:** ábrela → **Listo** → Ajustes del Sistema → **Privacidad y seguridad** → hasta abajo → **Abrir de todos modos** → tu contraseña de la Mac.
   - **macOS 12 a 14:** clic derecho sobre La Joya → **Abrir** → **Abrir**.
   - **Si dice «está dañada»:** en la app Terminal pega `xattr -cr "/Applications/La Joya.app"` y vuelve a abrirla.
3. Entra con el correo y la contraseña del dueño (sección 2).

### Lista de prueba (márcala en la Mac)

Haz todo con la cuenta real. Lo que crees de prueba, bórralo o cancélalo al final.

- [ ] **Entrar:** abre y entra. Si dice «sin permiso», falta la sección 2. Si dice que no hay conexión, revisa el internet de la Mac.
- [ ] **Hoy:** aparece el rancho de noche y los hospedajes.
- [ ] **Cabañas:** salen los 12 lugares con sus nombres. Abre uno, cambia la descripción y espera a que diga que se guardó.
- [ ] **Fotos:** arrastra una foto desde Finder a un hospedaje. Debe subir y verse.
- [ ] **Calendario:** arrastra sobre unos días para cerrar fechas; luego bórralas.
- [ ] **Nueva reservación (⌘N):** crea una de prueba; debe salir el total. Regístrale un pago y luego cancélala.
- [ ] **Avisos:** Ajustes → **Esta Mac** → **Probar aviso**. Si no sale, Ajustes del Sistema → Notificaciones → La Joya → permitir.
- [ ] **Cerrar la ventana:** la app sigue en la barra de menú de arriba. Clic en su ícono o en el Dock la vuelve a abrir. **⌘Q** la cierra de verdad.
- [ ] **Abrir al prender la Mac:** reinicia la Mac; debe abrirse sola (se apaga en Ajustes → Esta Mac).
- [ ] **De la página a la Mac:** con las reservas encendidas (sección 4), haz una solicitud desde el celular: debe llegar a la Mac con aviso y número en el Dock.

Si algo no sale, toma una captura de la pantalla y dile a Claude qué decía.

---

## 4. El dueño deja todo listo en la app (con el cliente)

Sin esto la página no ofrece reservar en línea.

1. **Cabañas**, en cada uno de los 12:
   - precio por noche y de fin de semana;
   - en las habitaciones 11 a 16, la **capacidad real** y encender **Publicada**;
   - si quiere: descripción, camas, baños, amenidades y fotos.
   - No cambies los nombres a algo que el mapa no reconozca («Hab. 12» sí sirve; «Suite Jardín» no).
2. **Ajustes:**
   - hora de llegada y de salida;
   - anticipo (%) y horas que se apartan las fechas;
   - banco, CLABE y titular;
   - WhatsApp de hospedaje: **33 3598 3198**;
   - correo de avisos;
   - **políticas** y **aviso de privacidad** (sin los dos, la página no deja reservar);
   - la dirección de la web (la de Cloudflare de la sección 5, y luego el dominio).
3. Al final, encender **«Recibir reservaciones en la web»**.

Lo que cambia el dueño se ve en la página en cuanto alguien la abre o la recarga.

---

## 5. La página en producción (Cloudflare)

El repositorio `web-la-joya` ya trae su configuración para Cloudflare (`web/wrangler.jsonc`). En Cloudflare no hay candado: `middleware.js` solo lo usa Vercel, así que aquí la página queda pública.

1. **Pasa los cambios a `main`** si no lo hiciste en la sección 1 (GitHub → `web-la-joya` → pull request de `portada-movil` → **Merge**).
2. **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Import a repository** → autoriza GitHub → `web-la-joya`.
3. Configuración:

   | Campo | Valor |
   |---|---|
   | Project name | `web-la-joya` (será `web-la-joya.<tu-cuenta>.workers.dev`) |
   | Production branch | `main` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Root directory | (vacío) |

4. **Variables de compilación** (Build variables): las mismas tres de la sección 1, más `NODE_VERSION` = `24`.
5. **Deploy.** En 2 o 3 minutos queda publicada. Desde entonces, cada cambio que se sube a `main` se publica solo.
6. **Comprueba** en el celular: carga la portada, salen los hospedajes en `/reservar` y, con las reservas encendidas, deja pedir.

**Si cambias una variable,** vuelve a publicar (Deployments → el último → **Retry**): las variables quedan dentro de la página al compilar.

---

## 6. El dominio

1. **Agrega el dominio a Cloudflare** (Add a domain) y cambia los DNS donde lo compraste por los que te da Cloudflare.
2. **Conéctalo:** Workers & Pages → `web-la-joya` → Settings → **Domains & Routes** → agrega `tudominio.com` y `www.tudominio.com`.
3. **Anti-robots (Turnstile), los dos el mismo día:**
   1. Cloudflare → **Turnstile** → Add widget, con el dominio y el `…workers.dev`, modo **Managed**.
   2. La **llave del sitio** va en las variables de la página como `PUBLIC_TURNSTILE_SITE_KEY` → vuelve a publicar.
   3. La **llave secreta** va en Supabase (Git Bash, en la carpeta `joya`):
      ```bash
      npx supabase secrets set --project-ref ugfqgophrpaotnvikehf TURNSTILE_SECRET=0x4AAAA_XXXX
      ```
   Con solo la secreta, la base rechaza todas las solicitudes.
4. **Que solo tu página pueda reservar:**
   ```bash
   npx supabase secrets set --project-ref ugfqgophrpaotnvikehf RESERVAS_ORIGENES=https://tudominio.com,https://www.tudominio.com
   ```
   Mientras no exista, se acepta desde cualquier página (la base igual valida todo).
5. **El dominio en tres lugares más:** `web/astro.config.mjs` (`site:`, hoy dice `jardineslajoya.com`), la app → Ajustes → dirección de la web, y el remitente de los correos (sección 9).

---

## 7. Actualizaciones automáticas de la app de la Mac

Hoy la app instalada no se actualiza sola, porque GitHub no tiene con qué firmar ni dónde subir las versiones. Para encenderlo, en Git Bash dentro de `joya`:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/la-joya-actualizaciones.key
```

```bash
gh secret set SB_SECRET_KEY
```

El segundo te pide pegar la llave secreta de Supabase (Settings → API Keys → `sb_secret_…`).

**Sacar una versión:** sube el número de `version` en `mac/package.json` (por ejemplo a `0.1.2`) y haz push a `main`. GitHub la compila, la firma y la publica. La app instalada la encuentra sola (o en Ajustes → Esta Mac → **Buscar actualización**).

Desde la primera versión publicada, el instalador más nuevo siempre está en:
`https://ugfqgophrpaotnvikehf.supabase.co/storage/v1/object/public/versiones/La-Joya.dmg`

**Importante:** la llave `~/.tauri/la-joya-actualizaciones.key` no se puede reponer. Si se pierde, las apps instaladas ya no aceptan actualizaciones y hay que reinstalarlas a mano. Guarda una copia en un lugar seguro.

---

## 8. Arreglar el respaldo nocturno

Falla todos los días porque GitHub no tiene la dirección de la base. Carga tres secretos (cada comando pide pegar el valor):

```bash
gh secret set SUPABASE_DB_URL
```

```bash
gh secret set BACKUP_PASSPHRASE
```

- `SUPABASE_DB_URL`: Supabase → **Connect** → **Session pooler** → la dirección `postgresql://…`, con la contraseña de la base en lugar de `[YOUR-PASSWORD]`.
- `BACKUP_PASSPHRASE`: una frase larga que inventes. **Guárdala**: sin ella los respaldos no se pueden abrir.
- `SB_SECRET_KEY`: el mismo de la sección 7.

Luego, GitHub → Actions → **Respaldo nocturno** → **Run workflow** para comprobar que sale en verde. Cada respaldo se guarda cifrado en esa corrida, en Artifacts.

---

## 9. Correos (opcional)

Las reservas funcionan sin esto: el dueño se entera de cada solicitud por la app. Para que también lleguen correos al dueño y al huésped:

1. Una clave para las tareas programadas: `openssl rand -hex 32` en Git Bash.
2. En Supabase → SQL Editor (cambia `LA-CLAVE`):
   ```sql
   select vault.create_secret('https://ugfqgophrpaotnvikehf.supabase.co', 'project_url');
   select vault.create_secret('LA-CLAVE', 'cron_secret');
   ```
3. Crea la cuenta de **Resend** (resend.com) y verifica tu dominio en Resend → Domains.
4. En Git Bash, dentro de `joya`:
   ```bash
   npx supabase secrets set --project-ref ugfqgophrpaotnvikehf CRON_SECRET=LA-CLAVE RESEND_API_KEY=re_XXXX AVISOS_REMITENTE="La Joya <reservas@tudominio.com>"
   ```

---

## 10. Prueba final con el celular

1. En la página: elige un hospedaje y fechas → debe salir el total noche por noche y el anticipo.
2. Envía la solicitud → sale el código `LJ-…` y los datos para transferir.
3. En la Mac aparece en «Por atender» con aviso. Confírmala.
4. En el celular, «Ver mi reservación» dice confirmada.
5. Desde la app, cancélala para liberar las fechas.

Si algo falla: Supabase → Edge Functions → `reservar` → **Logs** dice el motivo.

---

## Lista de un vistazo

- [ ] 1 · Vista en Vercel con contraseña 1144 (y borrarla después)
- [ ] 2 · Permiso de dueño en Supabase
- [ ] 3 · App instalada en la Mac y lista de prueba completa
- [ ] 4 · Precios, horarios, políticas y aviso de privacidad; reservas encendidas
- [ ] 5 · Página en Cloudflare desde `main`
- [ ] 6 · Dominio, Turnstile y orígenes
- [ ] 7 · Secretos de actualizaciones de la app
- [ ] 8 · Secretos del respaldo nocturno y prueba en verde
- [ ] 9 · Correos (opcional)
- [ ] 10 · Prueba final de punta a punta

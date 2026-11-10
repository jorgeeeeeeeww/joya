# Puesta en marcha (nube)

Tiempo estimado: unos 45 minutos la primera vez. Después, cada publicación es automática: se sube el código a `main` y listo.

Costo: **$0 al mes** con los planes gratuitos de Supabase, Cloudflare y GitHub, más un dominio opcional.

> Crea las cuentas con el **correo del negocio**, no con uno personal. Así el dueño siempre tiene el control de sus datos.

**Cómo queda armado:**

- **Supabase** es el backend: datos, cuentas, fotos, avisos y tareas programadas. No hospeda la app.
- **Cloudflare Workers** publica los archivos de la app.
- **GitHub Actions** prueba y publica todo cada vez que se sube código a `main`, y hace el respaldo nocturno.

---

## 1. Supabase

1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo. Elige la región **East US** o **West US** (las más cercanas a Jalisco) y guarda la contraseña de la base de datos.
2. En **Project Settings → API Keys**, usa las **llaves nuevas**:
   - **Publishable key** (`sb_publishable_…`): es pública y va dentro de la app.
   - **Secret key** (`sb_secret_…`): **nunca** va en la app. Solo la usan GitHub Actions y las funciones.

   Supabase retira las llaves anteriores (`anon` y `service_role`) a finales de 2026. Si tu proyecto todavía las tiene, crea las nuevas y, cuando todo funcione, desactiva las anteriores.
3. Las tablas, las reglas por rol y la configuración **no se crean a mano**: las aplica GitHub Actions (paso 3). Si quieres aplicarlas desde tu computadora:
   ```bash
   npx supabase login
   npx supabase link --project-ref TU-PROYECTO
   npx supabase db push
   npx supabase config push
   npx supabase functions deploy
   ```
4. Abre `supabase/config.toml` y cambia `site_url` por la dirección real de la app (paso 2).

### Secretos en Vault (para las tareas programadas y los avisos push)

En el **SQL Editor**, una sola vez:

```sql
select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
select vault.create_secret('UNA-CLAVE-LARGA-INVENTADA', 'cron_secret');
```

Guarda la misma clave inventada como secreto de las funciones:

```bash
npx supabase secrets set CRON_SECRET=UNA-CLAVE-LARGA-INVENTADA SB_SECRET_KEY=sb_secret_…
```

Con eso funcionan solas:

| Tarea | Cada cuándo |
| --- | --- |
| Calendarios de Airbnb y Booking | 30 minutos |
| Monitor central (revisa dispositivos y avisa al dueño) | 15 minutos |
| Limpieza del historial y errores viejos | Diario |
| Aviso push al crear un aviso | Al momento |

> Si antes creaste un **webhook** en *Database → Webhooks* para los avisos push, **bórralo**: ahora la base llama a la función sola y, con los dos, llegaría cada aviso dos veces.

### Cuentas del equipo

El registro público está cerrado: nadie puede crearse una cuenta solo. El dueño las crea en **Authentication → Users → Add user**, con *Auto confirm* activado, una por persona. Después asigna el puesto de cada una en el SQL Editor:

```sql
insert into public.profiles (id, role, employee_id, display_name)
select id, 'admin', 'e_admin', 'Administración' from auth.users where email = 'dueno@tu-correo.com';
-- puestos: admin | eventos | recepcion | limpieza | mantenimiento
-- employee_id: el id de esa persona en la app (Equipo); sirve para que le lleguen sus avisos
```

## 2. Cloudflare Workers

1. Crea una cuenta en <https://dash.cloudflare.com>.
2. En **My Profile → API Tokens → Create Token**, usa la plantilla **Edit Cloudflare Workers** y guarda el token.
3. Copia tu **Account ID** (Workers & Pages, columna derecha).
4. No hay que crear nada más. La primera publicación (paso 3) crea el Worker `la-joya` con lo que dice `wrangler.jsonc`, y la app queda en `https://la-joya.TU-CUENTA.workers.dev`. Si compran un dominio, se agrega en **Workers → la-joya → Settings → Domains & Routes**.

> Si antes publicabas en **Cloudflare Pages**, deja el proyecto de Pages unos días mientras todos abren la nueva dirección y después bórralo.

## 3. GitHub Actions (publicación automática)

En el repositorio, ve a **Settings → Secrets and variables → Actions**.

**Secrets:**

| Nombre | De dónde sale |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | La contraseña de la base (paso 1) |
| `SB_SECRET_KEY` | La llave secreta `sb_secret_…` |
| `CLOUDFLARE_API_TOKEN` | El token del paso 2 |
| `CLOUDFLARE_ACCOUNT_ID` | El Account ID del paso 2 |
| `SUPABASE_DB_URL` | Project Settings → Database → Connection string → URI (modo *session*). Para el respaldo. |
| `BACKUP_PASSPHRASE` | Una contraseña larga para cifrar el respaldo. Guárdala también en otro lado. |

**Variables:**

| Nombre | Valor |
| --- | --- |
| `SUPABASE_PROJECT_REF` | El id del proyecto (lo que va antes de `.supabase.co`) |
| `SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | La llave pública `sb_publishable_…` |
| `VAPID_PUBLIC_KEY` | La llave pública de avisos push (paso 6) |

Cada vez que se sube código a `main`, el workflow **Publicar**:

1. Revisa el código.
2. Levanta una base de prueba con todas las migraciones y **prueba que cada puesto solo vea y edite lo suyo** (`supabase/tests`). Si algo falla, no se publica nada.
3. Aplica las migraciones, la configuración (`supabase/config.toml`) y las funciones.
4. Compila la app con la dirección y la llave pública adentro y la publica en Cloudflare.
5. Avisa al monitor central qué versión quedó publicada.

## 4. Primer dispositivo

1. Abre la app publicada y entra con el **correo y la contraseña** de tu cuenta de dueño. La dirección del servidor ya viene adentro, así que no hay que escribir nada técnico.
2. **Si la nube está vacía**, la app te pide crear tu perfil de dueño (nombre y PIN). Después das de alta al equipo en **Equipo**.
3. **Si ya tenías datos en una computadora** (modo demostración o una versión anterior), en esa computadora ve a **Panel de desarrollador → Subir todo lo de este dispositivo** antes de vincular a los demás.
4. Instala la app: en iPhone, Safari → Compartir → **Agregar a pantalla de inicio**. En Android y computadora, el botón **Instalar**.

## 5. Los demás dispositivos

Cada persona abre la dirección de la app **en el navegador del dispositivo, la instala primero y después entra desde el ícono** con su correo y contraseña.

> **iPhone:** Safari y la app instalada guardan sus datos por separado. Si alguien entra en Safari y después instala, tiene que volver a entrar en la app instalada. Por eso: primero instalar, después entrar.

## 6. Avisos push (opcional)

Sirven para que los avisos lleguen aunque la app esté cerrada. En iPhone funcionan con la app instalada (iOS 16.4 o posterior).

1. Genera las llaves una sola vez:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Guárdalas como secretos de las funciones:
   ```bash
   npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:admin@lajoya.mx
   ```
3. Pon la llave pública también en la variable `VAPID_PUBLIC_KEY` de GitHub (paso 3).
4. En cada dispositivo: **Ajustes → Nube → Notificaciones push → Avisos en este dispositivo**. El puesto de cada suscripción lo pone la nube según la cuenta, no el celular.

## 7. Airbnb y Booking

1. **Airbnb → La Joya:** en Airbnb, ve a Calendario → Disponibilidad → Conectar calendarios → **Exportar** y copia la liga. En la app, pégala en *Hospedaje → Airbnb y Booking*, dentro de la unidad.
2. **La Joya → Airbnb:** copia la **URL de exportación** de esa unidad en la app y pégala en Airbnb en **Importar calendario**.
3. La sincronización corre sola cada 30 minutos (paso 1, Vault).

## 8. Respaldo nocturno

Corre solo cada noche a las 3:00 con el workflow **Respaldo nocturno**. Guarda, cifrado, **los datos, las cuentas del equipo y las fotos**. Se puede probar en **Actions → Respaldo nocturno → Run workflow**. El resultado aparece en el monitor central.

Para restaurar:

```bash
gpg -d la-joya-AAAA-MM-DD.tar.gz.gpg > respaldo.tar.gz
tar -xzf respaldo.tar.gz
pg_restore --clean --no-owner -d "URL_DE_LA_BASE" la-joya-AAAA-MM-DD/datos.dump
pg_restore --data-only --no-owner -d "URL_DE_LA_BASE" la-joya-AAAA-MM-DD/cuentas.dump
# Las fotos están en la-joya-AAAA-MM-DD/fotos: se suben al almacén «fotos» con el mismo nombre.
```

## 9. Exigir una versión (cuando cambia el formato de los datos)

Cada publicación lleva un número de versión con fecha y hora (por ejemplo `202611041530`). Si una versión nueva cambia el formato de los datos, el dueño puede exigirla para que ningún celular atrasado suba datos con el formato viejo:

- Desde la app: **Panel de desarrollador → Dispositivos →** un dispositivo atrasado **→ Exigir la versión nueva a todos**.
- O en el SQL Editor:
  ```sql
  update public.app_config set value = '202611041530' where key = 'min_build';
  ```

Los dispositivos atrasados guardan sus cambios, se actualizan solos y después los suben. No se pierde nada.

## 10. Monitor central

En **Panel de desarrollador → Dispositivos** se ve cada celular y computadora del equipo con un semáforo:

- **Rojo:** cambios sin subir desde hace más de 2 horas, cambios rechazados por permisos, versión más vieja que la exigida o error al sincronizar.
- **Amarillo:** versión anterior, muchos errores o sin abrirse en 2 días.
- **Verde:** todo bien.

Abajo aparecen los errores de todos los dispositivos agrupados y explicados, y el último resultado de cada tarea de la nube. Si algo se pone en rojo, el dueño recibe un aviso. Los errores se borran solos después de 90 días.

---

## Probar todo en la computadora

Sin cuentas reales, con la nube de prueba:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_prueba npm run build
node scripts/probar-local.mjs
```

- Abre `http://localhost:4173` y `http://127.0.0.1:4173`: son dos «dispositivos» distintos.
- Correos de prueba (cualquier contraseña): `admin@…`, `eventos@…`, `recepcion@…`, `limpieza@…`, `mantenimiento@…`.
- Para provocar fallas a propósito: `/__caducar` (sesión vencida), `/__lento?ms=30000` (señal débil), `/__desorden` (subidas en desorden), `/__version?min=…` (versión exigida). Ver `scripts/nube-de-prueba.mjs`.

## Prueba final en un iPhone real

Esto no se puede probar desde la computadora. Una vez publicado:

1. En el iPhone, abre la app en Safari, **instálala** (Compartir → Agregar a pantalla de inicio) y entra desde el ícono.
2. Al abrir, la pantalla de arranque debe salir del color de la app (sin destello blanco), en claro o en oscuro según el iPhone.
3. Entra a una pantalla (por ejemplo **Limpieza**) y cierra la app deslizándola hacia arriba en el selector de apps.
4. Vuelve a abrirla desde el ícono: debe abrir en **Limpieza**, no en el inicio.
5. Publica una versión nueva (sube cualquier cambio a `main`) y espera a que termine el workflow.
6. Abre la app desde el ícono. En unos segundos debe recargarse sola con la versión nueva (se ve en Panel de desarrollador → Estado: «Versión …»).
7. Desliza hacia abajo en cualquier pantalla: debe salir «Suelta para sincronizar» y luego «Todo al día».
8. Activa los avisos push, cierra la app y crea una tarea desde otro dispositivo asignada a ese puesto: debe llegar el aviso.
9. Pon el iPhone en modo avión, crea una tarea, ciérrala y ábrela de nuevo: la tarea sigue ahí. Quita el modo avión: se sube sola (el semáforo del monitor queda en verde).

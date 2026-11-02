# Puesta en marcha (nube)

Tiempo estimado: unos 30 minutos. Costo: **$0 al mes** con los planes gratuitos, más un dominio opcional de unos $12 USD al año.

> Crea las cuentas con el **correo del negocio**, no con uno personal. Así el dueño siempre tiene el control de sus datos.

## 1. Supabase (base de datos)

1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo. Elige la región **East US** o **West US** (las más cercanas a Jalisco) y guarda la contraseña de la base de datos.
2. Abre **SQL Editor**, pega todo el contenido de `supabase/migrations/20261101000000_la_joya.sql` y ejecútalo.
3. Crea las cuentas del equipo en **Authentication → Users → Add user**: una por persona o una por dispositivo, con "Auto confirm" activado.
4. Asigna el rol de cada cuenta en el SQL Editor:
   ```sql
   insert into public.profiles (id, role, employee_id, display_name)
   select id, 'admin', 'e_admin', 'Administración' from auth.users where email = 'admin@tu-correo.com';
   -- roles: admin | eventos | limpieza | mantenimiento
   ```
5. Copia la **URL** y la **anon key** desde Project Settings → API.

## 2. Publicar la app (Cloudflare Pages)

1. Sube este proyecto a un repositorio **privado** de GitHub.
2. En <https://dash.cloudflare.com>, entra a **Workers & Pages → Create → Pages → Connect to Git** y elige el repositorio.
3. Configuración de compilación:
   - Comando de build: `npm run build`
   - Carpeta de salida: `dist`
4. Al terminar, la app queda en `https://la-joya.pages.dev`, con HTTPS y los encabezados de seguridad de `public/_headers`. Si compran un dominio, se agrega en **Custom domains**.

## 3. Conectar cada dispositivo

1. Abre la app y entra como **Administración**.
2. Ve a **Ajustes → Nube**, pega la URL y la anon key, y entra con la cuenta de Supabase de ese dispositivo.
3. **Solo en el primer dispositivo**, presiona **Subir todo**. Antes, si quieres empezar sin datos de ejemplo, usa **Ajustes → Respaldos → Reiniciar** y borra lo que no sirva.
4. En los demás dispositivos basta con conectar: los datos bajan solos.
5. Instala la app en cada uno con *Ajustes → Instalar app*.

## 4. Airbnb y Booking

1. Despliega las funciones (requiere el [CLI de Supabase](https://supabase.com/docs/guides/cli)):
   ```bash
   npx supabase login
   npx supabase link --project-ref TU-PROYECTO
   npx supabase functions deploy ical-sync
   npx supabase functions deploy ical-export --no-verify-jwt
   ```
2. **Airbnb → La Joya:** en Airbnb, ve a Calendario → Disponibilidad → Conectar calendarios → **Exportar** y copia la liga. En la app, pégala en *Hospedaje → Airbnb y Booking* dentro de la unidad correspondiente.
3. **La Joya → Airbnb:** copia la **URL de exportación** de esa unidad en la app y pégala en Airbnb en **Importar calendario**.
4. Para que sincronice sola cada 30 minutos, activa `pg_cron` y `pg_net` en Database → Extensions, y descomenta el bloque `cron.schedule` al final de la migración.

## 5. Respaldo nocturno (GitHub Actions)

1. En el repositorio, ve a **Settings → Secrets and variables → Actions** y agrega:
   - `SUPABASE_DB_URL`: Project Settings → Database → Connection string → URI (modo *session*).
   - `BACKUP_PASSPHRASE`: una contraseña larga. Guárdala también en otro lado.
2. En **Actions → Respaldo nocturno → Run workflow** puedes probarlo. Después corre solo cada noche a las 3:00.
3. Para restaurar un respaldo:
   ```bash
   gpg -d la-joya-AAAA-MM-DD.dump.gpg > respaldo.dump
   pg_restore --clean --no-owner -d "URL_DE_LA_BASE" respaldo.dump
   ```

## 6. Notificaciones push (opcional)

Sirven para que los avisos lleguen aunque la app esté cerrada. En iPhone funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o posterior).

1. Genera las llaves una sola vez:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. En Supabase, ve a **Edge Functions → Secrets** y guarda:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (por ejemplo `mailto:admin@lajoya.mx`)
   - `WEBHOOK_SECRET`: una contraseña larga inventada.
3. Despliega la función:
   ```bash
   npx supabase functions deploy push-send --no-verify-jwt
   ```
4. En **Database → Webhooks**, crea uno nuevo:
   - Evento: `INSERT` en `public.documents`.
   - URL: `https://TU-PROYECTO.supabase.co/functions/v1/push-send`.
   - Encabezado: `x-webhook-secret` con el valor de `WEBHOOK_SECRET`.
5. En la app, ve a **Ajustes → Nube → Notificaciones push**. Pega la **llave pública VAPID** y activa los avisos en cada dispositivo.

## 7. Vincular los celulares del equipo con un QR

1. En la iMac, ya conectada, ve a **Ajustes → Nube → Vincular otro dispositivo**.
2. Con la cámara del celular, escanea el código. Se abre La Joya con el servidor ya escrito.
3. La persona entra con su cuenta y queda vinculada. El código no lleva contraseñas, solo la dirección del servidor y su llave pública.

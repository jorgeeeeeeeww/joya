# Cómo instalar La Joya en la Mac

> **Todavía no se ha probado en una Mac de verdad.** Si algo no coincide en la Mac, avísale a Claude qué dice la pantalla.

Antes de empezar, revisa la versión de la iMac: menú  → **Acerca de esta Mac**. Necesita **macOS 12 (Monterey) o más nuevo**. Sirve para Intel y para Apple Silicon: es el mismo archivo.

## 1. Preparar la nube (una sola vez, desde tu computadora)

Sin esto, la app abre, pero apunta a la nube local de prueba y no sirve en el rancho.

1. **Crea el proyecto de Supabase** y publica la base con los pasos de [docs/PUESTA-EN-MARCHA.md](../docs/PUESTA-EN-MARCHA.md).
2. **Carga estas dos variables en GitHub**, en Settings → Secrets and variables → Actions → **Variables**:
   - `SUPABASE_URL`: `https://TU-PROYECTO.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`: la llave pública, `sb_publishable_…`
3. **Carga estos dos secretos**, en la misma pantalla → **Secrets**. Son los que permiten las actualizaciones automáticas:
   - `SB_SECRET_KEY`: la llave secreta de Supabase, `sb_secret_…`
   - `TAURI_SIGNING_PRIVATE_KEY`: la llave para firmar las versiones. Cárgala con este comando en Git Bash, sin copiarla a ningún lado:
     ```bash
     gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/la-joya-actualizaciones.key
     ```
4. **Crea la cuenta del dueño** en Supabase → Authentication → Users → **Add user**, con su correo y una contraseña. Luego, en el SQL Editor, dale el puesto (cambia el correo):
   ```sql
   insert into public.profiles (id, role, display_name)
   select id, 'admin', 'Dueño' from auth.users where email = 'CORREO-DEL-DUEÑO'
   on conflict (id) do update set role = 'admin';
   ```
5. **Vuelve a compilar:** en GitHub → Actions → **App de la Mac** → **Run workflow**. Tarda unos minutos, y al terminar la versión queda publicada.

## 2. Bajar el instalador

**En la iMac, abre esta liga en Safari** (cambia `TU-PROYECTO` por el de tu Supabase). Es fija y siempre baja la versión más nueva, sin entrar a GitHub:

`https://TU-PROYECTO.supabase.co/storage/v1/object/public/versiones/La-Joya.dmg`

También se puede bajar de GitHub, por ejemplo una compilación de prueba: Actions → **App de la Mac** → la última corrida en verde → **Artifacts** → **la-joya-Mac**. Se guarda 30 días.

## 3. Instalar

1. Abre el `.dmg` con doble clic.
2. Arrastra **La Joya** a la carpeta **Aplicaciones**.
3. Cierra la ventana del `.dmg` y expúlsalo.

## 4. Abrirla la primera vez

La app no está firmada con una cuenta de Apple, así que macOS la detiene la primera vez. Solo pasa una vez.

- **macOS 15 (Sequoia) o más nuevo:**
  1. Abre La Joya desde Aplicaciones. macOS avisa que no pudo verificarla; da clic en **Listo**.
  2. Ve a **Ajustes del Sistema → Privacidad y seguridad**, baja hasta el final y da clic en **Abrir de todos modos**.
  3. Confirma con tu contraseña de la Mac.
- **macOS 12, 13 o 14:** en Aplicaciones, da clic derecho sobre La Joya → **Abrir** → **Abrir**.
- **Si dice que «está dañada»:** es el bloqueo de archivos bajados de internet. Abre la app Terminal, pega esto y vuelve a abrirla:
  ```bash
  xattr -cr "/Applications/La Joya.app"
  ```

## 5. Dejarla lista

1. **Entra** con el correo y la contraseña del dueño. La sesión se queda guardada.
2. **Prueba los avisos:** en Ajustes → **Esta Mac** → **Probar aviso**. Si no aparece, actívalos en Ajustes del Sistema → Notificaciones → La Joya.
3. **Revisa «Abrir al prender la Mac»:** queda encendido desde la primera vez. Se apaga en Ajustes → Esta Mac.

## Cómo se usa

- **Cerrar la ventana no la apaga:** sigue en la barra de menú (arriba a la derecha) para avisar de cada solicitud. Para volver, da clic en su ícono del Dock o de la barra.
- **Para salir de verdad:** ⌘Q, o el ícono de la barra de menú → **Salir de La Joya**.

## Actualizarla cuando haya cambios

**Sacar una versión** (en el código): se sube el número de `version` en `mac/package.json` y se hace push a `main`. GitHub compila y la publica sola. Si no se sube el número, compila pero no publica nada.

**En la Mac:** la app revisa una vez al día y al poco de abrirla. Cuando hay una versión nueva avisa con **Instalar**; se baja, comprueba la firma y vuelve a abrir sola. También se puede revisar en Ajustes → Esta Mac → **Buscar actualización**.

Las reservaciones no se tocan, porque viven en la nube.

Si la automática fallara, repite los pasos 2 y 3: La Joya se reemplaza y todo sigue igual.

# Cómo instalar La Joya en la Mac

> **Todavía no se ha compilado ni probado en una Mac de verdad.** Estos pasos sirven desde que el flujo «App de la Mac» de GitHub salga en verde por primera vez. Si algo no coincide en la Mac, avísale a Claude qué dice la pantalla.

Antes de empezar, revisa la versión de la iMac: menú  → **Acerca de esta Mac**. Necesita **macOS 12 (Monterey) o más nuevo**. Sirve para Intel y para Apple Silicon: es el mismo archivo.

## 1. Preparar la nube (una sola vez, desde tu computadora)

Sin esto, la app abre, pero apunta a la nube local de prueba y no sirve en el rancho.

1. **Sube el código a GitHub.** Se lo autorizas a Claude.
2. **Crea el proyecto de Supabase** y publica la base con los pasos de [docs/PUESTA-EN-MARCHA.md](../docs/PUESTA-EN-MARCHA.md).
3. **Carga estas dos variables en GitHub**, en Settings → Secrets and variables → Actions → **Variables**:
   - `SUPABASE_URL`: `https://TU-PROYECTO.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`: la llave pública, `sb_publishable_…`
4. **Crea la cuenta del dueño** en Supabase → Authentication → Users → **Add user**, con su correo y una contraseña. Luego, en el SQL Editor, dale el puesto (cambia el correo):
   ```sql
   insert into public.profiles (id, role, display_name)
   select id, 'admin', 'Dueño' from auth.users where email = 'CORREO-DEL-DUEÑO'
   on conflict (id) do update set role = 'admin';
   ```
5. **Vuelve a compilar:** en GitHub → Actions → **App de la Mac** → **Run workflow**. Tarda unos minutos.

## 2. Bajar el instalador

1. **En la iMac,** entra a github.com con tu cuenta (el repositorio es privado).
2. Ve a Actions → **App de la Mac** → la última corrida en verde.
3. Abajo, en **Artifacts**, baja **la-joya-Mac**. Se guarda 30 días.
4. Abre el `.zip`; adentro viene `La Joya_0.1.0_universal.dmg`.

Si lo bajas en otra computadora, pásalo a la iMac por USB o AirDrop.

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

## Instalar una versión nueva

Mientras no se decida dónde se guardan las actualizaciones, repite los pasos 2 y 3: La Joya se reemplaza y tus datos siguen en la nube. Cuando esté configurado, la app avisará sola y se instalará con un clic.

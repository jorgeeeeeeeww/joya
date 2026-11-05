# App de la Mac · dónde se quedó y qué falta

Corte: **5 de noviembre de 2026**. Ya está en GitHub, en la rama `main` (commit `db8d562`).

**En una línea:** la app ya compila. El `.dmg` universal (5.9 MB) sale de GitHub Actions y abre en una Mac de prueba, pero falta usarla en una Mac con la cuenta real. Jorge aprobó las capturas. Para instalarla, ver [INSTALAR.md](INSTALAR.md).

## Lo que ya está hecho y probado

### Nube y contrato
- **Tipo «habitación»:** ya existe en la base. La migración (`supabase/migrations/20261105000000_hospedaje.sql`) ahora acepta `cabana`, `casa` y `habitacion`, y trae un `alter table` para las bases que ya existían. También está en los tipos de la app (`src/lib/tipos.ts`), en las pruebas y en los datos de ejemplo (`nube-local/ejemplo.sql` trae 2 cabañas, 1 casa y 1 habitación de prueba).
- **Pruebas:** `npm run probar:base` da **21 de 21 bien**, `npm run probar` da **52 de 52 bien** y `npx tsc --noEmit` pasa sin errores.
- **Corregido, recarga sin fin:** con la app abierta, cada lectura le avisaba a la nube «hubo cambios» y eso provocaba otra lectura, unas 4 por segundo sin parar. En producción habría gastado la cuota de Supabase y además retrasaba el guardado de Ajustes. El aviso `*_cambio` ahora es por renglón y no por instrucción: en una medición de 8 segundos pasó de unas 4 lecturas por segundo a 0. Hay dos pruebas nuevas para que no regrese. No cambia el contrato de la web.
- **`supabase/config.toml`:** se agregaron las funciones `reservar` y `avisos-hospedaje` sin verificación de JWT.
- **`docs/HOSPEDAJE-WEB.md`:** escrito. Tiene el contrato completo para la web (funciones, parámetros, respuestas, errores, Turnstile y el flujo del huésped) y una guía corta de la app. Ya se le avisó a la sesión de la web.

### La app (React, en `src/`)
`npx tsc --noEmit` pasa sin errores.

| Archivo | Qué hace |
|---|---|
| `main.tsx`, `App.tsx` | Inicio de sesión, barra lateral, tiempo real (canal «hospedaje»), recarga cada 30 s y al volver a la ventana, atajos de teclado y menú de la Mac |
| `pages/Entrar.tsx` | Inicio de sesión con correo y contraseña. Con la nube local ofrece «Usar la cuenta de prueba» |
| `pages/Hoy.tsx` | El rancho de noche con los hospedajes ocupados encendidos, un deslizador por las próximas 30 noches, solicitudes con cuenta regresiva, llegadas, salidas y la semana |
| `pages/Calendario.tsx` | Hospedajes contra días. Se arrastra para crear, mover, alargar y cerrar fechas; el trackpad desliza de lado y el clic derecho da las acciones |
| `pages/Reservaciones.tsx` | Lista y detalle lado a lado, como en Mail, con filtros y ↑ ↓ |
| `components/Detalle.tsx` | Confirmar, registrar pagos (se arrastra sobre la barra), cancelar, reactivar, cambiar fechas, WhatsApp con vista previa del mensaje, datos del huésped e historia. Las noches se dibujan como focos que se encienden con lo pagado |
| `pages/Cabanas.tsx` | Datos, fotos (se arrastran desde Finder, se achican solas y se reordenan), precios, temporadas y la vista previa de la web en vivo. Se guarda solo |
| `pages/Ajustes.tsx` | Reloj de llegada y salida que se arrastra, anticipo, apartado, noches de fin de semana, CLABE que se valida y detecta el banco, contacto, textos, apariencia y «Esta Mac» |
| `components/NuevaHoja.tsx` | Nueva reservación (⌘N) y cerrar fechas (⇧⌘N), con la cotización en vivo de `hosp_cotizar` |
| `components/Buscar.tsx` | ⌘F por nombre, código, WhatsApp o correo |
| `components/menuReservacion.tsx` | Clic derecho sobre cualquier reservación |
| `components/Tropiezo.tsx` | Si una pantalla falla, muestra un aviso en vez de la ventana en blanco |
| `components/escena.tsx`, `components/campos.tsx`, `lib/acciones.ts`, `lib/ocupacion.ts` | Piezas compartidas: la escena del rancho, los campos, las acciones con «Deshacer» y la ocupación por noche |

### Probado en el navegador
Con `http://localhost:5180` contra `npm run nube:ejemplo`, en modo oscuro:

- **Prueba de punta a punta:** la solicitud **LJ-TQWK**, hecha con el contrato de la web (`/functions/v1/reservar`), aparece en la app: en Hoy, en Reservaciones y como ventana apartada en la escena.
- **Funcionan:**
  - entrar;
  - Hoy;
  - en el Calendario, mover una reservación (recalcula el total y ofrece «Deshacer») y elegir fechas arrastrando;
  - la hoja de nueva reservación, con la cotización noche por noche, el total y el anticipo;
  - Reservaciones y el detalle con los focos.
- **Corregido:** cerrar la hoja con Esc dejaba la ventana en blanco.

También probado, en la atmósfera Nocturno:

- **Interactuando, en modo claro:** subir fotos soltándolas (una foto de 2400 px quedó en 1800 px), reordenarlas, crear y borrar temporadas con «Deshacer», el reloj, la CLABE (banco detectado, dígito verificador y aviso de error), registrar un pago arrastrando sobre la barra, el mensaje y la liga de WhatsApp, ⌘F por nombre y por código, y el clic derecho. En el calendario: mover una reservación a otro hospedaje con «Deshacer» y elegir fechas arrastrando.
- **Solo revisando capturas, en modo oscuro:** las 8 pantallas.
- **Sin probar:** «Deshacer» de un pago. El aviso desapareció antes del clic y el pago se quedó registrado; ese dato se perdió después al reiniciar la nube local.
- **Con las reglas de seguridad de la Mac:** la versión compilada corrió con la misma CSP en Edge, sin violaciones ni errores en consola. No es el motor de la Mac, que usa el de Safari.
- **Ventana mínima (1040 × 640):** nada se sale de lado.

Corregido en esta revisión:

- **Cabañas:** los contadores se desbordaban y las etiquetas salían cortadas. La columna se ensanchó y en ventanas de menos de 1280 px se guarda la vista previa.
- **Pantallas:** al salir de Reservaciones, la siguiente abría un panel que nadie pidió.
- **Hoy:** en ventanas angostas los nombres de los hospedajes se encimaban con «Desliza para ver las próximas noches». Ahora van en su propio renglón, que crece con el nombre más largo.
- **Reloj:** las marcas tapaban el texto y «10 pm» se partía en dos renglones.
- **CLABE:** una con dígito verificador equivocado se guardaba de todos modos.
- **Historia:** de noche mostraba el día de mañana, porque usaba la hora UTC.
- **Buscar y Filtrar:** tenían un recuadro oscuro alrededor del campo.
- **Entrar:** presumía «Conexión cifrada» con la nube local, que no va cifrada.

Ajustes visuales anotados, ya hechos:

- **Calendario:** las filas crecen cuando hay pocos hospedajes.
- **Focos:** con pocas noches crecen, y se ven como foco aunque estén apagados.
- **Modo oscuro:** las barras del calendario ya contrastan.

### Íconos y llave de actualizaciones
- **Íconos:** generados en `src-tauri/icons/` a partir de `icono.svg` (la luz, los focos y una cabaña encendida), en `icon.icns`, `icon.ico` y PNG. Para la barra de menú está `bandeja.png`, en negro como plantilla, hecho desde `bandeja.svg`.
- **Llave privada:** está en `C:\Users\Jorge\.tauri\la-joya-actualizaciones.key`, fuera del repositorio y sin contraseña. **Nunca se sube.**
- **Llave pública:** va en `tauri.conf.json`:
  `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDcwNDQxREJDOUJDRjQxQjkKUldTNVFjK2J2QjFFY0h1NXZIRHBTRDc0YlRVMmxMdWNhZUFvaUpveG1iNHNxY3VCZVBDS1pzdzgK`

### Para probar en la computadora
- En `.claude/launch.json` se agregaron dos entradas: `mac-nube-local` (puerto 54331) y `mac-app` (puerto 5180).
- `node nube-local/escenario-prueba.mjs` llena la nube local con reservaciones de prueba: 3 solicitudes hechas como la web, 5 capturadas por el dueño con pagos, un cierre y una temporada. Solo corre si la nube no tiene reservaciones.

### Capa de Mac con Tauri 2 (escrita, sin compilar todavía)
Esta computadora no tiene Rust y no se instaló, así que **el código de Rust no se ha compilado**; lo revisará GitHub Actions en el primer push. Se escribió contra el código fuente de Tauri 2.12 y sus plugins, y `tauri info` carga bien la configuración y arma la CSP.

- **Archivos:** `src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`, `src/main.rs` y `src/lib.rs`.
- **`lib.rs`:** ícono en la barra de menú con id `principal` y menú «Abrir / Nueva reservación / Salir». Cerrar la ventana solo la esconde (en pantalla completa oculta la app, para no dejar un escritorio negro) y el clic en el Dock la vuelve a mostrar con `RunEvent::Reopen`. Carga notification, autostart, opener, process, updater, single-instance y window-state; este último no guarda si estaba escondida.
- **Ventana `principal`:** `titleBarStyle: Overlay`, macOS 12 o más nuevo, firma ad-hoc. Además:
  - `dragDropEnabled: false`, porque si no Tauri se queda con las fotos que se arrastran desde Finder y nunca llegan a Cabañas.
  - `backgroundThrottling: disabled`, para que siga atenta con la ventana escondida (solo aplica en macOS 14 o más nuevo).
- **CSP:** permite `*.supabase.co` y la nube local. El script en línea pasó a `public/tema.js`.
- **En la app:** escucha `nueva-reservacion`, sigue revisando cada 30 s con la ventana escondida, «Buscar actualización» distingue «ya tienes la más nueva» de «no se pudo revisar», copiar tiene un plan B por si el motor de la Mac niega el portapapeles y «Abrir al prender la Mac» queda encendido la primera vez.
- **`package.json`:** el script `icono` ya apunta a `src-tauri/icons/icono.svg`.

### Compilación en GitHub Actions (escrita, sin correr todavía)
`.github/workflows/app-mac.yml` corre las pruebas y compila el `.dmg` universal y el instalador de Windows. En la Mac revisa también que tenga las dos arquitecturas, la firma, que el `.dmg` esté sano y que la app abra sin tronar, y guarda una captura. Sin el secreto `TAURI_SIGNING_PRIVATE_KEY` compila sin archivos de actualización. `publicar.yml` ahora se salta la publicación si no hay proyecto de Supabase configurado, en vez de marcar error.

## Lo que falta

### Depende de Jorge
1. **Cargar en GitHub lo que no puede hacer Claude:**
   - Las variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Sin ellas, la app sale apuntando a la nube local.
   - Los secretos `TAURI_SIGNING_PRIVATE_KEY` (el comando está en [INSTALAR.md](INSTALAR.md)) y `SB_SECRET_KEY`. Sin ellos compila, pero no publica versiones.
2. **Crear las cuentas** de Supabase y del dueño. Los pasos están en [INSTALAR.md](INSTALAR.md).

### Actualizaciones (decidido: Supabase Storage)
- **Almacén `versiones`:** público para leer; solo se sube con la llave secreta. Está en la migración de hospedaje.
- **`scripts/publicar-version.mjs`:** sube los archivos y al final `latest.json`, deja una liga fija `La-Joya.dmg` y conserva la versión actual y la anterior. Solo publica si el número de `package.json` subió. Se probó con archivos falsos contra una nube local en memoria: 19 de 19.
- **Flujo:** el paso `publicar-version` de `app-mac.yml` corre después de compilar, y se salta si falta algo por configurar. La dirección de `latest.json` sale de `SUPABASE_URL`, así que toda app compilada con esa variable ya sabe dónde buscar.

### Lo que salió en la primera corrida (`db8d562`), ya corregido
- **Rust:** faltaba declarar `serde_json`, que usa el código de `generate_context!`.
- **`publicar.yml`:** la migración `pulido_nube` fallaba en un Postgres completo (`text = text[]`). Nunca se había aplicado: las pruebas locales solo cargan la de hospedaje. Corregida con `::text[]`; `publicar.yml` ya pasó en verde con el Supabase real (`d06f45d`).
- **`Cargo.lock`:** ya está en el repositorio, sacado del artefacto `revision-mac`.

### Comprobado en la Mac de GitHub (última corrida, `a589d78`)
Los dos flujos salieron en verde; el paso de publicar se salta hasta que exista el proyecto de Supabase.

- **Compilación:** el Rust compila en Mac y en Windows. La app es universal (`x86_64 arm64`), con firma ad-hoc válida, y el `.dmg` pasa `hdiutil verify`.
- **Al abrirla, en macOS real:** sigue viva a los 20 segundos. La captura `captura-mac.png` del artefacto `revision-mac` muestra la pantalla de Entrar con la letra y los colores correctos, el menú de arriba en español, el ícono en la barra de menú y el ícono en el Dock.
- **Lo que no llevan estas compilaciones:** no tienen las variables de Supabase, así que apuntan a la nube local. Abren, pero en la iMac no dejan entrar.

### Lo que no se ha podido comprobar
- **Lo que necesita a alguien usándola en una Mac:** el número en la barra de menú y en el Dock, avisos de macOS, cerrar y volver a abrir, abrir al prender, arrastrar fotos desde Finder de verdad (aquí se simuló soltarlas) y los semáforos sobre la barra lateral. La pantalla de la Mac de GitHub mide 1024 × 768, así que la ventana quedó cortada y no se ven.
- **El resto de las pantallas en el motor de Safari:** solo Entrar se ha visto en macOS; lo demás se revisó con Chrome y Edge.
- **Las actualizaciones de principio a fin:** bajar, comprobar la firma e instalar en una Mac. Tampoco se ha subido una versión a un Supabase real; eso espera a que exista el proyecto.

### Qué cuidar en cada commit
Nunca `git add -A` ni un `git commit` sin rutas: el PWA de la raíz tiene cambios ajenos y `public/push-sw.js` está borrado en el índice. Se agregan las rutas de este trabajo y se usa `git commit --only -- <rutas>`.

**Sin subir, a propósito:** `supabase/functions/ical-export`, `ical-sync`, `push-send` y `.github/workflows/respaldo-nocturno.yml` ya existían en git y tienen cambios sin guardar que parecen de la migración de pulido, no de este trabajo. Esas tres funciones siguen en su versión anterior hasta que Jorge decida. También sigue sin subir `.claude/launch.json`.

## Notas para quien siga
- **Nube local:** si se detiene de golpe pierde lo escrito desde el último guardado de la base. Ya pasó el 5 de noviembre al reiniciarla: se perdieron datos de prueba, nada real.
- **No tocar** `web/` (la rediseña otra sesión) ni el PWA de la raíz (`src/`, `public/`).
- **La sesión de la web** ya tiene el contrato. Si cambia algo de la base, hay que actualizar `docs/HOSPEDAJE-WEB.md` y avisarle.
- **Las cuentas** de Supabase, Cloudflare, Resend y Apple las crea Jorge o el dueño.

# Estado del proyecto La Joya — 12 nov 2026 (para continuar en otra sesión)

## Qué es
Jardines La Joya (Tototlán, Jalisco): hotel campestre. Tres piezas conectadas por Supabase
(proyecto `ugfqgophrpaotnvikehf`):
- **Web pública** `web/` (Astro en Cloudflare Workers; repo propio `jorgeeeeeeeww/web-la-joya`). Reservas directas.
- **App de la Mac** `mac/` (Tauri 2 + React + Tailwind 4). Para el dueño/recepción. Repo `jorgeeeeeeeww/joya`.
- **Nube** `supabase/` (migraciones, funciones, avisos al celular con ntfy; respaldo nocturno ya funciona).
Todo en la rama `main`, sin ramas ni PRs.

## Hecho hoy
- **7 casas** (Casa 1–7) como hospedajes propios, tipo `casa`: sección aparte en la web, mapa 3D, ficha, recorrido,
  plano de la app y base de datos. Van en **una sola hilera** a lo largo del lado oeste, **debajo del salón** y hacia el
  estacionamiento (franja que marcó Jorge); el terreno se ensanchó por el oeste (`web/src/data/plano.ts`, copia en
  `mac/src/lib/plano.ts`).
- En el mapa, las casas son **un solo punto «7 casas»**; al tocarlo la cámara se acerca a todas y se elige una.
  En la app de la Mac, un solo rótulo «7 casas» hasta acercar.
- Migraciones de las casas: `20261112010000_casas.sql` (1–4) y `20261112020000_casas_5_a_7.sql` (5–7). **Jorge ya corrió
  `npx supabase db push --linked`**: las 7 existen en la base, sin publicar y con capacidad 1 provisional.
- Se quitó una llamada `fija()` que sobró en `web/src/scripts/inicio/main.ts`.
- **App 0.3.5 publicada** (la última que salió). **0.3.6 está escrita y subida a GitHub pero NO publicada** (ver abajo).

## App 0.3.6 (código listo, falta compilar/publicar)
Motivo: en la Mac del cliente (Monterey / Safari 15) **no deja entrar** («Sin conexión… Load failed») y los colores se
ven mal (botones blancos, mapa negro).
- `mac/src/lib/nube.ts`: las peticiones a Supabase salen por **Rust** (`tauri-plugin-http`, permiso `http:default` en
  `src-tauri/capabilities/default.json`, plugin en `Cargo.toml`/`lib.rs`); si falla, cae al navegador. El recuadro gris
  de la pantalla de entrada ahora muestra: prueba por Rust, desfase del reloj, bloqueos CSP, fecha, modo de colores.
- `mac/src/lib/compat.ts`: si el Safari no entiende `color-mix()`, reescribe la hoja de estilos con los colores
  calculados (probado forzando `?compat=1` en Chrome: queda igual).
- `mac/src/pages/Entrar.tsx`: el plano 2D de la entrada se cambió por una imagen del mapa 3D nuevo
  (`mac/src/assets/mapa-rancho.webp`, con transparencia).
- **No se pudo probar en un Monterey real.** Si al instalar sigue «Sin conexión», pedir foto del recuadro gris completo.

## Bloqueo actual: compilación en GitHub
Las corridas de `app-mac.yml` fallaban con «The job was not started because recent account payments have failed or your
spending limit needs to be increased» (se acabaron los minutos de Actions; el repo era privado y las compilaciones de
Mac cuentan x10). Solución aplicada: **Jorge hizo `joya` público** (Actions gratis). Se lanzó la corrida
`43321692558` (`gh workflow run app-mac.yml --ref main`). Cuando publique: `latest.json` debe marcar **0.3.6**
(`https://ugfqgophrpaotnvikehf.supabase.co/storage/v1/object/public/versiones/latest.json`).
- Descarga Mac: `https://ugfqgophrpaotnvikehf.supabase.co/storage/v1/object/public/versiones/La-Joya.dmg`
  (instalar con clic derecho → Abrir; la 0.3.5 instalada no puede actualizarse sola porque no entra).
- Después de compilar, **regresar el repo a privado** (Settings → Danger Zone) si Jorge quiere. Revisado: el historial no
  tiene llaves; los secretos viven en GitHub Secrets.
- Si falla, revisar anotaciones: `gh api repos/jorgeeeeeeeww/joya/check-runs/<job>/annotations`.
- Ojo: cada push a `mac/**` cancela la compilación en curso (concurrency); subir versión (`mac/package.json`) solo cuando
  se quiera publicar.

## Falta (en orden)
1. Confirmar que la corrida terminó y `latest.json` = 0.3.6; pasarle el link a Jorge.
2. Que Jorge instale 0.3.6 en la Mac del cliente (borrar la vieja: Aplicaciones → Papelera; en Monterey los elementos
   de inicio están en Preferencias del Sistema → Usuarios y grupos) y pruebe entrar.
3. Si no entra: leer el recuadro de diagnóstico y atacar la causa (reloj, red/DNS, CSP, certificados).
4. Casas: Jorge manda **nombres, capacidad, precios y fotos**. Ponerlos en `web/src/data/lugares.ts`, en las listas de
   `web/scripts/fotos-lugares.mjs` (carpetas `joya/lugares/casa 1…7` ya existen; luego correr el script) y, en la base,
   desde la app (nombre/capacidad/precios) y encender **Publicada**. La posición en el mapa es por clave `casa-N`
   (`UBICACION` en `plano.ts`), no por nombre.
5. Pendientes anteriores: comprar dominio en Cloudflare y conectarlo (actualizar `site` en `web/astro.config.mjs`),
   instalar ntfy en el celular del dueño con el mismo tema, cargar precios/fotos/políticas desde la app, encender
   «Recibir reservaciones en la página», prueba de reserva completa de punta a punta.

## Notas de trabajo
- Trabajar en español; explicar la propuesta y esperar aprobación antes de construir cambios grandes (ver memoria).
- Windows: scripts complejos → escribir un `.py` y correrlo; `sleep` en primer plano está bloqueado.
- Pruebas de la app: `cd mac && npx tsc --noEmit && npx vite build && npm run probar:base && npm run probar` (26 y 53).
- Prueba en pantalla con todo conectado: servidor `rancho-real` de `.claude/launch.json` (web :4325, app :5182).
- `.claude/launch.json` tiene cambios locales sin commit (no importan).

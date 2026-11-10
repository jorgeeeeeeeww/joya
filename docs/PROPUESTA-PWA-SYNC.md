# Propuesta: PWA, sync y backend de La Joya

Estado: **aprobada y construida** (4 nov 2026). Probada con la nube de prueba en dos dispositivos simulados. Falta la prueba en un iPhone real y la configuración de las cuentas (ver docs/PUESTA-EN-MARCHA.md).

> **Aclaración:** Supabase no hospeda la app. Solo es el backend (datos, cuentas, fotos, avisos). Los archivos de la app se publican en Cloudflare, como ya estaba planeado.

---

## 1. iPhone: que abra bien y se actualice sola

**Lo que pasa hoy:** la app busca versión nueva cada hora con un temporizador (`src/main.tsx:20`). iPhone congela esos temporizadores cuando la app está en segundo plano. Además, la versión nueva espera a que alguien toque «Actualizar», así que un celular puede quedarse días con la versión vieja.

**Lo que haría:**

- **Buscar versión nueva** cada vez que se abre la app o se regresa a ella.
- **Al abrir desde el ícono**, si ya se descargó una versión nueva, se aplica sola antes de mostrar nada. No se pierde nada porque los datos viven en el celular.
- **Después de más de 5 minutos fuera**, se aplica al volver. Si la persona está a media captura, sigue saliendo el aviso «Actualizar» como hoy.
- **Versión mínima desde Supabase:** si cambia el formato de los datos, los celulares viejos se actualizan antes de subir cualquier cosa.
- **Un solo service worker propio** en vez del generado más `push-sw.js` por separado. Así todo se actualiza junto y no quedan piezas de versiones distintas.
- **Pantalla de arranque nativa** de iPhone en claro y en oscuro, para que no salga el destello blanco al abrir.
- **Abre donde la dejaste.** iPhone siempre abre la app en el inicio.
- **Deslizar hacia abajo para sincronizar y buscar versión nueva.** La app instalada en iPhone no tiene botón de recargar.
- **Avisos push:** hay un caso que no muestra nada (`public/push-sw.js:16`). En iPhone eso puede hacer que se pierda el permiso de notificaciones.
- **Si falta un archivo de la app** después de publicar, recarga sola una vez en lugar de mostrar un error.

## 2. Sync a prueba de señal débil y de iPhone

- **Riesgo de perder cambios recibidos:** el punto de avance de la bajada se guarda al instante (`src/lib/sync.ts:277`), pero los datos se guardan 300 ms después. Si iOS cierra la app justo en ese momento, esos cambios ya no se vuelven a bajar. → Guardarlos juntos, en una sola operación.
- **IndexedDB en iPhone** puede perder la conexión después de estar en segundo plano (falla conocida de WebKit, reportada todavía en 2025). Hoy los errores al guardar se ignoran sin avisar (`src/lib/store.ts:166`). → Reconectar, reintentar y avisar si no se puede.
- **Peticiones sin tiempo límite:** con señal débil en el rancho, el sync puede quedarse trabado para siempre. → Límite de tiempo y reintento.
- **Cambios que se pueden saltar** cuando dos subidas terminan en desorden. → La bajada lee con un margen hacia atrás; leer dos veces lo mismo no duplica nada.
- **Mensaje equivocado al volver a la app:** hoy dice «Vuelve a vincular el dispositivo» (`src/lib/sync.ts:218`) cuando solo hacía falta renovar la sesión. → Primero renovar y reintentar.
- **Tiempo real:** en iPhone se desconecta sin avisar. → Lo que recomienda Supabase: el pulso de conexión en un hilo aparte (`worker: true`) más un detector de desconexión. Y pasar a **Broadcast privado**: la base solo avisa «hubo cambios» y cada celular baja lo nuevo con sus propios permisos.
- **Fotos ya vistas** disponibles sin internet.
- **Nube de prueba:** actualizar `scripts/nube-de-prueba.mjs` para simular todo esto con dos dispositivos.

## 3. Supabase bien configurado

- **Llaves nuevas:** Supabase retira las llaves `anon` y `service_role` a finales de 2026. → Pasar a `sb_publishable_…` y `sb_secret_…`.
- **Configuración en archivos** (`supabase/config.toml`): registro público cerrado, dirección del sitio y funciones. Se aplica con un comando en vez de clics en el panel.
- **Seguridad:**
  - Reforzar las funciones que marcaría el asesor de seguridad de Supabase (`search_path` fijo) y sacar las internas de la API pública.
  - Hoy el rol para los avisos push lo manda el celular, así que alguien de limpieza podría recibir los avisos de administración. → Lo pone el servidor.
  - Cerrar el registro público: hoy cualquiera con la llave pública puede crear una cuenta. No vería datos, pero no debería poder.
- **Reglas por rol más rápidas:** el rol se calcula una vez por consulta, no una vez por cada registro.
- **Tareas programadas listas:** Airbnb y Booking cada 30 minutos y limpieza del historial, con los secretos guardados en Vault.
- **Respaldo nocturno:** hoy solo copia la tabla de datos. → Agregar las fotos y las cuentas.
- **Pruebas automáticas** de que cada rol solo ve y edita lo suyo.

## 4. Publicación

- **Cloudflare Workers** en lugar de Pages. Cloudflare los recomienda para proyectos nuevos y el archivo `_headers` funciona igual. Queda configurado en `wrangler.jsonc`.
- **Dirección y llave pública dentro de la app** desde que se publica: cada persona solo entra con su correo y contraseña. Esto también resuelve un problema de iPhone: Safari y la app instalada no comparten datos, y el QR de hoy abre Safari, así que lo que se vincula ahí no pasa a la app instalada.
- **Publicación automática con GitHub Actions:** al subir a `main` se aplican las migraciones y las funciones, y se publica la app.
- **Guía actualizada:** reescribir `docs/PUESTA-EN-MARCHA.md` con los pasos nuevos.

## 5. Monitor central: saber qué falla en cualquier dispositivo

**Lo que ya existe:** el *Panel de desarrollador* (`src/pages/Desarrollador.tsx`) muestra el estado del sync, los últimos 150 errores explicados en palabras y botones para reparar. **El problema:** cada celular guarda sus errores solo para sí mismo (`src/lib/errorLog.ts`). Para saber qué le pasa al celular de alguien de limpieza hay que tenerlo en la mano.

**Lo que haría:**

- **Errores de todos los dispositivos en la nube:** cada celular manda sus errores a una tabla `client_errors` en Supabase. Si no hay internet, se guardan y se mandan después. Solo se envía el error, la pantalla, la versión y el dispositivo, nunca los datos del rancho.
- **Vista «Dispositivos» en el panel del dueño:** cada celular o computadora con su persona, versión de la app, última sincronización, cambios pendientes de subir y errores recientes, con semáforo verde, amarillo o rojo.
- **Alertas al dueño** (aviso push) cuando:
  - un dispositivo lleva mucho tiempo sin sincronizar teniendo cambios pendientes;
  - un dispositivo sigue en una versión vieja;
  - el mismo error se repite muchas veces;
  - la nube rechaza cambios por permisos.
- **Fallas del backend en el mismo lugar:** funciones de Supabase (push, Airbnb y Booking), tareas programadas y respaldo nocturno, con su último resultado.
- **Errores agrupados:** el mismo error en varios celulares se muestra una sola vez con cuántos dispositivos lo tienen, desde cuándo y la explicación en palabras.
- **Limpieza automática:** los errores de más de 90 días se borran solos.
- **Sin servicios externos:** todo vive en Supabase, sin costo extra. Si más adelante hace falta algo más profundo, se puede conectar Sentry.

---

## Decisiones por defecto (si no se indica otra cosa)

- La dirección y la llave van dentro de la app, y se publica en Cloudflare Workers.
- Los cambios de diseño ya quedaron guardados en git (commit «Pulido premium»).

## Cómo se va a probar

- Compilando la app.
- Con la nube de prueba simulando dos dispositivos.
- Sin internet y en vista de celular en el navegador.
- Provocando errores a propósito en dos dispositivos simulados para ver que lleguen al monitor central y que salgan las alertas.

**Lo que no se puede probar desde aquí:** un iPhone real. La prueba final es instalar, cerrar la app, publicar una versión nueva y volver a abrir. Se entrega una lista de pasos para hacerla.

---

## Fuentes

- [Supabase: llaves nuevas](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase: Broadcast recomendado](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase: migrar a Broadcast](https://supabase.com/docs/guides/realtime/migrate-from-postgres-changes)
- [Supabase: desconexiones en segundo plano](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794)
- [WebKit: IndexedDB pierde conexión](https://bugs.webkit.org/show_bug.cgi?id=197050)
- [WebKit: almacenamiento de apps en la pantalla de inicio](https://bugs.webkit.org/show_bug.cgi?id=211775)
- [Cloudflare: apps de una página](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Cloudflare: Workers vs Pages](https://developers.cloudflare.com/workers/static-assets/compatibility-matrix)
- [Ejemplo de PWA atorada en iPhone](https://github.com/sebass80s/budget-app/pull/31)
- [Cambio en iOS 26 al agregar a inicio](https://github.com/StellarEdgeServices/otterquote-platform/issues/2296)

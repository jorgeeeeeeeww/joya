# Rendimiento y movimiento de la app Mac

Cambios locales del 14 de noviembre de 2026. El mapa abre siempre en 3D; no hay selector ni sustitución por un plano 2D.

## Comparación de carga

Medición de archivos de producción con el manifiesto de Vite. Cada dependencia estática se cuenta una sola vez. kB decimales; se excluyen fuentes e imágenes. Gzip es el tamaño comprimido calculado, no una medición del servidor de producción.

| Carga | Antes | Después | Reducción |
|---|---:|---:|---:|
| Entrada, JS + CSS | 949.2 kB | 871.2 kB | 8.2% |
| Entrada, gzip | 259.2 kB | 236.6 kB | 8.7% |
| Vista general con dependencias | 949.2 kB | 904.1 kB | 4.7% |
| Mapa con motor 3D y dependencias | 1,590.1 kB | 1,507.5 kB | 5.2% |

El mapa ahora carga su interfaz y luego el motor 3D. Este último sigue siendo necesario para mostrar la maqueta; no se ha eliminado su costo. Los formularios, búsqueda y entrada de sesión se cargan cuando se necesitan. Señalar una sección con mouse o teclado anticipa su descarga.

Referencias: [antes](rendimiento-antes.json), [después](rendimiento-despues.json).

## Fluidez y consumo

- Navegación sin esperar los 120 ms de salida de la pantalla anterior; entrada CSS de 180 ms con opacidad y desplazamiento.
- Entradas escalonadas breves en indicadores, respuesta al presionar navegación y acciones, cifras animadas de 550 ms y diálogos con entrada de 240 ms.
- Se quita el desenfoque animado del titular. Se respetan las preferencias de movimiento reducido y se pausan animaciones CSS cuando la ventana queda oculta.
- En equipos de hasta cuatro núcleos lógicos o sin soporte nativo de `color-mix`, el 3D limita el factor de píxeles a 1, usa sombras de 1024 en lugar de 2048 y deja de dibujar al estabilizarse la cámara. El perfil normal conserva el movimiento ambiental.
- El mapa comprueba visibilidad y destrucción antes de dibujar; se liberan geometrías, materiales y texturas al salir, evitando liberar duplicados.
- Los sondeos conservan referencias de datos sin cambios. El reloj del servidor se excluye de la comparación porque no se usa en las vistas. Cambios de pagos, fechas, bloqueos y ajustes sí se publican. Se evita escribir la caché cuando no cambian datos.
- El arreglo de colores de Safari reutiliza cálculos de mezclas y variables. Sus descargas tienen un límite de cinco segundos para evitar bloquear indefinidamente la entrada.
- El objetivo de compilación se ajusta de Safari 17 a Safari 15, coherente con macOS 12. Esto no equivale a certificar todas las funciones en cada versión de WebKit.

## Verificación

Compilación y TypeScript correctos. Tres pruebas de datos verifican sondeos con 1,000 reservaciones, pagos nuevos, cambio de día y bloqueos, incluida la conservación de referencias y ausencia de mutaciones.

El navegador Edge automatizado ejecutó cuatro perfiles con 1,000 reservaciones ficticias: normal, CPU limitada a 4×, movimiento reducido y compatibilidad de colores forzada. Se verificaron las cinco secciones, búsqueda, nueva reservación, mapa 3D, descarga diferida del motor, liberación del lienzo al salir y reintento tras fallo de WebGL. Sin errores de JavaScript. Se revisaron capturas del panel y mapa.

En la última ejecución, la vista general apareció en 498 ms en modo normal y 804 ms con CPU limitada. La preparación del 3D en el perfil CPU 4× quedó registrada en el informe. Son resultados locales con API simulada y caché de datos; no representan la latencia de Supabase ni una medición en una Mac antigua. Los tiempos de navegación incluyen esperas de carga y automatización. No hay referencia anterior de FPS o tiempo de arranque en navegador, por lo que no se afirma una mejora porcentual de esos tiempos.

Resultados completos: [mediciones del navegador](rendimiento-navegador.json). Capturas: [panel](fluidez-dashboard.png), [mapa siempre 3D](fluidez-mapa-3d.png).

## Repetir mediciones

Desde `mac/`:

```powershell
npm run medir:carga
node --test scripts/compartirDatos.test.mjs
```

Para la prueba de navegador se requiere Playwright y Edge instalados, y una compilación local con `VITE_NUBE_LOCAL_OK=1`. `scripts/probar-fluidez.mjs` crea su propio servidor y simula la API; no modifica datos del rancho. Se puede indicar `PLAYWRIGHT_MODULE` con la URL de archivo del módulo instalado. La prueba guarda JSON y capturas en `docs/`.

Al abrir la app con `?rendimiento`, `window.rendimientoJoya()` devuelve recursos, tiempos de RPC, navegación, preparación del mapa y tareas largas cuando el navegador las soporta. El historial de muestras está limitado a 180 registros y no se envía a servidores. La medición de recursos del navegador no incluye las peticiones que Tauri realiza mediante Rust; las RPC sí se cronometran en la app.

Criterio de animación: [guía oficial de rendimiento de web.dev](https://web.dev/articles/animations-guide). Configuración de destino y división de código: [documentación de Vite](https://vite.dev/guide/build).

# La Joya · Sistema de gestión

Sistema para **Jardines La Joya** (Tototlán, Jalisco): salón de eventos, jardín para eventos, 3 cabañas y 4 casas en renta, y el equipo que las atiende.

Es una **app web instalable (PWA)**. Se instala en iPhone, Android, tablet e iMac desde el navegador, sin App Store. Funciona sin internet y se sincroniza sola cuando vuelve la conexión.

## Qué incluye

| Módulo | Para quién | Qué hace |
|---|---|---|
| **Centro de control** | Administración | Lo controla todo: pulso del rancho, agenda unificada, mapa en vivo, equipo en vivo, disponibilidad de fines de semana, finanzas y alertas |
| **Panel de la Wedding planner** | Wedding planner | Próximo evento con cuenta regresiva, semana, seguimientos, cobros, disponibilidad y embudo |
| **Mi día / Mi ruta** | Limpieza / mantenimiento | Panel propio en el celular con la siguiente tarea en la zona del pulgar |
| **Prospectos** | Wedding planner | CRM con origen, seguimiento, presupuesto y conversión |
| **Proveedores** | Wedding planner | Directorio con calificación, favoritos y contacto directo |
| **Mapa 3D** | Todos | Maqueta del rancho trazada de la vista satelital. Al tocar una cabaña o casa, la cámara vuela hasta ella y muestra su estado, huésped, limpieza y acciones. También tiene modo plano 2D |
| **Hospedaje** | Administración | Calendario tipo Gantt, reservas, empalmes, pagos, check-in/out, WhatsApp, Airbnb y Booking por iCal |
| **Limpieza** | Empleadas (celular) | "Mi día", checklist con botones grandes, cronómetro, fotos de evidencia, reportar problemas y verificación |
| **Eventos** | Wedding planner (tablet) | Calendario, embudo, cotizador, plan de pagos, inspiración, presupuesto, invitados, programa del día, orden de evento con firma y **editor de plano de mesas** para el salón y el jardín |
| **Tareas** | Todos | Tablero y lista, checklist, fotos y asignación |
| **Inventario** | Administración, eventos, mantenimiento | Existencias, mínimos, lista de compras automática |
| **Finanzas** | Administración | Ingresos contra gastos, utilidad, tarifa promedio, RevPAR, gastos por categoría, exportar a Excel |
| **Equipo** | Administración | Personas, roles, PIN cifrado y desempeño |
| **Ajustes** | Todos (según rol) | Cada persona elige su atmósfera y tema (*Tu panel*). |
| **Ajustes (admin)** | Administración | Respaldos cifrados, nube, automatizaciones, bitácora, instalación y diagrama de arquitectura |

## Probarlo en esta computadora

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. En el celular, con la misma red Wi-Fi, abre la dirección `Network:` que muestra la terminal.

**PINs de demostración:** Administración `1234` · Lupita, eventos `2222` · María, limpieza `3333` · Carmen, limpieza `4444` · Chuy, mantenimiento `5555`. Cámbialos en *Equipo* antes de usar el sistema en serio.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo, accesible en la red local |
| `npm run build` | Revisión de tipos y versión de producción en `dist/` |
| `npm run preview` | Sirve la versión de producción para probarla |
| `npm run icons` | Regenera los íconos de la app desde `public/logo.svg` |

## Diseño

Toda la interfaz usa **step1**, el sistema de diseño de Jorge, con la atmósfera *Flor*. Ver [docs/diseno.md](docs/diseno.md) y la vitrina en `/diseno`.

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md): cómo está hecho, con diagramas.
- [docs/PUESTA-EN-MARCHA.md](docs/PUESTA-EN-MARCHA.md): publicar en Cloudflare Workers, conectar Supabase y la publicación automática con GitHub Actions, paso a paso.
- [docs/RED-LOCAL.md](docs/RED-LOCAL.md): pasar el sistema a la iMac de la oficina del rancho más adelante.

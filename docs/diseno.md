# Diseño · step1 en La Joya

```
Brief step1
Proyecto: Sistema de gestión de Jardines La Joya · Plataforma: PWA (móvil, tablet, iMac) · Rubro: salón de eventos + cabañas y casas en renta (Tototlán, Jal.)
Modo: Rediseño · Atmósfera: Flor · Tema: claro + oscuro automático
Intensidad: Equilibrada · Tipografía: Editorial (Fraunces + DM Sans) · Densidad: Aireada (táctil, 48 px)
Stack: Vite + React 19 + Tailwind v4 + Motion + three.js · Backend: Supabase (offline-first)
Pantallas clave: Centro de control (admin) · Panel de la Wedding planner · Mi día (limpieza) · Mapa 3D · Evento con plano de mesas
Firma visual: "La luz del atardecer guía el día del rancho"
```

## Diales

Respeta la regla de gravedad: solo un dial queda fuera de la base.

| Dial | Valor | Por qué |
|---|---|---|
| Atmósfera | **Flor** (rosa polvo, terracota, borgoña, oliva) | Bodas, XV años y jardines. Las casas llevan nombres de flores (Girasol, Lavanda, Magnolia, Bugambilia) y la calle se llama Crisantemo. |
| Intensidad | Equilibrada | Hay grano (0.07), la luz respira y la entrada sube 12 px. |
| Tipografía | Editorial | Fraunces SOFT 100 (peso 340) en titulares y cifras de peso 300; DM Sans en la interfaz. |
| Densidad | Aireada | Las empleadas usan la app con una mano, así que los controles miden 48 px. |
| Tema | Claro + oscuro | Sigue al sistema o a la preferencia de cada persona. |

## Cada persona, su panel y su atmósfera

- **Administración:** *Centro de control*, que lo ve y lo controla todo.
- **Wedding planner:** panel propio con eventos, prospectos (CRM), proveedores, plan de pagos, orden de evento (BEO) con firma y tablero de inspiración.
- **Limpieza:** *Mi día*, con el cielo arriba, el anillo del día y la siguiente casa con su acción en la zona del pulgar.
- **Mantenimiento:** *Mi ruta*, con las incidencias urgentes primero.
- En *Ajustes → Tu panel*, cada persona puede elegir su propia atmósfera (Flor, Marea, Crepúsculo o Nocturno) y su tema. Se guarda por persona y por dispositivo.

## Dónde vive cada cosa

| Qué | Archivo |
|---|---|
| Tokens (fuente de verdad) | `src/styles/step1.css`, copia literal de step1 v1.0 |
| Alias para módulos existentes y utilidades | `src/index.css` |
| Componentes base | `src/components/ui.tsx` |
| Primitivas de la huella (Luz, Horizonte, losa noche, cielo, ✦, puntos de luz) | `src/components/step1.tsx` |
| Movimiento "deriva" | `src/lib/motion.ts` |
| Vitrina de componentes | ruta `/diseno` |

## Mapa de tokens (rediseño)

Los módulos usaban tonos "pastel" con nombre. Se conservaron como **tonos categóricos** y ahora apuntan a los colores de datos de la atmósfera, así ningún módulo se rompió:

| Tono anterior | Ahora |
|---|---|
| `lavender` | `--data-5` (malva) |
| `rose` | `--data-2` (rosa polvo) |
| `peach` | `--chispa-soft` (terracota) |
| `butter` | `--data-3` (ocre) |
| `sky` | `--data-1` (pizarra) |
| `mint` | `--data-4` (verde azulado) |
| `sage` | `--data-6` (oliva) |
| `bg` / `bg-2` / `surface-2` | `--paper` / `--sunken` / mezcla de sunken y surface |
| `ink-2` / `ink-3` | `--ink-soft` / ink-soft atenuado (AA) |

Estados de las unidades: lista = oliva · ocupada = pizarra · por limpiar = terracota · limpiando = ocre · por revisar = verde azulado · mantenimiento = rosa polvo.

## Mezcla con la referencia "Fintrack" (medidas de dashboard)

Jorge pidió tomar las reglas de medidas y tipografía de un dashboard de referencia (Fintrack) y mezclarlas con step1. El reparto quedó así:

| Ámbito | Regla |
|---|---|
| **Datos:** tarjetas, indicadores, tablas, menús | DM Sans con escala compacta: categoría 11 px en mayúsculas (`kicker`), meta 12 px, interfaz 13 px, texto 14 px, título de tarjeta 15 px semibold y cifra principal 28 px semibold tabular. Dentro de `.card`, `heading` y `display-num` pasan a sans semibold. |
| **Momentos editoriales:** título de página, saludos, losas noche, inicio de sesión, hojas | Fraunces, la huella de step1. |
| **Medidas** | Tarjetas con radio 16 (entre 12 y 22), campos con radio 12. Controles de 40 px con mouse y 44 px con dedo (`pointer-fine:` / `pointer-coarse:`). Grano a 0.05. |
| **Barra lateral** | Compacta: elementos de 36 px y 14 px, grupos que se pliegan, contadores de pendientes y punto de luz en la sección activa. |
| **Barra superior** | Migas de pan, búsqueda con Ctrl K, presencia del equipo, tema claro/oscuro y avisos. |
| **Indicadores** | Ícono pequeño con etiqueta, variación a la derecha (↑/↓), cifra, nota y minigráfica de barras (`Sparkline`). |
| **Segmentado** | El activo va en superficie con sombra, no en primario: más sobrio para datos. |

Lo que no cambia de step1: papel cálido, paleta Flor, una sola Luz por vista, losas noche, sombras teñidas, pills y movimiento de deriva.

## Excepciones justificadas

- **Mapa 3D:** three.js no lee variables CSS, así que usa constantes `raw` apagadas de la atmósfera Flor.
- **Exportar el plano de mesas (PNG):** por la misma razón usa `TONE.raw`.
- **Paleta de cada evento:** son los colores que elige la clienta y se muestran tal cual.
- **Balanceo de ±2° en los perfiles colgados del hilo (inicio de sesión):** es el patrón "tarjetas colgando de un hilo" de step1 y se desactiva con movimiento reducido.

## Campos inteligentes e interacciones (fases A y B)

| Pieza | Archivo | Para qué |
|---|---|---|
| Campos con etiqueta flotante, ✓ y errores que explican | `src/components/fields.tsx` | `TextField`, `MoneyField` (separadores y monto sugerido), `PhoneField` (formato 33 1234 5678 y WhatsApp), `EmailField` (completa el dominio), `Stepper` (+/−), `DateField` / `DateRangeField` (noches ocupadas y precio), `TimeField` (atajos + rueda), `Combobox` (busca sin acentos y crea), `Choices` (pills o tarjetas), `NotesField` (crece y se dicta), `TagInput`, `Slider`, `SearchField`, `useAutosave`, `StepTrail` |
| Interacciones | `src/components/interact.tsx` | `SwipeRow` (deslizar), `DragBoard` (arrastrar entre columnas), `FlipCard`, `useContextMenu` (mantener presionado), `SortableList` (reordenar) |
| Borrar con deshacer | `src/lib/undo.ts` | En vez de "¿seguro?", se borra y aparece "Deshacer" 6 s |
| Escáner | `src/components/Scanner.tsx` | Pases QR en la puerta y códigos de barras del inventario (funciona sin internet) |
| Red de seguridad | `src/components/ErrorBoundary.tsx` | Si una pantalla falla, aviso tranquilo y reintentar |

Reglas: una acción principal por vista (`PageHeader primary`, que en el celular es el botón flotante) y lo demás en el menú "…". Opciones de 6 o menos como pills o tarjetas; listas largas con buscador. Lo que se edita en vivo se guarda solo.

## Reglas móviles (iOS HIG + Material 3)

Toda pantalla se revisa a 375 px de ancho antes de entregarse.

| Regla | Cómo se aplica en La Joya |
|---|---|
| Rejilla de 8 | Margen lateral de 16 px; espacios de 8, 16 y 24 px. |
| Renglones de lista | Ícono de 40 px · título (15–17 px) y texto de apoyo (13–14 px) · acciones al final, siempre en el mismo lugar. Nunca botones que bajan a otra fila. |
| Filtros | De 2 a 4 opciones: control segmentado con celdas iguales (cifra arriba, nombre abajo). Más de 4: buscador o lista. |
| Áreas táctiles | 44 px mínimo (iOS) y 48 px en acciones principales. |
| Formularios | Una sola columna en celular; en hojas se usa `@xl:grid-cols-2` (columnas según el ancho de la hoja, no de la pantalla). El valor de un campo va en una línea. |
| Texto | Nunca «…»: si no cabe, baja de línea (`.truncate` envuelve en toda la app; solo las barras del calendario usan `.keep-truncate`). |
| Desplazamiento | Nada se mueve de lado; sin carruseles que dejen tarjetas a medias en la orilla. |
| Acción principal | Una por vista: botón flotante en celular, botón en el encabezado en PC. |

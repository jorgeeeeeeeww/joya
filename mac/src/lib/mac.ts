// Puente con la Mac (Tauri): avisos de macOS, número en el Dock y en la barra de menú, menú de arriba,
// abrir ligas, abrir al encender y actualizaciones. Fuera de la app (en el navegador, mientras se
// desarrolla en Windows) cada función hace lo más parecido que puede o no hace nada.

export const enMac = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
export const esMacOS = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)
/** «⌘» en la Mac, «Ctrl» en Windows */
export const CMD = esMacOS ? '⌘' : 'Ctrl '

export async function permisoAvisos(): Promise<boolean> {
  try {
    if (enMac) {
      const n = await import('@tauri-apps/plugin-notification')
      if (await n.isPermissionGranted()) return true
      return (await n.requestPermission()) === 'granted'
    }
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** ¿Los avisos están permitidos? Solo revisa, no pregunta nada */
export async function avisosPermitidos(): Promise<boolean> {
  try {
    if (enMac) {
      const n = await import('@tauri-apps/plugin-notification')
      return await n.isPermissionGranted()
    }
    return 'Notification' in window && Notification.permission === 'granted'
  } catch {
    return false
  }
}

/** Aviso de macOS (aparece en el Centro de notificaciones) */
export async function avisar(titulo: string, cuerpo: string) {
  if (!(await permisoAvisos())) return
  try {
    if (enMac) {
      const n = await import('@tauri-apps/plugin-notification')
      n.sendNotification({ title: titulo, body: cuerpo })
    } else {
      new Notification(titulo, { body: cuerpo, icon: '/logo.svg' })
    }
  } catch {
    /* sin avisos */
  }
}

/** Número de solicitudes por atender: en el ícono del Dock y junto al ícono de la barra de menú */
export async function ponerInsignia(n: number) {
  document.title = n > 0 ? `(${n}) La Joya · Reservaciones` : 'La Joya · Reservaciones'
  if (!enMac) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setBadgeCount(n > 0 ? n : undefined)
  } catch {
    /* Windows no tiene número en el ícono */
  }
  try {
    const { TrayIcon } = await import('@tauri-apps/api/tray')
    const t = await TrayIcon.getById('principal')
    await t?.setTitle(n > 0 ? String(n) : null)
    await t?.setTooltip(n > 0 ? `La Joya · ${n} por atender` : 'La Joya · Reservaciones')
  } catch {
    /* sin ícono en la barra de menú */
  }
}

/** Abre una liga en el navegador o en WhatsApp */
export async function abrirLiga(url: string) {
  if (enMac) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

export async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto)
  } catch {
    // El motor de la Mac a veces niega el portapapeles moderno: se copia a la antigua
    const area = document.createElement('textarea')
    area.value = texto
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    if (!ok) throw new Error('No se pudo copiar')
  }
}

// ── Abrir al encender la Mac ──
export async function abreAlIniciar(): Promise<boolean | null> {
  if (!enMac) return null
  try {
    const a = await import('@tauri-apps/plugin-autostart')
    return await a.isEnabled()
  } catch {
    return null
  }
}
export async function cambiarAbreAlIniciar(si: boolean) {
  if (!enMac) return
  const a = await import('@tauri-apps/plugin-autostart')
  if (si) await a.enable()
  else await a.disable()
}
/** La primera vez queda encendido para que no se pierda ninguna solicitud; después manda lo que elija el dueño en Ajustes */
export async function encenderAbreAlIniciarLaPrimeraVez() {
  if (!enMac) return
  const CLAVE = 'la-joya-mac:abre-al-iniciar'
  try {
    if (localStorage.getItem(CLAVE)) return
    await cambiarAbreAlIniciar(true)
    localStorage.setItem(CLAVE, '1')
  } catch (e) {
    console.warn('No se pudo dejar la app abriendo al prender la Mac', e)
  }
}

// ── Actualizaciones (se firman con la llave del proyecto, no hace falta la cuenta de Apple) ──
export interface Actualizacion {
  version: string
  notas?: string
  instalar: (progreso?: (pct: number) => void) => Promise<void>
}
/**
 * Devuelve la versión nueva, o `null` si la app ya está al día.
 * Lanza un error si no se pudo revisar (sin internet o sin dónde buscar): quien llama decide si lo dice.
 */
export async function buscarActualizacion(): Promise<Actualizacion | null> {
  if (!enMac) return null
  const { check } = await import('@tauri-apps/plugin-updater')
  const u = await check()
  if (!u) return null
  return {
    version: u.version,
    notas: u.body,
    instalar: async (progreso) => {
      let total = 0
      let bajado = 0
      await u.downloadAndInstall((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0
        if (e.event === 'Progress') {
          bajado += e.data.chunkLength
          if (total) progreso?.(Math.min(100, Math.round((bajado / total) * 100)))
        }
      })
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    },
  }
}

/** Instala una versión nueva y avisa si algo falla (la app sigue abierta con la versión actual) */
export async function instalarActualizacion(u: Actualizacion, alFallar: (detalle: string) => void) {
  try {
    await u.instalar()
  } catch (e) {
    alFallar(e instanceof Error ? e.message : String(e))
  }
}

/** Avisos que manda la barra de menú (el ícono de arriba) cuando la ventana estaba escondida */
export async function alPedirNuevaReservacion(hacer: () => void): Promise<() => void> {
  if (!enMac) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen('nueva-reservacion', () => hacer())
}

// ── Menú de arriba de la Mac ──
export interface AccionesMenu {
  ir: (vista: 'hoy' | 'calendario' | 'reservaciones' | 'cabanas' | 'ajustes') => void
  nuevaReservacion: () => void
  nuevoCierre: () => void
  buscar: () => void
  irAHoy: () => void
  actualizar: () => void
}
export async function ponerMenu(a: AccionesMenu) {
  if (!enMac) return
  try {
    const { Menu, Submenu, MenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu')
    const sep = () => PredefinedMenuItem.new({ item: 'Separator' })
    const item = (id: string, text: string, accelerator: string | undefined, action: () => void) => MenuItem.new({ id, text, accelerator, action: () => action() })
    const app = await Submenu.new({
      text: 'La Joya',
      items: [
        await PredefinedMenuItem.new({ item: { About: { name: 'La Joya · Reservaciones', version: __APP_VERSION__, copyright: 'Jardines La Joya' } }, text: 'Acerca de La Joya' }),
        await sep(),
        await item('ajustes', 'Ajustes…', 'CmdOrCtrl+,', () => a.ir('ajustes')),
        await sep(),
        await PredefinedMenuItem.new({ item: 'Services', text: 'Servicios' }),
        await sep(),
        await PredefinedMenuItem.new({ item: 'Hide', text: 'Ocultar La Joya' }),
        await PredefinedMenuItem.new({ item: 'HideOthers', text: 'Ocultar otros' }),
        await PredefinedMenuItem.new({ item: 'ShowAll', text: 'Mostrar todo' }),
        await sep(),
        await PredefinedMenuItem.new({ item: 'Quit', text: 'Salir de La Joya' }),
      ],
    })
    const archivo = await Submenu.new({
      text: 'Archivo',
      items: [
        await item('nueva', 'Nueva reservación', 'CmdOrCtrl+N', a.nuevaReservacion),
        await item('cierre', 'Cerrar fechas', 'CmdOrCtrl+Shift+N', a.nuevoCierre),
        await sep(),
        await item('buscar', 'Buscar…', 'CmdOrCtrl+F', a.buscar),
        await sep(),
        await PredefinedMenuItem.new({ item: 'CloseWindow', text: 'Cerrar ventana' }),
      ],
    })
    const edicion = await Submenu.new({
      text: 'Edición',
      items: [
        await PredefinedMenuItem.new({ item: 'Undo', text: 'Deshacer' }),
        await PredefinedMenuItem.new({ item: 'Redo', text: 'Rehacer' }),
        await sep(),
        await PredefinedMenuItem.new({ item: 'Cut', text: 'Cortar' }),
        await PredefinedMenuItem.new({ item: 'Copy', text: 'Copiar' }),
        await PredefinedMenuItem.new({ item: 'Paste', text: 'Pegar' }),
        await PredefinedMenuItem.new({ item: 'SelectAll', text: 'Seleccionar todo' }),
      ],
    })
    const ver = await Submenu.new({
      text: 'Ver',
      items: [
        await item('v-hoy', 'Hoy', 'CmdOrCtrl+1', () => a.ir('hoy')),
        await item('v-cal', 'Calendario', 'CmdOrCtrl+2', () => a.ir('calendario')),
        await item('v-res', 'Reservaciones', 'CmdOrCtrl+3', () => a.ir('reservaciones')),
        await item('v-cab', 'Cabañas', 'CmdOrCtrl+4', () => a.ir('cabanas')),
        await sep(),
        await item('ir-hoy', 'Ir a hoy en el calendario', 'CmdOrCtrl+T', a.irAHoy),
        await item('recargar', 'Actualizar', 'CmdOrCtrl+R', a.actualizar),
        await sep(),
        await PredefinedMenuItem.new({ item: 'Fullscreen', text: 'Pantalla completa' }),
      ],
    })
    const ventana = await Submenu.new({
      text: 'Ventana',
      items: [
        await PredefinedMenuItem.new({ item: 'Minimize', text: 'Minimizar' }),
        await PredefinedMenuItem.new({ item: 'Maximize', text: 'Zoom' }),
        await sep(),
        await PredefinedMenuItem.new({ item: 'BringAllToFront', text: 'Traer todo al frente' }),
      ],
    })
    const menu = await Menu.new({ items: [app, archivo, edicion, ver, ventana] })
    await menu.setAsAppMenu()
  } catch (e) {
    console.warn('No se pudo poner el menú de la Mac', e)
  }
}

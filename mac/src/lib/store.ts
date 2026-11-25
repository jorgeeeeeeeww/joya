import { sonarAviso } from './sonido'
import { medir } from './rendimiento'
import { compartirDatos } from './compartirDatos'
// Estado de la app: sesión, datos de la nube, qué se ve y qué está abierto.
// Los datos se bajan completos con hosp_datos (son pocos: unas cuantas cabañas y sus reservaciones)
// y se vuelven a bajar cuando la nube avisa «hubo cambios», cada 30 s y al volver a la ventana.
import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import type { Datos, ISODate, Reservacion } from './tipos'
import { nube, rpc } from './nube'
import { activa } from './estados'
import { hoyLocal, masDias, plural, rango } from './fechas'
import { mxn } from './dinero'
import { avisar, avisosPermitidos, ponerInsignia } from './mac'
import { toast } from '@/components/ui'

export type Vista = 'hoy' | 'mapa' | 'calendario' | 'reservaciones' | 'cabanas' | 'apartar' | 'ajustes'
export interface Nueva {
  tipo: 'reservacion' | 'cierre'
  cabana_id?: string
  llegada?: ISODate
  salida?: ISODate
}

interface Estado {
  sesion: Session | null | undefined
  ponerSesion: (sesion: Session | null) => void
  datos: Datos | null
  conexion: 'conectando' | 'en-linea' | 'sin-conexion'
  /** La cuenta entró pero no es del equipo de hospedaje */
  sinPermiso: boolean
  /** Canal de tiempo real conectado */
  enVivo: boolean
  ultimaCarga: number
  /** Avisos de macOS permitidos (null = todavía no se revisa) */
  avisos: boolean | null
  revisarAvisos: () => Promise<void>
  vista: Vista
  abierta: string | null
  nueva: Nueva | null
  buscar: boolean
  cabana: string | 'nueva' | null
  irAHoy: number
  filtro: 'atender' | 'proximas' | 'todas' | 'canceladas'
  ir: (v: Vista) => void
  pedirHoy: () => void
  abrir: (id: string | null) => void
  crear: (n: Nueva | null) => void
  setBuscar: (v: boolean) => void
  editarCabana: (id: string | 'nueva' | null) => void
  setFiltro: (f: Estado['filtro']) => void
  cargar: () => Promise<void>
  /** Revisión ligera: pregunta a la nube si cambió algo y solo entonces baja todo */
  revisar: () => Promise<void>
  salir: () => Promise<void>
  parchar: (id: string, p: Partial<Reservacion>) => void
}

const CACHE = 'la-joya-mac:datos'
const VISTOS = 'la-joya-mac:vistos'
const CORREO = 'la-joya-mac:correo'
const MOTIVO = 'la-joya-mac:motivo'

let saliendo = false
/** ¿La sesión se cerró porque la persona le dio «Salir»? */
export const esSalidaManual = () => saliendo

/** Para que Entrar deje el correo escrito la próxima vez */
export function recordarCorreo(correo?: string | null) {
  try {
    if (correo) localStorage.setItem(CORREO, correo)
  } catch {
    /* sin almacenamiento */
  }
}
export function correoGuardado() {
  try {
    return localStorage.getItem(CORREO) ?? ''
  } catch {
    return ''
  }
}
/** La sesión se cerró sola (venció o la nube la rechazó): Entrar lo explica en vez de aparecer sin motivo */
export function marcarVencida(correo?: string | null) {
  recordarCorreo(correo)
  try {
    localStorage.setItem(MOTIVO, 'vencio')
  } catch {
    /* sin almacenamiento */
  }
}
/** Lee (y borra) el motivo por el que se llegó a Entrar */
export function motivoDeEntrada(): 'vencio' | null {
  try {
    const m = localStorage.getItem(MOTIVO)
    localStorage.removeItem(MOTIVO)
    return m === 'vencio' ? 'vencio' : null
  } catch {
    return null
  }
}

function datosGuardados(usuario: string): Datos | null {
  try {
    const copia = JSON.parse(localStorage.getItem(CACHE) || 'null')
    return copia?.usuario === usuario && Array.isArray(copia.datos?.reservaciones) && Array.isArray(copia.datos?.cabanas) && copia.datos.ajustes ? copia.datos : null
  } catch {
    return null
  }
}

let cargaEnCurso: Promise<void> | null = null
let primeraCarga = true
let generacionSesion = 0
// Sondeo ligero (22 nov): cada 30 s se pregunta «¿cambió algo?» (hosp_version, un número) en vez de bajar todo.
let revisionEnCurso: Promise<void> | null = null
/** La base todavía no tiene hosp_version: se baja todo como antes */
let sinVersion = false
/** Después de notar un cambio, la siguiente revisión baja todo otra vez (el contador sube un instante antes de que el cambio quede guardado) */
let confirmarCambio = false
let ultimaCompleta = 0
/** Aunque nada avise, cada 5 minutos se baja todo */
const COMPLETA_CADA_MS = 5 * 60_000

export const useApp = create<Estado>((set, get) => ({
  sesion: undefined,
  datos: null,
  ponerSesion: (sesion) => {
    const anterior = get().sesion?.user.id
    const usuario = sesion?.user.id
    if (anterior === usuario && get().sesion !== undefined) {
      set({ sesion })
      return
    }
    // Una respuesta de otra sesión nunca puede repoblar datos ni caché.
    generacionSesion++
    cargaEnCurso = null
    revisionEnCurso = null
    confirmarCambio = false
    ultimaCompleta = 0
    primeraCarga = true
    if (!usuario) {
      try { localStorage.removeItem(CACHE); localStorage.removeItem(VISTOS) } catch { /* sin almacenamiento */ }
    }
    set({ sesion, datos: usuario ? datosGuardados(usuario) : null, abierta: null, nueva: null, buscar: false, cabana: null, vista: 'hoy', sinPermiso: false, enVivo: false, ultimaCarga: 0, conexion: 'conectando' })
  },
  conexion: 'conectando',
  sinPermiso: false,
  enVivo: false,
  ultimaCarga: 0,
  avisos: null,
  revisarAvisos: async () => set({ avisos: await avisosPermitidos() }),
  vista: 'hoy',
  abierta: null,
  nueva: null,
  buscar: false,
  cabana: null,
  irAHoy: 0,
  filtro: 'atender',
  ir: (vista) => {
    if (vista !== get().vista) {
      performance.clearMarks('joya:navegacion')
      performance.mark('joya:navegacion')
    }
    set((s) => ({ vista, buscar: false, abierta: vista === s.vista ? s.abierta : null }))
  },
  pedirHoy: () => set((s) => ({ irAHoy: s.irAHoy + 1 })),
  abrir: (abierta) => set({ abierta }),
  crear: (nueva) => set({ nueva }),
  setBuscar: (buscar) => set({ buscar }),
  editarCabana: (cabana) => set({ cabana }),
  setFiltro: (filtro) => set({ filtro }),
  salir: async () => {
    saliendo = true
    recordarCorreo(get().sesion?.user.email)
    try {
      localStorage.removeItem(CACHE)
      localStorage.removeItem(VISTOS)
    } catch {
      /* sin almacenamiento */
    }
    get().ponerSesion(null)
    primeraCarga = true
    void ponerInsignia(0)
    try {
      await nube.auth.signOut()
    } finally {
      saliendo = false
    }
  },
  parchar: (id, p) =>
    set((s) => (s.datos ? { datos: { ...s.datos, reservaciones: s.datos.reservaciones.map((r) => (r.id === id ? { ...r, ...p } : r)) } } : {})),
  cargar: () => {
    const usuario = get().sesion?.user.id
    if (!usuario) return Promise.resolve()
    if (cargaEnCurso) return cargaEnCurso
    const generacion = generacionSesion
    const vigente = () => generacion === generacionSesion && get().sesion?.user.id === usuario
    cargaEnCurso = (async () => {
      try {
        const hoy = get().datos?.hoy ?? hoyLocal()
        const datos = await rpc<Datos>('hosp_datos', { p_desde: masDias(hoy, -120), p_hasta: masDias(hoy, 540) })
        if (!vigente()) return
        ultimaCompleta = Date.now()
        revisarNuevas(datos)
        const terminar = medir('datos:comparar-y-cache')
        const anteriores = get().datos
        const compartidos = compartirDatos(anteriores, datos)
        const cambio = compartidos !== anteriores
        // Sin cambios: conserva referencias; calendarios y mapa no recalculan por cada sondeo.
        set({ datos: compartidos, conexion: 'en-linea', sinPermiso: false, ultimaCarga: Date.now() })
        try {
          if (cambio) localStorage.setItem(CACHE, JSON.stringify({ usuario, datos: compartidos }))
        } catch {
          /* sin espacio: no pasa nada */
        }
        terminar()
      } catch (e) {
        if (!vigente()) return
        const msg = e instanceof Error ? e.message : String(e)
        const code = (e as { code?: string }).code
        if (code === '42501') {
          set({ datos: null, sinPermiso: true, conexion: 'en-linea' })
          try { localStorage.removeItem(CACHE) } catch { /* sin almacenamiento */ }
          return
        }
        set({ conexion: 'sin-conexion' })
        // Auth renueva la sesión y comunica las revocaciones reales. Un fallo
        // de consulta o de internet no debe cerrar una sesión recuperable.
        if (!get().datos) toast.error('No se pudieron bajar los datos', msg)
      } finally {
        if (vigente()) cargaEnCurso = null
      }
    })()
    return cargaEnCurso
  },
  revisar: () => {
    const usuario = get().sesion?.user.id
    if (!usuario) return Promise.resolve()
    const d = get().datos
    // Sin datos, sin contador o ya toca: se baja todo
    if (!d || d.version == null || sinVersion || confirmarCambio || Date.now() - ultimaCompleta > COMPLETA_CADA_MS) {
      confirmarCambio = false
      return get().cargar()
    }
    if (cargaEnCurso) return cargaEnCurso
    if (revisionEnCurso) return revisionEnCurso
    const generacion = generacionSesion
    const vigente = () => generacion === generacionSesion && get().sesion?.user.id === usuario
    revisionEnCurso = (async () => {
      try {
        const v = await rpc<{ v: number; hoy: ISODate; avisos_sin_enviar: number }>('hosp_version')
        if (!vigente()) return
        const actual = get().datos
        if (actual && v.v === actual.version && v.hoy === actual.hoy && v.avisos_sin_enviar === actual.avisos_sin_enviar) {
          set({ conexion: 'en-linea', sinPermiso: false, ultimaCarga: Date.now() })
          return
        }
        confirmarCambio = true
        await get().cargar()
      } catch (e) {
        if (!vigente()) return
        const code = (e as { code?: string }).code
        const msg = e instanceof Error ? e.message : String(e)
        // La base aún no tiene la función (migración sin aplicar): se sigue como antes, bajando todo
        if (code === 'PGRST202' || code === '42883' || /hosp_version/i.test(msg)) {
          sinVersion = true
          await get().cargar()
          return
        }
        // Permiso retirado u otro fallo: la carga completa sabe explicarlo
        if (code === '42501') await get().cargar()
        else set({ conexion: 'sin-conexion' })
      } finally {
        if (vigente()) revisionEnCurso = null
      }
    })()
    return revisionEnCurso
  },
}))

/** Solicitudes que llegaron de la web y todavía no se habían visto: aviso de macOS y número en el Dock */
function revisarNuevas(d: Datos) {
  const pendientes = d.reservaciones.filter((r) => r.estado === 'solicitud' && activa(r))
  let vistos: string[] = []
  try {
    vistos = JSON.parse(localStorage.getItem(VISTOS) || '[]')
  } catch {
    vistos = []
  }
  const conocidas = new Set(vistos)
  const nuevas = pendientes.filter((r) => r.origen === 'web' && !conocidas.has(r.id))
  const cabana = (id: string) => d.cabanas.find((c) => c.id === id)?.nombre ?? 'Cabaña'
  if (nuevas.length) {
    if (!primeraCarga) void sonarAviso()
    if (primeraCarga && nuevas.length > 1) {
      void avisar('La Joya', `Tienes ${plural(pendientes.length, 'solicitud', 'solicitudes')} por atender`)
    } else {
      for (const r of nuevas) {
        const texto = `${r.nombre} · ${rango(r.llegada, r.salida)} · ${plural(r.huespedes, 'persona', 'personas')} · ${mxn(r.total)}`
        void avisar(`Nueva solicitud · ${cabana(r.cabana_id)}`, texto)
        if (!primeraCarga) toast.action(`Nueva solicitud de ${r.nombre.split(' ')[0]}`, { label: 'Ver', onClick: () => useApp.getState().abrir(r.id) }, `${cabana(r.cabana_id)} · ${rango(r.llegada, r.salida)}`)
      }
    }
  }
  primeraCarga = false
  try {
    const ids = new Set(d.reservaciones.map((r) => r.id))
    localStorage.setItem(VISTOS, JSON.stringify([...new Set([...vistos.filter((v) => ids.has(v)), ...pendientes.map((r) => r.id)])]))
  } catch {
    /* sin almacenamiento */
  }
  void ponerInsignia(pendientes.length)
}

// ── Hooks de lectura ──
export const useDatos = () => useApp((s) => s.datos)

/** Tras cambiar algo: vuelve a bajar los datos (la nube también avisa, esto es por si acaso) */
export const recargar = () => useApp.getState().cargar()

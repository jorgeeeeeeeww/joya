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

export type Vista = 'hoy' | 'mapa' | 'calendario' | 'reservaciones' | 'cabanas' | 'ajustes'
export interface Nueva {
  tipo: 'reservacion' | 'cierre'
  cabana_id?: string
  llegada?: ISODate
  salida?: ISODate
}

interface Estado {
  sesion: Session | null | undefined
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

function datosGuardados(): Datos | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) || 'null')
  } catch {
    return null
  }
}

let cargaEnCurso: Promise<void> | null = null
let primeraCarga = true

export const useApp = create<Estado>((set, get) => ({
  sesion: undefined,
  datos: datosGuardados(),
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
  ir: (vista) => set((s) => ({ vista, buscar: false, abierta: vista === s.vista ? s.abierta : null })),
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
    set({ datos: null, abierta: null, nueva: null, cabana: null, vista: 'hoy', sinPermiso: false })
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
    if (cargaEnCurso) return cargaEnCurso
    cargaEnCurso = (async () => {
      try {
        const hoy = get().datos?.hoy ?? hoyLocal()
        const datos = await rpc<Datos>('hosp_datos', { p_desde: masDias(hoy, -120), p_hasta: masDias(hoy, 540) })
        revisarNuevas(datos)
        set({ datos, conexion: 'en-linea', sinPermiso: false, ultimaCarga: Date.now() })
        try {
          localStorage.setItem(CACHE, JSON.stringify(datos))
        } catch {
          /* sin espacio: no pasa nada */
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const code = (e as { code?: string }).code
        if (code === '42501') {
          set({ sinPermiso: true, conexion: 'en-linea' })
          return
        }
        set({ conexion: 'sin-conexion' })
        if (/sesión venció/i.test(msg)) await nube.auth.signOut()
        else if (!get().datos) toast.error('No se pudieron bajar los datos', msg)
      } finally {
        cargaEnCurso = null
      }
    })()
    return cargaEnCurso
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

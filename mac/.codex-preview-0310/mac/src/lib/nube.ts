// Conexión con la nube (Supabase). La dirección y la llave pública vienen de la compilación;
// sin ellas, la app usa la nube local de la computadora (npm run nube).
import { createClient } from '@supabase/supabase-js'

export const URL_NUBE = (import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54331').replace(/\/$/, '')
export const LLAVE_PUBLICA = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_local'
export const esNubeLocal = /127\.0\.0\.1|localhost/.test(URL_NUBE)
/** Una app compilada para instalar que no trae la dirección de la nube del rancho: no sirve, y la app lo dice en vez de mostrar «Entrar» */
export const sinNubeDelRancho = import.meta.env.PROD && esNubeLocal && !import.meta.env.VITE_NUBE_LOCAL_OK

// ── Cómo salen las peticiones ──
// Dentro de la app de la Mac, las peticiones a la nube salen por Rust (el plugin http) y no por el navegador
// interno de la Mac: así no dependen de la versión de Safari que tenga esa Mac, ni de su CORS ni de su CSP.
// Si por algo Rust no puede, se intenta una vez por el navegador interno.
const enTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
type Fetch = typeof fetch
let fetchRust: Fetch | null | undefined
let rustFunciono = false
export const estadoRed: { errorRust?: string; violacionesCsp: string[] } = { violacionesCsp: [] }
if (typeof document !== 'undefined') {
  document.addEventListener('securitypolicyviolation', (e) => {
    if (estadoRed.violacionesCsp.length < 5) estadoRed.violacionesCsp.push(`${e.violatedDirective} → ${e.blockedURI}`)
  })
}
const textoDe = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))

async function cargarRust(): Promise<Fetch | null> {
  if (fetchRust !== undefined) return fetchRust
  try {
    fetchRust = (await import('@tauri-apps/plugin-http')).fetch as unknown as Fetch
  } catch (e) {
    estadoRed.errorRust = textoDe(e)
    fetchRust = null
  }
  return fetchRust
}

const fetchNube: Fetch = async (entrada, init) => {
  if (!enTauri || esNubeLocal) return fetch(entrada, init)
  const rust = await cargarRust()
  if (rust) {
    try {
      const r = await rust(entrada, init)
      rustFunciono = true
      return r
    } catch (e) {
      estadoRed.errorRust = textoDe(e)
      // Si Rust ya había funcionado, el fallo es de la red de ese momento: no se repite la petición por otro lado
      if (rustFunciono) throw e
    }
  }
  return fetch(entrada, init)
}

/** Prueba directa por Rust (para el diagnóstico de la pantalla de entrada): qué respondió y cuánto difiere el reloj de la Mac */
export async function probarPorRust(): Promise<string> {
  if (!enTauri) return 'no aplica (navegador)'
  const rust = await cargarRust()
  if (!rust) return `no disponible (${estadoRed.errorRust ?? 'sin motivo'})`
  try {
    const r = await rust(`${URL_NUBE}/auth/v1/settings`, { headers: { apikey: LLAVE_PUBLICA } })
    const fecha = r.headers.get('date')
    const desfase = fecha ? Math.round((Date.now() - new Date(fecha).getTime()) / 1000) : null
    return `respondió ${r.status}${desfase === null ? '' : ` · reloj de la Mac ${desfase >= 0 ? '+' : ''}${desfase} s vs la nube`}`
  } catch (e) {
    return textoDe(e)
  }
}

export const nube = createClient(URL_NUBE, LLAVE_PUBLICA, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'la-joya-mac:sesion' },
  realtime: { params: { eventsPerSecond: 5 } },
  global: { fetch: fetchNube },
})

export const urlFoto = (ruta: string) => `${URL_NUBE}/storage/v1/object/public/cabanas/${ruta.split('/').map(encodeURIComponent).join('/')}`

export class ErrorNube extends Error {
  code?: string
  constructor(mensaje: string, code?: string) {
    super(mensaje)
    this.code = code
  }
}

function explicar(mensaje: string, code?: string) {
  if (/fetch|network|load failed|conexi/i.test(mensaje)) return 'Sin conexión con la nube. Revisa el internet e intenta de nuevo.'
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(mensaje)) return 'Tu sesión venció. Vuelve a entrar.'
  if (code === '42501' && !/solo/i.test(mensaje)) return 'Tu cuenta no tiene permiso para esto.'
  return mensaje
}

/** Llama una función de la base y devuelve su resultado (o lanza un error ya explicado en español) */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await nube.rpc(fn, args)
  if (error) throw new ErrorNube(explicar(error.message, error.code), error.code)
  return data as T
}

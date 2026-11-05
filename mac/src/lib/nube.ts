// Conexión con la nube (Supabase). La dirección y la llave pública vienen de la compilación;
// sin ellas, la app usa la nube local de la computadora (npm run nube).
import { createClient } from '@supabase/supabase-js'

export const URL_NUBE = (import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54331').replace(/\/$/, '')
export const LLAVE_PUBLICA = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_local'
export const esNubeLocal = /127\.0\.0\.1|localhost/.test(URL_NUBE)

export const nube = createClient(URL_NUBE, LLAVE_PUBLICA, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'la-joya-mac:sesion' },
  realtime: { params: { eventsPerSecond: 5 } },
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

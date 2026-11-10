// Dirección y llave pública de la nube que vienen dentro de la app desde que se publica
// (variables VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en la publicación).
// Con ellas, cada persona solo escribe su correo y contraseña: no hace falta escanear un QR ni copiar llaves.
// Esto también resuelve un problema de iPhone: Safari y la app instalada no comparten datos, así que lo
// que se vinculaba en Safari (desde el QR) no pasaba a la app instalada.
export const BAKED_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
export const BAKED_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
export const hasBakedCloud = !!(BAKED_URL && BAKED_KEY)

/** Las llaves nuevas de Supabase (sb_publishable_…, sb_secret_…) no son JWT: no van en «Authorization» */
export const isJwtKey = (key: string) => key.startsWith('eyJ')

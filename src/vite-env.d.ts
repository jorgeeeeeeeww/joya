/// <reference types="vite/client" />

/** Número de versión de esta publicación (fecha y hora UTC: AAAAMMDDHHmm). Sirve para comparar versiones. */
declare const __BUILD_ID__: string
/** Versión del paquete (package.json) */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Dirección del proyecto de Supabase, fija desde la publicación */
  readonly VITE_SUPABASE_URL?: string
  /** Llave pública (sb_publishable_…) del proyecto de Supabase */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Llave pública VAPID para avisos push */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

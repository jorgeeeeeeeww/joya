/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Solo para probar una versión compilada contra la nube local de la computadora */
  readonly VITE_NUBE_LOCAL_OK?: string
}

// Utilidades compartidas de las funciones: cliente con la llave secreta, secreto de las tareas
// programadas y registro del resultado para el monitor central.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Llave secreta del proyecto. Con las llaves nuevas (sb_secret_…) se guarda como secreto SB_SECRET_KEY
 * (`supabase secrets set SB_SECRET_KEY=sb_secret_…`). Mientras existan las anteriores, sirve la de servicio.
 */
export function secretKey(): string {
  const k = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!k) throw new Error('Falta la llave secreta (SB_SECRET_KEY)')
  return k
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Comparación en tiempo constante (no revela cuánto del secreto coincide) */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x[i]! ^ y[i]!
  return diff === 0 && x.length > 0
}

/** ¿La llamada viene de la propia base (tareas programadas y avisos), con el secreto de Vault? */
export function fromCron(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET') ?? ''
  const legacy = Deno.env.get('WEBHOOK_SECRET') ?? ''
  const got = req.headers.get('x-cron-secret') ?? ''
  const gotLegacy = req.headers.get('x-webhook-secret') ?? ''
  return (!!expected && safeEqual(got, expected)) || (!!legacy && safeEqual(gotLegacy, legacy))
}

/** Guarda el último resultado de la tarea para el monitor central (nunca hace fallar la función) */
export async function recordRun(sb: SupabaseClient, job: string, label: string, ok: boolean, detail?: string) {
  try {
    await sb.rpc('record_backend_run', { p_job: job, p_label: label, p_ok: ok, p_detail: detail ?? null })
  } catch {
    /* el monitor no es indispensable */
  }
}

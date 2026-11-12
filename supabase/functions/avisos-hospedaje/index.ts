// Manda los correos de hospedaje (aviso al dueño de cada solicitud nueva y confirmaciones al huésped).
// La llama la propia base (trigger de hospedaje_avisos y el barrido de cada 10 minutos) con el secreto de Vault.
// Secretos: RESEND_API_KEY, AVISOS_REMITENTE (por ejemplo «La Joya <reservas@tudominio.mx>»), CRON_SECRET, SB_SECRET_KEY
// y, para los avisos al celular del dueño, NTFY_TEMA (el nombre del canal privado de la app ntfy).
import { mandarAvisos } from './handler.ts'
import { adminClient, fromCron, recordRun, secretKey } from '../_shared/admin.ts'

Deno.serve(async (req) => {
  if (!fromCron(req)) return new Response('No autorizado', { status: 401 })
  const sb = adminClient()
  try {
    const r = await mandarAvisos({
      url: Deno.env.get('SUPABASE_URL')!,
      llaveSecreta: secretKey(),
      resendKey: Deno.env.get('RESEND_API_KEY') || undefined,
      remitente: Deno.env.get('AVISOS_REMITENTE') || undefined,
      ntfyTema: Deno.env.get('NTFY_TEMA') || undefined,
    })
    const detalle = `${r.enviados} enviados` + (r.fallidos ? `, ${r.fallidos} fallaron` : '') + (r.sinConfigurar ? `, ${r.sinConfigurar} sin configurar` : '')
    await recordRun(sb, 'correos-hospedaje', 'Correos de hospedaje', r.fallidos === 0 && r.sinConfigurar === 0, detalle)
    return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await recordRun(sb, 'correos-hospedaje', 'Correos de hospedaje', false, msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})

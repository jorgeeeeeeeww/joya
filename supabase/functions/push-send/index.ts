// Envía notificaciones push cuando se crea un aviso (collection = 'notifications').
// La llama la propia base de datos (trigger notify_push, con el secreto de Vault): no hace falta webhook.
// Secretos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), CRON_SECRET, SB_SECRET_KEY.
// Configurada en supabase/config.toml (sin verificación de JWT: valida el secreto aquí).
import webpush from 'npm:web-push@3.6.7'
import { adminClient, fromCron, recordRun } from '../_shared/admin.ts'

Deno.serve(async (req) => {
  if (!fromCron(req)) return new Response('No autorizado', { status: 401 })
  const body = await req.json().catch(() => null)
  const row = body?.record
  if (!row || row.collection !== 'notifications' || row.deleted) return new Response('ignorado')
  const n = row.data as { title: string; body: string; link?: string; roles?: string[]; userId?: string }
  const sb = adminClient()

  try {
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@lajoya.mx', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
    // El puesto de cada suscripción sale de la cuenta (profiles), nunca de lo que mandó el celular
    const { data: subs, error } = await sb.from('push_subscriptions').select('endpoint, subscription, user_id')
    if (error) throw error
    const userIds = [...new Set((subs ?? []).map((s) => s.user_id))]
    const { data: profiles } = userIds.length ? await sb.from('profiles').select('id, role, employee_id').in('id', userIds) : { data: [] }
    const byUser = new Map((profiles ?? []).map((p) => [p.id, p]))
    const roles = n.roles ?? []
    const targets = (subs ?? []).filter((s) => {
      const p = byUser.get(s.user_id)
      if (!p || !roles.includes(p.role)) return false
      // Aviso para una sola persona: solo a su cuenta
      return !n.userId || p.employee_id === n.userId
    })

    const payload = JSON.stringify({ title: n.title || 'La Joya', body: n.body ?? '', url: n.link ?? '/', tag: row.id })
    let sent = 0
    let failed = 0
    for (const s of targets) {
      try {
        await webpush.sendNotification(s.subscription, payload, { TTL: 60 * 60 * 6, urgency: 'high' })
        sent++
      } catch (e: any) {
        // Suscripción vencida o revocada: se elimina
        if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        else failed++
      }
    }
    await recordRun(sb, 'push', 'Avisos push', failed === 0 || sent > 0, `${sent} enviados${failed ? `, ${failed} fallaron` : ''}`)
    return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await recordRun(sb, 'push', 'Avisos push', false, msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})

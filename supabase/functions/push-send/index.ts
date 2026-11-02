// Envía notificaciones push cuando se crea un aviso (collection = 'notifications').
// Se dispara con un Database Webhook (INSERT en public.documents) hacia esta función.
// Secretos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), WEBHOOK_SECRET.
// Desplegar:  supabase functions deploy push-send --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return new Response('No autorizado', { status: 401 })
  const body = await req.json().catch(() => null)
  const row = body?.record
  if (!row || row.collection !== 'notifications' || row.deleted) return new Response('ignorado')
  const n = row.data as { title: string; body: string; link?: string; roles: string[] }

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@lajoya.mx', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: subs } = await sb.from('push_subscriptions').select('endpoint, subscription, role').in('role', n.roles ?? [])

  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.link ?? '/', tag: row.id })
  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.subscription, payload, { TTL: 60 * 60 * 6, urgency: 'high' })
      sent++
    } catch (e: any) {
      // Suscripción vencida o revocada: se elimina
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
    }
  }
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { 'Content-Type': 'application/json' } })
})

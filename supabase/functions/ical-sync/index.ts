// POST /functions/v1/ical-sync  (opcional: { "unitId": "u_c1" })
// Descarga el calendario iCal de Airbnb/Booking de cada unidad y crea/actualiza las reservas.
// La llama la app ("Sincronizar ahora", solo administración) o la tarea programada cada 30 minutos
// (con el secreto de Vault). Configurada en supabase/config.toml (valida el acceso aquí).
import { parseICS } from '../_shared/ical.ts'
import { adminClient, fromCron, recordRun } from '../_shared/admin.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const sb = adminClient()

  // Solo administración (o la tarea programada con el secreto de Vault) puede sincronizar
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!fromCron(req)) {
    const { data: user } = await sb.auth.getUser(auth)
    const { data: profile } = user?.user ? await sb.from('profiles').select('role').eq('id', user.user.id).single() : { data: null }
    if (profile?.role !== 'admin') return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors })
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  let q = sb.from('documents').select('id,data').eq('collection', 'units').eq('deleted', false)
  if (body.unitId) q = q.eq('id', body.unitId)
  const { data: units } = await q

  const summary: Record<string, { nuevas: number; actualizadas: number; canceladas: number; error?: string }> = {}
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  for (const { id: unitId, data: unit } of units ?? []) {
    if (!unit.icalImportUrl?.startsWith('https://')) continue
    const s = (summary[unit.name] = { nuevas: 0, actualizadas: 0, canceladas: 0 })
    try {
      const res = await fetch(unit.icalImportUrl, { headers: { 'User-Agent': 'LaJoya/1.0' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const events = parseICS(await res.text())
      const source = unit.icalImportUrl.includes('booking.com') ? 'booking' : 'airbnb'
      const { data: existing } = await sb.from('documents').select('id,data').eq('collection', 'reservations').filter('data->>unitId', 'eq', unitId).filter('data->>source', 'eq', source)
      const byUid = new Map((existing ?? []).filter((r) => r.data.externalUid).map((r) => [r.data.externalUid, r]))
      const seen = new Set<string>()
      const rows = []
      for (const ev of events) {
        seen.add(ev.uid)
        const blocked = /not available|blocked|no disponible/i.test(ev.summary ?? '')
        const prev = byUid.get(ev.uid)
        if (prev && prev.data.checkIn === ev.start && prev.data.checkOut === ev.end) continue
        const id = prev?.id ?? `res_ical_${crypto.randomUUID().slice(0, 12)}`
        const doc = {
          ...(prev?.data ?? { createdAt: now, total: 0, guests: blocked ? 0 : 1, status: 'confirmada', notes: blocked ? 'Bloqueo de calendario' : 'Importada de ' + source }),
          id,
          unitId,
          source,
          externalUid: ev.uid,
          guestName: prev?.data.guestName ?? (blocked ? 'Bloqueado' : `Huésped ${source === 'airbnb' ? 'Airbnb' : 'Booking'}`),
          checkIn: ev.start,
          checkOut: ev.end,
          updatedAt: now,
        }
        rows.push({ collection: 'reservations', id, data: doc, deleted: false })
        prev ? s.actualizadas++ : s.nuevas++
      }
      // Reservas futuras que desaparecieron del calendario = canceladas en la plataforma
      for (const [uid, r] of byUid) {
        if (!seen.has(uid) && r.data.checkIn >= today && r.data.status !== 'cancelada') {
          rows.push({ collection: 'reservations', id: r.id, data: { ...r.data, status: 'cancelada', updatedAt: now }, deleted: false })
          s.canceladas++
        }
      }
      if (rows.length) {
        const { error } = await sb.from('documents').upsert(rows, { onConflict: 'collection,id' })
        if (error) throw error
      }
    } catch (e) {
      s.error = String(e instanceof Error ? e.message : e)
    }
  }

  const failed = Object.entries(summary).filter(([, s]) => s.error)
  await recordRun(sb, 'ical', 'Calendarios de Airbnb y Booking', failed.length === 0, failed.length ? failed.map(([name, s]) => `${name}: ${s.error}`).join(' · ') : `${Object.keys(summary).length} calendarios al día`)
  return new Response(JSON.stringify({ ok: true, summary }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})

// GET /functions/v1/ical-export?unit=<unitId>&token=<icalExportToken>
// Feed .ics que se pega en Airbnb / Booking ("Importar calendario") para bloquear
// las fechas vendidas por otros canales. Protegido con un token por unidad.
// Desplegar con:  supabase functions deploy ical-export --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildICS } from '../_shared/ical.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const unitId = url.searchParams.get('unit')
  const token = url.searchParams.get('token')
  if (!unitId || !token) return new Response('Faltan parámetros', { status: 400 })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: unitRow } = await sb.from('documents').select('data').eq('collection', 'units').eq('id', unitId).single()
  const unit = unitRow?.data
  // Comparación en tiempo constante para no filtrar el token
  const a = new TextEncoder().encode(String(unit?.icalExportToken ?? ''))
  const b = new TextEncoder().encode(token)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i] ^ b[i]
  if (!unit || diff !== 0) return new Response('No autorizado', { status: 401 })

  const { data: rows } = await sb.from('documents').select('data').eq('collection', 'reservations').eq('deleted', false).filter('data->>unitId', 'eq', unitId)
  const today = new Date().toISOString().slice(0, 10)
  const events = (rows ?? [])
    .map((r) => r.data)
    .filter((r) => r.status !== 'cancelada' && r.source !== 'airbnb' && r.checkOut >= today)
    .map((r) => ({ uid: `${r.id}@lajoya`, start: r.checkIn, end: r.checkOut, summary: 'Reservado · La Joya' }))

  return new Response(buildICS(unit.name, events), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  })
})

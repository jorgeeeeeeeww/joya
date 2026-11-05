// Lógica de la función «reservar», sin nada propio de Deno: la misma corre en Supabase (index.ts)
// y en la nube local de la computadora (mac/nube-local/servidor.mjs).
//
// La web manda los datos del huésped; aquí se revisa el anti-robots de Cloudflare (Turnstile) y se
// llama a solicitar_reservacion con la llave secreta, pasando la dirección de internet para frenar abusos.
// La base hace todo lo demás: valida, calcula el precio, aparta las fechas y avisa al dueño.

export interface EntornoReserva {
  /** Dirección del proyecto de Supabase (SUPABASE_URL) */
  url: string
  /** Llave secreta (sb_secret_…) o, mientras exista, la de servicio */
  llaveSecreta: string
  /** Secreto de Cloudflare Turnstile. Sin él no se pide el anti-robots (solo para probar). */
  turnstileSecreto?: string
  /** Direcciones de la web que pueden llamar (CORS). Vacío = cualquiera. */
  origenes?: string[]
}

const CAMPOS = ['cabana', 'llegada', 'salida', 'huespedes', 'nombre', 'telefono', 'correo', 'hora_llegada', 'comentarios', 'acepto'] as const

function cabeceras(llave: string): Record<string, string> {
  // Las llaves nuevas (sb_…) van solo en «apikey»; las anteriores (JWT) también en Authorization
  return llave.startsWith('sb_') ? { apikey: llave } : { apikey: llave, Authorization: `Bearer ${llave}` }
}

export async function manejarReserva(req: Request, env: EntornoReserva): Promise<Response> {
  const origen = req.headers.get('origin') ?? ''
  const lista = env.origenes ?? []
  const permitido = lista.length === 0 || !origen || lista.includes(origen)
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': lista.length === 0 ? origen || '*' : permitido ? origen : lista[0]!,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  }
  const responder = (status: number, cuerpo: unknown) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return responder(405, { ok: false, motivo: 'metodo', mensaje: 'Usa POST.' })
  if (!permitido) return responder(403, { ok: false, motivo: 'origen', mensaje: 'Esta página no puede crear reservaciones.' })

  let datos: Record<string, unknown>
  try {
    const j = await req.json()
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('no es un objeto')
    datos = j as Record<string, unknown>
  } catch {
    return responder(400, { ok: false, motivo: 'datos', mensaje: 'No entendimos los datos de la solicitud.' })
  }

  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? ''

  if (env.turnstileSecreto) {
    const token = typeof datos.turnstile === 'string' ? datos.turnstile : ''
    if (!token) return responder(400, { ok: false, motivo: 'robot', mensaje: 'Confirma que no eres un robot.' })
    const form = new URLSearchParams({ secret: env.turnstileSecreto, response: token })
    if (ip) form.set('remoteip', ip)
    const v = (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
      .then((r) => r.json())
      .catch(() => null)) as { success?: boolean } | null
    if (!v?.success) return responder(400, { ok: false, motivo: 'robot', mensaje: 'No pudimos confirmar que no eres un robot. Recarga la página e intenta de nuevo.' })
  }

  const p: Record<string, unknown> = {}
  for (const k of CAMPOS) if (k in datos) p[k] = datos[k]
  if (ip) p.ip = ip

  let r: Response
  try {
    r = await fetch(`${env.url.replace(/\/$/, '')}/rest/v1/rpc/solicitar_reservacion`, {
      method: 'POST',
      headers: { ...cabeceras(env.llaveSecreta), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p }),
    })
  } catch {
    return responder(502, { ok: false, motivo: 'servidor', mensaje: 'No pudimos guardar tu solicitud. Intenta de nuevo en un momento.' })
  }
  const cuerpo = (await r.json().catch(() => null)) as { ok?: boolean; motivo?: string } | null
  if (!r.ok || !cuerpo) return responder(502, { ok: false, motivo: 'servidor', mensaje: 'No pudimos guardar tu solicitud. Intenta de nuevo en un momento.' })
  if (cuerpo.ok) return responder(200, cuerpo)
  return responder(cuerpo.motivo === 'no_disponible' ? 409 : cuerpo.motivo === 'demasiados' ? 429 : 400, cuerpo)
}

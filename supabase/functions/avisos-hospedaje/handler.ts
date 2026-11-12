// Lógica de la función «avisos-hospedaje», sin nada propio de Deno (corre igual en la nube local).
// Toma los avisos pendientes (tabla hospedaje_avisos), los manda y los marca: los correos con Resend y los de
// WhatsApp (el aviso al dueño de cada solicitud nueva) con CallMeBot.

export interface Correo {
  id: number
  /** Por dónde va; los avisos viejos no lo traen y son correos */
  canal?: 'correo' | 'whatsapp'
  para: string
  asunto: string
  cuerpo: string
}

export interface EntornoAvisos {
  url: string
  llaveSecreta: string
  /** Llave de Resend (RESEND_API_KEY). Sin ella los correos quedan como «sin configurar». */
  resendKey?: string
  /** Remitente, por ejemplo «La Joya <reservas@jardineslajoya.mx>». Sin dominio propio: onboarding@resend.dev */
  remitente?: string
  /** CallMeBot: el teléfono (con lada de país, sin +) y la clave (apikey) que le dio al mandar su permiso. Sin ellos los WhatsApp quedan «sin configurar». */
  callmebotTelefono?: string
  callmebotApikey?: string
  /** Para probar: en lugar de Resend */
  enviar?: (c: Correo) => Promise<{ ok: boolean; detalle?: string }>
  /** Para probar: en lugar de CallMeBot */
  enviarWhatsApp?: (c: Correo) => Promise<{ ok: boolean; detalle?: string }>
}

function cabeceras(llave: string): Record<string, string> {
  return llave.startsWith('sb_') ? { apikey: llave } : { apikey: llave, Authorization: `Bearer ${llave}` }
}

async function rpc(env: EntornoAvisos, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(`${env.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...cabeceras(env.llaveSecreta), 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${texto.slice(0, 200)}`)
  return texto ? JSON.parse(texto) : null
}

async function enviarConResend(c: Correo, env: EntornoAvisos): Promise<{ ok: boolean; detalle?: string }> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.remitente || 'La Joya <onboarding@resend.dev>', to: [c.para], subject: c.asunto, text: c.cuerpo }),
  })
  if (r.ok) {
    const j = (await r.json().catch(() => ({}))) as { id?: string }
    return { ok: true, detalle: j.id }
  }
  return { ok: false, detalle: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` }
}

/** CallMeBot responde 200 aun cuando algo salió mal (clave inválida, sin permiso…): se lee lo que dice */
async function enviarConCallMeBot(c: Correo, env: EntornoAvisos): Promise<{ ok: boolean; detalle?: string }> {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(env.callmebotTelefono!)}&text=${encodeURIComponent(c.cuerpo)}&apikey=${encodeURIComponent(env.callmebotApikey!)}`
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  const texto = (await r.text().catch(() => '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (r.ok && !/error|invalid|incorrect|not (found|registered|allowed|authori[sz]ed)|blocked|paused|wrong/i.test(texto)) return { ok: true, detalle: texto.slice(0, 120) || undefined }
  return { ok: false, detalle: `CallMeBot ${r.status}: ${texto.slice(0, 200)}` }
}

export async function mandarAvisos(env: EntornoAvisos): Promise<{ enviados: number; fallidos: number; sinConfigurar: number }> {
  const lista = ((await rpc(env, 'hosp_tomar_avisos', {})) ?? []) as Correo[]
  let enviados = 0
  let fallidos = 0
  let sinConfigurar = 0
  let ultimoWhatsApp = 0
  for (const c of lista) {
    if (c.canal === 'whatsapp') {
      if (!env.enviarWhatsApp && !(env.callmebotTelefono && env.callmebotApikey)) {
        sinConfigurar++
        await rpc(env, 'hosp_marcar_aviso', { p_id: c.id, p_estado: 'sin_configurar', p_detalle: 'Faltan CALLMEBOT_TELEFONO y CALLMEBOT_APIKEY en los secretos de las funciones' })
        continue
      }
      // CallMeBot pide un respiro entre mensajes
      const espera = ultimoWhatsApp + 2_000 - Date.now()
      if (!env.enviarWhatsApp && espera > 0) await new Promise((ok) => setTimeout(ok, espera))
      let resW: { ok: boolean; detalle?: string }
      try {
        resW = env.enviarWhatsApp ? await env.enviarWhatsApp(c) : await enviarConCallMeBot(c, env)
      } catch (e) {
        resW = { ok: false, detalle: e instanceof Error ? e.message : String(e) }
      }
      ultimoWhatsApp = Date.now()
      if (resW.ok) enviados++
      else fallidos++
      await rpc(env, 'hosp_marcar_aviso', { p_id: c.id, p_estado: resW.ok ? 'enviado' : 'error', p_detalle: resW.detalle ?? null })
      continue
    }
    if (!env.enviar && !env.resendKey) {
      sinConfigurar++
      await rpc(env, 'hosp_marcar_aviso', { p_id: c.id, p_estado: 'sin_configurar', p_detalle: 'Falta RESEND_API_KEY en los secretos de las funciones' })
      continue
    }
    let res: { ok: boolean; detalle?: string }
    try {
      res = env.enviar ? await env.enviar(c) : await enviarConResend(c, env)
    } catch (e) {
      res = { ok: false, detalle: e instanceof Error ? e.message : String(e) }
    }
    if (res.ok) enviados++
    else fallidos++
    await rpc(env, 'hosp_marcar_aviso', { p_id: c.id, p_estado: res.ok ? 'enviado' : 'error', p_detalle: res.detalle ?? null })
  }
  return { enviados, fallidos, sinConfigurar }
}

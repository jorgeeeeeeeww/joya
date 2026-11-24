import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { correoHtml } from './plantilla.ts'
import { mandarAvisos } from './handler.ts'

test('la plantilla conserva texto y enlace y escapa los datos del huésped', () => {
  const html = correoHtml('Reserva <LJ-1>', 'Hola <Ana> & familia\nhttps://jardineslajoya.com/mi-reservacion/?a=1&b=2')
  assert.match(html, /Reserva &lt;LJ-1&gt;/)
  assert.match(html, /Hola &lt;Ana&gt; &amp; familia<br>/)
  assert.match(html, /href="https:\/\/jardineslajoya\.com\/mi-reservacion\/\?a=1&amp;b=2"/)
  assert.match(html, />Abrir mi reservación<\/a>/)
  assert.match(html, /@media \(prefers-color-scheme:dark\)/)
  assert.doesNotMatch(html, /<Ana>/)
  assert.match(html, /alt="Jardines La Joya"/)
})

test('el envío usa la misma información en texto y HTML', async () => {
  const original = globalThis.fetch
  const cuerpo = 'Hola Ana\nTu solicitud LJ-1 fue recibida.'
  let envio: Record<string, unknown> | undefined
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/hosp_tomar_avisos')) return Response.json([{ id: 1, para: 'prueba@example.com', asunto: 'Solicitud LJ-1', cuerpo }])
    if (url === 'https://api.resend.com/emails') {
      envio = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ id: 'prueba' })
    }
    if (url.endsWith('/hosp_marcar_aviso')) return Response.json(null)
    throw new Error(`Petición inesperada: ${url}`)
  }
  try {
    const resultado = await mandarAvisos({ url: 'https://example.test', llaveSecreta: 'test', resendKey: 'test', remitente: 'La Joya <reservas@example.com>' })
    assert.equal(resultado.enviados, 1)
    assert.equal(envio?.text, cuerpo)
    assert.match(String(envio?.html), /Hola Ana<br>Tu solicitud LJ-1 fue recibida/)
  } finally {
    globalThis.fetch = original
  }
})

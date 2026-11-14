import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, extname, sep } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const tipos = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' }
const raiz = resolve('dist')
const servidor = createServer(async (req, res) => {
  try {
    const ruta = new URL(req.url, 'http://localhost').pathname
    const file = resolve(raiz, `.${ruta === '/' ? '/index.html' : ruta}`)
    if (!file.startsWith(raiz + sep)) { res.writeHead(403).end(); return }
    res.setHeader('Content-Type', tipos[extname(file)] || 'application/octet-stream')
    res.end(await readFile(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const origen = process.env.APP_URL || `http://127.0.0.1:${servidor.address().port}`
const hoy = '2026-11-14'
const cabanas = Array.from({ length: 16 }, (_, i) => ({ id: `c${i}`, slug: `habitacion-${i + 1}`, nombre: `Habitación ${i + 1}`, tipo: 'habitacion', capacidad: 4, recamaras: 1, camas: '2 matrimoniales', banos: 1, amenidades: [], fotos: [], precio_noche: 1200, precio_fin_semana: 1500, huespedes_incluidos: 2, precio_huesped_extra: 100, noches_minimas: 1, publicada: true, orden: i, resumen: 'Hospedaje de prueba', descripcion: 'Prueba local', notas: null }))
const reservaciones = Array.from({ length: 1000 }, (_, i) => {
  const llegada = new Date(Date.UTC(2026, 8, 1 + i % 360)).toISOString().slice(0, 10)
  const salida = new Date(Date.UTC(2026, 8, 3 + i % 360)).toISOString().slice(0, 10)
  return { id: `r${i}`, codigo: `LJ-${i}`, cabana_id: cabanas[i % 16].id, llegada, salida, huespedes: 2, nombre: `Huésped prueba ${i}`, telefono: null, correo: null, hora_llegada: null, comentarios: null, origen: 'directo', estado: 'confirmada', total: 2400, anticipo: 1200, pagado: 1200, vence: null, motivo_cancelacion: null, notas: null, creada: `${hoy}T12:00:00Z`, confirmada_en: null, pagada_en: null, cancelada_en: null }
})
const datos = { hoy, ahora: `${hoy}T12:00:00Z`, desde: '2026-07-01', hasta: '2028-05-01', es_admin: true, cabanas, reservaciones, temporadas: [], bloqueos: [], avisos_sin_enviar: 0, ajustes: { reservas_web: true, telefono_salon: null, telefono_hospedaje: null, correo_avisos: null, url_web: null, hora_llegada: '15:00', hora_salida: '12:00', anticipo_pct: 50, horas_apartado: 24, noches_minimas: 1, noches_fin_semana: [5,6], dias_anticipacion: 365, banco: null, clabe: null, titular: null, politicas: null, aviso_privacidad: null } }
const user = { id: '11111111-1111-4111-a111-111111111111', email: 'prueba@lajoya.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: `${hoy}T00:00:00Z` }
const exp = Math.floor(Date.now() / 1000) + 3600
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })).toString('base64url')}.prueba`
const session = { access_token: token, refresh_token: 'prueba-local', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const resultados = []
try {
  for (const perfil of ['normal', 'cpu4x', 'reducido', 'compat']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: perfil === 'reducido' ? 'reduce' : 'no-preference' })
    await context.addInitScript(({ session, datos }) => {
      localStorage.setItem('la-joya-mac:sesion', JSON.stringify(session))
      localStorage.setItem('la-joya-mac:datos', JSON.stringify(datos))
      Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4 })
    }, { session, datos })
    await context.route('http://127.0.0.1:54331/**', async route => {
      const url = route.request().url()
      if (url.includes('/rpc/hosp_datos')) return route.fulfill({ json: { ...datos, ahora: new Date().toISOString() } })
      if (url.includes('/auth/v1/user')) return route.fulfill({ json: user })
      if (url.includes('/rpc/hosp_buscar')) return route.fulfill({ json: [] })
      if (url.includes('/rpc/hosp_reservacion')) {
        const id = route.request().postDataJSON()?.p_id
        return route.fulfill({ json: { ...reservaciones.find(r => r.id === id), cabana: 'Habitación de prueba', liga: null, desglose: [], pagos: [], eventos: [] } })
      }
      return route.fulfill({ json: {} })
    })
    await context.routeWebSocket('**/realtime/v1/websocket**', ws => { ws.onMessage(() => {}) })
    const page = await context.newPage()
    const errores = []
    page.on('pageerror', e => errores.push(e.message))
    if (perfil === 'cpu4x') {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    const inicio = performance.now()
    await page.goto(`${origen}/?rendimiento${perfil === 'compat' ? '&compat' : ''}`)
    await page.locator('h1').filter({ hasText: 'Vista general' }).waitFor()
    const carga = Math.round(performance.now() - inicio)
    assert(!(await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name))).some(url => /MapaRancho-/.test(url)), 'No debe descargar el motor 3D antes de abrir Mapa')
    const vistas = {}
    for (const [nombre, vista] of [['Mapa', 'mapa'], ['Calendario', 'calendario'], ['Reservaciones', 'reservaciones'], ['Hospedajes', 'cabanas'], ['Hoy', 'hoy']]) {
      const desde = performance.now()
      await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: new RegExp(`^${nombre}`) }).click()
      await page.locator(`.app-shell[data-vista="${vista}"] .vista-entrada h1`).first().waitFor()
      vistas[vista] = Math.round(performance.now() - desde)
      if (vista === 'calendario') {
        // Mes de seis semanas y ventanas bajas: la rueda debe llegar a la última fila.
        for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click()
        for (const alto of [640, 860, 1000]) {
          await page.setViewportSize({ width: 1320, height: alto })
          await page.locator('#contenido').evaluate(el => { el.scrollTop = 0 })
          await page.mouse.move(800, 400)
          await page.mouse.wheel(0, 10000)
          await page.waitForFunction(() => document.getElementById('contenido').scrollTop > 0)
          for (const dia of ['29', '30', '31']) {
            const boton = page.locator(`[data-fecha="2027-05-${dia}"] > button`).first()
            await boton.click()
            assert.equal(await boton.getAttribute('aria-pressed'), 'true', `Debe poder seleccionarse el ${dia} en ventana de ${alto}px`)
            const caja = await boton.boundingBox()
            assert(caja && caja.y >= 0 && caja.y + caja.height <= alto, `El día ${dia} debe quedar visible`)
          }
          if (perfil === 'normal' && alto === 640) await page.screenshot({ path: '../docs/calendario-fin-de-mes.png' })
        }
        await page.setViewportSize({ width: 1440, height: 1000 })
      }
      if (vista === 'mapa') {
        await page.locator('canvas').waitFor()
        await page.waitForFunction(() => window.rendimientoJoya().muestras.some(m => m.nombre === 'mapa:preparar-3d'), null, { timeout: 20000 })
        assert.equal(await page.getByRole('button', { name: 'Plano 2D', exact: true }).count(), 0)
        if (perfil === 'normal') await page.screenshot({ path: '../docs/fluidez-mapa-3d.png' })
      }
    }
    assert.equal(await page.locator('canvas').count(), 0, 'Salir del mapa debe liberar su lienzo WebGL')
    await page.getByRole('button', { name: 'Buscar reservaciones y huéspedes' }).click()
    await page.getByRole('dialog', { name: 'Buscar', exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Buscar', exact: true }).waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: /^Nueva reservación \(/ }).click()
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    if (perfil === 'normal') await page.screenshot({ path: '../docs/fluidez-dashboard.png', fullPage: true })
    if (perfil === 'normal') {
      // La GPU puede no estar disponible: se informa y permite reintentar, sin cambiar a 2D.
      await page.evaluate(() => {
        window.getContextPrueba = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function(tipo, ...args) {
          return /^webgl/.test(tipo) ? null : window.getContextPrueba.call(this, tipo, ...args)
        }
      })
      await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: /^Mapa/ }).click()
      await page.getByRole('button', { name: 'Reintentar vista 3D' }).waitFor()
      await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = window.getContextPrueba })
      await page.getByRole('button', { name: 'Reintentar vista 3D' }).click()
      await page.locator('canvas').waitFor()
    }
    const mediciones = await page.evaluate(() => window.rendimientoJoya())
    assert.deepEqual(errores, [], 'La navegación debe funcionar sin errores de JavaScript')
    resultados.push({ perfil, carga, vistas, errores, mediciones })
    await context.close()
    console.log(JSON.stringify({ perfil, carga, vistas, errores }))
  }
  await writeFile('../docs/rendimiento-navegador.json', JSON.stringify(resultados, null, 2))
} finally { await browser.close(); servidor.closeAllConnections(); servidor.close() }

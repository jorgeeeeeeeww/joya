// Recorrido automático de prueba (solo para desarrollo): entra a cada pantalla, toca sus botones
// no destructivos y anota errores de consola, promesas rechazadas y la pantalla de "algo se atoró".
// Uso en la consola del navegador con la app abierta (npm run dev):
//   const r = await import('/scripts/recorrido.js'); r.correr(['/', '/eventos'])  → luego r.resultado()
// Guarda el avance en sessionStorage, así que si una pantalla recarga la página se sabe qué botón fue.
const KEY = '__recorrido'
const SKIP = /eliminar|borrar|quitar|cerrar sesi|salir|cancelar evento|reiniciar|desvincular|bloquear|restaurar|vaciar|descargar|exportar|imprimir|whatsapp|llamar|enviar|recordar|escribir|compartir|instalar|actualizar|subir|notifica|permiso|foto|c[aá]mara|escanear|vincular|cambiar perfil|tema|oscuro|claro|pantalla completa|recorrido|copiar|pegar|dictar|micr[oó]fono|firmar|liberar|verificar|terminar|marcar como lista|deshacer|reporte del mes/i
// Modo "atrevido": también toca borrar, cancelar, terminar, etc. (abren su confirmación y el recorrido
// la cierra sin aceptar). Solo se evita lo que saca de la app o cambia el dispositivo.
const SKIP_ATREVIDO = /cerrar sesi|salir|reiniciar|desvincular|bloquear|instalar|descargar|exportar|imprimir|whatsapp|llamar|compartir|permiso|c[aá]mara|escanear|vincular|cambiar perfil|pantalla completa|dictar|micr[oó]fono/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const state = () => JSON.parse(sessionStorage.getItem(KEY) || '{"errores":[],"informe":[],"ultimo":""}')
const save = (s) => sessionStorage.setItem(KEY, JSON.stringify(s))
const push = (e) => {
  const s = state()
  if (s.errores.length < 200) s.errores.push({ donde: s.ultimo, ...e })
  save(s)
}

if (!window.__recorridoHook) {
  window.__recorridoHook = true
  const oe = console.error.bind(console)
  console.error = (...a) => {
    const m = a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ')
    if (!/401|vibrate|Failed to load resource|WebSocket/.test(m)) push({ m: m.slice(0, 260) })
    oe(...a)
  }
  window.addEventListener('error', (e) => push({ m: 'ERROR ' + String(e.message).slice(0, 260) }))
  window.addEventListener('unhandledrejection', (e) => push({ m: 'PROMESA ' + String(e.reason?.message || e.reason).slice(0, 260) }))
}

async function go(path) {
  history.pushState({}, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
  await sleep(1500)
}
const label = (b) => (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ')

export async function correr(paths, porPantalla = 18, atrevido = false) {
  const skip = atrevido ? SKIP_ATREVIDO : SKIP
  save({ errores: [], informe: [], ultimo: '', corriendo: true })
  for (const p of paths) {
    let s = state()
    s.ultimo = p
    save(s)
    await go(p)
    const atorada = /Algo se atoró en esta pantalla/.test(document.body.innerText)
    let tocados = 0
    const vistos = new Set()
    for (let vuelta = 0; vuelta < 3 && tocados < porPantalla; vuelta++) {
      const botones = [...document.querySelectorAll('main button, main [role=tab]')].filter((b) => {
        const r = b.getBoundingClientRect()
        const t = label(b)
        return r.width > 0 && r.height > 0 && !b.disabled && t && !skip.test(t) && !vistos.has(t) && !b.closest('form')
      })
      for (const b of botones) {
        if (tocados >= porPantalla) break
        const t = label(b).slice(0, 50)
        vistos.add(t)
        s = state()
        s.ultimo = `${p} → ${t}`
        save(s)
        try {
          b.click()
        } catch (e) {
          push({ m: 'CLIC ' + e.message })
        }
        tocados++
        await sleep(380)
        if (/Algo se atoró en esta pantalla/.test(document.body.innerText)) {
          push({ m: 'PANTALLA DE ERROR' })
          await go(p)
        }
        for (let i = 0; i < 2 && document.querySelector('[role=dialog]'); i++) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await sleep(300)
          document.querySelector('[role=dialog] button[aria-label="Cerrar"]')?.click()
          await sleep(300)
        }
        if (location.pathname !== p.split('?')[0]) await go(p)
      }
    }
    s = state()
    s.informe.push(`${p}: ${tocados} botones${atorada ? ' · PANTALLA DE ERROR AL ENTRAR' : ''}`)
    save(s)
  }
  const s = state()
  s.corriendo = false
  save(s)
  return s
}

export const resultado = () => state()

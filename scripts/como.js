// Ayudante de pruebas (solo desarrollo): entra como una persona y abre una página.
// Uso en la consola: const { como } = await import('/scripts/como.js'); await como('e_ana', '6666', '/hospedaje')
export async function como(id, pin, path) {
  const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /src\/lib\/store\.ts/.test(n)) || '/src/lib/store.ts'
  const { useStore } = await import(url)
  const S = useStore.getState
  if (S().session.userId !== id) {
    S().logout()
    await new Promise((r) => setTimeout(r, 300))
    S().login(id, pin)
  }
  history.pushState({}, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
  await new Promise((r) => setTimeout(r, 1800))
  document.querySelector('main')?.scrollTo(0, 0)
  scrollTo(0, 0)
  return document.querySelector('main')?.scrollHeight
}

/** Para revisar la vista de tablet en un panel angosto: reduce la página a la mitad (solo visual) */
export function mitad(on = true) {
  const el = document.documentElement
  el.style.transformOrigin = '0 0'
  el.style.transform = on ? 'scale(0.488)' : ''
  el.style.height = on ? '205%' : ''
}

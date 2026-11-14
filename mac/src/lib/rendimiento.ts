// Registro local acotado, sin datos de huéspedes ni envíos a servidores.
type Muestra = { nombre: string; ms: number }
const muestras: Muestra[] = []
export function medir(nombre: string) {
  const inicio = performance.now()
  return () => {
    const ms = Math.round((performance.now() - inicio) * 10) / 10
    muestras.push({ nombre, ms })
    if (muestras.length > 180) muestras.shift()
  }
}
export function informeRendimiento() {
  return {
    muestras: [...muestras],
    recursos: performance.getEntriesByType('resource').map(e => {
      const r = e as PerformanceResourceTiming
      // Solo el nombre del archivo: se omiten URL, argumentos y credenciales.
      return { archivo: new URL(r.name).pathname.split('/').pop(), ms: Math.round(r.duration), bytes: r.transferSize }
    }),
    pintura: performance.getEntriesByType('paint').map(e => ({ nombre: e.name, ms: Math.round(e.startTime) })),
    vistas: performance.getEntriesByType('measure').filter(e => e.name.startsWith('joya:vista:')).map(e => ({ nombre: e.name, ms: Math.round(e.duration) })),
  }
}
if (new URLSearchParams(location.search).has('rendimiento')) {
  Object.assign(window, { rendimientoJoya: informeRendimiento })
  for (const tipo of ['longtask', 'event']) {
    if (!PerformanceObserver.supportedEntryTypes?.includes(tipo)) continue
    const observer = new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        muestras.push({ nombre: `${tipo}:${e.name}`, ms: Math.round(e.duration) })
        if (muestras.length > 180) muestras.shift()
      }
    })
    observer.observe({ type: tipo, buffered: true })
  }
}

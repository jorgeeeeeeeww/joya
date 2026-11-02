// Transición de elemento compartido (View Transitions): la tarjeta de un evento "vuela" y se
// convierte en el encabezado del detalle. Si el navegador no la soporta, solo navega.
import type { CSSProperties } from 'react'
import { flushSync } from 'react-dom'

/** Nombre de transición seguro para CSS: vtName('ev', id) → 'ev-abc123' */
export const vtName = (kind: string, id: string) => `${kind}-${id}`.replace(/[^a-zA-Z0-9_-]/g, '-')
/** Estilo para el elemento compartido: <div style={vt('ev', id)}> */
export const vt = (kind: string, id: string): CSSProperties => ({ viewTransitionName: vtName(kind, id) })

function waitFor(selectorFn: () => boolean, timeout = 900) {
  return new Promise<void>((resolve) => {
    const t0 = performance.now()
    const check = () => (selectorFn() || performance.now() - t0 > timeout ? resolve() : requestAnimationFrame(check))
    check()
  })
}

/**
 * Navega con transición. `name` (usa vtName) es el nombre que debe existir en la página nueva
 * (se espera a que aparezca, por si la página se carga en diferido).
 */
export function morphNavigate(navigate: (to: string) => void, to: string, name?: string) {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void> | void) => unknown }
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return navigate(to)
  doc.startViewTransition(async () => {
    flushSync(() => navigate(to))
    if (name) await waitFor(() => [...document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')].some((el) => el.style.viewTransitionName === name))
  })
}

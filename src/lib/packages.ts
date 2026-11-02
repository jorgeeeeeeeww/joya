// Precios de los paquetes: los pone el rancho en Ajustes. Mientras no haya precio, la app no inventa cifras.
import { useStore } from './store'

export function usePackagePrices(): Record<string, number> {
  return useStore((s) => s.settings.packagePrices) ?? {}
}

/** Precio por persona configurado, o undefined si aún no lo ponen */
export const priceOf = (prices: Record<string, number>, id: string | undefined): number | undefined => {
  const p = id ? prices[id] : undefined
  return p && p > 0 ? p : undefined
}

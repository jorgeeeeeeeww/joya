// Atmósfera y tema de step1 (los mismos del PWA). Se guardan en esta Mac.
import { create } from 'zustand'

export type Atmos = 'flor' | 'marea' | 'crepusculo' | 'nocturno'
export type Tema = 'auto' | 'light' | 'dark'

const CLAVE = 'la-joya-mac:apariencia'

function leer(): { atmos: Atmos; tema: Tema } {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) || '{}')
    return { atmos: (['flor', 'marea', 'crepusculo', 'nocturno'] as Atmos[]).includes(p.atmos) ? p.atmos : 'nocturno', tema: p.tema === 'light' || p.tema === 'dark' ? p.tema : 'auto' }
  } catch {
    return { atmos: 'nocturno', tema: 'auto' }
  }
}

function aplicar(atmos: Atmos, tema: Tema) {
  const root = document.documentElement
  root.setAttribute('data-atmos', atmos)
  if (tema === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', tema)
}

export const useApariencia = create<{ atmos: Atmos; tema: Tema; cambiar: (p: Partial<{ atmos: Atmos; tema: Tema }>) => void }>((set, get) => {
  const inicial = leer()
  if (typeof document !== 'undefined') aplicar(inicial.atmos, inicial.tema)
  return {
    ...inicial,
    cambiar: (p) => {
      const sig = { atmos: p.atmos ?? get().atmos, tema: p.tema ?? get().tema }
      aplicar(sig.atmos, sig.tema)
      try {
        localStorage.setItem(CLAVE, JSON.stringify(sig))
      } catch {
        /* sin almacenamiento */
      }
      set(sig)
    },
  }
})

export const ATMOSFERAS: { valor: Atmos; nombre: string; detalle: string }[] = [
  { valor: 'flor', nombre: 'Flor', detalle: 'Rosa polvo y terracota' },
  { valor: 'marea', nombre: 'Marea', detalle: 'Verde agua y arena' },
  { valor: 'crepusculo', nombre: 'Crepúsculo', detalle: 'Azul tinta y brasa' },
  { valor: 'nocturno', nombre: 'Nocturno', detalle: 'Azul noche y luz cálida' },
]

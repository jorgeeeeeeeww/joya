// Tema de la app (claro, oscuro o como la Mac). La paleta es siempre la de La Joya. Se guarda en esta Mac.
import { create } from 'zustand'

export type Tema = 'auto' | 'light' | 'dark'

const CLAVE = 'la-joya-mac:apariencia'

function leer(): Tema {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) || '{}')
    return p.tema === 'light' || p.tema === 'dark' ? p.tema : 'auto'
  } catch {
    return 'auto'
  }
}

function aplicar(tema: Tema) {
  const root = document.documentElement
  root.setAttribute('data-atmos', 'lajoya')
  if (tema === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', tema)
}

export const useApariencia = create<{ tema: Tema; cambiar: (p: { tema: Tema }) => void }>((set) => {
  const tema = leer()
  if (typeof document !== 'undefined') aplicar(tema)
  return {
    tema,
    cambiar: ({ tema }) => {
      aplicar(tema)
      try {
        localStorage.setItem(CLAVE, JSON.stringify({ tema }))
      } catch {
        /* sin almacenamiento */
      }
      set({ tema })
    },
  }
})

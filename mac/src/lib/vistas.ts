import { lazy } from 'react'
import type { Vista } from './store'

const cargas = {
  hoy: () => import('../pages/Hoy'),
  mapa: () => import('../pages/Mapa'),
  calendario: () => import('../pages/Calendario'),
  reservaciones: () => import('../pages/Reservaciones'),
  cabanas: () => import('../pages/Cabanas'),
  apartar: () => import('../pages/Apartar'),
  ajustes: () => import('../pages/Ajustes'),
}
export const pantallas = {
  hoy: lazy(cargas.hoy), mapa: lazy(cargas.mapa), calendario: lazy(cargas.calendario),
  reservaciones: lazy(cargas.reservaciones), cabanas: lazy(cargas.cabanas), apartar: lazy(cargas.apartar), ajustes: lazy(cargas.ajustes),
}
export function anticiparVista(vista: Vista) {
  // Solo por intención (mouse/teclado), sin descargar el mapa al iniciar.
  void cargas[vista]().catch(() => { /* la pantalla maneja el error al abrir */ })
}

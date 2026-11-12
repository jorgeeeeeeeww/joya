// Plano del rancho para la pantalla Hoy. Es una copia recortada de web/src/data/plano.ts (el plano en metros que usa la
// página): sin árboles ni recorrido. Si se mueve o se agrega un edificio allá, se cambia aquí también.

export type Tipo =
  | 'cabana'
  | 'casa'
  | 'habitacion'
  | 'salon'
  | 'jardin'
  | 'glorieta'
  | 'juegos'
  | 'parking'
  | 'pasto'
  | 'entrada'

/** Cómo se ve cada construcción en la maqueta 3D (sacado de las fotos de cada lugar) */
export type Estilo =
  | 'torre' // Sabas: dos pisos de ladrillo, balcón y cúpula
  | 'piedra' // San Miguel: dos pisos de piedra, teja, balcón y puerta de arco
  | 'enredadera' // Elena: un piso de ladrillo cubierto de enredadera, dos aguas con alero de madera
  | 'adobe' // Habitaciones 11 a 16: adobe amarillo, teja roja, enredadera
  | 'cantera' // Habitaciones 1 a 3: piedra volcánica gris, techo plano con pretil y vigas al frente
  | 'salon' // Salón: techo de cuatro aguas y muros de vidrio

export interface Pieza {
  id: string
  tipo: Tipo
  nombre: string
  x: number
  z: number
  /** ancho de oeste a este */
  w: number
  /** fondo de norte a sur */
  d: number
  forma?: 'rect' | 'ellipse'
  estilo?: Estilo
  /** hacia dónde ve la puerta */
  frente?: 'n' | 's' | 'e' | 'o'
  /** las piezas con el mismo grupo son una sola construcción (una hilera de habitaciones) */
  grupo?: string
}

/** Contorno del terreno, en sentido horario */
export const LOTE: [number, number][] = [
  [-34, -82],
  [30, -84],
  [38, 82],
  [-30, 84],
]

/** Habitaciones 11 a 16: una hilera de un piso que ve al andador (de sur a norte: 16 → 11) */
const hilera: Pieza[] = [16, 15, 14, 13, 12, 11].map((n, i) => ({
  id: `habitacion-${n}`,
  tipo: 'habitacion',
  nombre: `Habitación ${n}`,
  x: -7,
  z: 11.6 + i * 3.1,
  w: 6,
  d: 3.1,
  estilo: 'adobe',
  frente: 'e',
  grupo: 'hilera-11-16',
}))

/** Habitaciones 1 a 3: frente al estacionamiento (de oeste a este) */
const estacionamiento: Pieza[] = [1, 2, 3].map((n, i) => ({
  id: `habitacion-${n}`,
  tipo: 'habitacion',
  nombre: `Habitación ${n}`,
  x: -22.6 + i * 4,
  z: 53.3,
  w: 4,
  d: 5,
  estilo: 'cantera',
  frente: 's',
  grupo: 'hilera-1-3',
}))

export const PIEZAS: Pieza[] = [
  { id: 'jardin', tipo: 'jardin', nombre: 'Jardín de eventos', x: -1, z: -44, w: 58, d: 50 },
  { id: 'pasto-sur', tipo: 'pasto', nombre: 'Jardín sur', x: 18, z: 62, w: 28, d: 36 },
  { id: 'pasto-este', tipo: 'pasto', nombre: 'Jardín lateral', x: 20, z: 26, w: 22, d: 30 },
  { id: 'glorieta', tipo: 'glorieta', nombre: 'Glorieta y fuente', x: -2, z: -42, w: 14, d: 14, forma: 'ellipse' },
  { id: 'juegos', tipo: 'juegos', nombre: 'Área de juegos', x: 19, z: 6, w: 13, d: 10, forma: 'ellipse' },
  { id: 'parking', tipo: 'parking', nombre: 'Estacionamiento', x: -14, z: 69.5, w: 24, d: 17 },
  { id: 'entrada', tipo: 'entrada', nombre: 'Entrada', x: -29, z: 69, w: 4, d: 8 },
  { id: 'salon', tipo: 'salon', nombre: 'Salón de eventos', x: -9, z: -3.5, w: 32, d: 22, estilo: 'salon' },
  { id: 'sabas', tipo: 'cabana', nombre: 'Sabas', x: -3.5, z: -74.8, w: 7, d: 7, estilo: 'torre', frente: 's' },
  { id: 'cabana-san-miguel', tipo: 'cabana', nombre: 'Cabaña San Miguel', x: -9.6, z: 34.9, w: 8, d: 7, estilo: 'piedra', frente: 'e' },
  { id: 'cabana-elena', tipo: 'cabana', nombre: 'Cabaña Elena', x: -9.4, z: 44.3, w: 8, d: 7, estilo: 'enredadera', frente: 'e' },
  ...hilera,
  ...estacionamiento,
]

/** Los lugares donde uno se queda */
export const HOSPEDAJES = PIEZAS.filter((p) => p.tipo === 'cabana' || p.tipo === 'casa' || p.tipo === 'habitacion')

/**
 * Qué edificio es cada hospedaje: slug de la nube → id de la pieza. Casi nunca hace falta: cada hospedaje
 * encuentra su edificio por nombre (ver `buscarPieza`). Aquí solo va lo que se llame distinto en la nube.
 */
export const UBICACION: Record<string, string> = {}

const limpio = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const GENERICAS = new Set(['cabana', 'cabanas', 'casa', 'habitacion', 'hab', 'cuarto', 'la', 'el', 'de', 'del', 'suite', 'no'])
const clave = (t: string) =>
  limpio(t)
    .split(' ')
    .filter((p) => p && !GENERICAS.has(p))
    .join(' ')

/**
 * El edificio de un hospedaje de la nube: primero lo capturado en UBICACION, luego el mismo nombre
 * («Cabaña Elena», «Habitación 11»), luego lo que distingue al nombre («Elena», «11», «Sabas»).
 */
export function buscarPieza(slug: string | null | undefined, nombre: string, libres: Pieza[] = HOSPEDAJES): Pieza | null {
  const fijo = slug ? UBICACION[slug] : undefined
  if (fijo) return libres.find((p) => p.id === fijo) ?? null
  const n = limpio(nombre)
  const igual = libres.find((p) => limpio(p.nombre) === n)
  if (igual) return igual
  const k = clave(nombre)
  if (!k) return null
  return libres.find((p) => clave(p.nombre) === k) ?? null
}

/** Andadores (polilíneas con ancho en metros) */
export const CAMINOS: { puntos: [number, number][]; ancho: number }[] = [
  // De la glorieta a Sabas: un caminito de piedra que serpentea entre los pinos
  { puntos: [[-2, -49], [-3.5, -55], [0.5, -61], [-2.5, -66.5], [-3.5, -70]], ancho: 2.4 },
  { puntos: [[-2, -35], [-2, -14]], ancho: 4 },
  { puntos: [[-1, 7], [-1, 58]], ancho: 3.5 },
  // Banqueta frente a las habitaciones 1 a 3 y paso al estacionamiento
  { puntos: [[-1, 58], [-25, 58]], ancho: 2.6 },
  { puntos: [[-27, 69], [-26, 69]], ancho: 6 },
  { puntos: [[6, -3], [13, 6]], ancho: 3 },
]

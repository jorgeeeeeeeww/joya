// Plano del rancho para la app. Es una copia de web/src/data/plano.ts (el plano en metros que usa la página y su
// maqueta 3D). Si se mueve o se agrega un edificio allá, se cambia aquí también.

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

export type Arbol = { x: number; z: number; tipo: 'cipres' | 'palma' | 'copa' | 'pino' | 'cola'; s: number }

function orilla(lado: 'izq' | 'der', z: number) {
  const t = (z + 84) / 168
  return lado === 'der' ? 30 + t * 8 : -34 + t * 4
}

/** «Azar» repetible: el mismo árbol sale igual en cada visita */
const azar = (x: number, z: number) => Math.abs((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1)

function arboles(): Arbol[] {
  const a: Arbol[] = []
  // Cerca este (la del agave): una hilera de matas de cola de zorro (Jorge, 10 nov: «son colas de zorro»)
  for (let z = -77; z <= 79; z += 4.4) a.push({ x: orilla('der', z) - 2.4 + (azar(z, 3) - 0.5) * 0.8, z, tipo: 'cola', s: 0.85 + azar(z, 1) * 0.3 })
  // Matas de cola de zorro frente a San Miguel y Elena (como en sus fotos), sin tapar las puertas
  for (const [x, z] of [[-4.5, 32.2], [-4.2, 33.5], [-4.3, 36.6], [-4.6, 37.8], [-4.3, 41.4], [-4.1, 42.6], [-4.2, 45.6], [-4.5, 47]] as const) a.push({ x, z, tipo: 'cola', s: 0.6 })
  // Cerca oeste, al norte: cipreses
  for (let z = -64; z <= -20; z += 4.5) a.push({ x: orilla('izq', z) + 2.4, z, tipo: 'cipres', s: 0.85 })
  // Pinos alrededor de Sabas (el frente, al sur, queda libre para el caminito)
  for (const [x, z, s] of [
    [-12, -79, 1.05], [-11.5, -71, 0.95], [-13, -66, 0.85], [4.5, -80, 1], [5.5, -72, 0.95], [7, -66, 0.85],
    [-7.5, -81.5, 0.9], [1, -82, 0.85], [-9, -63, 0.8], [3.5, -60, 0.8], [11, -75, 0.9], [-28, -79, 0.9], [-29, -71, 0.85],
  ] as const)
    a.push({ x, z, tipo: 'pino', s })
  // Palmeras a lo largo de la cerca norte, al este de Sabas
  for (const x of [13, 18.5, 24]) a.push({ x, z: -79.5, tipo: 'palma', s: 1.05 })
  // Andador central: palmeras del jardín al salón
  for (let z = -32; z <= -18; z += 7) a.push({ x: -6.5, z, tipo: 'palma', s: 1 }, { x: 2.5, z, tipo: 'palma', s: 1 })
  // Glorieta: anillo de palmeras
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.3
    a.push({ x: -2 + Math.cos(ang) * 10.5, z: -42 + Math.sin(ang) * 10.5, tipo: 'palma', s: 0.85 })
  }
  // Árboles grandes sueltos en el pasto
  for (const [x, z] of [[-19, -58], [-22, -32], [17, -60], [20, -30], [12, -50], [-16, -46]] as const) a.push({ x, z, tipo: 'copa', s: 1.1 })
  // Jardín sur y lateral
  for (const [x, z] of [[12, 52], [18, 60], [26, 50], [12, 72], [22, 75], [29, 63], [20, 20], [27, 32], [14, 16]] as const) a.push({ x, z, tipo: 'copa', s: 0.9 })
  // Frente al salón y junto a las cabañas
  a.push({ x: 9, z: -12, tipo: 'palma', s: 1 }, { x: 9, z: 12, tipo: 'palma', s: 0.9 }, { x: 3.5, z: 30, tipo: 'palma', s: 0.8 }, { x: 3.5, z: 44, tipo: 'palma', s: 0.8 })
  return a
}

export const ARBOLES = arboles()

/** Paradas del recorrido (de la entrada al jardín) */
export interface Parada {
  id: string
  titulo: string
  texto: string
  x: number
  z: number
  /** ancho visible en metros */
  w: number
  /** piezas que se iluminan */
  luz: string[]
}

export const PARADAS: Parada[] = [
  { id: 'llegada', titulo: 'Llegas por la calle Crisantemo', texto: 'La entrada da al estacionamiento: tu coche se queda adentro, frente a las habitaciones 1, 2 y 3.', x: -18, z: 62, w: 62, luz: ['entrada', 'parking', 'habitacion-1', 'habitacion-2', 'habitacion-3'] },
  { id: 'habitaciones', titulo: 'Las habitaciones', texto: 'Del 11 al 16, en hilera frente al andador, entre enredaderas.', x: -8, z: 20, w: 52, luz: hilera.map((p) => p.id) },
  { id: 'cabanas', titulo: 'Las cabañas', texto: 'San Miguel y Elena, junto al andador.', x: -9, z: 40, w: 48, luz: ['cabana-san-miguel', 'cabana-elena'] },
  { id: 'salon', titulo: 'El salón', texto: 'En el centro de los jardines, entre palmeras. Aquí se hacen las fiestas.', x: -6, z: -2, w: 60, luz: ['salon'] },
  { id: 'jardin', titulo: 'El jardín y la fuente', texto: 'Palmeras alrededor de la glorieta y una fuente de cantera al centro.', x: -2, z: -45, w: 70, luz: ['jardin', 'glorieta'] },
  { id: 'sabas', titulo: 'Sabas', texto: 'Al fondo, entre pinos: dos pisos de ladrillo con su cúpula.', x: -4, z: -72, w: 50, luz: ['sabas'] },
]

/** Ruta que dibuja el hilo del recorrido */
export const RUTA: [number, number][] = [
  [-29, 69], [-20, 64], [-8, 60], [-1, 58], [-1, 44], [-1, 30], [-1, 18], [-1, 8], [-2, -14], [-2, -30], [-2, -35],
]

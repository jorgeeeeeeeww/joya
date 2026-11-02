// Plano del rancho en METROS, trazado a partir de la vista satelital de Jardines La Joya.
// Origen al centro del lote. Eje X = oeste→este, eje Z = norte→sur (arriba de la foto = norte).
// Lo usan el mapa 3D, el plano 2D y el mini-mapa del inicio.

export type FeatureKind =
  | 'cabana'
  | 'casa'
  | 'salon'
  | 'bodega'
  | 'jardin'
  | 'glorieta'
  | 'juegos'
  | 'parking'
  | 'pasto'
  | 'entrada'

export interface MapFeature {
  id: string
  kind: FeatureKind
  name: string
  x: number // centro
  z: number
  w: number // tamaño en X
  d: number // tamaño en Z
  rot?: number // grados
  height?: number
  roof?: 'gable' | 'hip' | 'flat'
  roofColor?: string
  wallColor?: string
  unitId?: string // vínculo con la colección `units`
  venue?: 'salon' | 'jardin' // vínculo con eventos
  shape?: 'rect' | 'ellipse'
}

/** Contorno del terreno (marcado en rojo en la foto), en sentido horario */
export const LOT_POLYGON: [number, number][] = [
  [-34, -82],
  [30, -84],
  [38, 82],
  [-30, 84],
]

export const LOT_BOUNDS = { minX: -40, maxX: 42, minZ: -90, maxZ: 90 }

export const FEATURES: MapFeature[] = [
  // Zonas verdes y áreas (se dibujan primero)
  { id: 'jardin', kind: 'jardin', name: 'Jardín de eventos', x: -1, z: -44, w: 58, d: 50, venue: 'jardin' },
  { id: 'pasto-sur', kind: 'pasto', name: 'Jardín sur', x: 18, z: 62, w: 28, d: 36 },
  { id: 'pasto-este', kind: 'pasto', name: 'Jardín lateral', x: 22, z: 26, w: 18, d: 22 },
  { id: 'glorieta', kind: 'glorieta', name: 'Glorieta y fuente', x: -2, z: -42, w: 14, d: 14, shape: 'ellipse' },
  { id: 'juegos', kind: 'juegos', name: 'Área de juegos', x: 19, z: 6, w: 13, d: 10, shape: 'ellipse' },
  { id: 'parking', kind: 'parking', name: 'Estacionamiento', x: -14, z: 66, w: 24, d: 22 },
  { id: 'entrada', kind: 'entrada', name: 'Entrada principal', x: -29, z: 66, w: 4, d: 8 },

  // Edificios
  { id: 'bodega', kind: 'bodega', name: 'Bodega', x: -24, z: -74, w: 8, d: 6, height: 3, roof: 'gable', roofColor: '#E8A79A', wallColor: '#F6EEE6' },
  {
    id: 'salon',
    kind: 'salon',
    name: 'Salón de eventos',
    x: -9,
    z: -3.5,
    w: 32,
    d: 22,
    height: 6,
    roof: 'hip',
    roofColor: '#E9C7A6',
    wallColor: '#FBF5EC',
    venue: 'salon',
  },
  { id: 'cabana-1', kind: 'cabana', name: 'Cabaña Jacaranda', x: -4, z: -74, w: 9, d: 8, height: 3.4, roof: 'gable', roofColor: '#C9B6EE', wallColor: '#FFF9F0', unitId: 'u_c1' },
  { id: 'cabana-2', kind: 'cabana', name: 'Cabaña Agave', x: 8, z: 30, w: 8, d: 7, height: 3.2, roof: 'gable', roofColor: '#A9D9BE', wallColor: '#FFF9F0', unitId: 'u_c2' },
  { id: 'cabana-3', kind: 'cabana', name: 'Cabaña Nogal', x: 8, z: 41, w: 8, d: 7, height: 3.2, roof: 'gable', roofColor: '#F3C9A9', wallColor: '#FFF9F0', unitId: 'u_c3' },
  { id: 'casa-1', kind: 'casa', name: 'Casa Girasol', x: -14, z: 14, w: 14, d: 8.5, height: 3.6, roof: 'gable', roofColor: '#F2D58A', wallColor: '#FFFBF3', unitId: 'u_h1' },
  { id: 'casa-2', kind: 'casa', name: 'Casa Lavanda', x: -14, z: 24, w: 14, d: 8.5, height: 3.6, roof: 'gable', roofColor: '#C9B6EE', wallColor: '#FFFBF3', unitId: 'u_h2' },
  { id: 'casa-3', kind: 'casa', name: 'Casa Magnolia', x: -14, z: 34, w: 14, d: 8.5, height: 3.6, roof: 'gable', roofColor: '#F5B9C9', wallColor: '#FFFBF3', unitId: 'u_h3' },
  { id: 'casa-4', kind: 'casa', name: 'Casa Bugambilia', x: -14, z: 44, w: 14, d: 8.5, height: 3.6, roof: 'gable', roofColor: '#E8A3C0', wallColor: '#FFFBF3', unitId: 'u_h4' },
]

/** Caminos (polilíneas con ancho en metros) */
export const PATHS: { points: [number, number][]; width: number }[] = [
  { points: [[-2, -80], [-2, -49]], width: 4 }, // de la cabaña 1 a la glorieta
  { points: [[-2, -35], [-2, -14]], width: 4 }, // de la glorieta al salón
  { points: [[-1, 7], [-1, 56]], width: 3.5 }, // andador entre casas y cabañas
  { points: [[-1, 56], [-14, 56]], width: 3.5 },
  { points: [[-27, 66], [-26, 66]], width: 6 }, // acceso
  { points: [[6, -3], [13, 6]], width: 3 }, // salón → área de juegos
]

export type TreeKind = 'cypress' | 'palm' | 'round'
export interface Tree {
  x: number
  z: number
  kind: TreeKind
  s: number // escala
}

function lotEdgeX(side: 'left' | 'right', z: number) {
  const t = (z + 84) / 168
  return side === 'right' ? 30 + t * 8 : -34 + t * 4
}

function buildTrees(): Tree[] {
  const trees: Tree[] = []
  // Hilera de cipreses en el lindero este (lado derecho de la foto)
  for (let z = -80; z <= 80; z += 4.2) trees.push({ x: lotEdgeX('right', z) - 2.2, z, kind: 'cypress', s: 0.9 + ((z * 7) % 3) * 0.06 })
  // Cipreses en el lindero oeste del jardín superior
  for (let z = -78; z <= -20; z += 4.5) trees.push({ x: lotEdgeX('left', z) + 2.4, z, kind: 'cypress', s: 0.85 })
  // Palmeras a lo largo del camino central
  for (let z = -66; z <= -52; z += 7) {
    trees.push({ x: -6.5, z, kind: 'palm', s: 1 })
    trees.push({ x: 2.5, z, kind: 'palm', s: 1 })
  }
  for (let z = -32; z <= -18; z += 7) {
    trees.push({ x: -6.5, z, kind: 'palm', s: 1 })
    trees.push({ x: 2.5, z, kind: 'palm', s: 1 })
  }
  // Palmeras alrededor de la glorieta
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    trees.push({ x: -2 + Math.cos(a) * 10.5, z: -42 + Math.sin(a) * 10.5, kind: 'palm', s: 0.85 })
  }
  // Árboles frondosos en el jardín superior
  const upper: [number, number][] = [[-20, -60], [-22, -32], [18, -62], [20, -30], [12, -48], [-16, -48]]
  for (const [x, z] of upper) trees.push({ x, z, kind: 'round', s: 1.1 })
  // Jardín sur y lateral
  const south: [number, number][] = [[10, 52], [16, 58], [24, 50], [12, 70], [22, 74], [28, 62], [20, 20], [26, 32], [14, 16]]
  for (const [x, z] of south) trees.push({ x, z, kind: 'round', s: 0.9 })
  // Palmeras junto al salón
  trees.push({ x: 9, z: -12, kind: 'palm', s: 1 }, { x: 9, z: 12, kind: 'palm', s: 0.9 })
  return trees
}

export const TREES: Tree[] = buildTrees()

export const featureById = (id: string) => FEATURES.find((f) => f.id === id)
export const featureByUnit = (unitId: string) => FEATURES.find((f) => f.unitId === unitId)

/** Dimensiones interiores de los recintos para el plano de mesas (metros) */
export const VENUE_SPACES = {
  salon: { w: 32, h: 22, label: 'Salón de eventos' },
  jardin: { w: 54, h: 44, label: 'Jardín de eventos', obstacle: { x: 26, y: 22, r: 7, label: 'Glorieta' } },
} as const

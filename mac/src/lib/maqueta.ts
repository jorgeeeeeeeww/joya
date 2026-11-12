// @ts-nocheck — código portado de la página (web/src/scripts/maqueta.ts), donde ya está probado; aquí se le agregaron los
// estados de ocupación, el acento y el modo día/noche de la app.
// Maqueta 3D del rancho (three.js): terreno, andadores, árboles, pila y edificios en sus posiciones reales
// (src/data/plano.ts, en metros). Es una maqueta de arquitecto sobre un zócalo de cantera: el pasto verde, los
// andadores de piedra y cada construcción con su forma y sus materiales de verdad, sacados de las fotos
// (ladrillo y cúpula en Sabas, piedra y teja en San Miguel, enredadera en Elena, adobe amarillo en las
// habitaciones 11 a 16, piedra volcánica en la 1 a 3, vidrio y cuatro aguas en el salón), un poco apagados
// para que convivan con la página. Lo que se elige se aviva y su techo toma el ladrillo fuerte; lo que queda
// fuera del filtro se atenúa hasta casi piedra. Luz cálida de tarde, con sombras suaves y verdosas.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { gsap } from 'gsap'
import { ARBOLES, CAMINOS, LOTE, PIEZAS, type Pieza } from './plano'

// Paleta
const TONO = {
  // Terreno
  plinto: 0xc9d4ce, // zócalo: cantera más honda
  lote: 0xa7c3b6, // el pasto de todo el terreno
  pasto: 0x8db3a3, // jardín grande: un verde más hondo
  pastoClaro: 0x9abcad,
  camino: 0xe2e8e4, // andadores de piedra
  grava: 0xd3dad6, // estacionamiento
  raya: 0xf6f8f6,
  banqueta: 0xe4e9e6,
  piedra: 0xeff3f0, // la pila
  agua: 0x93c2b6,
  // Árboles
  cipres: [0x24493f, 0x32594d],
  pino: [0x2a4f44, 0x3c6558],
  copa: [0x467a66, 0x67998a],
  palma: [0x558a72, 0x78a78f],
  cola: [0x66907f, 0x8aa99b], // matas de cola de zorro: hojas finas verde salvia
  colaPluma: [0xd2dcd7, 0xb9c9c1], // y sus espigas rosadas
  tronco: 0x7c7a6e,
  // Materiales de las construcciones (de las fotos, apagados)
  ladrillo: 0xb06f52,
  ladrilloOscuro: 0x8f5641, // pilastras de Sabas
  barro: 0xb47c57, // macetas
  urna: 0xc9c2b4, // macetones de cantera de San Miguel
  cupula: 0xdca253,
  piedraClara: 0xcdbfa4,
  teja: 0xa95c40,
  hiedra: 0x557a42,
  hiedraClara: 0x6b8f4f,
  adobe: 0xdcc58a,
  alero: 0xf1ece0,
  volcanica: 0x5e6064,
  pretil: 0x9c9c98,
  madera: 0x8a5b3b,
  maderaOscura: 0x4a2c20,
  vidrio: 0x3a4d48,
  marco: 0xe9e2d4,
  techoSalon: 0xa8664a,
  reja: 0x2e2a26,
  // Estados
  techoLuz: 0x2f6256, // el color de la app (se ajusta con ponerAcento): lo ocupado
  luz: 0xf2f8f5, // hacia donde se aviva lo elegido
  apagado: 0xdde4e0, // hacia donde se atenúa lo que queda fuera
  vano: 0x1c2f2a, // puertas y ventanas: bosque
  sombra: 0x14231f, // sombra sobre la página: bosque
}

export interface Maqueta {
  /** Marca los edificios que son hospedajes */
  ponerUnidades: (ids: string[]) => void
  /** Lugares que no son hospedaje pero llevan rótulo: [pieza, altura sobre el piso en metros] */
  ponerMarcas: (items: [string, number][]) => void
  /** Solo estos edificios quedan iluminados y tocables (null = todos los hospedajes) */
  filtrar: (ids: string[] | null) => void
  resaltar: (id: string | null) => void
  volarA: (id: string, duracion: number) => void
  /** Acerca la cámara a un grupo de edificios (sigue pudiéndose girar y tocar) */
  acercar: (ids: string[], duracion: number) => void
  /** ¿La cámara está acercada a un grupo? */
  acercada: () => boolean
  volver: (duracion: number) => void
  entrar: () => void
  pausar: (si: boolean) => void
  /** Estado de cada hospedaje esa noche (por id de pieza del plano) */
  ponerEstados: (m: Map<string, 'ocupada' | 'apartada' | 'cerrada' | 'libre'>) => void
  /** El color de la app (techos de lo ocupado y aros de las solicitudes), como número 0xRRGGBB */
  ponerAcento: (hex: number) => void
  /** Luz de día o de noche: de noche, menos intensa y más fría, para no encandilar */
  ponerModo: (noche: boolean) => void
  destruir: () => void
}

interface Opciones {
  /** Se llama en cada cuadro con la posición en pantalla de cada edificio */
  alMover: (pos: Map<string, { x: number; y: number; ok: boolean }>) => void
  alPasar: (id: string | null) => void
  alElegir: (id: string) => void
  reduce: boolean
  /** Corre la escena a la derecha (px) si algo tapa su orilla izquierda (el diseño anterior); por omisión, nada */
  corrimiento?: () => number
  /** Mapa quieto: no se gira al arrastrar (la cámara solo se mueve si se le pide) */
  fija?: boolean
}

type Estado = 'reposo' | 'luz' | 'apagado'
/** Un material que cambia con el estado del edificio: sus tres colores ya calculados */
interface Tinte {
  m: THREE.MeshStandardMaterial
  rol: Rol
  base: THREE.Color
  c: Record<Estado, THREE.Color>
}
interface Edificio {
  g: THREE.Group
  tintes: Tinte[]
  pieza: Pieza
  alto: number
  caja: THREE.Mesh
  estado: Estado
}

/** Con el viento: mueve la copa según su altura, sin deformar el árbol */
function conViento(mat: THREE.Material, uT: { value: number }, fuerza: number) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uT = uT
    s.vertexShader = `uniform float uT;\n${s.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float fase = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
        float alto = max(position.y + 2.0, 0.0);
        transformed.x += sin(uT * 0.9 + fase) * ${fuerza.toFixed(4)} * alto * alto;
        transformed.z += cos(uT * 0.7 + fase) * ${(fuerza * 0.6).toFixed(4)} * alto * alto;
      #endif`,
    )
  }
  return mat
}

/** Copa de palma: hojas largas que salen del centro y caen un poco */
function copaPalma() {
  const hojas: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  const n = 9
  for (let i = 0; i < n; i++) {
    const h = new THREE.IcosahedronGeometry(1, 1)
    h.scale(1, 0.07, 0.24)
    h.translate(1, 0, 0)
    h.applyMatrix4(m.makeRotationZ(-0.34 - (i % 2) * 0.24))
    h.applyMatrix4(m.makeRotationY((i / n) * Math.PI * 2))
    hojas.push(h)
  }
  return mergeGeometries(hojas)!
}

/** Mata de cola de zorro: hojas finas que se abren como fuente (geometría 1) y espigas que cabecean (geometría 2) */
function mataCola(): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const hojas: THREE.BufferGeometry[] = []
  const espigas: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  const n = 18
  for (let i = 0; i < n; i++) {
    const largo = 2.1 + rnd(i, 3) * 1.1
    const h = new THREE.ConeGeometry(0.1, largo, 3).translate(0, largo / 2, 0)
    h.applyMatrix4(m.makeRotationZ(0.3 + rnd(i, 2) * 0.75))
    h.applyMatrix4(m.makeRotationY((i / n) * Math.PI * 2 + rnd(i, 1) * 0.5))
    hojas.push(h)
  }
  const ne = 6
  for (let i = 0; i < ne; i++) {
    const giro = new THREE.Matrix4().makeRotationZ(0.18 + rnd(i, 7) * 0.4).premultiply(new THREE.Matrix4().makeRotationY((i / ne) * Math.PI * 2 + 0.4))
    const alto = 2.6 + rnd(i, 8) * 0.8
    hojas.push(new THREE.CylinderGeometry(0.025, 0.04, alto, 3).translate(0, alto / 2, 0).applyMatrix4(giro))
    // la espiga: un huso que cabecea hacia afuera desde la punta del tallo
    const e = new THREE.SphereGeometry(1, 7, 5).scale(0.2, 0.72, 0.2).translate(0, 0.66, 0)
    e.applyMatrix4(m.makeRotationZ(0.75)).translate(0, alto, 0).applyMatrix4(giro)
    espigas.push(e)
  }
  return [mergeGeometries(hojas)!, mergeGeometries(espigas)!]
}

// ── Construcciones ──
// Cada una se arma en coordenadas propias, con la puerta hacia +z, y luego se gira hacia su `frente`.
const CUBO = new THREE.BoxGeometry(1, 1, 1)
const ESFERA = new THREE.SphereGeometry(1, 16, 10)
const CILINDRO = new THREE.CylinderGeometry(1, 1, 1, 24)
const CUPULA = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)

/** Techo de cuatro aguas sobre un rectángulo de 2a × 2b, con la cumbrera a lo largo del lado mayor */
function cuatroAguas(a: number, b: number, h: number) {
  const largo = a >= b
  const [A, B] = largo ? [a, b] : [b, a]
  const r = A - B
  const p0 = [-A, 0, B]
  const p1 = [A, 0, B]
  const p2 = [A, 0, -B]
  const p3 = [-A, 0, -B]
  const r1 = [-r, h, 0]
  const r2 = [r, h, 0]
  const caras = [p0, p1, r2, p0, r2, r1, p2, p3, r1, p2, r1, r2, p1, p2, r2, p3, p0, r1]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(caras.flat(), 3))
  if (!largo) g.rotateY(Math.PI / 2)
  g.computeVertexNormals()
  return g
}

/** Techo de dos aguas con la cumbrera paralela a la fachada (a lo largo de x) */
function dosAguas(W: number, D: number, cumbre: number) {
  const f = new THREE.Shape()
  f.moveTo(-D / 2, 0)
  f.lineTo(0, cumbre)
  f.lineTo(D / 2, 0)
  f.closePath()
  const g = new THREE.ExtrudeGeometry(f, { depth: W, bevelEnabled: false })
  g.translate(0, 0, -W / 2)
  g.rotateY(-Math.PI / 2)
  return g
}

/** «Azar» repetible: depende de dónde está la cosa, no de Math.random */
const rnd = (a: number, b: number) => Math.abs((Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1)

type Rol = 'muro' | 'techo' | 'fijo'
/** El tono de piedra clara hacia el que se acercan los edificios, para que solo el acento de la app llame la atención */
const NEUTRO = new THREE.Color(0xdfe5e1)
/** Cómo se ve un material cuando el hospedaje está ocupado: el techo toma el acento y los muros se tiñen un poco */
const luzDe = (base: THREE.Color, rol: Rol) => (rol === 'techo' ? new THREE.Color(TONO.techoLuz) : rol === 'fijo' ? base.clone() : base.clone().lerp(new THREE.Color(TONO.techoLuz), 0.3))
/** Herramientas para armar una construcción: sus materiales se registran para iluminarla o atenuarla */
function obra(tintes: Tinte[]) {
  const g = new THREE.Group()
  const hechos = new Map<string, THREE.MeshStandardMaterial>()
  const luz = new THREE.Color(TONO.luz)
  const apagado = new THREE.Color(TONO.apagado)
  const mat = (color: number, rol: Rol = 'muro', extra: THREE.MeshStandardMaterialParameters = {}) => {
    const k = `${color}|${rol}|${JSON.stringify(extra)}`
    const ya = hechos.get(k)
    if (ya) return ya
    const base = new THREE.Color(color).lerp(NEUTRO, rol === 'fijo' ? 0.3 : 0.62)
    const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.92, metalness: 0, ...extra })
    hechos.set(k, m)
    tintes.push({
      m,
      rol,
      base,
      c: { reposo: base.clone(), luz: luzDe(base, rol), apagado: base.clone().lerp(apagado, rol === 'fijo' ? 0.55 : 0.74) },
    })
    return m
  }
  const pieza = (geo: THREE.BufferGeometry, m: THREE.Material, s: [number, number, number], p: [number, number, number], sombra = true) => {
    const k = new THREE.Mesh(geo, m)
    k.scale.set(...s)
    k.position.set(...p)
    k.castShadow = sombra
    k.receiveShadow = true
    g.add(k)
    return k
  }
  const caja = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => pieza(CUBO, m, [sx, sy, sz], [x, y, z])
  /** Manchas de enredadera que cuelgan desde arriba sobre una cara (frente, o lado derecho/izquierdo) */
  const hiedra = (W: number, D: number, H: number, cara: 'frente' | 'der' | 'izq', n: number, cubre: number, semilla: number) => {
    const ancho = cara === 'frente' ? W : D
    for (let i = 0; i < n; i++) {
      const w = Math.min(ancho * 0.9, 0.8 + rnd(semilla, i) * 1.6)
      const h = H * cubre * (0.45 + rnd(i, semilla) * 0.55)
      const u = -ancho / 2 + w / 2 + rnd(semilla + i, 3.1) * (ancho - w)
      const m = mat(i % 2 ? TONO.hiedra : TONO.hiedraClara)
      if (cara === 'frente') caja(m, w, h, 0.24, u, H - h / 2, D / 2 + 0.1)
      else caja(m, 0.24, h, w, cara === 'der' ? W / 2 + 0.1 : -W / 2 - 0.1, H - h / 2, u)
    }
  }
  return { g, mat, pieza, caja, hiedra }
}

/** Arma la construcción de una pieza del plano. Devuelve el grupo ya en su lugar y su altura total. */
function construir(p: Pieza, tintes: Tinte[]): { g: THREE.Group; alto: number } {
  const o = obra(tintes)
  const { mat, caja, pieza, hiedra } = o
  const f = p.frente ?? 's'
  const lado = f === 'e' || f === 'o'
  const W = lado ? p.d : p.w // a lo largo de la fachada
  const D = lado ? p.w : p.d // fondo
  const vano = mat(TONO.vano, 'fijo')
  const madera = mat(TONO.maderaOscura, 'fijo')
  const reja = mat(TONO.reja, 'fijo')
  const frente = D / 2 + 0.04
  let alto = 3

  switch (p.estilo) {
    case 'torre': {
      // Sabas (foto): dos pisos de ladrillo con pilastras más oscuras, balcón a la derecha con toldo de lámina,
      // puerta de vidrio abajo, ventana alta, macetas y banca; la cúpula asoma detrás
      const H = 6.2
      const ladrillo = mat(TONO.ladrillo)
      const pilastra = mat(TONO.ladrilloOscuro)
      const vidrio = mat(TONO.vano, 'fijo')
      caja(ladrillo, W, H, D, 0, H / 2, 0)
      for (const x of [-W / 2 + 0.2, -W * 0.2, W / 2 - 0.2]) caja(pilastra, 0.42, H, 0.16, x, H / 2, frente + 0.04)
      caja(mat(TONO.pretil), W + 0.1, 0.22, D + 0.1, 0, 3.1, 0)
      caja(mat(TONO.pretil), W + 0.3, 0.35, D + 0.3, 0, H + 0.17, 0)
      pieza(CILINDRO, ladrillo, [2.55, 0.55, 2.55], [0, H + 0.6, -0.5])
      pieza(CUPULA, mat(TONO.cupula, 'techo'), [2.5, 1.7, 2.5], [0, H + 0.86, -0.5])
      pieza(CILINDRO, mat(TONO.cupula, 'techo'), [0.32, 0.6, 0.32], [0, H + 2.85, -0.5])
      // Planta baja: puerta de vidrio con marco de madera y ventana alta
      caja(madera, 1.15, 2.45, 0.1, -W * 0.06, 1.22, frente)
      caja(vidrio, 0.82, 2.1, 0.12, -W * 0.06, 1.12, frente)
      caja(madera, 1, 1.7, 0.1, W * 0.24, 1.75, frente)
      caja(vidrio, 0.72, 1.4, 0.12, W * 0.24, 1.75, frente)
      // Balcón a la derecha: piso, barandal de barrotes, puerta y toldo inclinado
      const bx = W * 0.2
      const bw = W * 0.58
      caja(mat(TONO.banqueta), bw, 0.2, 1.2, bx, 3.25, D / 2 + 0.6)
      caja(reja, bw, 0.07, 0.07, bx, 4.18, D / 2 + 1.18)
      for (let i = 0; i <= 9; i++) caja(reja, 0.04, 0.85, 0.04, bx - bw / 2 + (i * bw) / 9, 3.76, D / 2 + 1.18)
      for (const s of [-1, 1]) caja(reja, 0.05, 0.9, 1.2, bx + (s * bw) / 2, 3.8, D / 2 + 0.6)
      caja(madera, 1.05, 2.1, 0.1, W * 0.22, 4.4, frente)
      caja(vidrio, 0.78, 1.8, 0.12, W * 0.22, 4.38, frente)
      const toldo = caja(reja, bw + 0.5, 0.06, 1.8, bx, 5.62, D / 2 + 0.8)
      toldo.rotation.x = 0.2
      // Macetas de barro y banca de piedra al frente
      pieza(CILINDRO, mat(TONO.barro), [0.36, 0.62, 0.36], [-W * 0.3, 0.31, D / 2 + 0.6])
      pieza(CILINDRO, mat(TONO.barro), [0.32, 0.55, 0.32], [W * 0.1, 0.28, D / 2 + 0.6])
      caja(mat(TONO.banqueta), 1.3, 0.38, 0.42, W * 0.36, 0.2, D / 2 + 0.5)
      for (const s of [-1, 1]) for (const y of [1.6, 4.5]) caja(vano, 0.1, 1.3, 1, s * (W / 2 + 0.04), y, 0)
      alto = H + 3.2
      break
    }
    case 'piedra': {
      // Cabaña San Miguel (foto): dos pisos de piedra, teja a cuatro aguas con vigas bajo el alero, enredadera que cuelga
      // en tiras sobre la mitad izquierda, puerta de arco de herrería, balcón arriba, ventana con reja y dos macetones
      const H = 5.8
      caja(mat(TONO.piedraClara), W, H, D, 0, H / 2, 0)
      pieza(cuatroAguas(W / 2 + 0.7, D / 2 + 0.7, 2.2), mat(TONO.teja, 'techo'), [1, 1, 1], [0, H, 0])
      for (let i = 0; i < 7; i++) caja(madera, 0.14, 0.16, 0.8, -W / 2 + 0.3 + (i * (W - 0.6)) / 6, H - 0.1, D / 2 + 0.4)
      // Puerta de arco con reja
      caja(madera, 1.3, 2.1, 0.1, 0, 1.05, frente)
      pieza(CILINDRO, madera, [0.65, 0.1, 0.65], [0, 2.1, frente]).rotation.x = Math.PI / 2
      for (let i = 0; i < 4; i++) caja(reja, 0.05, 2.5, 0.05, -0.45 + i * 0.3, 1.25, frente + 0.07)
      // Balcón arriba a la derecha
      caja(mat(TONO.banqueta), 2, 0.15, 0.9, W * 0.12, 3.2, D / 2 + 0.45)
      caja(reja, 2, 0.85, 0.06, W * 0.12, 3.7, D / 2 + 0.88)
      caja(madera, 1, 1.9, 0.1, W * 0.12, 4.2, frente)
      // Ventana con reja abajo a la derecha y otra a la izquierda
      caja(vano, 1, 1.2, 0.1, W * 0.34, 1.6, frente)
      for (let i = 0; i < 4; i++) caja(reja, 0.04, 1.2, 0.08, W * 0.34 - 0.36 + i * 0.24, 1.6, frente + 0.04)
      caja(vano, 0.8, 1.2, 0.1, -W * 0.32, 1.6, frente)
      // Macetones de cantera a los lados de la puerta
      for (const s of [-1, 1]) {
        pieza(CILINDRO, mat(TONO.urna), [0.32, 0.5, 0.32], [s * 1.05, 0.25, D / 2 + 0.45])
        pieza(ESFERA, mat(TONO.urna), [0.42, 0.32, 0.42], [s * 1.05, 0.62, D / 2 + 0.45])
      }
      // Enredadera en tiras desde el alero, sobre la mitad izquierda
      for (let i = 0; i < 6; i++) {
        const h = H * (0.45 + rnd(i, p.x) * 0.5)
        caja(mat(i % 2 ? TONO.hiedra : TONO.hiedraClara), 0.38 + rnd(p.z, i) * 0.3, h, 0.2, -W / 2 + 0.35 + i * 0.5, H - h / 2, D / 2 + 0.1)
      }
      hiedra(W, D, H, 'izq', 2, 0.7, p.x)
      alto = H + 2.2
      break
    }
    case 'enredadera': {
      // Cabaña Elena (foto): ladrillo casi cubierto de enredadera, techo bajo con alero de madera,
      // portón de madera de dos hojas y faroles a los lados
      const H = 3.4
      caja(mat(TONO.ladrillo), W, H, D, 0, H / 2, 0)
      pieza(dosAguas(W + 1.4, D + 1.4, 1.5), mat(TONO.madera, 'techo'), [1, 1, 1], [0, H, 0])
      caja(mat(TONO.madera), W + 1.4, 0.24, 0.2, 0, H + 0.02, D / 2 + 0.7)
      const porton = W * 0.14
      caja(madera, 1.7, 2.45, 0.1, porton, 1.22, frente)
      for (const s of [-1, 1]) caja(mat(TONO.madera, 'fijo'), 0.74, 2.3, 0.12, porton + s * 0.41, 1.15, frente)
      for (const s of [-1, 1]) caja(mat(TONO.cupula, 'fijo'), 0.22, 0.34, 0.22, porton + s * 1.25, 2.55, frente + 0.12)
      hiedra(W, D, H, 'frente', 8, 0.95, p.z)
      hiedra(W, D, H, 'der', 3, 0.85, p.x + 1)
      hiedra(W, D, H, 'izq', 3, 0.85, p.x + 2)
      alto = H + 1.5
      break
    }
    case 'adobe': {
      // Habitaciones 11 a 16: adobe amarillo, teja roja que cae al frente, alero blanco y enredadera
      const H = 3
      caja(mat(TONO.adobe), W, H, D, 0, H / 2, 0)
      const techo = caja(mat(TONO.teja, 'techo'), W + 0.02, 0.24, D + 1.3, 0, H + 0.3, 0.3)
      techo.rotation.x = 0.13
      caja(mat(TONO.alero), W + 0.02, 0.32, 0.1, 0, H - 0.08, D / 2 + 0.9)
      caja(madera, 1, 2.1, 0.08, -W * 0.14, 1.05, frente)
      caja(vano, 0.6, 1.1, 0.08, W * 0.3, 1.6, frente)
      hiedra(W, D, H, 'frente', 2, 0.6, p.z)
      alto = H + 0.6
      break
    }
    case 'cantera': {
      // Habitaciones 1 a 3: piedra volcánica, techo plano con pretil, vigas al frente, banqueta y maceta
      const H = 3
      const piedra = mat(TONO.volcanica)
      caja(piedra, W, H, D, 0, H / 2, 0)
      caja(mat(TONO.pretil, 'techo'), W + 0.02, 0.55, D + 0.3, 0, H + 0.27, 0)
      const viga = mat(TONO.madera)
      for (let i = 0; i < 4; i++) caja(viga, 0.16, 0.18, 1, -W / 2 + 0.5 + (i * (W - 1)) / 3, H - 0.12, D / 2 + 0.45)
      caja(madera, 0.95, 2.2, 0.08, -W * 0.24, 1.1, frente)
      caja(vano, 1, 1.3, 0.08, W * 0.2, 1.65, frente)
      for (let i = 0; i < 4; i++) caja(reja, 0.05, 1.3, 0.12, W * 0.2 - 0.38 + i * 0.25, 1.65, frente + 0.02)
      caja(mat(TONO.banqueta, 'fijo'), W + 0.02, 0.15, 1.6, 0, 0.07, D / 2 + 0.8)
      pieza(CILINDRO, piedra, [0.42, 0.8, 0.42], [W / 2 - 0.35, 0.55, D / 2 + 1.05])
      alto = H + 0.6
      break
    }
    case 'casa': {
      // Casas (12 nov): muros de cal claros sobre un zócalo de piedra, techo de teja a dos aguas con alero, chimenea,
      // un portal con dos postes de madera frente a la puerta y una ventana a cada lado
      const H = 3.1
      caja(mat(TONO.alero), W, H, D, 0, H / 2, 0)
      caja(mat(TONO.piedraClara, 'fijo'), W + 0.1, 0.5, D + 0.1, 0, 0.25, 0)
      pieza(dosAguas(W + 1.2, D + 1.4, 1.9), mat(TONO.teja, 'techo'), [1, 1, 1], [0, H, 0])
      caja(mat(TONO.ladrillo), 0.55, 1.4, 0.55, W * 0.3, H + 1.25, -D * 0.12)
      // El portal: piso de piedra, dos postes y su tejadillo
      caja(mat(TONO.banqueta, 'fijo'), W * 0.55, 0.14, 1.5, 0, 0.07, D / 2 + 0.75)
      for (const s of [-1, 1]) caja(mat(TONO.madera, 'fijo'), 0.16, 2.5, 0.16, s * W * 0.24, 1.35, D / 2 + 1.35)
      caja(mat(TONO.madera), W * 0.6, 0.16, 1.8, 0, 2.68, D / 2 + 0.85)
      // La puerta y las ventanas con su marco
      caja(madera, 0.95, 2.1, 0.08, 0, 1.05, frente)
      for (const s of [-1, 1]) {
        caja(mat(TONO.marco, 'fijo'), 1.1, 1.15, 0.06, s * W * 0.33, 1.7, frente - 0.01)
        caja(vano, 0.9, 0.95, 0.08, s * W * 0.33, 1.7, frente + 0.02)
      }
      alto = H + 1.9
      break
    }
    case 'salon': {
      // Salón: muros de vidrio entre columnas claras y un gran techo de cuatro aguas
      const H = 4.4
      caja(mat(TONO.banqueta, 'fijo'), W + 2, 0.25, D + 2, 0, 0.12, 0)
      caja(mat(TONO.vidrio, 'muro', { roughness: 0.3, metalness: 0.15 }), W - 0.4, H, D - 0.4, 0, H / 2, 0)
      const marco = mat(TONO.marco)
      const nx = Math.round(W / 3.2)
      const nz = Math.round(D / 3.2)
      for (let i = 0; i <= nx; i++) for (const s of [-1, 1]) caja(marco, 0.32, H, 0.32, -W / 2 + (i * W) / nx, H / 2, (s * D) / 2)
      for (let i = 1; i < nz; i++) for (const s of [-1, 1]) caja(marco, 0.32, H, 0.32, (s * W) / 2, H / 2, -D / 2 + (i * D) / nz)
      caja(marco, W + 0.3, 0.4, D + 0.3, 0, H - 0.2, 0)
      pieza(cuatroAguas(W / 2 + 1.3, D / 2 + 1.3, 5.2), mat(TONO.techoSalon, 'techo'), [1, 1, 1], [0, H, 0])
      alto = H + 5.2
      break
    }
    default: {
      // Sin estilo: una casa de muros claros y techo de dos aguas
      const H = 3.2
      caja(mat(TONO.piedraClara), W, H, D, 0, H / 2, 0)
      pieza(dosAguas(W + 1, D + 1, Math.min(W, D) * 0.3), mat(TONO.teja, 'techo'), [1, 1, 1], [0, H, 0])
      caja(madera, 1.2, 2.2, 0.1, 0, 1.1, frente)
      alto = H + Math.min(W, D) * 0.3
    }
  }

  o.g.rotation.y = f === 's' ? 0 : f === 'e' ? Math.PI / 2 : f === 'o' ? -Math.PI / 2 : Math.PI
  o.g.position.set(p.x, 1.2, p.z)
  return { g: o.g, alto }
}

/** Sombra de contacto: un rectángulo que se desvanece hacia afuera, hecho con capas (sin filtros, que Safari no tiene en canvas) */
function texturaSombra() {
  const lado = 256
  const c = document.createElement('canvas')
  c.width = c.height = lado
  const g = c.getContext('2d')!
  const capas = 24
  g.fillStyle = '#000'
  g.globalAlpha = 0.06
  for (let i = 0; i < capas; i++) {
    const t = i / (capas - 1)
    const m = 6 + t * 84
    const r = 40 * (1 - t) + 4
    const w = lado - 2 * m
    g.beginPath()
    g.moveTo(m + r, m)
    g.arcTo(m + w, m, m + w, m + w, r)
    g.arcTo(m + w, m + w, m, m + w, r)
    g.arcTo(m, m + w, m, m, r)
    g.arcTo(m, m, m + w, m, r)
    g.closePath()
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function crearMaqueta(caja: HTMLElement, o: Opciones): Maqueta | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    return null
  }
  const movil = innerWidth <= 900
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, movil ? 1.25 : 1.5)) // menos píxeles: el mapa se mueve más fluido
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // Las sombras de las construcciones no cambian entre cuadros: se dibujan una vez y solo se repiten cuando algo se mueve
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  renderer.setClearColor(0x000000, 0)
  caja.append(renderer.domElement)
  renderer.domElement.style.touchAction = 'pan-y'
  renderer.domElement.style.setProperty('-webkit-tap-highlight-color', 'transparent')

  const escena = new THREE.Scene()
  const camara = new THREE.PerspectiveCamera(24, 2, 10, 1600)
  // Luz de tarde: cálida pero sin teñir la piedra (con una luz muy anaranjada la cantera sale tostada), y un
  // rebote verde pino abajo, de modo que lo que queda en sombra se ve verdoso y no gris
  const hemi = new THREE.HemisphereLight(0xf8fbf9, 0x7f9f94, 1.15)
  escena.add(hemi)
  const sol = new THREE.DirectionalLight(0xfff8ee, 2.3)
  sol.position.set(80, 98, 86)
  sol.castShadow = true
  sol.shadow.mapSize.set(movil ? 1024 : 2048, movil ? 1024 : 2048)
  Object.assign(sol.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 10, far: 400 })
  sol.shadow.radius = 5
  sol.shadow.bias = -0.0006
  escena.add(sol)

  const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0 })
  const mundo = new THREE.Group()
  escena.add(mundo)

  // Terreno con canto: una losa de cantera sobre un zócalo más hondo, como una maqueta sobre papel de piedra
  const forma = new THREE.Shape()
  LOTE.forEach(([x, z], i) => (i ? forma.lineTo(x, -z) : forma.moveTo(x, -z)))
  forma.closePath()
  const loteG = new THREE.ExtrudeGeometry(forma, { depth: 1.2, bevelEnabled: false })
  loteG.rotateX(-Math.PI / 2)
  const lote = new THREE.Mesh(loteG, mat(TONO.lote))
  lote.receiveShadow = true
  lote.castShadow = true
  mundo.add(lote)
  const ZOCALO = 4
  const plintoG = new THREE.ExtrudeGeometry(forma, { depth: ZOCALO, bevelEnabled: false })
  plintoG.rotateX(-Math.PI / 2)
  const plinto = new THREE.Mesh(plintoG, mat(TONO.plinto))
  plinto.position.y = -ZOCALO
  plinto.castShadow = true
  mundo.add(plinto)
  const piso = -ZOCALO - 0.05
  // Sombra que proyecta sobre la página (pequeña: solo cubre lo que de verdad se sombrea)
  const cae = new THREE.Mesh(new THREE.PlaneGeometry(170, 270), new THREE.ShadowMaterial({ color: TONO.sombra, opacity: 0.09 }))
  cae.rotation.x = -Math.PI / 2
  cae.position.set(8, piso, 0)
  cae.receiveShadow = true
  mundo.add(cae)
  // Sombra de contacto: un halo suave alrededor del zócalo
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(116, 212),
    new THREE.MeshBasicMaterial({ map: texturaSombra(), color: TONO.sombra, transparent: true, opacity: 0.34, depthWrite: false }),
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.set(2, piso + 0.02, 0)
  mundo.add(halo)

  // Jardines y estacionamiento
  for (const z of PIEZAS.filter((q) => ['jardin', 'pasto', 'parking'].includes(q.tipo))) {
    const color = z.tipo === 'parking' ? TONO.grava : z.tipo === 'jardin' ? TONO.pasto : TONO.pastoClaro
    const m = new THREE.Mesh(new THREE.BoxGeometry(z.w, 0.12, z.d), mat(color))
    m.position.set(z.x, 1.28, z.z)
    m.receiveShadow = true
    mundo.add(m)
  }
  // Rayas blancas del estacionamiento, de cara a las habitaciones 1 a 3
  const parking = PIEZAS.find((q) => q.tipo === 'parking')
  if (parking) {
    const raya = mat(TONO.raya)
    for (let x = parking.x - parking.w / 2 + 1.5; x < parking.x + parking.w / 2 - 1; x += 2.8) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 5), raya)
      m.position.set(x, 1.35, parking.z - parking.d / 2 + 3)
      mundo.add(m)
    }
  }
  const matCamino = mat(TONO.camino)
  for (const c of CAMINOS)
    for (let i = 1; i < c.puntos.length; i++) {
      const [ax, az] = c.puntos[i - 1]
      const [bx, bz] = c.puntos[i]
      const largo = Math.hypot(bx - ax, bz - az)
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.ancho, 0.16, largo + c.ancho * 0.4), matCamino)
      m.position.set((ax + bx) / 2, 1.3, (az + bz) / 2)
      m.rotation.y = Math.atan2(bx - ax, bz - az)
      m.receiveShadow = true
      mundo.add(m)
    }

  // Pila de cantera: el agua lleva el verde del loto
  const glorieta = PIEZAS.find((q) => q.tipo === 'glorieta')!
  const pila = new THREE.Group()
  const piedra = mat(TONO.piedra)
  const anillo = (r1: number, r2: number, h: number, y: number, m: THREE.Material) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 36), m)
    c.position.y = y
    c.castShadow = true
    c.receiveShadow = true
    pila.add(c)
  }
  anillo(glorieta.w / 2, glorieta.w / 2, 0.2, 0.1, matCamino)
  anillo(3.2, 3.4, 0.6, 0.4, piedra)
  anillo(2.9, 2.9, 0.12, 0.72, mat(TONO.agua))
  anillo(0.4, 0.6, 2.6, 1.8, piedra)
  anillo(1.5, 0.6, 0.4, 3.2, piedra)
  anillo(0.2, 0.3, 1.4, 4, piedra)
  pila.position.set(glorieta.x, 1.3, glorieta.z)
  mundo.add(pila)

  // Árboles: cada tipo en un solo dibujo repetido (ligero), todos mecidos por el mismo viento.
  // Cada árbol lleva un verde distinto entre dos tonos del pino, para que no se vean de plástico.
  const uT = { value: 0 }
  const dummy = new THREE.Object3D()
  const grupoArboles = new THREE.Group()
  mundo.add(grupoArboles)
  const c1 = new THREE.Color()
  const c2 = new THREE.Color()
  const repartir = (lista: typeof ARBOLES, geo: THREE.BufferGeometry, material: THREE.Material, colocar: (a: (typeof ARBOLES)[number]) => void, tonos?: number[]) => {
    const im = new THREE.InstancedMesh(geo, material, lista.length)
    lista.forEach((a, i) => {
      colocar(a)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
      if (tonos) {
        // «Azar» repetible: depende de dónde está el árbol, no de Math.random
        const t = (Math.sin(a.x * 12.9898 + a.z * 78.233) * 43758.5453) % 1
        im.setColorAt(i, c1.set(tonos[0]).lerp(c2.set(tonos[1]), Math.abs(t)))
      }
    })
    im.castShadow = true
    im.receiveShadow = true
    grupoArboles.add(im)
  }
  const blanco = 0xffffff // el color de cada árbol va en la instancia; el material solo lo deja pasar
  const hoja = (f: number) => conViento(new THREE.MeshStandardMaterial({ color: blanco, roughness: 1 }), uT, f)
  const cipreses = ARBOLES.filter((a) => a.tipo === 'cipres')
  const palmas = ARBOLES.filter((a) => a.tipo === 'palma')
  const copas = ARBOLES.filter((a) => a.tipo === 'copa')
  const pinos = ARBOLES.filter((a) => a.tipo === 'pino')
  const colas = ARBOLES.filter((a) => a.tipo === 'cola')
  // Pino: tres conos encimados, más ancho abajo
  const pinoG = mergeGeometries(
    [
      [2.1, 4.2, 2.1],
      [1.6, 3.6, 4.2],
      [1.05, 3, 6.1],
    ].map(([r, h, y]) => new THREE.ConeGeometry(r, h, 9).translate(0, y, 0)),
  )!
  repartir(pinos, new THREE.CylinderGeometry(0.2, 0.28, 2.4, 6), mat(TONO.tronco), (a) => {
    dummy.position.set(a.x, 2.2, a.z)
    dummy.scale.setScalar(a.s)
    dummy.rotation.y = 0
  })
  repartir(
    pinos,
    pinoG,
    hoja(0.0012),
    (a) => {
      dummy.position.set(a.x, 1.2 + 1.6 * a.s, a.z)
      dummy.scale.setScalar(a.s)
      dummy.rotation.y = a.x
    },
    TONO.pino,
  )
  repartir(
    cipreses,
    new THREE.ConeGeometry(1.5, 9, 12),
    hoja(0.0009),
    (a) => {
      dummy.position.set(a.x, 1.2 + 4.5 * a.s, a.z)
      dummy.scale.setScalar(a.s)
      dummy.rotation.y = a.z
    },
    TONO.cipres,
  )
  repartir(palmas, new THREE.CylinderGeometry(0.14, 0.22, 6, 6), mat(TONO.tronco), (a) => {
    dummy.position.set(a.x, 4.2, a.z)
    dummy.scale.setScalar(a.s)
    dummy.rotation.y = 0
  })
  repartir(
    palmas,
    copaPalma(),
    hoja(0.012),
    (a) => {
      dummy.position.set(a.x, 7.1 * a.s + 0.4, a.z)
      dummy.scale.setScalar(2.5 * a.s)
      dummy.rotation.y = a.x
    },
    TONO.palma,
  )
  repartir(copas, new THREE.CylinderGeometry(0.22, 0.32, 3, 6), mat(TONO.tronco), (a) => {
    dummy.position.set(a.x, 2.6, a.z)
    dummy.scale.setScalar(a.s)
    dummy.rotation.y = 0
  })
  repartir(
    copas,
    new THREE.IcosahedronGeometry(2.9, 2),
    hoja(0.0035),
    (a) => {
      dummy.position.set(a.x, 5.2 * a.s + 0.6, a.z)
      dummy.scale.set(a.s, a.s * 0.9, a.s)
      dummy.rotation.y = a.z
    },
    TONO.copa,
  )

  // Cola de zorro: la hilera junto al agave y las matas frente a las cabañas
  const [colaHojas, colaEspigas] = mataCola()
  const enSuLugar = (a: (typeof ARBOLES)[number]) => {
    dummy.position.set(a.x, 1.2, a.z)
    dummy.scale.setScalar(a.s)
    dummy.rotation.y = a.x * 3 + a.z
  }
  repartir(colas, colaHojas, hoja(0.004), enSuLugar, TONO.cola)
  repartir(colas, colaEspigas, hoja(0.006), enSuLugar, TONO.colaPluma)

  // Edificios: cada uno con sus propios materiales para poder iluminarlo o atenuarlo por separado
  const edificios = new Map<string, Edificio>()
  const cajasToque: THREE.Mesh[] = []
  // Se arman en tandas chicas (ver el final de crearMaqueta) para no trabar la página mientras se baja
  const porConstruir = PIEZAS.filter((q) => q.estilo || ['cabana', 'casa', 'habitacion'].includes(q.tipo))
  const levantar = (p: (typeof PIEZAS)[number]) => {
    const tintes: Tinte[] = []
    const { g, alto } = construir(p, tintes)
    mundo.add(g)
    // Caja invisible para que sea fácil tocar el edificio (en una hilera, sin tapar a la de junto)
    const holgura = p.grupo ? 0.3 : 3
    const toque = new THREE.Mesh(new THREE.BoxGeometry(p.w + holgura, alto + 5, p.d + holgura), new THREE.MeshBasicMaterial({ visible: false }))
    toque.position.set(p.x, 1.2 + alto / 2 + 2, p.z)
    toque.userData.id = p.id
    mundo.add(toque)
    edificios.set(p.id, { g, tintes, pieza: p, alto, caja: toque, estado: 'reposo' })
  }
  let unidades = new Set<string>()
  let marcasExtra = new Map<string, number>()
  let filtro: Set<string> | null = null
  let foco: string | null = null
  const piezaPorId = new Map(PIEZAS.map((p) => [p.id, p]))

  // ── Qué se ve de cada edificio ──
  // reposo: sus colores de verdad, apagados · luz: más vivo y con el techo en ladrillo fuerte · apagado: casi piedra
  let sombraSucia = false
  const ensuciar = () => {
    sombraSucia = true
    despertar()
  }
  // De la app: ocupado → techo con el acento · cerrado → atenuado · solicitud → con un aro que late · libre → su color
  let estadosExt = new Map<string, 'ocupada' | 'apartada' | 'cerrada' | 'libre'>()
  const estadoDe = (id: string): Estado => {
    const x = estadosExt.get(id)
    if (x) return x === 'ocupada' ? 'luz' : x === 'cerrada' ? 'apagado' : 'reposo'
    return id === foco ? 'luz' : filtro ? (filtro.has(id) ? 'luz' : 'apagado') : 'reposo'
  }
  // Aros de las solicitudes: una argolla en el suelo, alrededor del edificio, que late despacio
  const halos = new Map<string, THREE.Mesh>()
  function ponerHalos(ids: string[]) {
    for (const [id, h] of halos)
      if (!ids.includes(id)) {
        mundo.remove(h)
        h.geometry.dispose()
        h.material.dispose()
        halos.delete(id)
      }
    for (const id of ids) {
      const p = piezaPorId.get(id)
      if (!p || halos.has(id)) continue
      const r = Math.hypot(p.w, p.d) / 2 + 1.3
      const h = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.9, 48), new THREE.MeshBasicMaterial({ color: TONO.techoLuz, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }))
      h.rotation.x = -Math.PI / 2
      h.position.set(p.x, 1.45, p.z)
      mundo.add(h)
      halos.set(id, h)
    }
  }
  function pintar(e: Edificio) {
    const estado = estadoDe(e.pieza.id)
    if (estado === e.estado) return
    e.estado = estado
    for (const t of e.tintes) {
      const c = t.c[estado]
      if (o.reduce) t.m.color.copy(c)
      else gsap.to(t.m.color, { r: c.r, g: c.g, b: c.b, duration: 0.6, ease: 'power2.out', overwrite: true, onUpdate: despertar })
    }
  }
  function pintarTodo() {
    for (const e of edificios.values()) pintar(e)
    despertar()
  }
  /** Solo los edificios iluminados se pueden tocar */
  function tocables() {
    cajasToque.length = 0
    for (const id of unidades) {
      const e = edificios.get(id)
      if (e && (!filtro || filtro.has(id))) cajasToque.push(e.caja)
    }
  }

  // ── Cámara: se mueve sobre una órbita alrededor de un punto ──
  const est = { th: 0, ph: 0.72, d: 300, x: 0, y: 0, z: 0, thAjuste: 0, thMeta: 0 }
  const base = { th: 0, d: 300, ph: 0.72, x: 0, y: 0, z: 0 }
  let enVuelo = false
  let cerca = false
  let zoom = false // acercada a un grupo de edificios
  const tan = Math.tan((camara.fov / 2) * (Math.PI / 180))
  // Las esquinas del terreno, abajo (zócalo) y arriba (copa de los árboles): lo que debe caber en la caja
  const ESQUINAS = LOTE.flatMap(([x, z]) => [new THREE.Vector3(x, -ZOCALO, z), new THREE.Vector3(x, 11, z)])
  const vDir = new THREE.Vector3()
  const vDer = new THREE.Vector3()
  const vArr = new THREE.Vector3()
  /** Aleja la cámara lo justo para que todo el terreno quepa en la caja, y mira al centro de lo que se ve (con perspectiva) */
  function encuadrar(th: number, ph: number, aspecto: number) {
    vDir.set(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)) // del centro hacia la cámara
    vDer.set(Math.cos(th), 0, -Math.sin(th)) // hacia la derecha de la pantalla
    vArr.set(-Math.sin(th) * Math.sin(ph), Math.cos(ph), -Math.cos(th) * Math.sin(ph)) // hacia arriba de la pantalla
    let d = 300
    let cu = 0
    let cv = 0
    for (let k = 0; k < 5; k++) {
      let x0 = Infinity
      let x1 = -Infinity
      let y0 = Infinity
      let y1 = -Infinity
      for (const q of ESQUINAS) {
        const prof = d - q.dot(vDir)
        const x = (q.dot(vDer) - cu) / (prof * tan * aspecto)
        const y = (q.dot(vArr) - cv) / (prof * tan)
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
      cu += ((x0 + x1) / 2) * d * tan * aspecto
      cv += ((y0 + y1) / 2) * d * tan
      d *= (Math.max(x1 - x0, y1 - y0) / 2) * 1.16 // lo más grande llena casi toda la caja, con un respiro
    }
    return { th, ph, d, x: vDer.x * cu + vArr.x * cv, y: vDer.y * cu + vArr.y * cv, z: vDer.z * cu + vArr.z * cv }
  }
  function medir() {
    const w = caja.clientWidth || 1
    const h = caja.clientHeight || 1
    renderer.setSize(w, h, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    camara.aspect = w / h
    const of = o.corrimiento?.() ?? 0
    if (of) camara.setViewOffset(w, h, -of, 0, w, h)
    else camara.clearViewOffset()
    camara.updateProjectionMatrix()
    // En una caja alta (celular) se mira de frente, hacia el fondo; en una ancha, de lado; en medio, en diagonal
    const t = Math.min(1, Math.max(0, (camara.aspect - 0.8) / 0.9))
    const s = t * t * (3 - 2 * t)
    const e = encuadrar(0.18 + s * (Math.PI / 2 - 0.52), 0.86 - s * 0.3, camara.aspect)
    Object.assign(base, e)
    if (!enVuelo && !cerca && !zoom) Object.assign(est, e)
  }
  function colocarCamara() {
    const th = est.th + est.thAjuste
    vDir.set(Math.sin(th) * Math.cos(est.ph), Math.sin(est.ph), Math.cos(th) * Math.cos(est.ph)).multiplyScalar(est.d)
    camara.position.set(est.x + vDir.x, est.y + vDir.y, est.z + vDir.z)
    camara.lookAt(est.x, est.y, est.z)
  }

  // ── Arrastrar para girar, pasar el mouse y tocar ──
  // El lienzo solo deja pasar el movimiento vertical (touch-action: pan-y): arriba y abajo sigue moviendo la página,
  // y de lado gira la maqueta.
  const fin = new AbortController()
  const rayo = new THREE.Raycaster()
  const m2 = new THREE.Vector2()
  const elEl = renderer.domElement
  const tomar = (e: PointerEvent) => {
    const r = elEl.getBoundingClientRect()
    m2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    rayo.setFromCamera(m2, camara)
    const h = rayo.intersectObjects(cajasToque)
    return h.length ? (h[0].object.userData.id as string) : null
  }
  let x0: number | null = null
  let th0 = 0
  let movio = false
  elEl.addEventListener('pointerdown', (e) => {
    if (cerca) return
    x0 = e.clientX
    th0 = est.thMeta
    movio = false
  })
  addEventListener('pointermove', (e) => {
    if (x0 !== null) {
      const dx = e.clientX - x0
      if (Math.abs(dx) > 6) movio = true
      if (o.fija) return // mapa quieto: arrastrar no lo gira
      est.thMeta = Math.max(-0.7, Math.min(0.7, th0 - dx * 0.0035))
      despertar()
    }
  }, { signal: fin.signal })
  addEventListener('pointerup', (e) => {
    if (x0 === null) return
    x0 = null
    if (!movio && e.target === elEl) {
      const id = tomar(e)
      if (id) o.alElegir(id)
    }
  }, { signal: fin.signal })
  // Si el navegador toma el gesto (la página empezó a bajar), se suelta la maqueta
  addEventListener('pointercancel', () => (x0 = null), { signal: fin.signal })
  let ultimo: string | null = null
  elEl.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || x0 !== null || cerca) return
    const id = tomar(e)
    if (id !== ultimo) {
      ultimo = id
      o.alPasar(id)
    }
    elEl.style.cursor = id ? 'pointer' : ''
  })
  elEl.addEventListener('pointerleave', () => {
    if (ultimo) {
      ultimo = null
      o.alPasar(null)
    }
  })

  // Orillas que se desvanecen (mapa del inicio). Antes era una máscara CSS sobre el lienzo, y con otras capas
  // animadas cerca Chrome dejaba de pintar un rectángulo del mapa (Jorge lo vio el 10 nov). Ahora lo hace la
  // tarjeta de video: un velo que multiplica la transparencia en las orillas, sin costo.
  const velo = o.fija
    ? (() => {
        const esc = new THREE.Scene()
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.ShaderMaterial({
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
            fragmentShader:
              'varying vec2 vUv; void main(){ float x = smoothstep(0.0, 0.06, vUv.x) * smoothstep(0.0, 0.06, 1.0 - vUv.x); float y = smoothstep(0.0, 0.06, vUv.y) * smoothstep(0.0, 0.06, 1.0 - vUv.y); gl_FragColor = vec4(0.0, 0.0, 0.0, x * y); }',
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.ZeroFactor,
            blendDst: THREE.SrcAlphaFactor,
            blendSrcAlpha: THREE.ZeroFactor,
            blendDstAlpha: THREE.SrcAlphaFactor,
            depthTest: false,
            depthWrite: false,
            transparent: true,
          }),
        )
        m.frustumCulled = false
        esc.add(m)
        return { esc, cam }
      })()
    : null

  // ── Cuadro por cuadro ──
  const pos = new Map<string, { x: number; y: number; ok: boolean }>()
  const pv = new THREE.Vector3()
  let visible = false
  let listoGPU = false
  let pausado = false
  let raf = 0
  const t0 = performance.now()
  function cuadro() {
    raf = 0
    uT.value = o.reduce ? 0 : (performance.now() - t0) / 1000
    for (const h of halos.values()) h.material.opacity = 0.28 + 0.3 * (0.5 + 0.5 * Math.sin(uT.value * 2.4))
    est.thAjuste += (est.thMeta - est.thAjuste) * 0.07
    colocarCamara()
    if (sombraSucia) {
      renderer.shadowMap.needsUpdate = true
      sombraSucia = false
    }
    renderer.render(escena, camara)
    if (velo) {
      renderer.autoClear = false
      renderer.render(velo.esc, velo.cam)
      renderer.autoClear = true
    }
    const w = caja.clientWidth
    const h = caja.clientHeight
    const proyectar = (id: string, dy: number) => {
      const p = piezaPorId.get(id)
      if (!p) return
      pv.set(p.x, 1.2 + (edificios.get(id)?.alto ?? 0) + dy, p.z).project(camara)
      // z > 1: el punto quedó detrás de la cámara (al volar cerca de un edificio)
      pos.set(id, { x: (pv.x * 0.5 + 0.5) * w, y: (-pv.y * 0.5 + 0.5) * h, ok: pv.z < 1 })
    }
    for (const id of unidades) proyectar(id, 4.2)
    for (const [id, dy] of marcasExtra) proyectar(id, dy)
    o.alMover(pos)
    if (o.reduce) return
    // Fluidez (10 nov): si la cámara se mueve, cuadro por cuadro; quieta, solo el viento de los árboles
    // unas pocas veces por segundo (antes se dibujaba 60 veces por segundo aunque nada cambiara).
    const foto = `${est.x.toFixed(3)}|${est.y.toFixed(3)}|${est.z.toFixed(3)}|${est.d.toFixed(3)}|${est.th.toFixed(4)}|${est.ph.toFixed(4)}|${est.thAjuste.toFixed(4)}|${camara.aspect.toFixed(3)}`
    if (foto !== ultimaFoto) quietaDesde = performance.now()
    ultimaFoto = foto
    if (performance.now() - quietaDesde < 500) despertar()
    else {
      clearTimeout(lento)
      lento = window.setTimeout(despertar, movil ? 120 : 80)
    }
  }
  let ultimaFoto = ''
  let quietaDesde = performance.now()
  let lento = 0
  function despertar() {
    if (!raf && listoGPU && visible && !pausado && !document.hidden) raf = requestAnimationFrame(cuadro)
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    despertar()
  })
  io.observe(caja)
  document.addEventListener('visibilitychange', despertar, { signal: fin.signal })
  const ro = new ResizeObserver(() => {
    medir()
    despertar()
    if (o.reduce) requestAnimationFrame(cuadro)
  })
  ro.observe(caja)
  medir()
  // Fluidez (10 nov): los sombreados se preparan en segundo plano antes del primer dibujo. Antes se compilaban
  // de golpe en el primer cuadro y la página se trababa ~0.4 s al bajar hacia el mapa (medido en celular).
  colocarCamara()
  void (async () => {
    const pausa = () => new Promise((r) => setTimeout(r, 0))
    for (let i = 0; i < porConstruir.length; i++) {
      if (fin.signal.aborted) return
      levantar(porConstruir[i])
      if (i % 3 === 2) await pausa()
    }
    if (fin.signal.aborted) return
    tocables()
    pintarTodo()
    sombraSucia = true
    await pausa()
    await renderer.compileAsync(escena, camara).catch(() => undefined)
    listoGPU = true
    despertar()
  })()

  return {
    ponerUnidades(ids) {
      unidades = new Set(ids)
      tocables()
      pos.clear()
      pintarTodo()
    },
    ponerMarcas(items) {
      marcasExtra = new Map(items)
      despertar()
    },
    filtrar(ids) {
      filtro = ids ? new Set(ids) : null
      tocables()
      pintarTodo()
    },
    resaltar(id) {
      foco = id
      pintarTodo()
      for (const u of unidades) {
        const e = edificios.get(u)
        if (!e) continue
        const y = u === id ? 2.1 : 1.2
        if (o.reduce) {
          e.g.position.y = y
          sombraSucia = true
        } else gsap.to(e.g.position, { y, duration: 0.7, ease: 'power3.out', overwrite: true, onUpdate: ensuciar })
      }
    },
    volarA(id, duracion) {
      const e = edificios.get(id)
      if (!e) return
      // De frente a su puerta, igual que al acercarse a un grupo: una habitación se ve con toda su hilera
      // (ella resaltada) y una cabaña sola, centrada
      const p = e.pieza
      const ps = p.grupo ? PIEZAS.filter((q) => q.grupo === p.grupo) : [p]
      const x0 = Math.min(...ps.map((q) => q.x - q.w / 2))
      const x1 = Math.max(...ps.map((q) => q.x + q.w / 2))
      const z0 = Math.min(...ps.map((q) => q.z - q.d / 2))
      const z1 = Math.max(...ps.map((q) => q.z + q.d / 2))
      const tramo = Math.max(x1 - x0, z1 - z0) + 8
      const f = p.frente ?? 's'
      const giro = f === 's' ? 0 : f === 'e' ? Math.PI / 2 : f === 'o' ? -Math.PI / 2 : Math.PI
      enVuelo = true
      cerca = true
      gsap.killTweensOf(est) // el último viaje manda (también sobre la entrada)
      gsap.to(est, {
        x: (x0 + x1) / 2,
        y: ps.length === 1 ? 1.2 + e.alto * 0.6 : 2,
        z: (z0 + z1) / 2,
        // Una construcción sola (Sabas, de dos pisos con cúpula) se mira a media altura: queda al centro con su punto a la vista
        d: Math.max(ps.length === 1 ? 62 : 44, camara.aspect < 1 ? (tramo + 4) * 2.9 : tramo * 2.2),
        ph: 0.62,
        th: giro,
        thAjuste: 0,
        thMeta: 0,
        duration: o.reduce ? 0 : duracion,
        ease: 'power3.inOut',
        onComplete: () => void (enVuelo = false),
      })
      if (o.reduce) requestAnimationFrame(cuadro)
    },
    acercar(ids, duracion) {
      if (o.fija) return
      const ps = ids.flatMap((id) => piezaPorId.get(id) ?? [])
      if (!ps.length) return
      const x0 = Math.min(...ps.map((p) => p.x - p.w / 2))
      const x1 = Math.max(...ps.map((p) => p.x + p.w / 2))
      const z0 = Math.min(...ps.map((p) => p.z - p.d / 2))
      const z1 = Math.max(...ps.map((p) => p.z + p.d / 2))
      const tramo = Math.max(x1 - x0, z1 - z0) + 8
      // Se mira de frente a las puertas: así una hilera se ve a lo largo y cada punto queda sobre su cuarto
      const f = ps[0].frente ?? 's'
      const giro = f === 's' ? 0 : f === 'e' ? Math.PI / 2 : f === 'o' ? -Math.PI / 2 : Math.PI
      enVuelo = true
      zoom = true
      gsap.to(est, {
        x: (x0 + x1) / 2,
        y: 2,
        z: (z0 + z1) / 2,
        d: Math.max(50, camara.aspect < 1 ? (tramo + 4) * 2.9 : tramo * 2.2),
        ph: 0.62,
        th: giro,
        thAjuste: 0,
        thMeta: 0,
        duration: o.reduce ? 0 : duracion,
        ease: 'power3.inOut',
        onComplete: () => void (enVuelo = false),
      })
      if (o.reduce) requestAnimationFrame(cuadro)
    },
    acercada: () => zoom,
    volver(duracion) {
      zoom = false
      enVuelo = true
      gsap.to(est, {
        x: base.x,
        y: base.y,
        z: base.z,
        d: base.d,
        ph: base.ph,
        th: base.th,
        duration: o.reduce ? 0 : duracion,
        ease: 'power3.inOut',
        onComplete: () => {
          enVuelo = false
          cerca = false
        },
      })
      if (o.reduce) requestAnimationFrame(cuadro)
    },
    entrar() {
      if (o.reduce) {
        requestAnimationFrame(cuadro)
        return
      }
      // La cámara baja y gira hasta su lugar mientras los edificios y árboles crecen
      gsap.fromTo(est, { ph: base.ph + 0.5, d: base.d * 1.35, th: base.th - 0.5 }, { ph: base.ph, d: base.d, th: base.th, duration: 2.6, ease: 'power3.out' })
      gsap.fromTo(renderer.domElement, { opacity: 0 }, { opacity: 1, duration: 1.1 })
      const gs = [...edificios.values()].map((e) => e.g)
      gs.forEach((g) => g.scale.set(1, 0.001, 1))
      gsap.to(
        gs.map((g) => g.scale),
        { y: 1, duration: 1.3, stagger: 0.07, delay: 0.5, ease: 'expo.out', onUpdate: ensuciar },
      )
      grupoArboles.scale.y = 0.001
      gsap.to(grupoArboles.scale, { y: 1, duration: 1.8, delay: 0.3, ease: 'expo.out', onUpdate: ensuciar })
    },
    pausar(si) {
      pausado = si
      despertar()
    },
    ponerEstados(mapa) {
      estadosExt = new Map(mapa)
      ponerHalos([...mapa].filter(([, v]) => v === 'apartada').map(([k]) => k))
      pintarTodo()
    },
    ponerAcento(hex) {
      TONO.techoLuz = hex
      for (const e of edificios.values()) {
        for (const t of e.tintes) t.c.luz = luzDe(t.base, t.rol)
        e.estado = null
      }
      for (const h of halos.values()) h.material.color.set(hex)
      pintarTodo()
    },
    ponerModo(noche) {
      hemi.intensity = noche ? 0.95 : 1.15
      hemi.color.set(noche ? 0xdbe9e4 : 0xf8fbf9)
      hemi.groundColor.set(noche ? 0x4a6a60 : 0x7f9f94)
      sol.intensity = noche ? 1.7 : 2.3
      sol.color.set(noche ? 0xd2e6df : 0xfff8ee)
      sombraSucia = true
      despertar()
    },
    destruir() {
      fin.abort()
      io.disconnect()
      ro.disconnect()
      cancelAnimationFrame(raf)
      clearTimeout(lento)
      gsap.killTweensOf(est)
      escena.traverse((n) => {
        if (n.geometry) n.geometry.dispose()
        const mt = n.material
        if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => x.dispose())
      })
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

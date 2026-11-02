// Maqueta 3D del rancho (step1 · atmósfera Flor) trazada desde la vista satelital (src/lib/layout.ts).
// Ciclo de luz real según la hora en Tototlán, ventanas y faroles que se encienden de noche,
// fuente con agua, nubes que derivan, filtros por estado, montaje del evento y recorrido.
// Rendimiento móvil: render bajo demanda, instancing, 2 luces, ambiente a 24 fps solo si hace falta.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls, Line } from '@react-three/drei'
import { Html3D } from './Html3D'
import * as THREE from 'three'
import { FEATURES, LOT_POLYGON, PATHS, TREES, VENUE_SPACES, type MapFeature, type TreeKind } from '@/lib/layout'
import { ITEM_SPECS } from '@/lib/floorplan'
import { TONE, UNIT_STATUS } from '@/lib/meta'
import type { FloorItem, RanchEvent, Unit, UnitStatus } from '@/lib/types'
import { sunState, type SunState, type TimeMode } from './sun'

type Controls = ElementRef<typeof CameraControls>

export interface UnitInfo {
  guest?: string
  detail?: string
  cleaning?: number // 0..1
  /** Una línea útil que se ve siempre sobre la casa: "Sale hoy 12:00", "Llegan 17:00", "Limpiando · 40%" */
  short?: string
}

export interface RanchScene3DProps {
  units: Unit[]
  selectedId?: string | null
  onSelect: (featureId: string | null) => void
  reducedMotion?: boolean
  /** Cambia este número para regresar a la vista general */
  resetKey?: number
  timeMode?: TimeMode
  statusFilter?: UnitStatus | null
  unitInfo?: Record<string, UnitInfo>
  setupEvent?: RanchEvent | null
  showSetup?: boolean
  touring?: boolean
  /** Ángulo de la cámara alrededor del eje vertical (para la brújula) */
  onAzimuth?: (rad: number) => void
  /** Píxeles que tapa un panel a la derecha (+) o a la izquierda (−): la casa elegida se centra en lo que queda libre */
  focusShiftPx?: number
  /** Píxeles que tapa abajo una tarjeta (celular) menos los que tapan los controles de arriba */
  focusShiftYPx?: number
  /** Tarjeta flotante con detalles sobre la casa elegida (en celular se usa la tarjeta de abajo) */
  selectedCard?: boolean
}

const OVERVIEW_WIDE: [number, number, number, number, number, number] = [62, 118, 128, 0, 0, 4]
// En pantallas verticales (celular) la cámara se aleja y mira más desde arriba para que quepa el lote
const OVERVIEW_TALL: [number, number, number, number, number, number] = [14, 236, 150, -3, 0, 2]

// Paleta step1 (Flor, apagada). three.js necesita colores fijos.
const COLORS = {
  field: '#E6D8C2',
  furrow: '#D8C7AC',
  lot: '#CBC8A6',
  lawn: '#B7B98F',
  lawnAlt: '#C3C39F',
  path: '#E9D7BC',
  street: '#CFC2B9',
  parking: '#D7CBC2',
  sand: '#E8CFA8',
  stone: '#DECFBF',
  water: '#9DB2BB',
  door: '#9A6B5C',
  window: '#E7D3BE',
  windowLit: '#F4C886',
  fence: '#AD917F',
  wall: '#F4E7DC',
  trunk: '#9C7A60',
  outline: '#F3D8BC',
  cloth: '#F6EAE0',
  chair: '#C8A07E',
}
const ROOF: Record<string, string> = {
  'cabana-1': '#A9645F',
  'cabana-2': '#8C8B63',
  'cabana-3': '#C98C7E',
  'casa-1': '#E2AF9A',
  'casa-2': '#D49F8D',
  'casa-3': '#C98C7E',
  'casa-4': '#A9645F',
  salon: '#D7B596',
  bodega: '#9E5C59',
}
const TREE_COLORS: Record<TreeKind, string> = { cypress: '#77815B', palm: '#949C6C', round: '#A1A577' }

// ── Fases de luz (día · atardecer · noche Nocturno) ──────
interface PhaseSpec {
  skyTop: string
  skyHorizon: string
  fog: string
  hemiSky: string
  hemiGround: string
  hemiInt: number
  lightColor: string
  lightInt: number
  disc: string
}
const DAY: PhaseSpec = { skyTop: '#C6AFAA', skyHorizon: '#F3E4D5', fog: '#F0E1D3', hemiSky: '#F6EBDD', hemiGround: '#B3AE88', hemiInt: 1.15, lightColor: '#FFF0DC', lightInt: 1.75, disc: '#FBEBDD' }
const GOLDEN: PhaseSpec = { skyTop: '#B66F6A', skyHorizon: '#F3D2B4', fog: '#EFD2BB', hemiSky: '#F1D6C2', hemiGround: '#AFA584', hemiInt: 1.05, lightColor: '#F6C79E', lightInt: 1.45, disc: '#F3D8BC' }
const NIGHT: PhaseSpec = { skyTop: '#0D151F', skyHorizon: '#2A4152', fog: '#22343F', hemiSky: '#4C6078', hemiGround: '#162430', hemiInt: 0.55, lightColor: '#B7C4D8', lightInt: 0.55, disc: '#F1DDB4' }

const _c1 = new THREE.Color()
const _c2 = new THREE.Color()
function mixHex(a: string, b: string, t: number, out = new THREE.Color()) {
  return out.copy(_c1.set(a)).lerp(_c2.set(b), t)
}

interface PhaseValues {
  skyTop: THREE.Color
  skyHorizon: THREE.Color
  fog: THREE.Color
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiInt: number
  lightColor: THREE.Color
  lightInt: number
  disc: THREE.Color
  lightDir: THREE.Vector3
  discDir: THREE.Vector3
  night: number
  golden: number
}

function phaseTarget(s: SunState): PhaseValues {
  const col = (k: 'skyTop' | 'skyHorizon' | 'fog' | 'hemiSky' | 'hemiGround' | 'lightColor' | 'disc') => mixHex(DAY[k], GOLDEN[k], s.golden).lerp(_c2.set(NIGHT[k]), s.night)
  const num = (k: 'hemiInt' | 'lightInt') => (DAY[k] + (GOLDEN[k] - DAY[k]) * s.golden) * (1 - s.night) + NIGHT[k] * s.night
  const dirFrom = (alt: number, az: number) => new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)).normalize()
  // De noche la luz principal es la luna (al oriente, alta)
  const moon = dirFrom(38 * (Math.PI / 180), 118 * (Math.PI / 180))
  const sun = dirFrom(Math.max(s.alt, 5 * (Math.PI / 180)), s.az)
  const sunDisc = dirFrom(Math.max(s.alt, 1.5 * (Math.PI / 180)), s.az)
  const isNight = s.night > 0.55
  return {
    skyTop: col('skyTop'),
    skyHorizon: col('skyHorizon'),
    fog: col('fog'),
    hemiSky: col('hemiSky'),
    hemiGround: col('hemiGround'),
    hemiInt: num('hemiInt'),
    lightColor: col('lightColor'),
    lightInt: num('lightInt'),
    disc: col('disc'),
    lightDir: isNight ? moon : sun,
    discDir: isNight ? moon : sunDisc,
    night: s.night,
    golden: s.golden,
  }
}

/** Valores de ambiente compartidos (los leen ventanas, faroles y nubes) */
const EnvCtx = createContext<{ night: number; golden: number }>({ night: 0, golden: 0 })
/** En celular la casa elegida ya tiene su tarjeta abajo: la flotante sobre la casa se omite */
const CardCtx = createContext(true)

let _radial: THREE.Texture | null = null
function radialTexture() {
  if (_radial) return _radial
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  _radial = new THREE.CanvasTexture(c)
  _radial.colorSpace = THREE.SRGBColorSpace
  return _radial
}

// ── Cielo, estrellas, sol/luna y controlador de fase ─────
const SKY_VERT = `varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const SKY_FRAG = `uniform vec3 top; uniform vec3 horizon; varying vec3 vPos;
void main(){ float h = max(vPos.y, 0.0); float t = pow(h, 0.55); vec3 c = mix(horizon, top, t); if (vPos.y < 0.0) c = horizon; gl_FragColor = vec4(c, 1.0); }`

function PhaseController({ mode, env }: { mode: TimeMode; env: { night: number; golden: number } }) {
  const { scene, invalidate } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null)
  const dir = useRef<THREE.DirectionalLight>(null)
  const disc = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Sprite>(null)
  const stars = useRef<THREE.Points>(null)
  const skyMat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { top: { value: new THREE.Color(DAY.skyTop) }, horizon: { value: new THREE.Color(DAY.skyHorizon) } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }), [])
  const [tick, setTick] = useState(0)
  const target = useMemo(() => phaseTarget(sunState(mode)), [mode, tick])
  const cur = useRef<PhaseValues | null>(null)
  const settled = useRef(false)

  // "Ahora": recalcula la fase cada minuto
  useEffect(() => {
    if (mode !== 'ahora') return
    const iv = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(iv)
  }, [mode])
  useEffect(() => {
    settled.current = false
    invalidate()
  }, [target, invalidate])

  const starGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pts: number[] = []
    let s = 11
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    for (let i = 0; i < 260; i++) {
      const az = r() * Math.PI * 2
      const el = 0.12 + r() * 1.3
      pts.push(Math.cos(az) * Math.cos(el) * 400, Math.sin(el) * 400, Math.sin(az) * Math.cos(el) * 400)
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])

  useLayoutEffect(() => {
    scene.fog = new THREE.Fog(DAY.fog, 230, 560)
    return () => {
      scene.fog = null
    }
  }, [scene])

  useFrame((_, delta) => {
    if (settled.current && cur.current) return
    const first = !cur.current
    if (first) {
      cur.current = { ...target, skyTop: target.skyTop.clone(), skyHorizon: target.skyHorizon.clone(), fog: target.fog.clone(), hemiSky: target.hemiSky.clone(), hemiGround: target.hemiGround.clone(), lightColor: target.lightColor.clone(), disc: target.disc.clone(), lightDir: target.lightDir.clone(), discDir: target.discDir.clone() }
    }
    const c = cur.current!
    const k = first ? 1 : 1 - Math.exp(-delta * 2.4)
    c.skyTop.lerp(target.skyTop, k)
    c.skyHorizon.lerp(target.skyHorizon, k)
    c.fog.lerp(target.fog, k)
    c.hemiSky.lerp(target.hemiSky, k)
    c.hemiGround.lerp(target.hemiGround, k)
    c.lightColor.lerp(target.lightColor, k)
    c.disc.lerp(target.disc, k)
    c.lightDir.lerp(target.lightDir, k).normalize()
    c.discDir.lerp(target.discDir, k).normalize()
    c.hemiInt += (target.hemiInt - c.hemiInt) * k
    c.lightInt += (target.lightInt - c.lightInt) * k
    c.night += (target.night - c.night) * k
    c.golden += (target.golden - c.golden) * k
    env.night = c.night
    env.golden = c.golden

    skyMat.uniforms.top!.value.copy(c.skyTop)
    skyMat.uniforms.horizon!.value.copy(c.skyHorizon)
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(c.fog)
    if (hemi.current) {
      hemi.current.color.copy(c.hemiSky)
      hemi.current.groundColor.copy(c.hemiGround)
      hemi.current.intensity = c.hemiInt
    }
    if (dir.current) {
      dir.current.color.copy(c.lightColor)
      dir.current.intensity = c.lightInt
      dir.current.position.copy(c.lightDir).multiplyScalar(190)
    }
    const discPos = c.discDir.clone().multiplyScalar(380)
    const isMoon = c.night > 0.55
    if (disc.current) {
      disc.current.position.copy(discPos)
      ;(disc.current.material as THREE.MeshBasicMaterial).color.copy(c.disc)
      disc.current.scale.setScalar(isMoon ? 0.7 : 1)
    }
    if (halo.current) {
      halo.current.position.copy(discPos)
      ;(halo.current.material as THREE.SpriteMaterial).color.copy(c.disc)
      ;(halo.current.material as THREE.SpriteMaterial).opacity = isMoon ? 0.45 : 0.75 + c.golden * 0.2
      halo.current.scale.setScalar(isMoon ? 80 : 150 + c.golden * 60)
    }
    if (stars.current) (stars.current.material as THREE.PointsMaterial).opacity = Math.max(0, c.night - 0.35) * 1.4

    const diff = Math.abs(target.night - c.night) + Math.abs(target.golden - c.golden) + c.lightDir.distanceTo(target.lightDir) + Math.abs(target.lightInt - c.lightInt)
    if (diff < 0.002) settled.current = true
    else invalidate()
  })

  return (
    <>
      <mesh material={skyMat} renderOrder={-10}>
        <sphereGeometry args={[450, 32, 16]} />
      </mesh>
      <points ref={stars} geometry={starGeo}>
        <pointsMaterial color="#F1E3C4" size={1.6} sizeAttenuation={false} transparent opacity={0} depthWrite={false} fog={false} />
      </points>
      <mesh ref={disc}>
        <sphereGeometry args={[11, 24, 16]} />
        <meshBasicMaterial color={DAY.disc} fog={false} />
      </mesh>
      <sprite ref={halo}>
        <spriteMaterial map={radialTexture()} color={DAY.disc} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </sprite>
      <hemisphereLight ref={hemi} args={[DAY.hemiSky, DAY.hemiGround, DAY.hemiInt]} />
      <directionalLight
        ref={dir}
        position={[60, 120, 45]}
        intensity={DAY.lightInt}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-115}
        shadow-camera-right={115}
        shadow-camera-top={115}
        shadow-camera-bottom={-115}
        shadow-camera-near={10}
        shadow-camera-far={420}
      />
    </>
  )
}

/** Mantiene el ambiente (agua, nubes, pin) a ~24 fps solo cuando está activo y visible */
function AmbientTicker({ enabled, fps = 24 }: { enabled: boolean; fps?: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (!enabled) return
    let iv: ReturnType<typeof setInterval> | undefined
    const start = () => {
      clearInterval(iv)
      if (document.visibilityState === 'visible') iv = setInterval(() => invalidate(), 1000 / fps)
    }
    start()
    document.addEventListener('visibilitychange', start)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', start)
    }
  }, [enabled, fps, invalidate])
  return null
}

// ── Geometrías compartidas ───────────────────────────────
function gableGeometry(w: number, d: number, rh: number) {
  const shape = new THREE.Shape()
  shape.moveTo(-d / 2 - 0.5, 0)
  shape.lineTo(d / 2 + 0.5, 0)
  shape.lineTo(0, rh)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: w + 0.8, bevelEnabled: false })
  g.translate(0, 0, -(w + 0.8) / 2)
  g.rotateY(Math.PI / 2)
  return g
}

function hipGeometry(w: number, d: number, rh: number) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1)
  g.rotateY(Math.PI / 4)
  g.translate(0, 0.5, 0)
  g.scale(w + 1.2, rh, d + 1.2)
  return g
}

// ── Terreno ──────────────────────────────────────────────
function Ground() {
  const lotShape = useMemo(() => {
    const s = new THREE.Shape()
    LOT_POLYGON.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, -z) : s.lineTo(x, -z)))
    s.closePath()
    return s
  }, [])
  const furrows = useRef<THREE.InstancedMesh>(null)
  const count = 90
  useLayoutEffect(() => {
    const m = furrows.current
    if (!m) return
    const o = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      o.position.set(-225 + i * 5, -0.04, 0)
      o.rotation.set(-Math.PI / 2, 0, 0)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [])
  const fence = useMemo(() => [...LOT_POLYGON, LOT_POLYGON[0]!].map(([x, z]) => new THREE.Vector3(x, 0.6, z)), [])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.06} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshLambertMaterial color={COLORS.field} />
      </mesh>
      <instancedMesh ref={furrows} args={[undefined, undefined, count]} receiveShadow>
        <planeGeometry args={[2, 460]} />
        <meshLambertMaterial color={COLORS.furrow} />
      </instancedMesh>
      <mesh rotation-x={-Math.PI / 2} position={[-41, -0.02, 0]} receiveShadow>
        <planeGeometry args={[6, 460]} />
        <meshLambertMaterial color={COLORS.street} />
      </mesh>
      <Html3D position={[-41, 0.2, -60]} zIndex={5} style={{ pointerEvents: 'none' }}>
        <span className="rounded-full bg-[color-mix(in_oklab,var(--surface)_80%,transparent)] px-2.5 py-0.5 text-[10px] whitespace-nowrap text-ink-soft">C. Crisantemo</span>
      </Html3D>
      <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
        <shapeGeometry args={[lotShape]} />
        <meshLambertMaterial color={COLORS.lot} />
      </mesh>
      <Line points={fence} color={COLORS.fence} lineWidth={1.6} />
    </group>
  )
}

function Paths() {
  return (
    <group>
      {PATHS.map((p, i) =>
        p.points.slice(1).map((b, j) => {
          const a = p.points[j]!
          const dx = b[0] - a[0]
          const dz = b[1] - a[1]
          const len = Math.hypot(dx, dz) + p.width * 0.5
          const angle = Math.atan2(dx, dz)
          return (
            <mesh key={`${i}-${j}`} position={[(a[0] + b[0]) / 2, 0.035, (a[1] + b[1]) / 2]} rotation={[-Math.PI / 2, 0, angle]} receiveShadow>
              <planeGeometry args={[p.width, len]} />
              <meshLambertMaterial color={COLORS.path} />
            </mesh>
          )
        }),
      )}
    </group>
  )
}

// ── Faroles a lo largo de los caminos (emisivos + charcos de luz falsos) ──
const LAMPS: [number, number][] = (() => {
  const out: [number, number][] = []
  for (const p of PATHS) {
    for (let j = 1; j < p.points.length; j++) {
      const a = p.points[j - 1]!
      const b = p.points[j]!
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 6) continue
      const nx = -(b[1] - a[1]) / len
      const nz = (b[0] - a[0]) / len
      const n = Math.max(1, Math.floor(len / 9))
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const side = k % 2 ? 1 : -1
        out.push([a[0] + (b[0] - a[0]) * t + nx * (p.width / 2 + 1) * side, a[1] + (b[1] - a[1]) * t + nz * (p.width / 2 + 1) * side])
      }
    }
  }
  out.push([-27, 61], [-27, 71], [-26, 55], [-2, 55])
  return out
})()

function Lamps() {
  const env = useContext(EnvCtx)
  const posts = useRef<THREE.InstancedMesh>(null)
  const bulbs = useRef<THREE.InstancedMesh>(null)
  const pools = useRef<THREE.InstancedMesh>(null)
  const bulbMat = useRef<THREE.MeshLambertMaterial>(null)
  const poolMat = useRef<THREE.MeshBasicMaterial>(null)
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    LAMPS.forEach(([x, z], i) => {
      o.position.set(x, 1.35, z)
      o.rotation.set(0, 0, 0)
      o.scale.setScalar(1)
      o.updateMatrix()
      posts.current?.setMatrixAt(i, o.matrix)
      o.position.set(x, 2.8, z)
      o.updateMatrix()
      bulbs.current?.setMatrixAt(i, o.matrix)
      o.position.set(x, 0.06, z)
      o.rotation.set(-Math.PI / 2, 0, 0)
      o.updateMatrix()
      pools.current?.setMatrixAt(i, o.matrix)
    })
    for (const m of [posts.current, bulbs.current, pools.current]) if (m) m.instanceMatrix.needsUpdate = true
  }, [])
  useFrame(() => {
    const n = env.night
    if (bulbMat.current) bulbMat.current.emissiveIntensity = 0.1 + n * 2.2
    if (poolMat.current) {
      poolMat.current.opacity = n * 0.5
      poolMat.current.visible = n > 0.05
    }
  })
  return (
    <group>
      <instancedMesh ref={posts} args={[undefined, undefined, LAMPS.length]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 2.7, 6]} />
        <meshLambertMaterial color="#5E4A44" />
      </instancedMesh>
      <instancedMesh ref={bulbs} args={[undefined, undefined, LAMPS.length]}>
        <sphereGeometry args={[0.26, 12, 8]} />
        <meshLambertMaterial ref={bulbMat} color="#F6E2C2" emissive="#F7C98A" emissiveIntensity={0.1} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, undefined, LAMPS.length]} renderOrder={2}>
        <planeGeometry args={[7, 7]} />
        <meshBasicMaterial ref={poolMat} map={radialTexture()} color="#F6C88E" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </group>
  )
}

// ── Árboles instanciados ─────────────────────────────────
function TreeLayer({ kind }: { kind: TreeKind }) {
  const list = useMemo(() => TREES.filter((t) => t.kind === kind), [kind])
  const crown = useRef<THREE.InstancedMesh>(null)
  const trunk = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => {
    if (kind === 'cypress') return { crown: new THREE.ConeGeometry(1.3, 7, 7), crownY: 4.2, trunkH: 1.2 }
    if (kind === 'palm') return { crown: new THREE.ConeGeometry(2.6, 1.3, 7), crownY: 6.6, trunkH: 6.2 }
    return { crown: new THREE.IcosahedronGeometry(2.4, 0), crownY: 3.6, trunkH: 2.2 }
  }, [kind])
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    list.forEach((t, i) => {
      o.position.set(t.x, geo.crownY * t.s, t.z)
      o.rotation.set(0, (i * 1.7) % Math.PI, 0)
      o.scale.setScalar(t.s)
      o.updateMatrix()
      crown.current?.setMatrixAt(i, o.matrix)
      o.position.set(t.x, (geo.trunkH * t.s) / 2, t.z)
      o.scale.set(t.s, t.s, t.s)
      o.updateMatrix()
      trunk.current?.setMatrixAt(i, o.matrix)
    })
    if (crown.current) crown.current.instanceMatrix.needsUpdate = true
    if (trunk.current) trunk.current.instanceMatrix.needsUpdate = true
  }, [list, geo])
  return (
    <group>
      <instancedMesh ref={crown} args={[geo.crown, undefined, list.length]} castShadow>
        <meshLambertMaterial color={TREE_COLORS[kind]} flatShading />
      </instancedMesh>
      <instancedMesh ref={trunk} args={[undefined, undefined, list.length]} castShadow>
        <cylinderGeometry args={[kind === 'palm' ? 0.28 : 0.35, kind === 'palm' ? 0.4 : 0.45, geo.trunkH, 6]} />
        <meshLambertMaterial color={COLORS.trunk} />
      </instancedMesh>
    </group>
  )
}

// ── Nubes que derivan con sombra tenue en el suelo ───────
const CLOUDS = [
  { x: -90, z: -40, s: 1.2, speed: 1.6 },
  { x: 40, z: 30, s: 1, speed: 1.2 },
  { x: -20, z: 110, s: 1.4, speed: 1.4 },
  { x: 120, z: -110, s: 0.9, speed: 1.8 },
]
const PUFFS: [number, number, number, number][] = [
  [0, 0, 0, 7],
  [7, -1, 2, 5],
  [-7, -1.5, -1, 5.4],
  [3, 2.5, -2, 4.6],
  [-3, 2, 2, 4],
]
function Clouds({ animate }: { animate: boolean }) {
  const env = useContext(EnvCtx)
  const groups = useRef<(THREE.Group | null)[]>([])
  const shadows = useRef<(THREE.Mesh | null)[]>([])
  // Un solo material para todas las nubes y otro para todas las sombras
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#FBF1E8', transparent: true, opacity: 0.82, depthWrite: false }), [])
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({ map: radialTexture(), color: '#43222A', transparent: true, opacity: 0.11, depthWrite: false }), [])
  const puffGeo = useMemo(() => new THREE.SphereGeometry(1, 14, 10), [])
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0
    const day = 1 - env.night
    CLOUDS.forEach((c, i) => {
      const x = ((c.x + t * c.speed + 260) % 520) - 260
      groups.current[i]?.position.set(x, 64, c.z)
      shadows.current[i]?.position.set(x + 10, 0.08, c.z + 6)
    })
    mat.opacity = 0.82 * day
    mat.visible = day > 0.05
    shadowMat.opacity = 0.11 * day
    shadowMat.visible = day > 0.05
  })
  return (
    <group>
      {CLOUDS.map((c, i) => (
        <group key={i}>
          <group
            ref={(el) => {
              groups.current[i] = el
            }}
            scale={c.s}
          >
            {PUFFS.map(([x, y, z, r], j) => (
              <mesh key={j} geometry={puffGeo} material={mat} position={[x, y, z]} scale={[r, r * 0.55, r * 0.8]} />
            ))}
          </group>
          <mesh
            ref={(el) => {
              shadows.current[i] = el
            }}
            material={shadowMat}
            rotation-x={-Math.PI / 2}
            scale={[c.s * 34, c.s * 22, 1]}
            renderOrder={1}
          >
            <planeGeometry args={[1, 1]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ── Elementos interactivos ───────────────────────────────
interface Interactive {
  selected: boolean
  hovered: boolean
  onHover: (v: boolean) => void
  onPick: () => void
}

const pickHandlers = (p: Interactive) => ({
  onClick: (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 8) return
    p.onPick()
  },
  onPointerOver: (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    p.onHover(true)
  },
  onPointerOut: () => p.onHover(false),
})

const shortName = (f: MapFeature) => (f.kind === 'cabana' || f.kind === 'casa' ? f.name.replace(/^(Cabaña|Casa) /, '') : f.name)

function Label({ f, dot, selected, dim, onPick, info, statusLabel, y }: { f: MapFeature; dot?: string; selected: boolean; dim?: boolean; onPick: () => void; info?: UnitInfo; statusLabel?: string; y: number }) {
  const card = useContext(CardCtx)
  return (
    // La entrada está en la misma línea que el estacionamiento: su etiqueta va un poco más arriba para no encimarse
    <Html3D position={[0, y, f.kind === 'entrada' ? -7 : 0]} zIndex={selected ? 9 : 8}>
      <div className={`flex flex-col items-center transition-opacity duration-300 ${dim ? 'opacity-35' : 'opacity-100'}`}>
        <button
          onClick={onPick}
          className={`flex flex-col items-center rounded-[14px] px-3 py-1 text-center whitespace-nowrap shadow-[var(--shadow-1)] transition-transform duration-300 ${selected ? 'scale-110 bg-ink text-paper' : 'bg-surface text-ink ring-1 ring-line'}`}
        >
          <span className="flex items-center gap-1.5 text-[12px] font-semibold">
            {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
            {shortName(f)}
          </span>
          {!selected && (statusLabel || info?.short) && (
            <span className="text-[11px] leading-tight opacity-80">{info?.short ?? statusLabel}</span>
          )}
        </button>
        {selected && card && (info || statusLabel) && (
          <div className="glass mt-2 w-[210px] rounded-[16px] px-3.5 py-3 text-left shadow-[var(--shadow-2)] ring-1 ring-line">
            <p className="heading text-[1.05rem] leading-tight text-ink">{f.name}</p>
            {statusLabel && (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-soft">
                {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
                {statusLabel}
              </p>
            )}
            {info?.guest && <p className="mt-1.5 truncate text-[12px] text-ink">{info.guest}</p>}
            {info?.detail && <p className="truncate text-[11px] text-ink-soft">{info.detail}</p>}
            {info?.cleaning !== undefined && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full" style={{ width: `${Math.round(info.cleaning * 100)}%`, backgroundImage: 'linear-gradient(90deg, var(--sky-3), var(--chispa-soft))' }} />
              </div>
            )}
          </div>
        )}
      </div>
    </Html3D>
  )
}

/** Pin que flota sobre lo seleccionado (sin giros) */
function Pin({ y, color, animate }: { y: number; color: string; animate: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!ref.current) return
    ref.current.position.y = animate ? y + Math.sin(state.clock.elapsedTime * 1.8) * 0.35 : y
  })
  return (
    <group ref={ref} position-y={y}>
      <mesh position-y={1.4}>
        <sphereGeometry args={[0.85, 18, 12]} />
        <meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
      <mesh rotation-x={Math.PI} position-y={0.2}>
        <coneGeometry args={[0.7, 1.6, 14]} />
        <meshLambertMaterial color={color} />
      </mesh>
    </group>
  )
}


/** Alguien limpiando: una figura con escoba junto a la puerta (solo cuando la casa está en limpieza) */
function Cleaner({ x, z, animate }: { x: number; z: number; animate: boolean }) {
  const body = useRef<THREE.Group>(null)
  const broom = useRef<THREE.Group>(null)
  const bubbles = useRef<THREE.Group>(null)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (body.current) body.current.position.y = animate ? Math.abs(Math.sin(t * 3)) * 0.12 : 0
    if (broom.current) broom.current.rotation.z = animate ? Math.sin(t * 4.2) * 0.45 : 0.2
    if (bubbles.current)
      bubbles.current.children.forEach((b, i) => {
        const k = animate ? (t * 0.6 + i / 3) % 1 : 0.4
        b.position.y = 0.6 + k * 2.6
        b.position.x = Math.sin((t + i) * 2) * 0.35
        b.scale.setScalar(0.12 + k * 0.18)
        const m = (b as THREE.Mesh).material as THREE.MeshBasicMaterial
        m.opacity = animate ? 0.85 * (1 - k) : 0.6
      })
  })
  return (
    <group position={[x, 0, z]} scale={1.9}>
      <group ref={body}>
        <mesh position-y={0.95} castShadow>
          <cylinderGeometry args={[0.32, 0.42, 1.3, 12]} />
          <meshLambertMaterial color="#8A4649" />
        </mesh>
        <mesh position-y={1.85} castShadow>
          <sphereGeometry args={[0.3, 14, 10]} />
          <meshLambertMaterial color="#E2B48F" />
        </mesh>
        <mesh position-y={2.08}>
          <sphereGeometry args={[0.31, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshLambertMaterial color="#F3D8BC" />
        </mesh>
      </group>
      <group ref={broom} position={[0.55, 1.3, 0.1]}>
        <mesh position-y={-0.45} rotation-z={0.15}>
          <cylinderGeometry args={[0.05, 0.05, 1.7, 6]} />
          <meshLambertMaterial color="#C8A07E" />
        </mesh>
        <mesh position={[0.12, -1.3, 0]}>
          <boxGeometry args={[0.55, 0.25, 0.22]} />
          <meshLambertMaterial color="#D9B98A" />
        </mesh>
      </group>
      <group ref={bubbles} position={[0.9, 0, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshBasicMaterial color="#F3D8BC" transparent opacity={0.7} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Building({ f, statusRaw, statusDot, statusLabel, occupied, cleaningNow, dim, xray, info, animate, ...p }: Interactive & { f: MapFeature; statusRaw?: string; statusDot?: string; statusLabel?: string; occupied?: boolean; cleaningNow?: boolean; dim?: boolean; xray?: boolean; info?: UnitInfo; animate: boolean }) {
  const env = useContext(EnvCtx)
  const invalidate = useThree((s) => s.invalidate)
  const h = f.height ?? 3
  const wallH = h * (f.roof === 'hip' ? 0.64 : 0.6)
  const roofH = h - wallH + (f.roof === 'hip' ? 0.4 : 0.6)
  const roofGeo = useMemo(() => (f.roof === 'hip' ? hipGeometry(f.w, f.d, roofH) : gableGeometry(f.w, f.d, roofH)), [f.w, f.d, f.roof, roofH])
  const windows = Math.max(1, Math.floor(f.w / 4))
  const lifted = useRef<THREE.Group>(null)
  const active = p.hovered || p.selected
  const lit = occupied || f.kind === 'salon'
  // Un material de ventana por edificio: de noche brilla cálido si hay huéspedes
  const winMat = useMemo(() => new THREE.MeshLambertMaterial({ color: COLORS.window, emissive: COLORS.windowLit, emissiveIntensity: 0 }), [])

  const wallColor = useMemo(() => (dim ? mixHex(COLORS.wall, '#B8AEA6', 0.55) : new THREE.Color(COLORS.wall)), [dim])
  const roofColor = useMemo(() => (dim ? mixHex(ROOF[f.id] ?? '#C98C7E', '#A79C95', 0.65) : new THREE.Color(ROOF[f.id] ?? '#C98C7E')), [dim, f.id])

  useFrame((_, delta) => {
    const g = lifted.current
    if (g) {
      const target = p.selected ? 0.7 : p.hovered ? 0.35 : 0
      const next = g.position.y + (target - g.position.y) * (1 - Math.exp(-delta * 9))
      g.position.y = next
      if (Math.abs(target - next) > 0.004) invalidate()
    }
    winMat.emissiveIntensity = env.night * (lit ? 1.7 : 0.12)
  })

  return (
    <group position={[f.x, 0, f.z]} rotation-y={((f.rot ?? 0) * Math.PI) / 180}>
      {statusRaw && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.05} receiveShadow>
          <planeGeometry args={[f.w + 2.6, f.d + 2.6]} />
          <meshLambertMaterial color={statusRaw} transparent opacity={dim ? 0.25 : p.selected ? 1 : 0.85} />
        </mesh>
      )}
      <group ref={lifted} {...pickHandlers(p)}>
        <mesh position-y={wallH / 2} castShadow={!xray} receiveShadow>
          <boxGeometry args={[f.w, wallH, f.d]} />
          <meshLambertMaterial color={wallColor} transparent={xray} opacity={xray ? 0.16 : 1} depthWrite={!xray} />
        </mesh>
        {/* Con el montaje visible, el techo se oculta y los muros quedan translúcidos */}
        <mesh geometry={roofGeo} position-y={wallH} castShadow={!xray} visible={!xray}>
          <meshLambertMaterial color={roofColor} flatShading />
        </mesh>
        {/* Contorno luminoso (malla duplicada por dentro) */}
        {active && !xray && (
          <group>
            <mesh position-y={wallH / 2} scale={[1.06, 1.04, 1.06]}>
              <boxGeometry args={[f.w, wallH, f.d]} />
              <meshBasicMaterial color={COLORS.outline} side={THREE.BackSide} transparent opacity={p.selected ? 0.95 : 0.6} />
            </mesh>
            <mesh geometry={roofGeo} position-y={wallH - 0.05} scale={[1.05, 1.08, 1.05]}>
              <meshBasicMaterial color={COLORS.outline} side={THREE.BackSide} transparent opacity={p.selected ? 0.95 : 0.6} />
            </mesh>
          </group>
        )}
        {!xray && (
          <>
            <mesh position={[0, 0.95, f.d / 2 + 0.03]}>
              <boxGeometry args={[f.kind === 'salon' ? 3 : 1.1, f.kind === 'salon' ? 2.6 : 1.9, 0.08]} />
              <meshLambertMaterial color={COLORS.door} />
            </mesh>
            {Array.from({ length: windows }).map((_, i) => {
              const x = -f.w / 2 + ((i + 0.5) * f.w) / windows
              if (Math.abs(x) < 1.6) return null
              return (
                <mesh key={i} position={[x, wallH * 0.58, f.d / 2 + 0.03]} material={winMat}>
                  <boxGeometry args={[1.2, 1, 0.08]} />
                </mesh>
              )
            })}
            {/* Ventanas traseras (también se encienden) */}
            {Array.from({ length: windows }).map((_, i) => (
              <mesh key={`b${i}`} position={[-f.w / 2 + ((i + 0.5) * f.w) / windows, wallH * 0.58, -f.d / 2 - 0.03]} material={winMat}>
                <boxGeometry args={[1.2, 1, 0.08]} />
              </mesh>
            ))}
          </>
        )}
      </group>
      {cleaningNow && !dim && <Cleaner x={Math.min(f.w / 2 - 0.4, 2.2)} z={f.d / 2 + 1.6} animate={animate} />}
      {p.selected && <Pin y={h + 3.4} color={statusRaw ?? COLORS.outline} animate={animate} />}
      <Label f={f} dot={statusDot} selected={p.selected} dim={dim} onPick={p.onPick} info={info} statusLabel={statusLabel} y={h + (f.kind === 'salon' ? 2.5 : 2)} />
    </group>
  )
}

// ── Fuente con agua (anillos que se expanden) ────────────
function Fountain({ animate }: { animate: boolean }) {
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const jet = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0.6
    rings.current.forEach((m, i) => {
      if (!m) return
      const k = ((t * 0.45 + i / 3) % 1 + 1) % 1
      m.scale.setScalar(0.25 + k * 1.15)
      ;(m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55
    })
    if (jet.current) jet.current.scale.y = animate ? 1 + Math.sin(t * 3.2) * 0.08 : 1
  })
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el
          }}
          rotation-x={-Math.PI / 2}
          position-y={0.76}
        >
          <ringGeometry args={[1.05, 1.18, 40]} />
          <meshBasicMaterial color="#F4EADF" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={jet} position-y={1.9}>
        <coneGeometry args={[0.22, 1.1, 10, 1, true]} />
        <meshLambertMaterial color="#DCE6EA" transparent opacity={0.55} emissive="#BFD0D8" emissiveIntensity={0.15} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Area({ f, animate, ...p }: Interactive & { f: MapFeature; animate: boolean }) {
  const handlers = pickHandlers(p)
  const highlight = p.selected || p.hovered
  if (f.kind === 'glorieta') {
    return (
      <group position={[f.x, 0, f.z]} {...handlers}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.04} receiveShadow>
          <ringGeometry args={[5, 7, 40]} />
          <meshLambertMaterial color={COLORS.path} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.045}>
          <circleGeometry args={[5, 40]} />
          <meshLambertMaterial color={highlight ? '#CFCFAE' : COLORS.lawnAlt} />
        </mesh>
        <mesh position-y={0.35} castShadow>
          <cylinderGeometry args={[1.8, 2, 0.7, 28]} />
          <meshLambertMaterial color={COLORS.stone} />
        </mesh>
        <mesh position-y={0.72}>
          <cylinderGeometry args={[1.5, 1.5, 0.05, 28]} />
          <meshLambertMaterial color={COLORS.water} emissive={COLORS.water} emissiveIntensity={0.18} />
        </mesh>
        <mesh position-y={1.2} castShadow>
          <cylinderGeometry args={[0.25, 0.35, 1.1, 10]} />
          <meshLambertMaterial color={COLORS.stone} />
        </mesh>
        <Fountain animate={animate} />
        {p.selected && <Label f={f} selected onPick={p.onPick} y={4} />}
      </group>
    )
  }
  if (f.kind === 'parking') {
    const stalls = Math.floor(f.w / 2.8)
    return (
      <group position={[f.x, 0, f.z]} {...handlers}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.03} receiveShadow>
          <planeGeometry args={[f.w, f.d]} />
          <meshLambertMaterial color={highlight ? '#E0D6CE' : COLORS.parking} />
        </mesh>
        {[-f.d / 2 + 2.8, f.d / 2 - 2.8].map((row) =>
          Array.from({ length: stalls + 1 }).map((_, i) => (
            <mesh key={`${row}-${i}`} rotation-x={-Math.PI / 2} position={[-f.w / 2 + 0.8 + i * 2.8, 0.04, row]}>
              <planeGeometry args={[0.15, 4.6]} />
              <meshBasicMaterial color="#F4E7DC" />
            </mesh>
          )),
        )}
        <Label f={f} selected={p.selected} onPick={p.onPick} y={1.5} />
      </group>
    )
  }
  if (f.kind === 'juegos') {
    return (
      <group position={[f.x, 0, f.z]} {...handlers}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.04} scale={[f.w / 2, f.d / 2, 1]} receiveShadow>
          <circleGeometry args={[1, 32]} />
          <meshLambertMaterial color={highlight ? '#EED9B6' : COLORS.sand} />
        </mesh>
        <mesh position={[0, 1.6, 0]} castShadow>
          <coneGeometry args={[3, 1.4, 6]} />
          <meshLambertMaterial color="#C98C7E" flatShading />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 1.1, 6]} />
          <meshLambertMaterial color={COLORS.trunk} />
        </mesh>
        {p.selected && <Label f={f} selected onPick={p.onPick} y={3.5} />}
      </group>
    )
  }
  if (f.kind === 'entrada') {
    return (
      <group position={[f.x, 0, f.z]} {...handlers}>
        {[-f.d / 2, f.d / 2].map((z) => (
          <mesh key={z} position={[0, 1.6, z]} castShadow>
            <boxGeometry args={[0.8, 3.2, 0.8]} />
            <meshLambertMaterial color="#E4D3C2" />
          </mesh>
        ))}
        <mesh position={[0, 3.4, 0]} castShadow>
          <boxGeometry args={[0.9, 0.5, f.d + 0.8]} />
          <meshLambertMaterial color="#A9645F" />
        </mesh>
        <Label f={f} selected={p.selected} onPick={p.onPick} y={5} />
      </group>
    )
  }
  const isEventLawn = f.kind === 'jardin'
  return (
    <group position={[f.x, 0, f.z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow {...handlers}>
        <planeGeometry args={[f.w, f.d]} />
        <meshLambertMaterial color={highlight ? '#C6C8A2' : isEventLawn ? COLORS.lawn : COLORS.lawnAlt} />
      </mesh>
      {isEventLawn && <Label f={f} dot={TONE.sage.hex} selected={p.selected} onPick={p.onPick} y={1.5} />}
    </group>
  )
}

// ── Montaje del evento en 3D (event.layout en metros) ────
function EventSetup({ event }: { event: RanchEvent }) {
  const feature = FEATURES.find((f) => f.id === (event.venue === 'salon' ? 'salon' : 'jardin'))!
  const space = VENUE_SPACES[event.venue]
  const ox = feature.x - space.w / 2
  const oz = feature.z - space.h / 2
  const floorY = event.venue === 'salon' ? 0.06 : 0.04
  const roundRef = useRef<THREE.InstancedMesh>(null)
  const rectRef = useRef<THREE.InstancedMesh>(null)
  const chairRef = useRef<THREE.InstancedMesh>(null)

  const { rounds, rects, chairs, others } = useMemo(() => {
    const rounds: FloorItem[] = []
    const rects: FloorItem[] = []
    const others: FloorItem[] = []
    const chairs: { x: number; z: number; rot: number }[] = []
    for (const it of event.layout) {
      const spec = ITEM_SPECS[it.type]
      const x = ox + it.x
      const z = oz + it.y
      const rot = -((it.rot || 0) * Math.PI) / 180
      if (it.type === 'mesa-redonda' || it.type === 'periquera') {
        rounds.push(it)
        if (it.type === 'mesa-redonda') {
          const n = it.seats ?? spec.seats ?? 10
          const r = (spec.w / 2) + 0.5
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2
            chairs.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, rot: -a + Math.PI / 2 })
          }
        }
      } else if (it.type === 'mesa-rectangular' || it.type === 'mesa-imperial' || it.type === 'mesa-principal') {
        rects.push(it)
        const w = it.w ?? spec.w
        const h = it.h ?? spec.h
        const n = it.seats ?? spec.seats ?? 8
        const perSide = it.type === 'mesa-principal' ? n : Math.ceil(n / 2)
        const sides = it.type === 'mesa-principal' ? [1] : [-1, 1]
        for (const side of sides) {
          for (let i = 0; i < perSide; i++) {
            const lx = -w / 2 + ((i + 0.5) * w) / perSide
            const lz = side * (h / 2 + 0.45)
            const cx = Math.cos(rot) * lx - Math.sin(rot) * lz
            const cz = Math.sin(rot) * lx + Math.cos(rot) * lz
            chairs.push({ x: x + cx, z: z + cz, rot: rot + (side > 0 ? Math.PI : 0) })
          }
        }
      } else if (it.type === 'sillas-ceremonia') {
        const w = it.w ?? spec.w
        const h = it.h ?? spec.h
        const cols = Math.max(1, Math.floor(w / 0.6))
        const rows = Math.max(1, Math.floor(h / 0.95))
        const max = Math.min(it.seats ?? cols * rows, cols * rows)
        for (let k = 0; k < max; k++) {
          const cI = k % cols
          const rI = Math.floor(k / cols)
          chairs.push({ x: x - w / 2 + (cI + 0.5) * (w / cols), z: z - h / 2 + (rI + 0.5) * (h / rows), rot: Math.PI })
        }
      } else others.push(it)
    }
    return { rounds, rects, chairs, others }
  }, [event.layout, ox, oz])

  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    rounds.forEach((it, i) => {
      const spec = ITEM_SPECS[it.type]
      const tall = it.type === 'periquera'
      o.position.set(ox + it.x, floorY + (tall ? 0.55 : 0.38), oz + it.y)
      o.rotation.set(0, 0, 0)
      o.scale.set(spec.w / 2, tall ? 1.45 : 1, spec.w / 2)
      o.updateMatrix()
      roundRef.current?.setMatrixAt(i, o.matrix)
    })
    rects.forEach((it, i) => {
      const spec = ITEM_SPECS[it.type]
      o.position.set(ox + it.x, floorY + 0.38, oz + it.y)
      o.rotation.set(0, -((it.rot || 0) * Math.PI) / 180, 0)
      o.scale.set(it.w ?? spec.w, 0.76, it.h ?? spec.h)
      o.updateMatrix()
      rectRef.current?.setMatrixAt(i, o.matrix)
    })
    chairs.forEach((c, i) => {
      o.position.set(c.x, floorY + 0.42, c.z)
      o.rotation.set(0, c.rot, 0)
      o.scale.set(1, 1, 1)
      o.updateMatrix()
      chairRef.current?.setMatrixAt(i, o.matrix)
    })
    for (const m of [roundRef.current, rectRef.current, chairRef.current]) if (m) m.instanceMatrix.needsUpdate = true
  }, [rounds, rects, chairs, ox, oz, floorY])

  const OTHER_COLOR: Partial<Record<FloorItem['type'], string>> = { pista: '#E7D3AE', escenario: '#A9645F', dj: '#6E5560', buffet: '#C9A27E', barra: '#8C6A58', pastel: '#F3D8BC', regalos: '#D49F8D', photobooth: '#8C8B63', lounge: '#B7B98F' }
  const OTHER_H: Partial<Record<FloorItem['type'], number>> = { pista: 0.06, escenario: 0.55, dj: 1.1, buffet: 0.9, barra: 1.1, pastel: 1, regalos: 0.8, photobooth: 2.2, lounge: 0.5 }
  const tables = rounds.length + rects.length
  const seats = chairs.length

  return (
    <group>
      {/* Mantel para delimitar el área del montaje */}
      <mesh rotation-x={-Math.PI / 2} position={[feature.x, floorY - 0.01, feature.z]} renderOrder={1}>
        <planeGeometry args={[space.w, space.h]} />
        <meshBasicMaterial color="#F3D8BC" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <instancedMesh args={[undefined, undefined, Math.max(1, rounds.length)]} ref={roundRef} castShadow receiveShadow visible={rounds.length > 0}>
        <cylinderGeometry args={[1, 1.06, 0.76, 22]} />
        <meshLambertMaterial color={COLORS.cloth} />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, Math.max(1, rects.length)]} ref={rectRef} castShadow receiveShadow visible={rects.length > 0}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color={COLORS.cloth} />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, Math.max(1, chairs.length)]} ref={chairRef} castShadow visible={chairs.length > 0}>
        <boxGeometry args={[0.42, 0.84, 0.42]} />
        <meshLambertMaterial color={COLORS.chair} />
      </instancedMesh>
      {others.map((it) => {
        const spec = ITEM_SPECS[it.type]
        const w = it.w ?? spec.w
        const h = it.h ?? spec.h
        const ht = OTHER_H[it.type] ?? 0.8
        const round = spec.shape === 'circle'
        return (
          <mesh key={it.id} position={[ox + it.x, floorY + ht / 2, oz + it.y]} rotation-y={-((it.rot || 0) * Math.PI) / 180} castShadow={it.type !== 'pista'} receiveShadow>
            {round ? <cylinderGeometry args={[w / 2, w / 2, ht, 20]} /> : <boxGeometry args={[w, ht, h]} />}
            <meshLambertMaterial color={OTHER_COLOR[it.type] ?? '#C9A27E'} emissive={it.type === 'pista' ? '#F3D8BC' : '#000000'} emissiveIntensity={it.type === 'pista' ? 0.12 : 0} />
          </mesh>
        )
      })}
      <Html3D position={[feature.x, event.venue === "salon" ? 9.5 : 4, feature.z - space.h / 2 - 1]} zIndex={9} style={{ pointerEvents: 'none' }}>
        <div className="glass rounded-full px-3.5 py-1.5 text-[11px] whitespace-nowrap text-ink shadow-[var(--shadow-1)] ring-1 ring-line">
          <span className="mr-1.5 text-chispa-soft">✦</span>
          Montaje · {event.title} · {tables} mesas · {seats} sillas
        </div>
      </Html3D>
    </group>
  )
}

// ── Cámara: entrada cinemática, vuelo al elemento, brújula ──
function CameraRig({ selectedId, reducedMotion, resetKey, touring, onAzimuth, focusShiftPx = 0, focusShiftYPx = 0 }: { selectedId?: string | null; reducedMotion?: boolean; resetKey?: number; touring?: boolean; onAzimuth?: (rad: number) => void; focusShiftPx?: number; focusShiftYPx?: number }) {
  const ref = useRef<Controls>(null)
  const first = useRef(true)
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const height = useThree((s) => s.size.height)
  const camera = useThree((s) => s.camera)
  const OVERVIEW = aspect < 0.85 ? OVERVIEW_TALL : OVERVIEW_WIDE

  // Entrada: la cámara desciende desde arriba
  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (reducedMotion) {
      if (!selectedId) void c.setLookAt(...OVERVIEW, false)
      return
    }
    // Se abrió el mapa con una casa ya elegida (enlace o regreso): la cámara va directo a ella
    if (selectedId) return
    void c.setLookAt(0, 330, 34, 0, 0, 4, false)
    c.smoothTime = 1.35
    const t1 = setTimeout(() => void c.setLookAt(...OVERVIEW, true), 120)
    const t2 = setTimeout(() => (c.smoothTime = 0.55), 2400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (first.current) {
      first.current = false
      if (!selectedId) return
    }
    c.smoothTime = touring ? 1 : 0.55
    const animate = !reducedMotion
    const f = selectedId ? FEATURES.find((x) => x.id === selectedId) : undefined
    if (f) {
      const size = Math.max(f.w, f.d)
      // Con poco lienzo libre (tablet con ficha abierta) la cámara se aleja para que se vea la casa completa
      const freeW = aspect * height - Math.abs(focusShiftPx)
      const dist = Math.max(20, size * 1.3) * Math.min(2.4, Math.max(1, 720 / Math.max(1, freeW)))
      void c.setLookAt(f.x + dist * 0.28, dist * 1.15 + (f.height ?? 0), f.z + dist * 0.85, f.x, 0, f.z, animate)
      // Un panel tapa parte del lienzo: se recorre la vista para que la casa quede al centro de lo visible
      const fov = ((camera as THREE.PerspectiveCamera).fov ?? 45) * (Math.PI / 180)
      const range = Math.hypot(dist * 0.28, dist * 1.15 + (f.height ?? 0), dist * 0.85)
      const perPx = (2 * range * Math.tan(fov / 2)) / Math.max(1, height)
      void c.setFocalOffset((focusShiftPx / 2) * perPx, (focusShiftYPx / 2) * perPx, 0, animate)
    } else {
      void c.setLookAt(...OVERVIEW, animate)
      void c.setFocalOffset(0, 0, 0, animate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, reducedMotion, resetKey, touring, focusShiftPx, focusShiftYPx])

  // Brújula: avisa el azimut (limitado a un aviso por cuadro)
  useEffect(() => {
    const c = ref.current
    if (!c || !onAzimuth) return
    let raf = 0
    const h = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => onAzimuth(c.azimuthAngle))
    }
    c.addEventListener('update', h)
    h()
    return () => {
      cancelAnimationFrame(raf)
      c.removeEventListener('update', h)
    }
  }, [onAzimuth])

  return <CameraControls ref={ref} makeDefault smoothTime={0.55} minPolarAngle={0.08} maxPolarAngle={Math.PI / 2.3} minDistance={12} maxDistance={300} dollyToCursor />
}

export default function RanchScene3D({ units, selectedId, onSelect, reducedMotion, resetKey, timeMode = 'ahora', statusFilter, unitInfo, setupEvent, showSetup, touring, onAzimuth, focusShiftPx, focusShiftYPx, selectedCard = true }: RanchScene3DProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const env = useRef({ night: 0, golden: 0 }).current
  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units])
  const animate = !reducedMotion
  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered])

  const interactive = (f: MapFeature): Interactive => ({
    selected: selectedId === f.id,
    hovered: hovered === f.id,
    onHover: (v) => setHovered((h) => (v ? f.id : h === f.id ? null : h)),
    onPick: () => onSelect(selectedId === f.id ? null : f.id),
  })

  const areas = FEATURES.filter((f) => !['cabana', 'casa', 'salon', 'bodega'].includes(f.kind))
  const buildings = FEATURES.filter((f) => ['cabana', 'casa', 'salon', 'bodega'].includes(f.kind))
  const setup = showSetup && setupEvent && setupEvent.layout.length > 0 ? setupEvent : null

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.75]}
      shadows
      camera={{ fov: 38, near: 1, far: 1000, position: [0, 330, 34] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => !touring && onSelect(null)}
      className="touch-none"
    >
      <EnvCtx.Provider value={env}>
      <CardCtx.Provider value={selectedCard}>
        <PhaseController mode={timeMode} env={env} />
        <AmbientTicker enabled={animate} />
        <Ground />
        {areas.map((f) => (
          <Area key={f.id} f={f} animate={animate} {...interactive(f)} />
        ))}
        <Paths />
        <Lamps />
        <TreeLayer kind="cypress" />
        <TreeLayer kind="palm" />
        <TreeLayer kind="round" />
        <Clouds animate={animate} />
        {buildings.map((f) => {
          const u = f.unitId ? unitById[f.unitId] : undefined
          const st = u ? UNIT_STATUS[u.status] : undefined
          const dim = !!statusFilter && (!u || u.status !== statusFilter)
          return (
            <Building
              key={f.id}
              f={f}
              statusRaw={st ? TONE[st.tone].raw : f.kind === 'salon' ? '#D49F8D' : undefined}
              statusDot={st ? TONE[st.tone].hex : f.kind === 'salon' ? 'var(--matiz)' : undefined}
              statusLabel={st?.label}
              occupied={u?.status === 'ocupada'}
              cleaningNow={u?.status === 'limpiando'}
              dim={dim}
              xray={!!setup && setup.venue === 'salon' && f.kind === 'salon'}
              info={u ? unitInfo?.[u.id] : undefined}
              animate={animate}
              {...interactive(f)}
            />
          )
        })}
        {setup && <EventSetup event={setup} />}
        <CameraRig selectedId={selectedId} reducedMotion={reducedMotion} resetKey={resetKey} touring={touring} onAzimuth={onAzimuth} focusShiftPx={focusShiftPx} focusShiftYPx={focusShiftYPx} />
      </CardCtx.Provider>
      </EnvCtx.Provider>
    </Canvas>
  )
}

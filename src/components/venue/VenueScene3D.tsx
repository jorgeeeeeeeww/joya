// Montaje 3D de un evento: el salón o el jardín con las piezas del plano de mesas (metros reales).
// Pensado para tablet: render bajo demanda, sillas instanciadas, una luz direccional cálida.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { Html3D } from '@/components/map/Html3D'
import * as THREE from 'three'
import type { FloorItem, Venue } from '@/lib/types'
import { ITEM_SPECS } from '@/lib/floorplan'
import { VENUE_SPACES } from '@/lib/layout'

// Colores fijos de la atmósfera Flor (three.js no lee variables CSS)
const C = {
  floorSalon: '#E7D6C6',
  floorLine: '#D9C4B1',
  wall: '#F6ECE3',
  lawn: '#A7AE86',
  lawnDark: '#959C76',
  path: '#E6D3B6',
  water: '#8FB0AA',
  stone: '#D8C7B2',
  cloth: '#FBF5EE',
  clothShadow: '#EBDDD0',
  chair: '#D6BE93',
  stage: '#C9A68A',
  floorDance: '#F2E2C8',
  dark: '#5A3A3E',
  wood: '#B99274',
  palm: '#7F8A62',
  trunk: '#9C8063',
  cypress: '#6F7A58',
  bulb: '#FFE3B0',
  selected: '#B04D3D',
}

const toRad = (deg: number) => (deg * Math.PI) / 180

interface Props {
  venue: Venue
  layout: FloorItem[]
  palette?: string[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  showNumbers?: boolean
  /** La cámara se sienta en esta mesa, a la altura de los ojos, mirando al foco del evento */
  viewFromId?: string | null
  /** Recorrido automático a la altura de una persona */
  tour?: boolean
}

/** Punto al que mira todo el evento: pista, escenario, arco o el centro */
function focalPoint(layout: FloorItem[], W: number, H: number): [number, number, number] {
  const f = layout.find((i) => i.type === 'arco') ?? layout.find((i) => i.type === 'pista') ?? layout.find((i) => i.type === 'escenario') ?? layout.find((i) => i.type === 'tarima')
  return f ? [f.x - W / 2, 1, f.y - H / 2] : [0, 0.8, 0]
}

function CameraRig({ layout, W, H, span, viewFromId, tour }: { layout: FloorItem[]; W: number; H: number; span: number; viewFromId?: string | null; tour?: boolean }) {
  const ref = useRef<CameraControls>(null)
  const angle = useRef(0)
  const focal = useMemo(() => focalPoint(layout, W, H), [layout, W, H])
  // Vista general / vista desde la mesa
  useEffect(() => {
    const c = ref.current
    if (!c || tour) return
    const it = viewFromId ? layout.find((i) => i.id === viewFromId) : undefined
    if (!it) {
      void c.setLookAt(span * 0.38, span * 0.42, span * 0.56, 0, 0, 0, true)
      return
    }
    const x = it.x - W / 2
    const z = it.y - H / 2
    // Se coloca del lado opuesto al foco, como un invitado sentado viendo hacia la pista o el altar
    const dx = x - focal[0]
    const dz = z - focal[2]
    const len = Math.hypot(dx, dz) || 1
    const back = (Math.max(it.w ?? ITEM_SPECS[it.type].w, it.h ?? ITEM_SPECS[it.type].h) / 2) + 0.55
    void c.setLookAt(x + (dx / len) * back, 1.2, z + (dz / len) * back, focal[0], focal[1], focal[2], true)
  }, [viewFromId, tour, layout, W, H, span, focal])
  // Recorrido: gira lentamente alrededor del foco a la altura de una persona
  useFrame((_, delta) => {
    const c = ref.current
    if (!tour || !c) return
    angle.current += delta * 0.12
    const r = span * 0.28
    void c.setLookAt(focal[0] + Math.cos(angle.current) * r, 1.7, focal[2] + Math.sin(angle.current) * r, focal[0], 1, focal[2], false)
  })
  return <CameraControls ref={ref} makeDefault minDistance={1.5} maxDistance={span * 2.2} maxPolarAngle={Math.PI / 2.05} smoothTime={0.6} draggingSmoothTime={0.15} />
}

/** Posiciones de sillas alrededor de una pieza (coordenadas locales de la pieza) */
function chairSlots(it: FloorItem): { x: number; z: number; ry: number }[] {
  const s = ITEM_SPECS[it.type]
  const n = it.seats ?? 0
  if (!n || !s.isTable) return []
  if (s.shape === 'circle') {
    const r = (it.w ?? s.w) / 2 + 0.42
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, ry: -a - Math.PI / 2 }
    })
  }
  const w = it.w ?? s.w
  const d = it.h ?? s.h
  if (s.shape === 'half') {
    // Media luna: lado recto hacia -z, sillas repartidas en el arco
    const r = w / 2 + 0.42
    return Array.from({ length: n }, (_, i) => {
      const a = Math.PI * ((i + 0.5) / n)
      return { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.95, ry: -a - Math.PI / 2 }
    })
  }
  if (it.type === 'mesa-cuadrada') {
    const out: { x: number; z: number; ry: number }[] = []
    const per = Math.max(1, Math.ceil(n / 4))
    const sides = [
      { nx: 0, nz: 1, ry: Math.PI },
      { nx: 0, nz: -1, ry: 0 },
      { nx: 1, nz: 0, ry: -Math.PI / 2 },
      { nx: -1, nz: 0, ry: Math.PI / 2 },
    ]
    for (const sd of sides)
      for (let i = 0; i < per && out.length < n; i++) {
        const t = -0.5 + (i + 0.5) / per
        out.push({ x: sd.nx ? sd.nx * (w / 2 + 0.4) : t * w, z: sd.nz ? sd.nz * (d / 2 + 0.4) : t * d, ry: sd.ry })
      }
    return out
  }
  const oneSide = it.type === 'mesa-principal' || it.type === 'mesa-novios'
  const perSide = oneSide ? n : Math.ceil(n / 2)
  const out: { x: number; z: number; ry: number }[] = []
  for (let i = 0; i < perSide; i++) {
    const x = -w / 2 + (w / perSide) * (i + 0.5)
    out.push({ x, z: d / 2 + 0.4, ry: Math.PI })
    if (!oneSide && out.length < n) out.push({ x, z: -d / 2 - 0.4, ry: 0 })
  }
  return out.slice(0, n)
}

/** Todas las sillas (mesas + bloques de ceremonia) en coordenadas del mundo */
function useChairMatrices(layout: FloorItem[], W: number, H: number) {
  return useMemo(() => {
    const m4: THREE.Matrix4[] = []
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const push = (wx: number, wz: number, ry: number) => {
      e.set(0, ry, 0)
      q.setFromEuler(e)
      m4.push(new THREE.Matrix4().compose(new THREE.Vector3(wx, 0, wz), q, new THREE.Vector3(1, 1, 1)))
    }
    for (const it of layout) {
      const cx = it.x - W / 2
      const cz = it.y - H / 2
      const rot = -toRad(it.rot)
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)
      if (it.type === 'sillas-ceremonia') {
        const w = it.w ?? ITEM_SPECS[it.type].w
        const d = it.h ?? ITEM_SPECS[it.type].h
        const cols = Math.max(1, Math.floor(w / 0.55))
        const rows = Math.max(1, Math.ceil((it.seats ?? 0) / cols))
        let placed = 0
        for (let r = 0; r < rows && placed < (it.seats ?? 0); r++)
          for (let c = 0; c < cols && placed < (it.seats ?? 0); c++, placed++) {
            const lx = -w / 2 + (w / cols) * (c + 0.5)
            const lz = -d / 2 + Math.min(d / rows, 0.95) * (r + 0.5)
            push(cx + lx * cos + lz * sin, cz - lx * sin + lz * cos, rot + Math.PI)
          }
        continue
      }
      for (const s of chairSlots(it)) push(cx + s.x * cos + s.z * sin, cz - s.x * sin + s.z * cos, rot + s.ry)
    }
    return m4
  }, [layout, W, H])
}

function Chairs({ matrices }: { matrices: THREE.Matrix4[] }) {
  const seat = useRef<THREE.InstancedMesh>(null)
  const back = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const offsetBack = new THREE.Matrix4().makeTranslation(0, 0.72, 0.19)
    const offsetSeat = new THREE.Matrix4().makeTranslation(0, 0.45, 0)
    const tmp = new THREE.Matrix4()
    matrices.forEach((m, i) => {
      seat.current?.setMatrixAt(i, tmp.multiplyMatrices(m, offsetSeat))
      back.current?.setMatrixAt(i, tmp.multiplyMatrices(m, offsetBack))
    })
    if (seat.current) seat.current.instanceMatrix.needsUpdate = true
    if (back.current) back.current.instanceMatrix.needsUpdate = true
  }, [matrices])
  if (!matrices.length) return null
  return (
    <>
      <instancedMesh ref={seat} args={[undefined, undefined, matrices.length]} castShadow>
        <boxGeometry args={[0.42, 0.05, 0.42]} />
        <meshLambertMaterial color={C.chair} />
      </instancedMesh>
      <instancedMesh ref={back} args={[undefined, undefined, matrices.length]} castShadow>
        <boxGeometry args={[0.42, 0.5, 0.04]} />
        <meshLambertMaterial color={C.chair} />
      </instancedMesh>
    </>
  )
}

function Piece({ it, W, H, palette, selected, onSelect, showNumbers }: { it: FloorItem; W: number; H: number; palette?: string[]; selected: boolean; onSelect?: (id: string) => void; showNumbers?: boolean }) {
  const s = ITEM_SPECS[it.type]
  const w = it.w ?? s.w
  const d = it.h ?? s.h
  const pos: [number, number, number] = [it.x - W / 2, 0, it.y - H / 2]
  const accent = palette?.[0] ?? '#D49F8D'
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect?.(it.id)
  }
  const ring = selected ? (
    <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
      <ringGeometry args={[Math.max(w, d) / 2 + 0.7, Math.max(w, d) / 2 + 0.85, 48]} />
      <meshBasicMaterial color={C.selected} transparent opacity={0.85} />
    </mesh>
  ) : null

  let body: React.ReactNode = null
  switch (it.type) {
    case 'mesa-redonda':
    case 'periquera': {
      const tall = it.type === 'periquera'
      const r = w / 2
      const h = tall ? 1.08 : 0.76
      body = (
        <>
          <mesh position-y={h / 2} castShadow receiveShadow>
            <cylinderGeometry args={[r + 0.04, r + 0.16, h, 32]} />
            <meshLambertMaterial color={it.color ?? C.cloth} />
          </mesh>
          <mesh position-y={h + 0.012}>
            <cylinderGeometry args={[r + 0.05, r + 0.05, 0.025, 32]} />
            <meshLambertMaterial color={C.clothShadow} />
          </mesh>
          {!tall && (
            <mesh position-y={h + 0.16} castShadow>
              <sphereGeometry args={[0.16, 16, 12]} />
              <meshLambertMaterial color={accent} />
            </mesh>
          )}
        </>
      )
      break
    }
    case 'mesa-rectangular':
    case 'mesa-imperial':
    case 'mesa-principal':
    case 'mesa-cuadrada':
    case 'mesa-novios':
    case 'mesa-dulces':
    case 'buffet':
    case 'barra':
    case 'regalos': {
      const h = it.type === 'barra' ? 1.05 : 0.76
      const cloth = it.type === 'barra' ? C.wood : it.color ?? C.cloth
      body = (
        <>
          <mesh position-y={h / 2} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshLambertMaterial color={cloth} />
          </mesh>
          {(it.type === 'mesa-imperial' || it.type === 'mesa-principal') &&
            Array.from({ length: Math.max(2, Math.round(w / 1.6)) }, (_, i) => (
              <mesh key={i} position={[-w / 2 + (w / Math.max(2, Math.round(w / 1.6))) * (i + 0.5), h + 0.14, 0]} castShadow>
                <sphereGeometry args={[0.13, 14, 10]} />
                <meshLambertMaterial color={palette?.[i % (palette.length || 1)] ?? accent} />
              </mesh>
            ))}
          {it.type === 'mesa-dulces' &&
            Array.from({ length: 7 }, (_, i) => (
              <mesh key={i} position={[-w / 2 + 0.25 + i * ((w - 0.5) / 6), h + 0.12 + (i % 2) * 0.08, (i % 3) * 0.12 - 0.12]} castShadow>
                <cylinderGeometry args={[0.1, 0.12, 0.24 + (i % 2) * 0.16, 12]} />
                <meshLambertMaterial color={palette?.[i % (palette.length || 1)] ?? accent} />
              </mesh>
            ))}
          {it.type === 'mesa-novios' && (
            <mesh position={[0, h + 0.22, 0]} castShadow>
              <sphereGeometry args={[0.22, 16, 12]} />
              <meshLambertMaterial color={accent} />
            </mesh>
          )}
          {it.type === 'mesa-principal' && (
            <mesh position={[0, h + 0.01, d / 2 - 0.05]}>
              <boxGeometry args={[w, 0.02, 0.12]} />
              <meshLambertMaterial color={accent} />
            </mesh>
          )}
        </>
      )
      break
    }
    case 'mesa-media-luna':
      body = (
        <>
          <mesh position-y={0.38} castShadow receiveShadow>
            <cylinderGeometry args={[w / 2 + 0.04, w / 2 + 0.14, 0.76, 32, 1, false, 0, Math.PI]} />
            <meshLambertMaterial color={it.color ?? C.cloth} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.38, 0]} rotation-y={Math.PI / 2}>
            <planeGeometry args={[w + 0.2, 0.76]} />
            <meshLambertMaterial color={it.color ?? C.cloth} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.92, w / 5]} castShadow>
            <sphereGeometry args={[0.15, 14, 10]} />
            <meshLambertMaterial color={accent} />
          </mesh>
        </>
      )
      break
    case 'carpa': {
      const hh = 3.2
      body = (
        <>
          {[
            [-w / 2, -d / 2],
            [w / 2, -d / 2],
            [-w / 2, d / 2],
            [w / 2, d / 2],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x!, hh / 2, z!]} castShadow>
              <cylinderGeometry args={[0.06, 0.06, hh, 8]} />
              <meshLambertMaterial color={C.wall} />
            </mesh>
          ))}
          <mesh position-y={hh + 0.9} scale={[w / 2, 1, d / 2]} rotation-y={Math.PI / 4}>
            <coneGeometry args={[1.42, 1.8, 4, 1, true]} />
            <meshLambertMaterial color={C.wall} transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </>
      )
      break
    }
    case 'arco':
      body = (
        <>
          <mesh position-y={1.3} rotation-y={0} castShadow>
            <torusGeometry args={[w / 2 - 0.1, 0.07, 10, 40, Math.PI]} />
            <meshLambertMaterial color={C.wood} />
          </mesh>
          {[-w / 2 + 0.1, w / 2 - 0.1].map((x) => (
            <mesh key={x} position={[x, 0.65, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 1.3, 8]} />
              <meshLambertMaterial color={C.wood} />
            </mesh>
          ))}
          {Array.from({ length: 11 }, (_, i) => {
            const a = (i / 10) * Math.PI
            return (
              <mesh key={i} position={[Math.cos(a) * (w / 2 - 0.1), 1.3 + Math.sin(a) * (w / 2 - 0.1), 0]} castShadow>
                <sphereGeometry args={[0.16 + (i % 3) * 0.04, 10, 8]} />
                <meshLambertMaterial color={palette?.[i % (palette.length || 1)] ?? (i % 2 ? '#E7C6C0' : '#F6ECE3')} />
              </mesh>
            )
          })}
        </>
      )
      break
    case 'tarima':
      body = (
        <mesh position-y={0.2} castShadow receiveShadow>
          <boxGeometry args={[w, 0.4, d]} />
          <meshLambertMaterial color={C.stage} />
        </mesh>
      )
      break
    case 'letrero':
      body = (
        <>
          <mesh position={[0, 1.6, 0]}>
            <boxGeometry args={[w, 0.32, 0.05]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.8, -0.05]}>
            <boxGeometry args={[0.05, 1.6, 0.05]} />
            <meshLambertMaterial color={C.dark} />
          </mesh>
        </>
      )
      break
    case 'pasillo':
      body = (
        <mesh position-y={0.015} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshLambertMaterial color={it.color ?? '#F6ECE3'} />
        </mesh>
      )
      break
    case 'planta':
      body = (
        <>
          <mesh position-y={0.25} castShadow>
            <cylinderGeometry args={[0.22, 0.17, 0.5, 14]} />
            <meshLambertMaterial color={C.stage} />
          </mesh>
          <mesh position-y={0.85} castShadow>
            <sphereGeometry args={[0.42, 14, 10]} />
            <meshLambertMaterial color={C.palm} />
          </mesh>
          <mesh position={[0.15, 1.05, 0.1]} castShadow>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshLambertMaterial color={accent} />
          </mesh>
        </>
      )
      break
    case 'pista':
      body = (
        <mesh position-y={0.03} receiveShadow>
          <boxGeometry args={[w, 0.06, d]} />
          <meshStandardMaterial color={C.floorDance} emissive={C.bulb} emissiveIntensity={0.08} roughness={0.35} />
        </mesh>
      )
      break
    case 'escenario':
      body = (
        <mesh position-y={0.3} castShadow receiveShadow>
          <boxGeometry args={[w, 0.6, d]} />
          <meshLambertMaterial color={C.stage} />
        </mesh>
      )
      break
    case 'dj':
      body = (
        <>
          <mesh position-y={0.5} castShadow>
            <boxGeometry args={[w, 1, d]} />
            <meshLambertMaterial color={C.dark} />
          </mesh>
          <mesh position={[0, 1.02, 0]}>
            <boxGeometry args={[w * 0.8, 0.04, d * 0.6]} />
            <meshStandardMaterial color={C.dark} emissive={C.bulb} emissiveIntensity={0.6} />
          </mesh>
        </>
      )
      break
    case 'pastel':
      body = (
        <>
          <mesh position-y={0.38} castShadow>
            <cylinderGeometry args={[w / 2, w / 2, 0.76, 24]} />
            <meshLambertMaterial color={C.cloth} />
          </mesh>
          {[0.3, 0.22, 0.15].map((r, i) => (
            <mesh key={i} position-y={0.86 + i * 0.16} castShadow>
              <cylinderGeometry args={[r, r, 0.16, 24]} />
              <meshLambertMaterial color={i % 2 ? accent : C.cloth} />
            </mesh>
          ))}
        </>
      )
      break
    case 'photobooth':
      body = (
        <>
          {[-w / 2, w / 2].map((x) => (
            <mesh key={x} position={[x, 1.1, 0]} castShadow>
              <boxGeometry args={[0.08, 2.2, 0.08]} />
              <meshLambertMaterial color={C.wood} />
            </mesh>
          ))}
          <mesh position={[0, 2.2, 0]}>
            <boxGeometry args={[w, 0.08, 0.08]} />
            <meshLambertMaterial color={C.wood} />
          </mesh>
          <mesh position={[0, 1.1, -0.05]}>
            <planeGeometry args={[w - 0.1, 2]} />
            <meshLambertMaterial color={accent} side={THREE.DoubleSide} />
          </mesh>
        </>
      )
      break
    case 'lounge':
      body = (
        <>
          {[
            [0, -w / 2 + 0.4, 0],
            [-w / 2 + 0.4, 0, Math.PI / 2],
            [w / 2 - 0.4, 0, -Math.PI / 2],
          ].map(([x, z, r], i) => (
            <mesh key={i} position={[x, 0.25, z]} rotation-y={r} castShadow>
              <boxGeometry args={[w * 0.8, 0.5, 0.7]} />
              <meshLambertMaterial color={C.cloth} />
            </mesh>
          ))}
          <mesh position-y={0.2}>
            <cylinderGeometry args={[0.45, 0.45, 0.4, 20]} />
            <meshLambertMaterial color={C.wood} />
          </mesh>
        </>
      )
      break
    case 'sillas-ceremonia':
      body = (
        <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color={C.path} transparent opacity={0.35} />
        </mesh>
      )
      break
  }

  return (
    <group position={pos} rotation-y={-toRad(it.rot)} onClick={click}>
      {body}
      {ring}
      {showNumbers && it.number && s.isTable && (
        <Html3D position={[0, it.type === 'periquera' ? 1.6 : 1.3, 0]} zIndex={10} style={{ pointerEvents: 'none' }}>
          <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-medium shadow-sm ${selected ? 'bg-[#B04D3D] text-white' : 'bg-white/90 text-[#43222A]'}`}>{it.number}</span>
        </Html3D>
      )}
    </group>
  )
}

/** Luces colgantes en catenaria sobre la pista (emisivas, sin costo de iluminación) */
function StringLights({ layout, W, H }: { layout: FloorItem[]; W: number; H: number }) {
  const pista = layout.find((i) => i.type === 'pista')
  const bulbs = useMemo(() => {
    const out: [number, number, number][] = []
    const cx = pista ? pista.x - W / 2 : 0
    const cz = pista ? pista.y - H / 2 : 0
    const span = pista ? Math.max(pista.w ?? 8, pista.h ?? 8) + 6 : 14
    for (let line = 0; line < 4; line++) {
      const a = (line / 4) * Math.PI
      for (let k = 0; k <= 14; k++) {
        const t = k / 14 - 0.5
        out.push([cx + Math.cos(a) * t * span, 3.6 - (1 - (2 * t) ** 2) * 0.7, cz + Math.sin(a) * t * span])
      }
    }
    return out
  }, [pista, W, H])
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    bulbs.forEach((p, i) => ref.current?.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2])))
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [bulbs])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, bulbs.length]}>
      <sphereGeometry args={[0.07, 8, 6]} />
      <meshBasicMaterial color={C.bulb} toneMapped={false} />
    </instancedMesh>
  )
}

function SalonShell({ W, H }: { W: number; H: number }) {
  const wallH = 3.2
  const t = 0.18
  const door = 3.2
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshLambertMaterial color={C.floorSalon} />
      </mesh>
      <gridHelper args={[Math.max(W, H), Math.max(W, H) / 2, C.floorLine, C.floorLine]} position-y={0.005} scale={[W / Math.max(W, H), 1, H / Math.max(W, H)]} />
      {/* Muros bajos translúcidos: se ve el montaje desde cualquier ángulo */}
      {[
        { p: [0, wallH / 2, -H / 2] as const, s: [W + t, wallH, t] as const },
        { p: [-W / 2, wallH / 2, 0] as const, s: [t, wallH, H] as const },
        { p: [W / 2, wallH / 2, 0] as const, s: [t, wallH, H] as const },
        { p: [-(W / 4 + door / 4), wallH / 2, H / 2] as const, s: [W / 2 - door / 2, wallH, t] as const },
        { p: [W / 4 + door / 4, wallH / 2, H / 2] as const, s: [W / 2 - door / 2, wallH, t] as const },
      ].map((w, i) => (
        <mesh key={i} position={w.p as unknown as [number, number, number]}>
          <boxGeometry args={w.s as unknown as [number, number, number]} />
          <meshLambertMaterial color={C.wall} transparent opacity={0.32} depthWrite={false} />
        </mesh>
      ))}
      {/* Terraza de entrada */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, H / 2 + 2]} receiveShadow>
        <planeGeometry args={[door + 3, 4]} />
        <meshLambertMaterial color={C.stone} />
      </mesh>
    </group>
  )
}

function GardenShell({ W, H }: { W: number; H: number }) {
  const o = VENUE_SPACES.jardin.obstacle
  const ox = o.x - W / 2
  const oz = o.y - H / 2
  const palms = useMemo(() => Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + 0.2; return [ox + Math.cos(a) * (o.r + 2.4), oz + Math.sin(a) * (o.r + 2.4)] as const }), [ox, oz, o.r])
  const cypress = useMemo(() => {
    const out: [number, number][] = []
    for (let z = -H / 2; z <= H / 2; z += 3.2) out.push([W / 2 + 2.5, z])
    for (let z = -H / 2; z <= H / 2; z += 3.2) out.push([-W / 2 - 2.5, z])
    return out
  }, [W, H])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W + 12, H + 12]} />
        <meshLambertMaterial color={C.lawn} />
      </mesh>
      {/* Franjas de corte del pasto */}
      {Array.from({ length: Math.ceil((W + 12) / 4) }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-(W + 12) / 2 + i * 4 + 1, 0.003, 0]}>
          <planeGeometry args={[2, H + 12]} />
          <meshLambertMaterial color={C.lawnDark} transparent opacity={0.35} />
        </mesh>
      ))}
      {/* Camino central y glorieta con fuente */}
      <mesh rotation-x={-Math.PI / 2} position={[ox, 0.006, 0]}>
        <planeGeometry args={[3.5, H + 12]} />
        <meshLambertMaterial color={C.path} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[ox, 0.01, oz]}>
        <circleGeometry args={[o.r, 48]} />
        <meshLambertMaterial color={C.path} />
      </mesh>
      <mesh position={[ox, 0.25, oz]} castShadow>
        <cylinderGeometry args={[2.4, 2.6, 0.5, 40]} />
        <meshLambertMaterial color={C.stone} />
      </mesh>
      <mesh position={[ox, 0.51, oz]}>
        <cylinderGeometry args={[2.15, 2.15, 0.02, 40]} />
        <meshStandardMaterial color={C.water} roughness={0.2} metalness={0.1} />
      </mesh>
      <mesh position={[ox, 1.1, oz]} castShadow>
        <cylinderGeometry args={[0.18, 0.3, 1.2, 16]} />
        <meshLambertMaterial color={C.stone} />
      </mesh>
      {palms.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={2.2} castShadow>
            <cylinderGeometry args={[0.12, 0.2, 4.4, 8]} />
            <meshLambertMaterial color={C.trunk} />
          </mesh>
          {Array.from({ length: 6 }, (_, k) => (
            <mesh key={k} position={[Math.cos((k / 6) * Math.PI * 2) * 0.9, 4.4, Math.sin((k / 6) * Math.PI * 2) * 0.9]} rotation={[0, -(k / 6) * Math.PI * 2, 0.5]} castShadow>
              <coneGeometry args={[0.35, 2, 4]} />
              <meshLambertMaterial color={C.palm} />
            </mesh>
          ))}
        </group>
      ))}
      {cypress.map(([x, z], i) => (
        <mesh key={i} position={[x, 2.4, z]} castShadow>
          <coneGeometry args={[0.9, 4.8, 8]} />
          <meshLambertMaterial color={C.cypress} />
        </mesh>
      ))}
    </group>
  )
}

export default function VenueScene3D({ venue, layout, palette, selectedId, onSelect, showNumbers = true, viewFromId, tour }: Props) {
  const { w: W, h: H } = VENUE_SPACES[venue]
  const chairs = useChairMatrices(layout, W, H)
  const span = Math.max(W, H)
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      frameloop={tour ? 'always' : 'demand'}
      camera={{ position: [span * 0.38, span * 0.42, span * 0.56], fov: 42, near: 0.5, far: 600 }}
      onPointerMissed={() => onSelect?.(null)}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[venue === 'salon' ? '#EFE2D8' : '#E9D9C9']} />
      <fog attach="fog" args={[venue === 'salon' ? '#EFE2D8' : '#E9D9C9', span * 1.4, span * 3]} />
      <hemisphereLight args={['#FFF1E2', '#B9A58F', 0.85]} />
      <directionalLight position={[span * 0.5, span * 0.9, span * 0.35]} intensity={1.35} color="#FFE2C2" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span} shadow-bias={-0.0004} />
      {venue === 'salon' ? <SalonShell W={W} H={H} /> : <GardenShell W={W} H={H} />}
      {layout.map((it) => (
        <Piece key={it.id} it={it} W={W} H={H} palette={palette} selected={selectedId === it.id} onSelect={(id) => onSelect?.(id)} showNumbers={showNumbers} />
      ))}
      <Chairs matrices={chairs} />
      <StringLights layout={layout} W={W} H={H} />
      <CameraRig layout={layout} W={W} H={H} span={span} viewFromId={viewFromId} tour={tour} />
    </Canvas>
  )
}

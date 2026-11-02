// Etiqueta HTML pegada a un punto 3D. Reemplaza al <Html> de drei: aquel desmontaba su raíz de React
// mientras React dibujaba (error en consola al salir del mapa). Aquí la raíz se desmonta un instante después.
import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export function Html3D({ position = [0, 0, 0], children, zIndex = 8, style }: { position?: [number, number, number]; children: ReactNode; zIndex?: number; style?: CSSProperties; center?: boolean }) {
  const group = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const box = useRef<HTMLDivElement | null>(null)
  const root = useRef<Root | null>(null)
  const target = gl.domElement.parentNode as HTMLElement | null
  const v = useMemo(() => new THREE.Vector3(), [])

  useLayoutEffect(() => {
    // Un contenedor nuevo en cada montaje: la raíz anterior se desmonta después y no deben compartirlo
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;top:0;left:0;will-change:transform;display:none;'
    // El control de cámara escucha al contenedor y "captura" el dedo al tocar: sin esto, tocar una
    // etiqueta movía la cámara en lugar de abrirla
    const stop = (e: Event) => e.stopPropagation()
    el.addEventListener('pointerdown', stop)
    el.addEventListener('pointerup', stop)
    el.addEventListener('click', stop)
    el.addEventListener('wheel', stop, { passive: true })
    const r = createRoot(el)
    box.current = el
    root.current = r
    target?.appendChild(el)
    return () => {
      el.removeEventListener('pointerdown', stop)
      el.removeEventListener('pointerup', stop)
      el.removeEventListener('click', stop)
      el.removeEventListener('wheel', stop)
      el.remove()
      if (box.current === el) box.current = null
      if (root.current === r) root.current = null
      // Fuera del ciclo de dibujo de React: así no aparece el error de "unmount" sincrónico
      setTimeout(() => r.unmount(), 0)
    }
  }, [target])

  useLayoutEffect(() => {
    if (box.current) box.current.style.zIndex = String(zIndex)
    root.current?.render(<div style={{ transform: 'translate(-50%, -50%)', ...style }}>{children}</div>)
  })

  useFrame(() => {
    const el = box.current
    if (!group.current || !el) return
    group.current.getWorldPosition(v)
    v.project(camera)
    let x = ((v.x + 1) / 2) * size.width
    const y = ((1 - v.y) / 2) * size.height
    // Si el punto está en pantalla pero la etiqueta se saldría por un lado, se recorre hacia adentro
    // para que se lea completa; si el punto ya quedó fuera, la etiqueta se esconde
    const hidden = v.z > 1 || v.z < -1 || x < 0 || x > size.width
    el.style.display = hidden ? 'none' : 'block'
    if (hidden) return
    const w = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
    const m = 6 + w / 2
    if (size.width > m * 2) x = Math.min(size.width - m, Math.max(m, x))
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  })

  return <group ref={group} position={position} />
}

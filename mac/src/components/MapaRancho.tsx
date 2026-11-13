// El mapa del rancho en 3D: el mismo plano de la página, con sus edificios y árboles
// en su lugar, adaptada a los colores de la app. Cada hospedaje se ve distinto según la noche que se elija:
//   · ocupado   → su techo toma el color de la app
//   · solicitud → un aro que late alrededor del edificio
//   · cerrado   → atenuado
//   · libre     → sus colores de piedra
// Vista satelital fija: cada unidad tiene su propio rótulo y se puede seleccionar directamente.
// Si el equipo no puede dibujar en 3D, se ve el plano plano de siempre.
import { useEffect, useMemo, useRef, useState } from 'react'
import { buscarPieza, HOSPEDAJES, type Pieza } from '@/lib/plano'
import { crearMaqueta, type Maqueta } from '@/lib/maqueta'
import { PlanoRancho, type CasaEscena } from './plano'
import { cx } from './ui'

/** El color de una variable de la app (ya resuelto para claro u oscuro) como número 0xRRGGBB */
function colorDe(variable: string): number {
  const el = document.createElement('span')
  el.style.color = `var(${variable})`
  document.body.append(el)
  const c = getComputedStyle(el).color
  el.remove()
  const n = (c.match(/-?[\d.]+/g) ?? []).map(Number)
  const [r = 0, g = 0, b = 0] = c.startsWith('color(') ? n.map((x) => x * 255) : n
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}
const esNoche = () => {
  const t = document.documentElement.getAttribute('data-theme')
  return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
}

/** Identifica las hileras para separar las etiquetas cercanas sin ocultar unidades. */
const GRUPO_DE = new Map<string, string>(HOSPEDAJES.flatMap((p) => {
  const g = p.grupo ?? (p.tipo === 'cabana' ? 'cabanas' : undefined)
  return g ? [[p.id, g] as [string, string]] : []
}))
const ORDEN_GRUPO = new Map<string, number>()
const vistosPorGrupo = new Map<string, number>()
for (const p of HOSPEDAJES) {
  const grupo = GRUPO_DE.get(p.id)
  if (!grupo) continue
  ORDEN_GRUPO.set(p.id, vistosPorGrupo.get(grupo) ?? 0)
  vistosPorGrupo.set(grupo, (vistosPorGrupo.get(grupo) ?? 0) + 1)
}
function ajusteEtiqueta(id: string) {
  const grupo = GRUPO_DE.get(id)
  const orden = ORDEN_GRUPO.get(id) ?? 0
  if (grupo === 'hilera-11-16') return { x: orden % 2 ? 17 : -17, y: 0 }
  if (grupo === 'hilera-1-3') return { x: 0, y: orden % 2 ? -12 : 12 }
  if (grupo === 'cabanas' && orden === 1) return { x: 25, y: -5 }
  if (grupo === 'cabanas' && orden === 2) return { x: -20, y: 5 }
  return { x: 0, y: 0 }
}
const nombreCorto = (p: Pieza) => (p.tipo === 'habitacion' ? `H${p.nombre.replace(/\D+/g, '')}` : p.tipo === 'casa' ? p.nombre.replace(/^Casa\s+/i, 'C') : p.nombre.replace(/^Cabaña\s+/i, ''))

export function MapaRancho({ casas, elegida, onElegir }: { casas: CasaEscena[]; elegida: string | null; onElegir: (id: string) => void }) {
  const caja = useRef<HTMLDivElement>(null)
  const maqueta = useRef<Maqueta | null>(null)
  const etiquetas = useRef(new Map<string, HTMLElement>())
  const posiciones = useRef(new Map<string, { x: number; y: number; ok: boolean }>())
  const alElegir = useRef(onElegir)
  alElegir.current = onElegir
  const [sinWebGL, setSinWebGL] = useState(false)
  const [sobre, setSobre] = useState<string | null>(null)

  // Cada hospedaje de la nube busca su edificio en el plano (por nombre); lo que no se reconoce va aparte
  const porPieza = useMemo(() => {
    const libres = [...HOSPEDAJES]
    const porPieza = new Map<string, CasaEscena>()
    for (const c of casas) {
      const p = buscarPieza(c.slug, c.nombre, libres, c.tipo)
      if (p) {
        porPieza.set(p.id, c)
        libres.splice(libres.indexOf(p), 1)
      }
    }
    return porPieza
  }, [casas])
  const piezaDe = (casaId: string | null) => (casaId ? ([...porPieza].find(([, c]) => c.id === casaId)?.[0] ?? null) : null)
  const porPiezaRef = useRef(porPieza)
  porPiezaRef.current = porPieza

  // La maqueta se crea una vez
  useEffect(() => {
    if (!caja.current) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const m = crearMaqueta(caja.current, {
      reduce,
      fija: true,
      alMover: (pos) => {
        posiciones.current = pos
        const w = caja.current?.clientWidth ?? 0
        const h = caja.current?.clientHeight ?? 0
        for (const [id, el] of etiquetas.current) {
          const p = pos.get(id)
          if (!p || !p.ok || p.x <= -48 || p.x >= w + 48 || p.y <= -48 || p.y >= h + 48) {
            el.style.opacity = '0'
            el.style.pointerEvents = 'none'
            continue
          }
          const ajuste = ajusteEtiqueta(id)
          el.style.opacity = '1'
          el.style.pointerEvents = 'auto'
          el.style.transform = `translate(${p.x + ajuste.x}px, ${p.y + ajuste.y}px) translate(-50%, -100%)`
        }
      },
      alPasar: (id) => setSobre(id),
      alElegir: (id) => {
        const c = porPiezaRef.current.get(id)
        if (c) alElegir.current(c.id)
      },
    })
    if (!m) {
      setSinWebGL(true)
      return
    }
    maqueta.current = m
    m.ponerAcento(colorDe('--map-accent'))
    m.ponerModo(esNoche())
    // Si cambia entre claro y oscuro (o la Mac cambia sola), se ajustan el color y la luz
    const ajustar = () => {
      m.ponerAcento(colorDe('--map-accent'))
      m.ponerModo(esNoche())
    }
    const ob = new MutationObserver(ajustar)
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-app-design'] })
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', ajustar)
    return () => {
      ob.disconnect()
      mq.removeEventListener('change', ajustar)
      m.destruir()
      maqueta.current = null
    }
  }, [])

  // Qué hospedajes hay y cómo está cada uno esa noche
  const ids = useMemo(() => [...porPieza.keys()].sort().join('|'), [porPieza])
  useEffect(() => {
    maqueta.current?.ponerUnidades([...porPieza.keys()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, sinWebGL])
  useEffect(() => {
    const estados = new Map<string, 'ocupada' | 'apartada' | 'cerrada' | 'libre'>()
    for (const [id, c] of porPieza) estados.set(id, c.estado === 'reservada' ? 'ocupada' : c.estado)
    maqueta.current?.ponerEstados(estados)
  }, [porPieza, sinWebGL])
  useEffect(() => {
    maqueta.current?.resaltar(piezaDe(elegida))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegida, ids])

  if (sinWebGL) return <PlanoRancho casas={casas} elegida={elegida} onPick={onElegir} mostrarSueltos={false} />

  const casaSobre = sobre ? porPieza.get(sobre) : undefined
  const posSobre = sobre ? posiciones.current.get(sobre) : undefined
  return (
    <div>
      <div className="relative h-[clamp(400px,60vh,640px)] w-full overflow-hidden rounded-[var(--r-md)]">
        <div ref={caja} className="absolute inset-0" />

        {/* Etiquetas individuales: cada alojamiento se puede seleccionar directamente. */}
        <div className="pointer-events-none absolute inset-0">
          {[...porPieza].map(([id, c]) => {
            const p = HOSPEDAJES.find((x) => x.id === id)
            if (!p) return null
            return (
              <button
                key={id}
                type="button"
                aria-label={`Elegir ${c.nombre}`}
                aria-pressed={elegida === c.id}
                onClick={() => onElegir(c.id)}
                onPointerEnter={() => setSobre(id)}
                onPointerLeave={() => setSobre(null)}
                ref={(el) => {
                  if (el) etiquetas.current.set(id, el)
                  else etiquetas.current.delete(id)
                }}
                style={{ opacity: 0 }}
                className={cx(
                  'pointer-events-auto absolute top-0 left-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] leading-tight font-semibold whitespace-nowrap shadow-[var(--shadow-1)] ring-1 ring-inset transition-opacity',
                  c.estado === 'reservada' && 'bg-chispa text-on-chispa ring-transparent',
                  c.estado === 'apartada' && 'bg-surface text-chispa ring-chispa',
                  c.estado === 'cerrada' && 'bg-sunken text-ink-3 ring-line',
                  c.estado === 'libre' && 'bg-surface text-ink ring-line-strong',
                  elegida === c.id && 'ring-2 ring-ink',
                )}
              >
                {nombreCorto(p)}
              </button>
            )
          })}
        </div>

        {/* Globo con el detalle */}
        {casaSobre && posSobre?.ok && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-[300px] -translate-x-1/2 -translate-y-full rounded-[12px] bg-night px-3.5 py-2.5 text-on-night shadow-[var(--shadow-3)]"
            style={{ left: `clamp(150px, ${posSobre.x}px, calc(100% - 150px))`, top: Math.max(60, posSobre.y - 30) }}
          >
            <div className="text-[14px] font-semibold">{casaSobre.nombre}</div>
            <div className="text-[13px] text-on-night-soft">{casaSobre.linea}</div>
          </div>
        )}
      </div>

    </div>
  )
}

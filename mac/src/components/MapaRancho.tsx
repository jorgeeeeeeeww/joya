// El mapa del rancho en 3D: el mismo plano de la página, con sus edificios y árboles
// en su lugar, adaptada a los colores de la app. Cada hospedaje se ve distinto según la noche que se elija:
//   · ocupado   → su techo toma el color de la app
//   · solicitud → un aro que late alrededor del edificio
//   · cerrado   → atenuado
//   · libre     → sus colores de piedra
// Vista con giro y zoom: los rótulos se distribuyen sin encimarse y apuntan a su edificio.
// Si el equipo no puede dibujar en 3D, se ve el plano plano de siempre.
import { useEffect, useMemo, useRef, useState } from 'react'
import { buscarPieza, HOSPEDAJES, type Pieza } from '@/lib/plano'
import { crearMaqueta, type Maqueta } from '@/lib/maqueta'
import type { CasaEscena } from './plano'
import { cx } from './ui'
import { distribuirEtiquetas } from '@/lib/etiquetasMapa'
import { Minus, Plus, RotateCcw } from 'lucide-react'

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

const nombreCorto = (p: Pieza) => (p.tipo === 'habitacion' ? `H${p.nombre.replace(/\D+/g, '')}` : p.tipo === 'casa' ? p.nombre.replace(/^Casa\s+/i, 'C') : p.nombre.replace(/^Cabaña\s+/i, ''))

export function MapaRancho({ casas, elegida, onElegir, tipo = null }: { casas: CasaEscena[]; elegida: string | null; onElegir: (id: string) => void; tipo?: CasaEscena['tipo'] | null }) {
  const caja = useRef<HTMLDivElement>(null)
  const maqueta = useRef<Maqueta | null>(null)
  const etiquetas = useRef(new Map<string, HTMLElement>())
  const lineas = useRef(new Map<string, SVGLineElement>())
  const posiciones = useRef(new Map<string, { x: number; y: number; ok: boolean }>())
  const alElegir = useRef(onElegir)
  alElegir.current = onElegir
  const [sinWebGL, setSinWebGL] = useState(false)
  const [intento, setIntento] = useState(0)
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
    let ultimaDistribucion = ''
    const m = crearMaqueta(caja.current, {
      reduce,
      fija: false,
      alMover: (pos) => {
        posiciones.current = pos
        const w = caja.current?.clientWidth ?? 0
        const h = caja.current?.clientHeight ?? 0
        const items = [...etiquetas.current].flatMap(([id, el]) => {
          const p = pos.get(id)
          const visible = p?.ok && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h
          return visible ? [{ id, x: p.x, y: p.y, ancho: el.offsetWidth, alto: el.offsetHeight }] : []
        })
        const firma = `${w}|${h}|${items.map((p) => `${p.id}:${p.x.toFixed(1)}:${p.y.toFixed(1)}:${p.ancho}:${p.alto}`).join('|')}`
        if (firma === ultimaDistribucion) return
        ultimaDistribucion = firma
        for (const [id, el] of etiquetas.current) {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          el.style.visibility = 'hidden'
          const linea = lineas.current.get(id)
          if (linea) linea.style.opacity = '0'
        }
        // Reserva la franja inferior para que las etiquetas no tapen los controles.
        for (const p of distribuirEtiquetas(items, w, h - 64)) {
          const el = etiquetas.current.get(p.id)!
          el.style.opacity = '1'
          el.style.visibility = 'visible'
          el.style.pointerEvents = 'auto'
          el.style.transform = `translate(${p.x}px, ${p.y}px)`
          const ancla = pos.get(p.id)!
          const linea = lineas.current.get(p.id)
          if (linea) {
            linea.setAttribute('x1', String(ancla.x))
            linea.setAttribute('y1', String(ancla.y))
            linea.setAttribute('x2', String(p.x + p.ancho / 2))
            linea.setAttribute('y2', String(p.y + p.alto / 2))
            linea.style.opacity = '0.6'
          }
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
  }, [intento])

  // Qué hospedajes hay y cómo está cada uno esa noche
  const ids = useMemo(() => [...porPieza.keys()].sort().join('|'), [porPieza])
  useEffect(() => {
    maqueta.current?.ponerUnidades([...porPieza.keys()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, sinWebGL, intento])
  useEffect(() => {
    const estados = new Map<string, 'ocupada' | 'apartada' | 'cerrada' | 'libre'>()
    for (const [id, c] of porPieza) estados.set(id, c.estado === 'reservada' ? 'ocupada' : c.estado)
    maqueta.current?.ponerEstados(estados)
  }, [porPieza, sinWebGL, intento])
  useEffect(() => {
    maqueta.current?.filtrar(tipo ? [...porPieza].filter(([, c]) => c.tipo === tipo).map(([id]) => id) : null)
  }, [tipo, porPieza, sinWebGL, intento])
  useEffect(() => {
    maqueta.current?.resaltar(piezaDe(elegida))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegida, ids, intento])

  if (sinWebGL) return <div role="status" className="flex h-[clamp(400px,60vh,640px)] flex-col items-center justify-center gap-3 rounded-xl bg-wash px-6 text-center text-ink-soft">
    <p>No se pudo iniciar la vista 3D en este momento.</p>
    <p className="text-[13px]">Puedes elegir un hospedaje en la lista para consultar su calendario.</p>
    <button type="button" className="rounded-lg border border-line bg-surface px-4 py-2 font-semibold text-ink" onClick={() => { setSinWebGL(false); setIntento(n => n + 1) }}>Reintentar vista 3D</button>
  </div>

  const casaSobre = sobre ? porPieza.get(sobre) : undefined
  const posSobre = sobre ? posiciones.current.get(sobre) : undefined
  return (
    <div>
      <div className="relative h-[clamp(400px,60vh,640px)] w-full overflow-hidden rounded-[var(--r-md)]">
        <div ref={caja} className="absolute inset-0" />

        <div className="absolute right-3 bottom-3 z-20 flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm" aria-label="Controles del mapa">
          {[
            { nombre: 'Acercar mapa', Icono: Plus, accion: () => maqueta.current?.acercar(1.25) },
            { nombre: 'Alejar mapa', Icono: Minus, accion: () => maqueta.current?.acercar(0.8) },
            { nombre: 'Restablecer vista', Icono: RotateCcw, accion: () => maqueta.current?.restablecerVista() },
          ].map(({ nombre, Icono, accion }) => <button key={nombre} type="button" aria-label={nombre} title={nombre} onClick={accion} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-wash focus-visible:outline-2 focus-visible:outline-primary"><Icono size={18} /></button>)}
        </div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {[...porPieza].filter(([, c]) => !tipo || c.tipo === tipo).map(([id]) => <line key={id} ref={(el) => { if (el) lineas.current.set(id, el); else lineas.current.delete(id) }} stroke="var(--ink-soft)" strokeWidth="1" />)}
        </svg>

        {/* Etiquetas individuales: cada alojamiento se puede seleccionar directamente. */}
        <div className="pointer-events-none absolute inset-0">
          {[...porPieza].map(([id, c]) => {
            if (tipo && c.tipo !== tipo) return null
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
                onFocus={() => setSobre(id)}
                onBlur={() => setSobre(null)}
                ref={(el) => {
                  if (el) etiquetas.current.set(id, el)
                  else etiquetas.current.delete(id)
                }}
                style={{ opacity: 0, visibility: 'hidden' }}
                className={cx(
                  'pointer-events-auto absolute top-0 left-0 inline-flex items-center rounded-full min-h-8 min-w-10 justify-center px-2.5 py-1.5 text-[12px] leading-tight font-semibold whitespace-nowrap shadow-[var(--shadow-1)] ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
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

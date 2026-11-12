// El mapa del rancho en 3D: la misma maqueta de la página (web/src/scripts/maqueta.ts), con sus edificios y árboles
// en su lugar, adaptada a los colores de la app. Cada hospedaje se ve distinto según la noche que se elija:
//   · ocupado   → su techo toma el color de la app
//   · solicitud → un aro que late alrededor del edificio
//   · cerrado   → atenuado
//   · libre     → sus colores de piedra
// Se arrastra de lado para girarlo, se pasa el cursor para ver quién está y se toca para abrir su ficha.
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

const nombreCorto = (p: Pieza) => (p.tipo === 'habitacion' ? p.nombre.replace(/\D+/g, '') : p.nombre.replace(/^Cabaña\s+/i, ''))

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
  const { porPieza, sueltos } = useMemo(() => {
    const libres = [...HOSPEDAJES]
    const porPieza = new Map<string, CasaEscena>()
    const sueltos: CasaEscena[] = []
    for (const c of casas) {
      const p = buscarPieza(c.slug, c.nombre, libres)
      if (p) {
        porPieza.set(p.id, c)
        libres.splice(libres.indexOf(p), 1)
      } else sueltos.push(c)
    }
    return { porPieza, sueltos }
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
      alMover: (pos) => {
        posiciones.current = pos
        for (const [id, el] of etiquetas.current) {
          const p = pos.get(id)
          if (!p || !p.ok) el.style.opacity = '0'
          else {
            el.style.opacity = '1'
            el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`
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
    m.ponerAcento(colorDe('--chispa'))
    m.ponerModo(esNoche())
    m.entrar()
    // Si cambia entre claro y oscuro (o la Mac cambia sola), se ajustan el color y la luz
    const ajustar = () => {
      m.ponerAcento(colorDe('--chispa'))
      m.ponerModo(esNoche())
    }
    const ob = new MutationObserver(ajustar)
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
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

  if (sinWebGL) return <PlanoRancho casas={casas} elegida={elegida} onPick={onElegir} />

  const casaSobre = sobre ? porPieza.get(sobre) : undefined
  const posSobre = sobre ? posiciones.current.get(sobre) : undefined
  return (
    <div>
      <div className="relative h-[clamp(340px,50vh,540px)] w-full overflow-hidden rounded-[var(--r-md)]">
        <div ref={caja} className="absolute inset-0" />

        {/* Rótulo de cada hospedaje, sobre su edificio */}
        <div className="pointer-events-none absolute inset-0">
          {[...porPieza].map(([id, c]) => {
            const p = HOSPEDAJES.find((x) => x.id === id)
            if (!p) return null
            return (
              <span
                key={id}
                ref={(el) => {
                  if (el) etiquetas.current.set(id, el)
                  else etiquetas.current.delete(id)
                }}
                style={{ opacity: 0 }}
                className={cx(
                  'absolute top-0 left-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-tight font-semibold whitespace-nowrap shadow-[var(--shadow-1)] ring-1 ring-inset transition-opacity',
                  c.estado === 'reservada' && 'bg-chispa text-on-chispa ring-transparent',
                  c.estado === 'apartada' && 'bg-surface text-chispa ring-chispa',
                  c.estado === 'cerrada' && 'bg-sunken text-ink-3 ring-line',
                  c.estado === 'libre' && 'bg-surface text-ink ring-line-strong',
                  elegida === c.id && 'ring-2 ring-ink',
                )}
              >
                {nombreCorto(p)}
              </span>
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

      {sueltos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sueltos.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onElegir(c.id)}
              title={c.linea}
              className={cx('pressable inline-flex min-h-8 items-center rounded-full px-3 text-[13px] ring-1 ring-inset', c.estado === 'reservada' ? 'bg-chispa text-on-chispa ring-transparent' : 'bg-secondary text-ink ring-line-strong', c.estado === 'apartada' && 'plano-late-chip', elegida === c.id && 'ring-2 ring-ink')}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

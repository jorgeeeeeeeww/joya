// El rancho visto desde arriba, con sus edificios reales (el mismo plano en metros que usa la página). Cada lugar se
// pinta según la noche que se esté viendo: relleno de luz si hay huéspedes, contorno que late si hay una solicitud
// apartada, rayado si está cerrado y solo contorno si está libre. Se puede pasar el cursor (o enfocar con el teclado)
// para ver quién está y hacer clic para abrir la reservación. Reemplaza a la escena de casitas con guirnalda de focos.
//
// El terreno es largo (168 m) y angosto (72 m): se dibuja girado un cuarto de vuelta (el norte queda a la izquierda)
// para que llene lo ancho de la pantalla.
import { useId, useMemo, useState } from 'react'
import type { TipoHospedaje } from '@/lib/tipos'
import { CAMINOS, HOSPEDAJES, LOTE, PIEZAS, buscarPieza, type Pieza } from '@/lib/plano'
import { cx } from './ui'

export type EstadoCasa = 'reservada' | 'apartada' | 'cerrada' | 'libre'
export interface CasaEscena {
  id: string
  slug?: string
  nombre: string
  tipo: TipoHospedaje
  estado: EstadoCasa
  /** Lo que pasa ahí, en una línea: «Ana López · se va el domingo» */
  linea: string
  /** Alguien llega ese día */
  llega?: boolean
}

// Plano → pantalla: u = z (de norte a sur, de izquierda a derecha) y v = −x (el oeste abajo)
const U = (p: Pieza) => p.z
const V = (p: Pieza) => -p.x
const VISTA = { x: -90, y: -27, w: 180, h: 62 }

const LUZ = 'var(--luz)'
const SUAVE = (n: number) => `color-mix(in oklab, var(--on-night) ${n}%, transparent)`
const TERRENO = 'color-mix(in oklab, var(--night) 90%, var(--on-night))'
const PASTO = 'color-mix(in oklab, var(--night) 72%, var(--sky-3))'

/** Etiquetas que van fuera del edificio (arriba o abajo) para que no se encimen con la de al lado */
const ETIQUETA_FUERA: Record<string, 'arriba' | 'abajo'> = { sabas: 'abajo', 'cabana-san-miguel': 'abajo', 'cabana-elena': 'arriba' }
const nombreCorto = (p: Pieza) => (p.tipo === 'habitacion' ? p.nombre.replace(/\D+/g, '') : p.nombre.replace(/^Cabaña\s+/i, ''))

function Edificio({ p, c, sobre, rayas, onSobre, onPick, decorativa }: { p: Pieza; c?: CasaEscena; sobre: boolean; rayas: string; onSobre: (on: boolean) => void; onPick: () => void; decorativa?: boolean }) {
  const estado = c?.estado ?? 'libre'
  const u = U(p)
  const v = V(p)
  const x = u - p.d / 2
  const y = v - p.w / 2
  const adentro = p.tipo === 'habitacion'
  const fuera = ETIQUETA_FUERA[p.id] ?? 'arriba'
  const encendida = estado === 'reservada'
  const interaccion = c && !decorativa
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `${c.nombre}: ${c.linea}`,
        onClick: onPick,
        onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick()),
        onPointerEnter: () => onSobre(true),
        onPointerLeave: () => onSobre(false),
        onFocus: () => onSobre(true),
        onBlur: () => onSobre(false),
      }
    : {}
  return (
    <g {...interaccion} className={cx(c && !decorativa && 'cursor-pointer outline-none')}>
      {/* Zona de clic un poco más grande que el edificio */}
      <rect x={x - 0.8} y={y - 0.8} width={p.d + 1.6} height={p.w + 1.6} fill="transparent" />
      <rect
        x={x}
        y={y}
        width={p.d}
        height={p.w}
        rx={0.5}
        fill={encendida ? LUZ : estado === 'apartada' ? `color-mix(in oklab, var(--luz) 24%, transparent)` : estado === 'cerrada' ? `url(#${rayas})` : SUAVE(7)}
        stroke={estado === 'apartada' ? LUZ : sobre ? 'var(--on-night)' : encendida ? 'transparent' : SUAVE(estado === 'cerrada' ? 38 : 30)}
        strokeWidth={estado === 'apartada' ? 0.5 : sobre ? 0.7 : 0.35}
        strokeDasharray={estado === 'apartada' ? '1.1 0.7' : undefined}
        className={cx(encendida && 'plano-encendido', estado === 'apartada' && 'plano-late')}
        style={{ transition: 'stroke 0.2s var(--ease-calma), stroke-width 0.2s var(--ease-calma)' }}
      />
      {c?.llega && <circle cx={x + p.d - 0.2} cy={y + 0.2} r={0.95} fill={LUZ} stroke="var(--night)" strokeWidth={0.35} className="plano-encendido" />}
      {adentro ? (
        <text x={u} y={v} textAnchor="middle" dy="0.36em" fontSize={p.d > 3.5 ? 2.1 : 1.8} fontWeight={600} fill={encendida ? 'var(--night)' : 'var(--on-night-soft)'} className="pointer-events-none select-none">
          {nombreCorto(p)}
        </text>
      ) : (
        <text x={u} y={fuera === 'arriba' ? y - 1.4 : y + p.w + 3} textAnchor="middle" fontSize={2.15} fontWeight={500} fill={encendida || sobre ? 'var(--on-night)' : 'var(--on-night-soft)'} className="pointer-events-none select-none">
          {nombreCorto(p)}
        </text>
      )}
    </g>
  )
}

/** Un hospedaje de la nube que no se reconoció en el plano (se llama distinto): se ve igual, en una fila aparte */
function Suelto({ c, onPick, decorativa }: { c: CasaEscena; onPick: () => void; decorativa?: boolean }) {
  return (
    <button type="button" disabled={decorativa} onClick={onPick} title={c.linea} className={cx('pressable inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-[12.5px] ring-1 ring-inset', c.estado === 'reservada' ? 'bg-luz text-night ring-transparent' : 'text-on-night-soft ring-[color-mix(in_oklab,var(--on-night)_30%,transparent)]', c.estado === 'apartada' && 'plano-late-chip')}>
      {c.nombre}
    </button>
  )
}

/**
 * El plano completo. `casas` viene ya calculado con el estado de la noche que se está viendo. Con `decorativa`
 * no hay clics ni globo (pantalla de entrada).
 */
export function PlanoRancho({ casas, onPick, decorativa }: { casas: CasaEscena[]; onPick?: (id: string) => void; decorativa?: boolean }) {
  const [sobre, setSobre] = useState<string | null>(null)
  const rayas = `plano-rayas-${useId().replace(/:/g, '')}`

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

  const contexto = PIEZAS.filter((p) => !HOSPEDAJES.includes(p))
  const elegida = sobre ? HOSPEDAJES.find((p) => porPieza.get(p.id)?.id === sobre) : undefined
  const casaElegida = elegida ? porPieza.get(elegida.id) : undefined
  const pct = (n: number, de: number, desde: number) => `${((n - desde) / de) * 100}%`

  return (
    <div>
      <div className="relative w-full" style={{ aspectRatio: `${VISTA.w} / ${VISTA.h}` }}>
        <svg viewBox={`${VISTA.x} ${VISTA.y} ${VISTA.w} ${VISTA.h}`} className={cx('absolute inset-0 block h-full w-full', decorativa && 'pointer-events-none')} role="group" aria-label="Plano del rancho esta noche">
          <defs>
            <pattern id={rayas} width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.6" height="1.6" fill="transparent" />
              <rect width="0.55" height="1.6" fill={SUAVE(36)} />
            </pattern>
          </defs>
          {/* Terreno */}
          <polygon points={LOTE.map(([x, z]) => `${z},${-x}`).join(' ')} fill={TERRENO} stroke={SUAVE(16)} strokeWidth={0.4} strokeLinejoin="round" />
          <g className="pointer-events-none">
            {contexto
              .filter((p) => p.tipo === 'jardin' || p.tipo === 'pasto')
              .map((p) => (
                <rect key={p.id} x={U(p) - p.d / 2} y={V(p) - p.w / 2} width={p.d} height={p.w} rx={2} fill={PASTO} opacity={0.55} />
              ))}
            {CAMINOS.map((c, i) => (
              <polyline key={i} points={c.puntos.map(([x, z]) => `${z},${-x}`).join(' ')} fill="none" stroke={SUAVE(13)} strokeWidth={c.ancho} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {contexto
              .filter((p) => p.tipo === 'parking' || p.tipo === 'salon' || p.tipo === 'glorieta' || p.tipo === 'juegos' || p.tipo === 'entrada')
              .map((p) =>
                p.forma === 'ellipse' ? (
                  <ellipse key={p.id} cx={U(p)} cy={V(p)} rx={p.d / 2} ry={p.w / 2} fill="none" stroke={SUAVE(18)} strokeWidth={0.35} />
                ) : (
                  <rect key={p.id} x={U(p) - p.d / 2} y={V(p) - p.w / 2} width={p.d} height={p.w} rx={0.6} fill={SUAVE(p.tipo === 'salon' ? 11 : 6)} stroke={SUAVE(p.tipo === 'salon' ? 24 : 14)} strokeWidth={0.3} />
                ),
              )}
            {[
              { t: 'Jardín de eventos', p: PIEZAS.find((p) => p.id === 'jardin')!, dy: -9 },
              { t: 'Salón', p: PIEZAS.find((p) => p.id === 'salon')!, dy: 0 },
              { t: 'Estacionamiento', p: PIEZAS.find((p) => p.id === 'parking')!, dy: 0 },
            ].map(({ t, p, dy }) => (
              <text key={t} x={U(p)} y={V(p) + dy} textAnchor="middle" dy="0.36em" fontSize={2.3} fill={SUAVE(40)} className="select-none">
                {t}
              </text>
            ))}
            {/* El norte */}
            <g fill={SUAVE(45)} className="select-none" fontSize={2.1}>
              <text x={-86} y={-21.5}>
                ← Norte
              </text>
            </g>
          </g>
          {HOSPEDAJES.map((p) => (
            <Edificio key={p.id} p={p} c={porPieza.get(p.id)} rayas={rayas} sobre={!!porPieza.get(p.id) && sobre === porPieza.get(p.id)!.id} onSobre={(on) => setSobre(on ? (porPieza.get(p.id)?.id ?? null) : null)} onPick={() => porPieza.get(p.id) && onPick?.(porPieza.get(p.id)!.id)} decorativa={decorativa} />
          ))}
        </svg>

        {/* Globo con el detalle */}
        {elegida && casaElegida && !decorativa && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-[300px] -translate-x-1/2 -translate-y-full rounded-[12px] bg-on-night px-3.5 py-2.5 text-night shadow-[var(--shadow-3)]"
            style={{ left: `clamp(150px, ${pct(U(elegida), VISTA.w, VISTA.x)}, calc(100% - 150px))`, top: `calc(${pct(V(elegida) - elegida.w / 2, VISTA.h, VISTA.y)} - 8px)` }}
          >
            <div className="text-[14px] font-semibold">{casaElegida.nombre}</div>
            <div className="text-[13px] opacity-75">{casaElegida.linea}</div>
          </div>
        )}
      </div>

      {sueltos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sueltos.map((c) => (
            <Suelto key={c.id} c={c} decorativa={decorativa} onPick={() => onPick?.(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

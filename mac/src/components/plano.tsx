// El plano del rancho visto desde arriba, con sus edificios reales: el mismo plano en metros y la misma orientación
// que usa la página en «Reservar» (acostado: el norte queda a la izquierda). Cada lugar se pinta según la noche que se
// esté viendo:
//   · ocupado     → caramelo lleno
//   · solicitud   → contorno punteado que late despacio (todavía no es seguro que lleguen)
//   · cerrado     → rayado
//   · libre       → verde agua pálido con contorno
// Se puede pasar el cursor (o enfocar con el teclado) para ver quién está, y hacer clic para abrirlo.
import { useId, useMemo, useState, type CSSProperties } from 'react'
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

/** Colores del plano: sobre una tarjeta clara (Mapa) o sobre un bloque verde petróleo (Entrar) */
const TONOS: Record<'claro' | 'oscuro', CSSProperties> = {
  claro: {
    '--pl-lote': 'var(--surface)',
    '--pl-lote-linea': 'color-mix(in oklab, var(--ink) 24%, transparent)',
    '--pl-pasto': 'color-mix(in oklab, var(--matiz) 24%, transparent)',
    '--pl-camino': 'color-mix(in oklab, var(--ink) 9%, transparent)',
    '--pl-otro': 'color-mix(in oklab, var(--ink) 6%, transparent)',
    '--pl-otro-linea': 'color-mix(in oklab, var(--ink) 16%, transparent)',
    '--pl-libre': 'var(--secondary)',
    '--pl-libre-linea': 'color-mix(in oklab, var(--primary) 55%, transparent)',
    '--pl-ocupada': 'var(--chispa)',
    '--pl-texto': 'var(--ink-soft)',
    '--pl-texto-fuerte': 'var(--ink)',
    '--pl-sobre-ocupada': 'var(--on-chispa)',
    '--pl-rayas': 'color-mix(in oklab, var(--ink) 40%, transparent)',
    '--pl-seleccion': 'var(--ink)',
  },
  oscuro: {
    '--pl-lote': 'color-mix(in oklab, var(--night) 88%, var(--on-night))',
    '--pl-lote-linea': 'color-mix(in oklab, var(--on-night) 20%, transparent)',
    '--pl-pasto': 'color-mix(in oklab, var(--loto, #b7ccc5) 14%, transparent)',
    '--pl-camino': 'color-mix(in oklab, var(--on-night) 11%, transparent)',
    '--pl-otro': 'color-mix(in oklab, var(--on-night) 6%, transparent)',
    '--pl-otro-linea': 'color-mix(in oklab, var(--on-night) 16%, transparent)',
    '--pl-libre': 'color-mix(in oklab, var(--on-night) 10%, transparent)',
    '--pl-libre-linea': 'color-mix(in oklab, var(--on-night) 40%, transparent)',
    '--pl-ocupada': 'var(--chispa-soft)',
    '--pl-texto': 'var(--on-night-soft)',
    '--pl-texto-fuerte': 'var(--on-night)',
    '--pl-sobre-ocupada': 'var(--night)',
    '--pl-rayas': 'color-mix(in oklab, var(--on-night) 45%, transparent)',
    '--pl-seleccion': 'var(--on-night)',
  },
} as Record<'claro' | 'oscuro', CSSProperties>

/** Etiquetas que van fuera del edificio (arriba o abajo) para que no se encimen con la de al lado */
const ETIQUETA_FUERA: Record<string, 'arriba' | 'abajo'> = { sabas: 'abajo', 'cabana-san-miguel': 'abajo', 'cabana-elena': 'arriba' }
const nombreCorto = (p: Pieza) => (p.tipo === 'habitacion' ? p.nombre.replace(/\D+/g, '') : p.nombre.replace(/^Cabaña\s+/i, ''))

function Edificio({ p, c, sobre, elegida, rayas, onSobre, onPick, decorativa }: { p: Pieza; c?: CasaEscena; sobre: boolean; elegida: boolean; rayas: string; onSobre: (on: boolean) => void; onPick: () => void; decorativa?: boolean }) {
  const estado = c?.estado ?? 'libre'
  const u = U(p)
  const v = V(p)
  const x = u - p.d / 2
  const y = v - p.w / 2
  const adentro = p.tipo === 'habitacion'
  const fuera = ETIQUETA_FUERA[p.id] ?? 'arriba'
  const ocupada = estado === 'reservada'
  const interaccion =
    c && !decorativa
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
      <rect x={x - 1} y={y - 1} width={p.d + 2} height={p.w + 2} fill="transparent" />
      {/* Aro de la selección */}
      {elegida && <rect x={x - 1.3} y={y - 1.3} width={p.d + 2.6} height={p.w + 2.6} rx={1} fill="none" stroke="var(--pl-seleccion)" strokeWidth={0.5} />}
      <rect
        x={x}
        y={y}
        width={p.d}
        height={p.w}
        rx={0.6}
        fill={ocupada ? 'var(--pl-ocupada)' : estado === 'apartada' ? 'color-mix(in oklab, var(--pl-ocupada) 22%, transparent)' : estado === 'cerrada' ? `url(#${rayas})` : 'var(--pl-libre)'}
        stroke={estado === 'apartada' ? 'var(--pl-ocupada)' : ocupada ? 'transparent' : estado === 'cerrada' ? 'var(--pl-rayas)' : 'var(--pl-libre-linea)'}
        strokeWidth={estado === 'apartada' ? 0.55 : sobre ? 0.7 : 0.4}
        strokeDasharray={estado === 'apartada' ? '1.1 0.7' : undefined}
        className={cx(estado === 'apartada' && 'plano-late')}
        style={{ transition: 'stroke-width 0.2s var(--ease-calma)' }}
      />
      {c?.llega && <circle cx={x + p.d - 0.1} cy={y + 0.1} r={1} fill="var(--pl-ocupada)" stroke="var(--pl-lote)" strokeWidth={0.4} />}
      {adentro ? (
        <text x={u} y={v} textAnchor="middle" dy="0.36em" fontSize={p.d > 3.5 ? 2.2 : 1.9} fontWeight={600} fill={ocupada ? 'var(--pl-sobre-ocupada)' : 'var(--pl-texto-fuerte)'} className="pointer-events-none select-none">
          {nombreCorto(p)}
        </text>
      ) : (
        <text x={u} y={fuera === 'arriba' ? y - 1.5 : y + p.w + 3.1} textAnchor="middle" fontSize={2.25} fontWeight={500} fill={ocupada || sobre || elegida ? 'var(--pl-texto-fuerte)' : 'var(--pl-texto)'} className="pointer-events-none select-none">
          {nombreCorto(p)}
        </text>
      )}
    </g>
  )
}

/** Un hospedaje de la nube que no se reconoció en el plano (se llama distinto): se ve igual, en una fila aparte */
function Suelto({ c, onPick, decorativa, elegida }: { c: CasaEscena; onPick: () => void; decorativa?: boolean; elegida?: boolean }) {
  return (
    <button
      type="button"
      disabled={decorativa}
      onClick={onPick}
      title={c.linea}
      className={cx(
        'pressable inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-[13px] ring-1 ring-inset',
        c.estado === 'reservada' ? 'bg-chispa text-on-chispa ring-transparent' : 'bg-secondary text-ink ring-line-strong',
        c.estado === 'apartada' && 'plano-late-chip',
        elegida && 'ring-2 ring-ink',
      )}
    >
      {c.nombre}
    </button>
  )
}

/**
 * El plano completo. `casas` viene ya calculado con el estado de la noche que se está viendo. Con `decorativa`
 * no hay clics ni globo (pantalla de entrada). `elegida` marca el hospedaje que se está viendo aparte.
 */
export function PlanoRancho({ casas, onPick, decorativa, tono = 'claro', elegida }: { casas: CasaEscena[]; onPick?: (id: string) => void; decorativa?: boolean; tono?: 'claro' | 'oscuro'; elegida?: string | null }) {
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
  const piezaSobre = sobre ? HOSPEDAJES.find((p) => porPieza.get(p.id)?.id === sobre) : undefined
  const casaSobre = piezaSobre ? porPieza.get(piezaSobre.id) : undefined
  const pct = (n: number, de: number, desde: number) => `${((n - desde) / de) * 100}%`

  return (
    <div style={TONOS[tono]}>
      <div className="relative w-full" style={{ aspectRatio: `${VISTA.w} / ${VISTA.h}` }}>
        <svg viewBox={`${VISTA.x} ${VISTA.y} ${VISTA.w} ${VISTA.h}`} className={cx('absolute inset-0 block h-full w-full', decorativa && 'pointer-events-none')} role="group" aria-label="Plano del rancho">
          <defs>
            <pattern id={rayas} width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.6" height="1.6" fill="transparent" />
              <rect width="0.55" height="1.6" fill="var(--pl-rayas)" />
            </pattern>
          </defs>
          {/* Terreno */}
          <polygon points={LOTE.map(([x, z]) => `${z},${-x}`).join(' ')} fill="var(--pl-lote)" stroke="var(--pl-lote-linea)" strokeWidth={0.5} strokeLinejoin="round" />
          <g className="pointer-events-none">
            {contexto
              .filter((p) => p.tipo === 'jardin' || p.tipo === 'pasto')
              .map((p) => (
                <rect key={p.id} x={U(p) - p.d / 2} y={V(p) - p.w / 2} width={p.d} height={p.w} rx={2} fill="var(--pl-pasto)" />
              ))}
            {CAMINOS.map((c, i) => (
              <polyline key={i} points={c.puntos.map(([x, z]) => `${z},${-x}`).join(' ')} fill="none" stroke="var(--pl-camino)" strokeWidth={c.ancho} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {contexto
              .filter((p) => p.tipo === 'parking' || p.tipo === 'salon' || p.tipo === 'glorieta' || p.tipo === 'juegos' || p.tipo === 'entrada')
              .map((p) =>
                p.forma === 'ellipse' ? (
                  <ellipse key={p.id} cx={U(p)} cy={V(p)} rx={p.d / 2} ry={p.w / 2} fill="none" stroke="var(--pl-otro-linea)" strokeWidth={0.4} />
                ) : (
                  <rect key={p.id} x={U(p) - p.d / 2} y={V(p) - p.w / 2} width={p.d} height={p.w} rx={0.7} fill="var(--pl-otro)" stroke="var(--pl-otro-linea)" strokeWidth={0.35} />
                ),
              )}
            {[
              { t: 'Jardín de eventos', p: PIEZAS.find((p) => p.id === 'jardin')!, dy: -9 },
              { t: 'Salón', p: PIEZAS.find((p) => p.id === 'salon')!, dy: 0 },
              { t: 'Estacionamiento', p: PIEZAS.find((p) => p.id === 'parking')!, dy: 0 },
            ].map(({ t, p, dy }) => (
              <text key={t} x={U(p)} y={V(p) + dy} textAnchor="middle" dy="0.36em" fontSize={2.3} fill="var(--pl-texto)" opacity={0.7} className="select-none">
                {t}
              </text>
            ))}
            <text x={-86} y={-21.5} fontSize={2.1} fill="var(--pl-texto)" opacity={0.8} className="select-none">
              ← Norte
            </text>
          </g>
          {HOSPEDAJES.map((p) => {
            const c = porPieza.get(p.id)
            return <Edificio key={p.id} p={p} c={c} rayas={rayas} sobre={!!c && sobre === c.id} elegida={!!c && elegida === c.id} onSobre={(on) => setSobre(on ? (c?.id ?? null) : null)} onPick={() => c && onPick?.(c.id)} decorativa={decorativa} />
          })}
        </svg>

        {/* Globo con el detalle */}
        {piezaSobre && casaSobre && !decorativa && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-[300px] -translate-x-1/2 -translate-y-full rounded-[12px] bg-night px-3.5 py-2.5 text-on-night shadow-[var(--shadow-3)]"
            style={{ left: `clamp(150px, ${pct(U(piezaSobre), VISTA.w, VISTA.x)}, calc(100% - 150px))`, top: `calc(${pct(V(piezaSobre) - piezaSobre.w / 2, VISTA.h, VISTA.y)} - 8px)` }}
          >
            <div className="text-[14px] font-semibold">{casaSobre.nombre}</div>
            <div className="text-[13px] text-on-night-soft">{casaSobre.linea}</div>
          </div>
        )}
      </div>

      {sueltos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sueltos.map((c) => (
            <Suelto key={c.id} c={c} decorativa={decorativa} elegida={elegida === c.id} onPick={() => onPick?.(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

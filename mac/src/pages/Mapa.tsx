// Mapa: el rancho visto desde arriba (el mismo plano de la página) con cada hospedaje pintado según la noche que se
// elija: ocupado, solicitud, cerrado o libre. Al tocar uno se abre su calendario.
import { useEffect, useMemo, useState } from 'react'
import { BedDouble, CalendarPlus, Pencil, Users } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa } from '@/lib/estados'
import { corta, diaCorto, noches, plural, rango } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { nocheDe, TIPO } from '@/lib/ocupacion'
import type { Cabana, ISODate } from '@/lib/tipos'
import { Button, PageHeader, Sheet, cx } from '@/components/ui'
import type { CasaEscena } from '@/components/plano'
import { MapaRancho } from '@/components/MapaRancho'
import { casasDe } from '@/lib/casas'
import { Noches } from '@/components/Noches'
import { CalendarioCabana } from '@/components/CalendarioCabana'
import { AnimatedNumber } from '@/components/AnimatedNumber'

export default function Mapa() {
  const d = useApp((s) => s.datos)!
  const [noche, setNoche] = useState<ISODate>(d.hoy)
  const [elegida, setElegida] = useState<string | null>(null)
  const [tipo, setTipo] = useState<Cabana['tipo'] | null>(null)
  useEffect(() => setNoche((n) => (n < d.hoy ? d.hoy : n)), [d.hoy])

  const casas = useMemo(() => casasDe(d, noche), [d, noche])
  const visibles = casas.filter((c) => !tipo || c.tipo === tipo)
  const cuenta = (e: CasaEscena['estado']) => casas.filter((c) => c.estado === e).length
  const cuentaTipo = (tipo: Cabana['tipo']) => casas.filter((c) => c.tipo === tipo).length
  const cabana = d.cabanas.find((c) => c.id === elegida) ?? null
  const hayHospedajes = d.cabanas.length > 0
  const elegirHospedaje = (id: string) => setElegida(id)

  return (
    <div className="app-map-page @container mx-auto min-w-0 max-w-[1440px] px-8 pt-7 pb-10">
      <PageHeader title="Mapa" />

      {!hayHospedajes ? (
        <div className="card px-8 py-12 text-center">
          <p className="text-[16px] font-semibold text-ink">Todavía no hay hospedajes</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-ink-soft">Da de alta tus cabañas, casas y habitaciones en Hospedajes para verlas aquí.</p>
          <Button className="mt-5" icon={<BedDouble size={16} />} onClick={() => (useApp.getState().ir('cabanas'), useApp.getState().editarCabana('nueva'))}>
            Ir a hospedajes
          </Button>
        </div>
      ) : (
        <div className="app-map-panel card p-5">
          <div className="app-map-summary mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <div className="app-map-date-label text-[12px] text-ink-soft">{noche === d.hoy ? 'Esta noche' : `${diaCorto(noche)} ${corta(noche)}`}</div>
              <div className="app-map-occupancy text-[24px] leading-tight font-semibold text-ink tracking-[-0.02em]">
                <AnimatedNumber value={cuenta('reservada')} /> de <AnimatedNumber value={casas.length} /> hospedajes ocupados
              </div>
            </div>
            <div className="app-map-legend flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-soft">
              <Dato clase="bg-chispa" n={cuenta('reservada')} texto="Ocupados" />
              <Dato clase="plano-late-chip bg-[color-mix(in_oklab,var(--chispa)_20%,transparent)] ring-1 ring-chispa ring-inset" n={cuenta('apartada')} texto="Solicitudes" />
              <Dato clase="rayas bg-sunken ring-1 ring-line ring-inset" n={cuenta('cerrada')} texto="Cerrados" />
              <Dato clase="bg-secondary ring-1 ring-line-strong ring-inset" n={cuenta('libre')} texto="Libres" />
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2" aria-label="Tipo de hospedaje">
            {([{ id: null, nombre: 'Todos' }, { id: 'cabana', nombre: 'Cabañas' }, { id: 'casa', nombre: 'Casas' }, { id: 'habitacion', nombre: 'Habitaciones' }] as const).map((t) => (
              <button key={t.id ?? 'todos'} type="button" aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)} className={cx('rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-colors', tipo === t.id ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:bg-wash')}>
                {t.nombre} <span className="ml-2 opacity-70">{t.id ? cuentaTipo(t.id) : casas.length}</span>
              </button>
            ))}
          </div>
          <div className="grid min-w-0 items-start gap-4 @[820px]:grid-cols-[minmax(0,1fr)_250px]">
            <div className="app-map-visual">
              <MapaRancho casas={casas} elegida={elegida} onElegir={elegirHospedaje} tipo={tipo} />
              <p className="mt-2 text-center text-[12px] text-ink-soft">Arrastra para girar · Toca un edificio para ver su calendario</p>
            </div>
            <aside className="flex h-[260px] min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface @[820px]:h-[clamp(360px,56vh,590px)]" aria-label="Elige un hospedaje">
              <div className="app-map-lodgings-heading">
                <div>
                  <h2 className="font-semibold text-ink">{tipo ? TIPO[tipo].varios : 'Hospedajes'}</h2>
                </div>
                <span className="app-map-lodgings-count">{visibles.length}</span>
              </div>
              <div className="app-map-lodgings-list">
                {visibles.map((c) => (
                  <button key={c.id} type="button" aria-pressed={elegida === c.id} title={c.linea} onClick={() => elegirHospedaje(c.id)} className="app-map-lodging">
                    <span className={cx('app-map-lodging-dot', c.estado === 'reservada' ? 'is-reserved' : c.estado === 'apartada' ? 'is-request' : c.estado === 'cerrada' ? 'is-closed' : 'is-free')} />
                    <span className="app-map-lodging-copy">
                      <strong style={{ fontSize: 14 }}>{c.nombre}</strong>
                      <small style={{ fontSize: 12 }}>{TIPO[c.tipo].uno} · {c.estado === 'reservada' ? 'Ocupada' : c.estado === 'apartada' ? 'Solicitud' : c.estado === 'cerrada' ? 'Cerrada' : 'Libre'}</small>
                    </span>
                    <span className="app-map-lodging-arrow" aria-hidden="true">›</span>
                  </button>
                ))}
                {!visibles.length && <p className="px-3 py-5 text-[13px] text-ink-soft">No hay {tipo ? TIPO[tipo].varios.toLowerCase() : 'hospedajes'} en este grupo.</p>}
              </div>
            </aside>
          </div>

          <div className="app-map-nights mt-5">
            <Noches d={d} noche={noche} onNoche={setNoche} />
          </div>
        </div>
      )}

      <Sheet open={!!cabana} onClose={() => setElegida(null)} title="Detalles del hospedaje">
        {cabana && <FichaCabana key={cabana.id} cabana={cabana} noche={noche} onCerrar={() => setElegida(null)} />}
      </Sheet>
    </div>
  )
}

function Dato({ clase, n, texto }: { clase: string; n: number; texto: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cx('h-3.5 w-3.5 rounded-[4px]', clase)} />
      <AnimatedNumber value={n} className="tabular font-semibold text-ink" />
      {texto}
    </span>
  )
}

/** Lo que se ve al tocar un hospedaje: sus datos, cómo está esa noche, su calendario y lo que viene */
function FichaCabana({ cabana, noche, onCerrar }: { cabana: Cabana; noche: ISODate; onCerrar: () => void }) {
  const d = useApp((s) => s.datos)!
  const abrir = useApp((s) => s.abrir)
  const n = nocheDe(d, cabana.id, noche)
  const proximas = d.reservaciones
    .filter((r) => r.cabana_id === cabana.id && activa(r) && r.salida > d.hoy)
    .sort((a, b) => a.llegada.localeCompare(b.llegada))
    .slice(0, 4)
  const estado =
    n.tipo === 'reservada'
      ? { t: `Ocupado · ${n.r.nombre}`, c: 'text-chispa' }
      : n.tipo === 'apartada'
        ? { t: `Solicitud de ${n.r.nombre}`, c: 'text-chispa' }
        : n.tipo === 'cerrada'
          ? { t: `Cerrado${n.b.motivo ? `: ${n.b.motivo.toLowerCase()}` : ''}`, c: 'text-ink-soft' }
          : { t: 'Libre', c: 'text-success' }
  return (
    <div className="min-w-0 pt-3 pb-2">
      <div className="flex items-start gap-4">
        <span className="flex h-[72px] w-[96px] shrink-0 items-center justify-center rounded-[10px] bg-secondary text-ink-3" aria-label="Ilustración del hospedaje">
          <BedDouble size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[24px] leading-tight font-semibold text-ink">{cabana.nombre}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-soft">
            <span>{TIPO[cabana.tipo].uno}</span>
            <span className="inline-flex items-center gap-1">
              <Users size={13} /> {plural(cabana.capacidad, 'persona', 'personas')}
            </span>
            {cabana.precio_noche ? <span className="text-[15px] font-semibold text-ink">{mxn(cabana.precio_noche)} por noche</span> : <span className="text-chispa">Sin precio</span>}
          </p>
          <p className={cx('mt-2 break-words text-[14px] font-semibold', estado.c)}>
            {noche === d.hoy ? 'Esta noche: ' : `${diaCorto(noche)} ${corta(noche)}: `}
            {estado.t}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button icon={<CalendarPlus size={16} />} onClick={() => useApp.getState().crear({ tipo: 'reservacion', cabana_id: cabana.id })}>
          Nueva reservación
        </Button>
        <Button
          variant="outline"
          icon={<Pencil size={15} />}
          onClick={() => {
            onCerrar()
            useApp.getState().ir('cabanas')
            useApp.getState().editarCabana(cabana.id)
          }}
        >
          Editar datos y precios
        </Button>
      </div>

      <div className="mt-8">
        <CalendarioCabana cabana={cabana} mesInicial={noche} />
      </div>

      <div className="mt-8">
        <h3 className="mb-2 text-[15px] font-semibold text-ink">Próximas reservaciones</h3>
        {proximas.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No hay reservaciones próximas.</p>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--r-md)] ring-1 ring-line ring-inset">
            {proximas.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => abrir(r.id)} className="pressable flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-wash">
                  <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', r.estado === 'solicitud' ? 'bg-chispa-soft' : 'bg-chispa')} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[14px] font-semibold text-ink">{r.nombre}</span>
                    <span className="block text-[13px] text-ink-soft">
                      {rango(r.llegada, r.salida)} · {plural(noches(r.llegada, r.salida), 'noche', 'noches')}
                      {r.estado === 'solicitud' ? ' · solicitud' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold tabular text-ink">{mxn(r.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

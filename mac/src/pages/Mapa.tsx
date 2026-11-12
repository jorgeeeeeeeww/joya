// Mapa: el rancho visto desde arriba (el mismo plano de la página) con cada hospedaje pintado según la noche que se
// elija: ocupado, solicitud, cerrado o libre. Al tocar uno se abre su calendario.
import { useEffect, useMemo, useState } from 'react'
import { BedDouble, CalendarPlus, Pencil, Users } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa } from '@/lib/estados'
import { corta, diaCorto, larga, noches, plural, rango } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { nocheDe, TIPO } from '@/lib/ocupacion'
import { urlFoto } from '@/lib/nube'
import type { Cabana, ISODate } from '@/lib/tipos'
import { Button, PageHeader, Sheet, cx } from '@/components/ui'
import type { CasaEscena } from '@/components/plano'
import { MapaRancho } from '@/components/MapaRancho'
import { casasDe } from '@/lib/casas'
import { Noches } from '@/components/Noches'
import { CalendarioCabana } from '@/components/CalendarioCabana'

export default function Mapa() {
  const d = useApp((s) => s.datos)!
  const [noche, setNoche] = useState<ISODate>(d.hoy)
  const [elegida, setElegida] = useState<string | null>(null)
  useEffect(() => setNoche((n) => (n < d.hoy ? d.hoy : n)), [d.hoy])

  const casas = useMemo(() => casasDe(d, noche), [d, noche])
  const cuenta = (e: CasaEscena['estado']) => casas.filter((c) => c.estado === e).length
  const cabana = d.cabanas.find((c) => c.id === elegida) ?? null
  const hayHospedajes = d.cabanas.length > 0

  return (
    <div className="mx-auto max-w-[1180px] px-8 pt-8 pb-16">
      <PageHeader
        title="Mapa"
        subtitle={noche === d.hoy ? 'Cómo está el rancho esta noche. Toca un hospedaje para ver su calendario.' : `Cómo estará el rancho el ${larga(noche)}. Toca un hospedaje para ver su calendario.`}
      />

      {!hayHospedajes ? (
        <div className="card px-8 py-12 text-center">
          <p className="text-[16px] font-medium">Todavía no hay hospedajes</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[14px] text-ink-soft">Da de alta tus cabañas y habitaciones en Cabañas para verlas aquí.</p>
          <Button className="mt-5" icon={<BedDouble size={16} />} onClick={() => (useApp.getState().ir('cabanas'), useApp.getState().editarCabana('nueva'))}>
            Ir a Cabañas
          </Button>
        </div>
      ) : (
        <div className="card p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <div className="text-[13px] text-ink-3">{noche === d.hoy ? 'Esta noche' : `${diaCorto(noche)} ${corta(noche)}`}</div>
              <div className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">
                {cuenta('reservada')} de {casas.length} ocupados
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-soft">
              <Dato clase="bg-chispa" n={cuenta('reservada')} texto="Ocupados" />
              <Dato clase="plano-late-chip bg-[color-mix(in_oklab,var(--chispa)_20%,transparent)] ring-1 ring-chispa ring-inset" n={cuenta('apartada')} texto="Solicitudes" />
              <Dato clase="rayas bg-sunken ring-1 ring-line ring-inset" n={cuenta('cerrada')} texto="Cerrados" />
              <Dato clase="bg-secondary ring-1 ring-line-strong ring-inset" n={cuenta('libre')} texto="Libres" />
            </div>
          </div>

          <div className="rounded-[var(--r-md)] bg-sunken p-2 ring-1 ring-line ring-inset">
            <MapaRancho casas={casas} elegida={elegida} onElegir={setElegida} />
          </div>

          <div className="mt-6">
            <Noches d={d} noche={noche} onNoche={setNoche} />
          </div>
        </div>
      )}

      <Sheet open={!!cabana} onClose={() => setElegida(null)} header={<span />}>
        {cabana && <FichaCabana key={cabana.id} cabana={cabana} noche={noche} onCerrar={() => setElegida(null)} />}
      </Sheet>
    </div>
  )
}

function Dato({ clase, n, texto }: { clase: string; n: number; texto: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cx('h-3.5 w-3.5 rounded-[4px]', clase)} />
      <span className="tabular font-semibold text-ink">{n}</span>
      {texto}
    </span>
  )
}

/** Lo que se ve al tocar un hospedaje: sus datos, cómo está esa noche, su calendario y lo que viene */
function FichaCabana({ cabana, noche, onCerrar }: { cabana: Cabana; noche: ISODate; onCerrar: () => void }) {
  const d = useApp((s) => s.datos)!
  const abrir = useApp((s) => s.abrir)
  const n = nocheDe(d, cabana.id, noche)
  const foto = cabana.fotos[0]
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
    <div className="scroll-area flex-1 overflow-y-auto px-7 pt-7 pb-8">
      <div className="flex items-start gap-4">
        {foto ? (
          <img src={urlFoto(foto.ruta)} alt="" className="h-[72px] w-[96px] shrink-0 rounded-[10px] object-cover" />
        ) : (
          <span className="flex h-[72px] w-[96px] shrink-0 items-center justify-center rounded-[10px] bg-secondary text-ink-3">
            <BedDouble size={24} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="heading text-[24px] leading-tight">{cabana.nombre}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-soft">
            <span>{TIPO[cabana.tipo].uno}</span>
            <span className="inline-flex items-center gap-1">
              <Users size={13} /> {plural(cabana.capacidad, 'persona', 'personas')}
            </span>
            {cabana.precio_noche ? <span>{mxn(cabana.precio_noche)} por noche</span> : <span className="text-chispa">Sin precio</span>}
          </p>
          <p className={cx('mt-2 text-[14px] font-medium', estado.c)}>
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
        <h3 className="mb-2 text-[15px] font-semibold">Lo que viene</h3>
        {proximas.length === 0 ? (
          <p className="text-[14px] text-ink-soft">No hay reservaciones próximas.</p>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--r-md)] ring-1 ring-line ring-inset">
            {proximas.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => abrir(r.id)} className="pressable flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-wash">
                  <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', r.estado === 'solicitud' ? 'bg-chispa-soft' : 'bg-chispa')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{r.nombre}</span>
                    <span className="block text-[13px] text-ink-soft">
                      {rango(r.llegada, r.salida)} · {plural(noches(r.llegada, r.salida), 'noche', 'noches')}
                      {r.estado === 'solicitud' ? ' · solicitud' : ''}
                    </span>
                  </span>
                  <span className="text-[13px] font-semibold tabular text-key">{mxn(r.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

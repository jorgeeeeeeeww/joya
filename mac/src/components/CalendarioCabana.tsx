// El calendario de un solo hospedaje, mes por mes. Cada día se ve de otra manera según lo que pase esa noche:
//   · ocupado   → color fuerte lleno, con el nombre de quien llega ese día
//   · solicitud → contorno punteado que late
//   · cerrado   → rayado
//   · libre     → vacío
// Tocar una reservación abre su detalle; tocar un día libre empieza una reservación nueva para ese hospedaje.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { nocheDe } from '@/lib/ocupacion'
import { dia, diaSemana, inicioDeMes, larga, masDias, mesLargo } from '@/lib/fechas'
import type { Cabana, ISODate } from '@/lib/tipos'
import { cx } from './ui'

const SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const sumaMes = (iso: ISODate, n: number): ISODate => {
  const [a, m] = iso.split('-').map(Number) as [number, number]
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}

export function CalendarioCabana({ cabana, mesInicial }: { cabana: Cabana; mesInicial?: ISODate }) {
  const d = useApp((s) => s.datos)!
  const abrir = useApp((s) => s.abrir)
  const crear = useApp((s) => s.crear)
  const [mes, setMes] = useState<ISODate>(inicioDeMes(mesInicial ?? d.hoy))

  const dias = useMemo(() => {
    // Semana que empieza en lunes
    const primero = diaSemana(mes) === 0 ? 6 : diaSemana(mes) - 1
    const [a, m] = mes.split('-').map(Number) as [number, number]
    const total = new Date(Date.UTC(a, m, 0)).getUTCDate()
    return [...Array.from({ length: primero }, () => null), ...Array.from({ length: total }, (_, i) => masDias(mes, i))]
  }, [mes])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold capitalize text-ink">
          {mesLargo(mes)} {mes.slice(0, 4)}
        </h3>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Mes anterior" onClick={() => setMes(sumaMes(mes, -1))} className="pressable flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => setMes(inicioDeMes(d.hoy))} className="pressable h-8 rounded-full px-3 text-[13px] font-medium text-ink-soft hover:bg-wash hover:text-ink">
            Hoy
          </button>
          <button type="button" aria-label="Mes siguiente" onClick={() => setMes(sumaMes(mes, 1))} className="pressable flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-medium text-ink-soft">
        {SEMANA.map((s, i) => (
          <div key={i} className="pb-1">
            {s}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map((iso, i) => {
          if (!iso) return <div key={i} />
          const n = nocheDe(d, cabana.id, iso)
          const pasado = iso < d.hoy
          const esHoy = iso === d.hoy
          const llega = (n.tipo === 'reservada' || n.tipo === 'apartada') && n.r.llegada === iso
          const base = 'relative flex h-[58px] min-w-0 flex-col items-center justify-between overflow-hidden rounded-[8px] px-1 py-1.5 text-center'
          const comun = cx(esHoy && 'ring-2 ring-ink ring-offset-1 ring-offset-surface', pasado && 'opacity-55')
          const numero = <span className={cx('text-[14px] leading-none font-semibold tabular', n.tipo === 'reservada' ? 'text-on-chispa' : 'text-ink')}>{dia(iso)}</span>
          if (n.tipo === 'reservada' || n.tipo === 'apartada') {
            const solicitud = n.tipo === 'apartada'
            return (
              <button
                key={i}
                type="button"
                onClick={() => abrir(n.r.id)}
                title={`${larga(iso)} · ${n.r.nombre}${solicitud ? ' · solicitud' : ''}`}
                className={cx(base, comun, 'pressable cursor-pointer', solicitud ? 'plano-late-chip bg-[color-mix(in_oklab,var(--chispa)_16%,transparent)] ring-1 ring-chispa ring-inset' : 'bg-chispa text-on-chispa')}
                style={solicitud ? { outlineStyle: 'dashed' } : undefined}
              >
                {numero}
                <span className={cx('w-full truncate text-[12px] leading-tight', solicitud ? 'text-chispa' : 'text-on-chispa')}>{llega ? n.r.nombre.split(' ')[0] : ''}</span>
              </button>
            )
          }
          if (n.tipo === 'cerrada') {
            return (
              <div key={i} title={n.b.motivo ? `Cerrado: ${n.b.motivo}` : 'Cerrado'} className={cx(base, comun, 'rayas bg-sunken text-ink-soft ring-1 ring-line ring-inset')}>
                {numero}
                <span className="text-[12px] leading-tight">Cerrado</span>
              </div>
            )
          }
          return (
            <button
              key={i}
              type="button"
              disabled={pasado}
              onClick={() => crear({ tipo: 'reservacion', cabana_id: cabana.id, llegada: iso, salida: masDias(iso, 1) })}
              title={`${larga(iso)} · Libre: tocar para reservar`}
              className={cx(base, comun, 'bg-secondary ring-1 ring-line ring-inset', !pasado && 'pressable cursor-pointer hover:ring-line-strong')}
            >
              {numero}
              <span />
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-soft">
        <Leyenda clase="bg-chispa" texto="Ocupado" />
        <Leyenda clase="bg-[color-mix(in_oklab,var(--chispa)_16%,transparent)] ring-1 ring-chispa ring-inset" texto="Solicitud" />
        <Leyenda clase="rayas bg-sunken ring-1 ring-line ring-inset" texto="Cerrado" />
        <Leyenda clase="bg-secondary ring-1 ring-line ring-inset" texto="Libre" />
      </div>
    </div>
  )
}

function Leyenda({ clase, texto }: { clase: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('h-3 w-3 rounded-[4px]', clase)} />
      {texto}
    </span>
  )
}

// Las próximas 30 noches como barras: qué tan ocupado está el rancho cada noche. Se arrastra, se hace clic o se usan
// las flechas para elegir otra noche.
import { useMemo, useRef } from 'react'
import type { Datos, ISODate } from '@/lib/tipos'
import { corta, dia, diaCorto, larga, masDias } from '@/lib/fechas'
import { nocheDe } from '@/lib/ocupacion'
import { cx } from './ui'

export const NOCHES = 30

export function Noches({ d, noche, onNoche }: { d: Datos; noche: ISODate; onNoche: (iso: ISODate) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const dias = useMemo(() => Array.from({ length: NOCHES }, (_, i) => masDias(d.hoy, i)), [d.hoy])
  const nivel = useMemo(
    () =>
      dias.map((iso) => {
        let ocup = 0
        for (const c of d.cabanas) {
          const n = nocheDe(d, c.id, iso)
          if (n.tipo === 'reservada') ocup += 1
          else if (n.tipo === 'apartada') ocup += 0.5
        }
        return d.cabanas.length ? ocup / d.cabanas.length : 0
      }),
    [d, dias],
  )
  const desde = (x: number) => {
    const r = ref.current!.getBoundingClientRect()
    const i = Math.max(0, Math.min(NOCHES - 1, Math.floor(((x - r.left) / r.width) * NOCHES)))
    onNoche(dias[i]!)
  }
  const sel = dias.indexOf(noche)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12px] text-ink-3">
        <span>Desliza para ver otra noche</span>
        {noche !== d.hoy && (
          <button onClick={() => onNoche(d.hoy)} className="font-semibold text-chispa hover:underline">
            Volver a esta noche
          </button>
        )}
      </div>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Noche que se ve en el mapa"
        aria-valuemin={0}
        aria-valuemax={NOCHES - 1}
        aria-valuenow={sel}
        aria-valuetext={larga(noche)}
        className="flex h-14 cursor-ew-resize touch-none items-end gap-[3px] rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          desde(e.clientX)
        }}
        onPointerMove={(e) => e.buttons === 1 && desde(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onNoche(dias[Math.min(NOCHES - 1, sel + 1)]!)
          else if (e.key === 'ArrowLeft') onNoche(dias[Math.max(0, sel - 1)]!)
          else return
          e.preventDefault()
        }}
      >
        {dias.map((iso, i) => {
          const finde = [5, 6].includes(new Date(iso + 'T12:00:00Z').getUTCDay())
          return (
            <div key={iso} className="relative flex h-full flex-1 flex-col items-center justify-end" title={`${diaCorto(iso)} ${corta(iso)}: ${Math.round(nivel[i]! * 100)} % ocupado`}>
              <div className={cx('w-full rounded-[3px] transition-[height,background-color] duration-[var(--dur-3)]', i === sel ? 'bg-chispa' : nivel[i]! > 0 ? 'bg-[color-mix(in_oklab,var(--chispa)_45%,transparent)]' : 'bg-[color-mix(in_oklab,var(--ink)_10%,transparent)]')} style={{ height: `${10 + nivel[i]! * 72}%` }} />
              <span className={cx('mt-1 text-[11px] leading-none tabular', i === sel ? 'font-semibold text-ink' : finde ? 'text-ink-soft' : 'text-ink-3')}>{dia(iso)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

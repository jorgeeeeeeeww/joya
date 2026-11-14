// Selector de noche: barras de ocupación, navegación diaria y acceso directo a cualquier fecha.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Datos, ISODate } from '@/lib/tipos'
import { corta, dia, diaCorto, larga, masDias } from '@/lib/fechas'
import { nocheDe } from '@/lib/ocupacion'
import { Button, cx } from './ui'

export const NOCHES = 30

export function Noches({ d, noche, onNoche }: { d: Datos; noche: ISODate; onNoche: (iso: ISODate) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inicio, setInicio] = useState<ISODate>(d.hoy)
  const dias = useMemo(() => Array.from({ length: NOCHES }, (_, i) => masDias(inicio, i)), [inicio])
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
  const elegir = (iso: ISODate) => {
    if (iso < inicio || iso >= masDias(inicio, NOCHES)) setInicio(masDias(iso, -10))
    onNoche(iso)
  }
  useEffect(() => {
    if (noche < inicio || noche >= masDias(inicio, NOCHES)) setInicio(masDias(noche, -10))
  }, [noche, inicio])
  const desde = (x: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const i = Math.max(0, Math.min(NOCHES - 1, Math.floor(((x - r.left) / r.width) * NOCHES)))
    if (dias[i]) elegir(dias[i]!)
  }
  const sel = dias.indexOf(noche)
  const ocupacion = Math.round((nivel[sel] ?? 0) * 100)
  return (
    <div className="app-map-night-picker">
      <div className="app-map-night-toolbar">
        <div className="app-map-night-controls">
          <Button variant="outline" size="icon-sm" aria-label="Noche anterior" title="Noche anterior" onClick={() => elegir(masDias(noche, -1))}>
            <ChevronLeft size={16} />
          </Button>
          <label className="app-map-night-date">
            <CalendarDays size={15} aria-hidden="true" />
            <span className="sr-only">Elegir fecha para el mapa</span>
            <input type="date" value={noche} onChange={(e) => e.currentTarget.value && elegir(e.currentTarget.value as ISODate)} />
          </label>
          <Button variant="outline" size="icon-sm" aria-label="Noche siguiente" title="Noche siguiente" onClick={() => elegir(masDias(noche, 1))}>
            <ChevronRight size={16} />
          </Button>
          <Button variant="secondary" size="sm" aria-pressed={noche === d.hoy} onClick={() => elegir(d.hoy)}>
            Hoy
          </Button>
        </div>
        <div className="app-map-night-selected">
          <strong>{larga(noche)}</strong>
          <span>{ocupacion}% de ocupación</span>
        </div>
      </div>
      <div className="app-map-night-caption">
        <span>Ocupación por noche</span>
        <span>Arrastra las barras o elige una fecha</span>
      </div>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Noche que se ve en el mapa"
        aria-valuemin={0}
        aria-valuemax={NOCHES - 1}
        aria-valuenow={Math.max(0, sel)}
        aria-valuetext={larga(noche)}
        className="app-map-night-bars"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          desde(e.clientX)
        }}
        onPointerMove={(e) => e.buttons === 1 && desde(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') elegir(masDias(noche, 1))
          else if (e.key === 'ArrowLeft') elegir(masDias(noche, -1))
          else return
          e.preventDefault()
        }}
      >
        {dias.map((iso, i) => {
          const finde = [5, 6].includes(new Date(iso + 'T12:00:00Z').getUTCDay())
          return (
            <div key={iso} className="app-map-night-bar" title={`${diaCorto(iso)} ${corta(iso)}: ${Math.round(nivel[i]! * 100)} % ocupado`}>
              <div
                className={cx('app-map-night-bar-fill', i === sel && 'is-selected', finde && 'is-weekend')}
                style={{ height: `${10 + nivel[i]! * 72}%` }}
              />
              <span className={cx(i === sel && 'is-selected')}>{dia(iso)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

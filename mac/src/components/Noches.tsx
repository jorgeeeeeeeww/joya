// La fecha del mapa se elige con botones o calendario, sin un deslizador.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Datos, ISODate } from '@/lib/tipos'
import { larga, masDias } from '@/lib/fechas'
import { Button } from './ui'

export function Noches({ d, noche, onNoche }: { d: Datos; noche: ISODate; onNoche: (iso: ISODate) => void }) {
  const hasta = masDias(d.hasta || masDias(d.hoy, 540), -1)
  return <div className="flex flex-wrap items-center justify-between gap-3">
    <div><p className="text-[12px] text-ink-soft">Noche que muestra el mapa</p><p className="mt-1 text-[14px] font-semibold capitalize text-ink" aria-live="polite">{larga(noche)}</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon-sm" variant="outline" aria-label="Noche anterior" disabled={noche <= d.hoy} onClick={() => onNoche(masDias(noche, -1))}><ChevronLeft size={16} /></Button>
      <input type="date" aria-label="Fecha del mapa" min={d.hoy} max={hasta} value={noche} onChange={e => { const fecha = e.target.value; if (fecha && fecha >= d.hoy && fecha <= hasta) onNoche(fecha) }} className="min-h-9 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink" />
      <Button size="icon-sm" variant="outline" aria-label="Noche siguiente" disabled={noche >= hasta} onClick={() => onNoche(masDias(noche, 1))}><ChevronRight size={16} /></Button>
      <Button size="sm" variant="outline" disabled={noche === d.hoy} onClick={() => onNoche(d.hoy)}>Esta noche</Button>
    </div>
  </div>
}

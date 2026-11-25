// Ficha de unas noches que apartó el dueño, para abrirla desde Hoy, el Calendario o el Mapa: de quién es,
// qué noches y «Quitar apartado» (con «Deshacer», como todo en la app). No es una reservación: sin pagos ni mensajes.
import { useRef, useState } from 'react'
import { CalendarCheck, X } from 'lucide-react'
import { useApp } from '@/lib/store'
import { notaDe } from '@/lib/apartados'
import { quitarApartado } from '@/lib/acciones'
import { nombreDe } from '@/lib/ocupacion'
import { delAl, noches, plural } from '@/lib/fechas'
import type { Bloqueo } from '@/lib/tipos'
import { Button, Sheet } from './ui'

export function HojaApartado({ apartado, onCerrar }: { apartado: Bloqueo | null; onCerrar: () => void }) {
  const d = useApp((s) => s.datos)
  // Mientras la hoja se va (animación de salida) sigue mostrando lo último
  const ultimo = useRef(apartado)
  if (apartado) ultimo.current = apartado
  const b = ultimo.current
  const [quitando, setQuitando] = useState(false)
  const cerrar = () => !quitando && onCerrar()
  return (
    <Sheet open={!!apartado} onClose={cerrar} title="Fechas apartadas" subtitle={b ? nombreDe(d, b.cabana_id) : undefined}>
      {b && (
        <div className="space-y-5">
          <div>
            <p className="text-[17px] font-semibold text-ink">{delAl(b.inicio, b.fin)}</p>
            <p className="mt-1 text-[14px] text-ink-soft">{plural(noches(b.inicio, b.fin), 'noche', 'noches')} · el día de salida queda libre</p>
          </div>
          <p className="rounded-[10px] bg-[var(--violet-soft,#f2edfa)] px-4 py-3 text-[15px] font-semibold text-[var(--violet-ink,#695095)]">{notaDe(b) ?? 'Sin nombre ni nota'}</p>
          <p className="text-[13px] leading-relaxed text-ink-soft">Las apartó el dueño en «Apartar fechas». En la página se ven ocupadas. No es una reservación: no tiene código, pagos ni mensajes.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              icon={<X size={16} />}
              loading={quitando}
              onClick={async () => {
                setQuitando(true)
                try {
                  if (await quitarApartado(b)) onCerrar()
                } finally {
                  setQuitando(false)
                }
              }}
            >
              Quitar apartado
            </Button>
            <Button
              variant="ghost"
              icon={<CalendarCheck size={16} />}
              onClick={() => {
                onCerrar()
                useApp.getState().ir('apartar')
              }}
            >
              Ir a Apartar fechas
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

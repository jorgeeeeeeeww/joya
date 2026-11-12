// Hoy: lo que hay que atender (solicitudes con su cuenta regresiva), quién llega y quién se va, y un resumen de la
// noche con la puerta al mapa.
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Check, LogIn, LogOut, MessageCircle, Plus, Users } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa } from '@/lib/estados'
import { cuando, larga, masDias, noches, plural, rango, venceEn } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { nombreDe } from '@/lib/ocupacion'
import { cambiarEstado } from '@/lib/acciones'
import type { Datos, Reservacion } from '@/lib/tipos'
import { fadeRise, stagger } from '@/lib/motion'
import { Badge, Button, PageHeader, cx } from '@/components/ui'
import { ListoParaAbrir } from '@/components/Listo'
import { casasDe } from '@/lib/casas'
import { avisarPorWhatsApp, useMenuReservacion } from '@/components/menuReservacion'
import { ORIGEN } from '@/lib/estados'

export default function Hoy() {
  const d = useApp((s) => s.datos)!
  const [, setTic] = useState(0)
  const { menu, abrirMenu } = useMenuReservacion()
  // Las cuentas regresivas se actualizan solas cada minuto
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const casas = casasDe(d, d.hoy)
  const ocupados = casas.filter((c) => c.estado === 'reservada').length
  const apartados = casas.filter((c) => c.estado === 'apartada').length
  const porAtender = d.reservaciones.filter((r) => r.estado === 'solicitud' && activa(r)).sort((a, b) => (a.vence ?? '').localeCompare(b.vence ?? ''))
  const llegan = d.reservaciones.filter((r) => r.llegada === d.hoy && activa(r))
  const salen = d.reservaciones.filter((r) => r.salida === d.hoy && activa(r))
  const semana = d.reservaciones.filter((r) => r.llegada > d.hoy && r.llegada <= masDias(d.hoy, 7) && activa(r)).sort((a, b) => a.llegada.localeCompare(b.llegada))
  const hayHospedajes = d.cabanas.length > 0

  const resumen = [porAtender.length ? plural(porAtender.length, 'solicitud por atender', 'solicitudes por atender') : null, llegan.length ? plural(llegan.length, 'llegada', 'llegadas') : null, salen.length ? plural(salen.length, 'salida', 'salidas') : null].filter(Boolean)

  return (
    <div className="mx-auto max-w-[1180px] px-8 pt-8 pb-16">
      <PageHeader title={<span className="first-letter:uppercase">{larga(d.hoy)}</span>} subtitle={resumen.length ? resumen.join(' · ') : 'Todo al día: nada por atender.'} />

      <ListoParaAbrir />

      {/* La noche de hoy, en una línea, con la puerta al mapa */}
      <button
        type="button"
        onClick={() => (hayHospedajes ? useApp.getState().ir('mapa') : (useApp.getState().ir('cabanas'), useApp.getState().editarCabana('nueva')))}
        className="card lift group mb-6 flex w-full items-center gap-5 px-6 py-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-ink-3">Esta noche</div>
          <div className="mt-0.5 text-[22px] leading-tight font-semibold tracking-[-0.02em]">
            {hayHospedajes ? (
              <>
                {ocupados} de {d.cabanas.length} ocupados
                {apartados > 0 && <span className="font-medium text-ink-soft"> · {plural(apartados, 'solicitud', 'solicitudes')} apartando fechas</span>}
              </>
            ) : (
              'Todavía no hay hospedajes'
            )}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[14px] font-medium text-chispa">
          {hayHospedajes ? 'Ver el mapa' : (<><Plus size={15} /> Agregar el primero</>)}
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>

      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-6">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]">
            Por atender
            {porAtender.length > 0 && <Badge tone="peach">{porAtender.length}</Badge>}
          </h2>
          {porAtender.length === 0 ? (
            <div className="card px-6 py-8 text-center">
              <p className="text-[15px] font-medium">No hay solicitudes esperando</p>
              <p className="mt-1 text-[13px] text-ink-soft">Cuando alguien pida fechas en la página, aparece aquí al instante con su cuenta regresiva.</p>
            </div>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-3">
              {porAtender.map((r) => (
                <motion.div key={r.id} variants={fadeRise}>
                  <Solicitud r={r} d={d} onMenu={(e) => abrirMenu(e, r)} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        <section className="flex flex-col gap-6">
          <Lista titulo="Llegan hoy" icon={<LogIn size={16} />} vacio="Nadie llega hoy" items={llegan} d={d} detalle={(r) => `${plural(r.huespedes, 'persona', 'personas')}${r.hora_llegada ? ` · como a las ${r.hora_llegada}` : d.ajustes.hora_llegada ? ` · desde las ${d.ajustes.hora_llegada}` : ''}`} onMenu={abrirMenu} />
          <Lista titulo="Se van hoy" icon={<LogOut size={16} />} vacio="Nadie se va hoy" items={salen} d={d} detalle={(r) => (r.total - r.pagado > 0 ? `Falta cobrar ${mxn(r.total - r.pagado)}` : 'Todo pagado') + (d.ajustes.hora_salida ? ` · salida a las ${d.ajustes.hora_salida}` : '')} onMenu={abrirMenu} />
          {semana.length > 0 && <Lista titulo="Esta semana" icon={<Users size={16} />} vacio="" items={semana} d={d} detalle={(r) => `Llega ${cuando(r.llegada, d.hoy)} · ${plural(noches(r.llegada, r.salida), 'noche', 'noches')}`} onMenu={abrirMenu} />}
        </section>
      </div>

      {menu}
    </div>
  )
}

/** Una solicitud con su cuenta regresiva: el anillo se vacía conforme se acaba el apartado */
function Solicitud({ r, d, onMenu }: { r: Reservacion; d: Datos; onMenu: (e: React.MouseEvent) => void }) {
  const v = venceEn(r.vence)
  const total = d.ajustes.horas_apartado * 3600_000
  const resta = r.vence ? Math.max(0, new Date(r.vence).getTime() - Date.now()) : total
  const fr = Math.min(1, resta / total)
  const [ocupado, setOcupado] = useState(false)
  return (
    <article onContextMenu={onMenu} onClick={() => useApp.getState().abrir(r.id)} className="card lift group flex cursor-pointer items-center gap-4 p-4 text-left">
      <div className="relative h-[58px] w-[58px] shrink-0" title={v?.texto}>
        <svg viewBox="0 0 58 58" className="h-full w-full -rotate-90">
          <circle cx="29" cy="29" r="25" fill="none" stroke="var(--sunken)" strokeWidth="5" />
          <motion.circle cx="29" cy="29" r="25" fill="none" stroke={v?.urgente ? 'var(--chispa)' : 'var(--chispa-soft)'} strokeWidth="5" strokeLinecap="round" strokeDasharray={157} initial={{ strokeDashoffset: 157 }} animate={{ strokeDashoffset: 157 * (1 - fr) }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
        </svg>
        <span className={cx('absolute inset-0 flex flex-col items-center justify-center text-center leading-none', v?.urgente ? 'text-chispa' : 'text-ink')}>
          <span className="text-[15px] font-semibold tabular">{resta >= 3600_000 ? Math.round(resta / 3600_000) : Math.round(resta / 60_000)}</span>
          <span className="mt-0.5 text-[10px] text-ink-3">{resta >= 3600_000 ? 'horas' : 'min'}</span>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-semibold">{r.nombre}</span>
          <span className="text-[13px] text-ink-3">{ORIGEN[r.origen]}</span>
        </div>
        <div className="mt-0.5 text-[14px] text-ink-soft">
          {nombreDe(d, r.cabana_id)} · {rango(r.llegada, r.salida)} · {plural(r.huespedes, 'persona', 'personas')}
        </div>
        <div className="mt-1 text-[13px]">
          <span className="font-semibold text-key">{mxn(r.total)}</span>
          {r.anticipo > 0 && <span className="text-detail"> · anticipo {mxn(r.anticipo)}</span>}
          {r.pagado > 0 && <span className="text-detail"> · pagó {mxn(r.pagado)}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          icon={<Check size={15} strokeWidth={2} />}
          loading={ocupado}
          onClick={async () => {
            setOcupado(true)
            await cambiarEstado(r, 'confirmada')
            setOcupado(false)
          }}
        >
          Confirmar
        </Button>
        {r.telefono && (
          <Button size="sm" variant="ghost" icon={<MessageCircle size={15} />} onClick={() => void avisarPorWhatsApp(r.id)}>
            WhatsApp
          </Button>
        )}
      </div>
    </article>
  )
}

function Lista({ titulo, icon, vacio, items, d, detalle, onMenu }: { titulo: string; icon: React.ReactNode; vacio: string; items: Reservacion[]; d: Datos; detalle: (r: Reservacion) => string; onMenu: (e: React.MouseEvent, r: Reservacion) => void }) {
  return (
    <div>
      <h2 className="mb-2.5 flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
        <span className="text-ink-3">{icon}</span>
        {titulo}
      </h2>
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-3">{vacio}</p>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {items.map((r) => (
            <button key={r.id} onClick={() => useApp.getState().abrir(r.id)} onContextMenu={(e) => onMenu(e, r)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-wash">
              <span className={cx('h-2 w-2 shrink-0 rounded-full', r.estado === 'pagada' ? 'bg-sage' : r.estado === 'solicitud' ? 'bg-peach' : 'bg-sky')} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">{r.nombre}</span>
                <span className="block text-[13px] text-ink-soft">
                  {nombreDe(d, r.cabana_id)} · {detalle(r)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

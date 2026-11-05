// Hoy: lo que hay que atender, quién llega y quién se va, y el rancho de noche con los hospedajes
// ocupados encendidos. Abajo de la escena se desliza por las próximas noches.
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Check, LogIn, LogOut, MailWarning, MessageCircle, Moon, Plus, Users } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa } from '@/lib/estados'
import { cuando, larga, masDias, noches, plural, rango, venceEn, corta, diaCorto, dia } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { nocheDe, nombreDe } from '@/lib/ocupacion'
import { cambiarEstado } from '@/lib/acciones'
import type { Datos, ISODate, Reservacion } from '@/lib/tipos'
import { fadeRise, stagger } from '@/lib/motion'
import { Badge, Button, PageHeader, cx } from '@/components/ui'
import { NightSlab } from '@/components/step1'
import { RanchoNoche, type CasaEscena } from '@/components/escena'
import { avisarPorWhatsApp, useMenuReservacion } from '@/components/menuReservacion'
import { ORIGEN } from '@/lib/estados'

const NOCHES = 30

function casasDe(d: Datos, noche: ISODate): CasaEscena[] {
  return d.cabanas.map((c) => {
    const n = nocheDe(d, c.id, noche)
    const llega = d.reservaciones.some((r) => r.cabana_id === c.id && r.llegada === noche && activa(r))
    let linea = 'Libre esta noche'
    if (n.tipo === 'reservada' || n.tipo === 'apartada') {
      const quien = n.r.nombre
      const sale = noches(noche, n.r.salida) === 1 ? 'se va mañana' : `se va ${cuando(n.r.salida, noche)}`
      linea = n.tipo === 'apartada' ? `Solicitud de ${quien} · ${venceEn(n.r.vence)?.texto ?? 'apartada'}` : `${quien} · ${n.r.llegada === noche ? 'llega este día' : sale}`
    } else if (n.tipo === 'cerrada') linea = `Cerrada${n.b.motivo ? `: ${n.b.motivo.toLowerCase()}` : ''}`
    return { id: c.id, nombre: c.nombre, tipo: c.tipo, estado: n.tipo, linea, llega }
  })
}

export default function Hoy() {
  const d = useApp((s) => s.datos)!
  const [noche, setNoche] = useState(d.hoy)
  const [, setTic] = useState(0)
  const { menu, abrirMenu } = useMenuReservacion()
  // Las cuentas regresivas se actualizan solas cada minuto
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => setNoche((n) => (n < d.hoy ? d.hoy : n)), [d.hoy])

  const casas = useMemo(() => casasDe(d, noche), [d, noche])
  const encendidas = casas.filter((c) => c.estado === 'reservada').length
  const apartadas = casas.filter((c) => c.estado === 'apartada').length
  const porAtender = d.reservaciones.filter((r) => r.estado === 'solicitud' && activa(r)).sort((a, b) => (a.vence ?? '').localeCompare(b.vence ?? ''))
  const llegan = d.reservaciones.filter((r) => r.llegada === d.hoy && activa(r))
  const salen = d.reservaciones.filter((r) => r.salida === d.hoy && activa(r))
  const semana = d.reservaciones.filter((r) => r.llegada > d.hoy && r.llegada <= masDias(d.hoy, 7) && activa(r)).sort((a, b) => a.llegada.localeCompare(b.llegada))
  const hayHospedajes = d.cabanas.length > 0

  const resumen = [porAtender.length ? plural(porAtender.length, 'solicitud por atender', 'solicitudes por atender') : null, llegan.length ? plural(llegan.length, 'llegada', 'llegadas') : null, salen.length ? plural(salen.length, 'salida', 'salidas') : null].filter(Boolean)

  const elegir = (id: string) => {
    const n = nocheDe(d, id, noche)
    if (n.tipo === 'reservada' || n.tipo === 'apartada') useApp.getState().abrir(n.r.id)
    else if (n.tipo === 'libre') useApp.getState().crear({ tipo: 'reservacion', cabana_id: id, llegada: noche, salida: masDias(noche, 1) })
    else useApp.getState().ir('calendario')
  }

  return (
    <div className="mx-auto max-w-[1180px] px-8 pt-9 pb-16">
      <PageHeader title={<span className="first-letter:uppercase">{larga(d.hoy)}</span>} subtitle={resumen.length ? resumen.join(' · ') : 'Todo al día: nada por atender.'} />

      {!d.ajustes.reservas_web && hayHospedajes && (
        <Aviso icon={<Moon size={17} />} titulo="La página todavía no recibe reservaciones" texto="Cuando tengas listos los precios, la CLABE y las políticas, enciéndelas en Ajustes." accion="Ir a Ajustes" onClick={() => useApp.getState().ir('ajustes')} />
      )}
      {d.avisos_sin_enviar > 0 && <Aviso icon={<MailWarning size={17} />} titulo={plural(d.avisos_sin_enviar, 'correo no se pudo mandar', 'correos no se pudieron mandar')} texto="Revisa que el correo de avisos esté configurado en la nube (Resend). Las solicitudes sí llegaron aquí." />}

      {/* El rancho de noche */}
      <NightSlab className="mb-8" luzSize="clamp(44px, 5vw, 76px)" luzClassName="absolute right-[5%] top-[9%]" scene={<span />}>
        <div className="px-8 pt-7">
          <div className="text-[13px] font-medium text-on-night-soft">{noche === d.hoy ? 'Esta noche' : `La noche del ${diaCorto(noche)} ${corta(noche)}`}</div>
          <div className="mt-1 text-[clamp(1.5rem,1.1rem+1.2vw,2.1rem)] font-semibold tracking-[-0.02em] text-on-night">
            {hayHospedajes ? (
              <>
                {encendidas} de {d.cabanas.length} {d.cabanas.length === 1 ? 'encendida' : 'encendidas'}
                {apartadas > 0 && <span className="text-on-night-soft"> · {plural(apartadas, 'apartada', 'apartadas')}</span>}
              </>
            ) : (
              'Todavía no hay hospedajes'
            )}
          </div>
        </div>
        {hayHospedajes ? (
          <RanchoNoche casas={casas} onPick={elegir} />
        ) : (
          <div className="px-8 pt-6 pb-10">
            <p className="max-w-[46ch] text-[15px] text-on-night-soft">Da de alta tus cabañas, casas y habitaciones para verlas aquí encendidas las noches que tengan huéspedes.</p>
            <Button variant="luz" className="mt-5" icon={<Plus size={16} />} onClick={() => (useApp.getState().ir('cabanas'), useApp.getState().editarCabana('nueva'))}>
              Agregar el primer hospedaje
            </Button>
          </div>
        )}
        {hayHospedajes && <Noches d={d} noche={noche} onNoche={setNoche} />}
      </NightSlab>

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

function Aviso({ icon, titulo, texto, accion, onClick }: { icon: React.ReactNode; titulo: string; texto: string; accion?: string; onClick?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3.5 rounded-[14px] bg-butter-soft px-4 py-3">
      <span className="text-butter-ink">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-butter-ink">{titulo}</div>
        <div className="text-[13px] text-ink-soft">{texto}</div>
      </div>
      {accion && (
        <Button size="sm" variant="outline" iconRight={<ArrowRight size={14} />} onClick={onClick}>
          {accion}
        </Button>
      )}
    </div>
  )
}

/** Las próximas 30 noches como barras de luz: se arrastra o se hace clic para ver otra noche en la escena */
function Noches({ d, noche, onNoche }: { d: Datos; noche: ISODate; onNoche: (iso: ISODate) => void }) {
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
    <div className="interfaz relative px-8 pt-1 pb-6">
      <div className="mb-2 flex items-center justify-between text-[12px] text-on-night-soft">
        <span>Desliza para ver las próximas noches</span>
        {noche !== d.hoy && (
          <button onClick={() => onNoche(d.hoy)} className="font-semibold text-luz hover:underline">
            Volver a esta noche
          </button>
        )}
      </div>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Noche que se ve en la escena"
        aria-valuemin={0}
        aria-valuemax={NOCHES - 1}
        aria-valuenow={sel}
        aria-valuetext={larga(noche)}
        className="flex h-14 cursor-ew-resize touch-none items-end gap-[3px] outline-none"
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
              <div className={cx('w-full rounded-[3px] transition-[height,background-color] duration-[var(--dur-3)]', i === sel ? 'bg-luz shadow-[0_0_14px_var(--luz)]' : nivel[i]! > 0 ? 'bg-[color-mix(in_oklab,var(--luz)_62%,transparent)]' : 'bg-[color-mix(in_oklab,var(--on-night)_14%,transparent)]')} style={{ height: `${10 + nivel[i]! * 72}%` }} />
              <span className={cx('mt-1 text-[10px] leading-none tabular', i === sel ? 'font-semibold text-on-night' : finde ? 'text-on-night-soft' : 'text-[color-mix(in_oklab,var(--on-night)_45%,transparent)]')}>{dia(iso)}</span>
            </div>
          )
        })}
      </div>
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
          <span className="text-[12.5px] text-ink-3">{ORIGEN[r.origen]}</span>
        </div>
        <div className="mt-0.5 text-[13.5px] text-ink-soft">
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
                <span className="block text-[12.5px] text-ink-soft">
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

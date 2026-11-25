import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarCheck, ChevronLeft, ChevronRight, Lock, Plus, Users } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa } from '@/lib/estados'
import { dia, diaSemana, inicioDeMes, larga, masDias, mesLargo, noches, plural, rango } from '@/lib/fechas'
import { nocheDe, TIPO } from '@/lib/ocupacion'
import { mxn } from '@/lib/dinero'
import { Button, cx } from '@/components/ui'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { EstadoReserva, estadoReserva, LeyendaHospedajes, tonoHospedaje } from '@/components/CalendarioEtiquetas'
import CalendarioLinea from './CalendarioLinea'
import { HojaApartado } from '@/components/HojaApartado'
import { esApartado, notaDe } from '@/lib/apartados'
import type { Bloqueo, Reservacion } from '@/lib/tipos'

/** Una barra del calendario: una reservación o unas noches que apartó el dueño */
type Estancia = { id: string; cabana_id: string; llegada: string; salida: string } & ({ r: Reservacion; b?: undefined } | { b: Bloqueo; r?: undefined })

/** Carriles de barras que caben en cada semana; lo demás se anuncia como «+N más» */
const CARRILES = 3
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

function otroMes(iso: string, n: number) {
  const f = new Date(`${inicioDeMes(iso)}T12:00:00Z`)
  f.setUTCMonth(f.getUTCMonth() + n)
  return f.toISOString().slice(0, 10)
}

export default function CalendarioMes() {
  const d = useApp((s) => s.datos)!
  const irAHoy = useApp((s) => s.irAHoy)
  const [vista, setVista] = useState('mes')
  const [mes, setMes] = useState(inicioDeMes(d.hoy))
  const [fecha, setFecha] = useState(d.hoy)
  const [unidad, setUnidad] = useState('todas')
  const [apartado, setApartado] = useState<Bloqueo | null>(null)
  const detalle = useRef<HTMLElement>(null)
  const verDia = (iso: string) => { setFecha(iso); detalle.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }
  useEffect(() => { if (irAHoy) { setMes(inicioDeMes(d.hoy)); setFecha(d.hoy) } }, [irAHoy, d.hoy])
  const cabanas = d.cabanas.filter((c) => unidad === 'todas' || c.id === unidad)
  const porId = new Map(d.cabanas.map((c) => [c.id, c]))
  const ids = new Set(cabanas.map((c) => c.id))
  const reservas = d.reservaciones.filter((r) => activa(r) && ids.has(r.cabana_id))
    .sort((a, b) => (porId.get(a.cabana_id)?.orden ?? 0) - (porId.get(b.cabana_id)?.orden ?? 0) || a.nombre.localeCompare(b.nombre))
  const inicio = masDias(mes, -((diaSemana(mes) + 6) % 7))
  const total = Math.ceil((((diaSemana(mes) + 6) % 7) + dia(masDias(otroMes(mes, 1), -1))) / 7) * 7
  const dias = Array.from({ length: total }, (_, i) => masDias(inicio, i))
  const semanas = Array.from({ length: total / 7 }, (_, s) => dias.slice(s * 7, s * 7 + 7))
  const apartados = d.bloqueos.filter((b) => esApartado(b) && ids.has(b.cabana_id))
  // Las barras: cada reservación y cada apartado del dueño cruzan sus noches igual
  const todas: Estancia[] = [
    ...reservas.map((r) => ({ id: r.id, cabana_id: r.cabana_id, llegada: r.llegada, salida: r.salida, r })),
    ...apartados.map((b) => ({ id: b.id, cabana_id: b.cabana_id, llegada: b.inicio, salida: b.fin, b })),
  ]
  const estancias = reservas.filter((r) => r.llegada <= fecha && r.salida > fecha)
  const apartadosNoche = apartados.filter((b) => b.inicio <= fecha && b.fin > fecha)
  const llegadas = todas.filter((e) => e.llegada === fecha)
  const salidas = todas.filter((e) => e.salida === fecha)
  const libres = cabanas.filter((c) => nocheDe(d, c.id, fecha).tipo === 'libre')
  const cerradas = cabanas.filter((c) => nocheDe(d, c.id, fecha).tipo === 'cerrada')

  return <div className="app-month-page @container mx-auto w-full min-w-0 max-w-[1600px] px-5 py-7 lg:px-7">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="heading text-[34px] font-semibold text-ink">Calendario</h1><p className="mt-2 text-[13px] text-ink-soft">Consulta el mes completo o revisa las noches libres de cada hospedaje.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-line bg-sunken p-1" aria-label="Vista del calendario">
          {['mes', 'unidades'].map((v) => <button key={v} aria-pressed={vista === v} onClick={() => setVista(v)} className={cx('rounded-full px-4 py-2 text-[13px] font-medium', vista === v && 'bg-surface text-ink shadow-sm')}>{v === 'mes' ? 'Mes completo' : 'Noches por hospedaje'}</button>)}
        </div>
      </div>
    </div>
    {vista === 'unidades' ? <CalendarioLinea /> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Mes anterior" onClick={() => setMes(otroMes(mes, -1))}><ChevronLeft size={17} /></Button>
          <h2 className="min-w-[165px] text-center text-[21px] font-semibold capitalize text-ink">{mesLargo(mes)} <span className="font-normal text-ink-soft">{mes.slice(0, 4)}</span></h2>
          <Button variant="outline" size="icon-sm" aria-label="Mes siguiente" onClick={() => setMes(otroMes(mes, 1))}><ChevronRight size={17} /></Button>
          <Button variant="outline" size="sm" onClick={() => { setMes(inicioDeMes(d.hoy)); setFecha(d.hoy) }}>Hoy</Button>
        </div>
        <select aria-label="Filtrar por hospedaje" className="max-w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-[13px]" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
          <option value="todas">Todos los hospedajes</option>{d.cabanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="mb-4"><LeyendaHospedajes /></div>
      <div className="grid min-w-0 items-start gap-5 @[1140px]:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface" aria-label="Calendario mensual">
          <div className="grid grid-cols-7 border-b border-line bg-wash">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((s) => <div key={s} className="py-3 text-center text-[12px] font-semibold text-ink-soft">{s}</div>)}</div>
          {/* Cada estancia es UNA barra que cruza sus noches (antes era una tarjeta repetida por día) */}
          <div>{semanas.map((semana) => {
            const ini = semana[0]!
            const fin = masDias(ini, 7)
            const carriles: number[] = []
            const barras = todas.filter((r) => r.llegada < fin && r.salida > ini).sort((a, b) => a.llegada.localeCompare(b.llegada) || b.salida.localeCompare(a.salida)).map((r) => {
              const c0 = Math.max(0, diasEntre(ini, r.llegada))
              const c1 = Math.min(7, diasEntre(ini, r.salida))
              let carril = carriles.findIndex((hasta) => hasta <= c0)
              if (carril < 0) carril = carriles.push(0) - 1
              carriles[carril] = c1
              return { e: r, c0, c1, carril }
            })
            return <div key={ini} className="cal-semana" style={{ gridTemplateRows: `40px repeat(${Math.max(1, Math.min(CARRILES, carriles.length))}, 31px) minmax(26px, auto)` }}>
              {semana.map((iso, i) => {
                const eventos = barras.filter((b) => b.c0 <= i && b.c1 > i)
                const bloqueadas = d.bloqueos.filter((b) => !esApartado(b) && ids.has(b.cabana_id) && b.inicio <= iso && b.fin > iso)
                const ocultas = eventos.filter((b) => b.carril >= CARRILES).length
                return <div key={iso} data-fecha={iso} style={{ gridColumn: i + 1 }} onClick={() => setFecha(iso)} className={cx('app-month-day cal-dia', iso.slice(0, 7) !== mes.slice(0, 7) && 'bg-wash', fecha === iso && 'is-selected')}>
                  <button type="button" aria-label={`${larga(iso)}, ${eventos.length} ocupados, ${bloqueadas.length} cierres`} aria-pressed={fecha === iso} onClick={() => setFecha(iso)} className="flex w-full items-center justify-between gap-1 text-left">
                    <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold', iso === d.hoy ? 'bg-primary text-on-primary' : 'text-ink')}>{dia(iso)}</span>
                    <span className="text-[11px] text-ink-soft" title="Hospedajes no disponibles / total">{eventos.length + bloqueadas.length}/{cabanas.length}</span>
                  </button>
                  {(ocultas > 0 || bloqueadas.length > 0) && <div className="cal-pie">
                    {ocultas > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); verDia(iso) }} className="font-semibold">+{ocultas} más</button>}
                    {bloqueadas.length > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); verDia(iso) }} className="inline-flex items-center gap-1"><Lock size={11} className="shrink-0" />{bloqueadas.length} {bloqueadas.length === 1 ? 'cierre' : 'cierres'}</button>}
                  </div>}
                </div>
              })}
              {barras.filter((b) => b.carril < CARRILES).map(({ e, c0, c1, carril }) => {
                const c = porId.get(e.cabana_id)
                if (e.b) {
                  const nota = notaDe(e.b)
                  const titulo = `Apartado por el dueño${nota ? ` · ${nota}` : ''} · ${c?.nombre ?? 'Hospedaje'} · ${rango(e.llegada, e.salida)}`
                  return <button type="button" key={e.id} onClick={() => setApartado(e.b!)} title={titulo} aria-label={titulo} style={{ gridColumn: `${c0 + 1} / ${c1 + 1}`, gridRow: carril + 2 }} className={cx('app-calendar-booking cal-barra es-apartado', e.llegada >= ini && 'empieza', e.salida <= fin && 'termina')}>
                    {e.llegada >= ini && <ArrowDownLeft size={12} className="shrink-0" aria-label="Llegada" />}
                    <span className="cal-barra-nombre">{nota ?? 'Apartado'}</span>
                    {c1 - c0 > 1 && <span className="cal-barra-lugar">{c?.nombre ?? 'Hospedaje'}</span>}
                    <CalendarCheck size={13} strokeWidth={1.8} className="ml-auto shrink-0" aria-label="Apartado por el dueño" />
                  </button>
                }
                const r = e.r!
                const titulo = `${r.nombre} · ${c?.nombre ?? 'Hospedaje'} · ${c ? TIPO[c.tipo].uno : ''} · ${estadoReserva(r.estado)} · ${rango(r.llegada, r.salida)} · ${plural(r.huespedes, 'persona', 'personas')}`
                return <button type="button" key={r.id} onClick={() => useApp.getState().abrir(r.id)} title={titulo} aria-label={titulo} style={{ ...tonoHospedaje(c?.tipo), gridColumn: `${c0 + 1} / ${c1 + 1}`, gridRow: carril + 2 }} className={cx('app-calendar-booking cal-barra', r.llegada >= ini && 'empieza', r.salida <= fin && 'termina')}>
                  {r.llegada >= ini && <ArrowDownLeft size={12} className="shrink-0" aria-label="Llegada" />}
                  <span className="cal-barra-nombre">{r.nombre}</span>
                  {c1 - c0 > 1 && <span className="cal-barra-lugar">{c?.nombre ?? 'Hospedaje'}</span>}
                  <EstadoReserva estado={r.estado} soloIcono />
                </button>
              })}
            </div>
          })}</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-4 text-[12px] text-ink-soft" aria-label="Estados de reservación">
            <EstadoReserva estado="confirmada" /><EstadoReserva estado="pagada" /><EstadoReserva estado="solicitud" />
            <span className="inline-flex items-center gap-1 font-medium text-[var(--violet-ink)]"><CalendarCheck size={13} />Apartado por el dueño</span>
            <span className="inline-flex items-center gap-1"><ArrowDownLeft size={12} />Llegada</span><span>No disponibles / total</span>
            <button type="button" onClick={() => verDia(fecha)} className="ml-auto font-semibold text-key underline underline-offset-4">Ver detalle del día →</button>
          </div>
        </section>
        <aside ref={detalle} className="app-day-summary min-w-0 scroll-mt-5 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-[20px] font-semibold capitalize text-ink">{larga(fecha)}</h2>
          <div className="my-5 grid grid-cols-3 gap-2 border-y border-line py-4">{[{ value: llegadas.length, label: 'Llegadas' }, { value: salidas.length, label: 'Salidas' }, { value: libres.length, label: 'Libres' }].map(({ value, label }) => <div key={label}><AnimatedNumber value={value} className="block text-[25px] font-semibold text-ink" /><span className="text-[12px] text-ink-soft">{label}</span></div>)}</div>
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Se hospedan esta noche</h3>
          <div className="space-y-3">{estancias.map((r) => {
            const c = porId.get(r.cabana_id)
            return <button key={r.id} onClick={() => useApp.getState().abrir(r.id)} className="app-calendar-booking w-full min-w-0 rounded-lg border border-line border-l-[4px] p-3.5 text-left" style={tonoHospedaje(c?.tipo)}>
              <span className="block break-words text-[15px] font-semibold text-ink">{r.nombre}</span>
              <span className="mt-1 block break-words text-[13px] font-medium">{c?.nombre ?? 'Hospedaje'}{c ? ` · ${TIPO[c.tipo].uno}` : ''}</span>
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]"><EstadoReserva estado={r.estado} /><span className="inline-flex items-center gap-1"><Users size={12} />{r.huespedes}</span></span>
              <span className="mt-2 block text-[12px]">{rango(r.llegada, r.salida)} · {plural(noches(r.llegada, r.salida), 'noche', 'noches')}</span>
              <span className="mt-2 block text-[14px] font-semibold">{mxn(r.total)} <span className="text-[11px] font-normal">total</span></span>
            </button>
          })}{apartadosNoche.map((b) => {
            const c = porId.get(b.cabana_id)
            return <button key={b.id} onClick={() => setApartado(b)} className="app-calendar-booking es-apartado w-full min-w-0 rounded-lg border border-l-[4px] p-3.5 text-left">
              <span className="block break-words text-[15px] font-semibold">{notaDe(b) ?? 'Apartado'}</span>
              <span className="mt-1 block break-words text-[13px] font-medium">{c?.nombre ?? 'Hospedaje'}{c ? ` · ${TIPO[c.tipo].uno}` : ''}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium"><CalendarCheck size={13} />Apartado por el dueño · sin reservación</span>
              <span className="mt-2 block text-[12px]">{rango(b.inicio, b.fin)} · {plural(noches(b.inicio, b.fin), 'noche', 'noches')}</span>
            </button>
          })}{!estancias.length && !apartadosNoche.length && <p className="text-[13px] text-ink-soft">Sin reservaciones esta noche.</p>}</div>
          {salidas.length > 0 && <div className="mt-5"><h3 className="mb-2 text-[15px] font-semibold text-ink">Salen este día</h3>{salidas.map((e) => <button key={e.id} onClick={() => (e.b ? setApartado(e.b) : useApp.getState().abrir(e.id))} className="flex w-full min-w-0 items-start gap-2 border-b border-line py-2.5 text-left"><ArrowUpRight size={14} className="mt-0.5 shrink-0 text-ink-soft" /><span className="min-w-0"><span className="block break-words text-[14px] font-medium text-ink">{e.r ? e.r.nombre : `Apartado${notaDe(e.b) ? ` · ${notaDe(e.b)}` : ''}`}</span><span className="block break-words text-[12px] text-ink-soft">{porId.get(e.cabana_id)?.nombre ?? 'Hospedaje'}</span></span></button>)}</div>}
          {cerradas.length > 0 && <div className="mt-5"><h3 className="mb-2 text-[15px] font-semibold text-ink">Fechas cerradas</h3>{cerradas.map((c) => { const n = nocheDe(d, c.id, fecha); return <p key={c.id} className="mb-2 text-[12px] text-ink-soft"><Lock size={12} className="mr-1 inline" />{c.nombre}{n.tipo === 'cerrada' && n.b.motivo ? ` · ${n.b.motivo}` : ''}</p> })}</div>}
          <div className="mt-6 space-y-2">
            {fecha >= d.hoy && libres.length > 0 && <Button className="w-full" icon={<Plus size={14} />} onClick={() => useApp.getState().crear({ tipo: 'reservacion', llegada: fecha, salida: masDias(fecha, 1), ...(unidad !== 'todas' ? { cabana_id: unidad } : {}) })}>Reservar este día</Button>}
            <Button variant="outline" className="w-full" icon={<Lock size={14} />} onClick={() => useApp.getState().crear({ tipo: 'cierre', llegada: fecha, salida: masDias(fecha, 1), ...(unidad !== 'todas' ? { cabana_id: unidad } : {}) })}>Cerrar fechas</Button>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-soft">Cada celda representa una noche. La salida queda libre para una nueva llegada.</p>
        </aside>
      </div>
      {!d.cabanas.length && <p className="mt-5 text-[14px] text-ink-soft">Agrega un hospedaje para comenzar a organizar tus fechas.</p>}
      <HojaApartado apartado={apartado} onCerrar={() => setApartado(null)} />
    </>}
  </div>
}

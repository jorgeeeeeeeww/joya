import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Lock, Plus, Users } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa } from '@/lib/estados'
import { dia, diaSemana, inicioDeMes, larga, masDias, mesLargo, noches, plural, rango } from '@/lib/fechas'
import { nocheDe, TIPO } from '@/lib/ocupacion'
import { mxn } from '@/lib/dinero'
import { Button, cx } from '@/components/ui'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { EstadoReserva, estadoReserva, LeyendaHospedajes, tonoHospedaje } from '@/components/CalendarioEtiquetas'
import CalendarioLinea from './CalendarioLinea'

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
  const estancias = reservas.filter((r) => r.llegada <= fecha && r.salida > fecha)
  const llegadas = reservas.filter((r) => r.llegada === fecha)
  const salidas = reservas.filter((r) => r.salida === fecha)
  const libres = cabanas.filter((c) => nocheDe(d, c.id, fecha).tipo === 'libre')
  const cerradas = cabanas.filter((c) => nocheDe(d, c.id, fecha).tipo === 'cerrada')

  return <div className="@container mx-auto w-full min-w-0 max-w-[1600px] px-5 py-7 lg:px-7">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <h1 className="heading text-[34px] font-semibold text-ink">Calendario</h1>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-line bg-sunken p-1" aria-label="Vista del calendario">
          {['mes', 'unidades'].map((v) => <button key={v} aria-pressed={vista === v} onClick={() => setVista(v)} className={cx('rounded-full px-4 py-2 text-[13px] font-medium', vista === v && 'bg-surface text-ink shadow-sm')}>{v === 'mes' ? 'Mes' : 'Por hospedaje'}</button>)}
        </div>
        <Button icon={<Plus size={15} />} onClick={() => useApp.getState().crear({ tipo: 'reservacion' })}>Nueva reservación</Button>
      </div>
    </div>
    {vista === 'unidades' ? <div className="h-[850px] min-w-0"><CalendarioLinea /></div> : <>
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
          <div className="grid grid-cols-7">{dias.map((iso) => {
            const eventos = reservas.filter((r) => r.llegada <= iso && r.salida > iso)
            const bloqueadas = d.bloqueos.filter((b) => ids.has(b.cabana_id) && b.inicio <= iso && b.fin > iso)
            const ocupados = eventos.length + bloqueadas.length
            return <div key={iso} className={cx('min-h-[148px] min-w-0 border-r border-b border-line p-1.5 @[800px]:p-2', iso.slice(0, 7) !== mes.slice(0, 7) && 'bg-wash', fecha === iso && 'bg-wash ring-2 ring-inset ring-line-strong')}>
              <button type="button" aria-label={`${larga(iso)}, ${eventos.length} reservaciones, ${bloqueadas.length} cierres`} aria-pressed={fecha === iso} onClick={() => setFecha(iso)} className="mb-2 flex w-full items-center justify-between gap-1 text-left">
                <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold', iso === d.hoy ? 'bg-primary text-on-primary' : 'text-ink')}>{dia(iso)}</span>
                <span className="text-[11px] text-ink-soft" title="Hospedajes no disponibles / total">{ocupados}/{cabanas.length}</span>
              </button>
              <div className="space-y-1.5">{eventos.slice(0, 2).map((r) => {
                const c = porId.get(r.cabana_id)
                const titulo = `${r.nombre} · ${c?.nombre ?? 'Hospedaje'} · ${c ? TIPO[c.tipo].uno : ''} · ${estadoReserva(r.estado)} · ${rango(r.llegada, r.salida)} · ${plural(r.huespedes, 'persona', 'personas')}`
                return <button type="button" key={r.id} onClick={() => useApp.getState().abrir(r.id)} title={titulo} aria-label={titulo} style={tonoHospedaje(c?.tipo)} className="block w-full min-w-0 overflow-hidden rounded-md border-l-[3px] px-1.5 py-2 text-left transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink">
                  <span className="flex min-w-0 items-center justify-between gap-1"><span className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-tight text-ink @[850px]:text-[13px]">{r.nombre}</span></span>
                  <span className="mt-1 block break-words text-[11px] font-medium leading-tight @[850px]:text-[12px]">{c?.nombre ?? 'Hospedaje'}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1"><EstadoReserva estado={r.estado} />{r.llegada === iso && <ArrowDownLeft size={11} aria-label="Llegada" />}</span>
                </button>
              })}
                {eventos.length > 2 && <button type="button" onClick={() => verDia(iso)} className="w-full rounded py-1 text-left text-[12px] font-semibold text-ink-soft">+{eventos.length - 2} reservas</button>}
                {bloqueadas.length > 0 && <button type="button" onClick={() => verDia(iso)} className="inline-flex max-w-full items-center gap-1 text-[11px] text-ink-soft"><Lock size={11} className="shrink-0" />{bloqueadas.length} {bloqueadas.length === 1 ? 'cierre' : 'cierres'}</button>}
              </div>
            </div>
          })}</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-4 text-[12px] text-ink-soft" aria-label="Estados de reservación">
            <EstadoReserva estado="confirmada" /><EstadoReserva estado="pagada" /><EstadoReserva estado="solicitud" />
            <span className="inline-flex items-center gap-1"><ArrowDownLeft size={12} />Llegada</span><span>No disponibles / total</span>
            <button type="button" onClick={() => verDia(fecha)} className="ml-auto font-semibold text-key underline underline-offset-4">Ver detalle del día →</button>
          </div>
        </section>
        <aside ref={detalle} className="min-w-0 scroll-mt-5 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-[20px] font-semibold capitalize text-ink">{larga(fecha)}</h2>
          <div className="my-5 grid grid-cols-3 gap-2 border-y border-line py-4">{[{ value: llegadas.length, label: 'Llegadas' }, { value: salidas.length, label: 'Salidas' }, { value: libres.length, label: 'Libres' }].map(({ value, label }) => <div key={label}><AnimatedNumber value={value} className="block text-[25px] font-semibold text-ink" /><span className="text-[12px] text-ink-soft">{label}</span></div>)}</div>
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Se hospedan esta noche</h3>
          <div className="space-y-3">{estancias.map((r) => {
            const c = porId.get(r.cabana_id)
            return <button key={r.id} onClick={() => useApp.getState().abrir(r.id)} className="w-full min-w-0 rounded-lg border border-line border-l-[4px] p-3.5 text-left" style={tonoHospedaje(c?.tipo)}>
              <span className="block break-words text-[15px] font-semibold text-ink">{r.nombre}</span>
              <span className="mt-1 block break-words text-[13px] font-medium">{c?.nombre ?? 'Hospedaje'}{c ? ` · ${TIPO[c.tipo].uno}` : ''}</span>
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]"><EstadoReserva estado={r.estado} /><span className="inline-flex items-center gap-1"><Users size={12} />{r.huespedes}</span></span>
              <span className="mt-2 block text-[12px]">{rango(r.llegada, r.salida)} · {plural(noches(r.llegada, r.salida), 'noche', 'noches')}</span>
              <span className="mt-2 block text-[14px] font-semibold">{mxn(r.total)} <span className="text-[11px] font-normal">total</span></span>
            </button>
          })}{!estancias.length && <p className="text-[13px] text-ink-soft">Sin reservaciones esta noche.</p>}</div>
          {salidas.length > 0 && <div className="mt-5"><h3 className="mb-2 text-[15px] font-semibold text-ink">Salen este día</h3>{salidas.map((r) => <button key={r.id} onClick={() => useApp.getState().abrir(r.id)} className="flex w-full min-w-0 items-start gap-2 border-b border-line py-2.5 text-left"><ArrowUpRight size={14} className="mt-0.5 shrink-0 text-ink-soft" /><span className="min-w-0"><span className="block break-words text-[14px] font-medium text-ink">{r.nombre}</span><span className="block break-words text-[12px] text-ink-soft">{porId.get(r.cabana_id)?.nombre ?? 'Hospedaje'}</span></span></button>)}</div>}
          {cerradas.length > 0 && <div className="mt-5"><h3 className="mb-2 text-[15px] font-semibold text-ink">Fechas cerradas</h3>{cerradas.map((c) => { const n = nocheDe(d, c.id, fecha); return <p key={c.id} className="mb-2 text-[12px] text-ink-soft"><Lock size={12} className="mr-1 inline" />{c.nombre}{n.tipo === 'cerrada' && n.b.motivo ? ` · ${n.b.motivo}` : ''}</p> })}</div>}
          <div className="mt-6 space-y-2">
            {fecha >= d.hoy && libres.length > 0 && <Button className="w-full" icon={<Plus size={14} />} onClick={() => useApp.getState().crear({ tipo: 'reservacion', llegada: fecha, salida: masDias(fecha, 1), ...(unidad !== 'todas' ? { cabana_id: unidad } : {}) })}>Reservar este día</Button>}
            <Button variant="outline" className="w-full" icon={<Lock size={14} />} onClick={() => useApp.getState().crear({ tipo: 'cierre', llegada: fecha, salida: masDias(fecha, 1), ...(unidad !== 'todas' ? { cabana_id: unidad } : {}) })}>Cerrar fechas</Button>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-soft">Cada celda representa una noche. La salida queda libre para una nueva llegada.</p>
        </aside>
      </div>
      {!d.cabanas.length && <p className="mt-5 text-[14px] text-ink-soft">Agrega un hospedaje para comenzar a organizar tus fechas.</p>}
    </>}
  </div>
}

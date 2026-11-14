import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BedDouble, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, DoorOpen, Globe2, LockKeyhole, MessageCircle, Plus, Users, Wallet } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa, ORIGEN, saldo } from '@/lib/estados'
import { corta, dia, diaCorto, larga, masDias, noches, rango, venceEn, plural } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { nombreDe } from '@/lib/ocupacion'
import { casasDe } from '@/lib/casas'
import { cambiarEstado } from '@/lib/acciones'
import type { Datos, Reservacion } from '@/lib/tipos'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { Button, cx } from '@/components/ui'
import { ListoParaAbrir } from '@/components/Listo'
import { avisarPorWhatsApp, useMenuReservacion } from '@/components/menuReservacion'

const abrirReservas = () => { useApp.getState().setFiltro('proximas'); useApp.getState().ir('reservaciones') }
const iniciales = (nombre: string) => nombre.trim().split(/\s+/).slice(0,2).map(s => s[0]).join('')
const confirmada = (r: Reservacion) => activa(r) && r.estado !== 'solicitud'

export default function Hoy() {
  const d = useApp(s => s.datos)!
  const [agendaFecha,setAgendaFecha] = useState(d.hoy)
  const [agendaVista,setAgendaVista] = useState<'llegadas'|'salidas'>('llegadas')
  const [, tick] = useState(0)
  const { menu, abrirMenu } = useMenuReservacion()
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60_000); return () => clearInterval(t) }, [])
  const casas = casasDe(d,d.hoy)
  const ocupadas = casas.filter(c => c.estado === 'reservada').length
  const solicitudes = d.reservaciones.filter(r => activa(r) && r.estado === 'solicitud').sort((a,b) => (a.vence || '').localeCompare(b.vence || ''))
  const llegan = d.reservaciones.filter(r => confirmada(r) && r.llegada === d.hoy)
  const salen = d.reservaciones.filter(r => confirmada(r) && r.salida === d.hoy)
  const proximas = d.reservaciones.filter(r => confirmada(r) && r.llegada > d.hoy).sort((a,b) => a.llegada.localeCompare(b.llegada))
  const cobros = d.reservaciones.filter(r => confirmada(r) && saldo(r) > 0 && r.salida >= d.hoy && r.llegada <= masDias(d.hoy,7)).sort((a,b) => a.llegada.localeCompare(b.llegada))
  const totalCobrar = cobros.reduce((s,r) => s + saldo(r),0)
  const huespedes = d.reservaciones.filter(r => confirmada(r) && r.llegada <= d.hoy && r.salida > d.hoy).reduce((s,r) => s + r.huespedes,0)
  const porcentaje = d.cabanas.length ? Math.round(ocupadas/d.cabanas.length*100) : 0
  return <div className="reception-dashboard">
    <div className="reception-main">
      <header className="reception-heading"><div><div className="reception-title-line"><h1>Vista general</h1></div></div><span className="reception-date"><CalendarDays size={15} />{larga(d.hoy)}</span></header>
      <div className="reception-metrics">
        <section className="reception-panel reception-metric"><header><BedDouble size={19} /><h2>Ocupación esta noche</h2><button aria-label="Ver ocupación en el mapa" onClick={() => useApp.getState().ir('mapa')}><ArrowUpRight size={17} /></button></header><div className="reception-metric-body"><div className="reception-metric-number"><AnimatedNumber value={porcentaje} /><small>%</small><span className="reception-metric-note">{ocupadas} de {d.cabanas.length} hospedajes</span></div><div className="reception-progress" aria-hidden="true"><span style={{width: `${porcentaje}%`}} /></div><p><Users size={14} /><strong><AnimatedNumber value={huespedes} /> huéspedes</strong> esta noche</p></div></section>
        <section className="reception-panel reception-metric"><header><Wallet size={19} /><h2>Por cobrar</h2><button aria-label="Ver reservaciones con pagos pendientes" onClick={() => {useApp.getState().setFiltro('atender'); useApp.getState().ir('reservaciones')}}><ArrowUpRight size={17} /></button></header><div className="reception-metric-body"><div className="reception-metric-number reception-money"><AnimatedNumber value={totalCobrar} format="money" /><span className="reception-metric-note">{cobros.length} estancias con saldo</span></div><p className="reception-metric-explainer">Estancias en curso y llegadas en 7 días.</p></div></section>
      </div>
      <div className="reception-daily-strip">
        <button onClick={() => document.getElementById('reception-requests')?.scrollIntoView({behavior:'smooth'})}><span className="reception-small-icon amber"><Clock3 size={17} /></span><span><strong><AnimatedNumber value={solicitudes.length} /></strong><small>Solicitudes pendientes</small></span><ChevronRight size={15} /></button>
        <button onClick={() => {setAgendaFecha(d.hoy); setAgendaVista('llegadas'); document.getElementById('reception-agenda')?.scrollIntoView({behavior:'smooth'})}}><span className="reception-small-icon green"><ArrowDownLeft size={18} /></span><span><strong><AnimatedNumber value={llegan.length} /></strong><small>Llegadas de hoy</small></span><ChevronRight size={15} /></button>
        <button onClick={() => {setAgendaFecha(d.hoy); setAgendaVista('salidas'); document.getElementById('reception-agenda')?.scrollIntoView({behavior:'smooth'})}}><span className="reception-small-icon blue"><ArrowUpRight size={18} /></span><span><strong><AnimatedNumber value={salen.length} /></strong><small>Salidas de hoy</small></span><ChevronRight size={15} /></button>
      </div>
      <Ocupacion d={d} />
      <section id="reception-requests" className="reception-panel reception-requests"><PanelHeader title="Solicitudes por confirmar" icon={<Clock3 size={17} />} extra={<span className="reception-count">{solicitudes.length} pendientes</span>} />
        {solicitudes.length ? <div className="reception-request-list">{solicitudes.map(r => <Solicitud key={r.id} r={r} d={d} onMenu={e => abrirMenu(e,r)} />)}</div> : <Empty icon={<CheckCheck size={23} />} title="Todo al día" text="Las solicitudes nuevas de la página aparecerán aquí." />}
      </section>
      <section className="reception-panel"><PanelHeader title="Próximas llegadas" icon={<DoorOpen size={17} />} extra={<button className="reception-text-link" onClick={abrirReservas}>Ver todas <ArrowRight size={14} /></button>} />
        {proximas.length ? <div className="reception-table-scroll"><table className="reception-arrivals-table"><thead><tr><th>Huésped / hospedaje</th><th>Estancia</th><th>Estado</th><th className="number">Por cobrar</th></tr></thead><tbody>{proximas.slice(0,5).map(r => <tr key={r.id} onContextMenu={e => abrirMenu(e,r)}><td><button className="reception-guest" onClick={() => useApp.getState().abrir(r.id)}><span className="reception-avatar">{iniciales(r.nombre)}</span><span><strong>{r.nombre}</strong><small>{nombreDe(d,r.cabana_id)}</small></span></button></td><td><span className="reception-nowrap">{rango(r.llegada,r.salida)}</span><small>{plural(noches(r.llegada,r.salida), 'noche', 'noches')} · {plural(r.huespedes, 'persona', 'personas')}</small></td><td><EstadoReserva r={r} /></td><td className="number"><strong>{mxn(saldo(r))}</strong></td></tr>)}</tbody></table></div> : <Empty icon={<CalendarDays size={23} />} title="Sin próximas llegadas" text="Las reservaciones confirmadas aparecerán aquí." />}
      </section>
      <div className="reception-bottom-grid"><Canales d={d} /><section className="reception-panel"><PanelHeader title="Cobros a seguir" icon={<CircleDollarSign size={17} />} extra={<span className="reception-count">7 días</span>} />{cobros.length ? <div className="reception-payment-list">{cobros.slice(0,3).map(r => <button key={r.id} onClick={() => useApp.getState().abrir(r.id)}><span><strong>{r.nombre}</strong><small>{nombreDe(d,r.cabana_id)}</small></span><b>{mxn(saldo(r))}</b><ChevronRight size={14} /></button>)}</div> : <Empty icon={<Check size={23} />} title="Sin saldos pendientes" text="Las estancias de esta semana están al corriente." />}</section></div>
      <details className="reception-preparation"><summary>Revisar preparación y publicación de los hospedajes</summary><ListoParaAbrir /></details>

    </div>
    <aside className="reception-rail">
      <Agenda d={d} fecha={agendaFecha} setFecha={setAgendaFecha} vista={agendaVista} setVista={setAgendaVista} />
      <section className="reception-rail-section"><div className="reception-rail-heading"><h2>Disponibilidad de hoy</h2><BedDouble size={17} /></div><div className="reception-availability">{([{tipo:'cabana',nombre:'Cabañas'},{tipo:'casa',nombre:'Casas'},{tipo:'habitacion',nombre:'Habitaciones'}] as const).map(t => { const c = casas.filter(c => c.tipo === t.tipo); const libres = c.filter(c => c.estado === 'libre').length; return <button key={t.tipo} className={libres === 0 ? 'is-full' : ''} onClick={() => useApp.getState().ir('mapa')}><span>{t.nombre}<small>{plural(c.length, 'hospedaje', 'hospedajes')}</small></span><b><AnimatedNumber value={libres} /><small>{libres === 1 ? ' libre' : ' libres'}</small></b></button> })}</div><button className="reception-text-link" onClick={() => useApp.getState().ir('mapa')}>Explorar el mapa <ArrowUpRight size={14} /></button></section>
      <section className="reception-rail-section"><div className="reception-rail-heading"><h2>Acciones de recepción</h2><Plus size={17} /></div><div className="reception-quick-actions"><button onClick={() => useApp.getState().crear({tipo:'reservacion'})}><Plus size={16} />Nueva reservación<ChevronRight size={14} /></button><button onClick={() => useApp.getState().crear({tipo:'cierre',llegada:d.hoy,salida:masDias(d.hoy,1)})}><LockKeyhole size={16} />Cerrar fechas<ChevronRight size={14} /></button><button onClick={() => useApp.getState().ir('calendario')}><CalendarDays size={16} />Consultar calendario<ChevronRight size={14} /></button></div></section>
      <div className="reception-rail-note"><Globe2 size={18} /><div><strong>{d.ajustes.reservas_web ? 'La página recibe solicitudes' : 'Reservas web en pausa'}</strong><button onClick={() => useApp.getState().ir('ajustes')}>Revisar configuración <ArrowRight size={13} /></button></div></div>
    </aside>
    {menu}
  </div>
}

function PanelHeader({title,icon,extra}:{title:string;icon:ReactNode;extra?:ReactNode}) { return <header className="reception-panel-heading"><h2>{icon}{title}</h2>{extra}</header> }
function Empty({icon,title,text}:{icon:ReactNode;title:string;text:string}) { return <div className="reception-empty">{icon}<strong>{title}</strong><p>{text}</p></div> }
function EstadoReserva({r}:{r:Reservacion}) { return <span className={cx('reception-status',r.estado === 'pagada' ? 'paid' : r.estado === 'solicitud' ? 'request' : 'confirmed')}><i />{r.estado === 'pagada' ? 'Pagada' : r.estado === 'solicitud' ? 'Solicitud' : 'Confirmada'}</span> }

function Solicitud({r,d,onMenu}:{r:Reservacion;d:Datos;onMenu:(e:React.MouseEvent)=>void}) {
  const [ocupado,setOcupado] = useState(false)
  const v = venceEn(r.vence)
  return <article className="reception-request" onContextMenu={onMenu}>
    <button className="reception-guest" onClick={() => useApp.getState().abrir(r.id)}><span className="reception-avatar amber">{iniciales(r.nombre)}</span><span><strong>{r.nombre}</strong><small>{nombreDe(d,r.cabana_id)} · {ORIGEN[r.origen]}</small></span></button>
    <div className="reception-request-dates"><strong>{rango(r.llegada,r.salida)}</strong><small>{r.huespedes} personas · {mxn(r.total)}</small></div>
    <div className={cx('reception-expiry',v?.urgente && 'urgent')}><Clock3 size={13} />{v?.texto || 'Sin vencimiento'}</div>
    <div className="reception-request-actions"><Button variant="outline" size="sm" onClick={() => useApp.getState().abrir(r.id)}>Revisar</Button><Button size="sm" loading={ocupado} icon={<Check size={13} />} onClick={async () => { setOcupado(true); try { await cambiarEstado(r,'confirmada') } finally { setOcupado(false) } }}>Confirmar</Button></div>
  </article>
}

function Ocupacion({d}:{d:Datos}) {
  const [periodo,setPeriodo] = useState(14)
  const dias = Array.from({length:periodo},(_,i) => {const fecha=masDias(d.hoy,i); const c=casasDe(d,fecha); return {fecha,ocupadas:c.filter(c=>c.estado==='reservada').length,apartadas:c.filter(c=>c.estado==='apartada').length,cerradas:c.filter(c=>c.estado==='cerrada').length} })
  const filas = Math.min(12,Math.max(1,d.cabanas.length))
  const capacidad = d.cabanas.length
  const totalNoches = dias.reduce((n,d) => n+d.ocupadas,0)
  return <section className="reception-panel reception-occupancy"><PanelHeader title="Ocupación por noche" icon={<BedDouble size={17} />} extra={<div className="reception-segmented" aria-label="Periodo de ocupación">{[7,14,30].map(n => <button key={n} aria-pressed={periodo===n} onClick={()=>setPeriodo(n)}>{n} días</button>)}</div>} />
    <div className="reception-chart-summary"><div><strong><AnimatedNumber value={totalNoches} /></strong><span>noches reservadas</span></div><span>Próximos {periodo} días</span></div>
    {capacidad ? <div className="reception-chart-scroll"><div className="reception-chart" style={{gridTemplateColumns:`repeat(${periodo},minmax(16px,1fr))`}}>{dias.map((d,i) => {const ocupadas=Math.round(d.ocupadas/capacidad*filas); const apartadas=Math.round(d.apartadas/capacidad*filas); const cerradas=Math.min(filas-ocupadas-apartadas,Math.round(d.cerradas/capacidad*filas)); return <button key={d.fecha} onClick={()=>useApp.getState().ir('calendario')} aria-label={`${larga(d.fecha)}: ${d.ocupadas} ocupados, ${d.apartadas} apartados y ${d.cerradas} cerrados de ${capacidad}. Abrir calendario.`} title={`${corta(d.fecha)} · ${d.ocupadas}/${capacidad} ocupados · ${d.apartadas} apartados · ${d.cerradas} cerrados`}><span className="reception-chart-pixels" style={{gridTemplateRows:`repeat(${filas},1fr)`}}>{Array.from({length:filas*2},(_,cell) => { const f=Math.floor(cell/2); return <i key={cell} className={filas-f<=ocupadas ? 'booked' : filas-f<=ocupadas+apartadas ? 'held' : filas-f<=ocupadas+apartadas+cerradas ? 'closed' : ''} /> })}</span><span className={cx('reception-chart-day',i===0 && 'today')}>{periodo<30 || i%5===0 || i===periodo-1 ? dia(d.fecha) : '·'}</span></button>})}</div></div> : <Empty icon={<BedDouble size={23} />} title="Tu ocupación empieza aquí" text="Agrega hospedajes para ver la disponibilidad de las próximas noches." />}
    <div className="reception-chart-legend"><span><i className="booked" />Confirmado</span><span><i className="held" />Solicitud</span><span><i className="closed" />Cerrado</span><span><i />Libre</span><small>{corta(d.hoy)} — {corta(masDias(d.hoy,periodo-1))}</small></div>
  </section>
}

function Canales({d}:{d:Datos}) {
  const reservas=d.reservaciones.filter(r => activa(r) && r.salida>d.hoy && r.llegada<=masDias(d.hoy,30))
  return <section className="reception-panel"><PanelHeader title="Origen de las reservas" icon={<Globe2 size={17} />} extra={<span className="reception-count">30 días</span>} /><div className="reception-channels">{Object.entries(ORIGEN).map(([key,label])=>{const n=reservas.filter(r=>r.origen===key).length; const pct=reservas.length?Math.round(n/reservas.length*100):0;return <div key={key}><span>{label}</span><div><i style={{width:`${pct}%`}} /></div><b>{n}</b><small>{pct}%</small></div>})}<p>Incluye solicitudes vigentes.</p></div></section>
}

function Agenda({d,fecha,setFecha,vista,setVista}:{d:Datos;fecha:string;setFecha:(s:string)=>void;vista:'llegadas'|'salidas';setVista:(s:'llegadas'|'salidas')=>void}) {
  const lista=d.reservaciones.filter(r=>confirmada(r) && (vista==='llegadas'?r.llegada:r.salida)===fecha).sort((a,b)=>(a.hora_llegada||'').localeCompare(b.hora_llegada||''))
  return <section id="reception-agenda" className="reception-rail-section reception-agenda"><div className="reception-rail-heading"><h2>Agenda de recepción</h2><CalendarDays size={17} /></div><p className="reception-caption first-letter:uppercase">{larga(fecha)}</p><div className="reception-agenda-date"><button aria-label="Día anterior" onClick={()=>setFecha(masDias(fecha,-1))}><ChevronLeft size={15}/></button><button className="reception-date-today" onClick={()=>setFecha(d.hoy)}>{fecha===d.hoy?'Hoy':corta(fecha)}<span>{diaCorto(fecha)}</span></button><button aria-label="Día siguiente" onClick={()=>setFecha(masDias(fecha,1))}><ChevronRight size={15}/></button></div><div className="reception-agenda-tabs" aria-label="Movimientos del día">{(['llegadas','salidas'] as const).map(v=><button key={v} aria-pressed={vista===v} onClick={()=>setVista(v)}>{v==='llegadas'?'Llegadas':'Salidas'}<span>{d.reservaciones.filter(r=>confirmada(r)&&(v==='llegadas'?r.llegada:r.salida)===fecha).length}</span></button>)}</div>
    <div className="reception-agenda-list">{lista.length ? lista.map(r=><article key={r.id}><div className="reception-agenda-time"><i/>{vista==='llegadas'?r.hora_llegada||d.ajustes.hora_llegada||'Por definir':d.ajustes.hora_salida||'Por definir'}</div><button className="reception-agenda-guest" onClick={()=>useApp.getState().abrir(r.id)}><strong>{r.nombre}</strong><span>{nombreDe(d,r.cabana_id)}</span><small><Users size={12}/>{plural(r.huespedes, 'persona', 'personas')} · {plural(noches(r.llegada,r.salida), 'noche', 'noches')}</small></button><div className="reception-agenda-card-footer"><EstadoReserva r={r}/>{r.telefono && <button title={`WhatsApp de ${r.nombre}`} aria-label={`Abrir WhatsApp de ${r.nombre}`} onClick={()=>void avisarPorWhatsApp(r.id)}><MessageCircle size={15}/></button>}</div></article>) : <Empty icon={<CalendarDays size={22}/>} title={`Sin ${vista}`} text="No hay movimientos programados para este día." />}</div>
    <button className="reception-text-link" onClick={()=>useApp.getState().ir('calendario')}>Ver calendario completo<ArrowRight size={14}/></button>
  </section>
}

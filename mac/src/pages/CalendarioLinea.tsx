// Consulta por noche: acciones explícitas, sin mover reservas al arrastrar.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, LockOpen } from 'lucide-react'
import { useApp } from '@/lib/store'
import { corta, dia, diaCorto, larga, masDias, plural, rango } from '@/lib/fechas'
import { nocheDe, TIPO } from '@/lib/ocupacion'
import { borrarCierre } from '@/lib/acciones'
import type { Bloqueo, ISODate } from '@/lib/tipos'
import { Button, Empty, Sheet } from '@/components/ui'
import { estadoReserva } from '@/components/CalendarioEtiquetas'
import { HojaApartado } from '@/components/HojaApartado'
import { etiquetaApartado, notaDe } from '@/lib/apartados'

export default function CalendarioLinea() {
  const d = useApp(s => s.datos)!
  const irAHoy = useApp(s => s.irAHoy)
  const [inicio, setInicio] = useState(d.hoy)
  const [unidad, setUnidad] = useState('todas')
  const [cierre, setCierre] = useState<Bloqueo | null>(null)
  const [apartado, setApartado] = useState<Bloqueo | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { if (irAHoy) setInicio(d.hoy) }, [irAHoy, d.hoy])
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => masDias(inicio, i)), [inicio])
  const cabanas = d.cabanas.filter(c => unidad === 'todas' || c.id === unidad)
  const desde = d.desde || masDias(d.hoy, -120)
  const hasta = masDias(d.hasta || masDias(d.hoy, 540), -7)
  const cambiarInicio = (fecha: ISODate) => {
    if (fecha && fecha >= desde && fecha <= hasta) setInicio(fecha)
  }
  const cerrarFicha = () => { if (!ocupado) { setCierre(null); setConfirmar(false) } }

  if (!d.cabanas.length) return <Empty title="Agrega tu primer hospedaje" body="Aquí podrás consultar qué noches están libres en cada cabaña, casa y habitación." action={<Button onClick={() => useApp.getState().ir('cabanas')}>Ir a Hospedajes</Button>} />

  return <section className="availability-week" aria-label="Disponibilidad por hospedaje">
    <header className="availability-heading">
      <div><h2>¿Qué noches están libres?</h2><p>Cada fila es un hospedaje. Cada columna es una noche.</p></div>
      <Button variant="outline" size="sm" icon={<Lock size={14} />} onClick={() => useApp.getState().crear({ tipo: 'cierre', cabana_id: unidad === 'todas' ? undefined : unidad, llegada: inicio, salida: masDias(inicio, 1) })}>Cerrar fechas</Button>
    </header>
    <div className="availability-controls">
      <label>Ver desde<input type="date" aria-label="Primera noche de la semana" value={inicio} min={desde} max={hasta} onChange={e => cambiarInicio(e.target.value)} /></label>
      <div className="availability-paging"><Button variant="outline" size="icon-sm" aria-label="Semana anterior" disabled={inicio <= desde} onClick={() => setInicio(inicio < masDias(desde, 7) ? desde : masDias(inicio, -7))}><ChevronLeft size={17} /></Button><Button variant="outline" size="sm" onClick={() => setInicio(d.hoy)}>Esta semana</Button><Button variant="outline" size="icon-sm" aria-label="Semana siguiente" disabled={inicio >= hasta} onClick={() => setInicio(inicio > masDias(hasta, -7) ? hasta : masDias(inicio, 7))}><ChevronRight size={17} /></Button></div>
      <label>Hospedaje<select aria-label="Hospedaje de la disponibilidad" value={unidad} onChange={e => setUnidad(e.target.value)}><option value="todas">Todos los hospedajes</option>{d.cabanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
    </div>
    <div className="availability-instructions"><span><i data-tipo="libre" />Libre: iniciar reserva</span><span><i data-tipo="reservada" />Ocupado: ver reserva</span><span><i data-tipo="apartada" />Solicitud: por confirmar</span><span><i data-tipo="dueno" />Apartado por el dueño</span><span><i data-tipo="cerrada" />Cerrado: ver motivo</span></div>
    <div className="availability-table-scroll" role="region" aria-label="Noches del hospedaje" tabIndex={0}>
      <table className="availability-table"><caption className="sr-only">{cabanas.length} hospedajes, del {corta(inicio)} al {corta(dias[6]!)}</caption>
        <thead><tr><th scope="col">Hospedaje<span>{cabanas.length} en esta vista</span></th>{dias.map(iso => <th scope="col" key={iso} data-hoy={iso === d.hoy}><span>{diaCorto(iso)}</span><strong>{dia(iso)}</strong><small>{corta(iso).replace(/^\d+\s*/, '')}</small></th>)}</tr></thead>
        <tbody>{cabanas.map(c => <tr key={c.id}><th scope="row"><strong>{c.nombre}</strong><span>{TIPO[c.tipo].uno} · {plural(c.capacidad, 'persona', 'personas')}</span>{!c.publicada && <small>Oculto en la página</small>}</th>{dias.map(iso => {
          const n = nocheDe(d, c.id, iso)
          const reserva = n.tipo === 'reservada' || n.tipo === 'apartada' ? n.r : null
          const pasado = iso < d.hoy
          const titulo = n.tipo === 'libre' ? 'Libre' : n.tipo === 'cerrada' ? 'Cerrado' : n.tipo === 'dueno' ? 'Apartado' : n.tipo === 'apartada' ? 'Solicitud' : 'Ocupado'
          const detalle = reserva ? reserva.nombre : n.tipo === 'dueno' ? notaDe(n.b) ?? 'Del dueño' : n.tipo === 'cerrada' ? 'Ver motivo' : pasado ? 'Noche pasada' : 'Reservar'
          return <td key={iso}><button type="button" data-tipo={n.tipo} disabled={pasado && n.tipo === 'libre'} title={`${c.nombre} · ${larga(iso)} · ${n.tipo === 'dueno' ? etiquetaApartado(n.b) : titulo}${reserva ? ` · ${reserva.nombre} · ${estadoReserva(reserva.estado)}` : ''}`} aria-label={`${c.nombre}, ${larga(iso)}: ${titulo}. ${detalle}`} onClick={() => {
            if (reserva) useApp.getState().abrir(reserva.id)
            else if (n.tipo === 'dueno') setApartado(n.b)
            else if (n.tipo === 'cerrada') { setCierre(n.b); setConfirmar(false) }
            else useApp.getState().crear({ tipo: 'reservacion', cabana_id: c.id, llegada: iso, salida: masDias(iso, 1) })
          }}><strong>{titulo}</strong><span>{detalle}</span></button></td>
        })}</tr>)}</tbody>
      </table>
    </div>
    <p className="availability-note">Haz clic en una casilla. Para cambiar fechas o pagos, abre la reservación y elige la acción en su ficha. La noche de salida queda libre para otra llegada.</p>
    <Sheet open={!!cierre} onClose={cerrarFicha} title="Fechas cerradas" subtitle={cierre ? d.cabanas.find(c => c.id === cierre.cabana_id)?.nombre : undefined}>
      {cierre && <div className="space-y-5"><p className="text-[16px] font-semibold">{rango(cierre.inicio, cierre.fin)}</p><p className="text-[14px] text-ink-soft">{cierre.motivo || 'Sin motivo registrado.'}</p><p className="text-[13px] text-ink-soft">Estas noches no aceptan reservaciones. La fecha final es el día en que el hospedaje vuelve a estar disponible.</p>{confirmar ? <div className="rounded-lg border border-line bg-wash p-4"><p className="mb-4 text-[14px]">¿Volver a ofrecer todas las noches de este cierre?</p><div className="flex gap-2"><Button variant="outline" disabled={ocupado} onClick={() => setConfirmar(false)}>Conservar cierre</Button><Button loading={ocupado} onClick={async () => { if (ocupado) return; setOcupado(true); try { if (await borrarCierre(cierre)) { setCierre(null); setConfirmar(false) } } finally { setOcupado(false) } }}>Sí, abrir fechas</Button></div></div> : <Button variant="outline" icon={<LockOpen size={15} />} onClick={() => setConfirmar(true)}>Volver a abrir estas fechas</Button>}</div>}
    </Sheet>
    <HojaApartado apartado={apartado} onCerrar={() => setApartado(null)} />
  </section>
}

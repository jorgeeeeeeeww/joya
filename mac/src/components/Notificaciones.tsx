import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, Bell, BellRing, CheckCheck, ChevronRight, Clock3, Volume2, VolumeX, X } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa } from '@/lib/estados'
import { corta, hace, rango } from '@/lib/fechas'
import { nombreDe } from '@/lib/ocupacion'
import { guardarSonido, prepararSonido, sonarAviso, sonidoActivado } from '@/lib/sonido'
import { Popover, toast } from './ui'

export function Notificaciones() {
  const d = useApp((s) => s.datos)
  const [abierto, setAbierto] = useState(false)
  const [sonido, setSonido] = useState(sonidoActivado)
  const ancla = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const preparar = () => { void prepararSonido() }
    window.addEventListener('pointerdown', preparar, { once: true })
    window.addEventListener('keydown', preparar, { once: true })
    return () => { window.removeEventListener('pointerdown', preparar); window.removeEventListener('keydown', preparar) }
  }, [])
  const pendientes = d?.reservaciones.filter((r) => activa(r) && r.estado === 'solicitud').sort((a, b) => b.creada.localeCompare(a.creada)) ?? []
  const llegadas = d?.reservaciones.filter((r) => activa(r) && r.estado !== 'solicitud' && r.llegada === d.hoy) ?? []
  const abrir = (id: string) => { setAbierto(false); useApp.getState().abrir(id) }
  return <>
    <button ref={ancla} className="reception-icon-button reception-bell" aria-label={`Abrir notificaciones, ${pendientes.length} solicitudes pendientes`} aria-expanded={abierto} aria-haspopup="dialog" title="Notificaciones" onClick={() => setAbierto((v) => !v)}><Bell size={18} />{pendientes.length > 0 && <span className="notification-badge">{pendientes.length > 9 ? '9+' : pendientes.length}</span>}</button>
    <Popover open={abierto} onClose={() => setAbierto(false)} anchor={ancla} width={410} align="end" label="Centro de notificaciones" className="notification-panel">
      <header className="notification-header"><span className="notification-header-icon"><BellRing size={20} /></span><div><h2>Notificaciones</h2><p>{pendientes.length ? `${pendientes.length} por confirmar` : 'Todo al día'}</p></div><button type="button" aria-label="Cerrar notificaciones" onClick={() => setAbierto(false)}><X size={18} /></button></header>
      <div className="notification-content">
        <h3><Clock3 size={15} /> Solicitudes por confirmar <span>{pendientes.length}</span></h3>
        {pendientes.length ? pendientes.map((r) => <button className="notification-item" key={r.id} onClick={() => abrir(r.id)}><span className="notification-item-icon"><Clock3 size={18} /></span><span className="notification-item-copy"><strong>{r.nombre}</strong><span>{d ? nombreDe(d, r.cabana_id) : 'Hospedaje'}</span><small>{rango(r.llegada, r.salida)} · {hace(r.creada)}</small></span><ChevronRight size={16} /></button>) : <div className="notification-empty"><CheckCheck size={24} /><strong>Sin solicitudes pendientes</strong><p>Las nuevas solicitudes aparecerán aquí.</p></div>}
        {llegadas.length > 0 && <><h3><ArrowDownLeft size={15} /> Llegadas de hoy <span>{llegadas.length}</span></h3>{llegadas.map((r) => <button className="notification-item is-arrival" key={r.id} onClick={() => abrir(r.id)}><span className="notification-item-icon"><ArrowDownLeft size={18} /></span><span className="notification-item-copy"><strong>{r.nombre}</strong><span>{d ? nombreDe(d, r.cabana_id) : 'Hospedaje'}</span><small>{corta(r.llegada)} · {r.hora_llegada || 'Horario por confirmar'}</small></span><ChevronRight size={16} /></button>)}</>}
      </div>
      <footer className="notification-footer"><button type="button" aria-pressed={sonido} onClick={() => { const nuevo = !sonido; setSonido(nuevo); guardarSonido(nuevo); if (nuevo) void prepararSonido() }}>{sonido ? <Volume2 size={16} /> : <VolumeX size={16} />}Sonido {sonido ? 'activado' : 'apagado'}</button><button type="button" disabled={!sonido} onClick={async () => { await prepararSonido(); if (!(await sonarAviso())) toast.error('No se pudo reproducir el sonido', 'Revisa el volumen de la computadora e inténtalo de nuevo.') }}>Probar sonido</button></footer>
      <p className="notification-note">El sonido avisa de nuevas solicitudes recibidas con la app abierta.</p>
    </Popover>
  </>
}

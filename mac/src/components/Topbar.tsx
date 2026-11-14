import { useState } from 'react'
import { Bell, ChevronRight, RefreshCw, Search, Settings2 } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa } from '@/lib/estados'
import { CMD } from '@/lib/mac'

const nombres = { hoy: 'Vista general', mapa: 'Mapa del rancho', calendario: 'Calendario', reservaciones: 'Reservaciones', cabanas: 'Hospedajes', ajustes: 'Ajustes' }

export function Topbar() {
  const vista = useApp(s => s.vista)
  const vivo = useApp(s => s.enVivo)
  const conexion = useApp(s => s.conexion)
  const d = useApp(s => s.datos)
  const [cargando, setCargando] = useState(false)
  const pendientes = d?.reservaciones.filter(r => r.estado === 'solicitud' && activa(r)).length ?? 0
  return <header className="reception-topbar">
    <div className="reception-breadcrumb"><span>La Joya</span><ChevronRight size={13} /><strong>{nombres[vista]}</strong></div>
    <button className="reception-search" onClick={() => useApp.getState().setBuscar(true)} aria-label="Buscar reservaciones y huéspedes"><Search size={17} /><span>Buscar en La Joya…</span><kbd>{CMD}K</kbd></button>
    <div className="reception-topbar-actions">
      <span className="reception-live"><i className={conexion === 'sin-conexion' ? 'offline' : vivo ? '' : 'pending'} />{conexion === 'sin-conexion' ? 'Sin conexión' : vivo ? 'En vivo' : 'Actualizando'}</span>
      <button className="reception-icon-button" disabled={cargando} aria-label="Actualizar datos" title="Actualizar datos" onClick={async () => { setCargando(true); try { await useApp.getState().cargar() } finally { setCargando(false) } }}><RefreshCw size={17} className={cargando ? 'animate-spin' : ''} /></button>
      <button className="reception-icon-button reception-bell" aria-label={`${pendientes} solicitudes pendientes. Ir a Hoy`} title="Solicitudes pendientes" onClick={() => useApp.getState().ir('hoy')}><Bell size={18} />{pendientes > 0 && <i />}</button>
      <button className="reception-icon-button" aria-label="Abrir ajustes" title="Ajustes" onClick={() => useApp.getState().ir('ajustes')}><Settings2 size={18} /></button>
    </div>
  </header>
}

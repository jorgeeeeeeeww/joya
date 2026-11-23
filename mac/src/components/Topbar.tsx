import { useState } from 'react'
import { RefreshCw, Search, Settings2 } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Notificaciones } from './Notificaciones'
import { CMD } from '@/lib/mac'

export function Topbar() {
  const vivo = useApp(s => s.enVivo)
  const conexion = useApp(s => s.conexion)
  const [cargando, setCargando] = useState(false)
  // Sin migas («La Joya › Calendario»): repetían el título de cada pantalla. El único buscador de la app vive aquí,
  // y la franja sirve para arrastrar la ventana, como la barra de herramientas de una app de Mac.
  return <header className="reception-topbar" data-tauri-drag-region>
    <button className="reception-search" onClick={() => useApp.getState().setBuscar(true)} aria-label="Buscar reservaciones y huéspedes"><Search size={17} /><span>Buscar huésped, código o teléfono…</span><kbd>{CMD}F</kbd></button>
    <div className="reception-topbar-actions">
      <span className="reception-live"><i className={conexion === 'sin-conexion' ? 'offline' : vivo ? '' : 'pending'} />{conexion === 'sin-conexion' ? 'Sin conexión' : vivo ? 'En vivo' : 'Actualizando'}</span>
      <button className="reception-icon-button" disabled={cargando} aria-label="Actualizar datos" title="Actualizar datos" onClick={async () => { setCargando(true); try { await useApp.getState().cargar() } finally { setCargando(false) } }}><RefreshCw size={17} className={cargando ? 'animate-spin' : ''} /></button>
      <Notificaciones />
      <button className="reception-icon-button" aria-label="Abrir ajustes" title="Ajustes" onClick={() => useApp.getState().ir('ajustes')}><Settings2 size={18} /></button>
    </div>
  </header>
}

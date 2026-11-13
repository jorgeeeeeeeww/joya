// Barra lateral flotante, igual que la del PWA: la luz y el día arriba, nueva reservación y búsqueda,
// las cuatro secciones y abajo Ajustes, la conexión y tu cuenta.
import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { BedDouble, CalendarRange, ChevronsUpDown, Inbox, LogOut, Map as MapaIcono, Plus, RefreshCw, Search, Settings, Sun } from 'lucide-react'
import { useApp, type Vista } from '@/lib/store'
import { CMD, enMac } from '@/lib/mac'
import { activa } from '@/lib/estados'
import { esNubeLocal } from '@/lib/nube'
import { spring } from '@/lib/motion'
import { Button, MenuList, Popover, cx } from './ui'
import { Marca } from './Loto'

const SECCIONES: { vista: Vista; label: string; icon: typeof Sun; atajo: string }[] = [
  { vista: 'hoy', label: 'Hoy', icon: Sun, atajo: '1' },
  { vista: 'mapa', label: 'Mapa', icon: MapaIcono, atajo: '2' },
  { vista: 'calendario', label: 'Calendario', icon: CalendarRange, atajo: '3' },
  { vista: 'reservaciones', label: 'Reservaciones', icon: Inbox, atajo: '4' },
  { vista: 'cabanas', label: 'Hospedajes', icon: BedDouble, atajo: '5' },
]

function Renglon({ activo, label, icon: Icon, onClick, cuenta, urgente, atajo }: { activo: boolean; label: string; icon: typeof Sun; onClick: () => void; cuenta?: number; urgente?: boolean; atajo?: string }) {
  return (
    <button onClick={onClick} title={atajo ? `${label} (${CMD}${atajo})` : label} aria-current={activo ? 'page' : undefined} className={cx('group relative flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-left transition-colors duration-[var(--dur-2)]', activo ? 'text-ink' : 'text-ink-soft hover:bg-wash hover:text-ink')}>
      {activo && (
        <>
          <motion.span layoutId="barra-activa" className="absolute inset-0 rounded-[10px] bg-[color-mix(in_oklab,var(--ink)_6.5%,transparent)]" transition={spring.suave} />
          <motion.span layoutId="barra-luz" className="absolute top-1/2 -left-2.5 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-chispa-soft shadow-[0_0_10px_var(--luz)]" transition={spring.suave} />
        </>
      )}
      <Icon size={17} strokeWidth={activo ? 2 : 1.7} className="relative shrink-0" />
      <span className={cx('relative flex-1 text-[14px]', activo ? 'font-semibold' : 'font-medium')}>{label}</span>
      {!!cuenta && <span className={cx('relative min-w-5 text-right text-[12px] tabular', urgente ? 'font-semibold text-chispa' : 'font-medium text-key')}>{cuenta}</span>}
    </button>
  )
}

export function Barra() {
  const vista = useApp((s) => s.vista)
  const ir = useApp((s) => s.ir)
  const datos = useApp((s) => s.datos)
  const conexion = useApp((s) => s.conexion)
  const enVivo = useApp((s) => s.enVivo)
  const correo = useApp((s) => s.sesion?.user.email ?? '')
  const [correoLocal, correoDominio] = correo.includes('@') ? correo.split('@', 2) : [correo, '']
  const salir = useApp((s) => s.salir)
  const cargar = useApp((s) => s.cargar)
  const cuentaRef = useRef<HTMLButtonElement>(null)
  const [cuenta, setCuenta] = useState(false)

  const solicitudes = datos?.reservaciones.filter((r) => r.estado === 'solicitud' && activa(r)).length ?? 0
  const hoy = datos?.hoy
  const movimientos = hoy ? datos!.reservaciones.filter((r) => activa(r) && (r.llegada === hoy || r.salida === hoy)).length : 0
  const estado = conexion === 'sin-conexion' ? { texto: 'Sin conexión', punto: 'bg-danger' } : enVivo ? { texto: 'En vivo', punto: 'bg-success' } : { texto: 'Conectando', punto: 'bg-chispa-soft' }

  return (
    <aside className="app-sidebar interfaz flex w-[236px] shrink-0 p-2.5 pr-0">
      <div className="flex w-full flex-col rounded-[20px] bg-surface shadow-[var(--shadow-1)] ring-1 ring-line">
        {/* Los semáforos de la ventana quedan aquí arriba en la Mac */}
        {enMac && <div data-tauri-drag-region className="app-sidebar-titlebar h-7 shrink-0 rounded-t-[20px]" />}
        <div data-tauri-drag-region className="app-sidebar-brand px-4 pt-4 pb-4">
          <Marca tamano={30} hueco="var(--surface)" className="text-ink" />
        </div>

        <div className="flex flex-col gap-1.5 px-2.5 pb-3">
          <Button variant="primary" size="sm" className="app-sidebar-new-reservation w-full" title={`Nueva reservación (${CMD}N)`} aria-label={`Nueva reservación (${CMD}N)`} icon={<Plus size={16} strokeWidth={2} />} onClick={() => useApp.getState().crear({ tipo: 'reservacion' })}>
            <span className="app-sidebar-new-reservation-label">Nueva reservación</span>
          </Button>
          <button onClick={() => useApp.getState().setBuscar(true)} title={`Buscar (${CMD}F)`} className="pressable flex h-9 w-full items-center gap-2 rounded-[10px] px-2.5 text-[13px] text-ink-3 ring-1 ring-line ring-inset hover:bg-wash hover:text-ink-soft">
            <Search size={15} strokeWidth={1.8} />
            <span className="flex-1 text-left">Buscar</span>
            <kbd className="tecla">{CMD}F</kbd>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-px px-2.5" aria-label="Secciones">
          {SECCIONES.map((s) => (
            <Renglon key={s.vista} activo={vista === s.vista} label={s.label} icon={s.icon} atajo={s.atajo} onClick={() => ir(s.vista)} cuenta={s.vista === 'hoy' ? solicitudes || movimientos : undefined} urgente={s.vista === 'hoy' && solicitudes > 0} />
          ))}
        </nav>

        <div className="flex flex-col gap-px border-t border-line px-2.5 pt-2.5 pb-2.5">
          <Renglon activo={vista === 'ajustes'} label="Ajustes" icon={Settings} atajo="," onClick={() => ir('ajustes')} />
          <button ref={cuentaRef} onClick={() => setCuenta((o) => !o)} aria-haspopup="menu" aria-expanded={cuenta} className="app-sidebar-account pressable mt-1.5 flex items-center gap-2 rounded-[12px] p-1.5 text-left hover:bg-wash">
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunken text-[12px] font-semibold text-ink-soft uppercase">
              {correo.slice(0, 1)}
              <span title={estado.texto} className={cx('absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface', estado.punto)} />
            </span>
            <span className="app-sidebar-account-copy min-w-0 flex-1 leading-tight">
              <span className="app-sidebar-account-email" title={correo}>
                <span>{correoLocal}{correoDominio ? '@' : ''}</span>
                {correoDominio && <span>{correoDominio}</span>}
              </span>
              <span className="app-sidebar-account-status mt-0.5">
                <span>{estado.texto}</span>
                {esNubeLocal && <span>· nube local</span>}
              </span>
            </span>
            <ChevronsUpDown size={12} strokeWidth={1.8} className="shrink-0 text-ink-3" />
          </button>
        </div>
      </div>
      <Popover open={cuenta} onClose={() => setCuenta(false)} anchor={cuentaRef} width={240} label="Tu cuenta">
        <MenuList
          onPick={() => setCuenta(false)}
          items={[
            { label: 'Actualizar ahora', icon: <RefreshCw />, atajo: `${CMD}R`, onClick: () => void cargar() },
            { label: 'Salir', icon: <LogOut />, onClick: () => void salir(), separado: true, hint: 'Cierra la sesión en esta Mac' },
          ]}
        />
      </Popover>
    </aside>
  )
}

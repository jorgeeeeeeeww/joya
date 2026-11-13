// Reservaciones: lista y detalle lado a lado, como en Mail. ↑ ↓ cambian de reservación y el clic
// derecho tiene las acciones.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa, saldo, ESTADO } from '@/lib/estados'
import { masDias, mesLargo, rango, venceEn } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { nombreDe } from '@/lib/ocupacion'
import type { Reservacion } from '@/lib/tipos'
import { Segmented, TONE, cx } from '@/components/ui'
import { DetalleReservacion } from '@/components/Detalle'
import { useMenuReservacion } from '@/components/menuReservacion'
import { Loto } from '@/components/Loto'

const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export default function Reservaciones() {
  const d = useApp((s) => s.datos)!
  const filtro = useApp((s) => s.filtro)
  const setFiltro = useApp((s) => s.setFiltro)
  const abierta = useApp((s) => s.abierta)
  const abrir = useApp((s) => s.abrir)
  const [texto, setTexto] = useState('')
  const listaRef = useRef<HTMLDivElement>(null)
  const { menu, abrirMenu } = useMenuReservacion()

  const grupos = useMemo(() => {
    const hoy = d.hoy
    const vivas = d.reservaciones.filter((r) => activa(r))
    const atender = vivas.filter((r) => r.estado === 'solicitud' || (saldo(r) > 0 && r.llegada <= masDias(hoy, 7) && r.salida >= hoy)).sort((a, b) => (a.estado === 'solicitud' ? 0 : 1) - (b.estado === 'solicitud' ? 0 : 1) || a.llegada.localeCompare(b.llegada))
    const proximas = vivas.filter((r) => r.salida >= hoy).sort((a, b) => a.llegada.localeCompare(b.llegada))
    const todas = [...d.reservaciones].sort((a, b) => b.llegada.localeCompare(a.llegada))
    const canceladas = d.reservaciones.filter((r) => !activa(r)).sort((a, b) => (b.cancelada_en ?? b.creada).localeCompare(a.cancelada_en ?? a.creada))
    return { atender, proximas, todas, canceladas }
  }, [d])

  const lista = useMemo(() => {
    const base = grupos[filtro === 'atender' ? 'atender' : filtro]
    const t = sinAcentos(texto.trim())
    if (!t) return base
    const dig = t.replace(/\D/g, '')
    return base.filter((r) => sinAcentos(`${r.nombre} ${r.codigo} ${r.correo ?? ''} ${nombreDe(d, r.cabana_id)}`).includes(t) || (dig.length >= 4 && (r.telefono ?? '').includes(dig)))
  }, [grupos, filtro, texto, d])

  // ↑ ↓ para moverse por la lista (como en Mail)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [role="dialog"]')) return
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const i = lista.findIndex((r) => r.id === abierta)
      const sig = lista[Math.max(0, Math.min(lista.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (sig) {
        abrir(sig.id)
        listaRef.current?.querySelector(`[data-id="${sig.id}"]`)?.scrollIntoView({ block: 'nearest' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lista, abierta, abrir])

  let mesAnterior = ''
  return (
    <div className="app-reservations h-full">
      {abierta ? (
        <div className="app-reservations-detail-view scroll-area h-full min-w-0 overflow-y-auto">
          <div className="app-reservation-profile-page mx-auto max-w-[1160px]">
            <DetalleReservacion id={abierta} onCerrar={() => abrir(null)} />
          </div>
        </div>
      ) : (
        <div className="app-reservations-index scroll-area h-full min-w-0 overflow-y-auto">
          <div className="app-reservations-index-content mx-auto max-w-[1240px]">
            <header className="app-reservations-index-header">
              <div>
                <p className="app-eyebrow">La Joya · Hospedaje</p>
                <h1 className="heading">Reservaciones</h1>
                <p className="app-page-subtitle">Solicitudes, estancias y pagos en un solo lugar.</p>
              </div>
              <div className="app-reservations-total"><span>{d.reservaciones.length}</span> registros</div>
            </header>
            <div className="app-reservations-toolbar">
              <Segmented
                size="sm"
                className="app-reservations-filters"
                value={filtro}
                onChange={setFiltro}
                options={[
                  { value: 'atender', label: <>Por atender {grupos.atender.length > 0 && <span className="tabular">{grupos.atender.length}</span>}</> },
                  { value: 'proximas', label: 'Próximas' },
                  { value: 'todas', label: 'Todas' },
                  { value: 'canceladas', label: 'Canceladas' },
                ]}
              />
              <label className="app-reservations-search">
                <Search size={15} />
                <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar huésped, código o WhatsApp" />
                {texto && (
                  <button type="button" onClick={() => setTexto('')} aria-label="Borrar búsqueda">
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
            <div className="app-reservations-table">
              <div className="app-reservations-table-head" aria-hidden="true">
                <span>Huésped</span><span>Hospedaje</span><span>Estancia</span><span className="text-right">Total</span>
              </div>
              <div ref={listaRef}>
                {lista.length === 0 ? (
                  <div className="app-reservations-empty">
                    <Loto size={42} hueco="var(--surface)" className="opacity-70" />
                    <p className="mt-3 text-[14px] font-semibold">{texto ? 'No encontramos coincidencias' : filtro === 'atender' ? 'Nada por atender' : 'No hay reservaciones en esta vista'}</p>
                    <p className="mt-1 max-w-[42ch] text-[13px] text-ink-soft">{filtro === 'atender' && !texto ? 'Las solicitudes nuevas y los saldos por cobrar de esta semana aparecerán aquí.' : 'Prueba otro filtro o busca por el nombre del huésped.'}</p>
                  </div>
                ) : lista.map((r) => {
                  const mes = r.llegada.slice(0, 7)
                  const encabezado = filtro !== 'atender' && mes !== mesAnterior
                  mesAnterior = mes
                  return (
                    <div key={r.id}>
                      {encabezado && <div className="app-reservations-month">{mesLargo(r.llegada)} {r.llegada.slice(0, 4)}</div>}
                      <Renglon r={r} cabana={nombreDe(d, r.cabana_id)} activo={r.id === abierta} onClick={() => abrir(r.id)} onMenu={(e) => abrirMenu(e, r)} />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {menu}
    </div>
  )
}

function Renglon({ r, cabana, activo, onClick, onMenu }: { r: Reservacion; cabana: string; activo: boolean; onClick: () => void; onMenu: (e: React.MouseEvent) => void }) {
  const e = ESTADO[activa(r) ? r.estado : 'cancelada']
  const v = r.estado === 'solicitud' && activa(r) ? venceEn(r.vence) : null
  const falta = saldo(r)
  return (
    <button data-id={r.id} onClick={onClick} onContextMenu={onMenu} className={cx('app-reservation-row', activo && 'is-selected')}>
      <span className="app-reservation-row-guest">
        <span className={cx('app-reservation-state-dot', TONE[e.tono].solid)} title={e.label} />
        <span className="min-w-0"><strong>{r.nombre}</strong><small className={v?.urgente ? 'is-urgent' : ''}>{v ? `Solicitud · ${v.texto}` : activa(r) ? (falta > 0 ? `${e.label} · falta ${mxn(falta)}` : e.label) : r.estado === 'solicitud' ? 'Venció el apartado' : e.label}</small></span>
      </span>
      <span className="app-reservation-row-property">{cabana}</span>
      <span className="app-reservation-row-dates">{rango(r.llegada, r.salida)}</span>
      <span className="app-reservation-row-total">{mxn(r.total)}</span>
    </button>
  )
}

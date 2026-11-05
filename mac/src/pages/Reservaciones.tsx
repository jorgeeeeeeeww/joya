// Reservaciones: lista y detalle lado a lado, como en Mail. ↑ ↓ cambian de reservación y el clic
// derecho tiene las acciones.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Inbox, Search, X } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa, saldo, ESTADO } from '@/lib/estados'
import { masDias, mesLargo, rango, venceEn } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { nombreDe } from '@/lib/ocupacion'
import type { Reservacion } from '@/lib/tipos'
import { Segmented, TONE, cx } from '@/components/ui'
import { DetalleReservacion } from '@/components/Detalle'
import { useMenuReservacion } from '@/components/menuReservacion'
import { MiniHorizon } from '@/components/step1'

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

  // Al llegar sin nada abierto, abre la primera. Se revisa la vista porque esta pantalla sigue viva un
  // instante mientras se va: sin esto, la siguiente pantalla aparecía con un panel abierto sin pedirlo.
  useEffect(() => {
    if (!abierta && lista[0] && useApp.getState().vista === 'reservaciones') abrir(lista[0].id)
  }, [abierta, lista, abrir])

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
    <div className="flex h-full">
      <div className="interfaz flex w-[380px] shrink-0 flex-col border-r border-line">
        <div className="px-5 pt-8 pb-3">
          <h1 className="heading text-[26px]">Reservaciones</h1>
          <Segmented
            size="sm"
            className="mt-4 w-full"
            value={filtro}
            onChange={setFiltro}
            options={[
              { value: 'atender', label: <>Por atender {grupos.atender.length > 0 && <span className="text-chispa tabular">{grupos.atender.length}</span>}</> },
              { value: 'proximas', label: 'Próximas' },
              { value: 'todas', label: 'Todas' },
              { value: 'canceladas', label: 'Canceladas' },
            ]}
          />
          <label className="mt-3 flex h-9 items-center gap-2 rounded-[10px] bg-sunken px-3 text-[13px] ring-1 ring-line ring-inset focus-within:ring-primary">
            <Search size={15} className="text-ink-3" />
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Filtrar por nombre, código o WhatsApp" className="campo-libre min-w-0 flex-1 bg-transparent placeholder:text-ink-3" />
            {texto && (
              <button onClick={() => setTexto('')} aria-label="Borrar filtro" className="text-ink-3 hover:text-ink">
                <X size={14} />
              </button>
            )}
          </label>
        </div>
        <div ref={listaRef} className="scroll-area min-h-0 flex-1 overflow-y-auto px-2.5 pb-6">
          {lista.length === 0 && (
            <div className="px-4 py-14 text-center">
              <MiniHorizon size={96} />
              <p className="mt-4 text-[14px] font-medium">{texto ? 'Nada coincide con el filtro' : filtro === 'atender' ? 'Nada por atender' : 'Sin reservaciones aquí'}</p>
              <p className="mt-1 text-[12.5px] text-ink-3">{filtro === 'atender' && !texto ? 'Las solicitudes nuevas y los saldos por cobrar de esta semana aparecen aquí.' : ''}</p>
            </div>
          )}
          {lista.map((r) => {
            const mes = r.llegada.slice(0, 7)
            const encabezado = filtro !== 'atender' && mes !== mesAnterior
            mesAnterior = mes
            return (
              <div key={r.id}>
                {encabezado && (
                  <div className="px-3 pt-4 pb-1.5 text-[12px] font-medium text-ink-3 first-letter:uppercase">
                    {mesLargo(r.llegada)} {r.llegada.slice(0, 4)}
                  </div>
                )}
                <Renglon r={r} cabana={nombreDe(d, r.cabana_id)} activo={r.id === abierta} onClick={() => abrir(r.id)} onMenu={(e) => abrirMenu(e, r)} />
              </div>
            )
          })}
        </div>
      </div>
      <div className="scroll-area min-w-0 flex-1 overflow-y-auto">
        {abierta ? (
          <div className="mx-auto max-w-[760px]">
            <DetalleReservacion id={abierta} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-ink-3">
            <Inbox size={28} strokeWidth={1.4} />
            <p className="mt-3 text-[14px]">Elige una reservación de la lista</p>
          </div>
        )}
      </div>
      {menu}
    </div>
  )
}

function Renglon({ r, cabana, activo, onClick, onMenu }: { r: Reservacion; cabana: string; activo: boolean; onClick: () => void; onMenu: (e: React.MouseEvent) => void }) {
  const e = ESTADO[activa(r) ? r.estado : 'cancelada']
  const v = r.estado === 'solicitud' && activa(r) ? venceEn(r.vence) : null
  const falta = saldo(r)
  return (
    <button data-id={r.id} onClick={onClick} onContextMenu={onMenu} className={cx('relative flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors duration-[var(--dur-1)]', activo ? 'bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface))]' : 'hover:bg-wash')}>
      <span className={cx('mt-[7px] h-2 w-2 shrink-0 rounded-full', TONE[e.tono].solid)} title={e.label} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold">{r.nombre}</span>
          <span className="shrink-0 text-[12.5px] font-medium text-key tabular">{mxn(r.total)}</span>
        </span>
        <span className="block text-[12.5px] text-ink-soft">
          {cabana} · {rango(r.llegada, r.salida)}
        </span>
        <span className={cx('block text-[12px]', v?.urgente ? 'font-medium text-chispa' : 'text-ink-3')}>
          {v ? `Solicitud · ${v.texto}` : activa(r) ? (falta > 0 ? `${e.label} · falta ${mxn(falta)}` : e.label) : r.estado === 'solicitud' ? 'Venció el apartado' : e.label}
        </span>
      </span>
    </button>
  )
}

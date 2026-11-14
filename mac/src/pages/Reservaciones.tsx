// Reservaciones: lista y detalle lado a lado, como en Mail. ↑ ↓ cambian de reservación y el clic
// derecho tiene las acciones.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, CalendarDays, Search, X } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa, saldo, ESTADO } from '@/lib/estados'
import { corta, masDias, noches, plural, venceEn } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { nombreDe } from '@/lib/ocupacion'
import type { Reservacion } from '@/lib/tipos'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { Button, cx } from '@/components/ui'
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

  // Las solicitudes todavía no representan una estancia confirmada ni un saldo exigible.
  const estancias = grupos.proximas.filter((r) => r.estado === 'confirmada' || r.estado === 'pagada')
  const pendientes = estancias.reduce((total, r) => total + Math.max(0, saldo(r)), 0)
  const llegadas = estancias.filter((r) => r.llegada >= d.hoy && r.llegada <= masDias(d.hoy, 7))
  return (
    <div className="h-full min-w-0 bg-paper">
      {abierta ? (
        <div className="scroll-area h-full min-w-0 overflow-y-auto"><div className="mx-auto max-w-[1160px]"><DetalleReservacion id={abierta} onCerrar={() => abrir(null)} /></div></div>
      ) : (
        <div className="scroll-area h-full min-w-0 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-5 py-7 min-[1200px]:px-8">
            <header className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-4">
              <div className="min-w-0"><h1 className="text-[34px] leading-none tracking-[-.035em]">Reservaciones</h1></div>
              <Button size="sm" icon={<CalendarDays size={15} />} onClick={() => useApp.getState().crear({ tipo: 'reservacion' })}>Nueva reservación</Button>
            </header>
            <div className="grid min-w-0 grid-cols-1 items-start gap-5 min-[1280px]:grid-cols-[minmax(0,1fr)_260px]">
              <section className="min-w-0 overflow-hidden rounded-[12px] border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4"><h2 className="text-[16px] font-semibold text-ink">Reservaciones <span className="ml-1 text-[12px] text-ink-soft">{lista.length}</span></h2><label className="flex h-9 w-full max-w-[280px] min-w-0 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-ink-soft"><Search size={14} className="shrink-0" /><input aria-label="Buscar reservaciones" className="w-full min-w-0 flex-1 bg-transparent text-[12px] outline-none" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar huésped, código o teléfono" />{texto && <button type="button" onClick={() => setTexto('')} aria-label="Borrar búsqueda"><X size={14} /></button>}</label></div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line px-4" aria-label="Filtrar reservaciones">
                  {([{ value: 'atender', label: 'Por atender' }, { value: 'proximas', label: 'Próximas' }, { value: 'todas', label: 'Todas' }, { value: 'canceladas', label: 'Canceladas' }] as const).map((tab) => <button key={tab.value} type="button" aria-pressed={filtro === tab.value} onClick={() => setFiltro(tab.value)} className={cx('min-h-11 border-b-2 text-[12px] transition-colors', filtro === tab.value ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>{tab.label}{tab.value === 'atender' && grupos.atender.length > 0 && <span className="ml-1.5 rounded bg-sunken px-1.5 py-0.5 text-[10px]">{grupos.atender.length}</span>}</button>)}
                </div>
                <div ref={listaRef} className="min-w-0 divide-y divide-line">
                  {lista.length === 0 ? <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-10 text-center"><Loto size={32} hueco="var(--surface)" /><p className="mt-4 text-[16px] font-semibold text-ink">{texto ? 'Sin resultados' : 'No hay reservaciones en esta vista'}</p><p className="mt-2 max-w-[35ch] text-[12px] text-ink-soft">{texto ? 'Prueba con otro nombre, código o número.' : 'Las nuevas estancias aparecerán aquí.'}</p></div> : lista.map((r) => <Renglon key={r.id} r={r} cabana={nombreDe(d, r.cabana_id)} activo={r.id === abierta} onClick={() => abrir(r.id)} onMenu={(e) => abrirMenu(e, r)} />)}
                </div>
              </section>
              <aside className="grid min-w-0 grid-cols-1 gap-4">
                <section className="min-w-0 rounded-[12px] border border-line bg-surface p-4"><h2 className="text-[15px] font-semibold text-ink">Resumen</h2><div className="mt-5 border-b border-line pb-4"><p className="text-[11px] text-ink-soft">Saldo por cobrar</p><p className="mt-1 break-words text-[26px] font-semibold text-ink leading-tight tracking-[-.03em] tabular"><AnimatedNumber value={pendientes} format="money" /></p></div><dl className="mt-4 space-y-3 text-[12px]"><div className="flex justify-between gap-2"><dt className="text-ink-soft">Por atender</dt><dd className="shrink-0 font-semibold text-ink tabular"><AnimatedNumber value={grupos.atender.length} /></dd></div><div className="flex justify-between gap-2"><dt className="text-ink-soft">Estancias confirmadas</dt><dd className="shrink-0 font-semibold text-ink tabular"><AnimatedNumber value={estancias.length} /></dd></div><div className="flex justify-between gap-2"><dt className="text-ink-soft">Llegadas en 7 días</dt><dd className="shrink-0 font-semibold text-ink tabular"><AnimatedNumber value={llegadas.length} /></dd></div></dl></section>
                <section className="min-w-0 rounded-[12px] border border-line bg-surface p-4"><div className="flex items-baseline justify-between gap-2"><h2 className="text-[15px] font-semibold text-ink">Próximas llegadas</h2><span className="text-[10px] text-ink-soft">7 días</span></div><div className="mt-3 divide-y divide-line">{llegadas.slice(0, 4).map((r) => <button key={r.id} type="button" onClick={() => abrir(r.id)} className="flex w-full min-w-0 items-start gap-2 py-3 text-left hover:text-primary"><span className="min-w-0 flex-1"><strong className="block truncate text-[13px] font-semibold text-ink" title={r.nombre}>{r.nombre}</strong><span className="mt-0.5 block truncate text-[11px] text-ink-soft">{nombreDe(d, r.cabana_id)}</span></span><span className="shrink-0 text-[11px] text-ink-soft">{corta(r.llegada)}</span></button>)}{!llegadas.length && <p className="py-3 text-[12px] text-ink-soft">Sin llegadas en los próximos 7 días.</p>}</div><button type="button" onClick={() => useApp.getState().ir('calendario')} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">Ver calendario <ArrowUpRight size={13} /></button></section>
              </aside>
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
  return <button data-id={r.id} onClick={onClick} onContextMenu={onMenu} className={cx('reservation-list-row', activo && 'is-selected')}>
    <span className="reservation-row-main">
      <span className="reservation-identity"><span className="reservation-name-line"><strong title={r.nombre}>{r.nombre}</strong><span className="reservation-code" aria-label={`Código ${r.codigo}`}>{r.codigo}</span></span><span className="reservation-property" title={cabana}>{cabana}</span></span>
      <span className="reservation-amount"><small>Total de la estancia</small><strong>{mxn(r.total)}</strong><span className={cx('reservation-balance', v?.urgente && 'is-urgent')}>{v ? v.texto : !activa(r) ? 'Cancelada' : falta > 0 ? `Por cobrar ${mxn(falta)}` : 'Todo pagado'}</span></span>
    </span>
    <span className="reservation-row-footer"><span className="reservation-dates">{corta(r.llegada)} <span>→</span> {corta(r.salida)}</span><span className="reservation-guest-count">{plural(noches(r.llegada,r.salida), 'noche','noches')} · {plural(r.huespedes, 'persona','personas')}</span><span className={cx('reservation-state', !activa(r) ? 'is-cancelled' : r.estado === 'solicitud' ? 'is-request' : '')}><i />{e.label}</span></span>
  </button>
}

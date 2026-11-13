// Calendario: hospedajes contra días. Se arrastra sobre días libres para crear una reservación o
// cerrar fechas, se arrastra una reservación para moverla (a otras fechas o a otro hospedaje) y su
// orilla derecha para alargarla. El trackpad desliza los días de lado.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Lock, LockOpen, Plus, Users } from 'lucide-react'
import { useApp } from '@/lib/store'
import { activa } from '@/lib/estados'
import { corta, dia, diaCorto, diaSemana, masDias, mesLargo, noches, plural, rango } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { borrarCierre, moverCierre, moverReservacion } from '@/lib/acciones'
import { TIPO } from '@/lib/ocupacion'
import { CMD } from '@/lib/mac'
import type { Bloqueo, Datos, ISODate, Reservacion } from '@/lib/tipos'
import { Button, Empty, MenuList, Popover, cx, toast, useMenuContextual } from '@/components/ui'
import { useMenuReservacion } from '@/components/menuReservacion'

const CELDA = 46
// Con pocos hospedajes las filas crecen para aprovechar la ventana; con muchos, se desliza hacia abajo
const FILA_MIN = 58
const FILA_MAX = 112
const NOMBRES = 210

type Arrastre =
  | { tipo: 'nueva'; fila: number; a: number; b: number }
  | { tipo: 'mover'; r: Reservacion; x0: number; y0: number; dd: number; fila: number; movio: boolean }
  | { tipo: 'alargar'; r: Reservacion; x0: number; dd: number; movio: boolean }
  | { tipo: 'mover-cierre'; b: Bloqueo; x0: number; y0: number; dd: number; fila: number; movio: boolean }
  | { tipo: 'alargar-cierre'; b: Bloqueo; x0: number; dd: number; movio: boolean }

/** ¿Está libre ese hospedaje de llegada a salida (sin contar la propia reservación o cierre)? */
function libre(d: Datos, cabana: string, llegada: ISODate, salida: ISODate, ignorar?: string) {
  if (d.reservaciones.some((r) => r.id !== ignorar && r.cabana_id === cabana && activa(r) && r.llegada < salida && llegada < r.salida)) return false
  if (d.bloqueos.some((b) => b.id !== ignorar && b.cabana_id === cabana && b.inicio < salida && llegada < b.fin)) return false
  return true
}

export default function Calendario() {
  const d = useApp((s) => s.datos)!
  const irAHoy = useApp((s) => s.irAHoy)
  const [inicio, setInicio] = useState(() => masDias(d.hoy, -3))
  const [cuantos, setCuantos] = useState(28)
  const [FILA, setFila] = useState(FILA_MIN)
  const [arrastre, setArrastre] = useState<Arrastre | null>(null)
  const [eleccion, setEleccion] = useState<{ x: number; y: number; cabana: string; llegada: ISODate; salida: ISODate } | null>(null)
  const [cierreMenu, setCierreMenu] = useState<{ x: number; y: number; b: Bloqueo } | null>(null)
  const cuerpo = useRef<HTMLDivElement>(null)
  const marco = useRef<HTMLDivElement>(null)
  const tabla = useRef<HTMLDivElement>(null)
  const encabezado = useRef<HTMLDivElement>(null)
  const leyenda = useRef<HTMLDivElement>(null)
  const proximasRef = useRef<HTMLElement>(null)
  const ruedita = useRef(0)
  const arr = useRef<Arrastre | null>(null)
  arr.current = arrastre
  const { menu, abrirMenu } = useMenuReservacion()
  const ctx = useMenuContextual()

  useEffect(() => {
    if (irAHoy) setInicio(masDias(d.hoy, -3))
  }, [irAHoy, d.hoy])

  // Cuántos días caben a lo ancho y qué tan altas pueden ser las filas
  const nCabanas = d.cabanas.length
  useLayoutEffect(() => {
    const el = marco.current
    if (!el) return
    const medir = () => {
      setCuantos(Math.max(7, Math.floor((el.clientWidth - NOMBRES - 24) / CELDA)))
      if (!nCabanas || !tabla.current || !encabezado.current || !leyenda.current || !proximasRef.current) return
      const inicioTabla = tabla.current.getBoundingClientRect().top - el.getBoundingClientRect().top
      const abajo = leyenda.current.offsetHeight + proximasRef.current.offsetHeight + 28 // leyenda, próximas reservas y separaciones
      const libre = el.clientHeight - inicioTabla - abajo - encabezado.current.offsetHeight
      setFila(Math.max(FILA_MIN, Math.min(FILA_MAX, Math.floor(libre / nCabanas))))
    }
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    if (proximasRef.current) ro.observe(proximasRef.current)
    if (leyenda.current) ro.observe(leyenda.current)
    return () => ro.disconnect()
  }, [nCabanas])

  const dias = useMemo(() => Array.from({ length: cuantos }, (_, i) => masDias(inicio, i)), [inicio, cuantos])
  const fin = masDias(inicio, cuantos)
  const cabanas = d.cabanas
  const reservas = useMemo(() => d.reservaciones.filter((r) => activa(r) && r.salida > inicio && r.llegada < fin), [d, inicio, fin])
  const proximas = useMemo(
    () => d.reservaciones.filter((r) => activa(r) && r.llegada >= d.hoy).sort((a, b) => a.llegada.localeCompare(b.llegada)),
    [d.reservaciones, d.hoy],
  )
  const cierres = useMemo(() => d.bloqueos.filter((b) => b.fin > inicio && b.inicio < fin), [d, inicio, fin])

  const posicion = (clientX: number, clientY: number) => {
    const r = cuerpo.current!.getBoundingClientRect()
    return { col: Math.floor((clientX - r.left) / CELDA), fila: Math.max(0, Math.min(cabanas.length - 1, Math.floor((clientY - r.top) / FILA))) }
  }

  // Arrastrar: se sigue al mouse en toda la ventana mientras el botón está abajo
  useEffect(() => {
    if (!arrastre) return
    document.body.classList.add('arrastrando')
    const mover = (e: PointerEvent) => {
      const a = arr.current
      if (!a) return
      if (a.tipo === 'nueva') {
        const { col } = posicion(e.clientX, e.clientY)
        setArrastre({ ...a, b: Math.max(0, Math.min(cuantos - 1, col)) })
      } else if (a.tipo === 'mover' || a.tipo === 'mover-cierre') {
        const dd = Math.round((e.clientX - a.x0) / CELDA)
        const { fila } = posicion(e.clientX, e.clientY)
        const movio = a.movio || Math.abs(e.clientX - a.x0) > 4 || Math.abs(e.clientY - a.y0) > 4
        setArrastre({ ...a, dd, fila, movio })
      } else {
        const dd = Math.round((e.clientX - a.x0) / CELDA)
        setArrastre({ ...a, dd, movio: a.movio || Math.abs(e.clientX - a.x0) > 4 })
      }
    }
    const soltar = (e: PointerEvent) => {
      const a = arr.current
      setArrastre(null)
      document.body.classList.remove('arrastrando')
      if (!a) return
      if (a.tipo === 'nueva') {
        const lo = Math.min(a.a, a.b)
        const hi = Math.max(a.a, a.b)
        const cab = cabanas[a.fila]!
        const llegada = dias[lo]!
        const salida = masDias(dias[hi]!, 1)
        if (!libre(d, cab.id, llegada, salida)) return toast.error('Esas fechas ya están ocupadas', `${cab.nombre} · ${rango(llegada, salida)}`)
        setEleccion({ x: e.clientX, y: e.clientY, cabana: cab.id, llegada, salida })
        return
      }
      if (a.tipo === 'mover') {
        if (!a.movio) return useApp.getState().abrir(a.r.id)
        const cab = cabanas[a.fila]!
        const llegada = masDias(a.r.llegada, a.dd)
        const salida = masDias(a.r.salida, a.dd)
        if (cab.id === a.r.cabana_id && a.dd === 0) return
        if (!libre(d, cab.id, llegada, salida, a.r.id)) return toast.error('No cabe ahí', `${cab.nombre} ya está ocupada ${rango(llegada, salida)}`)
        if (a.r.huespedes > cab.capacidad) return toast.error(`${cab.nombre} es para ${plural(cab.capacidad, 'persona', 'personas')}`, `Esta reservación es de ${a.r.huespedes}`)
        void moverReservacion(a.r, { cabana_id: cab.id, llegada, salida })
      } else if (a.tipo === 'alargar') {
        if (!a.movio || a.dd === 0) return
        const salida = masDias(a.r.salida, a.dd)
        if (salida <= a.r.llegada) return
        if (!libre(d, a.r.cabana_id, a.r.llegada, salida, a.r.id)) return toast.error('Las noches siguientes ya están ocupadas')
        void moverReservacion(a.r, { salida })
      } else if (a.tipo === 'mover-cierre') {
        if (!a.movio) return setCierreMenu({ x: e.clientX, y: e.clientY, b: a.b })
        const cab = cabanas[a.fila]!
        const ini = masDias(a.b.inicio, a.dd)
        const fn = masDias(a.b.fin, a.dd)
        if (cab.id === a.b.cabana_id && a.dd === 0) return
        if (!libre(d, cab.id, ini, fn, a.b.id)) return toast.error('No cabe ahí', 'Hay una reservación o un cierre en esas fechas')
        void moverCierre(a.b, { cabana_id: cab.id, inicio: ini, fin: fn })
      } else {
        if (!a.movio || a.dd === 0) return
        const fn = masDias(a.b.fin, a.dd)
        if (fn <= a.b.inicio) return
        if (!libre(d, a.b.cabana_id, a.b.inicio, fn, a.b.id)) return toast.error('Esas noches ya están ocupadas')
        void moverCierre(a.b, { fin: fn })
      }
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar, { once: true })
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      document.body.classList.remove('arrastrando')
    }
    // Solo al empezar o terminar un arrastre
  }, [arrastre?.tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cabanas.length)
    return (
      <div className="flex h-full items-center justify-center">
        <Empty title="Todavía no hay hospedajes" body="Da de alta tus cabañas, casas y habitaciones para ver aquí sus fechas." action={<Button icon={<Plus size={16} />} onClick={() => (useApp.getState().ir('cabanas'), useApp.getState().editarCabana('nueva'))}>Agregar hospedaje</Button>} />
      </div>
    )

  const meses = [...new Set(dias.map((x) => x.slice(0, 7)))].map((m) => mesLargo(m + '-01') + ' ' + m.slice(0, 4))
  const barra = (desde: ISODate, hasta: ISODate) => {
    const a = noches(inicio, desde) + 0.5
    const b = noches(inicio, hasta) + 0.5
    const izq = Math.max(0, a)
    const der = Math.min(cuantos, b)
    return { left: izq * CELDA + 2, width: Math.max(10, (der - izq) * CELDA - 4), cortadaIzq: a < 0, cortadaDer: b > cuantos }
  }

  return (
    <div ref={marco} className="app-calendar-page interfaz flex h-full flex-col px-6 pt-8 pb-4">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading text-[30px] leading-[1.1]">Calendario de hospedajes</h1>
          <p className="mt-1.5 text-[14px] text-ink-soft first-letter:uppercase">{meses.join(' – ')} · disponibilidad por unidad</p>
        </div>
        <div className="app-calendar-actions flex items-center gap-2">
          <span className="app-calendar-hint mr-2 hidden text-[13px] text-ink-3 xl:inline">Arrastra sobre los días libres para reservar o cerrar</span>
          <Button variant="outline" size="icon-sm" aria-label="Dos semanas antes" onClick={() => setInicio(masDias(inicio, -14))}>
            <ChevronLeft size={17} />
          </Button>
          <Button variant="outline" size="sm" atajo={`${CMD}T`} onClick={() => setInicio(masDias(d.hoy, -3))}>
            Hoy
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Dos semanas después" onClick={() => setInicio(masDias(inicio, 14))}>
            <ChevronRight size={17} />
          </Button>
          <Button variant="secondary" size="sm" icon={<Lock size={14} />} atajo={`⇧${CMD}N`} onClick={() => useApp.getState().crear({ tipo: 'cierre' })}>
            Cerrar fechas
          </Button>
        </div>
      </div>

      <div
        ref={tabla}
        className="app-calendar-grid card relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        onWheel={(e) => {
          const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0
          if (!dx) return
          ruedita.current += dx
          const n = Math.trunc(ruedita.current / CELDA)
          if (n) {
            ruedita.current -= n * CELDA
            setInicio((x) => masDias(x, n))
          }
        }}
      >
        {/* Encabezado de días */}
        <div ref={encabezado} className="sticky top-0 z-20 flex border-b border-line bg-surface">
          <div className="sticky left-0 shrink-0 border-r border-line" style={{ width: NOMBRES }} />
          <div className="flex">
            {dias.map((x) => {
              const finde = diaSemana(x) === 5 || diaSemana(x) === 6
              const esHoy = x === d.hoy
              return (
                <div key={x} className={cx('flex flex-col items-center justify-center py-2 text-center', finde && 'bg-[color-mix(in_oklab,var(--ink)_3%,transparent)]', dia(x) === 1 && 'border-l border-line-strong')} style={{ width: CELDA }}>
                  <span className={cx('text-[11px] leading-none', esHoy ? 'font-semibold text-key' : 'text-ink-3')}>{dia(x) === 1 ? mesLargo(x).slice(0, 3) : diaCorto(x)}</span>
                  <span className={cx('mt-1 flex h-6 w-6 items-center justify-center rounded-full text-[13px] tabular', esHoy ? 'bg-primary font-semibold text-on-primary shadow-[0_0_12px_color-mix(in_oklab,var(--luz)_60%,transparent)]' : 'text-ink')}>{dia(x)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex">
          {/* Nombres */}
          <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface" style={{ width: NOMBRES }}>
            {cabanas.map((c) => (
              <button key={c.id} onClick={() => (useApp.getState().ir('cabanas'), useApp.getState().editarCabana(c.id))} className="flex w-full flex-col justify-center border-b border-line px-4 text-left hover:bg-wash" style={{ height: FILA }} title="Abrir en Hospedajes">
                <span className="text-[14px] leading-tight font-semibold">{c.nombre}</span>
                <span className="text-[12px] text-ink-3">
                  {TIPO[c.tipo].uno} · {plural(c.capacidad, 'persona', 'personas')}
                  {!c.publicada ? ' · no sale en la web' : ''}
                </span>
              </button>
            ))}
          </div>

          {/* Días */}
          <div
            ref={cuerpo}
            className="relative"
            style={{ width: cuantos * CELDA, height: cabanas.length * FILA }}
            onPointerDown={(e) => {
              if (e.button !== 0 || (e.target as HTMLElement).closest('[data-barra]')) return
              const { col, fila } = posicion(e.clientX, e.clientY)
              if (dias[col]! < d.hoy) return
              e.preventDefault()
              setArrastre({ tipo: 'nueva', fila, a: col, b: col })
            }}
          >
            {/* Cuadrícula */}
            {dias.map((x, i) => (
              <div key={x} className={cx('absolute inset-y-0', (diaSemana(x) === 5 || diaSemana(x) === 6) && 'bg-[color-mix(in_oklab,var(--ink)_3%,transparent)]', dia(x) === 1 && 'border-l border-line-strong', x < d.hoy && 'bg-[color-mix(in_oklab,var(--ink)_4.5%,transparent)]')} style={{ left: i * CELDA, width: CELDA }} />
            ))}
            {cabanas.map((c, i) => (
              <div key={c.id} className="absolute inset-x-0 border-b border-line" style={{ top: i * FILA, height: FILA }} />
            ))}
            {dias.includes(d.hoy) && <div className="pointer-events-none absolute inset-y-0 z-[1] w-[2px] bg-chispa-soft shadow-[0_0_10px_var(--luz)]" style={{ left: (noches(inicio, d.hoy) + 0.5) * CELDA - 1 }} />}

            {/* Selección nueva */}
            {arrastre?.tipo === 'nueva' && (
              <Seleccion d={d} fila={arrastre.fila} alto={FILA} a={Math.min(arrastre.a, arrastre.b)} b={Math.max(arrastre.a, arrastre.b)} dias={dias} />
            )}

            {/* Cierres */}
            {cierres.map((b) => {
              const a = arrastre && (arrastre.tipo === 'mover-cierre' || arrastre.tipo === 'alargar-cierre') && arrastre.b.id === b.id ? arrastre : null
              const fila = a?.tipo === 'mover-cierre' ? a.fila : cabanas.findIndex((c) => c.id === b.cabana_id)
              const ini = a?.tipo === 'mover-cierre' ? masDias(b.inicio, a.dd) : b.inicio
              const fn = a ? masDias(b.fin, a.dd) : b.fin
              if (fila < 0) return null
              const p = barra(ini, fn)
              const choca = a && a.movio && !libre(d, cabanas[fila]!.id, ini, fn, b.id)
              return (
                <div
                  key={b.id}
                  data-barra
                  title={`Cerrada ${rango(b.inicio, b.fin)}${b.motivo ? ` · ${b.motivo}` : ''}`}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    setArrastre({ tipo: 'mover-cierre', b, x0: e.clientX, y0: e.clientY, dd: 0, fila: cabanas.findIndex((c) => c.id === b.cabana_id), movio: false })
                  }}
                  onContextMenu={(e) =>
                    ctx.abrir(e, [
                      { label: 'Abrir estas fechas', icon: <LockOpen />, hint: 'Quita el cierre', onClick: () => void borrarCierre(b) },
                    ])
                  }
                  className={cx('rayas absolute z-[2] flex cursor-grab items-center gap-1.5 overflow-hidden rounded-[10px] bg-sunken px-2.5 text-[12px] font-medium text-ink-soft ring-1 ring-line-strong ring-inset', a && 'z-[5] shadow-[var(--shadow-3)]', choca && 'ring-2 ring-danger')}
                  style={{ top: fila * FILA + 8, height: FILA - 16, left: p.left, width: p.width, borderTopLeftRadius: p.cortadaIzq ? 0 : undefined, borderBottomLeftRadius: p.cortadaIzq ? 0 : undefined }}
                >
                  <Lock size={12} className="shrink-0" />
                  {p.width > 90 && <span className="leading-tight">{b.motivo ?? 'Cerrada'}</span>}
                  <Orilla onDown={(e) => setArrastre({ tipo: 'alargar-cierre', b, x0: e.clientX, dd: 0, movio: false })} />
                </div>
              )
            })}

            {/* Reservaciones */}
            {reservas.map((r) => {
              const a = arrastre && (arrastre.tipo === 'mover' || arrastre.tipo === 'alargar') && arrastre.r.id === r.id ? arrastre : null
              const fila = a?.tipo === 'mover' ? a.fila : cabanas.findIndex((c) => c.id === r.cabana_id)
              const llegada = a?.tipo === 'mover' ? masDias(r.llegada, a.dd) : r.llegada
              const salida = a ? masDias(r.salida, a.dd) : r.salida
              if (fila < 0 || salida <= llegada) return null
              const p = barra(llegada, salida)
              const choca = a && a.movio && !libre(d, cabanas[fila]!.id, llegada, salida, r.id)
              const tono = r.estado === 'solicitud' ? 'barra-solicitud rayas' : r.estado === 'pagada' ? 'barra-pagada' : 'barra-confirmada'
              const nombre = p.cortadaIzq || p.cortadaDer ? '' : p.width >= 130 ? r.nombre : p.width >= 64 ? r.nombre.split(' ')[0] : p.width >= 48 ? r.nombre.split(' ').map((x) => x[0]).slice(0, 2).join('') : ''
              return (
                <div
                  key={r.id}
                  data-barra
                  title={`${r.nombre} · ${rango(r.llegada, r.salida)} · ${plural(r.huespedes, 'persona', 'personas')} · ${mxn(r.total)}`}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    setArrastre({ tipo: 'mover', r, x0: e.clientX, y0: e.clientY, dd: 0, fila: cabanas.findIndex((c) => c.id === r.cabana_id), movio: false })
                  }}
                  onContextMenu={(e) => abrirMenu(e, r)}
                  className={cx('absolute z-[3] flex cursor-grab flex-col justify-center overflow-hidden rounded-[10px] px-2.5 ring-1 ring-inset transition-shadow', tono, a && a.movio && 'z-[6] cursor-grabbing shadow-[var(--shadow-3)]', choca && 'ring-2 ring-danger')}
                  style={{ top: fila * FILA + 7, height: FILA - 14, left: p.left, width: p.width, borderTopLeftRadius: p.cortadaIzq ? 0 : undefined, borderBottomLeftRadius: p.cortadaIzq ? 0 : undefined, borderTopRightRadius: p.cortadaDer ? 0 : undefined, borderBottomRightRadius: p.cortadaDer ? 0 : undefined }}
                >
                  {nombre && <span className="text-[13px] leading-tight font-semibold whitespace-nowrap">{nombre}</span>}
                  {p.width >= 110 && <span className="text-[11px] leading-tight whitespace-nowrap opacity-80">{a && a.movio ? rango(llegada, salida) : r.estado === 'solicitud' ? 'Solicitud' : `${plural(r.huespedes, 'persona', 'personas')}`}</span>}
                  <Orilla onDown={(e) => setArrastre({ tipo: 'alargar', r, x0: e.clientX, dd: 0, movio: false })} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div ref={leyenda} className="app-calendar-legend mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-ink-3">
        <Leyenda clase="barra-confirmada">Confirmada</Leyenda>
        <Leyenda clase="barra-pagada">Pagada</Leyenda>
        <Leyenda clase="barra-solicitud rayas">Solicitud apartada</Leyenda>
        <Leyenda clase="rayas bg-sunken text-ink-3 ring-line-strong">Cerrada</Leyenda>
        <span className="ml-auto">Arrastra una reservación para moverla · su orilla derecha para alargarla · clic derecho para más</span>
      </div>

      <section ref={proximasRef} className="app-calendar-upcoming" aria-label="Próximas reservaciones">
        <div className="app-calendar-upcoming-heading">
          <div>
            <h2>Próximas reservaciones</h2>
            <p>{proximas.length ? `${proximas.length} por llegar · primero la más cercana` : 'Las nuevas reservaciones aparecerán aquí'}</p>
          </div>
          {proximas.length > 4 && (
            <Button size="sm" variant="outline" onClick={() => useApp.getState().ir('reservaciones')}>
              Ver todas
            </Button>
          )}
        </div>
        {proximas.length ? (
          <div className="app-calendar-upcoming-track">
            {proximas.map((r, i) => {
              const hospedaje = d.cabanas.find((c) => c.id === r.cabana_id)
              const dias = noches(d.hoy, r.llegada)
              const falta = dias === 0 ? 'Llega hoy' : dias === 1 ? 'Llega mañana' : `Llega en ${plural(dias, 'día', 'días')}`
              const estado = r.estado === 'solicitud' ? 'Solicitud' : r.estado === 'pagada' ? 'Pagada' : 'Confirmada'
              return (
                <button key={r.id} type="button" onClick={() => useApp.getState().abrir(r.id)} className={cx('app-calendar-upcoming-card', i === 0 && 'is-next')}>
                  <span className="app-calendar-upcoming-top">
                    <span className="app-calendar-upcoming-order">{i === 0 ? 'La que sigue' : `Después · ${i + 1}`}</span>
                    <span className={cx('app-calendar-upcoming-status', `is-${r.estado}`)}>{estado}</span>
                  </span>
                  <strong className="app-calendar-upcoming-guest">{r.nombre}</strong>
                  <span className="app-calendar-upcoming-property">{hospedaje?.nombre ?? 'Hospedaje'} · {TIPO[hospedaje?.tipo ?? 'cabana'].uno}</span>
                  <span className="app-calendar-upcoming-date"><CalendarDays size={14} /> {rango(r.llegada, r.salida)} · {plural(noches(r.llegada, r.salida), 'noche', 'noches')}</span>
                  <span className="app-calendar-upcoming-bottom">
                    <span><Users size={13} /> {plural(r.huespedes, 'persona', 'personas')} · {falta}</span>
                    <strong>{mxn(r.total)}</strong>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="app-calendar-upcoming-empty">No hay próximas reservaciones.</div>
        )}
      </section>

      <Popover open={!!eleccion} onClose={() => setEleccion(null)} anchor={eleccion ? { x: eleccion.x, y: eleccion.y } : { x: 0, y: 0 }} width={260} label="Fechas elegidas" title={eleccion ? `${cabanas.find((c) => c.id === eleccion.cabana)?.nombre} · ${rango(eleccion.llegada, eleccion.salida)}` : undefined}>
        {eleccion && (
          <MenuList
            onPick={() => setEleccion(null)}
            items={[
              { label: 'Nueva reservación', icon: <Plus />, hint: plural(noches(eleccion.llegada, eleccion.salida), 'noche', 'noches'), onClick: () => useApp.getState().crear({ tipo: 'reservacion', cabana_id: eleccion.cabana, llegada: eleccion.llegada, salida: eleccion.salida }) },
              { label: 'Cerrar estas fechas', icon: <Lock />, hint: 'Mantenimiento, uso propio o un evento', onClick: () => useApp.getState().crear({ tipo: 'cierre', cabana_id: eleccion.cabana, llegada: eleccion.llegada, salida: eleccion.salida }) },
            ]}
          />
        )}
      </Popover>
      <Popover open={!!cierreMenu} onClose={() => setCierreMenu(null)} anchor={cierreMenu ? { x: cierreMenu.x, y: cierreMenu.y } : { x: 0, y: 0 }} width={250} label="Cierre" title={cierreMenu ? `Cerrada ${rango(cierreMenu.b.inicio, cierreMenu.b.fin)}${cierreMenu.b.motivo ? ` · ${cierreMenu.b.motivo}` : ''}` : undefined}>
        {cierreMenu && <MenuList onPick={() => setCierreMenu(null)} items={[{ label: 'Abrir estas fechas', icon: <LockOpen />, hint: 'Quita el cierre', onClick: () => void borrarCierre(cierreMenu.b) }]} />}
      </Popover>
      {menu}
      {ctx.menu}
    </div>
  )
}

function Orilla({ onDown }: { onDown: (e: React.PointerEvent) => void }) {
  return (
    <span
      aria-hidden
      className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize after:absolute after:inset-y-2 after:right-1 after:w-[2px] after:rounded-full after:bg-current after:opacity-0 hover:after:opacity-40"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        onDown(e)
      }}
    />
  )
}

function Seleccion({ d, fila, alto, a, b, dias }: { d: Datos; fila: number; alto: number; a: number; b: number; dias: ISODate[] }) {
  const cab = d.cabanas[fila]!
  const llegada = dias[a]!
  const salida = masDias(dias[b]!, 1)
  const ok = libre(d, cab.id, llegada, salida)
  const n = b - a + 1
  return (
    <div className={cx('pointer-events-none absolute z-[4] flex items-center justify-center rounded-[10px] text-[12px] font-semibold ring-2 ring-inset', ok ? 'bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] text-ink ring-primary' : 'bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger ring-danger')} style={{ top: fila * alto + 7, height: alto - 14, left: a * CELDA + 2, width: n * CELDA - 4 }}>
      {n * CELDA > 80 ? `${plural(n, 'noche', 'noches')}${n * CELDA > 170 ? ` · ${corta(llegada)} – ${corta(salida)}` : ''}` : n}
    </div>
  )
}

function Leyenda({ clase, children }: { clase: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('h-3 w-5 rounded-[4px] ring-1 ring-inset', clase)} />
      {children}
    </span>
  )
}

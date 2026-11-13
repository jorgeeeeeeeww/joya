// Detalle de una reservación: estancia, dinero (una tira con cada noche que se va llenando conforme se paga),
// datos del huésped, mensaje de WhatsApp ya escrito e historia. Se usa en «Reservaciones» (lado a lado,
// como en Mail) y como panel a la derecha en las demás pantallas.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Ban, BedDouble, CalendarRange, Check, ChevronDown, Copy, Link2, MessageCircle, MoreHorizontal, RotateCcw, Trash2, Undo2, Wallet, X } from 'lucide-react'
import type { Detalle, MetodoPago } from '@/lib/tipos'
import { rpc } from '@/lib/nube'
import { useApp } from '@/lib/store'
import { ESTADO, METODO, MOTIVO, ORIGEN, saldo as saldoDe } from '@/lib/estados'
import { corta, dia, diaCorto, diaLocal, hace, hora, larga, noches as contarNoches, plural, venceEn, masDias } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { ligaWhatsApp, mensajePara } from '@/lib/mensajes'
import { abrirLiga, copiar } from '@/lib/mac'
import { actualizarReservacion, borrarPago, cambiarEstado, registrarPago } from '@/lib/acciones'
import { ocupacionDe } from '@/lib/ocupacion'
import type { Cotizacion, ISODate } from '@/lib/tipos'
import { Badge, Button, MenuList, Popover, toast, cx } from './ui'
import { LightDots } from './step1'
import { Campo, CampoDinero, CampoLargo, CampoTelefono, Contador, Pastillas, RangoFechas, formatoTelefono } from './campos'

export function useDetalle(id: string | null) {
  const ultima = useApp((s) => s.ultimaCarga)
  const [d, setD] = useState<Detalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return setD(null)
    let vivo = true
    rpc<Detalle>('hosp_reservacion', { p_id: id })
      .then((x) => vivo && (setD(x), setError(null)))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      vivo = false
    }
  }, [id, ultima])
  useEffect(() => setD((x) => (x && x.id !== id ? null : x)), [id])
  return { d, error, setD }
}

export function DetalleReservacion({ id, enPanel, onCerrar }: { id: string; enPanel?: boolean; onCerrar?: () => void }) {
  const { d, error, setD } = useDetalle(id)
  const datos = useApp((s) => s.datos)
  if (error && !d)
    return (
      <div className="flex h-full flex-col items-center justify-center p-10 text-center">
        <p className="font-medium">No se pudo abrir esta reservación</p>
        <p className="mt-1 text-[13px] text-ink-soft">{error}</p>
      </div>
    )
  if (!d || !datos)
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center">
        <LightDots />
      </div>
    )
  return <Contenido key={d.id} d={d} setD={setD} enPanel={enPanel} onCerrar={onCerrar} />
}

function Contenido({ d, setD, enPanel, onCerrar }: { d: Detalle; setD: (d: Detalle) => void; enPanel?: boolean; onCerrar?: () => void }) {
  const datos = useApp((s) => s.datos)!
  const aj = datos.ajustes
  const hospedaje = datos.cabanas.find((c) => c.id === d.cabana_id)
  const e = ESTADO[d.estado]
  const n = contarNoches(d.llegada, d.salida)
  const falta = saldoDe(d)
  const [editando, setEditando] = useState(false)
  const [pagando, setPagando] = useState(false)
  const [seccionActiva, setSeccionActiva] = useState('perfil')
  // Si el pago se empezó tocando una noche de la tira, el monto ya viene con lo que hace falta para cubrir hasta ahí
  const [montoInicial, setMontoInicial] = useState<number | null>(null)
  const masRef = useRef<HTMLButtonElement>(null)
  const [mas, setMas] = useState(false)
  const v = d.estado === 'solicitud' ? venceEn(d.vence) : null

  const principal =
    d.estado === 'solicitud' ? (
      <Button icon={<Check size={16} strokeWidth={2} />} onClick={async () => setD((await cambiarEstado(d, 'confirmada')) ?? d)}>
        Confirmar
      </Button>
    ) : d.estado === 'confirmada' ? (
      <Button icon={<Wallet size={16} />} onClick={() => setPagando(true)}>
        Registrar pago
      </Button>
    ) : d.estado === 'cancelada' ? (
      <Button variant="outline" icon={<RotateCcw size={15} />} onClick={async () => setD((await cambiarEstado(d, 'confirmada')) ?? d)}>
        Reactivar
      </Button>
    ) : null

  return (
    <div className={cx('app-reservation-detail flex flex-col', enPanel ? 'pt-6' : 'px-8 pt-7 pb-12')}>
      <div className="app-reservation-topbar flex items-center gap-3">
        {onCerrar && !enPanel && (
          <Button variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Volver a la lista" title="Volver a la lista">
            <ArrowLeft size={18} strokeWidth={1.8} />
          </Button>
        )}
        <div className="app-reservation-title min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={e.tono} dot>
              {e.label}
            </Badge>
            <button onClick={() => void copiar(d.codigo).then(() => toast.success(`Copiaste ${d.codigo}`))} title="Copiar código" className="pressable inline-flex h-[22px] items-center gap-1 rounded-full bg-sunken px-2 text-[12px] font-semibold tracking-wide text-ink-soft tabular hover:text-ink">
              {d.codigo}
              <Copy size={11} />
            </button>
            <span className="text-[12px] text-ink-3">
              {ORIGEN[d.origen]} · {hace(d.creada)}
            </span>
          </div>
          <h2 className="heading mt-2 text-[1.4rem] leading-tight">Perfil del huésped</h2>
          <p className="mt-1 text-[13px] text-ink-soft">{d.nombre} · {d.cabana} · {plural(n, 'noche', 'noches')} · {plural(d.huespedes, 'persona', 'personas')}</p>
        </div>
        <div className="app-reservation-actions flex flex-wrap items-center gap-2">
          {principal}
          <WhatsApp d={d} />
          <Button ref={masRef} variant="ghost" size="icon-sm" aria-label="Más acciones" onClick={() => setMas((o) => !o)}>
            <MoreHorizontal size={18} />
          </Button>
          {enPanel && onCerrar && (
            <Button variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Cerrar (Esc)" title="Cerrar (Esc)">
              <X size={18} strokeWidth={1.6} />
            </Button>
          )}
          <Popover open={mas} onClose={() => setMas(false)} anchor={masRef} width={260} label="Más acciones">
            <MenuList
              onPick={() => setMas(false)}
              items={[
                { label: 'Cambiar fechas o cabaña', icon: <CalendarRange />, onClick: () => setEditando(true), hidden: d.estado === 'cancelada' },
                { label: 'Registrar pago', icon: <Wallet />, onClick: () => setPagando(true), hidden: d.estado === 'cancelada' || d.estado === 'confirmada' },
                { label: 'Volver a solicitud', icon: <Undo2 />, hint: `Se aparta otra vez ${aj.horas_apartado} h`, onClick: async () => setD((await cambiarEstado(d, 'solicitud')) ?? d), hidden: d.estado !== 'confirmada' || d.pagado > 0 },
                { label: 'Copiar liga «Mi reservación»', icon: <Link2 />, onClick: () => void copiar(d.liga!).then(() => toast.success('Copiaste la liga del huésped')), hidden: !d.liga },
                { label: 'Cancelar reservación', icon: <Ban />, danger: true, separado: true, onClick: async () => setD((await cambiarEstado(d, 'cancelada', 'rancho')) ?? d), hidden: d.estado === 'cancelada' },
              ]}
            />
          </Popover>
        </div>
      </div>

      <nav className="app-reservation-tabs mt-4 flex flex-wrap items-center gap-1" aria-label="Secciones de la reservación">
        <a href={`#perfil-${d.id}`} className="app-reservation-tab" aria-label="Sobre el huésped" aria-current={seccionActiva === 'perfil' ? 'page' : undefined} onClick={() => setSeccionActiva('perfil')}>Sobre el huésped</a>
        <a href={`#estancia-${d.id}`} className="app-reservation-tab" aria-current={seccionActiva === 'estancia' ? 'page' : undefined} onClick={() => setSeccionActiva('estancia')}>Estancia</a>
        <a href={`#pagos-${d.id}`} className="app-reservation-tab" aria-current={seccionActiva === 'pagos' ? 'page' : undefined} onClick={() => setSeccionActiva('pagos')}>Pagos</a>
        <a href={`#notas-${d.id}`} className="app-reservation-tab" aria-current={seccionActiva === 'notas' ? 'page' : undefined} onClick={() => setSeccionActiva('notas')}>Notas</a>
      </nav>

      {v && (
        <div className={cx('app-reservation-alert mt-5 flex items-center gap-3 rounded-[14px] px-4 py-3 text-[14px]', v.urgente ? 'bg-[color-mix(in_oklab,var(--chispa)_12%,var(--surface))]' : 'bg-peach-soft')}>
          <span className={cx('font-semibold', v.urgente ? 'text-chispa' : 'text-peach-ink')}>Apartada: {v.texto}</span>
          <span className="text-ink-soft">Si no la confirmas, las fechas se liberan solas.</span>
        </div>
      )}
      {d.estado === 'cancelada' && (
        <div className="app-reservation-alert mt-5 rounded-[14px] bg-rose-soft px-4 py-3 text-[14px] text-rose-ink">
          Cancelada{d.motivo_cancelacion ? `: ${MOTIVO[d.motivo_cancelacion]}` : ''}
          {d.cancelada_en ? ` · ${hace(d.cancelada_en)}` : ''}. Las fechas quedaron libres.
        </div>
      )}

      <div className="app-reservation-grid mt-4">
        <Seccion id={`perfil-${d.id}`} className="app-detail-profile" titulo="Perfil">
          <div className="app-guest-identity mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-[15px] font-semibold text-primary">{d.nombre.trim().charAt(0).toUpperCase()}</span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">{d.nombre}</span>
              <span className="mt-0.5 block text-[12px] text-ink-3">{d.correo || d.telefono || 'Datos de contacto'}</span>
            </span>
          </div>
          <Huesped d={d} setD={setD} />
        </Seccion>

        <Seccion id={`estancia-${d.id}`} className="app-detail-booking" titulo="Información de la reservación" accion={d.estado !== 'cancelada' && !editando ? <Enlace onClick={() => setEditando(true)}>Cambiar</Enlace> : undefined}>
          {editando ? (
            <EditarEstancia d={d} onListo={(x) => (x && setD(x), setEditando(false))} />
          ) : (
            <>
              <div className="app-detail-booking-preview">
                <div className="app-detail-booking-description">
                  <span>{hospedaje?.tipo === 'habitacion' ? 'Habitación' : hospedaje?.tipo === 'casa' ? 'Casa' : 'Cabaña'}</span>
                  <strong>{d.cabana}</strong>
                  <small>{plural(d.huespedes, 'huésped', 'huéspedes')} · {plural(n, 'noche', 'noches')}</small>
                </div>
                <span className="app-detail-booking-placeholder" aria-label="Ilustración del hospedaje"><BedDouble size={20} strokeWidth={1.5} /></span>
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] bg-line ring-1 ring-line">
                <Dato etiqueta="Llega" valor={<span className="first-letter:uppercase">{larga(d.llegada)}</span>} detalle={d.hora_llegada ? `Dijo que como a las ${d.hora_llegada}` : aj.hora_llegada ? `Desde las ${aj.hora_llegada}` : undefined} />
                <Dato etiqueta="Se va" valor={<span className="first-letter:uppercase">{larga(d.salida)}</span>} detalle={aj.hora_salida ? `A las ${aj.hora_salida}` : undefined} />
              </div>
            </>
          )}
        </Seccion>

        <Seccion id={`pagos-${d.id}`} className="app-detail-payments" titulo="Pagos">
          <TiraNoches d={d} onCubrir={d.estado === 'cancelada' ? undefined : (m) => (setMontoInicial(m), setPagando(true))} />
          <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[14px] bg-line ring-1 ring-line">
            <Dato etiqueta="Total" valor={mxn(d.total)} />
            <Dato etiqueta="Pagado" valor={mxn(d.pagado)} detalle={d.anticipo > 0 ? `Anticipo: ${mxn(d.anticipo)}` : undefined} />
            <Dato etiqueta="Falta" valor={<span className={falta > 0 ? 'text-key' : 'text-success'}>{falta > 0 ? mxn(falta) : 'Nada'}</span>} />
          </div>
          <AnimatePresence initial={false}>
            {pagando && d.estado !== 'cancelada' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <NuevoPago key={montoInicial ?? 'sugerido'} d={d} inicial={montoInicial} onListo={(x) => (x && setD(x), setPagando(false), setMontoInicial(null))} />
              </motion.div>
            )}
          </AnimatePresence>
          {!pagando && d.estado !== 'cancelada' && falta > 0 && (
            <Button variant="primary" size="sm" className="mt-3" icon={<Wallet size={15} />} onClick={() => setPagando(true)}>
              Registrar pago
            </Button>
          )}
          {d.pagos.length > 0 && (
            <div className="mt-4 divide-y divide-line rounded-[14px] ring-1 ring-line">
              {d.pagos.map((p) => (
                <div key={p.id} className="group flex items-center gap-3 px-4 py-2.5 text-[14px]">
                  <span className="w-20 font-semibold tabular">{mxn(p.monto)}</span>
                  <span className="min-w-0 flex-1 text-ink-soft">
                    {METODO[p.metodo]} · {diaCorto(p.fecha)} {corta(p.fecha)}
                    {p.referencia ? ` · ${p.referencia}` : ''}
                  </span>
                  <button
                    title="Quitar este pago"
                    aria-label={`Quitar el pago de ${mxn(p.monto)}`}
                    onClick={async () => {
                      const x = await borrarPago(p.id, p.monto)
                      if (x) setD(x)
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-wash hover:text-danger focus-visible:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Desglose d={d} />
        </Seccion>

        <Seccion id={`notas-${d.id}`} className="app-detail-notes" titulo="Notas">
          <Notas d={d} setD={setD} />
          <div className="app-detail-history">
            <h4>Actividad reciente</h4>
            <ol>
              {d.eventos.map((ev, i) => (
                <li key={i}>
                  <span className={cx('app-detail-history-dot', i === d.eventos.length - 1 && 'is-current')} />
                  <div>{ev.detalle}<small>{corta(diaLocal(ev.creado))} · {hora(ev.creado)}</small></div>
                </li>
              ))}
            </ol>
          </div>
        </Seccion>
      </div>
    </div>
  )
}

function Seccion({ id, className, titulo, accion, children }: { id?: string; className?: string; titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={cx('app-detail-section mt-8', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em]">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  )
}
const Enlace = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} className="text-[13px] font-medium text-key underline-offset-2 hover:underline">
    {children}
  </button>
)
function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: ReactNode; detalle?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="kicker">{etiqueta}</div>
      <div className="mt-1 text-[15px] font-semibold tabular">{valor}</div>
      {detalle && <div className="mt-0.5 text-[12px] text-ink-3">{detalle}</div>}
    </div>
  )
}

/**
 * Una casilla por noche, con su día. Se van llenando conforme entra el dinero, una rayita marca hasta dónde llega el
 * anticipo y, al tocar una noche, se abre el pago ya con lo que falta para cubrir hasta esa noche.
 */
function TiraNoches({ d, onCubrir }: { d: Detalle; onCubrir?: (monto: number) => void }) {
  const n = Math.max(1, contarNoches(d.llegada, d.salida))
  const fr = d.total > 0 ? Math.min(1, d.pagado / d.total) : 0
  const antFr = d.total > 0 && d.anticipo > 0 && d.anticipo < d.total ? d.anticipo / d.total : null
  const cubierto = d.anticipo > 0 && d.pagado >= d.anticipo
  const corta_ = n > 12
  const llena = 'color-mix(in oklab, var(--success) 34%, var(--surface))'
  return (
    <div aria-label={`${Math.round(fr * 100)} % pagado`}>
      <div className="relative">
        {antFr !== null && n <= 31 && (
          <span aria-hidden className="pointer-events-none absolute -top-2.5 z-10 h-[calc(100%+10px)] w-px bg-chispa/70" style={{ left: `${antFr * 100}%` }} title="Hasta aquí llega el anticipo">
            <span className="absolute -top-px left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-chispa" />
          </span>
        )}
        {n > 31 ? (
          <div className="h-3 overflow-hidden rounded-full bg-sunken ring-1 ring-line">
            <div className="h-full rounded-full" style={{ width: `${fr * 100}%`, background: llena }} />
          </div>
        ) : (
          <div className="flex gap-[3px]">
            {Array.from({ length: n }, (_, i) => {
              const noche = masDias(d.llegada, i)
              const parte = Math.max(0, Math.min(1, fr * n - i))
              // Lo que hay que haber pagado para tener cubierta esta noche
              const objetivo = Math.min(d.total, Math.ceil((d.total * (i + 1)) / n))
              const puede = !!onCubrir && objetivo > d.pagado
              const Cel = puede ? 'button' : 'div'
              return (
                <Cel
                  key={i}
                  {...(puede ? { type: 'button' as const, onClick: () => onCubrir!(objetivo - d.pagado), title: `Cubrir hasta la noche del ${diaCorto(noche)} ${corta(noche)}: ${mxn(objetivo - d.pagado)}`, 'aria-label': `Registrar ${mxn(objetivo - d.pagado)} para cubrir hasta la noche del ${diaCorto(noche)} ${corta(noche)}` } : {})}
                  className={cx('relative min-w-0 flex-1 overflow-hidden rounded-[8px] bg-sunken text-center ring-1 ring-line ring-inset', corta_ ? 'h-11' : 'h-[58px]', puede && 'pressable cursor-pointer hover:ring-line-strong')}
                >
                  <motion.span aria-hidden className="absolute inset-x-0 bottom-0 block" style={{ background: llena }} initial={false} animate={{ height: `${parte * 100}%` }} transition={{ duration: 0.6, delay: i * 0.025 }} />
                  <span className="relative flex h-full flex-col items-center justify-center leading-none">
                    {!corta_ && <span className="text-[11px] text-ink-3 uppercase">{diaCorto(noche)}</span>}
                    <span className={cx('tabular font-semibold', corta_ ? 'text-[11px]' : 'mt-1 text-[15px]')}>{dia(noche)}</span>
                  </span>
                </Cel>
              )
            })}
          </div>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 text-[12px] text-ink-3">
        <span>{plural(n, 'noche', 'noches')}{antFr !== null ? (cubierto ? ' · anticipo cubierto' : ' · falta el anticipo') : ''}</span>
        <span className={cx('font-semibold', fr >= 1 ? 'text-success' : 'text-ink-soft')}>{fr >= 1 ? 'Pagada por completo' : fr > 0 ? `${Math.round(fr * 100)} % pagado` : 'Sin pagos todavía'}</span>
      </div>
      {onCubrir && fr < 1 && n <= 31 && <p className="mt-1 text-[12px] text-ink-3">Toca una noche para registrar el pago que la cubre.</p>}
    </div>
  )
}

/** Registrar un pago: se arrastra sobre la barra o se elige anticipo / saldo */
function NuevoPago({ d, inicial, onListo }: { d: Detalle; inicial?: number | null; onListo: (d: Detalle | null) => void }) {
  const falta = saldoDe(d)
  const faltaAnticipo = Math.max(0, d.anticipo - d.pagado)
  const [monto, setMonto] = useState<number | null>(inicial ?? (faltaAnticipo > 0 ? faltaAnticipo : falta))
  const [metodo, setMetodo] = useState<MetodoPago>('transferencia')
  const [referencia, setReferencia] = useState(d.codigo)
  const [guardando, setGuardando] = useState(false)
  const barra = useRef<HTMLDivElement>(null)
  const pct = (x: number) => `${d.total ? Math.min(100, (x / d.total) * 100) : 0}%`
  const desdeX = (x: number) => {
    const r = barra.current!.getBoundingClientRect()
    const valor = Math.round(((x - r.left) / r.width) * d.total) - d.pagado
    const m = Math.max(0, Math.min(falta, Math.round(valor / 50) * 50))
    // Se pega al anticipo o al saldo si queda cerca
    const iman = [faltaAnticipo, falta].find((p) => p > 0 && Math.abs(p - m) <= d.total * 0.03)
    setMonto(iman ?? (m || null))
  }
  const ok = !!monto && monto > 0
  return (
    <div className="mt-4 rounded-[14px] bg-sunken p-4">
      <div className="mb-1 flex items-center justify-between text-[13px] text-ink-soft">
        <span>Arrastra sobre la barra para elegir cuánto pagó</span>
        <span className="font-semibold text-ink tabular">{monto ? mxn(monto) : '—'}</span>
      </div>
      <div
        ref={barra}
        role="slider"
        aria-label="Monto del pago"
        aria-valuemin={0}
        aria-valuemax={falta}
        aria-valuenow={monto ?? 0}
        tabIndex={0}
        className="relative my-2 h-9 cursor-ew-resize touch-none rounded-full bg-surface ring-1 ring-line ring-inset"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          desdeX(e.clientX)
        }}
        onPointerMove={(e) => e.buttons === 1 && desdeX(e.clientX)}
        onKeyDown={(e) => {
          const paso = e.shiftKey ? 500 : 100
          if (e.key === 'ArrowRight') setMonto((m) => Math.min(falta, (m ?? 0) + paso))
          else if (e.key === 'ArrowLeft') setMonto((m) => Math.max(0, (m ?? 0) - paso) || null)
          else return
          e.preventDefault()
        }}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-sage" style={{ width: pct(d.pagado) }} />
        <motion.div className="absolute inset-y-0 rounded-r-full bg-luz shadow-[0_0_14px_var(--luz)]" style={{ left: pct(d.pagado) }} animate={{ width: pct(monto ?? 0) }} transition={{ duration: 0.18 }} />
        {d.anticipo > 0 && d.anticipo < d.total && (
          <div className="absolute inset-y-[-4px] w-px bg-ink-3" style={{ left: pct(d.anticipo) }}>
            <span className="absolute top-full mt-1 -translate-x-1/2 text-[11px] whitespace-nowrap text-ink-3">anticipo</span>
          </div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {faltaAnticipo > 0 && faltaAnticipo < falta && (
          <button onClick={() => setMonto(faltaAnticipo)} className={cx('pressable h-8 rounded-full px-3 text-[13px] ring-1 ring-inset', monto === faltaAnticipo ? 'bg-ink text-paper ring-ink' : 'text-ink-soft ring-line-strong hover:text-ink')}>
            Anticipo {mxn(faltaAnticipo)}
          </button>
        )}
        <button onClick={() => setMonto(falta)} className={cx('pressable h-8 rounded-full px-3 text-[13px] ring-1 ring-inset', monto === falta ? 'bg-ink text-paper ring-ink' : 'text-ink-soft ring-line-strong hover:text-ink')}>
          Todo lo que falta {mxn(falta)}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <CampoDinero label="Monto" value={monto} onChange={setMonto} />
        <Campo label="Referencia" value={referencia} onChange={setReferencia} hint="El código o el número de la transferencia" />
      </div>
      <Pastillas
        className="mt-3"
        value={metodo}
        onChange={setMetodo}
        opciones={(Object.keys(METODO) as MetodoPago[]).map((m) => ({ value: m, label: METODO[m] }))}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onListo(null)}>
          No
        </Button>
        <Button
          disabled={!ok}
          loading={guardando}
          icon={<Check size={16} strokeWidth={2} />}
          onClick={async () => {
            setGuardando(true)
            const x = await registrarPago(d.id, monto!, metodo, referencia)
            setGuardando(false)
            if (x) onListo(x)
          }}
        >
          Registrar {monto ? mxn(monto) : ''}
        </Button>
      </div>
    </div>
  )
}

function Desglose({ d }: { d: Detalle }) {
  const [abierto, setAbierto] = useState(false)
  if (!d.desglose?.length) return null
  const extra = d.total - d.desglose.reduce((s, x) => s + Number(x.precio), 0)
  return (
    <div className="mt-3">
      <button onClick={() => setAbierto((a) => !a)} className="inline-flex items-center gap-1 text-[13px] text-ink-soft hover:text-ink">
        <ChevronDown size={15} className={cx('transition-transform duration-[var(--dur-2)]', abierto && 'rotate-180')} />
        Precio noche por noche
      </button>
      {abierto && (
        <div className="mt-2 grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1 text-[13px]">
          {d.desglose.map((x) => (
            <div key={x.fecha} className="contents">
              <span className="text-ink-soft first-letter:uppercase">
                {diaCorto(x.fecha)} {corta(x.fecha)}
              </span>
              <span className="text-ink-3">{x.tipo === 'temporada' ? x.temporada : x.tipo === 'fin_semana' ? 'Fin de semana' : ''}</span>
              <span className="text-right tabular">{mxn(x.precio)}</span>
            </div>
          ))}
          {Math.abs(extra) >= 1 && (
            <div className="contents">
              <span className="text-ink-soft">{extra > 0 ? 'Personas extra' : 'Ajuste'}</span>
              <span />
              <span className="text-right tabular">{mxn(extra)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Datos del huésped: se editan en su lugar y se guardan al salir del campo */
function Huesped({ d, setD }: { d: Detalle; setD: (d: Detalle) => void }) {
  const [f, setF] = useState({ nombre: d.nombre, telefono: d.telefono ?? '', correo: d.correo ?? '', hora_llegada: d.hora_llegada ?? '' })
  useEffect(() => setF({ nombre: d.nombre, telefono: d.telefono ?? '', correo: d.correo ?? '', hora_llegada: d.hora_llegada ?? '' }), [d.nombre, d.telefono, d.correo, d.hora_llegada])
  const guardar = async (k: keyof typeof f) => {
    const antes = d[k] ?? ''
    if (f[k].trim() === String(antes).trim()) return
    if (k === 'nombre' && f.nombre.trim().length < 2) return setF((x) => ({ ...x, nombre: d.nombre }))
    if (k === 'telefono' && f.telefono && f.telefono.length < 10) return
    const x = await actualizarReservacion(d.id, { [k]: f[k] })
    if (x) {
      setD(x)
      toast.success('Guardado')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Nombre" value={f.nombre} onChange={(v) => setF((x) => ({ ...x, nombre: v }))} onBlur={() => void guardar('nombre')} />
        <div onBlur={() => void guardar('telefono')}>
          <CampoTelefono label="WhatsApp" value={f.telefono} onChange={(v) => setF((x) => ({ ...x, telefono: v }))} />
        </div>
        <Campo label="Correo" type="email" value={f.correo} onChange={(v) => setF((x) => ({ ...x, correo: v }))} onBlur={() => void guardar('correo')} />
        <Campo label="Hora de llegada" value={f.hora_llegada} onChange={(v) => setF((x) => ({ ...x, hora_llegada: v }))} onBlur={() => void guardar('hora_llegada')} hint="Lo que dijo el huésped" />
      </div>
    </div>
  )
}

function Notas({ d, setD }: { d: Detalle; setD: (d: Detalle) => void }) {
  const [nota, setNota] = useState(d.notas ?? '')
  useEffect(() => setNota(d.notas ?? ''), [d.notas])
  const guardar = async () => {
    if (nota.trim() === (d.notas ?? '').trim()) return
    const x = await actualizarReservacion(d.id, { notas: nota })
    if (x) {
      setD(x)
      toast.success('Guardado')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {d.comentarios && (
        <article className="rounded-[10px] bg-sunken px-3.5 py-3 text-[13px]">
          <div className="kicker mb-1">Comentarios del huésped</div>
          <p className="whitespace-pre-line">{d.comentarios}</p>
        </article>
      )}
      <div onBlur={() => void guardar()}>
        <CampoLargo label="Notas internas" value={nota} onChange={setNota} hint="Solo las ve el rancho" maxLength={2000} minRows={3} />
      </div>
    </div>
  )
}

/** Botón de WhatsApp con la vista previa del mensaje que se va a mandar */
function WhatsApp({ d }: { d: Detalle }) {
  const aj = useApp((s) => s.datos!.ajustes)
  const ref = useRef<HTMLButtonElement>(null)
  const [abierto, setAbierto] = useState(false)
  const liga = ligaWhatsApp(d, aj)
  const texto = mensajePara(d, aj)
  return (
    <>
      <Button ref={ref} variant="outline" icon={<MessageCircle size={16} />} disabled={!liga} title={liga ? 'Ver el mensaje y abrir WhatsApp' : 'Falta el WhatsApp del huésped'} onClick={() => setAbierto((o) => !o)}>
        Avisar por WhatsApp
      </Button>
      <Popover
        open={abierto}
        onClose={() => setAbierto(false)}
        anchor={ref}
        width={380}
        label="Mensaje de WhatsApp"
        title={`Para ${d.nombre.split(' ')[0]} · ${formatoTelefono(d.telefono)}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => void copiar(texto).then(() => toast.success('Mensaje copiado'))}>
              Copiar
            </Button>
            <Button
              size="sm"
              icon={<MessageCircle size={14} />}
              onClick={() => {
                setAbierto(false)
                if (liga) void abrirLiga(liga)
              }}
            >
              Abrir WhatsApp
            </Button>
          </div>
        }
      >
        <div className="px-2 pb-2">
          <div className="rounded-[14px] rounded-tl-[4px] bg-[color-mix(in_oklab,var(--success)_12%,var(--surface))] px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-line select-text">{texto}</div>
          <p className="mt-2 px-1 text-[12px] text-ink-3">Se abre WhatsApp con el mensaje escrito. Tú lo revisas y lo mandas.</p>
        </div>
      </Popover>
    </>
  )
}

/** Mover: otra cabaña, otras fechas u otro número de personas, con el precio nuevo en vivo */
function EditarEstancia({ d, onListo }: { d: Detalle; onListo: (d: Detalle | null) => void }) {
  const datos = useApp((s) => s.datos)!
  const [cabana, setCabana] = useState(d.cabana_id)
  const [llegada, setLlegada] = useState<ISODate | null>(d.llegada)
  const [salida, setSalida] = useState<ISODate | null>(d.salida)
  const [huespedes, setHuespedes] = useState(d.huespedes)
  const [q, setQ] = useState<Cotizacion | null>(null)
  const [guardando, setGuardando] = useState(false)
  const cab = datos.cabanas.find((c) => c.id === cabana)
  const ocupacion = useMemo(() => ocupacionDe(datos, cabana, d.id), [datos, cabana, d.id])
  const cambio = cabana !== d.cabana_id || llegada !== d.llegada || salida !== d.salida || huespedes !== d.huespedes
  useEffect(() => {
    if (!llegada || !salida || !cambio) return setQ(null)
    let vivo = true
    rpc<Cotizacion>('hosp_cotizar', { p_cabana: cabana, p_llegada: llegada, p_salida: salida, p_huespedes: huespedes, p_ignorar: d.id })
      .then((x) => vivo && setQ(x))
      .catch(() => vivo && setQ(null))
    return () => {
      vivo = false
    }
  }, [cabana, llegada, salida, huespedes, cambio, d.id])
  const bloqueo = q && (!q.ok ? q.mensaje : q.disponible === false ? 'Esas fechas ya están ocupadas' : null)
  return (
    <div className="rounded-[14px] bg-sunken p-4">
      <Pastillas value={cabana} onChange={setCabana} opciones={datos.cabanas.map((c) => ({ value: c.id, label: c.nombre }))} />
      <div className="mt-4 rounded-[12px] bg-surface p-3">
        <RangoFechas llegada={llegada} salida={salida} hoy={masDias(datos.hoy, -60)} ocupacion={ocupacion} onChange={(a, b) => (setLlegada(a), setSalida(b))} />
      </div>
      <Contador className="mt-3" label="Personas" value={huespedes} onChange={setHuespedes} min={1} max={cab?.capacidad ?? 50} sufijo={(n) => plural(n, 'persona', 'personas')} />
      <div className="mt-3 min-h-6 text-[14px]">
        {bloqueo ? <span className="text-danger">{bloqueo}</span> : q?.ok && q.total !== undefined ? <span>Total nuevo: <b className="text-key">{mxn(q.total)}</b> {q.total !== d.total && <span className="text-ink-3">(antes {mxn(d.total)})</span>}</span> : null}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onListo(null)}>
          No
        </Button>
        <Button
          disabled={!cambio || !llegada || !salida || !!bloqueo}
          loading={guardando}
          onClick={async () => {
            setGuardando(true)
            const x = await actualizarReservacion(d.id, { cabana_id: cabana, llegada, salida, huespedes })
            setGuardando(false)
            if (x) {
              toast.success('Estancia cambiada', x.total !== d.total ? `Total ${mxn(d.total)} → ${mxn(x.total)}` : undefined)
              onListo(x)
            }
          }}
        >
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}

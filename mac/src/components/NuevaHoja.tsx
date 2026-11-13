// Hoja «Nueva reservación» (⌘N) y «Cerrar fechas» (⇧⌘N). La cotización se calcula en vivo en la nube
// con las tarifas del rancho (hosp_cotizar) mientras se eligen hospedaje, fechas y personas.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check, Lock, Moon } from 'lucide-react'
import { useApp, recargar, type Nueva } from '@/lib/store'
import { rpc } from '@/lib/nube'
import { guardarCierre } from '@/lib/acciones'
import { ocupacionDe, TIPO } from '@/lib/ocupacion'
import { corta, diaCorto, noches, plural, rango } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { CMD } from '@/lib/mac'
import type { Cotizacion, Detalle, ISODate, Origen } from '@/lib/tipos'
import { Button, Segmented, Sheet, toast, cx } from './ui'
import { LightDots } from './step1'
import { Campo, CampoDinero, CampoLargo, CampoTelefono, Contador, Pastillas, RangoFechas } from './campos'

const MOTIVOS = ['Mantenimiento', 'Uso propio', 'Evento en el salón']

export function NuevaHoja() {
  const nueva = useApp((s) => s.nueva)
  const crear = useApp((s) => s.crear)
  // Mientras la hoja se va (animación de salida) sigue mostrando lo último
  const ultima = useRef<Nueva | null>(nueva)
  if (nueva) ultima.current = nueva
  return (
    <Sheet open={!!nueva} onClose={() => crear(null)} side="center" wide header={<span />}>
      {ultima.current && <Formulario key={JSON.stringify(ultima.current)} nueva={ultima.current} />}
    </Sheet>
  )
}

function Formulario({ nueva }: { nueva: Nueva }) {
  const d = useApp((s) => s.datos)!
  const crear = useApp((s) => s.crear)
  const [tipo, setTipo] = useState<'reservacion' | 'cierre'>(nueva.tipo)
  const [cabana, setCabana] = useState<string | null>(nueva.cabana_id ?? (d.cabanas.length === 1 ? d.cabanas[0]!.id : null))
  const [llegada, setLlegada] = useState<ISODate | null>(nueva.llegada ?? null)
  const [salida, setSalida] = useState<ISODate | null>(nueva.salida ?? null)
  const [huespedes, setHuespedes] = useState(2)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [origen, setOrigen] = useState<Origen>('telefono')
  const [estado, setEstado] = useState<'confirmada' | 'solicitud'>('confirmada')
  const [notas, setNotas] = useState('')
  const [motivo, setMotivo] = useState<string>('Mantenimiento')
  const [otroMotivo, setOtroMotivo] = useState('')
  const [totalManual, setTotalManual] = useState<number | null>(null)
  const [cambiarTotal, setCambiarTotal] = useState(false)
  const [q, setQ] = useState<Cotizacion | null>(null)
  const [cotizando, setCotizando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [intento, setIntento] = useState(false)

  const cab = d.cabanas.find((c) => c.id === cabana)
  const ocupacion = useMemo(() => ocupacionDe(d, cabana), [d, cabana])
  useEffect(() => {
    if (cab && huespedes > cab.capacidad) setHuespedes(cab.capacidad)
  }, [cab, huespedes])

  // Cotización en vivo
  useEffect(() => {
    if (tipo !== 'reservacion' || !cabana || !llegada || !salida) return setQ(null)
    let vivo = true
    setCotizando(true)
    const t = setTimeout(() => {
      rpc<Cotizacion>('hosp_cotizar', { p_cabana: cabana, p_llegada: llegada, p_salida: salida, p_huespedes: huespedes })
        .then((x) => vivo && setQ(x))
        .catch((e) => vivo && setQ({ ok: false, mensaje: e instanceof Error ? e.message : String(e) }))
        .finally(() => vivo && setCotizando(false))
    }, 120)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [tipo, cabana, llegada, salida, huespedes])

  const total = cambiarTotal && totalManual != null ? totalManual : q?.ok ? q.total! : null
  const anticipo = total != null ? Math.round((total * d.ajustes.anticipo_pct) / 100) : null
  const ocupada = q?.ok && q.disponible === false
  const sinPrecio = q && !q.ok
  const telOk = !telefono || telefono.length >= 10
  const faltan = tipo === 'reservacion' ? [!cabana && 'el hospedaje', (!llegada || !salida) && 'las fechas', nombre.trim().length < 2 && 'el nombre', !telOk && 'un WhatsApp de 10 dígitos', total == null && 'el total'].filter(Boolean) : [!cabana && 'el hospedaje', (!llegada || !salida) && 'las fechas'].filter(Boolean)
  const puede = faltan.length === 0 && !ocupada

  const guardar = async () => {
    setIntento(true)
    if (!puede) return
    setGuardando(true)
    try {
      if (tipo === 'cierre') {
        const r = await guardarCierre({ cabana_id: cabana!, inicio: llegada!, fin: salida!, motivo: motivo === 'Otro' ? otroMotivo || null : motivo })
        if (r) crear(null)
      } else {
        const r = await rpc<Detalle>('hosp_crear_reservacion', {
          p: { cabana_id: cabana, llegada, salida, huespedes, nombre: nombre.trim(), telefono: telefono || null, correo: correo.trim() || null, origen, estado, notas: notas.trim() || null, total: cambiarTotal ? totalManual : null },
        })
        crear(null)
        void recargar()
        toast.action(`Reservación ${r.codigo} de ${r.nombre.split(' ')[0]}`, { label: 'Abrir', onClick: () => useApp.getState().abrir(r.id) }, `${r.cabana} · ${rango(r.llegada, r.salida)} · ${mxn(r.total)}`)
      }
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void guardar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!d.cabanas.length)
    return (
      <div className="py-10 text-center">
        <p className="text-[16px] font-medium">Primero da de alta un hospedaje</p>
        <p className="mt-1 text-[14px] text-ink-soft">En «Cabañas» capturas nombre, capacidad y precios.</p>
        <Button className="mt-5" onClick={() => (crear(null), useApp.getState().ir('cabanas'), useApp.getState().editarCabana('nueva'))}>
          Ir a Cabañas
        </Button>
      </div>
    )

  return (
    <div className="pt-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="heading text-[1.6rem]">{tipo === 'reservacion' ? 'Nueva reservación' : 'Cerrar fechas'}</h2>
        <Segmented
          value={tipo}
          onChange={setTipo}
          options={[
            { value: 'reservacion', label: 'Reservación' },
            { value: 'cierre', label: <><Lock size={13} /> Cerrar fechas</> },
          ]}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          <Pastillas label="Hospedaje" value={cabana} onChange={setCabana} opciones={d.cabanas.map((c) => ({ value: c.id, label: c.nombre, detalle: `${TIPO[c.tipo].uno} · ${plural(c.capacidad, 'persona', 'personas')}` }))} />
          {intento && !cabana && <p className="-mt-3 text-[13px] text-danger">Elige el hospedaje</p>}

          <div className="rounded-[14px] p-4 ring-1 ring-line">
            <RangoFechas llegada={llegada} salida={salida} hoy={d.hoy} ocupacion={ocupacion} minimo={q?.minimo_noches ?? 1} onChange={(a, b) => (setLlegada(a), setSalida(b))} />
          </div>

          {tipo === 'reservacion' ? (
            <>
              <Contador label="Personas" value={huespedes} onChange={setHuespedes} min={1} max={cab?.capacidad ?? 50} sufijo={(n) => plural(n, 'persona', 'personas')} hint={cab ? `${cab.nombre} es para ${plural(cab.capacidad, 'persona', 'personas')}` : undefined} />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Nombre del huésped" value={nombre} onChange={setNombre} error={intento && nombre.trim().length < 2 ? 'Escribe el nombre' : null} ok={nombre.trim().length >= 2} autoFocus={!!nueva.cabana_id} />
                <CampoTelefono label="WhatsApp" value={telefono} onChange={setTelefono} hint="Para mandarle el mensaje ya escrito" />
              </div>
              <Campo label="Correo (opcional)" type="email" value={correo} onChange={setCorreo} />
              <div className="grid grid-cols-2 gap-5">
                <Pastillas label="¿Cómo llegó?" value={origen} onChange={setOrigen} opciones={[{ value: 'telefono', label: 'Llamada' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'directo', label: 'En persona' }]} />
                <Pastillas label="Queda como" value={estado} onChange={setEstado} opciones={[{ value: 'confirmada', label: 'Confirmada' }, { value: 'solicitud', label: `Apartada ${d.ajustes.horas_apartado} h`, detalle: 'Se cancela sola si no la confirmas' }]} />
              </div>
              <CampoLargo label="Notas internas (opcional)" value={notas} onChange={setNotas} minRows={2} maxLength={2000} />
            </>
          ) : (
            <div>
              <Pastillas label="Motivo" value={motivo} onChange={setMotivo} opciones={[...MOTIVOS, 'Otro'].map((m) => ({ value: m, label: m }))} />
              {motivo === 'Otro' && <Campo className="mt-3" label="¿Por qué se cierra?" value={otroMotivo} onChange={setOtroMotivo} maxLength={120} autoFocus />}
            </div>
          )}
        </div>

        {/* Cotización en vivo */}
        <aside className="flex flex-col">
          <div className="app-quote-card sticky top-0 flex flex-col overflow-hidden rounded-[16px] bg-night text-on-night">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-2 text-[13px] text-on-night-soft">
                <Moon size={14} />
                {cab ? cab.nombre : 'Elige hospedaje'}
              </div>
              <div className="mt-1.5 text-[15px] font-medium">{llegada && salida ? `${rango(llegada, salida)} · ${plural(noches(llegada, salida), 'noche', 'noches')}` : llegada ? 'Falta el día de salida' : 'Elige las fechas'}</div>
            </div>
            {tipo === 'reservacion' ? (
              <div className="border-t border-[color-mix(in_oklab,var(--on-night)_12%,transparent)] px-5 py-4">
                {cotizando && !q ? (
                  <LightDots />
                ) : sinPrecio ? (
                  <p className="flex items-start gap-2 text-[14px] text-chispa-soft">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {q!.mensaje}
                  </p>
                ) : q?.ok ? (
                  <>
                    <div className="scroll-area max-h-[180px] overflow-y-auto pr-1">
                      {q.desglose!.map((x) => (
                        <div key={x.fecha} className="flex justify-between gap-3 py-0.5 text-[13px]">
                          <span className="text-on-night-soft first-letter:uppercase">
                            {diaCorto(x.fecha)} {corta(x.fecha)}
                            {x.tipo === 'temporada' ? ` · ${x.temporada}` : x.tipo === 'fin_semana' ? ' · fin de semana' : ''}
                          </span>
                          <span className="tabular">{mxn(x.precio)}</span>
                        </div>
                      ))}
                      {!!q.extra && (
                        <div className="flex justify-between py-0.5 text-[13px]">
                          <span className="text-on-night-soft">Personas extra</span>
                          <span className="tabular">{mxn(q.extra)}</span>
                        </div>
                      )}
                    </div>
                    {!q.cumple_minimo && <p className="mt-2 text-[13px] text-chispa-soft">El mínimo en esas fechas es de {plural(q.minimo_noches!, 'noche', 'noches')} (tú sí puedes reservarla).</p>}
                    {ocupada && <p className="mt-2 text-[13px] font-semibold text-chispa-soft">Esas fechas ya están ocupadas.</p>}
                  </>
                ) : (
                  <p className="text-[13px] text-on-night-soft">El precio sale de las tarifas que capturaste para cada noche.</p>
                )}
              </div>
            ) : (
              <div className="border-t border-[color-mix(in_oklab,var(--on-night)_12%,transparent)] px-5 py-4 text-[13px] text-on-night-soft">Las fechas cerradas no se pueden reservar en la página ni aquí. Las abres cuando quieras desde el calendario.</div>
            )}
            {tipo === 'reservacion' && (
              <div className="border-t border-[color-mix(in_oklab,var(--on-night)_12%,transparent)] px-5 py-4">
                <div className="flex items-end justify-between">
                  <span className="text-[13px] text-on-night-soft">Total</span>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span key={total ?? 'x'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="app-quote-total text-[28px] leading-none font-semibold text-luz tabular">
                      {total != null ? mxn(total) : '—'}
                    </motion.span>
                  </AnimatePresence>
                </div>
                {anticipo != null && anticipo > 0 && <div className="mt-1 text-right text-[13px] text-on-night-soft">Anticipo ({d.ajustes.anticipo_pct} %): {mxn(anticipo)}</div>}
                <button onClick={() => (setCambiarTotal((c) => !c), setTotalManual(total))} className="mt-3 text-[13px] text-on-night-soft underline-offset-2 hover:text-on-night hover:underline">
                  {cambiarTotal ? 'Usar el precio de las tarifas' : 'Cambiar el total (descuento o precio especial)'}
                </button>
              </div>
            )}
          </div>
          {cambiarTotal && tipo === 'reservacion' && <CampoDinero className="mt-3" label="Total acordado" value={totalManual} onChange={setTotalManual} autoFocus />}
        </aside>
      </div>

      <div className="sticky -bottom-6 z-10 -mx-7 mt-6 flex items-center justify-between gap-3 border-t border-line bg-surface px-7 pt-4 pb-6">
        <span className={cx('text-[13px]', intento && faltan.length ? 'text-danger' : 'text-ink-3')}>{faltan.length ? `Falta ${faltan.join(', ')}` : ocupada ? 'Esas fechas ya están ocupadas' : `${CMD}↩ para guardar`}</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => crear(null)}>
            No
          </Button>
          <Button loading={guardando} disabled={intento && !puede} icon={tipo === 'cierre' ? <Lock size={15} /> : <Check size={16} strokeWidth={2} />} onClick={() => void guardar()}>
            {tipo === 'cierre' ? 'Cerrar fechas' : estado === 'solicitud' ? 'Apartar' : 'Guardar reservación'}
          </Button>
        </div>
      </div>
    </div>
  )
}

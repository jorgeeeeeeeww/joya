// Ajustes: horarios (se arrastran sobre el día), anticipo y apartado, datos para transferir, contacto,
// textos legales y lo propio de esta Mac. Todo se guarda solo.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Bell, Check, CircleAlert, Download, Globe, Landmark, LogIn, LogOut, Power } from 'lucide-react'
import { useApp, recargar } from '@/lib/store'
import { rpc, URL_NUBE, esNubeLocal } from '@/lib/nube'
import { clabeValida, mxn } from '@/lib/dinero'
import { plural } from '@/lib/fechas'
import { abreAlIniciar, avisar, buscarActualizacion, cambiarAbreAlIniciar, enMac, instalarActualizacion, permisoAvisos } from '@/lib/mac'
import type { Ajustes as TAjustes } from '@/lib/tipos'
import { Button, Toggle, cx, toast } from '@/components/ui'
import { Campo, CampoLargo, CampoTelefono, Contador } from '@/components/campos'

// Bancos por los tres primeros dígitos de la CLABE (los más comunes)
const BANCOS: Record<string, string> = { '002': 'Banamex', '012': 'BBVA', '014': 'Santander', '021': 'HSBC', '030': 'BanBajío', '036': 'Inbursa', '044': 'Scotiabank', '058': 'Banregio', '062': 'Afirme', '072': 'Banorte', '127': 'Banco Azteca', '137': 'BanCoppel', '638': 'Nu México', '646': 'STP', '722': 'Mercado Pago' }
const formatoClabe = (c: string) => c.replace(/(\d{3})(\d{3})(\d{11})(\d)?/, (_, a, b, cc, dd) => [a, b, cc, dd].filter(Boolean).join(' '))

type Campos = Omit<TAjustes, 'noches_fin_semana'> & { noches_fin_semana: number[] }
const urlValida = (u: string | null) => !u || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(u)
const correoValido = (c: string | null) => !c || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)

export default function Ajustes() {
  const d = useApp((s) => s.datos)!
  const [f, setF] = useState<Campos>(() => ({ ...d.ajustes }))
  const [estado, setEstado] = useState<'guardado' | 'pendiente' | 'guardando' | 'incompleto' | 'error'>('guardado')
  const [error, setError] = useState<string | null>(null)
  const [incompletas, setIncompletas] = useState<string[]>([])
  const sucio = useRef(new Set<keyof Campos>())
  const set = <K extends keyof Campos>(k: K, v: Campos[K]) => {
    sucio.current.add(k)
    setF((x) => ({ ...x, [k]: v }))
  }
  const admin = d.es_admin

  // Lo que llega de la nube reemplaza lo que no se está editando
  useEffect(() => {
    setF((x) => {
      const n = { ...d.ajustes } as Campos
      for (const k of sucio.current) (n as Record<string, unknown>)[k] = x[k]
      return n
    })
  }, [d.ajustes])

  const clabe = (f.clabe ?? '').replace(/\D/g, '')
  const clabeOk = clabeValida(clabe)
  const urlOk = urlValida(f.url_web)
  const correoOk = correoValido(f.correo_avisos)

  // Guardado: manda solo lo que cambió. Lo que ya está completo se guarda aunque otro campo siga a medias (una CLABE
  // incompleta, por ejemplo), y si se siguió escribiendo mientras se guardaba, se vuelve a mandar: antes esas últimas
  // letras se daban por guardadas sin haberse mandado.
  const fRef = useRef(f)
  fRef.current = f
  const enCurso = useRef(false)
  const repetir = useRef(false)
  const enviarRef = useRef<() => Promise<void>>(async () => {})
  enviarRef.current = async () => {
    if (!sucio.current.size) return
    if (enCurso.current) {
      repetir.current = true
      return
    }
    const actual = fRef.current
    const p: Record<string, unknown> = {}
    for (const k of sucio.current) p[k] = actual[k]
    const falta: string[] = []
    const c = (actual.clabe ?? '').replace(/\D/g, '')
    if ('clabe' in p && c && !clabeValida(c)) (delete p.clabe, falta.push('la CLABE'))
    if ('url_web' in p && !urlValida(actual.url_web)) (delete p.url_web, falta.push('la dirección de la página'))
    if ('correo_avisos' in p && !correoValido(actual.correo_avisos)) (delete p.correo_avisos, falta.push('el correo de avisos'))
    setIncompletas(falta)
    if (!Object.keys(p).length) {
      setEstado(falta.length ? 'incompleto' : 'guardado')
      return
    }
    enCurso.current = true
    setEstado('guardando')
    try {
      await rpc('hosp_guardar_ajustes', { p })
      // Solo se da por guardado lo que sigue igual que lo que se mandó
      for (const k of Object.keys(p) as (keyof Campos)[]) if (JSON.stringify(fRef.current[k]) === JSON.stringify(p[k])) sucio.current.delete(k)
      setError(null)
      setEstado(falta.length ? 'incompleto' : sucio.current.size ? 'pendiente' : 'guardado')
      void recargar()
    } catch (e) {
      setEstado('error')
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      enCurso.current = false
      if (repetir.current) {
        repetir.current = false
        void enviarRef.current()
      }
    }
  }
  useEffect(() => {
    if (!sucio.current.size) return
    setEstado('pendiente')
    const t = setTimeout(() => void enviarRef.current(), 700)
    return () => clearTimeout(t)
  }, [f])
  // Al salir de la pantalla, al cambiar de ventana o al esconder la app, se guarda de inmediato lo que falte
  useEffect(() => {
    const ya = () => void enviarRef.current()
    const alOcultar = () => document.visibilityState === 'hidden' && ya()
    window.addEventListener('blur', ya)
    window.addEventListener('pagehide', ya)
    document.addEventListener('visibilitychange', alOcultar)
    return () => {
      window.removeEventListener('blur', ya)
      window.removeEventListener('pagehide', ya)
      document.removeEventListener('visibilitychange', alOcultar)
      ya()
    }
  }, [])

  const publicadas = d.cabanas.filter((c) => c.publicada)
  const faltan = [
    !publicadas.length && 'publicar al menos un hospedaje',
    publicadas.length > 0 && !publicadas.some((c) => c.precio_noche) && 'ponerle precio a un hospedaje publicado',
    f.anticipo_pct > 0 && !clabeOk && 'la CLABE para el anticipo',
    !f.politicas && 'las políticas',
    !f.aviso_privacidad && 'el aviso de privacidad',
    !f.url_web && 'la dirección de la página',
    !f.telefono_hospedaje && 'el WhatsApp de reservaciones',
  ].filter(Boolean) as string[]

  const ejemplo = d.cabanas.find((c) => c.precio_noche)
  return (
    <div className="app-settings-page mx-auto max-w-[860px] px-8 pt-9 pb-20">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="heading text-[30px] leading-[1.1]">Ajustes</h1>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            {!admin ? 'Solo el dueño puede cambiar estos datos.' : estado === 'guardando' ? 'Guardando…' : estado === 'pendiente' ? 'Cambios por guardar' : estado === 'incompleto' ? `Falta terminar ${incompletas.join(' y ')}. Lo demás ya se guardó.` : estado === 'error' ? '' : 'Todo se guarda solo.'}
            {admin && estado === 'guardado' && <Check size={14} className="ml-1 inline text-success" />}
          </p>
          {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
        </div>
      </div>

      <fieldset disabled={!admin} className="contents">
        {/* Encender la página */}
        <div className={cx('card flex items-start gap-4 p-5', f.reservas_web && 'ring-2 ring-[color-mix(in_oklab,var(--success)_40%,transparent)]')}>
          <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', f.reservas_web ? 'bg-sage-soft text-sage-ink' : 'bg-sunken text-ink-3')}>
            <Globe size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <Toggle checked={f.reservas_web} onChange={(v) => set('reservas_web', v)} label="Recibir reservaciones en la página" description={f.reservas_web ? 'La página muestra el calendario y el botón «Reservar».' : 'Apagado: la página solo ofrece escribir por WhatsApp.'} />
            {faltan.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-butter-soft px-3.5 py-2.5 text-[13px]">
                <CircleAlert size={15} className="mt-0.5 shrink-0 text-butter-ink" />
                <span>
                  <b className="text-butter-ink">Antes de encenderla falta: </b>
                  {faltan.join(', ')}.
                </span>
              </div>
            )}
          </div>
        </div>

        <Bloque titulo="Llegada y salida" detalle="Arrastra las dos marcas sobre el día. Entre una y otra queda el tiempo para dejar todo listo.">
          <Reloj salida={f.hora_salida} llegada={f.hora_llegada} onSalida={(v) => set('hora_salida', v)} onLlegada={(v) => set('hora_llegada', v)} />
        </Bloque>

        <Bloque titulo="Anticipo y apartado">
          <Deslizador label="Anticipo para apartar" value={f.anticipo_pct} onChange={(v) => set('anticipo_pct', v)} min={0} max={100} paso={5} formato={(v) => (v ? `${v} %` : 'Sin anticipo')} />
          <p className="mt-2 text-[13px] text-ink-soft">
            {f.anticipo_pct === 0 ? 'Las solicitudes no piden transferencia: tú confirmas por WhatsApp.' : ejemplo ? `Por ejemplo, una noche en ${ejemplo.nombre} (${mxn(ejemplo.precio_noche)}) pide ${mxn(Math.round((ejemplo.precio_noche! * f.anticipo_pct) / 100))} de anticipo.` : `El huésped transfiere el ${f.anticipo_pct} % del total para apartar.`}
          </p>
          <div className="mt-6">
            <div className="mb-2 text-[13px] font-medium text-ink-soft">Las fechas de una solicitud se apartan</div>
            <div className="flex flex-wrap gap-1.5">
              {[6, 12, 24, 48, 72].map((h) => (
                <button key={h} type="button" onClick={() => set('horas_apartado', h)} className={cx('pressable h-9 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-inset', f.horas_apartado === h ? 'bg-ink text-paper ring-ink' : 'text-ink-soft ring-line-strong hover:text-ink')}>
                  {h < 48 ? `${h} horas` : `${h / 24} días`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-ink-soft">Si no la confirmas en ese tiempo, se cancela sola, las fechas se liberan y al huésped le llega un correo.</p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Contador label="Mínimo de noches" value={f.noches_minimas} onChange={(n) => set('noches_minimas', n)} min={1} max={60} hint="Cada hospedaje o temporada puede pedir más" />
            <Contador label="Se puede reservar con" value={f.dias_anticipacion} onChange={(n) => set('dias_anticipacion', n)} min={7} max={730} sufijo={(n) => (n % 30 === 0 ? plural(n / 30, 'mes', 'meses') : plural(n, 'día', 'días'))} hint="de anticipación como máximo" />
          </div>
          <div className="mt-6">
            <div className="mb-2 text-[13px] font-medium text-ink-soft">Noches con precio de fin de semana</div>
            <div className="flex flex-wrap gap-1.5">
              {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((n, i) => {
                const v = i + 1
                const on = f.noches_fin_semana.includes(v)
                return (
                  <button key={n} type="button" aria-pressed={on} onClick={() => set('noches_fin_semana', on ? f.noches_fin_semana.filter((x) => x !== v) : [...f.noches_fin_semana, v].sort())} className={cx('pressable h-9 w-12 rounded-full text-[13px] font-medium ring-1 ring-inset', on ? 'bg-ink text-paper ring-ink' : 'text-ink-soft ring-line-strong hover:text-ink')}>
                    {n}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[13px] text-ink-soft">La noche del viernes es la que empieza el viernes y termina el sábado en la mañana.</p>
          </div>
        </Bloque>

        <Bloque titulo="Datos para transferir" detalle="La página se los muestra al huésped con el monto y su código como referencia.">
          <div className="grid grid-cols-2 gap-3">
            <Campo
              label="CLABE (18 dígitos)"
              icon={<Landmark />}
              inputMode="numeric"
              value={formatoClabe(clabe)}
              onChange={(v) => {
                const c = v.replace(/\D/g, '').slice(0, 18)
                set('clabe', c || null)
                const banco = BANCOS[c.slice(0, 3)]
                if (c.length >= 3 && banco && !f.banco) set('banco', banco)
              }}
              ok={clabeOk}
              error={clabe.length === 18 && !clabeOk ? 'Esta CLABE no cuadra: revisa los dígitos' : null}
              hint={clabe.length >= 3 && BANCOS[clabe.slice(0, 3)] ? `Es de ${BANCOS[clabe.slice(0, 3)]}` : clabe && clabe.length < 18 ? `Faltan ${18 - clabe.length} dígitos` : undefined}
            />
            <Campo label="Banco" value={f.banco ?? ''} onChange={(v) => set('banco', v || null)} maxLength={60} />
          </div>
          <Campo className="mt-3" label="A nombre de" value={f.titular ?? ''} onChange={(v) => set('titular', v || null)} maxLength={120} />
        </Bloque>

        <Bloque titulo="Contacto">
          <div className="grid grid-cols-2 gap-3">
            <CampoTelefono label="WhatsApp de reservaciones" value={f.telefono_hospedaje ?? ''} onChange={(v) => set('telefono_hospedaje', v || null)} hint="El que sale en la página" />
            <CampoTelefono label="Teléfono del salón" value={f.telefono_salon ?? ''} onChange={(v) => set('telefono_salon', v || null)} hint="La página lo muestra para eventos" />
            <Campo label="Correo para los avisos" type="email" value={f.correo_avisos ?? ''} onChange={(v) => set('correo_avisos', v || null)} error={!correoOk ? 'Revisa el correo' : null} ok={!!f.correo_avisos && correoOk} hint="Aquí llega cada solicitud nueva" />
            <Campo label="Dirección de la página" type="url" value={f.url_web ?? ''} onChange={(v) => set('url_web', v.trim() || null)} placeholder="https://" error={!urlOk ? 'Empieza con https://' : null} hint="Para la liga «Mi reservación» del huésped" />
          </div>
        </Bloque>

        <Bloque titulo="Aviso al celular" detalle="Cada solicitud nueva de la página le llega al celular del dueño como notificación (con la app ntfy), esté donde esté la Mac. El canal privado se carga en la nube, no aquí.">
          <ProbarAviso />
        </Bloque>

        <Bloque titulo="Textos para la página">
          <CampoLargo label="Políticas (cancelación, mascotas, horarios…)" value={f.politicas ?? ''} onChange={(v) => set('politicas', v || null)} maxLength={6000} minRows={5} />
          <CampoLargo className="mt-3" label="Aviso de privacidad" value={f.aviso_privacidad ?? ''} onChange={(v) => set('aviso_privacidad', v || null)} maxLength={20000} minRows={5} hint="El huésped lo acepta antes de mandar su solicitud" />
        </Bloque>
      </fieldset>

      <EstaMac />
    </div>
  )
}

/** Deja un aviso de prueba en la cola y espera a ver cómo le fue (lo manda la función de avisos de la nube) */
function ProbarAviso() {
  const [probando, setProbando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const probar = async () => {
    setProbando(true)
    setResultado(null)
    try {
      const { id } = await rpc<{ id: number }>('hosp_probar_aviso', { p_canal: 'ntfy' })
      for (let i = 0; i < 15; i++) {
        await new Promise((ok) => setTimeout(ok, 2000))
        const a = await rpc<{ estado: string; detalle: string | null } | null>('hosp_estado_aviso', { p_id: id })
        if (!a || a.estado === 'pendiente' || a.estado === 'enviando') continue
        if (a.estado === 'enviado') return setResultado({ ok: true, texto: 'Se mandó. Debe sonar el celular del dueño en unos segundos.' })
        if (a.estado === 'sin_configurar') return setResultado({ ok: false, texto: 'Falta cargar el tema de ntfy en la nube (NTFY_TEMA).' })
        return setResultado({ ok: false, texto: `No se mandó${a.detalle ? `: ${a.detalle}` : '.'}` })
      }
      setResultado({ ok: false, texto: 'La nube todavía no lo manda. Espera un minuto y vuelve a probar si no llegó.' })
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : String(e) })
    } finally {
      setProbando(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" icon={<Bell size={16} />} loading={probando} onClick={() => void probar()}>
        Probar aviso al celular
      </Button>
      {resultado && <span className={cx('min-w-0 flex-1 text-[13px]', resultado.ok ? 'text-success' : 'text-danger')}>{resultado.texto}</span>}
    </div>
  )
}

function Bloque({ titulo, detalle, children }: { titulo: string; detalle?: string; children: ReactNode }) {
  return (
    <section className="app-settings-block mt-11">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{titulo}</h2>
      {detalle && <p className="mt-0.5 text-[13px] text-ink-soft">{detalle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Deslizador({ label, value, onChange, min, max, paso, formato }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; paso: number; formato: (n: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink-soft">{label}</span>
        <span className="text-[20px] font-semibold text-key tabular">{formato(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={paso} value={value} onChange={(e) => onChange(Number(e.target.value))} className="deslizador w-full" style={{ ['--pct' as string]: `${pct}%` }} aria-label={label} />
    </div>
  )
}

// ── El día: salida y llegada se arrastran ─────────────────────
const DESDE = 6 * 60
const HASTA = 22 * 60
const aMin = (h: string | null, def: number) => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : def)
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const doce = (m: number) => {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h > 12 ? h - 12 : h}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

function Reloj({ salida, llegada, onSalida, onLlegada }: { salida: string | null; llegada: string | null; onSalida: (h: string) => void; onLlegada: (h: string) => void }) {
  const pista = useRef<HTMLDivElement>(null)
  const [cual, setCual] = useState<'salida' | 'llegada' | null>(null)
  const s = aMin(salida, 12 * 60)
  const l = aMin(llegada, 15 * 60)
  const x = (m: number) => `${((m - DESDE) / (HASTA - DESDE)) * 100}%`
  const desdeX = (clientX: number, quien: 'salida' | 'llegada') => {
    const r = pista.current!.getBoundingClientRect()
    let m = Math.round((DESDE + ((clientX - r.left) / r.width) * (HASTA - DESDE)) / 30) * 30
    m = Math.max(DESDE, Math.min(HASTA, m))
    if (quien === 'salida') onSalida(aHora(Math.min(m, l)))
    else onLlegada(aHora(Math.max(m, s)))
  }
  const hueco = l - s
  const horas = useMemo(() => Array.from({ length: (HASTA - DESDE) / 60 + 1 }, (_, i) => DESDE + i * 60), [])
  return (
    <div className="interfaz card px-6 pt-6 pb-5">
      <div
        ref={pista}
        className="relative h-[88px] touch-none"
        onPointerMove={(e) => cual && e.buttons === 1 && desdeX(e.clientX, cual)}
        onPointerUp={() => setCual(null)}
        onPointerDown={(e) => {
          // Clic en la pista: mueve la marca más cercana
          const r = pista.current!.getBoundingClientRect()
          const m = DESDE + ((e.clientX - r.left) / r.width) * (HASTA - DESDE)
          const quien = Math.abs(m - s) <= Math.abs(m - l) ? 'salida' : 'llegada'
          setCual(quien)
          e.currentTarget.setPointerCapture(e.pointerId)
          desdeX(e.clientX, quien)
        }}
      >
        {/* El cielo del día: de la mañana a la noche */}
        <div className="absolute inset-x-0 top-[34px] h-6 overflow-hidden rounded-full" style={{ background: 'linear-gradient(90deg, #edf2f8, #dce7f6 54%, #e7edf5)' }} />
        {/* Tiempo para dejar todo listo */}
        <motion.div className="absolute top-[34px] h-6 rounded-[6px] bg-[color-mix(in_oklab,var(--surface)_70%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--ink)_15%,transparent)] ring-inset" animate={{ left: x(s), width: `calc(${x(l)} - ${x(s)})` }} transition={{ duration: 0.15 }}>
          {/* Las marcas tapan las orillas: el texto largo solo sale si de verdad cabe entre las dos */}
          {hueco >= 120 && (
            <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold whitespace-nowrap text-ink">
              {hueco % 60 ? `${(hueco / 60).toFixed(1)} h` : plural(hueco / 60, 'hora', 'horas')}
              {hueco >= 270 ? ' para dejar todo listo' : ''}
            </span>
          )}
        </motion.div>
        <Marca x={x(s)} etiqueta="Salida" hora={salida ? doce(s) : 'Sin definir'} icon={<LogOut size={14} />} activa={cual === 'salida'} definida={!!salida} />
        <Marca x={x(l)} etiqueta="Llegada" hora={llegada ? doce(l) : 'Sin definir'} icon={<LogIn size={14} />} activa={cual === 'llegada'} definida={!!llegada} abajo />
      </div>
      <div className="relative mt-3 h-4 text-[11px] text-ink-3">
        {horas
          .filter((m) => (m / 60) % 2 === 0)
          .map((m) => (
            <span key={m} className="absolute -translate-x-1/2 whitespace-nowrap tabular" style={{ left: x(m) }}>
              {Math.floor(m / 60) > 12 ? Math.floor(m / 60) - 12 : Math.floor(m / 60)}
              {Math.floor(m / 60) < 12 ? ' am' : ' pm'}
            </span>
          ))}
      </div>
    </div>
  )
}

function Marca({ x, etiqueta, hora, icon, activa, definida, abajo }: { x: string; etiqueta: string; hora: string; icon: ReactNode; activa: boolean; definida: boolean; abajo?: boolean }) {
  return (
    <motion.div className="absolute top-0 bottom-0 w-0" animate={{ left: x }} transition={{ duration: 0.15 }}>
      <div className={cx('absolute top-[26px] h-10 w-[3px] -translate-x-1/2 rounded-full', definida ? 'bg-primary shadow-[0_0_12px_var(--luz)]' : 'bg-ink-3')} />
      <div className={cx('absolute top-[28px] h-9 w-9 -translate-x-1/2 cursor-ew-resize rounded-full bg-surface shadow-[var(--shadow-2)] ring-2 transition-transform', definida ? 'ring-primary' : 'ring-line-strong', activa && 'scale-110')}>
        <span className="flex h-full w-full items-center justify-center text-ink">{icon}</span>
      </div>
      <div className={cx('absolute -translate-x-1/2 text-center whitespace-nowrap', abajo ? 'top-[70px]' : '-top-[2px]')}>
        <span className="text-[12px] text-ink-3">{etiqueta} </span>
        <span className="text-[13px] font-semibold">{hora}</span>
      </div>
    </motion.div>
  )
}

// ── Esta Mac ───────────────────────────────────────────────
function EstaMac() {
  const [alIniciar, setAlIniciar] = useState<boolean | null>(null)
  const [buscando, setBuscando] = useState(false)
  useEffect(() => {
    void abreAlIniciar().then(setAlIniciar)
  }, [])
  return (
    <Bloque titulo="Esta Mac">
      <div className="card divide-y divide-line">
        {enMac && alIniciar !== null && (
          <div className="flex items-center gap-4 px-5 py-4">
            <Power size={18} className="text-ink-3" />
            <div className="flex-1">
              <Toggle
                checked={alIniciar}
                onChange={async (v) => {
                  await cambiarAbreAlIniciar(v)
                  setAlIniciar(v)
                }}
                label="Abrir al prender la Mac"
                description="Así nunca se pierde una solicitud. Sigue en la barra de menú aunque cierres la ventana."
              />
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 px-5 py-4">
          <Bell size={18} className="text-ink-3" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">Avisos de cada solicitud</div>
            <div className="text-[13px] text-ink-soft">Llegan al Centro de notificaciones y suman al número del Dock.</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!(await permisoAvisos())) return toast.error('Los avisos están apagados', enMac ? 'Actívalos en Ajustes del Sistema → Notificaciones → La Joya.' : 'Permite las notificaciones en el navegador.')
              await avisar('La Joya', 'Así se verá el aviso de una solicitud nueva')
            }}
          >
            Probar aviso
          </Button>
        </div>
        <div className="flex items-center gap-4 px-5 py-4">
          <Download size={18} className="text-ink-3" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">Versión {__APP_VERSION__}</div>
            <div className="text-[13px] text-ink-soft">{esNubeLocal ? `Conectada a la nube local (${URL_NUBE})` : 'Conectada a la nube del rancho'}</div>
          </div>
          {enMac && (
            <Button
              size="sm"
              variant="outline"
              loading={buscando}
              onClick={async () => {
                setBuscando(true)
                try {
                  const u = await buscarActualizacion()
                  if (!u) return toast.success('Ya tienes la versión más nueva')
                  toast.action(`Versión ${u.version} lista`, { label: 'Instalar', onClick: () => void instalarActualizacion(u, (d) => toast.error('No se pudo instalar', d)) }, 'Se instala y la app vuelve a abrir sola')
                } catch {
                  toast.error('No se pudo revisar', 'Revisa el internet e intenta de nuevo. Tu versión sigue funcionando igual.')
                } finally {
                  setBuscando(false)
                }
              }}
            >
              Buscar actualización
            </Button>
          )}
        </div>
      </div>
    </Bloque>
  )
}

// Hospedajes: cabañas, casas y habitaciones con sus datos, precios y temporadas.
// Las fotografías de la página se administran en la web.
// Se guarda solo mientras escribes, como en las apps de la Mac.
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { BedDouble, Bath, Check, Eye, EyeOff, Plus, Trash2, Users } from 'lucide-react'
import { useApp, recargar } from '@/lib/store'
import { rpc } from '@/lib/nube'
import { TIPO } from '@/lib/ocupacion'
import { corta, masDias, noches, plural, rango } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { CMD } from '@/lib/mac'
import type { Cabana, ISODate, Temporada, TipoHospedaje } from '@/lib/tipos'
import { Button, Segmented, Toggle, cx, toast, Confirm } from '@/components/ui'
import { Campo, CampoDinero, CampoLargo, Contador, Etiquetas, RangoFechas } from '@/components/campos'

const AMENIDADES = ['Wi-Fi', 'Estacionamiento', 'Asador', 'Cocina equipada', 'Aire acondicionado', 'Ventilador', 'Agua caliente', 'TV', 'Terraza', 'Alberca', 'Fogatero', 'Hamacas', 'Se aceptan mascotas', 'Ropa de cama y toallas']

type Forma = Omit<Cabana, 'id' | 'orden'> & { id?: string; orden?: number }
const vacia = (): Forma => ({ slug: '', nombre: '', tipo: 'cabana', resumen: null, descripcion: null, capacidad: 2, recamaras: null, camas: null, banos: null, amenidades: [], fotos: [], precio_noche: null, precio_fin_semana: null, huespedes_incluidos: null, precio_huesped_extra: null, noches_minimas: null, publicada: false, notas: null })
export const aSlug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

export default function Cabanas() {
  const d = useApp((s) => s.datos)!
  const sel = useApp((s) => s.cabana)
  const editar = useApp((s) => s.editarCabana)
  const [filtro, setFiltro] = useState<'todos' | TipoHospedaje>('todos')
  useEffect(() => {
    if (!sel && d.cabanas[0]) editar(d.cabanas[0].id)
    if (!sel && !d.cabanas.length) editar('nueva')
  }, [sel, d.cabanas, editar])
  const actual = sel === 'nueva' ? null : d.cabanas.find((c) => c.id === sel)
  const conteos = {
    cabana: d.cabanas.filter((c) => c.tipo === 'cabana').length,
    casa: d.cabanas.filter((c) => c.tipo === 'casa').length,
    habitacion: d.cabanas.filter((c) => c.tipo === 'habitacion').length,
  }
  const visibles = filtro === 'todos' ? d.cabanas : d.cabanas.filter((c) => c.tipo === filtro)
  const filtros: ('todos' | TipoHospedaje)[] = ['todos', 'cabana', 'casa', 'habitacion']

  return (
    <div className="app-cabanas flex h-full">
      <div className="app-cabanas-list interfaz flex w-[240px] shrink-0 flex-col border-r border-line">
        <div className="app-cabanas-list-header flex items-end justify-between gap-2 px-4 pt-6 pb-3">
          <div className="min-w-0">
            <h1 className="heading text-[22px]">Hospedajes</h1>
            <p className="mt-1 text-[12px] text-ink-soft">{d.cabanas.length} en total</p>
          </div>
          <Button size="sm" variant="secondary" icon={<Plus size={15} />} onClick={() => editar('nueva')}>
            Agregar
          </Button>
        </div>
        <div className="app-cabanas-filters" aria-label="Filtrar por tipo de hospedaje">
          {filtros.map((t) => {
            const n = t === 'todos' ? d.cabanas.length : conteos[t]
            const texto = t === 'todos' ? 'Todos' : TIPO[t].varios
            return (
              <button key={t} type="button" aria-pressed={filtro === t} onClick={() => setFiltro(t)} className="app-cabanas-filter">
                <span>{texto}</span>
                <span>{n}</span>
              </button>
            )
          })}
        </div>
        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-2.5 pb-6">
          {visibles.map((c) => (
            <button key={c.id} onClick={() => editar(c.id)} className={cx('app-cabana-item flex w-full items-center gap-3 rounded-[12px] p-2 text-left transition-colors', sel === c.id ? 'is-active bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface))]' : 'hover:bg-wash')}>
              <Miniatura c={c} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-tight font-semibold">{c.nombre}</span>
                <span className="block text-[12px] text-ink-3">
                  {TIPO[c.tipo].uno} · {c.publicada ? 'en la web' : 'oculta'}
                </span>
              </span>
              <span className={cx('h-2 w-2 shrink-0 rounded-full', c.publicada ? 'bg-success' : 'bg-line-strong')} title={c.publicada ? 'Sale en la web' : 'No sale en la web'} />
            </button>
          ))}
          {sel === 'nueva' && (
            <div className="app-cabana-item is-active flex items-center gap-3 rounded-[12px] bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface))] p-2">
              <IlustracionHospedaje tipo="cabana" />
              <span className="text-[14px] font-semibold">Nuevo hospedaje</span>
            </div>
          )}
          {visibles.length === 0 && sel !== 'nueva' && <p className="px-3 py-6 text-center text-[12px] text-ink-soft">No hay hospedajes de este tipo.</p>}
        </div>
      </div>
      <div className="app-cabanas-editor scroll-area min-w-0 flex-1 overflow-y-auto">{sel && <Editor key={sel} original={actual ?? null} />}</div>
    </div>
  )
}

function Miniatura({ c }: { c: Pick<Cabana, 'tipo'> }) {
  return <IlustracionHospedaje tipo={c.tipo} />
}
function CasaIcono({ tipo, size = 22 }: { tipo: TipoHospedaje; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      {tipo === 'cabana' ? <path d="M3 20 12 4l9 16Z M10 20v-5h4v5" /> : tipo === 'casa' ? <path d="M3 11 12 4l9 7 M5 10v10h14V10 M10 20v-5h4v5" /> : <path d="M5 20V5h14v15 M9 9h2M13 9h2M9 13h2M13 13h2 M11 20v-3h2v3" />}
    </svg>
  )
}

function IlustracionHospedaje({ tipo, grande = false }: { tipo: TipoHospedaje; grande?: boolean }) {
  const dibujo: Record<TipoHospedaje, string> = {
    cabana: 'M4 40 32 10l28 30H4Zm22 0V28h12v12',
    casa: 'M6 26 32 8l26 18M12 22v18h40V22M26 40V30h12v10M44 14V8h6v10',
    habitacion: 'M6 12v32M6 34h52v10M12 26h14v8H12M28 34v-8h20a8 8 0 0 1 8 8',
  }
  return (
    <span className={cx('app-hospedaje-ilustracion', `is-${tipo}`, grande && 'is-large')} aria-hidden="true">
      <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={dibujo[tipo]} />
        {tipo === 'casa' && <path d="M18 26h9v8h-9zM37 26h9v8h-9z" />}
        {tipo === 'habitacion' && <path d="M12 16h40v10H12zM18 16v-4h12v4M34 16v-4h12v4" />}
        {tipo === 'cabana' && <path d="M9 35h46M18 25l14-15 14 15" />}
      </svg>
      {grande && <span>Ilustración · {TIPO[tipo].uno}</span>}
    </span>
  )
}

function Editor({ original }: { original: Cabana | null }) {
  const d = useApp((s) => s.datos)!
  const editar = useApp((s) => s.editarCabana)
  const [f, setF] = useState<Forma>(() => (original ? { ...original } : vacia()))
  const [slugTocado, setSlugTocado] = useState(!!original)
  const [estado, setEstado] = useState<'guardado' | 'pendiente' | 'guardando' | 'error'>('guardado')
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [borrar, setBorrar] = useState(false)
  const nueva = !original
  const set = <K extends keyof Forma>(k: K, v: Forma[K]) => setF((x) => ({ ...x, [k]: v }))
  const valido = f.nombre.trim().length > 0 && f.capacidad >= 1 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)

  useEffect(() => {
    if (!slugTocado) setF((x) => ({ ...x, slug: aSlug(x.nombre) }))
  }, [f.nombre, slugTocado])

  // Guardado automático (solo las que ya existen; una nueva se crea con su botón)
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) {
      primera.current = false
      return
    }
    if (nueva) return
    pendiente.current = true
    setEstado('pendiente')
    if (!valido) return
    const t = setTimeout(() => void guardar(), 900)
    return () => clearTimeout(t)
  }, [f]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lo que se está escribiendo se guarda de inmediato al salir de la ficha, al cambiar de ventana o al esconder la app
  const fRef = useRef(f)
  fRef.current = f
  const pendiente = useRef(false)
  const guardarRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    const ya = () => {
      if (pendiente.current) void guardarRef.current()
    }
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

  const guardar = async () => {
    if (!valido) return
    const enviado = JSON.stringify(f)
    setEstado('guardando')
    try {
      const { id, orden, ...resto } = f
      const r = await rpc<Cabana>('hosp_guardar_cabana', { p: { ...resto, id: id ?? null, ...(orden != null ? { orden } : {}) } })
      // Si se siguió escribiendo mientras se guardaba, queda pendiente (el guardado automático lo vuelve a mandar)
      if (JSON.stringify(fRef.current) === enviado) {
        pendiente.current = false
        setEstado('guardado')
      }
      setErrorGuardar(null)
      void recargar()
      if (nueva) {
        toast.success(`${r.nombre} quedó guardada`, 'Tú subes las fotos desde la web.')
        editar(r.id)
      }
    } catch (e) {
      setEstado('error')
      setErrorGuardar(e instanceof Error ? e.message : String(e))
    }
  }

  guardarRef.current = guardar

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void guardar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const temporadas = original ? d.temporadas.filter((t) => t.cabana_id === original.id) : []

  return (
    <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-7 px-6 pt-8 pb-16 min-[1280px]:grid-cols-[minmax(0,1fr)_288px]">
      <div className="min-w-0">
        {/* Encabezado */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="heading text-[28px] leading-tight">{f.nombre.trim() || 'Nuevo hospedaje'}</h2>
            <p className="mt-1 text-[13px] text-ink-3">
              {nueva ? 'Completa los datos del hospedaje. Tú subes la foto desde la web.' : estado === 'guardando' ? 'Guardando…' : estado === 'pendiente' ? (valido ? 'Cambios por guardar' : 'Falta el nombre o la capacidad') : estado === 'error' ? '' : `Se guarda solo · ${CMD}S`}
              {estado === 'guardado' && !nueva && <Check size={13} className="ml-1 inline text-success" />}
            </p>
            {errorGuardar && <p className="mt-1 text-[13px] text-danger">{errorGuardar}</p>}
          </div>
          {nueva ? (
            <Button disabled={!valido} loading={estado === 'guardando'} onClick={() => void guardar()} icon={<Check size={16} />}>
              Crear hospedaje
            </Button>
          ) : (
            <div className="rounded-[14px] px-4 py-2.5 ring-1 ring-line">
              <Toggle checked={f.publicada} onChange={(v) => set('publicada', v)} label={f.publicada ? 'Sale en la página' : 'No sale en la página'} description={!f.publicada ? 'Apagado: no sale en la página' : !f.precio_noche ? 'Sin precio: en la página se pregunta por WhatsApp (ponle el precio en «Editar datos y precios»)' : undefined} />
            </div>
          )}
        </div>

        <div className="app-cabana-illustration-banner">
          <IlustracionHospedaje tipo={f.tipo} grande />
          <div>
            <strong>{TIPO[f.tipo].uno}</strong>
            <p>Aquí solo va la ilustración. Tú agregas y administras las fotos en la web.</p>
          </div>
        </div>

        <Bloque titulo="Datos">
          <Segmented value={f.tipo} onChange={(v) => set('tipo', v)} options={(['cabana', 'casa', 'habitacion'] as TipoHospedaje[]).map((t) => ({ value: t, label: <><CasaIcono tipo={t} size={15} /> {TIPO[t].uno}</> }))} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Campo label="Nombre" value={f.nombre} onChange={(v) => set('nombre', v)} maxLength={80} autoFocus={nueva} ok={!!f.nombre.trim()} />
            <Campo
              label={original ? 'Clave (no se cambia)' : 'Clave en la página'}
              value={f.slug}
              disabled={!!original}
              onChange={(v) => (setSlugTocado(true), set('slug', aSlug(v)))}
              hint={original ? 'Une este lugar con su edificio en el mapa y con su ficha en la página. El nombre sí se puede cambiar.' : f.slug ? `Se arma con el nombre: ${f.slug}` : 'Se arma sola con el nombre'}
              error={f.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug) ? 'Solo letras, números y guiones' : null}
            />
          </div>
          <Campo className="mt-3" label="Resumen (una línea para la tarjeta)" value={f.resumen ?? ''} onChange={(v) => set('resumen', v || null)} maxLength={200} counter />
          <CampoLargo className="mt-3" label="Descripción" value={f.descripcion ?? ''} onChange={(v) => set('descripcion', v || null)} maxLength={4000} minRows={4} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Contador className="col-span-2" label="Capacidad" value={f.capacidad} onChange={(n) => set('capacidad', n)} min={1} max={50} sufijo={(n) => plural(n, 'persona', 'personas')} />
            <Contador label="Recámaras" value={f.recamaras ?? 0} onChange={(n) => set('recamaras', n)} min={0} max={20} />
            <Contador label="Baños" value={f.banos ?? 0} onChange={(n) => set('banos', n)} min={0} max={20} />
          </div>
          <Campo className="mt-3" label="Camas" value={f.camas ?? ''} onChange={(v) => set('camas', v || null)} placeholder="1 matrimonial y 2 individuales" maxLength={200} />
          <div className="mt-4">
            <Etiquetas label="Lo que incluye" value={f.amenidades} onChange={(v) => set('amenidades', v)} sugerencias={AMENIDADES} />
          </div>
        </Bloque>

        <Bloque titulo="Precios" detalle="Los precios los decide el rancho. Sin precio, la página muestra «Pregunta por WhatsApp».">
          <div className="grid grid-cols-2 gap-3">
            <CampoDinero label="Precio por noche" value={f.precio_noche} onChange={(v) => set('precio_noche', v)} />
            <CampoDinero label="Noche de fin de semana" value={f.precio_fin_semana} onChange={(v) => set('precio_fin_semana', v)} hint={`Noches de ${nochesFinde(d.ajustes.noches_fin_semana)}`} />
            <Contador label="Personas incluidas" value={f.huespedes_incluidos ?? f.capacidad} onChange={(n) => set('huespedes_incluidos', n)} min={1} max={f.capacidad} hint="Arriba de ellas se cobra el extra" />
            <CampoDinero label="Persona extra por noche" value={f.precio_huesped_extra} onChange={(v) => set('precio_huesped_extra', v)} />
            <Contador label="Mínimo de noches" value={f.noches_minimas ?? d.ajustes.noches_minimas} onChange={(n) => set('noches_minimas', n)} min={1} max={60} hint={f.noches_minimas == null ? 'El general de Ajustes' : undefined} />
          </div>
          <Ejemplo f={f} />
        </Bloque>

        {original && (
          <Bloque titulo="Temporadas" detalle="Precio especial por noche en ciertas fechas (Semana Santa, diciembre…). Gana sobre el de fin de semana.">
            <Temporadas cabana={original} lista={temporadas} />
          </Bloque>
        )}

        <Bloque titulo="Notas internas">
          <CampoLargo label="Solo las ve el rancho" value={f.notas ?? ''} onChange={(v) => set('notas', v || null)} maxLength={2000} minRows={2} />
        </Bloque>

        {original && (
          <div className="mt-10 border-t border-line pt-6">
            <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setBorrar(true)}>
              Borrar este hospedaje
            </Button>
            <Confirm
              open={borrar}
              onClose={() => setBorrar(false)}
              danger
              title={`¿Borrar ${original.nombre}?`}
              body="Solo se puede si nunca tuvo reservaciones. Si ya tuvo, mejor apaga «Sale en la página»."
              confirmLabel="Borrar"
              onConfirm={async () => {
                try {
                  pendiente.current = false
                  await rpc('hosp_borrar_cabana', { p_id: original.id })
                  toast.success(`Borraste ${original.nombre}`)
                  editar(null)
                  void recargar()
                } catch (e) {
                  toast.error('No se pudo borrar', e instanceof Error ? e.message : String(e))
                }
              }}
            />
          </div>
        )}
      </div>

      {/* En una ventana angosta la vista previa se guarda para dejarle espacio al formulario */}
      <aside className="hidden min-[1280px]:block">
        <div className="sticky top-8">
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-3">
            {f.publicada ? <Eye size={14} /> : <EyeOff size={14} />} Vista orientativa{f.publicada ? '' : ' · oculta'}
          </div>
          <p className="mb-2 text-[12px] text-ink-soft">Tú subes las fotos desde la web.</p>
          <VistaPrevia f={f} minimoGeneral={d.ajustes.noches_minimas} />
        </div>
      </aside>
    </div>
  )
}

const NOMBRE_DIA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
function nochesFinde(n: number[]) {
  const nombres = n.map((x) => NOMBRE_DIA[x]).filter(Boolean)
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : (nombres[0] ?? 'fin de semana')
}

function Bloque({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <section className="app-cabana-block mt-9 first-of-type:mt-0">
      <h3 className="text-[16px] font-semibold tracking-[-0.015em]">{titulo}</h3>
      {detalle && <p className="mt-0.5 text-[13px] text-ink-soft">{detalle}</p>}
      <div className="mt-3.5">{children}</div>
    </section>
  )
}

/** Cuánto saldría una estancia típica con los precios capturados (sale de lo que escribió el rancho) */
function Ejemplo({ f }: { f: Forma }) {
  if (!f.precio_noche) return null
  const finde = f.precio_fin_semana ?? f.precio_noche
  const incluidas = f.huespedes_incluidos ?? f.capacidad
  const extra = f.precio_huesped_extra && f.capacidad > incluidas ? f.precio_huesped_extra * (f.capacidad - incluidas) * 2 : 0
  return (
    <div className="mt-4 rounded-[14px] bg-sunken px-4 py-3 text-[14px]">
      <span className="text-ink-soft">Con estos precios, un fin de semana de 2 noches para {plural(incluidas, 'persona', 'personas')} sale en </span>
      <b className="text-key">{mxn(finde * 2)}</b>
      {extra > 0 && (
        <span className="text-ink-soft">
          {' '}
          y lleno ({f.capacidad}) en <b className="text-key">{mxn(finde * 2 + extra)}</b>
        </span>
      )}
      <span className="text-ink-soft">.</span>
    </div>
  )
}

// ── Temporadas ─────────────────────────────────────────────
function Temporadas({ cabana, lista }: { cabana: Cabana; lista: Temporada[] }) {
  const d = useApp((s) => s.datos)!
  const [nueva, setNueva] = useState(false)
  const [nombre, setNombre] = useState('')
  const [desde, setDesde] = useState<ISODate | null>(null)
  const [hastaSalida, setHastaSalida] = useState<ISODate | null>(null)
  const [precio, setPrecio] = useState<number | null>(null)
  const [minimo, setMinimo] = useState(1)
  const [guardando, setGuardando] = useState(false)
  // Dos temporadas no se pueden encimar en la misma cabaña
  const ocupacion = useMemo(() => (iso: ISODate) => (lista.some((t) => t.desde <= iso && iso <= t.hasta) ? ('ocupado' as const) : ('libre' as const)), [lista])
  const ok = nombre.trim() && desde && hastaSalida && precio
  const guardar = async () => {
    if (!ok) return
    setGuardando(true)
    try {
      await rpc('hosp_guardar_temporada', { p: { cabana_id: cabana.id, nombre: nombre.trim(), desde, hasta: masDias(hastaSalida!, -1), precio_noche: precio, noches_minimas: minimo > 1 ? minimo : null } })
      toast.success(`Temporada «${nombre.trim()}» guardada`)
      setNueva(false)
      setNombre('')
      setDesde(null)
      setHastaSalida(null)
      setPrecio(null)
      setMinimo(1)
      void recargar()
    } catch (e) {
      toast.error('No se pudo guardar la temporada', e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }
  return (
    <div>
      {lista.length > 0 && (
        <div className="mb-3 divide-y divide-line rounded-[14px] ring-1 ring-line">
          {lista.map((t) => (
            <div key={t.id} className="group flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{t.nombre}</span>
                <span className="block text-[13px] text-ink-soft">
                  Noches del {corta(t.desde)} al {corta(t.hasta)} · {plural(noches(t.desde, t.hasta) + 1, 'noche', 'noches')}
                  {t.noches_minimas ? ` · mínimo ${t.noches_minimas}` : ''}
                </span>
              </span>
              <span className="text-[14px] font-semibold text-key tabular">{mxn(t.precio_noche)}</span>
              <button
                aria-label={`Borrar ${t.nombre}`}
                onClick={async () => {
                  try {
                    await rpc('hosp_borrar_temporada', { p_id: t.id })
                    void recargar()
                    toast.undo(`Borraste «${t.nombre}»`, () => void rpc('hosp_guardar_temporada', { p: { cabana_id: t.cabana_id, nombre: t.nombre, desde: t.desde, hasta: t.hasta, precio_noche: t.precio_noche, noches_minimas: t.noches_minimas } }).then(recargar))
                  } catch (e) {
                    toast.error('No se pudo borrar', e instanceof Error ? e.message : String(e))
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-wash hover:text-danger focus-visible:opacity-100"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {nueva ? (
        <div className="rounded-[14px] bg-sunken p-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nombre de la temporada" value={nombre} onChange={setNombre} placeholder="Navidad" maxLength={60} autoFocus />
            <CampoDinero label="Precio por noche" value={precio} onChange={setPrecio} />
          </div>
          <div className="mt-3 rounded-[12px] bg-surface p-3">
            <RangoFechas llegada={desde} salida={hastaSalida} hoy={d.hoy} ocupacion={ocupacion} onChange={(a, b) => (setDesde(a), setHastaSalida(b))} />
          </div>
          <p className="mt-2 text-[13px] text-ink-3">{desde && hastaSalida ? `Cobra las noches del ${corta(desde)} al ${corta(masDias(hastaSalida, -1))} (${rango(desde, hastaSalida)})` : 'Elige la primera noche y el día siguiente a la última.'}</p>
          <Contador className="mt-3" label="Mínimo de noches en esas fechas" value={minimo} onChange={setMinimo} min={1} max={60} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNueva(false)}>
              No
            </Button>
            <Button disabled={!ok} loading={guardando} onClick={() => void guardar()}>
              Guardar temporada
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" icon={<Plus size={15} />} onClick={() => setNueva(true)}>
          Agregar temporada
        </Button>
      )}
    </div>
  )
}

/** Tarjeta como la de la página pública, con lo que se va escribiendo */
function VistaPrevia({ f, minimoGeneral }: { f: Forma; minimoGeneral: number }) {
  const desde = f.precio_noche && f.precio_fin_semana ? Math.min(f.precio_noche, f.precio_fin_semana) : (f.precio_noche ?? f.precio_fin_semana)
  const minimo = f.noches_minimas ?? minimoGeneral
  return (
    <motion.article layout className="app-cabana-preview overflow-hidden rounded-[22px] bg-surface shadow-[var(--shadow-2)] ring-1 ring-line">
      <div className="app-cabana-preview-image relative aspect-[4/3] bg-night">
        <IlustracionHospedaje tipo={f.tipo} grande />
        <span className="absolute top-3 left-3 rounded-full bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] px-2.5 py-1 text-[12px] font-semibold backdrop-blur">{TIPO[f.tipo].uno}</span>
      </div>
      <div className="p-5">
        <h4 className="text-[19px] leading-tight font-semibold tracking-[-0.02em]">
          {f.nombre.trim() || 'Nombre del hospedaje'}
        </h4>
        <p className={cx('mt-1.5 text-[14px] leading-snug', f.resumen ? 'text-ink-soft' : 'text-ink-3')}>{f.resumen || 'El resumen aparece aquí'}</p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <Users size={13} /> {plural(f.capacidad, 'persona', 'personas')}
          </span>
          {!!f.recamaras && (
            <span className="inline-flex items-center gap-1">
              <BedDouble size={13} /> {plural(f.recamaras, 'recámara', 'recámaras')}
            </span>
          )}
          {!!f.banos && (
            <span className="inline-flex items-center gap-1">
              <Bath size={13} /> {plural(f.banos, 'baño', 'baños')}
            </span>
          )}
        </div>
        {f.amenidades.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {f.amenidades.slice(0, 6).map((a) => (
              <span key={a} className="rounded-full bg-sunken px-2 py-0.5 text-[12px] text-ink-soft">
                {a}
              </span>
            ))}
            {f.amenidades.length > 6 && <span className="px-1 text-[12px] text-ink-3">y {f.amenidades.length - 6} más</span>}
          </div>
        )}
        <div className="mt-4 flex items-end justify-between border-t border-line pt-3.5">
          {desde ? (
            <span>
              <span className="text-[12px] text-ink-3">Desde </span>
              <span className="text-[20px] font-semibold text-key tabular">{mxn(desde)}</span>
              <span className="text-[12px] text-ink-3"> / noche</span>
            </span>
          ) : (
            <span className="text-[13px] font-medium text-ink-soft">Pregunta por WhatsApp</span>
          )}
          {minimo > 1 && <span className="text-[12px] text-ink-3">Mínimo {minimo} noches</span>}
        </div>
      </div>
    </motion.article>
  )
}

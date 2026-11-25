// Apartar fechas: el calendario sencillo del dueño. Elige el hospedaje, toca el día que llegan y el día que se van,
// y si quiere anota de quién es. La página muestra esas noches ocupadas, pero no se crea una reservación:
// sin código, sin pagos, sin correos ni avisos. Lo apartado se ve a la derecha y se quita con un clic (con «Deshacer»).
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useApp } from '@/lib/store'
import { nocheDe, nombreDe, TIPO } from '@/lib/ocupacion'
import { apartadosVigentes, MAX_NOTA, notaDe } from '@/lib/apartados'
import { apartarFechas, quitarApartado } from '@/lib/acciones'
import { delAl, dia, diaSemana, inicioDeMes, larga, masDias, mesLargo, noches, plural } from '@/lib/fechas'
import type { Bloqueo, Datos, ISODate } from '@/lib/tipos'
import { Button, Empty, cx } from '@/components/ui'
import { Campo } from '@/components/campos'

type Estado = 'libre' | 'ocupada' | 'tuya'
const SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const otroMes = (mes: ISODate, n: number): ISODate => {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10)
}
function estadoEn(d: Datos, cabana: string | null, iso: ISODate): Estado {
  if (!cabana) return 'libre'
  const n = nocheDe(d, cabana, iso)
  return n.tipo === 'libre' ? 'libre' : n.tipo === 'dueno' ? 'tuya' : 'ocupada'
}

export default function Apartar() {
  const d = useApp((s) => s.datos)!
  const [cabana, setCabana] = useState<string | null>(d.cabanas.length === 1 ? d.cabanas[0]!.id : null)
  const [llegada, setLlegada] = useState<ISODate | null>(null)
  const [salida, setSalida] = useState<ISODate | null>(null)
  const [sobre, setSobre] = useState<ISODate | null>(null)
  const [nota, setNota] = useState('')
  const [mes, setMes] = useState(inicioDeMes(d.hoy))
  const [guardando, setGuardando] = useState(false)
  const [reciente, setReciente] = useState<string | null>(null)
  // Dos meses lado a lado si caben con los días grandes; si no, uno solo (más fácil de leer).
  // Se mide con ResizeObserver porque el Safari de Monterey no entiende container queries.
  const calendario = useRef<HTMLDivElement>(null)
  const [dosMeses, setDosMeses] = useState(true)
  useEffect(() => {
    const el = calendario.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setDosMeses((e?.contentRect.width ?? 0) >= 660))
    ro.observe(el)
    return () => ro.disconnect()
  }, [d.cabanas.length > 0])
  useEffect(() => {
    if (!reciente) return
    const t = setTimeout(() => setReciente(null), 5000)
    return () => clearTimeout(t)
  }, [reciente])

  // Hasta dónde llegan los datos que bajó la app: más allá no se sabe si está libre
  const limite = d.hasta || masDias(d.hoy, 540)
  const estado = (iso: ISODate, cab = cabana) => estadoEn(d, cab, iso)
  /** ¿Están libres todas las noches de a hasta antes de b? */
  const libreEntre = (a: ISODate, b: ISODate, cab = cabana) => {
    for (let x = a; x < b; x = masDias(x, 1)) if (x >= limite || estado(x, cab) !== 'libre') return false
    return true
  }
  const eligiendoSalida = !!llegada && !salida
  const tocar = (iso: ISODate) => {
    if (eligiendoSalida && iso > llegada! && libreEntre(llegada!, iso)) return setSalida(iso)
    if (iso < d.hoy || iso >= limite || estado(iso) !== 'libre') return
    setLlegada(iso)
    setSalida(null)
  }
  const elegirCabana = (id: string) => {
    setCabana(id)
    // Si las fechas elegidas no están libres en el otro hospedaje, se empiezan de nuevo
    if (llegada && !(salida ? libreEntre(llegada, salida, id) : estado(llegada, id) === 'libre')) {
      setLlegada(null)
      setSalida(null)
    }
  }
  const borrarFechas = () => {
    setLlegada(null)
    setSalida(null)
  }

  // Si mientras elegía alguien reservó una de esas noches (en la página o en recepción), se avisa en vez de intentar
  const sigueLibre = !llegada || !salida || libreEntre(llegada, salida)
  const listo = !!cabana && !!llegada && !!salida && sigueLibre
  // Un doble clic o un doble Enter no manda dos veces lo mismo
  const enCurso = useRef(false)
  const apartar = async () => {
    if (!listo || enCurso.current) return
    enCurso.current = true
    setGuardando(true)
    try {
      const r = await apartarFechas({ cabana_id: cabana!, inicio: llegada!, fin: salida!, nota })
      if (r) {
        setReciente(r.id)
        setNota('')
        borrarFechas()
      }
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  const lista = apartadosVigentes(d)
  const cab = d.cabanas.find((c) => c.id === cabana)
  const primerMes = inicioDeMes(d.hoy)
  const ultimoMes = inicioDeMes(limite)
  const hasta = salida ?? (eligiendoSalida && sobre && sobre > llegada! && libreEntre(llegada!, sobre) ? sobre : null)

  if (!d.cabanas.length)
    return <div className="apartar"><Empty title="Primero da de alta un hospedaje" body="En «Hospedajes» capturas cada cabaña, casa y habitación. Después aquí apartas sus fechas." action={<Button onClick={() => useApp.getState().ir('cabanas')}>Ir a Hospedajes</Button>} /></div>

  return (
    <div className="apartar">
      <header className="apartar-encabezado">
        <h1>Apartar fechas</h1>
        <p>Para alguien que te habló o una estancia que ya tenías. En la página esas noches se ven ocupadas. No se crea una reservación, no se cobra y no se manda ningún mensaje.</p>
      </header>

      <div className="apartar-columnas">
        <section className="apartar-hoja" aria-label="Apartar noches">
          <h2>¿Qué hospedaje?</h2>
          <div className="apartar-lugares" role="radiogroup" aria-label="Hospedaje">
            {d.cabanas.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={cabana === c.id} onClick={() => elegirCabana(c.id)} className="apartar-lugar">
                <span>
                  <strong>{c.nombre}</strong>
                  <small>
                    {TIPO[c.tipo].uno} · {plural(c.capacidad, 'persona', 'personas')}
                    {!c.publicada && ' · no sale en la página'}
                  </small>
                </span>
                {cabana === c.id && <Check size={20} strokeWidth={2.4} aria-hidden="true" />}
              </button>
            ))}
          </div>

          <h2>¿Qué noches?</h2>
          <div className="apartar-guia" aria-live="polite">
            {!cabana ? (
              <p>Primero elige el hospedaje de arriba.</p>
            ) : !llegada ? (
              <p>
                Toca el día que <b>llegan</b>.
              </p>
            ) : !salida ? (
              <p>
                Ahora toca el día que <b>se van</b>. <span>Llegan el {larga(llegada)}.</span>
              </p>
            ) : (
              <p>
                <b>{delAl(llegada, salida)}</b> <span>· {plural(noches(llegada, salida), 'noche', 'noches')}</span>
              </p>
            )}
            {llegada && (
              <button type="button" className="apartar-enlace" onClick={borrarFechas}>
                Elegir otras fechas
              </button>
            )}
          </div>

          <div ref={calendario} className={cx('apartar-calendario', !cabana && 'is-inactivo', !dosMeses && 'un-mes')} onPointerLeave={() => setSobre(null)}>
            <div className="apartar-meses-nav">
              <Button variant="outline" size="icon" aria-label="Mes anterior" disabled={mes <= primerMes} onClick={() => setMes(otroMes(mes, -1))}>
                <ChevronLeft size={22} />
              </Button>
              <Button variant="outline" size="icon" aria-label="Mes siguiente" disabled={otroMes(mes, dosMeses ? 2 : 1) > ultimoMes} onClick={() => setMes(otroMes(mes, 1))}>
                <ChevronRight size={22} />
              </Button>
            </div>
            <div className="apartar-meses">
              {(dosMeses ? [mes, otroMes(mes, 1)] : [mes]).map((m) => (
                <Mes key={m} mes={m} hoy={d.hoy} limite={limite} activo={!!cabana} llegada={llegada} hasta={hasta} eligiendoSalida={eligiendoSalida} estado={estado} libreEntre={libreEntre} onTocar={tocar} onSobre={setSobre} />
              ))}
            </div>
            <div className="apartar-leyenda" aria-label="Qué significa cada color">
              <span><i data-estado="libre" />Libre</span>
              <span><i data-estado="ocupada" />Ocupada</span>
              <span><i data-estado="tuya" />Ya la apartaste</span>
            </div>
          </div>

          <h2>¿De quién es? <span>(si quieres)</span></h2>
          <Campo label="Nombre o una nota corta" value={nota} onChange={setNota} maxLength={MAX_NOTA} onEnter={() => void apartar()} hint="Por ejemplo: Familia Ramírez, o «mi compadre Juan»." className="apartar-nota" />

          <div className="apartar-confirmar">
            <p>
              {listo ? (
                <>
                  Vas a apartar <b>{cab?.nombre}</b> {delAl(llegada!, salida!).toLowerCase()} ({plural(noches(llegada!, salida!), 'noche', 'noches')}).
                </>
              ) : !sigueLibre && !guardando ? (
                <span className="apartar-aviso">Alguien ocupó una de esas noches mientras elegías. Toca «Elegir otras fechas».</span>
              ) : !cabana ? (
                'Elige el hospedaje y las noches.'
              ) : (
                'Falta tocar el día que llegan y el día que se van.'
              )}
            </p>
            <Button size="lg" icon={<CalendarCheck size={20} />} disabled={!listo} loading={guardando} onClick={() => void apartar()}>
              Apartar estas noches
            </Button>
          </div>
        </section>

        <aside className="apartar-lista" aria-label="Lo que ya apartaste">
          <h2>
            Lo que ya apartaste {lista.length > 0 && <span>{lista.length}</span>}
          </h2>
          {lista.length ? (
            <ul>
              {lista.map((b) => (
                <Apartado key={b.id} b={b} d={d} reciente={b.id === reciente} />
              ))}
            </ul>
          ) : (
            <p className="apartar-vacio">Todavía no apartas fechas. Lo que apartes aparece aquí, y lo puedes quitar cuando quieras.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

function Apartado({ b, d, reciente }: { b: Bloqueo; d: Datos; reciente: boolean }) {
  const [quitando, setQuitando] = useState(false)
  const nota = notaDe(b)
  const aqui = b.inicio <= d.hoy
  return (
    <li className={cx('apartar-item', reciente && 'is-reciente')}>
      <div>
        <strong>{nombreDe(d, b.cabana_id)}</strong>
        <p>
          {delAl(b.inicio, b.fin)} · {plural(noches(b.inicio, b.fin), 'noche', 'noches')}
        </p>
        {nota && <p className="apartar-item-nota">{nota}</p>}
        {aqui && <p className="apartar-item-ahora">Ya están aquí</p>}
      </div>
      <Button
        variant="outline"
        icon={<X size={17} />}
        loading={quitando}
        aria-label={`Quitar el apartado de ${nombreDe(d, b.cabana_id)}, ${delAl(b.inicio, b.fin).toLowerCase()}`}
        onClick={async () => {
          setQuitando(true)
          try {
            await quitarApartado(b)
          } finally {
            setQuitando(false)
          }
        }}
      >
        Quitar
      </Button>
    </li>
  )
}

function Mes({ mes, hoy, limite, activo, llegada, hasta, eligiendoSalida, estado, libreEntre, onTocar, onSobre }: { mes: ISODate; hoy: ISODate; limite: ISODate; activo: boolean; llegada: ISODate | null; hasta: ISODate | null; eligiendoSalida: boolean; estado: (iso: ISODate) => Estado; libreEntre: (a: ISODate, b: ISODate) => boolean; onTocar: (iso: ISODate) => void; onSobre: (iso: ISODate | null) => void }) {
  const dias = useMemo(() => {
    const out: (ISODate | null)[] = Array.from({ length: (diaSemana(mes) + 6) % 7 }, () => null)
    for (let x = mes; x.slice(0, 7) === mes.slice(0, 7); x = masDias(x, 1)) out.push(x)
    return out
  }, [mes])
  return (
    <div className="apartar-mes">
      <h3>
        {mesLargo(mes)} <span>{mes.slice(0, 4)}</span>
      </h3>
      <div className="apartar-semana" aria-hidden="true">
        {SEMANA.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <div className="apartar-dias">
        {dias.map((iso, i) => {
          if (!iso) return <span key={`v${i}`} />
          const e = estado(iso)
          const fuera = iso < hoy || iso >= limite
          const puedeSalida = eligiendoSalida && iso > llegada! && libreEntre(llegada!, iso)
          const deshabilitado = !activo || fuera || (!puedeSalida && e !== 'libre')
          const extremo = iso === llegada || iso === hasta
          const enRango = !!llegada && !!hasta && iso > llegada && iso < hasta
          const texto = e === 'ocupada' ? 'ocupada' : e === 'tuya' ? 'ya la apartaste' : fuera ? 'no disponible' : 'libre'
          return (
            <button
              key={iso}
              type="button"
              disabled={deshabilitado}
              onClick={() => onTocar(iso)}
              onPointerEnter={() => onSobre(iso)}
              aria-pressed={extremo}
              aria-label={`${larga(iso)}, ${texto}`}
              data-estado={fuera ? 'fuera' : e}
              className={cx('apartar-dia', enRango && 'en-rango', extremo && 'es-extremo', iso === llegada && hasta && 'es-llegada', iso === hasta && llegada && 'es-salida', iso === hoy && 'es-hoy')}
            >
              <span>{dia(iso)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

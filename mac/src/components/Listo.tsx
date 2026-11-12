// «Para dejar todo listo»: una tarjeta en Hoy que revisa lo que falta conectar o configurar y manda directo a
// arreglarlo. Solo muestra lo que falta (las primeras tres cosas; el resto con «Ver todo») y desaparece cuando todo está bien.
import { useEffect, useState } from 'react'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { useApp } from '@/lib/store'
import { esNubeLocal } from '@/lib/nube'
import { abreAlIniciar, cambiarAbreAlIniciar, enMac, permisoAvisos } from '@/lib/mac'
import { clabeValida } from '@/lib/dinero'
import { plural } from '@/lib/fechas'
import { Button, toast } from './ui'

interface Pendiente {
  clave: string
  texto: string
  detalle?: string
  accion: string
  hacer: () => void | Promise<void>
}

export function ListoParaAbrir() {
  const d = useApp((s) => s.datos)!
  const avisos = useApp((s) => s.avisos)
  const ir = useApp((s) => s.ir)
  const editarCabana = useApp((s) => s.editarCabana)
  const [alIniciar, setAlIniciar] = useState<boolean | null>(null)
  const [todo, setTodo] = useState(false)

  useEffect(() => {
    void abreAlIniciar().then(setAlIniciar)
  }, [])

  const a = d.ajustes
  const admin = d.es_admin
  const publicadas = d.cabanas.filter((c) => c.publicada)
  const sinPrecio = publicadas.filter((c) => !c.precio_noche)
  const sinFotos = publicadas.filter((c) => !c.fotos.length)
  const clabe = (a.clabe ?? '').replace(/\D/g, '')
  const irAjustes = () => ir('ajustes')
  const irCabanas = (id?: string) => () => {
    ir('cabanas')
    if (id) editarCabana(id)
  }

  const pendientes: Pendiente[] = []
  let total = 0
  const revisar = (ok: boolean, p: Pendiente) => {
    total += 1
    if (!ok) pendientes.push(p)
  }

  // En esta Mac
  if (enMac) {
    revisar(avisos !== false, {
      clave: 'avisos',
      texto: 'Los avisos de macOS están apagados',
      detalle: 'Sin ellos no suena nada cuando llega una solicitud.',
      accion: 'Activar avisos',
      hacer: async () => {
        if (await permisoAvisos()) return void useApp.getState().revisarAvisos()
        void useApp.getState().revisarAvisos()
        toast.error('macOS no dejó activarlos desde aquí', 'Ve a Ajustes del Sistema → Notificaciones → La Joya y elige «Permitir notificaciones».')
      },
    })
    revisar(alIniciar !== false, {
      clave: 'alIniciar',
      texto: 'La app no se abre sola al prender la Mac',
      detalle: 'Si la Mac se reinicia y nadie la abre, no avisa de las solicitudes.',
      accion: 'Encender',
      hacer: async () => {
        await cambiarAbreAlIniciar(true)
        setAlIniciar(await abreAlIniciar())
      },
    })
  }
  if (esNubeLocal) {
    revisar(false, { clave: 'nube', texto: 'Esta copia usa la nube de prueba', detalle: 'No es la del rancho: lo que se haga aquí no llega a la página.', accion: 'Ver ajustes', hacer: irAjustes })
  }

  // Lo que configura el dueño
  if (admin) {
    revisar(publicadas.length > 0, { clave: 'publicadas', texto: 'Ningún hospedaje sale en la página', detalle: 'Publica al menos uno.', accion: 'Ir a Cabañas', hacer: irCabanas() })
    if (publicadas.length) {
      revisar(sinPrecio.length === 0, { clave: 'precios', texto: `${plural(sinPrecio.length, 'hospedaje publicado no tiene', 'hospedajes publicados no tienen')} precio`, detalle: sinPrecio.slice(0, 3).map((c) => c.nombre).join(', ') + (sinPrecio.length > 3 ? '…' : ''), accion: 'Ponerle precio', hacer: irCabanas(sinPrecio[0]?.id) })
      revisar(sinFotos.length === 0, { clave: 'fotos', texto: `${plural(sinFotos.length, 'hospedaje publicado no tiene', 'hospedajes publicados no tienen')} fotos`, detalle: sinFotos.slice(0, 3).map((c) => c.nombre).join(', ') + (sinFotos.length > 3 ? '…' : ''), accion: 'Subir fotos', hacer: irCabanas(sinFotos[0]?.id) })
    }
    revisar(!(a.anticipo_pct > 0) || clabeValida(clabe), { clave: 'clabe', texto: 'Falta la CLABE para el anticipo', detalle: clabe ? 'La que está escrita no cuadra: revisa los dígitos.' : 'El huésped la ve al mandar su solicitud.', accion: 'Ir a Ajustes', hacer: irAjustes })
    revisar(!!a.telefono_hospedaje, { clave: 'telefono', texto: 'Falta el WhatsApp de reservaciones', detalle: 'Es el que sale en la página.', accion: 'Ir a Ajustes', hacer: irAjustes })
    revisar(!!a.politicas && !!a.aviso_privacidad, { clave: 'textos', texto: 'Faltan las políticas o el aviso de privacidad', detalle: 'Sin los dos, la página no deja reservar.', accion: 'Ir a Ajustes', hacer: irAjustes })
    revisar(!!a.correo_avisos, { clave: 'correo', texto: 'Falta el correo para los avisos', detalle: 'Aquí llega cada solicitud nueva.', accion: 'Ir a Ajustes', hacer: irAjustes })
    revisar(d.avisos_sin_enviar === 0, { clave: 'correos', texto: `${plural(d.avisos_sin_enviar, 'aviso no se pudo mandar', 'avisos no se pudieron mandar')}`, detalle: 'Son correos (Resend) o WhatsApp (CallMeBot) que la nube no pudo mandar: revisa que estén configurados. Las solicitudes sí llegan aquí.', accion: 'Ver ajustes', hacer: irAjustes })
    // Encender la página va al final: solo tiene sentido cuando todo lo demás ya está
    revisar(a.reservas_web || pendientes.some((p) => ['publicadas', 'precios', 'fotos', 'clabe', 'telefono', 'textos'].includes(p.clave)), { clave: 'web', texto: 'La página todavía no recibe reservaciones', detalle: 'Ya está todo para encenderlas.', accion: 'Encender en Ajustes', hacer: irAjustes })
  }

  if (!pendientes.length) return null
  const hechos = total - pendientes.length
  const visibles = todo ? pendientes : pendientes.slice(0, 3)
  return (
    <section className="card mb-6 p-5" aria-label="Para dejar todo listo">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Para dejar todo listo</h2>
        <span className="text-[12.5px] text-ink-3 tabular">
          {hechos} de {total}
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full rounded-full bg-success transition-[width] duration-[var(--dur-4)]" style={{ width: `${(hechos / total) * 100}%` }} />
      </div>
      <ul className="mt-3 divide-y divide-line">
        {visibles.map((p) => (
          <li key={p.clave} className="flex items-center gap-3 py-3 first:pt-2 last:pb-0">
            <CircleAlert size={17} className="shrink-0 text-butter-ink" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{p.texto}</div>
              {p.detalle && <div className="text-[12.5px] text-ink-soft">{p.detalle}</div>}
            </div>
            <Button size="sm" variant="outline" iconRight={<ArrowRight size={14} />} onClick={() => void p.hacer()}>
              {p.accion}
            </Button>
          </li>
        ))}
      </ul>
      {pendientes.length > 3 && (
        <button onClick={() => setTodo((t) => !t)} className="mt-3 text-[13px] font-medium text-key underline-offset-2 hover:underline">
          {todo ? 'Ver menos' : `Ver los ${pendientes.length - 3} que faltan`}
        </button>
      )}
    </section>
  )
}

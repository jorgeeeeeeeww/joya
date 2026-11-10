// Panel de desarrollador: solo el dueño, con un PIN aparte. Aquí vive todo lo técnico que se quitó de Ajustes:
// estado de la sincronización, bitácora de errores explicada, reparaciones que no borran nada, respaldo y versión.
import { useMemo, useState } from 'react'
import { Bug, CloudDownload, CloudUpload, Download, Lock, RefreshCw, RotateCcw, Rocket, ShieldCheck, Trash2, Wifi } from 'lucide-react'
import { useStore } from '@/lib/store'
import { hashPin } from '@/lib/crypto'
import { pull, push, restartSync, uploadAll, useNetwork } from '@/lib/sync'
import { clearErrors, explain, readErrors } from '@/lib/errorLog'
import { applyUpdate, checkForUpdate } from '@/lib/pwa'
import { buildLabel, BUILD_ID, APP_VERSION } from '@/lib/version'
import { DeviceMonitor } from '@/components/owner/DeviceMonitor'
import { ago, fmt } from '@/lib/format'
import { Badge, Button, Card, CardHeader, Confirm, cx, Field, Input, PageHeader, toast } from '@/components/ui'
import { CloudCenter } from '@/components/CloudCenter'
import { Respaldos, Sistema } from '@/pages/Ajustes'

const DEV_SALT = 'desarrollador'

function Gate({ onOpen }: { onOpen: () => void }) {
  const devPinHash = useStore((s) => s.settings.devPinHash)
  const setSettings = useStore((s) => s.setSettings)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const first = !devPinHash
  const submit = () => {
    if (pin.length < 4) return toast.error('El PIN debe tener al menos 4 números')
    if (first) {
      if (pin !== pin2) return toast.error('Los PIN no coinciden')
      setSettings({ devPinHash: hashPin(DEV_SALT, pin) })
      toast.success('PIN de desarrollador creado')
      return onOpen()
    }
    if (hashPin(DEV_SALT, pin) !== devPinHash) return toast.error('PIN incorrecto')
    onOpen()
  }
  return (
    <Card className="mx-auto max-w-md p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sunken">
          <Lock size={19} strokeWidth={1.6} />
        </span>
        <div>
          <p className="heading text-xl">{first ? 'Crea tu PIN de desarrollador' : 'Panel de desarrollador'}</p>
          <p className="text-sm text-ink-soft">{first ? 'Es distinto al PIN de entrada. Solo tú lo sabrás.' : 'Escribe tu PIN de desarrollador.'}</p>
        </div>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="PIN">
          <Input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
        </Field>
        {first && (
          <Field label="Repite el PIN">
            <Input type="password" inputMode="numeric" autoComplete="off" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
        <Button type="submit">{first ? 'Crear y entrar' : 'Entrar'}</Button>
      </form>
    </Card>
  )
}

function Repair({ icon, title, body, action, onRun }: { icon: React.ReactNode; title: string; body: string; action: string; onRun: () => Promise<unknown> | void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-sunken/60 p-4 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink-soft">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-ink-soft">{body}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onRun()
            toast.success(title, 'Listo. No se borró nada.')
          } catch (e) {
            toast.error('No se pudo', (e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Trabajando…' : action}
      </Button>
    </div>
  )
}

function Panel() {
  const sync = useStore((s) => s.sync)
  const dirty = useStore((s) => Object.keys(s.dirty).length)
  const linked = useStore((s) => !!s.settings.supabaseUrl)
  const { online } = useNetwork()
  const [errors, setErrors] = useState(readErrors)
  const [confirmClear, setConfirmClear] = useState(false)
  const syncErrors = useMemo(() => sync.log.filter((l) => l.level !== 'info'), [sync.log])

  const downloadLog = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), userAgent: navigator.userAgent, sync: { ...sync, log: sync.log }, pending: dirty, errors }, null, 2)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    a.download = `la-joya-bitacora-${fmt(new Date(), 'yyyy-MM-dd-HHmm')}.json`
    a.click()
  }

  const checkUpdate = async () => {
    if (await checkForUpdate(true)) return applyUpdate()
    toast.info('Ya tienes la última versión', 'Si acabas de publicar, espera un minuto y vuelve a intentar.')
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Estado */}
      <Card>
        <CardHeader eyebrow="Ahora" title="Estado de la sincronización" subtitle="Cómo está este dispositivo con la nube" />
        <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 md:grid-cols-4 md:px-6">
          {[
            ['Internet', online ? 'Con conexión' : 'Sin conexión', online ? 'sage' : 'rose'],
            ['Nube', linked ? (sync.status === 'error' ? 'Con error' : sync.status === 'syncing' ? 'Sincronizando' : 'Conectada') : 'Solo este equipo', linked && sync.status !== 'error' ? 'sage' : 'butter'],
            ['Cambios por subir', String(dirty), dirty ? 'butter' : 'sage'],
            ['Rechazados por la nube', String(sync.rejected.length), sync.rejected.length ? 'rose' : 'sage'],
          ].map(([l, v, tone]) => (
            <div key={l} className="rounded-[16px] bg-sunken/60 p-3.5">
              <div className="text-xs text-detail">{l}</div>
              <div className="mt-1 flex items-center gap-1.5 font-medium">
                <Badge tone={tone as 'sage'} dot>
                  {v}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        <p className="px-6 pb-5 text-xs text-detail">
          Versión {APP_VERSION} · {buildLabel(BUILD_ID)} · Última vez sincronizado: {sync.lastSyncAt ? ago(sync.lastSyncAt) : 'nunca'} · Subidos {sync.pushed} · Bajados {sync.pulled} · Combinados {sync.merged}
          {sync.error ? ` · Último error: ${sync.error}` : ''}
        </p>
      </Card>

      {/* Monitor central: todos los dispositivos */}
      {linked && <DeviceMonitor />}

      {/* Reparar */}
      <Card>
        <CardHeader eyebrow="Reparar" title="Arreglar sin borrar nada" subtitle="Cada botón es seguro: si dos dispositivos cambiaron lo mismo, gana el cambio más reciente campo por campo." />
        <div className="flex flex-col gap-2.5 px-5 pb-5 md:px-6">
          <Repair icon={<CloudUpload size={18} strokeWidth={1.6} />} title="Reintentar envíos pendientes" body={`Sube ya los ${dirty} cambios que esperan internet.`} action="Reintentar" onRun={() => push()} />
          <Repair icon={<CloudDownload size={18} strokeWidth={1.6} />} title="Bajar de nuevo los cambios de la nube" body="Vuelve a traer todo lo de la nube y lo combina con lo de aquí." action="Bajar todo" onRun={() => pull(true)} />
          <Repair icon={<ShieldCheck size={18} strokeWidth={1.6} />} title="Subir todo lo de este dispositivo" body="Por si la nube no tiene algo: manda todos los registros de aquí; lo repetido se combina." action="Subir todo" onRun={() => uploadAll()} />
          <Repair icon={<Wifi size={18} strokeWidth={1.6} />} title="Reiniciar la conexión en vivo" body="Si los cambios de otros dispositivos no llegan solos." action="Reiniciar" onRun={() => restartSync()} />
          <Repair icon={<Rocket size={18} strokeWidth={1.6} />} title="Buscar versión nueva" body="Toma la última versión publicada en Cloudflare. Los datos se quedan igual." action="Buscar" onRun={checkUpdate} />
        </div>
      </Card>

      {/* Errores */}
      <Card>
        <CardHeader
          eyebrow="Bitácora"
          title="Qué falló y por qué"
          subtitle="Errores de este dispositivo y de la sincronización, explicados"
          action={
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" icon={<RefreshCw size={15} strokeWidth={1.6} />} onClick={() => setErrors(readErrors())}>
                Actualizar
              </Button>
              <Button variant="ghost" size="sm" icon={<Download size={15} strokeWidth={1.6} />} onClick={downloadLog}>
                Descargar
              </Button>
              <Button variant="ghost" size="sm" icon={<Trash2 size={15} strokeWidth={1.6} />} onClick={() => setConfirmClear(true)} disabled={!errors.length}>
                Limpiar
              </Button>
            </div>
          }
        />
        {errors.length === 0 && syncErrors.length === 0 && sync.rejected.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-ink-soft">Sin errores registrados. Todo bien.</p>
        ) : (
          <ul className="flex flex-col gap-2 px-5 pb-5 md:px-6">
            {sync.rejected.map((r) => (
              <li key={r} className="rounded-[14px] bg-[color-mix(in_oklab,var(--danger)_8%,var(--surface))] p-3 text-sm">
                <p className="font-medium">La nube rechazó un registro: {r}</p>
                <p className="text-ink-soft">{explain('permission denied')}</p>
              </li>
            ))}
            {[...syncErrors.map((l) => ({ at: l.at, source: 'sync', message: l.msg, page: '' })), ...errors].slice(0, 60).map((e, i) => (
              <li key={i} className="rounded-[14px] bg-sunken/60 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-detail">
                  <Badge tone={e.source === 'sync' ? 'sky' : 'rose'}>{e.source === 'sync' ? 'Sincronización' : e.source === 'promesa' ? 'Proceso' : 'Pantalla'}</Badge>
                  {fmt(e.at, "d MMM · HH:mm")}
                  {e.page && <span className="text-ink-3">{e.page}</span>}
                </div>
                <p className="mt-1 font-medium break-words">{e.message}</p>
                <p className="text-ink-soft">{explain(e.message)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Publicar */}
      <Card className="p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken">
            <Bug size={18} strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <p className="font-medium">Publicar un arreglo en Cloudflare</p>
            <p className="mt-1 text-sm text-ink-soft">
              Al subir el código a main en GitHub se publica solo (pruebas, Supabase y Cloudflare). Cada dispositivo toma la versión nueva al abrir la app o al volver a ella, y conserva todos los datos. A mano, desde la computadora:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-[12px] bg-sunken p-3 text-xs">npm run build{'\n'}npx wrangler deploy</pre>
          </div>
        </div>
      </Card>

      {/* Respaldo y lo técnico de la nube */}
      <Respaldos />
      <CloudCenter />
      <Sistema />

      <Confirm open={confirmClear} onClose={() => setConfirmClear(false)} title="¿Limpiar la bitácora?" body="Solo borra la lista de errores de este dispositivo. Los datos del rancho no se tocan." confirmLabel="Limpiar" onConfirm={() => (clearErrors(), setErrors([]))} />
    </div>
  )
}

export default function Desarrollador() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <PageHeader eyebrow="Solo para el dueño" title="Panel de desarrollador" subtitle="Sincronización, errores, reparaciones y versión de la app." />
      {open ? <Panel /> : <Gate onOpen={() => setOpen(true)} />}
      {open && (
        <div className="mt-6 flex justify-center">
          <Button variant="ghost" size="sm" icon={<RotateCcw size={15} strokeWidth={1.6} />} onClick={() => setOpen(false)} className={cx('text-ink-soft')}>
            Cerrar el panel
          </Button>
        </div>
      )}
    </div>
  )
}

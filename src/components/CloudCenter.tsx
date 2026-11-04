// Centro de la nube: estado en vivo, diagnóstico, asistente de conexión, QR para vincular
// dispositivos, notificaciones push, actividad de sincronización y almacenamiento.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Activity,
  BellRing,
  Check,
  CircleAlert,
  Cloud,
  CloudOff,
  Copy,
  Download,
  GitMerge,
  HardDrive,
  Link2,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  ShieldCheck,
  Timer,
  Upload,
  Users,
  Wifi,
} from 'lucide-react'
import QRCode from 'qrcode'
import { useMe, useStore } from '@/lib/store'
import {
  buildLinkUrl,
  connectCloud,
  diagnose,
  disconnectCloud,
  pendingLink,
  pull,
  push,
  testConnection,
  uploadAll,
  useNetwork,
  usePresence,
  type CheckResult,
} from '@/lib/sync'
import { disablePush, enablePush, pushStatus, pushSupported, storageInfo, usePwa } from '@/lib/pwa'
import { ago, fmt } from '@/lib/format'
import { ease, fadeRise, stagger } from '@/lib/motion'
import { Badge, Button, Card, CardHeader, Confirm, cx, Field, IconBubble, Input, ProgressBar, Toggle, toast } from './ui'
import { LightDots, Sparkle } from './step1'

function Metric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <motion.div variants={fadeRise} className="rounded-[var(--r-md)] bg-sunken p-4">
      <div className="flex items-center gap-2 text-xs text-detail">
        {icon}
        {label}
      </div>
      <div className="display-num mt-2 text-[1.75rem]">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </motion.div>
  )
}

function CheckList({ checks, running }: { checks: CheckResult[]; running?: boolean }) {
  return (
    <ul className="flex flex-col">
      {checks.map((c, i) => (
        <motion.li key={c.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.42, ease: ease.calma } }} className="flex items-start gap-3 border-b border-line py-3 last:border-0">
          <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', c.ok === true ? 'bg-[color-mix(in_oklab,var(--success)_15%,var(--surface))] text-success' : c.ok === false ? 'bg-[color-mix(in_oklab,var(--danger)_13%,var(--surface))] text-danger' : 'bg-sunken text-ink-3')}>
            {c.ok === true ? <Check size={14} strokeWidth={2} /> : c.ok === false ? <CircleAlert size={14} strokeWidth={1.8} /> : <LightDots />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{c.label}</span>
            {c.detail && <span className="block text-sm text-ink-soft">{c.detail}</span>}
          </span>
        </motion.li>
      ))}
      {running && (
        <li className="flex items-center gap-3 py-3 text-sm text-ink-soft">
          <LightDots className="text-chispa-soft" /> Revisando…
        </li>
      )}
    </ul>
  )
}

// ── Asistente de conexión en 3 pasos ─────────────────────
export function ConnectWizard({ onDone }: { onDone: () => void }) {
  const settings = useStore((s) => s.settings)
  const link = pendingLink()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [url, setUrl] = useState(link?.u ?? settings.supabaseUrl ?? '')
  const [key, setKey] = useState(link?.k ?? settings.supabaseAnonKey ?? '')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const allOk = checks.length > 0 && checks.every((c) => c.ok)

  return (
    <div>
      <ol className="mb-6 flex items-center gap-2" aria-label="Pasos">
        {['Servidor', 'Prueba', 'Cuenta'].map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const done = step > n
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-colors', done ? 'bg-success text-paper' : step === n ? 'bg-ink text-paper' : 'bg-sunken text-ink-3')}>{done ? <Check size={15} /> : n}</span>
              <span className={cx('text-sm', step === n ? 'text-ink' : 'text-ink-3')}>{label}</span>
              {i < 2 && <span className="h-px flex-1 bg-line-strong" />}
            </li>
          )
        })}
      </ol>
      {link && step === 1 && (
        <div className="mb-4 flex items-center gap-2 rounded-[var(--r-md)] bg-[color-mix(in_oklab,var(--luz)_40%,var(--surface))] px-4 py-3 text-sm">
          <Sparkle className="text-chispa-soft" /> Datos del servidor tomados del código QR. Solo falta tu cuenta.
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.32, ease: ease.calma } }} exit={{ opacity: 0, x: -10, transition: { duration: 0.16 } }}>
          {step === 1 && (
            <div className="grid gap-4">
              <Field label="URL del proyecto" hint="Supabase → Project Settings → API. En red local: la dirección de la iMac.">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tu-proyecto.supabase.co" inputMode="url" autoCapitalize="off" />
              </Field>
              <Field label="Llave pública (anon key)" hint="Es pública; la seguridad la dan las reglas por rol de la base de datos.">
                <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" autoCapitalize="off" />
              </Field>
              <div className="flex justify-end">
                <Button
                  disabled={!url || !key}
                  loading={busy}
                  icon={<Wifi size={18} strokeWidth={1.6} />}
                  onClick={async () => {
                    setBusy(true)
                    setStep(2)
                    const r = await testConnection(url, key)
                    setChecks(r.checks)
                    setBusy(false)
                  }}
                >
                  Probar conexión
                </Button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <CheckList checks={checks} running={busy} />
              <div className="mt-5 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button disabled={busy || !checks.length || checks.some((c) => c.ok === false && c.key === 'server')} onClick={() => setStep(3)}>
                  {allOk ? 'Continuar' : 'Continuar de todos modos'}
                </Button>
              </div>
            </div>
          )}
          {step === 3 && (
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault()
                setBusy(true)
                setErr(undefined)
                try {
                  const p = await connectCloud(url, key, email, pass)
                  setPass('')
                  sessionStorage.removeItem('lajoya:pendingLink')
                  toast.success('Dispositivo vinculado', `Rol en la nube: ${p.role}`)
                  onDone()
                } catch (e: any) {
                  setErr(e.message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Field label="Correo de la cuenta">
                <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Contraseña" error={err}>
                <Input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required aria-invalid={!!err} />
              </Field>
              <div className="flex justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                  Atrás
                </Button>
                <Button type="submit" variant="tinta" loading={busy} icon={<Cloud size={18} strokeWidth={1.6} />}>
                  Vincular este dispositivo
                </Button>
              </div>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── QR para vincular otro dispositivo ────────────────────
export function LinkDevice() {
  const [svg, setSvg] = useState<string>('')
  const url = buildLinkUrl()
  useEffect(() => {
    if (!url) return
    // El QR siempre va oscuro sobre la luz crema: legible para la cámara en claro y en oscuro (color raw)
    void QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2B1A1E', light: '#00000000' } }).then(setSvg)
  }, [url])
  if (!url) return null
  return (
    <div className="grid items-center gap-6 md:grid-cols-[200px_1fr]">
      <div className="mx-auto w-[200px] rounded-[var(--r-lg)] bg-luz p-4 shadow-[var(--glow)]">
        <div className="aspect-square [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Código QR para vincular" role="img" />
      </div>
      <div>
        <ol className="flex flex-col gap-2 text-sm text-ink-soft">
          <li>
            <span className="text-ink">1.</span> En el celular nuevo, abre la cámara y apunta al código.
          </li>
          <li>
            <span className="text-ink">2.</span> Se abre La Joya con el servidor ya escrito.
          </li>
          <li>
            <span className="text-ink">3.</span> Entra con la cuenta de esa persona y listo.
          </li>
        </ol>
        <p className="mt-3 text-xs text-ink-3">El código no incluye contraseñas: solo la dirección del servidor y su llave pública.</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          icon={<Copy size={16} strokeWidth={1.6} />}
          onClick={() => {
            void navigator.clipboard?.writeText(url)
            toast.success('Enlace copiado', 'Envíalo por WhatsApp a la persona del equipo')
          }}
        >
          Copiar enlace
        </Button>
      </div>
    </div>
  )
}

// ── Notificaciones push ──────────────────────────────────
function PushCard() {
  const me = useMe()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const installed = usePwa((s) => s.installed)
  const [status, setStatus] = useState<'unsupported' | 'denied' | 'on' | 'off' | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [vapid, setVapid] = useState(settings.vapidPublicKey ?? '')
  useEffect(() => {
    void pushStatus().then(setStatus)
  }, [])
  return (
    <div className="flex flex-col gap-4">
      {status === 'unsupported' ? (
        <p className="text-sm text-ink-soft">{pushSupported() ? '' : 'Este navegador no admite notificaciones. En iPhone, instala primero la app en la pantalla de inicio (iOS 16.4 o posterior).'}</p>
      ) : (
        <Toggle
          checked={status === 'on'}
          label="Avisos en este dispositivo"
          description={status === 'denied' ? 'Bloqueaste los avisos; actívalos en los ajustes del navegador.' : 'Llegan aunque la app esté cerrada: nuevas limpiezas, pagos, eventos confirmados.'}
          onChange={async (v) => {
            setBusy(true)
            try {
              if (v) toast.success(await enablePush())
              else await disablePush()
              setStatus(await pushStatus())
            } catch (e: any) {
              toast.error('No se pudo cambiar', e.message)
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
      {busy && <LightDots className="text-chispa-soft" />}
      {!installed && <p className="text-xs text-ink-3">Consejo: instala la app para recibir avisos con el ícono en la pantalla de inicio.</p>}
      {me?.role === 'admin' && (
        <Field label="Llave pública VAPID" hint="Se genera una vez con: npx web-push generate-vapid-keys (ver docs/PUESTA-EN-MARCHA.md)">
          <div className="flex gap-2">
            <Input value={vapid} onChange={(e) => setVapid(e.target.value)} placeholder="BPx…" autoCapitalize="off" />
            <Button variant="secondary" onClick={() => (setSettings({ vapidPublicKey: vapid.trim() || undefined }), toast.success('Llave guardada'))}>
              Guardar
            </Button>
          </div>
        </Field>
      )}
    </div>
  )
}

// ── Componente principal ─────────────────────────────────
export function CloudCenter() {
  const me = useMe()
  const settings = useStore((s) => s.settings)
  const sync = useStore((s) => s.sync)
  const pending = useStore((s) => Object.keys(s.dirty).length)
  const presence = usePresence((s) => s.users)
  const { online, type } = useNetwork()
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [diagBusy, setDiagBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [wizard, setWizard] = useState(!settings.supabaseUrl || !!pendingLink())
  const [confirmOff, setConfirmOff] = useState(false)
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean }>()
  const connected = !!settings.supabaseUrl
  const admin = me?.role === 'admin'

  useEffect(() => {
    void storageInfo().then(setStorage)
  }, [])

  const state = !online ? 'offline' : !connected ? 'local' : sync.status === 'error' ? 'error' : 'ok'
  const hero = {
    ok: { title: 'Conectado a la nube', body: sync.realtime === 'live' ? 'Los cambios llegan a todo el equipo al instante.' : 'Conectando al tiempo real…', icon: ShieldCheck, tone: 'text-success' },
    local: { title: 'Solo en este equipo', body: 'Todo se guarda aquí. Conecta la nube para compartirlo con el equipo.', icon: CloudOff, tone: 'text-ink-soft' },
    offline: { title: 'Sin conexión', body: 'Puedes seguir trabajando: los cambios se suben solos al volver la señal.', icon: CloudOff, tone: 'text-chispa' },
    error: { title: 'Hay que revisar la conexión', body: sync.error ?? 'Ocurrió un error al sincronizar.', icon: CircleAlert, tone: 'text-danger' },
  }[state]
  const HeroIcon = hero.icon
  const usagePct = storage && storage.quota ? storage.usage / storage.quota : 0
  const retryIn = sync.nextRetryAt ? Math.max(0, Math.round((sync.nextRetryAt - Date.now()) / 1000)) : null
  const linkUrl = useMemo(() => (connected ? buildLinkUrl() : null), [connected])

  return (
    <div className="flex flex-col gap-5">
      {/* Estado en vivo */}
      <Card className="overflow-hidden">
        <div className="relative p-6 md:p-7">
          <div className="flex flex-wrap items-start gap-4">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_50%,var(--surface))] ring-[6px] ring-[color-mix(in_oklab,var(--luz)_20%,transparent)]">
              <HeroIcon size={24} strokeWidth={1.6} className={hero.tone} />
              {state === 'ok' && sync.realtime === 'live' && <span className="pulse-dot absolute top-0 right-0 h-3 w-3 rounded-full bg-success text-success ring-2 ring-surface" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Sincronización</p>
              <h3 className="heading mt-1 text-[1.75rem]">{hero.title}</h3>
              <p className="mt-1 max-w-[52ch] text-sm text-ink-soft">{hero.body}</p>
              {retryIn !== null && state === 'error' && <p className="mt-2 text-xs text-ink-3">Reintento automático en {retryIn} s</p>}
            </div>
            {connected && (
              <Button
                variant="tinta"
                loading={syncBusy}
                icon={<RefreshCw size={17} strokeWidth={1.6} />}
                onClick={async () => {
                  setSyncBusy(true)
                  await pull()
                  await push()
                  setSyncBusy(false)
                  toast.success('Todo al día')
                }}
              >
                Sincronizar ahora
              </Button>
            )}
          </div>

          <motion.div variants={stagger} initial="hidden" animate="show" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={<Timer size={14} strokeWidth={1.6} />} label="Latencia" value={sync.latencyMs != null ? `${sync.latencyMs} ms` : '—'} hint={type ? `Red ${type.toUpperCase()}` : online ? 'En línea' : 'Sin red'} />
            <Metric icon={<Upload size={14} strokeWidth={1.6} />} label={connected ? 'Por subir' : 'Guardados aquí'} value={pending} hint={!connected ? 'Se suben al conectar la nube' : sync.lastPushAt ? `Último envío ${ago(sync.lastPushAt)}` : 'Aún sin envíos'} />
            <Metric icon={<Radio size={14} strokeWidth={1.6} />} label="Tiempo real" value={sync.realtime === 'live' ? 'En vivo' : sync.realtime === 'connecting' ? '…' : 'Apagado'} hint={sync.lastPullAt ? `Último cambio recibido ${ago(sync.lastPullAt)}` : '—'} />
            <Metric icon={<Users size={14} strokeWidth={1.6} />} label="Conectados" value={presence.length} hint={presence.length ? presence.map((p) => p.name.split(' ')[0]).slice(0, 3).join(', ') : 'Nadie más por ahora'} />
          </motion.div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge tone="sky">
              <GitMerge size={12} strokeWidth={1.8} /> {sync.merged} ediciones combinadas sin pérdida
            </Badge>
            <Badge tone="sage">
              <Upload size={12} strokeWidth={1.8} /> {sync.pushed} enviados
            </Badge>
            <Badge tone="lavender">
              <Download size={12} strokeWidth={1.8} /> {sync.pulled} recibidos
            </Badge>
            <Badge tone={sync.leader ? 'butter' : 'mint'}>
              <MonitorSmartphone size={12} strokeWidth={1.8} /> {sync.leader ? 'Esta pestaña sincroniza' : 'Otra pestaña sincroniza'}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Asistente / vinculación */}
      {(wizard || !connected) && admin !== undefined && (
        <Card>
          <CardHeader eyebrow="Conexión" title={connected ? 'Vincular con otra cuenta' : 'Conectar a la nube'} subtitle="Se hace una vez por dispositivo. Los datos viajan cifrados y cada rol solo ve lo que le toca." icon={<IconBubble tone="sky"><Cloud size={20} strokeWidth={1.6} /></IconBubble>} />
          <div className="p-6 pt-5 md:p-7 md:pt-5">
            <ConnectWizard onDone={() => setWizard(false)} />
          </div>
        </Card>
      )}

      {connected && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader eyebrow="Salud" title="Diagnóstico" subtitle="Revisa cada pieza de la conexión" icon={<IconBubble tone="mint"><Activity size={20} strokeWidth={1.6} /></IconBubble>} />
            <div className="p-6 pt-4">
              {checks.length > 0 ? <CheckList checks={checks} running={diagBusy} /> : <p className="text-sm text-ink-soft">Ejecuta el diagnóstico para verificar servidor, rol, seguridad, fotos y tiempo real.</p>}
              <Button
                className="mt-4"
                variant="outline"
                loading={diagBusy}
                onClick={async () => {
                  setDiagBusy(true)
                  setChecks(await diagnose())
                  setDiagBusy(false)
                }}
              >
                Ejecutar diagnóstico
              </Button>
            </div>
          </Card>
          <Card>
            <CardHeader eyebrow="Equipo" title="Vincular otro dispositivo" subtitle="Con el código QR, sin escribir nada" icon={<IconBubble tone="rose"><Link2 size={20} strokeWidth={1.6} /></IconBubble>} />
            <div className="p-6 pt-4">{linkUrl ? <LinkDevice /> : null}</div>
          </Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Avisos" title="Notificaciones push" icon={<IconBubble tone="butter"><BellRing size={20} strokeWidth={1.6} /></IconBubble>} />
          <div className="p-6 pt-4">
            <PushCard />
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="Dispositivo" title="Almacenamiento" subtitle="Lo que guarda la app aquí para funcionar sin internet" icon={<IconBubble tone="lavender"><HardDrive size={20} strokeWidth={1.6} /></IconBubble>} />
          <div className="p-6 pt-4">
            {storage ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="display-num text-3xl">{(storage.usage / 1024 / 1024).toFixed(1)} MB</span>
                  <span className="text-sm text-ink-soft">de {(storage.quota / 1024 / 1024 / 1024).toFixed(1)} GB disponibles</span>
                </div>
                <ProgressBar value={Math.max(0.01, usagePct)} className="mt-3" />
                <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                  {storage.persisted ? <Check size={15} className="text-success" /> : <CircleAlert size={15} className="text-warning" />}
                  {storage.persisted ? 'Protegido: el navegador no borrará estos datos' : 'El navegador podría liberar espacio; instala la app para protegerlo'}
                </p>
              </>
            ) : (
              <div className="skeleton h-16 rounded-[var(--r-md)]" />
            )}
          </div>
        </Card>
      </div>

      {/* Actividad */}
      {connected && (
        <Card>
          <CardHeader eyebrow="Registro" title="Actividad de sincronización" subtitle="Lo último que pasó entre este dispositivo y la nube" />
          <div className="p-6 pt-3">
            {sync.log.length === 0 ? (
              <p className="text-sm text-ink-soft">Sin actividad todavía.</p>
            ) : (
              <ul className="flex flex-col">
                {sync.log.slice(0, 12).map((l, i) => (
                  <li key={i} className="flex items-center gap-3 border-b border-line py-2.5 text-sm last:border-0">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', l.level === 'error' ? 'bg-danger' : l.level === 'warn' ? 'bg-warning' : 'bg-success')} />
                    <span className="flex-1">{l.msg}</span>
                    <span className="tabular text-xs text-ink-3">{fmt(l.at, 'HH:mm:ss')}</span>
                  </li>
                ))}
              </ul>
            )}
            {sync.rejected.length > 0 && <p className="mt-3 text-xs text-ink-3">{sync.rejected.length} cambios no se subieron porque tu rol no tiene permiso; se conservan en este dispositivo.</p>}
            {admin && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" icon={<Upload size={16} strokeWidth={1.6} />} onClick={() => uploadAll().then(() => toast.success('Todo se subió a la nube'))}>
                  Subir todo
                </Button>
                <Button variant="outline" size="sm" icon={<Download size={16} strokeWidth={1.6} />} onClick={() => pull(true).then(() => toast.success('Datos descargados de nuevo'))}>
                  Descargar todo
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setWizard(true)}>
                  Cambiar cuenta
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmOff(true)}>
                  Desvincular
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <IconBubble tone="sky">
            <MonitorSmartphone size={20} strokeWidth={1.6} />
          </IconBubble>
          <div>
            <p className="heading text-xl">Del rancho a la red local</p>
            <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
              Cuando la iMac esté en la oficina del rancho se instala ahí el mismo servidor (Supabase es de código abierto) y en el paso “Servidor” solo cambia la dirección. Los datos se pasan con <b>Subir todo</b>, sin reprogramar nada. Guía: <code className="rounded bg-sunken px-1">docs/RED-LOCAL.md</code>.
            </p>
          </div>
        </div>
      </Card>

      <Confirm open={confirmOff} onClose={() => setConfirmOff(false)} danger title="¿Desvincular este dispositivo?" body="Dejará de sincronizar. Los datos que ya están aquí se conservan." confirmLabel="Desvincular" onConfirm={() => disconnectCloud().then(() => toast.info('Dispositivo desvinculado'))} />
    </div>
  )
}

export default CloudCenter

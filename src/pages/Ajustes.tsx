import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ArrowUpRight,
  Building2,
  Check,
  Cloud,
  Download,
  FileClock,
  HardDrive,
  History,
  Lock,
  MonitorSmartphone,
  Palette,
  RotateCcw,
  Share,
  ShieldCheck,
  Smartphone,
  Upload,
  Wand2,
  Workflow,
} from 'lucide-react'
import { listSnapshots, resetDemo, restoreSnapshot, snapshotNow, useCollection, useMe, useStore } from '@/lib/store'
import { AUTOMATION_RULES } from '@/lib/automations'
import { canEncrypt, decryptText, encryptText } from '@/lib/crypto'
import { ago, fmt, fmtDateFull, nowIso } from '@/lib/format'
import { TONE } from '@/lib/meta'
import { fadeRise, spring, stagger } from '@/lib/motion'
import type { Atmos, AutomationSettings, DataState, Pastel, ThemePref } from '@/lib/types'
import { Badge, Button, Card, CardHeader, Confirm, cx, Estela, Field, IconBubble, Input, PageHeader, Segmented, Select, Toggle, toast } from '@/components/ui'
import { Horizon, PAPER_TONES, Sparkle } from '@/components/step1'
import { CloudCenter } from '@/components/CloudCenter'

type Tab = 'panel' | 'general' | 'automatizaciones' | 'nube' | 'respaldos' | 'bitacora' | 'instalar' | 'sistema'

// 5 pestañas: lo personal, el rancho, las reglas automáticas, la nube con respaldos y la actividad.
// "Cómo funciona" y la vitrina de diseño solo aparecen con el modo técnico.
const TABS: { value: Tab; label: string; icon: typeof Palette; admin?: boolean; tech?: boolean }[] = [
  { value: 'panel', label: 'Tu panel', icon: Palette },
  { value: 'general', label: 'Rancho', icon: Building2, admin: true },
  { value: 'automatizaciones', label: 'Automatizaciones', icon: Wand2, admin: true },
  { value: 'nube', label: 'Nube y respaldos', icon: Cloud, admin: true },
  { value: 'bitacora', label: 'Actividad', icon: FileClock, admin: true },
  { value: 'sistema', label: 'Cómo funciona', icon: Workflow, tech: true },
]
/** Pestañas que se unieron con otra (los enlaces viejos siguen funcionando) */
const MERGED: Partial<Record<Tab, Tab>> = { respaldos: 'nube', instalar: 'panel' }

const ATMOS: { value: Atmos; label: string; description: string; horizon: 'nubes' | 'olas' | 'colinas' }[] = [
  { value: 'flor', label: 'Flor', description: 'Rosa polvo, terracota y oliva. La de Jardines La Joya.', horizon: 'nubes' },
  { value: 'marea', label: 'Marea', description: 'Ocre, arena y verde azulado, como veleros al atardecer.', horizon: 'olas' },
  { value: 'crepusculo', label: 'Crepúsculo', description: 'Índigo, lavanda y una luz crema.', horizon: 'colinas' },
  { value: 'nocturno', label: 'Nocturno', description: 'Pizarra y azul noche bajo la luna.', horizon: 'colinas' },
]

function Section({ title, subtitle, children, icon, eyebrow, action }: { title: string; subtitle?: string; children: ReactNode; icon?: ReactNode; eyebrow?: string; action?: ReactNode }) {
  return (
    <motion.div variants={fadeRise}>
      <Card className="mb-5">
        <CardHeader title={title} subtitle={subtitle} icon={icon} eyebrow={eyebrow} action={action} />
        <div className="p-5 md:p-6">{children}</div>
      </Card>
    </motion.div>
  )
}

function Wrap({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {children}
    </motion.div>
  )
}

/** Vista previa real de una atmósfera: el div usa data-atmos y se pinta con los tokens */
function AtmosPreview({ a, active, onPick }: { a: (typeof ATMOS)[number]; active: boolean; onPick: () => void }) {
  return (
    <button
      data-atmos={a.value}
      role="radio"
      aria-checked={active}
      onClick={onPick}
      className={cx(
        'group relative overflow-hidden rounded-[var(--r-lg)] bg-paper text-left text-ink transition-[box-shadow,transform] duration-[var(--dur-3)] ease-[var(--ease-calma)] hover:-translate-y-[3px]',
        active ? 'shadow-[0_0_0_1.5px_var(--primary),0_0_0_5px_color-mix(in_oklab,var(--primary)_14%,transparent),var(--shadow-2)]' : 'shadow-[var(--shadow-1)] ring-1 ring-line hover:shadow-[var(--shadow-2)]',
      )}
    >
      <div className="bg-cielo relative h-24 overflow-hidden">
        <span aria-hidden className="absolute top-4 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full bg-luz shadow-[0_0_24px_4px_color-mix(in_oklab,var(--luz)_55%,transparent)]" />
        <Horizon variante={a.horizon} tonos={PAPER_TONES} className="absolute inset-x-0 bottom-[-1px] h-[60%]" />
      </div>
      <div className="px-4 pt-1 pb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="heading text-[1.35rem]">{a.label}</span>
          {active && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-on-primary">
              <Check size={14} strokeWidth={2} />
            </span>
          )}
        </div>
        <p className="mt-1 min-h-[2.6em] text-xs leading-snug text-ink-soft">{a.description}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-xs text-on-primary">Botón</span>
          <span className="h-3 w-3 rounded-full bg-chispa" />
          <span className="h-3 w-3 rounded-full bg-matiz" />
          <span className="h-3 w-3 rounded-full bg-night" />
        </div>
      </div>
    </button>
  )
}

// ── Tu panel (todas las personas) ────────────────────────
function TuPanel() {
  const me = useMe()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  if (!me) return null
  const prefs = settings.userPrefs?.[me.id] ?? {}
  const atmos = prefs.atmos ?? settings.atmos
  const theme = prefs.theme ?? settings.theme
  const save = (p: { atmos?: Atmos; theme?: ThemePref }) => setSettings({ userPrefs: { ...settings.userPrefs, [me.id]: { ...prefs, ...p } } })
  const custom = !!(prefs.atmos || prefs.theme)
  return (
    <Wrap>
      <Section
        eyebrow="Tu panel"
        title="Tu atmósfera"
        subtitle="Cada persona elige cómo se ve su panel en este dispositivo. No cambia lo que ven los demás."
        icon={
          <IconBubble tone="rose" orb>
            <Palette size={18} strokeWidth={1.6} />
          </IconBubble>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Atmósfera">
          {ATMOS.map((a) => (
            <AtmosPreview
              key={a.value}
              a={a}
              active={atmos === a.value}
              onPick={() => {
                save({ atmos: a.value })
                toast.success(`Atmósfera ${a.label}`, 'Tu panel ya se ve así.')
              }}
            />
          ))}
        </div>
        <Estela className="my-6" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Tema</p>
            <p className="text-sm text-ink-soft">Automático sigue al teléfono o a la computadora.</p>
          </div>
          <Segmented
            value={theme}
            onChange={(v) => save({ theme: v })}
            options={[
              { value: 'auto', label: 'Automático' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
            ]}
          />
        </div>
        {custom && (
          <Button variant="ghost" size="sm" className="mt-5" icon={<RotateCcw size={16} strokeWidth={1.6} />} onClick={() => setSettings({ userPrefs: { ...settings.userPrefs, [me.id]: {} } })}>
            Usar la del rancho
          </Button>
        )}
      </Section>
      <Section title="Sistema de diseño" subtitle="Todos los componentes, colores y estados de la app en un solo lugar.">
        <Link to="/diseno" className="pressable inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] ring-1 ring-line-strong ring-inset hover:bg-wash">
          Abrir la vitrina step1 <ArrowUpRight size={16} strokeWidth={1.6} />
        </Link>
      </Section>
    </Wrap>
  )
}

// ── Rancho (admin) ───────────────────────────────────────
function General() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  return (
    <Wrap>
      <Section
        eyebrow="Rancho"
        title="Datos del rancho"
        icon={
          <IconBubble tone="sage">
            <Building2 size={18} strokeWidth={1.6} />
          </IconBubble>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre">
            <Input value={settings.ranchName} onChange={(e) => setSettings({ ranchName: e.target.value })} />
          </Field>
          <Field label="Teléfono / WhatsApp">
            <Input value={settings.phone} onChange={(e) => setSettings({ phone: e.target.value })} placeholder="10 dígitos" inputMode="tel" />
          </Field>
          <Field label="Dirección" className="md:col-span-2">
            <Input value={settings.address} onChange={(e) => setSettings({ address: e.target.value })} />
          </Field>
          <Field label="Hora de entrada (check-in)">
            <Input type="time" value={settings.checkInTime} onChange={(e) => setSettings({ checkInTime: e.target.value })} />
          </Field>
          <Field label="Hora de salida (check-out)">
            <Input type="time" value={settings.checkOutTime} onChange={(e) => setSettings({ checkOutTime: e.target.value })} />
          </Field>
          <Field label="Anticipo para apartar (%)">
            <Input type="number" inputMode="numeric" value={settings.depositPercent} onChange={(e) => setSettings({ depositPercent: Number(e.target.value) })} />
          </Field>
          <Field label="IVA (%)">
            <Input type="number" inputMode="numeric" value={settings.ivaPercent} onChange={(e) => setSettings({ ivaPercent: Number(e.target.value) })} />
          </Field>
        </div>
      </Section>
      <Section title="Atmósfera del rancho" subtitle="La que ve todo el equipo, salvo quien elija la suya en Tu panel.">
        <Select value={settings.atmos} onChange={(e) => setSettings({ atmos: e.target.value as Atmos })} className="md:max-w-sm">
          {ATMOS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </Section>
      <Section
        title="Seguridad"
        icon={
          <IconBubble tone="rose">
            <Lock size={18} strokeWidth={1.6} />
          </IconBubble>
        }
      >
        <Field label="Bloquear la sesión tras inactividad" hint="Útil en la tablet compartida del salón: pide el PIN de nuevo.">
          <Select value={settings.autoLockMinutes} onChange={(e) => setSettings({ autoLockMinutes: Number(e.target.value) })} className="md:max-w-sm">
            {[5, 10, 15, 30, 60, 0].map((m) => (
              <option key={m} value={m}>
                {m ? `${m} minutos` : 'Nunca'}
              </option>
            ))}
          </Select>
        </Field>
      </Section>
    </Wrap>
  )
}

// ── Automatizaciones (con diagrama) ──────────────────────
const FLOW: { t: string; s: string; tone: Pastel }[] = [
  { t: 'Check-out', s: 'El huésped sale', tone: 'sky' },
  { t: 'Por limpiar', s: 'Tarea creada y asignada', tone: 'peach' },
  { t: 'Limpiando', s: 'Checklist y fotos', tone: 'butter' },
  { t: 'Por revisar', s: 'Se descuenta inventario', tone: 'mint' },
  { t: 'Lista', s: 'Disponible en el mapa', tone: 'sage' },
]

function Automatizaciones() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const audit = useCollection('audit')
  const recent = audit.filter((a) => a.action === 'automatizacion').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
  return (
    <Wrap>
      <motion.div variants={fadeRise}>
        <Card className="mb-5 overflow-hidden">
          <CardHeader eyebrow="Diagrama" title="Así fluye una estancia" subtitle="Lo que pasa solo, sin que nadie tenga que acordarse" />
          <div className="no-scrollbar overflow-x-auto px-5 pt-6 pb-7 md:px-6">
            <ol className="relative flex min-w-[720px] items-start justify-between">
              <span aria-hidden className="absolute top-[11px] right-[10%] left-[10%] h-px bg-line-strong" />
              {FLOW.map((n, i) => (
                <motion.li key={n.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.09, duration: 0.48, ease: [0.22, 1, 0.36, 1] }} className="relative flex w-[20%] flex-col items-center text-center">
                  <span className={cx('relative z-[1] h-[22px] w-[22px] rounded-full ring-[5px] ring-surface', TONE[n.tone].solid, i === FLOW.length - 1 && 'shadow-[0_0_14px_4px_var(--luz)]')} />
                  <span className="heading mt-3 text-lg">{n.t}</span>
                  <span className="mt-0.5 text-xs text-ink-soft">{n.s}</span>
                </motion.li>
              ))}
            </ol>
          </div>
        </Card>
      </motion.div>
      <Section title="Reglas" subtitle="Enciende o apaga cada automatización">
        <div className="flex flex-col gap-3">
          {AUTOMATION_RULES.map((r) => (
            <div key={r.key} className="flex items-start gap-3.5 rounded-[18px] bg-sunken p-4">
              <span className={cx('mt-2 h-2 w-2 shrink-0 rounded-full', TONE[r.tone].solid)} />
              <div className="min-w-0 flex-1">
                <Toggle
                  checked={settings.automations[r.key as keyof AutomationSettings]}
                  onChange={(v) => setSettings({ automations: { ...settings.automations, [r.key]: v } })}
                  label={
                    <span>
                      <span className="text-ink-soft">Cuando </span>
                      {r.when.charAt(0).toLowerCase() + r.when.slice(1)}
                    </span>
                  }
                  description={r.then}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Últimas acciones automáticas">
        {recent.length === 0 && <p className="text-sm text-ink-soft">Aún no hay acciones automáticas registradas.</p>}
        <ul className="flex flex-col">
          {recent.map((a) => (
            <li key={a.id} className="flex min-h-11 items-center gap-3 border-b border-line py-2 text-sm last:border-0">
              <Sparkle className="shrink-0 text-[11px] text-chispa-soft" />
              <span className="flex-1">{a.summary}</span>
              <span className="shrink-0 text-xs text-ink-3">{ago(a.at)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </Wrap>
  )
}

// ── Respaldos ────────────────────────────────────────────
function Respaldos() {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const log = useStore((s) => s.log)
  const replaceAll = useStore((s) => s.replaceAll)
  const [password, setPassword] = useState('')
  const [snaps, setSnaps] = useState<Awaited<ReturnType<typeof listSnapshots>>>([])
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const refresh = () => void listSnapshots().then(setSnaps)
  useEffect(refresh, [])
  const encryptionAvailable = canEncrypt()

  const download = async () => {
    const { supabaseAnonKey: _k, ...safeSettings } = settings
    const payload = JSON.stringify({ app: 'la-joya', version: 1, exportedAt: nowIso(), settings: safeSettings, data })
    let content = payload
    let name = `la-joya-respaldo-${fmt(new Date(), 'yyyy-MM-dd-HHmm')}.json`
    if (password) {
      if (!encryptionAvailable) return toast.error('El cifrado requiere https', 'Abre la app desde su dirección segura.')
      content = await encryptText(payload, password)
      name = name.replace('.json', '.cifrado.json')
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    a.download = name
    a.click()
    setSettings({ lastBackupAt: nowIso() })
    log('respaldo', 'sistema', `Descargó respaldo${password ? ' cifrado' : ''}`)
    toast.success('Respaldo descargado', password ? 'Cifrado con AES-256.' : 'Guárdalo en un lugar seguro.')
  }

  const restoreFile = async (file: File) => {
    try {
      let text = await file.text()
      if (text.includes('"alg":"AES-GCM"')) {
        if (!password) return toast.error('Este respaldo está cifrado', 'Escribe la contraseña arriba y vuelve a intentar.')
        text = await decryptText(text, password)
      }
      const json = JSON.parse(text)
      if (json.app !== 'la-joya' || !json.data) throw new Error('El archivo no es un respaldo de La Joya')
      await snapshotNow()
      replaceAll(json.data as DataState)
      log('restaurar', 'sistema', `Restauró respaldo del ${json.exportedAt?.slice(0, 10)}`)
      toast.success('Respaldo restaurado', 'Se guardó una copia del estado anterior por si acaso.')
      refresh()
    } catch (e: any) {
      toast.error('No se pudo restaurar', e?.name === 'OperationError' ? 'La contraseña no coincide.' : e.message)
    }
  }

  const counts = useMemo(() => Object.entries(data).map(([k, v]) => [k, Object.keys(v).length] as const), [data])
  const LAYERS: [string, string, Pastel][] = [
    ['Este dispositivo', 'Todo se guarda al instante, aun sin internet', 'lavender'],
    ['Copia diaria automática', 'Los últimos 14 días, aquí mismo', 'mint'],
    ['Nube Supabase', 'Historial de cada cambio en el servidor', 'sky'],
    ['Respaldo nocturno', 'Copia cifrada cada noche con GitHub Actions', 'peach'],
  ]

  return (
    <Wrap>
      <motion.div variants={fadeRise}>
        <Card className="mb-5 p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <IconBubble tone="sage" orb size="lg">
              <ShieldCheck size={24} strokeWidth={1.6} />
            </IconBubble>
            <div className="min-w-0 flex-1">
              <p className="heading text-2xl">Tus datos, protegidos en 4 capas</p>
              <p className="mt-0.5 text-sm text-ink-soft">Último respaldo descargado: {settings.lastBackupAt ? fmtDateFull(settings.lastBackupAt) : 'todavía ninguno'}</p>
            </div>
          </div>
          <ol className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LAYERS.map(([t, s, tone], i) => (
              <li key={t} className="rounded-[18px] bg-sunken p-4">
                <div className="flex items-center gap-2">
                  <span className="display-num text-lg text-ink-soft">{i + 1}</span>
                  <span className={cx('h-1.5 w-1.5 rounded-full', TONE[tone].solid)} />
                </div>
                <div className="mt-1.5 text-[15px] font-medium">{t}</div>
                <div className="mt-0.5 text-xs text-ink-soft">{s}</div>
              </li>
            ))}
          </ol>
        </Card>
      </motion.div>

      <Section title="Descargar o restaurar" subtitle="Un archivo con toda la información del sistema">
        <Field label="Contraseña de cifrado (recomendada)" hint={encryptionAvailable ? 'Sin ella nadie puede abrir el archivo. Si la olvidas, no se puede recuperar.' : 'El cifrado está disponible al abrir la app con https.'}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Opcional" autoComplete="new-password" className="md:max-w-md" />
        </Field>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button icon={<Download size={18} strokeWidth={1.6} />} onClick={download}>
            Descargar respaldo
          </Button>
          <Button variant="outline" icon={<Upload size={18} strokeWidth={1.6} />} onClick={() => fileRef.current?.click()}>
            Restaurar desde archivo
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && restoreFile(e.target.files[0])} />
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {counts.map(([k, n]) => (
            <Badge key={k} tone="sky">
              {k}: {n}
            </Badge>
          ))}
        </div>
      </Section>

      <Section
        title="Copias automáticas de este dispositivo"
        subtitle="Una por día; se conservan 14"
        icon={
          <IconBubble tone="mint">
            <History size={18} strokeWidth={1.6} />
          </IconBubble>
        }
      >
        <ul className="flex flex-col gap-2">
          {snaps.map((s) => (
            <li key={s.key} className="flex min-h-14 items-center gap-3 rounded-[14px] bg-sunken px-4 py-2.5">
              <HardDrive size={16} strokeWidth={1.6} className="shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium capitalize">{fmt(s.date, "EEEE d 'de' MMMM")}</p>
                <p className="text-xs text-ink-soft">
                  {(s.size / 1024).toFixed(0)} KB · {ago(s.at)}
                </p>
              </div>
              <Button size="sm" variant="ghost" icon={<RotateCcw size={16} strokeWidth={1.6} />} onClick={() => setConfirmKey(s.key)}>
                Restaurar
              </Button>
            </li>
          ))}
          {snaps.length === 0 && <li className="text-sm text-ink-soft">Todavía no hay copias.</li>}
        </ul>
        <Estela className="my-5" />
        <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
          Reiniciar datos de demostración
        </Button>
      </Section>
      <Confirm
        open={!!confirmKey}
        onClose={() => setConfirmKey(null)}
        title="¿Restaurar esta copia?"
        body="Los datos actuales se reemplazan por los de esa fecha. Antes se guarda una copia de hoy."
        confirmLabel="Restaurar copia"
        onConfirm={async () => {
          if (!confirmKey) return
          await snapshotNow()
          await restoreSnapshot(confirmKey)
          toast.success('Copia restaurada')
        }}
      />
      <Confirm open={confirmReset} onClose={() => setConfirmReset(false)} danger title="¿Reiniciar la demostración?" body="Se borran los datos de este dispositivo y se cargan los de ejemplo." confirmLabel="Reiniciar" onConfirm={() => resetDemo().then(() => toast.success('Datos de demostración cargados'))} />
    </Wrap>
  )
}

// ── Bitácora ─────────────────────────────────────────────
const ACTION_TONE: Record<string, Pastel> = { eliminar: 'rose', crear: 'sage', automatizacion: 'lavender', sesion: 'sky', editar: 'butter', respaldo: 'mint', restaurar: 'peach' }

function Bitacora() {
  const audit = useCollection('audit')
  const employees = useStore((s) => s.data.employees)
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')
  const list = audit
    .filter((a) => (!who || a.userId === who) && (!q || a.summary.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 300)
  return (
    <Wrap>
      <Section title="Bitácora de cambios" subtitle="Quién hizo qué y cuándo. No se puede editar ni borrar desde la app.">
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la bitácora" aria-label="Buscar en la bitácora" />
          <Select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filtrar por persona">
            <option value="">Todas las personas</option>
            {Object.values(employees).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </div>
        <ol className="relative">
          <span aria-hidden className="absolute top-2 bottom-2 left-[5px] w-px bg-line" />
          {list.map((a) => (
            <li key={a.id} className="relative flex items-start gap-4 py-2.5 pl-0 text-sm">
              <span className={cx('relative z-[1] mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-[3px] ring-surface', TONE[ACTION_TONE[a.action] ?? 'sky'].solid)} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">{a.summary}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {a.userId ? employees[a.userId]?.name ?? 'Sistema' : 'Sistema'} · {fmt(a.at, "d MMM, HH:mm")} · {a.action}
                </p>
              </div>
            </li>
          ))}
          {list.length === 0 && <li className="text-sm text-ink-soft">Nada coincide con la búsqueda.</li>}
        </ol>
      </Section>
    </Wrap>
  )
}

// ── Instalar ─────────────────────────────────────────────
function Instalar() {
  const [prompt, setPrompt] = useState<any>(null)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  const GUIDES: { title: string; icon: typeof Share; tone: Pastel; steps: ReactNode[] }[] = [
    { title: 'iPhone y iPad', icon: Share, tone: 'sky', steps: [<>Abre la app en <b className="font-medium">Safari</b>.</>, <>Toca <b className="font-medium">Compartir</b> (cuadro con flecha).</>, <>Elige <b className="font-medium">Agregar a pantalla de inicio</b>.</>, 'Ábrela desde su ícono, a pantalla completa.'] },
    { title: 'Android y tablets', icon: Smartphone, tone: 'mint', steps: [<>Abre la app en <b className="font-medium">Chrome</b>.</>, <>Toca <b className="font-medium">Instalar app</b> o el menú ⋮.</>, <>Elige <b className="font-medium">Instalar aplicación</b>.</>, 'Aparece con las demás apps.'] },
    { title: 'iMac', icon: MonitorSmartphone, tone: 'lavender', steps: [<>Abre la app en <b className="font-medium">Safari</b> o Chrome.</>, <>Safari: <b className="font-medium">Archivo → Agregar al Dock</b>.</>, 'Chrome: el ícono de instalar en la barra.', 'Se abre en su propia ventana.'] },
  ]
  return (
    <Wrap>
      <motion.div variants={fadeRise}>
        {standalone ? (
          <div className="mb-5 flex items-center gap-3 rounded-[var(--r-lg)] bg-sage-soft p-5 ring-1 ring-line">
            <Sparkle className="text-success" /> <p className="font-medium">La app ya está instalada en este dispositivo.</p>
          </div>
        ) : (
          prompt && (
            <div className="mb-5 flex flex-wrap items-center gap-4 rounded-[var(--r-lg)] bg-[color-mix(in_oklab,var(--luz)_30%,var(--surface))] p-5 ring-1 ring-line">
              <Smartphone strokeWidth={1.6} />
              <p className="flex-1 font-medium">Instala La Joya como app en este dispositivo</p>
              <Button onClick={() => prompt.prompt()}>Instalar</Button>
            </div>
          )
        )}
      </motion.div>
      <div className="grid gap-5 md:grid-cols-3">
        {GUIDES.map((g) => (
          <motion.div key={g.title} variants={fadeRise}>
            <Card className="h-full p-5 md:p-6">
              <IconBubble tone={g.tone}>
                <g.icon size={18} strokeWidth={1.6} />
              </IconBubble>
              <h3 className="heading mt-4 text-xl">{g.title}</h3>
              <ol className="mt-4 flex flex-col gap-3">
                {g.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-soft">
                    <span className="display-num w-4 shrink-0 text-base text-ink">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </motion.div>
        ))}
      </div>
    </Wrap>
  )
}

// ── Cómo funciona (diagrama de arquitectura) ─────────────
function Sistema() {
  const Box = ({ x, y, w, h, title, sub, tone }: { x: number; y: number; w: number; h: number; title: string; sub: string; tone: Pastel }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="18" fill={`var(--${tone}-soft)`} stroke="var(--line-strong)" strokeWidth="1" />
      <text x={x + w / 2} y={y + h / 2 - 5} textAnchor="middle" fontSize="16" fill="var(--ink)" style={{ fontFamily: 'var(--font-display)', fontVariationSettings: '"SOFT" 100', fontWeight: 400 }}>
        {title}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 15} textAnchor="middle" fontSize="12" fill="var(--ink-soft)">
        {sub}
      </text>
    </g>
  )
  const Hilo = ({ d, dashed }: { d: string; dashed?: boolean }) => <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth="1.2" strokeDasharray={dashed ? '4 5' : undefined} markerEnd="url(#arr)" />
  return (
    <Wrap>
      <motion.div variants={fadeRise}>
        <Card className="mb-5 overflow-hidden">
          <CardHeader eyebrow="Arquitectura" title="Cómo viaja la información" subtitle="De cada dispositivo a la nube, y de regreso" />
          <div className="no-scrollbar overflow-x-auto p-4 md:p-6">
            <svg viewBox="0 0 900 430" className="min-w-[720px]" role="img" aria-label="Diagrama de arquitectura de La Joya">
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="var(--ink-soft)" strokeWidth="1.4" />
                </marker>
              </defs>
              <Box x={20} y={20} w={200} h={70} title="Celulares" sub="Limpieza y mantenimiento" tone="mint" />
              <Box x={240} y={20} w={200} h={70} title="Tablet" sub="Wedding planner" tone="rose" />
              <Box x={460} y={20} w={200} h={70} title="iMac" sub="Centro de control" tone="lavender" />
              <Box x={680} y={20} w={200} h={70} title="Huéspedes" sub="Airbnb · Booking · WhatsApp" tone="peach" />
              <rect x="20" y="130" width="640" height="90" rx="22" fill="var(--sunken)" stroke="var(--line-strong)" strokeDasharray="5 6" />
              <text x="40" y="158" fontSize="15" fill="var(--ink)" style={{ fontFamily: 'var(--font-display)' }}>
                App La Joya (PWA instalable) en cada dispositivo
              </text>
              <text x="40" y="182" fontSize="12" fill="var(--ink-soft)">
                Guarda todo primero en el dispositivo: funciona sin internet y responde al instante.
              </text>
              <text x="40" y="202" fontSize="12" fill="var(--ink-soft)">
                Copia diaria automática · PIN por persona · bloqueo por inactividad · bitácora.
              </text>
              <Hilo d="M120 90 V128" />
              <Hilo d="M340 90 V128" />
              <Hilo d="M560 90 V128" />
              <Box x={20} y={270} w={400} h={80} title="Supabase (nube, por ahora)" sub="Postgres con seguridad por rol · tiempo real · fotos" tone="sky" />
              <Box x={460} y={270} w={200} h={80} title="Funciones" sub="Sincronizar Airbnb (iCal)" tone="butter" />
              <Box x={680} y={270} w={200} h={80} title="Respaldo nocturno" sub="GitHub Actions, cifrado" tone="sage" />
              <Hilo d="M220 220 V268" />
              <Hilo d="M240 268 V222" />
              <Hilo d="M780 90 V268" dashed />
              <Hilo d="M678 310 H662" />
              <Hilo d="M422 310 H458" />
              <rect x="20" y="372" width="860" height="44" rx="22" fill="color-mix(in oklab, var(--luz) 40%, var(--surface))" />
              <text x="450" y="399" textAnchor="middle" fontSize="13" fill="var(--ink)">
                ✦ Futuro: el mismo Supabase instalado en la iMac de la oficina → red local, mismo programa, solo cambia la dirección
              </text>
            </svg>
          </div>
        </Card>
      </motion.div>
      <div className="grid gap-5 md:grid-cols-3">
        {(
          [
            ['Conexiones seguras', 'Todo viaja por HTTPS/TLS con encabezados de seguridad estrictos. Las llaves secretas nunca están en la app.', 'sky'],
            ['Cada quien ve lo suyo', 'Reglas de seguridad en la base de datos: limpieza no ve dinero y la wedding planner no ve las finanzas generales.', 'lavender'],
            ['Nada se pierde', 'Historial de versiones en el servidor, copias diarias, respaldo nocturno cifrado y archivo descargable.', 'mint'],
          ] as [string, string, Pastel][]
        ).map(([t, s, tone]) => (
          <motion.div key={t} variants={fadeRise}>
            <Card className="h-full p-5 md:p-6">
              <span className={cx('block h-2 w-2 rounded-full', TONE[tone].solid)} />
              <p className="heading mt-3 text-xl">{t}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </Wrap>
  )
}

/** Modo técnico: muestra cómo funciona el sistema por dentro y la vitrina de diseño */
function TechModeCard() {
  const techMode = useStore((s) => !!s.settings.techMode)
  const setSettings = useStore((s) => s.setSettings)
  return (
    <Card className="p-5 md:p-6">
      <Toggle checked={techMode} onChange={(v) => setSettings({ techMode: v })} label="Modo técnico" description="Muestra «Cómo funciona» (sincronización, seguridad, respaldos) y la vitrina de diseño. Útil para quien da soporte." />
      {techMode && (
        <a href="/diseno" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          Abrir la vitrina de diseño →
        </a>
      )}
    </Card>
  )
}

export default function Ajustes() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const admin = me?.role === 'admin'
  const techMode = useStore((s) => !!s.settings.techMode)
  const tabs = TABS.filter((t) => (!t.admin || admin) && (!t.tech || techMode))
  const asked = params.get('tab') as Tab | null
  const wanted = asked ? (MERGED[asked] ?? asked) : 'panel'
  const tab = (tabs.find((t) => t.value === wanted)?.value ?? 'panel') as Tab
  return (
    <div>
      <PageHeader eyebrow="Sistema" title="Ajustes" subtitle={admin ? 'Tu panel, el rancho, la nube, los respaldos y la seguridad.' : 'Tu panel, tu atmósfera y cómo instalar la app.'} />
      <div className={cx('grid gap-6 lg:gap-8', tabs.length > 1 && 'lg:grid-cols-[232px_1fr]')}>
        <nav hidden={tabs.length < 2} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:self-start lg:px-0" aria-label="Secciones de ajustes">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = tab === t.value
            return (
              <button key={t.value} onClick={() => setParams({ tab: t.value })} aria-current={active ? 'page' : undefined} className={cx('relative flex h-11 shrink-0 items-center gap-2.5 rounded-full px-4 text-[15px] whitespace-nowrap transition-colors lg:rounded-[10px] lg:px-3', active ? 'text-ink' : 'text-ink-soft hover:bg-wash hover:text-ink')}>
                {active && <motion.span layoutId="ajustes-tab" className="absolute inset-0 rounded-full bg-secondary lg:rounded-[10px]" transition={spring.suave} />}
                <Icon size={18} strokeWidth={1.6} className="relative" />
                <span className="relative">{t.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="min-w-0" key={tab}>
          {tab === 'panel' && (
            <div className="flex flex-col gap-6">
              <TuPanel />
              <Instalar />
            </div>
          )}
          {tab === 'general' && <General />}
          {tab === 'automatizaciones' && <Automatizaciones />}
          {tab === 'nube' && (
            <div className="flex flex-col gap-6">
              <CloudCenter />
              <Respaldos />
              <TechModeCard />
            </div>
          )}
          {tab === 'bitacora' && <Bitacora />}
          {tab === 'sistema' && <Sistema />}
        </div>
      </div>
    </div>
  )
}

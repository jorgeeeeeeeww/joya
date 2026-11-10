// Monitor central (solo el dueño): cada celular o computadora del equipo con su semáforo, los errores
// de todos agrupados y explicados, y el último resultado de cada tarea de la nube.
// Interacción: el semáforo filtra la lista; tocar un dispositivo abre su detalle con lo que hay que hacer.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronRight, CircleAlert, CloudCog, MonitorSmartphone, RefreshCw, Rocket, Smartphone, Tablet, Laptop } from 'lucide-react'
import { getClient } from '@/lib/sync'
import { loadMonitor, requireLatest, type DeviceRow, type MonitorSnapshot } from '@/lib/monitor'
import { explain } from '@/lib/errorLog'
import { buildLabel, BUILD_ID } from '@/lib/version'
import { ROLE } from '@/lib/meta'
import { ago } from '@/lib/format'
import { fadeRise, stagger } from '@/lib/motion'
import type { Role } from '@/lib/types'
import { Badge, Button, Card, CardHeader, Confirm, cx, IconBubble, Segmented, Sheet, toast } from '../ui'
import { LightDots } from '../step1'

type Filter = 'todos' | 'rojo' | 'amarillo' | 'verde'

const LIGHT: Record<DeviceRow['health'], { dot: string; tone: 'rose' | 'butter' | 'sage'; label: string }> = {
  rojo: { dot: 'bg-danger', tone: 'rose', label: 'Revisar ya' },
  amarillo: { dot: 'bg-warning', tone: 'butter', label: 'Pendiente' },
  verde: { dot: 'bg-success', tone: 'sage', label: 'Bien' },
}

const deviceIcon = (platform: string | null) => (/iPad|tablet/i.test(platform ?? '') ? Tablet : /iPhone|Android/i.test(platform ?? '') ? Smartphone : Laptop)

const roleLabel = (r: string | null) => (r && ROLE[r as Role]?.label) || 'Sin puesto'

const syncLabel = (s: string | null) =>
  ({ idle: 'Al día', syncing: 'Sincronizando', error: 'Con error', offline: 'Sin internet', follower: 'Otra pestaña sincroniza', local: 'Sin nube' })[s ?? ''] ?? '—'

function useMonitor() {
  const [snap, setSnap] = useState<MonitorSnapshot>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sb = await getClient()
      if (!sb) throw new Error('Este dispositivo no está conectado a la nube')
      setSnap(await loadMonitor(sb))
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
    // Se actualiza solo mientras está abierto
    const iv = setInterval(() => document.visibilityState === 'visible' && void load(), 60_000)
    return () => clearInterval(iv)
  }, [load])
  return { snap, error, loading, load }
}

function DeviceRowItem({ d, onOpen }: { d: DeviceRow; onOpen: () => void }) {
  const Icon = deviceIcon(d.platform)
  const l = LIGHT[d.health]
  return (
    <motion.li variants={fadeRise}>
      <button onClick={onOpen} className="pressable flex w-full items-center gap-3 rounded-[18px] p-3 text-left hover:bg-wash">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-soft">
          <Icon size={19} strokeWidth={1.6} />
          <span className={cx('absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-surface', l.dot)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium break-words">{d.employee_name ?? d.account_email ?? 'Sin nombre'}</span>
          <span className="block text-sm break-words text-detail">
            {d.platform ?? 'Dispositivo'} · {d.last_sync_at ? `sincronizó ${ago(d.last_sync_at)}` : 'sin sincronizar'}
          </span>
          {d.health_reason && <span className={cx('mt-0.5 block text-sm break-words', d.health === 'rojo' ? 'text-danger' : 'text-ink-soft')}>{d.health_reason}</span>}
        </span>
        <ChevronRight size={18} strokeWidth={1.6} className="shrink-0 text-ink-3" />
      </button>
    </motion.li>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <span className="text-sm text-detail">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium break-words">{value}</span>
    </div>
  )
}

function DeviceSheet({ d, latestBuild, onClose, onRequireLatest }: { d?: DeviceRow; latestBuild?: string; onClose: () => void; onRequireLatest: () => void }) {
  const outdated = !!d && !!latestBuild && d.app_build < latestBuild
  return (
    <Sheet open={!!d} onClose={onClose} title={d?.employee_name ?? d?.account_email ?? 'Dispositivo'} subtitle={d ? `${d.platform ?? 'Dispositivo'} · ${roleLabel(d.employee_role)}` : undefined}>
      {d && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <Badge tone={LIGHT[d.health].tone} dot>
              {LIGHT[d.health].label}
            </Badge>
            {d.health_reason && <span className="text-sm text-ink-soft">{d.health_reason}</span>}
          </div>
          <div>
            <Fact label="Última vez abierta" value={ago(d.last_seen)} />
            <Fact label="Última sincronización" value={d.last_sync_at ? ago(d.last_sync_at) : 'Nunca'} />
            <Fact label="Cambios por subir" value={String(d.pending_count)} />
            <Fact label="Rechazados por permisos" value={String(d.rejected_count)} />
            <Fact label="Estado" value={syncLabel(d.sync_status)} />
            <Fact label="Tiempo real" value={d.realtime === 'live' ? 'En vivo' : d.realtime === 'error' ? 'Reconectando' : 'Apagado'} />
            <Fact label="Versión" value={`${buildLabel(d.app_build)}${outdated ? ' (hay una más nueva)' : ''}`} />
            <Fact label="Errores en 24 h" value={String(d.errors_24h)} />
            <Fact label="Cuenta" value={d.account_email ?? '—'} />
            {d.storage_mb != null && <Fact label="Espacio usado" value={`${d.storage_mb} MB`} />}
          </div>
          {d.sync_error && (
            <div className="rounded-[16px] bg-[color-mix(in_oklab,var(--danger)_8%,var(--surface))] p-4 text-sm">
              <p className="font-medium break-words">{d.sync_error}</p>
              <p className="mt-1 text-ink-soft">{explain(d.sync_error)}</p>
            </div>
          )}
          <div className="rounded-[16px] bg-sunken/60 p-4 text-sm">
            <p className="font-medium">Qué hacer</p>
            <p className="mt-1 text-ink-soft">
              {d.pending_count > 0 && d.health === 'rojo'
                ? 'Pide a esa persona que abra la app con internet y deslice hacia abajo en cualquier pantalla. Sus cambios están guardados en su celular.'
                : outdated
                  ? 'Que abra la app y deslice hacia abajo: busca y aplica la versión nueva. También puedes exigir la versión nueva a todos.'
                  : d.rejected_count > 0
                    ? 'Su puesto no tiene permiso para algo que intentó guardar. Revisa el puesto de su cuenta en Supabase (tabla profiles).'
                    : 'Nada por ahora. Este dispositivo está al día.'}
            </p>
          </div>
          {outdated && (
            <Button variant="tinta" icon={<Rocket size={17} strokeWidth={1.6} />} onClick={onRequireLatest}>
              Exigir la versión nueva a todos
            </Button>
          )}
        </div>
      )}
    </Sheet>
  )
}

export function DeviceMonitor() {
  const { snap, error, loading, load } = useMonitor()
  const [filter, setFilter] = useState<Filter>('todos')
  const [openId, setOpenId] = useState<string>()
  const [confirmLatest, setConfirmLatest] = useState(false)

  const devices = useMemo(() => snap?.devices ?? [], [snap])
  const counts = useMemo(() => ({ rojo: devices.filter((d) => d.health === 'rojo').length, amarillo: devices.filter((d) => d.health === 'amarillo').length, verde: devices.filter((d) => d.health === 'verde').length }), [devices])
  const order = { rojo: 0, amarillo: 1, verde: 2 }
  const shown = useMemo(() => devices.filter((d) => filter === 'todos' || d.health === filter).sort((a, b) => order[a.health] - order[b.health] || b.last_seen.localeCompare(a.last_seen)), [devices, filter])
  const open = devices.find((d) => d.device_id === openId)
  const latestBuild = snap?.latestBuild ?? devices.reduce<string | undefined>((m, d) => (!m || d.app_build > m ? d.app_build : m), undefined)

  const header = (
    <CardHeader
      eyebrow="Monitor central"
      title="Dispositivos"
      subtitle="Todos los celulares y computadoras del equipo, con lo que les falla"
      icon={
        <IconBubble tone="sky">
          <MonitorSmartphone size={20} strokeWidth={1.6} />
        </IconBubble>
      }
      action={
        <Button variant="ghost" size="sm" loading={loading} icon={<RefreshCw size={15} strokeWidth={1.6} />} onClick={() => void load()}>
          Actualizar
        </Button>
      }
    />
  )

  if (error && !snap)
    return (
      <Card>
        {header}
        <div className="flex items-start gap-3 px-4 pt-3 pb-5 text-sm md:px-6">
          <CircleAlert size={18} strokeWidth={1.7} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-ink-soft">{error}</p>
        </div>
      </Card>
    )

  return (
    <div className="flex flex-col gap-6">
      <Card>
        {header}
        <div className="px-4 pt-4 pb-2 md:px-6">
          {/* El semáforo es el filtro: celdas iguales, el número de cada color */}
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            className="flex w-full"
            options={[
              { value: 'todos', label: `Todos ${devices.length}` },
              { value: 'rojo', label: <><span className="h-2 w-2 rounded-full bg-danger" />{counts.rojo}</> },
              { value: 'amarillo', label: <><span className="h-2 w-2 rounded-full bg-warning" />{counts.amarillo}</> },
              { value: 'verde', label: <><span className="h-2 w-2 rounded-full bg-success" />{counts.verde}</> },
            ]}
          />
        </div>
        {!snap ? (
          <div className="flex items-center gap-2 px-6 py-6 text-sm text-ink-soft">
            <LightDots className="text-chispa-soft" /> Cargando dispositivos…
          </div>
        ) : shown.length === 0 ? (
          <p className="px-6 pt-2 pb-6 text-sm text-ink-soft">{devices.length ? 'Ningún dispositivo con ese color.' : 'Todavía no se reporta ningún dispositivo. Aparecen solos al sincronizar.'}</p>
        ) : (
          <motion.ul variants={stagger} initial="hidden" animate="show" className="flex flex-col px-2 pb-3 md:px-3">
            {shown.map((d) => (
              <DeviceRowItem key={d.device_id} d={d} onOpen={() => setOpenId(d.device_id)} />
            ))}
          </motion.ul>
        )}
        <p className="px-4 pb-5 text-xs text-detail md:px-6">
          Esta versión: {buildLabel(BUILD_ID)}
          {latestBuild && latestBuild !== BUILD_ID ? ` · la más nueva en uso: ${buildLabel(latestBuild)}` : ''}
          {snap?.minBuild && snap.minBuild !== '000000000000' ? ` · mínima exigida: ${buildLabel(snap.minBuild)}` : ''}
        </p>
      </Card>

      {/* Errores agrupados */}
      <Card>
        <CardHeader eyebrow="Todos los dispositivos" title="Errores agrupados" subtitle="El mismo error en varios celulares se ve una sola vez, explicado" />
        {!snap?.groups.length ? (
          <p className="px-6 pt-3 pb-6 text-sm text-ink-soft">Sin errores en los últimos 30 días.</p>
        ) : (
          <ul className="flex flex-col gap-2 px-4 pt-3 pb-5 md:px-6">
            {snap.groups.slice(0, 25).map((g) => (
              <li key={g.fingerprint} className="rounded-[16px] bg-sunken/60 p-3.5 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-detail">
                  <Badge tone={g.source === 'permiso' ? 'rose' : g.source === 'sync' ? 'sky' : 'lavender'}>{g.source === 'permiso' ? 'Permisos' : g.source === 'sync' ? 'Sincronización' : g.source === 'promesa' ? 'Proceso' : 'Pantalla'}</Badge>
                  <span>
                    {g.occurrences} {g.occurrences === 1 ? 'vez' : 'veces'} · {g.devices} {g.devices === 1 ? 'dispositivo' : 'dispositivos'} · desde {ago(g.first_seen)}
                  </span>
                </div>
                <p className="mt-1.5 font-medium break-words">{g.sample_message}</p>
                <p className="text-ink-soft">{explain(g.sample_message)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Backend */}
      <Card>
        <CardHeader
          eyebrow="Nube"
          title="Tareas de la nube"
          subtitle="Avisos push, Airbnb y Booking, tareas programadas, respaldo y publicación"
          icon={
            <IconBubble tone="lavender">
              <CloudCog size={20} strokeWidth={1.6} />
            </IconBubble>
          }
        />
        {!snap?.backend.length ? (
          <p className="px-6 pt-3 pb-6 text-sm text-ink-soft">Todavía no corre ninguna tarea. Aparecen aquí la primera vez que corren.</p>
        ) : (
          <ul className="flex flex-col px-4 pt-2 pb-4 md:px-6">
            {snap.backend.map((b) => (
              <li key={b.job} className="flex items-start gap-3 border-b border-line py-3 last:border-0">
                <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', b.ok ? 'bg-success' : 'bg-danger')} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{b.label}</span>
                  <span className="block text-sm break-words text-detail">
                    {b.ok ? 'Bien' : 'Falló'} {ago(b.last_run)}
                    {b.detail ? ` · ${b.detail}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DeviceSheet d={open} latestBuild={latestBuild} onClose={() => setOpenId(undefined)} onRequireLatest={() => setConfirmLatest(true)} />
      <Confirm
        open={confirmLatest}
        onClose={() => setConfirmLatest(false)}
        title="¿Exigir la versión nueva a todos?"
        body="Los dispositivos con una versión anterior se actualizan solos antes de subir cambios. No se pierde nada: lo que capturaron espera guardado en su celular."
        confirmLabel="Exigir versión nueva"
        onConfirm={async () => {
          try {
            const sb = await getClient()
            if (!sb || !latestBuild) throw new Error('Sin conexión con la nube')
            await requireLatest(sb, latestBuild)
            toast.success('Listo', 'Los dispositivos atrasados se actualizan al abrir la app')
            void load()
          } catch (e) {
            toast.error('No se pudo', (e as Error).message)
          }
        }}
      />
    </div>
  )
}

/** Resumen corto para el panel del dueño: cuántos dispositivos necesitan atención */
export function DeviceMonitorSummary({ onOpen }: { onOpen: () => void }) {
  const { snap } = useMonitor()
  if (!snap?.devices.length) return null
  const red = snap.devices.filter((d) => d.health === 'rojo')
  const yellow = snap.devices.filter((d) => d.health === 'amarillo')
  const failing = snap.backend.filter((b) => !b.ok)
  if (!red.length && !yellow.length && !failing.length) return null
  return (
    <Card onClick={onOpen} className="flex items-center gap-3 p-4">
      <IconBubble tone={red.length || failing.length ? 'rose' : 'butter'}>
        <MonitorSmartphone size={20} strokeWidth={1.6} />
      </IconBubble>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{red.length ? `${red.length} ${red.length === 1 ? 'dispositivo necesita' : 'dispositivos necesitan'} atención` : failing.length ? 'Falló una tarea de la nube' : `${yellow.length} ${yellow.length === 1 ? 'dispositivo pendiente' : 'dispositivos pendientes'}`}</span>
        <span className="block text-sm break-words text-detail">{red[0]?.health_reason ?? failing[0]?.label ?? yellow[0]?.health_reason ?? ''}</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.6} className="shrink-0 text-ink-3" />
    </Card>
  )
}

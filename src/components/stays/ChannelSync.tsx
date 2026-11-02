import { useRef, useState } from 'react'
import { CalendarSync, Copy, Download, FileUp, Link2, RefreshCw } from 'lucide-react'
import { db, useCollection, useStore } from '@/lib/store'
import { getClient } from '@/lib/sync'
import { buildICS, importAirbnb } from '@/lib/ical'
import { uid } from '@/lib/format'
import type { ID } from '@/lib/types'
import { Badge, Button, Card, CardHeader, IconBubble, Input, toast } from '@/components/ui'

export function ChannelSync() {
  const units = useCollection('units')
  const reservations = useCollection('reservations')
  const settings = useStore((s) => s.settings)
  const cloud = !!settings.supabaseUrl
  const [syncing, setSyncing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<ID | null>(null)

  const exportUrl = (unitId: ID, token?: string) => (cloud ? `${settings.supabaseUrl}/functions/v1/ical-export?unit=${unitId}&token=${token ?? ''}` : '')

  const syncNow = async () => {
    if (!cloud) return toast.info('Se necesita la nube', 'Airbnb no permite leer su calendario directo desde el navegador. Conecta Supabase en Ajustes → Nube, o importa el archivo .ics.')
    setSyncing(true)
    try {
      const sb = await getClient()
      const { data, error } = await sb!.functions.invoke('ical-sync', { body: {} })
      if (error) throw error
      toast.success('Calendarios sincronizados', data?.summary ?? 'Airbnb y Booking al día')
    } catch (e: any) {
      toast.error('No se pudo sincronizar', e?.message)
    } finally {
      setSyncing(false)
    }
  }

  const downloadICS = (unitId: ID) => {
    const u = db.get('units', unitId)
    if (!u) return
    const blob = new Blob([buildICS(u, reservations)], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${u.name.toLowerCase().replace(/\s+/g, '-')}.ics`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Card>
      <CardHeader
        icon={
          <IconBubble tone="rose">
            <CalendarSync size={20} strokeWidth={1.6} />
          </IconBubble>
        }
        eyebrow="Canales"
        title="Airbnb y Booking"
        subtitle="Sincroniza calendarios para evitar dobles reservas"
        action={
          <Button size="sm" variant="secondary" loading={syncing} icon={<RefreshCw size={16} strokeWidth={1.6} />} onClick={syncNow}>
            Sincronizar ahora
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file || !target) return
          const res = importAirbnb(target, await file.text())
          toast.success('Calendario importado', `${res.created} nuevas · ${res.updated} actualizadas · ${res.cancelled} canceladas`)
        }}
      />
      <div className="mt-4 divide-y divide-line border-t border-line">
        {units.map((u) => {
          const count = reservations.filter((r) => r.unitId === u.id && r.externalUid && r.status !== 'cancelada').length
          return (
            <div key={u.id} className="grid gap-3 px-6 py-4 lg:grid-cols-[190px_1fr_auto] lg:items-center">
              <div>
                <p className="heading text-[1.15rem]">{u.name}</p>
                <p className="text-xs text-ink-soft">{count ? `${count} reservas importadas` : 'Sin importar todavía'}</p>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="relative">
                  <Link2 size={16} strokeWidth={1.6} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
                  <Input
                    key={u.icalImportUrl}
                    defaultValue={u.icalImportUrl ?? ''}
                    placeholder="Pega aquí la URL iCal de Airbnb (Calendario → Disponibilidad → Exportar)"
                    className="!h-11 pl-10 text-sm"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== (u.icalImportUrl ?? '')) {
                        if (v && !/^https:\/\//.test(v)) return toast.error('La URL debe empezar con https://')
                        db.patch('units', u.id, { icalImportUrl: v || undefined })
                        toast.success('URL guardada', u.name)
                      }
                    }}
                  />
                </div>
                {cloud && (
                  <div className="flex items-center gap-2 rounded-[12px] bg-sunken px-3.5 py-2 text-xs">
                    <Badge tone="sage">Exportar</Badge>
                    <span className="truncate font-mono text-ink-3">{exportUrl(u.id, u.icalExportToken)}</span>
                    <button
                      className="pressable ml-auto shrink-0 rounded-full p-2 text-ink-soft hover:bg-surface hover:text-ink"
                      aria-label="Copiar URL"
                      onClick={async () => {
                        let token = u.icalExportToken
                        if (!token) {
                          token = uid('ical_')
                          db.patch('units', u.id, { icalExportToken: token })
                        }
                        await navigator.clipboard.writeText(exportUrl(u.id, token))
                        toast.success('URL copiada', 'Pégala en Airbnb → Importar calendario')
                      }}
                    >
                      <Copy size={14} strokeWidth={1.6} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<FileUp size={16} strokeWidth={1.6} />}
                  onClick={() => {
                    setTarget(u.id)
                    fileRef.current?.click()
                  }}
                >
                  Importar .ics
                </Button>
                <Button size="sm" variant="ghost" icon={<Download size={16} strokeWidth={1.6} />} onClick={() => downloadICS(u.id)} aria-label="Descargar calendario">
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      {!cloud && (
        <p className="border-t border-line px-6 py-4 text-xs text-ink-soft">
          Con la nube conectada, el sistema revisa Airbnb y Booking cada 30 minutos y les publica tus reservas directas automáticamente. Sin nube puedes importar el archivo .ics manualmente.
        </p>
      )}
    </Card>
  )
}

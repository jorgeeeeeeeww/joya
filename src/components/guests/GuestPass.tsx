// Pase digital con QR para cada invitado: se comparte por WhatsApp como imagen y en la puerta
// se escanea para registrar la llegada. El código lleva el evento y el invitado: LJ1:<evento>:<invitado>.
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Download, QrCode, Share2 } from 'lucide-react'
import type { Guest, RanchEvent } from '@/lib/types'
import { VENUE } from '@/lib/meta'
import { fmt } from '@/lib/format'
import { Button, Sheet, toast } from '@/components/ui'
import { SearchField, norm } from '@/components/fields'
import { rsvpOf, tableLabel } from './guestUtils'

export const passCode = (ev: RanchEvent, g: Guest) => `LJ1:${ev.id}:${g.id}`
export function parsePass(text: string): { eventId: string; guestId: string } | null {
  const m = /^LJ1:([^:]+):(.+)$/.exec(text.trim())
  return m ? { eventId: m[1]!, guestId: m[2]! } : null
}

/** Dibuja el pase (colores fijos de la atmósfera Flor: es una imagen que sale de la app) */
async function passImage(ev: RanchEvent, g: Guest, ranchName: string): Promise<Blob> {
  const W = 720
  const H = 1080
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  await document.fonts?.ready
  const grad = x.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#2B1D24')
  grad.addColorStop(0.42, '#5A3A44')
  grad.addColorStop(0.42, '#F6EAE3')
  grad.addColorStop(1, '#F6EAE3')
  x.fillStyle = grad
  x.fillRect(0, 0, W, H)
  // La luz
  const glow = x.createRadialGradient(W - 140, 130, 10, W - 140, 130, 120)
  glow.addColorStop(0, 'rgba(255,224,190,1)')
  glow.addColorStop(0.45, 'rgba(255,214,170,.55)')
  glow.addColorStop(1, 'rgba(255,214,170,0)')
  x.fillStyle = glow
  x.beginPath()
  x.arc(W - 140, 130, 120, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#F6E3CF'
  x.beginPath()
  x.arc(W - 140, 130, 44, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#F3E6DE'
  x.font = '600 22px "DM Sans Variable", system-ui'
  x.fillText(ranchName.toUpperCase(), 60, 90)
  x.font = '400 60px "Fraunces Variable", Georgia, serif'
  wrap(x, ev.title, 60, 200, W - 120, 66)
  x.font = '400 26px "DM Sans Variable", system-ui'
  x.fillStyle = '#E8D6CC'
  x.fillText(`${fmt(ev.date, "EEEE d 'de' MMMM")} · ${ev.startTime}`, 60, 360)
  x.fillText(VENUE[ev.venue].label, 60, 398)
  // Tarjeta del invitado
  x.fillStyle = '#FFFFFF'
  roundRect(x, 60, 470, W - 120, 540, 28)
  x.fill()
  x.fillStyle = '#2B1D24'
  x.font = '400 40px "Fraunces Variable", Georgia, serif'
  wrap(x, g.name, 100, 540, W - 200, 46)
  x.font = '500 24px "DM Sans Variable", system-ui'
  x.fillStyle = '#7A5C62'
  x.fillText(`${g.count === 1 ? '1 pase' : `${g.count} pases`}${g.table !== undefined ? ` · ${tableLabel(g.table)}` : ''}`, 100, 610)
  const qr = await QRCode.toDataURL(passCode(ev, g), { margin: 1, width: 320, color: { dark: '#2B1D24', light: '#FFFFFF' } })
  const img = new Image()
  img.src = qr
  await img.decode()
  x.drawImage(img, (W - 320) / 2, 650, 320, 320)
  x.font = '400 20px "DM Sans Variable", system-ui'
  x.fillStyle = '#9A8086'
  x.textAlign = 'center'
  x.fillText('Muestra este código en la entrada', W / 2, 995)
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
}
function wrap(x: CanvasRenderingContext2D, text: string, left: number, top: number, max: number, lh: number) {
  const words = text.split(' ')
  let line = ''
  let y = top
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (x.measureText(test).width > max && line) {
      x.fillText(line, left, y)
      line = w
      y += lh
    } else line = test
  }
  x.fillText(line, left, y)
}
function roundRect(x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number) {
  x.beginPath()
  x.moveTo(l + r, t)
  x.arcTo(l + w, t, l + w, t + h, r)
  x.arcTo(l + w, t + h, l, t + h, r)
  x.arcTo(l, t + h, l, t, r)
  x.arcTo(l, t, l + w, t, r)
  x.closePath()
}

export async function sharePass(ev: RanchEvent, g: Guest, ranchName: string) {
  const blob = await passImage(ev, g, ranchName)
  const file = new File([blob], `pase-${g.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.png`, { type: 'image/png' })
  const text = `¡Hola ${g.name.split(' ')[0]}! Este es tu pase para ${ev.title}. Muéstralo en la entrada.`
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: `Pase · ${ev.title}` })
      return
    } catch {
      /* canceló: se descarga */
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  toast.success('Pase descargado', 'Envíalo por WhatsApp como imagen')
}

function PassPreview({ ev, g }: { ev: RanchEvent; g: Guest }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    void QRCode.toDataURL(passCode(ev, g), { margin: 1, width: 200 }).then((u) => alive && setSrc(u))
    return () => {
      alive = false
    }
  }, [ev, g])
  return src ? <img src={src} alt={`Código QR del pase de ${g.name}`} className="h-14 w-14 rounded-md bg-white p-1" /> : <span className="skeleton h-14 w-14 rounded-md" />
}

const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator

/** Hoja con los pases de los invitados confirmados para compartirlos uno por uno */
export function PassesSheet({ ev, open, onClose, ranchName }: { ev: RanchEvent; open: boolean; onClose: () => void; ranchName: string }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string>()
  const list = useMemo(() => ev.guestList.filter((g) => rsvpOf(g) === 'confirmado' && (!q || norm(g.name).includes(norm(q)))), [ev.guestList, q])
  return (
    <Sheet open={open} onClose={onClose} title="Pases con QR" subtitle="Compártelos por WhatsApp; en la puerta se escanean para registrar la llegada">
      <SearchField value={q} onChange={setQ} placeholder="Buscar invitado" className="mb-4" />
      {list.length === 0 && <p className="py-8 text-center text-sm text-ink-3">Los pases son para invitados confirmados.</p>}
      <div className="flex flex-col gap-2">
        {list.map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-[14px] bg-sunken p-2.5 pr-3">
            <PassPreview ev={ev} g={g} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{g.name}</p>
              <p className="text-xs text-ink-3">
                {g.count === 1 ? '1 pase' : `${g.count} pases`} · {tableLabel(g.table)}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === g.id}
              icon={canShare ? <Share2 size={15} strokeWidth={1.7} /> : <Download size={15} strokeWidth={1.7} />}
              onClick={async () => {
                setBusy(g.id)
                await sharePass(ev, g, ranchName)
                setBusy(undefined)
              }}
            >
              {canShare ? 'Compartir' : 'Descargar'}
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-5 flex items-center gap-2 text-xs text-ink-3">
        <QrCode size={14} strokeWidth={1.6} /> Cada pase sirve solo para este evento.
      </p>
    </Sheet>
  )
}

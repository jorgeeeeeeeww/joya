import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { db, useDoc } from '@/lib/store'
import { usePhotoUrl } from '@/lib/sync'
import type { ID } from '@/lib/types'
import { cx, toast } from './ui'
import { LightDots } from './step1'

/** Reduce la foto a ~1280px JPEG (≈150 KB) antes de guardarla: rápido de subir y ahorra espacio. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    await img.decode()
    return img
  })
  const w = 'width' in bitmap ? bitmap.width : 0
  const h = 'height' in bitmap ? bitmap.height : 0
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Botón para tomar/adjuntar foto; crea el documento en `photos` y devuelve su id. */
export function PhotoButton({ onAdded, taskId, label = 'Tomar foto', className }: { onAdded: (id: ID) => void; taskId?: ID; label?: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try {
            const dataUrl = await compressImage(file)
            const photo = db.upsert('photos', { dataUrl, taskId }, { silent: true })
            onAdded(photo.id)
          } catch {
            toast.error('No se pudo procesar la foto')
          } finally {
            setBusy(false)
          }
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} className={cx('pressable inline-flex h-11 items-center justify-center gap-2 rounded-full bg-secondary px-5 font-medium text-ink', className)}>
        {busy ? <LightDots /> : <Camera size={18} strokeWidth={1.6} />}
        {label}
      </button>
    </>
  )
}

export function PhotoThumb({ id, size = 72, onRemove }: { id: ID; size?: number; onRemove?: () => void }) {
  const photo = useDoc('photos', id)
  const url = usePhotoUrl(photo)
  const [zoom, setZoom] = useState(false)
  return (
    <>
      <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
        <button onClick={() => url && setZoom(true)} className="block h-full w-full overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-line">
          {url ? <img src={url} alt="Evidencia" className="h-full w-full object-cover" loading="lazy" /> : <span className="skeleton block h-full w-full" />}
        </button>
        {onRemove && (
          <button onClick={onRemove} aria-label="Quitar foto" className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-bg shadow-soft">
            <X size={14} />
          </button>
        )}
      </span>
      {createPortal(
        <AnimatePresence>
          {zoom && url && (
            <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoom(false)}>
              <motion.img src={url} alt="Evidencia" className="max-h-full max-w-full rounded-2xl" initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

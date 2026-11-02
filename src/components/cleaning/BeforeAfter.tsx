// Comparador antes / después: una manija con la luz que se arrastra para revelar la foto final
// sobre la inicial. Funciona con dedo, mouse y teclado (flechas).
import { useRef, useState } from 'react'
import { ChevronsLeftRight } from 'lucide-react'
import type { ID } from '@/lib/types'
import { useDoc } from '@/lib/store'
import { usePhotoUrl } from '@/lib/sync'
import { haptic } from '@/lib/motion'

export function BeforeAfter({ beforeId, afterId, className }: { beforeId: ID; afterId: ID; className?: string }) {
  const before = usePhotoUrl(useDoc('photos', beforeId))
  const after = usePhotoUrl(useDoc('photos', afterId))
  const [pos, setPos] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const setFrom = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }
  if (!before || !after) return <div className={`skeleton aspect-[4/3] rounded-[var(--r-lg)] ${className ?? ''}`} />
  return (
    <div
      ref={box}
      className={`relative aspect-[4/3] touch-pan-y overflow-hidden rounded-[var(--r-lg)] bg-sunken select-none ${className ?? ''}`}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        setFrom(e.clientX)
        haptic.select()
      }}
      onPointerMove={(e) => dragging.current && setFrom(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <img src={before} alt="Antes" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <img src={after} alt="Después" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} draggable={false} />
      <span className="absolute top-3 left-3 rounded-full bg-[color-mix(in_oklab,var(--night)_60%,transparent)] px-2.5 py-1 text-xs font-medium text-on-night backdrop-blur">Antes</span>
      <span className="absolute top-3 right-3 rounded-full bg-[color-mix(in_oklab,var(--night)_60%,transparent)] px-2.5 py-1 text-xs font-medium text-on-night backdrop-blur">Después</span>
      <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-luz shadow-[0_0_14px_var(--luz)]" style={{ left: `calc(${pos}% - 1px)` }} />
      <button
        type="button"
        role="slider"
        aria-label="Comparar antes y después"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5))
          if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5))
        }}
        className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-luz text-night shadow-[0_0_0_6px_color-mix(in_oklab,var(--luz)_30%,transparent),var(--shadow-2)]"
        style={{ left: `${pos}%` }}
      >
        <ChevronsLeftRight size={18} strokeWidth={1.8} />
      </button>
    </div>
  )
}

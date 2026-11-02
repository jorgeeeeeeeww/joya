// Firma digital en canvas (pointer events: dedo, lápiz o mouse). Devuelve un PNG en dataURL.
import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { Button, cx } from '@/components/ui'

export function SignaturePad({ onChange, className }: { onChange: (dataUrl: string | null) => void; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  // Ajusta el tamaño real del canvas a la pantalla (nítido en retina)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const resize = () => {
      const r = c.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const prev = !empty ? c.toDataURL() : null
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      const ctx = c.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.4
      ctx.strokeStyle = getComputedStyle(c).color || '#43222A'
      if (prev) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height)
        img.src = prev
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(c)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const exportPng = () => {
    const c = canvasRef.current!
    onChange(c.toDataURL('image/png'))
  }

  const clear = () => {
    const c = canvasRef.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className={cx('relative', className)}>
      <canvas
        ref={canvasRef}
        aria-label="Área de firma: dibuja tu firma con el dedo o el mouse"
        className="block h-44 w-full touch-none rounded-[14px] bg-paper text-ink ring-1 ring-line-strong ring-inset"
        onPointerDown={(e) => {
          ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
          drawing.current = true
          last.current = point(e)
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return
          const ctx = canvasRef.current!.getContext('2d')!
          const p = point(e)
          ctx.beginPath()
          ctx.moveTo(last.current.x, last.current.y)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          last.current = p
          if (empty) setEmpty(false)
        }}
        onPointerUp={() => {
          if (drawing.current && !empty) exportPng()
          drawing.current = false
          last.current = null
        }}
        onPointerCancel={() => {
          drawing.current = false
          last.current = null
        }}
      />
      <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-line-strong" />
      {empty && <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-ink-3">Firma aquí</span>}
      {!empty && (
        <Button variant="ghost" size="sm" icon={<Eraser size={16} strokeWidth={1.6} />} onClick={clear} className="absolute top-2 right-2">
          Borrar
        </Button>
      )}
    </div>
  )
}

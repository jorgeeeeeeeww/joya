// Escáner con la cámara: pases QR en la puerta y códigos de barras del inventario.
// Usa el lector del navegador (Android/Chrome) y, si no existe (iPhone), uno propio que viene
// dentro de la app y se carga solo la primera vez que se escanea.
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CameraOff, Flashlight, Keyboard, ScanLine } from 'lucide-react'
import { ease, haptic } from '@/lib/motion'
import { Button, Sheet } from './ui'
import { TextField } from './fields'

export type CodeFormat = 'qr_code' | 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' | 'code_128' | 'code_39'
interface Detector {
  detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}

async function createDetector(formats: CodeFormat[]): Promise<Detector> {
  const Native = (window as any).BarcodeDetector
  if (Native) {
    try {
      const supported: string[] = (await Native.getSupportedFormats?.()) ?? []
      const use = formats.filter((f) => supported.includes(f))
      if (use.length) return new Native({ formats: use }) as Detector
    } catch {
      /* se usa el lector propio */
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([import('barcode-detector/ponyfill'), import('zxing-wasm/reader/zxing_reader.wasm?url')])
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
  return new BarcodeDetector({ formats }) as unknown as Detector
}

type Status = 'starting' | 'scanning' | 'denied' | 'error' | 'unsupported'

/**
 * Hoja con la cámara trasera. Llama `onResult(texto)` al leer un código.
 * Con `continuous` sigue escaneando (p. ej. recibir invitados uno tras otro).
 */
export function ScannerSheet({ open, onClose, onResult, formats = ['qr_code'], title = 'Escanear código', hint, continuous = false, manualLabel = 'Escribir el código' }: { open: boolean; onClose: () => void; onResult: (text: string) => void; formats?: CodeFormat[]; title?: string; hint?: string; continuous?: boolean; manualLabel?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const [status, setStatus] = useState<Status>('starting')
  const [torch, setTorch] = useState({ on: false, available: false })
  const [manual, setManual] = useState(false)
  const [code, setCode] = useState('')
  const [flash, setFlash] = useState(0)
  const last = useRef({ v: '', t: 0 })
  const resultRef = useRef(onResult)
  resultRef.current = onResult
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    let stream: MediaStream | null = null
    let stopped = false
    let timer = 0
    setStatus('starting')
    setManual(false)
    setCode('')
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported')
        setManual(true)
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      } catch (e: any) {
        setStatus(e?.name === 'NotAllowedError' ? 'denied' : 'error')
        setManual(true)
        return
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play().catch(() => {})
      const track = stream.getVideoTracks()[0] ?? null
      trackRef.current = track
      const caps: any = (track as any)?.getCapabilities?.() ?? {}
      setTorch({ on: false, available: !!caps.torch })
      let detector: Detector
      try {
        detector = await createDetector(formats)
      } catch {
        setStatus('error')
        setManual(true)
        return
      }
      if (stopped) return
      setStatus('scanning')
      const tick = async () => {
        if (stopped) return
        try {
          if (video.readyState >= 2) {
            const res = await detector.detect(video)
            const v = res[0]?.rawValue?.trim()
            if (v && !(v === last.current.v && Date.now() - last.current.t < 2500)) {
              last.current = { v, t: Date.now() }
              haptic.success()
              setFlash((n) => n + 1)
              resultRef.current(v)
              if (!continuous) {
                closeRef.current()
                return
              }
            }
          }
        } catch {
          /* cuadro ilegible: se intenta con el siguiente */
        }
        timer = window.setTimeout(tick, 200)
      }
      void tick()
    })()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleTorch = async () => {
    const t = trackRef.current
    if (!t) return
    try {
      await t.applyConstraints({ advanced: [{ torch: !torch.on } as MediaTrackConstraintSet] })
      setTorch((s) => ({ ...s, on: !s.on }))
    } catch {
      setTorch((s) => ({ ...s, available: false }))
    }
  }

  const submitManual = () => {
    const v = code.trim()
    if (!v) return
    haptic.success()
    onResult(v)
    setCode('')
    if (!continuous) onClose()
  }

  const message: Record<Exclude<Status, 'scanning'>, { title: string; body: string }> = {
    starting: { title: 'Abriendo la cámara…', body: 'Si el navegador pregunta, toca "Permitir".' },
    denied: { title: 'Sin permiso para la cámara', body: 'Actívalo en los ajustes del navegador para este sitio, o escribe el código abajo.' },
    error: { title: 'No se pudo usar la cámara', body: 'Escribe el código abajo o intenta de nuevo.' },
    unsupported: { title: 'Este navegador no tiene cámara', body: 'Escribe el código abajo.' },
  }

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={hint} side="center">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[var(--r-lg)] bg-night sm:aspect-[4/3]">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[56%] w-[74%]">
            {(['top-0 left-0 border-t-2 border-l-2 rounded-tl-[16px]', 'top-0 right-0 border-t-2 border-r-2 rounded-tr-[16px]', 'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-[16px]', 'right-0 bottom-0 border-r-2 border-b-2 rounded-br-[16px]'] as const).map((c) => (
              <span key={c} className={`absolute h-8 w-8 border-luz ${c}`} />
            ))}
            {status === 'scanning' && <motion.span className="absolute inset-x-4 h-[2px] rounded-full bg-luz shadow-[0_0_14px_var(--luz)]" initial={{ top: '10%' }} animate={{ top: ['10%', '90%'] }} transition={{ duration: 2.2, ease: ease.marea, repeat: Infinity, repeatType: 'reverse' }} />}
          </div>
        </div>
        <AnimatePresence>
          {flash > 0 && <motion.div key={flash} className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--luz)_45%,transparent)]" initial={{ opacity: 0.8 }} animate={{ opacity: 0, transition: { duration: 0.6, ease: ease.calma } }} />}
        </AnimatePresence>
        {status !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-on-night">
            {status === 'starting' ? <ScanLine size={30} strokeWidth={1.5} className="text-luz" /> : <CameraOff size={30} strokeWidth={1.5} className="text-on-night-soft" />}
            <p className="font-medium">{message[status].title}</p>
            <p className="max-w-xs text-sm text-on-night-soft">{message[status].body}</p>
          </div>
        )}
        {torch.available && (
          <button onClick={toggleTorch} aria-pressed={torch.on} aria-label="Linterna" className={`absolute right-3 bottom-3 flex h-11 w-11 items-center justify-center rounded-full backdrop-blur ${torch.on ? 'bg-luz text-night' : 'bg-[color-mix(in_oklab,var(--night)_55%,transparent)] text-on-night'}`}>
            <Flashlight size={19} strokeWidth={1.7} />
          </button>
        )}
      </div>
      <div className="mt-4">
        {manual ? (
          <div className="flex items-start gap-2">
            <TextField label={manualLabel} value={code} onChange={setCode} onEnter={submitManual} autoFocus className="flex-1" inputMode="text" />
            <Button className="mt-1" onClick={submitManual} disabled={!code.trim()}>
              Usar
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="w-full" icon={<Keyboard size={17} strokeWidth={1.6} />} onClick={() => setManual(true)}>
            {manualLabel}
          </Button>
        )}
      </div>
    </Sheet>
  )
}

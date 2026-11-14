// Buscar (⌘F): por nombre, código LJ-…, WhatsApp o correo. Busca primero en lo que ya está en la app y
// luego en toda la nube (reservaciones viejas incluidas). ↑ ↓ y Enter para abrir.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CornerDownLeft, Search } from 'lucide-react'
import { useApp } from '@/lib/store'
import { rpc } from '@/lib/nube'
import { activa, ESTADO } from '@/lib/estados'
import { rango } from '@/lib/fechas'
import { mxn } from '@/lib/dinero'
import { nombreDe } from '@/lib/ocupacion'
import type { Reservacion } from '@/lib/tipos'
import { TONE, cx, useLayer } from './ui'
import { formatoTelefono } from './campos'

const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function Buscar() {
  const abierto = useApp((s) => s.buscar)
  const setBuscar = useApp((s) => s.setBuscar)
  useLayer(abierto, () => setBuscar(false))
  return (
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-[60] flex justify-center pt-[12vh]" role="dialog" aria-modal="true" aria-label="Buscar">
          <motion.div className="absolute inset-0 bg-[color-mix(in_oklab,var(--ink)_22%,transparent)] backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setBuscar(false)} />
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2 } }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }} className="relative h-fit w-[min(620px,calc(100vw-48px))] overflow-hidden rounded-[18px] bg-surface shadow-[var(--shadow-3)] ring-1 ring-line">
            <Panel onCerrar={() => setBuscar(false)} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

function Panel({ onCerrar }: { onCerrar: () => void }) {
  const d = useApp((s) => s.datos)
  const [texto, setTexto] = useState('')
  const [remotos, setRemotos] = useState<(Reservacion & { cabana?: string })[]>([])
  const [sel, setSel] = useState(0)
  const lista = useRef<HTMLDivElement>(null)

  const locales = useMemo(() => {
    const t = sinAcentos(texto.trim())
    if (!d || t.length < 2) return []
    const dig = t.replace(/\D/g, '')
    return d.reservaciones.filter((r) => sinAcentos(`${r.nombre} ${r.codigo} ${r.correo ?? ''}`).includes(t) || (dig.length >= 4 && (r.telefono ?? '').includes(dig))).sort((a, b) => b.llegada.localeCompare(a.llegada))
  }, [d, texto])

  useEffect(() => {
    const t = texto.trim()
    if (t.length < 2) return setRemotos([])
    let vivo = true
    const h = setTimeout(() => {
      rpc<(Reservacion & { cabana: string })[]>('hosp_buscar', { p_texto: t })
        .then((x) => vivo && setRemotos(x))
        .catch(() => vivo && setRemotos([]))
    }, 220)
    return () => {
      vivo = false
      clearTimeout(h)
    }
  }, [texto])

  const resultados = useMemo(() => {
    const ids = new Set(locales.map((r) => r.id))
    return [...locales, ...remotos.filter((r) => !ids.has(r.id))].slice(0, 30)
  }, [locales, remotos])
  useEffect(() => setSel(0), [texto])

  const abrir = (r: Reservacion) => {
    onCerrar()
    useApp.getState().ir('reservaciones')
    useApp.getState().setFiltro(activa(r) ? 'todas' : 'canceladas')
    useApp.getState().abrir(r.id)
  }

  return (
    <div>
      <label className="flex h-14 items-center gap-3 border-b border-line px-5">
        <Search size={18} className="text-ink-3" />
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nombre, código LJ-…, WhatsApp o correo"
          className="campo-libre min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-3"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const n = Math.max(0, Math.min(resultados.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)))
              setSel(n)
              lista.current?.children[n]?.scrollIntoView({ block: 'nearest' })
            } else if (e.key === 'Enter' && resultados[sel]) {
              e.preventDefault()
              abrir(resultados[sel]!)
            }
          }}
        />
        <kbd className="tecla">esc</kbd>
      </label>
      <div ref={lista} className="scroll-area max-h-[52vh] overflow-y-auto p-2">
        {texto.trim().length < 2 ? (
          <p className="px-3 py-6 text-center text-[13px] text-ink-3">Escribe al menos dos letras o los últimos dígitos del WhatsApp.</p>
        ) : resultados.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-ink-3">Nada con «{texto.trim()}».</p>
        ) : (
          resultados.map((r, i) => {
            const e = ESTADO[activa(r) ? r.estado : 'cancelada']
            return (
              <button key={r.id} onClick={() => abrir(r)} onPointerMove={() => setSel(i)} className={cx('flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left', i === sel && 'bg-wash')}>
                <span className={cx('h-2 w-2 shrink-0 rounded-full', TONE[e.tono].solid)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">
                    {r.nombre} <span className="text-[12px] font-normal text-ink-3 tabular">{r.codigo}</span>
                  </span>
                  <span className="block text-[13px] text-ink-soft">
                    {(r as Reservacion & { cabana?: string }).cabana ?? nombreDe(d, r.cabana_id)} · {rango(r.llegada, r.salida)} · {e.label}
                    {r.telefono ? ` · ${formatoTelefono(r.telefono)}` : ''}
                  </span>
                </span>
                <span className="text-[13px] text-key tabular">{mxn(r.total)}</span>
                {i === sel && <CornerDownLeft size={14} className="text-ink-3" />}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// Modo conteo: una tarjeta grande por artículo con +/− enorme. Se pasa al siguiente deslizando o
// con las flechas; al final se ven las diferencias y se aplican todas juntas (con deshacer).
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, ScanLine } from 'lucide-react'
import type { InventoryItem } from '@/lib/types'
import { db } from '@/lib/store'
import { INVENTORY_CATEGORY } from '@/lib/meta'
import { ease, haptic } from '@/lib/motion'
import { withUndo } from '@/lib/undo'
import { Badge, Button, ProgressBar, Sheet, cx } from '@/components/ui'
import { Stepper } from '@/components/fields'

export function CountMode({ open, onClose, items, startId, onScan }: { open: boolean; onClose: () => void; items: InventoryItem[]; startId?: string; onScan?: () => void }) {
  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [review, setReview] = useState(false)
  useEffect(() => {
    if (!open) return
    setCounts({})
    setReview(false)
  }, [open])
  useEffect(() => {
    if (!open || !startId) return
    const i = items.findIndex((x) => x.id === startId)
    if (i >= 0) setIdx(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startId])
  const item = items[idx]
  const go = (d: 1 | -1) => {
    const n = idx + d
    if (n < 0) return
    if (n >= items.length) return setReview(true)
    haptic.select()
    setDir(d)
    setIdx(n)
  }
  const diffs = useMemo(() => items.filter((i) => counts[i.id] !== undefined && counts[i.id] !== i.stock), [items, counts])
  const counted = Object.keys(counts).length
  const apply = () => {
    const before = diffs.map((i) => ({ id: i.id, stock: i.stock }))
    for (const i of diffs) db.patch('inventory', i.id, { stock: counts[i.id]! }, { summary: `Conteo de ${i.name}: ${counts[i.id]} ${i.unit}` })
    withUndo(`Conteo aplicado · ${diffs.length} ${diffs.length === 1 ? 'cambio' : 'cambios'}`, () => before.forEach((b) => db.patch('inventory', b.id, { stock: b.stock })))
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={review ? 'Revisar conteo' : 'Contar inventario'} subtitle={review ? `${counted} contados · ${diffs.length} con diferencia` : `${idx + 1} de ${items.length}`} side="center">
      {!review && item ? (
        <div className="flex flex-col gap-5">
          <ProgressBar value={(idx + 1) / items.length} />
          <div className="relative overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={item.id}
                custom={dir}
                initial={{ opacity: 0, x: dir * 60 }}
                animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: ease.calma } }}
                exit={{ opacity: 0, x: dir * -60, transition: { duration: 0.16, ease: ease.salida } }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.3}
                onDragEnd={(_, i) => {
                  if (i.offset.x < -70) go(1)
                  else if (i.offset.x > 70) go(-1)
                }}
                className="flex flex-col items-center rounded-[var(--r-lg)] bg-sunken px-5 py-7 text-center"
              >
                <Badge tone={INVENTORY_CATEGORY[item.category].tone}>{INVENTORY_CATEGORY[item.category].label}</Badge>
                <h3 className="heading mt-3 text-[1.7rem]">{item.name}</h3>
                <p className="mt-1 text-sm text-ink-soft">
                  {item.location ?? 'Sin ubicación'} · el sistema dice {item.stock} {item.unit}
                </p>
                <div className="mt-6">
                  <Stepper size="lg" value={counts[item.id] ?? item.stock} onChange={(n) => setCounts((c) => ({ ...c, [item.id]: n }))} min={0} max={99999} />
                </div>
                <p className={cx('mt-3 h-5 text-sm tabular', (counts[item.id] ?? item.stock) !== item.stock ? ((counts[item.id] ?? 0) < item.stock ? 'text-danger' : 'text-success') : 'text-ink-3')}>
                  {counts[item.id] === undefined ? 'Ajusta si no coincide' : counts[item.id] === item.stock ? 'Coincide' : `${counts[item.id]! - item.stock > 0 ? '+' : ''}${counts[item.id]! - item.stock} ${item.unit}`}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Anterior" onClick={() => go(-1)} disabled={idx === 0}>
              <ArrowLeft size={18} strokeWidth={1.6} />
            </Button>
            {onScan && (
              <Button variant="outline" icon={<ScanLine size={17} strokeWidth={1.6} />} onClick={onScan}>
                Escanear
              </Button>
            )}
            <Button
              className="ml-auto"
              iconRight={<ArrowRight size={17} strokeWidth={1.6} />}
              onClick={() => {
                if (counts[item.id] === undefined) setCounts((c) => ({ ...c, [item.id]: item.stock }))
                go(1)
              }}
            >
              {idx === items.length - 1 ? 'Revisar' : counts[item.id] === undefined ? 'Coincide, siguiente' : 'Siguiente'}
            </Button>
          </div>
          <p className="text-center text-xs text-ink-3">Desliza la tarjeta para pasar de artículo</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {diffs.length === 0 ? (
            <p className="rounded-[14px] bg-[color-mix(in_oklab,var(--success)_10%,var(--surface))] p-4 text-sm text-success">Todo coincide con lo que dice el sistema.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {diffs.map((i) => {
                const d = counts[i.id]! - i.stock
                return (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{i.name}</span>
                      <span className="text-xs text-ink-3">
                        {i.stock} → {counts[i.id]} {i.unit}
                      </span>
                    </span>
                    <span className={cx('text-sm font-semibold tabular', d < 0 ? 'text-danger' : 'text-success')}>
                      {d > 0 ? '+' : ''}
                      {d}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setReview(false)}>
              Seguir contando
            </Button>
            <Button className="ml-auto" icon={diffs.length ? <ClipboardCheck size={17} strokeWidth={1.6} /> : <Check size={17} strokeWidth={1.6} />} onClick={diffs.length ? apply : onClose}>
              {diffs.length ? `Aplicar ${diffs.length} ${diffs.length === 1 ? 'cambio' : 'cambios'}` : 'Listo'}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

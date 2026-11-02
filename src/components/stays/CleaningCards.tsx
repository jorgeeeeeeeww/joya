// Tarjetas de limpieza compartidas por "Mi día" y la página de Limpieza.
import { motion } from 'motion/react'
import { AlertTriangle, Check, ChevronRight } from 'lucide-react'
import { PRIORITY, TASK_STATUS } from '@/lib/meta'
import { fadeRise } from '@/lib/motion'
import type { Reservation, Task, Unit } from '@/lib/types'
import { Badge, cx, ProgressRing } from '@/components/ui'
import { arrivalText, nextArrival } from './CleaningFlow'
import { today } from '@/lib/format'

export const PRIORITY_ORDER = { urgente: 0, alta: 1, media: 2, baja: 3 } as const
export const STATUS_ORDER = { 'en-progreso': 0, pendiente: 1, hecha: 2, verificada: 3 } as const
export const sortCleaning = (a: Task, b: Task) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.due ?? '').localeCompare(b.due ?? '')

export function CleaningRow({ task, unit, reservations, onOpen }: { task: Task; unit?: Unit; reservations: Reservation[]; onOpen: () => void }) {
  const next = unit ? nextArrival(reservations, unit.id) : undefined
  const done = task.checklist.filter((c) => c.done).length
  const progress = task.checklist.length ? done / task.checklist.length : 0
  const finished = task.status === 'hecha' || task.status === 'verificada'
  const arrivalToday = next?.checkIn === today()
  return (
    <motion.button
      variants={fadeRise}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className={cx('card lift flex w-full items-center gap-4 p-4 text-left', task.status === 'en-progreso' && 'ring-[1.5px] ring-primary', finished && 'opacity-70')}
    >
      <ProgressRing value={finished ? 1 : progress} size={56} stroke={4} gradient={!finished} tone="sage">
        {finished ? <Check size={20} strokeWidth={1.6} className="text-success" /> : <span className="text-[13px] tabular">{done}/{task.checklist.length}</span>}
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={TASK_STATUS[task.status].tone} dot>
            {TASK_STATUS[task.status].label}
          </Badge>
          {(task.priority === 'urgente' || task.priority === 'alta') && !finished && <Badge tone={PRIORITY[task.priority].tone}>{PRIORITY[task.priority].label}</Badge>}
        </div>
        <p className="heading mt-1.5 truncate text-[1.3rem]">{unit?.name ?? task.title}</p>
        <p className={cx('mt-0.5 flex items-center gap-1.5 truncate text-sm', arrivalToday && !finished ? 'text-warning' : 'text-ink-soft')}>
          {arrivalToday && !finished && <AlertTriangle size={14} strokeWidth={1.6} className="shrink-0" />}
          {arrivalText(next)}
        </p>
      </div>
      <ChevronRight size={20} strokeWidth={1.6} className="shrink-0 text-ink-3" />
    </motion.button>
  )
}

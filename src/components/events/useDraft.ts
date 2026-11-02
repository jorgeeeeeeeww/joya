import { useEffect, useRef, useState } from 'react'
import { db } from '@/lib/store'
import type { RanchEvent } from '@/lib/types'

/**
 * Copia local editable de un campo del evento: la UI responde al instante y el guardado
 * (con bitácora y sincronización) ocurre con un pequeño retraso para no registrar cada tecla.
 */
export function useEventDraft<K extends keyof RanchEvent>(ev: RanchEvent, key: K, delay = 600) {
  const [val, setVal] = useState<RanchEvent[K]>(ev[key])
  const latest = useRef(val)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const idRef = useRef(ev.id)
  idRef.current = ev.id

  const remote = ev[key]
  useEffect(() => {
    if (!dirty.current) {
      setVal(remote)
      latest.current = remote
    }
  }, [remote])

  const flush = () => {
    if (!dirty.current) return
    clearTimeout(timer.current)
    dirty.current = false
    db.patch('events', idRef.current, { [key]: latest.current } as Partial<RanchEvent>)
  }

  const set = (v: RanchEvent[K] | ((prev: RanchEvent[K]) => RanchEvent[K])) => {
    const next = typeof v === 'function' ? (v as (p: RanchEvent[K]) => RanchEvent[K])(latest.current) : v
    latest.current = next
    setVal(next)
    dirty.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }

  useEffect(() => () => flush(), []) // guarda al salir
  return [val, set, flush] as const
}

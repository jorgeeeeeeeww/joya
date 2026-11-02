// Inicio personalizable: cada persona elige qué tarjetas ve en cada pestaña y en qué orden.
// Se guarda en sus preferencias (settings.userPrefs[uid].home[pestaña]).
import { useMemo, useState, type ReactNode } from 'react'
import { Eye, EyeOff, RotateCcw } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Button, Sheet, Toggle, cx } from '@/components/ui'
import { SortableList } from '@/components/interact'

export interface HomeBlock {
  id: string
  label: string
  hint?: string
  node: ReactNode
  /** Ancho en escritorio */
  span?: 'full' | 'wide' | 'narrow'
}

export function useHomeLayout(tab: string, blocks: HomeBlock[]) {
  const uid = useStore((s) => s.session.userId)
  const pref = useStore((s) => (uid ? s.settings.userPrefs?.[uid]?.home?.[tab] : undefined))
  const ordered = useMemo(() => {
    const order = pref?.order ?? []
    const known = order.map((id) => blocks.find((b) => b.id === id)).filter(Boolean) as HomeBlock[]
    return [...known, ...blocks.filter((b) => !order.includes(b.id))]
  }, [pref, blocks])
  const hidden = new Set(pref?.hidden ?? [])
  const save = (order: string[], hiddenIds: string[]) => {
    const s = useStore.getState()
    if (!uid) return
    const prefs = s.settings.userPrefs ?? {}
    const mine = prefs[uid] ?? {}
    s.setSettings({ userPrefs: { ...prefs, [uid]: { ...mine, home: { ...(mine.home ?? {}), [tab]: { order, hidden: hiddenIds } } } } })
  }
  return { ordered, hidden, save, visible: ordered.filter((b) => !hidden.has(b.id)) }
}

export function HomeGrid({ blocks }: { blocks: HomeBlock[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:gap-6">
      {blocks.map((b) => (
        <div key={b.id} className={cx('min-w-0', b.span === 'narrow' ? 'xl:col-span-5' : b.span === 'wide' ? 'xl:col-span-7' : 'xl:col-span-12')}>
          {b.node}
        </div>
      ))}
    </div>
  )
}

/** Hoja "Personalizar": arrastra para ordenar y apaga lo que no te sirve */
export function CustomizeSheet({ open, onClose, title, layout }: { open: boolean; onClose: () => void; title: string; layout: ReturnType<typeof useHomeLayout> }) {
  const [order, setOrder] = useState<string[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [prev, setPrev] = useState(false)
  if (open !== prev) {
    setPrev(open)
    if (open) {
      setOrder(layout.ordered.map((b) => b.id))
      setHidden([...layout.hidden])
    }
  }
  const items = order.map((id) => layout.ordered.find((b) => b.id === id)!).filter(Boolean)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Personalizar · ${title}`}
      subtitle="Arrastra para cambiar el orden y apaga las tarjetas que no uses"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon={<RotateCcw size={16} strokeWidth={1.6} />} onClick={() => (layout.save([], []), onClose())}>
            Restablecer
          </Button>
          <Button className="ml-auto" onClick={() => (layout.save(order, hidden), onClose())}>
            Guardar
          </Button>
        </div>
      }
    >
      <SortableList
        items={items}
        getId={(b) => b.id}
        onReorder={(next) => setOrder(next.map((b) => b.id))}
        renderItem={(b, handle) => {
          const off = hidden.includes(b.id)
          return (
            <div className={cx('flex items-center gap-2 rounded-[14px] bg-sunken py-2 pr-3 pl-1.5 transition-opacity', off && 'opacity-55')}>
              {handle}
              {off ? <EyeOff size={16} strokeWidth={1.6} className="text-ink-3" /> : <Eye size={16} strokeWidth={1.6} className="text-ink-soft" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{b.label}</span>
                {b.hint && <span className="block truncate text-xs text-ink-3">{b.hint}</span>}
              </span>
              <Toggle checked={!off} onChange={(v) => setHidden((h) => (v ? h.filter((x) => x !== b.id) : [...h, b.id]))} />
            </div>
          )
        }}
      />
    </Sheet>
  )
}

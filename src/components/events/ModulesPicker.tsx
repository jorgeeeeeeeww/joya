// Interruptores de "qué usa este evento": cada uno dice para qué sirve, para que cualquiera sepa qué está prendiendo.
import { MODULES, type EventModule } from '@/lib/modules'
import { Toggle } from '@/components/ui'

export function ModulesPicker({ value, onChange, showMoney = true }: { value: Record<EventModule, boolean>; onChange: (m: EventModule, on: boolean) => void; showMoney?: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-line rounded-[16px] ring-1 ring-line">
      {MODULES.filter((m) => showMoney || !m.money).map((m) => (
        <div key={m.id} className="px-4 py-3">
          <Toggle checked={value[m.id]} onChange={(on) => onChange(m.id, on)} label={m.label} description={m.help} />
        </div>
      ))}
    </div>
  )
}

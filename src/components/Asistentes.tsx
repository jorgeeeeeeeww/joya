// Asistentes: tareas del dueño hechas paso a paso, solo eligiendo. Nada de términos técnicos.
import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, Smartphone, Tags, UserPlus } from 'lucide-react'
import { db, useStore } from '@/lib/store'
import { hashPin } from '@/lib/crypto'
import { ROLE } from '@/lib/meta'
import type { Pastel, Role } from '@/lib/types'
import { Button, Card, cx, Field, Input, Sheet, toast } from '@/components/ui'
import { LinkDevice } from '@/components/CloudCenter'

const ROLE_SEES: Record<Role, string> = {
  admin: 'Ve todo: dinero, equipo, eventos, hospedaje y ajustes.',
  eventos: 'Organiza eventos: clientes, invitados, mesas, proveedores y mensajes.',
  recepcion: 'Recibe huéspedes: reservas, llegadas, salidas, cobros y el mapa.',
  limpieza: 'Su ruta del día: qué casa limpiar, paso por paso, y reportar algo.',
  mantenimiento: 'Reparaciones e incidencias, el mapa y el inventario.',
}
const COLORS: Pastel[] = ['sage', 'sky', 'butter', 'lavender', 'peach', 'mint', 'rose']

function Steps({ n, at }: { n: number; at: number }) {
  return (
    <div className="mb-5 flex gap-1.5" aria-label={`Paso ${at + 1} de ${n}`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors', i <= at ? 'bg-primary' : 'bg-line-strong')} />
      ))}
    </div>
  )
}

/** Agregar a alguien al equipo: nombre → puesto → PIN */
export function NuevoEmpleado({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('limpieza')
  const [pin, setPin] = useState('')
  const reset = () => {
    setStep(0)
    setName('')
    setPin('')
    setRole('limpieza')
  }
  const close = () => {
    reset()
    onClose()
  }
  const save = () => {
    const emp = db.upsert('employees', { name: name.trim(), role, color: COLORS[Math.floor(Math.random() * COLORS.length)]!, active: true, pinHash: 'pendiente' })
    db.patch('employees', emp.id, { pinHash: hashPin(emp.id, pin) }, { summary: `Dio de alta a ${emp.name}` })
    toast.success(`${name.trim().split(' ')[0]} ya está en el equipo`, `Entra con su nombre y el PIN ${pin.replace(/./g, '•')}.`)
    close()
  }
  const can = step === 0 ? name.trim().length >= 2 : step === 1 ? true : /^\d{4}$/.test(pin)
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Agregar a alguien al equipo"
      subtitle="Tres pasos y queda listo para entrar"
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" icon={step ? <ArrowLeft size={17} strokeWidth={1.6} /> : undefined} onClick={() => (step ? setStep(step - 1) : close())}>
            {step ? 'Atrás' : 'Cancelar'}
          </Button>
          {step < 2 ? (
            <Button disabled={!can} onClick={() => setStep(step + 1)} iconRight={<ArrowRight size={17} strokeWidth={1.6} />}>
              Siguiente
            </Button>
          ) : (
            <Button disabled={!can} onClick={save} icon={<Check size={18} strokeWidth={1.6} />}>
              Agregar
            </Button>
          )}
        </div>
      }
    >
      <Steps n={3} at={step} />
      {step === 0 && (
        <Field label="¿Cómo se llama?" hint="Nombre y apellido, como lo verá el equipo">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" placeholder="Ej. Rosa Hernández" />
        </Field>
      )}
      {step === 1 && (
        <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Puesto">
          <p className="mb-1 text-[15px] font-medium">¿Qué va a hacer en el rancho?</p>
          {(Object.keys(ROLE) as Role[]).map((r) => (
            <button key={r} role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={cx('pressable rounded-[16px] p-4 text-left ring-inset', role === r ? 'bg-[color-mix(in_oklab,var(--primary)_8%,var(--surface))] ring-[1.5px] ring-primary' : 'ring-1 ring-line hover:bg-wash')}>
              <span className="block font-semibold">{ROLE[r].label}</span>
              <span className="mt-0.5 block text-sm text-ink-soft">{ROLE_SEES[r]}</span>
            </button>
          ))}
        </div>
      )}
      {step === 2 && (
        <Field label="Su PIN de 4 números" hint="Con este PIN entra a su panel. Díselo en persona.">
          <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="off" placeholder="••••" className="text-center text-2xl tracking-[0.5em]" autoFocus />
        </Field>
      )}
    </Sheet>
  )
}

/** Conectar un celular nuevo: se escanea el código y el celular queda conectado al rancho */
export function ConectarCelular({ open, onClose }: { open: boolean; onClose: () => void }) {
  const linked = useStore((s) => !!s.settings.supabaseUrl)
  return (
    <Sheet open={open} onClose={onClose} title="Conectar un celular nuevo" subtitle="Para que alguien del equipo use la app en su teléfono">
      {linked ? (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-2 text-[15px]">
            <li>1. En el celular nuevo, abre la cámara y apunta a este código.</li>
            <li>2. Se abre La Joya ya conectada al rancho.</li>
            <li>3. Entra con la cuenta del rancho y listo: todo se comparte al instante.</li>
          </ol>
          <LinkDevice />
        </div>
      ) : (
        <p className="text-[15px] text-ink-soft">Este equipo todavía no está conectado a la nube del rancho. Pídele a quien instaló el sistema que lo conecte desde el panel de desarrollador; después podrás conectar los celulares aquí con un código.</p>
      )}
    </Sheet>
  )
}

function Tile({ icon, title, body, onClick }: { icon: ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card lift pressable flex items-start gap-3 p-4 text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-soft">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-ink-soft">{body}</span>
      </span>
    </button>
  )
}

/** Tarjetas de "¿Qué quieres hacer?" para el dueño */
export function AsistentesGrid({ onPrices }: { onPrices: () => void }) {
  const [emp, setEmp] = useState(false)
  const [cel, setCel] = useState(false)
  return (
    <Card className="p-5 md:p-6">
      <p className="eyebrow">Asistentes</p>
      <p className="heading mt-1 text-xl">¿Qué quieres hacer?</p>
      <p className="mt-1 text-sm text-ink-soft">Te guiamos paso a paso, solo eligiendo.</p>
      <div className="mt-4 grid gap-3 @xl:grid-cols-3 md:grid-cols-3">
        <Tile icon={<UserPlus size={18} strokeWidth={1.6} />} title="Agregar a alguien al equipo" body="Nombre, puesto y su PIN." onClick={() => setEmp(true)} />
        <Tile icon={<Smartphone size={18} strokeWidth={1.6} />} title="Conectar un celular" body="Con un código, sin escribir nada." onClick={() => setCel(true)} />
        <Tile icon={<Tags size={18} strokeWidth={1.6} />} title="Poner precios de paquetes" body="Para que las cotizaciones salgan solas." onClick={onPrices} />
      </div>
      <NuevoEmpleado open={emp} onClose={() => setEmp(false)} />
      <ConectarCelular open={cel} onClose={() => setCel(false)} />
    </Card>
  )
}

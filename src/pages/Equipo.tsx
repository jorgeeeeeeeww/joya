import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { CalendarRange, KeyRound, MessageCircle, Plus, Timer, UserPlus, Users } from 'lucide-react'
import { Choices, FormScope, PhoneField, TextField } from '@/components/fields'
import { ShiftGrid } from '@/components/team/ShiftGrid'
import { db, useCollection, useMe } from '@/lib/store'
import { ROLE, TONE } from '@/lib/meta'
import { ago, waLink } from '@/lib/format'
import { hashPin } from '@/lib/crypto'
import { fadeRise, stagger } from '@/lib/motion'
import type { Employee, Pastel, Role } from '@/lib/types'
import { Avatar, Badge, Button, Card, cx, PageHeader, Segmented, Sheet, Toggle, toast } from '@/components/ui'
import { Sparkle } from '@/components/step1'

const COLORS: Pastel[] = ['lavender', 'mint', 'peach', 'sky', 'rose', 'butter', 'sage']

function EmployeeSheet({ emp, open, onClose }: { emp?: Employee; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Employee>>({})
  const [pin, setPin] = useState('')
  const [prev, setPrev] = useState(false)
  const [reveal, setReveal] = useState(false)
  if (open !== prev) {
    setPrev(open)
    if (open) {
      setForm(emp ?? { role: 'limpieza', color: 'mint', active: true })
      setPin('')
      setReveal(false)
    }
  }
  const set = (p: Partial<Employee>) => setForm((f) => ({ ...f, ...p }))
  const save = () => {
    if (!form.name?.trim()) {
      setReveal(true)
      return toast.error('Falta el nombre', 'Escribe nombre y apellido.')
    }
    if (!emp && !/^\d{4}$/.test(pin)) return toast.error('El PIN debe tener 4 dígitos', 'Solo números, por ejemplo 2580.')
    if (pin && !/^\d{4}$/.test(pin)) return toast.error('El PIN debe tener 4 dígitos', 'Solo números, por ejemplo 2580.')
    const saved = db.upsert('employees', { ...form, pinHash: form.pinHash ?? 'pendiente' } as Employee)
    if (pin) db.patch('employees', saved.id, { pinHash: hashPin(saved.id, pin) }, { summary: `Cambió el PIN de ${saved.name}` })
    toast.success(emp ? 'Datos actualizados' : 'Persona agregada', pin ? 'El PIN se guardó cifrado.' : undefined)
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={emp ? emp.name : 'Agregar persona'}
      subtitle={emp ? ROLE[emp.role].label : 'Cada persona entra con su propio PIN y ve su propio panel.'}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>{emp ? 'Guardar cambios' : 'Agregar al equipo'}</Button>
        </div>
      }
    >
      <FormScope reveal={reveal}>
        <div className="flex flex-col gap-5">
          <div className="flex justify-center py-1">
            <Avatar name={form.name || '?'} tone={form.color} size={76} />
          </div>
          <TextField label="Nombre" value={form.name ?? ''} onChange={(v) => set({ name: v })} capitalizeWords required requiredMsg="Escribe nombre y apellido" autoComplete="name" />
          <Choices label="Rol" variant="cards" value={form.role} onChange={(r) => set({ role: r })} options={(Object.keys(ROLE) as Role[]).map((r) => ({ value: r, label: ROLE[r].label, hint: ROLE[r].description, tone: ROLE[r].tone, icon: <Users /> }))} />
          <Choices label="Color" value={form.color} onChange={(c) => set({ color: c })} size="sm" options={COLORS.map((c) => ({ value: c, label: <span className={cx('block h-4 w-4 rounded-full', TONE[c].solid)} aria-label={c} />, tone: c }))} />
          <PhoneField label="Teléfono (WhatsApp)" value={form.phone} onChange={(v) => set({ phone: v })} />
          <TextField label={emp ? 'Nuevo PIN (opcional)' : 'PIN de 4 dígitos'} type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(v) => setPin(v.replace(/\D/g, ''))} autoComplete="new-password" hint="Se guarda cifrado; nadie puede verlo después." required={!emp} requiredMsg="Elige un PIN de 4 números" validate={(v) => (String(v ?? '').length > 0 && String(v).length < 4 ? `Faltan ${4 - String(v).length} números` : undefined)} />
          {emp && <Toggle checked={!!form.active} onChange={(v) => set({ active: v })} label="Activo" description="Si lo desactivas ya no podrá entrar al sistema." />}
        </div>
      </FormScope>
    </Sheet>
  )
}

export default function Equipo() {
  const employees = useCollection('employees')
  const tasks = useCollection('tasks')
  const audit = useCollection('audit')
  const me = useMe()
  const [edit, setEdit] = useState<Employee | undefined>()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'personas' | 'horarios'>('personas')
  const admin = me?.role === 'admin'

  const stats = useMemo(() => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    return Object.fromEntries(
      employees.map((e) => {
        const mine = tasks.filter((t) => t.assigneeId === e.id)
        const done = mine.filter((t) => (t.status === 'hecha' || t.status === 'verificada') && (t.completedAt ?? t.updatedAt) >= since)
        const cleanTimes = done.filter((t) => t.type === 'limpieza' && t.startedAt && t.completedAt).map((t) => (new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()) / 60000)
        const avg = cleanTimes.length ? Math.round(cleanTimes.reduce((a, b) => a + b, 0) / cleanTimes.length) : null
        const lastSeen = audit.filter((a) => a.userId === e.id).sort((a, b) => b.at.localeCompare(a.at))[0]?.at
        const doing = mine.find((t) => t.status === 'en-progreso')
        return [e.id, { open: mine.filter((t) => t.status === 'pendiente' || t.status === 'en-progreso').length, done: done.length, avg, lastSeen, doing }]
      }),
    )
  }, [employees, tasks, audit])

  const top = [...employees].sort((a, b) => (stats[b.id]?.done ?? 0) - (stats[a.id]?.done ?? 0))[0]
  const openNew = () => {
    setEdit(undefined)
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Negocio"
        title="Equipo"
        subtitle={`${employees.filter((e) => e.active).length} personas activas. Cada una con su PIN y su propio panel.`}
        primary={admin ? { label: 'Agregar persona', icon: <UserPlus size={18} strokeWidth={1.6} />, onClick: openNew } : undefined}
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'personas', label: <><Users size={16} strokeWidth={1.6} /> Personas</> },
              { value: 'horarios', label: <><CalendarRange size={16} strokeWidth={1.6} /> Horarios</> },
            ]}
          />
        }
      />
      {tab === 'horarios' ? (
        <ShiftGrid employees={employees.filter((e) => e.active && e.role !== 'admin')} editable={admin} />
      ) : (
      <>
      {top && (stats[top.id]?.done ?? 0) > 0 && (
        <div className="mb-7 flex items-center gap-4 rounded-[var(--r-lg)] bg-[color-mix(in_oklab,var(--luz)_32%,var(--surface))] px-5 py-4 ring-1 ring-line">
          <Sparkle className="text-lg text-chispa" />
          <p className="text-[15px]">
            <span className="font-medium">{top.name}</span> lleva <span className="display-num text-xl text-chispa">{stats[top.id]!.done}</span> {stats[top.id]!.done === 1 ? 'tarea terminada' : 'tareas terminadas'} en los últimos 30 días.
          </p>
        </div>
      )}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {employees.map((e) => {
          const s = stats[e.id]!
          return (
            <motion.div key={e.id} variants={fadeRise}>
              <Card className={cx('h-full p-5 md:p-6', !e.active && 'opacity-50')}>
                <div className="flex items-center gap-4">
                  <span className="relative">
                    <Avatar name={e.name} tone={e.color} size={56} />
                    {s.doing && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full bg-success ring-2 ring-surface" title="Trabajando ahora" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="heading truncate text-[1.4rem]">{e.name}</h2>
                    <div className="mt-1">
                      <Badge tone={ROLE[e.role].tone}>{ROLE[e.role].label}</Badge>
                    </div>
                  </div>
                </div>
                {s.doing && <p className="mt-4 truncate rounded-[14px] bg-sunken px-3.5 py-2.5 text-[13px] text-ink-soft">Ahora: {s.doing.title}</p>}
                <div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-[18px] bg-sunken py-3 text-center">
                  <div>
                    <div className="display-num text-[1.7rem]">{s.open}</div>
                    <div className="mt-0.5 text-[11px] text-detail">Abiertas</div>
                  </div>
                  <div>
                    <div className="display-num text-[1.7rem]">{s.done}</div>
                    <div className="mt-0.5 text-[11px] text-detail">Hechas · 30 d</div>
                  </div>
                  <div>
                    <div className="display-num text-[1.7rem]">{s.avg ?? '—'}</div>
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-detail">
                      <Timer size={11} strokeWidth={1.6} /> min por limpieza
                    </div>
                  </div>
                </div>
                <p className="mt-3.5 text-xs text-ink-3">{s.lastSeen ? `Última actividad ${ago(s.lastSeen)}` : 'Sin actividad registrada'}</p>
                <div className="mt-4 flex gap-2">
                  {e.phone && (
                    <a href={waLink(e.phone, `Hola ${e.name.split(' ')[0]}, `)} target="_blank" rel="noreferrer" className="flex-1">
                      <Button size="sm" variant="secondary" className="w-full" icon={<MessageCircle size={16} strokeWidth={1.6} />}>
                        WhatsApp
                      </Button>
                    </a>
                  )}
                  {admin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      icon={<KeyRound size={16} strokeWidth={1.6} />}
                      onClick={() => {
                        setEdit(e)
                        setOpen(true)
                      }}
                    >
                      Editar
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          )
        })}
        {admin && (
          <motion.div variants={fadeRise}>
            <button onClick={openNew} className="pressable flex h-full min-h-[260px] w-full flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-line-strong p-6 text-ink-soft hover:bg-wash hover:text-ink">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--luz)_55%,var(--surface))] text-night ring-[5px] ring-[color-mix(in_oklab,var(--luz)_22%,transparent)]">
                <Plus size={20} strokeWidth={1.6} />
              </span>
              <span className="font-medium">Agregar persona</span>
              <span className="max-w-[26ch] text-center text-xs">Aún no sabemos cuántos serán: agrégalos cuando quieras.</span>
            </button>
          </motion.div>
        )}
      </motion.div>
      </>
      )}
      <EmployeeSheet emp={edit} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

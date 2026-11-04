// Hojas de la estación de invitados: editar un invitado e importar una lista pegada o CSV.
import { useEffect, useMemo, useState } from 'react'
import { ClipboardPaste, Crown, Trash2 } from 'lucide-react'
import type { Guest, RanchEvent, Rsvp } from '@/lib/types'
import { uid } from '@/lib/format'
import { Button, Confirm, Field, Input, Segmented, Select, Sheet, Textarea, Toggle, cx, toast } from '@/components/ui'
import { parseGuestList, rsvpOf, tableLabel, tablesOf } from './guestUtils'

export const RSVP_META: Record<Rsvp, { label: string; tone: 'sage' | 'butter' | 'rose' }> = {
  confirmado: { label: 'Confirmado', tone: 'sage' },
  pendiente: { label: 'Pendiente', tone: 'butter' },
  declinado: { label: 'No asiste', tone: 'rose' },
}

export function GuestSheet({ ev, guest, open, onClose, onSave, onDelete, sides }: { ev: RanchEvent; guest?: Guest; open: boolean; onClose: () => void; onSave: (g: Guest) => void; onDelete?: (id: string) => void; sides: string[] }) {
  const [g, setG] = useState<Guest>(() => guest ?? blank())
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => {
    if (open) setG(guest ? { ...guest, rsvp: rsvpOf(guest) } : blank())
  }, [open, guest])
  const tables = useMemo(() => tablesOf(ev), [ev])
  const set = (p: Partial<Guest>) => setG((x) => ({ ...x, ...p }))
  const save = () => {
    if (!g.name.trim()) return toast.error('Escribe el nombre del invitado')
    onSave({ ...g, name: g.name.trim(), confirmed: g.rsvp === 'confirmado' })
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={guest ? 'Editar invitado' : 'Nuevo invitado'}
      subtitle={ev.title}
      footer={
        <div className="flex items-center gap-2">
          {guest && onDelete && (
            <Button variant="ghost" size="icon" aria-label="Eliminar invitado" onClick={() => setConfirmDel(true)}>
              <Trash2 size={18} strokeWidth={1.6} />
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>{guest ? 'Guardar' : 'Agregar invitado'}</Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Nombre o familia" hint="Ej. Familia Ruiz Orozco · Lucía Gómez y pareja">
          <Input value={g.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!guest} />
        </Field>
        <Field label="Confirmación">
          <Segmented<Rsvp> value={g.rsvp ?? 'pendiente'} onChange={(v) => set({ rsvp: v })} className="w-full" options={(['confirmado', 'pendiente', 'declinado'] as Rsvp[]).map((r) => ({ value: r, label: RSVP_META[r].label }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Personas (pases)">
            <Input type="number" inputMode="numeric" min={1} value={g.count} onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} />
          </Field>
          <Field label="De ellos, niños">
            <Input type="number" inputMode="numeric" min={0} value={g.kids ?? 0} onChange={(e) => set({ kids: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <Field label="Lado">
            <Input list="guest-sides" value={g.side ?? ''} onChange={(e) => set({ side: e.target.value || undefined })} placeholder="Novia, Novio, Amigos…" />
            <datalist id="guest-sides">
              {sides.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Grupo o familia" hint="Para sentarlos juntos">
            <Input value={g.group ?? ''} onChange={(e) => set({ group: e.target.value || undefined })} placeholder="Familia Ruiz" />
          </Field>
          <Field label="Mesa">
            <Select value={g.table ?? ''} onChange={(e) => set({ table: e.target.value === '' ? undefined : Number(e.target.value) })}>
              <option value="">Sin mesa</option>
              {tables.map((t) => (
                <option key={t.key} value={t.key}>
                  {tableLabel(t.key)} · {t.seats} lugares
                </option>
              ))}
            </Select>
          </Field>
          <Field label="WhatsApp">
            <Input type="tel" inputMode="tel" value={g.phone ?? ''} onChange={(e) => set({ phone: e.target.value || undefined })} placeholder="10 dígitos" />
          </Field>
        </div>
        <Field label="Dieta o alergias" hint="Se avisa al banquete en la lista por mesa">
          <Input value={g.diet ?? ''} onChange={(e) => set({ diet: e.target.value || undefined })} placeholder="Vegetariano, sin gluten, alergia a nueces…" />
        </Field>
        <Field label="Notas">
          <Textarea value={g.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder="Silla de ruedas, llega tarde, padrino de anillos…" />
        </Field>
        <Toggle checked={!!g.vip} onChange={(v) => set({ vip: v })} label={<span className="inline-flex items-center gap-2"><Crown size={16} strokeWidth={1.6} /> Invitado especial (VIP)</span>} description="Padres, padrinos y abuelos: se sientan cerca de la pista y la mesa principal." />
      </div>
      <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} danger title="¿Eliminar a este invitado?" body={`${g.name} saldrá de la lista y de su mesa.`} confirmLabel="Eliminar" onConfirm={() => (guest && onDelete?.(guest.id), onClose())} />
    </Sheet>
  )
}

function blank(): Guest {
  return { id: uid('g_'), name: '', count: 1, confirmed: false, rsvp: 'pendiente' }
}

export function ImportSheet({ ev, open, onClose, onImport, sides }: { ev: RanchEvent; open: boolean; onClose: () => void; onImport: (g: Guest[]) => void; sides: string[] }) {
  const [text, setText] = useState('')
  const [side, setSide] = useState('')
  const parsed = useMemo(() => parseGuestList(text, { side }), [text, side])
  const existing = useMemo(() => new Set(ev.guestList.map((g) => g.name.trim().toLowerCase())), [ev.guestList])
  const fresh = parsed.filter((g) => !existing.has(g.name.trim().toLowerCase()))
  const people = fresh.reduce((n, g) => n + g.count, 0)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Importar invitados"
      subtitle="Pega la lista que te mandó la clienta"
      wide
      footer={
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-soft">{fresh.length ? `${fresh.length} invitados nuevos · ${people} personas` : 'Nada por importar todavía'}</span>
          <Button className="ml-auto" disabled={!fresh.length} icon={<ClipboardPaste size={17} strokeWidth={1.6} />} onClick={() => (onImport(fresh), setText(''), onClose())}>
            Importar {fresh.length || ''}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="grid content-start gap-4">
          <Field label="Lista" hint="Una línea por invitado. Sirve: solo nombres · “Nombre, teléfono, personas” · o un CSV/Excel copiado con encabezados (Nombre, Teléfono, Personas, Lado, Mesa, Dieta).">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[260px] font-mono text-sm" placeholder={'Familia Ruiz Orozco, 3312345678, 4\nLucía Gómez, 3398765432, 2\nArturo Medina'} />
          </Field>
          <Field label="Lado para todos (opcional)">
            <Input list="import-sides" value={side} onChange={(e) => setSide(e.target.value)} placeholder="Novia, Novio…" />
            <datalist id="import-sides">
              {sides.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>
        <div>
          <div className="eyebrow mb-2">Vista previa</div>
          <div className="scroll-area max-h-[380px] overflow-y-auto rounded-[var(--r-md)] bg-sunken p-2">
            {parsed.length === 0 && <p className="p-4 text-sm text-ink-soft">Aquí verás cómo quedará cada invitado.</p>}
            {parsed.map((g) => {
              const dup = existing.has(g.name.trim().toLowerCase())
              return (
                <div key={g.id} className={cx('flex items-center gap-3 rounded-[12px] px-3 py-2.5', dup && 'opacity-45')}>
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="tabular text-xs text-detail">{g.count} {g.count === 1 ? 'persona' : 'personas'}</span>
                  {g.phone && <span className="tabular hidden text-xs text-ink-3 sm:inline">{g.phone}</span>}
                  {dup && <span className="text-xs text-ink-3">ya está</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

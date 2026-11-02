// Objetos olvidados: se registran durante la limpieza y administración les da seguimiento.
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MessageCircle, PackageCheck, PackageSearch, Trash2 } from 'lucide-react'
import { db, useCollection, useMe, useStore } from '@/lib/store'
import { ago, waLink } from '@/lib/format'
import { ease } from '@/lib/motion'
import type { ID, LostItem } from '@/lib/types'
import { Badge, Button, Card, CardHeader, cx, Field, IconBubble, Input, Select, Sheet, Textarea, toast } from '@/components/ui'
import { PhotoButton, PhotoThumb } from '@/components/Photos'

export const LOST_STATUS: Record<LostItem['status'], { label: string; tone: 'butter' | 'sage' | 'rose' }> = {
  guardado: { label: 'Guardado', tone: 'butter' },
  entregado: { label: 'Entregado', tone: 'sage' },
  desechado: { label: 'Desechado', tone: 'rose' },
}

export function LostItemSheet({ open, onClose, unitId: initialUnit, reservationId }: { open: boolean; onClose: () => void; unitId?: ID; reservationId?: ID }) {
  const units = useCollection('units')
  const me = useMe()
  const [unitId, setUnitId] = useState<ID>(initialUnit ?? '')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [photoId, setPhotoId] = useState<ID | undefined>()
  useEffect(() => {
    if (open) {
      setUnitId(initialUnit ?? '')
      setDescription('')
      setNotes('')
      setPhotoId(undefined)
    }
  }, [open, initialUnit])

  const save = () => {
    if (!description.trim()) return toast.error('¿Qué encontraste?', 'Escribe una descripción corta, por ejemplo: cargador blanco.')
    // La reserva que acaba de salir de esa unidad (para poder avisar al huésped)
    const state = useStore.getState()
    const lastStay =
      reservationId ??
      Object.values(state.data.reservations)
        .filter((r) => !r.deleted && r.unitId === unitId && r.status === 'finalizada')
        .sort((a, b) => b.checkOut.localeCompare(a.checkOut))[0]?.id
    db.upsert('lostfound', {
      description: description.trim(),
      unitId: unitId || undefined,
      reservationId: lastStay,
      foundById: me?.id,
      foundAt: new Date().toISOString(),
      photoId,
      status: 'guardado',
      notes: notes.trim() || undefined,
    })
    const unit = units.find((u) => u.id === unitId)
    state.notify({ title: 'Objeto olvidado', body: `${me?.name ?? 'Alguien'} encontró: ${description.trim()}${unit ? ' en ' + unit.name : ''}`, tone: 'butter', link: '/hospedaje', roles: ['admin'] })
    toast.success('Objeto registrado', 'Administración ya fue avisada')
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Objeto olvidado"
      subtitle="Lo guardamos para devolverlo al huésped"
      footer={
        <Button size="lg" variant="tinta" className="w-full" onClick={save}>
          Registrar objeto
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="¿Qué encontraste?">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. cargador blanco, lentes de sol, chamarra azul" autoFocus />
        </Field>
        <Field label="¿Dónde?">
          <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Área común</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notas" hint="Dónde lo guardaste, estado, etc.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. lo dejé en la bodega, caja de objetos olvidados" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          {photoId && <PhotoThumb id={photoId} size={84} onRemove={() => setPhotoId(undefined)} />}
          {!photoId && <PhotoButton onAdded={setPhotoId} label="Foto del objeto" />}
        </div>
      </div>
    </Sheet>
  )
}

/** Lista de objetos olvidados para administración (entregar / desechar) */
export function LostFoundList({ className }: { className?: string }) {
  const items = useCollection('lostfound')
  const units = useStore((s) => s.data.units)
  const reservations = useStore((s) => s.data.reservations)
  const employees = useStore((s) => s.data.employees)
  const settings = useStore((s) => s.settings)
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState(false)
  const list = useMemo(() => [...items].sort((a, b) => Number(a.status !== 'guardado') - Number(b.status !== 'guardado') || b.foundAt.localeCompare(a.foundAt)), [items])
  const pending = list.filter((i) => i.status === 'guardado')
  const shown = showAll ? list : pending

  const setStatus = (i: LostItem, status: LostItem['status']) => {
    db.patch('lostfound', i.id, { status }, { summary: `Objeto "${i.description}" → ${LOST_STATUS[status].label}` })
    toast.success(LOST_STATUS[status].label, i.description)
  }

  return (
    <Card className={className}>
      <CardHeader
        icon={
          <IconBubble tone="butter">
            <PackageSearch size={20} strokeWidth={1.6} />
          </IconBubble>
        }
        eyebrow="Limpieza"
        title="Objetos olvidados"
        subtitle={pending.length ? `${pending.length} por devolver` : 'Nada pendiente por devolver'}
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Registrar
          </Button>
        }
      />
      <div className="px-3 pt-3 pb-3 md:px-4">
        {shown.length === 0 && <p className="px-2 py-4 text-sm text-ink-soft">Cuando alguien encuentre algo en una cabaña o casa aparecerá aquí.</p>}
        <AnimatePresence initial={false}>
          {shown.map((i) => {
            const unit = i.unitId ? units[i.unitId] : undefined
            const res = i.reservationId ? reservations[i.reservationId] : undefined
            const who = i.foundById ? employees[i.foundById] : undefined
            const st = LOST_STATUS[i.status]
            const msg = res ? `Hola ${res.guestName.split(' ')[0]}, te saludamos de ${settings.ranchName}. Encontramos ${i.description.toLowerCase()} en ${unit?.name ?? 'el rancho'} después de tu estancia. Lo tenemos guardado; dinos cómo prefieres recuperarlo.` : ''
            return (
              <motion.div key={i.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.48, ease: ease.calma } }} exit={{ opacity: 0, scale: 0.98 }} className="flex items-start gap-3 rounded-[18px] px-2 py-3 hover:bg-wash">
                {i.photoId ? (
                  <PhotoThumb id={i.photoId} size={56} />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-sunken text-ink-soft">
                    <PackageSearch size={22} strokeWidth={1.6} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{i.description}</p>
                    <Badge tone={st.tone} dot>
                      {st.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {unit?.name ?? 'Área común'} · {who ? `${who.name.split(' ')[0]} · ` : ''}
                    {ago(i.foundAt)}
                    {res ? ` · huésped: ${res.guestName}` : ''}
                  </p>
                  {i.notes && <p className="mt-1 text-xs text-ink-3">{i.notes}</p>}
                  {i.status === 'guardado' && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {res?.phone && (
                        <a href={waLink(res.phone, msg)} target="_blank" rel="noreferrer" className="pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm text-ink ring-1 ring-line-strong ring-inset hover:bg-wash">
                          <MessageCircle size={15} strokeWidth={1.6} /> Avisar
                        </a>
                      )}
                      <Button size="sm" variant="secondary" className="!h-9" icon={<PackageCheck size={15} strokeWidth={1.6} />} onClick={() => setStatus(i, 'entregado')}>
                        Entregado
                      </Button>
                      <Button size="sm" variant="ghost" className="!h-9" icon={<Trash2 size={15} strokeWidth={1.6} />} onClick={() => setStatus(i, 'desechado')}>
                        Desechar
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {list.length > pending.length && (
          <button onClick={() => setShowAll((v) => !v)} className={cx('pressable mt-1 rounded-full px-3 py-2 text-sm text-ink-soft hover:bg-wash hover:text-ink')}>
            {showAll ? 'Ver solo pendientes' : `Ver historial (${list.length - pending.length})`}
          </button>
        )}
      </div>
      <LostItemSheet open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}

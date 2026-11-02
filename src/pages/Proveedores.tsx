// Directorio de proveedores del wedding planner: categorías, favoritos, calificación con ✦,
// contacto directo y eventos donde participa.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Heart, Pencil, Plus, Star, Store, Trash2 } from 'lucide-react'
import type { Vendor, VendorCategory } from '@/lib/types'
import { db, useCollection } from '@/lib/store'
import { VENDOR_CATEGORY } from '@/lib/meta'
import { fmtDate, mxn, today } from '@/lib/format'
import { haptic } from '@/lib/motion'
import { Badge, Button, Card, Chip, Empty, PageHeader, Sheet, Stat, Toggle, cx, toast } from '@/components/ui'
import { Choices, EmailField, FormScope, MoneyField, NotesField, PhoneField, SearchField, TextField } from '@/components/fields'
import { removeWithUndo } from '@/lib/undo'
import { CountUp, Sparkle } from '@/components/step1'
import { Rating, VendorActions } from '@/components/events/PlannerTabs'

export default function Proveedores() {
  const vendors = useCollection('vendors')
  const events = useCollection('events')
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<VendorCategory | 'todas'>('todas')
  const [favOnly, setFavOnly] = useState(false)
  const [edit, setEdit] = useState<Vendor | null | undefined>(undefined) // undefined = cerrado, null = nuevo
  const T = today()

  const usage = useMemo(() => {
    const m = new Map<string, { count: number; next?: { id: string; title: string; date: string } }>()
    for (const e of events) {
      if (e.status === 'cancelado') continue
      for (const vid of e.vendorIds ?? []) {
        const u = m.get(vid) ?? { count: 0 }
        u.count++
        if (e.date >= T && (!u.next || e.date < u.next.date)) u.next = { id: e.id, title: e.title, date: e.date }
        m.set(vid, u)
      }
    }
    return m
  }, [events, T])

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const list = vendors
    .filter((v) => cat === 'todas' || v.category === cat)
    .filter((v) => !favOnly || v.favorite)
    .filter((v) => !q || norm(`${v.name} ${v.contact ?? ''} ${v.notes ?? ''}`).includes(norm(q)))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.rating - a.rating || a.name.localeCompare(b.name))
  const cats = (Object.keys(VENDOR_CATEGORY) as VendorCategory[]).filter((c) => vendors.some((v) => v.category === c))
  const avg = vendors.length ? vendors.reduce((n, v) => n + v.rating, 0) / vendors.length : 0

  return (
    <div>
      <PageHeader
        eyebrow="Directorio"
        title="Proveedores"
        subtitle="Banquetes, música, flores, foto y todo el equipo de confianza con quien trabajas."
        actions={
          <Button icon={<Plus size={18} strokeWidth={1.6} />} onClick={() => setEdit(null)}>
            Nuevo proveedor
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Proveedores" value={<CountUp value={vendors.length} />} tone="lavender" icon={<Store size={16} strokeWidth={1.6} />} />
        <Stat label="Favoritos" value={<CountUp value={vendors.filter((v) => v.favorite).length} />} tone="rose" icon={<Heart size={16} strokeWidth={1.6} />} onClick={() => setFavOnly((v) => !v)} />
        <Stat label="Calificación promedio" value={avg.toFixed(1)} sub="De 5 estrellas" tone="butter" />
        <Stat label="Categorías" value={cats.length} tone="sage" />
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Buscar proveedor" className="lg:w-80" shortcut />
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <Chip active={favOnly} onClick={() => setFavOnly((v) => !v)}>
            <Heart size={14} strokeWidth={1.6} /> Favoritos
          </Chip>
          <span className="mx-1 w-px shrink-0 bg-line" />
          <Chip active={cat === 'todas'} onClick={() => setCat('todas')} count={vendors.length}>
            Todos
          </Chip>
          {cats.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)} count={vendors.filter((v) => v.category === c).length}>
              {VENDOR_CATEGORY[c].label}
            </Chip>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty title={vendors.length ? 'Nadie coincide con el filtro' : 'Aún no hay proveedores'} body="Guarda aquí a tus proveedores de confianza para asignarlos a cada evento." action={<Button onClick={() => setEdit(null)}>Agregar proveedor</Button>} />
        </Card>
      ) : (
        <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.map((v) => {
              const u = usage.get(v.id)
              return (
                <motion.div key={v.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
                  <Card className="lift flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <Badge tone={VENDOR_CATEGORY[v.category].tone}>{VENDOR_CATEGORY[v.category].label}</Badge>
                      <div className="-mt-1.5 -mr-1.5 flex">
                        <button
                          onClick={() => {
                            haptic.select()
                            db.patch('vendors', v.id, { favorite: !v.favorite })
                          }}
                          aria-label={v.favorite ? `Quitar de favoritos a ${v.name}` : `Marcar como favorito a ${v.name}`}
                          aria-pressed={v.favorite}
                          className={cx('pressable flex h-11 w-11 items-center justify-center rounded-full hover:bg-wash', v.favorite ? 'text-chispa' : 'text-ink-3')}
                        >
                          <Heart size={18} strokeWidth={1.6} fill={v.favorite ? 'currentColor' : 'none'} />
                        </button>
                        <button onClick={() => setEdit(v)} aria-label={`Editar ${v.name}`} className="pressable flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-wash hover:text-ink">
                          <Pencil size={16} strokeWidth={1.6} />
                        </button>
                      </div>
                    </div>
                    <h3 className="heading mt-2 text-[1.4rem]">{v.name}</h3>
                    <div className="mt-1 flex items-center gap-3">
                      <Rating value={v.rating} />
                      {v.priceFrom ? <span className="text-sm text-ink-soft tabular">desde {mxn(v.priceFrom)}</span> : null}
                    </div>
                    {v.contact && <div className="mt-2 text-sm text-ink-soft">Contacto: {v.contact}</div>}
                    {v.notes && <p className="mt-3 line-clamp-2 text-sm text-ink-soft">{v.notes}</p>}
                    <div className="mt-auto pt-4">
                      {u ? (
                        <button onClick={() => u.next && navigate(`/eventos/${u.next.id}?tab=proveedores`)} className="flex w-full items-center gap-2 rounded-[14px] bg-sunken/70 px-3 py-2.5 text-left text-xs text-ink-soft hover:bg-sunken">
                          <Sparkle className="text-chispa-soft" />
                          <span className="min-w-0 flex-1 truncate">
                            {u.count} {u.count === 1 ? 'evento' : 'eventos'}
                            {u.next ? ` · próximo: ${u.next.title}, ${fmtDate(u.next.date)}` : ''}
                          </span>
                        </button>
                      ) : (
                        <div className="rounded-[14px] px-3 py-2.5 text-xs text-ink-3 ring-1 ring-line ring-inset [border-style:dashed]">Sin eventos asignados</div>
                      )}
                      <VendorActions phone={v.phone} instagram={v.instagram} message={`Hola ${v.contact ?? v.name}, te escribimos de Jardines La Joya para cotizar un evento.`} />
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <VendorSheet vendor={edit} onClose={() => setEdit(undefined)} />
    </div>
  )
}

function VendorSheet({ vendor, onClose }: { vendor: Vendor | null | undefined; onClose: () => void }) {
  const open = vendor !== undefined
  const [f, setF] = useState<Partial<Vendor>>({})
  const [key, setKey] = useState<string | null>(null)
  const [reveal, setReveal] = useState(false)
  const k = open ? vendor?.id ?? 'nuevo' : null
  if (k !== key) {
    setKey(k)
    if (open) {
      setF(vendor ?? { category: 'banquete', rating: 4, favorite: false })
      setReveal(false)
    }
  }
  const set = (p: Partial<Vendor>) => setF((x) => ({ ...x, ...p }))
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={vendor ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={
        <div className="flex items-center gap-2">
          {vendor && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar proveedor"
              onClick={() => {
                removeWithUndo('vendors', vendor.id, vendor.name)
                onClose()
              }}
              className="hover:!text-danger"
            >
              <Trash2 size={18} strokeWidth={1.6} />
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!f.name?.trim()) {
                setReveal(true)
                return
              }
              db.upsert('vendors', { ...f, name: f.name.trim(), rating: f.rating ?? 4, favorite: !!f.favorite } as Vendor)
              toast.success(vendor ? 'Proveedor actualizado' : 'Proveedor agregado', f.name.trim())
              onClose()
            }}
          >
            Guardar proveedor
          </Button>
        </div>
      }
    >
      <FormScope reveal={reveal}>
        <div className="flex flex-col gap-4">
          <TextField label="Nombre" value={f.name ?? ''} onChange={(v) => set({ name: v })} placeholder="Banquetes Los Altos" required requiredMsg="Escribe el nombre del proveedor" capitalizeWords />
          <Choices label="Categoría" size="sm" value={f.category} onChange={(v) => set({ category: v })} options={(Object.keys(VENDOR_CATEGORY) as VendorCategory[]).map((c) => ({ value: c, label: VENDOR_CATEGORY[c].label, tone: VENDOR_CATEGORY[c].tone }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyField label="Precio desde" value={f.priceFrom} onChange={(v) => set({ priceFrom: v || undefined })} />
            <TextField label="Persona de contacto" value={f.contact ?? ''} onChange={(v) => set({ contact: v || undefined })} capitalizeWords />
            <PhoneField label="Teléfono o WhatsApp" value={f.phone} onChange={(v) => set({ phone: v || undefined })} />
            <EmailField value={f.email} onChange={(v) => set({ email: v || undefined })} />
            <TextField label="Instagram" value={f.instagram ?? ''} onChange={(v) => set({ instagram: v ? (v.startsWith('@') ? v : '@' + v.replace(/^@+/, '')) : undefined })} placeholder="@usuario" />
          </div>
          <div>
            <span className="mb-2 block text-[13px] font-medium">Calificación</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Calificación">
              {[1, 2, 3, 4, 5].map((i) => (
                <motion.button key={i} whileTap={{ scale: 0.92 }} role="radio" aria-checked={(f.rating ?? 0) === i} aria-label={`${i} de 5`} onClick={() => (haptic.select(), set({ rating: i }))} className={cx('flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-wash', i <= (f.rating ?? 0) ? 'text-chispa' : 'text-line-strong')}>
                  <Star size={22} strokeWidth={1.6} fill={i <= (f.rating ?? 0) ? 'currentColor' : 'none'} />
                </motion.button>
              ))}
            </div>
          </div>
          <Toggle checked={!!f.favorite} onChange={(v) => set({ favorite: v })} label="Favorito" description="Aparece primero al asignar proveedores a un evento" />
          <NotesField label="Notas" value={f.notes ?? ''} onChange={(v) => set({ notes: v || undefined })} placeholder="Qué incluye, condiciones, qué tal trabaja…" templates={['Pide anticipo del 50%', 'Incluye montaje', 'Muy puntual', 'Factura']} minRows={2} />
        </div>
      </FormScope>
    </Sheet>
  )
}

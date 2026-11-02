import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ClipboardCheck, Minus, Package, Plus, ScanLine, Share2, ShoppingBasket, Armchair, Barcode, MapPin } from 'lucide-react'
import { Choices, Combobox, FormScope, MoneyField, SearchField, Stepper, TextField } from '@/components/fields'
import { ScannerSheet } from '@/components/Scanner'
import { CountMode } from '@/components/inventory/CountMode'
import { removeWithUndo, withUndo } from '@/lib/undo'
import { db, useCollection, useMe } from '@/lib/store'
import { INVENTORY_CATEGORY, seesMoney, TONE } from '@/lib/meta'
import { mxn, waLink } from '@/lib/format'
import { spring } from '@/lib/motion'
import type { InventoryCategory, InventoryItem } from '@/lib/types'
import { Badge, Button, Card, Chip, cx, Empty, Estela, PageHeader, ProgressBar, Sheet, Stat, toast } from '@/components/ui'

const toBuy = (i: InventoryItem) => Math.max(i.min * 2 - i.stock, 1)

function ItemSheet({ item, open, onClose, initialBarcode }: { item?: InventoryItem; open: boolean; onClose: () => void; initialBarcode?: string }) {
  const [form, setForm] = useState<Partial<InventoryItem>>({})
  const [prevOpen, setPrevOpen] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [scan, setScan] = useState(false)
  const all = useCollection('inventory')
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setForm(item ?? { category: 'amenidades', unit: 'pza', stock: 0, min: 5, cost: 0, barcode: initialBarcode })
      setReveal(false)
    }
  }
  const set = (p: Partial<InventoryItem>) => setForm((f) => ({ ...f, ...p }))
  const locations = [...new Set(all.map((i) => i.location).filter(Boolean) as string[])]
  const units = [...new Set(['pza', 'juego', 'rollo', 'litro', 'kg', 'botella', ...all.map((i) => i.unit)])]
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? 'Editar artículo' : 'Nuevo artículo'}
      subtitle="Al bajar del mínimo se crea una compra automática."
      footer={
        <div className="flex gap-2">
          {item && (
            <Button
              variant="ghost"
              onClick={() => {
                removeWithUndo('inventory', item.id, item.name)
                onClose()
              }}
            >
              Eliminar
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!form.name?.trim()) {
                setReveal(true)
                return toast.error('Falta el nombre', 'Escribe cómo se llama el artículo.')
              }
              db.upsert('inventory', { ...form, name: form.name.trim() } as InventoryItem)
              toast.success('Inventario actualizado', form.name)
              onClose()
            }}
          >
            Guardar artículo
          </Button>
        </div>
      }
    >
      <FormScope reveal={reveal}>
        <div className="flex flex-col gap-4">
          <TextField label="Nombre" value={form.name ?? ''} onChange={(v) => set({ name: v })} placeholder="Ej. Toallas de baño" required requiredMsg="Escribe cómo se llama el artículo" />
          <Choices label="Categoría" size="sm" value={form.category} onChange={(v) => set({ category: v })} options={(Object.keys(INVENTORY_CATEGORY) as InventoryCategory[]).map((k) => ({ value: k, label: INVENTORY_CATEGORY[k].label, tone: INVENTORY_CATEGORY[k].tone }))} />
          <div className="grid gap-3 @xl:grid-cols-2">
            <Stepper label="Existencia" value={form.stock ?? 0} onChange={(v) => set({ stock: v })} unit={form.unit} />
            <Stepper label="Mínimo" value={form.min ?? 0} onChange={(v) => set({ min: v })} unit="se avisa al bajar de aquí" />
            <Combobox label="Unidad" value={form.unit ?? ''} onChange={(v) => set({ unit: v || 'pza' })} options={units.map((u) => ({ value: u, label: u }))} onCreate={(q) => q.toLowerCase()} createLabel={(q) => `Usar «${q}»`} />
            <Combobox label="Ubicación" icon={<MapPin />} value={form.location ?? ''} onChange={(v) => set({ location: v || undefined })} clearable options={locations.map((l) => ({ value: l, label: l }))} onCreate={(q) => q} createLabel={(q) => `Nueva ubicación «${q}»`} />
            <MoneyField label="Costo unitario" value={form.cost} onChange={(v) => set({ cost: v })} decimals />
            <TextField
              label="Código de barras"
              icon={<Barcode />}
              value={form.barcode ?? ''}
              onChange={(v) => set({ barcode: v.replace(/\s/g, '') || undefined })}
              inputMode="numeric"
              trailing={
                <button type="button" className="fx-btn" aria-label="Escanear código" onClick={() => setScan(true)}>
                  <ScanLine size={17} strokeWidth={1.7} />
                </button>
              }
            />
          </div>
        </div>
      </FormScope>
      <ScannerSheet open={scan} onClose={() => setScan(false)} formats={['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']} title="Escanear código del producto" onResult={(t) => set({ barcode: t })} />
    </Sheet>
  )
}

export default function Inventario() {
  const items = useCollection('inventory')
  const me = useMe()
  const money = seesMoney(me?.role)
  const canEdit = me?.role === 'admin' || me?.role === 'eventos' || me?.role === 'mantenimiento'
  const [cat, setCat] = useState<InventoryCategory | 'todas' | 'bajo'>('todas')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<InventoryItem | undefined>()
  const [sheet, setSheet] = useState(false)
  const [shop, setShop] = useState(false)
  const [counting, setCounting] = useState<{ open: boolean; startId?: string }>({ open: false })
  const [scan, setScan] = useState(false)
  const [newBarcode, setNewBarcode] = useState<string>()
  const adjust = (i: InventoryItem, d: number) => {
    const prev = i.stock
    db.patch('inventory', i.id, { stock: Math.max(0, prev + d) })
    withUndo(`${i.name}: ${Math.max(0, prev + d)} ${i.unit}`, () => db.patch('inventory', i.id, { stock: prev }))
  }
  const onScan = (code: string) => {
    const found = items.find((i) => i.barcode === code)
    if (found) {
      setCounting({ open: true, startId: found.id })
      toast.success('Encontrado', found.name)
    } else if (canEdit) {
      toast.action('Código nuevo', { label: 'Crear artículo', onClick: () => (setEdit(undefined), setNewBarcode(code), setSheet(true)) }, code)
    } else toast.error('Ese código no está en el inventario', code)
  }

  const low = items.filter((i) => i.stock <= i.min)
  const value = items.reduce((n, i) => n + i.stock * i.cost, 0)
  const list = useMemo(
    () =>
      items
        .filter((i) => (cat === 'todas' ? true : cat === 'bajo' ? i.stock <= i.min : i.category === cat))
        .filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.barcode === q.trim())
        .sort((a, b) => Number(b.stock <= b.min) - Number(a.stock <= a.min) || a.name.localeCompare(b.name)),
    [items, cat, q],
  )
  const shoppingText = 'Lista de compras · Jardines La Joya\n\n' + low.map((i) => `• ${i.name}: ${toBuy(i)} ${i.unit}`).join('\n')

  return (
    <div>
      <PageHeader
        eyebrow="Negocio"
        title="Inventario"
        subtitle="Insumos, blancos, mobiliario y mantelería, siempre al día."
        primary={canEdit ? { label: 'Contar inventario', icon: <ClipboardCheck size={18} strokeWidth={1.6} />, onClick: () => setCounting({ open: true }) } : undefined}
        actions={
          <Button variant="outline" icon={<ScanLine size={18} strokeWidth={1.6} />} onClick={() => setScan(true)}>
            Escanear
          </Button>
        }
        menu={[
          { label: 'Nuevo artículo', icon: <Plus />, hidden: !canEdit, onClick: () => (setEdit(undefined), setNewBarcode(undefined), setSheet(true)) },
          { label: `Lista de compras${low.length ? ` (${low.length})` : ''}`, icon: <ShoppingBasket />, disabled: !low.length, onClick: () => setShop(true) },
        ]}
      />

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Artículos" value={items.length} sub="En todas las categorías" tone="lavender" icon={<Package size={16} strokeWidth={1.6} />} />
        <Stat label="Bajo el mínimo" value={low.length} sub={low.length ? 'Toca para verlos' : 'Todo en orden'} tone="rose" icon={<AlertTriangle size={16} strokeWidth={1.6} />} onClick={() => setCat('bajo')} />
        <Stat label="Mobiliario de eventos" value={items.filter((i) => i.category === 'mobiliario').reduce((n, i) => n + i.stock, 0)} sub="Piezas disponibles" tone="sky" icon={<Armchair size={16} strokeWidth={1.6} />} />
        {money ? <Stat label="Valor del inventario" value={mxn(value)} sub="A costo de compra" tone="sage" accent /> : <Stat label="Por comprar" value={low.length} sub="Artículos" tone="butter" />}
      </div>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Buscar artículo o código" className="lg:w-80" shortcut />
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
          <Chip active={cat === 'todas'} onClick={() => setCat('todas')} count={items.length}>
            Todo
          </Chip>
          <Chip active={cat === 'bajo'} onClick={() => setCat('bajo')} count={low.length}>
            Bajo mínimo
          </Chip>
          {(Object.keys(INVENTORY_CATEGORY) as InventoryCategory[]).map((k) => (
            <Chip key={k} active={cat === k} onClick={() => setCat(k)} count={items.filter((i) => i.category === k).length}>
              {INVENTORY_CATEGORY[k].label}
            </Chip>
          ))}
        </div>
      </div>

      {list.length === 0 && <Empty kind="inventario" title="Sin artículos aquí" body={q ? `Nada coincide con “${q}”.` : 'Agrega tu primer artículo para empezar a llevar el control.'} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {list.map((i) => {
            const isLow = i.stock <= i.min
            const meta = INVENTORY_CATEGORY[i.category]
            const ratio = i.min ? i.stock / (i.min * 2) : 1
            return (
              <motion.div key={i.id} layout transition={spring.suave} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="relative h-full overflow-hidden p-5">
                  {isLow && <span aria-hidden className="absolute top-5 bottom-5 left-0 w-[3px] rounded-r-full bg-danger" />}
                  <div className="flex items-start gap-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => canEdit && (setEdit(i), setSheet(true))} disabled={!canEdit}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {isLow && <Badge tone="rose">Reponer</Badge>}
                      </div>
                      <p className="mt-2.5 text-[15px] font-medium">{i.name}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {i.location ?? 'Sin ubicación'} · mínimo {i.min} {i.unit}
                        {money && i.cost ? ` · ${mxn(i.cost)} c/u` : ''}
                      </p>
                    </button>
                    <div className="text-right">
                      <div className={cx('display-num text-[2.3rem]', isLow && 'text-danger')}>{i.stock}</div>
                      <div className="text-xs text-ink-soft">{i.unit}</div>
                    </div>
                  </div>
                  <ProgressBar value={ratio} tone={isLow ? 'rose' : undefined} className="mt-4" />
                  {canEdit && (
                    <div className="mt-4 flex items-center gap-2">
                      <Button size="sm" variant="outline" className="flex-1" icon={<Minus size={16} strokeWidth={1.6} />} onClick={() => adjust(i, -1)} aria-label={`Salida de ${i.name}`}>
                        Salida
                      </Button>
                      <Button size="sm" variant="secondary" className="flex-1" icon={<Plus size={16} strokeWidth={1.6} />} onClick={() => adjust(i, 1)} aria-label={`Entrada de ${i.name}`}>
                        Entrada
                      </Button>
                      <Button size="icon-sm" variant="ghost" className="!h-10 !w-10" onClick={() => setCounting({ open: true, startId: i.id })} aria-label={`Contar ${i.name}`} title="Conteo físico">
                        <ClipboardCheck size={17} strokeWidth={1.6} />
                      </Button>
                    </div>
                  )}
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <ItemSheet item={edit} open={sheet} onClose={() => setSheet(false)} initialBarcode={newBarcode} />
      <CountMode open={counting.open} startId={counting.startId} items={list.length ? list : items} onClose={() => setCounting({ open: false })} onScan={() => setScan(true)} />
      <ScannerSheet open={scan} onClose={() => setScan(false)} onResult={onScan} formats={['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']} title="Escanear producto" hint="Apunta al código de barras del empaque" />
      <Sheet open={shop} onClose={() => setShop(false)} title="Lista de compras" subtitle="Generada con lo que está bajo el mínimo">
        <ul className="flex flex-col">
          {low.map((i) => (
            <li key={i.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-2 last:border-0">
              <span className="flex items-center gap-3">
                <span className={cx('h-2 w-2 rounded-full', TONE[INVENTORY_CATEGORY[i.category].tone].solid)} />
                <span>
                  <span className="block text-[15px] font-medium">{i.name}</span>
                  <span className="block text-xs text-ink-soft">
                    Quedan {i.stock} · mínimo {i.min}
                  </span>
                </span>
              </span>
              <span className="display-num text-xl">
                {toBuy(i)} <span className="font-sans text-xs text-ink-soft">{i.unit}</span>
              </span>
            </li>
          ))}
        </ul>
        {money && (
          <>
            <Estela className="my-5" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">Costo estimado</span>
              <span className="display-num text-2xl">{mxn(low.reduce((n, i) => n + toBuy(i) * i.cost, 0))}</span>
            </div>
          </>
        )}
        <div className="mt-6 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              void navigator.clipboard?.writeText(shoppingText)
              toast.success('Lista copiada', 'Pégala donde la necesites.')
            }}
          >
            Copiar
          </Button>
          <a href={waLink('', shoppingText)} target="_blank" rel="noreferrer" className="flex-1">
            <Button className="w-full" icon={<Share2 size={18} strokeWidth={1.6} />}>
              Enviar por WhatsApp
            </Button>
          </a>
        </div>
      </Sheet>
    </div>
  )
}

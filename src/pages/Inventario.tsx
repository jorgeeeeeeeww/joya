import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ClipboardCheck, Minus, Plus, ScanLine, Share2, ShoppingBasket, Barcode, MapPin } from 'lucide-react'
import { Choices, Combobox, FormScope, MoneyField, SearchField, Stepper, TextField } from '@/components/fields'
import { ScannerSheet } from '@/components/Scanner'
import { CountMode } from '@/components/inventory/CountMode'
import { removeWithUndo, withUndo } from '@/lib/undo'
import { db, useCollection, useMe } from '@/lib/store'
import { INVENTORY_CATEGORY, seesMoney, TONE } from '@/lib/meta'
import { capitalize, fmtDateLong, mxn, today, waLink } from '@/lib/format'
import { eventScenes, furnitureNeeds } from '@/lib/floorplan'
import type { InventoryCategory, InventoryItem } from '@/lib/types'
import { Button, Card, cx, Empty, Estela, FilterMenu, PageHeader, Segmented, Sheet, toast } from '@/components/ui'

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

/** Lo que se usa en los eventos */
const EVENT_CATEGORIES: InventoryCategory[] = ['mobiliario', 'manteleria', 'bar']

export default function Inventario() {
  const items = useCollection('inventory')
  const events = useCollection('events')
  const me = useMe()
  const money = seesMoney(me?.role)
  const canEdit = me?.role === 'admin' || me?.role === 'eventos' || me?.role === 'mantenimiento'
  // La planner solo usa lo de eventos (mobiliario, mantelería y bar): abre ahí, y «Todo» queda a un toque
  const planner = me?.role === 'eventos'
  const [cat, setCat] = useState<InventoryCategory | 'todas' | 'eventos'>(() => (planner ? 'eventos' : 'todas'))
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
  // Ya llegó lo que se pidió: se suma de un toque
  const receive = (i: InventoryItem) => {
    const prev = i.stock
    const add = toBuy(i)
    db.patch('inventory', i.id, { stock: prev + add })
    withUndo(`${i.name}: llegaron ${add} ${i.unit}`, () => db.patch('inventory', i.id, { stock: prev }))
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
  const forEvents = items.filter((i) => EVENT_CATEGORIES.includes(i.category))
  const value = items.reduce((n, i) => n + i.stock * i.cost, 0)
  // El próximo evento con plano: lo que pide contra lo que hay en bodega
  const nextEvent = useMemo(
    () =>
      events
        .filter((e) => e.date >= today() && (e.status === 'apartado' || e.status === 'confirmado') && eventScenes(e).some((sc) => sc.items.length > 0))
        .sort((a, b) => a.date.localeCompare(b.date))[0],
    [events],
  )
  const needs = useMemo(() => {
    if (!nextEvent) return []
    const stock = (id: string) => items.find((i) => i.id === id)?.stock ?? 0
    // Las escenas no ocurren a la vez y la bodega se reacomoda: cuenta la que pide más de cada cosa
    const most = new Map<string, { label: string; need: number; have: number }>()
    for (const sc of eventScenes(nextEvent)) for (const n of furnitureNeeds(sc.items, stock)) if (n.need > (most.get(n.label)?.need ?? 0)) most.set(n.label, n)
    return [...most.values()]
  }, [nextEvent, items])
  const list = useMemo(
    () =>
      items
        .filter((i) => (cat === 'todas' ? true : cat === 'eventos' ? EVENT_CATEGORIES.includes(i.category) : i.category === cat))
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
        subtitle={`${items.length} artículos${money ? ` · ${mxn(value)} a costo de compra` : ''}`}
        primary={canEdit ? { label: 'Contar inventario', icon: <ClipboardCheck size={18} strokeWidth={1.6} />, onClick: () => setCounting({ open: true }) } : undefined}
        actions={
          <Button variant="outline" icon={<ScanLine size={18} strokeWidth={1.6} />} onClick={() => setScan(true)}>
            Escanear
          </Button>
        }
        menu={[{ label: 'Nuevo artículo', icon: <Plus />, hidden: !canEdit, onClick: () => (setEdit(undefined), setNewBarcode(undefined), setSheet(true)) }]}
      />

      {/* Lo que requiere una decisión va primero */}
      {(low.length > 0 || (needs.length > 0 && nextEvent)) && (
        <div className={cx('mb-6 grid gap-4 [&>*]:min-w-0', low.length > 0 && needs.length > 0 && 'lg:grid-cols-2')}>
          {low.length > 0 && (
            <Card className="flex flex-col items-start gap-3 p-4 md:p-5">
              <div>
                <p className="text-[15px] font-semibold text-key">Hay que comprar · {low.length}</p>
                <p className="mt-1 text-[14px] leading-snug text-ink-soft">
                  {low
                    .slice(0, 4)
                    .map((i) => `${i.name} (${toBuy(i)} ${i.unit})`)
                    .join(', ')}
                  {low.length > 4 ? ` y ${low.length - 4} más` : ''}
                </p>
              </div>
              <Button size="sm" variant="secondary" className="mt-auto" icon={<ShoppingBasket size={16} strokeWidth={1.6} />} onClick={() => setShop(true)}>
                Ver la lista
              </Button>
            </Card>
          )}
          {needs.length > 0 && nextEvent && (
            <Link to={`/eventos/${nextEvent.id}`} className="card lift block p-4 md:p-5">
              <p className="text-[15px] font-semibold">Para {nextEvent.title}</p>
              <p className="mt-0.5 text-[13px] text-detail">{capitalize(fmtDateLong(nextEvent.date))} · según su plano</p>
              <ul className="mt-3 flex flex-col gap-1 text-[14px]">
                {needs.map((n) => (
                  <li key={n.label}>
                    <b className={cx('font-semibold tabular', n.need > n.have && 'text-key')}>{n.need}</b> <span className="text-ink-soft">de {n.have} {n.label.toLowerCase()}</span>
                    {n.need > n.have && <span className="font-medium text-key"> · faltan {n.need - n.have}</span>}
                  </li>
                ))}
              </ul>
            </Link>
          )}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Buscar artículo o código" className="lg:w-80" shortcut />
        <div className="flex gap-2 [&>*]:max-sm:flex-1">
          {planner && (
            <Segmented
              value={cat === 'eventos' ? 'eventos' : 'todo'}
              onChange={(v) => setCat(v === 'eventos' ? 'eventos' : 'todas')}
              options={[
                { value: 'eventos', label: `De eventos · ${forEvents.length}` },
                { value: 'todo', label: `Todo · ${items.length}` },
              ]}
            />
          )}
          <FilterMenu
            label="Categoría"
            allLabel="Categorías"
            value={cat === 'todas' || cat === 'eventos' ? '' : cat}
            onChange={(v) => setCat(v || 'todas')}
            options={(Object.keys(INVENTORY_CATEGORY) as InventoryCategory[]).map((k) => ({ value: k, label: INVENTORY_CATEGORY[k].label, count: items.filter((i) => i.category === k).length }))}
          />
        </div>
      </div>

      {list.length === 0 && <Empty kind="inventario" title="Sin artículos aquí" body={q ? `Nada coincide con “${q}”.` : 'Agrega tu primer artículo para empezar a llevar el control.'} />}
      <div className="gap-4 xl:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {(Object.keys(INVENTORY_CATEGORY) as InventoryCategory[]).map((k) => {
          const group = list.filter((i) => i.category === k)
          if (!group.length) return null
          const meta = INVENTORY_CATEGORY[k]
          return (
            <section key={k}>
              <h2 className="mb-2 flex items-center gap-2 px-1 text-[14px] font-semibold">
                <span className={cx('h-2 w-2 rounded-full', TONE[meta.tone].solid)} />
                {meta.label}
                <span className="font-normal text-ink-3 tabular">{group.length}</span>
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {group.map((i) => {
                    const isLow = i.stock <= i.min
                    return (
                      <li key={i.id} className="flex min-w-0 items-center gap-3 py-2 pr-2 pl-4 md:pl-5">
                        <button className="min-w-0 flex-1 text-left" onClick={() => canEdit && (setEdit(i), setSheet(true))} disabled={!canEdit}>
                          <span className="block text-[15px] leading-snug font-medium">{i.name}</span>
                          <span className="block text-[12.5px] leading-snug text-detail">
                            {[i.location, `mínimo ${i.min}`, money && i.cost ? `${mxn(i.cost)} c/u` : ''].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center">
                          {canEdit && (
                            <button className="pressable flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink pointer-fine:h-9 pointer-fine:w-9" onClick={() => adjust(i, -1)} aria-label={`Salida de ${i.name}`}>
                              <Minus size={16} strokeWidth={1.6} />
                            </button>
                          )}
                          <span className={cx('min-w-14 text-center leading-none tabular', !canEdit && 'pr-2')}>
                            <span className={cx('block text-[17px] font-semibold', isLow && 'text-key')}>{i.stock}</span>
                            <span className="text-[11px] text-detail">{i.unit}</span>
                          </span>
                          {canEdit && (
                            <button className="pressable flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-wash hover:text-ink pointer-fine:h-9 pointer-fine:w-9" onClick={() => adjust(i, 1)} aria-label={`Entrada de ${i.name}`}>
                              <Plus size={16} strokeWidth={1.6} />
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            </section>
          )
        })}
      </div>

      <ItemSheet item={edit} open={sheet} onClose={() => setSheet(false)} initialBarcode={newBarcode} />
      <CountMode open={counting.open} startId={counting.startId} items={list.length ? list : items} onClose={() => setCounting({ open: false })} onScan={() => setScan(true)} />
      <ScannerSheet open={scan} onClose={() => setScan(false)} onResult={onScan} formats={['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']} title="Escanear producto" hint="Apunta al código de barras del empaque" />
      <Sheet open={shop} onClose={() => setShop(false)} title="Lista de compras" subtitle="Lo que está bajo el mínimo. Toca «Llegó» cuando lo recibas y se suma a la bodega.">
        {low.length === 0 && <p className="py-6 text-center text-[14px] text-ink-soft">Ya no falta nada.</p>}
        <ul className="flex flex-col">
          {low.map((i) => (
            <li key={i.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-2 last:border-0">
              <span className="flex items-center gap-3">
                <span className={cx('h-2 w-2 rounded-full', TONE[INVENTORY_CATEGORY[i.category].tone].solid)} />
                <span>
                  <span className="block text-[15px] font-medium">{i.name}</span>
                  <span className="block text-xs text-detail">
                    Quedan {i.stock} · mínimo {i.min}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="display-num text-xl">
                  {toBuy(i)} <span className="font-sans text-xs text-detail">{i.unit}</span>
                </span>
                {canEdit && (
                  <Button size="sm" variant="outline" icon={<Check size={15} strokeWidth={1.6} />} onClick={() => receive(i)}>
                    Llegó
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {money && (
          <>
            <Estela className="my-5" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">Con los costos capturados</span>
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

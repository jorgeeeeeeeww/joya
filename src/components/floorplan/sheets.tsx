// Paneles y hojas del editor: propiedades, paleta, escenas, copias en serie y plantillas.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Grid2x2,
  Leaf,
  Lock,
  LockOpen,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import type { FloorItem, FloorItemType, FloorScene, SceneKind, Venue } from '@/lib/types'
import { ITEM_SPECS, LAYOUT_STYLES, SCENE_KIND, type LayoutStyle } from '@/lib/floorplan'
import { VENUE_SPACES } from '@/lib/layout'
import { VENUE } from '@/lib/meta'
import { Button, Field, Input, Segmented, Sheet, Toggle, cx } from '@/components/ui'
import { PaletteIcon } from './canvas'
import { PALETTE_GROUPS, clamp, type AlignKind } from './geometry'

/** Colores de mantel neutros (datos de decoración, no colores de interfaz) */
export const NEUTRAL_LINENS = ['#FBF5EE', '#EFE3D3', '#D9C7AE', '#E7C6C0', '#C9BBD9', '#B7C2A8', '#5A3A3E']

function IconAction({ label, onClick, children, danger, active, disabled }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; active?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx(
        'pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40',
        danger ? 'text-danger hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]' : active ? 'bg-ink text-paper' : 'text-ink-soft ring-1 ring-line ring-inset hover:bg-wash hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

export interface TableGuest {
  id: string
  name: string
  count: number
  diet?: string
}

// ── Propiedades de la selección ───────────────────────────
export function PropertiesContent({
  items,
  palette,
  readOnly,
  onPatch,
  onAlign,
  onDistribute,
  onDuplicate,
  onArray,
  onDelete,
  onFront,
  onBack,
  tableGuests,
  guestsLink,
}: {
  items: FloorItem[]
  palette?: string[]
  readOnly?: boolean
  onPatch: (patch: Partial<FloorItem> | ((it: FloorItem) => Partial<FloorItem>)) => void
  onAlign: (k: AlignKind) => void
  onDistribute: (axis: 'x' | 'y') => void
  onDuplicate: () => void
  onArray: () => void
  onDelete: () => void
  onFront: () => void
  onBack: () => void
  tableGuests?: TableGuest[]
  guestsLink?: string
}) {
  const single = items.length === 1 ? items[0]! : null
  const spec = single ? ITEM_SPECS[single.type] : null
  const [name, setName] = useState('')
  const [num, setNum] = useState('')
  const [label, setLabel] = useState('')
  const [w, setW] = useState('')
  const [h, setH] = useState('')
  useEffect(() => {
    if (!single || !spec) return
    setName(single.name ?? '')
    setNum(single.number ? String(single.number) : '')
    setLabel(single.label ?? '')
    setW(String(single.w ?? spec.w))
    setH(String(single.h ?? spec.h))
  }, [single?.id, single?.name, single?.number, single?.label, single?.w, single?.h]) // eslint-disable-line react-hooks/exhaustive-deps

  const anyTable = items.some((i) => ITEM_SPECS[i.type].isTable || i.type === 'mesa-dulces' || i.type === 'buffet' || i.type === 'regalos')
  const allLocked = items.every((i) => i.locked)
  const swatches = [...new Set([...(palette ?? []), ...NEUTRAL_LINENS])].slice(0, 12)
  const resizable = single && spec && spec.shape === 'rect' && (!spec.isTable || ['mesa-imperial', 'mesa-rectangular', 'mesa-principal'].includes(single.type))
  const people = (tableGuests ?? []).reduce((n, g) => n + g.count, 0)

  return (
    <div className="flex flex-col gap-5">
      {single && spec ? (
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-sunken">
            <PaletteIcon type={single.type} size={38} />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">{spec.label}</p>
            <p className="heading truncate text-xl">{single.number ? `Mesa ${single.number}` : single.name || single.label || spec.label}</p>
          </div>
        </div>
      ) : (
        <div>
          <p className="eyebrow">Selección</p>
          <p className="heading text-xl">{items.length} piezas</p>
        </div>
      )}

      {!readOnly && single && spec && (
        <div className="grid grid-cols-2 gap-3">
          {spec.isTable && (
            <>
              <Field label="Nombre" className="col-span-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => onPatch({ name: name.trim() || undefined })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder="Ej. Mesa Lavanda" />
              </Field>
              {single.type !== 'mesa-principal' && single.type !== 'mesa-novios' && (
                <Field label="Número">
                  <Input type="number" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} onBlur={() => onPatch({ number: num ? Number(num) : undefined })} />
                </Field>
              )}
            </>
          )}
          {!spec.isTable && (
            <Field label="Etiqueta" className="col-span-2">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => onPatch({ label: label.trim() || undefined })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder={spec.label} />
            </Field>
          )}
          {spec.seats !== undefined && (
            <div className={cx(spec.isTable && single.type !== 'mesa-principal' && single.type !== 'mesa-novios' ? '' : 'col-span-2')}>
              <span className="mb-1.5 block text-sm font-medium">{single.type === 'sillas-ceremonia' ? 'Sillas' : 'Lugares'}</span>
              <div className="flex h-12 items-center justify-between rounded-[14px] bg-sunken px-1">
                <IconAction label="Quitar" onClick={() => onPatch({ seats: clamp((single.seats ?? 0) - (single.type === 'sillas-ceremonia' ? 10 : 1), 1, spec.maxSeats ?? 300) })}>
                  <Minus size={17} strokeWidth={1.6} />
                </IconAction>
                <span className="display-num text-xl">{single.seats}</span>
                <IconAction label="Agregar" onClick={() => onPatch({ seats: clamp((single.seats ?? 0) + (single.type === 'sillas-ceremonia' ? 10 : 1), 1, spec.maxSeats ?? 300) })}>
                  <Plus size={17} strokeWidth={1.6} />
                </IconAction>
              </div>
            </div>
          )}
          {resizable && (
            <>
              <Field label="Ancho (m)">
                <Input type="number" step="0.5" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} onBlur={() => onPatch({ w: clamp(Number(w) || spec.w, 0.5, 40) })} />
              </Field>
              <Field label="Fondo (m)">
                <Input type="number" step="0.5" inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} onBlur={() => onPatch({ h: clamp(Number(h) || spec.h, 0.5, 40) })} />
              </Field>
            </>
          )}
          <div className="col-span-2">
            <span className="mb-1.5 block text-sm font-medium">Giro · {Math.round(single.rot)}°</span>
            <div className="flex gap-2">
              <IconAction label="Girar −15°" onClick={() => onPatch((it) => ({ rot: (((it.rot - 15) % 360) + 360) % 360 }))}>
                <RotateCcw size={17} strokeWidth={1.6} />
              </IconAction>
              <IconAction label="Girar +15°" onClick={() => onPatch((it) => ({ rot: (it.rot + 15) % 360 }))}>
                <RotateCw size={17} strokeWidth={1.6} />
              </IconAction>
              <button onClick={() => onPatch((it) => ({ rot: (it.rot + 90) % 360 }))} className="pressable h-11 rounded-full px-4 text-sm ring-1 ring-line ring-inset hover:bg-wash">
                90°
              </button>
              <button onClick={() => onPatch({ rot: 0 })} className="pressable h-11 rounded-full px-4 text-sm ring-1 ring-line ring-inset hover:bg-wash">
                Recto
              </button>
            </div>
          </div>
        </div>
      )}

      {!readOnly && anyTable && (
        <div>
          <span className="mb-2 block text-sm font-medium">Color del mantel</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onPatch({ color: undefined })} aria-label="Sin color" className={cx('pressable flex h-10 w-10 items-center justify-center rounded-full text-xs ring-1 ring-line-strong', items.every((i) => !i.color) && 'ring-2 ring-ink')}>
              —
            </button>
            {swatches.map((c) => (
              <button key={c} onClick={() => onPatch({ color: c })} aria-label={`Mantel ${c}`} className={cx('pressable h-10 w-10 rounded-full shadow-[var(--shadow-1)] ring-offset-2 ring-offset-surface', items.every((i) => i.color === c) ? 'ring-2 ring-ink' : 'ring-1 ring-line')} style={{ background: c }} />
            ))}
          </div>
        </div>
      )}

      {!readOnly && items.length > 1 && (
        <div>
          <span className="mb-2 block text-sm font-medium">Alinear y distribuir</span>
          <div className="flex flex-wrap gap-2">
            <IconAction label="Alinear a la izquierda" onClick={() => onAlign('left')}>
              <AlignStartVertical size={17} strokeWidth={1.6} />
            </IconAction>
            <IconAction label="Centrar horizontal" onClick={() => onAlign('hcenter')}>
              <AlignCenterVertical size={17} strokeWidth={1.6} />
            </IconAction>
            <IconAction label="Alinear a la derecha" onClick={() => onAlign('right')}>
              <AlignEndVertical size={17} strokeWidth={1.6} />
            </IconAction>
            <IconAction label="Alinear arriba" onClick={() => onAlign('top')}>
              <AlignStartHorizontal size={17} strokeWidth={1.6} />
            </IconAction>
            <IconAction label="Centrar vertical" onClick={() => onAlign('vcenter')}>
              <AlignCenterHorizontal size={17} strokeWidth={1.6} />
            </IconAction>
            <IconAction label="Alinear abajo" onClick={() => onAlign('bottom')}>
              <AlignEndHorizontal size={17} strokeWidth={1.6} />
            </IconAction>
            <IconAction label="Distribuir a lo ancho" onClick={() => onDistribute('x')} disabled={items.length < 3}>
              <AlignHorizontalDistributeCenter size={17} strokeWidth={1.6} />
            </IconAction>
            <IconAction label="Distribuir a lo alto" onClick={() => onDistribute('y')} disabled={items.length < 3}>
              <AlignVerticalDistributeCenter size={17} strokeWidth={1.6} />
            </IconAction>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Copy size={16} strokeWidth={1.6} />} onClick={onDuplicate}>
            Duplicar
          </Button>
          {single && (
            <Button size="sm" variant="secondary" icon={<Grid2x2 size={16} strokeWidth={1.6} />} onClick={onArray}>
              En serie
            </Button>
          )}
          <Button size="sm" variant="outline" icon={allLocked ? <LockOpen size={16} strokeWidth={1.6} /> : <Lock size={16} strokeWidth={1.6} />} onClick={() => onPatch({ locked: !allLocked })}>
            {allLocked ? 'Desbloquear' : 'Bloquear'}
          </Button>
          <IconAction label="Traer al frente" onClick={onFront}>
            <ArrowUpToLine size={17} strokeWidth={1.6} />
          </IconAction>
          <IconAction label="Enviar atrás" onClick={onBack}>
            <ArrowDownToLine size={17} strokeWidth={1.6} />
          </IconAction>
          <IconAction label="Eliminar" onClick={onDelete} danger>
            <Trash2 size={17} strokeWidth={1.6} />
          </IconAction>
        </div>
      )}

      {tableGuests && single && spec?.isTable && (
        <div className="rounded-[var(--r-md)] bg-sunken p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users size={16} strokeWidth={1.6} /> Invitados en la mesa
            </span>
            <span className={cx('text-sm tabular', people > (single.seats ?? 0) ? 'text-danger' : 'text-ink-soft')}>
              {people}/{single.seats ?? 0}
            </span>
          </div>
          {tableGuests.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Mesa libre. Acomoda invitados desde la estación de invitados.</p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {tableGuests.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-sm last:border-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{g.name}</span>
                    {g.diet && (
                      <span title={g.diet} className="shrink-0 text-success">
                        <Leaf size={13} strokeWidth={1.6} />
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular text-ink-soft">{g.count}</span>
                </li>
              ))}
            </ul>
          )}
          {people < (single.seats ?? 0) && <p className="mt-2 text-xs text-detail">{(single.seats ?? 0) - people} lugares libres</p>}
          {guestsLink && (
            <Link to={guestsLink} className="mt-3 inline-flex h-10 items-center rounded-full px-1 text-sm text-primary hover:underline">
              Abrir acomodo de invitados
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── Paleta de piezas ─────────────────────────────────────
export function PaletteSheet({ open, onClose, onPick, venue }: { open: boolean; onClose: () => void; onPick: (t: FloorItemType) => void; venue: Venue }) {
  const [q, setQ] = useState('')
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const groups = useMemo(
    () =>
      PALETTE_GROUPS.map((g) => ({ ...g, types: g.types.filter((t) => !q || norm(ITEM_SPECS[t].label).includes(norm(q))) }))
        .filter((g) => g.types.length)
        .filter((g) => venue === 'jardin' || g.types.some((t) => t !== 'carpa')),
    [q, venue],
  )
  return (
    <Sheet open={open} onClose={onClose} title="Agregar pieza" subtitle={`Se coloca al centro de la vista · ${VENUE[venue].label}`} wide>
      <div className="relative mb-4">
        <Search size={18} strokeWidth={1.6} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: mesa, pista, arco, carpa…" className="pl-11" autoFocus />
      </div>
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <section key={g.name}>
            <p className="eyebrow mb-2">{g.name}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {g.types.map((t) => {
                const s = ITEM_SPECS[t]
                return (
                  <button
                    key={t}
                    onClick={() => {
                      onPick(t)
                      onClose()
                    }}
                    className="card lift pressable flex flex-col items-center gap-1.5 p-3 text-center"
                  >
                    <PaletteIcon type={t} size={52} />
                    <span className="text-sm leading-tight">{s.label}</span>
                    <span className="text-[11px] text-detail">
                      {s.seats ? `${s.seats} lugares · ` : ''}
                      {s.shape === 'circle' ? `⌀ ${s.w} m` : `${s.w}×${s.h} m`}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
        {!groups.length && <p className="py-6 text-center text-sm text-ink-soft">No hay piezas con “{q}”.</p>}
      </div>
    </Sheet>
  )
}

// ── Escenas ──────────────────────────────────────────────
export function SceneSheet({
  open,
  onClose,
  scene,
  isMain,
  onSave,
  onDelete,
  guests,
}: {
  open: boolean
  onClose: () => void
  scene?: FloorScene | null
  isMain?: boolean
  onSave: (data: { name: string; kind: SceneKind; venue: Venue; time?: string; template: boolean }) => void
  onDelete?: () => void
  guests: number
}) {
  const editing = !!scene
  const [kind, setKind] = useState<SceneKind>('ceremonia')
  const [venue, setVenue] = useState<Venue>('jardin')
  const [name, setName] = useState('')
  const [time, setTime] = useState('')
  const [template, setTemplate] = useState(true)
  useEffect(() => {
    if (!open) return
    setKind(scene?.kind ?? 'ceremonia')
    setVenue(scene?.venue ?? 'jardin')
    setName(scene?.name ?? '')
    setTime(scene?.time ?? '')
    setTemplate(true)
  }, [open, scene])
  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Editar escena' : 'Nueva escena'} subtitle={editing ? undefined : 'Un plano para otro momento del evento: ceremonia, cóctel…'} side="center">
      <div className="flex flex-col gap-4">
        {!isMain && (
          <div>
            <span className="mb-1.5 block text-sm font-medium">Momento</span>
            <Segmented
              className="w-full flex-wrap"
              value={kind}
              onChange={(k) => {
                setKind(k)
                if (!name || Object.values(SCENE_KIND).some((v) => v.label === name)) setName(SCENE_KIND[k].label)
              }}
              options={(['ceremonia', 'coctel', 'recepcion', 'otro'] as SceneKind[]).map((k) => ({ value: k, label: SCENE_KIND[k].label }))}
              size="sm"
            />
          </div>
        )}
        <div>
          <span className="mb-1.5 block text-sm font-medium">¿Dónde?</span>
          <div className="grid grid-cols-2 gap-2">
            {(['salon', 'jardin'] as Venue[]).map((v) => (
              <button key={v} onClick={() => setVenue(v)} className={cx('pressable rounded-[var(--r-md)] p-3 text-left ring-1', venue === v ? 'bg-ink text-paper ring-ink' : 'ring-line hover:bg-wash')}>
                <span className="block font-medium">{VENUE[v].label}</span>
                <span className={cx('block text-xs', venue === v ? 'opacity-70' : 'text-ink-soft')}>
                  {VENUE_SPACES[v].w}×{VENUE_SPACES[v].h} m · hasta {VENUE[v].capacity}
                </span>
              </button>
            ))}
          </div>
          {isMain && <p className="mt-2 text-xs text-detail">Cambia el espacio de la recepción del evento. Las piezas se conservan: revisa que quepan.</p>}
        </div>
        {!isMain && (
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Nombre">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={SCENE_KIND[kind].label} />
            </Field>
            <Field label="Hora">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
        )}
        {!editing && <Toggle checked={template} onChange={setTemplate} label="Empezar con plantilla" description={`Acomodo automático para ${guests} invitados`} />}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {editing && !isMain && onDelete ? (
            <Button variant="danger" onClick={onDelete}>
              Eliminar escena
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onSave({ name: name.trim() || SCENE_KIND[kind].label, kind, venue, time: time || undefined, template })
                onClose()
              }}
            >
              {editing ? 'Guardar' : 'Crear escena'}
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

// ── Copias en serie ──────────────────────────────────────
export function ArraySheet({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (count: number, mode: 'fila' | 'columna' | 'cuadricula', gap: number, cols: number) => void }) {
  const [count, setCount] = useState(4)
  const [mode, setMode] = useState<'fila' | 'columna' | 'cuadricula'>('fila')
  const [gap, setGap] = useState(1.4)
  const [cols, setCols] = useState(4)
  return (
    <Sheet open={open} onClose={onClose} title="Copias en serie" subtitle="Repite la pieza con la misma separación" side="center">
      <div className="flex flex-col gap-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'fila', label: 'En fila' },
            { value: 'columna', label: 'En columna' },
            { value: 'cuadricula', label: 'Cuadrícula' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Copias">
            <Input type="number" inputMode="numeric" min={1} max={40} value={count} onChange={(e) => setCount(clamp(Number(e.target.value) || 1, 1, 40))} />
          </Field>
          <Field label="Pasillo entre piezas (m)" hint="Recomendado: 1.2 m o más">
            <Input type="number" inputMode="decimal" step="0.1" value={gap} onChange={(e) => setGap(clamp(Number(e.target.value) || 0, 0, 10))} />
          </Field>
          {mode === 'cuadricula' && (
            <Field label="Columnas">
              <Input type="number" inputMode="numeric" min={2} max={12} value={cols} onChange={(e) => setCols(clamp(Number(e.target.value) || 2, 2, 12))} />
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onApply(count, mode, gap, cols)
              onClose()
            }}
          >
            Crear {count} copias
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

// ── Plantillas ───────────────────────────────────────────
export function TemplateSheet({ open, onClose, onApply, guests, venue }: { open: boolean; onClose: () => void; onApply: (s: LayoutStyle) => void; guests: number; venue: Venue }) {
  return (
    <Sheet open={open} onClose={onClose} title="Plantillas de acomodo" subtitle={`Reemplaza el plano de esta escena · ${guests} invitados en ${VENUE[venue].label.toLowerCase()}`} side="center">
      <div className="grid gap-3 @xl:grid-cols-2">
        {(Object.keys(LAYOUT_STYLES) as LayoutStyle[]).map((s) => (
          <button key={s} onClick={() => onApply(s)} className="card lift pressable p-5 text-left">
            <div className="heading text-xl">{LAYOUT_STYLES[s].label}</div>
            <div className="mt-1 text-sm text-ink-soft">{LAYOUT_STYLES[s].description}</div>
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-detail">Puedes deshacer si no te gusta el resultado.</p>
    </Sheet>
  )
}

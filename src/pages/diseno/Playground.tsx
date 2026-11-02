// Vitrina viva de los campos inteligentes y las interacciones (para probarlos en un solo lugar).
import { useState } from 'react'
import { Archive, BedDouble, Check, Gem, Home, Plus, ScanLine, Trash2, Trees, User } from 'lucide-react'
import { Badge, Button, Card, CardHeader, toast } from '@/components/ui'
import { Choices, ChoicesMulti, Combobox, DateField, DateRangeField, EmailField, FormScope, MoneyField, NotesField, PhoneField, SaveState, SearchField, Slider, StepTrail, Stepper, TagInput, TextField, TimeField, useAutosave } from '@/components/fields'
import { DragBoard, FlipCard, SortableList, SwipeRow, useContextMenu } from '@/components/interact'
import { ScannerSheet } from '@/components/Scanner'
import { addDaysISO, mxn, nights, today } from '@/lib/format'

type Col = 'pendiente' | 'en-progreso' | 'hecha'

export function Playground() {
  const T = today()
  const [name, setName] = useState('')
  const [money, setMoney] = useState(0)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [guests, setGuests] = useState(2)
  const [date, setDate] = useState<string>()
  const [range, setRange] = useState<{ s?: string; e?: string }>({})
  const [time, setTime] = useState<string>()
  const [unit, setUnit] = useState<string>('')
  const [venue, setVenue] = useState<'salon' | 'jardin'>()
  const [kind, setKind] = useState<'boda' | 'xv' | 'otro'>('boda')
  const [tags, setTags] = useState<string[]>(['Vegetariano'])
  const [multi, setMulti] = useState<string[]>(['wifi'])
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [slider, setSlider] = useState(120)
  const [step, setStep] = useState(1)
  const [reveal, setReveal] = useState(false)
  const [scan, setScan] = useState(false)
  const [rows, setRows] = useState(['Casa Lavanda', 'Cabaña Agave', 'Casa Girasol'])
  const [cards, setCards] = useState<{ id: string; title: string; col: Col }[]>([
    { id: 'a', title: 'Cambiar foco terraza', col: 'pendiente' },
    { id: 'b', title: 'Podar cipreses', col: 'pendiente' },
    { id: 'c', title: 'Revisar bomba', col: 'en-progreso' },
    { id: 'd', title: 'Limpiar filtro', col: 'hecha' },
  ])
  const [program, setProgram] = useState([
    { id: 'p1', time: '18:00', title: 'Ceremonia' },
    { id: 'p2', time: '19:00', title: 'Cóctel' },
    { id: 'p3', time: '20:30', title: 'Cena' },
  ])
  const saveStatus = useAutosave(notes, () => {}, { delay: 800 })
  const ctx = useContextMenu()
  const busy = (iso: string) => iso === addDaysISO(T, 4) || iso === addDaysISO(T, 5)

  return (
    <section className="flex flex-col gap-5">
      <Card className="p-5">
        <CardHeader eyebrow="Campos inteligentes" title="Formularios que ayudan" subtitle="Etiqueta flotante, ✓ cuando está bien, errores que explican" action={<SaveState status={saveStatus} />} />
        <FormScope reveal={reveal}>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextField label="Nombre del huésped" icon={<User />} value={name} onChange={setName} required capitalizeWords suggestions={['Ana Torres', 'Andrea Morales', 'Ángel Ruiz']} />
            <MoneyField label="Total" value={money} onChange={setMoney} suggestion={{ amount: 3700, label: 'Sugerido' }} presets={[1500, 3000]} />
            <PhoneField value={phone} onChange={setPhone} required />
            <EmailField value={email} onChange={setEmail} />
            <Stepper label="Huéspedes" value={guests} onChange={setGuests} min={1} max={10} unit={(n) => (n === 1 ? 'persona' : 'personas · máx. 10')} />
            <DateField label="Fecha del evento" value={date} onChange={setDate} min={T} dayInfo={(iso) => (busy(iso) ? { tone: 'rose', note: 'Boda' } : undefined)} required />
            <DateRangeField className="sm:col-span-2" start={range.s} end={range.e} onChange={(s, e) => setRange({ s, e })} min={T} dayInfo={(iso) => ({ busy: busy(iso), price: new Date(iso).getDay() >= 4 ? 1850 : 1450 })} summary={(s, e) => `${nights(s, e)} noches · ${mxn(nights(s, e) * 1650)}`} />
            <TimeField label="Hora de llegada" value={time} onChange={setTime} presets={['13:00', '15:00', '17:00', '19:00']} />
            <Combobox label="Unidad" icon={<BedDouble />} value={unit} onChange={setUnit} options={['Cabaña Jacaranda', 'Cabaña Agave', 'Cabaña Nogal', 'Casa Girasol', 'Casa Lavanda', 'Casa Magnolia', 'Casa Bugambilia', 'Salón'].map((u) => ({ value: u, label: u, hint: 'hasta 6 personas' }))} onCreate={(q) => q} required />
            <Choices label="Espacio" variant="cards" value={venue} onChange={setVenue} options={[{ value: 'salon', label: 'Salón', hint: 'Techado · 300 personas', icon: <Home />, tone: 'lavender' }, { value: 'jardin', label: 'Jardín', hint: 'Glorieta · 400 personas', icon: <Trees />, tone: 'sage' }]} />
            <Choices label="Tipo" value={kind} onChange={setKind} options={[{ value: 'boda', label: 'Boda', icon: <Gem />, tone: 'rose' }, { value: 'xv', label: 'XV años', tone: 'lavender' }, { value: 'otro', label: 'Otro', tone: 'sage' }]} />
            <ChoicesMulti label="Amenidades" value={multi} onChange={setMulti} options={[{ value: 'wifi', label: 'Wi-Fi' }, { value: 'asador', label: 'Asador' }, { value: 'tina', label: 'Tina' }]} />
            <TagInput label="Dieta y alergias" value={tags} onChange={setTags} suggestions={['Sin gluten', 'Vegano', 'Alergia a nueces']} />
            <NotesField className="sm:col-span-2" label="Notas" value={notes} onChange={setNotes} maxLength={280} templates={['Llegan tarde', 'Traen mascota', 'Piden cuna']} />
            <Slider className="sm:col-span-2" label="Invitados" value={slider} onChange={setSlider} min={20} max={400} step={10} format={(n) => `${n} personas`} marks={[{ value: 20, label: '20' }, { value: 200, label: '200' }, { value: 400, label: '400' }]} />
          </div>
        </FormScope>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SearchField value={search} onChange={setSearch} shortcut placeholder="Buscar invitado…" className="w-72" />
          <Button onClick={() => setReveal(true)}>Intentar guardar</Button>
          <Button variant="outline" icon={<ScanLine size={17} strokeWidth={1.6} />} onClick={() => setScan(true)}>
            Escanear
          </Button>
        </div>
        <StepTrail className="mt-6" steps={['Tipo y fecha', 'Cliente', 'Espacio']} current={step} onStep={setStep} />
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Atrás
          </Button>
          <Button size="sm" onClick={() => setStep((s) => Math.min(3, s + 1))}>
            Siguiente
          </Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader eyebrow="Interacciones" title="Deslizar y mantener presionado" subtitle="Derecha: lista · Izquierda: eliminar con deshacer" />
          <div className="mt-4 flex flex-col gap-2">
            {rows.map((r, i) => (
              <SwipeRow
                key={r}
                hintKey={i === 0 ? 'playground' : undefined}
                left={{ label: 'Lista', icon: <Check />, tone: 'success', onTrigger: () => toast.success(`${r} lista`) }}
                right={{
                  label: 'Eliminar',
                  icon: <Trash2 />,
                  tone: 'danger',
                  remove: true,
                  onTrigger: () => {
                    const prev = rows
                    setRows(rows.filter((x) => x !== r))
                    toast.undo(`${r} se eliminó`, () => setRows(prev))
                  },
                }}
              >
                <div className="card flex items-center justify-between p-4" {...ctx.bind([{ label: 'Marcar lista', icon: <Check />, onClick: () => toast.success('Lista') }, { label: 'Archivar', icon: <Archive />, onClick: () => toast.info('Archivada') }], r)}>
                  <span className="font-medium">{r}</span>
                  <Badge tone="peach">Por limpiar</Badge>
                </div>
              </SwipeRow>
            ))}
          </div>
          {ctx.node}
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <FlipCard
            front={
              <Card className="flex h-full flex-col p-5">
                <span className="kicker">Ocupación</span>
                <span className="display-num mt-3 text-[28px]">78%</span>
                <span className="mt-auto pt-3 text-xs text-ink-3">Toca para ver el detalle</span>
              </Card>
            }
            back={
              <Card className="h-full p-5 text-sm">
                <p className="font-medium">Por unidad</p>
                <p className="mt-2 text-ink-soft">Cabañas 84% · Casas 71%</p>
              </Card>
            }
          />
          <Card className="p-4">
            <p className="kicker mb-2">Programa (reordenar)</p>
            <SortableList
              items={program}
              getId={(p) => p.id}
              onReorder={(next) => setProgram(next.map((p, i) => ({ ...p, time: program[i]!.time })))}
              renderItem={(p, handle) => (
                <div className="flex items-center gap-2 rounded-[12px] bg-sunken px-2 py-1.5 text-sm">
                  {handle}
                  <span className="tabular text-ink-3">{p.time}</span>
                  <span className="font-medium">{p.title}</span>
                </div>
              )}
            />
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <CardHeader eyebrow="Tablero" title="Arrastrar entre columnas" subtitle="Mouse: arrastra · Dedo: mantén presionado y mueve" action={<Button size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => setCards((c) => [...c, { id: String(Date.now()), title: 'Nueva tarea', col: 'pendiente' }])}>Agregar</Button>} />
        <div className="mt-4">
          <DragBoard
            columns={[
              { id: 'pendiente' as Col, title: 'Pendiente', tone: 'peach' },
              { id: 'en-progreso' as Col, title: 'En progreso', tone: 'butter' },
              { id: 'hecha' as Col, title: 'Hecha', tone: 'sky' },
            ]}
            items={cards}
            getId={(c) => c.id}
            getColumn={(c) => c.col}
            onMove={(id, to) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, col: to } : c)))}
            renderCard={(c) => (
              <div className="card p-3.5 text-sm">
                <p className="font-medium">{c.title}</p>
                <p className="mt-1 text-xs text-ink-3">Chuy · mañana 10:00</p>
              </div>
            )}
          />
        </div>
      </Card>

      <ScannerSheet open={scan} onClose={() => setScan(false)} onResult={(t) => toast.success('Código leído', t)} formats={['qr_code', 'ean_13']} hint="Apunta al pase o al código de barras" />
    </section>
  )
}

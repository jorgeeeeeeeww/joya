// Vitrina step1: todos los componentes y estados del sistema de La Joya.
import { useState } from 'react'
import { ArrowRight, Heart, Plus, Sparkles } from 'lucide-react'
import { AreaChart, BarChart, Donut, Legend } from '@/components/charts'
import { Avatar, Badge, Button, Card, CardHeader, Chip, Empty, Estela, Field, IconBubble, Input, PageHeader, ProgressBar, ProgressRing, Segmented, Select, Stat, Textarea, Toggle, toast } from '@/components/ui'
import { CountUp, Horizon, LightDots, Luz, NightSlab, SkyBlock, Sparkle } from '@/components/step1'
import type { Pastel } from '@/lib/types'
import { TONE } from '@/lib/meta'
import { Playground } from './diseno/Playground'

const SWATCHES = ['paper', 'surface', 'sunken', 'ink', 'ink-soft', 'primary', 'secondary', 'matiz', 'chispa', 'luz', 'night', 'success', 'warning', 'danger', 'info']

export default function Diseno() {
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a')
  const [on, setOn] = useState(true)
  const [chip, setChip] = useState(0)
  return (
    <div className="flex flex-col gap-8 pb-10">
      <PageHeader eyebrow="Sistema de diseño" title="step1 · atmósfera Flor" subtitle="Papel cálido, una luz que guía, capas con profundidad, grano sutil y movimiento de deriva." />

      <Playground />

      <NightSlab className="px-8 py-14 md:px-14">
        <p className="eyebrow !text-on-night-soft">Losa noche</p>
        <h2 className="heading mt-3 max-w-[14ch] text-[clamp(2.4rem,2rem+2vw,4rem)] text-on-night">La luz del atardecer guía el día.</h2>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="luz" iconRight={<ArrowRight size={18} strokeWidth={1.6} />}>
            Botón luz
          </Button>
          <Button variant="ghost" className="!text-on-night ring-1 ring-[color-mix(in_oklab,var(--on-night)_30%,transparent)]">
            Fantasma claro
          </Button>
        </div>
        <div className="h-24" />
      </NightSlab>

      <Card className="overflow-hidden">
        <SkyBlock />
        <div className="px-6 pb-8 text-center">
          <h2 className="heading text-3xl">Cielo que se funde con el papel</h2>
          <p className="mt-2 text-ink-soft">Patrón de onboarding y paneles móviles.</p>
        </div>
      </Card>

      <section>
        <h2 className="heading mb-4 text-2xl">Color</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
          {SWATCHES.map((s) => (
            <div key={s} className="card overflow-hidden">
              <div className="h-16" style={{ background: `var(--${s})` }} />
              <div className="px-3 py-2 text-xs">{s}</div>
            </div>
          ))}
          {(Object.keys(TONE) as Pastel[]).map((t) => (
            <div key={t} className="card overflow-hidden">
              <div className="h-16" style={{ background: TONE[t].hex }} />
              <div className="px-3 py-2 text-xs">tono {t}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="heading text-xl">Botones</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button>Primario</Button>
            <Button variant="tinta">Tinta</Button>
            <Button variant="chispa" iconRight={<ArrowRight size={18} />}>
              Chispa
            </Button>
            <Button variant="secondary">Secundario</Button>
            <Button variant="outline">Fantasma</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Eliminar</Button>
            <Button loading>Guardando</Button>
            <Button disabled>Deshabilitado</Button>
            <Button size="icon" variant="outline" aria-label="Agregar">
              <Plus size={18} />
            </Button>
          </div>
          <Estela className="my-6" />
          <h3 className="heading text-xl">Controles</h3>
          <div className="mt-4 flex flex-col gap-4">
            <Segmented value={seg} onChange={setSeg} options={[{ value: 'a', label: 'Día' }, { value: 'b', label: 'Semana' }, { value: 'c', label: 'Mes' }]} />
            <div className="flex flex-wrap gap-2">
              {['Todo', 'Salón', 'Jardín'].map((c, i) => (
                <Chip key={c} active={chip === i} onClick={() => setChip(i)} count={i * 3 + 2}>
                  {c}
                </Chip>
              ))}
            </div>
            <Toggle checked={on} onChange={setOn} label="Automatización" description="Crea la limpieza al hacer check-out" />
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="heading text-xl">Campos</h3>
          <div className="mt-4 grid gap-4">
            <Field label="Nombre del cliente" hint="Como aparecerá en el contrato">
              <Input placeholder="Fernanda Ruiz" />
            </Field>
            <Field label="Correo" error="Falta la arroba. Ejemplo: nombre@correo.com">
              <Input aria-invalid defaultValue="fernanda.correo.com" />
            </Field>
            <Field label="Lugar">
              <Select>
                <option>Salón</option>
                <option>Jardín</option>
              </Select>
            </Field>
            <Field label="Notas">
              <Textarea placeholder="Temática, colores, detalles…" />
            </Field>
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ocupación hoy" value="5/7" sub="71% de las unidades" tone="sky" icon={<Heart size={16} />} />
        <Stat label="Ingresos del mes" value={<CountUp value={184500} format={(n) => '$' + Math.round(n).toLocaleString('es-MX')} />} accent delta={{ value: '+12%', good: true }} />
        <Stat label="Eventos" value="6" sub="Este mes" tone="rose" />
        <Stat label="Limpiezas" value="3" sub="Pendientes hoy" tone="peach" />
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6">
          <h3 className="heading text-xl">Insignias y avatares</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(TONE) as Pastel[]).map((t) => (
              <Badge key={t} tone={t} dot>
                {t}
              </Badge>
            ))}
            <Badge tone="butter" sparkle>
              Recomendado
            </Badge>
          </div>
          <div className="mt-5 flex -space-x-2">
            {['Lupita Ramírez', 'María González', 'Carmen López', 'Jesús Pérez'].map((n, i) => (
              <Avatar key={n} name={n} tone={(['rose', 'mint', 'sky', 'butter'] as Pastel[])[i]} size={40} />
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <IconBubble tone="rose" orb>
              <Sparkles size={20} strokeWidth={1.6} />
            </IconBubble>
            <IconBubble tone="mint">
              <Sparkles size={18} strokeWidth={1.6} />
            </IconBubble>
            <LightDots className="text-chispa-soft" />
            <Sparkle className="text-chispa-soft" />
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="heading text-xl">Progreso</h3>
          <div className="mt-5 flex items-center gap-5">
            <ProgressRing value={0.68} size={72} gradient />
            <ProgressRing value={0.35} size={56} tone="rose" />
          </div>
          <ProgressBar value={0.62} className="mt-6" />
          <ProgressBar value={0.3} tone="sage" className="mt-3" />
          <div className="skeleton mt-6 h-10 rounded-full" />
        </Card>
        <Card className="overflow-hidden">
          <Empty kind="limpieza" title="Sin limpiezas pendientes" body="Cuando alguien haga check-out aparecerá aquí." action={<Button size="sm">Crear limpieza</Button>} />
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Gráficas" subtitle="Colores de datos de la atmósfera" />
          <div className="p-4">
            <BarChart
              data={['jun', 'jul', 'ago', 'sep', 'oct', 'nov'].map((m, i) => ({ label: m, a: 40000 + i * 9000, b: 30000 + ((i * 7) % 5) * 12000 }))}
              series={[
                { key: 'a', label: 'Hospedaje', tone: 'sky' },
                { key: 'b', label: 'Eventos', tone: 'rose' },
              ]}
            />
            <AreaChart data={Array.from({ length: 14 }, (_, i) => ({ label: `${i + 1} nov`, value: 30 + ((i * 37) % 60) }))} tone="sage" max={100} />
          </div>
        </Card>
        <Card className="flex items-center gap-6 p-6">
          <Donut segments={[{ label: 'Airbnb', value: 12, tone: 'rose' }, { label: 'Directo', value: 8, tone: 'sky' }, { label: 'WhatsApp', value: 5, tone: 'sage' }]} center={<span className="display-num text-2xl">25</span>} />
          <Legend items={[{ label: 'Airbnb', tone: 'rose', value: 12 }, { label: 'Directo', tone: 'sky', value: 8 }, { label: 'WhatsApp', tone: 'sage', value: 5 }]} />
        </Card>
      </section>

      <Card className="relative overflow-hidden p-6">
        <h3 className="heading text-xl">Luz y horizonte</h3>
        <div className="relative mt-4 h-48 overflow-hidden rounded-[var(--r-lg)] bg-cielo-soft">
          <Luz size={90} className="absolute top-6 left-1/2 -translate-x-1/2" />
          <Horizon className="absolute inset-x-0 bottom-0 h-1/2" />
        </div>
        <Button className="mt-5" variant="outline" onClick={() => toast.success('Guardado', 'Así se ve un aviso')}>
          Probar aviso
        </Button>
      </Card>
    </div>
  )
}

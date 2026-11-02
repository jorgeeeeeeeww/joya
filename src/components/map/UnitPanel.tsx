// Detalle del elemento seleccionado en el mapa (unidad, salón, jardín u otra área) · step1.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Baby, Bath, BedDouble, CalendarClock, CalendarHeart, Car, DoorOpen, Droplets, MessageCircle, Sparkles, TreePalm, Users, Warehouse } from 'lucide-react'
import { featureById, type MapFeature } from '@/lib/layout'
import { db, useCollection, useDoc, useMe } from '@/lib/store'
import { EVENT_STATUS, EVENT_TYPE, RES_SOURCE, TONE, UNIT_STATUS, VENUE, seesMoney } from '@/lib/meta'
import { mxn, nights, relativeDay, today, waLink, fmt } from '@/lib/format'
import { haptic } from '@/lib/motion'
import type { Pastel, UnitStatus } from '@/lib/types'
import { Badge, Button, cx, ProgressBar, toast } from '@/components/ui'

const AREA_INFO: Partial<Record<MapFeature['kind'], { icon: typeof Car; text: string; tone: Pastel }>> = {
  parking: { icon: Car, text: 'Estacionamiento para huéspedes e invitados, con acceso directo por C. Crisantemo.', tone: 'sky' },
  juegos: { icon: Baby, text: 'Área de juegos con arena junto al salón. Ideal para los niños durante los eventos.', tone: 'butter' },
  glorieta: { icon: Droplets, text: 'Glorieta con fuente al centro del jardín de eventos, rodeada de palmeras.', tone: 'mint' },
  pasto: { icon: TreePalm, text: 'Área verde con árboles. Se puede usar para convivios pequeños o fotos.', tone: 'sage' },
  bodega: { icon: Warehouse, text: 'Bodega de mobiliario, herramienta e insumos.', tone: 'peach' },
  entrada: { icon: DoorOpen, text: 'Acceso principal del rancho por C. Crisantemo.', tone: 'lavender' },
}

export function UnitPanel({ featureId, compactHeader }: { featureId: string; compactHeader?: boolean }) {
  const f = featureById(featureId)
  if (!f) return null
  if (f.unitId) return <UnitDetail unitId={f.unitId} feature={f} compactHeader={compactHeader} />
  if (f.venue) return <VenueDetail feature={f} compactHeader={compactHeader} />
  const info = AREA_INFO[f.kind]
  const Icon = info?.icon ?? TreePalm
  return (
    <div className="flex flex-col gap-4">
      <Hero tone={info?.tone ?? 'sage'} icon={<Icon size={30} strokeWidth={1.6} />} eyebrow="Área del rancho" title={f.name} subtitle={`${Math.round(f.w)} × ${Math.round(f.d)} m`} hidden={compactHeader} />
      <p className="text-[15px] text-ink-soft">{info?.text}</p>
    </div>
  )
}

/** Cabecera con la luz del tono: degradado apagado + horizonte que se funde con la superficie */
function Hero({ tone, icon, eyebrow, title, subtitle, badge, hidden }: { tone: Pastel; icon: React.ReactNode; eyebrow?: string; title: string; subtitle?: string; badge?: React.ReactNode; hidden?: boolean }) {
  const c = TONE[tone].hex
  return (
    <div className="relative overflow-hidden rounded-[var(--r-lg)]" style={{ background: `linear-gradient(165deg, color-mix(in oklab, ${c} 36%, var(--surface)) 0%, color-mix(in oklab, ${c} 12%, var(--surface)) 70%)` }}>
      <span aria-hidden className="absolute -top-10 -right-8 h-36 w-36 rounded-full opacity-70 blur-2xl" style={{ background: 'color-mix(in oklab, var(--luz) 70%, transparent)' }} />
      <svg aria-hidden viewBox="0 0 400 60" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-8 w-full">
        <path d="M0 34 C70 22 140 26 200 34 S330 20 400 30 V60 H0Z" fill="var(--surface)" opacity="0.45" />
        <path d="M0 48 C90 40 180 44 260 47 S360 42 400 45 V60 H0Z" fill="var(--surface)" opacity="0.8" />
      </svg>
      <div className="relative flex items-center gap-4 p-5 pb-8">
        <span className={cx('flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[color-mix(in_oklab,var(--surface)_82%,transparent)] shadow-[var(--shadow-1)]', TONE[tone].ink)}>{icon}</span>
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          {!hidden && <h2 className="heading mt-1 truncate text-[1.7rem]">{title}</h2>}
          {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
          {badge && <div className="mt-2">{badge}</div>}
        </div>
      </div>
    </div>
  )
}

const STATUS_FLOW: UnitStatus[] = ['lista', 'ocupada', 'sucia', 'limpiando', 'inspeccion', 'mantenimiento']

function UnitDetail({ unitId, feature, compactHeader }: { unitId: string; feature: MapFeature; compactHeader?: boolean }) {
  const unit = useDoc('units', unitId)
  const me = useMe()
  const reservations = useCollection('reservations')
  const tasks = useCollection('tasks')
  const money = seesMoney(me?.role)
  const canChange = me?.role === 'admin' || me?.role === 'limpieza'
  const t = today()

  const { current, next } = useMemo(() => {
    const mine = reservations.filter((r) => r.unitId === unitId && r.status !== 'cancelada')
    return {
      current: mine.find((r) => r.status === 'en-casa'),
      next: mine.filter((r) => (r.status === 'confirmada' || r.status === 'pendiente') && r.checkIn >= t && !(r.guests === 0 && r.externalUid)).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0],
    }
  }, [reservations, unitId, t])
  const cleaning = useMemo(() => tasks.find((x) => x.unitId === unitId && x.type === 'limpieza' && x.status !== 'verificada'), [tasks, unitId])

  if (!unit) return null
  const st = UNIT_STATUS[unit.status]
  const done = cleaning ? cleaning.checklist.filter((c) => c.done).length : 0

  return (
    <div className="flex flex-col gap-4">
      <Hero
        tone={unit.color}
        icon={<BedDouble size={30} strokeWidth={1.6} />}
        eyebrow={unit.kind === 'cabana' ? 'Cabaña' : 'Casa'}
        title={unit.name}
        subtitle={`${feature.w} × ${feature.d} m · ${unit.beds}`}
        badge={
          <Badge tone={st.tone} dot className="!bg-[color-mix(in_oklab,var(--surface)_86%,transparent)]">
            {st.label}
          </Badge>
        }
        hidden={compactHeader}
      />

      <div className="grid grid-cols-3 gap-2">
        <Fact icon={<Users size={15} strokeWidth={1.6} />} label="Huéspedes" value={`${unit.capacity}`} />
        <Fact icon={<BedDouble size={15} strokeWidth={1.6} />} label="Recámaras" value={`${unit.bedrooms}`} />
        <Fact icon={<Bath size={15} strokeWidth={1.6} />} label="Baños" value={`${unit.baths}`} />
      </div>
      <p className="text-[15px] text-ink-soft">{unit.description}</p>
      {money && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="rounded-[14px] bg-sunken px-3.5 py-2.5">
            <span className="block text-xs text-ink-soft">Entre semana</span>
            <span className="display-num text-[1.3rem]">{mxn(unit.basePrice)}</span>
          </span>
          <span className="rounded-[14px] bg-sunken px-3.5 py-2.5">
            <span className="block text-xs text-ink-soft">Viernes y sábado</span>
            <span className="display-num text-[1.3rem]">{mxn(unit.weekendPrice)}</span>
          </span>
        </div>
      )}

      {canChange && (
        <div>
          <p className="eyebrow mb-2">Cambiar estado</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FLOW.map((s) => {
              const m = UNIT_STATUS[s]
              const active = unit.status === s
              return (
                <button
                  key={s}
                  aria-pressed={active}
                  onClick={() => {
                    if (active) return
                    haptic.select()
                    db.patch('units', unit.id, { status: s }, { summary: `${unit.name}: estado → ${m.label}` })
                    toast.success(unit.name, `Ahora está: ${m.label}`)
                  }}
                  className={cx('pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px]', active ? 'bg-ink text-paper' : 'text-ink-soft ring-1 ring-line-strong ring-inset hover:bg-wash hover:text-ink')}
                >
                  <span className={cx('h-2 w-2 rounded-full', TONE[m.tone].solid)} />
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {cleaning && (
        <div className="rounded-[18px] bg-sunken p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium">
              <Sparkles size={16} strokeWidth={1.6} className="text-ink-soft" /> Limpieza
            </span>
            <Badge tone={cleaning.status === 'hecha' ? 'mint' : cleaning.status === 'en-progreso' ? 'butter' : 'peach'} dot>
              {cleaning.status === 'hecha' ? 'Por revisar' : cleaning.status === 'en-progreso' ? 'En progreso' : 'Pendiente'}
            </Badge>
          </div>
          <ProgressBar value={cleaning.checklist.length ? done / cleaning.checklist.length : 0} />
          <p className="mt-2 text-xs text-ink-soft">
            {done} de {cleaning.checklist.length} pasos
            {cleaning.assigneeId && ` · ${db.get('employees', cleaning.assigneeId)?.name ?? ''}`}
          </p>
        </div>
      )}

      {current && (
        <div className="rounded-[18px] p-4 ring-1 ring-line ring-inset">
          <p className="eyebrow mb-1.5">Huésped en casa</p>
          <p className="heading text-[1.25rem]">{current.guestName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
            {current.guests} huéspedes · sale {relativeDay(current.checkOut).toLowerCase()}
            <Badge tone={RES_SOURCE[current.source].tone}>{RES_SOURCE[current.source].label}</Badge>
          </p>
          {current.phone && (
            <a href={waLink(current.phone, `Hola ${current.guestName.split(' ')[0]}, te saludamos de Jardines La Joya. ¿Todo bien en ${unit.name}?`)} target="_blank" rel="noreferrer" className="pressable mt-3 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-ink ring-1 ring-line-strong ring-inset hover:bg-wash">
              <MessageCircle size={16} strokeWidth={1.6} /> WhatsApp
            </a>
          )}
        </div>
      )}

      <div className="rounded-[18px] p-4 ring-1 ring-line ring-inset">
        <p className="eyebrow mb-1.5 flex items-center gap-1.5">
          <CalendarClock size={13} strokeWidth={1.6} /> Próxima llegada
        </p>
        {next ? (
          <>
            <p className="font-medium">{next.guestName}</p>
            <p className="text-sm text-ink-soft">
              {relativeDay(next.checkIn)}
              {next.arrivalTime ? ` a las ${next.arrivalTime}` : ''} · {nights(next.checkIn, next.checkOut)} noches · {next.guests} huéspedes
              {money ? ` · ${mxn(next.total)}` : ''}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-soft">Sin reservas próximas</p>
        )}
      </div>

      {unit.amenities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unit.amenities.map((a) => (
            <span key={a} className="rounded-full px-3 py-1 text-xs text-ink-soft ring-1 ring-line ring-inset">
              {a}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        {me?.role === 'admin' && (
          <Link to={`/hospedaje?u=${unit.id}`}>
            <Button variant="secondary" className="w-full" icon={<BedDouble size={16} strokeWidth={1.6} />}>
              Reservar
            </Button>
          </Link>
        )}
        <Link to="/limpieza" className={me?.role === 'admin' ? '' : 'col-span-2'}>
          <Button variant="outline" className="w-full" icon={<Sparkles size={16} strokeWidth={1.6} />}>
            Limpieza
          </Button>
        </Link>
      </div>
    </div>
  )
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-sunken px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-ink-soft">
        {icon}
        {label}
      </div>
      <div className="display-num mt-1 text-[1.6rem]">{value}</div>
    </div>
  )
}

function VenueDetail({ feature, compactHeader }: { feature: MapFeature; compactHeader?: boolean }) {
  const venue = feature.venue!
  const me = useMe()
  const events = useCollection('events')
  const t = today()
  const upcoming = useMemo(() => events.filter((e) => e.venue === venue && e.date >= t && e.status !== 'cancelado').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6), [events, venue, t])
  const v = VENUE[venue]
  const canEvents = me?.role === 'admin' || me?.role === 'eventos'
  return (
    <div className="flex flex-col gap-4">
      <Hero tone={v.tone} icon={venue === 'salon' ? <CalendarHeart size={30} strokeWidth={1.6} /> : <TreePalm size={30} strokeWidth={1.6} />} eyebrow="Espacio para eventos" title={feature.name} subtitle={`Hasta ${v.capacity} invitados · ${feature.w} × ${feature.d} m`} hidden={compactHeader} />
      <p className="text-[15px] text-ink-soft">{v.description}.</p>
      <div>
        <p className="eyebrow mb-2.5">Próximos eventos</p>
        {upcoming.length === 0 && <p className="text-sm text-ink-soft">Sin eventos próximos en este espacio.</p>}
        <div className="flex flex-col gap-2">
          {upcoming.map((e) => {
            const type = EVENT_TYPE[e.type]
            const Icon = type.icon
            const inner = (
              <div className="pressable flex items-center gap-3 rounded-[18px] p-3 ring-1 ring-line ring-inset hover:bg-wash">
                <span className={cx('flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[14px] leading-none', TONE[type.tone].soft, TONE[type.tone].ink)}>
                  <span className="display-num text-[1.15rem]">{e.date.slice(8).replace(/^0/, '')}</span>
                  <span className="mt-0.5 text-[10px] uppercase">{fmt(e.date, 'MMM')}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate font-medium">
                    <Icon size={14} strokeWidth={1.6} className="shrink-0 text-ink-soft" />
                    {e.title}
                  </span>
                  <span className="block text-xs text-ink-soft">
                    {type.label} · {e.guests} invitados · {relativeDay(e.date)}
                  </span>
                </span>
                <Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge>
              </div>
            )
            return canEvents ? (
              <Link key={e.id} to={`/eventos/${e.id}`}>
                {inner}
              </Link>
            ) : (
              <div key={e.id}>{inner}</div>
            )
          })}
        </div>
      </div>
      {canEvents && (
        <Link to={`/eventos?nuevo=${venue}`}>
          <Button variant="secondary" className="w-full" iconRight={<ArrowRight size={16} strokeWidth={1.6} />}>
            Nuevo evento en el {v.label.toLowerCase()}
          </Button>
        </Link>
      )}
    </div>
  )
}

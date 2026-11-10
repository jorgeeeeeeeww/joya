// Salón y jardín: el espacio de trabajo de la Wedding planner para montar cada evento.
// Elige el recinto y el evento, acomoda las mesas en el plano 2D y revisa el montaje en 3D.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { Armchair, Box, CalendarPlus, ChevronRight, Eye, Footprints, LayoutGrid, Maximize2, Minimize2, Plus, Trees, Undo2 } from 'lucide-react'
import { db, useCollection, useMe } from '@/lib/store'
import { EVENT_STATUS, EVENT_TYPE, TONE, VENUE } from '@/lib/meta'
import { ITEM_SPECS, MAIN_SCENE_ID, SCENE_KIND, eventScenes, eventVenues, newScene, sceneForVenue } from '@/lib/floorplan'
import { VENUE_SPACES } from '@/lib/layout'
import { daysUntil, fmt, today } from '@/lib/format'
import { ease } from '@/lib/motion'
import type { RanchEvent, SceneKind, Venue } from '@/lib/types'
import { Badge, Button, Card, cx, Empty, IconBubble, PageHeader, Segmented, toast, useMedia } from '@/components/ui'
import { Combobox } from '@/components/fields'
import { EventOrb, PaletteDots } from '@/components/events/EventOrb'
import { NewEventSheet } from '@/components/events/NewEventSheet'

const FloorPlanEditor = lazy(() => import('@/components/floorplan/FloorPlanEditor'))
const VenueScene3D = lazy(() => import('@/components/venue/VenueScene3D'))

const VENUE_INFO: Record<Venue, { icon: typeof Armchair; perks: string[] }> = {
  salon: { icon: Armchair, perks: ['Techado', 'Pista', 'Cocina', 'Baños', 'Terraza de entrada'] },
  jardin: { icon: Trees, perks: ['Al aire libre', 'Glorieta con fuente', 'Palmeras', 'Ideal para ceremonias', 'Considerar carpa'] },
}

export default function Espacios() {
  const navigate = useNavigate()
  const events = useCollection('events')
  const [params, setParams] = useSearchParams()
  const venue = (params.get('v') === 'jardin' ? 'jardin' : 'salon') as Venue
  const [view3, setView] = useState<'2d' | '3d'>(() => (params.get('vista') === '3d' ? '3d' : '2d'))
  // El montaje 3D solo para el dueño en pantalla grande; en celular y para el equipo, el plano (más ligero y claro)
  const meRole = useMe()?.role
  const bigScreen = useMedia('(min-width: 1024px)')
  const can3d = meRole === 'admin' && bigScreen
  const view = can3d ? view3 : '2d'
  const [selected, setSelected] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [big, setBig] = useState(false)
  const [sceneSel, setSceneSel] = useState<string | null>(null)
  const [viewFrom, setViewFrom] = useState<string | null>(null)
  const [tour, setTour] = useState(false)
  const [newKind, setNewKind] = useState<SceneKind>(venue === 'jardin' ? 'ceremonia' : 'coctel')
  const T = today()

  const upcoming = useMemo(() => events.filter((e) => e.status !== 'cancelado' && e.date >= T).sort((a, b) => a.date.localeCompare(b.date)), [events, T])
  const venueEvents = useMemo(() => upcoming.filter((e) => eventVenues(e).includes(venue)), [upcoming, venue])
  // Eventos que aún no usan este espacio: se pueden elegir para agregarles una escena aquí
  const otherEvents = useMemo(() => upcoming.filter((e) => !eventVenues(e).includes(venue)).slice(0, 8), [upcoming, venue])
  const eventId = params.get('e')
  const ev: RanchEvent | undefined =
    venueEvents.find((e) => e.id === eventId) ?? otherEvents.find((e) => e.id === eventId) ?? venueEvents.find((e) => e.status === 'confirmado' || e.status === 'apartado') ?? venueEvents[0]
  const scenes = ev ? eventScenes(ev) : []
  const scene = scenes.find((sc) => sc.id === sceneSel && sc.venue === venue) ?? (ev ? sceneForVenue(ev, venue) : undefined)
  const items = scene?.items ?? []
  const isMain = scene?.id === MAIN_SCENE_ID

  useEffect(() => {
    setSelected(null)
    setViewFrom(null)
    setTour(false)
  }, [ev?.id, venue, scene?.id])
  useEffect(() => setNewKind(venue === 'jardin' ? 'ceremonia' : 'coctel'), [venue])

  const setVenue = (v: Venue) => {
    setSceneSel(null)
    setParams(ev && eventVenues(ev).includes(v) ? { v, e: ev.id } : { v }, { replace: true })
  }
  const setEvent = (id: string) => {
    setSceneSel(null)
    setParams({ v: venue, e: id }, { replace: true })
  }
  // El editor o la barra de escenas cambian de escena: si es de otro espacio, cambia el recinto
  const changeScene = (id: string) => {
    if (!ev) return
    const fresh = db.get('events', ev.id) ?? ev
    const sc = eventScenes(fresh).find((x) => x.id === id)
    setSceneSel(id)
    if (sc && sc.venue !== venue) setParams({ v: sc.venue, e: ev.id }, { replace: true })
  }
  const addSceneHere = () => {
    if (!ev) return
    const fresh = db.get('events', ev.id) ?? ev
    const sc = { ...newScene(newKind, venue, ev.guests), time: newKind === 'ceremonia' ? ev.startTime : undefined }
    db.patch('events', ev.id, { scenes: [...(fresh.scenes ?? []), sc] }, { summary: `Agregó la escena ${sc.name} a ${ev.title}` })
    setSceneSel(sc.id)
    setParams({ v: venue, e: ev.id }, { replace: true })
    toast.success('Escena agregada', `${sc.name} en el ${VENUE[venue].label.toLowerCase()}, con una plantilla para empezar`)
  }

  const selectedItem = items.find((i) => i.id === selected)
  const selectedKey = selectedItem ? (selectedItem.type === 'mesa-principal' && !selectedItem.number ? 0 : selectedItem.number) : undefined
  const guestsAtSelected = isMain && selectedItem && ITEM_SPECS[selectedItem.type].isTable && selectedKey !== undefined ? (ev?.guestList ?? []).filter((g) => g.table === selectedKey && g.rsvp !== 'declinado') : []
  const canViewFrom = !!selectedItem && (ITEM_SPECS[selectedItem.type].isTable || selectedItem.type === 'lounge' || selectedItem.type === 'sillas-ceremonia')

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader
        eyebrow="Espacios de eventos"
        title="Salón y jardín"
        subtitle={can3d ? 'Monta cada evento en su espacio: acomoda mesas en el plano y revisa cómo se verá en 3D.' : 'Monta cada evento en su espacio: elige el evento y acomoda las mesas en el plano.'}
        actions={
          <Button variant="tinta" icon={<CalendarPlus size={18} strokeWidth={1.6} />} onClick={() => setNewOpen(true)}>
            Evento en {VENUE[venue].label.toLowerCase()}
          </Button>
        }
      />

      {/* Una sola barra: qué espacio y qué evento. El plano va justo debajo. */}
      <Card className="flex flex-col gap-4 p-4 md:p-5 lg:flex-row lg:items-end">
        <div className="flex min-w-0 flex-col gap-2 lg:w-[340px] lg:shrink-0">
          <Segmented<Venue>
            className="flex w-full [&>*]:flex-1"
            value={venue}
            onChange={setVenue}
            options={(['salon', 'jardin'] as Venue[]).map((v) => {
              const Icon = VENUE_INFO[v].icon
              return { value: v, label: <><Icon size={16} strokeWidth={1.6} /> {VENUE[v].label}</> }
            })}
          />
          <p className="px-1 text-[13px] leading-snug text-detail">
            Hasta {VENUE[venue].capacity} personas · {VENUE_SPACES[venue].w} × {VENUE_SPACES[venue].h} m · {VENUE_INFO[venue].perks.join(', ').toLowerCase()}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          {venueEvents.length + otherEvents.length > 0 ? (
            <Combobox
              label="Evento"
              value={ev?.id ?? ''}
              onChange={(id) => id && setEvent(id)}
              searchPlaceholder="Buscar evento…"
              options={[
                ...venueEvents.map((e) => {
                  const d = daysUntil(e.date)
                  return { value: e.id, label: e.title, hint: `${fmt(e.date, 'EEE d MMM')} · ${e.guests} inv. · ${d === 0 ? 'hoy' : `en ${d} d`}`, tone: EVENT_TYPE[e.type].tone }
                }),
                ...otherEvents.map((e) => ({ value: e.id, label: e.title, hint: `Sin escena aquí · ${fmt(e.date, 'EEE d MMM')} · en ${VENUE[e.venue].label.toLowerCase()}`, icon: <Plus size={15} strokeWidth={1.6} /> })),
              ]}
            />
          ) : (
            <p className="text-sm text-ink-soft">No hay eventos próximos en el {VENUE[venue].label.toLowerCase()}.</p>
          )}
        </div>
      </Card>

      {!ev ? (
        <Card>
          <Empty kind="evento" title={`No hay eventos próximos en el ${VENUE[venue].label.toLowerCase()}`} body="Crea uno y aquí podrás acomodar sus mesas y verlo en 3D." action={<Button onClick={() => setNewOpen(true)}>Crear evento</Button>} />
        </Card>
      ) : (
        <>
          {/* Encabezado del montaje */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <EventOrb type={ev.type} size="lg" orb />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="heading text-[1.5rem] leading-tight md:text-[1.7rem]">{ev.title}</h2>
                  <Badge tone={EVENT_STATUS[ev.status].tone} dot>
                    {EVENT_STATUS[ev.status].label}
                  </Badge>
                </div>
                <p className="text-sm text-ink-soft">
                  {fmt(ev.date, "EEEE d 'de' MMMM")} · {ev.startTime}–{ev.endTime} · {EVENT_TYPE[ev.type].label}
                </p>
              </div>
              <PaletteDots colors={ev.palette} className="ml-1 max-sm:hidden" />
            </div>
            <Button variant="ghost" size="sm" iconRight={<ChevronRight size={16} strokeWidth={1.6} />} onClick={() => navigate(`/eventos/${ev.id}`)}>
              Ver evento
            </Button>
            {scene && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {can3d && <Segmented
                  value={view}
                  onChange={setView}
                  options={[
                    { value: '2d', label: <><LayoutGrid size={15} strokeWidth={1.6} /> Plano</> },
                    { value: '3d', label: <><Box size={15} strokeWidth={1.6} /> Montaje 3D</> },
                  ]}
                />}
                {view === '3d' && (
                  <>
                    <Button
                      variant={tour ? 'tinta' : 'outline'}
                      aria-pressed={tour}
                      icon={<Footprints size={18} strokeWidth={1.6} />}
                      onClick={() => {
                        setViewFrom(null)
                        setTour((t) => !t)
                      }}
                    >
                      Recorrido
                    </Button>
                    <Button variant="outline" size="icon" aria-label={big ? 'Vista normal' : 'Vista amplia'} onClick={() => setBig((b) => !b)}>
                      {big ? <Minimize2 size={18} strokeWidth={1.6} /> : <Maximize2 size={18} strokeWidth={1.6} />}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {!scene ? (
            /* El evento aún no usa este espacio */
            <Card className="p-5 md:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <IconBubble tone={VENUE[venue].tone} size="lg">
                  {venue === 'jardin' ? <Trees size={24} strokeWidth={1.6} /> : <Armchair size={24} strokeWidth={1.6} />}
                </IconBubble>
                <div className="min-w-0 flex-1">
                  <h3 className="heading text-[1.5rem] leading-tight">
                    {ev.title} todavía no usa el {VENUE[venue].label.toLowerCase()}
                  </h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    Su recepción es en el {VENUE[ev.venue].label.toLowerCase()}. Agrega aquí la ceremonia, el cóctel u otro momento: empieza con una plantilla para {ev.guests} invitados y ajústala en el plano.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
                {(Object.keys(SCENE_KIND) as SceneKind[]).map((k) => {
                  const on = newKind === k
                  return (
                    <button
                      key={k}
                      onClick={() => setNewKind(k)}
                      aria-pressed={on}
                      className={cx('pressable flex min-h-12 items-center gap-2.5 rounded-[var(--r-md)] px-3 py-2 text-left text-sm transition-colors', on ? 'bg-ink text-paper' : 'ring-1 ring-line hover:bg-wash')}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: TONE[SCENE_KIND[k].tone].hex }} />
                      {SCENE_KIND[k].label}
                    </button>
                  )
                })}
              </div>
              {ev.status !== 'realizado' && (
                <Button className="mt-5 w-full sm:w-auto" icon={<Plus size={18} strokeWidth={1.6} />} onClick={addSceneHere}>
                  Agregar escena en este espacio
                </Button>
              )}
            </Card>
          ) : view === '2d' ? (
            <Suspense fallback={<div className="skeleton h-[560px] rounded-[var(--r-lg)]" />}>
              <FloorPlanEditor key={ev.id} event={ev} sceneId={scene.id} onSceneChange={changeScene} readOnly={ev.status === 'realizado'} />
            </Suspense>
          ) : (
            <div className="flex min-w-0 flex-col gap-3">
              {scenes.length > 1 && (
                <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
                  {scenes.map((sc) => {
                    const on = sc.id === scene.id
                    return (
                      <button
                        key={sc.id}
                        onClick={() => changeScene(sc.id)}
                        className={cx('pressable flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm whitespace-nowrap transition-colors', on ? 'bg-ink text-paper' : 'bg-surface ring-1 ring-line hover:bg-wash')}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: TONE[SCENE_KIND[sc.kind].tone].hex }} />
                        {sc.name} <span className={on ? 'opacity-70' : 'text-ink-soft'}>· {VENUE[sc.venue].label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              <Card className="relative overflow-hidden">
                <div className={cx('relative transition-[height] duration-[var(--dur-4)] ease-[var(--ease-calma)]', big ? 'h-[calc(100dvh-180px)] min-h-[420px]' : 'h-[min(62dvh,620px)] min-h-[360px]')}>
                  <Suspense fallback={<div className="skeleton h-full w-full" />}>
                    <VenueScene3D venue={scene.venue} layout={scene.items} palette={ev.palette} selectedId={selected} onSelect={setSelected} viewFromId={viewFrom} tour={tour} />
                  </Suspense>
                  {/* Ficha flotante de la pieza seleccionada */}
                  {selectedItem && (
                    <motion.div
                      key={selectedItem.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: ease.calma } }}
                      className="glass absolute top-3 left-3 flex max-h-[calc(100%-84px)] w-[min(320px,calc(100%-24px))] flex-col rounded-[var(--r-lg)] p-4 shadow-[var(--shadow-2)] ring-1 ring-line"
                    >
                      <p className="eyebrow">{ITEM_SPECS[selectedItem.type].label}</p>
                      <p className="heading mt-1 text-xl">{selectedItem.number ? `Mesa ${selectedItem.number}` : selectedItem.label || ITEM_SPECS[selectedItem.type].label}</p>
                      {selectedItem.seats ? (
                        <p className="mt-1 text-sm text-ink-soft">
                          {selectedItem.seats} lugares{isMain && ITEM_SPECS[selectedItem.type].isTable ? ` · ${guestsAtSelected.reduce((n, g) => n + g.count, 0)} asignados` : ''}
                        </p>
                      ) : null}
                      {guestsAtSelected.length > 0 && (
                        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto text-sm">
                          {guestsAtSelected.map((g) => (
                            <li key={g.id} className="flex justify-between gap-2 border-b border-line py-1 last:border-0">
                              <span className="truncate">{g.name}</span>
                              <span className="tabular text-ink-soft">{g.count}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {canViewFrom &&
                        (viewFrom === selectedItem.id ? (
                          <Button variant="outline" className="mt-3 w-full" icon={<Undo2 size={17} strokeWidth={1.6} />} onClick={() => setViewFrom(null)}>
                            Volver a la vista general
                          </Button>
                        ) : (
                          <Button
                            variant="tinta"
                            className="mt-3 w-full"
                            icon={<Eye size={17} strokeWidth={1.6} />}
                            onClick={() => {
                              setTour(false)
                              setViewFrom(selected)
                            }}
                          >
                            {ITEM_SPECS[selectedItem.type].isTable ? 'Ver desde esta mesa' : 'Ver desde aquí'}
                          </Button>
                        ))}
                    </motion.div>
                  )}
                  {viewFrom && viewFrom !== selected && (
                    <button onClick={() => setViewFrom(null)} className="glass pressable absolute bottom-3 left-3 inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm text-ink shadow-[var(--shadow-2)] ring-1 ring-line">
                      <Undo2 size={17} strokeWidth={1.6} /> Volver a la vista general
                    </button>
                  )}
                  <div className="glass pointer-events-none absolute right-3 bottom-3 hidden max-w-[50%] rounded-full px-3 py-1.5 text-xs text-detail ring-1 ring-line sm:block">
                    {tour ? 'Recorrido a la altura de una persona · toca Recorrido para detenerlo' : viewFrom ? 'Vista desde la mesa · arrastra para mirar alrededor' : 'Arrastra para girar · pellizca para acercar · toca una mesa'}
                  </div>
                </div>
              </Card>
            </div>
          )}

        </>
      )}

      <NewEventSheet open={newOpen} onClose={() => setNewOpen(false)} initialVenue={venue} />
    </div>
  )
}

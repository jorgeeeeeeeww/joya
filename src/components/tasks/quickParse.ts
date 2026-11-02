// "Agregar rápido": entiende frases como "Cambiar foco casa 2 mañana 10am urgente @Chuy"
// y saca unidad, fecha, hora, prioridad, persona y tipo. Lo que no reconoce queda como título.
import type { Employee, Priority, TaskType, Unit } from '@/lib/types'
import { addDaysISO, today } from '@/lib/format'
import { norm } from '@/components/fields'

export interface QuickTask {
  title: string
  unitId?: string
  date?: string
  time?: string
  priority?: Priority
  assigneeId?: string
  type?: TaskType
}

const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const TYPE_WORDS: [TaskType, RegExp][] = [
  ['limpieza', /\b(limpi\w*|aspir\w*|trapear|sabanas|toallas)\b/],
  ['jardin', /\b(pod\w*|pasto|regar|riego|jardin\w*|arbol\w*|cesped|plantas?)\b/],
  ['compra', /\b(compr\w*|surtir|reponer|pedir)\b/],
  ['mantenimiento', /\b(foco\w*|fuga\w*|arregl\w*|repar\w*|cambiar|pintar|plomer\w*|clima|bomba|chapa|llave|tuberia)\b/],
  ['evento', /\b(montaje|desmontaje|evento|mesas|sillas|boda|xv)\b/],
]

export function parseQuickTask(input: string, units: Unit[], employees: Employee[]): QuickTask {
  let text = ` ${input} `
  const n = () => norm(text)
  const out: QuickTask = { title: '' }
  const cut = (re: RegExp) => {
    // Quita lo reconocido del texto original usando la misma posición en el normalizado
    const m = re.exec(n())
    if (!m) return null
    text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)
    return m
  }

  // Persona: @nombre
  const at = /@(\S+)/.exec(text)
  if (at) {
    const q = norm(at[1]!)
    const emp = employees.find((e) => norm(e.name).split(/\s+/).some((w) => w.replace(/[^a-z]/g, '').startsWith(q.replace(/[^a-z]/g, ''))))
    if (emp) out.assigneeId = emp.id
    text = text.replace(at[0], ' ')
  }

  // Prioridad
  const pr = cut(/\b(urgente|prioridad alta|alta prioridad|importante|baja prioridad|sin prisa)\b/)
  if (pr) out.priority = /urgente/.test(pr[0]) ? 'urgente' : /alta|importante/.test(pr[0]) ? 'alta' : 'baja'

  // Hora: 10am, 4 pm, 16:30, a las 5
  // (solo cuenta si trae am/pm, minutos o "a las"; así "casa 2" no se toma como hora)
  const hourRe = /(?:a las\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|hrs)?(?=\s|$)/g
  let hr: RegExpExecArray | null = null
  for (let m = hourRe.exec(n()); m; m = hourRe.exec(n())) {
    if (m[2] || m[3] || /a las/.test(m[0])) {
      hr = m
      break
    }
  }
  if (hr) {
    text = text.slice(0, hr.index) + ' ' + text.slice(hr.index + hr[0].length)
    let h = Number(hr[1])
    if (hr[3]?.startsWith('p') && h < 12) h += 12
    if (!hr[3] && !hr[2] && h < 7) h += 12 // "a las 5" → 17:00
    if (h < 24) out.time = `${String(h).padStart(2, '0')}:${hr[2] ?? '00'}`
  }

  // Fecha
  const T = today()
  const dt = cut(/\b(hoy|pasado manana|manana|el \d{1,2}|(?:el )?(?:proximo )?(domingo|lunes|martes|miercoles|jueves|viernes|sabado))\b/)
  if (dt) {
    const w = dt[0]
    if (w === 'hoy') out.date = T
    else if (w === 'manana') out.date = addDaysISO(T, 1)
    else if (w === 'pasado manana') out.date = addDaysISO(T, 2)
    else if (/^el \d/.test(w)) {
      const day = Number(w.slice(3))
      const d = new Date()
      if (day < d.getDate()) d.setMonth(d.getMonth() + 1)
      d.setDate(day)
      out.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    } else if (dt[2]) {
      const target = DAYS.indexOf(dt[2])
      const diff = (target - new Date().getDay() + 7) % 7 || 7
      out.date = addDaysISO(T, diff)
    }
  }

  // Unidad: por nombre ("lavanda") o por número ("casa 2", "cabaña 1", "c3")
  for (const u of units) {
    const word = norm(u.name).split(' ').pop()!
    const kind = u.kind === 'casa' ? 'casa' : 'cabana'
    const num = (u.short.match(/\d+/) ?? [])[0]
    const re = new RegExp(`\\b(?:${norm(u.name)}|${word}|${kind}\\s*${num}|${norm(u.short).replace(/\s+/g, '\\s*')})\\b`)
    if (num && re.test(n())) {
      out.unitId = u.id
      cut(re)
      break
    }
  }

  const clean = text.replace(/\s+/g, ' ').trim()
  out.title = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : input.trim()
  const nt = norm(input)
  out.type = TYPE_WORDS.find(([, re]) => re.test(nt))?.[0]
  return out
}

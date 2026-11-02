// Utilidades iCal compartidas por las Edge Functions (Deno).

export interface IcsEvent {
  uid: string
  start: string // YYYY-MM-DD
  end: string
  summary: string
}

const toDate = (v: string) => {
  const m = v.match(/(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

export function parseICS(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const out: IcsEvent[] = []
  let cur: Partial<IcsEvent> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT') {
      if (cur?.uid && cur.start && cur.end) out.push(cur as IcsEvent)
      cur = null
    } else if (cur) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const key = line.slice(0, idx).split(';')[0]
      const val = line.slice(idx + 1)
      if (key === 'UID') cur.uid = val
      if (key === 'DTSTART') cur.start = toDate(val)
      if (key === 'DTEND') cur.end = toDate(val)
      if (key === 'SUMMARY') cur.summary = val
    }
  }
  return out
}

const fold = (s: string) => s.replace(/[,;]/g, (c) => '\\' + c)

export function buildICS(name: string, events: { uid: string; start: string; end: string; summary: string }[]) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const body = events
    .map((e) =>
      [
        'BEGIN:VEVENT',
        `UID:${e.uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${e.start.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${e.end.replace(/-/g, '')}`,
        `SUMMARY:${fold(e.summary)}`,
        'END:VEVENT',
      ].join('\r\n'),
    )
    .join('\r\n')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jardines La Joya//Reservas//ES', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${fold(name)}`, body, 'END:VCALENDAR'].filter(Boolean).join('\r\n')
}

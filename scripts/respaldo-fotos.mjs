// Descarga todas las fotos del almacén «fotos» de Supabase a una carpeta (para el respaldo nocturno).
//   SUPABASE_URL=… SB_SECRET_KEY=… node scripts/respaldo-fotos.mjs carpeta-destino
// Usa solo fetch (sin instalar nada). Las llaves nuevas (sb_secret_…) van solo en el encabezado apikey.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SB_SECRET_KEY || ''
const out = process.argv[2] || 'fotos'
if (!base || !key) {
  console.error('Faltan SUPABASE_URL y SB_SECRET_KEY')
  process.exit(1)
}
const headers = key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key }

async function list(prefix) {
  const items = []
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${base}/storage/v1/object/list/fotos`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!r.ok) throw new Error(`No se pudo listar las fotos: HTTP ${r.status} ${await r.text()}`)
    const page = await r.json()
    items.push(...page)
    if (page.length < 1000) break
  }
  const files = []
  for (const it of items) {
    const path = prefix ? `${prefix}/${it.name}` : it.name
    // Sin id = carpeta
    if (!it.id) files.push(...(await list(path)))
    else files.push(path)
  }
  return files
}

const files = await list('')
let ok = 0
for (const path of files) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`${base}/storage/v1/object/fotos/${path.split('/').map(encodeURIComponent).join('/')}`, { headers, signal: AbortSignal.timeout(60_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const dest = join(out, path)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, Buffer.from(await r.arrayBuffer()))
      ok++
      break
    } catch (e) {
      if (attempt === 3) {
        console.error(`No se pudo bajar ${path}: ${e.message}`)
        process.exitCode = 1
      }
    }
  }
}
console.log(`${ok} de ${files.length} fotos descargadas en ${out}`)

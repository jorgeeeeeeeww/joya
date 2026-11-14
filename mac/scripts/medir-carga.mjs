import { readFile, stat, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

// Cuenta dependencias estáticas una sola vez; no confunde carga inicial con chunks diferidos.
const dist = resolve('dist')
const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'))
async function carga(key) {
  const vistos = new Set(), archivos = new Set()
  function visitar(k) {
    if (vistos.has(k)) return
    vistos.add(k)
    const item = manifest[k]
    if (!item) throw new Error(`Falta ${k} en el manifiesto`)
    archivos.add(item.file)
    for (const css of item.css ?? []) archivos.add(css)
    for (const dep of item.imports ?? []) visitar(dep)
  }
  for (const k of Array.isArray(key) ? key : [key]) visitar(k)
  let bytes = 0, gzip = 0
  for (const file of archivos) {
    const data = await readFile(resolve(dist, file))
    bytes += data.length
    gzip += gzipSync(data).length
  }
  return { bytes, gzip, archivos: archivos.size }
}
const informe = { inicial: await carga('index.html'), pantallas: {}, fuentes: 0 }
if (manifest['src/components/MapaRancho.tsx']) informe.mapa3DCompleto = await carga(['src/pages/Mapa.tsx', 'src/components/MapaRancho.tsx'])
for (const key of Object.keys(manifest).filter(k => k.startsWith('src/pages/'))) informe.pantallas[key] = await carga(key)
for (const item of Object.values(manifest).filter(i => i.file.endsWith('.woff2'))) informe.fuentes += (await stat(resolve(dist, item.file))).size
console.log(JSON.stringify(informe, null, 2))
if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(informe, null, 2) + '\n')

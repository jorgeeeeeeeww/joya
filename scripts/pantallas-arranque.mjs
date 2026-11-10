// Pantallas de arranque de iPhone y iPad (claro y oscuro), para que no salga un destello blanco al abrir
// la app instalada. iPhone solo usa la imagen si coincide exacto con el tamaño de su pantalla, así que se
// genera una por tamaño, en vertical y horizontal.
//
//   node scripts/pantallas-arranque.mjs
//
// Crea public/arranque/*.png y reescribe el bloque <!-- arranque --> de index.html.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { appleSplashScreenSizes } from '@vite-pwa/assets-generator/config'

const LIGHT = '#ECE8E1'
const DARK = '#1B1D21'
const OUT = 'public/arranque'

const logo = await readFile('public/logo.svg')
const unique = new Map()
for (const size of Object.values(appleSplashScreenSizes)) unique.set(`${size.width}x${size.height}@${size.scaleFactor}`, size)

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

const links = []
for (const { width, height, scaleFactor } of unique.values()) {
  for (const landscape of [false, true]) {
    const w = landscape ? height : width
    const h = landscape ? width : height
    const icon = Math.round(Math.min(w, h) * 0.28)
    // Esquinas redondeadas como el ícono de la app
    const r = Math.round(icon * 0.225)
    const mask = Buffer.from(`<svg width="${icon}" height="${icon}"><rect width="${icon}" height="${icon}" rx="${r}" ry="${r}"/></svg>`)
    const mark = await sharp(logo, { density: 300 }).resize(icon, icon).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
    for (const dark of [false, true]) {
      const name = `${w}x${h}${dark ? '-oscuro' : ''}.png`
      await sharp({ create: { width: w, height: h, channels: 3, background: dark ? DARK : LIGHT } })
        .composite([{ input: mark, gravity: 'center' }])
        .png({ compressionLevel: 9, palette: true, quality: 90 })
        .toFile(`${OUT}/${name}`)
      const media = [
        `(device-width: ${width / scaleFactor}px)`,
        `(device-height: ${height / scaleFactor}px)`,
        `(-webkit-device-pixel-ratio: ${scaleFactor})`,
        `(orientation: ${landscape ? 'landscape' : 'portrait'})`,
        dark ? '(prefers-color-scheme: dark)' : '(prefers-color-scheme: light)',
      ].join(' and ')
      links.push(`    <link rel="apple-touch-startup-image" media="screen and ${media}" href="/arranque/${name}" />`)
    }
  }
}

const html = await readFile('index.html', 'utf8')
const eol = html.includes('\r\n') ? '\r\n' : '\n'
const block = `    <!-- arranque -->${eol}${links.join(eol)}${eol}    <!-- /arranque -->`
const next = /\s*<!-- arranque -->[\s\S]*?<!-- \/arranque -->/.test(html)
  ? html.replace(/ *<!-- arranque -->[\s\S]*?<!-- \/arranque -->/, block)
  : html.replace(/(\s*)<title>/, `${eol}${block}$1<title>`)
await writeFile('index.html', next)
console.log(`Listo: ${links.length} pantallas de arranque en ${OUT}`)

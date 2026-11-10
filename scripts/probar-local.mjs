// Prueba completa en la computadora: la nube de prueba (puerto 54321) y la app ya compilada (dist/)
// servida como en Cloudflare (puerto 4173, cualquier dirección abre index.html).
//
//   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_prueba npm run build
//   node scripts/probar-local.mjs
//
// Para simular dos dispositivos, abre la app en http://localhost:4173 y en http://127.0.0.1:4173
// (son direcciones distintas: cada una tiene sus propios datos, como dos celulares).
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const PORT = Number(process.env.PORT || process.env.APP_PORT || 4173)
// La nube siempre en 54321 (la dirección que lleva la app compilada)
process.env.NUBE_PORT = '54321'
await import('./nube-de-prueba.mjs')
const ROOT = 'dist'
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm' }

http
  .createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '')
    let file = join(ROOT, path)
    let found = await stat(file).then((s) => s.isFile()).catch(() => false)
    // Como Cloudflare: una página que no existe abre index.html; un archivo que no existe da 404
    if (!found && (req.headers['sec-fetch-mode'] === 'navigate' || !extname(path))) {
      file = join(ROOT, 'index.html')
      found = true
    }
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('No existe')
    }
    const ext = extname(file)
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': file.includes('assets') ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(await readFile(file))
  })
  .listen(PORT, () => console.log(`App lista en http://localhost:${PORT}`))

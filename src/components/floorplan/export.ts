// Exportar el plano a PNG e imprimir documentos editoriales (fuera de la app los var() no existen).
import { TONE } from '@/lib/meta'
import { SWATCH } from './canvas'

/** Reemplaza tokens por colores fijos (atmósfera Flor, claro) en un SVG serializado */
export function resolveForExport(xml: string) {
  let out = xml
  const pairs: [string, string][] = [...Object.values(SWATCH).map(([a, b]) => [a, b] as [string, string]), ...Object.values(TONE).map((t) => [t.hex, t.raw] as [string, string])]
  pairs.sort((a, b) => b[0].length - a[0].length)
  for (const [from, to] of pairs) out = out.split(from).join(to)
  return out
}

export function svgToPng(svg: SVGSVGElement, bounds: { x: number; y: number; w: number; h: number }, pxPerM = 60): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const root = clone.querySelector('[data-world]') as SVGGElement | null
  root?.setAttribute('transform', '')
  clone.querySelectorAll('[data-ui]').forEach((n) => n.remove())
  clone.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`)
  clone.setAttribute('width', String(bounds.w * pxPerM))
  clone.setAttribute('height', String(bounds.h * pxPerM))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.removeAttribute('class')
  clone.removeAttribute('style')
  const xml = resolveForExport(new XMLSerializer().serializeToString(clone))
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = bounds.w * pxPerM
      canvas.height = bounds.h * pxPerM
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = SWATCH.world[1]
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = url
  })
}

export function printHtml(title: string, body: string) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>
    *{box-sizing:border-box} body{font-family:'Geist Variable','Geist',-apple-system,'Segoe UI',Roboto,sans-serif;color:#43222A;margin:28px;line-height:1.5}
    h1{font-family:'Geist Variable','Geist',-apple-system,'Segoe UI',sans-serif;font-weight:600;letter-spacing:-.03em;font-size:28px;margin:0 0 4px}
    h2{font-family:'Geist Variable','Geist',-apple-system,'Segoe UI',sans-serif;font-weight:400;font-size:17px;margin:22px 0 8px;color:#8A4649}
    .muted{color:#74484E;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:13px} th,td{text-align:left;padding:7px 6px;border-bottom:1px solid #EEDBD0;vertical-align:top} th{color:#74484E;font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
    td.r,th.r{text-align:right} .tot td{font-weight:600;border:0} img,svg{max-width:100%} .brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #F3D8BC;padding-bottom:12px;margin-bottom:12px}
    .pill{display:inline-block;background:#EBD2CB;color:#8A4649;border-radius:99px;padding:2px 10px;font-size:11px;font-weight:600}
    .tables{columns:2;column-gap:28px} .tbl{break-inside:avoid;margin:0 0 14px} .tbl h3{font-family:'Geist Variable','Geist',-apple-system,'Segoe UI',sans-serif;font-weight:400;font-size:15px;margin:0 0 4px;border-bottom:1px solid #F3D8BC;padding-bottom:3px} .tbl li{font-size:12.5px} .tbl ul{margin:0;padding-left:16px}
    @page{margin:14mm}
  </style></head><body>${body}</body></html>`)
  doc.close()
  const go = () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => iframe.remove(), 1500)
  }
  const imgs = Array.from(doc.images)
  if (!imgs.length) setTimeout(go, 150)
  else Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => (i.onload = i.onerror = r))))).then(() => setTimeout(go, 100))
}

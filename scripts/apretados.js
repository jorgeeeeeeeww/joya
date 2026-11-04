// Ayudante de pruebas (solo desarrollo): busca textos aplastados, es decir, palabras que el ancho
// disponible obliga a partir letra por letra o que bajan una palabra por renglón.
// Uso: const { apretados } = await import('/scripts/apretados.js'); apretados()
export function apretados(raiz = document.querySelector('main') || document.body) {
  const fuera = []
  const vistos = new Set()
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const texto = n.textContent.trim()
    if (texto.length < 6 || !/[a-záéíóúñ]{4}/i.test(texto)) continue
    const el = n.parentElement
    // Los textos de un dibujo (SVG) no bajan de renglón: solo se ven chicos cuando el dibujo se reduce
    if (!el || vistos.has(el) || el.closest('svg')) continue
    vistos.add(el)
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.writingMode !== 'horizontal-tb') continue
    const alto = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3
    const renglones = Math.round(r.height / alto)
    // Ancho de la palabra más larga: si el renglón es más angosto, la palabra se partió
    const ctx = (apretados.c ||= document.createElement('canvas').getContext('2d'))
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const larga = Math.max(...texto.split(/\s+/).map((p) => ctx.measureText(p).width))
    const palabras = texto.split(/\s+/).length
    const partida = r.width + 1 < larga && renglones > 1
    const unaPorRenglon = palabras >= 3 && renglones >= palabras && r.width < 90
    if (partida || unaPorRenglon) fuera.push({ texto: texto.slice(0, 60), ancho: Math.round(r.width), renglones, partida })
  }
  return fuera
}

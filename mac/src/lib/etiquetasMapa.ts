export interface EtiquetaMapa {
  id: string
  x: number
  y: number
  ancho: number
  alto: number
}

/** Busca el espacio libre más cercano al edificio, siempre dentro del mapa. */
export function distribuirEtiquetas(items: EtiquetaMapa[], ancho: number, alto: number) {
  const colocadas: EtiquetaMapa[] = []
  const margen = 8
  const separacion = 6
  for (const item of items) {
    let mejor: EtiquetaMapa | undefined
    let distancia = Infinity
    const limitarX = (x: number) => Math.max(margen, Math.min(ancho - margen - item.ancho, x))
    const limitarY = (y: number) => Math.max(margen, Math.min(alto - margen - item.alto, y))
    const probar = (x: number, y: number) => {
      const candidato = { ...item, x: limitarX(x), y: limitarY(y) }
      if (colocadas.some((p) => candidato.x < p.x + p.ancho + separacion && candidato.x + candidato.ancho + separacion > p.x && candidato.y < p.y + p.alto + separacion && candidato.y + candidato.alto + separacion > p.y)) return
      const d = (candidato.x + item.ancho / 2 - item.x) ** 2 + (candidato.y + item.alto - item.y) ** 2
      if (d < distancia) { mejor = candidato; distancia = d }
    }
    probar(item.x - item.ancho / 2, item.y - item.alto)
    if (!mejor) {
      for (let y = margen; y <= alto - margen - item.alto; y += item.alto + separacion) {
        for (let x = margen; x <= ancho - margen - item.ancho; x += 8) probar(x, y)
      }
    }
    if (mejor) colocadas.push(mejor)
  }
  return colocadas
}

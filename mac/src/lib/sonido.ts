const CLAVE_SONIDO = 'joya:sonido-avisos'
let contexto: AudioContext | null = null
export function sonidoActivado() {
  try { return localStorage.getItem(CLAVE_SONIDO) !== 'no' } catch { return true }
}
export function guardarSonido(activo: boolean) {
  try { localStorage.setItem(CLAVE_SONIDO, activo ? 'si' : 'no') } catch { /* Preferencia solo en esta sesión si no hay almacenamiento. */ }
}
/** Se prepara con una interacción del usuario para respetar el audio de Safari. */
export async function prepararSonido() {
  try {
    contexto ??= new AudioContext()
    if (contexto.state === 'suspended') await contexto.resume()
    return contexto.state === 'running'
  } catch { return false }
}
/** Aviso breve generado localmente; no descarga audio ni accede al micrófono. */
export async function sonarAviso() {
  if (!sonidoActivado() || !contexto || contexto.state !== 'running') return false
  try {
    const inicio = contexto.currentTime
    for (const [i, frecuencia] of [659.25, 880].entries()) {
      const nota = contexto.createOscillator()
      const volumen = contexto.createGain()
      nota.type = 'sine'
      nota.frequency.value = frecuencia
      volumen.gain.setValueAtTime(0, inicio + i * .14)
      volumen.gain.linearRampToValueAtTime(.1, inicio + i * .14 + .02)
      volumen.gain.exponentialRampToValueAtTime(.001, inicio + i * .14 + .3)
      nota.connect(volumen)
      volumen.connect(contexto.destination)
      nota.start(inicio + i * .14)
      nota.stop(inicio + i * .14 + .32)
      nota.onended = () => { nota.disconnect(); volumen.disconnect() }
    }
    return true
  } catch { return false }
}

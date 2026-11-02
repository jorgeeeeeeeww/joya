// SHA-256 en JS puro: funciona aunque la app se abra por http en la red local
// (crypto.subtle solo existe en contextos seguros).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
])

export function sha256(message: string): string {
  const bytes = new TextEncoder().encode(message)
  const len = bytes.length
  const withPad = ((len + 9 + 63) >> 6) << 6
  const buf = new Uint8Array(withPad)
  buf.set(bytes)
  buf[len] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(withPad - 4, len * 8)
  view.setUint32(withPad - 8, Math.floor((len * 8) / 0x100000000))

  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const W = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

  for (let off = 0; off < withPad; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15]!, 7) ^ rotr(W[i - 15]!, 18) ^ (W[i - 15]! >>> 3)
      const s1 = rotr(W[i - 2]!, 17) ^ rotr(W[i - 2]!, 19) ^ (W[i - 2]! >>> 10)
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) | 0
    }
    let [a, b, c, d, e, f, g, h] = H as unknown as number[]
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25)
      const ch = (e! & f!) ^ (~e! & g!)
      const t1 = (h! + S1 + ch + K[i]! + W[i]!) | 0
      const S0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22)
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!)
      const t2 = (S0 + maj) | 0
      h = g
      g = f
      f = e
      e = (d! + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    H[0] = (H[0]! + a!) | 0
    H[1] = (H[1]! + b!) | 0
    H[2] = (H[2]! + c!) | 0
    H[3] = (H[3]! + d!) | 0
    H[4] = (H[4]! + e!) | 0
    H[5] = (H[5]! + f!) | 0
    H[6] = (H[6]! + g!) | 0
    H[7] = (H[7]! + h!) | 0
  }
  return Array.from(H, (x) => (x >>> 0).toString(16).padStart(8, '0')).join('')
}

const PIN_SALT = 'lajoya::pin::v1::'
export const hashPin = (employeeId: string, pin: string) => sha256(PIN_SALT + employeeId + '::' + pin)

// ── Cifrado de respaldos (AES-GCM + PBKDF2). Requiere contexto seguro (https/localhost).
export const canEncrypt = () => typeof crypto !== 'undefined' && !!crypto.subtle

async function deriveKey(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 210_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function encryptText(plain: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)))
  // btoa con spread falla en buffers grandes: convertir por bloques
  let bin = ''
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000))
  return JSON.stringify({ v: 1, alg: 'AES-GCM', salt: b64(salt), iv: b64(iv), data: btoa(bin) })
}

export async function decryptText(payload: string, password: string) {
  const { salt, iv, data } = JSON.parse(payload)
  const key = await deriveKey(password, unb64(salt))
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data))
  return new TextDecoder().decode(plain)
}

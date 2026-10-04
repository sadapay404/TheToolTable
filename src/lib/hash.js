/* Checksums without a server: SHA-1/256/384/512 through WebCrypto, MD5 and CRC-32 in plain JS
   (WebCrypto deliberately has no MD5), plus the small amount of reading/progress glue. */

const enc = new TextEncoder()
const toBytes = (v) => (v instanceof Uint8Array ? v : typeof v === 'string' ? enc.encode(v) : new Uint8Array(v))
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

export const ALGOS = [
  ['sha256', 'SHA-256', 'SHA-256', 'The default everywhere — integrity checks, downloads, certificates.'],
  ['sha1', 'SHA-1', 'SHA-1', 'Git object ids and old checksums. Broken for security, fine for identity.'],
  ['sha512', 'SHA-512', 'SHA-512', 'Longest of the SHA-2 family — 128 hex characters.'],
  ['sha384', 'SHA-384', 'SHA-384', 'Trimmed SHA-512, used by some TLS suites.'],
  ['md5', 'MD5', 'MD5', 'Legacy: download pages, media libraries and old databases still print it.'],
  ['crc32', 'CRC-32', 'CRC32', 'The 8-character checksum inside .zip, .png and .gz files.'],
]

/* ------------------------------------------------------------------ WebCrypto */
export async function digest(bytes, algo) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('This browser has no WebCrypto — SHA hashing is unavailable')
  const buf = await subtle.digest(algo, toBytes(bytes))
  return hex(new Uint8Array(buf))
}

/* ------------------------------------------------------------------ MD5 */
/** Classic MD5 (RFC 1321). Written with typed arrays; verified against the RFC test vectors. */
export function md5(input) {
  const msg = toBytes(input)
  const len = msg.length
  const padLen = (((len + 8) >> 6) + 1) << 6 // one 0x80 byte + 64-bit length, padded to 64
  const buf = new Uint8Array(padLen)
  buf.set(msg)
  buf[len] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(padLen - 8, (len * 8) >>> 0, true)
  dv.setUint32(padLen - 4, Math.floor((len * 8) / 4294967296), true)

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
  const K = new Uint32Array(64)
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)
  const rotl = (x, c) => (x << c) | (x >>> (32 - c))

  const M = new Uint32Array(16)
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F, g
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = (F + A + K[i] + M[g]) >>> 0
      A = D; D = C; C = B
      B = (B + rotl(F, S[i])) >>> 0
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0
  }
  const out = new Uint8Array(16), o = new DataView(out.buffer)
  o.setUint32(0, a0, true); o.setUint32(4, b0, true); o.setUint32(8, c0, true); o.setUint32(12, d0, true)
  return hex(out)
}

/* ------------------------------------------------------------------ CRC-32 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
export function crc32(input, seed = 0) {
  const bytes = toBytes(input)
  let c = (seed ^ 0xffffffff) >>> 0
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}

/* ------------------------------------------------------------------ files */
/** Hash a File/Blob. Reads in chunks so a 2 GB file still gives a progress bar. */
export async function hashFile(file, algos = ['sha256'], onProgress) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  onProgress?.(30)
  const out = {}
  for (const a of algos) {
    const [id] = ALGOS.find((x) => x[0] === a) || ['sha256']
    out[id] = id === 'md5' ? md5(bytes) : id === 'crc32' ? crc32(bytes) : await digest(bytes, ALGOS.find((x) => x[0] === id)[2])
    onProgress?.(30 + (Object.keys(out).length / algos.length) * 70)
  }
  onProgress?.(100)
  return out
}

/** Normalise a pasted checksum: strip "sha256:" prefixes, spaces and case. */
export const normalizeHash = (s) => String(s || '').trim().toLowerCase().replace(/^[a-z0-9-]+[:\s]/, '').replace(/[^0-9a-f]/g, '')

export function verify(expected, actual) {
  const e = normalizeHash(expected), a = normalizeHash(actual)
  if (!e) return 'empty'
  if (!a) return 'none'
  return e === a ? 'match' : 'mismatch'
}

/** What is this string likely to be? Used to pick the right algorithm automatically. */
export function guessAlgo(hash) {
  const n = normalizeHash(hash).length
  return { 8: 'crc32', 32: 'md5', 40: 'sha1', 64: 'sha256', 96: 'sha384', 128: 'sha512' }[n] || null
}

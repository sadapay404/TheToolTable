/**
 * Lossless metadata scrubbing — pixel data is never re-encoded.
 * JPEG: keeps SOI + image stream, drops all APPx/COM marker segments (EXIF/IPTC/XMP/thumbnails).
 * PNG:  keeps only critical chunks (IHDR/PLTE/IDAT/IEND) + tRNS/gAMA-safe set; drops tEXt/iTXt/zTXt/eXIf etc.
 */

export function detectType(buf) {
  const b = new Uint8Array(buf)
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  return null
}

export function scrubJPEG(buf) {
  const b = new Uint8Array(buf)
  const keep = []
  keep.push(b.subarray(0, 2)) // SOI
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) { // raw entropy data (shouldn't happen pre-SOS scan)
      keep.push(b.subarray(i))
      break
    }
    const marker = b[i + 1]
    if (marker === 0xd9) { keep.push(b.subarray(i, i + 2)); break } // EOI
    if (marker === 0xda) { keep.push(b.subarray(i)); break } // SOS -> rest is scan data + EOI
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue } // standalone
    const len = (b[i + 2] << 8) | b[i + 3]
    const isMeta = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe // APPx + COM
    if (!isMeta) keep.push(b.subarray(i, i + 2 + len))
    i += 2 + len
  }
  return new Blob(keep, { type: 'image/jpeg' })
}

const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sBIT', 'pHYs'])

export function scrubPNG(buf) {
  const b = new Uint8Array(buf)
  const out = [b.subarray(0, 8)]
  let i = 8
  const dv = new DataView(buf)
  while (i + 8 <= b.length) {
    const len = dv.getUint32(i)
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    const total = 12 + len
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, i + total))
    if (type === 'IEND') break
    i += total
  }
  return new Blob(out, { type: 'image/png' })
}

export function scrub(buf) {
  const t = detectType(buf)
  if (t === 'jpeg') return { blob: scrubJPEG(buf), type: 'jpeg' }
  if (t === 'png') return { blob: scrubPNG(buf), type: 'png' }
  return null
}

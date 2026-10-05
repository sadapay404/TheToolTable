/**
 * Metadata scrubbing that preserves the compressed JPEG/PNG image payload without re-encoding.
 * JPEG APPx/COM segments are removed; PNG ancillary text, EXIF, ICC and time chunks are removed.
 * EXIF orientation/color-profile removal can affect how some viewers display the retained pixels.
 */

function bytesOf(input) {
  if (input instanceof Uint8Array) return input
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  return new Uint8Array(input)
}

export function detectType(input) {
  if (!input) return null
  const b = bytesOf(input)
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) return 'jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  return null
}

export function scrubJPEG(input) {
  const b = bytesOf(input)
  if (detectType(b) !== 'jpeg') throw new Error('This is not a JPEG image')
  const keep = [b.subarray(0, 2)] // SOI
  let i = 2, hasScan = false
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('Malformed JPEG marker sequence')
    const markerStart = i
    while (i < b.length && b[i] === 0xff) i++ // tolerate marker fill bytes
    if (i >= b.length) throw new Error('Truncated JPEG marker')
    const marker = b[i++]
    if (marker === 0xda) { // SOS: scan bytes can contain marker-like data; preserve the remainder verbatim
      keep.push(b.subarray(markerStart)); hasScan = true; break
    }
    if (marker === 0xd9) { keep.push(b.subarray(markerStart, i)); break }
    if (marker === 0x00) throw new Error('Unexpected stuffed byte before JPEG scan data')
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      keep.push(b.subarray(markerStart, i)) // standalone markers
      continue
    }
    if (i + 2 > b.length) throw new Error('Truncated JPEG segment length')
    const length = (b[i] << 8) | b[i + 1]
    if (length < 2) throw new Error('Invalid JPEG segment length')
    const end = i + length
    if (end > b.length) throw new Error('Truncated JPEG segment')
    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe // APPx + comment
    if (!isMetadata) keep.push(b.subarray(markerStart, end))
    i = end
  }
  if (!hasScan) throw new Error('JPEG image scan data is missing')
  return new Blob(keep, { type: 'image/jpeg' })
}

const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sBIT', 'pHYs'])

export function scrubPNG(input) {
  const b = bytesOf(input)
  if (detectType(b) !== 'png') throw new Error('This is not a PNG image')
  const out = [b.subarray(0, 8)]
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let i = 8, hasEnd = false
  while (i + 12 <= b.length) {
    const length = dv.getUint32(i, false)
    if (length > b.length - i - 12) throw new Error('Truncated PNG chunk')
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    const end = i + 12 + length
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, end))
    i = end
    if (type === 'IEND') { hasEnd = true; break }
  }
  if (!hasEnd) throw new Error('PNG end chunk is missing')
  return new Blob(out, { type: 'image/png' })
}

export function scrub(input) {
  const type = detectType(input)
  if (type === 'jpeg') return { blob: scrubJPEG(input), type: 'jpeg' }
  if (type === 'png') return { blob: scrubPNG(input), type: 'png' }
  return null
}

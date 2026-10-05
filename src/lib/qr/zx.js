/* Lazy zxing-wasm (reader + writer in one ~1.4 MB wasm, bundled — fully offline). */
import wasmUrl from 'zxing-wasm/full/zxing_full.wasm?url'
let mod = null
export function zx() {
  if (!mod) {
    mod = import('zxing-wasm/full').then((m) => {
      m.setZXingModuleOverrides({ locateFile: (p, prefix) => (p.endsWith('.wasm') ? wasmUrl : prefix + p) })
      return m
    })
  }
  return mod
}

const imgDataFrom = (src, maxDim) => {
  const w0 = Number(src?.naturalWidth || src?.videoWidth || src?.width), h0 = Number(src?.naturalHeight || src?.videoHeight || src?.height)
  if (!Number.isFinite(w0) || !Number.isFinite(h0) || w0 < 1 || h0 < 1) throw new Error('This image has no readable pixels.')
  const limit = Math.max(64, Math.min(4096, Number.isFinite(maxDim) ? Math.round(maxDim) : 1800))
  const k = Math.min(1, limit / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas decoding is not available in this browser.')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h), k, w, h, w0, h0 }
}

/** Decode every barcode in an image / canvas / video frame. Positions are returned in source pixel space (0..w0,0..h0). */
export async function decodeSource(src, { maxDim = 1800, formats = ['All'], max = 16, hard = true } = {}) {
  const { readBarcodes } = await zx()
  const prep = imgDataFrom(src, maxDim)
  const limit = Math.max(1, Math.min(100, Number.isFinite(max) ? Math.round(max) : 16))
  const formatList = Array.isArray(formats) && formats.length ? formats.filter((x) => typeof x === 'string').slice(0, 40) : ['All']
  const decoded = await readBarcodes(prep.data, { formats: formatList, tryHarder: !!hard, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: limit })
  const inv = 1 / prep.k
  const items = (Array.isArray(decoded) ? decoded : []).filter((r) => {
    const p = r?.position
    return r?.isValid !== false && typeof r?.text === 'string' && p && [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].every((q) => Number.isFinite(q?.x) && Number.isFinite(q?.y))
  }).slice(0, limit).map((r) => {
    const p = r.position
    const pts = [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map((q) => ({ x: q.x * inv, y: q.y * inv }))
    return { text: r.text, format: r.format || 'QR', symbology: r.symbology, bytes: r.bytes, contentType: r.contentType, ecLevel: r.ecLevel, pts, rotation: r.rotation, mirrored: r.isMirrored, inverted: r.isInverted }
  })
  return { w: prep.w0, h: prep.h0, items }
}

export async function writeCode(text, format, opts = {}) {
  const { writeBarcode } = await zx()
  return writeBarcode(text, { format, ...opts })
}

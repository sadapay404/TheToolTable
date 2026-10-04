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
  const w0 = src.naturalWidth || src.videoWidth || src.width, h0 = src.naturalHeight || src.videoHeight || src.height
  const k = Math.min(1, maxDim / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h), k, w, h, w0, h0 }
}

/** Decode every barcode in an image / canvas / video frame. Positions are returned in source pixel space (0..w0,0..h0). */
export async function decodeSource(src, { maxDim = 1800, formats = ['All'], max = 16, hard = true } = {}) {
  const { readBarcodes } = await zx()
  const prep = imgDataFrom(src, maxDim)
  let res = await readBarcodes(prep.data, { formats, tryHarder: hard, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: max })
  res = res.filter((r) => r.isValid !== false && r.text !== undefined)
  const inv = 1 / prep.k
  return {
    w: prep.w0, h: prep.h0,
    items: res.map((r) => {
      const p = r.position
      const pts = [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map((q) => ({ x: q.x * inv, y: q.y * inv }))
      return { text: r.text, format: r.format, symbology: r.symbology, bytes: r.bytes, contentType: r.contentType, ecLevel: r.ecLevel, pts, rotation: r.rotation, mirrored: r.isMirrored, inverted: r.isInverted }
    }),
  }
}

export async function writeCode(text, format, opts = {}) {
  const { writeBarcode } = await zx()
  return writeBarcode(text, { format, ...opts })
}

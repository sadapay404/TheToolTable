/* Document scanning (perspective crop + clean-up filters) and offline OCR. */
export const LOCAL_LANGS = ['eng', 'urd']
export const LANGS = [
  ['eng', 'English', true], ['urd', 'Urdu · اردو', true], ['eng+urd', 'English + Urdu', true],
  ['ara', 'Arabic · العربية'], ['hin', 'Hindi · हिन्दी'], ['pan', 'Punjabi'], ['fas', 'Persian · فارسی'], ['fra', 'French'], ['deu', 'German'], ['spa', 'Spanish'], ['ita', 'Italian'], ['tur', 'Turkish'], ['rus', 'Russian'], ['chi_sim', 'Chinese (simplified)'], ['jpn', 'Japanese'], ['kor', 'Korean'],
]
export const MAX_SCAN_SIDE = 2_400
export const MAX_SCAN_PIXELS = 4_500_000
export const MAX_SCAN_TOTAL_PIXELS = 36_000_000
export const MAX_SCAN_PAGES = 40
export const MAX_SCAN_IMAGE_BYTES = 50 * 1024 * 1024
const MIN_SCAN_SIDE = 16

export function fitScanSize(width, height, { maxSide = MAX_SCAN_SIDE, maxPixels = MAX_SCAN_PIXELS } = {}) {
  const w0 = Number(width), h0 = Number(height)
  if (!Number.isFinite(w0) || !Number.isFinite(h0) || w0 <= 0 || h0 <= 0) throw new RangeError('The image has invalid dimensions.')
  const side = Math.max(MIN_SCAN_SIDE, Math.floor(Number(maxSide))), pixels = Math.max(MIN_SCAN_SIDE ** 2, Math.floor(Number(maxPixels)))
  if (!Number.isFinite(side) || !Number.isFinite(pixels)) throw new RangeError('The image size limit is invalid.')
  const scale = Math.min(1, side / Math.max(w0, h0), Math.sqrt(pixels / (w0 * h0)))
  let w = Math.max(1, Math.floor(w0 * scale)), h = Math.max(1, Math.floor(h0 * scale))
  while (w * h > pixels) { if (w >= h && w > 1) w--; else if (h > 1) h--; else break }
  return { width: w, height: h, capped: w < Math.round(w0) || h < Math.round(h0) }
}

export function isScanImageFile(file) {
  return /^image\/(?:jpeg|png|webp|gif|bmp|avif|tiff?)$/i.test(file?.type || '') || /\.(?:jpe?g|png|webp|gif|bmp|avif|tiff?)$/i.test(file?.name || '')
}

export function isValidQuad(quad) {
  if (!Array.isArray(quad) || quad.length !== 4 || quad.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((v) => !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 1))) return false
  const pts = quad.map(([x, y]) => [Number(x), Number(y)]), crosses = pts.map((p, i) => {
    const a = pts[(i + 1) % 4], b = pts[(i + 2) % 4]
    return (a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])
  })
  const sign = Math.sign(crosses[0])
  if (!sign || crosses.some((v) => !Number.isFinite(v) || Math.sign(v) !== sign || Math.abs(v) < 1e-5)) return false
  let area = 0
  for (let i = 0; i < 4; i++) area += pts[i][0] * pts[(i + 1) % 4][1] - pts[(i + 1) % 4][0] * pts[i][1]
  return Math.abs(area) / 2 >= 0.002
}

export function toCanvas(src, max = MAX_SCAN_SIDE, maxPixels = MAX_SCAN_PIXELS) {
  const w = Number(src?.width || src?.videoWidth), h = Number(src?.height || src?.videoHeight)
  const size = fitScanSize(w, h, { maxSide: Math.min(MAX_SCAN_SIDE, Number(max)), maxPixels })
  const c = document.createElement('canvas'); c.width = size.width; c.height = size.height
  const ctx = c.getContext('2d')
  if (!ctx) { c.width = c.height = 0; throw new Error('Could not create an image canvas on this device.') }
  try { ctx.drawImage(src, 0, 0, c.width, c.height); return c }
  catch (error) { c.width = c.height = 0; throw new Error('This image could not be decoded by the browser.') }
}
export function rotateCanvas(c, dir = 1) {
  if (!c || !Number.isFinite(c.width) || !Number.isFinite(c.height) || c.width < 1 || c.height < 1 || c.width * c.height > MAX_SCAN_PIXELS) throw new RangeError('This page cannot be rotated safely.')
  const turns = Math.trunc(Number(dir))
  if (!Number.isFinite(turns)) throw new RangeError('Choose a valid rotation.')
  const o = document.createElement('canvas'); o.width = c.height; o.height = c.width
  const x = o.getContext('2d')
  if (!x) { o.width = o.height = 0; throw new Error('Could not create a canvas to rotate this page.') }
  x.translate(o.width / 2, o.height / 2); x.rotate((turns * Math.PI) / 2); x.drawImage(c, -c.width / 2, -c.height / 2); return o
}
export const FULL = () => [[0, 0], [1, 0], [1, 1], [0, 1]]
export const rotateQuad = (q, dir = 1) => order(dir > 0 ? q.map(([x, y]) => [1 - y, x]) : q.map(([x, y]) => [y, 1 - x]))
function order(pts) { // TL, TR, BR, BL
  const s = pts.map(([x, y]) => x + y), d = pts.map(([x, y]) => x - y)
  return [pts[s.indexOf(Math.min(...s))], pts[d.indexOf(Math.max(...d))], pts[s.indexOf(Math.max(...s))], pts[d.indexOf(Math.min(...d))]]
}

/** Find the paper in a photo: threshold on a small copy and take the four extreme corners of the bright (or dark) blob. */
export function autoQuad(canvas) {
  const W = 160, k = W / Math.max(canvas.width, canvas.height), w = Math.max(8, Math.round(canvas.width * k)), h = Math.max(8, Math.round(canvas.height * k))
  const s = document.createElement('canvas'); s.width = w; s.height = h; const x = s.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0, w, h)
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), hist = new Uint32Array(256)
  for (let i = 0; i < w * h; i++) { g[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]; hist[g[i] | 0]++ }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]
  let wB = 0, sB = 0, best = 0, th = 128; for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = w * h - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t } }
  let cm = 0, cn = 0; for (let yy = Math.floor(h * 0.4); yy < h * 0.6; yy++) for (let xx = Math.floor(w * 0.4); xx < w * 0.6; xx++) { cm += g[yy * w + xx]; cn++ }
  const bright = cm / cn >= th
  let pts = [], area = 0
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) if ((g[yy * w + xx] >= th) === bright) { area++; pts.push([xx, yy]) }
  if (area < w * h * 0.18 || area > w * h * 0.985) return FULL()
  const tl = pts.reduce((a, p) => (p[0] + p[1] < a[0] + a[1] ? p : a)), br = pts.reduce((a, p) => (p[0] + p[1] > a[0] + a[1] ? p : a)), tr = pts.reduce((a, p) => (p[0] - p[1] > a[0] - a[1] ? p : a)), bl = pts.reduce((a, p) => (p[0] - p[1] < a[0] - a[1] ? p : a))
  const q = [tl, tr, br, bl].map(([px, py]) => [px / w, py / h]), a = Math.abs((q[0][0] * q[1][1] - q[1][0] * q[0][1]) + (q[1][0] * q[2][1] - q[2][0] * q[1][1]) + (q[2][0] * q[3][1] - q[3][0] * q[2][1]) + (q[3][0] * q[0][1] - q[0][0] * q[3][1])) / 2
  return a < 0.2 || !isValidQuad(q) ? FULL() : q
}

/** Perspective-correct the quad (normalised TL,TR,BR,BL) into a bounded flat rectangle. */
export function warp(src, quad, maxSide = MAX_SCAN_SIDE) {
  const W = Number(src?.width), H = Number(src?.height)
  if (!Number.isInteger(W) || !Number.isInteger(H) || W < 2 || H < 2 || W * H > MAX_SCAN_PIXELS) throw new RangeError('Resize this page before correcting its perspective.')
  if (!isValidQuad(quad)) throw new RangeError('The crop corners must form a valid four-sided shape.')
  const P = quad.map(([x, y]) => [x * W, y * H]), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const full = quad.every(([x, y], i) => Math.abs(x - FULL()[i][0]) < 1e-4 && Math.abs(y - FULL()[i][1]) < 1e-4)
  let ow = full ? W : Math.max(dist(P[0], P[1]), dist(P[3], P[2]))
  let oh = full ? H : Math.max(dist(P[0], P[3]), dist(P[1], P[2]))
  if (!Number.isFinite(ow) || !Number.isFinite(oh) || ow < 2 || oh < 2) throw new RangeError('The selected crop is too small to process.')
  const size = fitScanSize(ow, oh, { maxSide: Math.min(MAX_SCAN_SIDE, Number(maxSide)), maxPixels: MAX_SCAN_PIXELS })
  const out = document.createElement('canvas'); out.width = size.width; out.height = size.height
  try {
    const ctx = out.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Could not create a canvas to correct the page.')
    if (full) { ctx.drawImage(src, 0, 0, out.width, out.height); return out }
    const input = src.getContext('2d', { willReadFrequently: true })
    if (!input) throw new Error('Could not read this page image.')
    const sd = input.getImageData(0, 0, W, H).data, im = ctx.createImageData(out.width, out.height), od = im.data
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = P, dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
    let a, b, c, d, e, f, g, h
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x3 - x0; c = x0; d = y1 - y0; e = y3 - y0; f = y0; g = h = 0 }
    else {
      const det = dx1 * dy2 - dx2 * dy1
      if (!Number.isFinite(det) || Math.abs(det) < 1e-9) throw new RangeError('The crop corners are too close together.')
      g = (dx3 * dy2 - dx2 * dy3) / det; h = (dx1 * dy3 - dx3 * dy1) / det
      a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0
    }
    for (let j = 0; j < out.height; j++) {
      const v = j / Math.max(1, out.height - 1)
      for (let i = 0; i < out.width; i++) {
        const u = i / Math.max(1, out.width - 1), den = g * u + h * v + 1
        if (!Number.isFinite(den) || Math.abs(den) < 1e-8) throw new RangeError('The crop corners do not form a stable perspective.')
        const sx = Math.min(W - 1, Math.max(0, (a * u + b * v + c) / den)), sy = Math.min(H - 1, Math.max(0, (d * u + e * v + f) / den))
        const ix = Math.min(W - 2, Math.floor(sx)), iy = Math.min(H - 2, Math.floor(sy)), fx = sx - ix, fy = sy - iy, o = (j * out.width + i) * 4
        const p = (iy * W + ix) * 4, q = p + W * 4
        for (let ch = 0; ch < 3; ch++) od[o + ch] = (sd[p + ch] * (1 - fx) + sd[p + 4 + ch] * fx) * (1 - fy) + (sd[q + ch] * (1 - fx) + sd[q + 4 + ch] * fx) * fy
        od[o + 3] = 255
      }
    }
    ctx.putImageData(im, 0, 0)
    return out
  } catch (error) { out.width = out.height = 0; throw error }
}

function levels(d, lo = 0.01, hi = 0.99, perChannel = true) {
  const n = d.length / 4, step = Math.max(1, Math.floor(n / 60000)), ranges = []
  for (let ch = 0; ch < 3; ch++) { const h = new Uint32Array(256); let t = 0; for (let i = 0; i < n; i += step) { h[d[i * 4 + ch]]++; t++ } let a = 0, b = 255, s = 0; for (let v = 0; v < 256; v++) { s += h[v]; if (s >= t * lo) { a = v; break } } s = 0; for (let v = 255; v >= 0; v--) { s += h[v]; if (s >= t * (1 - hi)) { b = v; break } } ranges.push([a, Math.max(a + 8, b)]) }
  if (!perChannel) { const a = Math.min(...ranges.map((r) => r[0])), b = Math.max(...ranges.map((r) => r[1])); return [[a, b], [a, b], [a, b]] }
  return ranges
}
/** filter: original | enhance | gray | bw ; bri/con in -100..100 */
export function applyFilter(src, { filter = 'enhance', bri = 0, con = 0 } = {}) {
  const w = Number(src?.width), h = Number(src?.height)
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > MAX_SCAN_PIXELS) throw new RangeError('Resize this page before applying clean-up filters.')
  if (!['original', 'enhance', 'gray', 'bw'].includes(filter)) throw new RangeError('Choose a supported clean-up filter.')
  bri = Number.isFinite(Number(bri)) ? Math.max(-60, Math.min(60, Number(bri))) : 0
  con = Number.isFinite(Number(con)) ? Math.max(-60, Math.min(60, Number(con))) : 0
  const out = document.createElement('canvas'); out.width = w; out.height = h
  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (!ctx) { out.width = out.height = 0; throw new Error('Could not create a canvas to clean up this page.') }
  try { ctx.drawImage(src, 0, 0) } catch (error) { out.width = out.height = 0; throw new Error('Could not read this page for clean-up.') }
  if (filter === 'original' && !bri && !con) return out
  try {
  const im = ctx.getImageData(0, 0, w, h), d = im.data, n = w * h
  if (filter === 'enhance') { const r = levels(d, 0.012, 0.985, false); for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { let v = ((d[i * 4 + c] - r[c][0]) / (r[c][1] - r[c][0])) * 255; v = 255 * Math.pow(Math.min(1, Math.max(0, v / 255)), 1.12); d[i * 4 + c] = v } }
  if (filter === 'gray' || filter === 'bw') {
    const gr = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) gr[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]
    if (filter === 'gray') { const t = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { t[i * 4] = t[i * 4 + 1] = t[i * 4 + 2] = gr[i]; t[i * 4 + 3] = 255 } const r = levels(t, 0.012, 0.985, false)[0]; for (let i = 0; i < n; i++) { const v = Math.min(255, Math.max(0, ((gr[i] - r[0]) / (r[1] - r[0])) * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v } }
    else { // adaptive mean threshold via integral image
      const I = new Float64Array((w + 1) * (h + 1)); for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gr[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row } }
      const R = Math.max(8, Math.round(Math.min(w, h) / 40)), off = 10 - bri / 6
      for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1); for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1), s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0], m = s / ((x1 - x0) * (y1 - y0)), v = gr[y * w + x] > m - off ? 255 : 0, o = (y * w + x) * 4; d[o] = d[o + 1] = d[o + 2] = v } }
    }
  }
  if (filter !== 'bw' && (bri || con)) { const f = (259 * (con * 2.55 + 255)) / (255 * (259 - con * 2.55)), b = bri * 2.55; for (let i = 0; i < n * 4; i += 4) for (let c = 0; c < 3; c++) d[i + c] = f * (d[i + c] + b - 128) + 128 }
  ctx.putImageData(im, 0, 0); return out
  } catch (error) { out.width = out.height = 0; throw error }
}

/* ---------- OCR ---------- */
let worker = null, key = '', workerPromise = null, workerGeneration = 0
export async function getWorker(lang, logger) {
  if (typeof lang !== 'string' || !LANGS.some(([id]) => id === lang)) throw new RangeError('Choose a supported OCR language.')
  if (worker && key === lang) { worker._ref.fn = logger; return worker }
  if (workerPromise?.lang === lang) {
    const current = await workerPromise.promise
    if (worker === current && key === lang) { worker._ref.fn = logger; return worker }
  }
  if (worker || workerPromise) await stopOcr()
  const generation = ++workerGeneration, ref = { fn: logger }
  const promise = (async () => {
    const T = await import('tesseract.js'), local = lang.split('+').every((l) => LOCAL_LANGS.includes(l))
    const created = await T.createWorker(lang.split('+'), 1, { workerPath: `${import.meta.env?.BASE_URL || '/'}ocr/worker.min.js`, corePath: `${import.meta.env?.BASE_URL || '/'}ocr/core`, ...(local ? { langPath: `${import.meta.env?.BASE_URL || '/'}ocr/lang`, gzip: true } : {}), logger: (message) => ref.fn?.(message) })
    created._ref = ref
    if (generation !== workerGeneration) { await created.terminate().catch(() => {}); throw new Error('Cancelled') }
    worker = created; key = lang; return created
  })()
  workerPromise = { lang, promise }
  try { return await promise }
  finally { if (workerPromise?.promise === promise) workerPromise = null }
}
export async function recognize(canvas, lang, logger, wantPdf = true) {
  if (!canvas || !Number.isInteger(canvas.width) || !Number.isInteger(canvas.height) || canvas.width < 1 || canvas.height < 1 || canvas.width * canvas.height > MAX_SCAN_PIXELS) throw new RangeError('This page is too large for OCR. Resize it and try again.')
  const w = await getWorker(lang, logger), { data } = await w.recognize(canvas, {}, { text: true, pdf: wantPdf })
  return { text: String(data.text || '').replace(/\n{3,}/g, '\n\n').trim(), confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0, pdf: data.pdf ? new Uint8Array(data.pdf) : null, words: Array.isArray(data.words) ? data.words.length : 0 }
}
export async function stopOcr() {
  workerGeneration++
  const current = worker, pending = workerPromise
  worker = null; key = ''; workerPromise = null
  if (pending) pending.promise.then((created) => { if (created !== current) return created.terminate?.() }).catch(() => {})
  try { await current?.terminate?.() } catch {}
}

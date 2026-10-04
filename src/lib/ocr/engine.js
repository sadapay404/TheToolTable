/* Document scanning (perspective crop + clean-up filters) and offline OCR. */
export const LOCAL_LANGS = ['eng', 'urd']
export const LANGS = [
  ['eng', 'English', true], ['urd', 'Urdu · اردو', true], ['eng+urd', 'English + Urdu', true],
  ['ara', 'Arabic · العربية'], ['hin', 'Hindi · हिन्दी'], ['pan', 'Punjabi'], ['fas', 'Persian · فارسی'], ['fra', 'French'], ['deu', 'German'], ['spa', 'Spanish'], ['ita', 'Italian'], ['tur', 'Turkish'], ['rus', 'Russian'], ['chi_sim', 'Chinese (simplified)'], ['jpn', 'Japanese'], ['kor', 'Korean'],
]
const MAX = 3000

export function toCanvas(src, max = MAX) {
  const w = src.width || src.videoWidth, h = src.height || src.videoHeight, k = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c
}
export function rotateCanvas(c, dir = 1) {
  const o = document.createElement('canvas'); o.width = c.height; o.height = c.width; const x = o.getContext('2d')
  x.translate(o.width / 2, o.height / 2); x.rotate((dir * Math.PI) / 2); x.drawImage(c, -c.width / 2, -c.height / 2); return o
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
  return a < 0.2 ? FULL() : q
}

/** Perspective-correct the quad (normalised TL,TR,BR,BL) into a flat rectangle. */
export function warp(src, quad, maxSide = 2600) {
  const W = src.width, H = src.height, P = quad.map(([x, y]) => [x * W, y * H]), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
  let ow = Math.max(dist(P[0], P[1]), dist(P[3], P[2])), oh = Math.max(dist(P[0], P[3]), dist(P[1], P[2])); const k = Math.min(1, maxSide / Math.max(ow, oh)); ow = Math.max(16, Math.round(ow * k)); oh = Math.max(16, Math.round(oh * k))
  const isFull = quad.every(([x, y], i) => Math.abs(x - FULL()[i][0]) < 1e-4 && Math.abs(y - FULL()[i][1]) < 1e-4)
  const out = document.createElement('canvas'); out.width = isFull ? W : ow; out.height = isFull ? H : oh
  if (isFull) { out.getContext('2d').drawImage(src, 0, 0); return out }
  const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data, od = new Uint8ClampedArray(ow * oh * 4)
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = P, dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  let a, b, c, d, e, f, g, h
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x3 - x0; c = x0; d = y1 - y0; e = y3 - y0; f = y0; g = h = 0 }
  else { const det = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / det; h = (dx1 * dy3 - dx3 * dy1) / det; a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0 }
  for (let j = 0; j < oh; j++) {
    const v = j / (oh - 1)
    for (let i = 0; i < ow; i++) {
      const u = i / (ow - 1), den = g * u + h * v + 1, sx = (a * u + b * v + c) / den, sy = (d * u + e * v + f) / den
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy, o = (j * ow + i) * 4
      if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) { od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = 255; continue }
      const p = (iy * W + ix) * 4, q = p + W * 4
      for (let ch = 0; ch < 3; ch++) od[o + ch] = (sd[p + ch] * (1 - fx) + sd[p + 4 + ch] * fx) * (1 - fy) + (sd[q + ch] * (1 - fx) + sd[q + 4 + ch] * fx) * fy
      od[o + 3] = 255
    }
  }
  out.getContext('2d').putImageData(new ImageData(od, ow, oh), 0, 0); return out
}

function levels(d, lo = 0.01, hi = 0.99, perChannel = true) {
  const n = d.length / 4, step = Math.max(1, Math.floor(n / 60000)), ranges = []
  for (let ch = 0; ch < 3; ch++) { const h = new Uint32Array(256); let t = 0; for (let i = 0; i < n; i += step) { h[d[i * 4 + ch]]++; t++ } let a = 0, b = 255, s = 0; for (let v = 0; v < 256; v++) { s += h[v]; if (s >= t * lo) { a = v; break } } s = 0; for (let v = 255; v >= 0; v--) { s += h[v]; if (s >= t * (1 - hi)) { b = v; break } } ranges.push([a, Math.max(a + 8, b)]) }
  if (!perChannel) { const a = Math.min(...ranges.map((r) => r[0])), b = Math.max(...ranges.map((r) => r[1])); return [[a, b], [a, b], [a, b]] }
  return ranges
}
/** filter: original | enhance | gray | bw ; bri/con in -100..100 */
export function applyFilter(src, { filter = 'enhance', bri = 0, con = 0 } = {}) {
  const w = src.width, h = src.height, out = document.createElement('canvas'); out.width = w; out.height = h
  const ctx = out.getContext('2d', { willReadFrequently: true }); ctx.drawImage(src, 0, 0)
  if (filter === 'original' && !bri && !con) return out
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
}

/* ---------- OCR ---------- */
let worker = null, key = ''
export async function getWorker(lang, logger) {
  if (worker && key === lang) { worker._ref.fn = logger; return worker }
  if (worker) { await worker.terminate().catch(() => {}); worker = null }
  const T = await import('tesseract.js'), local = lang.split('+').every((l) => LOCAL_LANGS.includes(l)), ref = { fn: logger }
  const w = await T.createWorker(lang.split('+'), 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', ...(local ? { langPath: '/ocr/lang', gzip: true } : {}), logger: (m) => ref.fn?.(m) })
  w._ref = ref; worker = w; key = lang; return w
}
export async function recognize(canvas, lang, logger, wantPdf = true) {
  const w = await getWorker(lang, logger), { data } = await w.recognize(canvas, {}, { text: true, pdf: wantPdf })
  return { text: (data.text || '').replace(/\n{3,}/g, '\n\n').trim(), confidence: data.confidence, pdf: data.pdf ? new Uint8Array(data.pdf) : null, words: (data.words || []).length }
}
export async function stopOcr() { if (worker) { await worker.terminate().catch(() => {}); worker = null; key = '' } }

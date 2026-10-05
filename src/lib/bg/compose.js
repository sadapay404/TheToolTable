// Everything that happens AFTER the neural net: matte refinement, brush, background, shadow, trim, export.
// Pure canvas / typed-array code so it can run in the browser, a worker, or a native WebView unchanged.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (a, b, x) => { const t = clamp01((x - a) / Math.max(1e-6, b - a)); return t * t * (3 - 2 * t) }

export const DEFAULT_EDGE = { edge: 0, soft: 30 }
export const GRADIENTS = [
  ['#FF9A8B', '#FF6A88'], ['#FDC830', '#F37335'], ['#43E97B', '#38F9D7'], ['#4FACFE', '#00F2FE'],
  ['#667EEA', '#764BA2'], ['#232526', '#414345'], ['#F5F7FA', '#B8C6DB'], ['#C87941', '#2A211C'],
]
export const SWATCHES = ['#FFFFFF', '#F4EFE6', '#E8E4DA', '#C87941', '#E8A33D', '#D04841', '#7B6CB0', '#3E8ED0', '#2F9C95', '#4E937A', '#2A211C', '#000000']

/** 256-entry lookup: raw net probability → final alpha. edge shrinks/grows, soft widens the transition. */
export function matteLUT({ edge = 0, soft = 30 } = DEFAULT_EDGE) {
  const thr = 0.5 - (edge / 100) * 0.38
  const wd = 0.012 + (soft / 100) * 0.42
  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) lut[i] = Math.round(smooth(thr - wd, thr + wd, i / 255) * 255)
  return lut
}

/** Fit a long edge to `max` keeping aspect, rejecting invalid canvas dimensions. */
export function fitSize(w, h, max) {
  if (![w, h, max].every(Number.isFinite) || w <= 0 || h <= 0 || max < 1) throw new RangeError('Image dimensions and maximum edge must be positive finite numbers')
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), scale: k, capped: k < 1 }
}

/** Bilinear-upscale an 8-bit mask to w×h (uses the canvas resampler — fast and smooth). */
export function resizeMask(M, mw, mh, w, h) {
  if (mw === w && mh === h) return M
  const a = document.createElement('canvas'); a.width = mw; a.height = mh
  const ax = a.getContext('2d'); const id = ax.createImageData(mw, mh)
  for (let i = 0, p = 0; i < M.length; i++, p += 4) { id.data[p] = id.data[p + 1] = id.data[p + 2] = M[i]; id.data[p + 3] = 255 }
  ax.putImageData(id, 0, 0)
  const b = document.createElement('canvas'); b.width = w; b.height = h
  const bx = b.getContext('2d', { willReadFrequently: true }); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high'
  bx.drawImage(a, 0, 0, w, h)
  const d = bx.getImageData(0, 0, w, h).data
  const out = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = d[p]
  return out
}

/** Net output (square, stretched) → working-resolution mask. */
export function netMaskToWork(mask, size, w, h) { return resizeMask(mask, size, size, w, h) }

/** Soft round brush. mode: 'restore' | 'erase'. Interpolates between the previous and current point. */
export function paintStroke(M, mw, mh, from, to, radius, hardness, mode) {
  const dx = to.x - from.x, dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  const step = Math.max(1, radius * 0.25)
  const n = Math.max(1, Math.ceil(dist / step))
  const inner = radius * clamp01(hardness)
  for (let s = 0; s <= n; s++) {
    const cx = from.x + (dx * s) / n, cy = from.y + (dy * s) / n
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(mw - 1, Math.ceil(cx + radius))
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(mh - 1, Math.ceil(cy + radius))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy)
        if (d > radius) continue
        const k = d <= inner ? 1 : 1 - (d - inner) / Math.max(1e-6, radius - inner)
        const i = y * mw + x, v = M[i]
        if (mode === 'restore') { const t = Math.round(255 * k); if (t > v) M[i] = t }
        else M[i] = Math.round(v * (1 - k))
      }
    }
  }
}

/** Subject RGBA canvas = source pixels with alpha from the refined matte. */
export function buildSubject(src, w, h, maskFull, lut) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d', { willReadFrequently: true })
  x.drawImage(src, 0, 0, w, h)
  const id = x.getImageData(0, 0, w, h), d = id.data
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let i = 0, p = 3; i < maskFull.length; i++, p += 4) {
    const a = lut[maskFull[i]]
    d[p] = a
    if (a > 12) { const px = i % w, py = (i / w) | 0; if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py }
  }
  x.putImageData(id, 0, 0)
  return { canvas: c, bbox: maxX < 0 ? { x: 0, y: 0, w, h } : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
}

function drawBlurred(ctx, src, dx, dy, dw, dh, amount) {
  if ('filter' in ctx) { // proper gaussian where supported
    ctx.save(); ctx.filter = `blur(${amount}px)`
    const m = amount * 2
    ctx.drawImage(src, dx - m, dy - m, dw + m * 2, dh + m * 2)
    ctx.restore(); return
  }
  const k = Math.max(2, amount) // fallback: down/up-sample
  const t = document.createElement('canvas'); t.width = Math.max(2, Math.round(dw / k)); t.height = Math.max(2, Math.round(dh / k))
  t.getContext('2d').drawImage(src, 0, 0, t.width, t.height)
  ctx.imageSmoothingEnabled = true; ctx.drawImage(t, dx, dy, dw, dh)
}

function drawCover(ctx, img, W, H) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height
  const k = Math.max(W / iw, H / ih)
  ctx.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k)
}

/**
 * opts: { src, w, h, M, mw, mh, lut, bg:{type,color,color2,angle,blur,image}, shadow:{on,opacity,blur,x,y}, fit:{on,pad} }
 * Returns a canvas. `w,h` = size of the (uncropped) render; with fit.on the output is the padded subject box.
 */
export function compose({ src, w, h, M, mw, mh, lut, bg, shadow, fit }) {
  const mask = resizeMask(M, mw, mh, w, h)
  const { canvas: subject, bbox } = buildSubject(src, w, h, mask, lut)

  let cx = 0, cy = 0, cw = w, ch = h
  if (fit?.on) {
    const pad = Math.round(Math.max(bbox.w, bbox.h) * (fit.pad / 100))
    cx = bbox.x - pad; cy = bbox.y - pad; cw = bbox.w + pad * 2; ch = bbox.h + pad * 2
  }
  const out = document.createElement('canvas'); out.width = cw; out.height = ch
  const ctx = out.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(-cx, -cy)

  const type = bg?.type || 'transparent'
  if (type === 'color') { ctx.fillStyle = bg.color; ctx.fillRect(cx, cy, cw, ch) }
  else if (type === 'gradient') {
    const a = ((bg.angle ?? 135) * Math.PI) / 180, r = Math.hypot(cw, ch) / 2, mx = cx + cw / 2, my = cy + ch / 2
    const g = ctx.createLinearGradient(mx - Math.sin(a) * r, my + Math.cos(a) * r, mx + Math.sin(a) * r, my - Math.cos(a) * r)
    g.addColorStop(0, bg.color); g.addColorStop(1, bg.color2); ctx.fillStyle = g; ctx.fillRect(cx, cy, cw, ch)
  } else if (type === 'blur') {
    ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip()
    ctx.fillStyle = '#222'; ctx.fillRect(cx, cy, cw, ch)
    drawBlurred(ctx, src, 0, 0, w, h, Math.max(2, (bg.blur / 100) * Math.max(w, h) * 0.04)); ctx.restore()
  } else if (type === 'image' && bg.image) {
    ctx.save(); ctx.translate(cx, cy); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.clip(); drawCover(ctx, bg.image, cw, ch); ctx.restore()
  }

  if (shadow?.on) {
    const u = Math.max(w, h) / 1000
    ctx.save()
    ctx.shadowColor = `rgba(0,0,0,${(shadow.opacity / 100).toFixed(3)})`
    ctx.shadowBlur = shadow.blur * u; ctx.shadowOffsetX = shadow.x * u; ctx.shadowOffsetY = shadow.y * u
    ctx.drawImage(subject, 0, 0); ctx.restore()
  } else ctx.drawImage(subject, 0, 0)
  return out
}

/** Grey-scale matte preview (what the net + your refinements actually decided). */
export function matteCanvas(M, mw, mh, lut) {
  const c = document.createElement('canvas'); c.width = mw; c.height = mh
  const x = c.getContext('2d'); const id = x.createImageData(mw, mh)
  for (let i = 0, p = 0; i < M.length; i++, p += 4) { const v = lut[M[i]]; id.data[p] = id.data[p + 1] = id.data[p + 2] = v; id.data[p + 3] = 255 }
  x.putImageData(id, 0, 0); return c
}

export const MIME = { png: 'image/png', webp: 'image/webp', jpeg: 'image/jpeg' }
export function encode(canvas, fmt, quality = 0.92, flattenColor = '#FFFFFF') {
  if (!canvas || typeof canvas.toBlob !== 'function' || !canvas.width || !canvas.height) throw new TypeError('A non-empty canvas is required for image export')
  if (!Object.hasOwn(MIME, fmt)) throw new TypeError('Choose PNG, WebP or JPEG output')
  quality = Number.isFinite(quality) ? Math.max(0, Math.min(1, quality)) : 0.92
  let c = canvas
  if (fmt === 'jpeg') { // no alpha in JPEG → flatten on white (or the chosen background colour)
    c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height
    const x = c.getContext('2d'); x.fillStyle = flattenColor; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0)
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Your browser could not encode that format'))), MIME[fmt], fmt === 'png' ? undefined : quality))
}

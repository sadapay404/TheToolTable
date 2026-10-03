// Canvas-2D renderer for the Audio Visualizer Studio. Everything is sized relative to the canvas, so a
// 200 px thumbnail, the live preview and a 4K export all look identical.
import { NB } from './analyzer.js'
import { FONTS } from './params.js'

const TAU = Math.PI * 2
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const hex = (h) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`
const tri = (x) => { x = x - Math.floor(x); return x < 0.5 ? x * 2 : 2 - x * 2 }
function rect(c, x, y, w, h, r) {
  if (r > 0 && c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, w / 2, Math.abs(h) / 2 || r)); c.fill() } else c.fillRect(x, y, w, h)
}
function seeded(n) { let s = n; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } }

export class VizRenderer {
  constructor() {
    this.st = {}; this.ang = 0; this.last = 0; this.zoomV = 0; this.flashV = 0; this.phase = 0
    this.L = document.createElement('canvas'); this.G1 = document.createElement('canvas'); this.G2 = document.createElement('canvas')
    this.stars = null; this.noise = null
  }

  resize(W, H) {
    if (this.L.width !== W || this.L.height !== H) { this.L.width = W; this.L.height = H }
    const w1 = Math.max(8, W >> 2), h1 = Math.max(8, H >> 2), w2 = Math.max(6, W >> 4), h2 = Math.max(6, H >> 4)
    if (this.G1.width !== w1 || this.G1.height !== h1) { this.G1.width = w1; this.G1.height = h1 }
    if (this.G2.width !== w2 || this.G2.height !== h2) { this.G2.width = w2; this.G2.height = h2 }
  }

  /** ctx: destination 2D context (W×H). d: analyzer · assets: { bg, cover } images · t: ms clock */
  draw(ctx, W, H, d, P, assets, t) {
    const dt = this.last ? clamp((t - this.last) / 1000, 0.001, 0.08) : 0.016; this.last = t
    const S = Math.min(W, H)
    this.resize(W, H)
    this.ang += P.spin * dt * (Math.PI / 180) * (0.6 + d.level * 1.4)
    this.phase += dt * (0.2 + d.level * 1.6 + d.beat * 0.6)
    this.zoomV += (d.beat - this.zoomV) * (1 - Math.exp(-dt * 14))
    this.flashV = Math.max(this.flashV * Math.exp(-dt * 9), d.beat > 0.97 ? 1 : 0)

    // palette
    const pal = [hex(P.c1), hex(P.c2), hex(P.c3)]; if (P.reverse) pal.reverse()
    const off = P.cycle * t * 0.00006
    const col = (u, a = 0.6, al = 1) => {
      if (P.cmode === 'solid') return rgba(pal[0], al)
      if (P.cmode === 'rainbow') return hsl(360 * (u + off * 3), 88, 48 + a * 18, al)
      if (P.cmode === 'amp') { const x = clamp(a, 0, 1); return rgba(x < 0.5 ? mixc(pal[2], pal[1], x * 2) : mixc(pal[1], pal[0], (x - 0.5) * 2), al) }
      const x = tri(u * 0.999 + off); return rgba(x < 0.5 ? mixc(pal[0], pal[1], x * 2) : mixc(pal[1], pal[2], (x - 0.5) * 2), al)
    }
    const smp = (u) => { const f = clamp(u, 0, 1) * (NB - 1), i = Math.floor(f), fr = f - i; return clamp((d.bands[i] * (1 - fr) + d.bands[Math.min(NB - 1, i + 1)] * fr) * P.gain, 0, 1.15) }
    const g = { W, H, S, d, P, col, smp, dt, t, pal, st: this.st, ph: this.phase, ang: this.ang, hw: W * 0.45 * P.size, hh: H * 0.4 * P.size, R: S * 0.36 * P.size, lw: Math.max(1, P.lineW * S / 540) }

    // ---- camera (shake + beat zoom) wraps backdrop + visual
    ctx.save()
    const z = 1 + P.zoom * 0.05 * this.zoomV
    const sh = P.shake * S * 0.012 * d.beat
    ctx.translate(W / 2 + (Math.random() - 0.5) * sh * 2, H / 2 + (Math.random() - 0.5) * sh * 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2)
    this.backdrop(ctx, g, assets)

    const c = this.L.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, W, H)
    c.save(); c.translate(W / 2 + P.vx * W / 100, H / 2 + P.vy * H / 100); c.rotate(P.rotation * Math.PI / 180); c.lineCap = 'round'; c.lineJoin = 'round'
    ;(STYLES[P.style] || STYLES.bars)(g, c)
    c.restore()
    ctx.globalAlpha = P.opacity; ctx.drawImage(this.L, 0, 0)
    if (P.glow > 0.01) {
      const g1 = this.G1.getContext('2d'), g2 = this.G2.getContext('2d')
      g1.clearRect(0, 0, this.G1.width, this.G1.height); g1.imageSmoothingQuality = 'high'; g1.drawImage(this.L, 0, 0, this.G1.width, this.G1.height)
      g2.clearRect(0, 0, this.G2.width, this.G2.height); g2.imageSmoothingQuality = 'high'; g2.drawImage(this.G1, 0, 0, this.G2.width, this.G2.height)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = P.opacity * P.glow * (0.9 + d.beat * 0.5); ctx.drawImage(this.G2, 0, 0, W, H)
      ctx.globalAlpha = P.opacity * P.glow * 0.7; ctx.drawImage(this.G1, 0, 0, W, H)
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
    ctx.restore()

    this.post(ctx, g)
    this.overlay(ctx, g, assets)
  }

  /* ------------------------------------------------ backdrop ------------------------------------------------ */
  backdrop(ctx, g, assets) {
    const { W, H, S, P, d, t, pal } = g
    const b1 = hex(P.bg1), b2 = hex(P.bg2)
    const grad = (x0, y0, x1, y1, a, b) => { const q = ctx.createLinearGradient(x0, y0, x1, y1); q.addColorStop(0, rgba(a)); q.addColorStop(1, rgba(b)); return q }
    const T = P.bgType
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    if (T === 'image' && assets?.bg) {
      const im = assets.bg, k = Math.max(W / im.width, H / im.height) * (1.04 + P.bgPulse * 0.06 * this.zoomV)
      const w = im.width * k, h = im.height * k
      if (P.bgBlur > 0 && 'filter' in ctx) ctx.filter = `blur(${(P.bgBlur * S) / 120}px)`
      ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); ctx.filter = 'none'
      ctx.fillStyle = `rgba(0,0,0,${P.bgDim})`; ctx.fillRect(0, 0, W, H)
      return
    }
    if (T === 'solid') { ctx.fillStyle = rgba(b1); ctx.fillRect(0, 0, W, H); return }
    ctx.fillStyle = grad(0, 0, W * 0.4, H, b1, b2); ctx.fillRect(0, 0, W, H)
    if (T === 'gradient') {
      const r = ctx.createRadialGradient(W / 2, H * 0.62, 0, W / 2, H * 0.62, S * (0.7 + d.bass * 0.15))
      r.addColorStop(0, rgba(pal[1], 0.1 + 0.12 * d.bass)); r.addColorStop(1, rgba(pal[1], 0)); ctx.fillStyle = r; ctx.fillRect(0, 0, W, H)
    } else if (T === 'aurora') {
      ctx.globalCompositeOperation = 'lighter'
      const cols = [pal[0], pal[1], pal[2], pal[1]]
      for (let i = 0; i < 4; i++) {
        const x = W * (0.5 + 0.38 * Math.sin(t * 0.00021 * (i + 1) + i * 1.9)), y = H * (0.5 + 0.34 * Math.cos(t * 0.00017 * (i + 2) + i))
        const r = S * (0.55 + 0.1 * i + d.bass * 0.22), q = ctx.createRadialGradient(x, y, 0, x, y, r)
        q.addColorStop(0, rgba(cols[i], 0.3)); q.addColorStop(1, rgba(cols[i], 0)); ctx.fillStyle = q; ctx.fillRect(0, 0, W, H)
      }
      ctx.globalCompositeOperation = 'source-over'
    } else if (T === 'stars') {
      if (!this.stars) { const r = seeded(7); this.stars = Array.from({ length: 230 }, () => ({ x: r(), y: r(), s: 0.4 + r() * 1.4, p: r() * 7 })) }
      for (const s of this.stars) {
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.002 * s.s + s.p))
        ctx.fillStyle = `rgba(255,255,255,${tw * (0.35 + d.treble * 0.6)})`
        const x = (s.x * W + t * 0.004 * s.s) % W; ctx.beginPath(); ctx.arc(x, s.y * H, s.s * S * 0.0014 + 0.4, 0, TAU); ctx.fill()
      }
    } else if (T === 'retro') {
      const hz = H * 0.58, sr = S * 0.2
      const sun = ctx.createLinearGradient(0, hz - sr * 2, 0, hz); sun.addColorStop(0, rgba(pal[0])); sun.addColorStop(1, rgba(pal[2]))
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(W / 2, hz - sr * 0.15, sr * (1 + d.bass * 0.06), Math.PI, TAU); ctx.fill()
      ctx.fillStyle = rgba(b1)
      for (let i = 0; i < 6; i++) { const y = hz - sr * 0.9 + i * sr * 0.17; ctx.fillRect(W / 2 - sr * 1.2, y, sr * 2.4, sr * 0.02 + i * sr * 0.011) }
      ctx.fillStyle = rgba(b1); ctx.fillRect(0, hz, W, H - hz)
      ctx.strokeStyle = rgba(pal[1], 0.55); ctx.lineWidth = Math.max(1, S * 0.002)
      const ph = (this.phase * 0.5) % 1
      for (let k = 0; k < 14; k++) { const q = (k + ph) / 14, y = hz + (H - hz) * q * q; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
      for (let k = -12; k <= 12; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + k * W * 0.012, hz); ctx.lineTo(W / 2 + k * W * 0.2, H); ctx.stroke() }
    }
  }

  /* ------------------------------------------------ post + overlay ------------------------------------------------ */
  post(ctx, g) {
    const { W, H, S, P } = g
    if (P.flash > 0 && this.flashV > 0.02) { ctx.fillStyle = `rgba(255,255,255,${P.flash * 0.35 * this.flashV})`; ctx.fillRect(0, 0, W, H) }
    if (P.vignette > 0) {
      const v = ctx.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55)
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${P.vignette * 0.85})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
    }
    if (P.grain > 0.01) {
      if (!this.noise) {
        const n = document.createElement('canvas'); n.width = n.height = 180; const x = n.getContext('2d'), im = x.createImageData(180, 180), r = seeded(99)
        for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255, hi = v > 127.5; im.data[i] = im.data[i + 1] = im.data[i + 2] = hi ? 255 : 0; im.data[i + 3] = Math.abs(v - 127.5) * 2 }
        x.putImageData(im, 0, 0); this.noise = n
      }
      ctx.save(); ctx.globalAlpha = P.grain * 0.16
      ctx.translate((Math.random() * 180) | 0, (Math.random() * 180) | 0)
      ctx.fillStyle = ctx.createPattern(this.noise, 'repeat'); ctx.fillRect(-180, -180, W + 360, H + 360); ctx.restore()
    }
  }

  /** Title + subtitle are rasterised once (shadow blur is expensive) and re-used until the words or sizing change. */
  textLayer(title, sub, font, fs, align, maxW) {
    const key = `${title}|${sub}|${font[0]}|${Math.round(fs)}|${align}|${Math.round(maxW)}`
    if (this.tl && this.tl.key === key) return this.tl
    const cv = this.tl?.cv || document.createElement('canvas'), x = cv.getContext('2d')
    x.font = `${font[3]} ${fs}px ${font[2]}`; let w1 = title ? x.measureText(title).width : 0
    x.font = `${Math.min(500, font[3])} ${fs * 0.42}px ${font[2]}`; let w2 = sub ? x.measureText(sub).width : 0
    const fit = Math.min(1, maxW / Math.max(w1, w2, 1)); if (fit < 1) { fs *= fit; w1 *= fit; w2 *= fit }
    const pad = Math.ceil(fs * 0.45)
    const w = Math.ceil(Math.max(w1, w2) + pad * 2), h = Math.ceil(fs * 1.9 + pad * 2)
    cv.width = Math.max(2, w); cv.height = Math.max(2, h)
    const ref = align === 'left' ? pad : align === 'right' ? w - pad : w / 2
    x.textAlign = align; x.textBaseline = 'middle'; x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = fs * 0.16; x.shadowOffsetY = fs * 0.05
    if (title) { x.font = `${font[3]} ${fs}px ${font[2]}`; x.fillStyle = '#fff'; x.fillText(title, ref, pad + fs * 0.5) }
    if (sub) { x.font = `${Math.min(500, font[3])} ${fs * 0.42}px ${font[2]}`; x.fillStyle = 'rgba(255,255,255,.72)'; x.fillText(sub, ref, pad + fs * 0.5 + fs * 0.78) }
    this.tl = { key, cv, w, h, pad }
    return this.tl
  }

  overlay(ctx, g, assets) {
    const { W, H, S, P, d, col, pal } = g
    const M = S * 0.07, font = FONTS.find((f) => f[0] === P.font) || FONTS[0]
    const cx = W / 2 + P.vx * W / 100, cy = H / 2 + P.vy * H / 100
    // cover art
    if (P.cover !== 'off' && assets?.cover) {
      const im = assets.cover
      const center = P.coverPos === 'center', size = center ? g.R * 0.62 * (0.4 + P.coverSize) * (1 + d.bass * 0.06) : S * (0.1 + P.coverSize * 0.12)
      const x = center ? cx : M + size / 2, y = center ? cy : H - M * 2.4 - size / 2
      ctx.save(); ctx.translate(x, y)
      if (P.coverSpin && P.cover === 'circle') { this.cover = (this.cover || 0) + g.dt * 0.35; ctx.rotate(this.cover) }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(0, size * 0.04, size * 1.06, 0, TAU); ctx.fill()
      ctx.beginPath()
      if (P.cover === 'circle') ctx.arc(0, 0, size, 0, TAU); else ctx.roundRect ? ctx.roundRect(-size, -size, size * 2, size * 2, size * 0.14) : ctx.rect(-size, -size, size * 2, size * 2)
      ctx.fillStyle = '#111'; ctx.fill(); ctx.clip()
      const k = Math.max(size * 2 / im.width, size * 2 / im.height); ctx.drawImage(im, -im.width * k / 2, -im.height * k / 2, im.width * k, im.height * k)
      if (P.cover === 'circle') { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(0, 0, size * 0.07, 0, TAU); ctx.fill() }
      ctx.restore()
      ctx.save(); ctx.lineWidth = S * 0.006; ctx.strokeStyle = col(0.2, 0.9, 0.9); ctx.beginPath()
      if (P.cover === 'circle') ctx.arc(x, y, size + S * 0.008, 0, TAU); else ctx.roundRect ? ctx.roundRect(x - size - S * 0.008, y - size - S * 0.008, size * 2 + S * 0.016, size * 2 + S * 0.016, size * 0.16) : ctx.rect(x - size, y - size, size * 2, size * 2)
      ctx.stroke(); ctx.restore()
    }
    // title block
    const align = P.talign, tx = align === 'left' ? M : align === 'right' ? W - M : W / 2
    const ty = P.tpos === 'top' ? H * 0.13 : P.tpos === 'center' ? H * 0.5 : H * 0.8
    const fs = S * 0.075 * P.titleSize
    let title = P.title || ''
    if (P.tanim === 'type') { const n = Math.floor(clamp(d.time ?? 0, 0, 999) * 16); title = title.slice(0, Math.max(0, n + (d.time == null ? title.length : 0))) }
    if (title || P.subtitle) {
      const lay = this.textLayer(title, P.subtitle, font, fs, align, W - M * 2)
      ctx.save(); ctx.translate(tx, ty + (P.tanim === 'float' ? Math.sin(g.t * 0.0015) * S * 0.008 : 0))
      if (P.tanim === 'pulse') ctx.scale(1 + 0.05 * d.beat, 1 + 0.05 * d.beat)
      ctx.drawImage(lay.cv, align === 'left' ? -lay.pad : align === 'right' ? -(lay.w - lay.pad) : -lay.w / 2, -(lay.pad + fs * 0.5)); ctx.restore()
    }
    // progress
    const prog = clamp(d.progress || 0, 0, 1), bw = W - M * 2, by = H - M * 0.9
    if (P.progress !== 'none') {
      ctx.save()
      if (P.progress === 'line' || P.progress === 'pill') {
        const h = P.progress === 'pill' ? S * 0.016 : S * 0.005
        ctx.fillStyle = 'rgba(255,255,255,.18)'; rect(ctx, M, by - h / 2, bw, h, h / 2)
        const gr = ctx.createLinearGradient(M, 0, M + bw, 0); gr.addColorStop(0, rgba(pal[0])); gr.addColorStop(1, rgba(pal[1]))
        ctx.fillStyle = gr; rect(ctx, M, by - h / 2, Math.max(h, bw * prog), h, h / 2)
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(M + bw * prog, by, h * (P.progress === 'pill' ? 0.9 : 1.9), 0, TAU); ctx.fill()
      } else if (P.progress === 'dots') {
        const n = 48, r = Math.min(S * 0.006, bw / n / 2.4)
        for (let i = 0; i < n; i++) { const on = (i + 0.5) / n <= prog; ctx.fillStyle = on ? col(i / n, 0.9) : 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(M + (i + 0.5) * bw / n, by, r * (on && i === Math.floor(prog * n) ? 1.7 : 1), 0, TAU); ctx.fill() }
      }
      ctx.restore()
    }
    if (P.showTime && d.dur) {
      const f = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
      ctx.save(); ctx.font = `600 ${S * 0.022}px ui-monospace, Menlo, monospace`; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textBaseline = 'bottom'
      ctx.textAlign = 'left'; ctx.fillText(f(d.time || 0), M, by - S * 0.02); ctx.textAlign = 'right'; ctx.fillText(f(d.dur), W - M, by - S * 0.02); ctx.restore()
    }
    if (P.watermark) { ctx.save(); ctx.font = `600 ${S * 0.02}px Inter, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(P.watermark, W - M * 0.6, M * 0.55); ctx.restore() }
  }
}

/* ===================================================== visual styles ===================================================== */
const STYLES = {
  bars(g, c) {
    const { P, hw, hh, col, smp, st, dt, S } = g, n = Math.round(P.bars), bw = (2 * hw) / n, w = Math.max(1, bw * P.thick)
    if (!st.peaks || st.peaks.length !== n) st.peaks = new Float32Array(n)
    const base = P.mirror ? 0 : hh * 0.5, maxH = P.mirror ? hh : hh * 1.55, rad = P.round ? w / 2 : 0, tk = Math.max(2, S * 0.006)
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, v = smp(u), x = -hw + i * bw + (bw - w) / 2
      st.peaks[i] = Math.max(v, st.peaks[i] - dt * 0.42)
      const h = Math.max(S * 0.004, v * maxH)
      c.fillStyle = col(u, v)
      if (P.mirror) rect(c, x, -h, w, h * 2, rad); else {
        rect(c, x, base - h, w, h, rad)
        if (P.reflect) { c.globalAlpha = 0.16; rect(c, x, base + S * 0.008, w, h * 0.45, rad); c.globalAlpha = 1 }
      }
      if (P.peaks) {
        const ph = st.peaks[i] * maxH; c.fillStyle = col(u, 1, 0.95)
        if (P.mirror) { rect(c, x, -ph - tk * 1.7, w, tk, rad); rect(c, x, ph + tk * 0.7, w, tk, rad) } else rect(c, x, base - ph - tk * 1.9, w, tk, rad)
      }
    }
  },

  mirror(g, c) {
    const { P, hw, hh, col, smp, st, dt, S } = g, half = Math.max(4, Math.round(P.bars / 2)), bw = hw / half, w = Math.max(1, bw * P.thick), rad = P.round ? w / 2 : 0, tk = Math.max(2, S * 0.006)
    if (!st.peaks || st.peaks.length !== half) st.peaks = new Float32Array(half)
    for (let i = 0; i < half; i++) {
      const u = i / half, v = smp(u * 0.92), h = Math.max(S * 0.004, v * hh), x = i * bw + (bw - w) / 2
      st.peaks[i] = Math.max(v, st.peaks[i] - dt * 0.42)
      c.fillStyle = col(u, v)
      rect(c, x, -h, w, h * 2, rad); rect(c, -x - w, -h, w, h * 2, rad)
      if (P.peaks) { const ph = st.peaks[i] * hh; c.fillStyle = col(u, 1, 0.9); rect(c, x, -ph - tk * 1.7, w, tk, rad); rect(c, -x - w, -ph - tk * 1.7, w, tk, rad); rect(c, x, ph + tk * 0.7, w, tk, rad); rect(c, -x - w, ph + tk * 0.7, w, tk, rad) }
    }
  },

  radial(g, c) {
    const { P, R, col, smp, d, ang } = g, n = Math.round(P.bars), ri = R * (0.52 + d.bass * 0.05), L = R * 0.8
    c.rotate(ang)
    c.lineWidth = Math.max(1.2, (TAU * ri / n) * P.thick); c.lineCap = P.round ? 'round' : 'butt'
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - Math.PI / 2
      const u = P.mirror ? (i < n / 2 ? i / (n / 2) : (n - 1 - i) / (n / 2)) : i / n
      const v = smp(u)
      const len = Math.max(R * 0.02, v * L)
      c.strokeStyle = col(u, v); c.beginPath(); c.moveTo(Math.cos(a) * ri, Math.sin(a) * ri); c.lineTo(Math.cos(a) * (ri + len), Math.sin(a) * (ri + len)); c.stroke()
    }
    c.strokeStyle = col(0.1, 0.8, 0.35); c.lineWidth = Math.max(1, g.S * 0.003); c.beginPath(); c.arc(0, 0, ri * 0.93, 0, TAU); c.stroke()
  },

  ring(g, c) {
    const { R, d, col, lw, ang } = g, m = 200, base = R * (0.62 + d.bass * 0.07)
    c.rotate(ang)
    for (let pass = 0; pass < 3; pass++) {
      const k = [1, 0.62, 0.34][pass], rr = base * (1 - pass * 0.14), al = [1, 0.55, 0.3][pass]
      c.lineWidth = lw * (2.2 - pass * 0.6)
      let px = 0, py = 0
      for (let i = 0; i <= m; i++) {
        const u = i / m, w = d.wave[Math.floor((u * 0.5 + pass * 0.07) * d.wave.length) % d.wave.length] || 0
        const wv = u < 0.5 ? w : d.wave[Math.floor(((1 - u) * 0.5 + pass * 0.07) * d.wave.length) % d.wave.length] || 0
        const r = rr + wv * R * 0.34 * k * g.P.gain, a = u * TAU - Math.PI / 2, x = Math.cos(a) * r, y = Math.sin(a) * r
        if (i) { c.strokeStyle = col(Math.abs(u * 2 - 1), 0.5 + Math.abs(wv), al); c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke() }
        px = x; py = y
      }
    }
  },

  wave(g, c) {
    const { P, hw, hh, col, smp, d, ph, S, lw } = g, m = 72, layers = 4
    const y0 = P.reflect ? 0 : hh * 0.35
    for (let l = layers - 1; l >= 0; l--) {
      const pts = []
      for (let i = 0; i <= m; i++) {
        const u = i / m, v = smp(u * 0.8 + l * 0.04) * (0.85 - l * 0.12)
        pts.push([-hw + u * 2 * hw, y0 - v * hh * 0.85 - Math.sin(u * 7 + ph * 2 + l * 1.3) * hh * 0.06 * (0.3 + d.level * 2)])
      }
      const path = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) { const xm = (pts[i][0] + pts[i + 1][0]) / 2, ym = (pts[i][1] + pts[i + 1][1]) / 2; c.quadraticCurveTo(pts[i][0], pts[i][1], xm, ym) } c.lineTo(pts[m][0], pts[m][1]) }
      const gr = c.createLinearGradient(0, y0 - hh, 0, y0 + hh * 0.2); gr.addColorStop(0, col(l / layers, 0.9, 0.3 - l * 0.04)); gr.addColorStop(1, col(l / layers, 0.3, 0.02))
      path(); c.lineTo(hw, y0 + hh * 0.5); c.lineTo(-hw, y0 + hh * 0.5); c.closePath(); c.fillStyle = gr; c.fill()
      path(); c.strokeStyle = col(0.25 + l * 0.22, 0.8, 1 - l * 0.18); c.lineWidth = lw * (1.6 - l * 0.25); c.stroke()
      if (P.reflect && l === 0) { c.save(); c.scale(1, -0.35); c.globalAlpha = 0.25; path(); c.stroke(); c.restore() }
    }
  },

  scope(g, c) {
    const { hw, hh, d, P, col, lw } = g, m = 360
    const gr = c.createLinearGradient(-hw, 0, hw, 0)
    for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, col(k / 6, 0.7))
    const path = () => {
      c.beginPath()
      for (let i = 0; i <= m; i++) { const u = i / m, w = d.wave[Math.floor(u * (d.wave.length - 1))] * P.gain * hh * 0.9 * (0.35 + Math.sin(Math.PI * u) * 0.65), x = -hw + u * 2 * hw; i ? c.lineTo(x, w) : c.moveTo(x, w) }
    }
    c.strokeStyle = gr; path(); c.globalAlpha = 0.3; c.lineWidth = lw * 4; c.stroke(); path(); c.globalAlpha = 1; c.lineWidth = lw; c.stroke()
    c.globalAlpha = 0.12; c.lineWidth = 1; c.beginPath(); c.moveTo(-hw, 0); c.lineTo(hw, 0); c.stroke(); c.globalAlpha = 1
  },

  particles(g, c) {
    const { P, R, S, d, dt, col, smp, st } = g, n = Math.round(clamp(P.bars * 2, 60, 700))
    if (!st.parts || st.parts.length !== n) st.parts = Array.from({ length: n }, () => ({ a: Math.random() * TAU, r: Math.random(), s: 0.4 + Math.random() * 0.9, u: Math.random() }))
    for (const p of st.parts) {
      const v = smp(p.u), sp = (0.05 + 0.28 * p.s * (0.25 + d.level * 1.6) + d.beat * 0.5 * p.s) * dt
      p.r += sp; p.a += dt * 0.12 * (p.s - 0.7)
      if (p.r > 1) { p.r = 0.02 + Math.random() * 0.06; p.a = Math.random() * TAU; p.u = Math.random() }
      const rr = (p.r * 1.7 + 0.08) * R, r0 = (Math.max(0, p.r - sp * 6 - 0.012) * 1.7 + 0.08) * R
      c.lineWidth = Math.max(1, S * 0.0035 * (0.5 + p.s) * (1 + v * 3)); c.strokeStyle = col(p.u, v, clamp(1 - p.r * 0.85, 0.05, 1))
      c.beginPath(); c.moveTo(Math.cos(p.a) * r0, Math.sin(p.a) * r0); c.lineTo(Math.cos(p.a) * rr, Math.sin(p.a) * rr); c.stroke()
    }
    const core = R * (0.1 + d.bass * 0.1), q = c.createRadialGradient(0, 0, 0, 0, 0, core * 2.4); q.addColorStop(0, col(0, 1, 0.9)); q.addColorStop(1, col(0, 1, 0)); c.fillStyle = q; c.beginPath(); c.arc(0, 0, core * 2.4, 0, TAU); c.fill()
  },

  matrix(g, c) {
    const { P, hw, hh, col, smp, S } = g, cols = Math.round(clamp(P.bars / 2.4, 10, 64)), rows = 16
    const cell = Math.min((2 * hw) / cols, (2 * hh) / rows * 1.6), dot = cell * P.thick * 0.95, x0 = -(cols * cell) / 2 + cell / 2, y0 = (rows * cell) / 2 - cell / 2 - hh * 0.15
    for (let i = 0; i < cols; i++) {
      const v = smp((i + 0.5) / cols), lit = v * rows
      for (let j = 0; j < rows; j++) {
        const x = x0 + i * cell, y = y0 - j * cell, on = j < lit
        c.fillStyle = on ? col(i / cols, j / rows, 1) : 'rgba(255,255,255,0.07)'
        if (g.P.round) { c.beginPath(); c.arc(x, y, dot / 2, 0, TAU); c.fill() } else c.fillRect(x - dot / 2, y - dot / 2, dot, dot)
      }
    }
    void S
  },

  area(g, c) {
    const { P, hw, hh, col, smp, lw } = g, m = 96, base = hh * 0.55
    const pts = []
    for (let i = 0; i <= m; i++) { const u = i / m; pts.push([-hw + u * 2 * hw, base - smp(u) * hh * 1.5]) }
    const path = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < m; i++) { const xm = (pts[i][0] + pts[i + 1][0]) / 2, ym = (pts[i][1] + pts[i + 1][1]) / 2; c.quadraticCurveTo(pts[i][0], pts[i][1], xm, ym) } c.lineTo(pts[m][0], pts[m][1]) }
    const gr = c.createLinearGradient(0, base - hh * 1.5, 0, base); gr.addColorStop(0, col(0.15, 1, 0.8)); gr.addColorStop(1, col(0.8, 0.2, 0.04))
    path(); c.lineTo(hw, base); c.lineTo(-hw, base); c.closePath(); c.fillStyle = gr; c.fill()
    const sg = c.createLinearGradient(-hw, 0, hw, 0); for (let k = 0; k <= 5; k++) sg.addColorStop(k / 5, col(k / 5, 0.9)); c.strokeStyle = sg; c.lineWidth = lw * 1.4; path(); c.stroke()
    if (P.reflect) { c.save(); c.translate(0, base * 2 + hh * 0.02); c.scale(1, -0.4); c.globalAlpha = 0.18; path(); c.lineTo(hw, base); c.lineTo(-hw, base); c.closePath(); c.fillStyle = gr; c.fill(); c.restore() }
  },

  orbits(g, c) {
    const { P, R, d, col, smp, st, dt, S } = g, count = Math.round(clamp(P.bars / 10, 3, 14))
    st.o = (st.o || 0) + dt * (0.35 + d.level * 1.4)
    for (let k = 0; k < count; k++) {
      const u = k / (count - 1 || 1), v = smp(u * 0.9), r = R * (0.22 + 0.9 * u), dir = k % 2 ? -1 : 1
      const a0 = st.o * dir * (0.5 + k * 0.1) + k * 0.7, len = (0.22 + 0.7 * v) * TAU
      c.lineWidth = Math.max(2, R * 0.07 * P.thick * (0.55 + v)); c.lineCap = 'round'
      c.strokeStyle = col(u, v, 0.1); c.globalAlpha = 0.5; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.lineWidth = Math.max(1, S * 0.002); c.stroke(); c.globalAlpha = 1
      c.lineWidth = Math.max(2, R * 0.07 * P.thick * (0.55 + v)); c.strokeStyle = col(u, v); c.beginPath(); c.arc(0, 0, r, a0, a0 + len); c.stroke()
      if (P.mirror) { c.beginPath(); c.arc(0, 0, r, a0 + Math.PI, a0 + Math.PI + len * 0.6); c.stroke() }
    }
  },

  spiral(g, c) {
    const { R, col, smp, ang, lw, st, d } = g, m = 260
    c.rotate(ang * 0.6 + g.ph * 0.4)
    let px = 0, py = 0
    for (let i = 0; i <= m; i++) {
      const u = i / m, v = smp(u), th = u * TAU * 3.4, r = R * (0.08 + 0.98 * u) + v * R * 0.17 + d.bass * R * 0.04 * u
      const x = Math.cos(th) * r, y = Math.sin(th) * r
      if (i) { c.strokeStyle = col(u, v); c.lineWidth = lw * (0.5 + v * 1.8) * (0.4 + u); c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke() }
      px = x; py = y
    }
    void st
  },

  ripples(g, c) {
    const { R, d, dt, col, lw, st } = g
    st.rp = st.rp || []
    if (d.beat > 0.92 && (st.pb || 0) <= 0.92) st.rp.push({ r: 0.1, life: 1, u: Math.random() })
    st.pb = d.beat
    st.cd = (st.cd || 0) - dt
    if (st.cd <= 0 && d.level > 0.08) { st.rp.push({ r: 0.08, life: 0.55, u: Math.random() }); st.cd = 0.55 - d.level * 0.3 }
    st.rp = st.rp.filter((p) => p.life > 0.02)
    for (const p of st.rp) {
      p.r += dt * (0.55 + d.level); p.life -= dt * 0.5
      c.strokeStyle = col(p.u, p.life, clamp(p.life, 0, 1)); c.lineWidth = lw * (0.6 + p.life * 3.2)
      c.beginPath(); c.arc(0, 0, p.r * R * 1.7, 0, TAU); c.stroke()
    }
    const core = R * (0.17 + d.bass * 0.17), q = c.createRadialGradient(0, 0, 0, 0, 0, core); q.addColorStop(0, col(0, 1, 1)); q.addColorStop(0.7, col(0.5, 0.8, 0.85)); q.addColorStop(1, col(1, 0.5, 0)); c.fillStyle = q; c.beginPath(); c.arc(0, 0, core, 0, TAU); c.fill()
  },

  ridge(g, c) {
    const { P, hw, hh, col, smp, st, dt, lw } = g, rows = 26, m = 96
    st.rowT = (st.rowT || 0) - dt
    if (!st.rows) st.rows = []
    if (st.rowT <= 0) { const r = new Float32Array(m); for (let i = 0; i < m; i++) r[i] = smp(i / (m - 1)); st.rows.unshift(r); if (st.rows.length > rows) st.rows.pop(); st.rowT = 0.075 }
    const gap = (hh * 1.6) / rows, top = -hh * 0.75
    for (let k = st.rows.length - 1; k >= 0; k--) {
      const r = st.rows[k], y0 = top + (rows - k) * gap, pts = []
      for (let i = 0; i < m; i++) { const u = i / (m - 1), win = Math.pow(Math.sin(Math.PI * u), 1.4); pts.push([-hw * 0.82 + u * 2 * hw * 0.82, y0 - r[i] * hh * 0.5 * win]) }
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); pts.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(pts[m - 1][0], y0 + gap * 3); c.lineTo(pts[0][0], y0 + gap * 3); c.closePath(); c.fill()
      c.globalCompositeOperation = 'source-over'
      c.strokeStyle = col(k / rows, Math.max(...r) * 0.9, 1 - k / (rows * 1.4)); c.lineWidth = lw * 0.8; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke()
    }
    void P
  },

  starfield(g, c) {
    const { P, S, d, dt, col, st } = g, n = Math.round(clamp(P.bars * 4, 80, 800))
    if (!st.stars || st.stars.length !== n) st.stars = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random(), u: Math.random() }))
    const sp = dt * (0.1 + d.level * 1.4 + d.beat * 0.9)
    for (const s of st.stars) {
      const z0 = s.z + sp * 2.5; s.z -= sp
      if (s.z <= 0.02) { s.z = 1; s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; s.u = Math.random(); continue }
      const k = S * 0.5, x = (s.x / s.z) * k * 0.5, y = (s.y / s.z) * k * 0.5, x0 = (s.x / z0) * k * 0.5, y0 = (s.y / z0) * k * 0.5
      if (Math.abs(x) > g.W || Math.abs(y) > g.H) { s.z = 1; continue }
      c.strokeStyle = col(s.u, d.level * 2, clamp(1 - s.z, 0.05, 1)); c.lineWidth = Math.max(1, (1 - s.z) * S * 0.006)
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x, y); c.stroke()
    }
  },

  tunnel(g, c) {
    const { P, R, col, smp, ph, ang, S } = g, N = 18, sides = Math.round(clamp(P.sides, 3, 12))
    c.rotate(ang)
    for (let k = N - 1; k >= 0; k--) {
      const z = ((k / N + ph * 0.18) % 1), r = R * 0.05 + z * z * R * 2.1, v = smp(z)
      c.lineWidth = Math.max(1, (1 - z * 0.45) * S * 0.007 * P.thick * (1 + v * 3.5)); c.strokeStyle = col(z, v, clamp(z * 3.2, 0, 1) * (1 - z * 0.15))
      const rot = z * 0.9 + ph * 0.12
      c.beginPath()
      for (let s = 0; s <= sides; s++) { const a = (s / sides) * TAU + rot, x = Math.cos(a) * r, y = Math.sin(a) * r; s ? c.lineTo(x, y) : c.moveTo(x, y) }
      c.stroke()
    }
  },
}

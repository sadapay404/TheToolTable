import { Path } from './paths.js'
export const FRAME_STYLES = [
  ['none', 'None'], ['border', 'Border'], ['label-bottom', 'Label below'], ['label-top', 'Label above'], ['banner', 'Banner'], ['bubble', 'Speech bubble'], ['tag', 'Hang tag'], ['corners', 'Viewfinder'],
]
export const FONTS = {
  sans: ['Sans', 'Inter, Helvetica, Arial, sans-serif', 800],
  serif: ['Serif', 'Georgia, "Times New Roman", serif', 700],
  mono: ['Mono', 'ui-monospace, Menlo, Consolas, monospace', 800],
  round: ['Rounded', '"Arial Rounded MT Bold", ui-rounded, "Trebuchet MS", sans-serif', 800],
  display: ['Display', 'Impact, "Arial Black", Haettenschweiler, sans-serif', 400],
}
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function text(t, x, y, maxW, maxH, color, fontKey, upper = true) {
  const [, fam, w] = FONTS[fontKey] || FONTS.sans
  const s = upper ? String(t).toUpperCase() : String(t)
  const fs = Math.min(maxH * 0.52, maxW / Math.max(4, s.length * 0.66))
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family='${fam}' font-weight="${w}" font-size="${fs.toFixed(2)}" letter-spacing="${(fs * 0.06).toFixed(2)}" fill="${color}">${esc(s)}</text>`
}

/** inner = svg for the QR region (0..N). Returns {body,W,H} in module units */
export function wrapFrame(inner, N, fr) {
  const c = fr.color, tc = fr.text, label = fr.label ?? '', font = fr.font
  const pad = N * 0.06, R = N * 0.07, band = N * 0.2
  const at = (x, y) => `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">${inner}</g>`
  switch (fr.style) {
    case 'border': {
      const W = N + pad * 2, o = new Path().rr(0, 0, W, W, R * 1.4)
      return { W, H: W, body: `<path d="${o.d()}" fill="${c}"/>${at(pad, pad)}` }
    }
    case 'label-bottom': case 'label-top': {
      const W = N + pad * 2, H = N + pad * 2 + band, top = fr.style === 'label-top'
      const o = new Path().rr(0, 0, W, H, R * 1.4)
      const qy = top ? band + pad : pad
      const ty = top ? band / 2 + pad * 0.35 : N + pad * 2 + band / 2 - pad * 0.35
      return { W, H, body: `<path d="${o.d()}" fill="${c}"/>${at(pad, qy)}${text(label, W / 2, ty, W * 0.84, band, tc, font)}` }
    }
    case 'banner': {
      const W = N + pad * 2, pw = W * 0.7, ph = band * 0.78, H = W + ph / 2
      const o = new Path().rr(pad * 0.3, pad * 0.3, W - pad * 0.6, W - pad * 0.6, R)
      const pill = new Path().rr((W - pw) / 2, W - ph / 2, pw, ph, ph / 2)
      return { W, H, body: `<path d="${o.d()}" fill="none" stroke="${c}" stroke-width="${(pad * 0.6).toFixed(2)}"/>${at(pad, pad)}<path d="${pill.d()}" fill="${c}"/>${text(label, W / 2, W, pw * 0.86, ph, tc, font)}` }
    }
    case 'bubble': {
      const W = N + pad * 2, bh = band * 0.9, gap = pad * 1.4, H = bh + gap + W
      const bub = new Path().rr(0, 0, W, bh, bh / 2)
      const tail = `<path d="M${W / 2 - pad} ${bh - 1} L${W / 2} ${bh + gap} L${W / 2 + pad} ${bh - 1}Z" fill="${c}"/>`
      const box = new Path().rr(pad * 0.3, bh + gap + pad * 0.3, W - pad * 0.6, W - pad * 0.6, R)
      return { W, H, body: `<path d="${bub.d()}" fill="${c}"/>${tail}${text(label, W / 2, bh / 2, W * 0.78, bh, tc, font)}<path d="${box.d()}" fill="none" stroke="${c}" stroke-width="${(pad * 0.6).toFixed(2)}"/>${at(pad, bh + gap + pad)}` }
    }
    case 'tag': {
      const W = N + pad * 2, top = band * 1.05, H = top + N + pad + band
      const o = new Path().rr(0, 0, W, H, R * 1.6).circle(W / 2, top * 0.46, pad * 1.1)
      return { W, H, body: `<path d="${o.d()}" fill="${c}" fill-rule="evenodd"/>${at(pad, top)}${text(label, W / 2, top + N + pad + band * 0.5, W * 0.82, band, tc, font)}` }
    }
    case 'corners': {
      const p2 = N * 0.1, W = N + p2 * 2, lb = label ? band * 0.9 : 0, H = W + lb, L = N * 0.2, sw = N * 0.032, h = sw / 2
      const arm = (x, y, dx, dy) => `M${x} ${y + dy * L}V${y + dy * h}Q${x} ${y} ${x + dx * h} ${y}H${x + dx * L}`
      const d = arm(h, h, 1, 1) + arm(W - h, h, -1, 1) + arm(h, W - h, 1, -1) + arm(W - h, W - h, -1, -1)
      return { W, H, body: `<path d="${d}" fill="none" stroke="${c}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round"/>${at(p2, p2)}${label ? text(label, W / 2, W + lb * 0.38, W * 0.8, lb, c, font) : ''}` }
    }
    default: return { W: N, H: N, body: inner }
  }
}

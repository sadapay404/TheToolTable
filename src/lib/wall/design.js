import { STYLES, styleById } from './shader.js'
import { PALETTES, GALLERY } from './presets.js'
import { labFlat, hexToLch, lchToHex, lumOf, hexToRgb } from './color.js'

export const DEFAULT_FX = { hue: 0, sat: 1, bri: 0, con: 1, grain: 0.14, gsize: 1, mono: true, vig: 0, glow: 0, gang: 40, shade: 0, post: 0 }
export const DEFAULT_TEXT = { on: false, title: 'Make something\nbeautiful', sub: '', font: 'display', weight: 600, italic: false, size: 9, track: 0, color: 'auto', opacity: 1, ax: 1, ay: 1, dx: 0, dy: 0, shadow: 0.25, subScale: 0.38 }
export const DEFAULT_DESIGN = {
  style: 'mesh', pal: ['#2B1B3D', '#8E3B5A', '#E26D5C', '#F4A261', '#FFE3B3'], seed: 4,
  scale: 1, detail: 0.5, warp: 0.45, soft: 0.75, angle: 0, amp: 0.6, sub: 0,
  sym: { mode: 0, n: 6 }, pixel: 0, fx: DEFAULT_FX, loop: 12,
  size: { w: 3840, h: 2160, name: '4K UHD' }, text: DEFAULT_TEXT,
}
export function normalize(d) {
  const x = { ...DEFAULT_DESIGN, ...(d || {}) }
  x.fx = { ...DEFAULT_FX, ...(d?.fx || {}) }; x.text = { ...DEFAULT_TEXT, ...(d?.text || {}) }
  x.sym = { ...DEFAULT_DESIGN.sym, ...(d?.sym || {}) }; x.size = { ...DEFAULT_DESIGN.size, ...(d?.size || {}) }
  x.pal = Array.isArray(x.pal) && x.pal.length ? x.pal.slice(0, 8) : DEFAULT_DESIGN.pal
  return x
}

/** every number the shader needs, as plain data (also used by the HTML live-wallpaper export) */
export function uniformsFor(d) {
  const f = d.fx, s = styleById(d.style)
  return {
    f: { u_seed: d.seed, u_scale: d.scale, u_detail: d.detail, u_warp: d.warp, u_soft: d.soft, u_angle: d.angle, u_amp: d.amp, u_kn: d.sym.n, u_pixel: d.pixel,
      u_hue: f.hue, u_sat: f.sat, u_bri: f.bri, u_con: f.con, u_grain: f.grain, u_gsize: f.gsize, u_gmono: f.mono ? 1 : 0, u_vig: f.vig, u_glow: f.glow, u_gang: f.gang, u_shade: f.shade, u_post: f.post },
    i: { u_style: s.n, u_n: Math.max(1, d.pal.length), u_sub: d.sub, u_sym: d.sym.mode },
    lab: labFlat(d.pal),
  }
}

/* ---------- random-with-taste ---------- */
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
export function randomDesign(base, keep = {}) {
  const d = normalize(base)
  const styles = STYLES.filter((s) => s.id !== 'solid')
  const style = keep.style ? d.style : pick(styles).id
  let pal = d.pal
  if (!keep.pal) {
    pal = [...pick(PALETTES)[2]]
    if (Math.random() < 0.4) pal.reverse()
    if (Math.random() < 0.35) { const sh = rr(-35, 35); pal = pal.map((h) => { const [L, C, H] = hexToLch(h); return lchToHex(L, C, (H + sh + 360) % 360) }) }
  }
  const hard = ['waves', 'bands', 'dots', 'topo'].includes(style)
  const out = {
    ...d, style, pal, seed: Math.floor(rr(1, 98)),
    scale: +rr(0.85, 1.35).toFixed(2), detail: +rr(0.25, 0.8).toFixed(2), warp: +rr(0.2, 0.8).toFixed(2),
    soft: +(hard ? rr(0.1, 0.55) : rr(0.55, 0.95)).toFixed(2), angle: style === 'bands' || style === 'gradient' ? Math.round(rr(0, 120)) : 0,
    amp: +rr(0.45, 0.8).toFixed(2), sub: style === 'gradient' ? Math.floor(rr(0, 5)) : style === 'topo' ? Math.floor(rr(0, 2)) : 0,
    sym: Math.random() < 0.12 ? { mode: 3, n: pick([3, 4, 5, 6, 8]) } : Math.random() < 0.08 ? { mode: 1, n: 6 } : { mode: 0, n: 6 },
    pixel: Math.random() < 0.04 ? Math.round(rr(14, 40)) : 0,
    fx: { ...DEFAULT_FX, grain: Math.random() < 0.8 ? +rr(0.06, 0.22).toFixed(2) : 0, vig: Math.random() < 0.35 ? +rr(0.15, 0.45).toFixed(2) : 0, glow: Math.random() < 0.25 ? +rr(0.25, 0.6).toFixed(2) : 0, gang: Math.round(rr(0, 360)), mono: Math.random() < 0.7 },
  }
  if (keep.layout) { out.size = d.size }
  return out
}
/** build a design from a gallery entry (always on top of defaults, text and size are kept from `cur`) */
export function fromGallery(g, cur) {
  const keepSize = cur ? { size: cur.size, text: cur.text, loop: cur.loop } : {}
  const o = g.o || {}
  return normalize({ ...DEFAULT_DESIGN, ...keepSize, style: g.style, pal: o.pal || g.pal, seed: 4, scale: 1, detail: 0.5, warp: 0.45, soft: 0.75, angle: 0, amp: 0.6, sub: 0, sym: { mode: 0, n: 6 }, pixel: 0,
    ...Object.fromEntries(Object.entries(o).filter(([k]) => !['fx', 'pal', 'sym'].includes(k))), sym: o.sym ? { ...DEFAULT_DESIGN.sym, ...o.sym } : { mode: 0, n: 6 }, fx: { ...DEFAULT_FX, ...(o.fx || {}) } })
}

/* ---------- sharing ---------- */
export const encodeDesign = (d) => 'TTBG1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ ...d, text: { ...d.text } }))))
export function decodeDesign(s) {
  try { const m = String(s).trim().replace(/^TTBG1:/, ''); return normalize(JSON.parse(decodeURIComponent(escape(atob(m))))) } catch { return null }
}

/* ---------- CSS approximation for developers ---------- */
function prng(seed) { let a = (seed * 2654435761) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
export function cssFor(d) {
  const p = d.pal
  if (d.style === 'gradient') {
    const stops = p.map((c, i) => `${c} ${Math.round((i / Math.max(1, p.length - 1)) * 100)}%`).join(', ')
    const kind = [`linear-gradient(${(d.angle + 180) % 360}deg, ${stops})`, `radial-gradient(circle at 50% 50%, ${stops})`, `conic-gradient(from ${d.angle}deg at 50% 50%, ${stops}, ${p[0]})`, `radial-gradient(circle at 50% 50%, ${stops})`, `linear-gradient(${(d.angle + 180) % 360}deg, ${[...p, ...[...p].reverse().slice(1)].map((c, i, a) => `${c} ${Math.round((i / (a.length - 1)) * 100)}%`).join(', ')})`][d.sub] || ''
    return `background: ${kind};`
  }
  if (d.style === 'solid') return `background: ${p[0]};`
  const r = prng(d.seed * 7 + 3), n = Math.max(p.length, 4)
  const layers = Array.from({ length: n }, (_, i) => `radial-gradient(at ${Math.round(r() * 100)}% ${Math.round(r() * 100)}%, ${p[i % p.length]} 0px, transparent ${Math.round(38 + r() * 24)}%)`)
  return `background-color: ${p[0]};\nbackground-image:\n  ${layers.join(',\n  ')};`
}
export const textColorFor = (L) => (L > 0.42 ? '#14110F' : '#FFFFFF')
export { lumOf, hexToRgb, GALLERY }

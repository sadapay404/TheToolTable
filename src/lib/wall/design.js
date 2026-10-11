import { STYLES, styleById } from './shader.js'
import { PALETTES, GALLERY } from './presets.js'
import { labFlat, hexToLch, lchToHex, lumOf, hexToRgb } from './color.js'
import { fitDimensions, MAX_SIDE, MAX_CANVAS_PIXELS } from './bounds.js'

export const DEFAULT_FX = { hue: 0, sat: 1, bri: 0, con: 1, grain: 0.14, gsize: 1, mono: true, vig: 0, glow: 0, gang: 40, shade: 0, post: 0 }
export const DEFAULT_TEXT = { on: false, title: 'Make something\nbeautiful', sub: '', font: 'display', weight: 600, italic: false, size: 9, track: 0, color: 'auto', opacity: 1, ax: 1, ay: 1, dx: 0, dy: 0, shadow: 0.25, subScale: 0.38 }
export const DEFAULT_DESIGN = {
  style: 'mesh', pal: ['#2B1B3D', '#8E3B5A', '#E26D5C', '#F4A261', '#FFE3B3'], seed: 4,
  scale: 1, detail: 0.5, warp: 0.45, soft: 0.75, angle: 0, amp: 0.6, sub: 0,
  sym: { mode: 0, n: 6 }, pixel: 0, fx: DEFAULT_FX, loop: 12,
  size: { w: 3840, h: 2160, name: '4K UHD' }, text: DEFAULT_TEXT,
}

export const MAX_SAVED_DESIGNS = 100
const HEX = /^#[0-9a-f]{6}$/i
const FONT_IDS = new Set(['display', 'sans', 'serif', 'mono', 'black'])
const number = (value, fallback, min, max, integer = false) => {
  const n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN
  const v = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  return integer ? Math.round(v) : v
}
const str = (value, fallback, max) => typeof value === 'string' ? value.slice(0, max) : fallback
const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback
const color = (value, fallback) => typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback

function normalizeSize(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const w = number(raw.w, DEFAULT_DESIGN.size.w, 16, MAX_SIDE)
  const h = number(raw.h, DEFAULT_DESIGN.size.h, 16, MAX_SIDE)
  const fitted = fitDimensions(w, h, { maxSide: MAX_SIDE, maxPixels: MAX_CANVAS_PIXELS })
  return { w: fitted.w, h: fitted.h, name: str(raw.name, DEFAULT_DESIGN.size.name, 64) || 'Custom' }
}

export function normalize(d) {
  const raw = d && typeof d === 'object' && !Array.isArray(d) ? d : {}
  const rawFx = raw.fx && typeof raw.fx === 'object' && !Array.isArray(raw.fx) ? raw.fx : {}
  const rawText = raw.text && typeof raw.text === 'object' && !Array.isArray(raw.text) ? raw.text : {}
  const rawSym = raw.sym && typeof raw.sym === 'object' && !Array.isArray(raw.sym) ? raw.sym : {}
  const style = STYLES.some((s) => s.id === raw.style) ? raw.style : DEFAULT_DESIGN.style
  const styleInfo = styleById(style)
  const pal = Array.isArray(raw.pal) ? raw.pal.filter((c) => typeof c === 'string' && HEX.test(c)).slice(0, 8).map((c) => c.toLowerCase()) : []
  const safePal = pal.length ? pal : [...DEFAULT_DESIGN.pal]
  const fx = {
    hue: number(rawFx.hue, DEFAULT_FX.hue, -180, 180), sat: number(rawFx.sat, DEFAULT_FX.sat, 0, 2),
    bri: number(rawFx.bri, DEFAULT_FX.bri, -1, 1), con: number(rawFx.con, DEFAULT_FX.con, 0.5, 1.8),
    grain: number(rawFx.grain, DEFAULT_FX.grain, 0, 1), gsize: number(rawFx.gsize, DEFAULT_FX.gsize, 0.5, 5),
    mono: bool(rawFx.mono, DEFAULT_FX.mono), vig: number(rawFx.vig, DEFAULT_FX.vig, 0, 1),
    glow: number(rawFx.glow, DEFAULT_FX.glow, 0, 1), gang: number(rawFx.gang, DEFAULT_FX.gang, 0, 360),
    shade: number(rawFx.shade, DEFAULT_FX.shade, -1, 1), post: number(rawFx.post, DEFAULT_FX.post, 0, 16, true),
  }
  const textColor = rawText.color === 'auto' ? 'auto' : color(rawText.color, DEFAULT_TEXT.color)
  const text = {
    on: bool(rawText.on, DEFAULT_TEXT.on), title: str(rawText.title, DEFAULT_TEXT.title, 500), sub: str(rawText.sub, DEFAULT_TEXT.sub, 500),
    font: FONT_IDS.has(rawText.font) ? rawText.font : DEFAULT_TEXT.font,
    weight: [400, 500, 600, 700, 800, 900].includes(Number(rawText.weight)) ? Number(rawText.weight) : DEFAULT_TEXT.weight,
    italic: bool(rawText.italic, DEFAULT_TEXT.italic), size: number(rawText.size, DEFAULT_TEXT.size, 2, 30),
    track: number(rawText.track, DEFAULT_TEXT.track, -4, 30), color: textColor,
    opacity: number(rawText.opacity, DEFAULT_TEXT.opacity, 0, 1), ax: number(rawText.ax, DEFAULT_TEXT.ax, 0, 2, true),
    ay: number(rawText.ay, DEFAULT_TEXT.ay, 0, 2, true), dx: number(rawText.dx, DEFAULT_TEXT.dx, -30, 30),
    dy: number(rawText.dy, DEFAULT_TEXT.dy, -30, 30), shadow: number(rawText.shadow, DEFAULT_TEXT.shadow, 0, 1),
    subScale: number(rawText.subScale, DEFAULT_TEXT.subScale, 0.1, 1),
  }
  return {
    style, pal: safePal, seed: number(raw.seed, DEFAULT_DESIGN.seed, 1, 99, true),
    scale: number(raw.scale, DEFAULT_DESIGN.scale, 0.4, 3), detail: number(raw.detail, DEFAULT_DESIGN.detail, 0, 1),
    warp: number(raw.warp, DEFAULT_DESIGN.warp, 0, 1), soft: number(raw.soft, DEFAULT_DESIGN.soft, 0, 1),
    angle: number(raw.angle, DEFAULT_DESIGN.angle, 0, 360), amp: number(raw.amp, DEFAULT_DESIGN.amp, 0, 1),
    sub: number(raw.sub, DEFAULT_DESIGN.sub, 0, Math.max(0, (styleInfo.subs?.length || 1) - 1), true),
    sym: { mode: number(rawSym.mode, DEFAULT_DESIGN.sym.mode, 0, 3, true), n: number(rawSym.n, DEFAULT_DESIGN.sym.n, 3, 16, true) },
    pixel: number(raw.pixel, DEFAULT_DESIGN.pixel, 0, 90, true), fx, loop: number(raw.loop, DEFAULT_DESIGN.loop, 4, 40, true),
    size: normalizeSize(raw.size), text,
  }
}

export function normalizeSavedDesigns(value) {
  if (!Array.isArray(value)) return []
  const ids = new Set()
  const rows = []
  for (const [i, raw] of value.slice(0, MAX_SAVED_DESIGNS * 2).entries()) {
    if (!raw || typeof raw !== 'object' || !raw.d || typeof raw.d !== 'object') continue
    const baseId = str(raw.id, '', 80).replace(/[^a-zA-Z0-9_-]/g, '') || `saved-${i + 1}`
    let id = baseId, suffix = 2
    while (ids.has(id)) id = `${baseId}-${suffix++}`
    ids.add(id)
    const name = str(raw.name, `Look ${i + 1}`, 80).trim() || `Look ${i + 1}`
    const thumb = typeof raw.thumb === 'string' && /^data:image\/(?:jpeg|png);base64,[a-z0-9+/=]+$/i.test(raw.thumb) && raw.thumb.length <= 250_000 ? raw.thumb : ''
    rows.push({ id, name, d: normalize(raw.d), thumb, ts: number(raw.ts, Date.now(), 0, Number.MAX_SAFE_INTEGER) })
    if (rows.length >= MAX_SAVED_DESIGNS) break
  }
  return rows
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
  return normalize({ ...DEFAULT_DESIGN, ...keepSize, style: g.style, pal: o.pal || g.pal, seed: 4, scale: 1, detail: 0.5, warp: 0.45, soft: 0.75, angle: 0, amp: 0.6, sub: 0, pixel: 0,
    ...Object.fromEntries(Object.entries(o).filter(([k]) => !['fx', 'pal', 'sym'].includes(k))), sym: o.sym ? { ...DEFAULT_DESIGN.sym, ...o.sym } : { mode: 0, n: 6 }, fx: { ...DEFAULT_FX, ...(o.fx || {}) } })
}

/* ---------- sharing ---------- */
export const encodeDesign = (d) => 'TTBG1:' + btoa(unescape(encodeURIComponent(JSON.stringify(normalize(d)))))
export function decodeDesign(s) {
  try {
    const input = typeof s === 'string' ? s.trim() : ''
    if (!input || input.length > 50_000) return null
    const m = input.replace(/^TTBG1:/, '')
    return normalize(JSON.parse(decodeURIComponent(escape(atob(m)))))
  } catch { return null }
}

/* ---------- CSS approximation for developers ---------- */
function prng(seed) { let a = (seed * 2654435761) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
export function cssFor(input) {
  const d = normalize(input), p = d.pal
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

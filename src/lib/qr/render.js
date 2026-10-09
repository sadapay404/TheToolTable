import QRCode from 'qrcode'
import { Path } from './paths.js'
import { addDot, addEyeFrame, addEyeBall, DOT_SHAPES, FRAME_SHAPES, BALL_SHAPES } from './shapes.js'
import { wrapFrame, FRAME_STYLES, FONTS } from './frames.js'
import { logoById, logoMarkup } from './logos.js'

export const DEFAULT_STYLE = {
  ecc: 'auto', margin: 2,
  dots: { shape: 'soft', scale: 1, fill: 'solid', color: '#1A1411', c2: '#B4715A', c3: '#3E8ED0', stops: 2, angle: 45, grad: 'linear', duo: 'random', seed: 7, image: null, dark: 0.5 },
  eyes: { frame: 'rounded', ball: 'rounded', sync: false, frameColor: '#1A1411', ballColor: '#B4715A', per: false, p: [{ f: '#1A1411', b: '#B4715A' }, { f: '#1A1411', b: '#B4715A' }, { f: '#1A1411', b: '#B4715A' }] },
  bg: { type: 'solid', color: '#FFFFFF', c2: '#F3E6D8', angle: 90, image: null, fade: 0.72, radius: 0.04 },
  logo: { id: null, upload: null, size: 0.22, badge: 'circle', badgeColor: '#FFFFFF', color: '#1A1411', clear: true, border: false },
  frame: { style: 'none', label: 'SCAN ME', color: '#1A1411', text: '#FFFFFF', font: 'sans' },
}

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value)
const safeKey = (key) => key !== '__proto__' && key !== 'prototype' && key !== 'constructor'
const clamp = (value, min, max, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const boundedInt = (value, min, max, fallback) => Math.round(clamp(value, min, max, fallback))
const safeHex = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback
const safeImage = (value) => typeof value === 'string' && value.length <= 4 * 1024 * 1024 && /^data:image\/(?:png|jpeg);base64,[a-z0-9+/=\r\n]+$/i.test(value) ? value : null
const safeEnum = (value, options, fallback) => options.includes(value) ? value : fallback
const shapeKeys = (list) => list.map(([key]) => key)

export const merge = (a, b) => {
  if (!isRecord(b)) return b === undefined ? a : b
  const o = { ...(isRecord(a) ? a : {}) }
  for (const k of Object.keys(b)) {
    if (!safeKey(k)) continue
    const old = a?.[k], next = b[k]
    o[k] = isRecord(old) && isRecord(next) ? merge(old, next) : next
  }
  return o
}

/** Merge persisted/imported settings with the built-in schema and keep SVG inputs safe. */
export const withDefaults = (input) => {
  const merged = merge(DEFAULT_STYLE, isRecord(input) ? input : {})
  const s = {
    ...merged,
    dots: isRecord(merged.dots) ? merged.dots : DEFAULT_STYLE.dots,
    eyes: isRecord(merged.eyes) ? merged.eyes : DEFAULT_STYLE.eyes,
    bg: isRecord(merged.bg) ? merged.bg : DEFAULT_STYLE.bg,
    logo: isRecord(merged.logo) ? merged.logo : DEFAULT_STYLE.logo,
    frame: isRecord(merged.frame) ? merged.frame : DEFAULT_STYLE.frame,
  }
  const d = s.dots, e = s.eyes, b = s.bg, l = s.logo, f = s.frame
  const p = Array.isArray(e.p) ? e.p : DEFAULT_STYLE.eyes.p
  const style = {
    ecc: safeEnum(s.ecc, ['auto', 'L', 'M', 'Q', 'H'], DEFAULT_STYLE.ecc),
    margin: boundedInt(s.margin, 0, 8, DEFAULT_STYLE.margin),
    dots: {
      ...d,
      shape: safeEnum(d.shape, shapeKeys(DOT_SHAPES), DEFAULT_STYLE.dots.shape),
      scale: clamp(d.scale, 0.5, 1, DEFAULT_STYLE.dots.scale),
      fill: safeEnum(d.fill, ['solid', 'gradient', 'duo', 'image'], DEFAULT_STYLE.dots.fill),
      color: safeHex(d.color, DEFAULT_STYLE.dots.color),
      c2: safeHex(d.c2, DEFAULT_STYLE.dots.c2),
      c3: safeHex(d.c3, DEFAULT_STYLE.dots.c3),
      stops: d.stops === 3 ? 3 : 2,
      angle: boundedInt(d.angle, 0, 360, DEFAULT_STYLE.dots.angle),
      grad: safeEnum(d.grad, ['linear', 'radial'], DEFAULT_STYLE.dots.grad),
      duo: safeEnum(d.duo, ['random', 'checker', 'rows', 'diag', 'rings'], DEFAULT_STYLE.dots.duo),
      seed: boundedInt(d.seed, 0, 1_000_000, DEFAULT_STYLE.dots.seed),
      image: safeImage(d.image),
      dark: clamp(d.dark, 0, 0.8, DEFAULT_STYLE.dots.dark),
    },
    eyes: {
      ...e,
      frame: safeEnum(e.frame, shapeKeys(FRAME_SHAPES), DEFAULT_STYLE.eyes.frame),
      ball: safeEnum(e.ball, shapeKeys(BALL_SHAPES), DEFAULT_STYLE.eyes.ball),
      sync: typeof e.sync === 'boolean' ? e.sync : DEFAULT_STYLE.eyes.sync,
      frameColor: safeHex(e.frameColor, DEFAULT_STYLE.eyes.frameColor),
      ballColor: safeHex(e.ballColor, DEFAULT_STYLE.eyes.ballColor),
      per: typeof e.per === 'boolean' ? e.per : DEFAULT_STYLE.eyes.per,
      p: [0, 1, 2].map((i) => ({
        f: safeHex(p[i]?.f, DEFAULT_STYLE.eyes.p[i].f),
        b: safeHex(p[i]?.b, DEFAULT_STYLE.eyes.p[i].b),
      })),
    },
    bg: {
      ...b,
      type: safeEnum(b.type, ['none', 'solid', 'gradient', 'image'], DEFAULT_STYLE.bg.type),
      color: safeHex(b.color, DEFAULT_STYLE.bg.color),
      c2: safeHex(b.c2, DEFAULT_STYLE.bg.c2),
      angle: boundedInt(b.angle, 0, 360, DEFAULT_STYLE.bg.angle),
      image: safeImage(b.image),
      fade: clamp(b.fade, 0, 0.95, DEFAULT_STYLE.bg.fade),
      radius: clamp(b.radius, 0, 0.5, DEFAULT_STYLE.bg.radius),
    },
    logo: {
      ...l,
      id: typeof l.id === 'string' && /^[\w-]{1,64}$/.test(l.id) ? l.id : null,
      upload: safeImage(l.upload),
      size: clamp(l.size, 0.08, 0.32, DEFAULT_STYLE.logo.size),
      badge: safeEnum(l.badge, ['circle', 'rounded', 'square', 'none'], DEFAULT_STYLE.logo.badge),
      badgeColor: safeHex(l.badgeColor, DEFAULT_STYLE.logo.badgeColor),
      color: safeHex(l.color, DEFAULT_STYLE.logo.color),
      clear: typeof l.clear === 'boolean' ? l.clear : DEFAULT_STYLE.logo.clear,
      border: typeof l.border === 'boolean' ? l.border : DEFAULT_STYLE.logo.border,
    },
    frame: {
      ...f,
      style: safeEnum(f.style, FRAME_STYLES.map(([key]) => key), DEFAULT_STYLE.frame.style),
      label: typeof f.label === 'string' ? f.label.slice(0, 80) : DEFAULT_STYLE.frame.label,
      color: safeHex(f.color, DEFAULT_STYLE.frame.color),
      text: safeHex(f.text, DEFAULT_STYLE.frame.text),
      font: safeEnum(f.font, Object.keys(FONTS), DEFAULT_STYLE.frame.font),
    },
  }
  /* Force the modules to be readable, whatever palette the style asked for. */
  const bg = safeHex(style.bg?.color, '#FFFFFF')
  /* The worst module colour decides, not the first one. A gradient draws every
     stop, and one unreadable stop is enough to cost a scan. */
  const worst = moduleColours(style.dots).reduce((low, c) => Math.min(low, contrast(c, bg)), Infinity)
  if (worst < MIN_MODULE_CONTRAST) {
    for (const key of ['color', 'c2', 'c3', 'c4']) {
      if (typeof style.dots[key] === 'string' && /^#[0-9a-f]{6}$/i.test(style.dots[key])) {
        style.dots[key] = forceContrast(style.dots[key], bg)
      }
    }
    /* The finder patterns are read first and hardest, so they get the same floor. */
    for (const key of ['frameColor', 'ballColor']) {
      if (typeof style.eyes[key] === 'string' && /^#[0-9a-f]{6}$/i.test(style.eyes[key])) {
        style.eyes[key] = forceContrast(style.eyes[key], bg)
      }
    }
  }
  return style
}

/** style without heavy data URLs (for localStorage) */
export const lightStyle = (s) => {
  const c = withDefaults(s)
  c.dots.image = null; c.bg.image = null; c.logo.upload = null
  return c
}

export function makeMatrix(text, ecc) {
  const qr = QRCode.create(text && text.length ? text : ' ', { errorCorrectionLevel: ecc })
  const m = qr.modules
  /* The bit matrix wraps out-of-range indices into a real module, so an
     off-by-one in a loop produces a corrupt code rather than an obvious blank.
     Refuse instead. */
  return { n: m.size, version: qr.version, ecc, get: (r, c) => (r < 0 || c < 0 || r >= m.size || c >= m.size ? false : !!m.get(r, c)) }
}

const hash = (a, b, s) => { let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [0, 0, 0]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
export const lum = (h) => { const c = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

/**
 * A QR code that looks beautiful and cannot be scanned is a broken QR code.
 *
 * Seven of the built-in templates had a dot-to-background contrast below 3:1 —
 * "Ocean" sat at 1.90:1, bright cyan on near-white — which is under what a phone
 * camera needs in ordinary light. Rather than flatten the palettes and lose what
 * made them worth picking, this walks the colours toward the background until
 * they clear the threshold, preserving hue and saturation. The design intent
 * survives; the code scans.
 */
const MIN_MODULE_CONTRAST = 4.5

const hexToRgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16)
  return Number.isFinite(n) && String(hex).startsWith('#') ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null
}
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()
const rgbToHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, l, d / (1 - Math.abs(2 * l - 1))]
}
const hslToRgb = ([h, s, l]) => {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
  return t.map((v) => (v + m) * 255)
}
/** Walk a colour away from `bg` until it clears the contrast threshold. */
const forceContrast = (hex, bg, min = MIN_MODULE_CONTRAST) => {
  const from = hexToRgb(hex)
  if (!from) return hex
  if (contrast(hex, bg) >= min) return hex
  const [h, s, l] = rgbToHsl(from)
  const target = lum(bg) > 0.5 ? 0 : 1
  let best = hex
  for (let step = 1; step <= 100; step += 1) {
    const next = rgbToHex(hslToRgb([h, s, l + ((target - l) * step) / 100]))
    best = next
    if (contrast(next, bg) >= min) return next
  }
  return target === 0 ? '#000000' : '#FFFFFF'
}

/** Every colour the modules can be drawn in; for a gradient, all of its stops. */
const moduleColours = (dots) => ['color', 'c2', 'c3', 'c4']
  .map((k) => dots?.[k])
  .filter((v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))
export function effectiveEcc(st) {
  if (st.ecc !== 'auto') return st.ecc
  const hasLogo = st.logo.id || st.logo.upload
  return hasLogo || st.dots.fill === 'image' ? 'H' : st.dots.scale < 0.8 ? 'Q' : 'M'
}

const linGrad = (id, N, angle, stops) => {
  const a = (angle * Math.PI) / 180, cx = N / 2, dx = Math.cos(a) * N / 2, dy = Math.sin(a) * N / 2
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${(cx - dx).toFixed(2)}" y1="${(cx - dy).toFixed(2)}" x2="${(cx + dx).toFixed(2)}" y2="${(cx + dy).toFixed(2)}">${stops.map((c, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}</linearGradient>`
}
const radGrad = (id, N, stops) => `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${N / 2}" cy="${N / 2}" r="${(N * 0.72).toFixed(2)}">${stops.map((c, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}</radialGradient>`

export function buildQR(text, styleIn, uid = 'q') {
  uid = typeof uid === 'string' ? uid.replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'q' : 'q'
  const st = withDefaults(styleIn)
  const ecc = effectiveEcc(st)
  const m = makeMatrix(text, ecc)
  const mg = Math.max(0, st.margin), n = m.n, N = n + mg * 2
  const logo = st.logo.upload ? { upload: true } : st.logo.id ? logoById(st.logo.id) : null
  const D = st.dots
  const layers = [] // for vector exports
  let defs = ''

  // logo geometry & clear zone
  const logoSize = logo ? Math.max(2, st.logo.size * n) : 0
  const half = logoSize / 2 + (st.logo.clear ? 0.9 : -1)
  const cleared = (r, c) => {
    if (!logo || !st.logo.clear) return false
    const dx = c + 0.5 + mg - N / 2, dy = r + 0.5 + mg - N / 2
    return st.logo.badge === 'circle' ? Math.hypot(dx, dy) < half : Math.abs(dx) < half && Math.abs(dy) < half
  }
  const inEye = (r, c) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8)
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && m.get(r, c)

  // dots
  const P1 = new Path(), P2 = new Path()
  let darkCount = 0
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!dark(r, c) || inEye(r, c) || cleared(r, c)) continue
    darkCount++
    const nb = { t: dark(r - 1, c) && !inEye(r - 1, c) && !cleared(r - 1, c), b: dark(r + 1, c) && !inEye(r + 1, c) && !cleared(r + 1, c), l: dark(r, c - 1) && !inEye(r, c - 1) && !cleared(r, c - 1), r: dark(r, c + 1) && !inEye(r, c + 1) && !cleared(r, c + 1) }
    let target = P1
    if (D.fill === 'duo') {
      const pat = D.duo
      const v = pat === 'checker' ? (r + c) % 2 : pat === 'rows' ? r % 2 : pat === 'diag' ? Math.floor((r + c) / 2) % 2 : pat === 'rings' ? Math.floor(Math.max(Math.abs(r - n / 2), Math.abs(c - n / 2)) / 2.5) % 2 : hash(r, c, D.seed) > 0.5 ? 1 : 0
      target = v ? P2 : P1
    }
    addDot(target, D.shape, c + mg, r + mg, D.scale, nb)
  }

  const stopsOf = (a, b, c3, k) => (k === 3 ? [a, b, c3] : [a, b])
  let dotFill = D.color, dotsSvg = ''
  if (D.fill === 'gradient') {
    const id = uid + 'gd'
    defs += D.grad === 'radial' ? radGrad(id, N, stopsOf(D.color, D.c2, D.c3, D.stops)) : linGrad(id, N, D.angle, stopsOf(D.color, D.c2, D.c3, D.stops))
    dotFill = `url(#${id})`
  }
  if (D.fill === 'image' && D.image) {
    const id = uid + 'cd'
    defs += `<clipPath id="${id}"><path d="${P1.d()}"/></clipPath>`
    dotsSvg = `<g clip-path="url(#${id})"><image href="${D.image}" x="0" y="0" width="${N}" height="${N}" preserveAspectRatio="xMidYMid slice"/><rect width="${N}" height="${N}" fill="#000" opacity="${D.dark}"/></g>`
  } else if (D.fill === 'duo') {
    dotsSvg = `<path d="${P1.d()}" fill="${D.color}"/><path d="${P2.d()}" fill="${D.c2}"/>`
  } else dotsSvg = `<path d="${P1.d()}" fill="${dotFill}"/>`
  layers.push({ color: D.color, path: P1 })
  if (D.fill === 'duo') layers.push({ color: D.c2, path: P2 })

  // eyes
  const E = st.eyes
  const origins = [[mg, mg], [mg + n - 7, mg], [mg, mg + n - 7]]
  let eyesSvg = ''
  origins.forEach(([x, y], i) => {
    const fp = new Path(), bp = new Path()
    addEyeFrame(fp, E.frame, x, y, i); addEyeBall(bp, E.ball, x + 2, y + 2, i)
    let fc = E.per ? E.p[i].f : E.frameColor, bc = E.per ? E.p[i].b : E.ballColor
    if (E.sync) {
      if (D.fill === 'gradient') { fc = bc = dotFill } else if (D.fill === 'duo') { fc = D.color; bc = D.c2 } else { fc = bc = D.color }
    }
    eyesSvg += `<path d="${fp.d()}" fill="${fc}" fill-rule="evenodd"/><path d="${bp.d()}" fill="${bc}"/>`
    layers.push({ color: String(fc).startsWith('url') ? D.color : fc, path: fp, eo: true }, { color: String(bc).startsWith('url') ? D.c2 : bc, path: bp })
  })

  // background
  const B = st.bg, rad = Math.min(0.5, B.radius) * N
  const bgPath = new Path().rr(0, 0, N, N, rad)
  let bgSvg = ''
  if (B.type === 'solid') bgSvg = `<path d="${bgPath.d()}" fill="${B.color}"/>`
  else if (B.type === 'gradient') { defs += linGrad(uid + 'gb', N, B.angle, [B.color, B.c2]); bgSvg = `<path d="${bgPath.d()}" fill="url(#${uid}gb)"/>` }
  else if (B.type === 'image' && B.image) {
    defs += `<clipPath id="${uid}cb"><path d="${bgPath.d()}"/></clipPath>`
    bgSvg = `<g clip-path="url(#${uid}cb)"><image href="${B.image}" x="0" y="0" width="${N}" height="${N}" preserveAspectRatio="xMidYMid slice"/><rect width="${N}" height="${N}" fill="${B.color}" opacity="${B.fade}"/></g>`
  } else if (B.type === 'image') bgSvg = `<path d="${bgPath.d()}" fill="${B.color}"/>`
  if (B.type === 'solid') layers.unshift({ color: B.color, path: bgPath })

  // logo
  let logoSvg = '', logoPct = 0
  if (logo) {
    const S0 = logoSize, cx = N / 2, cy = N / 2, bd = st.logo.badge, bdFill = st.logo.badgeColor
    const bpath = bd === 'circle' ? new Path().circle(cx, cy, S0 / 2) : bd === 'rounded' ? new Path().rr(cx - S0 / 2, cy - S0 / 2, S0, S0, S0 * 0.24) : new Path().rr(cx - S0 / 2, cy - S0 / 2, S0, S0, 0)
    if (bd !== 'none') logoSvg += `<path d="${bpath.d()}" fill="${bdFill}"${st.logo.border ? ` stroke="${st.logo.color}" stroke-width="${(S0 * 0.04).toFixed(3)}"` : ''}/>`
    if (logo.upload) {
      const iw = bd === 'none' ? S0 : S0 * (bd === 'circle' ? 0.7 : 0.8)
      logoSvg += `<image href="${st.logo.upload}" x="${(cx - iw / 2).toFixed(3)}" y="${(cy - iw / 2).toFixed(3)}" width="${iw.toFixed(3)}" height="${iw.toFixed(3)}" preserveAspectRatio="xMidYMid meet"/>`
    } else logoSvg += logoMarkup(logo, cx, cy, bd === 'none' ? S0 * 0.9 : S0 * 0.58, st.logo.color)
    logoPct = (bd === 'circle' ? Math.PI / 4 : 1) * (S0 / n) ** 2
  }

  const inner = `<g>${bgSvg}${dotsSvg}${eyesSvg}${logoSvg}</g>`
  const fr = wrapFrame(inner, N, st.frame)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${fr.W.toFixed(3)} ${fr.H.toFixed(3)}" width="__W__" height="__H__" shape-rendering="geometricPrecision"><defs>${defs}</defs>${fr.body}</svg>`
  return { svg, text, W: fr.W, H: fr.H, N, layers, info: { version: m.version, n, ecc, modules: darkCount, logoPct, matrixOk: true }, style: st }
}

export const sized = (svg, w, h) => svg.replace('__W__', Math.round(w)).replace('__H__', Math.round(h))
export const svgFile = (r, px = 1024) => `<?xml version="1.0" encoding="UTF-8"?>\n${sized(r.svg, px, (px * r.H) / r.W)}`
export const dataUrl = (svg, px, r) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized(svg, px, (px * r.H) / r.W))

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not render the QR image')); i.src = src })
}
/** Rasterise to a canvas. bg: null (transparent) | css colour */
export async function toCanvas(r, w, { bg = null } = {}) {
  const width = Math.round(Number(w)), height = Math.round((width * r.H) / r.W)
  if (!Number.isSafeInteger(width) || width < 1 || width > 8192 || !Number.isSafeInteger(height) || height < 1 || height > 8192 || width * height > 32_000_000) {
    throw new Error('That export is too large for a browser canvas. Choose a smaller size.')
  }
  const img = await loadImg(dataUrl(r.svg, width, r))
  const c = document.createElement('canvas'); c.width = width; c.height = height
  const x = c.getContext('2d')
  if (!x) throw new Error('Canvas rendering is not available in this browser.')
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height) }
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'
  x.drawImage(img, 0, 0, c.width, c.height)
  return c
}
export const canvasBlob = (c, type = 'image/png') => new Promise((res, rej) => {
  if (!c?.toBlob) { rej(new Error('Canvas image export is not available in this browser.')); return }
  c.toBlob((b) => (b ? res(b) : rej(new Error('Image too large for this device — try a smaller size'))), type)
})
export async function toPng(r, w, opts) { return canvasBlob(await toCanvas(r, w, opts)) }

/** vector EPS: flat colours (gradients → first stop), no frame text */
export function toEPS(r, pt = 512, transparent = false) {
  const N = r.N, k = pt / N
  const t = (x, y) => [x * k, (N - y) * k]
  const col = (h) => hex2rgb(h).map((v) => (v / 255).toFixed(4)).join(' ')
  let o = `%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: TheToolTable QR Studio\n%%BoundingBox: 0 0 ${Math.ceil(pt)} ${Math.ceil(pt)}\n%%HiResBoundingBox: 0 0 ${pt} ${pt}\n%%LanguageLevel: 2\n%%EndComments\ngsave\n`
  r.layers.forEach((l, i) => {
    if (transparent && i === 0 && r.style.bg.type === 'solid') return
    if (l.path.empty) return
    o += `newpath\n${l.path.ps(t)}\n${col(l.color)} setrgbcolor\n${l.eo ? 'eofill' : 'fill'}\n`
  })
  return o + 'grestore\nshowpage\n%%EOF\n'
}

/** scan-ability: verify with the real decoder + heuristics */
export function heuristics(r) {
  const s = r.style, i = r.info
  const D = s.dots
  const fgs = D.fill === 'gradient' ? [D.color, D.c2, ...(D.stops === 3 ? [D.c3] : [])] : D.fill === 'duo' ? [D.color, D.c2] : [D.color]
  let bgs = s.bg.type === 'gradient' ? [s.bg.color, s.bg.c2] : [s.bg.color]
  const noBg = s.bg.type === 'none'
  let minC = 21
  if (D.fill === 'image') minC = 3.4
  else if (!noBg) fgs.forEach((f) => bgs.forEach((b) => { minC = Math.min(minC, contrast(f, b)) }))
  else minC = 12
  const inverted = !noBg && D.fill !== 'image' && lum(D.color) > lum(s.bg.color)
  const dots = D.scale
  return { contrast: minC, inverted, logoPct: i.logoPct, ecc: i.ecc, version: i.version, margin: s.margin, dotScale: dots, imageBg: s.bg.type === 'image' || D.fill === 'image' }
}

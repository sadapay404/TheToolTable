import { zipSync, strToU8 } from 'fflate'

export const DEFAULTS = {
  mode: 'mono', text: 'T', font: 'Fraunces', weight: 700, symColor: '#FFFFFF', tint: false, tintColor: '#FFFFFF',
  bgType: 'gradient', bg1: '#C9856B', bg2: '#8A4A36', angle: 135, shape: 'rounded', radius: 22, pad: 20, offY: 0, name: 'My App', theme: '#B4715A',
}
export const SHAPES = [['rounded', 'Rounded'], ['squircle', 'Squircle'], ['circle', 'Circle'], ['square', 'Square']]
export const FONTS = [['Fraunces', 'Serif'], ['Inter', 'Sans'], ['Georgia', 'Classic'], ['"Courier New"', 'Mono'], ['"Arial Black", Impact', 'Heavy']]
export const PRESETS = [['#C9856B', '#8A4A36'], ['#1F2937', '#0B1220'], ['#2563EB', '#1E3A8A'], ['#10B981', '#065F46'], ['#F59E0B', '#B45309'], ['#EC4899', '#9D174D'], ['#8B5CF6', '#4C1D95'], ['#F5F1E8', '#E3DACB'], ['#111111', '#111111'], ['#FFFFFF', '#FFFFFF']]

export function normalizeIconOptions(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const clamp = (v, lo, hi, fallback) => Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : fallback
  const color = (v, fallback) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : fallback
  const text = typeof raw.text === 'string' ? [...raw.text].slice(0, 3).join('') : DEFAULTS.text
  const name = typeof raw.name === 'string' ? raw.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80) : DEFAULTS.name
  return {
    mode: ['mono', 'image'].includes(raw.mode) ? raw.mode : DEFAULTS.mode,
    text, font: FONTS.some(([id]) => id === raw.font) ? raw.font : DEFAULTS.font,
    weight: Math.round(clamp(raw.weight, 300, 900, DEFAULTS.weight) / 100) * 100,
    symColor: color(raw.symColor, DEFAULTS.symColor), tint: raw.tint === true,
    tintColor: color(raw.tintColor, DEFAULTS.tintColor),
    bgType: ['gradient', 'solid', 'none'].includes(raw.bgType) ? raw.bgType : DEFAULTS.bgType,
    bg1: color(raw.bg1, DEFAULTS.bg1), bg2: color(raw.bg2, DEFAULTS.bg2),
    angle: clamp(raw.angle, 0, 360, DEFAULTS.angle),
    shape: SHAPES.some(([id]) => id === raw.shape) ? raw.shape : DEFAULTS.shape,
    radius: clamp(raw.radius, 0, 50, DEFAULTS.radius), pad: clamp(raw.pad, 0, 40, DEFAULTS.pad),
    offY: clamp(raw.offY, -15, 15, DEFAULTS.offY), name,
    theme: color(raw.theme, DEFAULTS.theme),
  }
}

function squircle(ctx, S, n = 5) { ctx.beginPath(); const h = S / 2; for (let i = 0; i <= 160; i++) { const t = (i / 160) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), x = h + h * Math.sign(c) * Math.abs(c) ** (2 / n), y = h + h * Math.sign(s) * Math.abs(s) ** (2 / n); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) } ctx.closePath() }
function clipShape(ctx, S, shape, radius) {
  if (shape === 'square') { ctx.beginPath(); ctx.rect(0, 0, S, S) } else if (shape === 'circle') { ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2) } else if (shape === 'squircle') squircle(ctx, S)
  else { const r = (S * radius) / 100; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0, 0, S, S, r); else ctx.rect(0, 0, S, S) }
  ctx.clip()
}
function fillBg(ctx, S, o, opaque) {
  if (o.bgType === 'none') { if (opaque) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S) } return }
  if (o.bgType === 'solid') ctx.fillStyle = o.bg1
  else { const a = (o.angle * Math.PI) / 180, dx = Math.cos(a) * S / 2, dy = Math.sin(a) * S / 2, g = ctx.createLinearGradient(S / 2 - dx, S / 2 - dy, S / 2 + dx, S / 2 + dy); g.addColorStop(0, o.bg1); g.addColorStop(1, o.bg2); ctx.fillStyle = g }
  ctx.fillRect(0, 0, S, S)
}
let tmp
function tinted(img, w, h, color) { tmp ||= document.createElement('canvas'); tmp.width = w; tmp.height = h; const c = tmp.getContext('2d'); c.clearRect(0, 0, w, h); c.drawImage(img, 0, 0, w, h); c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over'; return tmp }
function symbol(ctx, S, o, img, padPct, scale = 1) {
  const area = S * scale * (1 - (padPct * 2) / 100), cx = S / 2, cy = S / 2 + (S * o.offY) / 100
  if (o.mode === 'image' && img) {
    const iw = img.naturalWidth || 1024, ih = img.naturalHeight || 1024, k = Math.min(area / iw, area / ih), w = iw * k, h = ih * k
    ctx.imageSmoothingQuality = 'high'
    if (o.tint) { const t = tinted(img, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), o.tintColor); ctx.drawImage(t, cx - w / 2, cy - h / 2, w, h) } else ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
  } else if (o.mode === 'mono') {
    const txt = (o.text || '').slice(0, 3) || ' ', fs0 = 100; ctx.font = `${o.weight} ${fs0}px ${o.font}, sans-serif`
    const w0 = ctx.measureText(txt).width, fs = fs0 * Math.min(area / Math.max(w0, 1), area / (fs0 * 0.72))
    ctx.font = `${o.weight} ${fs}px ${o.font}, sans-serif`; ctx.fillStyle = o.symColor; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    const m = ctx.measureText(txt), A = m.actualBoundingBoxAscent || fs * 0.7, D = m.actualBoundingBoxDescent || 0
    ctx.fillText(txt, cx, cy + (A - D) / 2)
  }
}
/** variant: 'full' (shape from settings) | 'square' | 'circle' | 'maskable' | 'foreground' | 'opaque' */
export function drawIcon(ctx, S, options, img, variant = 'full') {
  if (!ctx || !Number.isSafeInteger(S) || S < 1 || S > 2_048) throw new RangeError('Icon dimensions must be between 1 and 2,048 pixels.')
  const o = normalizeIconOptions(options)
  if (!['full', 'square', 'circle', 'maskable', 'foreground', 'opaque'].includes(variant)) variant = 'full'
  ctx.clearRect(0, 0, S, S); ctx.save()
  if (variant === 'foreground') { symbol(ctx, S, o, img, o.pad, 0.61); ctx.restore(); return }
  const shape = variant === 'circle' ? 'circle' : variant === 'square' || variant === 'maskable' || variant === 'opaque' ? 'square' : o.shape
  clipShape(ctx, S, shape, o.radius); fillBg(ctx, S, o, variant === 'opaque' || variant === 'maskable')
  symbol(ctx, S, o, img, variant === 'maskable' ? Math.max(o.pad, 20) : o.pad, 1)
  ctx.restore()
}
export const iconCanvas = (S, o, img, variant) => {
  if (!Number.isSafeInteger(S) || S < 1 || S > 2_048) throw new RangeError('Icon dimensions must be between 1 and 2,048 pixels.')
  const c = document.createElement('canvas'); c.width = c.height = S
  drawIcon(c.getContext('2d'), S, o, img, variant)
  return c
}
const png = async (S, o, img, v) => {
  const blob = await new Promise((resolve) => iconCanvas(S, o, img, v).toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The browser could not render an icon PNG.')
  return new Uint8Array(await blob.arrayBuffer())
}

export function makeIco(entries) { // [{size, bytes}]
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 256 || entries.some((e) => !Number.isInteger(e?.size) || e.size < 1 || e.size > 256 || !(e.bytes instanceof Uint8Array))) throw new TypeError('ICO entries are invalid.')
  const n = entries.length, head = new Uint8Array(6 + 16 * n), dv = new DataView(head.buffer); dv.setUint16(2, 1, true); dv.setUint16(4, n, true)
  let off = head.length; entries.forEach((e, i) => { const p = 6 + i * 16; head[p] = e.size >= 256 ? 0 : e.size; head[p + 1] = e.size >= 256 ? 0 : e.size; dv.setUint16(p + 4, 1, true); dv.setUint16(p + 6, 32, true); dv.setUint32(p + 8, e.bytes.length, true); dv.setUint32(p + 12, off, true); off += e.bytes.length })
  const out = new Uint8Array(off); out.set(head); let q = head.length; for (const e of entries) { out.set(e.bytes, q); q += e.bytes.length } return out
}
export function makeIcns(entries) { // [{type, bytes}]
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 256 || entries.some((e) => typeof e?.type !== 'string' || !/^[A-Za-z0-9]{4}$/.test(e.type) || !(e.bytes instanceof Uint8Array))) throw new TypeError('ICNS entries are invalid.')
  const total = 8 + entries.reduce((s, e) => s + 8 + e.bytes.length, 0)
  if (!Number.isSafeInteger(total) || total > 0xffffffff) throw new RangeError('ICNS file is too large.')
  const out = new Uint8Array(total), dv = new DataView(out.buffer); out.set([0x69, 0x63, 0x6e, 0x73]); dv.setUint32(4, total)
  let p = 8; for (const e of entries) { out.set(strToU8(e.type), p); dv.setUint32(p + 4, 8 + e.bytes.length); out.set(e.bytes, p + 8); p += 8 + e.bytes.length } return out
}

export const PACKS = [
  { id: 'web', name: 'Website & favicon', icon: 'globe', note: 'favicon.ico, PNGs, Apple touch icon, manifest and the HTML to paste' },
  { id: 'pwa', name: 'Installable web app', icon: 'phone', note: 'Standard and maskable icons from 72 to 512 px plus manifest entries' },
  { id: 'android', name: 'Android', icon: 'box', note: 'Launcher, round and adaptive icons for every density, Play Store 512' },
  { id: 'ios', name: 'iPhone & iPad', icon: 'phone', note: 'Complete AppIcon.appiconset with Contents.json and the 1024 App Store icon' },
  { id: 'desktop', name: 'Windows, macOS & Tauri', icon: 'monitor', note: 'icon.ico, icon.icns, Store tiles and the Tauri icons folder' },
]
const AND = [['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]]
const IOS = [[20, 2, 'iphone'], [20, 3, 'iphone'], [29, 2, 'iphone'], [29, 3, 'iphone'], [40, 2, 'iphone'], [40, 3, 'iphone'], [60, 2, 'iphone'], [60, 3, 'iphone'], [20, 1, 'ipad'], [20, 2, 'ipad'], [29, 1, 'ipad'], [29, 2, 'ipad'], [40, 1, 'ipad'], [40, 2, 'ipad'], [76, 1, 'ipad'], [76, 2, 'ipad'], [83.5, 2, 'ipad']]
const hex6 = (h) => h.replace('#', '').toUpperCase()

export async function buildPack(id, options, img) {
  if (!PACKS.some((pack) => pack.id === id)) throw new TypeError('Choose a supported icon pack.')
  const o = normalizeIconOptions(options), f = {}, name = o.name || 'App', P = (S, v) => png(S, o, img, v)
  if (id === 'web') {
    const s16 = await P(16), s32 = await P(32), s48 = await P(48)
    f['favicon.ico'] = makeIco([{ size: 16, bytes: s16 }, { size: 32, bytes: s32 }, { size: 48, bytes: s48 }]); f['favicon-16x16.png'] = s16; f['favicon-32x32.png'] = s32
    f['apple-touch-icon.png'] = await P(180, 'opaque'); f['android-chrome-192x192.png'] = await P(192); f['android-chrome-512x512.png'] = await P(512)
    f['site.webmanifest'] = strToU8(JSON.stringify({ name, short_name: name.slice(0, 12), icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }, { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }], theme_color: o.theme, background_color: '#ffffff', display: 'standalone' }, null, 2))
    f['paste-into-head.html'] = strToU8(`<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n<meta name="theme-color" content="${o.theme}">\n`)
  } else if (id === 'pwa') {
    for (const S of [72, 96, 128, 144, 152, 192, 384, 512]) f[`icons/icon-${S}.png`] = await P(S)
    f['icons/maskable-192.png'] = await P(192, 'maskable'); f['icons/maskable-512.png'] = await P(512, 'maskable')
    f['manifest-icons.json'] = strToU8(JSON.stringify({ icons: [...[72, 96, 128, 144, 152, 192, 384, 512].map((S) => ({ src: `icons/icon-${S}.png`, sizes: `${S}x${S}`, type: 'image/png', purpose: 'any' })), ...[192, 512].map((S) => ({ src: `icons/maskable-${S}.png`, sizes: `${S}x${S}`, type: 'image/png', purpose: 'maskable' }))] }, null, 2))
  } else if (id === 'android') {
    for (const [d, s, fg] of AND) { f[`res/mipmap-${d}/ic_launcher.png`] = await P(s); f[`res/mipmap-${d}/ic_launcher_round.png`] = await P(s, 'circle'); f[`res/mipmap-${d}/ic_launcher_foreground.png`] = await P(fg, 'foreground') }
    const ad = (r) => `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`
    f['res/mipmap-anydpi-v26/ic_launcher.xml'] = strToU8(ad()); f['res/mipmap-anydpi-v26/ic_launcher_round.xml'] = strToU8(ad())
    f['res/values/ic_launcher_background.xml'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#${hex6(o.bgType === 'none' ? '#FFFFFF' : o.bg1)}</color>\n</resources>\n`)
    f['playstore-icon.png'] = await P(512, 'opaque')
  } else if (id === 'ios') {
    const px = new Map(), images = []
    for (const [s, sc, idiom] of IOS) { const p = Math.round(s * sc); if (!px.has(p)) px.set(p, await P(p, 'opaque')); images.push({ size: `${s}x${s}`, idiom, filename: `icon-${p}.png`, scale: `${sc}x` }) }
    px.set(1024, await P(1024, 'opaque')); images.push({ size: '1024x1024', idiom: 'ios-marketing', filename: 'icon-1024.png', scale: '1x' })
    for (const [p, b] of px) f[`AppIcon.appiconset/icon-${p}.png`] = b
    f['AppIcon.appiconset/Contents.json'] = strToU8(JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2))
  } else if (id === 'desktop') {
    const ico = []; for (const S of [16, 24, 32, 48, 64, 128, 256]) ico.push({ size: S, bytes: await P(S) })
    const ib = makeIco(ico); f['windows/icon.ico'] = ib
    for (const [n, S] of [['Square44x44Logo', 44], ['Square71x71Logo', 71], ['Square150x150Logo', 150], ['Square310x310Logo', 310], ['StoreLogo', 50]]) f[`windows/${n}.png`] = await P(S)
    const cm = {}; for (const S of [16, 32, 64, 128, 256, 512, 1024]) cm[S] = await P(S)
    const set = [['16x16', 16], ['16x16@2x', 32], ['32x32', 32], ['32x32@2x', 64], ['128x128', 128], ['128x128@2x', 256], ['256x256', 256], ['256x256@2x', 512], ['512x512', 512], ['512x512@2x', 1024]]
    for (const [n, S] of set) f[`macos/AppIcon.iconset/icon_${n}.png`] = cm[S]
    const icns = makeIcns([['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic13', 256], ['ic08', 256], ['ic14', 512], ['ic09', 512], ['ic10', 1024]].map(([type, S]) => ({ type, bytes: cm[S] })))
    f['macos/icon.icns'] = icns
    f['tauri-icons/32x32.png'] = cm[32]; f['tauri-icons/128x128.png'] = cm[128]; f['tauri-icons/128x128@2x.png'] = cm[256]; f['tauri-icons/icon.png'] = cm[512]; f['tauri-icons/icon.ico'] = ib; f['tauri-icons/icon.icns'] = icns
  }
  return f
}
export const zipOf = (files, level = 0) => new Blob([zipSync(files, { level })], { type: 'application/zip' })

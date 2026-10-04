/* Colour helpers — hex ⇄ sRGB ⇄ OKLab/OKLCH, palette harmonies, k-means palette from an image. */
export const clamp01 = (v) => Math.min(1, Math.max(0, v))
export function hexToRgb(h) {
  let s = String(h || '#000').replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  const n = parseInt(s.slice(0, 6), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
const s2l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const l2s = (c) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055)
export function hexToLab(h) {
  const [R, G, B] = hexToRgb(h).map(s2l)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
export function labToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return rgbToHex(l2s(r), l2s(g), l2s(bl))
}
export const hexToLch = (h) => { const [L, a, b] = hexToLab(h); return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360] }
export const lchToHex = (L, C, H) => { const r = (H * Math.PI) / 180; return labToHex([L, C * Math.cos(r), C * Math.sin(r)]) }
export function lumOf(hex) { const [r, g, b] = hexToRgb(hex).map(s2l); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
export const labFlat = (pal) => { const a = new Float32Array(24); pal.slice(0, 8).forEach((h, i) => a.set(hexToLab(h), i * 3)); return a }
/** safe gamut clip: reduce chroma until the colour fits sRGB */
function fit(L, C, H) { let c = C; for (let i = 0; i < 24; i++) { const r = (H * Math.PI) / 180, a = c * Math.cos(r), b = c * Math.sin(r)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, gg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  if (rr >= -0.001 && rr <= 1.001 && gg >= -0.001 && gg <= 1.001 && bb >= -0.001 && bb <= 1.001) break; c *= 0.93 } return lchToHex(L, c, H) }

export const HARMONIES = [['analogous', 'Analogous'], ['mono', 'Monochrome'], ['complement', 'Complement'], ['split', 'Split'], ['triad', 'Triad'], ['tetrad', 'Tetrad']]
/** build a palette (dark → light) from a base hex using a harmony rule */
export function harmony(base, kind, n = 5) {
  const [L0, C0, H0] = hexToLch(base); const C = Math.max(0.06, Math.min(0.2, C0 || 0.12))
  const hues = { analogous: [-40, -20, 0, 20, 40], mono: [0, 0, 0, 0, 0], complement: [0, 0, 180, 180, 0], split: [0, 150, 210, 0, 150], triad: [0, 120, 240, 0, 120], tetrad: [0, 90, 180, 270, 0] }[kind] || [0, 0, 0, 0, 0]
  const out = []
  for (let i = 0; i < n; i++) { const t = i / Math.max(1, n - 1); const L = 0.2 + t * 0.7; const h = H0 + hues[i % hues.length] + (kind === 'analogous' ? (t - 0.5) * 10 : 0)
    out.push(fit(L, C * (1 - Math.abs(t - 0.5) * 0.5), (h + 360) % 360)) }
  return out
}
/** k-means palette from an image element/bitmap — returns hex colours sorted dark → light */
export function paletteFromImage(img, k = 5) {
  const S = 64, c = document.createElement('canvas'); c.width = S; c.height = S
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, S, S)
  const d = x.getImageData(0, 0, S, S).data, pts = []
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) pts.push(hexToLab(rgbToHex(d[i], d[i + 1], d[i + 2])))
  if (!pts.length) return null
  let cen = Array.from({ length: k }, (_, i) => pts[Math.floor(((i + 0.5) / k) * pts.length)].slice())
  for (let it = 0; it < 10; it++) {
    const sum = cen.map(() => [0, 0, 0, 0])
    for (const p of pts) { let bi = 0, bd = 1e9; cen.forEach((q, i) => { const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < bd) { bd = dd; bi = i } }); const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++ }
    cen = cen.map((q, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : q))
  }
  return cen.sort((a, b) => a[0] - b[0]).map(labToHex)
}

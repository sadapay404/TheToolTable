/** ImagePlayer Studio — parameter model, per-section groups and the preset library. */

export const HSL_CHANNELS = [
  { id: 'red', label: 'Red', hue: 0 },
  { id: 'orange', label: 'Orange', hue: 28 },
  { id: 'yellow', label: 'Yellow', hue: 55 },
  { id: 'green', label: 'Green', hue: 120 },
  { id: 'aqua', label: 'Aqua', hue: 180 },
  { id: 'blue', label: 'Blue', hue: 225 },
  { id: 'purple', label: 'Purple', hue: 275 },
  { id: 'magenta', label: 'Magenta', hue: 320 },
]

const hslKeys = HSL_CHANNELS.flatMap((c) => [`${c.id}_h`, `${c.id}_s`, `${c.id}_l`])

export const DEFAULTS = {
  // light
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  // color
  temp: 0, tint: 0, sat: 0, vib: 0, fade: 0, hue: 0,
  // per-colour mixer
  ...Object.fromEntries(hslKeys.map((k) => [k, 0])),
  // grading wheels
  gsH: 220, gsA: 0, gmH: 40, gmA: 0, ghH: 40, ghA: 0, gBlend: 50, gBal: 0,
  // effects
  sharpen: 0, blur: 0, vig: 0, vigFeather: 50, grain: 0, glow: 0, chroma: 0, pixel: 0,
  poster: 0, sepia: 0, mono: 0, invert: 0, duo: 0, duoA: 250, duoB: 40,
  // transform
  rot: 0, flipH: 0, flipV: 0, angle: 0, cx: 0, cy: 0, cw: 1, ch: 1,
}

export const TRANSFORM_KEYS = ['rot', 'flipH', 'flipV', 'angle', 'cx', 'cy', 'cw', 'ch']
export const transformOf = (p) => Object.fromEntries(TRANSFORM_KEYS.map((k) => [k, p[k]]))

/** Keys that belong to each inspector section — used for per-section reset + "modified" dots. */
export const SECTION_KEYS = {
  light: ['exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'],
  color: ['temp', 'tint', 'sat', 'vib', 'fade', 'hue'],
  mixer: hslKeys,
  grade: ['gsA', 'gmA', 'ghA', 'gBlend', 'gBal', 'gsH', 'gmH', 'ghH'],
  fx: ['sharpen', 'blur', 'vig', 'vigFeather', 'grain', 'glow', 'chroma', 'pixel', 'poster', 'sepia', 'mono', 'invert', 'duo', 'duoA', 'duoB'],
  crop: TRANSFORM_KEYS,
}

export const isModified = (p, section) => SECTION_KEYS[section]?.some((k) => p[k] !== DEFAULTS[k]) || false

/** Look = everything except geometry. */
export function applyLook(current, look) {
  const base = { ...DEFAULTS, ...transformOf(current) }
  return { ...base, ...look }
}

export const PRESET_CATS = ['All', 'Clean', 'Cinematic', 'Vintage', 'Black & White', 'Creative']

const L = (id, name, cat, p) => ({ id, name, cat, p })

export const PRESETS = [
  // ---- Clean
  L('fresh', 'Fresh', 'Clean', { exposure: 0.15, contrast: 8, vib: 30, sat: 6, temp: -4, highlights: -10, shadows: 14 }),
  L('crisp', 'Crisp', 'Clean', { contrast: 22, sharpen: 45, vib: 14, blacks: -8, whites: 8, shadows: 10 }),
  L('soft-glow', 'Soft Glow', 'Clean', { glow: 45, contrast: -10, fade: 10, highlights: -12, temp: 6, blur: 6 }),
  L('airy', 'Airy', 'Clean', { exposure: 0.35, contrast: -12, shadows: 34, fade: 12, sat: -6, temp: -2, whites: 12 }),
  L('punch', 'Punch', 'Clean', { contrast: 28, sat: 22, vib: 30, blacks: -14, shadows: -6 }),
  L('hdr-pop', 'HDR Pop', 'Clean', { contrast: 18, highlights: -40, shadows: 45, sharpen: 55, vib: 35, blacks: -10, whites: 12 }),
  // ---- Cinematic
  L('teal-orange', 'Teal & Orange', 'Cinematic', { contrast: 18, sat: 4, gsH: 195, gsA: 55, ghH: 30, ghA: 55, gBlend: 60, orange_s: 15, blue_h: -8, shadows: -8 }),
  L('blockbuster', 'Blockbuster', 'Cinematic', { contrast: 30, blacks: -18, vig: 30, gsH: 200, gsA: 40, ghH: 35, ghA: 35, sat: -8, highlights: -14 }),
  L('noir-teal', 'Noir Teal', 'Cinematic', { sat: -30, contrast: 24, gsH: 190, gsA: 60, gmH: 180, gmA: 20, vig: 35, exposure: -0.15, grain: 20 }),
  L('amber-dusk', 'Amber Dusk', 'Cinematic', { temp: 35, tint: 6, exposure: -0.1, contrast: 16, ghH: 38, ghA: 60, gsH: 20, gsA: 25, vig: 25, sat: 6, orange_s: 20, yellow_l: 8 }),
  L('moonlight', 'Moonlight', 'Cinematic', { temp: -35, exposure: -0.35, contrast: 14, gsH: 230, gsA: 55, gmH: 215, gmA: 25, vig: 30, sat: -12, blue_l: 10 }),
  L('cold-steel', 'Cold Steel', 'Cinematic', { temp: -22, sat: -28, contrast: 26, tint: -4, ghH: 200, ghA: 25, sharpen: 30, blacks: -10 }),
  // ---- Vintage
  L('kodak-gold', 'Kodak Gold', 'Vintage', { temp: 22, tint: 4, contrast: 10, fade: 14, sat: 8, ghH: 45, ghA: 30, gsH: 25, gsA: 18, grain: 22, vig: 12, yellow_s: 14 }),
  L('polaroid', 'Polaroid', 'Vintage', { fade: 30, contrast: -8, temp: 10, tint: 8, sat: -12, exposure: 0.1, gsH: 170, gsA: 25, ghH: 40, ghA: 35, vig: 20, grain: 14, blacks: 12 }),
  L('seventies', '70s Film', 'Vintage', { temp: 28, sat: -10, fade: 24, contrast: 6, gsH: 15, gsA: 35, ghH: 50, ghA: 35, grain: 30, vig: 28, red_s: 12, green_h: -14, green_s: -18 }),
  L('sepia', 'Sepia', 'Vintage', { sepia: 85, contrast: 8, vig: 22, grain: 14, fade: 10 }),
  L('cross', 'Cross Process', 'Vintage', { contrast: 28, sat: 22, gsH: 150, gsA: 45, ghH: 50, ghA: 55, gBlend: 60, tint: -8, temp: -6 }),
  L('lomo', 'Lomo', 'Vintage', { contrast: 30, sat: 30, vig: 55, vigFeather: 35, chroma: 20, gsH: 260, gsA: 25, grain: 20, exposure: -0.05 }),
  // ---- Black & White
  L('bw-classic', 'Classic B&W', 'Black & White', { mono: 100, contrast: 16, grain: 12 }),
  L('bw-noir', 'Hard Noir', 'Black & White', { mono: 100, contrast: 55, blacks: -25, whites: 18, vig: 40, grain: 35, shadows: -10 }),
  L('bw-silver', 'Silver Soft', 'Black & White', { mono: 100, contrast: -6, fade: 14, highlights: -12, shadows: 20, glow: 15 }),
  L('bw-matte', 'Matte Mono', 'Black & White', { mono: 100, fade: 34, contrast: 6, blacks: 14, grain: 18 }),
  // ---- Creative
  L('neon', 'Neon Night', 'Creative', { contrast: 24, sat: 30, vib: 30, gsH: 280, gsA: 60, ghH: 180, ghA: 50, glow: 40, chroma: 14, exposure: -0.1, blue_s: 20, magenta_s: 25 }),
  L('dreamy', 'Dreamy Pink', 'Creative', { exposure: 0.2, temp: 8, tint: 22, fade: 20, glow: 40, sat: -4, ghH: 330, ghA: 40, gmH: 340, gmA: 20, contrast: -8, red_h: 6, magenta_l: 8 }),
  L('forest', 'Forest', 'Creative', { temp: -6, tint: -8, green_s: 35, green_h: -10, yellow_h: -12, contrast: 14, vig: 20, vib: 20, gsH: 150, gsA: 30, shadows: -6 }),
  L('desert', 'Desert Heat', 'Creative', { temp: 38, sat: 12, contrast: 16, orange_s: 25, red_h: 8, yellow_h: -8, blue_s: -30, ghH: 40, ghA: 50, vig: 18 }),
  L('cyberpunk', 'Cyberpunk', 'Creative', { contrast: 30, sat: 28, gsH: 260, gsA: 65, ghH: 320, ghA: 55, gBlend: 70, glow: 30, chroma: 22, tint: 10, blue_s: 30, grain: 12 }),
  L('duo-sunset', 'Duotone Sunset', 'Creative', { duo: 100, duoA: 265, duoB: 25, contrast: 12, grain: 10 }),
  L('arctic', 'Arctic', 'Creative', { temp: -38, tint: -6, exposure: 0.2, sat: -18, contrast: 12, highlights: -10, ghH: 195, ghA: 35, aqua_s: 25, blue_l: 12 }),
  L('vapor', 'Vaporwave', 'Creative', { contrast: 14, sat: 18, gsH: 285, gsA: 60, ghH: 175, ghA: 50, gBlend: 65, fade: 18, glow: 25, tint: 16, chroma: 12 }),
  L('pop-art', 'Pop Art', 'Creative', { poster: 55, sat: 55, contrast: 35, vib: 40 }),
]

/** Aspect presets for the crop tool; value = w/h in pixels (null = free, 0 = original). */
export const ASPECTS = [
  ['Free', null], ['Original', 0], ['1:1', 1], ['4:5', 4 / 5], ['5:4', 5 / 4], ['3:2', 3 / 2], ['2:3', 2 / 3],
  ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16], ['21:9', 21 / 9],
]

export function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const f = (n) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
  return [f(0), f(8), f(4)]
}

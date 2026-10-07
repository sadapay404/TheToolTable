// Parameters, palettes, styles and whole-look presets for the Audio Visualizer Studio.

export const PALETTES = [
  { id: 'copper', name: 'Copper', c: ['#F0A877', '#C87941', '#7A3E22'], bg: ['#0E0B09', '#24170F'] },
  { id: 'aurora', name: 'Aurora', c: ['#6EF3C5', '#4FA8FF', '#B069FF'], bg: ['#05080F', '#0B1A33'] },
  { id: 'sunset', name: 'Sunset', c: ['#FFD36E', '#FF6B6B', '#8A3FFC'], bg: ['#1A0B1F', '#431338'] },
  { id: 'neon', name: 'Neon', c: ['#00F0FF', '#FF2BD6', '#F5FF3D'], bg: ['#07070D', '#160B2B'] },
  { id: 'ocean', name: 'Ocean', c: ['#B8F3FF', '#2DA8E0', '#0B4F9C'], bg: ['#03101C', '#073457'] },
  { id: 'mono', name: 'Mono', c: ['#FFFFFF', '#B5B5B5', '#666666'], bg: ['#050505', '#1A1A1A'] },
  { id: 'fire', name: 'Fire', c: ['#FFF1A8', '#FF8A1F', '#D62B1B'], bg: ['#120604', '#35100A'] },
  { id: 'candy', name: 'Candy', c: ['#FFB3E1', '#B79BFF', '#7CE0FF'], bg: ['#150B24', '#2E1C4F'] },
  { id: 'forest', name: 'Forest', c: ['#D8FF9E', '#53C27A', '#1E7F5C'], bg: ['#04100A', '#0C301F'] },
  { id: 'ice', name: 'Ice', c: ['#FFFFFF', '#BDE6FF', '#6FB6FF'], bg: ['#071223', '#10294A'] },
  { id: 'gold', name: 'Gold', c: ['#FFF2B0', '#E9B949', '#9A6B14'], bg: ['#0C0A06', '#271F0E'] },
  { id: 'vapor', name: 'Vapor', c: ['#FF71CE', '#01CDFE', '#B967FF'], bg: ['#0F0A1F', '#2A1352'] },
]
export const palette = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0]

export const STYLES = [
  ['bars', 'Equalizer', 'Classic bars'], ['mirror', 'Mirror', 'Symmetric bars'], ['radial', 'Radial', 'Spectrum ring'],
  ['ring', 'Pulse ring', 'Waveform loop'], ['wave', 'Fluid', 'Layered waves'], ['scope', 'Scope', 'Oscilloscope'],
  ['particles', 'Burst', 'Particles'], ['matrix', 'LED matrix', 'Dot grid'], ['area', 'Mountain', 'Filled spectrum'],
  ['orbits', 'Orbits', 'Spinning arcs'], ['spiral', 'Spiral', 'Galaxy arm'], ['ripples', 'Ripples', 'Beat shockwaves'],
  ['ridge', 'Ridgeline', 'Stacked history'], ['starfield', 'Warp', 'Starfield'], ['tunnel', 'Tunnel', 'Polygon depth'],
]

// which shape controls make sense per style, with per-style labels for the shared `bars` slider
export const STYLE_CONTROLS = {
  bars: ['bars', 'thick', 'round', 'peaks', 'reflect', 'mirror'], mirror: ['bars', 'thick', 'round', 'peaks'],
  radial: ['bars', 'thick', 'round', 'mirror'], ring: ['lineW'], wave: ['lineW', 'reflect'], scope: ['lineW'],
  particles: ['bars'], matrix: ['bars', 'thick', 'round'], area: ['lineW', 'reflect'], orbits: ['bars', 'thick', 'mirror'],
  spiral: ['lineW'], ripples: ['lineW'], ridge: ['lineW'], starfield: ['bars'], tunnel: ['sides', 'lineW', 'thick'],
}
export const BARS_LABEL = { particles: 'Particle count', starfield: 'Star count', orbits: 'Ring count', matrix: 'Columns', radial: 'Bar count', bars: 'Bar count', mirror: 'Bar count' }

export const FONTS = [
  ['fraunces', 'Fraunces', 'Fraunces, Georgia, serif', 600], ['inter', 'Inter', 'Inter, system-ui, sans-serif', 800],
  ['mono', 'Mono', 'ui-monospace, Menlo, Consolas, monospace', 700], ['serif', 'Georgia', 'Georgia, "Times New Roman", serif', 700],
  ['display', 'Heavy', '"Arial Black", Inter, system-ui, sans-serif', 900], ['light', 'Light', 'Inter, system-ui, sans-serif', 300],
]

export const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '21:9': [21, 9] }
export const RES = { '480p': 480, '720p': 720, '1080p': 1080, '1440p': 1440, '4K': 2160 }
export const exportDims = (ratio, res) => {
  const [rw, rh] = RATIOS[ratio], short = RES[res], e = (n) => Math.max(2, Math.round(n / 2) * 2)
  return rw >= rh ? [e(short * rw / rh), e(short)] : [e(short), e(short * rh / rw)]
}

const pal = palette('copper')
export const DEFAULTS = {
  style: 'bars',
  // shape
  bars: 64, thick: 0.62, round: 1, mirror: 0, peaks: 1, reflect: 1, lineW: 3, sides: 6,
  size: 1, vx: 0, vy: 0, rotation: 0, spin: 0,
  // colour
  palette: 'copper', c1: pal.c[0], c2: pal.c[1], c3: pal.c[2], cmode: 'gradient', cycle: 0.25, glow: 0.45, opacity: 1, reverse: 0,
  // backdrop
  bgType: 'gradient', bg1: pal.bg[0], bg2: pal.bg[1], bgDim: 0.5, bgBlur: 0, bgPulse: 0.4, vignette: 0.55, grain: 0.18,
  // text
  title: 'TheToolTable Session', subtitle: 'Made with TheToolTable', font: 'fraunces', titleSize: 1, tpos: 'top', talign: 'center', tanim: 'pulse',
  progress: 'line', showTime: 1, watermark: '',
  // cover art
  cover: 'off', coverSize: 0.5, coverPos: 'center', coverSpin: 1,
  // audio response + camera
  gain: 1.15, smooth: 0.55, fmin: 30, fmax: 12000, beatSens: 1, shake: 0.25, zoom: 0.35, flash: 0.15,
}
export const NUMERIC_KEYS = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === 'number')

const VIZ_RANGES = {
  bars: [16, 400], thick: [0.15, 1], round: [0, 1], mirror: [0, 1], peaks: [0, 1], reflect: [0, 1], lineW: [1, 12], sides: [3, 12],
  size: [0.4, 1.8], vx: [-50, 50], vy: [-50, 50], rotation: [-180, 180], spin: [-60, 60], cycle: [0, 2], glow: [0, 1.5], opacity: [0.1, 1], reverse: [0, 1],
  bgDim: [0, 0.9], bgBlur: [0, 40], bgPulse: [0, 1], vignette: [0, 1], grain: [0, 1], titleSize: [0.4, 2.2], showTime: [0, 1],
  coverSize: [0, 1], coverSpin: [0, 1], gain: [0.3, 3], smooth: [0, 0.95], fmin: [20, 400], fmax: [2000, 20000],
  beatSens: [0.3, 2], shake: [0, 1], zoom: [0, 1], flash: [0, 1],
}
const VIZ_INTEGERS = new Set(['bars', 'lineW', 'sides', 'round', 'mirror', 'peaks', 'reflect', 'reverse', 'showTime', 'coverSpin'])
const VIZ_ENUMS = {
  style: STYLES.map(([id]) => id), palette: ['custom', ...PALETTES.map((p) => p.id)], cmode: ['solid', 'gradient', 'amp', 'rainbow'],
  bgType: ['gradient', 'solid', 'aurora', 'stars', 'retro', 'image'], font: FONTS.map(([id]) => id),
  tpos: ['top', 'center', 'bottom'], talign: ['left', 'center', 'right'], tanim: ['none', 'pulse', 'float', 'type'],
  progress: ['line', 'pill', 'dots', 'none'], cover: ['off', 'circle', 'square'], coverPos: ['center', 'corner'],
}
const VIZ_COLORS = new Set(['c1', 'c2', 'c3', 'bg1', 'bg2'])
const VIZ_TEXT_LIMITS = { title: 180, subtitle: 180, watermark: 80 }

/** Sanitize only recognized, renderer-safe fields from imported or persisted data. */
export function sanitizeVizPatch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const clean = {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue
    const value = raw[key]
    if (Object.prototype.hasOwnProperty.call(VIZ_RANGES, key)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const [min, max] = VIZ_RANGES[key]
      const bounded = Math.min(max, Math.max(min, value))
      clean[key] = VIZ_INTEGERS.has(key) ? Math.round(bounded) : bounded
    } else if (Object.prototype.hasOwnProperty.call(VIZ_ENUMS, key)) {
      if (typeof value === 'string' && VIZ_ENUMS[key].includes(value)) clean[key] = value
    } else if (VIZ_COLORS.has(key)) {
      if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) clean[key] = value.toUpperCase()
    } else if (Object.prototype.hasOwnProperty.call(VIZ_TEXT_LIMITS, key)) {
      if (typeof value === 'string') clean[key] = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, VIZ_TEXT_LIMITS[key])
    }
  }
  return clean
}

export function sanitizeVizParams(raw) {
  const safe = { ...DEFAULTS, ...sanitizeVizPatch(raw) }
  // Uploaded artwork is not part of a saved look or browser storage.
  if (safe.bgType === 'image') safe.bgType = 'gradient'
  return safe
}

export function applyPalette(p, id) {
  const pl = palette(id)
  return { ...p, palette: id, c1: pl.c[0], c2: pl.c[1], c3: pl.c[2] }
}
export function matchBackdrop(p) {
  const pl = PALETTES.find((x) => x.id === p.palette)
  if (pl) return { ...p, bg1: pl.bg[0], bg2: pl.bg[1] }
  const dark = (h, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')
  return { ...p, bg1: dark(p.c3, 0.14), bg2: dark(p.c2, 0.3) }
}

// A "look" changes the style, not your words or your pictures.
export const KEEP = ['title', 'subtitle', 'watermark', 'cover', 'coverSize', 'coverPos', 'coverSpin', 'font', 'titleSize', 'tpos', 'talign', 'progress', 'showTime']
export function applyLook(cur, look) {
  const base = { ...DEFAULTS }
  KEEP.forEach((k) => { base[k] = cur[k] })
  let p = { ...base, ...look.p }
  if (look.p.palette && !look.p.c1) { p = applyPalette(p, look.p.palette); if (!look.p.bg1) p = matchBackdrop(p) }
  return p
}

const L = (id, name, p) => ({ id, name, p })
export const LOOKS = [
  L('copper-night', 'Copper Night', { style: 'bars', palette: 'copper', glow: 0.4 }),
  L('aurora-ring', 'Aurora Ring', { style: 'radial', palette: 'aurora', bgType: 'aurora', bars: 96, glow: 0.7, thick: 0.5, spin: 8 }),
  L('neon-arcade', 'Neon Arcade', { style: 'matrix', palette: 'neon', bgType: 'stars', bars: 96, round: 1, glow: 0.8, cmode: 'amp' }),
  L('synth-drive', 'Synth Drive', { style: 'mirror', palette: 'vapor', bgType: 'retro', bars: 80, glow: 0.8, thick: 0.55, vy: -4 }),
  L('lofi-hills', 'Lo-fi Hills', { style: 'area', palette: 'sunset', bgType: 'gradient', glow: 0.35, lineW: 4, reflect: 1 }),
  L('deep-ocean', 'Deep Ocean', { style: 'wave', palette: 'ocean', bgType: 'aurora', glow: 0.55, lineW: 3, cmode: 'gradient' }),
  L('fireworks', 'Fireworks', { style: 'particles', palette: 'fire', bgType: 'solid', bars: 220, glow: 0.9, cmode: 'amp', shake: 0.4 }),
  L('mono-scope', 'Mono Scope', { style: 'scope', palette: 'mono', bgType: 'solid', glow: 0.5, lineW: 3, grain: 0.3, cmode: 'solid' }),
  L('unknown-lines', 'Ridgeline', { style: 'ridge', palette: 'mono', bgType: 'solid', lineW: 2, glow: 0.2, cmode: 'solid', grain: 0.25, size: 1.05 }),
  L('warp-drive', 'Warp Drive', { style: 'starfield', palette: 'ice', bgType: 'gradient', bars: 340, glow: 0.7, zoom: 0.5 }),
  L('tunnel-vision', 'Tunnel Vision', { style: 'tunnel', palette: 'neon', bgType: 'solid', sides: 6, glow: 0.9, lineW: 3, spin: 12 }),
  L('golden-orbit', 'Golden Orbit', { style: 'orbits', palette: 'gold', bgType: 'gradient', bars: 90, glow: 0.6, thick: 0.45 }),
  L('galaxy-arm', 'Galaxy Arm', { style: 'spiral', palette: 'candy', bgType: 'stars', glow: 0.8, lineW: 3, spin: 6 }),
  L('heartbeat', 'Heartbeat', { style: 'ripples', palette: 'fire', bgType: 'gradient', glow: 0.8, lineW: 3, flash: 0.3 }),
  L('pulse-halo', 'Pulse Halo', { style: 'ring', palette: 'candy', bgType: 'aurora', glow: 0.8, lineW: 4, cmode: 'gradient' }),
  L('forest-eq', 'Forest EQ', { style: 'bars', palette: 'forest', bgType: 'gradient', bars: 48, round: 1, thick: 0.7, reflect: 1 }),
  L('ice-mirror', 'Ice Mirror', { style: 'mirror', palette: 'ice', bgType: 'gradient', bars: 100, thick: 0.4, glow: 0.6, cmode: 'amp' }),
  L('rainbow-rave', 'Rainbow Rave', { style: 'radial', palette: 'neon', bgType: 'solid', cmode: 'rainbow', bars: 120, glow: 0.8, cycle: 0.8, shake: 0.5, zoom: 0.5, flash: 0.3 }),
]

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const rnd = (a, b) => a + Math.random() * (b - a)
export function randomLook(cur) {
  const style = pick(STYLES)[0], pl = pick(PALETTES)
  let p = applyPalette({ ...cur }, pl.id)
  p = {
    ...p, style, cmode: pick(['gradient', 'gradient', 'amp', 'rainbow', 'solid']), bgType: pick(['gradient', 'aurora', 'stars', 'retro', 'solid']),
    bars: Math.round(rnd(32, 128)), thick: +rnd(0.35, 0.8).toFixed(2), round: Math.random() < 0.7 ? 1 : 0, mirror: Math.random() < 0.3 ? 1 : 0,
    lineW: Math.round(rnd(2, 6)), sides: Math.round(rnd(3, 8)), glow: +rnd(0.15, 0.9).toFixed(2), spin: Math.random() < 0.5 ? Math.round(rnd(-20, 20)) : 0,
    shake: +rnd(0, 0.5).toFixed(2), zoom: +rnd(0, 0.6).toFixed(2), flash: +rnd(0, 0.3).toFixed(2), cycle: +rnd(0, 0.7).toFixed(2), grain: +rnd(0, 0.35).toFixed(2),
    particlesBoost: undefined,
  }
  delete p.particlesBoost
  if (style === 'particles' || style === 'starfield') p.bars = Math.round(rnd(160, 340))
  if (style === 'matrix') p.bars = Math.round(rnd(60, 120))
  return matchBackdrop(p)
}

export const SECTION_KEYS = {
  style: ['style', 'bars', 'thick', 'round', 'mirror', 'peaks', 'reflect', 'lineW', 'sides', 'size', 'vx', 'vy', 'rotation', 'spin'],
  colour: ['palette', 'c1', 'c2', 'c3', 'cmode', 'cycle', 'glow', 'opacity', 'reverse'],
  backdrop: ['bgType', 'bg1', 'bg2', 'bgDim', 'bgBlur', 'bgPulse', 'vignette', 'grain'],
  text: ['title', 'subtitle', 'font', 'titleSize', 'tpos', 'talign', 'tanim', 'progress', 'showTime', 'watermark', 'cover', 'coverSize', 'coverPos', 'coverSpin'],
  motion: ['gain', 'smooth', 'fmin', 'fmax', 'beatSens', 'shake', 'zoom', 'flash'],
}

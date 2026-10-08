/**
 * Theme engine.
 *
 * Every theme is a flat map of CSS custom properties. `applyTheme()` writes them
 * onto :root and fills in the legacy aliases (`--bg`, `--surface2`, `--copper`, …)
 * that the existing components still read, so a theme only has to describe the
 * real design tokens.
 *
 * Material here is **Material 3 Expressive** — Google's 2025 update: a genuine
 * M3 tonal scheme (separate surface-container levels, state layers, outline
 * variants) in a saturated violet-indigo that is deliberately far from the warm
 * ivory of Creamy White.
 */

/* ------------------------------------------------------------------ Material 3 */

const md3Light = {
  /* primary — violet 40, chroma lifted above the M2-era baseline */
  '--primary': '#5B4BD6',
  '--on-primary': '#FFFFFF',
  '--primary-container': '#E5DEFF',
  '--on-primary-container': '#1B0964',
  /* secondary — muted violet-neutral */
  '--secondary': '#5D5C72',
  '--on-secondary': '#FFFFFF',
  '--secondary-container': '#E3E0F9',
  '--on-secondary-container': '#1A1A2C',
  /* tertiary — expressive pink accent */
  '--tertiary': '#9A4066',
  '--on-tertiary': '#FFFFFF',
  '--tertiary-container': '#FFD9E3',
  '--on-tertiary-container': '#3E001D',
  /* error */
  '--error': '#BA1A1A',
  '--on-error': '#FFFFFF',
  '--error-container': '#FFDAD6',
  '--on-error-container': '#410002',
  /* neutrals */
  '--surface': '#FCF8FF',
  '--on-surface': '#1B1B21',
  '--surface-variant': '#E4E1EC',
  '--on-surface-variant': '#47464F',
  '--outline': '#787680',
  '--outline-variant': '#C8C5D0',
  '--inverse-surface': '#303036',
  '--inverse-on-surface': '#F3EFF4',
  '--inverse-primary': '#C6BFFF',
  '--scrim': '#000000',
  '--surface-tint': '#5B4BD6',
  '--success': '#146C2E',
}

const md3Dark = {
  '--primary': '#C6BFFF',
  '--on-primary': '#2C1A80',
  '--primary-container': '#423191',
  '--on-primary-container': '#E5DEFF',
  '--secondary': '#C6C3DD',
  '--on-secondary': '#2E2F42',
  '--secondary-container': '#454559',
  '--on-secondary-container': '#E3E0F9',
  '--tertiary': '#FFB1C8',
  '--on-tertiary': '#63103B',
  '--tertiary-container': '#7D2A50',
  '--on-tertiary-container': '#FFD9E3',
  '--error': '#FFB4AB',
  '--on-error': '#690005',
  '--error-container': '#93000A',
  '--on-error-container': '#FFDAD6',
  '--surface': '#131318',
  '--on-surface': '#E5E1E9',
  '--surface-variant': '#47464F',
  '--on-surface-variant': '#C8C5D0',
  '--outline': '#928F9A',
  '--outline-variant': '#47464F',
  '--inverse-surface': '#E5E1E9',
  '--inverse-on-surface': '#303036',
  '--inverse-primary': '#5B4BD6',
  '--scrim': '#000000',
  '--surface-tint': '#C6BFFF',
  '--success': '#7ADF8E',
}

/* ---------------------------------------------------------------- Legacy themes */

const creamy = {
  '--bg': '#FDFBF7', '--surface': '#FFFFFF', '--surface2': '#F7F3EA', '--border': '#E6E1D6',
  '--ink': '#1A1817', '--muted': '#7A7267', '--accent': '#C87941', '--accent2': '#8A6D3B',
  '--glow': 'rgba(200,121,65,0.25)',
  '--shadow': '0 10px 30px -12px rgba(26,24,23,0.18), 0 2px 8px -2px rgba(26,24,23,0.08)',
  '--shadow-lg': '0 30px 60px -20px rgba(26,24,23,0.25), 0 8px 20px -8px rgba(26,24,23,0.12)',
  '--hero-a': '#F7EFE2', '--hero-b': '#FDE8D7',
}

const oled = {
  '--bg': '#000000', '--surface': '#0A0A0A', '--surface2': '#121212', '--border': '#1F1F1F',
  '--ink': '#FFFFFF', '--muted': '#8B8B8B', '--accent': '#FFFFFF', '--accent2': '#9E9E9E',
  '--glow': 'rgba(255,255,255,0.18)', '--shadow': '0 10px 30px -12px rgba(0,0,0,0.9)',
  '--shadow-lg': '0 30px 60px -20px rgba(0,0,0,0.95)', '--hero-a': '#0A0A0A', '--hero-b': '#111111',
}

const cyberpunk = {
  '--bg': '#0A0E17', '--surface': '#0E1420', '--surface2': '#131B2B', '--border': '#1E2A44',
  '--ink': '#E8F6FF', '--muted': '#6E7FA0', '--accent': '#FF0055', '--accent2': '#00F0FF',
  '--glow': 'rgba(0,240,255,0.35)',
  '--shadow': '0 10px 30px -12px rgba(0,240,255,0.25), 0 0 0 1px rgba(255,0,85,0.15)',
  '--shadow-lg': '0 30px 60px -20px rgba(255,0,85,0.35), 0 0 30px -5px rgba(0,240,255,0.25)',
  '--hero-a': '#12101F', '--hero-b': '#071A22',
}

const pastel = {
  '--bg': '#F3F0F8', '--surface': '#FBFAFE', '--surface2': '#ECE7F4', '--border': '#E0DAEA',
  '--ink': '#4A4458', '--muted': '#766F83', '--accent': '#7B61A8', '--accent2': '#567B67',
  '--glow': 'rgba(180,167,214,0.30)', '--shadow': '0 10px 28px -12px rgba(74,68,88,0.15)',
  '--shadow-lg': '0 28px 55px -20px rgba(74,68,88,0.20)', '--hero-a': '#EFE8F5', '--hero-b': '#E7F2EC',
}

const midnight = {
  '--bg': '#0B132B', '--surface': '#131C38', '--surface2': '#1C2541', '--border': '#27335A',
  '--ink': '#EAF2FF', '--muted': '#A8B4D3', '--accent': '#5BC0BE', '--accent2': '#6FFFE0',
  '--glow': 'rgba(91,192,190,0.35)', '--shadow': '0 10px 30px -12px rgba(0,0,0,0.5)',
  '--shadow-lg': '0 30px 60px -20px rgba(0,0,0,0.6), 0 0 30px -8px rgba(91,192,190,0.30)',
  '--hero-a': '#101A3C', '--hero-b': '#0A2233',
}

/* ------------------------------------------------------------------- Registry */

/** Authoring-time definitions. `THEMES` below is the resolved public registry. */
const RAW_THEMES = {
  material: { name: 'Material Expressive', vars: md3Light, dark: false, family: 'material', m3: true },
  'material-dark': { name: 'Material Dark', vars: md3Dark, dark: true, family: 'material', m3: true },
  creamy: { name: 'Creamy White', vars: creamy, dark: false, family: 'studio' },
  midnight: { name: 'Deep Midnight', vars: midnight, dark: true, family: 'studio' },
  cyberpunk: { name: 'Cyberpunk Neon', vars: cyberpunk, dark: true, family: 'studio' },
  pastel: { name: 'Pastel Minimal', vars: pastel, dark: false, family: 'studio' },
  oled: { name: 'Pure OLED', vars: oled, dark: true, family: 'studio' },
}

export const THEME_ORDER = ['material', 'material-dark', 'creamy', 'midnight', 'cyberpunk', 'pastel', 'oled']
export const THEME_GROUPS = [
  { id: 'material', label: 'Material 3 Expressive' },
  { id: 'studio', label: 'Studio' },
]
export const DEFAULT_THEME = 'material'

/**
 * `auto` follows the operating system light/dark setting the way stock Android
 * does. It is a *preference*, not a palette, so it resolves to a concrete theme.
 */
export const SYSTEM_THEME = 'auto'
export const THEME_CHOICES = [SYSTEM_THEME, ...THEME_ORDER]

export function systemPrefersDark() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

/** Turn a stored preference into the concrete theme that should be painted. */
export function resolveThemeId(id) {
  if (id === SYSTEM_THEME) return systemPrefersDark() ? 'material-dark' : 'material'
  return Object.hasOwn(THEMES, id) ? id : DEFAULT_THEME
}

/** Fallbacks that keep every legacy alias populated for the non-M3 themes. */
function materialise(vars, dark) {
  const primary = vars['--primary'] || vars['--accent']
  const accent = vars['--accent'] || primary
  const onSurface = vars['--on-surface'] || vars['--ink']
  const surface = vars['--surface'] || vars['--bg']
  const surface2 = vars['--surface2'] || vars['--surface-container'] || surface
  const container = vars['--primary-container'] || accent
  return {
    ...vars,
    '--bg': vars['--bg'] || surface,
    '--surface': surface,
    '--surface2': surface2,
    '--border': vars['--border'] || vars['--outline-variant'] || vars['--outline'],
    '--ink': onSurface,
    '--muted': vars['--muted'] || vars['--on-surface-variant'] || vars['--secondary'],
    '--accent': accent,
    '--accent2': vars['--accent2'] || vars['--secondary'] || accent,
    '--primary': primary,
    '--on-primary': vars['--on-primary'] || (dark ? '#111111' : '#FFFFFF'),
    '--primary-container': container,
    '--on-primary-container': vars['--on-primary-container'] || onSurface,
    '--secondary': vars['--secondary'] || vars['--accent2'] || accent,
    '--on-secondary': vars['--on-secondary'] || (dark ? '#111111' : '#FFFFFF'),
    '--secondary-container': vars['--secondary-container'] || surface2,
    '--on-secondary-container': vars['--on-secondary-container'] || onSurface,
    '--tertiary': vars['--tertiary'] || vars['--accent2'] || accent,
    '--on-tertiary': vars['--on-tertiary'] || (dark ? '#111111' : '#FFFFFF'),
    '--tertiary-container': vars['--tertiary-container'] || surface2,
    '--on-tertiary-container': vars['--on-tertiary-container'] || onSurface,
    '--error': vars['--error'] || '#B3261E',
    '--on-error': vars['--on-error'] || (dark ? '#601410' : '#FFFFFF'),
    '--error-container': vars['--error-container'] || '#F9DEDC',
    '--on-error-container': vars['--on-error-container'] || onSurface,
    '--outline': vars['--outline'] || vars['--border'],
    '--outline-variant': vars['--outline-variant'] || vars['--border'],
    '--success': vars['--success'] || '#2E7D32',
    '--scrim': vars['--scrim'] || '#000000',
    '--glow': vars['--glow'] || 'rgba(0,0,0,0.14)',
    '--hero-a': vars['--hero-a'] || surface2,
    '--hero-b': vars['--hero-b'] || container,
    '--copper': primary,
  }
}

/** Material 3 surface-container roles, derived from the base surface + tint. */
function surfaceContainers(merged, dark) {
  const surface = merged['--surface']
  const tint = merged['--surface-tint'] || merged['--primary']
  // M3 tints higher containers a little more toward the primary colour.
  const mix = (amount) => `color-mix(in srgb, ${tint} ${amount}%, ${surface})`
  return {
    '--surface-container-lowest': dark ? `color-mix(in srgb, #000 22%, ${surface})` : '#FFFFFF',
    '--surface-container-low': dark ? mix(4) : mix(4),
    '--surface-container': dark ? mix(8) : mix(6),
    '--surface-container-high': dark ? mix(13) : mix(10),
    '--surface-container-highest': dark ? mix(18) : mix(14),
  }
}

/** Build a fully resolved, alias-complete variable map for one theme definition. */
function buildVars(def) {
  const merged = materialise(def.vars, def.dark)
  return { ...merged, ...surfaceContainers(merged, def.dark) }
}

/**
 * Public registry. Every entry's `vars` is already resolved, so components that
 * read `THEMES[id].vars['--accent']` for a swatch always get a real colour.
 */
export const THEMES = Object.fromEntries(
  Object.entries(RAW_THEMES).map(([id, def]) => [id, { ...def, vars: buildVars(def) }]),
)

export function themeVars(id) {
  return THEMES[resolveThemeId(id)].vars
}

/** Display name for a preference, including the `auto` sentinel. */
export function themeLabel(id) {
  return id === SYSTEM_THEME ? 'Follow system' : THEMES[resolveThemeId(id)].name
}

/** Light/dark flag for a preference, including the `auto` sentinel. */
export function themeIsDark(id) {
  return THEMES[resolveThemeId(id)].dark
}

export function applyTheme(id) {
  const themeId = resolveThemeId(id)
  const vars = THEMES[themeId].vars
  const root = document.documentElement
  root.dataset.theme = themeId
  root.dataset.themeFamily = THEMES[themeId].family
  root.dataset.m3 = THEMES[themeId].m3 ? 'yes' : 'no'
  root.dataset.themePref = id === SYSTEM_THEME ? SYSTEM_THEME : 'fixed'
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  // Keep the browser chrome (address bar, Android status bar) in the theme colour.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', vars['--surface'] || '#FDFBF7')
  try { localStorage.setItem('ttt-theme', id) } catch { /* private mode */ }
}

export function savedTheme() {
  try {
    const id = localStorage.getItem('ttt-theme')
    if (!id) return SYSTEM_THEME
    return id === SYSTEM_THEME || Object.hasOwn(THEMES, id) ? id : DEFAULT_THEME
  } catch { return SYSTEM_THEME }
}

/** Re-paint when the OS flips light/dark while the app is open and set to auto. */
export function watchSystemTheme(onChange) {
  if (typeof matchMedia === 'undefined') return () => {}
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onChange?.(systemPrefersDark())
  mq.addEventListener?.('change', handler)
  return () => mq.removeEventListener?.('change', handler)
}
/* Theme definitions — the single source of truth for colours.
 *
 * IMPORTANT: every theme below is mirrored as an `html[data-theme="…"]` block in src/styles.css so
 * the very first paint is already in the remembered theme (no white flash before JavaScript runs).
 * `tests/unit.test.mjs` asserts the two stay in sync — change both together, or run
 * `npm run themes:css` to regenerate the CSS half.
 *
 * The "rememberer": the theme you pick is written to localStorage (`ttt-theme`), and you can star a
 * theme (`ttt-theme-fav`) to make it the one the app opens with every time, no matter what you
 * previewed last. `savedTheme()` resolves: favourite → last used → DEFAULT_THEME.
 */
export const DEFAULT_THEME = 'material'

export const THEMES = {
  material: {
    name: 'Material You',
    vars: {
      '--bg': '#FEF7FF',
      '--surface': '#FFFFFF',
      '--surface2': '#F3EDF7',
      '--border': '#CAC4D0',
      '--ink': '#1D1B20',
      '--muted': '#49454F',
      '--accent': '#6750A4',
      '--accent2': '#7D5260',
      '--copper': '#6750A4',
      '--glow': 'rgba(103, 80, 164, 0.24)',
      '--shadow': '0 1px 2px rgba(0, 0, 0, 0.10), 0 1px 3px 1px rgba(0, 0, 0, 0.06)',
      '--shadow-lg': '0 1px 3px rgba(0, 0, 0, 0.10), 0 4px 8px 3px rgba(0, 0, 0, 0.08)',
      '--hero-a': '#EADDFF',
      '--hero-b': '#FFD8E4',
    },
    dark: false,
  },
  creamy: {
    name: 'Creamy White',
    vars: {
      '--bg': '#FDFBF7',
      '--surface': '#FFFFFF',
      '--surface2': '#F7F3EA',
      '--border': '#E6E1D6',
      '--ink': '#1A1817',
      '--muted': '#7A7267',
      '--accent': '#C87941',
      '--accent2': '#8A6D3B',
      '--copper': '#B4715A',
      '--glow': 'rgba(200,121,65,0.25)',
      '--shadow': '0 10px 30px -12px rgba(26,24,23,0.18), 0 2px 8px -2px rgba(26,24,23,0.08)',
      '--shadow-lg': '0 30px 60px -20px rgba(26,24,23,0.25), 0 8px 20px -8px rgba(26,24,23,0.12)',
      '--hero-a': '#F7EFE2',
      '--hero-b': '#FDE8D7',
    },
    dark: false,
  },
  oled: {
    name: 'Pure OLED',
    vars: {
      '--bg': '#000000',
      '--surface': '#0A0A0A',
      '--surface2': '#121212',
      '--border': '#1F1F1F',
      '--ink': '#FFFFFF',
      '--muted': '#8B8B8B',
      '--accent': '#FFFFFF',
      '--accent2': '#9E9E9E',
      '--copper': '#D0D0D0',
      '--glow': 'rgba(255,255,255,0.18)',
      '--shadow': '0 10px 30px -12px rgba(0,0,0,0.9)',
      '--shadow-lg': '0 30px 60px -20px rgba(0,0,0,0.95)',
      '--hero-a': '#0A0A0A',
      '--hero-b': '#111111',
    },
    dark: true,
  },
  cyberpunk: {
    name: 'Cyberpunk Neon',
    vars: {
      '--bg': '#0A0E17',
      '--surface': '#0E1420',
      '--surface2': '#131B2B',
      '--border': '#1E2A44',
      '--ink': '#E8F6FF',
      '--muted': '#6E7FA0',
      '--accent': '#FF0055',
      '--accent2': '#00F0FF',
      '--copper': '#00F0FF',
      '--glow': 'rgba(0,240,255,0.35)',
      '--shadow': '0 10px 30px -12px rgba(0,240,255,0.25), 0 0 0 1px rgba(255,0,85,0.15)',
      '--shadow-lg': '0 30px 60px -20px rgba(255,0,85,0.35), 0 0 30px -5px rgba(0,240,255,0.25)',
      '--hero-a': '#12101F',
      '--hero-b': '#071A22',
    },
    dark: true,
  },
  pastel: {
    name: 'Pastel Minimal',
    vars: {
      '--bg': '#F3F0F8',
      '--surface': '#FBFAFE',
      '--surface2': '#ECE7F4',
      '--border': '#E0DAEA',
      '--ink': '#4A4458',
      '--muted': '#9A93A8',
      '--accent': '#B4A7D6',
      '--accent2': '#A8D5BA',
      '--copper': '#B4A7D6',
      '--glow': 'rgba(180,167,214,0.30)',
      '--shadow': '0 10px 28px -12px rgba(74,68,88,0.15)',
      '--shadow-lg': '0 28px 55px -20px rgba(74,68,88,0.20)',
      '--hero-a': '#EFE8F5',
      '--hero-b': '#E7F2EC',
    },
    dark: false,
  },
  midnight: {
    name: 'Deep Midnight',
    vars: {
      '--bg': '#0B132B',
      '--surface': '#131C38',
      '--surface2': '#1C2541',
      '--border': '#27335A',
      '--ink': '#EAF2FF',
      '--muted': '#7C89B0',
      '--accent': '#5BC0BE',
      '--accent2': '#6FFFE0',
      '--copper': '#5BC0BE',
      '--glow': 'rgba(91,192,190,0.35)',
      '--shadow': '0 10px 30px -12px rgba(0,0,0,0.5)',
      '--shadow-lg': '0 30px 60px -20px rgba(0,0,0,0.6), 0 0 30px -8px rgba(91,192,190,0.30)',
      '--hero-a': '#101A3C',
      '--hero-b': '#0A2233',
    },
    dark: true,
  },
}

/* Material first, then the classics. */
export const THEME_ORDER = ['material', 'creamy', 'oled', 'cyberpunk', 'pastel', 'midnight']

const KEY_LAST = 'ttt-theme'
const KEY_FAV = 'ttt-theme-fav'

const readKey = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const writeKey = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch {} }

/** Is `id` a theme we actually ship? */
export const hasTheme = (id) => Object.prototype.hasOwnProperty.call(THEMES, id)

/** The theme the user starred ("keep this one on restart"), if any. */
export function favouriteTheme() {
  const id = readKey(KEY_FAV)
  return hasTheme(id) ? id : null
}

/** Star / un-star a theme as the boot theme. */
export function setFavouriteTheme(id) {
  writeKey(KEY_FAV, hasTheme(id) ? id : null)
}

/** The theme the app should open with: favourite → last used → the default. */
export function savedTheme() {
  const fav = favouriteTheme()
  if (fav) return fav
  const last = readKey(KEY_LAST)
  return hasTheme(last) ? last : DEFAULT_THEME
}

/** Apply a theme everywhere: CSS variables, <html data-theme>, colour scheme, browser chrome. */
export function applyTheme(id) {
  const themeId = hasTheme(id) ? id : DEFAULT_THEME
  const t = THEMES[themeId]
  const root = document.documentElement
  root.dataset.theme = themeId
  Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  writeKey(KEY_LAST, themeId)
  try {
    root.style.colorScheme = t.dark ? 'dark' : 'light'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', t.vars['--bg'])
  } catch {}
  return themeId
}

/** Forget every theme choice — the honest "reset" for the rememberer. */
export function forgetTheme() {
  writeKey(KEY_LAST, null)
  writeKey(KEY_FAV, null)
}

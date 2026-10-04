export const THEMES = {
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
      '--glow': 'rgba(91,192,190,0.35)',
      '--shadow': '0 10px 30px -12px rgba(0,0,0,0.5)',
      '--shadow-lg': '0 30px 60px -20px rgba(0,0,0,0.6), 0 0 30px -8px rgba(91,192,190,0.30)',
      '--hero-a': '#101A3C',
      '--hero-b': '#0A2233',
    },
    dark: true,
  },
}

export const THEME_ORDER = ['creamy', 'oled', 'cyberpunk', 'pastel', 'midnight']

export function applyTheme(id) {
  const t = THEMES[id] || THEMES.creamy
  const root = document.documentElement
  root.dataset.theme = id
  Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  try { localStorage.setItem('ttt-theme', id) } catch {}
  try {
    root.style.colorScheme = t.dark ? 'dark' : 'light'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', t.vars['--bg'])
  } catch {}
}

export function savedTheme() {
  try { return localStorage.getItem('ttt-theme') || 'creamy' } catch { return 'creamy' }
}

const materialLight = {
  '--bg': '#FFFBFE',
  '--surface': '#FFFBFE',
  '--surface2': '#F4EFF7',
  '--border': '#CAC4D0',
  '--ink': '#1C1B1F',
  '--muted': '#49454F',
  '--accent': '#6750A4',
  '--accent2': '#625B71',
  '--primary': '#6750A4',
  '--on-primary': '#FFFFFF',
  '--primary-container': '#EADDFF',
  '--on-primary-container': '#21005D',
  '--secondary': '#625B71',
  '--on-secondary': '#FFFFFF',
  '--secondary-container': '#E8DEF8',
  '--tertiary': '#7D5260',
  '--tertiary-container': '#FFD8E4',
  '--error': '#B3261E',
  '--success': '#146C2E',
  '--outline': '#79747E',
  '--glow': 'rgba(103,80,164,0.18)',
  '--shadow': '0 1px 3px rgba(29,25,43,.12), 0 4px 12px rgba(29,25,43,.08)',
  '--shadow-lg': '0 2px 6px rgba(29,25,43,.14), 0 12px 28px rgba(29,25,43,.12)',
  '--hero-a': '#F4EFF7',
  '--hero-b': '#EADDFF',
}

const materialDark = {
  '--bg': '#141218',
  '--surface': '#1C1B1F',
  '--surface2': '#25232A',
  '--border': '#49454F',
  '--ink': '#E6E1E5',
  '--muted': '#CAC4D0',
  '--accent': '#D0BCFF',
  '--accent2': '#CCC2DC',
  '--primary': '#D0BCFF',
  '--on-primary': '#381E72',
  '--primary-container': '#4F378B',
  '--on-primary-container': '#EADDFF',
  '--secondary': '#CCC2DC',
  '--on-secondary': '#332D41',
  '--secondary-container': '#4A4458',
  '--tertiary': '#EFB8C8',
  '--tertiary-container': '#633B48',
  '--error': '#F2B8B5',
  '--success': '#8BD69A',
  '--outline': '#938F99',
  '--glow': 'rgba(208,188,255,0.18)',
  '--shadow': '0 1px 3px rgba(0,0,0,.32), 0 4px 12px rgba(0,0,0,.2)',
  '--shadow-lg': '0 2px 6px rgba(0,0,0,.38), 0 12px 28px rgba(0,0,0,.3)',
  '--hero-a': '#211F26',
  '--hero-b': '#2B2540',
}

export const THEMES = {
  material: { name: 'Material You', vars: materialLight, dark: false },
  'material-dark': { name: 'Material You Dark', vars: materialDark, dark: true },
  creamy: {
    name: 'Creamy White',
    vars: {
      '--bg': '#FDFBF7', '--surface': '#FFFFFF', '--surface2': '#F7F3EA', '--border': '#E6E1D6',
      '--ink': '#1A1817', '--muted': '#7A7267', '--accent': '#C87941', '--accent2': '#8A6D3B',
      '--glow': 'rgba(200,121,65,0.25)', '--shadow': '0 10px 30px -12px rgba(26,24,23,0.18), 0 2px 8px -2px rgba(26,24,23,0.08)',
      '--shadow-lg': '0 30px 60px -20px rgba(26,24,23,0.25), 0 8px 20px -8px rgba(26,24,23,0.12)',
      '--hero-a': '#F7EFE2', '--hero-b': '#FDE8D7',
    },
    dark: false,
  },
  oled: {
    name: 'Pure OLED',
    vars: {
      '--bg': '#000000', '--surface': '#0A0A0A', '--surface2': '#121212', '--border': '#1F1F1F',
      '--ink': '#FFFFFF', '--muted': '#8B8B8B', '--accent': '#FFFFFF', '--accent2': '#9E9E9E',
      '--glow': 'rgba(255,255,255,0.18)', '--shadow': '0 10px 30px -12px rgba(0,0,0,0.9)',
      '--shadow-lg': '0 30px 60px -20px rgba(0,0,0,0.95)', '--hero-a': '#0A0A0A', '--hero-b': '#111111',
    },
    dark: true,
  },
  cyberpunk: {
    name: 'Cyberpunk Neon',
    vars: {
      '--bg': '#0A0E17', '--surface': '#0E1420', '--surface2': '#131B2B', '--border': '#1E2A44',
      '--ink': '#E8F6FF', '--muted': '#6E7FA0', '--accent': '#FF0055', '--accent2': '#00F0FF',
      '--glow': 'rgba(0,240,255,0.35)', '--shadow': '0 10px 30px -12px rgba(0,240,255,0.25), 0 0 0 1px rgba(255,0,85,0.15)',
      '--shadow-lg': '0 30px 60px -20px rgba(255,0,85,0.35), 0 0 30px -5px rgba(0,240,255,0.25)',
      '--hero-a': '#12101F', '--hero-b': '#071A22',
    },
    dark: true,
  },
  pastel: {
    name: 'Pastel Minimal',
    vars: {
      '--bg': '#F3F0F8', '--surface': '#FBFAFE', '--surface2': '#ECE7F4', '--border': '#E0DAEA',
      '--ink': '#4A4458', '--muted': '#766F83', '--accent': '#7B61A8', '--accent2': '#567B67',
      '--glow': 'rgba(180,167,214,0.30)', '--shadow': '0 10px 28px -12px rgba(74,68,88,0.15)',
      '--shadow-lg': '0 28px 55px -20px rgba(74,68,88,0.20)', '--hero-a': '#EFE8F5', '--hero-b': '#E7F2EC',
    },
    dark: false,
  },
  midnight: {
    name: 'Deep Midnight',
    vars: {
      '--bg': '#0B132B', '--surface': '#131C38', '--surface2': '#1C2541', '--border': '#27335A',
      '--ink': '#EAF2FF', '--muted': '#A8B4D3', '--accent': '#5BC0BE', '--accent2': '#6FFFE0',
      '--glow': 'rgba(91,192,190,0.35)', '--shadow': '0 10px 30px -12px rgba(0,0,0,0.5)',
      '--shadow-lg': '0 30px 60px -20px rgba(0,0,0,0.6), 0 0 30px -8px rgba(91,192,190,0.30)',
      '--hero-a': '#101A3C', '--hero-b': '#0A2233',
    },
    dark: true,
  },
}

export const THEME_ORDER = ['material', 'material-dark', 'creamy', 'oled', 'cyberpunk', 'pastel', 'midnight']
export const DEFAULT_THEME = 'material'

export function applyTheme(id) {
  const themeId = Object.hasOwn(THEMES, id) ? id : DEFAULT_THEME
  const t = THEMES[themeId]
  const vars = {
    ...t.vars,
    '--primary': t.vars['--primary'] || t.vars['--accent'],
    '--on-primary': t.vars['--on-primary'] || (t.dark ? '#111111' : '#FFFFFF'),
    '--primary-container': t.vars['--primary-container'] || t.vars['--accent'],
    '--on-primary-container': t.vars['--on-primary-container'] || t.vars['--ink'],
    '--secondary': t.vars['--secondary'] || t.vars['--accent2'] || t.vars['--accent'],
    '--on-secondary': t.vars['--on-secondary'] || (t.dark ? '#111111' : '#FFFFFF'),
    '--secondary-container': t.vars['--secondary-container'] || t.vars['--surface2'],
    '--tertiary': t.vars['--tertiary'] || t.vars['--accent2'] || t.vars['--accent'],
    '--tertiary-container': t.vars['--tertiary-container'] || t.vars['--surface2'],
    '--error': t.vars['--error'] || '#B3261E',
    '--success': t.vars['--success'] || '#2E7D32',
    '--outline': t.vars['--outline'] || t.vars['--border'],
    '--copper': t.vars['--primary'] || t.vars['--accent'],
  }
  const root = document.documentElement
  root.dataset.theme = themeId
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  try { localStorage.setItem('ttt-theme', themeId) } catch {}
}

export function savedTheme() {
  try {
    const id = localStorage.getItem('ttt-theme')
    // Earlier versions saved the default theme on first visit. Migrate that default to Material You.
    if (!id || id === 'creamy') return DEFAULT_THEME
    return Object.hasOwn(THEMES, id) ? id : DEFAULT_THEME
  } catch { return DEFAULT_THEME }
}

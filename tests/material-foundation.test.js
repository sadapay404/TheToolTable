import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computeInsets, estimateInsets, MIN_TOP, MAX_TOP, MAX_BOTTOM } from '../src/lib/safe-area.js'
import {
  THEMES, THEME_ORDER, THEME_CHOICES, DEFAULT_THEME, SYSTEM_THEME,
  themeVars, themeLabel, themeIsDark, resolveThemeId,
} from '../src/themes.js'

/* ------------------------------------------------------------------ safe area */

test('real env() insets are trusted on every platform', () => {
  const env = { top: 47, right: 0, bottom: 34, left: 0 }
  const out = computeInsets(env, { screenWidth: 412, screenHeight: 915, isAndroidNative: true })
  assert.equal(out.top, 47)
  assert.equal(out.bottom, 34)
  assert.equal(out.estimated, false)
})

test('an Android WebView reporting zero insets still reserves the status bar', () => {
  const env = { top: 0, right: 0, bottom: 0, left: 0 }
  const out = computeInsets(env, { screenWidth: 412, screenHeight: 915, isAndroidNative: true })
  // The punch-hole bug: zero insets used to put the header under the status bar.
  assert.ok(out.top >= MIN_TOP, `expected at least ${MIN_TOP}px of headroom, got ${out.top}`)
  assert.ok(out.top <= MAX_TOP)
  assert.ok(out.bottom > 0 && out.bottom <= MAX_BOTTOM)
  assert.equal(out.estimated, true)
})

test('a normal browser reporting zero insets keeps its chrome at zero', () => {
  const out = computeInsets({ top: 0, right: 0, bottom: 0, left: 0 }, { screenWidth: 1440, screenHeight: 900, isAndroidNative: false })
  assert.deepEqual([out.top, out.bottom, out.left, out.right], [0, 0, 0, 0])
})

test('status-bar fallback scales with the display and stays clamped', () => {
  const small = estimateInsets({ top: 0, right: 0, bottom: 0, left: 0 }, { screenWidth: 360, screenHeight: 640, isAndroidNative: true })
  const tall = estimateInsets({ top: 0, right: 0, bottom: 0, left: 0 }, { screenWidth: 412, screenHeight: 1400, isAndroidNative: true })
  assert.ok(tall.top >= small.top)
  assert.ok(tall.top <= MAX_TOP)
  assert.ok(small.top >= MIN_TOP)
})

test('an unknown screen size degrades to the minimum headroom instead of zero', () => {
  const out = estimateInsets({ top: 0, right: 0, bottom: 0, left: 0 }, { isAndroidNative: true })
  assert.equal(out.top, MIN_TOP)
})

test('a turned phone reserves the cutout on a side edge, not the top', () => {
  const env = { top: 0, right: 0, bottom: 0, left: 0 }
  const landscape = computeInsets(env, { screenWidth: 915, screenHeight: 412, isAndroidNative: true })
  assert.equal(landscape.top, 0, 'landscape must not waste vertical headroom')
  assert.ok(landscape.left >= MIN_TOP)
  assert.ok(landscape.right >= MIN_TOP)
  const portrait = computeInsets(env, { screenWidth: 412, screenHeight: 915, isAndroidNative: true })
  assert.ok(portrait.top >= MIN_TOP)
  assert.equal(portrait.left, 0)
})

/* -------------------------------------------------------------------- themes */

const REQUIRED_ALIASES = [
  '--bg', '--surface', '--surface2', '--border', '--ink', '--muted', '--accent', '--accent2',
  '--primary', '--on-primary', '--primary-container', '--on-primary-container',
  '--secondary', '--on-secondary', '--secondary-container', '--on-secondary-container',
  '--tertiary', '--tertiary-container', '--on-tertiary', '--on-tertiary-container',
  '--error', '--on-error', '--error-container', '--on-error-container',
  '--outline', '--outline-variant', '--success', '--scrim', '--glow',
  '--hero-a', '--hero-b', '--copper',
]

test('every registered theme resolves the full legacy alias set', () => {
  for (const id of THEME_ORDER) {
    const vars = themeVars(id)
    for (const key of REQUIRED_ALIASES) {
      assert.ok(typeof vars[key] === 'string' && vars[key].length > 0, `${id} is missing ${key}`)
    }
  }
})

test('Material 3 exposes the five surface-container roles', () => {
  for (const id of ['material', 'material-dark']) {
    const vars = themeVars(id)
    for (const key of [
      '--surface-container-lowest', '--surface-container-low', '--surface-container',
      '--surface-container-high', '--surface-container-highest',
    ]) {
      assert.ok(vars[key], `${id} is missing ${key}`)
    }
  }
})

test('Material reads as violet, not as another Creamy White', () => {
  const material = themeVars('material')
  const creamy = themeVars('creamy')
  assert.notEqual(material['--primary'], creamy['--primary'])
  assert.notEqual(material['--surface'], creamy['--surface'])
  assert.notEqual(material['--surface-container-low'], creamy['--surface-container-low'])
  // A violet keeps blue clearly above red; caramel/ivory does not.
  const channel = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  const [mr, mg, mb] = channel(material['--primary'])
  const [cr, cg, cb] = channel(creamy['--accent'])
  assert.ok(mb > mr, 'Material primary should be blue-dominant')
  assert.ok(cr > cb, 'Creamy accent should be red-dominant')
})

test('Material Dark is a genuinely dark scheme', () => {
  const light = themeVars('material')
  const dark = themeVars('material-dark')
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  assert.ok(luminance(dark['--surface']) < luminance(light['--surface']))
  assert.ok(luminance(dark['--surface']) < 60)
  assert.ok(luminance(light['--primary']) < 130)
})

test('an unknown or corrupt saved theme falls back to the default', () => {
  assert.equal(DEFAULT_THEME, 'material')
  assert.equal(THEMES[DEFAULT_THEME].family, 'material')
})

test('theme pickers can read swatch colours straight off the registry', () => {
  // ThemePicker / the mobile sheet / CommandPalette all do `THEMES[id].vars['--bg']`
  // directly. Those must be resolved at module load, not only inside applyTheme().
  for (const id of THEME_ORDER) {
    const { vars } = THEMES[id]
    for (const key of ['--bg', '--accent', '--primary', '--primary-container', '--ink']) {
      assert.equal(typeof vars[key], 'string', `${id}.vars.${key} must be a resolved string`)
      assert.ok(vars[key].length > 0, `${id}.vars.${key} must not be empty`)
    }
  }
})
/* --------------------------------------------------------------- auto theme */

test('the auto preference resolves to a concrete Material palette', () => {
  assert.equal(SYSTEM_THEME, 'auto')
  assert.ok(['material', 'material-dark'].includes(resolveThemeId(SYSTEM_THEME)))
  assert.equal(themeLabel(SYSTEM_THEME), 'Follow system')
  assert.equal(typeof themeIsDark(SYSTEM_THEME), 'boolean')
  assert.equal(themeVars(SYSTEM_THEME)['--primary'], THEMES[resolveThemeId(SYSTEM_THEME)].vars['--primary'])
})

test('auto is offered alongside every real theme', () => {
  assert.equal(THEME_CHOICES.length, THEME_ORDER.length + 1)
  assert.equal(THEME_CHOICES[0], SYSTEM_THEME)
  for (const id of THEME_ORDER) assert.ok(THEME_CHOICES.includes(id))
})

test('a corrupt saved preference resolves to the Material default', () => {
  assert.equal(resolveThemeId('nope-not-a-theme'), DEFAULT_THEME)
  assert.equal(themeLabel('nope-not-a-theme'), THEMES[DEFAULT_THEME].name)
})

test('the shell installs one system-theme listener, not duplicate repaint work', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const listeners = app.match(/useEffect\(\(\) => watchSystemTheme\(/g) || []
  assert.equal(listeners.length, 1,
    'each OS color-scheme change should repaint once; duplicate listeners waste work on Android')
})

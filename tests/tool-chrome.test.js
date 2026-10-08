import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

/* These files are JSX, so they are asserted structurally from source. */
const app = read('src/App.jsx')
const chrome = read('src/components/ToolChrome.jsx')
const ui = read('src/components/ui.jsx')
const icons = read('src/components/ToolIcon.jsx')
const parts = read('src/tools/exchange/parts.jsx')
const decision = read('src/tools/decision/parts.jsx')
const controls = read('src/tools/studio/controls.jsx')
const css = read('src/styles.css')
const registry = read('src/toolsRegistry.jsx')

const entries = [...registry.matchAll(/id:\s*'([a-z0-9]+)',\s*n:\s*(\d+),\s*name:\s*'([^']+)',\s*icon:\s*'([a-z0-9]+)',[\s\S]*?tag:\s*'([^']+)',\s*\n\s*desc:\s*'([^']+)'/g)]
  .map((m) => ({ id: m[1], n: m[2], name: m[3], icon: m[4], tag: m[5], desc: m[6] }))

/* ------------------------------------------------------------- the kit ---- */

test('the chrome kit exports every shared piece a tool needs', () => {
  for (const name of ['ToolShell', 'ToolIntro', 'ToolSection', 'ActionBar', 'ToolButton', 'EmptyState', 'TabsRail', 'ProgressRail', 'FactChip', 'SplitView']) {
    assert.ok(chrome.includes(`export function ${name}`), `ToolChrome.jsx must export ${name}`)
  }
})

test('every one of the twenty tools is wrapped in the shared shell and intro', () => {
  assert.ok(entries.length === 20, `registry parsed ${entries.length} tools`)
  assert.match(app, /<ToolShell>\s*<ToolIntro tool=\{active\} \/>\s*<ActiveComp \/>/, 'the shell + intro must wrap the active tool')
})

test('the intro is driven by the registry, so no tool needs a hand-written header', () => {
  assert.match(chrome, /tool\.name/)
  assert.match(chrome, /tool\.desc/)
  assert.match(chrome, /String\(tool\.tag/,'the tag chips are split from the registry tag')
  assert.match(chrome, /<ToolIcon name=\{tool\.icon\}/, 'the intro uses the tool glyph')
  entries.forEach((e) => {
    assert.ok(e.name && e.desc && e.tag, `${e.id} is missing intro copy`)
  })
})

test('the screen header is a breadcrumb and never repeats the intro', () => {
  assert.match(app, /The table <span aria-hidden="true">\/<\/span> Tool/)
  assert.doesNotMatch(app, /tool-screen-title[^>]*>\s*\{active\.name\}/, 'the name belongs to the intro band only')
})

/* ------------------------------------------------------------ dropzone ---- */

test('the drop target is the Material one and kept every capability it had', () => {
  assert.ok(ui.includes('export function Dropzone'))
  // file input, click, drag/drop, keyboard, live region
  for (const needle of ['type="file"', 'onClick={() => ref.current?.click()}', 'onDragOver', 'onDrop', 'onKeyDown', 'aria-live']) {
    assert.ok(ui.includes(needle), `dropzone lost "${needle}"`)
  }
  assert.match(ui, /e\.key === 'Enter'/, 'the drop target must be operable from the keyboard')
})

test('the drop target reacts to a file landing instead of just opening a picker', () => {
  assert.ok(ui.includes('data-hot'), 'the hot state drives the frame colour')
  assert.ok(ui.includes('landed'), 'it confirms the files it accepted')
  assert.match(ui, /tool-dropzone-cta/, 'it keeps a call to action')
})

test('the dashed frame is a real border so the dashes stay uniform', () => {
  assert.doesNotMatch(ui, /preserveAspectRatio="none"/, 'a stretched SVG stroke stretches its dashes')
  assert.match(css, /\.tool-dropzone-outline\s*\{[^}]*border:\s*2px dashed/, 'the frame must be a dashed border')
})

/* -------------------------------------------------------------- shared ---- */

test('the shared building blocks now use the one motion source', () => {
  for (const [name, src] of [['exchange/parts.jsx', parts], ['decision/parts.jsx', decision], ['studio/controls.jsx', controls]]) {
    assert.ok(src.includes('lib/motion.js'), `${name} must import the shared motion tokens`)
    assert.doesNotMatch(src, /const SPRING = \{ type: 'spring', stiffness: 300, damping: 25 \}/, `${name} still hard-codes its spring`)
  }
})

test('segmented controls use a shared-layout indicator that springs', () => {
  assert.ok(parts.includes('layoutId'), 'the segmented control needs a sliding indicator')
  assert.ok(parts.includes('MSPRING.snappy'))
  assert.match(parts, /tool-tab-indicator/, 'the indicator reuses the Material tab pill')
})

test('the primary action is a Material filled button with an ink ripple', () => {
  assert.match(decision, /tool-btn--filled/)
  assert.ok(decision.includes('useRipple'), 'the main action ripples like everything else')
  assert.match(css, /\.tool-btn--filled\s*\{[^}]*--primary/)
})

test('the switch follows the Material 3 sizes and shows a check when on', () => {
  assert.match(decision, /w-\[52px\] h-\[32px\]/, '52x32dp track')
  assert.match(decision, /width: on \? 24 : 16/, 'the thumb grows when selected')
  assert.match(decision, /DIco n="check"/, 'the selected thumb carries a check')
})

/* ---------------------------------------------------------------- glyphs -- */

test('the shell glyphs the chrome needs exist and are filled silhouettes', () => {
  for (const name of ['upload', 'file', 'image', 'check']) {
    assert.ok(new RegExp(`GLYPHS\\.${name}\\s*=`).test(icons), `missing glyph: ${name}`)
  }
  // Every glyph is painted with fill, so an open sub-path would render blank.
  const blocks = [...icons.matchAll(/GLYPHS\.(upload|file|image|check)\s*=\s*\[([\s\S]*?)\]/g)]
  blocks.forEach(([, name, body]) => {
    const paths = [...body.matchAll(/'([^']+)'/g)].map(([, d]) => d)
    assert.ok(paths.length > 0, `${name} has no path data`)
    paths.forEach((d) => {
      assert.match(d, /[zZ]\s*'?$/, `${name} has an unclosed sub-path: ${d}`)
    })
  })
})

/* ------------------------------------------------------------------ css --- */

test('every class the chrome renders has a rule', () => {
  const classes = [...chrome.matchAll(/className="([^"$]+)"/g)]
    .flatMap(([, v]) => v.split(/\s+/))
    .filter((c) => c.startsWith('tool-') && !c.includes('{'))
  const missing = [...new Set(classes)].filter((c) => !css.includes(`.${c}`))
  assert.deepEqual(missing, [], `classes with no style: ${missing.join(', ')}`)
})

test('the chrome shell clears the phone navigation bar', () => {
  const block = css.slice(css.indexOf('.tool-shell {'), css.indexOf('.tool-shell--wide'))
  assert.match(block, /padding-bottom:.*safe-area-inset-bottom/, 'the shell must clear the nav bar')
  assert.match(block, /78px/, 'and leave room for it')
})

test('reduced motion is honoured by every chrome loop', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tool-intro-glow/, 'the intro glow must stop')
  assert.match(chrome, /useReducedMotion\(\)/, 'entrance animations must be skipped')
})

test('nothing from parts 1-4 was removed by the chrome work', () => {
  for (const [needle, label] of [
    ['tool-dropzone', 'drop target'],
    ['md3-ripple', 'ink ripple'],
    ['ambient-field', 'ambient layer'],
    ['card-shine', 'card shine'],
    ['mobile-footer-marquee', 'footer ticker'],
    ['palette-pill', 'command palette pill'],
  ]) {
    assert.ok((css + app + ui + chrome).includes(needle), `${label} disappeared`)
  }
})
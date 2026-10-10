import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

/* JSX again: the footer is asserted structurally from source. */
const app = read('src/App.jsx')
const footer = read('src/components/Footer.jsx')
const mobile = read('src/components/MobileFooter.jsx')
const css = read('src/styles.css')

/* ------------------------------------------------------------ structure --- */

test('the shell mounts exactly one footer variant for the current breakpoint', () => {
  assert.ok(mobile.includes("export default function MobileFooter()"))
  assert.match(footer, /import MobileFooter from '\.\/MobileFooter\.jsx'/)
  assert.match(footer, /export default function Footer\(\{ isPhone = false \}\)/)
  assert.match(footer, /\{isPhone \? <MobileFooter \/> : <DesktopFooter \/>\}/, 'the inactive footer must not mount behind a CSS visibility class')
  assert.match(app, /<Footer isPhone=\{isPhone\} \/>/, 'the shell must provide its existing responsive state')
  assert.doesNotMatch(footer, /sm:hidden|hidden sm:block/, 'responsive CSS must not keep an inactive footer tree mounted')

  const desktop = footer.slice(footer.indexOf('function DesktopFooter'), footer.indexOf('export default function Footer'))
  assert.match(desktop, /className="desktop-footer-aura"/, 'the desktop aura belongs only to the desktop branch')
  assert.match(desktop, /useScroll\(\)/, 'desktop scroll work belongs only to the desktop branch')
})

test('the old shrunk desktop footer markup is gone', () => {
  assert.doesNotMatch(footer, /mobile-footer/, 'no legacy mobile-footer markup may survive in Footer.jsx')
  assert.doesNotMatch(css, /\.mobile-footer-wordmark/, 'and no legacy styles either')
})

/* ---------------------------------------------------------- always moving -- */

test('the footer keeps its concept: brand, wordmark, credits, ticker, back to top', () => {
  for (const [needle, label] of [
    ['TheToolTable', 'brand'],
    ['the TOOL TABLE', 'wordmark'],
    ['Idea by', 'credits'],
    ['Designed by', 'credits'],
    ['Created by', 'credits'],
    ['Mfoot'.toLowerCase(), ''],
    ['mfoot-ticker', 'ticker'],
    ['mfoot-top', 'back to top'],
  ].filter(([, l]) => l)) {
    assert.ok(mobile.includes(needle), `the footer lost its ${label}`)
  }
})

test('every ambient loop in the footer repeats forever', () => {
  const loops = [...mobile.matchAll(/repeat:\s*Infinity/g)]
  assert.ok(loops.length >= 4, `expected the footer's loops to run forever, found ${loops.length}`)
  // and the CSS ones
  const names = [...css.matchAll(/animation-iteration-count:\s*infinite/g)]
  assert.ok(names.length >= 3)
})

test('the loops are slow enough not to read as a glitch', () => {
  const durations = [...mobile.matchAll(/duration:\s*(\d+(?:\.\d+)?),\s*repeat:\s*Infinity/g)].map(([, d]) => Number(d))
  durations.forEach((d) => assert.ok(d >= 2, `a ${d}s loop is too fast to feel calm`))
  for (const name of ['mfoot-mark-sweep', 'mfoot-credits-sweep']) {
    const block = css.slice(css.indexOf(`@keyframes ${name}`))
    const seconds = Number((block.slice(0, 400).match(/([\d.]+)s/) || [0, 99])[1])
    assert.ok(seconds >= 5, `${name} at ${seconds}s is too fast to feel calm`)
  }
})

test('both tickers run, and one of them runs backwards', () => {
  assert.match(mobile, /<Ticker words=\{TICKER_A\}/)
  assert.match(mobile, /<Ticker words=\{TICKER_B\} reverse/)
  assert.ok(css.includes('@keyframes mfoot-marquee-reverse'))
})

test('the marquee loop is seamless — three copies for a thirds-based translation', () => {
  assert.match(mobile, /\[0, 1, 2]\.map\(\(copy\)/, 'the track needs enough copies to wrap without a gap')
  assert.match(css, /@keyframes mfoot-marquee \{[\s\S]*?translateX\(-33\.3333%\)/)
})

/* -------------------------------------------------------------- the bug --- */

test('masked glyphs observe the mask, never the glyph inside it', () => {
  // An element clipped out by its own `overflow: hidden` parent has an
  // intersection ratio of zero, so `whileInView` on it can never fire.
  const glyph = mobile.slice(mobile.indexOf('function Glyph('), mobile.indexOf('function Aurora('))
  assert.match(glyph, /className="mfoot-glyph-mask"[\s\S]*whileInView="show"/, 'the observer must sit on the mask')
  assert.match(glyph, /variants=\{lift\}/, 'the mask drives the glyph through variants')
  assert.equal((glyph.match(/whileInView/g) || []).length, 1, 'exactly one observer, and it must be on the mask')
  assert.match(glyph, /className=\{`mfoot-glyph/, 'the clipped glyph keeps its own class')
})

test('the Part 4 masked-glyph primitive got the same fix', () => {
  const reveal = read('src/components/Reveal.jsx')
  const block = reveal.slice(reveal.indexOf('export function MaskedGlyph'))
  assert.match(block, /className="reveal-line"[\s\S]*whileInView="show"/)
  assert.doesNotMatch(block, /whileInView=\{\{/)
})

/* ------------------------------------------------------------ behaviour --- */

test('the credit rows are real, accessible, pressable list rows', () => {
  assert.match(mobile, /aria-expanded=\{open\}/)
  assert.match(mobile, /aria-controls=\{panelId\}/)
  assert.match(mobile, /<motion\.button[\s\S]*type="button"/, 'a credit must be a button')
  assert.match(mobile, /useRipple\(\)/, 'and ripple like everything else')
})

test('back to top is one control with a ring that tracks scroll position', () => {
  assert.match(mobile, /function BackToTop/)
  assert.match(mobile, /strokeDashoffset=\{circumference \* \(1 - pct\)\}/, 'the ring must reflect how far you have scrolled')
  assert.match(mobile, /scrollToTop/)
  assert.match(mobile, /prefers-reduced-motion/, 'smooth scrolling still respects the setting')
})

test('the constellation shows the whole collection, from the registry', () => {
  assert.match(mobile, /TOOLS\.map\(\(tool, i\)/)
  assert.match(mobile, /<ToolIcon name=\{tool\.icon\}/)
  assert.ok(mobile.includes('role="img"') && mobile.includes('aria-label={`All ${TOOLS.length} tools`}'))
})

/* --------------------------------------------------------------- safety --- */

test('reduced motion switches the footer off at the stylesheet, in one place', () => {
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {', css.indexOf('.mfoot-aurora-scan')))
  for (const cls of ['.mfoot-aurora-blob', '.mfoot-aurora-scan', '.mfoot-mark-sweep', '.mfoot-ticker-track']) {
    assert.ok(block.includes(cls), `${cls} must be covered by the reduced-motion rule`)
  }
  assert.ok(mobile.includes('useReducedMotion()'), 'and the entrance animations must respect it too')
})

test('the footer clears the phone safe area and never overflows sideways', () => {
  const base = css.slice(css.indexOf('.mfoot-base {'), css.indexOf('html.android-native .mfoot-base'))
  assert.match(base, /padding: 16px 18px calc\(18px \+ env\(safe-area-inset-bottom/)
  assert.match(css, /html\.android-native \.mfoot-base/, 'and the Android cutout inset')
  assert.match(css, /\.mfoot-inner \{[^}]*max-width: 620px; margin: 0 auto/, 'the bands must stay in one column')
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*\.mfoot-mark-line/, 'and must survive a 360px screen')
})

test('every class the phone footer renders has a rule', () => {
  const classes = [...mobile.matchAll(/className="([^"$]+)"/g)]
    .flatMap(([, v]) => v.split(/\s+/))
    .filter((c) => c.startsWith('mfoot-') && !c.includes('{') && !c.includes('$'))
  const missing = [...new Set(classes)].filter((c) => !css.includes(`.${c}`))
  assert.deepEqual(missing, [], `classes with no style: ${missing.join(', ')}`)
})

test('the desktop footer work from part 4 is untouched', () => {
  for (const [needle, label] of [
    ['desktop-footer-aura', 'footer aura'],
    ['footer-aura-blob', 'aura blobs'],
    ['footer-glyph', 'hoverable glyphs'],
    ['footer-top-link', 'travelling highlight'],
  ]) {
    assert.ok(footer.includes(needle) || css.includes(needle), `${label} disappeared`)
  }
})
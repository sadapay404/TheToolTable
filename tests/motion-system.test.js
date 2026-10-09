import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  EASE, DURATION, CSS_MS, SPRING, CARD_SPRING, t, instant, stagger, staggerChildren,
  fadeIn, riseIn, riseInX, maskLine, scaleIn, pressable, containerTransform, sharedAxis,
  drawRule, shineSweep, floatingLoop, spinLoop, breatheLoop, shouldAnimate,
  useAmbient, useCountUp, useMagnetic, usePointerDrift, useReveal, useStaggeredDelay,
} from '../src/lib/motion.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

const motionSource = read('src/lib/motion.js')
const css = read('src/styles.css')
const appSource = read('src/App.jsx')
const cardSource = read('src/components/ToolCard.jsx')
const ambientSource = read('src/components/AmbientField.jsx')
const revealSource = read('src/components/Reveal.jsx')

/* ------------------------------------------------------------------ tokens */

test('Material 3 easing set is complete and cubic-beziers are well formed', () => {
  for (const key of ['standard', 'standardDecelerate', 'standardAccelerate', 'emphasized', 'emphasizedDecelerate', 'emphasizedAccelerate']) {
    const v = EASE[key]
    assert.ok(Array.isArray(v) && v.length === 4, `${key} must be a 4-point bezier`)
    v.slice(0, 3).forEach((n) => assert.ok(n >= 0 && n <= 1, `${key} control points must stay in 0..1`))
  }
})

test('Material 3 duration scale is complete, monotonic in the extra ramp and in milliseconds', () => {
  const required = ['short1', 'short2', 'short3', 'short4', 'medium1', 'medium2', 'medium3', 'medium4',
    'long1', 'long2', 'long3', 'long4', 'extraLong1', 'extraLong2', 'extraLong3', 'extraLong4']
  for (const key of required) {
    assert.equal(typeof DURATION[key], 'number', `${key} missing`)
    assert.equal(CSS_MS[key], Math.round(DURATION[key] * 1000), `${key} must map to its ms value`)
  }
  assert.ok(DURATION.short4 <= DURATION.medium1)
  assert.ok(DURATION.medium4 <= DURATION.long1)
  assert.ok(DURATION.long4 <= DURATION.extraLong1)
})

test('t() composes seconds into a valid Framer transition and instant() is a true zero', () => {
  const built = t(DURATION.long2, EASE.emphasized, 0.2)
  assert.equal(built.duration, 0.5)
  assert.deepEqual(built.ease, EASE.emphasized)
  assert.equal(built.delay, 0.2)
  assert.deepEqual(instant, { duration: 0 })
})

test('spring presets are distinct and settle in the expressive range', () => {
  for (const key of ['gentle', 'snappy', 'expressive', 'layout', 'bouncy', 'heavy']) {
    const s = SPRING[key]
    assert.equal(s.type, 'spring', `${key} must be a spring`)
    assert.ok(s.stiffness > 0 && s.damping > 0)
  }
  assert.ok(SPRING.snappy.stiffness > SPRING.gentle.stiffness)
  assert.ok(SPRING.bouncy.damping < SPRING.heavy.damping)
  assert.ok(CARD_SPRING.stiffness > 0)
})

/* ---------------------------------------------------------------- variants */

test('reveal variants only animate transform and opacity', () => {
  const variants = {
    fadeIn, riseIn: riseIn(18), riseInX: riseInX(18), maskLine, scaleIn,
    pressable, containerTransform: containerTransform(1), sharedAxis: sharedAxis(1),
    drawRule: drawRule('left'), shineSweep,
  }
  for (const [name, v] of Object.entries(variants)) {
    assert.ok(v && typeof v === 'object', `${name} must be an object`)
    for (const [state, value] of Object.entries(v)) {
      if (state === 'transition' || !value || typeof value !== 'object') continue
      const keys = Object.keys(value).filter((k) => k !== 'transition')
      assert.ok(keys.length > 0, `${name}.${state} is empty`)
      keys.forEach((k) => {
        assert.ok(
          ['opacity', 'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'filter'].includes(k),
          `${name}.${state} animates "${k}" — only compositor-friendly channels are allowed`,
        )
      })
    }
  }
})

test('riseIn distance grows with the argument and sharedAxis reverses with direction', () => {
  assert.ok(riseIn(24).hidden.y > riseIn(8).hidden.y)
  assert.equal(sharedAxis(1).initial.y, 12)
  assert.equal(sharedAxis(-1).initial.y, -12)
  assert.equal(sharedAxis(1).exit.y, -8, 'exiting must travel the other way')
})

test('pressable compresses on press and never overshoots past 1 at rest', () => {
  assert.ok(pressable.press.scale < 1)
  assert.equal(pressable.rest.scale, 1)
})

test('stagger helpers produce non-negative increasing delays', () => {
  assert.ok(stagger(0) <= stagger(3))
  assert.ok(stagger(3) > 0)
  const children = staggerChildren(0.04, 0.06)
  assert.equal(children.staggerChildren, 0.04)
  assert.equal(children.delayChildren, 0.06)
  assert.equal(children.type, 'spring')
})

/* ------------------------------------------------------------------- loops */

test('ambient loops repeat forever with slow, non-jittery durations', () => {
  const loops = { floatingLoop: floatingLoop(6), spinLoop: spinLoop(30), breatheLoop: breatheLoop(4) }
  for (const [name, l] of Object.entries(loops)) {
    assert.equal(l.transition.repeat, Infinity, `${name} must never stop on its own`)
    assert.ok(l.transition.duration >= 1.5, `${name} is too fast and will read as a glitch`)
    assert.ok(['easeInOut', 'linear'].includes(l.transition.ease), `${name} must not snap`)
  }
  assert.equal(spinLoop(30, true).animate.rotate, -360, 'reverse spin is used for the counter-rotating ring')
  const breathe = breatheLoop(4, 0.2, 0.9)
  assert.deepEqual(breathe.animate.opacity, [0.2, 0.9, 0.2], 'a breathing loop has to come back down')
})

test('part 4 loop call sites stay on the slow side', () => {
  const durations = [...ambientSource.matchAll(/spinLoop\((\d+(?:\.\d+)?)/g)].map(([, d]) => Number(d))
  assert.ok(durations.length >= 2, 'the ambient rings must keep spinning')
  durations.forEach((d) => assert.ok(d >= 16, `a ${d}s ring is fast enough to read as a wobble`))
  const breathe = [...ambientSource.matchAll(/breatheLoop\((\d+(?:\.\d+)?)/g)].map(([, d]) => Number(d))
  breathe.forEach((d) => assert.ok(d >= 3, `a ${d}s breath is too fast to feel calm`))
})

/* ------------------------------------------------------------------- hooks */

test('shouldAnimate is false under prefers-reduced-motion and true otherwise', () => {
  const realWindow = globalThis.window
  try {
    globalThis.window = { matchMedia: (q) => ({ matches: q.includes('prefers-reduced-motion: reduce') }) }
    assert.equal(shouldAnimate(), false)
    globalThis.window = { matchMedia: () => ({ matches: false }) }
    assert.equal(shouldAnimate(), true)
    globalThis.window = {}
    assert.equal(shouldAnimate(), true, 'a runtime without matchMedia must not disable motion')
  } finally {
    if (realWindow === undefined) delete globalThis.window
    else globalThis.window = realWindow
  }
})

test('every hook in the motion system is exported for callers', () => {
  for (const hook of [useAmbient, useCountUp, useMagnetic, usePointerDrift, useReveal, useStaggeredDelay]) {
    assert.equal(typeof hook, 'function')
  }
})

/* ------------------------------------------- never redact existing motion -- */

test('the lite profile thins ambient motion but never switches it off', () => {
  const block = motionSource.slice(motionSource.indexOf('export function useAmbient'))
  assert.match(block, /count: reduced \? 0 : level === 'lite' \? ([3-9])/, 'lite must keep at least 3 ambient elements')
  assert.match(block, /level === 'balanced' \? [4-9]/, 'balanced must keep at least 4 ambient elements')
  assert.match(css, /\.ambient-grid \{[\s\S]*?display: none/, 'lite may hide the grid layer, but only there')
})

test('part 1-3 animation is still present after the part 4 rewrite', () => {
  const mustSurvive = [
    [appSource, 'mobile-orbit-ring', 'phone hero orbit rings'],
    [appSource, 'scroll-progress', 'scroll progress bar'],
    [appSource, 'sharedAxis', 'shared-axis screen transitions'],
    [cardSource, 'whileHover="hover"', 'desktop card hover state'],
    [cardSource, 'rotateX', 'desktop 3-D tilt'],
    [cardSource, 'sheen', 'existing card sheen'],
    [css, '.md3-ripple', 'material ink ripple'],
    [read('src/lib/ripple.js'), 'md3-ripple', 'material ink ripple primitive'],
    [css, '.mfoot-ticker-track', 'animated mobile footer ticker'],
    [read('src/components/MobileNavBar.jsx'), 'layoutId', 'sliding nav pill'],
    [read('src/components/Footer.jsx'), 'desktop-footer', 'desktop footer lockup'],
  ]
  for (const [source, needle, label] of mustSurvive) {
    assert.ok(source.includes(needle), `${label} must not be removed`)
  }
})

test('every keyframe used by the new ambient layers exists in the stylesheet', () => {
  for (const name of ['ambient-drift', 'ambient-grid-drift', 'hero-mark-breathe', 'hero-halo-pulse',
    'reveal-gradient-pan', 'card-shine-sweep', 'palette-scan', 'footer-scan', 'footer-top-sheen']) {
    assert.ok(css.includes(`@keyframes ${name}`), `missing @keyframes ${name}`)
  }
})

/** Pull `@keyframes name { … }` bodies out of the stylesheet with brace matching. */
function keyframeBodies(source) {
  const bodies = new Map()
  const re = /@keyframes\s+([\w-]+)\s*\{/g
  let m
  while ((m = re.exec(source))) {
    let depth = 1
    let i = m.index + m[0].length
    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === '{') depth += 1
      else if (source[i] === '}') depth -= 1
    }
    bodies.set(m[1], source.slice(m.index + m[0].length, i - 1))
  }
  return bodies
}

test('every part 4 keyframe animates only compositor-friendly channels', () => {
  const allowed = new Set(['transform', 'background-position', 'opacity', 'filter'])
  const bodies = keyframeBodies(css)
  const mine = [...bodies.entries()]
    .filter(([name]) => /^(ambient|card-shine|palette-scan|hero-|reveal-gradient|footer-scan|footer-top)/.test(name))
  assert.ok(mine.length >= 9, `expected the part 4 keyframes, found ${mine.length}`)
  mine.forEach(([name, body]) => {
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map(([, p]) => p)
    assert.ok(props.length > 0, `${name} animates nothing`)
    props.forEach((prop) => assert.ok(allowed.has(prop), `${name} animates "${prop}", which forces a repaint`))
  })
})

test('reveal primitives clip their masks and expose the four public helpers', () => {
  assert.ok(css.includes('.reveal-line'), 'the mask class must exist')
  assert.match(css, /\.reveal-line\s*\{[^}]*overflow:\s*hidden/, 'the mask must clip overflow')
  for (const fn of ['RevealLine', 'RevealBlock', 'RevealRule', 'MaskedGlyph']) {
    assert.ok(revealSource.includes(`function ${fn}`), `Reveal.jsx must export ${fn}`)
  }
})

test('the ambient field renders blobs, grid, rings and pointer drift', () => {
  assert.ok(ambientSource.includes('ambient-wash'))
  assert.ok(ambientSource.includes('ambient-grid'))
  assert.ok(ambientSource.includes('ambient-blob'))
  assert.ok(ambientSource.includes('ambient-ring'))
  assert.ok(ambientSource.includes('drift.x'), 'the wash must follow the pointer drift value')
  assert.match(ambientSource, /spinLoop\(48\)/, 'at least one ring must keep turning')
})

test('desktop and phone surfaces each gained their own motion', () => {
  assert.ok(cardSource.includes('useMagnetic'), 'desktop cards must be magnetic')
  assert.ok(cardSource.includes('card-shine--hover'), 'desktop cards must sweep a shine on hover')
  assert.ok(cardSource.includes('cardParallax'), 'desktop cards must parallax on scroll')
  assert.ok(cardSource.includes('iconVariants'), 'desktop card parts must react to hover')
  assert.ok(cardSource.includes('PhoneSurface'), 'the phone tile must survive')
  assert.ok(appSource.includes('RevealLine'), 'the hero must use masked reveals')
  assert.ok(appSource.includes('usePointerDrift'), 'the page must drift toward the pointer')
})
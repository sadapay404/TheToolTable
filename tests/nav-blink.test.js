// Part 6 — navigation blink. Guards the screen swap so an empty frame cannot return
// between the table and a tool, and so the single-mounted-screen rule (the Android
// black-screen fix) is kept.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { screenSwap, sharedAxis, DURATION } from '../src/lib/motion.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.join(here, '../src/App.jsx'), 'utf8')
const chromeSource = readFileSync(path.join(here, '../src/components/ToolChrome.jsx'), 'utf8')

test('the incoming screen never starts fully transparent (no blank frame)', () => {
  for (const dir of [1, -1]) {
    const s = screenSwap(dir)
    assert.ok(s.initial.opacity > 0, `initial opacity ${s.initial.opacity} would blink`)
    assert.ok(s.initial.opacity < 1, 'it should still fade in, not pop')
  }
})

test('the outgoing screen clears quickly so the gap stays short', () => {
  const s = screenSwap(1)
  assert.ok(s.exit.transition.duration <= DURATION.short3 + 1e-9,
    `exit ${s.exit.transition.duration}s is too slow for a tap-to-tool swap`)
  assert.ok(s.exit.transition.duration < sharedAxis(1).exit.transition.duration,
    'the exit must be shorter than the old sharedAxis exit that caused the blink')
})

test('screen swap keeps the direction-aware travel', () => {
  assert.equal(screenSwap(1).initial.y, 12)
  assert.equal(screenSwap(-1).initial.y, -12)
  assert.equal(screenSwap(1).exit.y, -6)
  assert.equal(screenSwap(-1).exit.y, 6)
})

test('sharedAxis itself is unchanged (other callers and its pinned tests rely on it)', () => {
  assert.equal(sharedAxis(1).initial.opacity, 0)
  assert.equal(sharedAxis(1).animate.transition.duration, DURATION.long2)
})

test('both screens use the swap and only one screen is mounted at a time', () => {
  assert.match(appSource, /key="home"[^>]*screenSwap\(1\)/, 'home screen must use screenSwap')
  assert.match(appSource, /key=\{`tool-\$\{active\.id\}`\}[^>]*screenSwap\(-1\)/, 'tool screen must use screenSwap')
  assert.match(appSource, /<AnimatePresence mode="wait"/, 'single-screen mode="wait" must stay (Android fix)')
})

test('the tool loader only appears after a short delay, so a cached tool does not flash a spinner', () => {
  assert.match(appSource, /function DelayedToolLoading\(/)
  assert.match(appSource, /setTimeout\(\(\) => setShow\(true\), delay\)/)
  assert.match(appSource, /<Suspense fallback=\{<DelayedToolLoading \/>\}>/)
  assert.doesNotMatch(appSource, /<Suspense fallback=\{<ToolLoading \/>\}>/,
    'the immediate ToolLoading fallback is the flash this part removes')
})

test('the tool intro arrives at the standard long duration, not 800 ms', () => {
  assert.doesNotMatch(chromeSource, /DURATION\.extraLong2, EASE\.emphasizedDecelerate\)\}\s*\n\s*aria-label=\{`\$\{tool\.name\} introduction`\}/)
  assert.match(chromeSource, /DURATION\.long2, EASE\.emphasizedDecelerate\)\}\s*\n\s*aria-label=\{`\$\{tool\.name\} introduction`\}/)
})

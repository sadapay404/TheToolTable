import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const palette = read('src/components/CommandPalette.jsx')
const actions = read('src/components/ToolActions.jsx')
const motion = read('src/lib/motion.js')

test('the command palette releases delayed focus and disables magnetism while closed', () => {
  assert.match(palette, /const focusTimerRef = useRef\(null\)/)
  assert.match(palette, /focusTimerRef\.current = window\.setTimeout\([\s\S]*?inputRef\.current\?\.focus\(\)/,
    'opening may defer focus, but it must retain that timer')
  assert.match(palette, /return \(\) => \{[\s\S]*?window\.clearTimeout\(focusTimerRef\.current\)[\s\S]*?focusTimerRef\.current = null/,
    'closing or unmounting must cancel a queued focus attempt')
  assert.match(palette, /useMagnetic\(\{ strength: 0\.08, max: 12, disabled: !open \}\)/,
    'a closed palette must not retain pointer-driven magnetic state')
})

test('disabled magnetic consumers reset their cursor offset before reopening', () => {
  assert.match(motion, /useEffect\(\(\) => \{[\s\S]*?if \(disabled\) \{ x\.set\(0\); y\.set\(0\) \}/,
    'disabled magnetic surfaces must return to their resting position')
})

test('tool quick-action copy invalidates stale results and clears its delayed close', () => {
  assert.match(actions, /const closeTimerRef = useRef\(null\)/)
  assert.match(actions, /const copyRequestRef = useRef\(0\)/)
  assert.match(actions, /copyRequestRef\.current \+= 1[\s\S]*?window\.clearTimeout\(closeTimerRef\.current\)/,
    'changing or unmounting a sheet must invalidate clipboard work and clear its timer')
  assert.match(actions, /if \(request !== copyRequestRef\.current\) return/,
    'an old clipboard promise must not update or close a newer sheet')
  assert.match(actions, /closeTimerRef\.current = window\.setTimeout\([\s\S]*?closeTimerRef\.current = null[\s\S]*?onClose\(\)/,
    'the delayed close must be tracked and released once it fires')
})

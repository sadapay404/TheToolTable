import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDecisionState, randomFraction, randomIndex, sanitizeDecisionHistory, shuffleSecure, weightedIndex } from '../src/lib/decision.js'

function words(values) {
  const queue = [...values]
  return { getRandomValues(target) { target[0] = queue.shift() ?? 0; return target } }
}

test('secure random integer sampling rejects biased overflow words and validates ranges', () => {
  const crypto = words([0xffff_ffff, 4])
  assert.equal(randomIndex(10, crypto), 4)
  assert.throws(() => randomIndex(0, words([])), RangeError)
  assert.throws(() => randomIndex(1.5, words([])), RangeError)
  assert.equal(randomIndex(1, null), 0)
  assert.throws(() => randomIndex(2, null), /secure random-number generator/)
  assert.equal(randomFraction(words([0x8000_0000])), 0.5)
})

test('weighted choice ignores zero weights and secure shuffle returns a copy', () => {
  assert.equal(weightedIndex([0, 1, 0], words([0])), 1)
  assert.throws(() => weightedIndex([0, 0], words([])), RangeError)
  const source = ['a', 'b', 'c']
  const result = shuffleSecure(source, words([2, 1]))
  assert.deepEqual(result, source)
  assert.notEqual(result, source)
  assert.throws(() => shuffleSecure('abc', words([])), TypeError)
})

test('decision preferences and history are bounded and invalid values fall back safely', () => {
  const draw = normalizeDecisionState('draw', { mode: '__proto__', count: 10_000, teams: -4, remove: 'yes', text: 'x'.repeat(25_000) }, {
    mode: 'pick', count: 1, teams: 2, remove: false, text: '',
  })
  assert.equal(draw.mode, 'pick')
  assert.equal(draw.count, 500)
  assert.equal(draw.teams, 2)
  assert.equal(draw.remove, false)
  assert.equal(draw.text.length, 20_000)

  const wheel = normalizeDecisionState('wheel', { pal: 'unsafe', dur: 999, items: Array.from({ length: 50 }, (_, i) => ({ id: 'same', t: `Option ${i}`, w: 100 })) }, {
    pal: 'warm', dur: 5, elim: false, items: [],
  })
  assert.equal(wheel.pal, 'warm')
  assert.equal(wheel.dur, 5)
  assert.equal(wheel.items.length, 40)
  assert.equal(new Set(wheel.items.map((item) => item.id)).size, 40)
  assert.ok(wheel.items.every((item) => item.w === 9))

  const history = sanitizeDecisionHistory(Array.from({ length: 30 }, (_, i) => ({ kind: 'coin', text: 'x'.repeat(300), k: i, t: i })))
  assert.equal(history.length, 24)
  assert.ok(history.every((item) => item.text.length === 240))
  assert.deepEqual(sanitizeDecisionHistory([{ kind: '__proto__', text: 'unsafe' }]), [])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, sanitizeVizParams, sanitizeVizPatch } from '../src/lib/viz/params.js'

test('visualizer persistence sanitizes enum, numeric, color, and text fields before rendering', () => {
  const safe = sanitizeVizParams({
    style: 'not-a-style', bgType: 'image', bars: 1e12, thick: Infinity, glow: -10, fmin: 9000, fmax: 10,
    round: 0.8, c1: 'url(javascript:1)', bg1: '#123abc', title: `ok\u0000${'x'.repeat(300)}`, injected: { danger: true },
  })
  assert.equal(safe.style, DEFAULTS.style)
  assert.equal(safe.bgType, 'gradient')
  assert.equal(safe.bars, 400)
  assert.equal(safe.thick, DEFAULTS.thick)
  assert.equal(safe.glow, 0)
  assert.equal(safe.fmin, 400)
  assert.equal(safe.fmax, 2000)
  assert.equal(safe.round, 1)
  assert.equal(safe.c1, DEFAULTS.c1)
  assert.equal(safe.bg1, '#123ABC')
  assert.equal(safe.title.length, 180)
  assert.equal(safe.title.includes('\u0000'), false)
  assert.equal('injected' in safe, false)
})

test('visualizer imported looks keep only bounded, recognized partial parameters', () => {
  assert.deepEqual(sanitizeVizPatch({ bars: 2, palette: 'invalid', title: 'A safe title', c2: '#abcdef', junk: 123 }), {
    bars: 16, title: 'A safe title', c2: '#ABCDEF',
  })
  assert.deepEqual(sanitizeVizPatch([]), {})
  assert.deepEqual(sanitizeVizPatch(null), {})
})

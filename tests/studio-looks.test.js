import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSavedLooks, MAX_SAVED_LOOKS, persistLooks, safeLookName, safeLookParams } from '../src/lib/studio/looks.js'

test('look names and imported numeric parameters are sanitized and bounded', () => {
  assert.equal(safeLookName({ label: 'not a string' }), 'Imported')
  assert.equal(safeLookName('  My\u0000 look  '), 'My look')
  assert.equal(safeLookName('x'.repeat(100)).length, 60)

  const params = safeLookParams({ exposure: 99, contrast: 1000, gsH: -5, duoA: 800, blue_h: 12, rot: 2, cx: 0.4, sat: '90', unknown: 1 })
  assert.deepEqual(params, { exposure: 3, contrast: 100, gsH: 0, duoA: 360, blue_h: 12 })
  assert.equal(safeLookParams(null), null)
  assert.equal(safeLookParams([]), null)
})

test('saved looks load defensively, discard malformed entries and duplicate IDs', () => {
  const data = JSON.stringify([
    { id: 'mine-1', name: 'First', p: { exposure: 0.5, rot: 2 } },
    { id: 'mine-1', name: 'Duplicate', p: { contrast: 10 } },
    { id: 4, name: { malicious: true }, p: { sat: 12 } },
    { id: 'bad', name: 'Bad', p: null },
    null,
  ])
  const storage = { getItem: () => data }
  assert.deepEqual(loadSavedLooks(storage), [
    { id: 'mine-1', name: 'First', cat: 'Mine', p: { exposure: 0.5 } },
    { id: 'mine-saved-2', name: 'Imported', cat: 'Mine', p: { sat: 12 } },
  ])
  assert.deepEqual(loadSavedLooks({ getItem: () => '{not json' }), [])
  assert.deepEqual(loadSavedLooks({ getItem: () => 'x'.repeat(512 * 1024 + 1) }), [])
})

test('look persistence is bounded and storage failures are non-fatal', () => {
  let written
  const storage = { setItem: (key, value) => { written = [key, JSON.parse(value)] } }
  const list = Array.from({ length: MAX_SAVED_LOOKS + 2 }, (_, index) => ({ id: String(index), name: `Look ${index}`, p: {} }))
  assert.equal(persistLooks(list, storage), true)
  assert.equal(written[0], 'ttt.looks')
  assert.equal(written[1].length, MAX_SAVED_LOOKS)
  assert.equal(written[1][0].id, '2')
  assert.equal(persistLooks(list, { setItem() { throw new Error('quota') } }), false)
})

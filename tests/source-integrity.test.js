/**
 * Static integrity pins for free identifiers.
 *
 * Four bugs in this batch were references to names that do not exist — they
 * compiled and built cleanly (Vite treats them as globals) and only threw a
 * ReferenceError on the exact user path that reached them: a native model
 * download, a wallpaper video export, opening the currency picker. Unit tests
 * that only exercise the happy path never touch those lines, so the contract is
 * pinned here against the source itself, plus a runtime check for the gallery
 * symmetry merge that the duplicate-key cleanup could have disturbed.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fromGallery, DEFAULT_DESIGN } from '../src/lib/wall/design.js'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const section = (src, from, to) => {
  const start = src.indexOf(from)
  assert.ok(start >= 0, `expected to find ${JSON.stringify(from)}`)
  const end = to ? src.indexOf(to, start + from.length) : src.length
  assert.ok(end > start, `expected to find ${JSON.stringify(to)} after ${JSON.stringify(from)}`)
  return src.slice(start, end)
}

test('prepareNativeModel titles the download from the plan tier, not a free variable', () => {
  const body = section(read('src/lib/bg/engine.js'), 'async function prepareNativeModel', 'async function start')
  // `tier` is not a parameter, binding or import of prepareNativeModel:
  // `TIERS[tier]` there was a ReferenceError on every Android/Tauri model fetch.
  assert.match(body, /TIERS\[plan\.tier\]/, 'the notification title must read the tier off the plan')
  assert.doesNotMatch(body, /TIERS\[tier\]/, 'no bare tier identifier inside prepareNativeModel')
})

test('recordLoop passes the validated mime option to MediaRecorder', () => {
  const body = section(read('src/lib/wall/exporters.js'), 'export async function recordLoop', '\nexport ')
  // `{ mimeType, ... }` shorthand referenced an undeclared global and crashed
  // every background-wallpaper video recording before the first frame.
  assert.match(body, /new MediaRecorder\(stream, \{ mimeType: mime[,}]/, 'the recorder must use the checked `mime` option')
  assert.doesNotMatch(body, /\{\s*mimeType\s*,/, 'no shorthand mimeType — it is not declared anywhere')
})

test('exchange Picker destructures the ariaLabel it reads', () => {
  const src = read('src/tools/exchange/parts.jsx')
  const sig = /export function Picker\((\{[^)]*\})\)/.exec(src)
  assert.ok(sig, 'Picker signature should be a destructured object parameter')
  assert.ok(sig[1].includes('ariaLabel'), 'ariaLabel must be declared before the search input can read it')
  const uses = src.match(/ariaLabel/g) || []
  assert.ok(uses.length >= 2, 'the input should still fall back through ariaLabel')
})

test('fromGallery keeps the gallery symmetry setting after the duplicate-key cleanup', () => {
  const withSym = fromGallery({ style: 'aurora', o: { sym: { mode: 3, n: 5 } } }, null)
  assert.deepEqual(withSym.sym, { mode: 3, n: 5 }, 'a saved gallery sym must survive the merge')
  const withoutSym = fromGallery({ style: 'aurora' }, null)
  assert.deepEqual(withoutSym.sym, { ...DEFAULT_DESIGN.sym }, 'a gallery without sym falls back to the default')
})

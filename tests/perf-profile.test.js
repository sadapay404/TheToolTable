import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldBenchmark, tierOf } from '../src/lib/perf.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')

const capablePhone = { cores: 8, mem: 8, phone: true, saveData: false, reduced: false }
const capableDesktop = { cores: 8, mem: 8, phone: false, saveData: false, reduced: false }

test('a capable Android handset starts Balanced instead of being mistaken for a desktop', () => {
  assert.equal(tierOf(capablePhone, 12), 'mid')
  assert.equal(tierOf(capableDesktop, 12), 'high')
  assert.equal(tierOf({ ...capablePhone, cores: 4, mem: 4 }, 60), 'low')
  assert.equal(tierOf({ ...capablePhone, saveData: true }, 12), 'low')
})

test('the startup micro-benchmark never competes with a phone first paint', () => {
  assert.equal(shouldBenchmark(capablePhone), false)
  assert.equal(shouldBenchmark({ ...capablePhone, saveData: true }), false)
  assert.equal(shouldBenchmark({ ...capablePhone, phone: false, reduced: true }), false)
  assert.equal(shouldBenchmark(capableDesktop), true)

  const perf = read('src/lib/perf.js')
  assert.match(perf, /\(!force && !shouldBenchmark\(\)\)/,
    'runBenchmark must honor the device-safe admission gate')
  assert.match(perf, /root\.dataset\.phone = 'true'/,
    'the stylesheet needs a stable handset marker for Android WebView tuning')
})

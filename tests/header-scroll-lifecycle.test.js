import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const bootstrap = read('src/main.jsx')
const app = read('src/App.jsx')

test('the header scroll listener attaches after React mounts the header', () => {
  assert.doesNotMatch(bootstrap, /querySelector\('\.app-header'\)/,
    'the pre-render bootstrap cannot find a React-owned header')
  assert.match(app, /const headerRef = useRef\(null\)/)
  assert.match(app, /const header = headerRef\.current[\s\S]*?window\.addEventListener\('scroll', onScroll, \{ passive: true \}\)/,
    'the post-mount effect must own the passive window scroll listener')
  assert.match(app, /<header ref=\{headerRef\} className="app-header/, 'the effect must target the rendered header')
})

test('the header scroll lifecycle coalesces work and releases it on unmount', () => {
  assert.match(app, /if \(frame !== null\) return[\s\S]*?frame = requestAnimationFrame\(sync\)/,
    'many scroll events in one frame must produce one DOM update')
  assert.match(app, /header\.dataset\.scrolled !== next/, 'the DOM is written only at the threshold edge')
  assert.match(app, /window\.removeEventListener\('scroll', onScroll\)[\s\S]*?cancelAnimationFrame\(frame\)/,
    'unmount must release both the listener and a queued animation frame')
})

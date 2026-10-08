import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

/* Both files are JSX, so they cannot be imported into the Node test runner.
   Reading them as text still lets us assert the structural contract. */
const registrySource = read('src/toolsRegistry.jsx')
const iconSource = read('src/components/ToolIcon.jsx')

const registryEntries = [...registrySource.matchAll(/id:\s*'([a-z0-9]+)'[^\n]*?icon:\s*'([a-z0-9]+)'/g)]
  .map((m) => ({ id: m[1], icon: m[2] }))

const glyphNames = new Set(
  [...iconSource.matchAll(/^\s{2}([a-z0-9]+):\s*\[/gm)].map((m) => m[1]),
)

test('the registry still describes all twenty tools', () => {
  assert.equal(registryEntries.length, 20)
})

test('every tool resolves to a real glyph', () => {
  const missing = registryEntries.filter((entry) => !glyphNames.has(entry.icon))
  assert.deepEqual(missing, [], `tools without a glyph: ${missing.map((m) => m.id).join(', ')}`)
})

test('no system emoji survive as tool icons', () => {
  // Emoji are drawn by the system font, render as tofu without an emoji font,
  // cannot inherit currentColor and cannot be animated. They must stay gone.
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u
  const offenders = registryEntries.filter((entry) => emoji.test(entry.icon))
  assert.deepEqual(offenders, [])
  assert.equal(emoji.test(registrySource), false, 'toolsRegistry.jsx should contain no emoji')
})

test('every glyph is 24x24 geometry drawn in currentColor', () => {
  assert.match(iconSource, /viewBox="0 0 24 24"/)
  assert.match(iconSource, /fill="currentColor"/)
})

test('shared shell glyphs used by the nav bar and search exist', () => {
  for (const name of ['grid', 'search', 'sliders', 'sparkle', 'clock']) {
    assert.ok(glyphNames.has(name), `missing shared glyph: ${name}`)
  }
})

test('a glyph falls back rather than rendering nothing', () => {
  assert.match(iconSource, /hasIcon\(name\)/)
  assert.match(iconSource, /GLYPHS\[sparkle\]|GLYPHS\.sparkle/)
})
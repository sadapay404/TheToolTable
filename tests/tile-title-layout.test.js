// Regression guard for the tool-title "one letter per line" bug.
//
// The ink ripple span was supposed to be absolutely positioned. Several hosts
// carry `> * { position: relative }` rules with the same specificity as
// `.md3-ripple` and later in the file, so the ripple became an in-flow flex item
// as wide as its button. On tap it squeezed the tile title to a single letter
// per line. The fix is a more specific rule placed after those hosts' rules.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const css = readFileSync(path.join(here, '../src/styles.css'), 'utf8')
const visualizer = readFileSync(path.join(here, '../src/tools/Visualizer.jsx'), 'utf8')

test('the ripple span is absolutely positioned even inside `> *` hosts', () => {
  // The `> *` host rules are (0,1,0). The override selects `.md3-ripple[data-state]`
  // (0,2,0), so it beats them wherever they sit in the file.
  const hostRules = [...css.matchAll(/^([^{}\n]*)\s*>\s*\*\s*\{\s*position:\s*relative/gm)]
  assert.ok(hostRules.length >= 3, 'expected the `> *` host rules to be present')
  assert.ok(
    css.includes('.md3-ripple[data-state] { position: absolute'),
    'the ripple override rule is missing',
  )
})

test('no `> *` rule forces the ripple to position: relative', () => {
  // A `> *` rule that names `.md3-ripple` explicitly would be a second route
  // into the bug. Make sure none exists.
  assert.doesNotMatch(css, /\.md3-ripple[^{]*\{[^}]*position:\s*relative/)
})

test('the Visualizer reads `pd` only after it is declared', () => {
  // Reading a const in a dependency array before its declaration throws on
  // every render, which kept the tool from opening at all.
  const declaredAt = visualizer.indexOf('const pd = useMemo(')
  assert.ok(declaredAt > 0, 'pd declaration not found')
  const beforeDeclaration = visualizer.slice(0, declaredAt)
  assert.doesNotMatch(beforeDeclaration, /\[[^\]]*\bpd\b[^\]]*\]\)/, 'a hook dependency reads pd before it is declared')
})

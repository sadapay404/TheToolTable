import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(path.join(ROOT, 'src/components/MobileSearch.jsx'), 'utf8')

test('closed mobile search mounts no scroll observer', () => {
  assert.match(source, /export default function MobileSearch\(\{ open, onClose, onTool, onTheme \}\)[\s\S]*?\{open && <MobileSearchPanel/,
    'the permanent shell must only mount the scroll-owning panel while search is open')

  const panel = source.slice(source.indexOf('function MobileSearchPanel'), source.indexOf('export default function MobileSearch'))
  assert.match(panel, /const bodyRef = useRef\(null\)/)
  assert.match(panel, /useScroll\(\{ container: bodyRef \}\)/,
    'title motion must follow the search results scroller, not the page behind the modal')
  assert.match(panel, /<div ref=\{bodyRef\} className="md3-search-body">/)
  assert.equal((source.match(/useScroll\(/g) || []).length, 1, 'there must be one observer, owned by the conditional panel')
})

test('mobile search retains its dialog, focus, and close controls', () => {
  for (const needle of ['role="dialog"', 'aria-modal="true"', 'aria-label="Search tools"', 'preventScroll: true', 'e.key === \'Escape\'', 'aria-label="Close search"']) {
    assert.ok(source.includes(needle), `search lost ${needle}`)
  }
})

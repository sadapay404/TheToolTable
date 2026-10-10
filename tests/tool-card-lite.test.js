import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const card = readFileSync(path.join(ROOT, 'src/components/ToolCard.jsx'), 'utf8')
const styles = readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8')

const start = card.indexOf('function LiteSurface')
const end = card.indexOf('/* ---------------------------------------------------------------- desktop --', start)
const liteSurface = card.slice(start, end)

test('Lite desktop cards never mount parallax, observers, or pointer springs', () => {
  assert.ok(start >= 0 && end > start, 'Lite must have its own render surface')
  assert.match(card, /if \(level === 'lite'\) return <LiteSurface tool=\{tool\} onOpen=\{onOpen\} \/>/,
    'Lite must select the static component before TiltSurface can subscribe')

  for (const forbidden of ['useScroll', 'ResizeObserver', 'useMagnetic', 'useMotionValue', 'useSpring', 'useTransform', 'whileInView', 'motion.']) {
    assert.ok(!liteSurface.includes(forbidden), `Lite card surface must not contain ${forbidden}`)
  }
  assert.ok(!liteSurface.includes('card-shine--ambient'), 'Lite must not render a permanent card-shine loop')
})

test('Lite cards retain native tool access, preload, focus, and press feedback', () => {
  for (const needle of ['type="button"', 'data-tool-id={tool.id}', 'aria-label={`Open ${tool.name}`}', 'onPointerEnter={() => tool.comp?.preload?.()}', 'onFocus={() => tool.comp?.preload?.()}', 'onClick={() => onOpen(tool)}']) {
    assert.ok(liteSurface.includes(needle), `Lite card lost ${needle}`)
  }
  assert.match(styles, /\.card3d--static:active\s*\{\s*transform:\s*scale\(\.985\);?\s*\}/,
    'Lite cards must retain a lightweight native press response')
})

test('Balanced and Full retain the existing rich desktop motion path', () => {
  const tilt = card.slice(card.indexOf('function TiltSurface'), card.indexOf('/* ------------------------------------------------------------------ phone --'))
  for (const needle of ['useScroll()', 'ResizeObserver', 'useMagnetic', 'whileHover="hover"', 'whileInView']) {
    assert.ok(tilt.includes(needle), `non-Lite cards lost ${needle}`)
  }
})

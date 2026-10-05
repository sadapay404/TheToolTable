import test from 'node:test'
import assert from 'node:assert/strict'
import { fitSize, matteLUT, paintStroke } from '../src/lib/bg/compose.js'
import { isImageFile } from '../src/lib/bg/media.js'

const file = (name, type = '') => ({ name, type })

test('background remover detects image files with or without browser MIME metadata', () => {
  assert.equal(isImageFile(file('photo.jpg')), true)
  assert.equal(isImageFile(file('scan.TIFF')), true)
  assert.equal(isImageFile(file('photo', 'image/avif')), true)
  assert.equal(isImageFile(file('clip.mp4', '')), false)
  assert.equal(isImageFile(null), false)
})

test('background source sizing preserves aspect ratio and rejects invalid dimensions', () => {
  assert.deepEqual(fitSize(12000, 6000, 8192), { w: 8192, h: 4096, scale: 8192 / 12000, capped: true })
  assert.deepEqual(fitSize(1200, 800, 8192), { w: 1200, h: 800, scale: 1, capped: false })
  assert.throws(() => fitSize(Infinity, 100, 1600), /positive finite/)
  assert.throws(() => fitSize(100, 100, 0), /positive finite/)
})

test('matte lookup tables are monotonic and brush strokes restore and erase smoothly', () => {
  for (const edge of [-100, 0, 100]) {
    const lut = matteLUT({ edge, soft: 40 })
    assert.equal(lut.length, 256)
    for (let i = 1; i < lut.length; i++) assert.ok(lut[i] >= lut[i - 1])
  }

  const mask = new Uint8Array(25)
  paintStroke(mask, 5, 5, { x: 2, y: 2 }, { x: 2, y: 2 }, 1, 1, 'restore')
  assert.equal(mask[12], 255)
  assert.equal(mask[0], 0)
  paintStroke(mask, 5, 5, { x: 2, y: 2 }, { x: 2, y: 2 }, 0.5, 1, 'erase')
  assert.equal(mask[12], 0)
})

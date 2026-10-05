import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FULL, MAX_SCAN_PAGES, MAX_SCAN_PIXELS, MAX_SCAN_TOTAL_PIXELS, fitScanSize,
  isScanImageFile, isValidQuad, rotateQuad, toCanvas, warp, applyFilter, recognize,
} from '../src/lib/ocr/engine.js'

test('scanner image sizing preserves proportions and enforces edge and pixel limits', () => {
  const fit = fitScanSize(8_000, 4_000)
  assert.ok(fit.capped)
  assert.ok(fit.width <= 2_400 && fit.height <= 2_400)
  assert.ok(fit.width * fit.height <= MAX_SCAN_PIXELS)
  assert.ok(Math.abs(fit.width / fit.height - 2) < 0.002)
  const tight = fitScanSize(4_000, 2_000, { maxSide: 2_000, maxPixels: 1_000_000 })
  assert.ok(tight.width * tight.height <= 1_000_000)
  assert.throws(() => fitScanSize(0, 10), /invalid dimensions/)
  assert.throws(() => fitScanSize(Infinity, 10), /invalid dimensions/)
  assert.equal(MAX_SCAN_PAGES, 40)
  assert.equal(MAX_SCAN_TOTAL_PIXELS, 36_000_000)
})

test('scanner detects common image extensions without MIME and accepts only convex crop quads', () => {
  assert.equal(isScanImageFile({ type: '', name: 'receipt.JPEG' }), true)
  assert.equal(isScanImageFile({ type: 'image/webp', name: 'photo.bin' }), true)
  assert.equal(isScanImageFile({ type: 'application/pdf', name: 'scan.pdf' }), false)
  assert.equal(isValidQuad(FULL()), true)
  assert.equal(isValidQuad(rotateQuad(FULL(), 1)), true)
  assert.equal(isValidQuad([[0, 0], [1, 1], [1, 0], [0, 1]]), false)
  assert.equal(isValidQuad([[0, 0], [1, 0], [1, 1], [0, 1.2]]), false)
})

test('scanner pixel operations reject invalid and unbounded inputs before touching the DOM', async () => {
  assert.throws(() => toCanvas({ width: 0, height: 0 }), /invalid dimensions/)
  assert.throws(() => warp({ width: 8_000, height: 8_000 }, FULL()), /Resize this page/)
  assert.throws(() => warp({ width: 100, height: 100 }, [[0, 0], [1, 1], [1, 0], [0, 1]]), /valid four-sided/)
  assert.throws(() => applyFilter({ width: 9_000, height: 9_000 }), /Resize this page/)
  await assert.rejects(recognize({ width: 3_000, height: 3_000 }, 'eng'), /too large for OCR/)
})

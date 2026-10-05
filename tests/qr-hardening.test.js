import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCSV } from '../src/lib/qr/csv.js'
import { normalizeQrState } from '../src/lib/qr/state.js'
import { buildPayload, typeById } from '../src/lib/qr/payloads.js'
import { buildQR, DEFAULT_STYLE } from '../src/lib/qr/render.js'
import { bulkZip } from '../src/lib/qr/exportKit.js'
import { parse } from '../src/lib/qr/parse.js'
import { checkSafety } from '../src/lib/qr/safety.js'

test('CSV parser supports quotes, escaped quotes, embedded newlines, BOM and common delimiters', () => {
  assert.deepEqual(parseCSV('\uFEFFName,Value\r\n"A, B","line one\nline two"\r\n"Say ""hello""",42\r\n'), [
    ['Name', 'Value'], ['A, B', 'line one\nline two'], ['Say "hello"', '42'],
  ])
  assert.deepEqual(parseCSV('Name;Value\nCafe;"Tea; coffee"\n'), [['Name', 'Value'], ['Cafe', 'Tea; coffee']])
  assert.deepEqual(parseCSV('Name\tValue\nA\tB\n'), [['Name', 'Value'], ['A', 'B']])
})

test('CSV parser rejects oversized files, cells, columns and malformed quoted fields, and caps rows', () => {
  assert.throws(() => parseCSV('x'.repeat(8 * 1024 * 1024 + 1)), /smaller than 8 MB/)
  assert.throws(() => parseCSV('x'.repeat(10_001)), /10,000 characters/)
  assert.throws(() => parseCSV(Array(51).fill('x').join(',')), /more than 50 columns/)
  assert.throws(() => parseCSV('a,b\n"open quote'), /unclosed quote/)
  const rows = parseCSV(Array.from({ length: 1_050 }, (_, i) => `${i},value`).join('\n'))
  assert.equal(rows.length, 1002)
})

test('QR persisted state normalizes malicious content, styles, collection entries and bulk bounds', () => {
  const style = normalizeQrState('style', {
    ecc: '<svg>', margin: 999, dots: { shape: '<script>', scale: 10, color: 'url(javascript:1)', image: 'data:image/svg+xml,<svg/>' },
    bg: { type: 'script', fade: -50 }, logo: { upload: 'not-an-image', size: 0 }, frame: { style: '<img>', label: 'x'.repeat(100) },
  }, {})
  assert.equal(style.ecc, 'auto')
  assert.equal(style.margin, 8)
  assert.equal(style.dots.shape, 'soft')
  assert.equal(style.dots.scale, 1)
  assert.equal(style.dots.color, '#1A1411')
  assert.equal(style.dots.image, null)
  assert.equal(style.bg.type, 'solid')
  assert.equal(style.logo.upload, null)
  assert.equal(style.frame.label.length, 80)

  const bulk = normalizeQrState('bout', { kind: '__proto__', fmt: 'jpg', px: 99_999, cols: 0, rows: 99, numbered: 'yes' }, { kind: 'zip', fmt: 'png', px: 1024, cols: 3, rows: 4, numbered: false })
  assert.deepEqual([bulk.kind, bulk.fmt, bulk.px, bulk.cols, bulk.rows, bulk.numbered], ['zip', 'png', 4096, 1, 10, false])
  assert.equal(normalizeQrState('bpaste', 'a'.repeat(120_000), '').length, 100_000)

  const designs = normalizeQrState('designs', [{ id: '__proto__', type: 'url', payload: 'https://example.com', style: { dots: { shape: 'bad' } }, thumb: 'data:image/svg+xml,<svg/>' }], [])
  assert.equal(designs.length, 1)
  assert.notEqual(designs[0].id, '__proto__')
  assert.equal(designs[0].style.dots.shape, 'soft')
  assert.equal(designs[0].thumb, '')
  const duplicates = normalizeQrState('designs', [
    { id: 'same', type: 'url', payload: 'one' }, { id: 'same', type: 'url', payload: 'two' },
  ], [])
  assert.equal(new Set(duplicates.map((item) => item.id)).size, 2)
})

test('QR payload builders reject non-web schemes, preserve international phone prefixes and place UTM before fragments', () => {
  assert.equal(buildPayload('url', { url: 'javascript:alert(1)' }), '')
  assert.equal(buildPayload('url', { url: 'ftp://example.com' }), '')
  assert.equal(buildPayload('url', { url: 'example.com/path?ref=one#section', utm: true, src: 'poster', med: 'qr', cam: 'launch' }), 'https://example.com/path?ref=one&utm_source=poster&utm_medium=qr&utm_campaign=launch#section')
  assert.equal(buildPayload('phone', { num: '+92 (300) 123-4567' }), 'tel:+923001234567')
  assert.equal(buildPayload('sms', { num: '+92 300 1234567', msg: 'Hi' }), 'SMSTO:+923001234567:Hi')
})

test('QR rendering validates options and sanitizes caller-provided SVG identifiers', () => {
  const result = buildQR('A small QR payload', { frame: { style: 'label-bottom', label: '<script>alert(1)</script>' }, dots: { shape: '<script>' } }, 'x"><script>alert(1)</script>')
  assert.match(result.svg, /^<svg /)
  assert.match(result.svg, /&lt;SCRIPT&gt;/)
  assert.doesNotMatch(result.svg, /<script>/i)
  assert.doesNotMatch(result.svg, /id="x"/)
  assert.equal(result.style.dots.shape, 'soft')
})

test('bulk QR export rejects excessive, empty, oversized and cancelled batches before rasterization', async () => {
  await assert.rejects(() => bulkZip([], DEFAULT_STYLE), /between 1 and 1,000/)
  await assert.rejects(() => bulkZip(Array.from({ length: 1001 }, () => ({ text: 'code' })), DEFAULT_STYLE), /between 1 and 1,000/)
  await assert.rejects(() => bulkZip([{ text: 'x'.repeat(10_001) }], DEFAULT_STYLE), /10,000 characters/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(() => bulkZip([{ text: 'code' }], DEFAULT_STYLE, {}, null, controller.signal), { name: 'AbortError' })
})

test('QR parse handles malformed percent-encoding without throwing and safety flags executable payloads', () => {
  assert.doesNotThrow(() => parse('https://wa.me/923001234567?text=%E0%A4%A'))
  const malicious = parse('javascript:alert(1)')
  assert.equal(malicious.type, 'text')
  assert.equal(checkSafety(malicious).level, 'danger')
  assert.equal(parse('https://example.com').type, 'url')
  assert.equal(typeById('__proto__').id, 'url')
})

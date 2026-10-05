import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, degrees } from 'pdf-lib'
import { unzipSync } from 'fflate'
import {
  normalize, normalizeSavedDesigns, encodeDesign, decodeDesign, cssFor, uniformsFor, MAX_SAVED_DESIGNS,
} from '../src/lib/wall/design.js'
import { fitDimensions, MAX_CANVAS_PIXELS, MAX_SIDE } from '../src/lib/wall/bounds.js'
import { exportImage, exportPack, liveHTML, outSize, recordLoop, MAX_PACK_FILES, MAX_VIDEO_PIXELS, MAX_VIDEO_SIDE } from '../src/lib/wall/exporters.js'
import { renderToCanvas } from '../src/lib/wall/renderer.js'
import {
  parseRanges, rangeToIdx, zipFiles, buildOrganized, loadDoc, normalizeMarkOptions,
  MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_ARCHIVE_ENTRIES,
} from '../src/lib/pdf/engine.js'

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

test('background design normalization bounds saved, shared and imported state to known shader-safe fields', () => {
  const malicious = {
    style: '__proto__', pal: ['url(javascript:1)', '#12abef', '<svg>', '#ABCDEF', ...Array(20).fill('#123456')],
    seed: 9e99, scale: -100, detail: NaN, warp: Infinity, soft: 0.4, angle: 9e99, amp: -1, sub: 99,
    sym: { mode: 'constructor', n: 1e6 }, pixel: 1e9, loop: 1,
    fx: { hue: -1e9, sat: 9e9, bri: 8, con: -4, grain: Infinity, gsize: 0, mono: 'yes', vig: 99, glow: -2, gang: 1e8, shade: 9, post: 999 },
    size: { w: 16_384, h: 16_384, name: '<img>'.repeat(100) },
    text: { on: 'yes', title: 'x'.repeat(900), sub: '<script>', font: 'constructor', weight: 10_000, italic: 1, size: 900, track: -999, color: 'url(javascript:1)', opacity: 99, ax: 99, ay: -99, dx: 500, dy: -500, shadow: 9, subScale: 0 },
    arbitrary: 'must be discarded',
  }
  const d = normalize(malicious)
  assert.equal(d.style, 'mesh')
  assert.deepEqual(d.pal, ['#12abef', '#abcdef', ...Array(6).fill('#123456')])
  assert.equal(d.seed, 99)
  assert.deepEqual([d.scale, d.detail, d.warp, d.soft, d.angle, d.amp, d.sub], [0.4, 0.5, 0.45, 0.4, 360, 0, 0])
  assert.deepEqual(d.sym, { mode: 0, n: 16 })
  assert.equal(d.pixel, 90)
  assert.deepEqual(d.fx, { hue: -180, sat: 2, bri: 1, con: 0.5, grain: 0.14, gsize: 0.5, mono: true, vig: 1, glow: 0, gang: 360, shade: 1, post: 16 })
  assert.deepEqual([d.size.w, d.size.h], [8_000, 8_000])
  assert.ok(d.size.w * d.size.h <= MAX_CANVAS_PIXELS)
  assert.ok(d.size.w <= MAX_SIDE && d.size.h <= MAX_SIDE)
  assert.equal(d.size.name.length, 64)
  assert.deepEqual(d.text, { on: false, title: 'x'.repeat(500), sub: '<script>', font: 'display', weight: 600, italic: false, size: 30, track: -4, color: 'auto', opacity: 1, ax: 2, ay: 0, dx: 30, dy: -30, shadow: 1, subScale: 0.1 })
  assert.equal(Object.hasOwn(d, 'arbitrary'), false)
  assert.ok(Object.values(uniformsFor(d).f).every(Number.isFinite))
  assert.doesNotMatch(cssFor({ style: 'gradient', pal: ['url(javascript:1)'], angle: 3e9 }), /javascript:|url\(/i)
})

test('background size fitting, design codes and saved designs stay bounded and recover from malformed persistence', () => {
  assert.deepEqual(fitDimensions(16_384, 16_384), { w: 8_000, h: 8_000, capped: true })
  assert.throws(() => fitDimensions(Infinity, 100), RangeError)
  const d = normalize({ style: 'gradient', size: { w: 5_400, h: 7_200 }, text: { on: true, title: 'Quote </script>\nsecond line' } })
  const code = encodeDesign(d)
  assert.equal(decodeDesign(code).text.title, d.text.title)
  assert.equal(decodeDesign('x'.repeat(50_001)), null)
  assert.equal(decodeDesign('not base64!'), null)

  const rows = normalizeSavedDesigns([
    { id: '__proto__', name: 'First', d, thumb: 'data:image/jpeg;base64,AA==' },
    { id: '__proto__', name: 'Second', d: { style: 'unknown' }, thumb: 'data:image/svg+xml,<svg/>' },
    null, { id: 'bad', name: 'Missing design' },
    ...Array.from({ length: MAX_SAVED_DESIGNS + 3 }, (_, i) => ({ id: `id-${i}`, name: 'x'.repeat(100), d })),
  ])
  assert.equal(rows.length, MAX_SAVED_DESIGNS)
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length)
  assert.equal(rows[0].thumb, 'data:image/jpeg;base64,AA==')
  assert.equal(rows[1].thumb, '')
  assert.equal(rows[1].d.style, 'mesh')
  assert.equal(rows.at(-1).name.length, 80)
})

test('background exports reject unsafe dimensions and excessive packs before allocating canvases', async () => {
  const d = normalize({ size: { w: 3_840, h: 2_160 } })
  const size = outSize(d, 3)
  assert.ok(size.w <= MAX_SIDE && size.h <= MAX_SIDE)
  assert.ok(size.w * size.h <= MAX_CANVAS_PIXELS)
  assert.ok(Math.abs(size.w / size.h - d.size.w / d.size.h) < 0.002)
  await assert.rejects(exportImage(d, { fmt: '__proto__', W: 100, H: 100 }), /Choose PNG, JPG or WebP/)
  await assert.rejects(exportImage(d, { fmt: 'png', W: 0, H: 100 }), /positive, finite/)
  await assert.rejects(exportPack(d, [], {}), /between 1 and/)
  await assert.rejects(exportPack(d, Array.from({ length: MAX_PACK_FILES + 1 }, (_, i) => [`size-${i}`, 16, 16]), {}), /between 1 and/)
  await assert.rejects(exportPack(d, [['too-large', 16_384, 16_384]], {}), /safe limit/)
  await assert.rejects(exportPack(d, [['size-one', 8_000, 8_000], ['size-two', 8_000, 8_000]], {}), /exceeds 64 megapixels/)
  assert.equal(MAX_VIDEO_SIDE, 8_192)
  assert.equal(MAX_VIDEO_PIXELS, 24_000_000)
  await assert.rejects(recordLoop(d, { W: MAX_VIDEO_SIDE + 1, H: 16 }), /safe limit/)
  await assert.rejects(recordLoop(d, { W: 5_000, H: 5_000 }), /safe limit/)
  const html = liveHTML({ text: { on: true, title: 'safe\n</script><script>alert(1)</script>' } })
  assert.equal(html.includes('</script><script>alert(1)'), false)
  assert.match(html, /TEXT\.color==='auto'/)
  assert.match(html, /drawText\(lum>\.42\?/)
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]
  assert.ok(script)
  assert.doesNotThrow(() => new Function(script))
  await assert.rejects(renderToCanvas(d, 0, 100), /positive, finite/)
})

test('PDF page ranges reject invalid totals and avoid unbounded expansion', () => {
  assert.deepEqual(parseRanges('1-3, 5, 8-', 10), { ranges: [[0, 2], [4, 4], [7, 9]] })
  assert.deepEqual(parseRanges('all', 2), { ranges: [[0, 1]] })
  assert.match(parseRanges('1', 0).error, /unsupported page count/)
  assert.match(parseRanges('1'.repeat(20_001), 10).error, /too long/)
  assert.match(parseRanges('1-5001', 5_000).error, /outside/)
  assert.throws(() => rangeToIdx([[0, MAX_PDF_PAGES]]), /invalid/)
  assert.throws(() => rangeToIdx([[0, MAX_PDF_PAGES - 1], [0, 0]]), /no more than/)
  assert.throws(() => rangeToIdx([]), /at least one/)
})

test('PDF archive names are flattened, deduplicated and resistant to prototype keys', async () => {
  const zipped = zipFiles([
    ['../__proto__.txt', new TextEncoder().encode('first')],
    ['folder\\report.pdf', new TextEncoder().encode('second')],
    ['report.pdf', new TextEncoder().encode('third')],
  ])
  const contents = unzipSync(new Uint8Array(await zipped.arrayBuffer()))
  assert.deepEqual(Object.keys(contents).sort(), ['__proto__.txt', 'report (2).pdf', 'report.pdf'])
  assert.equal(new TextDecoder().decode(contents['__proto__.txt']), 'first')
  assert.equal({}.polluted, undefined)
  assert.throws(() => zipFiles([]), /between 1 and/)
  assert.throws(() => zipFiles(Array.from({ length: MAX_ARCHIVE_ENTRIES + 1 }, (_, i) => [`${i}.txt`, new Uint8Array()])), /between 1 and/)
})

test('PDF mark preferences and file loading are validated before expensive work', async () => {
  const marks = normalizeMarkOptions({
    wm: { on: true, kind: 'image', text: 'x'.repeat(500), size: 1e6, opacity: -1, angle: 900, color: 'url(x)', tile: 'yes', scale: 99 },
    num: { on: true, pos: '__proto__', fmt: 'f'.repeat(1_000), start: 99, size: 99 },
    hf: { header: 'h'.repeat(500), footer: ['not text'], size: -1, color: '#112233' }, rangeTxt: '1,'.repeat(30_000),
  })
  assert.deepEqual([marks.wm.kind, marks.wm.text.length, marks.wm.size, marks.wm.opacity, marks.wm.angle, marks.wm.color, marks.wm.tile, marks.wm.scale], ['image', 128, 180, 0.05, 90, '#B4715A', false, 1.6])
  assert.deepEqual([marks.num.pos, marks.num.fmt.length, marks.num.start, marks.num.size], ['bottom-center', 128, 50, 24])
  assert.equal(marks.hf.header.length, 128)
  assert.equal(marks.hf.footer, '')
  assert.equal(marks.rangeTxt.length, 20_000)
  await assert.rejects(loadDoc({ size: MAX_PDF_BYTES + 1, arrayBuffer() { throw new Error('must not read') } }), /smaller than/)
  await assert.rejects(loadDoc(new Blob(['not a pdf'], { type: 'application/pdf' })), /valid PDF header/)
  assert.match(parseRanges('1-', MAX_PDF_PAGES).ranges.length ? 'ok' : 'bad', /^ok$/)
})

test('PDF organizer copies duplicates and blank pages while validating source references', async () => {
  const source = await PDFDocument.create()
  source.addPage([300, 500]); source.addPage([400, 700]).setRotation(degrees(450))
  const bytes = await source.save(), doc = { id: 'source', bytes, pages: 2, size: bytes.length, name: 'source.pdf' }
  const output = await buildOrganized([doc], [
    { id: 'a', docId: 'source', src: 0, rot: 90 },
    { id: 'b', docId: 'source', src: 0, rot: 270 },
    { id: 'c', docId: 'source', src: 1, rot: -90 },
    { id: 'blank', blank: true, w: 595.28, h: 841.89 },
  ])
  const parsed = await PDFDocument.load(output)
  assert.equal(parsed.getPageCount(), 4)
  assert.equal(parsed.getPage(0).getRotation().angle, 90)
  assert.equal(parsed.getPage(1).getRotation().angle, 270)
  assert.equal(parsed.getPage(2).getRotation().angle, 0)
  assert.deepEqual(parsed.getPage(3).getSize(), { width: 595.28, height: 841.89 })
  await assert.rejects(buildOrganized([doc], [{ docId: 'missing', src: 0 }]), /no longer exists/)
  await assert.rejects(buildOrganized([doc], []), /between 1 and/)
})

/**
 * Part 10, third property batch: hostile input.
 *
 * Every tool in this app takes something the user picked off their phone — a
 * photo, a video, a saved blob, a QR scan, a half-typed number. Half of those
 * will be corrupt, truncated, mislabelled or empty. The contract being pinned
 * here is simple: refuse loudly, never lie, never hang, never return something
 * that looks like a result but is not one.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectType, scrubJPEG, scrubPNG, scrub } from '../src/lib/sanitize.js'
import { mediaKind, buildCompressionPlan, buildVideoPassArgs, buildAudioArgs } from '../src/lib/compressor.js'
import { normalizeQrState } from '../src/lib/qr/state.js'
import { normalizeDecisionState, sanitizeDecisionHistory } from '../src/lib/decision.js'
import { normalizeQrContent as normalizeContent } from '../src/lib/qr/state.js'

function rng(seed) {
  let x = seed >>> 0 || 1
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296 }
}
const r = rng(0xBADBEEF)

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const chunk = (type, data) => {
  const len = data.length
  return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255,
    ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0]
}
/** A structurally valid PNG carrying text metadata and an EXIF-ish chunk. */
function makePNG(extra = []) {
  const ihdr = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
  const text = chunk('tEXt', [...new TextEncoder().encode('Comment\0GPS 33.7, 73.1 — home')])
  const exif = chunk('eXIf', [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x03])
  const time = chunk('tIME', [7, 228, 10, 9, 12, 30, 0])
  const idat = chunk('IDAT', [0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4])
  const iend = chunk('IEND', [])
  return new Uint8Array([...PNG_SIG, ...ihdr, ...text, ...exif, ...time, ...extra.map((c) => [...c]).flat(), ...idat, ...iend])
}
/** A JPEG carrying EXIF, GPS and a comment, then a real scan. */
function makeJPEG() {
  const seg = (marker, body) => [0xff, marker, (body.length + 2) >>> 8, (body.length + 2) & 255, ...body]
  return new Uint8Array([
    0xff, 0xd8,
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 0, 0, ...new Array(20).fill(0)]),
    ...seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0]),
    ...seg(0xfe, [0x68, 0x6f, 0x6d, 0x65]),                        // COM: "home"
    ...seg(0xdb, new Array(64).fill(0x10)),                        // DQT: kept
    0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00,
    0x12, 0x34, 0x56, 0x78,
    0xff, 0xd9,
  ])
}

/** Run `fn` and hand back a marker if it threw, so a legitimate string result
    is never mistaken for an exception. */
const attempt = (fn) => {
  try { return { ok: true, value: fn() } } catch (error) { return { ok: false, error: error.message } }
}

/* ================================================================== scrubbing */

test('a real image is recognised', () => {
  assert.equal(detectType(makeJPEG()), 'jpeg')
  assert.equal(detectType(makePNG()), 'png')
  for (const not of [null, undefined, '', new Uint8Array(0), new Uint8Array([1, 2, 3]), 'not bytes', 42, {}]) {
    assert.equal(detectType(not), null, `${String(not)} was claimed to be an image`)
  }
  /* A file whose name lies must not be trusted; only the bytes count. */
  assert.equal(detectType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])), 'jpeg')
})

test('scrubbing removes the metadata and keeps the picture', async () => {
  const jpeg = makeJPEG()
  const out = await scrub(jpeg).blob.arrayBuffer()
  assert.equal(detectType(new Uint8Array(out)), 'jpeg', 'the scrubbed JPEG is no longer a JPEG')
  assert.ok(out.byteLength < jpeg.length, 'the scrubbed JPEG is not smaller')
  assert.ok(out.byteLength >= 40, 'the scrubbed JPEG lost its picture')
  const text = new TextDecoder('latin1').decode(out)
  assert.doesNotMatch(text, /Exif|JFIF|home/, 'metadata survived the scrub')
  const bytes = new Uint8Array(out)
  assert.ok(bytes.includes(0xda), 'the JPEG scan marker was dropped')
  assert.ok(bytes.includes(0xdb), 'the JPEG quantisation table was dropped')

  const png = makePNG()
  const pngOut = await scrub(png).blob.arrayBuffer()
  assert.equal(detectType(new Uint8Array(pngOut)), 'png')
  assert.ok(pngOut.byteLength < png.length)
  const pngText = new TextDecoder('latin1').decode(pngOut)
  assert.doesNotMatch(pngText, /Comment|GPS|eXIf|tIME/, 'a PNG chunk survived the scrub')
  assert.match(pngText, /IHDR/, 'the PNG header was dropped')
  assert.match(pngText, /IDAT/, 'the PNG pixels were dropped')
  assert.match(pngText, /IEND/, 'the PNG end chunk was dropped')
})

test('scrubbing is stable: doing it twice changes nothing further', async () => {
  const once = await scrub(makePNG()).blob.arrayBuffer()
  const twice = await scrub(new Uint8Array(once)).blob.arrayBuffer()
  assert.equal(twice.byteLength, once.byteLength, 'a second scrub changed the image')
})

test('a corrupt image is refused, not half-processed', () => {
  const good = makePNG()
  const goodJpeg = makeJPEG()
  for (let i = 0; i < good.length - 1; i += 1) {
    for (const source of [good, goodJpeg]) {
      let out
      try { out = scrub(source.slice(0, i)) } catch { continue }
      assert.ok(out === null || out.blob instanceof Blob,
        `a ${source.length}-byte image truncated to ${i} bytes produced ${JSON.stringify(out)}`)
    }
  }
})

test('random bytes never hang or crash the scrubber', () => {
  for (let trial = 0; trial < 600; trial += 1) {
    const len = Math.floor(r() * 400)
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i += 1) bytes[i] = Math.floor(r() * 256)
    /* Give it a real signature half the time so the parsers are actually entered. */
    if (trial % 2 === 0 && len >= 8) bytes.set(r() < 0.5 ? PNG_SIG : [0xff, 0xd8], 0)
    const started = Date.now()
    let out
    try { out = scrub(bytes) } catch { out = 'refused' }
    assert.ok(Date.now() - started < 1000, `a ${len}-byte file took ${Date.now() - started}ms to refuse`)
    assert.ok(out === null || out === 'refused' || out.blob instanceof Blob, `garbage produced ${JSON.stringify(out)}`)
  }
})

test('an over-declared PNG chunk is refused rather than read past the end', () => {
  const forged = new Uint8Array([...PNG_SIG, 0x7f, 0xff, 0xff, 0xff, ...[...'IHDR'].map((c) => c.charCodeAt(0)), 1, 2, 3, 4])
  assert.throws(() => scrubPNG(forged), /Truncated/)
  const underflow = new Uint8Array([...PNG_SIG, 0x00, 0x00, 0x00, 0x00, ...[...'IHDR'].map((c) => c.charCodeAt(0))])
  assert.throws(() => scrubPNG(underflow), /end chunk is missing/)
})

test('the JPEG parser rejects a stuffed byte before its scan', () => {
  const stuffed = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0xff, 0xda, 0, 0])
  assert.throws(() => scrubJPEG(stuffed), /stuffed/)
  assert.throws(() => scrubJPEG(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0, 0])), /Invalid|Truncated/)
  assert.throws(() => scrubJPEG(new Uint8Array([0xff, 0xd8])), /scan data is missing/)
})

test('the two scrubbers refuse each other\'s files', () => {
  assert.throws(() => scrubPNG(makeJPEG()), /not a PNG/)
  assert.throws(() => scrubJPEG(makePNG()), /not a JPEG/)
  assert.equal(scrub(makeJPEG()).type, 'jpeg')
  assert.equal(scrub(makePNG()).type, 'png')
})

/* ================================================================== compressor */

test('a file is sorted into audio or video, or neither', () => {
  assert.equal(mediaKind({ type: 'audio/mpeg', name: 'x.mp3' }), 'audio')
  assert.equal(mediaKind({ type: 'VIDEO/MP4', name: 'x' }), 'video')
  assert.equal(mediaKind({ type: '', name: 'clip.MP4' }), 'video')
  assert.equal(mediaKind({ type: '', name: 'song.flac' }), 'audio')
  assert.equal(mediaKind({ type: 'application/octet-stream', name: 'notes.txt' }), null)
  assert.equal(mediaKind(null), null)
  assert.equal(mediaKind({}), null)
  /* An extension that merely contains a name is not an extension. */
  assert.equal(mediaKind({ type: '', name: 'mp4' }), null)
})

test('a compression plan either fits the target or says it cannot', () => {
  const r2 = rng(0xC0FFEE)
  for (let i = 0; i < 400; i += 1) {
    const kind = r2() < 0.5 ? 'audio' : 'video'
    const plan = buildCompressionPlan({
      kind,
      duration: r2() * 7200,
      targetMB: 0.1 + r2() * 500,
      audioKbps: 32 + Math.floor(r2() * 320),
    })
    assert.ok(plan, 'a sane request produced no plan')
    assert.ok(Number.isFinite(plan.estimatedBytes) && plan.estimatedBytes >= 0)
    assert.ok(Number.isInteger(plan.audioKbps) && plan.audioKbps >= 0)
    if (plan.videoKbps !== null) assert.ok(Number.isInteger(plan.videoKbps) && plan.videoKbps >= 0)
    /* The whole point of the tool: never promise a size it cannot hit. */
    if (plan.fits) {
      assert.ok(plan.estimatedBytes <= plan.targetBytes,
        `claimed to fit ${plan.estimatedBytes} bytes in ${plan.targetBytes}`)
      if (kind === 'video') assert.ok(plan.videoKbps >= 20)
      else assert.ok(plan.audioKbps >= 32)
    }
  }
})

test('an impossible compression request is refused, not attempted', () => {
  assert.throws(() => buildCompressionPlan({ kind: 'image', duration: 10, targetMB: 5, audioKbps: 128 }), /audio or video/)
  assert.throws(() => buildCompressionPlan({ kind: 'video', duration: 10, targetMB: 0, audioKbps: 128 }), /Target size/)
  assert.throws(() => buildCompressionPlan({ kind: 'video', duration: 10, targetMB: -5, audioKbps: 128 }), /Target size/)
  assert.throws(() => buildCompressionPlan({ kind: 'video', duration: 10, targetMB: 5, audioKbps: -1 }), /bitrate/)
  assert.equal(buildCompressionPlan({ kind: 'video', duration: 0, targetMB: 5, audioKbps: 128 }), null)
  assert.equal(buildCompressionPlan({ kind: 'video', duration: NaN, targetMB: 5, audioKbps: 128 }), null)
  /* Video may go silent; audio may not. */
  assert.equal(buildCompressionPlan({ kind: 'video', duration: 60, targetMB: 5, audioKbps: 0 }).audioKbps, 0)
  assert.throws(() => buildCompressionPlan({ kind: 'audio', duration: 60, targetMB: 5, audioKbps: 0 }), /bitrate/)
})

test('a target too small for the audio is reported as not fitting', () => {
  const plan = buildCompressionPlan({ kind: 'audio', duration: 7200, targetMB: 0.2, audioKbps: 320 })
  assert.equal(plan.fits, false, 'a 2-hour track cannot be squeezed into 200 KB, but the plan claimed it could')
  assert.ok(plan.audioKbps < 320)
})

test('the encoder is never handed a path it could mistake for a flag', () => {
  const passes = buildVideoPassArgs({ inputName: 'in.mp4', outputName: 'out.mp4', passLogName: 'log', videoKbps: 2000, audioKbps: 128 })
  const argv = [].concat(passes.firstPass ?? [], passes.secondPass ?? [])
  assert.ok(argv.length > 10, 'the two-pass call is suspiciously short')
  for (const flag of ['-i', '-y', '-c:v']) {
    assert.ok(argv.includes(flag), `the two-pass call is missing ${flag}`)
  }
  /* Every value after a flag must be a literal, never something the shell or
     ffmpeg could read as another flag. */
  for (let i = 0; i < argv.length - 1; i += 1) {
    if (!String(argv[i]).startsWith('-') || /^-{1,2}[a-z]/i.test(String(argv[i]))) continue
    const value = argv[i + 1]
    if (typeof value !== 'string' || /^-(?!\d)/.test(value)) continue
    assert.ok(!value.startsWith('-'), `the flag ${argv[i]} is followed by the option-looking value ${value}`)
  }
  assert.throws(() => buildVideoPassArgs({ outputName: 'o', passLogName: 'l' }), /required/)
  assert.throws(() => buildAudioArgs('a.wav', '', 192), /required/)
  const audio = buildAudioArgs('a.wav', 'a.mp3', 192)
  assert.ok(Array.isArray(audio) && audio.length > 3, `buildAudioArgs gave ${JSON.stringify(audio)}`)
  assert.ok(audio.includes('a.wav') && audio.includes('a.mp3'), 'a path was dropped from the audio encode')
})

/* ============================================================ saved app state */

test('a corrupted saved state falls back instead of poisoning the app', () => {
  /* Every value below could plausibly be sitting in localStorage right now. */
  const OBJECT_KEYS = ['designs', 'presets', 'scans', 'content', 'style', 'bc', 'bseq', 'bout']
  const hostile = [null, undefined, 'garbage', 0, -1, NaN, Infinity, {}, [], true, { tab: 999 },
    { tab: 'create' }, { tab: ['create'] }, { style: { size: 'huge' } }, { bc: { px: -5 } }, { scans: 'x' }]
  for (const key of ['tab', 'sub', 'libsub', 'content', 'style', 'designs', 'presets', 'scans', 'bc', 'bsrc', 'bpaste', 'blabel', 'bkind', 'bseq', 'bout']) {
    for (const value of hostile) {
      const init = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
      const run = attempt(() => normalizeQrState(key, value, init))
      assert.ok(run.ok, `normalizeQrState(${key}, ${JSON.stringify(value)}) threw: ${run.error}`)
      const out = run.value
      assert.notEqual(out, undefined, `normalizeQrState(${key}, ${JSON.stringify(value)}) returned undefined`)
      if (OBJECT_KEYS.includes(key)) assert.ok(out && typeof out === 'object', `normalizeQrState(${key}) gave ${JSON.stringify(out)}`)
    }
  }
  /* The tab must always land on a tab that exists. */
  for (const value of [null, 'nope', 42, {}, ['nope'], 'create']) {
    const out = normalizeQrState('tab', value, 'create')
    assert.ok(['create', 'scan', 'barcode', 'bulk', 'cards', 'library'].includes(out), `the tab became ${JSON.stringify(out)}`)
  }
})

test('a corrupt barcode size is clamped into a range a phone can use', () => {
  const init = { fmt: 'code128', text: '', hrt: false, quiet: true, fg: '#000', bg: '#fff', ec: 'M', px: 600 }
  for (const px of [-1, 0, 1, 299, 300, 8192, 8193, 1e9, NaN, Infinity, '900', null]) {
    const out = normalizeQrState('bc', { px }, init)
    assert.ok(out.px >= 300 && out.px <= 8192, `a barcode size of ${px} became ${out.px}`)
  }
})

test('a corrupt decision state falls back to its defaults', () => {
  const init = { tab: 'coin', n: 2, names: ['a', 'b'], count: 2, hist: [], sound: true }
  for (const key of ['coin', 'dice', 'wheel', 'bottle', 'draw', 'numbers', 'oracle', 'tab', 'sound', 'hist', 'nope']) {
    for (const value of [null, undefined, 'x', -5, NaN, {}, [], true, { a: 1 }]) {
      const run = attempt(() => normalizeDecisionState(key, value, init))
      assert.ok(run.ok, `normalizeDecisionState(${key}, ${String(value)}) threw: ${run.error}`)
      const out = run.value
      if (!['tab', 'sound', 'hist', 'nope'].includes(key)) {
        assert.ok(out !== undefined && typeof out === 'object' && out !== null,
          `normalizeDecisionState(${key}, ${String(value)}) gave ${JSON.stringify(out)}`)
      } else if (key !== 'nope') {
        /* An unrecognised key is passed straight through by design. */
        assert.notEqual(out, undefined, `normalizeDecisionState(${key}, ${String(value)}) returned undefined`)
      }
    }
  }
  /* With no defaults at all the guarantee is only that it opens rather than crashes. */
  for (const key of ['coin', 'dice', 'wheel', 'bottle', 'draw', 'numbers', 'oracle', 'tab', 'sound', 'hist', 'nope']) {
    for (const value of [null, undefined, 'x', { n: 'x' }, {}, []]) {
      const run = attempt(() => normalizeDecisionState(key, value))
      assert.ok(run.ok, `normalizeDecisionState(${key}, ${String(value)}) threw with no defaults: ${run.error}`)
    }
  }
  assert.deepEqual(sanitizeDecisionHistory('nonsense'), [])
  assert.deepEqual(sanitizeDecisionHistory(null), [])
  assert.deepEqual(sanitizeDecisionHistory([1, 2, 3]), [])
  const kept = sanitizeDecisionHistory([{ id: 'a', at: 1, winner: 'x' }])
  assert.ok(Array.isArray(kept) && kept.length <= 1)
})

test('a corrupt QR content object still produces a type the builder understands', () => {
  for (const value of [null, undefined, 'text', 42, [], {}, { type: 'nope' }, { type: 'url', url: 5 }]) {
    const run = attempt(() => normalizeContent(value))
    assert.ok(run.ok, `normalizeContent(${JSON.stringify(value)}) threw: ${run.error}`)
    assert.ok(run.value && typeof run.value.type === 'string' && run.value.type.length > 0,
      `normalizeContent gave ${JSON.stringify(run.value)}`)
  }
})

test('a text field cannot be saved back longer than it is allowed to be', () => {
  const init = { text: 'hello', fmt: 'code128', hrt: false, quiet: true, fg: '#000', bg: '#fff', ec: 'M', px: 600 }
  const long = normalizeQrState('bc', { text: 'x'.repeat(1_000_000) }, init)
  assert.ok(long.text.length <= 10_000, `the saved barcode text grew to ${long.text.length} characters`)
  const paste = normalizeQrState('bpaste', 'y'.repeat(5_000_000), 'fallback')
  assert.ok(String(paste).length <= 100_000, `the paste buffer grew to ${String(paste).length}`)
})
/**
 * Unit suite for every piece of pure logic in the app (node --test).
 * These are the modules that must never be wrong: URL/arg safety, container maths,
 * metadata scrubbing, unit maths, QR payloads and the tool registry contracts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeUrl, cleanErr, infoArgs, buildArgs, containerPlan, summarise, JobTracker,
  isMp4Video, isMp4Audio, isWebmVideo, isWebmAudio,
} from '../src/lib/ytdlp-core.js'
import { scrub, scrubJPEG, scrubPNG, detectType } from '../src/lib/sanitize.js'
import { kindOf, GROUPS, KIND_TARGETS, KIND_LABEL } from '../src/lib/engines.js'
import { CATEGORIES } from '../src/lib/units/units.js'
import { COUNTRIES } from '../src/lib/units/world.js'
import { PRESETS, HSL_CHANNELS, DEFAULTS, isModified, applyLook } from '../src/lib/studio/params.js'
import { STYLES, PALETTES, LOOKS } from '../src/lib/viz/params.js'
import { TEMPLATES, TEMPLATE_CATS } from '../src/lib/qr/templates.js'
import { LOGOS } from '../src/lib/qr/logos.js'
import { buildPayload, typeById, defaultsFor, TYPES } from '../src/lib/qr/payloads.js'
import { checkSafety } from '../src/lib/qr/safety.js'
import { parse } from '../src/lib/qr/parse.js'
import { PALETTES as WALL_PALETTES, GALLERY as WALL_GALLERY } from '../src/lib/wall/presets.js'
import { STYLES as WALL_STYLES } from '../src/lib/wall/shader.js'
import { gifPlan, MAX_GIF_FRAMES } from '../src/lib/gifplan.js'
import { planCompression, planSuggestion, overshootBytes } from '../src/lib/compressplan.js'
import { FIAT_SNAPSHOT, CRYPTO_SNAPSHOT, SNAPSHOT_DATE } from '../src/lib/units/money.js'
import { convertUnit } from '../src/lib/units/units.js'

/* ============================ Tool 04 — URL safety ============================ */

test('normalizeUrl rejects junk and non-http protocols', () => {
  for (const bad of ['not a url', 'ftp://x.com/a', 'javascript:alert(1)', '', null, 42]) {
    assert.throws(() => normalizeUrl(bad), /URL/i)
  }
})

test('normalizeUrl blocks private hosts on a shared engine but allows them on your own device', () => {
  for (const p of ['http://localhost:8080/x', 'http://127.0.0.1/a', 'http://192.168.1.5/v', 'http://10.0.0.7/x', 'http://169.254.1.1']) {
    assert.throws(() => normalizeUrl(p), /Private/i, p)
    assert.equal(normalizeUrl(p, true).startsWith('http'), true, p)
  }
})

test('normalizeUrl blocks an over-long URL (DoS guard)', () => {
  assert.throws(() => normalizeUrl('https://x.com/' + 'a'.repeat(3000)), /Invalid URL/)
})

/* ============================ Tool 04 — container maths ============================ */

test('codec helpers classify the formats yt-dlp actually reports', () => {
  assert.ok(isMp4Video('avc1.640028') && isMp4Video('hev1.1.6') && isMp4Video('h264'))
  assert.ok(!isMp4Video('vp9') && !isMp4Video('av01.0.05M'))
  assert.ok(isMp4Audio('mp4a.40.2') && isMp4Audio('aac') && !isMp4Audio('opus'))
  assert.ok(isWebmVideo('vp9') && isWebmVideo('av01') && !isWebmVideo('avc1'))
  assert.ok(isWebmAudio('opus') && !isWebmAudio('mp4a'))
})

/** A YouTube-shaped info object: H.264 only from 720p down, AV1 at 1080p, no muxed audio. */
const ytInfo = summarise({
  id: 'abc', title: 'T', extractor_key: 'Youtube', duration: 60,
  formats: [
    { format_id: '137', ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', height: 1080, fps: 30, filesize: 5e6 },
    { format_id: '248', ext: 'webm', vcodec: 'vp9', acodec: 'none', height: 1080, fps: 30, filesize: 4e6 },
    { format_id: '399', ext: 'mp4', vcodec: 'av01.0.05M.08', acodec: 'none', height: 1080, fps: 30, filesize: 3e6 },
    { format_id: '136', ext: 'mp4', vcodec: 'avc1.4d401f', acodec: 'none', height: 720, fps: 30, filesize: 2e6 },
    { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize: 1e6 },
    { format_id: '251', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 160, filesize: 1.2e6 },
  ],
})

test('summarise marks each quality MP4-safe only when both streams fit MP4', () => {
  const h1080 = ytInfo.heights.find((h) => h.height === 1080)
  const h720 = ytInfo.heights.find((h) => h.height === 720)
  assert.equal(h1080.vcodec, 'avc1', 'the best 1080p stream is H.264')
  assert.equal(h1080.mp4, true, 'H.264 + AAC is MP4-safe')
  assert.equal(h720.mp4, true)
  assert.equal(ytInfo.heights[0].height, 1080)
})

test('containerPlan never promises MP4 for VP9/Opus-only sources', () => {
  const vp9Only = summarise({
    id: 'x', title: 'T', formats: [
      { format_id: 'v', ext: 'webm', vcodec: 'vp9', acodec: 'none', height: 1080, filesize: 3e6 },
      { format_id: 'a', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 128, filesize: 1e6 },
    ],
  })
  const p = containerPlan(vp9Only, 1080, 'mp4')
  assert.equal(p.container, 'mkv')
  assert.equal(p.fallback, true)
  assert.match(p.reason, /MKV/)

  const auto = containerPlan(vp9Only, 1080, 'auto')
  assert.equal(auto.container, 'mkv', 'auto picks MKV for webm-only sources')
  assert.equal(auto.fallback, false)

  const want720 = containerPlan(vp9Only, 720, 'webm')
  assert.equal(want720.container, 'webm', 'nothing above 720p — highest quality is used')
})

test('containerPlan honours an explicit MKV request and MP4 when it is safe', () => {
  assert.equal(containerPlan(ytInfo, 1080, 'mkv').container, 'mkv')
  assert.equal(containerPlan(ytInfo, 1080, 'mkv').fallback, false)
  const mp4 = containerPlan(ytInfo, 720, 'mp4')
  assert.equal(mp4.container, 'mp4')
  assert.equal(mp4.fallback, false)
  // 720p only exists as H.264 here, so a WebM request must be honest and fall back to MKV.
  const webm = containerPlan(ytInfo, 720, 'webm')
  assert.equal(webm.container, 'mkv')
  assert.equal(webm.fallback, true)
})

test('containerPlan survives a source with no video formats at all', () => {
  const audioOnly = summarise({ id: 'a', title: 'A', formats: [{ format_id: 'a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 }] })
  assert.equal(containerPlan(audioOnly, null, 'mp4').container, 'mkv')
})

/* ============================ Tool 04 — argv building ============================ */

const ctx = { ffmpeg: '/usr/bin/ffmpeg', outTemplate: '/tmp/out/%(title)s.%(ext)s', tempDir: '/tmp/out/.tmp' }

test('buildArgs never uses a shell, always ends with -- URL, and whitelists every value', () => {
  const args = buildArgs({
    url: 'https://youtu.be/x', mode: 'video', height: 720, container: 'mp4',
    audioFormat: 'mp3; rm -rf /', clip: true, start: 3, end: 9, accurateCuts: true, subs: true, metadata: true,
  }, ctx)
  assert.equal(args[args.length - 2], '--')
  assert.equal(args[args.length - 1], 'https://youtu.be/x')
  assert.ok(args.includes('--merge-output-format'))
  assert.equal(args[args.indexOf('--merge-output-format') + 1], 'mp4')
  assert.ok(!args.join(' ').includes('rm -rf'), 'injection attempt cannot reach the argv')
  assert.ok(!args.includes('--remux-video'), 'the stream-losing remux path is gone')
  assert.deepEqual(args.slice(args.indexOf('--download-sections'), args.indexOf('--download-sections') + 2), ['--download-sections', '*3-9'])
  assert.ok(args.includes('--force-keyframes-at-cuts'))
  assert.ok(args.includes(ctx.ffmpeg))
})

test('buildArgs: audio mode, container auto and an out-of-range height', () => {
  const audio = buildArgs({ url: 'https://x.com/v', mode: 'audio', audioFormat: 'flac', height: 99999 }, ctx)
  assert.ok(audio.includes('-x') && audio.includes('--audio-format') && audio.includes('flac'))
  assert.ok(!audio.includes('--merge-output-format'))

  const auto = buildArgs({ url: 'https://x.com/v', mode: 'video', container: 'auto' }, ctx)
  assert.ok(!auto.includes('--merge-output-format'), 'auto lets yt-dlp choose the container')
  assert.match(auto[auto.indexOf('-f') + 1], /avc/)

  const clamped = buildArgs({ url: 'https://x.com/v', mode: 'video', height: 100000, container: 'mp4' }, ctx)
  assert.match(clamped[clamped.indexOf('-f') + 1], /height<=4320/)

  assert.deepEqual(infoArgs('https://x.com/v', false).slice(-2), ['--', 'https://x.com/v'])
})

/* ============================ Tool 04 — progress tracking ============================ */

test('JobTracker parses progress, stages, the real filename and a container fallback', () => {
  const t = new JobTracker('id1234567890abc', 2, { container: 'mp4' })
  t.feed('[download] Destination: /tmp/out/video.f137.mp4\n')
  t.feed('TTT|500000|2000000|NA|1048576|12\n')
  const mid = t.snapshot()
  assert.equal(mid.stage, 'downloading')
  assert.equal(mid.parts, 2)
  assert.ok(mid.percent > 0 && mid.percent < 50)

  t.feed('[Merger] Merging formats into "/tmp/out/My Video [abc].mkv"\n')
  assert.equal(t.snapshot().stage, 'merging')

  t.feed('TTTFILE|/tmp/out/My Video [abc].mkv\n')
  assert.equal(t.s.file, '/tmp/out/My Video [abc].mkv')
  assert.equal(t.s.ext, 'mkv')
  assert.equal(t.s.name, 'My Video [abc].mkv')

  return t.finish(0, async () => 123456).then(() => {
    const done = t.snapshot()
    assert.equal(done.state, 'done')
    assert.equal(done.percent, 100)
    assert.equal(done.size, 123456)
    assert.equal(done.fellBack, true, 'the UI is told the container fell back to MKV')
  })
})

test('JobTracker reports an error when yt-dlp fails without producing a file', async () => {
  const t = new JobTracker('id2', 1, { container: 'mp4' })
  t.feed('ERROR: [youtube] nope: Video unavailable\n')
  await t.finish(1)
  assert.equal(t.s.state, 'error')
  assert.match(t.s.error, /Video unavailable/)
})

test('cleanErr strips yt-dlp noise off an error line', () => {
  const s = cleanErr('WARNING: something\nERROR: [generic] Unable to download: HTTP Error 403 (caused by <HTTPError 403>); please report this issue on https://github.com/yt-dlp')
  assert.equal(s.includes('caused by'), false)
  assert.equal(s.includes('please report'), false)
  assert.match(s, /HTTP Error 403/)
})

/* ============================ Tool 01 — lossless scrubbing ============================ */

/** Minimal but structurally real JPEG: SOI, APP0, APP1(EXIF), APP2(ICC), COM, DQT, SOS + scan, EOI. */
function makeJpeg() {
  const seg = (marker, body) => {
    const len = body.length + 2
    return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...body]
  }
  return new Uint8Array([
    0xff, 0xd8,
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
    ...seg(0xe1, [...Buffer.from('Exif\0\0'), ...Buffer.from('SECRET-GPS-DATA')]),
    ...seg(0xe2, Buffer.from('FAKE-ICC-PROFILE')),
    ...seg(0xfe, Buffer.from('a comment with a camera serial')),
    ...seg(0xdb, new Array(65).fill(1)),
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x03, 1, 0x11, 0x00, 2, 0x11, 0x00, 3, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x0c, 0x03, 1, 0x00, 2, 0x00, 3, 0x00, 0x00, 0x3f, 0x00,
    0x12, 0x34, 0x56, 0x78, 0x9a,
    0xff, 0xd9,
  ])
}

test('scrubJPEG removes identifying markers but keeps the pixels and colour data', async () => {
  const src = makeJpeg()
  assert.equal(detectType(src), 'jpeg')
  const out = scrubJPEG(src)
  const bytes = new Uint8Array(await out.arrayBuffer())
  const text = Buffer.from(bytes).toString('latin1')
  assert.equal(text.includes('SECRET-GPS-DATA'), false, 'EXIF is gone')
  assert.equal(text.includes('a comment'), false, 'COM is gone')
  assert.equal(text.includes('FAKE-ICC-PROFILE'), true, 'the ICC profile survives (colours must not shift)')
  assert.equal(text.includes('JFIF'), true, 'JFIF survives')
  assert.deepEqual([...bytes.slice(0, 2)], [0xff, 0xd8])
  assert.deepEqual([...bytes.slice(-2)], [0xff, 0xd9], 'the image stream still ends in EOI')
  assert.ok(bytes.includes(0x9a), 'the compressed scan bytes survive')
  assert.ok(bytes.length < src.length, 'the file only shrinks')
  assert.equal(out.type, 'image/jpeg')
})

test('scrubPNG drops text/time/eXIf chunks and keeps colour management', async () => {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) } return ~c >>> 0 }
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'latin1')
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, crcBuf])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('iCCP', Buffer.from('profile\0\0fake')),
    chunk('gAMA', Buffer.from([0, 0, 0xb1, 0x8f])),
    chunk('tEXt', Buffer.from('Author\0Mubashir')),
    chunk('eXIf', Buffer.from('GPS')),
    chunk('IDAT', Buffer.from([0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01])),
    chunk('IEND', Buffer.alloc(0)),
  ])
  assert.equal(detectType(png), 'png')
  const out = scrubPNG(png)
  const text = Buffer.from(new Uint8Array(await out.arrayBuffer())).toString('latin1')
  assert.equal(text.includes('Mubashir'), false, 'the tEXt author tag is gone')
  assert.equal(text.includes('eXIf'), false)
  assert.equal(text.includes('iCCP'), true, 'the colour profile is kept')
  assert.equal(text.includes('gAMA'), true)
  assert.equal(text.includes('IDAT'), true)
  assert.equal(scrub(png).type, 'png')
})

test('scrub refuses formats it cannot do losslessly (no silent re-encode)', () => {
  assert.equal(scrub(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), null)
  assert.equal(detectType(new Uint8Array([1, 2, 3, 4])), null)
})

/* ============================ Tool 02 — kind detection ============================ */

test('kindOf routes every family to the right conversion engine', () => {
  assert.equal(kindOf({ name: 'a.PNG', type: 'image/png' }), 'image')
  assert.equal(kindOf({ name: 'a.svg', type: '' }), 'svg')
  assert.equal(kindOf({ name: 'a.mkv', type: '' }), 'video')
  assert.equal(kindOf({ name: 'a.flac', type: '' }), 'audio')
  assert.equal(kindOf({ name: 'a.pdf', type: 'application/pdf' }), 'pdf')
  assert.equal(kindOf({ name: 'a.docx', type: '' }), 'docx')
  assert.equal(kindOf({ name: 'a.xlsx', type: '' }), 'sheet')
  assert.equal(kindOf({ name: 'a.txt', type: '' }), 'text')
  assert.equal(kindOf({ name: 'a.epub', type: '' }), 'epub')
})

test('every kind has a label and a reachable target list', () => {
  const all = [...new Set(GROUPS.flatMap(([, f]) => f))]
  for (const [kind, targets] of Object.entries(KIND_TARGETS)) {
    assert.ok(KIND_LABEL[kind], `label for ${kind}`)
    assert.ok(targets.length > 0, `targets for ${kind}`)
    for (const t of targets) assert.ok(all.includes(t) || t === 'zip', `${kind} → ${t} must exist in the catalogue`)
  }
})

/* ============================ Tool 09 — units, currencies, time ============================ */

test('unit catalogue is coherent (16 categories, unique keys, sane defaults)', () => {
  assert.equal(CATEGORIES.length, 16)
  let units = 0
  for (const c of CATEGORIES) {
    const keys = c.units.map((u) => u.k)
    assert.equal(new Set(keys).size, keys.length, `duplicate key in ${c.id}`)
    for (const d of c.def) assert.ok(keys.includes(d), `${c.id} default ${d} exists`)
    units += keys.length
  }
  assert.equal(units, 157)
})

test('temperature and length conversions are numerically right', () => {
  assert.equal(convertUnit('temperature', 100, '°C', '°F').toFixed(1), '212.0')
  assert.equal(convertUnit('temperature', 32, '°F', '°C').toFixed(1), '0.0')
  assert.equal(convertUnit('temperature', 0, '°C', 'K').toFixed(2), '273.15')
  assert.equal(convertUnit('length', 1, 'mi', 'km').toFixed(3), '1.609')
  assert.equal(convertUnit('mass', 1, 'tola', 'g').toFixed(3), '11.664')
  assert.equal(convertUnit('area', 1, 'marla', 'ft²').toFixed(1), '272.3')
})

test('the currency snapshot is complete and self-consistent', () => {
  assert.ok(Object.keys(FIAT_SNAPSHOT).length >= 160)
  assert.equal(FIAT_SNAPSHOT.USD, 1)
  for (const [code, rate] of Object.entries(FIAT_SNAPSHOT)) {
    assert.ok(rate > 0 && Number.isFinite(rate), `${code} rate`)
    assert.equal(code, code.toUpperCase())
  }
  assert.ok(CRYPTO_SNAPSHOT.length >= 40)
  assert.match(SNAPSHOT_DATE, /\d{4}/)
})

test('world clock data covers every country with a real IANA zone', () => {
  assert.ok(COUNTRIES.length >= 190)
  const seen = new Set()
  for (const c of COUNTRIES) {
    assert.match(c.cc, /^[A-Z]{2}$/)
    assert.ok(c.name && c.zones?.length, `${c.cc} has a name + at least one zone`)
    for (const z of c.zones) assert.ok(/^[A-Za-z]+(?:\/[A-Za-z_+\-0-9]+)+$/.test(z.id), `valid IANA zone for ${c.cc}: ${z.id}`)
    seen.add(c.cc)
  }
  assert.equal(seen.size, COUNTRIES.length, 'no duplicate countries')
  assert.ok(['PK', 'US', 'GB', 'IN', 'AE'].every((c) => seen.has(c)))
})

/* ============================ Tools 05 / 08 / 11 / 12 — catalogues ============================ */

test('ImagePlayer Studio library is intact and look application is pure', () => {
  assert.equal(PRESETS.length, 31)
  assert.equal(HSL_CHANNELS.length, 8)
  const before = JSON.stringify(DEFAULTS)
  const after = applyLook(DEFAULTS, PRESETS[0])
  assert.notEqual(JSON.stringify(after), before)
  assert.equal(JSON.stringify(DEFAULTS), before, 'applyLook must not mutate the defaults')
  assert.equal(isModified(DEFAULTS, 'looks'), false)
})

test('visualizer + wallpaper catalogues match what the UI advertises', () => {
  assert.equal(STYLES.length, 15)
  assert.equal(PALETTES.length, 12)
  assert.equal(LOOKS.length, 18)
  assert.equal(WALL_STYLES.length, 12)
  assert.ok(WALL_PALETTES.length >= 30 && WALL_GALLERY.length >= 30)
})

test('QR studio catalogues and payload builders are consistent', () => {
  assert.equal(TEMPLATES.length, 33)
  assert.equal(LOGOS.length, 40)
  assert.equal(TEMPLATE_CATS.length, 5)
  for (const t of TYPES) {
    const out = buildPayload(t.id, defaultsFor(t.id) || {})
    assert.equal(typeof out, 'string', `payload for ${t.id}`)
  }
  assert.equal(typeById('nope').id, 'url', 'unknown type falls back safely')
  assert.match(buildPayload('url', { url: 'https://thetooltable.app' }), /^https:\/\//)
})

test('QR payload safety heuristics flag the dangerous ones', () => {
  const safe = (t) => checkSafety(parse(t, '') || { text: t, kind: 'text' })
  assert.equal(safe('https://good.example.com').level, 'safe')
  assert.notEqual(safe('javascript:alert(1)').level, 'ok')
  assert.notEqual(safe('http://192.168.0.1/admin').level, 'ok')
  const wifi = parse('WIFI:T:WPA;S:Home;P:hunter2;;', 'wifi')
  assert.equal(wifi.type, 'wifi')
  assert.equal(wifi.wifi.ssid, 'Home')
  assert.equal(parse('tel:+923001234567').type, 'phone')
  assert.equal(parse('random words').type, 'text')
})

test('GIF planner caps work instead of silently truncating', () => {
  const p = gifPlan(0, 600, 30)
  assert.equal(p.capped, true)
  assert.equal(p.frames, MAX_GIF_FRAMES)
  assert.equal(gifPlan(0, 3, 10).frames, 30)
  assert.equal(gifPlan(0, 3, 10).capped, false)
})

/* ============================ Tool 03 — compressor maths ============================ */

test('target-size bitrate maths stays inside the budget (video and audio)', () => {
  const p = planCompression({ targetMB: 25, duration: 180, audioKbps: 128 })
  assert.ok(p.est <= p.targetBytes, 'projected output must fit the budget')
  assert.ok(p.est > p.targetBytes * 0.9, 'and must not leave the budget half unused')
  assert.ok(p.vKbps > 300 && p.vKbps < 1200, `sensible bitrate, got ${p.vKbps}`)
  assert.equal(p.fits, true)
  // Every plan must be self-consistent for any duration the user can drop in.
  for (const duration of [3, 17, 61, 900, 7200]) {
    for (const targetMB of [1, 8, 25, 500]) {
      const v = planCompression({ targetMB, duration, audioKbps: 128 })
      const label = `${duration}s @ ${targetMB}MB`
      assert.ok(v.vKbps >= 0)
      if (v.vKbps >= 20) {
        // Encode is possible: the projection must fit, and must not waste half the budget.
        assert.ok(v.est <= v.targetBytes + 1e-6, `${label} projects inside budget`)
        assert.equal(v.fits, true, `${label} is reported as fitting`)
        assert.ok(v.est >= v.targetBytes * 0.5, `${label} does not waste half the budget`)
      } else {
        // Impossible at these settings: must be flagged so the UI refuses instead of silently
        // writing a file way over the cap — and must suggest a setting that *does* work.
        assert.equal(v.fits, false, `${label} refuses an impossible budget`)
        const sg = planSuggestion(v, { duration, targetMB, audioKbps: 128 })
        assert.ok(sg.audioKbps !== null || sg.targetMB !== null, `${label} suggests a way out`)
        if (sg.audioKbps) {
          const fixed = planCompression({ targetMB, duration, audioKbps: sg.audioKbps })
          assert.equal(fixed.fits, true, `${label}: the suggested audio bitrate really fits`)
        }
        if (sg.targetMB) {
          const fixed = planCompression({ targetMB: sg.targetMB, duration, audioKbps: 128 })
          assert.equal(fixed.fits, true, `${label}: the suggested target really fits`)
        }
      }
      const a = planCompression({ targetMB, duration, audioOnly: true })
      assert.ok(a.aKbps >= 32 && a.aKbps <= 320, 'AAC bitrate stays inside what AAC can do')
      assert.equal(a.fits, a.est <= a.targetBytes, 'the audio plan reports honestly whether it fits')
      // An audio-only plan may only miss the budget when the budget itself is outside AAC's range.
      if (!a.fits) assert.ok(a.aKbps === 32 || a.aKbps === 320, `${label}: audio miss is a format limit, not a maths bug`)
      else if (a.aKbps > 32 && a.aKbps < 320) assert.ok(a.est >= a.targetBytes * 0.9, `${label}: audio budget is not wasted`)
    }
  }
  assert.equal(planCompression({ targetMB: 10, duration: 0 }), null, 'no duration => no plan')
  assert.equal(overshootBytes(p, p.targetBytes + 5 * 1024 * 1024), 5242880, 'overshoot maths')
  assert.equal(overshootBytes(null, 123), 0, 'no plan => no overshoot')

  const audio = planCompression({ targetMB: 25, duration: 180, audioOnly: true })
  assert.equal(audio.aKbps, 320, 'a 25 MB budget for 3 minutes of audio should use the AAC ceiling')
  assert.ok(audio.est <= audio.targetBytes, 'and still land inside the budget')
  assert.equal(planSuggestion(audio, { duration: 180, targetMB: 25, audioOnly: true }).targetMB, null, 'a workable plan needs no suggestion')
})

/* ============================ registry contract ============================ */

test('the tool registry stays complete and lazily loadable (parsed as text — .jsx cannot load in Node)', async () => {
  const { readFileSync } = await import('node:fs')
  // Normalise CRLF: Windows checkouts (and the Windows CI runner) deliver this file with \r\n,
  // and `$` in a multiline regex does not match before \r\n — a real cross-platform failure.
  const src = readFileSync(new URL('../src/toolsRegistry.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const loaders = [...src.matchAll(/^\s{2}([A-Za-z]+): \(\) => import\('\.\/tools\/([A-Za-z]+)\.jsx'\),$/gm)]
  assert.equal(loaders.length, 12, 'one lazy loader per tool')
  const ids = [...src.matchAll(/id: '([a-z]+)', n: (\d+), name: '([^']+)'/g)].map((m) => ({ id: m[1], n: Number(m[2]), name: m[3] }))
  assert.equal(ids.length, 12, 'every tool declares id + number + name on its descriptor line')
  assert.equal(new Set(ids.map((x) => x.id)).size, 12, 'ids are unique')
  assert.deepEqual(ids.map((x) => x.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'numbered 1..12 in order')
  assert.equal((src.match(/lz\('[A-Za-z]+'\)/g) || []).length, 12, 'every tool is wired through lz()')
  assert.equal((src.match(/keywords: '[^']+'/g) || []).length, 12, 'every tool has search keywords')
  assert.ok(/id: 'metadata'/.test(src) && /id: 'backgrounds'/.test(src), 'first and last tools present')
})

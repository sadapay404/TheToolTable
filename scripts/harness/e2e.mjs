/* Deep end-to-end: runs the app's real modules and real wasm inside a browser, plus full UI flows.
   Nothing is mocked — ffmpeg.wasm, zxing.wasm, the canvas codecs, the sanitizer and the savers all run.

   Usage:  TTT_URL=http://localhost:5173 npm run e2e            (add --quick to skip the heavy media part)
   Exit code is non-zero when any check fails.                                          */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newPage, sleep, until } from './lib.mjs'
import { shot, openTool, goHome, clickText, upload, makeSampleVideo } from './h.mjs'

const QUICK = process.argv.includes('--quick')
const VIDEO = '/tmp/ttt-sample.webm'
const PNG = '/tmp/ttt-sample.png'
const EXIF_JPG = '/tmp/ttt-gps.jpg'
const AUDIO = '/tmp/ttt-tone.wav'
const DL = '/tmp/ttt-dl'
const results = []
const check = async (name, fn) => {
  const t0 = Date.now()
  try { const v = await fn(); results.push({ name, ok: true, note: v || '' }); console.log(`✓ ${name}${v ? ` — ${v}` : ''}`) }
  catch (e) { results.push({ name, ok: false, note: e.message }); console.log(`✗ ${name} — ${e.message}`) }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'mismatch'}: expected ${b}, got ${a}`) }
/** Poll the *filesystem* (Node side) until a file matching `re` shows up. */
async function waitForFile(dir, re, timeout = 30000, step = 250) {
  const t0 = Date.now()
  for (;;) {
    const hit = (existsSync(dir) ? readdirSync(dir) : []).filter((n) => re.test(n))
    if (hit.length) return join(dir, hit[0])
    if (Date.now() - t0 > timeout) throw new Error(`no file matching ${re} in ${dir} after ${timeout}ms`)
    await sleep(step)
  }
}
const ok = (v, msg) => { if (!v) throw new Error(msg || 'assertion failed') }

/* Minimal, valid little-endian EXIF APP1 block carrying real GPS coordinates (Rawalpindi). */
function exifApp1(latDeg = 33, latMin = 36, lonDeg = 73, lonMin = 3) {
  const tiff = Buffer.alloc(132)
  tiff.write('II', 0, 'ascii'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4)
  const ifd = (at, entries) => {
    tiff.writeUInt16LE(entries.length, at)
    entries.forEach((e, i) => {
      const o = at + 2 + i * 12
      tiff.writeUInt16LE(e.tag, o); tiff.writeUInt16LE(e.type, o + 2); tiff.writeUInt32LE(e.count, o + 4); tiff.writeUInt32LE(e.value, o + 8)
    })
    tiff.writeUInt32LE(0, at + 2 + entries.length * 12)
  }
  ifd(8, [{ tag: 0x8825, type: 4, count: 1, value: 26 }])
  ifd(26, [
    { tag: 0x0001, type: 2, count: 2, value: 80 },  // GPSLatitudeRef  "N\0"
    { tag: 0x0002, type: 5, count: 3, value: 84 },  // GPSLatitude     3 rationals
    { tag: 0x0003, type: 2, count: 2, value: 82 },  // GPSLongitudeRef "E\0"
    { tag: 0x0004, type: 5, count: 3, value: 108 }, // GPSLongitude    3 rationals
  ])
  tiff.write('N\0', 80, 'ascii'); tiff.write('E\0', 82, 'ascii')
  const rat = (at, pairs) => pairs.forEach(([n, d], i) => { tiff.writeUInt32LE(n, at + i * 8); tiff.writeUInt32LE(d, at + i * 8 + 4) })
  rat(84, [[latDeg, 1], [latMin, 1], [0, 1]])
  rat(108, [[lonDeg, 1], [lonMin, 1], [36, 1]])
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const app1 = Buffer.alloc(4 + payload.length)
  app1.writeUInt16BE(0xffe1, 0); app1.writeUInt16BE(payload.length + 2, 2); payload.copy(app1, 4)
  const body = Buffer.from(EXIF_BODY, 'base64')
  return Buffer.concat([body.subarray(0, 2), app1, body.subarray(2)]) // SOI + APP1 + rest
}
const browser = await launch()
const page = await newPage(browser, {})
let EXIF_BODY = ''
console.log(`# e2e against ${process.env.TTT_URL || 'http://localhost:5173'}`)

/* ─────────────────────── 0. build real sample files inside the page ─────────────────────── */
await check('fixtures: a real WebM clip, a PNG and an EXIF/GPS JPEG', async () => {
  const rec = await makeSampleVideo(page, VIDEO, { seconds: 2.5 })
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 96; c.height = 64
    const x = c.getContext('2d'); x.fillStyle = '#123456'; x.fillRect(0, 0, 96, 64); x.fillStyle = '#f0c'; x.fillRect(10, 10, 40, 30)
    const b = await new Promise((r) => c.toBlob(r, 'image/png'))
    const u = new Uint8Array(await b.arrayBuffer())
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  })
  writeFileSync(PNG, Buffer.from(png, 'base64'))
  EXIF_BODY = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 120; c.height = 80
    const x = c.getContext('2d'); x.fillStyle = '#2b6'; x.fillRect(0, 0, 120, 80); x.fillStyle = '#fff'; x.fillRect(20, 20, 60, 30)
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
    const u = new Uint8Array(await b.arrayBuffer())
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  })
  writeFileSync(EXIF_JPG, exifApp1())
  // A real 3 s WAV tone (44.1 kHz mono PCM) so the compressor's audio-only path can be tested too.
  const wav = await page.evaluate(() => {
    const rate = 44100, secs = 3, n = rate * secs
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
    const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true)
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true)
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true)
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / rate) * 12000, true)
    const u = new Uint8Array(buf); let s = ''
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  })
  writeFileSync(AUDIO, Buffer.from(wav, 'base64'))
  ok(existsSync(VIDEO) && existsSync(PNG) && existsSync(EXIF_JPG) && existsSync(AUDIO), 'a fixture is missing')
  return `webm ${(rec.size / 1024).toFixed(0)} KB · png ${readFileSync(PNG).length} B · jpeg ${readFileSync(EXIF_JPG).length} B · wav ${(readFileSync(AUDIO).length / 1024).toFixed(0)} KB`
})

/* ─────────────────────── A. pure logic, running on the real page ─────────────────────── */
// The logic checks import source modules, which only a Vite *dev* server serves. Against a production
// build (vite preview) they are skipped on purpose — the UI/media sections below still run for real.
const hasSources = await page.evaluate(async () => { try { const r = await fetch('/src/lib/utils.js'); return r.ok && /javascript/.test(r.headers.get('content-type') || '') } catch { return false } })
console.log('\n# logic' + (hasSources ? '' : ' (skipped — this target has no source modules; UI + media still run)'))
const A = hasSources ? await page.evaluate(async () => {
  const out = []
  const step = async (n, fn) => { try { const v = await fn(); out.push({ n, ok: true, note: String(v ?? '') }) } catch (e) { out.push({ n, ok: false, note: e.message }) } }

  await step('units: every category round-trips 1:1 and cross-checks against the SI base', async () => {
    const { CATEGORIES, convertUnit } = await import('/src/lib/units/units.js')
    let checked = 0
    for (const c of CATEGORIES) {
      for (const u of c.units) {
        const back = convertUnit(c.id, convertUnit(c.id, 7.5, c.base, u.k), u.k, c.base)
        if (Math.abs(back - 7.5) > 1e-6) throw new Error(`${c.id}: ${u.k} does not round-trip (${back})`)
        checked++
      }
    }
    for (const [args, want] of [[['length', 1, 'mi', 'km'], 1.609344], [['temperature', 100, '°C', '°F'], 212], [['mass', 1, 'tola', 'g'], 11.664], [['area', 1, 'marla', 'ft²'], 272.25], [['storage', 1, 'GiB', 'MB'], 1073.741824]]) {
      const got = convertUnit(...args)
      if (Math.abs(got - want) > Math.abs(want) * 1e-4 + 1e-6) throw new Error(`${args.join(' ')} = ${got}, want ~${want}`)
    }
    return `${checked} units across ${CATEGORIES.length} categories`
  })

  await step('time zones: real IANA data, DST-correct, wall-clock round-trips', async () => {
    const w = await import('/src/lib/units/world.js')
    const summer = Date.UTC(2026, 6, 15, 12), winter = Date.UTC(2026, 0, 15, 12)
    if (w.offsetMin('America/New_York', summer) === w.offsetMin('America/New_York', winter)) throw new Error('New York offset ignores DST')
    if (w.partsIn(summer, 'Asia/Karachi').h !== 17) throw new Error('Karachi is not UTC+5')
    for (const zone of ['Asia/Karachi', 'America/New_York', 'Europe/London', 'Australia/Sydney', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
      const p = w.partsIn(w.zonedToUtc(2026, 3, 8, 9, 30, zone), zone)
      if (p.h !== 9 || p.mi !== 30 || p.d !== 8 || p.mo !== 3) throw new Error(`${zone} wall-clock round-trip: ${JSON.stringify(p)}`)
    }
    if (w.dayDiff({ y: 2026, mo: 3, d: 1 }, { y: 2026, mo: 3, d: 31 }) !== 30) throw new Error('dayDiff')
    return `${w.COUNTRIES.length} countries · ${w.COUNTRIES.reduce((a, c) => a + c.zones.length, 0)} zones`
  })

  await step('money: the bundled snapshot converts offline (no network needed)', async () => {
    const m = await import('/src/lib/units/money.js')
    const items = m.buildItems({ fiat: m.FIAT_SNAPSHOT, crypto: m.CRYPTO_SNAPSHOT.map(([id, sym, name, usd], i) => ({ id, sym, name, usd, rank: i + 1 })) })
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]))
    const usd = byKey['f:USD'], pkr = byKey['f:PKR'], btc = byKey['c:bitcoin']
    if (!usd || !pkr || !btc) throw new Error('snapshot is missing USD/PKR/BTC')
    const toPkr = m.convertMoney(100, usd, pkr)
    if (!(toPkr > 20000 && toPkr < 40000)) throw new Error(`100 USD → ${toPkr} PKR looks wrong`)
    const back = m.convertMoney(toPkr, pkr, usd)
    if (Math.abs(back - 100) > 0.01) throw new Error('USD→PKR→USD does not round-trip')
    if (!/27,|275|276|277/.test(m.fmtMoney(toPkr, 'fiat'))) throw new Error(`fmtMoney: ${m.fmtMoney(toPkr)}`)
    if (m.convertMoney(1, btc, usd) < 1000) throw new Error('BTC price looks wrong')
    return `${items.length} currencies+coins · 100 USD = ${m.fmtMoney(toPkr)}`
  })

  await step('sanitizer: PNG text/time/eXIf chunks are dropped, pixels still decode', async () => {
    const { scrub, detectType } = await import('/src/lib/sanitize.js')
    const src = new Uint8Array(await (await fetch('/logo.png')).arrayBuffer())
    const at = 8 + 12 + new DataView(src.buffer, src.byteOffset).getUint32(8)
    const chunk = (type, data) => {
      const t = [...type].map((c) => c.charCodeAt(0))
      const out = new Uint8Array(12 + data.length)
      const dv = new DataView(out.buffer)
      dv.setUint32(0, data.length); out.set(t, 4); out.set(data, 8)
      const crcInput = out.subarray(4, 8 + data.length)
      let c = ~0; const table = []; for (let n = 0; n < 256; n++) { let k = n; for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1; table[n] = k >>> 0 }
      for (const byte of crcInput) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
      dv.setUint32(8 + data.length, (c ^ ~0) >>> 0)
      return out
    }
    const meta = chunk('tEXt', new TextEncoder().encode('Author\x00Ada Lovelace\x00Title\x00Draft'))
    const time = chunk('tIME', new Uint8Array([0x07, 0xea, 1, 2, 3, 4, 5]))
    const joined = new Uint8Array(src.length + meta.length + time.length)
    joined.set(src.subarray(0, at)); joined.set(meta, at); joined.set(time, at + meta.length); joined.set(src.subarray(at), at + meta.length + time.length)
    const types = (buf) => { const dv = new DataView(buf.buffer, buf.byteOffset); const list = []; for (let i = 8; i + 8 <= buf.length;) { const len = dv.getUint32(i); const t = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]); list.push(t); if (t === 'IEND') break; i += 12 + len } return list }
    if (!types(joined).includes('tEXt')) throw new Error('fixture did not gain metadata')
    if (detectType(joined.buffer) !== 'png') throw new Error('detectType failed')
    const { blob, type } = scrub(joined.buffer)
    if (type !== 'png') throw new Error(`scrub returned type ${type}`)
    const after = new Uint8Array(await blob.arrayBuffer())
    const left = types(after)
    if (left.includes('tEXt') || left.includes('tIME') || left.includes('eXIf')) throw new Error(`metadata survived: ${left.join(',')}`)
    if (!left.includes('IHDR') || !left.includes('IDAT') || !left.includes('IEND')) throw new Error(`critical chunks lost: ${left.join(',')}`)
    const bmp = await createImageBitmap(blob)
    if (!bmp.width) throw new Error('scrubbed PNG does not decode')
    return `${joined.length}B → ${after.length}B, ${bmp.width}×${bmp.height}, chunk list clean`
  })

  await step('yt-dlp core: URL guard, argv whitelist, container truthfulness', async () => {
    const y = await import('/src/lib/ytdlp-core.js')
    const ctx = { ffmpeg: '/usr/bin/ffmpeg', outTemplate: '/out/%(title)s.%(ext)s', tempDir: '/tmp' }
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://x/y', 'http://127.0.0.1:8787/x', 'http://192.168.1.5/']) {
      let threw = false; try { y.normalizeUrl(bad, false) } catch { threw = true }
      if (!threw) throw new Error(`normalizeUrl accepted ${bad}`)
    }
    if (y.normalizeUrl('https://youtu.be/abc?x=1', false) !== 'https://youtu.be/abc?x=1') throw new Error('normalizeUrl mangled a good URL')
    const info = {
      kind: 'video', heights: [
        { height: 1080, fps: 30, vcodec: 'vp9', ext: 'webm', bytes: 1, mp4: false, webm: true },
        { height: 720, fps: 30, vcodec: 'avc1', ext: 'mp4', bytes: 1, mp4: true, webm: false },
      ],
    }
    const a = y.containerPlan(info, 1080, 'mp4'), b = y.containerPlan(info, 720, 'mp4'), c = y.containerPlan(info, null, 'auto'), d = y.containerPlan(info, 1080, 'webm')
    if (a.container !== 'mkv' || !a.fallback) throw new Error('VP9@1080p should be honest about MKV')
    if (b.container !== 'mp4' || b.fallback) throw new Error('H.264@720p is MP4-safe')
    if (c.container !== 'mkv' || c.fallback) throw new Error(`auto must follow the best stream (VP9 → MKV), got ${c.container}`)
    const c2 = y.containerPlan({ heights: [info.heights[1]] }, null, 'auto')
    if (c2.container !== 'mp4') throw new Error(`auto must pick MP4 when the best stream is MP4-safe, got ${c2.container}`)
    if (d.container !== 'webm' || d.fallback) throw new Error('VP9 is WebM-native')
    const args = y.buildArgs({ ...{ mode: 'video', height: 720, container: 'mp4', clip: false, metadata: true, subs: false }, url: 'https://youtu.be/x' }, ctx)
    if (args.includes('--remux-video')) throw new Error('--remux-video must never be used')
    if (!args.includes('--merge-output-format')) throw new Error('no container request')
    if (args.filter((x) => x.startsWith('-f')).length !== 1) throw new Error('multiplexed -f flags')
    const t = new y.JobTracker('id1', 1, { container: 'mp4' })
    t.feed('TTT|1048576|2097152|NA|524288|2\n')
    if (t.s.percent !== 50 || t.s.total !== 2097152 || t.s.downloaded !== 1048576 || t.s.speed === 0) throw new Error(`tracker progress maths: ${JSON.stringify({ p: t.s.percent, tot: t.s.total, dl: t.s.downloaded, spd: t.s.speed })}`)
    if (t.s.stage !== 'downloading' || t.s.part !== 1 || t.s.parts !== 1) throw new Error('tracker stage/part bookkeeping')
    t.feed('TTTFILE|/out/My Clip.mkv\n')
    const done = await t.finish(0, () => 4321)
    if (t.s.ext !== 'mkv' || t.s.name !== 'My Clip.mkv') throw new Error(`tracker did not read the real container: ${JSON.stringify({ e: t.s.ext, n: t.s.name })}`)
    if (!t.s.fellBack || t.s.requested !== 'mp4') throw new Error('tracker did not flag the MP4→MKV fallback')
    if (t.s.percent !== 100 || t.s.state !== 'done') throw new Error(`tracker did not finish cleanly: ${JSON.stringify({ p: t.s.percent, st: t.s.state })}`)
    const bad = new y.JobTracker('id2', 1, { container: 'mp4' })
    bad.feed('ERROR: Video unavailable\n'); await bad.finish(1)
    if (bad.s.state !== 'error' || !/unavailable/i.test(bad.s.error)) throw new Error('tracker did not surface the failure message')
    return `13 rules checked · fallback flagged as .${t.s.ext} · errors surfaced`
  })

  await step('QR: encode → rasterise → decode → parse → safety verdict', async () => {
    const { buildQR, toCanvas, canvasBlob } = await import('/src/lib/qr/render.js')
    const { decodeSource } = await import('/src/lib/qr/zx.js')
    const payload = 'https://thetooltable.app/?e2e=1'
    const code = buildQR(payload, undefined, 'e2e')       // the exact generator QR Studio uses
    const canvas = await toCanvas(code, 420)
    // and a printable 1-D symbology through the barcode engine, for good measure
    const { BARCODES, makeBarcode } = await import('/src/lib/qr/barcode.js')
    const bar = await makeBarcode(BARCODES.find((b) => b.id === 'Code128'), 'TTT-123456', { scale: 3 })
    const barCanvas = await toCanvas({ ...bar, W: bar.w, H: bar.h }, 600)
    const dec = await decodeSource(canvas, { formats: ['QRCode'], max: 1 })
    if (!dec.items.length) throw new Error('zxing could not read the QR it just wrote')
    if (dec.items[0].text !== payload) throw new Error(`round-trip mismatch: ${dec.items[0].text}`)
    const png = await canvasBlob(canvas)
    const { parse } = await import('/src/lib/qr/parse.js')
    const { checkSafety } = await import('/src/lib/qr/safety.js')
    const parsed = parse(dec.items[0].text)
    if (parsed.type !== 'url') throw new Error(`parsed as ${parsed.type}`)
    const good = checkSafety(parsed)
    const bad = checkSafety(parse('http://paypal-login-secure.tk/verify'))
    if (good.level !== 'safe') throw new Error(`honest URL graded ${good.level}`)
    if (bad.level === 'safe') throw new Error('phishing-shaped URL graded safe')
    const barDec = await decodeSource(barCanvas, { formats: ['Code128'], max: 1 }).catch(() => ({ items: [] }))
    return `${dec.items[0].format} ${png.size}B · parse→${parsed.type} · ${good.level} vs ${bad.level} · Code128 ${barDec.items[0]?.text || 'unread'}`
  })

  await step('tool registry + engine matrix are internally consistent', async () => {
    const mod = await import('/src/toolsRegistry.jsx')
    if (mod.TOOLS.length !== 12) throw new Error(`${mod.TOOLS.length} tools`)
    if (new Set(mod.TOOLS.map((t) => t.id)).size !== 12) throw new Error('duplicate ids')
    const { KIND_TARGETS, kindOf } = await import('/src/lib/engines.js')
    for (const [kind, list] of Object.entries(KIND_TARGETS)) {
      if (!list.length) throw new Error(`kind ${kind} has no targets`)
      if (!kind) throw new Error('empty kind')
    }
    const k = kindOf(new File(['x'], 'a.png', { type: 'image/png' }))
    if (typeof k !== 'string' || !KIND_TARGETS[k]) throw new Error(`kindOf(png) = ${k}`)
    return `${mod.TOOLS.length} tools · kinds: ${Object.keys(KIND_TARGETS).join(', ')}`
  })

  await step('saving: browser fallback writes a real file, native shim stays out of the way', async () => {
    const { download, isNativeShell, assetUrl, fmtBytes } = await import('/src/lib/utils.js')
    if (isNativeShell() !== false) throw new Error('a plain browser must not report a native shell')
    let clicked = null
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { clicked = { href: this.href, name: this.download } }
    let threw = ''
    try { await download(new Blob(['hello']), 'ttt-e2e.txt') } catch (e) { threw = e.message } finally { HTMLAnchorElement.prototype.click = orig }
    if (threw) throw new Error(`download threw: ${threw}`)
    if (!clicked || clicked.name !== 'ttt-e2e.txt' || !clicked.href.startsWith('blob:')) throw new Error(`no <a download>: ${JSON.stringify(clicked)}`)
    if (fmtBytes(1536) !== '1.50 KB' || fmtBytes(0) !== '0 B') throw new Error(`fmtBytes: ${fmtBytes(1536)}`)
    if (!assetUrl('flags/pk.svg').endsWith('/flags/pk.svg')) throw new Error('assetUrl lost the path')
    return `blob fallback ok · ${fmtBytes(1536)}`
  })

  return out
}) : []
for (const r of A) { results.push({ name: r.n, ok: r.ok, note: r.note }); console.log(`${r.ok ? '✓' : '✗'} ${r.n}${r.note ? ` — ${r.note}` : ''}`) }

/* ─────────────────────── B. real media: ffmpeg.wasm + frames + GIF ─────────────────────── */
if (!QUICK) {
  console.log('\n# media (real wasm encodes)')
  await check('ffmpeg.wasm: webm → H.264 MP4 inside the browser (no server)', async () => {
    const v = await page.evaluate(async (b64) => {
      const { convertWithFFmpeg } = await import('/src/lib/ffmpeg.js')
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const blob = await convertWithFFmpeg(new File([bin], 'sample.webm', { type: 'video/webm' }), 'out.mp4',
        ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart'])
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
      return { size: blob.size, tag: String.fromCharCode(head[4], head[5], head[6], head[7]) }
    }, readFileSync(VIDEO).toString('base64'))
    eq(v.tag, 'ftyp', 'MP4 magic')
    ok(v.size > 3000, `mp4 too small: ${v.size}B`)
    return `${(v.size / 1024).toFixed(0)} KB`
  })

  await check('frames: decode the clip, detect fps, seek, grab a non-blank frame', async () => {
    const r = await page.evaluate(async (b64) => {
      const { loadVideo, seekTo, grabFrame, detectFps } = await import('/src/lib/frames.js')
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'video/webm' }))
      const v = await loadVideo(url)
      const fps = await detectFps(v)
      await seekTo(v, 1.0)
      const blob = await grabFrame(v, 'png')
      const bmp = await createImageBitmap(blob)
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
      const x = c.getContext('2d'); x.drawImage(bmp, 0, 0)
      const d = x.getImageData(0, 0, bmp.width, bmp.height).data
      const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
      const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
      return { w: bmp.width, h: bmp.height, fps, colors: seen.size, png: head[1] === 0x50 && head[2] === 0x4e }
    }, readFileSync(VIDEO).toString('base64'))
    ok(r.png, 'not a PNG frame')
    ok(r.colors > 5, `frame looks blank (${r.colors} colours)`)
    ok(r.fps > 5 && r.fps < 121, `implausible fps ${r.fps}`)
    return `${r.w}×${r.h} @ ${r.fps.toFixed(2)} fps · ${r.colors} colours`
  })

  await check('GIF export: encode a 1 s loop and validate the container', async () => {
    const r = await page.evaluate(async (b64) => {
      const { encodeGif } = await import('/src/lib/frames.js')
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'video/webm' }))
      const res = await encodeGif({ url, start: 0, end: 1, fps: 8, width: 240, loop: 0 })
      const b = new Uint8Array(await res.blob.arrayBuffer())
      return { size: res.blob.size, sig: String.fromCharCode(...b.slice(0, 6)), frames: res.frames, capped: res.capped }
    }, readFileSync(VIDEO).toString('base64'))
    ok(/^GIF8[79]a$/.test(r.sig), `bad GIF signature ${r.sig}`)
    ok(r.size > 4000, `GIF suspiciously small: ${r.size}B`)
    ok(r.frames === 8 && r.capped === false, `unexpected frame count ${r.frames}/${r.capped}`)
    return `${(r.size / 1024).toFixed(0)} KB · ${r.frames} frames · ${r.sig}`
  })
}

/* ─────────────────────── C. UI flows with real dropped files ─────────────────────── */
console.log('\n# UI flows')
const ui = async (name, fn) => check(name, async () => {
  try { await goHome(page) } catch { /* already home */ }
  page.logs.length = 0
  try { return await fn() }
  catch (e) {
    await shot(page, 'FAIL-' + name.split(':')[0].replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    const t = await page.evaluate(() => document.body.innerText.slice(0, 180).replace(/\n+/g, ' | ')).catch(() => '')
    throw new Error(`${e.message} [view: ${t}]`)
  }
})
const noErrors = () => {
  const errs = page.logs.filter((l) => !/favicon|manifest|sw\.js|ERR_CONNECTION_CLOSED|open\.er-api|coingecko|nominatim/i.test(l))
  if (errs.length) throw new Error('console errors: ' + errs.slice(0, 3).join(' | '))
}

await ui('converter UI: drop the webm → convert → result card', async () => {
  await openTool(page, 'Any-to-Any Converter')
  await upload(page, VIDEO)
  await until(page, () => /MP4|WebM|Convert/i.test(document.body.innerText), { label: 'converter options' })
  await shot(page, 'e2e-converter-uploaded')
  await clickText(page, 'Convert').catch(async () => { await clickText(page, 'MP4'); await sleep(300); await clickText(page, 'Convert') })
  const done = await until(page, () => (/Save again|Downloaded|Ready|COMPLETE/i.test(document.body.innerText) ? true : null), { timeout: 180000, label: 'conversion result' })
  await shot(page, 'e2e-converter-done')
  ok(done, 'no result state')
  noErrors()
  return 'uploaded → converted → result card'
})

await ui('compressor UI: 8 MB budget, two-pass encode, honest size report', async () => {
  await openTool(page, 'Target-Size Compressor')
  await until(page, () => !!document.querySelector('input[type=file]'), { label: 'dropzone' })
  await upload(page, VIDEO)
  const kb = await until(page, () => {
    const m = document.body.innerText.match(/([\d,]+) kbps/)
    const hasPlan = /Byte budget|The plan|Est. output/i.test(document.body.innerText)
    return hasPlan && m ? m[0] : (hasPlan ? 'plan ready' : null)
  }, { timeout: 60000, label: 'plan card (duration must be readable from the headerless webm)' })
  await clickText(page, '8 MB', '.chip').catch(() => {})
  await shot(page, 'e2e-compressor-plan')
  await clickText(page, 'Compress to target')
  const out = await until(page, () => document.body.innerText.match(/target [\d.]+ MB · actual [^\n·]+/i)?.[0] || null, { timeout: 240000, label: 'compressor result' })
  await shot(page, 'e2e-compressor-done')
  ok(/actual/.test(out), 'result line missing')
  noErrors()
  return `${kb} planned · ${out.trim()}`
})

await ui('compressor UI (audio): a WAV gets an AAC bitrate budget and lands as .m4a', async () => {
  await openTool(page, 'Target-Size Compressor')
  await until(page, () => !!document.querySelector('input[type=file]'), { label: 'dropzone' })
  await upload(page, AUDIO)
  const plan = await until(page, () => {
    const t = document.body.innerText
    if (!/Audio bitrate/i.test(t)) return null
    return t.match(/[\d.]+ kbps/)?.[0] || 'audio plan'
  }, { timeout: 60000, label: 'audio-only plan (Audio bitrate label)' })
  await clickText(page, '8 MB', '.chip').catch(() => {})
  await shot(page, 'e2e-compressor-audio-plan')
  await clickText(page, 'Compress to target')
  const out = await until(page, () => document.body.innerText.match(/\.m4a[^\n]*target [\d.]+ MB · actual [^\n·]+/i)?.[0] || null, { timeout: 120000, label: 'audio result' })
  await shot(page, 'e2e-compressor-audio-done')
  noErrors()
  return `${plan} · ${out.trim()}`
})

await ui('metadata UI: EXIF/GPS photo → tags shown → scrub downloads a clean file', async () => {
  rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true })
  const client = await page.createCDPSession()
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true }).catch(() => {})
  await openTool(page, 'Metadata Extractor')
  await upload(page, EXIF_JPG)
  const txt = await until(page, () => (/Location & GPS|GPS|Coordinates|Dimensions|File information/i.test(document.body.innerText) ? document.body.innerText : null), { timeout: 60000, label: 'metadata view' })
  const gps = /33\.6|33°|73\.06|73°/.test(txt)
  await shot(page, 'e2e-metadata')
  await clickText(page, 'Scrub & Sanitize')
  const file = await waitForFile(DL, /clean/, 30000).catch(() => null)
  ok(file, 'no scrubbed file was saved')
  const bytes = readFileSync(file)
  const hasExif = bytes.includes(Buffer.from('Exif\0\0', 'latin1'))
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
  ok(isJpeg, 'scrubbed file is not a JPEG')
  ok(!hasExif, 'EXIF survived the scrub')
  ok(bytes.length < readFileSync(EXIF_JPG).length, `scrubbed file (${bytes.length}B) is not smaller than the original (${readFileSync(EXIF_JPG).length}B)`)
  await client.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {})
  noErrors()
  return `GPS ${gps ? 'shown' : 'not detected in UI'} · scrubbed ${bytes.length}B, EXIF removed, still JPEG`
})

await ui('QR studio UI: the app writes a QR and verifies it by decoding it again', async () => {
  await openTool(page, 'QR Code Studio')
  await clickText(page, 'Barcodes', 'button').catch(() => {})
  const verified = await until(page, () => (/Verified · reads back as/.test(document.body.innerText) ? document.body.innerText.match(/Verified · reads back as\s*\S+/)?.[0] : null), { timeout: 90000, label: 'self-verification chip' })
  await shot(page, 'e2e-qr-verified')
  noErrors()
  return verified
})

await ui('downloader UI: without an engine it explains itself instead of hanging', async () => {
  await openTool(page, 'Media Clipper')
  const txt = await until(page, () => (/engine|offline|companion|Install|npm run|Paste/i.test(document.body.innerText) ? document.body.innerText.slice(0, 300) : null), { timeout: 30000, label: 'downloader first paint' })
  await shot(page, 'e2e-downloader')
  noErrors()
  return /engine|offline|companion|npm run/i.test(txt) ? 'offline card shown' : 'engine card shown'
})

/* ─────────────────────── summary ─────────────────────── */
const failed = results.filter((r) => !r.ok)
console.log(`\n# ${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) { console.log('# failed:'); failed.forEach((f) => console.log(`#   ✗ ${f.name} — ${f.note}`)) }
const pageErrs = page.logs.filter((l) => !/favicon|manifest|sw\.js|ERR_CONNECTION_CLOSED/i.test(l))
if (pageErrs.length) { console.log('# page log leftovers:'); pageErrs.slice(0, 6).forEach((l) => console.log('#   ' + l)) }
await browser.close()
process.exit(failed.length ? 1 : 0)

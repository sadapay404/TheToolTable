// Unit tests for the libraries behind the newer tools. Everything here is pure logic: no DOM, no
// network, no wasm — the browser side of these tools is exercised by scripts/harness/e2e.mjs.
import test from 'node:test'
import assert from 'node:assert/strict'

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello there

2
00:00:05,500 --> 00:00:07,250
<i>Second</i> line
wrapped
`

test('subtitles: SRT in, SRT/VTT/TXT/CSV out', async () => {
  const { parseSubs, toSRT, toVTT, toCSV, toTXT, fmtStamp, parseStamp } = await import('../src/lib/subs.js')
  const { format, cues } = parseSubs(SRT)
  assert.equal(format, 'srt')
  assert.equal(cues.length, 2)
  assert.equal(cues[0].start, 1000)
  assert.equal(cues[1].end, 7250)
  assert.equal(cues[1].text, 'Second line\nwrapped', 'inline markup is removed, the break kept')

  assert.equal(parseStamp('00:01:02,500'), 62500)
  assert.equal(parseStamp('1:02.5'), 62500)
  assert.equal(parseStamp('62'), 62000)
  assert.equal(fmtStamp(62500), '00:01:02,500')
  assert.equal(fmtStamp(62500, '.'), '00:01:02.500')
  assert.equal(parseStamp(fmtStamp(3_599_999)), 3_599_999, 'round-trips to the millisecond')

  const vtt = toVTT(cues)
  assert.ok(vtt.startsWith('WEBVTT\n'))
  assert.match(vtt, /00:00:05\.500 --> 00:00:07\.250/)
  assert.equal(parseSubs(vtt).cues.length, 2, 'VTT reads back')

  const again = parseSubs(toSRT(cues)).cues
  assert.deepEqual(again.map((c) => c.text), cues.map((c) => c.text))
  assert.match(toCSV(cues), /"index,start,end,text"|index,start,end,text/)
  assert.equal(toTXT(cues).split('\n').length, 3, 'two cues, three text lines')
})

test('subtitles: retiming, splitting, merging and tidying', async () => {
  const { parseSubs, tidyCues, shiftCues, anchorCues, scaleCues, splitCue, mergeCues, findReplace, cueAt, stats } = await import('../src/lib/subs.js')
  const { cues } = parseSubs(SRT)

  const later = shiftCues(cues, 2500)
  assert.equal(later[0].start, 3500)
  assert.equal(anchorCues(later, 0)[0].start, 0)
  const stretched = scaleCues([{ start: 0, end: 1000, text: 'a' }, { start: 1000, end: 2000, text: 'b' }], 1.5)
  assert.deepEqual(stretched.map((c) => [c.start, c.end]), [[0, 1500], [1500, 3000]])

  const [head, tail] = splitCue({ id: 1, start: 0, end: 4000, text: 'one two three four' }, 2000)
  assert.ok(head.end === 2000 && tail.start === 2000)
  assert.equal(`${head.text} ${tail.text}`.trim(), 'one two three four', 'no words lost')

  const merged = mergeCues({ start: 0, end: 1000, text: 'a' }, { start: 1000, end: 2500, text: 'b' })
  assert.deepEqual([merged.start, merged.end, merged.text], [0, 2500, 'a b'])

  const fixed = findReplace([{ id: 1, start: 0, end: 900, text: 'teh cat' }], 'teh', 'the')
  assert.equal(fixed[0].text, 'the cat')

  // a zero-length cue and an out-of-order pair get repaired
  const messy = [{ id: 9, start: 5000, end: 5000, text: 'b' }, { id: 3, start: 100, end: 300, text: 'a' }]
  const tidy = tidyCues(messy)
  assert.deepEqual(tidy.map((c) => c.id), [1, 2], 'ids renumbered in time order')
  assert.ok(tidy[1].end - tidy[1].start >= 400, 'minimum duration enforced')
  assert.equal(cueAt(tidy, 200).text, 'a')
  assert.equal(cueAt(tidy, 4000), null)
  assert.equal(stats(tidy).cues, 2)
})

test('subtitles: plain text becomes timed cues, ASS is understood', async () => {
  const { parseSubs, plainToCues, detectFormat } = await import('../src/lib/subs.js')
  const plain = 'First line\nSecond line\nThird line'
  const cues = plainToCues(plain, { per: 1500 })
  assert.equal(cues.length, 3)
  assert.deepEqual([cues[1].start, cues[1].end], [1500, 3000])

  const ass = `[Script Info]\nTitle: x\n\n[Events]\nDialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\i1}Hello,{\\i0} world\nDialogue: 0,0:00:04.00,0:00:05.25,Default,,0,0,0,,Second`
  assert.equal(detectFormat(ass), 'ass')
  const parsed = parseSubs(ass)
  assert.equal(parsed.cues.length, 2)
  assert.equal(parsed.cues[0].start, 1500)
  assert.equal(parsed.cues[0].text, 'Hello, world', 'override codes stripped')
  assert.equal(parsed.cues[1].end, 5250)
})

test('audio maths: WAV header, edits and the speech detector', async () => {
  const { encodeWav, fade, normalize, reverse, resample, concat, gain, peaks, rmsFrames, speechSegments, audioStats, toMono } = await import('../src/lib/audio.js')
  const sr = 8000
  const sine = Float32Array.from({ length: sr }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / sr) * 0.5)

  const wav = encodeWav([sine], sr)
  const head = new Uint8Array(await wav.arrayBuffer()).subarray(0, 44)
  const dv = new DataView(head.buffer, head.byteOffset)
  assert.equal(String.fromCharCode(...head.subarray(0, 4)), 'RIFF')
  assert.equal(String.fromCharCode(...head.subarray(8, 12)), 'WAVE')
  assert.equal(dv.getUint16(22, true), 1, 'mono')
  assert.equal(dv.getUint32(24, true), sr)
  assert.equal(dv.getUint32(40, true), sine.length * 2, 'data chunk matches the sample count')
  assert.equal(wav.size, 44 + sine.length * 2)

  const flat = new Float32Array(sr).fill(0.5)
  const faded = fade([flat], sr, { in: 0.25, out: 0.25 })
  assert.ok(Math.abs(faded[0][0]) < 1e-6, 'starts silent')
  assert.ok(Math.abs(faded[0][sr - 1]) < 1e-6, 'ends silent')
  assert.equal(faded[0][Math.floor(sr / 2)], 0.5, 'middle untouched')
  assert.equal(fade([sine], sr, {}).length, 1)

  const t = normalize([Float32Array.from([0.1, -0.25, 0.5])], 1)
  assert.deepEqual([...t[0]].map((v) => +v.toFixed(3)), [0.2, -0.5, 1])
  assert.deepEqual([...gain([Float32Array.from([0.5])], 6)[0]].map((v) => +v.toFixed(3)), [0.998], '+6 dB is ×2')
  assert.deepEqual([...reverse([Float32Array.from([1, 2, 3])])[0]], [3, 2, 1])
  assert.equal(resample([sine], 2)[0].length, sr / 2, 'double speed halves the samples')
  assert.equal(concat([[sine], [sine]], sr, 0.5)[0].length, sr * 2 + sr / 2, 'a half-second gap is inserted')
  assert.equal(peaks(sine, 100).length, 100)

  // two 0.4 s tone bursts with silence between them → the detector must find two stretches
  const mono = new Float32Array(sr * 3)
  for (let i = 0; i < sr * 0.4; i++) mono[i] = Math.sin((2 * Math.PI * 300 * i) / sr) * 0.6
  for (let i = 0; i < sr * 0.4; i++) mono[sr * 2 + i] = Math.sin((2 * Math.PI * 300 * i) / sr) * 0.6
  const frames = rmsFrames(mono, sr, 20)
  const segs = speechSegments(frames, 20, { thresholdDb: -30, minSilence: 0.3, minSpeech: 0.2, pad: 0 })
  assert.equal(segs.length, 2, `expected two speech stretches, got ${JSON.stringify(segs.map((s) => [+s.start.toFixed(2), +s.end.toFixed(2)]))}`)
  assert.ok(segs[0].start < 0.05 && segs[0].end > 0.35 && segs[0].end < 0.5)
  assert.ok(segs[1].start > 1.9 && segs[1].start < 2.1)
  assert.equal(toMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])])[0], 0.5, 'stereo folds down')
  assert.ok(audioStats([mono]).peak > 0.5)
})

test('hashing: MD5 matches the RFC vectors, everything else matches WebCrypto', async () => {
  const { md5, crc32, digest, verify, normalizeHash, guessAlgo, hashFile } = await import('../src/lib/hash.js')
  assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e')
  assert.equal(md5('a'), '0cc175b9c0f1b6a831c399e269772661')
  assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72')
  assert.equal(md5('message digest'), 'f96b697d7cb7938d525a2f31aaf161d0')
  assert.equal(md5('The quick brown fox jumps over the lazy dog'), '9e107d9d372bb6826bd81d3542a419d6')
  // padding edges: 55 bytes is the last single-block size, 56 starts a second block
  assert.equal(md5('a'.repeat(55)), 'ef1772b6dff9a122358552954ad0df65')
  assert.equal(md5('a'.repeat(56)), '3b0c8ac703f828b04c6c197006d17218')
  assert.equal(md5('a'.repeat(57)), '652b906d60af96844ebd21b674f35e93')
  assert.equal(md5('a'.repeat(64)), '014842d480b571495a4a0363793f7367', 'exactly one block of input')
  assert.equal(md5('x'.repeat(64)), 'c1bb4f81d892b2d57947682aeb252456')
  assert.equal(md5('a'.repeat(1000)), 'cabe45dcc9ae5b66ba86600cca6b8ba8', 'multi-block input')

  assert.equal(crc32('The quick brown fox jumps over the lazy dog'), '414fa339')
  assert.equal(await digest('abc', 'SHA-256'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(await digest('abc', 'SHA-1'), 'a9993e364706816aba3e25717850c26c9cd0d89d')

  assert.equal(verify('sha256:BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'), 'match')
  assert.equal(verify('ba7816bf', 'ba7816be'), 'mismatch')
  assert.equal(verify('', 'abc'), 'empty')
  assert.equal(normalizeHash('SHA-256: ba78 16BF'), 'ba7816bf')
  assert.equal(guessAlgo('9e107d9d372bb6826bd81d3542a419d6'), 'md5')
  assert.equal(guessAlgo('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'), 'sha256')
  assert.equal(guessAlgo('nope'), null)

  // belt and braces: cross-check our MD5 against OpenSSL over every awkward length
  const { createHash } = await import('node:crypto')
  for (const n of [0, 1, 3, 54, 55, 56, 57, 63, 64, 65, 127, 128, 129, 200, 999, 1000, 4096]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff)
    assert.equal(md5(bytes), createHash('md5').update(bytes).digest('hex'), `md5 mismatch at ${n} bytes`)
  }
  assert.equal(crc32(new Uint8Array(0)).length, 8)

  const file = new Blob([new TextEncoder().encode('abc')])
  const all = await hashFile(file, ['sha256', 'md5', 'crc32', 'sha1'])
  assert.equal(all.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(all.md5, '900150983cd24fb0d6963f7d28e17f72')
  assert.equal(all.crc32, '352441c2')
})

test('archives: names are safe and a zip round-trips byte for byte', async () => {
  const { safeName, makeZip, readArchive, mimeOf } = await import('../src/lib/zip.js')
  assert.equal(safeName('../../etc/passwd'), 'etc/passwd')
  assert.equal(safeName('/absolute//weird/./x.txt'), 'absolute/weird/x.txt')
  assert.equal(safeName('..'), 'file')
  assert.equal(mimeOf('clip.PNG'), 'image/png')

  const enc = new TextEncoder()
  const entries = [
    { name: 'hello.txt', data: enc.encode('hello world') },
    { name: 'nested/inner.bin', data: new Uint8Array([1, 2, 3, 4, 5]) },
  ]
  const blob = await makeZip(entries, { level: 6 })
  assert.ok(blob.size > 40, 'zip has a body')
  const back = await readArchive(new Blob([await blob.arrayBuffer()], { type: 'application/zip' }))
  assert.equal(back.kind, 'zip')
  assert.deepEqual(back.entries.map((e) => e.name).sort(), ['hello.txt', 'nested/inner.bin'])
  const hello = back.entries.find((e) => e.name === 'hello.txt')
  assert.equal(new TextDecoder().decode(hello.data), 'hello world')
  const bin = back.entries.find((e) => e.name === 'nested/inner.bin')
  assert.deepEqual([...bin.data], [1, 2, 3, 4, 5])

  const { gzipSync } = await import('fflate')
  const gz = new Blob([gzipSync(enc.encode('gzipped text'))])
  const res = await readArchive(gz)
  assert.equal(res.kind, 'gzip')
  assert.equal(new TextDecoder().decode(res.entries[0].data), 'gzipped text')
})

test('invoice maths: subtotal, discount, per-line tax, shipping, balance', async () => {
  const { calcTotals, emptyInvoice, fmtMoney, nextNumber, toJSON, fromJSON, toCSV } = await import('../src/lib/invoice.js')
  const inv = emptyInvoice({
    currency: 'USD',
    lines: [
      { desc: 'Design', qty: 2, rate: 500, taxPct: 10 },
      { desc: 'Hosting', qty: 1, rate: 200, taxPct: 0 },
    ],
    discount: { mode: 'pct', value: 10 },
    shipping: 25,
    paid: 300,
  })
  const t = calcTotals(inv)
  assert.equal(t.sub, 1200)
  assert.equal(t.discountAmount, 120)
  assert.equal(t.tax, 90, 'tax is charged on the discounted amount: 10% of the 900 line')
  assert.equal(t.total, 1200 - 120 + 90 + 25)
  assert.equal(t.balance, t.total - 300)

  const flat = calcTotals({ ...inv, discount: { mode: 'flat', value: 5000 } })
  assert.equal(flat.discountAmount, 1200, 'a flat discount can never exceed the subtotal')
  assert.equal(flat.tax, 0)
  assert.equal(flat.total, 25)
  assert.equal(calcTotals(emptyInvoice({ lines: [{ desc: 'x', qty: '2', rate: '3.5', taxPct: '5' }] })).total, 7.35)

  assert.match(fmtMoney(1234.5, 'PKR'), /1,234\.50/)
  assert.ok(fmtMoney(10, 'USD').includes('$'))
  assert.equal(nextNumber([{ number: 'INV-0007' }, { number: 'INV-0003' }]), 'INV-0008')
  assert.equal(nextNumber([]), 'INV-0001')
  const round = fromJSON(toJSON(inv))
  assert.equal(round.lines.length, 2)
  assert.equal(round.number, inv.number)
  assert.match(toCSV(inv), /Total/)
})

test('charts: parsing, nice ticks and the geometry a renderer needs', async () => {
  const { parseDelimited, toTable, autoChart, niceTicks, buildSpec, fmtNum, isNumber } = await import('../src/lib/chart.js')
  const csv = 'Month,Sales,Costs\n"Jan, 2026",1200,800\nFeb,1500,900\nMar,900,700\n'
  const table = toTable(parseDelimited(csv))
  assert.deepEqual(table.headers, ['Month', 'Sales', 'Costs'])
  assert.deepEqual(table.numeric, [false, true, true])
  assert.equal(table.rows[0][0], 'Jan, 2026', 'quoted commas survive')
  assert.equal(table.rows.length, 3)

  const guess = autoChart(table)
  assert.equal(guess.x, 0)
  assert.deepEqual(guess.series, [1, 2])

  assert.deepEqual(niceTicks(0, 100, 5), { ticks: [0, 20, 40, 60, 80, 100], min: 0, max: 100 })
  const t2 = niceTicks(0, 7)
  assert.ok(t2.max >= 7 && t2.min <= 0)
  assert.equal(isNumber('1,234'), true)
  assert.equal(fmtNum(1500), '1,500')
  assert.equal(fmtNum(2_500_000), '2.5M')

  const bars = buildSpec({ type: 'bar', table, x: 0, series: [1, 2] })
  assert.equal(bars.bars.length, 6, '3 rows × 2 series')
  assert.ok(bars.bars.every((b) => b.h >= 0 && b.color))
  const line = buildSpec({ type: 'line', table, x: 0, series: [1] })
  assert.match(line.lines[0].path, /^M[\d.]+ [\d.]+ L/)
  assert.equal(line.lines[0].pts.length, 3)
  const area = buildSpec({ type: 'area', table, x: 0, series: [1] })
  assert.match(area.lines[0].area, /Z$/)
  const pie = buildSpec({ type: 'pie', table, x: 0, series: [1] })
  assert.equal(pie.arcs.length, 3)
  assert.equal(Math.round(pie.arcs.reduce((n, a) => n + a.pct, 0)), 100)
  const donut = buildSpec({ type: 'donut', table, x: 0, series: [1] })
  assert.match(donut.arcs[0].path, /A[\d.]+ [\d.]+ 0 \d 1/)
  const stacked = buildSpec({ type: 'bar', table, x: 0, series: [1, 2], stack: true })
  assert.equal(stacked.bars.length, 6)
  assert.ok(stacked.bars[1].y < stacked.bars[0].y, 'the second series sits on top of the first')
})

test('pdf helpers: page ranges and split plans', async () => {
  const { splitGroups, parseRanges, paperName } = await import('../src/lib/pdf/ops.js')
  assert.deepEqual(splitGroups(5, 'each'), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]])
  assert.deepEqual(splitGroups(5, 'chunks', 2), [[1, 2], [3, 4], [5, 5]])
  assert.deepEqual(splitGroups(5, 'halves'), [[1, 3], [4, 5]])
  assert.deepEqual(parseRanges('1-3, 5, 9-10', 10), [1, 2, 3, 5, 9, 10])
  assert.deepEqual(parseRanges('3-1', 10), [1, 2, 3], 'a backwards range still means pages 1–3')
  assert.deepEqual(parseRanges('99', 10), [10], 'out-of-range pages clamp to the document')
  assert.equal(paperName(595.28, 841.89), 'A4')
  assert.equal(paperName(612, 792), 'Letter')
})

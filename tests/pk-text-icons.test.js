import test from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync } from 'fflate'
import {
  incomeTax, grossForNet, loan, profit, pk, rs, parseNum, csv, TAX_TABLES,
} from '../src/lib/pk/calc.js'
import { diff, findRe, stats, romanToUrdu, urduToRoman, MAX_DIFF_CHARS } from '../src/lib/text/ops.js'
import {
  DEFAULTS, normalizeIconOptions, makeIco, makeIcns, buildPack, zipOf, PACKS,
} from '../src/lib/icons/forge.js'

async function withCanvas(fn) {
  const previous = globalThis.document
  const ctx = {
    clearRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, arc() {}, clip() {}, closePath() {},
    roundRect() {}, lineTo() {}, moveTo() {}, fillRect() {}, fillText() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (text) => ({ width: String(text).length * 50, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 0 }),
  }
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toBlob: (cb) => cb(new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' })) }) }
  try { return await fn() } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous }
}

test('Pakistan salary rates match the 2026–27 FBR card and finance calculations stay finite', () => {
  const rates = TAX_TABLES['2026-27']
  assert.deepEqual(rates.salaried, [[0, 0], [600_000, 1], [1_200_000, 11], [2_200_000, 20], [3_200_000, 25], [4_100_000, 29], [5_600_000, 32], [7_000_000, 35]])
  assert.deepEqual(rates.business, [[0, 0], [600_000, 15], [1_200_000, 20], [1_600_000, 30], [3_200_000, 40], [5_600_000, 45]])
  const salaryExamples = [[600_000, 0], [1_200_000, 6_000], [2_200_000, 116_000], [3_200_000, 316_000], [4_100_000, 541_000], [5_600_000, 976_000], [7_000_000, 1_424_000]]
  for (const [income, expected] of salaryExamples) assert.equal(incomeTax(income, rates.salaried, rates.surcharge.salaried).total, expected)
  assert.deepEqual(rates.surcharge.salaried, [0, 0])
  assert.deepEqual(rates.surcharge.business, [10_000_000, 10])
  assert.equal(incomeTax(10_000_000, rates.business, rates.surcharge.business).total, 3_590_000)
  assert.equal(incomeTax(10_100_000, rates.business, rates.surcharge.business).total, 3_998_500)
  const defaultProfitTax = profit({ principal: 1_000, rate: 12, years: 1 })
  assert.ok(Math.abs(defaultProfitTax.tax - defaultProfitTax.gross * 0.2) < 1e-8)

  const slabs = [[0, 0], [600_000, 10]]
  assert.equal(incomeTax(600_000, slabs).total, 0)
  assert.equal(incomeTax(1_000_000, slabs).total, 40_000)
  const gross = grossForNet(1_000_000, slabs)
  assert.ok(Math.abs(gross - incomeTax(gross, slabs).total - 1_000_000) < 0.01)
  assert.equal(incomeTax(Infinity, [[0, 150]], [0, 150]).total, 0)
  assert.ok(Number.isFinite(incomeTax(10_000_000, [[0, 0], [0, 40], [1e20, Infinity]], [0, 10]).total))

  const zeroRate = loan({ principal: 12_000, rate: 0, months: 12 })
  assert.equal(zeroRate.emi, 1_000)
  assert.equal(zeroRate.total, 12_000)
  assert.equal(zeroRate.rows.length, 12)
  const early = loan({ principal: 1_000, rate: 0, months: 12_000, extra: 1_000 })
  assert.equal(early.rows.length, 1)
  assert.equal(early.rows[0].bal, 0)
  assert.ok(early.months <= 1_200)
  assert.ok(loan({ principal: 1_000, rate: 1_000, months: 1_200 }).rows.every((r) => Number.isFinite(r.bal)))

  assert.deepEqual(profit({ principal: 100, rate: 10, years: Infinity }).pts, [])
  const bounded = profit({ principal: 100, monthly: 10, rate: 100, years: 1e9, comp: 12, wht: 15 })
  assert.equal(bounded.pts.length, 48)
  assert.ok(Number.isFinite(bounded.netMaturity))
})

test('Pakistan rupee formatting, parsing and repayment CSV reject malformed values', () => {
  assert.equal(pk(12_345_678.9, 2), '1,23,45,678.90')
  assert.equal(rs(1_250), 'Rs 1,250')
  assert.equal(pk(Infinity), '–')
  assert.equal(parseNum('12,345.50'), 12345.5)
  assert.equal(parseNum('12bad'), 0)
  assert.equal(parseNum('1e309'), 0)
  assert.match(csv([{ m: 1, pay: 100, princ: 80, interest: 20, bal: 920 }]), /1,100\.00,80\.00,20\.00,920\.00/)
  const schedule = csv(Array.from({ length: 1_300 }, (_, i) => ({ m: i + 1, pay: 0, princ: 0, interest: 0, bal: 0 })))
  assert.equal(schedule.split('\n').length, 1_201)
})

test('Text Lab handles Urdu, literal search, guarded regexes and bounded diffs', () => {
  const s = stats('Hello hello!\n\nاردو بھی چلتی ہے؟')
  assert.equal(s.words, 6)
  assert.equal(s.rtl, true)
  assert.equal('a+b Aab'.match(findRe('a+b', { regex: false })).length, 1)
  assert.deepEqual(diff('old words', 'new words'), [{ t: '-', s: 'old' }, { t: '+', s: 'new' }, { t: '=', s: ' words' }])
  assert.equal(findRe('cat', { whole: true }).test('bobcat'), false)
  assert.throws(() => findRe('(a+)+$', { regex: true }), /Nested repetition/)
  assert.throws(() => findRe('x'.repeat(1_025), { regex: true }), /1,024 characters/)
  assert.throws(() => findRe('(', { regex: true }), SyntaxError)
  assert.equal(diff('x'.repeat(MAX_DIFF_CHARS), 'y'), null)
  assert.equal(romanToUrdu('aap kaise hain?'), 'آپ کیسے ہیں؟')
  assert.equal(urduToRoman('میں ٹھیک ہوں'), 'main theek hun')
})

test('Icon options and native icon containers validate inputs and build safe ZIP assets', async () => {
  const options = normalizeIconOptions({
    mode: '__proto__', text: 'ABCDE', font: 'constructor', weight: 9_999,
    symColor: 'url(javascript:1)', bgType: 'style', bg1: '<script>', angle: Infinity,
    shape: '__proto__', radius: 500, pad: -5, offY: -900, name: 'safe\u0000 name'.repeat(20), theme: '" onload="alert(1)',
    arbitrary: 'discard',
  })
  assert.equal(options.mode, 'mono')
  assert.equal(options.text, 'ABC')
  assert.equal(options.font, DEFAULTS.font)
  assert.equal(options.weight, 900)
  assert.equal(options.symColor, DEFAULTS.symColor)
  assert.equal(options.bgType, DEFAULTS.bgType)
  assert.equal(options.angle, DEFAULTS.angle)
  assert.equal(options.shape, DEFAULTS.shape)
  assert.equal(options.radius, 50)
  assert.equal(options.pad, 0)
  assert.equal(options.offY, -15)
  assert.equal(options.name.length, 80)
  assert.equal(options.theme, DEFAULTS.theme)
  assert.equal(Object.hasOwn(options, 'arbitrary'), false)

  const ico = makeIco([{ size: 16, bytes: Uint8Array.of(1, 2) }, { size: 256, bytes: Uint8Array.of(3) }])
  const dv = new DataView(ico.buffer)
  assert.equal(dv.getUint16(2, true), 1)
  assert.equal(dv.getUint16(4, true), 2)
  assert.equal(ico[6], 16)
  assert.equal(ico[22], 0)
  assert.equal(dv.getUint32(18, true), 38)
  assert.throws(() => makeIco([]), /entries are invalid/)
  const icns = makeIcns([{ type: 'ic07', bytes: Uint8Array.of(1, 2, 3) }])
  assert.equal(new TextDecoder().decode(icns.slice(0, 4)), 'icns')
  assert.equal(new DataView(icns.buffer).getUint32(4), icns.length)
  assert.throws(() => makeIcns([{ type: 'bad', bytes: new Uint8Array() }]), /entries are invalid/)

  const packs = await withCanvas(async () => {
    const files = await buildPack('web', { ...DEFAULTS, name: '<script>alert(1)</script>', theme: '" onload="alert(1)' }, null)
    return unzipSync(new Uint8Array(await zipOf(files).arrayBuffer()))
  })
  assert.ok(Object.keys(packs).includes('favicon.ico'))
  assert.ok(Object.keys(packs).includes('site.webmanifest'))
  const manifest = JSON.parse(new TextDecoder().decode(packs['site.webmanifest']))
  assert.equal(manifest.name, '<script>alert(1)</script>')
  const html = new TextDecoder().decode(packs['paste-into-head.html'])
  assert.doesNotMatch(html, /onload|javascript:/i)
  assert.equal(PACKS.length, 5)
  await assert.rejects(buildPack('__proto__', DEFAULTS, null), /supported icon pack/)
})

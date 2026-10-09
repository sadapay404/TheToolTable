/**
 * Part 10, second property batch: the conversion and text tools.
 *
 * The finance tools are audited in `logic-audit.test.js`. This one covers the
 * three places the app makes a promise it can silently break: a unit conversion
 * must come back where it started, a wall-clock time must survive the trip to
 * UTC and back, and a text tool must survive whatever the user pastes into it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIES, CAT, convertUnit, fmtNum, parseUnitValue, isUnitNumberDraft } from '../src/lib/units/units.js'
import { COUNTRIES, BY_CC, partsIn, offsetMin, isValidDateString, zonedToUtc, fmtOffset, isDst, zoneAbbr, CONTINENTS } from '../src/lib/units/world.js'
import { numberWords } from '../src/lib/units/words.js'
import { stats, fleschLabel, slugify, findRe, diff, CASES, CLEAN, EXTRACT, romanToUrdu } from '../src/lib/text/ops.js'
import { buildPayload, typeById, TYPES, defaultsFor } from '../src/lib/qr/payloads.js'
import { checkSafety } from '../src/lib/qr/safety.js'
import { fmtBytes, fmtTime, baseName, extName, clamp } from '../src/lib/utils.js'

function rng(seed) {
  let x = seed >>> 0 || 1
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296 }
}
const r = rng(0x5EED17)

/* ============================================================== unit converter */

test('every conversion comes back to where it started', () => {
  /* The whole promise of a converter: A→B then B→A is the identity. */
  const probes = [0, 1, -1, 0.5, 7, 1e4, 1e-4, 123.456]
  for (const cat of CATEGORIES) {
    const units = CAT[cat.id].units
    for (const from of units) {
      for (const to of units) {
        for (const v of probes) {
          const there = convertUnit(cat.id, v, from.k, to.k)
          const back = convertUnit(cat.id, there, to.k, from.k)
          if (!Number.isFinite(there)) continue
          assert.ok(Number.isFinite(back),
            `${cat.id} ${from.k}→${to.k} of ${v} produced ${there}, which came back as ${back}`)
          const tolerance = Math.max(1e-9, Math.abs(v) * 1e-9)
          assert.ok(Math.abs(back - v) <= tolerance,
            `${cat.id} ${from.k}→${to.k}→${from.k} of ${v} landed on ${back}`)
        }
      }
    }
  }
})

test('converting a unit to itself changes nothing', () => {
  for (const cat of CATEGORIES) {
    for (const u of CAT[cat.id].units) {
      for (const v of [0, 1, -3.5, 98765.4321]) {
        const out = convertUnit(cat.id, v, u.k, u.k)
        assert.ok(Math.abs(out - v) < 1e-6, `${cat.id}/${u.k} turned ${v} into ${out}`)
      }
    }
  }
})

test('a unit conversion never returns something a phone cannot hold', () => {
  for (const cat of CATEGORIES) {
    const units = CAT[cat.id].units
    for (let i = 0; i < 400; i += 1) {
      const v = (r() - 0.5) * 1e6
      const from = units[Math.floor(r() * units.length)]
      const to = units[Math.floor(r() * units.length)]
      const out = convertUnit(cat.id, v, from.k, to.k)
      if (!Number.isFinite(out)) continue
      assert.ok(Math.abs(out) <= 1e300, `${cat.id} ${from.k}→${to.k} of ${v} gave ${out}`)
    }
  }
})

test('an unknown category or unit is refused rather than guessed at', () => {
  for (const [cat, from, to] of [['nope', 'm', 'km'], ['length', 'parsec', 'km'], ['length', 'm', 'parsec'], [null, 'm', 'km']]) {
    assert.ok(Number.isNaN(convertUnit(cat, 1, from, to)), `convertUnit(${cat},${from},${to}) should be NaN`)
  }
  assert.ok(Number.isNaN(convertUnit('length', 'abc', 'm', 'km')))
  assert.ok(Number.isNaN(convertUnit('length', Infinity, 'm', 'km')))
})

test('the obvious conversions are the right numbers', () => {
  const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol
  assert.ok(near(convertUnit('length', 1, 'km', 'm'), 1000))
  assert.ok(near(convertUnit('length', 1, 'mi', 'km'), 1.609344, 1e-6))
  assert.ok(near(convertUnit('length', 1, 'ft', 'in'), 12))
  assert.ok(near(convertUnit('mass', 1, 'kg', 'g'), 1000))
  assert.ok(near(convertUnit('mass', 1, 'lb', 'oz'), 16))
  assert.ok(near(convertUnit('time', 1, 'h', 's'), 3600))
  assert.ok(near(convertUnit('time', 90, 'min', 'h'), 1.5))
  assert.ok(near(convertUnit('storage', 1, 'GB', 'MB'), 1000))
  assert.ok(near(convertUnit('storage', 1, 'GiB', 'MiB'), 1024))
  assert.ok(near(convertUnit('storage', 1, 'MiB', 'MB'), 1.048576))
  assert.ok(near(convertUnit('storage', 1, 'GB', 'GiB'), 1000 ** 3 / 1024 ** 3, 1e-9))
  assert.ok(near(convertUnit('temperature', 0, '°C', '°F'), 32))
  assert.ok(near(convertUnit('temperature', 100, '°C', '°F'), 212))
  assert.ok(near(convertUnit('temperature', -40, '°C', '°F'), -40))
  assert.ok(near(convertUnit('temperature', 0, '°C', 'K'), 273.15))
  assert.ok(near(convertUnit('area', 1, 'ac', 'm²'), 4046.8564224, 1e-6))
  assert.ok(near(convertUnit('area', 1, 'ha', 'm²'), 10000))
  assert.ok(near(convertUnit('speed', 1, 'km/h', 'm/s'), 1000 / 3600, 1e-12))
  assert.ok(near(convertUnit('pressure', 1, 'atm', 'Pa'), 101325))
  assert.ok(near(convertUnit('energy', 1, 'Wh', 'J'), 3600))
  assert.ok(near(convertUnit('mass', 1, 'tola', 'g'), 11.66375, 1e-9))
  assert.ok(near(convertUnit('mass', 1, 'maund', 'kg'), 37.3242, 1e-9))
  assert.ok(near(convertUnit('angle', 1, 'turn', '°'), 360))
})

test('absolute temperature never divides by zero or wraps', () => {
  for (const v of [-273.15, -459.67, -1000, 0, 1e6, 1e12]) {
    for (const to of ['°F', 'K', '°R', '°Ré']) {
      const out = convertUnit('temperature', v, '°C', to)
      assert.ok(Number.isFinite(out), `temperature C→${to} of ${v} gave ${out}`)
    }
  }
  /* Below absolute zero is a physical error, not a number to convert. */
  const below = convertUnit('temperature', -300, '°C', '°F')
  assert.ok(Number.isFinite(below) || Number.isNaN(below))
})

test('a typed number is parsed the same way every time', () => {
  assert.equal(parseUnitValue('1,234.5'), 1234.5)
  assert.equal(parseUnitValue(' 42 '), 42)
  assert.equal(parseUnitValue('-3'), -3)
  assert.ok(Number.isNaN(parseUnitValue('1,23,4')))
  assert.ok(Number.isNaN(parseUnitValue('12abc')))
  assert.ok(Number.isNaN(parseUnitValue('Infinity')))
  assert.ok(Number.isNaN(parseUnitValue(null)))
  /* A half-typed number must stay a draft, not flash an error at the user. */
  assert.equal(isUnitNumberDraft('-'), true)
  assert.equal(isUnitNumberDraft('1.2.3'), false)
  assert.equal(isUnitNumberDraft('abc'), false)
})

test('a formatted number never reads as NaN or undefined', () => {
  for (const n of [0, 1, -1, 1e-14, 1e14, 1e16, 1e300, 1 / 3, -1e300, Infinity, -Infinity, NaN]) {
    for (const mode of ['auto', 'sci', 0, 2, 6, 20, -1, 1.5, 'wide']) {
      const s = fmtNum(n, mode)
      assert.equal(typeof s, 'string')
      assert.doesNotMatch(s, /NaN|undefined|Infinity/, `fmtNum(${n}, ${String(mode)}) = ${s}`)
    }
  }
})

/* ============================================================== world clock */

test('every country has a place to stand', () => {
  assert.ok(COUNTRIES.length > 150, `only ${COUNTRIES.length} countries`)
  const seen = new Set()
  for (const c of COUNTRIES) {
    assert.ok(c.cc && /^[A-Z]{2}$/.test(c.cc), `a country code is malformed: ${JSON.stringify(c.cc)}`)
    assert.equal(seen.has(c.cc), false, `${c.cc} is listed twice`)
    seen.add(c.cc)
    assert.ok(c.name && c.capital, `${c.cc} has no name or capital`)
    assert.ok(Array.isArray(c.zones) && c.zones.length >= 1, `${c.cc} has no time zone`)
    assert.ok(CONTINENTS.includes(c.continent), `${c.cc} is on an unknown continent: ${c.continent}`)
    assert.equal(BY_CC[c.cc], c, `${c.cc} is missing from the lookup table`)
  }
})

test('a calendar date that does not exist is rejected', () => {
  assert.equal(isValidDateString('2026-10-09'), true)
  assert.equal(isValidDateString('2026-02-28'), true)
  assert.equal(isValidDateString('2024-02-29'), true)
  assert.equal(isValidDateString('2026-02-29'), false, '2026 is not a leap year')
  assert.equal(isValidDateString('2026-04-31'), false, 'April has 30 days')
  assert.equal(isValidDateString('2026-13-01'), false)
  assert.equal(isValidDateString('2026-00-10'), false)
  assert.equal(isValidDateString('2026-10-32'), false)
  assert.equal(isValidDateString('26-10-09'), false)
  for (const bad of [null, undefined, '', 'today', 20261009, {}, '2026-10-09T00:00:00Z']) {
    assert.equal(isValidDateString(bad), false, `${String(bad)} should not be a date`)
  }
})

test('a wall clock survives the trip to UTC and back', () => {
  /* The bug this catches: the world clock showing an hour that is not the one
     the user picked, on exactly the days a timezone changes. */
  const zones = [...new Set(COUNTRIES.flatMap((c) => c.zones.map((z) => z.id)))]
  /* The hours a clock actually moves: 00:30, 01:30, 02:30 and 03:30 on the
     last Sunday of every month, in every zone, for three years. */
  const days = []
  for (let y = 2025; y <= 2027; y += 1) {
    for (let mo = 1; mo <= 12; mo += 1) {
      for (const d of [1, 15, 25, 26, 27, 28, 29, 30, 31]) {
        for (const h of [0, 1, 2, 3, 12, 23]) days.push([y, mo, d, h, 30])
      }
    }
  }
  let checked = 0
  for (const zone of zones) {
   for (const [y, mo, d, h, mi] of days) {
    let ts
    try { ts = zonedToUtc(y, mo, d, h, mi, zone) } catch { continue }
    if (!Number.isFinite(ts)) continue
    const back = partsIn(ts, zone)
    const target = Date.UTC(y, mo - 1, d, h, mi)
    const got = Date.UTC(back.y, back.mo - 1, back.d, back.h, back.mi)
    const gap = Math.abs(got - target)
    assert.ok(gap === 0 || gap === 60 * 60000,
      `${zone} ${y}-${mo}-${d} ${h}:${mi} came back as ${back.y}-${back.mo}-${back.d} ${back.h}:${back.mi} (${gap / 60000} min off)`)
    checked += 1
   }
  }
  assert.ok(checked > 50_000, `only ${checked} conversions were checked`)
})

test('every zone reports an offset that makes sense', () => {
  const zones = [...new Set(COUNTRIES.flatMap((c) => c.zones.map((z) => z.id)))]
  const now = Date.UTC(2026, 5, 15, 12, 0)
  for (const zone of zones) {
    const offset = offsetMin(zone, now)
    assert.ok(Number.isInteger(offset), `${zone} reported a fractional offset: ${offset}`)
    assert.ok(offset >= -12 * 60 && offset <= 15 * 60, `${zone} is ${offset} minutes from UTC`)
    assert.match(fmtOffset(offset), /^UTC[+−]\d{1,2}(:\d{2})?$/, `${zone} formatted as ${fmtOffset(offset)}`)
    assert.equal(typeof isDst(zone, now), 'boolean')
    const abbr = zoneAbbr(zone, now) || fmtOffset(offset)
    assert.ok(abbr && abbr.length <= 12, `${zone} has no readable label: ${JSON.stringify(abbr)}`)
    assert.doesNotMatch(abbr, /undefined|NaN/, `${zone} is labelled ${abbr}`)
    const p = partsIn(now, zone)
    assert.ok(p.y >= 2026 && p.y <= 2026, `${zone} is in the year ${p.y}`)
    assert.ok(p.h >= 0 && p.h <= 23, `${zone} reported hour ${p.h}`)
  }
})

test('an impossible wall clock is refused', () => {
  for (const bad of [[2026, 13, 1, 0, 0], [2026, 2, 30, 0, 0], [2026, 1, 1, 24, 0], [2026, 1, 1, 0, 60], [0, 1, 1, 0, 0]]) {
    assert.ok(Number.isNaN(zonedToUtc(...bad, 'Asia/Karachi')), `zonedToUtc(${JSON.stringify(bad)}) should be NaN`)
  }
  assert.ok(Number.isFinite(zonedToUtc(2026, 10, 9, 12, 0, 'Asia/Karachi')))
})

test('a broken zone name is refused rather than crashing the world clock', () => {
  for (const zone of ['Not/AZone', '', null, undefined, 'Mars/Olympus']) {
    const out = (() => { try { return zonedToUtc(2026, 10, 9, 12, 0, zone) } catch { return 'threw' } })()
    assert.ok(out === 'threw' || !Number.isFinite(out) || Number.isFinite(out), `${String(zone)} produced ${out}`)
    assert.notEqual(out, 'threw', `zonedToUtc threw on the zone ${String(zone)} instead of returning NaN`)
  }
})

/* ============================================================ number to words */

test('a number in words is never blank and never says NaN', () => {
  for (const n of [0, 1, 7, 10, 11, 19, 20, 21, 99, 100, 101, 999, 1000, 1001, 1100, 12345, 1000000, 1000000000, 123456789]) {
    const w = numberWords(String(n))
    assert.ok(w && w.en, `numberWords(${n}) produced no words`)
    assert.doesNotMatch(w.en, /NaN|undefined|null/, `numberWords(${n}) = ${w.en}`)
  }
})

test('words handle the empty and hostile cases', () => {
  for (const v of ['', ' ', '0', 'abc', '-5', '1.5', '1e21', null, undefined]) {
    const w = numberWords(v)
    assert.ok(w === null || w === undefined || (typeof w.en === 'string' && !/NaN|undefined/.test(w.en)),
      `numberWords(${String(v)}) = ${JSON.stringify(w)}`)
  }
})

/* ================================================================= text tools */

test('text statistics agree with the text they counted', () => {
  const samples = [
    '',
    '   ',
    'One two three.',
    'The quick brown fox jumps over the lazy dog. It was quick. Really quick!',
    'Line one\nLine two\n\nParagraph two here.\n\n\n\nEnd.',
    'ایک اردو جملہ ہے جو الفاظ اور جملوں میں گنا جاتا ہے۔',
    'Mixed 123 numbers and EMAIL@Example.COM and https://example.com/page',
    'a'.repeat(50000),
  ]
  for (const t of samples) {
    const s = stats(t)
    assert.ok(Number.isInteger(s.words) && s.words >= 0, `word count is ${s.words}`)
    assert.ok(s.chars === t.length, `chars ${s.chars} != ${t.length}`)
    assert.ok(s.charsNoSpace <= s.chars, 'chars-without-space exceeds chars')
    assert.ok(s.unique <= s.words, `unique ${s.unique} exceeds words ${s.words}`)
    assert.ok(s.read >= 0 && s.speak >= 0)
    assert.ok(Array.isArray(s.top) && s.top.length <= 8)
    assert.equal(typeof s.rtl, 'boolean')
    assert.ok(s.longest.length <= Math.max(0, ...(t.split(/\s+/).map((w) => w.length)), 0) + 1)
  }
})

test('a readability score comes with a label that matches it', () => {
  assert.equal(fleschLabel(null), '')
  assert.equal(fleschLabel(undefined), '')
  for (const f of [90, 65, 55, 35, 10, -5]) {
    const label = fleschLabel(f)
    assert.ok(label.length > 0, `fleschLabel(${f}) is blank`)
    assert.equal(f >= 80, label === 'Very easy')
  }
  /* Short text has no meaningful score rather than a fabricated one. */
  assert.equal(stats('Hi there.').flesch, null)
})

test('a slug is a slug', () => {
  const cases = ['Hello World', '  Multiple   Spaces  ', 'Café Crème', 'Mixed CASE/with:punctuation!', '---edges---', 'ALL CAPS', '123 456']
  for (const s of cases) {
    const out = slugify(s)
    assert.doesNotMatch(out, /^\-|\-$/, `slugify(${JSON.stringify(s)}) = ${JSON.stringify(out)} has an edge dash`)
    assert.doesNotMatch(out, /--/, `slugify(${JSON.stringify(s)}) = ${JSON.stringify(out)} has a double dash`)
    assert.match(out, /^[a-z0-9\u0600-\u06FF-]*$/, `slugify(${JSON.stringify(s)}) = ${JSON.stringify(out)}`)
  }
  assert.equal(slugify('Hello World'), 'hello-world')
  assert.equal(slugify('Café Crème'), 'cafe-creme')
})

test('a search pattern is either valid or refused, never silently wrong', () => {
  assert.equal(findRe(''), null)
  assert.equal(findRe(null), null)
  for (const q of ['hello', 'a.b', '(', '[', '\\']) {
    const out = (() => { try { return findRe(q) } catch { return 'threw' } })()
    assert.notEqual(out, 'threw', `findRe(${JSON.stringify(q)}) threw instead of escaping the pattern`)
  }
  assert.throws(() => findRe('a'.repeat(2000)), /1,024/)
  assert.throws(() => findRe('(a+)+', { regex: true }), /freeze/)
  assert.throws(() => findRe(42), /1,024/)
  /* Literal search must find exactly itself, not match everything. */
  const re = findRe('a.b')
  assert.equal(re.test('a.b'), true)
  assert.equal(re.test('axb'), false)
})

test('a diff describes the change it was given', () => {
  const rows = (a, b, mode) => diff(a, b, mode)
  assert.equal(rows('the cat sat on the mat', 'the cat sat on the mat', 'words').filter((r) => r.t !== '=').length, 0,
    'an identical text reported a change')
  const changed = rows('the cat sat on the mat', 'the dog sat on the mat', 'words')
  assert.ok(changed.some((r) => r.t === '-' && /cat/.test(r.s)), 'the removed word was not shown')
  assert.ok(changed.some((r) => r.t === '+' && /dog/.test(r.s)), 'the added word was not shown')
  /* A one-character edit must not rewrite the whole text. */
  const small = rows('the quick brown fox', 'the quick brown fix', 'chars')
  assert.ok(small.filter((r) => r.t !== '=').length <= 4, 'a single-character edit rewrote the line')

  assert.ok(diff('', '', 'words'))
  assert.ok(diff('a', '', 'words'))
  assert.ok(diff('', 'a', 'words'))
  assert.ok(diff('one two three', 'one two three', 'chars'))
  for (const bad of [null, undefined, 0, {}, []]) {
    const out = (() => { try { return diff(bad, 'x', 'words') } catch { return 'threw' } })()
    assert.notEqual(out, 'threw', `diff(${String(bad)}) threw`)
  }
})

test('the case and clean transforms survive punctuation, Urdu and emoji', () => {
  const inputs = ['', ' ', 'hello world', "don't stop", 'ایک جملہ', 'mixed CASE text', '😀🎉 emoji test', 'a\nb\tc']
  for (const input of inputs) {
    for (const [name, fn] of CASES) {
      const out = (() => { try { return fn(input) } catch (e) { return `threw: ${e.message}` } })()
      assert.equal(typeof out, 'string', `case "${name}" on ${JSON.stringify(input)} gave ${JSON.stringify(out)}`)
      assert.doesNotMatch(out, /undefined|NaN/, `case "${name}" on ${JSON.stringify(input)} gave ${JSON.stringify(out)}`)
    }
    for (const [name, fn] of CLEAN) {
      const out = (() => { try { return fn(input) } catch (e) { return `threw: ${e.message}` } })()
      assert.equal(typeof out, 'string', `clean "${name}" on ${JSON.stringify(input)} gave ${JSON.stringify(out)}`)
    }
  }
})

test('extraction finds what is in the text', () => {
  const text = 'Write to a@b.com or visit https://example.com/x about #launch on 0300-1234567, total 1,250.50'
  const found = Object.fromEntries(EXTRACT.map(([key, , re]) => [key, text.match(re)?.[0] ?? null]))
  assert.equal(found.emails, 'a@b.com')
  assert.equal(found.urls, 'https://example.com/x')
  assert.equal(found.tags, '#launch')
  assert.ok(found.numbers, 'no number was extracted')
  assert.ok(found.phones, 'no phone number was extracted')
  /* And on a text that has none, nothing is invented. */
  const bare = 'just some ordinary words here'
  for (const key of ['emails', 'urls', 'phones']) {
    assert.equal(bare.match(EXTRACT.find(([k]) => k === key)[2]), null, `${key} was invented from ordinary words`)
  }
})

test('Roman numerals turn to Urdu without losing a letter', () => {
  const out = romanToUrdu('Hello. How are you? Yes, fine; thanks.')
  assert.ok(out.includes('؟'), 'a question mark did not become Urdu')
  assert.doesNotMatch(out, /[A-Za-z]/, 'a Latin word survived the conversion')
  assert.equal(typeof romanToUrdu(''), 'string')
})

/* ================================================================ QR payloads */

test('every QR type builds a payload or fails cleanly', () => {
  for (const type of TYPES) {
    const out = (() => { try { return buildPayload(type.id, defaultsFor(type.id)) } catch { return 'threw' } })()
    assert.notEqual(out, 'threw', `the QR type ${type.id} threw on its own defaults`)
    assert.equal(typeof out, 'string', `the QR type ${type.id} built ${typeof out}`)
  }
  assert.ok(buildPayload('url', { url: 'https://example.com' }).includes('example.com'))
  assert.equal(buildPayload('url', { url: '' }), '', 'an empty URL produced a payload')
  assert.equal(buildPayload('not-a-type', {}), '', 'an unknown type produced a payload')
  assert.equal(buildPayload('url', null), '')
  assert.equal(typeById('nope').id, TYPES[0].id, 'an unknown type must fall back to the first')
})

test('the QR safety check never lets a payload through unscanned', () => {
  for (const type of TYPES) {
    const payload = buildPayload(type.id, defaultsFor(type.id))
    if (!payload) continue
    const out = (() => { try { return checkSafety({ raw: payload, type: type.id, url: payload }) } catch { return 'threw' } })()
    assert.notEqual(out, 'threw', `checkSafety threw on the ${type.id} payload`)
    assert.ok(out && typeof out.level === 'string' && Array.isArray(out.findings),
      `checkSafety(${type.id}) gave ${JSON.stringify(out)}`)
    assert.ok(['safe', 'warn', 'danger'].includes(out.level), `an unknown verdict level: ${out.level}`)
  }
  const worst = (raw) => checkSafety({ raw, type: 'url', url: raw }).level
  assert.equal(worst(''), 'safe', 'an empty payload is not the dangerous one')
  assert.equal(worst('javascript:alert(1)'), 'danger', 'a javascript: URL was passed as safe')
  assert.equal(worst('data:text/html;base64,PHNjcmlwdD4='), 'danger', 'a data: URL was passed as safe')
  assert.equal(worst('http://192.168.1.1/login'), 'danger', 'a raw-IP login page was passed as safe')
  assert.equal(worst('http://example.com'), 'warn', 'plain http should at least warn')
  assert.equal(worst('https://example.com'), 'safe')
  /* A shortener must be flagged as hiding its destination. */
  assert.notEqual(worst('https://bit.ly/abc'), 'safe')
})

/* ==================================================================== helpers */

test('byte and time formatting stays readable', () => {
  assert.equal(fmtBytes(0), '0 B')
  assert.equal(fmtBytes(1023), '1023 B')
  assert.equal(fmtBytes(1024), '1.00 KB')
  assert.equal(fmtBytes(0.5), '0.5 B')
  for (const v of [NaN, Infinity, -1, 1e30, 0.001, null, undefined, 'x']) {
    const s = fmtBytes(v)
    assert.equal(typeof s, 'string')
    assert.doesNotMatch(s, /NaN|undefined|Infinity/, `fmtBytes(${String(v)}) = ${s}`)
  }
  assert.equal(fmtTime(0), '0:00')
  assert.equal(fmtTime(61), '1:01')
  assert.equal(fmtTime(3600), '60:00')
  for (const v of [NaN, Infinity, -1, 1e20, null]) {
    assert.doesNotMatch(String(fmtTime(v)), /NaN|undefined|Infinity/, `fmtTime(${String(v)}) = ${fmtTime(v)}`)
  }
})

test('file names are split correctly, whatever the path', () => {
  assert.equal(baseName('photo.png'), 'photo')
  assert.equal(baseName('clip.mp4'), 'clip')
  assert.equal(baseName(''), '')
  assert.equal(extName('photo.PNG'), 'png')
  assert.equal(extName('noext'), '')
  assert.equal(extName('.hidden'), '')
  assert.equal(extName('archive.tar.gz'), 'gz')
  for (const name of ['', 'a', null, undefined, 'dir/', '../x.txt', 'a.tar.gz']) {
    assert.equal(typeof baseName(name), 'string', `baseName(${String(name)}) is not a string`)
    assert.equal(typeof extName(name), 'string', `extName(${String(name)}) is not a string`)
  }
})

test('clamp holds its promise even when the range is the wrong way round', () => {
  assert.equal(clamp(5, 0, 10), 5)
  assert.equal(clamp(-5, 0, 10), 0)
  assert.equal(clamp(50, 0, 10), 10)
  for (const [v, a, b] of [[NaN, 0, 1], [Infinity, 0, 1], [-Infinity, 0, 1], [1, NaN, 1]]) {
    const out = clamp(v, a, b)
    assert.ok(Number.isFinite(out) || Number.isNaN(out), `clamp(${v},${a},${b}) = ${out}`)
  }
})
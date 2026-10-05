import test from 'node:test'
import assert from 'node:assert/strict'
import { COUNTRIES, partsIn, zonedToUtc, isValidDateString, dayDiff } from '../src/lib/units/world.js'
import { CAT, convertUnit, fmtNum, isUnitNumberDraft, parseUnitValue } from '../src/lib/units/units.js'
import { buildItems, convertMoney, loadRates, refreshAll } from '../src/lib/units/money.js'

const utc = (y, mo, d, h, mi, zone) => zonedToUtc(y, mo, d, h, mi, zone)
const iso = (value) => new Date(value).toISOString()

test('time-zone wall-clock conversion round-trips ordinary, fractional-offset and southern-zone times', () => {
  for (const [y, mo, d, h, mi, zone] of [
    [2026, 10, 5, 14, 25, 'Asia/Karachi'],
    [2024, 1, 1, 12, 30, 'Asia/Kathmandu'],
    [2024, 12, 15, 9, 5, 'Australia/Sydney'],
  ]) {
    const instant = utc(y, mo, d, h, mi, zone)
    assert.ok(Number.isFinite(instant), `${zone} should produce a valid instant`)
    const actual = partsIn(instant, zone)
    assert.deepEqual([actual.y, actual.mo, actual.d, actual.h, actual.mi, actual.s], [y, mo, d, h, mi, 0])
  }
})

test('DST overlaps choose the earlier occurrence in both negative and positive UTC offsets', () => {
  assert.equal(iso(utc(2024, 11, 3, 1, 30, 'America/New_York')), '2024-11-03T05:30:00.000Z')
  assert.equal(iso(utc(2024, 10, 27, 2, 30, 'Europe/Berlin')), '2024-10-27T00:30:00.000Z')
  assert.equal(iso(utc(2024, 4, 7, 1, 45, 'Australia/Lord_Howe')), '2024-04-06T14:45:00.000Z')
})

test('DST gaps move forward by the transition size, including a half-hour transition', () => {
  const ny = utc(2024, 3, 10, 2, 30, 'America/New_York')
  assert.equal(iso(ny), '2024-03-10T07:30:00.000Z')
  assert.deepEqual(partsIn(ny, 'America/New_York'), { y: 2024, mo: 3, d: 10, h: 3, mi: 30, s: 0, wd: 'Sun' })

  const lordHowe = utc(2024, 10, 6, 2, 15, 'Australia/Lord_Howe')
  assert.deepEqual(partsIn(lordHowe, 'Australia/Lord_Howe'), { y: 2024, mo: 10, d: 6, h: 2, mi: 45, s: 0, wd: 'Sun' })
})

test('invalid dates/zones are rejected and the country catalogue contains 195 valid capital zones', () => {
  assert.equal(COUNTRIES.length, 195)
  assert.equal(isValidDateString('2024-02-29'), true)
  assert.equal(isValidDateString('2024-02-30'), false)
  assert.equal(Number.isNaN(utc(2024, 2, 30, 12, 0, 'Asia/Karachi')), true)
  assert.equal(Number.isNaN(utc(2024, 1, 1, 12, 0, 'Not/A_Zone')), true)
  assert.equal(dayDiff({ y: 2024, mo: 12, d: 31 }, { y: 2025, mo: 1, d: 1 }), 1)
  for (const country of COUNTRIES) assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: country.zone }))
})

test('unit conversions cover temperature, fuel economy, SI/imperial and safe numeric parsing', () => {
  assert.equal(convertUnit('temperature', 32, '°F', '°C'), 0)
  assert.equal(convertUnit('temperature', 100, '°C', '°F'), 212)
  assert.equal(convertUnit('length', 1, 'mi', 'm'), 1609.344)
  assert.equal(convertUnit('fuel', 8, 'km/L', 'L/100km'), 12.5)
  assert.ok(Math.abs(convertUnit('fuel', 8, 'km/L', 'mpg US') - 18.81716664) < 1e-7)
  assert.equal(parseUnitValue('1,234.5'), 1234.5)
  assert.equal(parseUnitValue('1e+3'), 1000)
  assert.equal(Number.isNaN(parseUnitValue('12,34')), true)
  assert.equal(Number.isNaN(parseUnitValue('1e+')), true)
  assert.equal(isUnitNumberDraft('1e+'), true)
  assert.equal(isUnitNumberDraft('1.2.3'), false)
  assert.equal(fmtNum(12.3, 'not-a-precision'), '12.3')
  assert.equal(Number.isNaN(convertUnit('not-a-category', 1, 'a', 'b')), true)
  for (const category of Object.values(CAT)) {
    const [from, to] = category.def
    const result = convertUnit(category.id, 1, from, to)
    const restored = convertUnit(category.id, result, to, from)
    assert.ok(Math.abs(restored - 1) < 1e-8, `${category.id}: ${from} → ${to} → ${from}`)
  }
})

test('currency rates reject malformed cached data and build finite conversion options', () => {
  const original = globalThis.localStorage
  try {
    globalThis.localStorage = { getItem: () => JSON.stringify({ fiat: { USD: 1, PKR: 0 }, crypto: [{ id: 'bad' }] }) }
    const rates = loadRates()
    assert.equal(rates.source, 'snapshot')
    const items = buildItems(rates)
    const usd = items.find((item) => item.key === 'f:USD')
    const pkr = items.find((item) => item.key === 'f:PKR')
    assert.ok(usd && pkr)
    assert.ok(Math.abs(convertMoney(100, usd, pkr) - 27681.702) < 0.01)

    globalThis.localStorage = { getItem: () => JSON.stringify({ fiat: { USD: 1, PKR: 280, BAD: -1 }, crypto: [{ id: 'bitcoin', sym: 'btc', name: 'Bitcoin', usd: 65000 }, { id: 'broken', usd: 'NaN' }], fiatAt: Date.now(), cryptoAt: Date.now() }) }
    const cached = loadRates()
    assert.equal(cached.source, 'cache')
    assert.equal(cached.fiat.BAD, undefined)
    assert.equal(cached.crypto.length, 1)
    assert.equal(buildItems({ fiat: null, crypto: 'invalid' }).length > 0, true)
  } finally {
    if (original === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original
  }
})

test('live currency refresh validates both feeds and persists a usable cache', async () => {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage
  const saved = new Map()
  try {
    globalThis.localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      json: async () => String(url).includes('open.er-api.com')
        ? { result: 'success', rates: { USD: 1, PKR: 280, EUR: 0.92, BAD: 0 }, time_last_update_unix: Math.floor(Date.now() / 1000) }
        : [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 65000, market_cap_rank: 1, price_change_percentage_24h: 2.5, sparkline_in_7d: { price: [64000, 64500, 65000] } }],
    })
    const rates = await refreshAll(loadRates())
    assert.equal(rates.source, 'live')
    assert.equal(rates.fiat.PKR, 280)
    assert.equal(rates.fiat.BAD, undefined)
    assert.equal(rates.crypto[0].sym, 'BTC')
    assert.ok(saved.size > 0)
    assert.ok(buildItems(rates).some((item) => item.key === 'c:bitcoin'))
  } finally {
    if (originalFetch === undefined) delete globalThis.fetch
    else globalThis.fetch = originalFetch
    if (originalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalStorage
  }
})

/**
 * Part 10 — a property audit of the app's pure logic.
 *
 * A wrong number in a finance tool is worse than a crash: it looks right. These
 * are not unit tests of expected values; they are invariants that must hold for
 * *any* input, thrown at random with hostile edges, because that is the only
 * way to reach the cases nobody thought to write down.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { pushToolHistory, popToolHistory, resetToolHistory, resolveBack } from '../src/lib/navigation.js'
import { randomIndex, weightedIndex, shuffleSecure, randomFraction } from '../src/lib/decision.js'
import { loan, incomeTax, grossForNet, profit, pk, TOLA, NISAB_G, TAX_TABLES } from '../src/lib/pk/calc.js'
import { totals, inWords, money, nextNumber, num } from '../src/lib/invoice/calc.js'
import { tc, fitFrameSize, frameSeriesPlan } from '../src/lib/frames.js'
import { FIAT_SNAPSHOT } from '../src/lib/units/money.js'
import { buildItems } from '../src/lib/units/money.js'
import { beginTransfer, updateTransfer, finishTransfer, failTransfer, cancelTransfer, activeTransferCount, clearFinishedTransfers, resetTransfers, getTransfers, formatBytes } from '../src/lib/transfers.js'

/** Deterministic PRNG so a failure is always reproducible from the seed. */
function rng(seed) {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13; x >>>= 0
    x ^= x >>> 17
    x ^= x << 5; x >>>= 0
    return x / 4294967296
  }
}
const HOSTILE = [0, -0, 1, -1, 0.5, -0.5, 1e-9, 1e12, -1e12, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE,
  NaN, Infinity, -Infinity, null, undefined, '', ' ', 'abc', '1,234.56', {}, [], true, false]

const rnd = rng(0xC0FFEE)
const randomValue = () => (rnd() < 0.25 ? HOSTILE[Math.floor(rnd() * HOSTILE.length)] : (rnd() - 0.5) * 1e7)

const finite = (v) => Number.isFinite(v)

/* ==================================================== navigation: bugs 6 & 7 */

test('the back stack is a real stack', () => {
  let h = resetToolHistory()
  assert.deepEqual(h, [null])
  h = pushToolHistory(h, 'pdf')
  h = pushToolHistory(h, 'qr')
  assert.deepEqual(h, [null, 'pdf', 'qr'])
  const popped = popToolHistory(h)
  assert.equal(popped.toolId, 'pdf')
  assert.deepEqual(popped.history, [null, 'pdf'])
})

test('pushing the tool you are already in does not stack it twice', () => {
  const h = pushToolHistory(pushToolHistory(resetToolHistory(), 'pdf'), 'pdf')
  assert.deepEqual(h, [null, 'pdf'], 'a double tap must not need two backs')
})

test('back never falls through to exit while a tool is open', () => {
  /* Bug 6: the gesture used to meet an empty stack and close the app. */
  let h = resetToolHistory()
  for (const id of ['metadata', 'converter', 'qr']) h = pushToolHistory(h, id)
  for (let i = 0; i < 3; i += 1) {
    const d = resolveBack({ history: h, active: 'qr' })
    assert.notEqual(d.action, 'exit', `back ${i + 1} from three tools deep must navigate`)
    assert.equal(d.consumed, true)
    h = d.history
  }
  const atRoot = resolveBack({ history: h, active: null })
  assert.equal(atRoot.action, 'exit', 'only the root may leave')
  assert.equal(atRoot.consumed, false, 'and it must not pretend to have handled it')
})

test('back always ends at the collection, never at a header-only page', () => {
  /* Bug 7. */
  let h = resetToolHistory()
  for (let step = 0; step < 40; step += 1) {
    h = pushToolHistory(h, `tool-${step}`)
    const d = resolveBack({ history: h, active: `tool-${step}` })
    h = d.history
    assert.notEqual(d.action, 'exit')
  }
  assert.deepEqual(h, [null])
})

test('an overlay is closed before anything else moves', () => {
  const h = pushToolHistory(resetToolHistory(), 'pdf')
  const d = resolveBack({ history: h, active: 'pdf', overlays: ['search', 'personalize'] })
  assert.equal(d.action, 'close-overlay')
  assert.equal(d.overlay, 'personalize', 'the newest overlay is the visible one')
  assert.deepEqual(d.history, h, 'closing an overlay must not disturb the tool stack')
})

test('a corrupted or missing history still resolves to something sane', () => {
  for (const bad of [undefined, null, [], '', 0, {}, [undefined], [null, null, null]]) {
    const d = resolveBack({ history: bad, active: null })
    assert.ok(['home', 'exit', 'navigate'].includes(d.action), `history=${JSON.stringify(bad)} gave ${d.action}`)
    assert.ok(Array.isArray(d.history) && d.history.length >= 1)
  }
})

/* ================================================== decision: is it actually fair? */

test('the coin is not stuck on one side', () => {
  const counts = [0, 0]
  for (let i = 0; i < 20000; i += 1) counts[randomIndex(2)] += 1
  const share = counts[0] / 20000
  assert.ok(share > 0.47 && share < 0.53, `heads landed ${(share * 100).toFixed(2)}% of the time`)
})

test('randomIndex covers its whole range and nothing outside it', () => {
  for (const n of [1, 2, 3, 7, 16, 64, 1000]) {
    const seen = new Set()
    for (let i = 0; i < 4000; i += 1) {
      const v = randomIndex(n)
      assert.ok(Number.isInteger(v) && v >= 0 && v < n, `randomIndex(${n}) returned ${v}`)
      seen.add(v)
    }
    if (n <= 64) assert.equal(seen.size, n, `randomIndex(${n}) never produced ${n - seen.size} value(s)`)
  }
})

test('randomIndex rejects a range it cannot honour', () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity, 2 ** 32 + 1]) {
    assert.throws(() => randomIndex(bad), `randomIndex(${bad}) should have been refused`)
  }
  assert.equal(randomIndex(1), 0)
})

test('randomFraction is a fraction', () => {
  for (let i = 0; i < 5000; i += 1) {
    const v = randomFraction()
    assert.ok(v >= 0 && v < 1, `randomFraction returned ${v}`)
  }
})

test('a weighted draw respects its weights', () => {
  const counts = [0, 0, 0]
  for (let i = 0; i < 20000; i += 1) counts[weightedIndex([1, 3, 6])] += 1
  const shares = counts.map((c) => c / 20000)
  for (const [i, want] of [0.1, 0.3, 0.6].entries()) {
    assert.ok(Math.abs(shares[i] - want) < 0.02, `weight ${want} landed at ${shares[i].toFixed(3)}`)
  }
})

test('a weighted draw cannot be pushed out of range by a zero or bad weight', () => {
  for (const weights of [[1, 0], [0, 5], [1], [2, 3, 5], [1e-9, 1e9], [3, 0, 0, 2]]) {
    for (let i = 0; i < 400; i += 1) {
      const v = weightedIndex(weights)
      assert.ok(Number.isInteger(v) && v >= 0 && v < weights.length, `weightedIndex(${JSON.stringify(weights)}) returned ${v}`)
    }
  }
  /* A list with nothing to choose from is a caller error, and saying so beats
     silently returning index 0 forever. */
  for (const weights of [[0, 0], [], [-1, 2], [NaN, 1], [Infinity]]) {
    assert.throws(() => weightedIndex(weights), `weightedIndex(${JSON.stringify(weights)}) should have been refused`)
  }
})

test('a shuffle is a permutation, never a copy', () => {
  for (const n of [1, 2, 5, 12, 40]) {
    const items = Array.from({ length: n }, (_, i) => i)
    const out = shuffleSecure(items)
    assert.equal(out.length, n)
    assert.deepEqual([...out].sort((a, b) => a - b), items, 'a shuffle lost or duplicated an item')
  }
})

/* ================================================ Pakistan Money Kit arithmetic */

test('a loan always amortises back to zero', () => {
  const cases = [
    { principal: 1_000_000, rate: 14, months: 60 },
    { principal: 500_000, rate: 0, months: 24 },
    { principal: 250_000, rate: 22.5, months: 36, method: 'flat' },
    { principal: 99_999.99, rate: 7.25, months: 13 },
    { principal: 10, rate: 3, months: 1 },
  ]
  for (const c of cases) {
    const r = loan(c)
    assert.ok(r.rows.length > 0, `${JSON.stringify(c)} produced no schedule`)
    assert.ok(finite(r.total) && finite(r.emi), `${JSON.stringify(c)} produced a non-finite loan`)
    const last = r.rows[r.rows.length - 1]
    assert.ok(last.bal < 1, `${JSON.stringify(c)} finished owing ${last.bal}`)
  }
})

test('a reducing-balance loan charges less interest than the flat one', () => {
  const base = { principal: 2_000_000, rate: 18, months: 48 }
  const reducing = loan({ ...base, method: 'reducing' })
  const flat = loan({ ...base, method: 'flat' })
  assert.ok(reducing.totalInt < flat.totalInt,
    `reducing ${reducing.totalInt.toFixed(0)} should beat flat ${flat.totalInt.toFixed(0)}`)
})

test('a loan balance never increases and never goes negative', () => {
  const r = rng(4242)
  for (let i = 0; i < 400; i += 1) {
    const out = loan({
      principal: r() * 5_000_000,
      rate: r() * 40,
      months: 1 + Math.floor(r() * 360),
      extra: r() * 1000,
      feePct: r() * 5,
    })
    let previous = Infinity
    for (const row of out.rows) {
      assert.ok(row.bal >= -1e-6, 'a balance went negative')
      assert.ok(row.bal <= previous + 1e-6, 'a balance went up')
      assert.ok(row.interest >= -1e-6 && row.princ >= -1e-6, 'a negative instalment component')
      previous = row.bal
    }
  }
})

test('a loan made of hostile numbers is refused quietly, not loudly', () => {
  for (const value of HOSTILE) {
    const out = loan({ principal: value, rate: value, months: value, extra: value, feePct: value })
    assert.ok(Number.isFinite(out.emi), `loan(principal=${String(value)}) gave emi=${out.emi}`)
    assert.ok(Number.isFinite(out.total))
    assert.ok(out.months >= 0 && out.months <= 1200)
  }
})

test('income tax only ever taxes the part of an income that falls in a slab', () => {
  const slabs = TAX_TABLES.income
  const r = rng(99)
  let previous = -1
  for (let i = 0; i < 300; i += 1) {
    const income = r() * 5_000_000
    const out = incomeTax(income, slabs)
    assert.ok(out.total >= -1e-6, 'tax went negative')
    assert.ok(out.total >= previous - 1e-6, 'more income produced less tax')
    previous = out.total
    assert.ok(out.rows.every((row) => row.inSlab >= -1e-6), 'a slab claimed income outside itself')
    assert.ok(out.effective >= 0 && out.effective <= 100, `effective rate ${out.effective}%`)
    const taxable = out.rows.reduce((s, row) => s + row.inSlab, 0)
    assert.ok(Math.abs(taxable - Math.min(income, 5_000_000)) < 1 || out.rows.length === 0,
      'the slabs do not add up to the income')
  }
})

test('a zero-tax table charges nothing and a flat table charges the same rate everywhere', () => {
  assert.equal(incomeTax(1_000_000, [[0, 0]]).total, 0)
  const flat = incomeTax(1_000_000, [[0, 10]])
  assert.ok(Math.abs(flat.total - 100_000) < 1, `expected 100000, got ${flat.total}`)
})

test('the tax slabs survive a hostile table', () => {
  for (const slabs of [null, undefined, [], 'nonsense', [[0]], [[0, 200], [0, -50], [null, 5], [10, 'x']], [[1e30, 50]]]) {
    const out = incomeTax(500_000, slabs)
    assert.ok(Number.isFinite(out.total) && out.total >= 0, `slabs=${JSON.stringify(slabs)} gave ${out.total}`)
    assert.ok(out.rows.length > 0)
  }
})

test('gross-for-net actually nets the target, whatever the table', () => {
  for (const slabs of [TAX_TABLES.income, [[0, 5]], [[0, 0], [500000, 20]], [[0, 35], [1000000, 10]]]) {
    for (const net of [100_000, 750_000, 2_500_000]) {
      const gross = grossForNet(net, slabs)
      assert.ok(gross >= net - 1, `gross ${gross} is below the net ${net}`)
      const back = incomeTax(gross, slabs).total
      assert.ok(Math.abs(gross - back - net) < Math.max(2, net * 0.0005),
        `target net ${net} came back as ${gross - back}`)
    }
  }
})

test('savings never lose money to compounding', () => {
  const r = rng(7)
  for (let i = 0; i < 200; i += 1) {
    const out = profit({
      principal: r() * 1_000_000,
      monthly: r() * 50_000,
      rate: r() * 25,
      years: r() * 30,
      wht: r() * 40,
    })
    assert.ok(out.maturity >= out.deposited - 1e-6, 'compounding made a deposit shrink')
    assert.ok(out.net >= -1e-6 && out.net <= out.gross + 1e-6, 'tax is outside its own bounds')
    assert.ok(Math.abs(out.netMaturity - (out.deposited + out.net)) < 1, 'net maturity does not add up')
    assert.ok(finite(out.maturity) && finite(out.gross))
  }
})

test('the gold and silver constants are the ones the tool claims', () => {
  assert.ok(Math.abs(NISAB_G.silver - 612.36) < 0.01, `silver nisab is ${NISAB_G.silver}g`)
  assert.ok(Math.abs(NISAB_G.gold - 87.48) < 0.01, `gold nisab is ${NISAB_G.gold}g`)
  assert.ok(Math.abs(TOLA - 11.664) < 0.001)
})

test('lakh/crore grouping survives every magnitude', () => {
  for (const n of [0, 1, 999, 1000, 99999, 100000, 1234567, 123456789]) {
    const s = pk(n)
    assert.match(s, /^[\d,]+$/, `pk(${n}) = ${s}`)
    assert.equal(Number(s.replace(/,/g, '')), n, `pk(${n}) = ${s} does not read back`)
  }
})

/* ======================================================= Invoice Studio maths */

test('invoice totals add up', () => {
  const inv = {
    items: [{ qty: 3, price: 250 }, { qty: 1.5, price: 100 }],
    disc: 10, discType: 'pct', taxRate: 17, taxMode: 'exclusive',
    shipping: 40, type: 'invoice', paid: 100,
  }
  const t = totals(inv)
  assert.ok(Math.abs(t.sub - 900) < 1e-6, `subtotal ${t.sub}`)
  assert.ok(Math.abs(t.disc - 90) < 1e-6, `discount ${t.disc}`)
  assert.ok(Math.abs(t.tax - 137.7) < 1e-6, `tax ${t.tax}`)
  assert.ok(Math.abs(t.total - (947.7 + 40)) < 1e-6, `total ${t.total}`)
  assert.ok(Math.abs(t.balance - (t.total - 100)) < 1e-6, `balance ${t.balance}`)
})

test('tax that is already included is never added on top', () => {
  const inv = { items: [{ qty: 1, price: 117 }], taxRate: 17, taxMode: 'included' }
  const t = totals(inv)
  assert.ok(Math.abs(t.total - 117) < 1e-6, `an inclusive-tax invoice came to ${t.total}`)
  assert.ok(Math.abs(t.tax - 17) < 1e-6, `the included tax was ${t.tax}`)
})

test('a receipt with nothing paid is treated as fully paid', () => {
  const inv = { items: [{ qty: 1, price: 500 }], type: 'receipt', paid: 0 }
  const t = totals(inv)
  assert.ok(Math.abs(t.balance) < 1e-6, `a receipt left a ${t.balance} balance`)
})

test('hostile invoice data cannot produce a negative or infinite total', () => {
  const r = rng(31337)
  for (let i = 0; i < 500; i += 1) {
    const inv = {
      items: Array.from({ length: Math.floor(r() * 4) }, () => ({ qty: randomValue(), price: randomValue() })),
      disc: randomValue(), discType: r() < 0.5 ? 'pct' : 'flat',
      taxRate: randomValue(), taxMode: r() < 0.5 ? 'included' : 'exclusive',
      shipping: randomValue(), paid: randomValue(),
      type: r() < 0.5 ? 'receipt' : 'invoice',
    }
    const t = totals(inv)
    assert.ok(finite(t.sub) && finite(t.total) && finite(t.balance), `invoice broke: ${JSON.stringify(t)}`)
    assert.ok(t.total >= -1e-6, `a total went negative: ${t.total}`)
    assert.ok(t.disc <= t.sub + 1e-6, 'the discount exceeded the subtotal')
    assert.ok(t.tax >= -1e-6, 'tax went negative')
  }
})

test('money formatting is exact at every scale and never shows NaN', () => {
  const inv = { cur: 'USD', decimals: 2 }
  for (const n of [0, 1, -1, 0.005, 1234.5, -999999.99, 1e15, 1e-9]) {
    const s = money(n, inv)
    assert.doesNotMatch(s, /NaN|undefined/, `money(${n}) = ${s}`)
    assert.ok(Number.isFinite(Number(s.replace(/[^0-9.-]/g, ''))), `money(${n}) = ${s} is not a number`)
  }
  assert.equal(money(1234567.891, inv), '$1,234,567.89')
  assert.equal(money(-1234.5, inv), '-$1,234.50')
})

test('an invoice number advances and keeps its shape', () => {
  assert.equal(nextNumber('INV-001'), 'INV-002')
  assert.equal(nextNumber('INV-9'), 'INV-10')
  assert.equal(nextNumber(''), 'INV-2')
  assert.equal(nextNumber('INV-009'), 'INV-010')
  for (const input of [null, undefined, 0, 'x', '####']) {
    const next = nextNumber(input)
    assert.equal(typeof next, 'string')
    assert.ok(next.length > 0, `nextNumber(${String(input)}) gave an empty string`)
  }
})

test('amounts in words stay sane at the extremes', () => {
  const inv = { cur: 'PKR', decimals: 2 }
  for (const n of [0, 1, 100, 1000, 1_000_000, 999_999_999]) {
    const w = inWords(n, inv)
    assert.doesNotMatch(w, /NaN|undefined/, `inWords(${n}) = ${w}`)
  }
  assert.equal(num('1,234.56'), 1234.56)
  assert.equal(num('abc'), 0)
  assert.equal(num(''), 0)
})

/* ==================================================== frames and timecode */

test('a timecode always reads back as the same number of seconds', () => {
  for (const s of [0, 1, 59.999, 60, 61.5, 3599.999, 3600, 7322.25, 1e5]) {
    const text = tc(s)
    assert.match(text, /^\d+:\d{2}\.\d{3}$/, `tc(${s}) = ${text}`)
    const [m, sec] = text.split(':')
    assert.ok(Math.abs(Number(m) * 60 + Number(sec) - s) < 0.0015, `tc(${s}) = ${text} does not round-trip`)
  }
})

test('a timecode survives hostile input', () => {
  for (const v of HOSTILE) {
    const text = tc(v)
    assert.match(text, /^\d+:\d{2}\.\d{3}$/, `tc(${String(v)}) = ${text}`)
  }
})

test('frame extraction is always clamped to something a phone can hold', () => {
  const r = rng(5150)
  for (let i = 0; i < 300; i += 1) {
    const w = Math.floor(r() * 20000)
    const h = Math.floor(r() * 20000)
    const fit = fitFrameSize(Math.max(1, w), Math.max(1, h))
    assert.ok(fit.w >= 1 && fit.h >= 1, `fitFrameSize(${w},${h}) = ${JSON.stringify(fit)}`)
    assert.ok(fit.w <= 8192 && fit.h <= 8192, 'a frame edge exceeded the cap')
    assert.ok(fit.w * fit.h <= 32_000_000, 'a frame exceeded the pixel budget')
    const plan = frameSeriesPlan(Math.max(1, w), Math.max(1, h), 1 + Math.floor(r() * 300))
    assert.ok(plan.w >= 1 && plan.h >= 1)
    assert.ok(Number.isFinite(plan.totalPixels) && plan.totalPixels <= 12_000_000)
  }
})

/* ========================================================= currency handling */

test('every rate in the table converts back to itself', () => {
  for (const [code, rate] of Object.entries(FIAT_SNAPSHOT)) {
    assert.ok(finite(rate) && rate > 0, `${code} has a rate of ${rate}`)
    const round = (100 * rate) / rate
    assert.ok(Math.abs(round - 100) < 1e-6, `${code} does not round-trip`)
  }
})

test('the currency picker is built from a well-formed rate table', () => {
  const items = buildItems({ fiat: FIAT_SNAPSHOT, crypto: [], offline: true, at: '2026-10-03' })
  assert.ok(Array.isArray(items) && items.length > 50, `only ${items.length} currencies were offered`)
  for (const item of items.slice(0, 80)) {
    assert.ok(item && item.key && item.usd > 0, `a currency entry is malformed: ${JSON.stringify(item)}`)
    assert.equal(typeof item.name, 'string')
    assert.ok(item.name.length > 0, 'a currency has no name')
  }
})

/* ============================================ the transfer registry, Part 7 */

test('the registry never invents progress it was not told about', () => {
  const r = rng(24680)
  for (let trial = 0; trial < 200; trial += 1) {
    resetTransfers()
    const id = beginTransfer({ kind: 'download', title: 'Model', total: 1000 })
    for (let i = 0; i < 8; i += 1) {
      updateTransfer(id, { received: r() * 2000, total: 1000 })
      const t = getTransfers()[0]
      assert.ok(t.progress >= 0 && t.progress <= 1, `progress escaped 0..1: ${t.progress}`)
    }
    const finished = r() < 0.5
    if (finished) finishTransfer(id, { status: 'completed' })
    else failTransfer(id, new Error('nope'))
    assert.equal(activeTransferCount(), 0, 'a finished transfer is still counted as running')
    const t = getTransfers()[0]
    assert.ok(t.status === 'completed' || t.status === 'failed')
    if (finished) assert.ok(Math.abs(t.progress - 1) < 1e-9, 'a completed transfer is not at 100%')
  }
  resetTransfers()
})

test('progress never runs backwards past what was already reported', () => {
  resetTransfers()
  const id = beginTransfer({ kind: 'download', title: 'Model' })
  let seen = 0
  for (const received of [10, 20, 30, 25, 40, 5]) {
    updateTransfer(id, { received })
    const t = getTransfers()[0]
    assert.ok(t.received >= 0)
    assert.ok(t.received <= 100000, 'a hostile byte count was accepted verbatim')
    if (received >= seen) assert.ok(t.received >= seen, 'reported bytes went backwards')
    seen = Math.max(seen, t.received)
  }
  resetTransfers()
})

test('unknown transfers are refused rather than half-created', () => {
  resetTransfers()
  assert.equal(updateTransfer('nope', { received: 1 }), null)
  assert.equal(finishTransfer('nope'), null)
  assert.equal(failTransfer('nope', new Error('x')), null)
  assert.equal(cancelTransfer('nope'), null)
  assert.equal(getTransfers().length, 0)
})

test('clearing finished work never removes running work', () => {
  resetTransfers()
  const done = beginTransfer({ kind: 'download', title: 'Done' })
  const live = beginTransfer({ kind: 'upload', title: 'Live' })
  updateTransfer(live, { received: 5 })
  finishTransfer(done, { status: 'completed' })
  clearFinishedTransfers()
  const left = getTransfers()
  assert.equal(left.length, 1)
  assert.equal(left[0].id, live, 'the running transfer was cleared')
  resetTransfers()
})

test('byte sizes read back as something a human can read', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1023), '1023 B')
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(1048576), '1.0 MB')
  for (const v of [...HOSTILE, 1e18, 1e-18]) {
    const s = formatBytes(v)
    assert.match(s, /^[\d.]+(e[+-]?\d+)? [KMGT]?B$/, `formatBytes(${String(v)}) = ${s}`)
  }
})
/* Pakistan money maths. Tax tables are editable in the UI; these are the defaults as published for each tax year. */
export const TOLA = 11.664, MASHA = TOLA / 12, RATTI = MASHA / 8, OZ = 31.1035
export const NISAB = { silverTola: 52.5, goldTola: 7.5 }
export const NISAB_G = { silver: NISAB.silverTola * TOLA, gold: NISAB.goldTola * TOLA } // 612.36 g, 87.48 g
export const PRICES = { gold: 436336, silver: 6522, asOf: '3 Oct 2026' } // per tola, 24K / pure — snapshot, user edits

// [from, rate%]  (fixed amounts are derived, so the table always adds up)
export const TAX_TABLES = {
  '2026-27': {
    label: 'Tax year 2027 (Jul 2026 – Jun 2027)',
    salaried: [[0, 0], [600000, 1], [1200000, 11], [2200000, 20], [3200000, 25], [4100000, 29], [5600000, 32], [7000000, 35]],
    business: [[0, 0], [600000, 15], [1200000, 20], [1600000, 30], [3200000, 40], [5600000, 45]],
    surcharge: { salaried: [0, 0], business: [10000000, 10] },
  },
  '2025-26': {
    label: 'Tax year 2026 (Jul 2025 – Jun 2026)',
    salaried: [[0, 0], [600000, 1], [1200000, 11], [2200000, 23], [3200000, 30], [4100000, 35]],
    business: [[0, 0], [600000, 15], [1200000, 20], [1600000, 30], [3200000, 40], [5600000, 45]],
    surcharge: { salaried: [10000000, 9], business: [10000000, 10] },
  },
}
const finiteRange = (value, min, max, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const MAX_ANNUAL_AMOUNT = 1e15

export function incomeTax(income, slabs, sur = [0, 0]) {
  const annual = finiteRange(income, 0, MAX_ANNUAL_AMOUNT)
  const source = Array.isArray(slabs) ? slabs.slice(0, 100) : []
  let normalized = source.filter((row) => Array.isArray(row) && row.length >= 2).map(([from, rate]) => [finiteRange(from, 0, MAX_ANNUAL_AMOUNT), finiteRange(rate, 0, 100)]).sort((a, b) => a[0] - b[0])
  if (!normalized.length) normalized = [[0, 0]]
  if (normalized[0][0] !== 0) normalized.unshift([0, 0])
  const s = []
  for (const row of normalized) {
    if (s.length && s[s.length - 1][0] === row[0]) s[s.length - 1] = row
    else s.push(row)
  }
  const rows = []; let tax = 0, marginal = 0
  s.forEach(([from, rate], i) => {
    const to = i + 1 < s.length ? s[i + 1][0] : Infinity
    const inSlab = Math.max(0, Math.min(annual, to) - from), t = (inSlab * rate) / 100
    rows.push({ from, to, rate, inSlab, tax: t }); tax += t
    if (annual > from) marginal = rate
  })
  const threshold = finiteRange(sur?.[0], 0, MAX_ANNUAL_AMOUNT), surchargeRate = finiteRange(sur?.[1], 0, 100)
  const surcharge = surchargeRate && annual > threshold ? (tax * surchargeRate) / 100 : 0
  return { rows, tax, surcharge, total: tax + surcharge, marginal, effective: annual > 0 ? ((tax + surcharge) / annual) * 100 : 0 }
}
export function grossForNet(netAnnual, slabs, sur = [0, 0]) {
  const target = finiteRange(netAnnual, 0, MAX_ANNUAL_AMOUNT)
  if (!target) return 0
  let lo = target, hi = Math.min(MAX_ANNUAL_AMOUNT, target * 3 + 1e6)
  for (let i = 0; i < 64; i++) {
    const m = (lo + hi) / 2
    if (m - incomeTax(m, slabs, sur).total < target) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

export function loan({ principal, rate, months, method = 'reducing', extra = 0, feePct = 0 } = {}) {
  const P = finiteRange(principal, 0, MAX_ANNUAL_AMOUNT)
  const annualRate = finiteRange(rate, 0, 1_000)
  const n = Math.round(finiteRange(months, 1, 1_200, 1))
  const addOn = finiteRange(extra, 0, MAX_ANNUAL_AMOUNT)
  const feeRate = finiteRange(feePct, 0, 100)
  const flat = method === 'flat', r = annualRate / 1200
  if (!P) return { emi: 0, rows: [], totalInt: 0, total: 0, months: 0, fee: 0, saved: n }
  const emi = flat
    ? (P + (P * annualRate * n) / 1200) / n
    : r === 0 ? P / n : (P * r) / (1 - (1 + r) ** -n)
  const rows = []; let bal = P, totalInt = 0
  for (let m = 1; m <= n && bal > 0.005; m++) {
    const interest = flat ? (P * annualRate) / 1200 : bal * r
    let princ = flat ? P / n : emi - interest
    princ = Math.min(bal, Math.max(0, princ + addOn))
    // In pathological custom settings, never leave a balance unchanged forever.
    if (!princ && !interest) princ = Math.min(bal, P / n)
    const pay = interest + princ
    bal = Math.max(0, bal - princ); totalInt += interest
    rows.push({ m, pay, princ, interest, bal })
  }
  const fee = (P * feeRate) / 100
  return { emi, rows, totalInt, total: P + totalInt, months: rows.length, fee, saved: Math.max(0, n - rows.length) }
}

export function profit({ principal, monthly = 0, rate, years, comp = 12, wht = 20 } = {}) {
  const initial = finiteRange(principal, 0, MAX_ANNUAL_AMOUNT)
  const contribution = finiteRange(monthly, 0, MAX_ANNUAL_AMOUNT)
  const annualRate = finiteRange(rate, 0, 100)
  const duration = finiteRange(years, 0, 100)
  const frequency = [0, 1, 4, 12].includes(Number(comp)) ? Number(comp) : 12
  const taxRate = finiteRange(wht, 0, 100)
  const n = Math.round(duration * 12), pts = []; let bal = initial, dep = initial, gross = 0
  if (!n) return { maturity: bal, deposited: dep, gross: 0, tax: 0, net: 0, netMaturity: dep, pts }
  for (let i = 1; i <= n; i++) {
    bal += contribution; dep += contribution
    const g = frequency === 0
      ? (initial + contribution * (i - 1)) * (annualRate / 1200)
      : bal * ((1 + annualRate / 100 / frequency) ** (frequency / 12) - 1)
    bal += g; gross += g
    if (i % Math.max(1, Math.round(n / 48)) === 0 || i === n) pts.push({ m: i, v: bal, dep })
  }
  const tax = (gross * taxRate) / 100
  return { maturity: bal, deposited: dep, gross, tax, net: gross - tax, netMaturity: dep + gross - tax, pts }
}

/** lakh/crore grouping, as written in Pakistan */
export function pk(n, d = 0) {
  if (!Number.isFinite(Number(n))) return '–'
  const value = Number(n), places = Math.trunc(finiteRange(d, 0, 6)), neg = value < 0, a = Math.abs(value)
  if (a >= 1e21) return (neg ? '-' : '') + a.toExponential(2)
  const [i, f] = a.toFixed(places).split('.'), body = i.length > 3 ? i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + i.slice(-3) : i
  return (neg ? '-' : '') + body + (f ? '.' + f : '')
}
export const rs = (n, d = 0) => 'Rs ' + pk(n, d)
export function short(n) {
  if (!Number.isFinite(Number(n))) return '–'
  const value = Number(n), a = Math.abs(value), s = value < 0 ? '-' : ''
  if (a >= 1e7) return `${s}${+(a / 1e7).toFixed(2)} crore`; if (a >= 1e5) return `${s}${+(a / 1e5).toFixed(2)} lakh`; if (a >= 1e3) return `${s}${+(a / 1e3).toFixed(1)} thousand`; return s + Math.round(a)
}
export const parseNum = (s) => {
  const raw = String(s).trim().replace(/,/g, '')
  if (!raw || !/^\d*(?:\.\d*)?$/.test(raw)) return 0
  const value = Number(raw)
  return Number.isFinite(value) ? Math.min(MAX_ANNUAL_AMOUNT, value) : 0
}
export const csv = (rows) => 'Month,Payment,Principal,Interest,Balance\n' + (Array.isArray(rows) ? rows.slice(0, 1_200) : []).map((r) => [r.m, r.pay, r.princ, r.interest, r.bal].map((x, i) => (i ? Number.isFinite(Number(x)) ? Number(x).toFixed(2) : '0.00' : Math.trunc(finiteRange(x, 0, 1_200)))).join(',')).join('\n')

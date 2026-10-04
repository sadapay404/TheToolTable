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
export function incomeTax(income, slabs, sur = [0, 0]) {
  const s = [...slabs].sort((a, b) => a[0] - b[0]), rows = []; let tax = 0, marginal = 0
  s.forEach(([from, rate], i) => {
    const to = i + 1 < s.length ? s[i + 1][0] : Infinity, inSlab = Math.max(0, Math.min(income, to) - from), t = (inSlab * rate) / 100
    rows.push({ from, to, rate, inSlab, tax: t }); tax += t; if (income > from) marginal = rate
  })
  const surcharge = sur[1] && income > sur[0] ? (tax * sur[1]) / 100 : 0
  return { rows, tax, surcharge, total: tax + surcharge, marginal, effective: income > 0 ? ((tax + surcharge) / income) * 100 : 0 }
}
export function grossForNet(netAnnual, slabs, sur) {
  let lo = netAnnual, hi = netAnnual * 3 + 1e6
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (m - incomeTax(m, slabs, sur).total < netAnnual) lo = m; else hi = m }
  return (lo + hi) / 2
}

export function loan({ principal, rate, months, method = 'reducing', extra = 0, feePct = 0 }) {
  const r = rate / 1200, P = principal
  let emi = 0
  if (method === 'flat') emi = (P + (P * rate * months) / 1200) / months
  else emi = r === 0 ? P / months : (P * r * (1 + r) ** months) / ((1 + r) ** months - 1)
  const rows = []; let bal = P, totalInt = 0, m = 0
  while (bal > 0.005 && m < months + 1) {
    m++
    const interest = method === 'flat' ? (P * rate) / 1200 : bal * r
    let princ = method === 'flat' ? P / months : emi - interest
    princ = Math.min(bal, princ + extra); const pay = interest + princ
    bal -= princ; totalInt += interest; rows.push({ m, pay, princ, interest, bal: Math.max(0, bal) })
    if (m > 1200) break
  }
  const fee = (P * feePct) / 100
  return { emi, rows, totalInt, total: P + totalInt, months: rows.length, fee, saved: months - rows.length }
}

export function profit({ principal, monthly = 0, rate, years, comp = 12, wht = 15 }) {
  const n = Math.round(years * 12), pts = []; let bal = principal, dep = principal, gross = 0
  const mr = comp === 0 ? 0 : null
  for (let i = 1; i <= n; i++) {
    bal += monthly; dep += monthly
    const g = comp === 0 ? (principal + monthly * (i - 1)) * (rate / 1200) : bal * ((1 + rate / 100 / comp) ** (comp / 12) - 1)
    bal += g; gross += g
    if (i % Math.max(1, Math.round(n / 48)) === 0 || i === n) pts.push({ m: i, v: bal, dep })
  }
  const tax = (gross * wht) / 100
  return { maturity: bal, deposited: dep, gross, tax, net: gross - tax, netMaturity: dep + gross - tax, pts }
}

/** lakh/crore grouping, as written in Pakistan */
export function pk(n, d = 0) {
  if (!Number.isFinite(n)) return '–'
  const neg = n < 0, [i, f] = Math.abs(n).toFixed(d).split('.'), body = i.length > 3 ? i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + i.slice(-3) : i
  return (neg ? '-' : '') + body + (f ? '.' + f : '')
}
export const rs = (n, d = 0) => 'Rs ' + pk(n, d)
export function short(n) {
  const a = Math.abs(n), s = n < 0 ? '-' : ''
  if (a >= 1e7) return `${s}${+(a / 1e7).toFixed(2)} crore`; if (a >= 1e5) return `${s}${+(a / 1e5).toFixed(2)} lakh`; if (a >= 1e3) return `${s}${+(a / 1e3).toFixed(1)} thousand`; return s + Math.round(a)
}
export const parseNum = (s) => { const v = parseFloat(String(s).replace(/[^\d.]/g, '')); return Number.isFinite(v) ? v : 0 }
export const csv = (rows) => 'Month,Payment,Principal,Interest,Balance\n' + rows.map((r) => [r.m, r.pay, r.princ, r.interest, r.bal].map((x, i) => (i ? x.toFixed(2) : x)).join(',')).join('\n')

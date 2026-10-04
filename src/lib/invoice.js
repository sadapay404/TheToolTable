/* Invoice maths + PDF layout. The arithmetic is pure (and unit-tested); the PDF is drawn with
   jsPDF, which is already a dependency of the Metadata Extractor. */

export const CURRENCIES = [
  ['USD', '$', 'US Dollar'], ['EUR', '€', 'Euro'], ['GBP', '£', 'Pound Sterling'], ['PKR', '₨', 'Pakistani Rupee'],
  ['INR', '₹', 'Indian Rupee'], ['AED', 'د.إ', 'UAE Dirham'], ['SAR', '﷼', 'Saudi Riyal'], ['CAD', 'C$', 'Canadian Dollar'],
  ['AUD', 'A$', 'Australian Dollar'], ['JPY', '¥', 'Japanese Yen'], ['CNY', '¥', 'Chinese Yuan'], ['TRY', '₺', 'Turkish Lira'],
  ['BRL', 'R$', 'Brazilian Real'], ['ZAR', 'R', 'South African Rand'], ['NGN', '₦', 'Nigerian Naira'], ['BDT', '৳', 'Bangladeshi Taka'],
]

export const TEMPLATES = [
  { id: 'clean', name: 'Clean', accent: [200, 121, 65], style: 'line', blurb: 'Thin rules, lots of air — the safe default.' },
  { id: 'bold', name: 'Bold header', accent: [34, 32, 29], style: 'band', blurb: 'A solid header band in your accent colour.' },
  { id: 'sidebar', name: 'Sidebar', accent: [47, 156, 149], style: 'sidebar', blurb: 'Your details down the left edge, money on the right.' },
  { id: 'minimal', name: 'Minimal', accent: [90, 90, 90], style: 'plain', blurb: 'No fills at all — just type. Prints beautifully in black.' },
]

export const PAYMENT_TERMS = ['Due on receipt', 'Net 7', 'Net 14', 'Net 30', '50% up front']

export function emptyInvoice(over = {}) {
  const today = new Date()
  const iso = (d) => d.toISOString().slice(0, 10)
  const due = new Date(today.getTime() + 14 * 864e5)
  return {
    number: 'INV-0001', currency: 'USD', template: 'clean',
    date: iso(today), due: iso(due), terms: 'Net 14',
    from: { name: '', lines: '' }, to: { name: '', lines: '' },
    lines: [{ desc: 'Service', qty: 1, rate: 0, taxPct: 0 }],
    discount: { mode: 'pct', value: 0 }, shipping: 0, paid: 0,
    notes: 'Thank you for your business.', termsText: 'Payment by bank transfer or cash.',
    logo: null, accent: null, title: 'INVOICE',
    ...over,
  }
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Everything the preview, the PDF and the JSON export agree on. */
export function calcTotals(inv) {
  const lines = (inv.lines || []).map((l) => {
    const qty = Number(l.qty) || 0, rate = Number(l.rate) || 0
    return { ...l, qty, rate, amount: r2(qty * rate), taxPct: Number(l.taxPct) || 0 }
  })
  const sub = r2(lines.reduce((n, l) => n + l.amount, 0))
  const d = inv.discount || { mode: 'pct', value: 0 }
  const discountAmount = r2(Math.min(sub, d.mode === 'pct' ? (sub * (Number(d.value) || 0)) / 100 : Number(d.value) || 0))
  const afterDiscount = r2(sub - discountAmount)
  const share = sub > 0 ? afterDiscount / sub : 0
  const withTax = lines.map((l) => ({ ...l, net: r2(l.amount * share), tax: r2(l.amount * share * (l.taxPct / 100)) }))
  const tax = r2(withTax.reduce((n, l) => n + l.tax, 0))
  const shipping = r2(Number(inv.shipping) || 0)
  const total = r2(afterDiscount + tax + shipping)
  const paid = r2(Number(inv.paid) || 0)
  return { lines: withTax, sub, discountAmount, afterDiscount, tax, shipping, total, paid, balance: r2(total - paid), discount: d }
}

export function fmtNumMoney(n, cur = 'USD', { symbol = true } = {}) {
  const v = Number(n) || 0
  const c = CURRENCIES.find((x) => x[0] === cur)
  const body = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const sign = v < 0 ? '-' : ''
  return symbol && c ? `${sign}${c[1]}${body}` : `${sign}${body}${c ? ` ${c[0]}` : ''}`
}
export const fmtMoney = (n, cur) => fmtNumMoney(n, cur, { symbol: true })

export function nextNumber(list) {
  const nums = (list || []).map((i) => String(i.number || '').match(/(\d+)\s*$/)?.[1]).filter(Boolean).map(Number)
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  const sample = (list || []).find((i) => i.number)?.number || 'INV-0001'
  return sample.replace(/\d+\s*$/, String(next).padStart(String(sample.match(/\d+\s*$/)?.[0] || '1').length, '0'))
}

export const toJSON = (inv) => JSON.stringify({ ...inv, totals: calcTotals(inv) }, null, 2)

export function fromJSON(text) {
  const raw = JSON.parse(text)
  const inv = emptyInvoice()
  for (const k of Object.keys(inv)) if (raw[k] !== undefined) inv[k] = raw[k]
  return inv
}

/* ------------------------------------------------------------------ PDF */

const hex = (rgb) => `#${rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`
const mix = (rgb, f) => rgb.map((n) => n + (255 - n) * f)

/** Draw the invoice on an A4 page. Returns the jsPDF document. */
export async function invoicePDF(inv) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const T = TEMPLATES.find((t) => t.id === inv.template) || TEMPLATES[0]
  const accent = inv.accent ? hexToRgb(inv.accent) : T.accent
  const t = calcTotals(inv)
  const cur = inv.currency
  const W = 210, M = 16
  let y = 20

  const text = (s, x, yy, { size = 10, style = 'normal', color = [30, 30, 30], align = 'left', maxWidth } = {}) => {
    doc.setFontSize(size); doc.setFont('helvetica', style); doc.setTextColor(...color)
    const str = maxWidth ? doc.splitTextToSize(String(s ?? ''), maxWidth) : String(s ?? '')
    doc.text(str, x, yy, { align })
    return Array.isArray(str) ? str.length * size * 0.42 : size * 0.42
  }

  if (T.style === 'band') {
    doc.setFillColor(...accent); doc.rect(0, 0, W, 34, 'F')
    text(inv.title || 'INVOICE', M, 22, { size: 26, style: 'bold', color: [255, 255, 255] })
    text(`#${inv.number}`, W - M, 21, { size: 12, style: 'bold', color: [255, 255, 255], align: 'right' })
    y = 46
  } else if (T.style === 'sidebar') {
    doc.setFillColor(...mix(accent, 0.88)); doc.rect(0, 0, 58, 297, 'F')
    doc.setFillColor(...accent); doc.rect(0, 0, 58, 4, 'F')
    y = 20
  }

  // logo + parties
  const leftX = T.style === 'sidebar' ? 20 : M
  if (inv.logo) {
    try { doc.addImage(inv.logo, 'PNG', leftX, y - 4, 26, 26, undefined, 'FAST') } catch { /* unsupported image — skip it */ }
    y += 28
  }
  let ly = y
  if (T.style !== 'band' && T.style !== 'sidebar') {
    text(inv.title || 'INVOICE', W - M, 24, { size: 24, style: 'bold', color: accent, align: 'right' })
    text(`#${inv.number}`, W - M, 32, { size: 11, style: 'bold', align: 'right' })
    text(`Issued ${inv.date}`, W - M, 38, { size: 9, color: [110, 110, 110], align: 'right' })
    text(`Due ${inv.due}${inv.terms ? ` · ${inv.terms}` : ''}`, W - M, 43, { size: 9, color: [110, 110, 110], align: 'right' })
  }

  if (inv.from?.name || inv.from?.lines) {
    ly += text(inv.from.name || 'From', leftX, ly + 4, { size: 10, style: 'bold' })
    ly += text(inv.from.lines || '', leftX, ly + 4, { size: 9, color: [90, 90, 90], maxWidth: T.style === 'sidebar' ? 40 : 80 })
  }
  if (T.style === 'sidebar') {
    ly += text(inv.title || 'INVOICE', leftX, ly + 8, { size: 16, style: 'bold', color: accent })
    ly += text(`#${inv.number}`, leftX, ly + 5, { size: 10, style: 'bold' })
    ly += text(`Issued ${inv.date}`, leftX, ly + 5, { size: 8.5, color: [90, 90, 90] })
    text(`Due ${inv.due}`, leftX, ly + 4, { size: 8.5, color: [90, 90, 90] })
  }

  let by = T.style === 'band' ? 56 : Math.max(ly + 10, 58)
  text('BILL TO', M, by, { size: 8, style: 'bold', color: [140, 140, 140] })
  by += text(inv.to?.name || 'Client', M, by + 6, { size: 11, style: 'bold' })
  by += text(inv.to?.lines || '', M, by + 4, { size: 9, color: [90, 90, 90], maxWidth: 90 })

  // items table
  let ty = by + 12
  const cols = { desc: M, qty: W - M - 78, rate: W - M - 56, tax: W - M - 33, amount: W - M }
  if (T.style !== 'plain') {
    doc.setFillColor(...mix(accent, 0.86)); doc.rect(M - 2, ty - 5, W - 2 * M + 4, 9, 'F')
  }
  text('DESCRIPTION', cols.desc, ty, { size: 8, style: 'bold', color: [80, 80, 80] })
  text('QTY', cols.qty, ty, { size: 8, style: 'bold', color: [80, 80, 80], align: 'right' })
  text('RATE', cols.rate, ty, { size: 8, style: 'bold', color: [80, 80, 80], align: 'right' })
  text('TAX', cols.tax, ty, { size: 8, style: 'bold', color: [80, 80, 80], align: 'right' })
  text('AMOUNT', cols.amount, ty, { size: 8, style: 'bold', color: [80, 80, 80], align: 'right' })
  ty += 8

  for (const l of t.lines) {
    const h = Math.max(8, text(l.desc || 'Item', cols.desc, ty, { size: 9.5, maxWidth: 88 }))
    text(l.qty, cols.qty, ty, { size: 9.5, align: 'right' })
    text(fmtNumMoney(l.rate, cur, { symbol: false }), cols.rate, ty, { size: 9.5, align: 'right' })
    text(l.taxPct ? `${l.taxPct}%` : '—', cols.tax, ty, { size: 9.5, align: 'right', color: [120, 120, 120] })
    text(fmtNumMoney(l.amount, cur, { symbol: false }), cols.amount, ty, { size: 9.5, align: 'right' })
    ty += h + 2.5
    if (T.style !== 'plain') { doc.setDrawColor(232, 228, 222); doc.line(M, ty - 1.5, W - M, ty - 1.5) }
    if (ty > 250) { doc.addPage(); ty = 24 }
  }

  // totals
  let sy = ty + 8
  const row = (label, val, { bold = false, color = [60, 60, 60], size = 9.5 } = {}) => {
    text(label, W - M - 40, sy, { size, style: bold ? 'bold' : 'normal', align: 'right', color })
    text(val, W - M, sy, { size, style: bold ? 'bold' : 'normal', align: 'right', color })
    sy += 6
  }
  row('Subtotal', fmtNumMoney(t.sub, cur, { symbol: false }))
  if (t.discountAmount) row(`Discount${t.discount.mode === 'pct' ? ` (${t.discount.value}%)` : ''}`, `-${fmtNumMoney(t.discountAmount, cur, { symbol: false })}`)
  if (t.tax) row('Tax', fmtNumMoney(t.tax, cur, { symbol: false }))
  if (t.shipping) row('Shipping', fmtNumMoney(t.shipping, cur, { symbol: false }))
  if (T.style !== 'plain') { doc.setDrawColor(...accent); doc.setLineWidth(0.6); doc.line(W - M - 46, sy - 3, W - M, sy - 3); doc.setLineWidth(0.2) }
  sy += 2
  row(`TOTAL (${cur})`, fmtNumMoney(t.total, cur, { symbol: false }), { bold: true, size: 12, color: accent })
  if (t.paid) row('Paid', `-${fmtNumMoney(t.paid, cur, { symbol: false })}`)
  if (t.paid) row('BALANCE DUE', fmtNumMoney(t.balance, cur, { symbol: false }), { bold: true, color: [30, 30, 30] })

  // footer
  const fy = Math.max(sy + 8, 250)
  if (inv.notes) text(inv.notes, M, fy, { size: 9, color: [90, 90, 90], maxWidth: 100 })
  if (inv.termsText) text(inv.termsText, M, fy + 10, { size: 8.5, color: [130, 130, 130], maxWidth: 100 })
  doc.setDrawColor(...accent); doc.setLineWidth(0.8); doc.line(M, fy - 6, M + 24, fy - 6); doc.setLineWidth(0.2)
  return doc
}

export function hexToRgb(h) {
  const m = String(h).replace('#', '')
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0]
}

/** CSV of the invoice for bookkeeping. */
export function toCSV(inv) {
  const t = calcTotals(inv)
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`
  const rows = [
    ['Invoice', inv.number, 'Date', inv.date, 'Currency', inv.currency],
    ['Client', inv.to?.name || ''],
    [],
    ['Description', 'Qty', 'Rate', 'Tax %', 'Amount'],
    ...t.lines.map((l) => [l.desc, l.qty, l.rate, l.taxPct, l.amount]),
    [],
    ['Subtotal', t.sub], ['Discount', -t.discountAmount], ['Tax', t.tax], ['Shipping', t.shipping], ['Total', t.total], ['Paid', t.paid], ['Balance', t.balance],
  ]
  return rows.map((r) => r.map((c) => (typeof c === 'string' ? esc(c) : c ?? '')).join(',')).join('\n')
}

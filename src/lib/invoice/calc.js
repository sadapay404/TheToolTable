import { numberWords } from '../units/words.js'

export const TYPES = {
  invoice: { label: 'Invoice', title: 'INVOICE', no: 'Invoice no.', due: true, bal: 'Balance due' },
  receipt: { label: 'Receipt', title: 'RECEIPT', no: 'Receipt no.', due: false, bal: 'Amount received' },
  quote: { label: 'Quotation', title: 'QUOTATION', no: 'Quote no.', due: true, dueLabel: 'Valid until', bal: 'Total estimate' },
  credit: { label: 'Credit note', title: 'CREDIT NOTE', no: 'Credit note no.', due: false, bal: 'Credit total' },
  proforma: { label: 'Proforma', title: 'PROFORMA INVOICE', no: 'Proforma no.', due: true, bal: 'Amount payable' },
}
export const CURRENCIES = [
  ['PKR', 'Rs', 'Pakistani rupee'], ['USD', '$', 'US dollar'], ['EUR', '€', 'Euro'], ['GBP', '£', 'British pound'], ['AED', 'AED', 'UAE dirham'], ['SAR', 'SAR', 'Saudi riyal'],
  ['INR', 'INR', 'Indian rupee'], ['CAD', 'CA$', 'Canadian dollar'], ['AUD', 'A$', 'Australian dollar'], ['QAR', 'QAR', 'Qatari riyal'], ['KWD', 'KWD', 'Kuwaiti dinar'], ['TRY', 'TRY', 'Turkish lira'],
  ['BDT', 'BDT', 'Bangladeshi taka'], ['CNY', 'CNY', 'Chinese yuan'], ['JPY', '¥', 'Japanese yen'], ['CHF', 'CHF', 'Swiss franc'], ['SGD', 'S$', 'Singapore dollar'], ['MYR', 'RM', 'Malaysian ringgit'], ['ZAR', 'R', 'South African rand'], ['EGP', 'EGP', 'Egyptian pound'],
]
export const todayISO = (d = 0) => { const x = new Date(Date.now() + d * 864e5); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) }
export const blank = (over = {}) => ({
  id: Math.random().toString(36).slice(2, 9), type: 'invoice', number: 'INV-0001', issue: todayISO(), due: todayISO(14), ref: '',
  cur: 'PKR', decimals: 2, grouping: 'intl',
  from: { name: '', address: '', email: '', phone: '', taxId: '' }, to: { name: '', address: '', email: '', phone: '', taxId: '' },
  items: [{ id: 'a', desc: '', qty: 1, price: 0 }],
  discType: 'pct', disc: 0, taxName: 'Tax', taxRate: 0, taxMode: 'add', shipping: 0, paid: 0,
  notes: '', terms: '', payment: '', words: false, signName: '',
  style: { tpl: 'classic', accent: '#B4715A', size: 'a4', logo: '', sign: '', footer: 'Thank you for your business.', showQty: true, serif: false },
  status: 'draft', created: Date.now(),
  ...over,
})
export const num = (v) => {
  if (v == null || String(v).trim() === '') return 0
  const raw = typeof v === 'string' ? v.replace(/,/g, '').trim() : v
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
export function totals(inv) {
  const items = Array.isArray(inv?.items) ? inv.items.slice(0, 200) : []
  const sub = items.reduce((s, it) => s + Math.min(1_000_000, Math.max(0, num(it?.qty))) * Math.min(1e12, Math.max(0, num(it?.price))), 0)
  const discount = Math.min(1e20, Math.max(0, num(inv?.disc)))
  const disc = inv?.discType === 'pct' ? (sub * Math.min(100, discount)) / 100 : Math.min(sub, discount)
  const base = sub - disc, r = Math.min(100, Math.max(0, num(inv?.taxRate))) / 100
  const tax = inv?.taxMode === 'included' ? base - base / (1 + r) : base * r
  const total = (inv?.taxMode === 'included' ? base : base + tax) + Math.min(1e20, Math.max(0, num(inv?.shipping)))
  const isReceipt = inv?.type === 'receipt', paidInput = Math.min(1e20, Math.max(0, num(inv?.paid))), paid = isReceipt && !paidInput ? total : paidInput
  const balance = ['invoice', 'proforma'].includes(inv?.type) ? total - paid : total
  return { sub, disc, tax, total, paid, balance }
}
const grp = (s, mode) => (mode === 'sa' ? s.replace(/\B(?=(\d{2})+(?!\d))/g, ',') : s.replace(/\B(?=(\d{3})+(?!\d))/g, ','))
export function money(n, inv = {}, symbol = true) {
  const d = Number.isInteger(Number(inv.decimals)) ? Math.min(4, Math.max(0, Number(inv.decimals))) : 2
  const value = Number.isFinite(Number(n)) ? Number(n) : 0
  const neg = value < 0, [i, f] = Math.abs(value).toFixed(d).split('.')
  const integer = inv.grouping === 'sa'
    ? (i.length > 3 ? i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + i.slice(-3) : i)
    : grp(i, 'intl')
  const body = integer + (f ? '.' + f : '')
  const sym = CURRENCIES.find((c) => c[0] === inv.cur)?.[1] || (typeof inv.cur === 'string' ? inv.cur.slice(0, 12) : '')
  return (neg ? '-' : '') + (symbol && sym ? sym + (sym.length > 1 || /[A-Z]/.test(sym) ? ' ' : '') : '') + body
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
export function inWords(n, inv) {
  const [i, f] = Math.abs(n).toFixed(inv.decimals).split('.'), w = numberWords(i)
  if (!w) return ''
  const name = CURRENCIES.find((c) => c[0] === inv.cur)?.[2] || inv.cur
  return `${cap(w.en)} ${name.split(' ').slice(-1)[0] === 'rupee' || /dollar|dinar|riyal|dirham|pound|euro|yuan|franc|lira|taka|rand|yen|ringgit/.test(name) ? name.split(' ').slice(-1)[0] + (w.en === 'one' ? '' : 's') : name}${f && +f ? ` and ${+f}/${'1'.padEnd(inv.decimals + 1, '0')}` : ''} only`
}
export const nextNumber = (n) => { const m = /^(.*?)(\d+)(\D*)$/.exec(n || ''); return m ? m[1] + String(+m[2] + 1).padStart(m[2].length, '0') + m[3] : (n || 'INV-') + '2' }

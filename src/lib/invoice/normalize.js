import { blank, CURRENCIES, TYPES } from './calc.js'

export const MAX_INVOICE_ITEMS = 200
export const MAX_INVOICE_LIBRARY = 100
export const MAX_INVOICE_CLIENTS = 30
export const MAX_INVOICE_BACKUP_CHARS = 10 * 1024 * 1024
export const MAX_INVOICE_IMAGE_DATA_CHARS = 1_000_000
const MAX_AMOUNT = 1e12
const HEX = /^#[0-9a-f]{6}$/i
const IMAGE_DATA = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/
const ownRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v, max) => typeof v === 'string' ? v.slice(0, max) : ''
const positive = (v, max = MAX_AMOUNT) => {
  if (typeof v === 'string') {
    const s = v.trim()
    if (s === '') return ''
    if (!/^\d{0,16}(?:\.\d{0,8})?$/.test(s)) return 0
    const n = Number(s)
    return Number.isFinite(n) ? (n > max ? max : s) : 0
  }
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0
}
const choice = (v, valid, fallback) => valid.includes(v) ? v : fallback
const iso = (v, fallback) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback
const cleanImage = (v) => typeof v === 'string' && v.length <= MAX_INVOICE_IMAGE_DATA_CHARS && IMAGE_DATA.test(v) ? v : ''
const cleanParty = (v, fallback) => {
  const p = ownRecord(v) ? v : {}
  return {
    name: text(p.name, 200), address: text(p.address, 1_200), email: text(p.email, 320),
    phone: text(p.phone, 80), taxId: text(p.taxId, 100),
  }
}
const cleanStyle = (v, fallback) => {
  const s = ownRecord(v) ? v : {}
  const accent = typeof s.accent === 'string' && HEX.test(s.accent) ? s.accent.toUpperCase() : fallback.accent
  return {
    tpl: choice(s.tpl, ['classic', 'modern', 'minimal'], fallback.tpl),
    accent,
    size: choice(s.size, ['a4', 'letter'], fallback.size),
    logo: cleanImage(s.logo), sign: cleanImage(s.sign),
    footer: text(s.footer, 300), showQty: typeof s.showQty === 'boolean' ? s.showQty : fallback.showQty,
    serif: typeof s.serif === 'boolean' ? s.serif : fallback.serif,
  }
}
const cleanItem = (v, index) => {
  const it = ownRecord(v) ? v : {}
  const id = text(it.id, 80) || `item-${index + 1}`
  return { id, desc: text(it.desc, 1_500), qty: positive(it.qty, 1_000_000), price: positive(it.price, MAX_AMOUNT) }
}

export function normalizeInvoice(value) {
  const base = blank()
  const v = ownRecord(value) ? value : {}
  const cur = CURRENCIES.some(([id]) => id === v.cur) ? v.cur : base.cur
  const itemInput = Array.isArray(v.items) ? v.items.slice(0, MAX_INVOICE_ITEMS) : base.items
  const items = itemInput.length ? itemInput.map(cleanItem) : base.items
  const used = new Set()
  for (const item of items) {
    if (used.has(item.id)) item.id = `${item.id.slice(0, 70)}-${used.size + 1}`
    used.add(item.id)
  }
  const status = choice(v.status, ['draft', 'sent', 'paid', 'void'], base.status)
  const decimals = Number.isInteger(Number(v.decimals)) ? Math.min(4, Math.max(0, Number(v.decimals))) : base.decimals
  return {
    id: text(v.id, 80) || base.id,
    type: choice(v.type, Object.keys(TYPES), base.type),
    number: text(v.number, 100), issue: iso(v.issue, base.issue), due: iso(v.due, base.due), ref: text(v.ref, 300),
    cur, decimals, grouping: choice(v.grouping, ['intl', 'sa'], base.grouping),
    from: cleanParty(v.from, base.from), to: cleanParty(v.to, base.to), items,
    discType: choice(v.discType, ['pct', 'flat'], base.discType), disc: positive(v.disc, MAX_AMOUNT),
    taxName: text(v.taxName, 100), taxRate: positive(v.taxRate, 100), taxMode: choice(v.taxMode, ['add', 'included'], base.taxMode),
    shipping: positive(v.shipping, MAX_AMOUNT), paid: positive(v.paid, MAX_AMOUNT),
    notes: text(v.notes, 2_000), terms: text(v.terms, 2_000), payment: text(v.payment, 2_000),
    words: typeof v.words === 'boolean' ? v.words : base.words, signName: text(v.signName, 120),
    style: cleanStyle(v.style, base.style), status,
    created: Number.isFinite(Number(v.created)) && Number(v.created) >= 0 ? Math.min(Number(v.created), Number.MAX_SAFE_INTEGER) : base.created,
  }
}

export function normalizeInvoiceLibrary(value) {
  if (!Array.isArray(value)) return []
  const rows = [], ids = new Set()
  for (const row of value.slice(0, MAX_INVOICE_LIBRARY)) {
    if (!ownRecord(row)) continue
    const item = normalizeInvoice(row)
    if (ids.has(item.id)) item.id = `${item.id.slice(0, 70)}-${rows.length + 1}`
    ids.add(item.id)
    rows.push(item)
  }
  return rows
}

export function normalizeInvoiceClients(value) {
  if (!Array.isArray(value)) return []
  const rows = [], names = new Set()
  for (const row of value.slice(0, MAX_INVOICE_CLIENTS)) {
    if (!ownRecord(row)) continue
    const party = cleanParty(row, {})
    const key = party.name.trim().toLocaleLowerCase()
    if (!key || names.has(key)) continue
    names.add(key)
    rows.push(party)
  }
  return rows
}

export function parseInvoiceBackup(source) {
  if (typeof source !== 'string' || source.length > MAX_INVOICE_BACKUP_CHARS) throw new RangeError('Invoice backup must be 10 MB or smaller.')
  let data
  try { data = JSON.parse(source) } catch { throw new Error('That file is not a valid invoice backup.') }
  if (!ownRecord(data) || data.app !== 'TheToolTable-invoices' || !Array.isArray(data.lib) || !Array.isArray(data.clients)) {
    throw new Error('That file is not a valid TheToolTable invoice backup.')
  }
  return { lib: normalizeInvoiceLibrary(data.lib), clients: normalizeInvoiceClients(data.clients) }
}

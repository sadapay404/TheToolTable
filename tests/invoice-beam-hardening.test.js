import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { blank, money, num, totals } from '../src/lib/invoice/calc.js'
import { layout } from '../src/lib/invoice/layout.js'
import { toPdf } from '../src/lib/invoice/render.js'
import {
  normalizeInvoice, normalizeInvoiceClients, normalizeInvoiceLibrary, parseInvoiceBackup,
  MAX_INVOICE_ITEMS, MAX_INVOICE_BACKUP_CHARS,
} from '../src/lib/invoice/normalize.js'
import {
  Peer, encodeCode, decodeCode, MAX_BEAM_CODE_CHARS, MAX_BEAM_FILE_SIZE,
  MAX_BEAM_CHAT_CHARS,
} from '../src/lib/beam/peer.js'

function withCanvasMeasure(fn) {
  const previous = globalThis.document
  globalThis.document = { createElement: () => ({ getContext: () => ({ measureText: (s) => ({ width: [...String(s)].length * 5 }) }) }) }
  try { return fn() } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous }
}

function peerHarness() {
  const peer = Object.create(Peer.prototype)
  peer.h = {}; peer.state = 'new'; peer.rx = null; peer.pendingFiles = 0; peer.q = Promise.resolve()
  return peer
}

test('invoice totals use strict numeric parsing, cap editable rates, and format Pakistani grouping correctly', () => {
  assert.equal(num('1,250.50'), 1250.5)
  assert.equal(num('12bad'), 0)
  assert.equal(num('Infinity'), 0)
  const inv = { ...blank(), items: [{ id: 'a', qty: '2', price: '1,000' }], discType: 'pct', disc: 10, taxRate: 18, taxMode: 'add', shipping: 100, paid: 200 }
  assert.deepEqual(totals(inv), { sub: 2000, disc: 200, tax: 324, total: 2224, paid: 200, balance: 2024 })
  assert.equal(money(1_234_567.89, { cur: 'PKR', decimals: 2, grouping: 'sa' }), 'Rs 12,34,567.89')
  assert.equal(money(1_234_567.89, { cur: 'USD', decimals: 2, grouping: 'intl' }), '$1,234,567.89')
  assert.equal(totals({ items: [{ qty: -2, price: 10 }], disc: -4, taxRate: 900, shipping: -1 }).total, 0)
})

test('invoice normalization bounds imported fields, images, items, identifiers, and document backups', () => {
  const raw = {
    id: '__proto__', type: '__proto__', number: 'n'.repeat(500), cur: '__proto__', grouping: 'x', decimals: 999,
    from: { name: 'a'.repeat(500), address: 4 }, to: { name: 'Client' },
    items: [
      { id: 'same', desc: 'x'.repeat(3_000), qty: '-5', price: 'Infinity' },
      { id: 'same', desc: 'fine', qty: '1.', price: '20' },
      ...Array.from({ length: MAX_INVOICE_ITEMS + 2 }, (_, i) => ({ id: `line-${i}`, qty: 1, price: 1 })),
    ],
    disc: -8, taxRate: 900, style: { tpl: 'constructor', accent: 'url(javascript:1)', size: 'giant', logo: 'data:image/svg+xml,<svg/>' },
  }
  const normalized = normalizeInvoice(raw)
  assert.equal(normalized.type, 'invoice')
  assert.equal(normalized.cur, 'PKR')
  assert.equal(normalized.grouping, 'intl')
  assert.equal(normalized.decimals, 4)
  assert.equal(normalized.number.length, 100)
  assert.equal(normalized.from.name.length, 200)
  assert.equal(normalized.from.address, '')
  assert.equal(normalized.items.length, MAX_INVOICE_ITEMS)
  assert.equal(normalized.items[0].desc.length, 1_500)
  assert.equal(normalized.items[0].qty, 0)
  assert.equal(normalized.items[0].price, 0)
  assert.notEqual(normalized.items[0].id, normalized.items[1].id)
  assert.equal(normalized.disc, 0)
  assert.equal(normalized.taxRate, 100)
  assert.equal(normalized.style.tpl, 'classic')
  assert.equal(normalized.style.accent, '#B4715A')
  assert.equal(normalized.style.logo, '')

  const rows = normalizeInvoiceLibrary([normalized, { ...normalized, id: normalized.id }, null])
  assert.equal(rows.length, 2)
  assert.notEqual(rows[0].id, rows[1].id)
  assert.equal(normalizeInvoiceClients([{ name: ' A ' }, { name: 'a', email: 'a@example.com' }, null]).length, 1)
  const backup = parseInvoiceBackup(JSON.stringify({ app: 'TheToolTable-invoices', lib: [raw], clients: [{ name: 'Client' }] }))
  assert.equal(backup.lib.length, 1)
  assert.equal(backup.clients[0].name, 'Client')
  assert.throws(() => parseInvoiceBackup(JSON.stringify({ app: 'other', lib: [], clients: [] })), /not a valid/)
  assert.throws(() => parseInvoiceBackup('x'.repeat(MAX_INVOICE_BACKUP_CHARS + 1)), /10 MB or smaller/)
})

test('invoice layout wraps long words, paginates large invoices, and produces a readable PDF', async () => {
  const inv = blank({
    type: 'invoice', style: { ...blank().style, size: 'a4' },
    from: { name: 'Studio' }, to: { name: 'Customer' },
    items: Array.from({ length: 45 }, (_, i) => ({ id: `i${i}`, desc: `Line ${i} ` + 'x'.repeat(100), qty: 1, price: 25 })),
  })
  const result = withCanvasMeasure(() => layout(inv))
  assert.ok(result.pages.length > 1)
  const textOps = result.pages.flat().filter((op) => op.t === 'text')
  assert.ok(textOps.some((op) => op.text === 'Studio'))
  assert.ok(textOps.some((op) => op.text === 'Customer'))
  assert.ok(textOps.every((op) => [...op.text].length <= 200))
  const pdf = await toPdf(result, {}, { title: 'Invoice test' })
  const parsed = await PDFDocument.load(new Uint8Array(await pdf.arrayBuffer()))
  assert.equal(parsed.getPageCount(), result.pages.length)
})

test('Beam signaling codes validate direction, size, payload shape, and exact code boundaries', () => {
  const offer = { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=Beam\r\n' }
  const answer = { type: 'answer', sdp: 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=Beam\r\n' }
  const invitation = encodeCode('O', offer), reply = encodeCode('A', answer)
  assert.equal(decodeCode(invitation).desc.sdp, offer.sdp)
  assert.equal(decodeCode(reply).kind, 'A')
  assert.throws(() => encodeCode('O', answer), /valid Beam invitation/)
  assert.throws(() => decodeCode(invitation + 'garbage'), /damaged or too large/)
  assert.throws(() => decodeCode('x'.repeat(MAX_BEAM_CODE_CHARS + 1)), /too large/)
  assert.throws(() => decodeCode('BEAM-O-not_base64!'), /does not look like/)
})

test('Beam receives only validated, complete, bounded files and safely caps chat', () => {
  const peer = peerHarness(), events = { errors: [], incoming: [], received: [], progress: [], transferErrors: [], chats: [] }
  peer.on('error', (e) => events.errors.push(e))
    .on('incoming', (m) => events.incoming.push(m))
    .on('received', (id, blob, name) => events.received.push({ id, blob, name }))
    .on('recv', (...args) => events.progress.push(args))
    .on('transferError', (...args) => events.transferErrors.push(args))
    .on('chat', (text) => events.chats.push(text))

  peer.onData(JSON.stringify({ t: 'chat', text: 'hello' }))
  assert.deepEqual(events.chats, ['hello'])
  assert.doesNotThrow(() => peer.onData('{bad json'))
  assert.equal(events.errors.length, 1)
  peer.onData(JSON.stringify({ t: 'chat', text: 'x'.repeat(MAX_BEAM_CHAT_CHARS + 1) }))
  assert.equal(events.errors.length, 2)

  peer.onData(JSON.stringify({ t: 'file', id: 'abc_1', name: '../draft\u0000.txt', size: 3, type: 'text/plain' }))
  assert.equal(events.incoming[0].name, '.._draft_.txt')
  peer.onData(Uint8Array.from([1, 2]))
  peer.onData(Uint8Array.from([3]))
  peer.onData(JSON.stringify({ t: 'end', id: 'abc_1' }))
  assert.equal(events.received.length, 1)
  assert.equal(events.received[0].blob.size, 3)
  assert.equal(events.received[0].name, '.._draft_.txt')
  assert.equal(events.progress.at(-1)[1], 3)

  peer.onData(JSON.stringify({ t: 'file', id: 'big', name: 'too-big', size: MAX_BEAM_FILE_SIZE + 1, type: 'application/octet-stream' }))
  assert.equal(events.transferErrors.at(-1)[0], 'big')
  peer.onData(JSON.stringify({ t: 'file', id: 'short', name: 'short', size: 4, type: 'text/plain' }))
  peer.onData(Uint8Array.from([1, 2]))
  peer.onData(JSON.stringify({ t: 'end', id: 'short' }))
  assert.match(events.transferErrors.at(-1)[1], /incomplete/)
  peer.onData(JSON.stringify({ t: 'file', id: 'over', name: 'over', size: 1, type: 'text/plain' }))
  peer.onData(Uint8Array.from([1, 2]))
  assert.match(events.transferErrors.at(-1)[1], /larger than declared/)
})

test('Beam sender chunks files, reports empty-file progress safely, and rejects oversized jobs', async () => {
  const peer = peerHarness(), frames = [], sent = [], failed = []
  peer.dc = { readyState: 'open', bufferedAmount: 0, send: (data) => frames.push(data) }
  peer.on('sent', (...args) => sent.push(args)).on('fail', (...args) => failed.push(args))
  await peer.sendFile(new Blob([new Uint8Array(40_000)], { type: 'application/octet-stream' }), 'file_1')
  assert.equal(typeof frames[0], 'string')
  assert.equal(frames.filter((f) => typeof f !== 'string').length, 3)
  assert.equal(JSON.parse(frames.at(-1)).t, 'end')
  assert.equal(sent.at(-1)[3], true)

  frames.length = 0
  await peer.sendFile(new Blob([]), 'empty')
  assert.equal(frames.length, 2)
  assert.equal(sent.at(-1)[1], 0)
  assert.equal(sent.at(-1)[2], 0)
  assert.equal(sent.at(-1)[3], true)

  const fake = { size: MAX_BEAM_FILE_SIZE + 1, slice() { throw new Error('must not read') } }
  await peer.sendFile(fake, 'too_big')
  assert.match(failed.at(-1)[1], /1 GB or smaller/)
})

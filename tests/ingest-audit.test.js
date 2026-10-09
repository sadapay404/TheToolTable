/**
 * Part 10, sixth batch: the places a file gets in.
 *
 * The QR bulk generator, the invoice library and the Icon Forge all take
 * something the user authored — a CSV from somewhere else, a saved library, a
 * set of options — and all of it eventually reaches a canvas, a QR matrix or a
 * download. A parser that guesses wrong here produces a hundred wrong codes or
 * a corrupt document that only shows up once it is too late to fix.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCSV } from '../src/lib/qr/csv.js'
import { normalizeInvoice, normalizeInvoiceLibrary, normalizeInvoiceClients, MAX_INVOICE_ITEMS, MAX_INVOICE_LIBRARY, MAX_INVOICE_CLIENTS, MAX_INVOICE_IMAGE_DATA_CHARS } from '../src/lib/invoice/normalize.js'
import { normalizeIconOptions, SHAPES, FONTS, PRESETS, DEFAULTS, makeIco } from '../src/lib/icons/forge.js'

/* ========================================================================= CSV */

test('a CSV parses into the grid it describes', () => {
  assert.deepEqual(parseCSV('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']])
  assert.deepEqual(parseCSV('a,b\n1,2\n'), [['a', 'b'], ['1', '2']])
  assert.deepEqual(parseCSV('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']], 'Windows line endings')
  assert.deepEqual(parseCSV('one'), [['one']], 'a single cell is a single row')
})

test('quotes are read the way a spreadsheet writes them', () => {
  assert.deepEqual(parseCSV('"a,b",c'), [['a,b', 'c']], 'a quoted delimiter is part of the cell')
  assert.deepEqual(parseCSV('"say ""hi""",x'), [['say "hi"', 'x']], 'an escaped quote is one quote')
  assert.deepEqual(parseCSV('"line\nbreak",x'), [['line\nbreak', 'x']], 'a newline inside quotes is not a row')
  assert.deepEqual(parseCSV('a,"b"'), [['a', 'b']])
  assert.deepEqual(parseCSV('\uFEFFname,id\n1,2'), [['name', 'id'], ['1', '2']], 'a byte-order mark is stripped')
  assert.throws(() => parseCSV('"\uFEFFname'), /unclosed quote/, 'a BOM inside a quoted field is not a quote opener')
})

test('empty input is an empty grid, not an error', () => {
  for (const empty of ['', '\n', '\n\n\n', '   ', ',', ',,\n,,']) {
    const rows = parseCSV(empty)
    assert.ok(Array.isArray(rows), `${JSON.stringify(empty)} did not parse`)
    assert.ok(rows.every((r) => Array.isArray(r)), `${JSON.stringify(empty)} produced a non-row`)
  }
})

test('the delimiter is detected rather than assumed', () => {
  assert.deepEqual(parseCSV('a;b\n1;2'), [['a', 'b'], ['1', '2']], 'semicolons')
  assert.deepEqual(parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']], 'tabs')
  assert.deepEqual(parseCSV('a,b\n1,2'), [['a', 'b'], ['1', '2']], 'commas')
  /* The delimiter must be chosen from the header, not from the whole file, or a
     single stray semicolon in a comma file re-shapes every row. */
  const mixed = parseCSV('name,email\nAli,a@b.com;Ali,ali@x.com')
  assert.equal(mixed.length, 2)
  assert.equal(mixed[0].length, 2, 'a stray semicolon changed the column count')
  assert.equal(mixed[1][0], 'Ali')
  assert.equal(mixed[1][1], 'a@b.com;Ali')
})

test('a hostile CSV is refused rather than half-read', () => {
  assert.throws(() => parseCSV('"unclosed'), /unclosed quote/)
  assert.throws(() => parseCSV('x'.repeat(60 * 1024 * 1024)), /8 MB/)
  assert.throws(() => parseCSV('"' + 'x'.repeat(20_000) + '"'), /10,000 characters/)
  assert.throws(() => parseCSV(Array.from({ length: 60 }, (_, i) => i).join(',')), /50 columns/)
  assert.throws(() => parseCSV(null), /must be text/)
  assert.throws(() => parseCSV(12345), /must be text/)
  assert.throws(() => parseCSV(undefined), /must be text/)
})

test('a large but legal CSV parses in reasonable time', () => {
  const rows = 20_000
  const csv = Array.from({ length: rows }, (_, i) => `row${i},https://example.com/${i},${i}`).join('\n')
  const started = Date.now()
  const out = parseCSV(csv)
  const took = Date.now() - started
  assert.ok(out.length <= rows && out.length > 1000, `${out.length} rows came back`)
  assert.equal(out[1][0], 'row1')
  assert.ok(took < 5000, `parsing ${rows} rows took ${took}ms`)
})

test('a CSV row count beyond the cap is truncated, not exhausted', () => {
  const csv = Array.from({ length: 200_000 }, (_, i) => `r${i}`).join('\n')
  const started = Date.now()
  const out = parseCSV(csv)
  assert.ok(out.length <= 50_001, `${out.length} rows were returned; the cap did not apply`)
  assert.ok(Date.now() - started < 5000, 'the row cap did not stop the parse early')
})

/* ========================================================== the invoice library */

test('a saved invoice survives a round trip', () => {
  const invoice = {
    type: 'invoice', number: 'INV-001', issue: '2026-10-09', cur: 'PKR',
    from: { name: 'Mubashir' }, to: { name: 'Acme' },
    items: [{ id: 'a', desc: 'Work', qty: 2, price: 100 }],
    disc: 5, discType: 'pct', taxRate: 17, taxMode: 'add', shipping: 10, paid: 50,
  }
  const out = normalizeInvoice(invoice)
  assert.equal(out.number, 'INV-001')
  assert.equal(out.issue, '2026-10-09')
  assert.equal(out.to.name, 'Acme')
  assert.equal(out.items.length, 1)
  assert.equal(out.items[0].desc, 'Work')
  assert.ok(Number.isFinite(out.items[0].qty))
  /* Normalising twice must be the same as normalising once. */
  assert.deepEqual(normalizeInvoice(out), out, 'a normalised invoice does not survive itself')
})

test('a corrupt saved invoice falls back instead of throwing', () => {
  const hostile = [null, undefined, 'x', 42, [], true, { items: 'nope' }, { items: [null, 1, 'x', {}] },
    { type: 'wat', taxMode: 'wat', discType: 'wat' }, { items: new Array(5000).fill({ qty: 1, price: 1 }) }]
  for (const value of hostile) {
    const out = (() => { try { return normalizeInvoice(value) } catch (e) { return `threw: ${e.message}` } })()
    assert.notEqual(typeof out, 'string', `normalizeInvoice(${JSON.stringify(value)?.slice(0, 60)}) threw: ${out}`)
    assert.ok(out && typeof out === 'object', 'no invoice came back')
    assert.ok(Array.isArray(out.items), 'the line items are not an array')
    assert.ok(out.items.length <= MAX_INVOICE_ITEMS, `${out.items.length} items survived the cap`)
    for (const item of out.items) {
      assert.ok(item && typeof item === 'object', 'a line item is not an object')
      assert.ok(Number.isFinite(Number(item.qty)) && Number(item.qty) >= 0, `a quantity of ${item.qty} survived`)
      assert.ok(Number.isFinite(Number(item.price)) && Number(item.price) >= 0, `a price of ${item.price} survived`)
      assert.equal(typeof item.id, 'string', 'a line item has no id')
    }
  }
})

test('the invoice library and client list are capped and cleaned', () => {
  const many = Array.from({ length: 5000 }, (_, i) => normalizeInvoice({ number: `INV-${i}` }))
  const library = normalizeInvoiceLibrary(many)
  assert.ok(Array.isArray(library) && library.length <= MAX_INVOICE_LIBRARY, `${library.length} invoices were kept`)
  assert.ok(library.every((i) => i && typeof i.number === 'string'))

  const clients = normalizeInvoiceClients(Array.from({ length: 500 }, (_, i) => ({ name: `Client ${i}` })))
  assert.ok(clients.length <= MAX_INVOICE_CLIENTS, `${clients.length} clients were kept`)

  for (const hostile of [null, undefined, 'x', 42, {}, [null, 1, 'x', {}]]) {
    assert.ok(Array.isArray(normalizeInvoiceLibrary(hostile)), 'a corrupt library did not become an array')
    assert.ok(Array.isArray(normalizeInvoiceClients(hostile)), 'a corrupt client list did not become an array')
  }
})

test('an embedded image in a saved invoice cannot grow without limit', () => {
  const withImage = normalizeInvoice({ logo: 'data:image/png;base64,' + 'A'.repeat(MAX_INVOICE_IMAGE_DATA_CHARS * 2) })
  assert.ok(String(withImage.logo || '').length <= MAX_INVOICE_IMAGE_DATA_CHARS,
    `an embedded image grew to ${String(withImage.logo).length} characters`)
})

/* ============================================================== the Icon Forge */

test('icon options are clamped to something a canvas can draw', () => {
  const out = normalizeIconOptions({
    text: 'tooltable', size: 9999, radius: -50, pad: 500, angle: 900, offY: -900, weight: 12,
    font: 'Comic Sans', shape: 'blob', mode: 'hologram', bgType: 'plaid', symColor: 'red', bg1: '#GGGGGG',
  })
  assert.equal(out.text, 'too', 'the letters were not cut to the three an icon can hold')
  assert.equal(out.font, DEFAULTS.font, 'an unknown font was kept')
  assert.equal(out.shape, DEFAULTS.shape, 'an unknown shape was kept')
  assert.equal(out.mode, DEFAULTS.mode, 'an unknown mode was kept')
  assert.equal(out.bgType, DEFAULTS.bgType, 'an unknown background type was kept')
  assert.match(out.symColor, /^#[0-9A-F]{6}$/, 'an invalid colour was kept')
  assert.match(out.bg1, /^#[0-9A-F]{6}$/)
  assert.ok(out.weight >= 300 && out.weight <= 900 && out.weight % 100 === 0, `a weight of ${out.weight} survived`)
  assert.ok(out.radius >= 0 && out.radius <= 50, `a radius of ${out.radius} survived`)
  assert.ok(out.pad >= 0 && out.pad <= 40, `a pad of ${out.pad} survived`)
  assert.ok(out.angle >= 0 && out.angle <= 360, `an angle of ${out.angle} survived`)
  assert.ok(out.offY >= -15 && out.offY <= 15, `an offset of ${out.offY} survived`)
})

test('icon options are total, for any input at all', () => {
  for (const value of [null, undefined, 'x', 42, [], true, { text: 42 }, { text: '😀😀😀😀😀' }]) {
    const out = (() => { try { return normalizeIconOptions(value) } catch (e) { return `threw: ${e.message}` } })()
    assert.notEqual(typeof out, 'string', `normalizeIconOptions(${String(value)}) threw: ${out}`)
    for (const [key, v] of Object.entries(out)) {
      assert.doesNotMatch(String(v), /NaN|undefined|Infinity/, `normalizeIconOptions produced ${key}: ${v}`)
    }
  }
  assert.equal(normalizeIconOptions({ text: '😀😀😀😀' }).text, '😀😀😀', 'emoji are letters too')
  assert.equal(normalizeIconOptions({}).name, DEFAULTS.name)
})

test('the forge offers only options it can actually draw', () => {
  assert.ok(SHAPES.length >= 3 && FONTS.length >= 3 && PRESETS.length >= 8)
  for (const [id] of SHAPES) assert.equal(typeof id, 'string')
  for (const [id] of FONTS) assert.equal(typeof id, 'string')
  for (const [a, b] of PRESETS) {
    assert.match(a, /^#[0-9a-f]{6}$/i, `${a} is not a colour`)
    assert.match(b, /^#[0-9a-f]{6}$/i, `${b} is not a colour`)
  }
  /* And every option it hands back has to survive its own normaliser. */
  for (const [shape] of SHAPES) {
    const o = normalizeIconOptions({ shape })
    assert.equal(o.shape, shape, `the forge offers ${shape} but cannot render it`)
  }
  for (const [font] of FONTS) {
    assert.equal(normalizeIconOptions({ font }).font, font, `the forge offers ${font} but cannot render it`)
  }
})

test('an .ico is assembled from real image entries', () => {
  /* Header: reserved 0, type 1, then a count of directory entries. */
  const fake = (size) => {
    const bytes = Buffer.alloc(size * size * 4 + 40)
    bytes.writeUInt32LE(40, 0)          // BITMAPINFOHEADER size
    bytes.writeInt32LE(size, 4)         // width
    bytes.writeInt32LE(size * 2, 8)     // height (image + mask)
    bytes.writeUInt16LE(1, 12)          // planes
    bytes.writeUInt16LE(32, 14)         // bits per pixel
    return bytes
  }
  const entries = [16, 32, 48, 256].map((size) => ({ size, bytes: fake(size === 256 ? 256 : size) }))
  const ico = makeIco(entries)
  assert.ok(ico instanceof Uint8Array, 'the .ico is not a byte array')
  const u16 = (o) => ico[o] | (ico[o + 1] << 8)
  const u32 = (o) => (ico[o] | (ico[o + 1] << 8) | (ico[o + 2] << 16) | (ico[o + 3] << 24)) >>> 0
  assert.equal(u16(0), 0, 'the reserved field is not zero')
  assert.equal(u16(2), 1, 'the type field is not 1 (icon)')
  assert.equal(u16(4), entries.length, 'the entry count is wrong')
  assert.equal(ico.length, 6 + 16 * entries.length + entries.reduce((n, e) => n + e.bytes.length, 0))
  for (const [i, { size }] of entries.entries()) {
    const p = 6 + i * 16
    /* 256 is stored as 0, which is what the format says. */
    assert.equal(ico[p], size >= 256 ? 0 : size, `the ${size}px entry has the wrong width`)
    assert.equal(ico[p + 1], size >= 256 ? 0 : size, `the ${size}px entry has the wrong height`)
    assert.equal(u16(p + 4), 1, `the ${size}px entry is not one colour plane`)
    assert.equal(u16(p + 6), 32, `the ${size}px entry is not 32-bit`)
    assert.ok(u32(p + 8) > 0, `the ${size}px entry is empty`)
    assert.ok(u32(p + 12) + u32(p + 8) <= ico.length, `the ${size}px entry points outside the file`)
  }
  assert.throws(() => makeIco([]), /invalid/)
  assert.throws(() => makeIco(null), /invalid/)
  assert.throws(() => makeIco([{ size: 0, bytes: new Uint8Array(4) }]), /invalid/)
  assert.throws(() => makeIco([{ size: 16 }]), /invalid/)
  /* A Buffer is a Uint8Array, so canvas output is accepted as-is. */
  assert.ok(makeIco([{ size: 16, bytes: Buffer.alloc(64) }]) instanceof Uint8Array)
})
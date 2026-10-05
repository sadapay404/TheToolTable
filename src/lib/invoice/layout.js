import { TYPES, totals, money, inWords, num } from './calc.js'
import { normalizeInvoice } from './normalize.js'

export const PAGE = { a4: [595, 842], letter: [612, 792] }
const SANS = 'Helvetica, Arial, "Noto Sans", "Noto Naskh Arabic", sans-serif', SERIF = 'Times, "Times New Roman", "Noto Serif", serif'
let mctx = null
export const fam = (inv) => (inv.style.serif || inv.style.tpl === 'minimal' ? SERIF : SANS)
export function measure(text, size, bold, family) { mctx ||= document.createElement('canvas').getContext('2d'); mctx.font = `${bold ? 'bold ' : ''}${size}px ${family}`; return mctx.measureText(text).width }
function wrap(text, w, size, bold, family) {
  const out = []
  const fits = (s) => measure(s, size, bold, family) <= w
  for (const para of String(text || '').split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      if (!word) continue
      const candidate = line ? line + ' ' + word : word
      if (fits(candidate)) { line = candidate; continue }
      if (line) { out.push(line); line = '' }
      if (fits(word)) { line = word; continue }
      let part = ''
      for (const char of Array.from(word)) {
        if (part && !fits(part + char)) { out.push(part); part = char }
        else part += char
      }
      line = part
    }
    out.push(line)
  }
  return out
}
const fmtDate = (d) => { if (!d) return ''; const x = new Date(d + 'T00:00'); return isNaN(x) ? d : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }

/** returns { pages: Ops[][], size:[w,h] } — every op uses top-left origin points */
export function layout(value, imgs = {}) {
  const inv = normalizeInvoice(value)
  imgs = imgs && typeof imgs === 'object' ? imgs : {}
  const [W, H] = PAGE[inv.style.size] || PAGE.a4, M = 44, ac = inv.style.accent, F = fam(inv), T = TYPES[inv.type] || TYPES.invoice, t = totals(inv)
  const ink = '#1d1a17', mute = '#6b645d', pages = [[]]
  let ops = pages[0], y = 0
  const text = (x, yy, s, size, o = {}) => { if (s !== '' && s != null) ops.push({ t: 'text', x, y: yy, text: String(s), size, bold: !!o.b, color: o.c || ink, a: o.a || 'l', fam: F }) }
  const rect = (x, yy, w, h, fill, r = 0) => ops.push({ t: 'rect', x, y: yy, w, h, fill, r })
  const line = (x1, y1, x2, y2, c = '#e2dcd2', w = 0.8) => ops.push({ t: 'line', x1, y1, x2, y2, c, w })
  const fit = (img, bw, bh) => { const s = Math.min(bw / img.w, bh / img.h, 1.5); return [img.w * s, img.h * s] }
  const tpl = inv.style.tpl, mod = tpl === 'modern'

  /* ---- header ---- */
  const co = inv.from
  if (mod) { rect(0, 0, W, 132, ac) } else if (tpl === 'classic') rect(0, 0, W, 9, ac)
  const hx = M, hy = mod ? 40 : 38, hc = mod ? '#ffffff' : ink
  let lx = hx
  if (imgs.logo) { const [lw, lh] = fit(imgs.logo, 120, 54); ops.push({ t: 'img', x: hx, y: hy - 6, w: lw, h: lh, key: 'logo' }); lx = hx + lw + 12 }
  text(lx, hy + 14, co.name || 'Your business name', 17, { b: true, c: hc })
  let cy = hy + 30; for (const l of [...wrap(co.address, 230, 9, false, F), co.email, co.phone, co.taxId && 'Tax ID: ' + co.taxId].filter(Boolean)) { text(lx, cy, l, 9, { c: mod ? 'rgba(255,255,255,.85)' : mute }); cy += 12 }
  text(W - M, hy + 20, T.title, tpl === 'minimal' ? 26 : 28, { b: true, c: mod ? '#fff' : ac, a: 'r' })
  text(W - M, hy + 38, '#' + inv.number, 11, { c: mod ? 'rgba(255,255,255,.9)' : mute, a: 'r' })
  y = Math.max(cy, mod ? 132 : 100) + (mod ? 28 : 18)
  if (tpl === 'minimal') { line(M, y - 10, W - M, y - 10, ink, 0.8); }

  /* ---- bill to / details ---- */
  const top = y
  text(M, y, 'BILL TO', 8.5, { b: true, c: ac }); y += 15
  text(M, y, inv.to.name || 'Client name', 12, { b: true }); y += 14
  for (const l of [...wrap(inv.to.address, 240, 9.5, false, F), inv.to.email, inv.to.phone, inv.to.taxId && 'Tax ID: ' + inv.to.taxId].filter(Boolean)) { text(M, y, l, 9.5, { c: mute }); y += 12.5 }
  let ry = top; const rows = [[T.no, inv.number], ['Date', fmtDate(inv.issue)], T.due && inv.due && [T.dueLabel || 'Due date', fmtDate(inv.due)], inv.ref && ['Reference', inv.ref]].filter(Boolean)
  text(W - M, ry, 'DETAILS', 8.5, { b: true, c: ac, a: 'r' }); ry += 15
  for (const [k, v] of rows) { text(W - M - 150, ry, k, 9.5, { c: mute }); text(W - M, ry, v, 9.5, { b: true, a: 'r' }); ry += 14 }
  y = Math.max(y, ry) + 20

  /* ---- items ---- */
  const q = inv.style.showQty, xAmt = W - M, xRate = xAmt - 92, xQty = q ? xRate - 80 : xRate, dW = (q ? xQty : xRate) - M - 30
  const head = () => {
    if (tpl === 'minimal') { line(M, y, W - M, y, ink, 0.8); line(M, y + 22, W - M, y + 22, ink, 0.8) } else rect(M, y, W - 2 * M, 24, tpl === 'classic' ? '#f3ede4' : ink, tpl === 'modern' ? 6 : 0)
    const c = tpl === 'modern' ? '#fff' : ink
    text(M + 8, y + 15.5, 'DESCRIPTION', 8.5, { b: true, c }); if (q) text(xQty, y + 15.5, 'QTY', 8.5, { b: true, c, a: 'r' })
    text(xRate, y + 15.5, q ? 'RATE' : 'AMOUNT', 8.5, { b: true, c, a: 'r' }); if (q) text(xAmt - 8, y + 15.5, 'AMOUNT', 8.5, { b: true, c, a: 'r' }); y += 32
  }
  const newPage = () => { pages.push([]); ops = pages[pages.length - 1]; y = 50; head() }
  head()
  inv.items.forEach((it) => {
    const d = wrap(it.desc || ' ', dW, 10, false, F), amount = num(it.qty) * num(it.price)
    let cursor = 0, first = true
    while (cursor < d.length) {
      const available = Math.floor((H - 150 - y - 12) / 13)
      if (available < 1) { newPage(); continue }
      const end = Math.min(d.length, cursor + available), chunk = d.slice(cursor, end)
      chunk.forEach((l, k) => text(M + 8, y + 10 + k * 13, l, 10))
      if (first) {
        if (q) {
          text(xQty, y + 10, String(+num(it.qty).toFixed(3)), 10, { a: 'r', c: mute })
          text(xRate, y + 10, money(num(it.price), inv, false), 10, { a: 'r', c: mute })
          text(xAmt - 8, y + 10, money(amount, inv, false), 10, { a: 'r', b: true })
        } else text(xRate, y + 10, money(amount, inv, false), 10, { a: 'r', b: true })
        first = false
      }
      y += chunk.length * 13 + 12
      line(M, y - 4, W - M, y - 4)
      cursor = end
      if (cursor < d.length) newPage()
    }
  })

  /* ---- totals ---- */
  const need = 150 + (inv.words ? 0 : 0); if (y + need > H - 60) newPage()
  y += 6
  const tw = 230, tx = W - M - tw, ty0 = y
  const row = (k, v, o = {}) => { text(tx, y + 10, k, o.big ? 11 : 10, { c: o.big ? ink : mute, b: o.big }); text(W - M, y + 10, v, o.big ? 12 : 10, { a: 'r', b: o.b || o.big }); y += o.big ? 22 : 17 }
  row('Subtotal', money(t.sub, inv))
  if (t.disc) row(inv.discType === 'pct' ? `Discount (${+num(inv.disc)}%)` : 'Discount', '-' + money(t.disc, inv))
  if (num(inv.taxRate)) row(`${inv.taxName || 'Tax'} (${+num(inv.taxRate)}%${inv.taxMode === 'included' ? ' incl.' : ''})`, money(t.tax, inv))
  if (num(inv.shipping)) row('Shipping', money(num(inv.shipping), inv))
  y += 2; line(tx, y, W - M, y, ink, 0.8); y += 6
  const showBal = ['invoice', 'proforma'].includes(inv.type) && t.paid
  row(showBal ? 'Total' : T.bal, money(t.total, inv), { big: !showBal })
  if (showBal) { row('Paid', '-' + money(t.paid, inv)); rect(tx - 8, y - 2, tw + 16, 30, ac, 8); text(tx, y + 18, T.bal, 11, { b: true, c: '#fff' }); text(W - M - 4, y + 18, money(t.balance, inv), 13, { b: true, c: '#fff', a: 'r' }); y += 36 }
  else if (inv.type === 'receipt') { y += 4; rect(tx - 8, y - 2, tw + 16, 28, ac, 8); text(tx + 4, y + 17, 'PAID IN FULL', 10.5, { b: true, c: '#fff' }); y += 34 }
  if (inv.words) { const wl = wrap(inWords(t.total, inv), tx - M - 20, 9.5, false, F); text(M, ty0 + 12, 'AMOUNT IN WORDS', 8.5, { b: true, c: ac }); wl.forEach((l, k) => text(M, ty0 + 26 + k * 12.5, l, 9.5, { c: mute })) }

  /* ---- notes / terms / payment ---- */
  y += 14
  const blocks = [['NOTES', inv.notes], ['TERMS', inv.terms], ['PAYMENT DETAILS', inv.payment]].filter((b) => b[1])
  const colW = (W - 2 * M - 24) / 2
  for (let i = 0; i < blocks.length; i += 2) {
    const pair = blocks.slice(i, i + 2), ls = pair.map((b) => wrap(b[1], colW, 9, false, F)), h = 16 + Math.max(...ls.map((l) => l.length)) * 12 + 10
    if (y + h > H - 60) newPage()
    pair.forEach((b, k) => { const x = M + k * (colW + 24); text(x, y, b[0], 8.5, { b: true, c: ac }); ls[k].forEach((l, j) => text(x, y + 14 + j * 12, l, 9, { c: mute })) }); y += h
  }
  if (imgs.sign || inv.signName) {
    if (y + 80 > H - 50) newPage(); y += 6
    if (imgs.sign) { const [sw, sh] = fit(imgs.sign, 130, 44); ops.push({ t: 'img', x: W - M - 150, y: y, w: sw, h: sh, key: 'sign' }) }
    line(W - M - 150, y + 50, W - M, y + 50, mute, 0.6); text(W - M - 150, y + 63, inv.signName || 'Authorised signature', 9, { c: mute })
  }
  /* ---- footer on every page ---- */
  pages.forEach((p, i) => {
    ops = p; line(M, H - 44, W - M, H - 44); text(M, H - 28, inv.style.footer || '', 9, { c: mute }); if (pages.length > 1) text(W - M, H - 28, `Page ${i + 1} of ${pages.length}`, 9, { c: mute, a: 'r' })
  })
  return { pages, size: [W, H], totals: t }
}

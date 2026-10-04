import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const hexc = (h) => { if (h.startsWith('rgba')) return rgb(1, 1, 1); const n = parseInt(h.replace('#', '').slice(0, 6), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) }
const latin = (s) => /^[\x20-\x7E\xA0-\xFF€£¥]*$/.test(s.replace(/€/g, 'x'))

export async function loadImg(src) {
  if (!src) return null
  return new Promise((res) => { const i = new Image(); i.onload = () => res({ el: i, w: i.naturalWidth, h: i.naturalHeight, src }); i.onerror = () => res(null); i.src = src })
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (r && ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h) }
export function drawPage(canvas, ops, size, imgs, scale = 1.6) {
  const [W, H] = size; canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale)
  const c = canvas.getContext('2d'); c.scale(scale, scale); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H)
  for (const o of ops) {
    if (o.t === 'rect') { c.fillStyle = o.fill; rr(c, o.x, o.y, o.w, o.h, o.r); c.fill() }
    else if (o.t === 'line') { c.strokeStyle = o.c; c.lineWidth = o.w; c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(o.x2, o.y2); c.stroke() }
    else if (o.t === 'text') { c.font = `${o.bold ? 'bold ' : ''}${o.size}px ${o.fam}`; c.fillStyle = o.color; c.textAlign = o.a === 'r' ? 'right' : o.a === 'c' ? 'center' : 'left'; c.textBaseline = 'alphabetic'; c.fillText(o.text, o.x, o.y) }
    else if (o.t === 'img' && imgs[o.key]) c.drawImage(imgs[o.key].el, o.x, o.y, o.w, o.h)
  }
}
async function textPng(o) {
  const px = o.size * 3, c = document.createElement('canvas'), x = c.getContext('2d'), f = `${o.bold ? 'bold ' : ''}${px}px "Noto Nastaliq Urdu","Noto Naskh Arabic",Arial,sans-serif`
  x.font = f; const w = Math.ceil(x.measureText(o.text).width) + 12, h = Math.ceil(px * 1.7); c.width = w; c.height = h; x.font = f; x.fillStyle = o.color; x.textBaseline = 'middle'; x.direction = 'auto'; x.fillText(o.text, 6, h / 2)
  const b = await new Promise((r) => c.toBlob(r, 'image/png')); return { bytes: new Uint8Array(await b.arrayBuffer()), w: w / 3, h: h / 3 }
}
const bytesOf = (src) => { const [h, d] = src.split(','); return { bytes: Uint8Array.from(atob(d), (c) => c.charCodeAt(0)), png: /png/.test(h) } }

export async function toPdf(result, imgs, meta = {}) {
  const out = await PDFDocument.create(), [W, H] = result.size
  const f = { sans: await out.embedFont(StandardFonts.Helvetica), sansB: await out.embedFont(StandardFonts.HelveticaBold), serif: await out.embedFont(StandardFonts.TimesRoman), serifB: await out.embedFont(StandardFonts.TimesRomanBold) }
  const emb = {}
  for (const k of Object.keys(imgs)) if (imgs[k]) { const { bytes, png } = bytesOf(imgs[k].src); try { emb[k] = png ? await out.embedPng(bytes) : await out.embedJpg(bytes) } catch { /* webp etc: re-encode */ const c = document.createElement('canvas'); c.width = imgs[k].w; c.height = imgs[k].h; c.getContext('2d').drawImage(imgs[k].el, 0, 0); const b = await new Promise((r) => c.toBlob(r, 'image/png')); emb[k] = await out.embedPng(new Uint8Array(await b.arrayBuffer())) } }
  for (const ops of result.pages) {
    const pg = out.addPage([W, H])
    for (const o of ops) {
      if (o.t === 'rect') {
        if (o.r) { // rounded rect via svg path
          const r = Math.min(o.r, o.h / 2, o.w / 2), p = `M ${r} 0 L ${o.w - r} 0 Q ${o.w} 0 ${o.w} ${r} L ${o.w} ${o.h - r} Q ${o.w} ${o.h} ${o.w - r} ${o.h} L ${r} ${o.h} Q 0 ${o.h} 0 ${o.h - r} L 0 ${r} Q 0 0 ${r} 0 Z`
          pg.drawSvgPath(p, { x: o.x, y: H - o.y, color: hexc(o.fill), borderWidth: 0 })
        } else pg.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h, color: hexc(o.fill) })
      } else if (o.t === 'line') pg.drawLine({ start: { x: o.x1, y: H - o.y1 }, end: { x: o.x2, y: H - o.y2 }, thickness: o.w, color: hexc(o.c) })
      else if (o.t === 'img' && emb[o.key]) pg.drawImage(emb[o.key], { x: o.x, y: H - o.y - o.h, width: o.w, height: o.h })
      else if (o.t === 'text') {
        const col = hexc(o.color), op = o.color.startsWith('rgba') ? 0.85 : 1
        if (latin(o.text)) {
          const font = o.fam.startsWith('Times') ? (o.bold ? f.serifB : f.serif) : o.bold ? f.sansB : f.sans, w = font.widthOfTextAtSize(o.text, o.size), dx = o.a === 'r' ? -w : o.a === 'c' ? -w / 2 : 0
          pg.drawText(o.text, { x: o.x + dx, y: H - o.y, size: o.size, font, color: col, opacity: op })
        } else { const t = await textPng(o), im = await out.embedPng(t.bytes), dx = o.a === 'r' ? -t.w : o.a === 'c' ? -t.w / 2 : 0; pg.drawImage(im, { x: o.x + dx - 2, y: H - o.y - t.h * 0.38, width: t.w, height: t.h }) }
      }
    }
  }
  out.setTitle(meta.title || 'Invoice'); out.setProducer('TheToolTable'); out.setCreator('TheToolTable')
  return new Blob([await out.save()], { type: 'application/pdf' })
}

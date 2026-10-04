import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib'
import { zipSync } from 'fflate'

const jsCache = new Map(), thumbCache = new Map()
let pdfjsP
export function pdfjsLib() {
  return (pdfjsP ||= (async () => { const m = await import('pdfjs-dist'); const w = await import('pdfjs-dist/build/pdf.worker.min.mjs?url'); m.GlobalWorkerOptions.workerSrc = w.default; return m })())
}
export async function openJs(doc) {
  if (!jsCache.has(doc.id)) jsCache.set(doc.id, (async () => { const m = await pdfjsLib(); return m.getDocument({ data: doc.bytes.slice() }).promise })())
  return jsCache.get(doc.id)
}
export async function renderCanvas(doc, idx, { width, scale = 1, rotate = 0 } = {}) {
  const js = await openJs(doc), page = await js.getPage(idx + 1)
  const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotate) % 360 })
  const s = width ? width / base.width : scale
  const vp = page.getViewport({ scale: s, rotation: (page.rotate + rotate) % 360 })
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  return c
}
export async function thumb(doc, idx, w = 220) {
  const k = `${doc.id}:${idx}:${w}`
  if (!thumbCache.has(k)) thumbCache.set(k, renderCanvas(doc, idx, { width: w }).then((c) => c.toDataURL('image/jpeg', 0.82)))
  return thumbCache.get(k)
}
export function forget(id) { jsCache.delete(id); for (const k of [...thumbCache.keys()]) if (k.startsWith(id + ':')) thumbCache.delete(k) }

let counter = 0
export async function loadDoc(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const lib = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const doc = { id: 'd' + (++counter) + Math.random().toString(36).slice(2, 5), name: file.name, bytes, pages: lib.getPageCount(), size: bytes.length }
  try { await openJs(doc) } catch (e) { forget(doc.id); throw new Error(/password/i.test(e?.name + e?.message) ? 'This PDF is password-protected. Remove the password first.' : 'Could not read this PDF.') }
  return doc
}
export const fromBytes = async (bytes, name) => { const f = new File([bytes], name, { type: 'application/pdf' }); return loadDoc(f) }

/** "1-3, 5, 8-" → [[0,2],[4,4],[7,n-1]] (0-based inclusive) */
export function parseRanges(str, n) {
  const out = []
  for (const part of String(str).split(/[,;\s]+/).filter(Boolean)) {
    if (/^all$/i.test(part)) { out.push([0, n - 1]); continue }
    const m = part.match(/^(\d*)-(\d*)$/) || part.match(/^(\d+)()$/)
    if (!m) return { error: `“${part}” isn't a page or range` }
    let a = m[1] === '' ? 1 : +m[1], b = m[2] === '' ? (part.includes('-') ? n : a) : +m[2]
    if (!part.includes('-')) b = a
    if (a < 1 || b < 1 || a > n || b > n) return { error: `Page ${a > n || a < 1 ? a : b} is outside 1–${n}` }
    if (a > b) [a, b] = [b, a]
    out.push([a - 1, b - 1])
  }
  if (!out.length) return { error: 'Enter at least one page or range' }
  return { ranges: out }
}
export const rangeToIdx = (ranges) => ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))

const libOf = (doc) => (doc._lib ||= PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false }))
export const clearLib = (doc) => { delete doc._lib }

/** pages: [{docId|blank, src, rot, w,h}] → bytes. Copies pages untouched (no recompression). */
export async function buildOrganized(docs, pages, onProgress) {
  const out = await PDFDocument.create(), byId = new Map(docs.map((d) => [d.id, d]))
  const sources = new Map()
  for (const p of pages) if (!p.blank) { if (!sources.has(p.docId)) sources.set(p.docId, new Set()); sources.get(p.docId).add(p.src) }
  const copied = new Map()
  for (const [id, set] of sources) {
    const src = await libOf(byId.get(id)), idx = [...set].sort((a, b) => a - b)
    const cp = await out.copyPages(src, idx)
    idx.forEach((i, k) => copied.set(id + ':' + i, [cp[k]]))
  }
  let n = 0
  for (const p of pages) {
    let pg
    if (p.blank) pg = out.addPage([p.w || 595.28, p.h || 841.89])
    else {
      const key = p.docId + ':' + p.src, bucket = copied.get(key)
      let page = bucket.shift()
      if (!page) { const src = await libOf(byId.get(p.docId)); [page] = await out.copyPages(src, [p.src]) }
      pg = out.addPage(page)
      const r = (pg.getRotation().angle + (p.rot || 0)) % 360
      pg.setRotation(degrees(r))
    }
    onProgress?.(++n / pages.length)
  }
  return out.save({ useObjectStreams: true })
}
export async function extractPages(doc, idx) {
  const src = await libOf(doc), out = await PDFDocument.create()
  const cp = await out.copyPages(src, idx); cp.forEach((p) => out.addPage(p))
  return out.save()
}
export function zipFiles(files) { const o = {}; for (const [n, b] of files) o[n] = b; return new Blob([zipSync(o, { level: 0 })], { type: 'application/zip' }) }

export async function imagesToPdf(items, { size = 'fit', margin = 0, landscape = 'auto', onProgress } = {}) {
  const out = await PDFDocument.create(), SIZES = { a4: [595.28, 841.89], letter: [612, 792], a5: [419.53, 595.28] }
  let n = 0
  for (const it of items) {
    const bytes = new Uint8Array(await it.file.arrayBuffer()); let img
    const t = it.file.type
    try { img = t === 'image/jpeg' ? await out.embedJpg(bytes) : t === 'image/png' ? await out.embedPng(bytes) : null } catch { img = null }
    if (!img) { const bm = await createImageBitmap(it.file); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0); const png = await new Promise((r) => c.toBlob(r, 'image/png')); img = await out.embedPng(new Uint8Array(await png.arrayBuffer())) }
    const m = margin * 2.8346
    if (size === 'fit') { const pg = out.addPage([img.width + m * 2, img.height + m * 2]); pg.drawImage(img, { x: m, y: m, width: img.width, height: img.height }) }
    else {
      let [W, H] = SIZES[size]; const land = landscape === 'auto' ? img.width > img.height : landscape === 'landscape'
      if (land) [W, H] = [H, W]
      const k = Math.min((W - m * 2) / img.width, (H - m * 2) / img.height), w = img.width * k, h = img.height * k
      const pg = out.addPage([W, H]); pg.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h })
    }
    onProgress?.(++n / items.length)
  }
  return out.save()
}

const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) }
const latin = (s) => /^[\x20-\x7E\xA0-\xFF]*$/.test(s)
async function textPng(text, { size, color, bold }) {
  const c = document.createElement('canvas'), ctx = c.getContext('2d'), px = size * 3
  ctx.font = `${bold ? '700 ' : ''}${px}px "Noto Nastaliq Urdu","Noto Naskh Arabic",Inter,Arial,sans-serif`
  const w = Math.ceil(ctx.measureText(text).width) + 20, h = Math.ceil(px * 1.7)
  c.width = w; c.height = h; ctx.font = `${bold ? '700 ' : ''}${px}px "Noto Nastaliq Urdu","Noto Naskh Arabic",Inter,Arial,sans-serif`; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.direction = 'auto'; ctx.fillText(text, 10, h / 2)
  const b = await new Promise((r) => c.toBlob(r, 'image/png')); return { bytes: new Uint8Array(await b.arrayBuffer()), w: w / 3, h: h / 3 }
}
/** Draw text on a page (vector when Latin; image when other scripts). anchor: x,y = baseline-left point in PDF coords */
async function drawText(out, page, fonts, text, { x, y, size, color, opacity, rotate = 0, bold, align = 'left' }) {
  if (latin(text)) {
    const f = bold ? fonts.bold : fonts.reg, w = f.widthOfTextAtSize(text, size), dx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0
    const rad = (rotate * Math.PI) / 180
    page.drawText(text, { x: x + dx * Math.cos(rad), y: y + dx * Math.sin(rad), size, font: f, color: hex(color), opacity, rotate: degrees(rotate) })
  } else {
    const t = await textPng(text, { size, color, bold }), img = await out.embedPng(t.bytes), dx = align === 'center' ? -t.w / 2 : align === 'right' ? -t.w : 0, rad = (rotate * Math.PI) / 180
    page.drawImage(img, { x: x + dx * Math.cos(rad), y: y + dx * Math.sin(rad) - t.h * 0.3, width: t.w, height: t.h, opacity, rotate: degrees(rotate) })
  }
}
const textW = (fonts, text, size, bold) => (latin(text) ? (bold ? fonts.bold : fonts.reg).widthOfTextAtSize(text, size) : text.length * size * 0.55)

/** Apply watermark / page numbers / header & footer. o = {wm:{on,text,size,opacity,angle,color,tile,image?}, num:{on,pos,fmt,start,size,color}, hf:{header,footer,size,color}, range} */
export async function applyMarks(bytes, o, { pageOnly, labelIndex, total } = {}) {
  const out = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const fonts = { reg: await out.embedFont(StandardFonts.Helvetica), bold: await out.embedFont(StandardFonts.HelveticaBold) }
  const pages = out.getPages(), N = total ?? pages.length
  let wmImg = null; if (o.wm.on && o.wm.image) { const b = new Uint8Array(await o.wm.image.arrayBuffer()); wmImg = o.wm.image.type === 'image/jpeg' ? await out.embedJpg(b) : await out.embedPng(b) }
  for (let k = 0; k < pages.length; k++) {
    if (pageOnly != null && k !== pageOnly) continue
    const i = labelIndex ?? k
    if (o.range && !o.range.has(i)) continue
    const pg = pages[k], { width: W, height: H } = pg.getSize()
    if (o.wm.on) {
      const pts = o.wm.tile ? [[.25, .25], [.75, .25], [.25, .5], [.75, .5], [.25, .75], [.75, .75]] : [[.5, .5]], rad = (o.wm.angle * Math.PI) / 180
      for (const [fx, fy] of pts) {
        const cx = W * fx, cy = H * fy
        if (wmImg) { const w = Math.min(W, H) * (o.wm.tile ? 0.22 : 0.5) * (o.wm.scale || 1), h = (w * wmImg.height) / wmImg.width; pg.drawImage(wmImg, { x: cx - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad), y: cy - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad), width: w, height: h, opacity: o.wm.opacity, rotate: degrees(o.wm.angle) }) }
        else if (o.wm.text) { const s = o.wm.size * (o.wm.tile ? 0.55 : 1), w = textW(fonts, o.wm.text, s, true); await drawText(out, pg, fonts, o.wm.text, { x: cx - (w / 2) * Math.cos(rad) + (s * 0.35) * Math.sin(rad), y: cy - (w / 2) * Math.sin(rad) - (s * 0.35) * Math.cos(rad), size: s, color: o.wm.color, opacity: o.wm.opacity, rotate: o.wm.angle, bold: true }) }
      }
    }
    if (o.hf.header) await drawText(out, pg, fonts, o.hf.header, { x: W / 2, y: H - 28, size: o.hf.size, color: o.hf.color, opacity: 1, align: 'center' })
    if (o.hf.footer) await drawText(out, pg, fonts, o.hf.footer, { x: W / 2, y: o.num.on && /bottom-center/.test(o.num.pos) ? 40 : 22, size: o.hf.size, color: o.hf.color, opacity: 1, align: 'center' })
    if (o.num.on) {
      const label = o.num.fmt.replace('{n}', i + o.num.start).replace('{N}', N + o.num.start - 1), s = o.num.size, mx = 36, my = o.num.pos.startsWith('top') ? H - 30 : 22
      const [v, h] = o.num.pos.split('-'); const x = h === 'left' ? mx : h === 'right' ? W - mx : W / 2
      await drawText(out, pg, fonts, label, { x, y: my, size: s, color: o.num.color, opacity: 1, align: h === 'left' ? 'left' : h === 'right' ? 'right' : 'center' })
    }
  }
  return out.save()
}

export async function stampImages(bytes, placements) { // [{page, png:Uint8Array|jpg, x,y,w,h (fractions of page, top-left origin)}]
  const out = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }), pages = out.getPages(), cache = new Map()
  for (const p of placements) {
    if (!cache.has(p.key)) cache.set(p.key, p.jpg ? await out.embedJpg(p.data) : await out.embedPng(p.data))
    const pg = pages[p.page], { width: W, height: H } = pg.getSize(), img = cache.get(p.key)
    pg.drawImage(img, { x: p.x * W, y: H - (p.y + p.h) * H, width: p.w * W, height: p.h * H })
  }
  return out.save()
}
/** rasterise listed pages with black boxes and replace them (true redaction) */
export async function redactPages(doc, boxesByPage, scale = 2.5, onProgress) {
  const out = await PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false }), pages = out.getPages(), list = Object.keys(boxesByPage).map(Number).filter((i) => boxesByPage[i]?.length)
  let n = 0
  for (const i of list) {
    const c = await renderCanvas(doc, i, { scale }), ctx = c.getContext('2d'); ctx.fillStyle = '#000'
    for (const b of boxesByPage[i]) ctx.fillRect(b.x * c.width, b.y * c.height, b.w * c.width, b.h * c.height)
    const png = await new Promise((r) => c.toBlob(r, 'image/png')), img = await out.embedPng(new Uint8Array(await png.arrayBuffer()))
    const old = pages[i], { width, height } = old.getSize(), idx = out.getPages().indexOf(old)
    out.removePage(idx); const np = out.insertPage(idx, [width, height]); np.drawImage(img, { x: 0, y: 0, width, height })
    onProgress?.(++n / list.length)
  }
  return out.save()
}
export async function pageSizes(doc) { const l = await libOf(doc); return l.getPages().map((p) => p.getSize()) }
export async function readInfo(doc) {
  const l = await libOf(doc)
  return { title: l.getTitle() || '', author: l.getAuthor() || '', subject: l.getSubject() || '', keywords: l.getKeywords() || '', creator: l.getCreator() || '', producer: l.getProducer() || '', created: l.getCreationDate(), modified: l.getModificationDate() }
}
export async function writeInfo(doc, info, strip) {
  const l = await PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false })
  l.setTitle(strip ? '' : info.title); l.setAuthor(strip ? '' : info.author); l.setSubject(strip ? '' : info.subject); l.setKeywords(strip ? [] : String(info.keywords).split(/[,;]\s*/).filter(Boolean)); l.setCreator(strip ? '' : info.creator); l.setProducer(strip ? '' : info.producer)
  if (strip) { l.setCreationDate(new Date(0)); l.setModificationDate(new Date(0)) }
  return l.save({ updateFieldAppearances: false })
}

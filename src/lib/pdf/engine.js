import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib'
import { zipSync } from 'fflate'

export const MAX_PDF_BYTES = 100 * 1024 * 1024
export const MAX_PDF_DOCS = 20
export const MAX_WORKSPACE_PDF_BYTES = 150 * 1024 * 1024
export const MAX_PDF_PAGES = 5_000
export const MAX_PDF_RENDER_SIDE = 8_192
export const MAX_PDF_RENDER_PIXELS = 24_000_000
export const MAX_PDF_BATCH_PIXELS = 150_000_000
export const MAX_ARCHIVE_ENTRIES = 1_000
export const MAX_ARCHIVE_BYTES = 120 * 1024 * 1024
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 32_000_000
export const MAX_IMAGE_TOTAL_PIXELS = 100_000_000
const MAX_THUMBNAILS = 240
const quarterRotation = (value) => { const n = Number(value); if (!Number.isFinite(n)) return 0; const q = Math.round(n / 90); return ((q % 4) + 4) % 4 * 90 }
const jsCache = new Map(), thumbCache = new Map()
let pdfjsP
export function pdfjsLib() {
  return (pdfjsP ||= (async () => { const m = await import('pdfjs-dist'); const w = await import('pdfjs-dist/build/pdf.worker.min.mjs?url'); m.GlobalWorkerOptions.workerSrc = w.default; return m })())
}
export async function openJs(doc) {
  if (!doc?.bytes || !(doc.bytes instanceof Uint8Array) || !doc.id) throw new TypeError('Choose a valid loaded PDF.')
  if (!jsCache.has(doc.id)) {
    const pending = (async () => {
      const m = await pdfjsLib()
      return m.getDocument({ data: doc.bytes.slice(), isEvalSupported: false, enableXfa: false }).promise
    })()
    const cached = pending.catch((error) => { if (jsCache.get(doc.id) === cached) jsCache.delete(doc.id); throw error })
    jsCache.set(doc.id, cached)
  }
  return jsCache.get(doc.id)
}

function renderScale(base, requested, width) {
  const s = width ? Number(width) / base.width : Number(requested)
  if (!Number.isFinite(s) || s <= 0) throw new RangeError('PDF render scale must be a positive number.')
  return Math.min(16, s)
}
function fitRenderViewport(viewport) {
  const w = Math.ceil(viewport.width), h = Math.ceil(viewport.height)
  const side = Math.min(1, MAX_PDF_RENDER_SIDE / w, MAX_PDF_RENDER_SIDE / h)
  const pixels = Math.min(1, Math.sqrt(MAX_PDF_RENDER_PIXELS / (w * h)))
  return Math.min(side, pixels)
}
export async function renderCanvas(doc, idx, { width, scale = 1, rotate = 0 } = {}) {
  if (!doc || !Number.isInteger(doc.pages) || doc.pages < 1 || doc.pages > MAX_PDF_PAGES) throw new TypeError('Choose a valid loaded PDF.')
  if (!Number.isInteger(idx) || idx < 0 || idx >= doc.pages) throw new RangeError('Choose a page that exists in this PDF.')
  const js = await openJs(doc), page = await js.getPage(idx + 1)
  let c
  try {
    const normalizedRotation = (quarterRotation(page.rotate) + quarterRotation(rotate)) % 360
    const base = page.getViewport({ scale: 1, rotation: normalizedRotation })
    if (!Number.isFinite(base.width) || !Number.isFinite(base.height) || base.width <= 0 || base.height <= 0 || base.width > 1_000_000 || base.height > 1_000_000) throw new RangeError('This PDF page has unsupported dimensions.')
    const requestedScale = renderScale(base, scale, width)
    const initial = page.getViewport({ scale: requestedScale, rotation: normalizedRotation })
    const factor = fitRenderViewport(initial), vp = factor < 1 ? page.getViewport({ scale: requestedScale * factor, rotation: normalizedRotation }) : initial
    c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(vp.width)); c.height = Math.max(1, Math.ceil(vp.height))
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('Could not create a canvas to render this PDF page.')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    const rendered = c
    c = null
    return rendered
  } finally { page.cleanup?.(); if (c) c.width = c.height = 0 }
}
export async function thumb(doc, idx, w = 220) {
  const width = Math.max(32, Math.min(800, Math.round(Number.isFinite(+w) ? +w : 220)))
  const k = `${doc.id}:${idx}:${width}`
  if (!thumbCache.has(k)) {
    const pending = renderCanvas(doc, idx, { width }).then((c) => { try { return c.toDataURL('image/jpeg', 0.82) } finally { c.width = c.height = 0 } })
      .catch((error) => { thumbCache.delete(k); throw error })
    thumbCache.set(k, pending)
    while (thumbCache.size > MAX_THUMBNAILS) thumbCache.delete(thumbCache.keys().next().value)
  }
  return thumbCache.get(k)
}
export function forget(id) {
  const pending = jsCache.get(id); jsCache.delete(id)
  pending?.then((js) => js.destroy?.()).catch(() => {})
  for (const k of [...thumbCache.keys()]) if (k.startsWith(id + ':')) thumbCache.delete(k)
}

let counter = 0
export async function loadDoc(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('Choose a valid PDF file.')
  const fileSize = Number(file.size)
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_PDF_BYTES) throw new RangeError(`PDF files must be smaller than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1_024)))
  if (!/%PDF-\d\.\d/.test(header)) throw new TypeError('This file does not contain a valid PDF header.')
  const lib = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const pages = lib.getPageCount()
  if (pages < 1 || pages > MAX_PDF_PAGES) throw new RangeError(`This PDF must contain between 1 and ${MAX_PDF_PAGES.toLocaleString()} pages.`)
  const doc = { id: 'd' + (++counter) + Math.random().toString(36).slice(2, 5), name: String(file.name || 'document.pdf').slice(0, 200), bytes, pages, size: bytes.length }
  try { await openJs(doc) } catch (e) { forget(doc.id); throw new Error(/password/i.test(e?.name + e?.message) ? 'This PDF is password-protected. Remove the password first.' : 'Could not read this PDF.') }
  return doc
}
export const fromBytes = async (bytes, name = 'document.pdf') => {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const f = typeof File === 'undefined' ? Object.assign(blob, { name }) : new File([blob], String(name).slice(0, 200), { type: 'application/pdf' })
  if (!f.name) Object.defineProperty(f, 'name', { value: String(name).slice(0, 200) })
  return loadDoc(f)
}

/** "1-3, 5, 8-" → [[0,2],[4,4],[7,n-1]] (0-based inclusive) */
export function parseRanges(str, n) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_PDF_PAGES) return { error: 'This PDF has an unsupported page count.' }
  const input = typeof str === 'string' ? str : String(str ?? '')
  if (input.length > 20_000) return { error: 'Page ranges are too long. Shorten the list and try again.' }
  const parts = input.split(/[,;\s]+/).filter(Boolean)
  if (parts.length > MAX_PDF_PAGES) return { error: `Enter no more than ${MAX_PDF_PAGES.toLocaleString()} page ranges.` }
  const out = []
  for (const part of parts) {
    if (/^all$/i.test(part)) { out.push([0, n - 1]); continue }
    const m = part.match(/^(\d*)-(\d*)$/) || part.match(/^(\d+)()$/)
    if (!m) return { error: `“${part.slice(0, 80)}” isn't a page or range` }
    let a = m[1] === '' ? 1 : +m[1], b = m[2] === '' ? (part.includes('-') ? n : a) : +m[2]
    if (!part.includes('-')) b = a
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 1 || b < 1 || a > n || b > n) return { error: `Page ${a > n || a < 1 ? a : b} is outside 1–${n}` }
    if (a > b) [a, b] = [b, a]
    out.push([a - 1, b - 1])
  }
  if (!out.length) return { error: 'Enter at least one page or range' }
  try { rangeToIdx(out) } catch (error) { return { error: error.message } }
  return { ranges: out }
}
export function rangeToIdx(ranges) {
  if (!Array.isArray(ranges) || !ranges.length) throw new RangeError('Select at least one PDF page.')
  let count = 0
  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger) || range[0] < 0 || range[1] < range[0] || range[1] >= MAX_PDF_PAGES) throw new RangeError('One of the selected page ranges is invalid.')
    count += range[1] - range[0] + 1
    if (count > MAX_PDF_PAGES) throw new RangeError(`Select no more than ${MAX_PDF_PAGES.toLocaleString()} pages at a time.`)
  }
  const out = []
  for (const [a, b] of ranges) for (let i = a; i <= b; i++) out.push(i)
  return out
}

const libOf = (doc) => (doc._lib ||= PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false }))
export const clearLib = (doc) => { delete doc._lib }

/** pages: [{docId|blank, src, rot, w,h}] → bytes. Copies pages untouched (no recompression). */
export async function buildOrganized(docs, pages, onProgress) {
  if (!Array.isArray(docs) || docs.length > 20 || !Array.isArray(pages) || !pages.length || pages.length > MAX_PDF_PAGES) throw new RangeError(`A PDF can contain between 1 and ${MAX_PDF_PAGES.toLocaleString()} output pages.`)
  const out = await PDFDocument.create(), byId = new Map(docs.map((d) => [d.id, d]))
  const sources = new Map()
  for (const p of pages) {
    if (!p || typeof p !== 'object') throw new TypeError('A selected page is invalid.')
    if (p.blank === true) {
      const w = Number(p.w), h = Number(p.h)
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 72 || h < 72 || w > 14_400 || h > 14_400) throw new RangeError('Blank page dimensions must be between 72 and 14,400 points.')
      continue
    }
    const doc = byId.get(p.docId)
    if (!doc || !Number.isInteger(p.src) || p.src < 0 || p.src >= doc.pages) throw new RangeError('A selected page no longer exists in its source PDF.')
    if (!sources.has(p.docId)) sources.set(p.docId, new Set())
    sources.get(p.docId).add(p.src)
  }
  const copied = new Map()
  for (const [id, set] of sources) {
    const src = await libOf(byId.get(id)), idx = [...set].sort((a, b) => a - b)
    const cp = await out.copyPages(src, idx)
    idx.forEach((i, k) => copied.set(id + ':' + i, [cp[k]]))
  }
  let n = 0
  for (const p of pages) {
    let pg
    if (p.blank === true) pg = out.addPage([Number(p.w), Number(p.h)])
    else {
      const key = p.docId + ':' + p.src, bucket = copied.get(key)
      let page = bucket?.shift()
      if (!page) { const src = await libOf(byId.get(p.docId)); [page] = await out.copyPages(src, [p.src]) }
      pg = out.addPage(page)
      const requestedRotation = quarterRotation(p.rot), r = (quarterRotation(pg.getRotation().angle) + requestedRotation) % 360
      pg.setRotation(degrees(r))
    }
    onProgress?.(++n / pages.length)
  }
  return out.save({ useObjectStreams: true })
}
export async function extractPages(doc, idx) {
  if (!Array.isArray(idx) || !idx.length || idx.length > MAX_PDF_PAGES || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= doc.pages)) throw new RangeError('Choose one or more pages that exist in this PDF.')
  const src = await libOf(doc), out = await PDFDocument.create()
  const cp = await out.copyPages(src, idx); cp.forEach((p) => out.addPage(p))
  return out.save()
}
function safeArchiveName(input) {
  const leaf = String(input ?? '').replace(/\\/g, '/').split('/').pop() || 'file'
  const safe = leaf.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 180)
  return safe || 'file'
}
export function zipFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_ARCHIVE_ENTRIES) throw new RangeError(`A ZIP must contain between 1 and ${MAX_ARCHIVE_ENTRIES.toLocaleString()} files.`)
  const o = Object.create(null), used = new Set(); let total = 0
  for (const entry of files) {
    if (!Array.isArray(entry) || entry.length < 2) throw new TypeError('A ZIP file entry is invalid.')
    const [rawName, rawBytes] = entry
    let name = safeArchiveName(rawName)
    const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : ''
    let candidate = name, i = 2
    while (used.has(candidate.toLowerCase())) candidate = `${stem} (${i++})${ext}`
    name = candidate; used.add(name.toLowerCase())
    const bytes = rawBytes instanceof Uint8Array ? rawBytes : rawBytes instanceof ArrayBuffer ? new Uint8Array(rawBytes) : null
    if (!bytes) throw new TypeError('ZIP contents must be byte arrays.')
    total += bytes.byteLength
    if (total > MAX_ARCHIVE_BYTES) throw new RangeError(`The ZIP contents exceed ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)} MB. Select fewer pages or files.`)
    o[name] = bytes
  }
  const zipped = zipSync(o, { level: 0 })
  if (zipped.byteLength > MAX_ARCHIVE_BYTES) throw new RangeError(`The ZIP exceeds ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)} MB.`)
  return new Blob([zipped], { type: 'application/zip' })
}

export async function imagesToPdf(items, { size = 'fit', margin = 0, landscape = 'auto', onProgress } = {}) {
  const SIZES = { a4: [595.28, 841.89], letter: [612, 792], a5: [419.53, 595.28] }
  if (!Array.isArray(items) || !items.length || items.length > 500) throw new RangeError('Choose between 1 and 500 images for a PDF.')
  if (size !== 'fit' && !Object.hasOwn(SIZES, size)) throw new RangeError('Choose Fit, A4, Letter or A5 page size.')
  if (!['auto', 'portrait', 'landscape'].includes(landscape)) throw new RangeError('Choose Auto, Portrait or Landscape orientation.')
  margin = Number(margin)
  if (!Number.isFinite(margin) || margin < 0 || margin > 30) throw new RangeError('Image-to-PDF margins must be between 0 and 30 mm.')
  const totalBytes = items.reduce((sum, it) => sum + Number(it?.file?.size || 0), 0)
  if (items.some((it) => !it?.file || typeof it.file.arrayBuffer !== 'function' || !Number.isFinite(Number(it.file.size)) || it.file.size <= 0 || it.file.size > MAX_IMAGE_BYTES) || totalBytes > MAX_PDF_BYTES) throw new RangeError('Images must be valid files under 25 MB each and 100 MB combined.')
  const out = await PDFDocument.create(), m = margin * 2.8346
  let n = 0, totalPixels = 0
  for (const it of items) {
    const bytes = new Uint8Array(await it.file.arrayBuffer()); let img
    if (bytes.length > MAX_IMAGE_BYTES) throw new RangeError('An image exceeds the 25 MB limit.')
    const jpeg = it.file.type === 'image/jpeg' || (bytes[0] === 0xff && bytes[1] === 0xd8)
    const png = it.file.type === 'image/png' || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    try { img = jpeg ? await out.embedJpg(bytes) : png ? await out.embedPng(bytes) : null } catch { img = null }
    if (!img) {
      if (typeof createImageBitmap !== 'function') throw new Error(`The browser cannot decode “${it.file.name || 'this image'}”.`)
      const bm = await createImageBitmap(it.file)
      let c
      try {
        if (!bm.width || !bm.height || bm.width * bm.height > MAX_IMAGE_PIXELS) throw new RangeError('Each image must be 32 megapixels or smaller.')
        const ctx = (c = document.createElement('canvas')).getContext('2d')
        c.width = bm.width; c.height = bm.height
        if (!ctx) throw new Error('Could not create a canvas to convert this image.')
        ctx.drawImage(bm, 0, 0)
        const encoded = await new Promise((resolve, reject) => c.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not convert an image to PDF format.')), 'image/png'))
        img = await out.embedPng(new Uint8Array(await encoded.arrayBuffer()))
      } finally { bm.close?.(); if (c) c.width = c.height = 0 }
    }
    if (!Number.isFinite(img.width) || !Number.isFinite(img.height) || img.width <= 0 || img.height <= 0 || img.width * img.height > MAX_IMAGE_PIXELS) throw new RangeError('Each image must be 32 megapixels or smaller.')
    totalPixels += img.width * img.height
    if (totalPixels > MAX_IMAGE_TOTAL_PIXELS) throw new RangeError('The selected images exceed 100 megapixels in total. Remove some images and try again.')
    if (size === 'fit') {
      const k = Math.min(1, (14_400 - 2 * m) / Math.max(img.width, img.height)), w = img.width * k, h = img.height * k
      const pg = out.addPage([w + m * 2, h + m * 2]); pg.drawImage(img, { x: m, y: m, width: w, height: h })
    } else {
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
const MARK_POSITIONS = new Set(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'])
const clampNum = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback
const cleanText = (value, max = 128) => typeof value === 'string' ? value.slice(0, max) : ''
const cleanColor = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
export function normalizeMarkOptions(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const wm = raw.wm && typeof raw.wm === 'object' ? raw.wm : {}, num = raw.num && typeof raw.num === 'object' ? raw.num : {}, hf = raw.hf && typeof raw.hf === 'object' ? raw.hf : {}
  return {
    wm: { on: wm.on !== false, kind: wm.kind === 'image' ? 'image' : 'text', text: cleanText(wm.text), size: clampNum(wm.size, 64, 16, 180), opacity: clampNum(wm.opacity, 0.22, 0.05, 1), angle: clampNum(wm.angle, 35, -90, 90), color: cleanColor(wm.color, '#B4715A'), tile: wm.tile === true, scale: clampNum(wm.scale, 1, 0.3, 1.6) },
    num: { on: num.on === true, pos: MARK_POSITIONS.has(num.pos) ? num.pos : 'bottom-center', fmt: cleanText(num.fmt || 'Page {n} of {N}', 128), start: clampNum(num.start, 1, 0, 50), size: clampNum(num.size, 10, 7, 24), color: cleanColor(num.color, '#444444') },
    hf: { header: cleanText(hf.header), footer: cleanText(hf.footer), size: clampNum(hf.size, 10, 7, 24), color: cleanColor(hf.color, '#444444') },
    rangeTxt: cleanText(raw.rangeTxt, 20_000),
  }
}
async function textPng(text, { size, color, bold }) {
  const px = size * 3, c = document.createElement('canvas')
  c.width = Math.max(20, Math.min(8_192, Math.ceil(px * text.length * 0.8) + 20)); c.height = Math.max(16, Math.min(1_024, Math.ceil(px * 1.7)))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Could not create a canvas for non-Latin PDF text.')
  ctx.font = `${bold ? '700 ' : ''}${px}px "Noto Nastaliq Urdu","Noto Naskh Arabic",Inter,Arial,sans-serif`
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.direction = 'auto'; ctx.fillText(text, 10, c.height / 2)
  try {
    const b = await new Promise((resolve, reject) => c.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode non-Latin PDF text.')), 'image/png'))
    return { bytes: new Uint8Array(await b.arrayBuffer()), w: c.width / 3, h: c.height / 3 }
  } finally { c.width = c.height = 0 }
}
/** Draw text on a page (vector when Latin; image when other scripts). anchor: x,y = baseline-left point in PDF coords */
async function drawText(out, page, fonts, text, { x, y, size, color, opacity, rotate = 0, bold, align = 'left', cache }) {
  if (latin(text)) {
    const f = bold ? fonts.bold : fonts.reg, w = f.widthOfTextAtSize(text, size), dx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0
    const rad = (rotate * Math.PI) / 180
    page.drawText(text, { x: x + dx * Math.cos(rad), y: y + dx * Math.sin(rad), size, font: f, color: hex(color), opacity, rotate: degrees(rotate) })
  } else {
    const key = `${text}|${size}|${color}|${bold ? 1 : 0}`
    let entry = cache?.get(key)
    if (!entry) {
      const t = await textPng(text, { size, color, bold }), img = await out.embedPng(t.bytes)
      entry = { img, w: t.w, h: t.h }; cache?.set(key, entry)
    }
    const dx = align === 'center' ? -entry.w / 2 : align === 'right' ? -entry.w : 0, rad = (rotate * Math.PI) / 180
    page.drawImage(entry.img, { x: x + dx * Math.cos(rad), y: y + dx * Math.sin(rad) - entry.h * 0.3, width: entry.w, height: entry.h, opacity, rotate: degrees(rotate) })
  }
}
const textW = (fonts, text, size, bold) => (latin(text) ? (bold ? fonts.bold : fonts.reg).widthOfTextAtSize(text, size) : text.length * size * 0.55)

/** Apply watermark / page numbers / header & footer. o = {wm:{on,text,size,opacity,angle,color,tile,image?}, num:{on,pos,fmt,start,size,color}, hf:{header,footer,size,color}, range} */
export async function applyMarks(bytes, options = {}, { pageOnly, labelIndex, total } = {}) {
  const source = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null
  if (!source?.length || source.length > MAX_PDF_BYTES) throw new RangeError(`PDFs must be smaller than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`)
  const raw = options && typeof options === 'object' ? options : {}, o = normalizeMarkOptions(raw)
  o.range = raw.range instanceof Set ? raw.range : null
  const out = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false })
  const fonts = { reg: await out.embedFont(StandardFonts.Helvetica), bold: await out.embedFont(StandardFonts.HelveticaBold) }
  const pages = out.getPages()
  if (!pages.length || pages.length > MAX_PDF_PAGES) throw new RangeError('This PDF has an unsupported page count.')
  if (pageOnly != null && (!Number.isInteger(pageOnly) || pageOnly < 0 || pageOnly >= pages.length)) throw new RangeError('The requested preview page does not exist.')
  const N = Number.isInteger(total) && total > 0 && total <= MAX_PDF_PAGES ? total : pages.length
  const startLabel = Number.isInteger(labelIndex) && labelIndex >= 0 && labelIndex < MAX_PDF_PAGES ? labelIndex : 0
  const imageFile = raw.wm?.image
  let wmImg = null
  if (o.wm.on && o.wm.kind === 'image' && imageFile && typeof imageFile.arrayBuffer === 'function') {
    if (Number(imageFile.size) > MAX_IMAGE_BYTES) throw new RangeError('Watermark images must be 25 MB or smaller.')
    const b = new Uint8Array(await imageFile.arrayBuffer())
    const jpeg = b[0] === 0xff && b[1] === 0xd8, png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    if (!jpeg && !png) throw new TypeError('Watermark must be a valid PNG or JPG image.')
    wmImg = jpeg ? await out.embedJpg(b) : await out.embedPng(b)
    if (wmImg.width * wmImg.height > MAX_IMAGE_PIXELS) throw new RangeError('Watermark images must be 32 megapixels or smaller.')
  }
  const textCache = new Map()
  for (let k = 0; k < pages.length; k++) {
    if (pageOnly != null && k !== pageOnly) continue
    const i = startLabel + (labelIndex == null ? k : 0)
    if (o.range && !o.range.has(i)) continue
    const pg = pages[k], { width: W, height: H } = pg.getSize()
    if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0 || W > 1_000_000 || H > 1_000_000) throw new RangeError('This PDF contains a page with invalid dimensions.')
    if (o.wm.on) {
      const pts = o.wm.tile ? [[.25, .25], [.75, .25], [.25, .5], [.75, .5], [.25, .75], [.75, .75]] : [[.5, .5]], rad = (o.wm.angle * Math.PI) / 180
      for (const [fx, fy] of pts) {
        const cx = W * fx, cy = H * fy
        if (wmImg) { const w = Math.min(W, H) * (o.wm.tile ? 0.22 : 0.5) * o.wm.scale, h = (w * wmImg.height) / wmImg.width; pg.drawImage(wmImg, { x: cx - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad), y: cy - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad), width: w, height: h, opacity: o.wm.opacity, rotate: degrees(o.wm.angle) }) }
        else if (o.wm.text) { const s = o.wm.size * (o.wm.tile ? 0.55 : 1), w = textW(fonts, o.wm.text, s, true); await drawText(out, pg, fonts, o.wm.text, { x: cx - (w / 2) * Math.cos(rad) + (s * 0.35) * Math.sin(rad), y: cy - (w / 2) * Math.sin(rad) - (s * 0.35) * Math.cos(rad), size: s, color: o.wm.color, opacity: o.wm.opacity, rotate: o.wm.angle, bold: true, cache: textCache }) }
      }
    }
    if (o.hf.header) await drawText(out, pg, fonts, o.hf.header, { x: W / 2, y: H - 28, size: o.hf.size, color: o.hf.color, opacity: 1, align: 'center', cache: textCache })
    if (o.hf.footer) await drawText(out, pg, fonts, o.hf.footer, { x: W / 2, y: o.num.on && /bottom-center/.test(o.num.pos) ? 40 : 22, size: o.hf.size, color: o.hf.color, opacity: 1, align: 'center', cache: textCache })
    if (o.num.on) {
      const label = o.num.fmt.replace('{n}', i + o.num.start).replace('{N}', N + o.num.start - 1), s = o.num.size, mx = 36, my = o.num.pos.startsWith('top') ? H - 30 : 22
      const [, h] = o.num.pos.split('-'), x = h === 'left' ? mx : h === 'right' ? W - mx : W / 2
      await drawText(out, pg, fonts, label, { x, y: my, size: s, color: o.num.color, opacity: 1, align: h === 'left' ? 'left' : h === 'right' ? 'right' : 'center', cache: textCache })
    }
  }
  return out.save()
}

export async function stampImages(bytes, placements) { // [{page, data:Uint8Array, jpg?, x,y,w,h (fractions of page, top-left origin)}]
  const source = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null
  if (!source?.length || source.length > MAX_PDF_BYTES) throw new RangeError(`PDFs must be smaller than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`)
  if (!Array.isArray(placements) || !placements.length || placements.length > 500) throw new RangeError('Place between 1 and 500 signatures or images.')
  const out = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false }), pages = out.getPages(), cache = new Map()
  if (!pages.length || pages.length > MAX_PDF_PAGES) throw new RangeError('This PDF has an unsupported page count.')
  let totalBytes = 0
  for (const p of placements) {
    if (!p || !Number.isInteger(p.page) || p.page < 0 || p.page >= pages.length) throw new RangeError('A signature placement refers to a page that does not exist.')
    const x = Number(p.x), y = Number(p.y), w = Number(p.w), h = Number(p.h)
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) throw new RangeError('Signature placement must fit inside its page.')
    const data = p.data instanceof Uint8Array ? p.data : p.data instanceof ArrayBuffer ? new Uint8Array(p.data) : null
    if (!data?.length || data.byteLength > MAX_IMAGE_BYTES) throw new RangeError('Each signature image must be a PNG or JPG smaller than 25 MB.')
    totalBytes += data.byteLength
    if (totalBytes > MAX_PDF_BYTES) throw new RangeError('Combined signature images exceed 100 MB.')
    const jpg = data[0] === 0xff && data[1] === 0xd8, png = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    if (!jpg && !png) throw new TypeError('Signatures must be valid PNG or JPG images.')
    const key = cleanText(p.key, 200) || `${jpg ? 'jpg' : 'png'}:${data.byteLength}:${data[0]}:${data[1]}`
    if (!cache.has(key)) {
      const img = jpg ? await out.embedJpg(data) : await out.embedPng(data)
      if (img.width * img.height > MAX_IMAGE_PIXELS) throw new RangeError('Signature images must be 32 megapixels or smaller.')
      cache.set(key, img)
    }
    const pg = pages[p.page], { width: W, height: H } = pg.getSize(), img = cache.get(key)
    const angle = quarterRotation(pg.getRotation().angle)
    let left = x, top = y, drawW = w, drawH = h, rotate = 0
    if (angle === 90) { left = y; top = 1 - x - w; drawW = h; drawH = w; rotate = 90 }
    else if (angle === 180) { left = 1 - x - w; top = 1 - y - h; rotate = 180 }
    else if (angle === 270) { left = 1 - y - h; top = x; drawW = h; drawH = w; rotate = -90 }
    pg.drawImage(img, { x: left * W, y: H - (top + drawH) * H, width: drawW * W, height: drawH * H, rotate: degrees(rotate) })
  }
  return out.save()
}
/** Rasterize selected pages with black boxes and replace their original content (true redaction). */
export async function redactPages(doc, boxesByPage, scale = 2.5, onProgress) {
  if (!doc?.bytes || doc.bytes.length > MAX_PDF_BYTES || !boxesByPage || typeof boxesByPage !== 'object') throw new TypeError('Choose a valid PDF and redaction areas.')
  const inputPages = Number(doc.pages)
  if (!Number.isInteger(inputPages) || inputPages < 1 || inputPages > MAX_PDF_PAGES) throw new RangeError('This PDF has an unsupported page count.')
  scale = clampNum(scale, 2.5, 1, 4)
  const list = Object.keys(boxesByPage).map(Number).filter((i) => Array.isArray(boxesByPage[i]) && boxesByPage[i].length)
  const count = list.reduce((sum, i) => sum + boxesByPage[i].length, 0)
  if (count > 5_000) throw new RangeError('Redact no more than 5,000 areas at once.')
  if (list.some((i) => !Number.isInteger(i) || i < 0 || i >= inputPages)) throw new RangeError('A redaction refers to a page that does not exist.')
  const out = await PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false }), pages = out.getPages()
  let n = 0, totalPixels = 0
  for (const i of list) {
    const c = await renderCanvas(doc, i, { scale })
    try {
      totalPixels += c.width * c.height
      if (totalPixels > MAX_PDF_BATCH_PIXELS) throw new RangeError(`Redactions are limited to ${MAX_PDF_BATCH_PIXELS / 1_000_000} megapixels of rendered pages at once.`)
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('Could not create a canvas to redact this PDF page.')
      ctx.fillStyle = '#000'
      for (const box of boxesByPage[i]) {
        const x = Number(box?.x), y = Number(box?.y), w = Number(box?.w), h = Number(box?.h)
        if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) throw new RangeError('A redaction area is outside the page.')
        ctx.fillRect(x * c.width, y * c.height, w * c.width, h * c.height)
      }
      const png = await new Promise((resolve, reject) => c.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode a redacted page.')), 'image/png'))
      const img = await out.embedPng(new Uint8Array(await png.arrayBuffer()))
      const old = pages[i], { width, height } = old.getSize(), angle = quarterRotation(old.getRotation().angle), idx = out.getPages().indexOf(old)
      const pageWidth = angle === 90 || angle === 270 ? height : width, pageHeight = angle === 90 || angle === 270 ? width : height
      out.removePage(idx); const np = out.insertPage(idx, [pageWidth, pageHeight]); np.drawImage(img, { x: 0, y: 0, width: pageWidth, height: pageHeight })
    } finally { c.width = c.height = 0 }
    onProgress?.(++n / list.length)
  }
  return out.save()
}
export async function pageSizes(doc) { const l = await libOf(doc); return l.getPages().slice(0, MAX_PDF_PAGES).map((p) => p.getSize()) }
export async function readInfo(doc) {
  const l = await libOf(doc)
  const date = (value) => value instanceof Date && Number.isFinite(value.getTime()) ? value : null
  return { title: l.getTitle() || '', author: l.getAuthor() || '', subject: l.getSubject() || '', keywords: l.getKeywords() || '', creator: l.getCreator() || '', producer: l.getProducer() || '', created: date(l.getCreationDate()), modified: date(l.getModificationDate()) }
}
export async function writeInfo(doc, info, strip) {
  if (!doc?.bytes || doc.bytes.length > MAX_PDF_BYTES) throw new RangeError(`PDFs must be smaller than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`)
  const value = info && typeof info === 'object' ? info : {}
  const l = await PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false })
  const keywords = strip ? [] : cleanText(value.keywords, 2_000).split(/[,;]\s*/).map((s) => s.trim().slice(0, 100)).filter(Boolean).slice(0, 50)
  l.setTitle(strip ? '' : cleanText(value.title, 500)); l.setAuthor(strip ? '' : cleanText(value.author, 500)); l.setSubject(strip ? '' : cleanText(value.subject, 500)); l.setKeywords(keywords); l.setCreator(strip ? '' : cleanText(value.creator, 500)); l.setProducer(strip ? '' : cleanText(value.producer, 500))
  if (strip) { l.setCreationDate(new Date(0)); l.setModificationDate(new Date(0)) }
  return l.save({ updateFieldAppearances: false })
}

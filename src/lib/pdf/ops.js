/* PDF surgery: load, inspect, reorder, rotate, merge, split — with pdf-lib — and rasterise pages
   with pdf.js when the UI needs to show a page (thumbnails, OCR, page pickers). */

import { PDFDocument, degrees } from 'pdf-lib'

let pdfjsReady = null
/** pdf.js needs its worker configured once per session. */
export async function pdfjs() {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsReady ??= (async () => {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  })()
  await pdfjsReady
  return pdfjsLib
}

const toU8 = async (file) => (file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer()))

/** Load a PDF file → a document we can query and copy pages out of. */
export async function loadPdf(file) {
  const bytes = await toU8(file)
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const sizes = doc.getPages().map((p, i) => {
    const { width, height } = p.getSize()
    return { i, width: +width.toFixed(1), height: +height.toFixed(1), rotate: ((p.getRotation().angle % 360) + 360) % 360 }
  })
  return { bytes, doc, name: file?.name || 'document.pdf', sizes, pages: doc.getPageCount() }
}

export async function pdfInfo(file) {
  const { doc, bytes, pages } = await loadPdf(file)
  const first = doc.getPages()[0]
  const size = first?.getSize() || { width: 0, height: 0 }
  return {
    pages, bytes: bytes.length,
    title: doc.getTitle() || '', author: doc.getAuthor() || '', subject: doc.getSubject() || '',
    creator: doc.getCreator() || '', producer: doc.getProducer() || '',
    created: doc.getCreationDate()?.toISOString() || '', modified: doc.getModificationDate()?.toISOString() || '',
    pageWidth: Math.round(size.width), pageHeight: Math.round(size.height),
    a4: Math.abs(size.width - 595.28) < 3 && Math.abs(size.height - 841.89) < 3,
  }
}

/** Point size → friendly name, used by the page chips. */
export function paperName(w, h) {
  const known = [['A4', 595, 842], ['A5', 420, 595], ['A3', 842, 1191], ['Letter', 612, 792], ['Legal', 612, 1008], ['Tabloid', 792, 1224]]
  for (const [n, pw, ph] of known) {
    if ((Math.abs(w - pw) < 6 && Math.abs(h - ph) < 6) || (Math.abs(w - ph) < 6 && Math.abs(h - pw) < 6)) return n
  }
  return `${Math.round(w / 2.8346)}×${Math.round(h / 2.8346)} mm`
}

/** Flatten sources into one list of page references the editor can shuffle around. */
export function pageRefs(docs) {
  const out = []
  for (const d of docs) for (let i = 0; i < d.sizes.length; i++) out.push({ key: `${d.id}:${i}`, docId: d.id, index: i, rotate: d.sizes[i].rotate, width: d.sizes[i].width, height: d.sizes[i].height, name: d.name })
  return out
}

/**
 * Write a new PDF out of a page list: `[{ docId, index, rotate }]`, in the order given.
 * `strip` clears the metadata pdf-lib would otherwise copy from the first source.
 */
export async function buildPdf(docs, refs, { strip = true, title = '', author = '' } = {}) {
  const out = await PDFDocument.create()
  const byId = new Map(docs.map((d) => [d.id, d.doc]))
  let copiedCount = 0
  for (const r of refs) {
    const src = byId.get(r.docId)
    if (!src) continue
    const copied = await out.copyPages(src, [r.index])
    const page = copied[0]
    if (r.rotate) page.setRotation(degrees(((r.rotate % 360) + 360) % 360))
    out.addPage(page)
    copiedCount++
  }
  // A page list that produced nothing must fail loudly — saving a silently empty PDF is worse.
  if (!copiedCount) throw new Error('No pages to write — load a document first')
  if (strip) {
    out.setTitle(title); out.setAuthor(author); out.setSubject(''); out.setKeywords([])
    out.setProducer(''); out.setCreator('')
    const d = new Date(); out.setCreationDate(d); out.setModificationDate(d)
  } else if (title || author) {
    out.setTitle(title); out.setAuthor(author)
  }
  return out.save({ useObjectStreams: false })
}

/** "Split every N pages" → page-range groups (1-based, inclusive). */
export function splitGroups(total, mode, size = 1) {
  const groups = []
  if (!total) return groups
  if (mode === 'each') { for (let i = 1; i <= total; i++) groups.push([i, i]); return groups }
  const n = Math.max(1, Math.round(size) || 1)
  if (mode === 'chunks') { for (let i = 1; i <= total; i += n) groups.push([i, Math.min(total, i + n - 1)]); return groups }
  if (mode === 'halves') { const half = Math.ceil(total / 2); groups.push([1, half]); if (half < total) groups.push([half + 1, total]); return groups }
  return groups
}

/** "1-3, 5, 8-10" → [1,2,3,5,8,9,10] (validated against the page count). */
export function parseRanges(text, total) {
  const out = []
  for (const part of String(text).split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) continue
    const cap = total || 1e9
    const a = Math.max(1, Math.min(cap, +m[1]))
    const b = m[2] ? Math.max(1, Math.min(cap, +m[2])) : a
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i)
  }
  return [...new Set(out)]
}

/** Render one page to a canvas — used for thumbnails and as the OCR input for scanned PDFs. */
export async function renderPage(bytes, index, { scale = 0.32, max = 2000 } = {}) {
  const pdfjsLib = await pdfjs()
  const task = pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false })
  const doc = await task.promise
  const page = await doc.getPage(index + 1)
  const vp0 = page.getViewport({ scale: 1 })
  const s = Math.min(scale, max / Math.max(vp0.width, vp0.height))
  const vp = page.getViewport({ scale: s })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(vp.width)); canvas.height = Math.max(1, Math.round(vp.height))
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
  page.cleanup?.()
  await task.destroy?.().catch(() => {})   // pdf.js 6 keeps destroy() on the loading task, not the document
  return canvas
}

/** Every page of a PDF as canvases (OCR of a scanned document). */
export async function pdfPageCanvases(bytes, { scale = 2, max = 2600, onProgress } = {}) {
  const pdfjsLib = await pdfjs()
  const task = pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false })
  const doc = await task.promise
  const out = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp0 = page.getViewport({ scale: 1 })
    const s = Math.min(scale, max / Math.max(vp0.width, vp0.height))
    const vp = page.getViewport({ scale: s })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
    out.push(canvas)
    onProgress?.(i / doc.numPages)
  }
  await task.destroy?.().catch(() => {})
  return out
}

/** Photos → one PDF (each image its own page, scaled to fit A4). */
export async function imagesToPdf(files, { margin = 24 } = {}) {
  const out = await PDFDocument.create()
  const A4 = [595.28, 841.89]
  for (const f of files) {
    const bytes = await toU8(f)
    const isPng = /png$/i.test(f.name || '') || (bytes[0] === 0x89 && bytes[1] === 0x50)
    const img = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes)
    const scale = Math.min((A4[0] - margin * 2) / img.width, (A4[1] - margin * 2) / img.height)
    const w = img.width * scale, h = img.height * scale
    const page = out.addPage([A4[0], A4[1]])
    page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h })
  }
  out.setProducer(''); out.setCreator('')
  return out.save()
}

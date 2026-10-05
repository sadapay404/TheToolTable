import { zipSync, strToU8 } from 'fflate'
import { buildQR, toCanvas, canvasBlob, svgFile } from './render.js'
import { download } from '../utils.js'

export const PRINT_PRESETS = [
  ['card', 'Business card', 22, '22 mm'], ['sticker', 'Sticker', 40, '40 mm'], ['flyer', 'Flyer', 80, '80 mm'], ['a5', 'A5 flyer', 110, '110 mm'], ['poster', 'A4 poster', 170, '170 mm'], ['a2', 'Large poster', 380, '380 mm'],
]
export const SIZE_PRESETS = [[512, '512'], [1024, '1K'], [2048, '2K'], [4096, '4K'], [8192, '8K']]
export const mmToPx = (mm, dpi) => Math.min(8192, Math.round((mm / 25.4) * dpi))

export const slug = (s) => String(s || 'qr').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'qr'

const forTransparentExport = (r) => r.style?.bg?.type === 'none' ? r : buildQR(r.text, { ...r.style, bg: { ...r.style.bg, type: 'none', image: null } }, 'transparent')
const abortError = () => { const e = new Error('Export cancelled.'); e.name = 'AbortError'; return e }
const checkAbort = (signal) => { if (signal?.aborted) throw abortError() }
const yieldTask = async (signal) => { await new Promise((resolve) => setTimeout(resolve, 0)); checkAbort(signal) }
const safeList = (items) => {
  if (!Array.isArray(items) || items.length < 1 || items.length > 1000) throw new Error('Choose between 1 and 1,000 codes to export.')
  return items.map((item) => {
    if (!item || typeof item.text !== 'string' || !item.text.trim()) throw new Error('Every code needs non-empty text.')
    if (item.text.length > 10_000) throw new Error('Each QR payload must be 10,000 characters or less.')
    return { ...item, label: typeof item.label === 'string' ? item.label.slice(0, 300) : '', name: typeof item.name === 'string' ? item.name.slice(0, 300) : '' }
  })
}

export async function pngBlob(r, px, { transparent = false, bg = '#FFFFFF' } = {}) {
  const render = transparent ? forTransparentExport(r) : r
  const c = await toCanvas(render, px, { bg: transparent ? null : bg })
  return canvasBlob(c)
}

export async function pdfBlob(r, { mm = 80, margin = 10, title = '', dpi = 300, transparent = false } = {}) {
  const { jsPDF } = await import('jspdf')
  const px = Math.min(8192, Math.max(600, mmToPx(mm, dpi)))
  const render = transparent ? forTransparentExport(r) : r
  const c = await toCanvas(render, px, { bg: transparent ? null : '#FFFFFF' })
  const h = (mm * r.H) / r.W, W = mm + margin * 2, H = h + margin * 2 + (title ? 8 : 0)
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: W > H ? 'l' : 'p', compress: true })
  doc.setProperties({ title: title || 'QR code', creator: 'TheToolTable QR Studio' })
  doc.addImage(c.toDataURL('image/png'), 'PNG', margin, margin, mm, h, undefined, 'FAST')
  if (title) { doc.setFontSize(9); doc.setTextColor(90); doc.text(title.slice(0, 80), W / 2, H - 5, { align: 'center' }) }
  return doc.output('blob')
}

export async function copyPng(blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/** items: [{text,label,name}] — builds PNG or SVG files and downloads a ZIP (stored, level 0) */
export async function bulkZip(itemsIn, style, { format = 'png', px = 1024, labels = false, transparent = false } = {}, onProgress, signal) {
  const items = safeList(itemsIn)
  if (!['png', 'svg'].includes(format)) throw new Error('Choose PNG or SVG for the ZIP export.')
  const width = Math.max(256, Math.min(4096, Math.round(Number(px) || 1024)))
  const files = Object.create(null), used = new Set()
  let byteCount = 0
  const addFile = (name, content) => {
    byteCount += content.byteLength
    if (byteCount > 64 * 1024 * 1024) throw new Error('The ZIP would be larger than 64 MB. Export fewer codes or use a smaller image size.')
    files[name] = content
  }
  for (let i = 0; i < items.length; i++) {
    checkAbort(signal)
    const it = items[i]
    const r = buildQR(it.text, style, 'b' + i)
    let name = slug(it.name || it.label || it.text) || 'qr'
    let uniq = name, k = 2
    while (used.has(uniq)) uniq = name + '-' + k++
    used.add(uniq); name = uniq
    if (format === 'svg') addFile(`${name}.svg`, strToU8(svgFile(r, width)))
    else {
      const render = transparent ? forTransparentExport(r) : r
      let canvas = await toCanvas(render, width, { bg: transparent ? null : '#FFFFFF' })
      if (labels && it.label) {
        const labelPad = Math.max(16, Math.round(width * 0.08)), labeled = document.createElement('canvas')
        labeled.width = canvas.width; labeled.height = canvas.height + Math.round(labelPad * 1.6)
        if (labeled.width * labeled.height > 32_000_000) throw new Error('The labelled image would be too large. Choose a smaller size.')
        const ctx = labeled.getContext('2d')
        if (!ctx) throw new Error('Canvas rendering is not available in this browser.')
        if (!transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, labeled.width, labeled.height) }
        ctx.drawImage(canvas, 0, 0); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = `600 ${Math.round(labelPad * 0.9)}px Arial, sans-serif`; ctx.fillText(it.label.slice(0, 48), labeled.width / 2, canvas.height + labelPad * 0.8)
        canvas = labeled
      }
      const blob = await canvasBlob(canvas)
      addFile(`${name}.png`, new Uint8Array(await blob.arrayBuffer()))
    }
    onProgress?.(i + 1, items.length)
    if (i % 2 === 1) await yieldTask(signal)
  }
  checkAbort(signal)
  const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const names = Object.keys(files).slice(0, items.length)
  addFile('_list.csv', strToU8('file,content\n' + items.map((it, i) => `${csvEscape(names[i] || '')},${csvEscape(it.text)}`).join('\n')))
  checkAbort(signal)
  const zip = zipSync(files, { level: 0 })
  checkAbort(signal)
  return new Blob([zip], { type: 'application/zip' })
}

export async function bulkPdf(itemsIn, style, { page = 'a4', cols = 3, rows = 4, labels = true, guides = true, mm = null, title = '' } = {}, onProgress, signal) {
  const items = safeList(itemsIn)
  const { jsPDF } = await import('jspdf')
  checkAbort(signal)
  const [PW, PH] = page === 'letter' ? [215.9, 279.4] : [210, 297]
  const colCount = Math.max(1, Math.min(6, Math.round(Number(cols) || 3)))
  const rowCount = Math.max(1, Math.min(10, Math.round(Number(rows) || 4)))
  const doc = new jsPDF({ unit: 'mm', format: [PW, PH], compress: true })
  const mx = 10, my = 12, cw = (PW - mx * 2) / colCount, ch = (PH - my * 2) / rowCount
  const per = colCount * rowCount
  for (let i = 0; i < items.length; i++) {
    checkAbort(signal)
    if (i && i % per === 0) doc.addPage([PW, PH])
    const idx = i % per, col = idx % colCount, row = Math.floor(idx / colCount)
    const x0 = mx + col * cw, y0 = my + row * ch
    const r = buildQR(items[i].text, style, 'p' + i)
    const lab = labels && items[i].label ? 7 : 0
    const box = Math.min(cw - 6, ch - 6 - lab)
    const printWidth = mm ? Math.min(Math.max(1, Number(mm) || box), box) : box
    const h = (printWidth * r.H) / r.W
    const c = await toCanvas(r, 900, { bg: '#FFFFFF' })
    const x = x0 + (cw - printWidth) / 2, y = y0 + 3 + (box - h) / 2
    doc.addImage(c.toDataURL('image/png'), 'PNG', x, y, printWidth, h, undefined, 'FAST')
    if (lab) { doc.setFontSize(8); doc.setTextColor(40); doc.text(items[i].label.slice(0, 36), x0 + cw / 2, y0 + 3 + box + 4.2, { align: 'center' }) }
    if (guides) { doc.setDrawColor(210); doc.setLineWidth(0.15); doc.setLineDashPattern([1.2, 1.2], 0); doc.rect(x0 + 1, y0 + 1, cw - 2, ch - 2); doc.setLineDashPattern([], 0) }
    onProgress?.(i + 1, items.length)
    if (i % 2 === 1) await yieldTask(signal)
  }
  checkAbort(signal)
  if (title) doc.setProperties({ title: String(title).slice(0, 120) })
  return doc.output('blob')
}

export function saveBlob(blob, name) { download(blob, name) }

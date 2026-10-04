import { zipSync, strToU8 } from 'fflate'
import { buildQR, toCanvas, canvasBlob, svgFile } from './render.js'
import { download } from '../utils.js'

export const PRINT_PRESETS = [
  ['card', 'Business card', 22, '22 mm'], ['sticker', 'Sticker', 40, '40 mm'], ['flyer', 'Flyer', 80, '80 mm'], ['a5', 'A5 flyer', 110, '110 mm'], ['poster', 'A4 poster', 170, '170 mm'], ['a2', 'Large poster', 380, '380 mm'],
]
export const SIZE_PRESETS = [[512, '512'], [1024, '1K'], [2048, '2K'], [4096, '4K'], [8192, '8K']]
export const mmToPx = (mm, dpi) => Math.min(8192, Math.round((mm / 25.4) * dpi))

export const slug = (s) => String(s || 'qr').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'qr'

export async function pngBlob(r, px, { transparent = false, bg = '#FFFFFF' } = {}) {
  const c = await toCanvas(r, px, { bg: transparent ? null : bg })
  return canvasBlob(c)
}

export async function pdfBlob(r, { mm = 80, margin = 10, title = '', dpi = 300, transparent = false } = {}) {
  const { jsPDF } = await import('jspdf')
  const px = Math.min(8192, Math.max(600, mmToPx(mm, dpi)))
  const c = await toCanvas(r, px, { bg: transparent ? null : '#FFFFFF' })
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
export async function bulkZip(items, style, { format = 'png', px = 1024, labels = false, transparent = false }, onProgress) {
  const files = {}
  const used = new Set()
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const r = buildQR(it.text, style, 'b' + i)
    let name = slug(it.name || it.label || it.text) || 'qr'
    let uniq = name, k = 2
    while (used.has(uniq)) uniq = name + '-' + k++
    used.add(uniq); name = uniq
    if (format === 'svg') files[`${name}.svg`] = strToU8(svgFile(r, px))
    else {
      let c = await toCanvas(r, px, { bg: transparent ? null : '#FFFFFF' })
      if (labels && it.label) {
        const L = document.createElement('canvas'), pad = Math.round(px * 0.08)
        L.width = c.width; L.height = c.height + pad * 1.6
        const x = L.getContext('2d'); if (!transparent) { x.fillStyle = '#fff'; x.fillRect(0, 0, L.width, L.height) }
        x.drawImage(c, 0, 0); x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle'
        x.font = `600 ${Math.round(pad * 0.9)}px Arial, sans-serif`; x.fillText(String(it.label).slice(0, 48), L.width / 2, c.height + pad * 0.8)
        c = L
      }
      files[`${name}.png`] = new Uint8Array(await (await canvasBlob(c)).arrayBuffer())
    }
    onProgress?.(i + 1, items.length)
    if (i % 4 === 3) await new Promise((r2) => setTimeout(r2))
  }
  files['_list.csv'] = strToU8('file,content\n' + items.map((it, i) => `${Object.keys(files)[i] || ''},"${String(it.text).replace(/"/g, '""')}"`).join('\n'))
  const zip = zipSync(files, { level: 0 })
  return new Blob([zip], { type: 'application/zip' })
}

export async function bulkPdf(items, style, { page = 'a4', cols = 3, rows = 4, labels = true, guides = true, mm = null, title = '' }, onProgress) {
  const { jsPDF } = await import('jspdf')
  const [PW, PH] = page === 'letter' ? [215.9, 279.4] : [210, 297]
  const doc = new jsPDF({ unit: 'mm', format: [PW, PH], compress: true })
  const mx = 10, my = 12, cw = (PW - mx * 2) / cols, ch = (PH - my * 2) / rows
  const per = cols * rows
  for (let i = 0; i < items.length; i++) {
    if (i && i % per === 0) doc.addPage([PW, PH])
    const idx = i % per, col = idx % cols, row = Math.floor(idx / cols)
    const x0 = mx + col * cw, y0 = my + row * ch
    const r = buildQR(items[i].text, style, 'p' + i)
    const lab = labels && items[i].label ? 7 : 0
    const box = Math.min(cw - 6, ch - 6 - lab)
    const w = mm ? Math.min(mm, box) : box, h = (w * r.H) / r.W
    const c = await toCanvas(r, 900, { bg: '#FFFFFF' })
    const x = x0 + (cw - w) / 2, y = y0 + 3 + (box - h) / 2
    doc.addImage(c.toDataURL('image/png'), 'PNG', x, y, w, h, undefined, 'FAST')
    if (lab) { doc.setFontSize(8); doc.setTextColor(40); doc.text(String(items[i].label).slice(0, 36), x0 + cw / 2, y0 + 3 + box + 4.2, { align: 'center' }) }
    if (guides) { doc.setDrawColor(210); doc.setLineWidth(0.15); doc.setLineDashPattern([1.2, 1.2], 0); doc.rect(x0 + 1, y0 + 1, cw - 2, ch - 2); doc.setLineDashPattern([], 0) }
    onProgress?.(i + 1, items.length)
    if (i % 3 === 2) await new Promise((r2) => setTimeout(r2))
  }
  if (title) { doc.setProperties({ title }) }
  return doc.output('blob')
}

export function saveBlob(blob, name) { download(blob, name) }

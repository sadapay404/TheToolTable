import { extName } from './utils.js'

/* ================= catalog (CloudConvert-style categories) ================= */

export const GROUPS = [
  ['Images', ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'tga', 'svg']],
  ['Video', ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'ts', 'gif']],
  ['Audio', ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wma', 'aiff']],
  ['Documents', ['txt', 'md', 'html', 'json', 'csv', 'rtf', 'docx', 'pdf']],
  ['Spreadsheets', ['xlsx', 'ods', 'tsv']],
  ['Slides', ['pptx']],
  ['E-books', ['epub']],
  ['Archives', ['zip']],
]

export const KIND_TARGETS = {
  image: ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'tga', 'gif', 'svg', 'zip'],
  svg: ['png', 'jpeg', 'webp', 'bmp', 'svg', 'zip'],
  video: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'ts', 'gif', 'mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wma', 'aiff', 'zip'],
  audio: ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wma', 'aiff', 'zip'],
  pdf: ['txt', 'md', 'html', 'json', 'rtf', 'docx', 'zip'],
  docx: ['txt', 'md', 'html', 'zip'],
  odt: ['txt', 'md', 'html', 'zip'],
  text: ['txt', 'md', 'html', 'json', 'csv', 'rtf', 'docx', 'xlsx', 'epub', 'pptx', 'zip'],
  sheet: ['xlsx', 'ods', 'csv', 'tsv', 'html', 'json', 'txt', 'zip'],
  zip: ['txt', 'json', 'zip'],
  epub: ['txt', 'md', 'html', 'zip'],
  pptx: ['txt', 'html', 'zip'],
  other: ['zip'],
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'tga', 'gif', 'avif'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'ts', 'mpeg', 'mpg', 'm4v', '3gp', 'ogv'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wma', 'aiff'])
const TEXT_EXTENSIONS = new Set(['txt', 'text', 'md', 'markdown', 'html', 'htm', 'xml', 'json', 'csv', 'tsv', 'rtf', 'log', 'yaml', 'yml', 'ini', 'cfg', 'js', 'jsx', 'tsx', 'css', 'scss', 'sql', 'py', 'sh'])

export function kindOf(f) {
  const e = extName(f.name)
  const mime = String(f.type || '').toLowerCase()
  if (mime === 'application/pdf' || e === 'pdf') return 'pdf'
  if (e === 'svg' || mime === 'image/svg+xml') return 'svg'
  if (e === 'zip' || e === 'tttzip') return 'zip'
  if (e === 'epub') return 'epub'
  if (e === 'pptx') return 'pptx'
  if (e === 'docx') return 'docx'
  if (e === 'odt') return 'odt'
  if (['xlsx', 'xls', 'ods', 'csv', 'tsv'].includes(e)) return 'sheet'
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(e)) return 'image'
  if (mime.startsWith('text/') && e === 'ts') return 'text'
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(e)) return 'video'
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(e)) return 'audio'
  if (TEXT_EXTENSIONS.has(e) || mime.startsWith('text/') || ['application/json', 'application/xml', 'application/rtf'].includes(mime)) return 'text'
  return 'other'
}

export const KIND_LABEL = {
  image: 'Image', svg: 'Vector', video: 'Video', audio: 'Audio', pdf: 'PDF', docx: 'Word',
  odt: 'ODT', text: 'Document', sheet: 'Spreadsheet', zip: 'Archive', epub: 'E-book', pptx: 'Slides', other: 'File',
}

/* ================= shared helpers ================= */

const dec = (b) => new TextDecoder().decode(b)
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
const MAX_ARCHIVE_EXPANDED_BYTES = 384 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 5000

async function unzip(buf) {
  if (buf.byteLength > MAX_ARCHIVE_BYTES) throw new Error('Archive is over the 256 MiB safety limit')
  const { unzipSync } = await import('fflate')
  let expanded = 0, count = 0
  return unzipSync(new Uint8Array(buf), { filter: (entry) => {
    count++
    if (count > MAX_ARCHIVE_ENTRIES) throw new Error('Archive contains too many entries to process safely')
    if (!Number.isFinite(entry.originalSize) || entry.originalSize < 0) throw new Error(`Invalid size for archive entry: ${entry.name}`)
    expanded += entry.originalSize
    if (expanded > MAX_ARCHIVE_EXPANDED_BYTES) throw new Error('Expanded archive would exceed the 384 MiB safety limit')
    return true
  } })
}

async function unzipFile(file) {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Archive is over the 256 MiB safety limit')
  return unzip(await file.arrayBuffer())
}

/* ================= engines ================= */

/** Real 32-bit BMP (BITMAPV4HEADER, BGRA, top-down) — browsers cannot encode BMP from a canvas. */
function encodeBMP(img) {
  const { width: w, height: h, data } = img, size = 14 + 108 + w * h * 4
  const buf = new ArrayBuffer(size), v = new DataView(buf), u = new Uint8Array(buf)
  u[0] = 0x42; u[1] = 0x4d; v.setUint32(2, size, true); v.setUint32(10, 122, true)
  v.setUint32(14, 108, true); v.setInt32(18, w, true); v.setInt32(22, -h, true); v.setUint16(26, 1, true); v.setUint16(28, 32, true); v.setUint32(30, 3, true); v.setUint32(34, w * h * 4, true)
  v.setInt32(38, 2835, true); v.setInt32(42, 2835, true)
  v.setUint32(54, 0x00ff0000, true); v.setUint32(58, 0x0000ff00, true); v.setUint32(62, 0x000000ff, true); v.setUint32(66, 0xff000000, true)
  u[70] = 0x20; u[71] = 0x6e; u[72] = 0x69; u[73] = 0x57 // 'Win ' colour space
  let o = 122
  for (let i = 0; i < data.length; i += 4) { u[o++] = data[i + 2]; u[o++] = data[i + 1]; u[o++] = data[i]; u[o++] = data[i + 3] }
  return new Blob([buf], { type: 'image/bmp' })
}

async function canvasPath(file, target, onProg) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth || 1024; c.height = img.naturalHeight || 1024
    c.getContext('2d').drawImage(img, 0, 0)
    onProg?.(70)
    if (target === 'bmp') { const bmp = encodeBMP(c.getContext('2d').getImageData(0, 0, c.width, c.height)); onProg?.(100); return { blob: bmp, ext: 'bmp' } }
    const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[target]
    const blob = await new Promise((res) => c.toBlob(res, mime, target === 'jpeg' || target === 'webp' ? 0.98 : undefined))
    if (!blob || blob.type !== mime) throw new Error('This browser cannot encode ' + target.toUpperCase())
    onProg?.(100)
    return { blob, ext: target === 'jpeg' ? 'jpg' : target }
  } finally { URL.revokeObjectURL(url) }
}

async function svgEmbed(file) {
  const url = URL.createObjectURL(file)
  let w = 0, h = 0
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    w = img.naturalWidth; h = img.naturalHeight
  } finally { URL.revokeObjectURL(url) }
  const data = await file.arrayBuffer()
  let inner = dec(data)
  if (!inner.includes('xmlns=')) inner = inner.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  return { blob: new Blob([inner], { type: 'image/svg+xml' }), ext: 'svg', w, h }
}

const FF_ARGS = {
  mp4: ['-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-c:a', 'aac', '-b:a', '320k'],
  mov: ['-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-c:a', 'aac', '-b:a', '320k'],
  mkv: ['-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-c:a', 'libmp3lame', '-b:a', '320k'],
  webm: ['-c:v', 'libvpx', '-crf', '8', '-b:v', '4M', '-c:a', 'libvorbis', '-q:a', '8'],
  avi: ['-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-b:a', '192k'],
  flv: ['-c:v', 'flv', '-c:a', 'libmp3lame', '-b:a', '192k'],
  wmv: ['-c:v', 'wmv2', '-q:v', '4', '-c:a', 'wmav2', '-b:a', '192k'],
  ts: ['-c:v', 'libx264', '-crf', '16', '-c:a', 'aac', '-b:a', '192k'],
  gif: ['-vf', 'fps=15,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse'],
  mp3: ['-vn', '-c:a', 'libmp3lame', '-b:a', '320k'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  aiff: ['-vn', '-c:a', 'pcm_s16be'],
  flac: ['-vn', '-c:a', 'flac'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '9'],
  opus: ['-vn', '-c:a', 'libopus', '-b:a', '192k'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '320k'],
  aac: ['-vn', '-c:a', 'aac', '-b:a', '320k'],
  wma: ['-vn', '-c:a', 'wmav2', '-b:a', '192k'],
  tiff: ['-frames:v', '1', '-update', '1'],
  tga: ['-frames:v', '1', '-update', '1'],
}

async function ffmpegPath(file, target, onProg) {
  const { convertWithFFmpeg } = await import('./ffmpeg.js')
  const blob = await convertWithFFmpeg(file, `out.${target}`, FF_ARGS[target], onProg)
  return { blob, ext: target === 'jpeg' ? 'jpg' : target }
}

async function pdfText(file, onProg) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    pages.push(tc.items.map((it) => it.str).join(' '))
    onProg?.((p / doc.numPages) * 60)
  }
  return { pages, text: pages.join('\n\n') }
}

function docxReadText(entries) {
  const doc = entries['word/document.xml']
  if (!doc) throw new Error('word/document.xml missing')
  return dec(doc).split('</w:p>').map(stripTags).join('\n').trim()
}

async function writeText(text, title, target, onProg) {
  const lines = String(text).split(/\r?\n/)
  onProg?.(70)
  if (target === 'txt') return { blob: new Blob([text], { type: 'text/plain' }), ext: 'txt' }
  if (target === 'md') return { blob: new Blob([`# ${title}\n\n${text}`], { type: 'text/markdown' }), ext: 'md' }
  if (target === 'html') return { blob: new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body><h1>${esc(title)}</h1>${lines.map((l) => `<p>${esc(l)}</p>`).join('\n')}</body></html>`], { type: 'text/html' }), ext: 'html' }
  if (target === 'json') return { blob: new Blob([JSON.stringify({ title, lines: lines.length, content: lines }, null, 2)], { type: 'application/json' }), ext: 'json' }
  if (target === 'csv') return { blob: new Blob([lines.map((l) => `"${l.replace(/"/g, '""')}"`).join('\n')], { type: 'text/csv' }), ext: 'csv' }
  if (target === 'tsv') return { blob: new Blob([lines.join('\n')], { type: 'text/tab-separated-values' }), ext: 'tsv' }
  if (target === 'rtf') return { blob: new Blob([`{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Calibri;}}\\f0\\fs22 ${lines.map((l) => `${l.replace(/[\\{}]/g, (m) => '\\' + m)}\\par `).join('')}}`], { type: 'application/rtf' }), ext: 'rtf' }
  if (target === 'docx') {
    const { zipSync, strToU8 } = await import('fflate')
    const paras = lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`).join('')
    const zip = zipSync({
      '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
      '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
      'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr/></w:body></w:document>`),
    })
    return { blob: new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), ext: 'docx' }
  }
  if (target === 'xlsx' || target === 'ods') {
    // Spreadsheets are parsed and written in a disposable Worker. A malformed
    // workbook must never be able to freeze or alter the page that hosts the
    // rest of the tools.
    const { writeTextSpreadsheet } = await import('./spreadsheet.js')
    return writeTextSpreadsheet(text, target, onProg)
  }
  if (target === 'epub') {
    const { zipSync, strToU8 } = await import('fflate')
    const paras = lines.map((l) => `<p>${esc(l) || '&#160;'}</p>`).join('\n')
    const zip = zipSync({
      'mimetype': [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8(`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`),
      'OEBPS/content.opf': strToU8(`<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${makeId()}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ch1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`),
      'OEBPS/nav.xhtml': strToU8(`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">${esc(title)}</a></li></ol></nav></body></html>`),
      'OEBPS/chapter.xhtml': strToU8(`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(title)}</title></head><body><h1>${esc(title)}</h1>${paras}</body></html>`),
    })
    return { blob: new Blob([zip], { type: 'application/epub+zip' }), ext: 'epub' }
  }
  if (target === 'pptx') {
    const PptxGenJS = (await import('pptxgenjs')).default
    const p = new PptxGenJS()
    p.title = title
    for (let i = 0; i < lines.length; i += 6) {
      const s = p.addSlide()
      s.addText(title, { fontSize: 24, bold: true, color: '2A211C', y: 0.4 })
      s.addText(lines.slice(i, i + 6).map((l) => ({ text: l, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.4, fontSize: 16, color: '46403A' })
    }
    // `writeFile()` triggers a browser download and returns its filename; the
    // converter needs the actual bytes so the shared download path can name and
    // save them consistently. `write()` returns a Blob in browsers (and Node's
    // Blob implementation in the regression test).
    const blob = await p.write({ outputType: 'blob' })
    if (!(blob instanceof Blob)) throw new Error('Presentation writer returned an invalid file')
    return { blob, ext: 'pptx' }
  }
  throw new Error('No writer for ' + target)
}

async function sheetPath(file, target, onProg) {
  // Keep SheetJS and user-supplied workbooks out of the application's Realm.
  // The Worker has hard file, cell, output and wall-clock limits, then is
  // terminated, so a hostile workbook cannot leave the converter (or Android's
  // first UI thread) wedged after an error.
  const { convertSpreadsheet } = await import('./spreadsheet.js')
  return convertSpreadsheet(file, target, onProg)
}

async function zipWrap(file) {
  const { zipSync } = await import('fflate')
  const name = String(file.name || 'file').split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, '') || 'file'
  const z = zipSync({ [name]: new Uint8Array(await file.arrayBuffer()) })
  return { blob: new Blob([z], { type: 'application/zip' }), ext: 'zip' }
}

async function zipTexts(file) {
  const entries = await unzipFile(file)
  const texts = []
  const manifest = []
  for (const [name, data] of Object.entries(entries)) {
    manifest.push({ name, bytes: data.length })
    if (/\.(txt|md|html?|xml|json|csv|svg)$/i.test(name)) texts.push(`--- ${name} ---\n${dec(data)}`)
  }
  return { texts: texts.join('\n\n'), manifest }
}

function pptxText(entries) {
  const slides = Object.keys(entries).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => (a.match(/\d+/)[0] | 0) - (b.match(/\d+/)[0] | 0))
  return slides.map((s, i) => `Slide ${i + 1}: ` + [...dec(entries[s]).matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join(' ')).join('\n')
}

function odtText(entries) {
  if (!entries['content.xml']) throw new Error('content.xml missing')
  return stripTags(dec(entries['content.xml'])).trim()
}

function epubText(entries) {
  const htmls = Object.keys(entries).filter((k) => /\.x?html?$/.test(k) && !/nav/.test(k)).sort()
  return htmls.map((k) => stripTags(dec(entries[k]))).join('\n\n').trim()
}

/* ================= router ================= */

export async function convertFile(file, kind, target, onProg) {
  if (target === 'zip') return zipWrap(file)

  switch (kind) {
    case 'image':
    case 'svg': {
      if (['png', 'jpeg', 'webp', 'bmp'].includes(target)) return canvasPath(file, target, onProg)
      if (target === 'svg') return svgEmbed(file)
      if (['tiff', 'tga', 'gif'].includes(target)) return ffmpegPath(file, target, onProg)
      break
    }
    case 'video':
    case 'audio': {
      if (FF_ARGS[target]) return ffmpegPath(file, target, onProg)
      break
    }
    case 'pdf': {
      const { text, pages } = await pdfText(file, onProg)
      if (target === 'json') return writeText(JSON.stringify(pages), file.name, 'json', onProg)
      return writeText(text, file.name, target, onProg)
    }
    case 'docx': {
      const entries = await unzipFile(file)
      return writeText(docxReadText(entries), file.name, target, onProg)
    }
    case 'odt': {
      const entries = await unzipFile(file)
      return writeText(odtText(entries), file.name, target, onProg)
    }
    case 'pptx': {
      const entries = await unzipFile(file)
      return writeText(pptxText(entries), file.name, target === 'html' ? 'html' : 'txt', onProg)
    }
    case 'epub': {
      const entries = await unzipFile(file)
      return writeText(epubText(entries), file.name, target, onProg)
    }
    case 'zip': {
      const { texts, manifest } = await zipTexts(file)
      if (target === 'json') return { blob: new Blob([JSON.stringify({ files: manifest }, null, 2)], { type: 'application/json' }), ext: 'json' }
      return writeText(texts, file.name, target, onProg)
    }
    case 'sheet':
      return sheetPath(file, target, onProg)
    case 'text': {
      const text = await file.text()
      return writeText(text, file.name, target, onProg)
    }
  }
  throw new Error(`No on-device engine for ${kind} → ${target}. That pair needs a server engine (Phase 2).`)
}

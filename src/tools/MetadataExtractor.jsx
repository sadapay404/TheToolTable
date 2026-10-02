import React, { useMemo, useState } from 'react'
import exifr from 'exifr'
import { jsPDF } from 'jspdf'
import { Dropzone, Note } from '../components/ui.jsx'
import { fmtBytes, download, baseName, extName, recentAction } from '../lib/utils.js'
import { scrub, detectType } from '../lib/sanitize.js'

/* embedded 64×64 sample PNG carrying Software/Author tEXt tags — for the in-browser self test */
const SAMPLE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAAAADEAAAAJnRFWHRTb2Z0d2FyZQBUaGVUb29sVGFibGUgc2VsZi10ZXN0IHNhbXBsZQAAAFoAAAAPdEVYdEF1dGhvcgBNdWJhc2hpcgAAAHUAAABeSURBVHic7c8xDQAwDMCwwh78gthhVYoRJPOOGx3wqwGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQFtAQBQgUsAAAALAAAAAElFTkQAAAAA'

export function sampleFile() {
  const bin = atob(SAMPLE_PNG_B64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], 'self-test-sample.png', { type: 'image/png' })
}

/* ---------- value formatting (every tag type renders) ---------- */
function fmtVal(v) {
  if (v == null) return ''
  if (v instanceof Date) return v.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'medium' })
  if (typeof v === 'object') {
    if (ArrayBuffer.isView(v)) {
      const a = [...v.slice(0, 24)]
      return a.map((x) => x.toString(16).padStart(2, '0')).join(' ') + (v.length > 24 ? ' …' : '')
    }
    if (Array.isArray(v)) return v.slice(0, 10).map(fmtVal).join(', ') + (v.length > 10 ? ', …' : '')
    try {
      const s = JSON.stringify(v)
      return s.length > 240 ? s.slice(0, 240) + '…' : s
    } catch { return String(v) }
  }
  const s = String(v)
  return s.length > 300 ? s.slice(0, 300) + '…' : s
}

const rows = (obj) => (obj && typeof obj === 'object' ? Object.entries(obj).filter(([, v]) => v !== undefined) : [])

/* ---------- file structure (always works for JPEG/PNG) ---------- */
const JPEG_MARKERS = { c0: 'SOF0', c1: 'SOF1', c2: 'SOF2', c4: 'DHT', c8: 'SOF8', ca: 'SOF10', cc: 'DAC', d8: 'SOI', d9: 'EOI', da: 'SOS', db: 'DQT', dd: 'DRI', e0: 'APP0 (JFIF)', e1: 'APP1 (EXIF/XMP)', e2: 'APP2 (ICC)', ed: 'APP13 (IPTC)', ee: 'APP14 (Adobe)', fe: 'COM' }
function jpegStructure(buf) {
  const b = new Uint8Array(buf); const out = []
  let i = 0
  while (i < b.length - 1 && out.length < 400) {
    if (b[i] !== 0xff) { out.push(['Entropy-coded scan data', `${(b.length - i).toLocaleString()} B`]); break }
    const m = b[i + 1]
    const name = JPEG_MARKERS[m.toString(16)] || `FF${m.toString(16).toUpperCase()} segment`
    if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) { out.push([name, '—']); i += 2; continue }
    if (m === 0xda) { out.push([name, `${(b.length - i).toLocaleString()} B (to EOI)`]); break }
    const len = (b[i + 2] << 8) | b[i + 3]
    out.push([name, `${len} B`])
    i += 2 + len
  }
  return out
}
function pngStructure(buf) {
  const b = new Uint8Array(buf); const dv = new DataView(buf); const out = []
  let i = 8
  while (i + 8 <= b.length && out.length < 400) {
    const len = dv.getUint32(i)
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    out.push([`${type} chunk`, `${len.toLocaleString()} B`])
    if (type === 'IEND') break
    i += 12 + len
  }
  return out
}

/* ---------- PDF report (same deliverable as the reference tool) ---------- */
function exportPDF({ file, fileInfo, sections, gps }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 16
  let y = 20
  const line = (h = 5) => { y += h }
  const ensure = (need = 10) => { if (y + need > 285) { doc.addPage(); y = 20 } }
  doc.setFont('times', 'bold'); doc.setFontSize(22); doc.setTextColor(42, 33, 28)
  doc.text('TheToolTable — Metadata Report', M, y); line(7)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 114, 103)
  doc.text(`Generated ${new Date().toLocaleString('en-GB')} · ${file.name}`, M, y); line(8)

  const section = (title, entries) => {
    ensure(16)
    doc.setFont('times', 'bold'); doc.setFontSize(14); doc.setTextColor(180, 113, 90)
    doc.text(title, M, y); line(6)
    if (!entries.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(140, 134, 124)
      doc.text('No tags found in this block.', M, y); line(7); return
    }
    for (const [k, v] of entries) {
      const key = String(k)
      const val = doc.splitTextToSize(fmtVal(v), W - M * 2 - 62)
      const hLines = val.length * 4.2
      ensure(6 + hLines)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(42, 33, 28)
      doc.text(key.slice(0, 60), M, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(70, 64, 58)
      doc.text(val, M + 62, y)
      line(Math.max(5, hLines + 1.6))
    }
    line(4)
  }

  section('File Information', rows(fileInfo))
  sections.forEach(([title, entries]) => section(title, entries))
  if (gps?.latitude != null) section('GPS Location', [['Latitude', gps.latitude], ['Longitude', gps.longitude], ['Accuracy', 'Embedded coordinates']])
  doc.save(`${baseName(file.name)}_metadata.pdf`)
}

export default function MetadataExtractor() {
  const [file, setFile] = useState(null)
  const [meta, setMeta] = useState(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [cleaned, setCleaned] = useState(null)

  async function analyze([f]) {
    setFile(f); setError(''); setCleaned(null); setMeta(null); setFilter('')
    try {
    const buf = await f.arrayBuffer()

    // file-level facts — always available
    const fileInfo = {
      'File name': f.name,
      'File size': `${fmtBytes(f.size)} (${f.size.toLocaleString()} bytes)`,
      'MIME type': f.type || 'unknown',
      'Extension': extName(f.name).toUpperCase() || '—',
      'Container': detectType(buf)?.toUpperCase() || (f.type.includes('webp') ? 'WEBP' : extName(f.name).toUpperCase()),
      'Last modified': new Date(f.lastModified),
    }
    try {
      const url = URL.createObjectURL(f)
      const img = new Image()
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
      fileInfo['Dimensions'] = `${img.naturalWidth} × ${img.naturalHeight} px`
      fileInfo['Megapixels'] = ((img.naturalWidth * img.naturalHeight) / 1e6).toFixed(2) + ' MP'
      URL.revokeObjectURL(url)
    } catch { /* non-image or undecodable — fine */ }

    let all = {}, exif = {}, iptc = {}, xmp = {}, gps = null, icc = {}
    try {
      all = (await exifr.parse(f, { translateValues: true, reviveValues: true, exif: true, iptc: true, xmp: true, icc: true, gps: true, makerNotes: true, ifd0: true, ifd1: true, interop: true })) || {}
    } catch { all = {} }
    try { exif = (await exifr.exif(f)) || {} } catch { exif = {} }
    try { iptc = (await exifr.iptc(f)) || {} } catch { iptc = {} }
    try { xmp = (await exifr.xmp(f)) || {} } catch { xmp = {} }
    try { gps = await exifr.gps(f) } catch { gps = null }
    try { icc = (await exifr.icc(f)) || {} } catch { icc = {} }

    const structure = detectType(buf) === 'jpeg' ? jpegStructure(buf) : detectType(buf) === 'png' ? pngStructure(buf) : []
    setMeta({ fileInfo, all, exif, iptc, xmp, gps, icc, structure, buf })
    } catch (e) {
      setError('Analysis failed: ' + String(e?.stack || e?.message || e).slice(0, 400))
    }
  }

  const sections = useMemo(() => {
    if (!meta) return []
    const q = filter.trim().toLowerCase()
    const flt = (r) => (q ? r.filter(([k, v]) => String(k).toLowerCase().includes(q) || fmtVal(v).toLowerCase().includes(q)) : r)
    return [
      ['EXIF & Maker Notes', flt(rows(Object.keys(meta.exif).length ? meta.exif : meta.all))],
      ['IPTC', flt(rows(meta.iptc))],
      ['XMP', flt(rows(meta.xmp))],
      ['ICC Color Profile', flt(rows(meta.icc))],
      ['File Structure', flt(meta.structure)],
    ]
  }, [meta, filter])

  const totalTags = useMemo(() => sections.reduce((n, [, r]) => n + r.length, 0), [sections])

  function sanitizeFile() {
    const res = scrub(meta.buf)
    if (!res) { setError('Scrub supports JPEG & PNG pixel-losslessly. Other containers would require re-encoding, which the zero-compression policy blocks.'); return }
    download(res.blob, `${baseName(file.name)}-clean.${res.type === 'jpeg' ? 'jpg' : 'png'}`)
    setCleaned({ before: file.size, after: res.blob.size })
    recentAction(`Scrubbed metadata from ${file.name}`)
  }

  return (
    <div className="space-y-5">
      {!file ? (
        <>
        <Dropzone onFiles={analyze} accept="image/*,.heic,.tif,.tiff,.webp" label="Drop a photo or image file" sub="JPEG · PNG · TIFF · HEIC · WebP — parsed entirely on this device" />
        <div className="text-center">
          <button className="btn" onClick={() => analyze([sampleFile()])}>🩺 Run built-in self-test</button>
          <div className="text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>Parses an embedded sample image end-to-end in your browser and shows the result — proves the engine live.</div>
        </div>
        </>
      ) : (
        <>
          <div className="card p-6 flex flex-wrap items-center gap-5">
            <div className="min-w-0 flex-1">
              <div className="display font-semibold text-[19px] truncate">{file.name}</div>
              <div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>
                {fmtBytes(file.size)} · {totalTags} metadata tags extracted
              </div>
            </div>
            <input className="input max-w-[220px]" placeholder="Filter tags…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="btn" onClick={() => { setFile(null); setMeta(null) }}>New file</button>
            <button className="btn" disabled={!meta} onClick={() => { exportPDF({ file, fileInfo: meta.fileInfo, sections, gps: meta.gps }); recentAction(`Exported metadata PDF for ${file.name}`) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" /></svg>
              Report PDF
            </button>
            <button className="btn btn-primary" disabled={!meta} onClick={sanitizeFile}>Scrub & Sanitize</button>
          </div>

          {cleaned && <Note tone="ok">Sanitized copy downloaded — {fmtBytes(cleaned.before)} → {fmtBytes(cleaned.after)}. Pixel data untouched.</Note>}
          {error && <Note tone="warn">{error}</Note>}

          {!meta ? (
            <div className="card p-8 text-center">
              <div className="display font-semibold text-[16px]">Reading metadata…</div>
              <div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>Parsing EXIF, IPTC, XMP, GPS and file structure on-device.</div>
            </div>
          ) : (
          <>
          {totalTags === 0 && <Note>This file carries no embedded metadata blocks — the report still includes its file information and structure below.</Note>}

          <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
            {/* summary rail */}
            <div className="space-y-5 lg:sticky lg:top-24">
              <div className="card p-5">
                <div className="eyebrow mb-3">File information</div>
                <table className="kv"><tbody>
                  {rows(meta.fileInfo).map(([k, v]) => <tr key={k}><td>{k}</td><td className="mono">{fmtVal(v)}</td></tr>)}
                </tbody></table>
              </div>
              {meta.gps?.latitude != null && (
                <div className="card overflow-hidden">
                  <div className="p-4 pb-3 eyebrow">GPS location</div>
                  <div className="px-4 pb-3 text-[12px] mono" style={{ color: 'var(--muted)' }}>
                    {meta.gps.latitude.toFixed(6)}, {meta.gps.longitude.toFixed(6)}
                  </div>
                  <iframe
                    title="GPS location"
                    className="w-full h-64"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${meta.gps.longitude - 0.01}%2C${meta.gps.latitude - 0.006}%2C${meta.gps.longitude + 0.01}%2C${meta.gps.latitude + 0.006}&layer=mapnik&marker=${meta.gps.latitude}%2C${meta.gps.longitude}`}
                  />
                </div>
              )}
            </div>

            {/* report body */}
            <div className="space-y-5 min-w-0">
              {sections.map(([title, r]) => (
                <div key={title} className="card overflow-hidden">
                  <div className="px-5 py-3.5 flex items-center justify-between border-b border-line">
                    <span className="display font-semibold text-[15px]">{title}</span>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>{r.length} tags</span>
                  </div>
                  {r.length ? (
                    <div className="max-h-96 overflow-auto">
                      <table className="kv"><tbody>
                        {r.map(([k, v], i) => <tr key={title + i}><td>{String(k)}</td><td className="mono break-all">{fmtVal(v)}</td></tr>)}
                      </tbody></table>
                    </div>
                  ) : (
                    <div className="px-5 py-4 text-[12.5px]" style={{ color: 'var(--muted)' }}>No tags in this block.</div>
                  )}
                </div>
              ))}

              <div className="card overflow-hidden">
                <div className="px-5 py-3.5 display font-semibold text-[15px] border-b border-line">Raw hex (first 512 B)</div>
                <HexView buf={meta.buf} />
              </div>
            </div>
          </div>
          </>
          )}
        </>
      )}
    </div>
  )
}

function HexView({ buf }) {
  const out = []
  const b = new Uint8Array(buf.slice(0, 512))
  for (let i = 0; i < b.length; i += 16) {
    const chunk = b.subarray(i, i + 16)
    const hex = [...chunk].map((x) => x.toString(16).padStart(2, '0')).join(' ')
    const ascii = [...chunk].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '·')).join('')
    out.push([i.toString(16).padStart(8, '0'), hex, ascii])
  }
  return (
    <div className="overflow-auto max-h-72 p-4">
      <pre className="mono text-[11px] leading-relaxed whitespace-pre">
        {out.map(([o, h, a]) => <div key={o}><span style={{ color: 'var(--accent)' }}>{o}</span>  {h.padEnd(48)}  <span style={{ color: 'var(--muted)' }}>{a}</span></div>)}
      </pre>
    </div>
  )
}

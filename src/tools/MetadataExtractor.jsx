import React, { useMemo, useState } from 'react'
import exifr from 'exifr'
import { jsPDF } from 'jspdf'
import { Dropzone, Note } from '../components/ui.jsx'
import { fmtBytes, download, baseName, extName, recentAction } from '../lib/utils.js'
import { scrub, detectType } from '../lib/sanitize.js'

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

function jsonSafe(v) {
  if (v instanceof Date) return v.toISOString()
  if (ArrayBuffer.isView(v)) return [...v].map((x) => x.toString(16).padStart(2, '0')).join(' ')
  if (Array.isArray(v)) return v.map(jsonSafe)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]))
  return v
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

function rawXmpPacket(buf) {
  const b = new Uint8Array(buf)
  const s = new TextDecoder('latin1').decode(b)
  const start = s.indexOf('<x:xmpmeta')
  const end = s.indexOf('</x:xmpmeta>')
  if (start === -1 || end === -1) return null
  return s.slice(start, end + 12)
}

function gcd(a, b) { return b ? gcd(b, a % b) : a }

async function sha256(buf) {
  try {
    const h = await crypto.subtle.digest('SHA-256', buf)
    return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('')
  } catch { return 'unavailable in this context' }
}

async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`)
    const j = await r.json()
    return j?.display_name || null
  } catch { return null }
}

/* ---------- PDF report ---------- */
function exportPDF({ file, sections }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 16
  let y = 20
  const line = (h = 5) => { y += h }
  const ensure = (need = 10) => { if (y + need > 285) { doc.addPage(); y = 20 } }
  doc.setFont('times', 'bold'); doc.setFontSize(22); doc.setTextColor(42, 33, 28)
  doc.text('TheToolTable — Metadata Report', M, y); line(7)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 114, 103)
  doc.text(`Generated ${new Date().toLocaleString('en-GB')} · ${file.name}`, M, y); line(8)

  for (const [title, entries] of sections) {
    ensure(16)
    doc.setFont('times', 'bold'); doc.setFontSize(14); doc.setTextColor(180, 113, 90)
    doc.text(title, M, y); line(6)
    if (!entries.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(140, 134, 124)
      doc.text('No tags found in this block.', M, y); line(7); continue
    }
    for (const [k, v] of entries) {
      const val = doc.splitTextToSize(fmtVal(v), W - M * 2 - 62)
      const hLines = val.length * 4.2
      ensure(6 + hLines)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(42, 33, 28)
      doc.text(String(k).slice(0, 60), M, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(70, 64, 58)
      doc.text(val, M + 62, y)
      line(Math.max(5, hLines + 1.6))
    }
    line(4)
  }
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

      /* ---- file-level facts ---- */
      const fileInfo = {
        'File name': f.name,
        'File size': `${fmtBytes(f.size)} (${f.size.toLocaleString()} bytes)`,
        'MIME type': f.type || 'unknown',
        'Extension': extName(f.name).toUpperCase() || '—',
        'Container': detectType(buf)?.toUpperCase() || (f.type.includes('webp') ? 'WEBP' : f.type.includes('heic') ? 'HEIC' : extName(f.name).toUpperCase()),
        'SHA-256': await sha256(buf),
        'Last modified': new Date(f.lastModified),
      }
      let w = 0, h = 0
      try {
        const url = URL.createObjectURL(f)
        const img = new Image()
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
        w = img.naturalWidth; h = img.naturalHeight
        fileInfo['Dimensions'] = `${w} × ${h} px`
        fileInfo['Megapixels'] = ((w * h) / 1e6).toFixed(2) + ' MP'
        const g = gcd(w, h)
        fileInfo['Aspect ratio'] = g ? `${w / g}:${h / g}` : '—'
        fileInfo['Orientation'] = w > h ? 'Landscape' : w < h ? 'Portrait' : 'Square'
        URL.revokeObjectURL(url)
      } catch { /* undecodable — fine */ }

      /* ---- every exifr block ---- */
      const opts = { translateValues: true, reviveValues: true, exif: true, iptc: true, xmp: true, icc: true, gps: true, makerNotes: true, ifd0: true, ifd1: true, interop: true }
      let all = {}, exif = {}, iptc = {}, xmp = {}, gps = null, icc = {}, thumbUrl = null
      try { all = (await exifr.parse(f, opts)) || {} } catch { all = {} }
      try { exif = (await exifr.exif(f)) || {} } catch { exif = {} }
      try { iptc = (await exifr.iptc(f)) || {} } catch { iptc = {} }
      try { xmp = (await exifr.xmp(f)) || {} } catch { xmp = {} }
      try { gps = await exifr.gps(f) } catch { gps = null }
      try { icc = (await exifr.icc(f)) || {} } catch { icc = {} }
      try {
        const t = await exifr.thumbnail(f)
        if (t) thumbUrl = URL.createObjectURL(new Blob([t], { type: 'image/jpeg' }))
      } catch { thumbUrl = null }

      const xmpRaw = rawXmpPacket(buf)
      if (xmpRaw) xmp['Raw XMP packet'] = xmpRaw.slice(0, 4000)

      /* ---- location ---- */
      let place = null
      if (gps?.latitude != null) place = await reverseGeocode(gps.latitude, gps.longitude)

      const structure = detectType(buf) === 'jpeg' ? jpegStructure(buf) : detectType(buf) === 'png' ? pngStructure(buf) : []
      setMeta({ fileInfo, all, exif, iptc, xmp, gps, icc, place, structure, thumbUrl, buf })
    } catch (e) {
      setError('Analysis failed: ' + String(e?.stack || e?.message || e).slice(0, 400))
    }
  }

  const sections = useMemo(() => {
    if (!meta) return []
    const q = filter.trim().toLowerCase()
    const flt = (r) => (q ? r.filter(([k, v]) => String(k).toLowerCase().includes(q) || fmtVal(v).toLowerCase().includes(q)) : r)
    const loc = []
    if (meta.gps?.latitude != null) {
      loc.push(['Latitude', meta.gps.latitude.toFixed(7) + '°'])
      loc.push(['Longitude', meta.gps.longitude.toFixed(7) + '°'])
      if (meta.gps.altitude != null) loc.push(['Altitude', `${Number(meta.gps.altitude).toFixed(1)} m`])
      if (meta.gps.speed != null) loc.push(['Speed', `${Number(meta.gps.speed).toFixed(1)} km/h`])
      if (meta.gps.imgDirection != null) loc.push(['Camera direction', `${Number(meta.gps.imgDirection).toFixed(0)}°`])
      if (meta.place) loc.push(['Place (reverse geocoded)', meta.place])
      loc.push(['Map', `https://www.openstreetmap.org/?mlat=${meta.gps.latitude}&mlon=${meta.gps.longitude}#map=17/${meta.gps.latitude}/${meta.gps.longitude}`])
    }
    return [
      ['File Information', flt(rows(meta.fileInfo))],
      ['Location & GPS', flt(loc)],
      ['EXIF & Maker Notes', flt(rows(meta.exif))],
      ['Everything (merged dump)', flt(rows(meta.all))],
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

  function exportJSON() {
    const payload = { generated: new Date().toISOString(), file: file.name, sections: Object.fromEntries(sections.map(([t, r]) => [t, Object.fromEntries(r.map(([k, v]) => [k, jsonSafe(v)]))])) }
    download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${baseName(file.name)}_metadata.json`)
    recentAction(`Exported metadata JSON for ${file.name}`)
  }

  return (
    <div className="space-y-5">
      {!file ? (
        <Dropzone onFiles={analyze} accept="image/*,.heic,.tif,.tiff,.webp" label="Drop a photo or image file" sub="JPEG · PNG · TIFF · HEIC · WebP — every tag and GPS, parsed on this device (the place name is looked up via OpenStreetMap)" />
      ) : (
        <>
          <div className="card p-6 flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="display font-semibold text-[19px] truncate">{file.name}</div>
              <div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>
                {fmtBytes(file.size)} · {totalTags} metadata entries extracted
              </div>
            </div>
            <input className="input max-w-[200px]" placeholder="Filter tags…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="btn" onClick={() => { setFile(null); setMeta(null) }}>New file</button>
            <button className="btn" disabled={!meta} onClick={exportJSON}>JSON</button>
            <button className="btn" disabled={!meta} onClick={() => { exportPDF({ file, sections }); recentAction(`Exported metadata PDF for ${file.name}`) }}>
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
              <div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>Parsing EXIF, IPTC, XMP, ICC, GPS, structure and reverse-geocoding location on-device.</div>
            </div>
          ) : (
          <>
          {totalTags === 0 && <Note>This file carries no embedded metadata blocks — the report still includes its file information and structure below.</Note>}

          <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
            {/* summary rail */}
            <div className="space-y-5 lg:sticky lg:top-24">
              <div className="card p-5">
                <div className="eyebrow mb-3">File information</div>
                <table className="kv"><tbody>
                  {rows(meta.fileInfo).map(([k, v]) => <tr key={k}><td>{k}</td><td className="mono break-all">{fmtVal(v)}</td></tr>)}
                </tbody></table>
              </div>
              {meta.thumbUrl && (
                <div className="card p-5">
                  <div className="eyebrow mb-3">Embedded thumbnail (IFD1)</div>
                  <img src={meta.thumbUrl} alt="Embedded thumbnail" className="w-full rounded-lg border border-line" />
                </div>
              )}
              {meta.gps?.latitude != null && (
                <div className="card overflow-hidden">
                  <div className="p-4 pb-2 eyebrow">Location</div>
                  {meta.place && <div className="px-4 pb-3 text-[12.5px] leading-relaxed">{meta.place}</div>}
                  <div className="px-4 pb-3 text-[11.5px] mono" style={{ color: 'var(--muted)' }}>
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
              {sections.slice(1).map(([title, r]) => (
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

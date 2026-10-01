import React, { useState } from 'react'
import exifr from 'exifr'
import { Dropzone, Note } from '../components/ui.jsx'
import { fmtBytes, download, baseName, extName, recentAction } from '../lib/utils.js'
import { scrub } from '../lib/sanitize.js'

function HexView({ buf }) {
  const rows = []
  const b = new Uint8Array(buf.slice(0, 512))
  for (let i = 0; i < b.length; i += 16) {
    const chunk = b.subarray(i, i + 16)
    const hex = [...chunk].map((x) => x.toString(16).padStart(2, '0')).join(' ')
    const ascii = [...chunk].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '·')).join('')
    rows.push([i.toString(16).padStart(8, '0'), hex, ascii])
  }
  return (
    <div className="card p-4 overflow-auto max-h-72">
      <pre className="mono text-[11px] leading-relaxed whitespace-pre">
        {rows.map(([o, h, a]) => <div key={o}><span style={{ color: 'var(--accent)' }}>{o}</span>  {h.padEnd(48)}  <span style={{ color: 'var(--muted)' }}>{a}</span></div>)}
      </pre>
    </div>
  )
}

function Table({ data }) {
  const rows = Object.entries(data).filter(([, v]) => v != null && typeof v !== 'object').slice(0, 120)
  if (!rows.length) return <Note>No plain-text fields in this block.</Note>
  return (
    <div className="card overflow-hidden">
      <div className="max-h-80 overflow-auto">
        <table className="kv">
          <tbody>
            {rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="mono break-all">{String(v).slice(0, 300)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function MetadataExtractor() {
  const [file, setFile] = useState(null)
  const [meta, setMeta] = useState(null)
  const [tab, setTab] = useState('all')
  const [error, setError] = useState('')
  const [cleaned, setCleaned] = useState(null)

  async function analyze([f]) {
    setFile(f); setError(''); setCleaned(null); setMeta(null)
    try {
      const [all, exif, iptc, xmp, gps] = await Promise.all([
        exifr.parse(f, { translateValues: true, reviveValues: true }).catch(() => null),
        exifr.exif(f).catch(() => null),
        exifr.iptc(f).catch(() => null),
        exifr.xmp(f).catch(() => null),
        exifr.gps(f).catch(() => null),
      ])
      const buf = await f.arrayBuffer()
      setMeta({ all, exif, iptc, xmp, gps, buf })
    } catch (e) {
      setError('Could not parse this file: ' + e.message)
    }
  }

  function sanitizeFile() {
    if (!meta?.buf) return
    const res = scrub(meta.buf)
    if (!res) { setError('Scrub supports JPEG & PNG pixel-losslessly. Other formats would require re-encoding, which is blocked by the Zero Compression policy.'); return }
    const ext = res.type === 'jpeg' ? 'jpg' : 'png'
    download(res.blob, `${baseName(file.name)}-clean.${ext}`)
    setCleaned({ before: file.size, after: res.blob.size })
    recentAction(`Scrubbed metadata from ${file.name}`)
  }

  const tabs = [['all', 'All'], ['exif', 'EXIF'], ['iptc', 'IPTC'], ['xmp', 'XMP'], ['gps', 'GPS & Map'], ['hex', 'Raw Hex']]

  return (
    <div className="space-y-5">
      {!file ? (
        <Dropzone onFiles={analyze} accept="image/*,.heic,.tif,.tiff" label="Drop a photo or file" sub="JPEG · PNG · HEIC · TIFF — parsed 100% locally, never uploaded" />
      ) : (
        <>
          <div className="card p-5 flex flex-wrap items-center gap-4">
            <div className="text-3xl">🖼️</div>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{file.name}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{fmtBytes(file.size)} · {extName(file.name).toUpperCase()}</div>
            </div>
            <button className="btn" onClick={() => { setFile(null); setMeta(null) }}>New file</button>
            <button className="btn btn-primary" onClick={sanitizeFile} disabled={!meta}>🧼 Scrub & Sanitize</button>
          </div>

          {cleaned && <Note tone="ok">Sanitized copy downloaded — {fmtBytes(cleaned.before)} → {fmtBytes(cleaned.after)}. Pixel data untouched (lossless segment/chunk removal).</Note>}
          {error && <Note tone="warn">{error}</Note>}

          {meta && (
            <>
              <div className="flex gap-2 flex-wrap">
                {tabs.map(([id, l]) => <button key={id} className="chip" data-on={tab === id} onClick={() => setTab(id)}>{l}</button>)}
              </div>
              {tab === 'gps' && meta.gps?.latitude != null ? (
                <div className="space-y-3">
                  <div className="card p-4 text-sm mono">📍 lat {meta.gps.latitude.toFixed(6)}, lon {meta.gps.longitude.toFixed(6)}</div>
                  <div className="card overflow-hidden">
                    <iframe
                      title="GPS location"
                      className="w-full h-80"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${meta.gps.longitude - 0.01}%2C${meta.gps.latitude - 0.006}%2C${meta.gps.longitude + 0.01}%2C${meta.gps.latitude + 0.006}&layer=mapnik&marker=${meta.gps.latitude}%2C${meta.gps.longitude}`}
                    />
                  </div>
                </div>
              ) : tab === 'gps' ? <Note>No GPS coordinates embedded in this file.</Note>
                : tab === 'hex' ? <HexView buf={meta.buf} />
                : <Table data={meta[tab] || meta.all || {}} />}
            </>
          )}
        </>
      )}
    </div>
  )
}

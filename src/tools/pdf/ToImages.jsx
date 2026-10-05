import React, { useState } from 'react'
import { Panel, Label, Seg, Btn, Range, Field, Bar, Empty } from '../kit/ui.jsx'
import { DocSelect, Thumb } from './shared.jsx'
import { parseRanges, rangeToIdx, renderCanvas, zipFiles, MAX_ARCHIVE_ENTRIES, MAX_PDF_BATCH_PIXELS } from '../../lib/pdf/engine.js'

export default function ToImages({ docs, active, setActive, publish, toast }) {
  const doc = docs.find((d) => d.id === active) || docs[0]
  const [fmt, setFmt] = useState('png'), [scale, setScale] = useState(2), [txt, setTxt] = useState(''), [busy, setBusy] = useState(0)
  if (!doc) return <Panel><Empty icon="image" title="Add a PDF first" sub="Every page can be exported as a PNG, JPG or WebP picture." /></Panel>
  const run = async () => {
    if (busy) return
    let idx = Array.from({ length: doc.pages }, (_, i) => i)
    if (txt.trim()) { const r = parseRanges(txt, doc.pages); if (r.error) return toast(r.error, 'err'); idx = rangeToIdx(r.ranges) }
    if (idx.length > MAX_ARCHIVE_ENTRIES) return toast(`Export no more than ${MAX_ARCHIVE_ENTRIES.toLocaleString()} pages at once.`, 'err')
    setBusy(0.02)
    try {
      const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[fmt], base = doc.name.replace(/\.pdf$/i, '').slice(0, 100), files = []
      let totalPixels = 0
      for (let k = 0; k < idx.length; k++) {
        const c = await renderCanvas(doc, idx[k], { scale })
        try {
          totalPixels += c.width * c.height
          if (totalPixels > MAX_PDF_BATCH_PIXELS) throw new RangeError(`The selected pages exceed ${MAX_PDF_BATCH_PIXELS / 1_000_000} megapixels in total. Export fewer pages at a time.`)
          const blob = await new Promise((resolve, reject) => c.toBlob((b) => b ? resolve(b) : reject(new Error('Could not encode a rendered PDF page.')), mime, 0.98))
          const data = idx.length === 1 ? blob : new Uint8Array(await blob.arrayBuffer())
          files.push([`${base}_page_${String(idx[k] + 1).padStart(String(doc.pages).length, '0')}.${fmt}`, data])
        } finally { c.width = c.height = 0 }
        setBusy((k + 1) / idx.length)
      }
      if (files.length === 1) publish(files[0][1], files[0][0], `${fmt.toUpperCase()} · 1 page`)
      else publish(zipFiles(files), `${base}_images.zip`, `${files.length} ${fmt.toUpperCase()} images`)
    } catch (e) { toast(e.message || 'Failed', 'err') } finally { setBusy(0) }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      <Panel>
        <Label>Pages</Label>
        <div className="space-y-4">
          <DocSelect docs={docs} value={doc.id} onChange={setActive} />
          <Field label={`Which pages? ${doc.pages} total — leave empty for all`}><input className="input" maxLength={20_000} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="e.g. 1-3, 7" /></Field>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">{Array.from({ length: Math.min(doc.pages, 6) }, (_, i) => <Thumb key={i} doc={doc} idx={i} w={160} />)}</div>
        </div>
      </Panel>
      <Panel delay={0.08}>
        <Label>Output</Label>
        <div className="space-y-5">
          <Seg value={fmt} onChange={setFmt} options={[['png', 'PNG · lossless'], ['jpg', 'JPG'], ['webp', 'WebP']]} />
          <Range label="Resolution" min={1} max={4} step={0.5} value={scale} onChange={setScale} fmt={(v) => `${v}× · ${Math.round(72 * v)} dpi`} />
          {busy > 0 && <Bar value={busy * 100} label="Rendering pages" />}
          <Btn primary className="w-full" icon="image" busy={busy > 0} onClick={run}>Export images</Btn>
        </div>
      </Panel>
    </div>
  )
}

// Tool 13 — PDF Studio. Organise pages across documents, then merge, split or re-save them.
// Thumbnails come from pdf.js, surgery from pdf-lib; both run locally.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { recentAction, download, fmtBytes, baseName } from '../lib/utils.js'
import { loadPdf, buildPdf, renderPage, splitGroups, parseRanges, paperName, imagesToPdf } from '../lib/pdf/ops.js'
import { Ico, Btn, Chips, Slider, Toggle, Panel, Label, Seg, Drop, Stat, Toast, useToast, SPRING } from './kit.jsx'

let uid = 0
const nextId = () => `d${++uid}`

export default function PdfStudio() {
  const [docs, setDocs] = useState([])
  const [refs, setRefs] = useState([])
  const [sel, setSel] = useState(() => new Set())
  const [thumbs, setThumbs] = useState({})
  const [tab, setTab] = useState('pages')
  const [busy, setBusy] = useState('')
  const [strip, setStrip] = useState(true)
  const [splitMode, setSplitMode] = useState('each')
  const [splitSize, setSplitSize] = useState(2)
  const [rangeText, setRangeText] = useState('')
  const [outName, setOutName] = useState('')
  const [progress, setProgress] = useState(0)
  const [msg, toast] = useToast()
  const pickerRef = useRef(null)
  const renderQ = useRef([])

  const addFiles = useCallback(async (files) => {
    const pdfs = files.filter((f) => /pdf$/i.test(f.name) || f.type === 'application/pdf')
    const imgs = files.filter((f) => /^image\//.test(f.type))
    if (imgs.length) {
      setBusy('images → PDF')
      try {
        const bytes = await imagesToPdf(imgs)
        await download(new Blob([bytes], { type: 'application/pdf' }), `${baseName(imgs[0].name)}${imgs.length > 1 ? `-${imgs.length}-pages` : ''}.pdf`)
        recentAction(`Built a PDF from ${imgs.length} image${imgs.length > 1 ? 's' : ''}`)
        toast(`${imgs.length} image${imgs.length > 1 ? 's' : ''} → one PDF`)
      } catch (e) { toast(`Image PDF failed: ${e.message}`, 'err') }
      setBusy('')
    }
    if (!pdfs.length) {
      if (!imgs.length) toast('PDFs (or images) only, please', 'err')
      return
    }
    setBusy('opening')
    const added = []
    for (const f of pdfs) {
      try {
        const d = await loadPdf(f)
        // keep the parsed PDFDocument: buildPdf copies pages straight out of it
        const doc = { id: nextId(), name: f.name, bytes: d.bytes, sizes: d.sizes, pages: d.pages, doc: d.doc }
        added.push(doc)
        setDocs((prev) => [...prev, doc])
        setRefs((prev) => [...prev, ...d.sizes.map((s, i) => ({ key: `${doc.id}:${i}`, docId: doc.id, index: i, rotate: 0, width: s.width, height: s.height, docName: f.name }))])
      } catch (e) { toast(`${f.name}: ${e.message}`, 'err') }
    }
    if (added.length) {
      recentAction(`Loaded ${added.length} PDF${added.length > 1 ? 's' : ''} into the PDF Studio`)
      toast(`${added.length} document${added.length > 1 ? 's' : ''} · ${added.reduce((n, d) => n + d.pages, 0)} pages`)
      renderQ.current.push(...added.map((d) => d.id))
    }
    setBusy('')
  }, [toast])

  /* thumbnails, rendered one page at a time so a big document never locks the UI */
  useEffect(() => {
    let stop = false
    const pump = async () => {
      while (!stop && renderQ.current.length) {
        const id = renderQ.current[0]
        const doc = docs.find((d) => d.id === id)
        if (!doc) { renderQ.current.shift(); continue }
        const missing = doc.sizes.map((_, i) => i).filter((i) => thumbs[`${id}:${i}`] === undefined)
        if (!missing.length || missing.length > 120) { renderQ.current.shift(); continue }
        const i = missing[0]
        try {
          const canvas = await renderPage(doc.bytes, i, { scale: 0.34, max: 260 })
          const url = canvas.toDataURL('image/jpeg', 0.72)
          if (stop) return
          setThumbs((t) => ({ ...t, [`${id}:${i}`]: url }))
        } catch { setThumbs((t) => ({ ...t, [`${id}:${i}`]: null })) }
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    pump()
    return () => { stop = true }
  }, [docs, thumbs])

  useEffect(() => {
    if (!docs.length) return
    setOutName((n) => n || `${baseName(docs[0].name)}-edited.pdf`)
  }, [docs])

  const pageCount = refs.length
  const selRefs = useMemo(() => refs.filter((r) => sel.has(r.key)), [refs, sel])
  const docInfo = useMemo(() => docs.length ? { name: docs[0].name, size: docs[0].bytes.length } : null, [docs])

  const toggle = (key) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const paint = (mode) => {
    if (!sel.size) return toast('Select some pages first', 'err')
    setRefs((prev) => prev.filter((r) => (mode === 'keep' ? sel.has(r.key) : !sel.has(r.key))))
    if (mode !== 'keep') setSel(new Set())
  }
  const rotate = (deg) => {
    if (!sel.size) return toast('Select some pages first', 'err')
    setRefs((prev) => prev.map((r) => (sel.has(r.key) ? { ...r, rotate: (((r.rotate + deg) % 360) + 360) % 360 } : r)))
  }
  const duplicate = () => {
    if (!sel.size) return toast('Select some pages first', 'err')
    setRefs((prev) => { const out = []; for (const r of prev) { out.push(r); if (sel.has(r.key)) out.push({ ...r, key: `${r.key}~${Math.random().toString(36).slice(2, 7)}` }) } return out })
    setSel(new Set())
  }
  const nudge = (dir) => {
    if (!sel.size) return toast('Select some pages first', 'err')
    setRefs((prev) => {
      const out = [...prev]
      const idx = out.map((r, i) => (sel.has(r.key) ? i : -1)).filter((i) => i >= 0)
      const move = dir < 0 ? idx : [...idx].reverse()
      for (const i of move) {
        const j = i + dir
        if (j < 0 || j >= out.length || sel.has(out[j].key)) continue
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    })
  }
  const sortKey = () => setRefs((prev) => [...prev].sort((a, b) => a.height - b.height || a.width - b.width))

  const save = async (subset = refs, name = outName) => {
    if (!subset.length) return toast('Nothing to save', 'err')
    setBusy('writing PDF')
    try {
      const bytes = await buildPdf(docs, subset, { strip })
      await download(new Blob([bytes], { type: 'application/pdf' }), name)
      recentAction(`Saved ${subset.length} page${subset.length > 1 ? 's' : ''} as ${name}`)
      toast(`${name} · ${subset.length} pages · ${fmtBytes(bytes.length)}`)
    } catch (e) { toast(`Save failed: ${e.message}`, 'err') }
    setBusy('')
  }

  const split = async () => {
    const groups = splitMode === 'ranges'
      ? parseRanges(rangeText, pageCount).map((p) => [p, p])
      : splitGroups(pageCount, splitMode, splitSize)
    if (!groups.length) return toast('Nothing to split', 'err')
    if (splitMode === 'ranges' && !parseRanges(rangeText, pageCount).length) return toast('Write page numbers like 1-3, 5, 8', 'err')
    setBusy('splitting')
    try {
      const parts = []
      for (const [a, b] of groups) {
        const slice = refs.slice(a - 1, b)
        parts.push({ name: `${baseName(outName)}-p${a}${b > a ? `-${b}` : ''}.pdf`, data: await buildPdf(docs, slice, { strip }) })
      }
      if (parts.length === 1) await download(new Blob([parts[0].data], { type: 'application/pdf' }), parts[0].name)
      else {
        const { makeZip } = await import('../lib/zip.js')
        setProgress(20)
        const zip = await makeZip(parts.map((p) => ({ name: p.name, data: p.data })), { onProgress: setProgress })
        await download(zip, `${baseName(outName)}-split.zip`)
      }
      recentAction(`Split a PDF into ${parts.length} file${parts.length > 1 ? 's' : ''}`)
      toast(`${parts.length} file${parts.length > 1 ? 's' : ''}${parts.length > 1 ? ' in a zip' : ''}`)
    } catch (e) { toast(`Split failed: ${e.message}`, 'err') }
    setProgress(0); setBusy('')
  }

  const reset = () => { setDocs([]); setRefs([]); setSel(new Set()); setThumbs({}); setOutName(''); renderQ.current = [] }

  return (
    <div className="space-y-6">
      <input ref={pickerRef} type="file" hidden multiple accept="application/pdf,image/*" onChange={(e) => { addFiles([...e.target.files]); e.target.value = '' }} />
      {!docs.length ? (
        <Panel className="overflow-hidden">
          <Drop onFiles={addFiles} multiple accept="application/pdf,image/*" label="Drop PDFs — or photos to make one" sub="Several documents can be merged · images become A4 pages" />
          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            {[['pack', 'Organise', 'Drag pages, rotate, delete, duplicate, extract.'], ['split', 'Merge & split', 'Every N pages, halves, or your own ranges.'], ['lock', 'Stay local', 'Pages never leave this device — pdf-lib does the work.']].map(([ic, t, d], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.08 * i }} className="rounded-2xl border border-line p-4" style={{ background: 'var(--surface)' }}>
                <div className="w-9 h-9 rounded-xl grid place-items-center mb-2" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n={ic} s={18} /></div>
                <div className="font-bold text-[13px]">{t}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{d}</div>
              </motion.div>
            ))}
          </div>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Seg value={tab} onChange={setTab} options={[['pages', 'Pages'], ['split', 'Split'], ['save', 'Save'], ['info', 'Info']]} />
            <div className="ml-auto flex items-center gap-2 text-[12px]" style={{ color: 'var(--muted)' }}>
              <Ico n="file" s={14} /> {docs.length} document{docs.length > 1 ? 's' : ''} · {pageCount} page{pageCount !== 1 ? 's' : ''}
              <Btn small icon="plus" onClick={() => pickerRef.current?.click()}>Add</Btn>
              <Btn small icon="refresh" onClick={reset} title="Start over" />
            </div>
          </div>

          <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
            <Panel>
              <Label right={<span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{sel.size ? `${sel.size} selected` : 'click pages to select'}</span>}>Pages</Label>
              <div className="flex flex-wrap items-center gap-1.5 mb-4">
                <Btn small icon="rotl" onClick={() => rotate(-90)} title="Rotate left">−90°</Btn>
                <Btn small icon="rotate" onClick={() => rotate(90)} title="Rotate right">+90°</Btn>
                <Btn small icon="arrowl" onClick={() => nudge(-1)} title="Move earlier" />
                <Btn small icon="arrowr" onClick={() => nudge(1)} title="Move later" />
                <Btn small icon="copy" onClick={duplicate} title="Duplicate">Duplicate</Btn>
                <Btn small icon="trash" onClick={() => paint('remove')} title="Remove from the new PDF">Remove</Btn>
                <Btn small icon="check" onClick={() => setSel(sel.size === pageCount ? new Set() : new Set(refs.map((r) => r.key)))}>{sel.size === pageCount ? 'Clear' : 'All'}</Btn>
                <span className="mx-1 h-5 w-px" style={{ background: 'var(--border)' }} />
                <Btn small icon="sort" onClick={sortKey} title="Sort by size">Sort</Btn>
                <Btn small icon="scan" onClick={() => { setSel(new Set()); setRefs((prev) => [...prev].reverse()) }} title="Reverse the whole document">Reverse</Btn>
                <Btn small icon="download" onClick={() => paint('keep')} title="Keep only the selected pages">Keep only</Btn>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[62vh] overflow-auto pr-1">
                <AnimatePresence initial={false}>
                  {refs.map((r, i) => {
                    const on = sel.has(r.key)
                    const url = thumbs[`${r.docId}:${r.index}`]
                    return (
                      <motion.button key={r.key} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SPRING}
                        onClick={(e) => { if (e.shiftKey && sel.size) { const last = Math.max(...refs.map((x, ix) => (sel.has(x.key) ? ix : -1))); const [a, b] = [Math.min(last, i), Math.max(last, i)]; setSel((s) => new Set([...s, ...refs.slice(a, b + 1).map((x) => x.key)])) } else toggle(r.key) }}
                        className="relative rounded-xl overflow-hidden border-2 text-left group" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: 'var(--surface2)', boxShadow: on ? '0 10px 24px -12px var(--copper)' : 'var(--shadow)' }}>
                        <div className="h-[124px] grid place-items-center overflow-hidden">
                          {url ? <img src={url} alt={`Page ${i + 1}`} className="max-h-[124px] w-auto" style={{ transform: `rotate(${r.rotate}deg)` }} /> : <div className="text-[11px]" style={{ color: 'var(--muted)' }}>rendering…</div>}
                        </div>
                        <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-bold" style={{ background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--bg)' : 'var(--ink)' }}>
                          <span>{i + 1}</span>
                          <span className="flex items-center gap-1.5" style={{ color: on ? 'var(--bg)' : 'var(--muted)' }}>
                            {r.rotate ? <span className="mono">{r.rotate}°</span> : null}
                            <span className="mono opacity-70">{paperName(r.width, r.height).split(' ')[0]}</span>
                          </span>
                        </div>
                        <motion.span className="absolute top-2 right-2 w-5 h-5 rounded-full grid place-items-center" initial={false} animate={{ scale: on ? 1 : 0.4, opacity: on ? 1 : 0 }} style={{ background: 'var(--copper)', color: '#fff' }}><Ico n="check" s={12} w={3} /></motion.span>
                      </motion.button>
                    )
                  })}
                </AnimatePresence>
              </div>
              {!refs.length && <div className="text-[13px] text-center py-8" style={{ color: 'var(--muted)' }}>All pages removed — add a document again.</div>}
            </Panel>

            <div className="space-y-4">
              {tab === 'pages' && (
                <Panel delay={0.04}>
                  <Label>Your document</Label>
                  <div className="space-y-3">
                    <label className="block"><span className="label mb-1.5 block">File name</span>
                      <input className="input" value={outName} onChange={(e) => setOutName(e.target.value)} />
                    </label>
                    <Toggle on={strip} onChange={setStrip} label="Strip metadata" hint="Drops title, author, producer & dates from the copy." />
                    <Btn primary icon="download" className="w-full" disabled={!!busy} busy={busy === 'writing PDF'} onClick={() => save()}>{busy === 'writing PDF' ? 'Writing…' : 'Save PDF'}</Btn>
                    <div className="grid grid-cols-2 gap-2">
                      <Stat k="Pages" v={pageCount} />
                      <Stat k="Size" v={docInfo ? fmtBytes(docInfo.size) : '—'} />
                    </div>
                  </div>
                </Panel>
              )}

              {tab === 'split' && (
                <Panel delay={0.04}>
                  <Label>Split</Label>
                  <Chips value={splitMode} onChange={setSplitMode} options={[['each', 'Every page'], ['chunks', 'Every N'], ['halves', 'Two halves'], ['ranges', 'My ranges']]} />
                  {splitMode === 'chunks' && <div className="mt-4"><Slider label="Pages per file" min={1} max={Math.max(2, Math.min(50, pageCount))} step={1} value={splitSize} onChange={setSplitSize} fmt={(v) => `${v}`} /></div>}
                  {splitMode === 'ranges' && (
                    <label className="block mt-4"><span className="label mb-1.5 block">Ranges (each becomes one file)</span>
                      <input className="input" placeholder="1-3, 5, 8-10" value={rangeText} onChange={(e) => setRangeText(e.target.value)} />
                    </label>
                  )}
                  <div className="text-[12px] mt-3" style={{ color: 'var(--muted)' }}>
                    {splitMode === 'each' ? `${pageCount} files, one per page — bundled into a zip.`
                      : splitMode === 'chunks' ? `${Math.ceil(pageCount / Math.max(1, splitSize))} files.`
                      : splitMode === 'halves' ? 'Two files, split down the middle.'
                      : `${parseRanges(rangeText, pageCount).length} page${parseRanges(rangeText, pageCount).length === 1 ? '' : 's'} picked.`}
                  </div>
                  <Btn primary icon="split" className="w-full mt-4" disabled={!!busy} busy={busy === 'splitting'} onClick={split}>{busy === 'splitting' ? 'Splitting…' : 'Split & save'}</Btn>
                  {progress > 0 && <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div style={{ background: 'var(--copper)' }} animate={{ width: `${progress}%` }} /></div>}
                </Panel>
              )}

              {tab === 'save' && (
                <Panel delay={0.04}>
                  <Label>Export</Label>
                  <div className="space-y-2.5">
                    <Btn className="w-full" icon="check" onClick={() => save(selRefs.length ? selRefs : refs, `${baseName(outName)}-selection.pdf`)}>Save selection ({selRefs.length || pageCount})</Btn>
                    <Btn className="w-full" icon="plus" onClick={() => save(refs.filter((r) => !sel.has(r.key)), `${baseName(outName)}-without-selection.pdf`)} disabled={!sel.size}>Save the rest</Btn>
                  </div>
                  <div className="text-[12px] mt-3" style={{ color: 'var(--muted)' }}>Tip: “Keep only” in the toolbar does the same in place, so you can keep editing before saving.</div>
                </Panel>
              )}

              {tab === 'info' && (
                <Panel delay={0.04}>
                  <Label>Documents</Label>
                  <div className="space-y-2">
                    {docs.map((d) => (
                      <div key={d.id} className="rounded-2xl border border-line p-3" style={{ background: 'var(--surface)' }}>
                        <div className="font-bold text-[13px] truncate">{d.name}</div>
                        <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{d.pages} pages · {fmtBytes(d.bytes.length)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[12px] mt-3 leading-relaxed" style={{ color: 'var(--muted)' }}>
                    Merging is just saving: pages from every loaded document are in the grid, in the order you arrange them.
                  </div>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
      <Toast msg={msg} />
    </div>
  )
}

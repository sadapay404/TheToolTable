// Tool 14 — OCR Studio. Reads text out of photos and scanned PDFs with Tesseract running from
// public/ocr, so it works with the network cable pulled out.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { recentAction, download, fmtBytes, baseName, readFile } from '../lib/utils.js'
import { recognize, subscribe, preload, state as engineState, getWorker } from '../lib/ocr.js'
import { pdfPageCanvases } from '../lib/pdf/ops.js'
import { Ico, Btn, Chips, Panel, Label, Slider, Drop, Stat, Toast, useToast, SPRING, CopyBtn } from './kit.jsx'

let uid = 0
const fmtText = (t) => String(t || '').trim()

export default function OcrStudio() {
  const [files, setFiles] = useState([])
  const [active, setActive] = useState(null)
  const [eng, setEng] = useState(engineState)
  const [busy, setBusy] = useState(false)
  const [showBoxes, setShowBoxes] = useState(false)
  const [threshold, setThreshold] = useState(72)
  const [msg, toast] = useToast()
  const pickerRef = useRef(null)
  const cancel = useRef(false)

  useEffect(() => subscribe(setEng), [])
  useEffect(() => { preload() }, [])

  const addFiles = useCallback(async (list) => {
    const next = []
    for (const f of list) {
      const pdf = /pdf$/i.test(f.name) || f.type === 'application/pdf'
      const img = /^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(f.name)
      if (!pdf && !img) { toast(`${f.name}: images and PDFs only`, 'err'); continue }
      const item = { id: `f${++uid}`, name: f.name, kind: pdf ? 'pdf' : 'image', blob: f, status: 'queued', progress: 0, result: null, error: '', preview: null, w: 0, h: 0, pages: 0 }
      if (img) {
        try {
          const bmp = await createImageBitmap(f)
          item.w = bmp.width; item.h = bmp.height
          item.preview = URL.createObjectURL(f)
          bmp.close?.()
        } catch { /* preview is a nicety */ }
      } else {
        try {
          const { loadPdf } = await import('../lib/pdf/ops.js')
          const d = await loadPdf(f)
          item.pages = d.pages
        } catch (e) { item.error = e.message }
      }
      next.push(item)
    }
    if (next.length) {
      setFiles((prev) => [...prev, ...next])
      setActive((a) => a ?? next[0].id)
      const pages = next.reduce((n, f) => n + (f.kind === 'pdf' ? Math.max(1, f.pages) : 1), 0)
      toast(`${next.length} file${next.length > 1 ? 's' : ''} · ${pages} page${pages > 1 ? 's' : ''} to read`)
    }
  }, [toast])

  const runOne = async (item) => {
    setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'running', progress: 0.02, error: '' } : f)))
    try {
      if (item.kind === 'image') {
        const res = await recognize(item.blob, { onProgress: (p) => setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, progress: 0.4 + p * 0.6 } : f))) })
        setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'done', progress: 1, result: { ...res, pages: [{ text: res.text, lines: res.lines, confidence: res.confidence }] } } : f)))
        return res
      }
      const bytes = new Uint8Array(await item.blob.arrayBuffer())
      const canvases = await pdfPageCanvases(bytes, { scale: 2, max: 2400 })
      const pages = []
      for (let i = 0; i < canvases.length; i++) {
        if (cancel.current) break
        setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, progress: (i / canvases.length) * 0.95 } : f)))
        const r = await recognize(canvases[i])
        pages.push({ text: r.text, lines: r.lines, confidence: r.confidence })
      }
      const all = pages.map((p) => p.text).join('\n\n')
      const conf = pages.length ? pages.reduce((n, p) => n + p.confidence, 0) / pages.length : 0
      setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'done', progress: 1, result: { text: all, lines: pages.flatMap((p) => p.lines), confidence: conf, pages, ms: 0 } } : f)))
      return { text: all }
    } catch (e) {
      setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'error', error: String(e?.message || e), progress: 1 } : f)))
      throw e
    }
  }

  const runAll = async () => {
    const queue = files.filter((f) => f.status !== 'done')
    if (!queue.length) return toast('Everything has been read already')
    setBusy(true); cancel.current = false
    let done = 0
    for (const f of queue) {
      if (cancel.current) break
      try { await runOne(f); done++ } catch { /* the row shows the error */ }
    }
    setBusy(false)
    if (done) { recentAction(`OCR'd ${done} file${done > 1 ? 's' : ''} offline`); toast(`${done} file${done > 1 ? 's' : ''} read`) }
  }

  const current = files.find((f) => f.id === active) || null
  const text = useMemo(() => (current?.result ? fmtText(current.result.text) : ''), [current])
  const allText = useMemo(() => files.filter((f) => f.result).map((f) => (files.length > 1 ? `===== ${f.name} =====\n${f.result.text}` : f.result.text)).join('\n\n'), [files])

  const saveText = async () => {
    if (!allText) return toast('Nothing to save yet', 'err')
    await download(new Blob([allText], { type: 'text/plain' }), `${baseName(files[0].name)}-text.txt`)
    recentAction('Saved recognised text')
  }
  const saveJson = async () => {
    const out = { files: files.filter((f) => f.result).map((f) => ({ name: f.name, confidence: f.result.confidence, text: f.result.text })) }
    await download(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), 'ocr.json')
  }

  const remove = (id) => { setFiles((p) => p.filter((f) => f.id !== id)); setActive((a) => (a === id ? files.find((f) => f.id !== id)?.id ?? null : a)) }

  return (
    <div className="space-y-6">
      <input ref={pickerRef} type="file" hidden multiple accept="image/*,application/pdf" onChange={(e) => { addFiles([...e.target.files]); e.target.value = '' }} />
      {!files.length ? (
        <Panel className="overflow-hidden">
          <Drop onFiles={addFiles} multiple accept="image/*,application/pdf" label="Drop photos, screenshots or scanned PDFs" sub="English runs offline · nothing is uploaded, ever" />
          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            {[['scan', 'Line-accurate', 'Per-line confidence, so you can see exactly what to proofread.'],
              ['lock', 'Fully offline', `${(14.1).toFixed(1)} MB of engine, core and English data ship with the app.`],
              ['docx', 'Scanned PDFs too', 'Pages are rasterised locally, then read page by page.']].map(([ic, t, d], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.08 * i }} className="rounded-2xl border border-line p-4" style={{ background: 'var(--surface)' }}>
                <div className="w-9 h-9 rounded-xl grid place-items-center mb-2" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n={ic} s={18} /></div>
                <div className="font-bold text-[13px]">{t}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{d}</div>
              </motion.div>
            ))}
          </div>
        </Panel>
      ) : (
        <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)] items-start">
          <div className="space-y-4">
            <Panel pad={false}>
              <div className="p-4 border-b border-line flex items-center gap-2">
                <Btn primary small icon="scan" disabled={busy} busy={busy} onClick={runAll}>{busy ? 'Reading…' : 'Read text'}</Btn>
                <Btn small icon="plus" onClick={() => pickerRef.current?.click()}>Add</Btn>
                <Btn small icon="refresh" onClick={() => setFiles([])} title="Clear the list" />
              </div>
              <div className="p-3 space-y-2 max-h-[46vh] overflow-auto">
                <AnimatePresence initial={false}>
                  {files.map((f) => {
                    const on = f.id === active
                    return (
                      <motion.div key={f.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING}
                        onClick={() => setActive(f.id)} className="rounded-2xl border px-3 py-2.5 cursor-pointer flex items-center gap-3" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: 'var(--surface)' }}>
                        <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 overflow-hidden" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}>
                          {f.preview ? <img src={f.preview} alt="" className="w-full h-full object-cover" /> : <Ico n={f.kind === 'pdf' ? 'pdf' : 'image'} s={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-bold truncate">{f.name}</div>
                          <div className="text-[11px] flex items-center gap-1.5" style={{ color: f.status === 'error' ? '#C3423F' : 'var(--muted)' }}>
                            {f.status === 'queued' && `${f.kind === 'pdf' ? `${f.pages} pages` : `${f.w}×${f.h}`} · waiting`}
                            {f.status === 'running' && <>{eng.phase || 'reading'} · {Math.round(f.progress * 100)}%</>}
                            {f.status === 'done' && `${Math.round(f.result.confidence)}% confident · ${f.result.text.split(/\s+/).filter(Boolean).length} words`}
                            {f.status === 'error' && f.error.slice(0, 60)}
                          </div>
                          {f.status === 'running' && <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div style={{ background: 'var(--copper)' }} animate={{ width: `${Math.round(f.progress * 100)}%` }} /></div>}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); remove(f.id) }} className="opacity-50 hover:opacity-100 shrink-0" title="Remove"><Ico n="x" s={14} /></button>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </Panel>

            <Panel>
              <Label>Engine</Label>
              <div className="text-[12.5px] space-y-1.5" style={{ color: 'var(--muted)' }}>
                <div className="flex items-center gap-2"><Ico n={eng.ready ? 'check' : 'gear'} s={14} /><span>{eng.ready ? 'Engine warm — reads instantly' : eng.error ? `Failed: ${eng.error.slice(0, 80)}` : eng.phase || 'Standing by'}</span></div>
                <div>English (bundled, LSTM). More packs: drop <span className="mono">xxx.traineddata.gz</span> into <span className="mono">public/ocr/</span>.</div>
              </div>
              {!eng.ready && !eng.error && <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div style={{ background: 'var(--copper)' }} animate={{ width: `${Math.max(4, Math.round((eng.progress || 0) * 100))}%` }} /></div>}
            </Panel>

            <div className="grid grid-cols-2 gap-3">
              <Stat k="Files" v={files.length} />
              <Stat k="Done" v={files.filter((f) => f.status === 'done').length} />
            </div>
            <Btn className="w-full" icon="download" onClick={saveText} disabled={!allText}>Save all text</Btn>
            <Btn className="w-full" icon="code" onClick={saveJson} disabled={!allText}>Save as JSON</Btn>
          </div>

          <div className="space-y-4">
            {current?.preview && current.result && (
              <Panel>
                <Label right={<Chips value={showBoxes ? 'boxes' : 'text'} onChange={(v) => setShowBoxes(v === 'boxes')} options={[['text', 'Text'], ['boxes', 'Show lines']]} />}>Preview</Label>
                {showBoxes ? (
                  <div className="relative rounded-2xl overflow-hidden border border-line" style={{ background: '#fff' }}>
                    <img src={current.preview} alt="" className="w-full block" />
                    {(current.result.lines || []).filter((l) => !l.flat).map((l, i) => {
                      const low = l.confidence < threshold
                      return <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.01, 0.4) }} title={`${Math.round(l.confidence)}% · ${l.text}`}
                        className="absolute" style={{ left: `${(l.x0 / (current.w || 1)) * 100}%`, top: `${(l.y0 / (current.h || 1)) * 100}%`, width: `${((l.x1 - l.x0) / (current.w || 1)) * 100}%`, height: `${((l.y1 - l.y0) / (current.h || 1)) * 100}%`, border: `1.5px solid ${low ? '#C3423F' : '#4E937A'}`, background: low ? 'rgba(195,66,63,.12)' : 'rgba(78,147,122,.10)', borderRadius: 3 }} />
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-line p-4 max-h-[46vh] overflow-auto text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ background: 'var(--surface2)' }}>{text || <span style={{ color: 'var(--muted)' }}>No text found on this page.</span>}</div>
                )}
                <div className="flex items-center gap-3 mt-4">
                  <div className="flex-1"><Slider label="Low-confidence highlight" min={0} max={100} step={1} value={threshold} onChange={setThreshold} fmt={(v) => `under ${v}%`} /></div>
                  <CopyBtn text={text} small />
                </div>
              </Panel>
            )}
            {current?.result && (
              <Panel delay={0.05}>
                <Label right={<span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{current.result.ms ? `${(current.result.ms / 1000).toFixed(1)} s` : ''}</span>}>Recognised text</Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Stat k="Confidence" v={`${Math.round(current.result.confidence)}%`} className="flex-1" />
                  <Stat k="Words" v={text.split(/\s+/).filter(Boolean).length} className="flex-1" />
                  <Stat k="Lines" v={(current.result.lines || []).length} className="flex-1" />
                </div>
                <textarea className="input w-full h-64 mono text-[12.5px] leading-relaxed" value={text} readOnly spellCheck={false} />
                {(current.result.pages?.length || 0) > 1 && (
                  <div className="text-[12px] mt-2" style={{ color: 'var(--muted)' }}>{current.result.pages.length} pages recognised — the box above holds them all, in order.</div>
                )}
              </Panel>
            )}
            {!current?.result && (
              <Panel>
                <div className="text-center py-10">
                  <motion.div animate={{ rotate: busy ? 360 : 0 }} transition={{ repeat: busy ? Infinity : 0, duration: 1.6, ease: 'linear' }} className="w-12 h-12 mx-auto mb-4 grid place-items-center rounded-2xl" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}>
                    <Ico n={current?.preview ? 'image' : 'scan'} s={22} />
                  </motion.div>
                  <div className="display font-semibold text-[16px]">{busy ? 'Reading…' : 'Ready when you are'}</div>
                  <div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>{busy ? eng.phase : 'Press “Read text” — the first run loads the engine once.'}</div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}
      <Toast msg={msg} />
    </div>
  )
}

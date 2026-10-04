import React, { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Drop, Dock, Swap, KIco, Btn, SPRING, fmtSize, useToast, uid } from './kit/ui.jsx'
import { ResultBar } from './pdf/shared.jsx'
import { loadDoc, fromBytes, forget } from '../lib/pdf/engine.js'
import { recentAction } from '../lib/utils.js'
import Organize from './pdf/Organize.jsx'
import Split from './pdf/Split.jsx'
import Images from './pdf/Images.jsx'
import ToImages from './pdf/ToImages.jsx'
import Stamp from './pdf/Stamp.jsx'
import Annotate from './pdf/Annotate.jsx'
import Info from './pdf/Info.jsx'

const MODES = [['organize', 'Organize & merge', 'layers'], ['split', 'Split', 'split'], ['images', 'Images → PDF', 'image'], ['toimg', 'PDF → Images', 'camera'], ['stamp', 'Watermark & numbers', 'stamp'], ['annotate', 'Sign & redact', 'sign'], ['info', 'Properties', 'info']]
const NEEDS_DOC = new Set(['organize', 'split', 'toimg', 'stamp', 'annotate', 'info'])

export default function PdfStudio() {
  const [mode, setMode] = useState('organize'), [docs, setDocs] = useState([]), [pages, setPages] = useState([]), [active, setActive] = useState(null), [result, setResult] = useState(null), [busy, setBusy] = useState(false)
  const [toast, toastNode] = useToast()
  const addDocs = useCallback((list) => {
    setDocs((d) => [...d, ...list]); setActive((a) => a || list[0]?.id)
    setPages((p) => [...p, ...list.flatMap((d) => Array.from({ length: d.pages }, (_, i) => ({ id: uid(), docId: d.id, src: i, rot: 0 })))])
  }, [])
  const onFiles = async (files) => {
    const pdfs = files.filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)), imgs = files.filter((f) => /^image\//.test(f.type))
    if (!pdfs.length) { if (imgs.length) { setMode('images'); toast('Drop images in the Images → PDF tab') } else toast('Only PDF files are supported here', 'err'); return }
    setBusy(true); const ok = []
    for (const f of pdfs) { try { ok.push(await loadDoc(f)) } catch (e) { toast(`${f.name}: ${e.message}`, 'err') } }
    setBusy(false); if (ok.length) { addDocs(ok); recentAction(`Opened ${ok.length} PDF${ok.length > 1 ? 's' : ''}`) }
  }
  const removeDoc = (id) => { forget(id); setDocs((d) => d.filter((x) => x.id !== id)); setPages((p) => p.filter((x) => x.docId !== id)); setActive((a) => (a === id ? null : a)) }
  const publish = useCallback((data, name, note, keep) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: /\.zip$/i.test(name) ? 'application/zip' : 'application/pdf' })
    setResult({ blob, name, note, keep: keep && /\.pdf$/i.test(name), k: Date.now() }); recentAction(`${name}`)
  }, [])
  const keep = async () => { if (!result) return; const d = await fromBytes(new Uint8Array(await result.blob.arrayBuffer()), result.name); setDocs([d]); setActive(d.id); setPages(Array.from({ length: d.pages }, (_, i) => ({ id: uid(), docId: d.id, src: i, rot: 0 }))); setResult(null); toast('Loaded as your working document') }
  const props = { docs, pages, setPages, active, setActive, publish, toast }
  const showTray = NEEDS_DOC.has(mode)
  return (
    <div className="space-y-6">
      <Dock value={mode} onChange={(m) => { setMode(m); setResult(null) }} items={MODES} cols={7} />
      <AnimatePresence initial={false}>
        {showTray && (
          <motion.div key="tray" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap items-stretch gap-3">
              <div className="flex-1 min-w-[260px]"><Drop compact accept="application/pdf,.pdf" title={busy ? 'Reading…' : docs.length ? 'Add more PDFs' : 'Drop PDFs here'} sub={docs.length ? 'Several files can be merged' : 'Everything stays on your device'} icon={docs.length ? 'plus' : 'upload'} onFiles={onFiles} /></div>
              <AnimatePresence initial={false}>{docs.map((d) => (
                <motion.div key={d.id} layout initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={SPRING} className="flex items-center gap-3 rounded-[20px] border border-line pl-3 pr-2 py-2" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
                  <span className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><KIco n="pdf" s={18} /></span>
                  <div className="min-w-0"><div className="text-[13px] font-semibold truncate max-w-[170px]">{d.name}</div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{d.pages} page{d.pages > 1 ? 's' : ''} · {fmtSize(d.size)}</div></div>
                  <button type="button" aria-label="Remove file" onClick={() => removeDoc(d.id)} className="w-7 h-7 rounded-full grid place-items-center" style={{ background: 'var(--surface2)' }}><KIco n="x" s={13} /></button>
                </motion.div>))}</AnimatePresence>
            </div>
          </motion.div>)}
      </AnimatePresence>
      <ResultBar result={result} onClose={() => setResult(null)} onKeep={keep} />
      <Swap k={mode}>
        {mode === 'organize' && <Organize {...props} />}
        {mode === 'split' && <Split {...props} />}
        {mode === 'images' && <Images publish={publish} toast={toast} />}
        {mode === 'toimg' && <ToImages {...props} />}
        {mode === 'stamp' && <Stamp {...props} />}
        {mode === 'annotate' && <Annotate {...props} />}
        {mode === 'info' && <Info {...props} />}
      </Swap>
      {toastNode}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PDFDocument } from 'pdf-lib'
import { Panel, Label, Seg, Btn, Drop, Chips, Range, Bar, KIco, SPRING, Stat2, CountText, uid, save, useToast, usePref } from './kit/ui.jsx'
import { LANGS, LOCAL_LANGS, MAX_SCAN_PAGES, MAX_SCAN_IMAGE_BYTES, MAX_SCAN_SIDE, MAX_SCAN_PIXELS, MAX_SCAN_TOTAL_PIXELS, fitScanSize, isScanImageFile, isValidQuad, toCanvas, rotateCanvas, rotateQuad, autoQuad, warp, applyFilter, FULL, recognize, stopOcr } from '../lib/ocr/engine.js'
import { loadDoc, renderCanvas } from '../lib/pdf/engine.js'
import { recentAction } from '../lib/utils.js'

const FILTERS = [['original', 'Original'], ['enhance', 'Enhanced'], ['gray', 'Grey'], ['bw', 'Black & white']]
const url = (c, q = 0.86) => c.toDataURL('image/jpeg', q)
const disposeCanvas = (c) => { if (c) { c.width = 0; c.height = 0 } }
const canvasBlob = (c, type, quality) => new Promise((resolve, reject) => { try { c.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode this page.')), type, quality) } catch (error) { reject(error) } })

function Handle({ p, i, onDrag }) {
  return <motion.span whileHover={{ scale: 1.25 }} whileTap={{ scale: 1.4 }} onPointerDown={(e) => { e.preventDefault(); onDrag(i, e) }} className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-[3px] bg-white cursor-grab" style={{ left: p[0] * 100 + '%', top: p[1] * 100 + '%', borderColor: 'var(--copper)', boxShadow: '0 3px 10px rgba(0,0,0,.35)', touchAction: 'none', zIndex: 3 }} />
}

function CameraBox({ onShot, onClose }) {
  const v = useRef(null), [err, setErr] = useState(''), [facing, setFacing] = useState('environment'), [n, setN] = useState(0), st = useRef(null)
  useEffect(() => {
    let dead = false; (async () => {
      try { setErr(''); st.current?.getTracks().forEach((t) => t.stop()); if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported here.'); const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } }); if (dead) return s.getTracks().forEach((t) => t.stop()); st.current = s; if (!v.current) return s.getTracks().forEach((t) => t.stop()); v.current.srcObject = s; await v.current.play() } catch (e) { setErr(e?.name === 'NotAllowedError' ? 'Camera permission was blocked.' : 'No camera is available on this device.') }
    })()
    return () => { dead = true; st.current?.getTracks().forEach((t) => t.stop()) }
  }, [facing])
  const shoot = () => { if (!v.current?.videoWidth) return; onShot(toCanvas(v.current)); setN((x) => x + 1) }
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-[24px] overflow-hidden relative" style={{ background: '#111', minHeight: 320 }}>
      {err ? <div className="p-10 text-center text-white text-[14px]">{err}</div> : <video ref={v} playsInline muted className="w-full block max-h-[520px] object-contain" />}
      <div className="absolute inset-x-0 bottom-0 p-4 flex items-center justify-center gap-4" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,.7))' }}>
        <Btn small onClick={onClose} icon="x">Done{n ? ` · ${n}` : ''}</Btn>
        <motion.button whileTap={{ scale: 0.85 }} type="button" aria-label="Capture" onClick={shoot} className="w-16 h-16 rounded-full border-4 border-white grid place-items-center"><span className="w-12 h-12 rounded-full bg-white" /></motion.button>
        <Btn small icon="refresh" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}>Flip</Btn>
      </div>
    </motion.div>
  )
}

export default function ScanOcr() {
  const [pages, setPages] = useState([]), [cur, setCur] = useState(0), [view, setView] = useState('crop'), [fx, setFx] = usePref('ocr', 'fx', { filter: 'enhance', bri: 0, con: 0 }), [lang, setLang] = usePref('ocr', 'lang', 'eng')
  const [cam, setCam] = useState(false), [busy, setBusy] = useState(''), [prog, setProg] = useState({ v: 0, s: '' }), [text, setText] = useState(''), [stats, setStats] = useState(null), [prev, setPrev] = useState(null)
  const [toast, toastNode] = useToast(), box = useRef(null), srcUrls = useRef(new Map()), pagesRef = useRef(pages), operation = useRef(false), mounted = useRef(true)
  const page = pages[cur]
  const srcUrl = (p) => { if (!srcUrls.current.has(p.id)) srcUrls.current.set(p.id, url(p.src)); return srcUrls.current.get(p.id) }
  const updatePages = useCallback((change) => {
    const next = typeof change === 'function' ? change(pagesRef.current) : change
    pagesRef.current = next; setPages(next); return next
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false; stopOcr()
      for (const p of pagesRef.current) disposeCanvas(p.src)
      pagesRef.current = []; srcUrls.current.clear()
    }
  }, [])

  const addCanvases = useCallback((cs, name = 'Page', full = false) => {
    const existing = pagesRef.current, maxPages = Math.max(0, MAX_SCAN_PAGES - existing.length)
    let usedPixels = existing.reduce((sum, p) => sum + p.src.width * p.src.height, 0), added = []
    try {
      for (const source of cs) {
        if (added.length >= maxPages || usedPixels >= MAX_SCAN_TOTAL_PIXELS) { disposeCanvas(source); continue }
        let canvas = source, remaining = MAX_SCAN_TOTAL_PIXELS - usedPixels
        if (canvas.width * canvas.height > remaining || canvas.width * canvas.height > MAX_SCAN_PIXELS) {
          if (remaining < 256) { disposeCanvas(canvas); continue }
          const size = fitScanSize(canvas.width, canvas.height, { maxSide: MAX_SCAN_SIDE, maxPixels: Math.min(MAX_SCAN_PIXELS, remaining) })
          const resized = toCanvas(canvas, Math.max(size.width, size.height), Math.min(MAX_SCAN_PIXELS, remaining))
          disposeCanvas(canvas); canvas = resized
        }
        usedPixels += canvas.width * canvas.height
        try { added.push({ id: uid(), src: canvas, quad: full ? FULL() : autoQuad(canvas), name: `${String(name || 'Page').slice(0, 80)} ${existing.length + added.length + 1}`, text: null }) }
        catch (error) { if (canvas !== source) disposeCanvas(canvas); throw error }
      }
    } catch (error) { for (const c of cs) disposeCanvas(c); for (const p of added) disposeCanvas(p.src); throw error }
    updatePages([...existing, ...added])
    if (added.length) { setCur(existing.length); setText(''); setStats(null); setPrev(null) }
    if (added.length < cs.length) toast(`The scanner is limited to ${MAX_SCAN_PAGES} pages and ${Math.round(MAX_SCAN_TOTAL_PIXELS / 1_000_000)} megapixels at a time.`, 'err')
    return added.length
  }, [toast, updatePages])

  const onFiles = async (files) => {
    if (operation.current) { toast('Wait for the current scan task to finish first.', 'err'); return }
    const selected = [...(files || [])].filter(Boolean)
    if (!selected.length) return
    operation.current = true; setBusy('Opening…'); setProg({ v: 0, s: 'Preparing pages' })
    try {
      for (const file of selected) {
        const remaining = MAX_SCAN_PAGES - pagesRef.current.length
        if (remaining <= 0) { toast(`The scanner is limited to ${MAX_SCAN_PAGES} pages at a time.`, 'err'); break }
        const isPdf = /\.pdf$/i.test(file.name || '') || /application\/pdf/i.test(file.type || '')
        if (isPdf) {
          const doc = await loadDoc(file), count = Math.min(doc.pages, remaining), baseName = String(file.name || 'PDF').replace(/\.pdf$/i, '')
          let addedCount = 0
          for (let i = 0; i < count; i++) {
            const used = pagesRef.current.reduce((sum, p) => sum + p.src.width * p.src.height, 0)
            if (used >= MAX_SCAN_TOTAL_PIXELS) break
            let rendered, canvas
            try {
              rendered = await renderCanvas(doc, i, { width: Math.min(MAX_SCAN_SIDE, 1_600) })
              canvas = toCanvas(rendered)
              addedCount += addCanvases([canvas], baseName, true)
            } finally { disposeCanvas(rendered) }
            if (mounted.current) setProg({ v: ((i + 1) / count) * 100, s: `Rendering page ${i + 1} of ${count}` })
            if (pagesRef.current.reduce((sum, p) => sum + p.src.width * p.src.height, 0) >= MAX_SCAN_TOTAL_PIXELS) break
          }
          if (doc.pages > addedCount) toast(`Added ${addedCount} page${addedCount === 1 ? '' : 's'}; the scanner is limited to ${MAX_SCAN_PAGES} pages and ${Math.round(MAX_SCAN_TOTAL_PIXELS / 1_000_000)} megapixels at a time.`, 'err')
        } else if (isScanImageFile(file)) {
          if (Number(file.size) > MAX_SCAN_IMAGE_BYTES) throw new RangeError('Images must be 50 MB or smaller.')
          if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot open images for scanning.')
          const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
          try { addCanvases([toCanvas(bitmap)], String(file.name || 'Image').replace(/\.[^.]+$/, '')) }
          finally { bitmap.close?.() }
        } else toast(`Skipped “${String(file.name || 'file').slice(0, 60)}” — choose an image or PDF.`, 'err')
      }
    } catch (error) { toast(error?.message || 'Could not open that file', 'err') }
    finally { operation.current = false; if (mounted.current) setBusy('') }
  }

  useEffect(() => {
    const handler = (event) => { const files = [...(event.clipboardData?.files || [])].filter(isScanImageFile); if (files.length) onFiles(files) }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [onFiles])

  const processed = useCallback((p) => {
    const warped = warp(p.src, p.quad)
    try { return applyFilter(warped, fx) } finally { disposeCanvas(warped) }
  }, [fx])
  useEffect(() => {
    if (!page || view !== 'clean') return
    let dead = false, output
    const timer = setTimeout(() => {
      try {
        output = processed(page)
        if (dead) return
        setPrev({ id: page.id, url: url(output, 0.9), w: output.width, h: output.height })
      } catch (error) { if (!dead) toast(error?.message || 'Could not prepare this page preview.', 'err') }
      finally { disposeCanvas(output) }
    }, 120)
    return () => { dead = true; clearTimeout(timer); disposeCanvas(output) }
  }, [page?.id, page?.quad, view, fx, processed, toast])

  const dragCorner = (i) => {
    if (!page || operation.current || !box.current) return
    const pageId = page.id
    const move = (event) => {
      const bounds = box.current?.getBoundingClientRect()
      if (!bounds?.width || !bounds?.height) return
      const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
      updatePages((rows) => rows.map((p) => {
        if (p.id !== pageId) return p
        const quad = p.quad.map((point, k) => k === i ? [x, y] : point)
        return isValidQuad(quad) ? { ...p, quad } : p
      }))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true }); window.addEventListener('pointercancel', up, { once: true })
  }
  const upd = (change) => updatePages((rows) => rows.map((p, i) => i === cur ? change(p) : p))
  const rotate = (dir) => {
    if (!page || operation.current) return
    const rotated = rotateCanvas(page.src, dir)
    srcUrls.current.delete(page.id); disposeCanvas(page.src)
    upd((p) => ({ ...p, src: rotated, quad: rotateQuad(p.quad, dir), ocr: null }))
    setPrev(null)
  }
  const remove = (index) => {
    if (operation.current) return
    const rows = pagesRef.current, removed = rows[index]
    if (!removed) return
    const next = rows.filter((_, i) => i !== index); updatePages(next)
    disposeCanvas(removed.src); srcUrls.current.delete(removed.id); setPrev((x) => x?.id === removed.id ? null : x)
    setCur((current) => current > index ? current - 1 : current === index ? Math.min(index, next.length - 1) : current)
  }

  const read = async () => {
    if (operation.current || !pagesRef.current.length) return
    operation.current = true; setBusy('ocr'); setProg({ v: 1, s: 'Starting the engine' }); setText(''); const snapshot = pagesRef.current.slice(), results = []
    try {
      for (let i = 0; i < snapshot.length; i++) {
        const current = snapshot[i], canvas = processed(current)
        let result
        try {
          result = await recognize(canvas, lang, (message) => {
            if (!mounted.current || !message.status) return
            const part = Number.isFinite(message.progress) ? message.progress : 0
            setProg({ v: ((i + part) / snapshot.length) * 100, s: `${message.status[0].toUpperCase() + message.status.slice(1)}${snapshot.length > 1 ? ` · page ${i + 1} of ${snapshot.length}` : ''}` })
          })
        } finally { disposeCanvas(canvas) }
        results.push(result)
        updatePages((rows) => rows.map((p) => p.id === current.id ? { ...p, ocr: result } : p))
      }
      const all = results.map((result, i) => (snapshot.length > 1 ? `— Page ${i + 1} —\n` : '') + result.text).join('\n\n'), words = results.reduce((sum, result) => sum + result.words, 0)
      setText(all); setStats({ words, chars: all.length, conf: results.length ? Math.round(results.reduce((sum, result) => sum + result.confidence, 0) / results.length) : 0 })
      recentAction(`Read ${snapshot.length} page${snapshot.length > 1 ? 's' : ''} with OCR`)
      if (!all.trim()) toast('No text found — try Enhanced or Black & white', 'err')
    } catch (error) { if (mounted.current) toast(String(error?.message || error).slice(0, 90) || 'OCR failed', 'err') }
    finally { operation.current = false; if (mounted.current) setBusy('') }
  }

  const searchable = async () => {
    if (operation.current) return
    const snapshot = pagesRef.current.filter((p) => p.ocr?.pdf)
    if (!snapshot.length) return toast('Read at least one page before making a searchable PDF.', 'err')
    operation.current = true; setBusy('Saving…')
    try {
      const out = await PDFDocument.create()
      for (const p of snapshot) { const doc = await PDFDocument.load(p.ocr.pdf); (await out.copyPages(doc, doc.getPageIndices())).forEach((copy) => out.addPage(copy)) }
      save(new Blob([await out.save()], { type: 'application/pdf' }), 'scan_searchable.pdf')
      toast('Searchable PDF saved')
    } catch (error) { toast(error?.message || 'Could not create a searchable PDF.', 'err') }
    finally { operation.current = false; if (mounted.current) setBusy('') }
  }

  const cleanPdf = async () => {
    if (operation.current || !pagesRef.current.length) return
    operation.current = true; setBusy('Saving…')
    try {
      const out = await PDFDocument.create(), snapshot = pagesRef.current.slice(), bw = fx.filter === 'bw'
      for (const p of snapshot) {
        const canvas = processed(p)
        try {
          const blob = await canvasBlob(canvas, bw ? 'image/png' : 'image/jpeg', 0.95)
          const bytes = new Uint8Array(await blob.arrayBuffer()), image = bw ? await out.embedPng(bytes) : await out.embedJpg(bytes), width = canvas.width * 0.75, height = canvas.height * 0.75
          out.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height })
        } finally { disposeCanvas(canvas) }
      }
      save(new Blob([await out.save()], { type: 'application/pdf' }), 'scan.pdf')
      toast('Clean scan PDF saved')
    } catch (error) { toast(error?.message || 'Could not create the scan PDF.', 'err') }
    finally { operation.current = false; if (mounted.current) setBusy('') }
  }

  const startOver = () => {
    if (operation.current) return
    for (const p of pagesRef.current) disposeCanvas(p.src)
    pagesRef.current = []; setPages([]); setCur(0); setText(''); setStats(null); setPrev(null); srcUrls.current.clear(); stopOcr()
  }
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Text copied') } catch { toast('Copy blocked by the browser', 'err') } }

  const isRtl = /[\u0600-\u06FF]/.test(text)
  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait" initial={false}>
        {!pages.length ? (
          <motion.div key="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <Drop onFiles={onFiles} accept="image/*,application/pdf" title={busy ? busy : 'Drop a photo, scan or PDF'} sub="Or paste a screenshot with Ctrl+V — everything is read on this device" icon="scan" />
              <div className="flex justify-center"><Btn icon="camera" onClick={() => setCam(true)}>Use the camera</Btn></div>
              <AnimatePresence>{cam && <CameraBox onShot={(c) => addCanvases([c], 'Photo')} onClose={() => setCam(false)} />}</AnimatePresence>
            </div>
            <Panel delay={0.08}>
              <Label>What it does</Label>
              <div className="space-y-3.5">
                {[['crop', 'Finds the paper and straightens it'], ['sliders', 'Cleans up shadows — colour, grey or crisp black & white'], ['lang', 'Reads English and Urdu with no internet'], ['pdf', 'Makes a searchable PDF, or plain text to copy']].map(([ic, t], i) => (
                  <motion.div key={t} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.15 + i * 0.07 }} className="flex items-center gap-3"><span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><KIco n={ic === 'crop' ? 'scan' : ic} s={18} /></span><span className="text-[13.5px] font-medium">{t}</span></motion.div>))}
              </div>
            </Panel>
          </motion.div>
        ) : (
          <motion.div key="work" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
            <div className="space-y-4">
              <Panel pad={false} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <Seg small className="w-[230px]" value={view} onChange={setView} options={[['crop', 'Crop'], ['clean', 'Result']]} />
                  <div className="flex items-center gap-1.5"><Btn small disabled={!!busy} icon="undo" onClick={() => rotate(-1)} title="Rotate left" /><Btn small disabled={!!busy} icon="rotate" onClick={() => rotate(1)} title="Rotate right" /><Btn small disabled={!!busy} icon="wand" onClick={() => upd((p) => ({ ...p, quad: autoQuad(p.src) }))}>Auto</Btn><Btn small disabled={!!busy} icon="crop" onClick={() => upd((p) => ({ ...p, quad: FULL() }))}>Full</Btn></div>
                </div>
                <div className="rounded-2xl overflow-hidden grid place-items-center select-none" style={{ background: 'var(--surface2)', minHeight: 320 }}>
                  <AnimatePresence mode="wait" initial={false}>
                    {view === 'crop' && page ? (
                      <motion.div key={'c' + page.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative" style={{ aspectRatio: page.src.width / page.src.height, maxHeight: 620, width: `min(100%, ${620 * (page.src.width / page.src.height)}px)` }}>
                        <div ref={box} className="absolute inset-0">
                          <img src={srcUrl(page)} alt="" className="absolute inset-0 w-full h-full" draggable={false} />
                          <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none"><defs><mask id="qmask"><rect width="1" height="1" fill="#fff" /><polygon points={page.quad.map((q) => q.join(',')).join(' ')} fill="#000" /></mask></defs><rect width="1" height="1" fill="rgba(0,0,0,.45)" mask="url(#qmask)" /><polygon points={page.quad.map((q) => q.join(',')).join(' ')} fill="none" stroke="var(--copper)" strokeWidth="0.004" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2.5 }} /></svg>
                          {page.quad.map((q, i) => <Handle key={i} p={q} i={i} onDrag={dragCorner} />)}
                        </div>
                      </motion.div>
                    ) : prev && prev.id === page?.id ? <motion.img key={'r' + prev.url.length} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} src={prev.url} alt="Result" className="max-w-full" style={{ maxHeight: 620 }} /> : <motion.div key="ld" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.1 }} className="py-24" style={{ color: 'var(--muted)' }}><KIco n="scan" s={34} /></motion.div>}
                  </AnimatePresence>
                </div>
                <div className="flex gap-2.5 mt-4 overflow-x-auto pb-1">
                  <AnimatePresence initial={false}>{pages.map((p, i) => (
                    <motion.button key={p.id} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={SPRING} type="button" onClick={() => setCur(i)} className="relative shrink-0 w-[72px] h-[92px] rounded-xl overflow-hidden border-2" style={{ borderColor: i === cur ? 'var(--copper)' : 'var(--border)' }}>
                      <img src={srcUrl(p)} alt="" className="w-full h-full object-cover" draggable={false} /><span className="absolute bottom-1 left-1 mono text-[10px] font-bold px-1.5 rounded bg-black/60 text-white">{i + 1}</span>
                      <span role="button" aria-label="Remove page" onClick={(e) => { e.stopPropagation(); remove(i) }} className="absolute top-1 right-1 w-5 h-5 rounded-full grid place-items-center bg-black/60 text-white"><KIco n="x" s={11} /></span>
                    </motion.button>))}</AnimatePresence>
                  <label className="shrink-0 w-[72px] h-[92px] rounded-xl border-2 border-dashed grid place-items-center cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--copper)', opacity: busy ? 0.5 : 1 }}><KIco n="plus" s={22} /><input type="file" hidden multiple disabled={!!busy} accept="image/*,application/pdf" onChange={(e) => { onFiles([...e.target.files]); e.target.value = '' }} /></label>
                  <button type="button" disabled={!!busy} onClick={() => setCam((c) => !c)} className="shrink-0 w-[72px] h-[92px] rounded-xl border-2 border-dashed grid place-items-center disabled:opacity-50" style={{ borderColor: 'var(--border)', color: 'var(--copper)' }} aria-label="Camera"><KIco n="camera" s={22} /></button>
                </div>
                <AnimatePresence>{cam && <div className="mt-4"><CameraBox onShot={(c) => addCanvases([c], 'Photo')} onClose={() => setCam(false)} /></div>}</AnimatePresence>
              </Panel>
              <AnimatePresence>
                {(text || stats) && (
                  <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Panel>
                      <Label right={<div className="flex gap-1.5"><Btn small icon="copy" onClick={copy}>Copy</Btn><Btn small icon="file" onClick={() => save(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'scan.txt')}>.txt</Btn></div>}>Text</Label>
                      {stats && <div className="grid grid-cols-3 gap-3 mb-4"><Stat2 i={0} k="Words" v={<CountText value={stats.words} format={(v) => Math.round(v)} />} /><Stat2 i={1} k="Characters" v={<CountText value={stats.chars} format={(v) => Math.round(v)} />} /><Stat2 i={2} k="Confidence" v={<CountText value={stats.conf} format={(v) => Math.round(v) + '%'} />} /></div>}
                      <textarea aria-label="Recognised text" className="input w-full" rows={12} dir={isRtl ? 'rtl' : 'auto'} value={text} onChange={(e) => setText(e.target.value)} style={{ fontSize: isRtl ? 18 : 14, lineHeight: 1.7 }} />
                    </Panel>
                  </motion.div>)}
              </AnimatePresence>
            </div>
            <div className="space-y-5 lg:sticky lg:top-4">
              <Panel delay={0.05}>
                <Label>Clean-up</Label>
                <div className="space-y-4"><Chips value={fx.filter} onChange={(v) => setFx({ ...fx, filter: v })} options={FILTERS} />
                  {fx.filter !== 'bw' ? <Range label="Brightness" min={-60} max={60} value={fx.bri} onChange={(v) => setFx({ ...fx, bri: v })} /> : <Range label="Threshold" min={-60} max={60} value={fx.bri} onChange={(v) => setFx({ ...fx, bri: v })} />}
                  {fx.filter !== 'bw' && <Range label="Contrast" min={-60} max={60} value={fx.con} onChange={(v) => setFx({ ...fx, con: v })} />}
                  <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Applies to every page. Switch to “Result” to preview.</div></div>
              </Panel>
              <Panel delay={0.1}>
                <Label>Language</Label>
                <div className="flex flex-wrap gap-1.5">{LANGS.map(([k, l, local]) => <motion.button key={k} type="button" whileTap={{ scale: 0.93 }} onClick={() => setLang(k)} className="rounded-full px-3 py-1.5 text-[12px] font-semibold border" style={{ background: lang === k ? 'var(--ink)' : 'var(--surface)', color: lang === k ? 'var(--bg)' : 'var(--ink)', borderColor: lang === k ? 'var(--ink)' : 'var(--border)' }}>{l}{local && <span className="ml-1.5 text-[9px] opacity-70">OFFLINE</span>}</motion.button>)}</div>
                {!lang.split('+').every((l) => LOCAL_LANGS.includes(l)) && <div className="text-[11.5px] mt-2.5" style={{ color: 'var(--muted)' }}>This language downloads once (about 2–10 MB), then works offline.</div>}
                <AnimatePresence>{busy === 'ocr' && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 overflow-hidden"><Bar value={prog.v} label={prog.s} /></motion.div>}</AnimatePresence>
                <Btn primary className="w-full mt-4" icon="scan" busy={busy === 'ocr'} disabled={!!busy} onClick={read}>Read text{pages.length > 1 ? ` · ${pages.length} pages` : ''}</Btn>
              </Panel>
              <Panel delay={0.15}>
                <Label>Save</Label>
                <div className="grid grid-cols-2 gap-2"><Btn icon="pdf" disabled={!!busy || !pages.some((p) => p.ocr?.pdf)} onClick={searchable}>Searchable PDF</Btn><Btn icon="image" disabled={!!busy} onClick={cleanPdf}>Scan PDF</Btn></div>
                <button type="button" disabled={!!busy} className="text-[12px] font-semibold mt-3 disabled:opacity-50" style={{ color: 'var(--muted)' }} onClick={startOver}>Start over</button>
              </Panel>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {toastNode}
    </div>
  )
}

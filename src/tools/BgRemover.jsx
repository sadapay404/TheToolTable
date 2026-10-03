import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import { zipSync } from 'fflate'
import { Dropzone, AnimatedNumber } from '../components/ui.jsx'
import { Icon, SPRING } from './studio/controls.jsx'
import { BackgroundPanel, RefinePanel } from './bg/Panels.jsx'
import { DownloadPanel } from './bg/Dock.jsx'
import { warmUp, subscribe, segment, retry, MODEL_BYTES } from '../lib/bg/engine.js'
import { compose, matteLUT, matteCanvas, netMaskToWork, paintStroke, fitSize, encode, MIME, DEFAULT_EDGE } from '../lib/bg/compose.js'
import { clamp, download, baseName, recentAction, fmtBytes } from '../lib/utils.js'

const CHECKER = 'conic-gradient(#dcd6c9 25%, #f4f0e7 0 50%, #dcd6c9 0 75%, #f4f0e7 0) 0 0 / 18px 18px'
const WORK_MAX = 1600
const TABS = [['background', 'Background', 'layers'], ['refine', 'Refine', 'brush'], ['download', 'Download', 'download']]
const VIEWS = [['result', 'Result'], ['original', 'Original'], ['matte', 'Matte'], ['split', 'Split']]
const PAD = { l: 36, r: 36, t: 82, b: 24 }

export default function BgRemover() {
  /* ---------------------------------- engine ---------------------------------- */
  const [eng, setEng] = useState({ phase: 'idle', value: 0, ready: false, error: '' })
  useEffect(() => { const un = subscribe(setEng); warmUp().catch(() => {}); return un }, [])

  /* ---------------------------------- items ---------------------------------- */
  const [items, setItems] = useState([])
  const data = useRef(new Map()) // id → { img, work:{canvas,w,h}, M, M0, undo[] }  (heavy, kept out of React state)
  const [selId, setSelId] = useState(null)
  const [rev, setRev] = useState(0)
  const [reveal, setReveal] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const busyRef = useRef(false)

  /* ---------------------------------- settings ---------------------------------- */
  const [tab, setTab] = useState('background')
  const [view, setView] = useState('result')
  const [split, setSplit] = useState(0.5)
  const [tool, setTool] = useState('none')
  const [brush, setBrushS] = useState({ size: 36, hard: 60 })
  const [edge, setEdgeS] = useState(DEFAULT_EDGE)
  const [bg, setBgS] = useState({ type: 'transparent', color: '#F4EFE6', color2: '#C87941', angle: 135, blur: 40, image: null, imageName: '', preview: '' })
  const [shadow, setShadowS] = useState({ on: false, opacity: 35, blur: 30, x: 0, y: 20 })
  const [fit, setFitS] = useState({ on: false, pad: 8 })
  const [fmt, setFmt] = useState('png')
  const [quality, setQuality] = useState(92)
  const [scale, setScale] = useState(1)
  const setBg = (p) => setBgS((s) => ({ ...s, ...p })); const setEdge = (p) => setEdgeS((s) => ({ ...s, ...p }))
  const setShadow = (p) => setShadowS((s) => ({ ...s, ...p })); const setFit = (p) => setFitS((s) => ({ ...s, ...p })); const setBrush = (p) => setBrushS((s) => ({ ...s, ...p }))

  const [previewUrl, setPreviewUrl] = useState('')
  const [sizeBytes, setSizeBytes] = useState(null)
  const [computing, setComputing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [toast, setToast] = useState('')
  const [dragging, setDragging] = useState(false)
  const [ring, setRing] = useState(null)
  const [zoomPct, setZoomPct] = useState(100)
  const [box, setBox] = useState({ w: 800, h: 560 })
  const [undoN, setUndoN] = useState(0)
  useEffect(() => { if (tab !== 'refine') { setTool('none'); setRing(null) } }, [tab])

  const stageRef = useRef(null), wrapRef = useRef(null), canvasRef = useRef(null), underRef = useRef(null), fileRef = useRef(null)
  const live = useRef({}), rafRef = useRef(0), toastTimer = useRef(0)
  const zoomMV = useMotionValue(1), zoomSpring = useSpring(zoomMV, { stiffness: 300, damping: 30 })
  const panX = useMotionValue(0), panY = useMotionValue(0)

  const sel = items.find((i) => i.id === selId) || null
  const selData = sel ? data.current.get(sel.id) : null
  const done = sel?.status === 'done'
  const say = useCallback((t) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2800) }, [])
  const patch = useCallback((id, p) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i))), [])

  /* ---------------------------------- adding photos ---------------------------------- */
  const addFiles = useCallback(async (files) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return say('Those files aren’t images')
    for (const f of imgs) {
      const id = Math.random().toString(36).slice(2, 9)
      setItems((l) => [...l, { id, name: f.name || 'pasted-image.png', size: f.size, status: 'loading', thumb: '', w: 0, h: 0 }])
      setSelId((cur) => cur || id)
      try {
        const url = URL.createObjectURL(f)
        const img = new Image(); img.src = url; await img.decode()
        const k = fitSize(img.naturalWidth, img.naturalHeight, WORK_MAX)
        const wc = document.createElement('canvas'); wc.width = k.w; wc.height = k.h
        const wx = wc.getContext('2d'); wx.imageSmoothingQuality = 'high'; wx.drawImage(img, 0, 0, k.w, k.h)
        const t = fitSize(k.w, k.h, 160); const tc = document.createElement('canvas'); tc.width = t.w; tc.height = t.h
        tc.getContext('2d').drawImage(wc, 0, 0, t.w, t.h)
        data.current.set(id, { img, work: { canvas: wc, w: k.w, h: k.h }, M: null, M0: null, undo: [] })
        patch(id, { status: 'queued', thumb: tc.toDataURL('image/jpeg', 0.8), w: img.naturalWidth, h: img.naturalHeight })
      } catch { patch(id, { status: 'error', error: 'Could not read that image' }) }
    }
  }, [patch, say])

  useEffect(() => {
    const onPaste = (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) addFiles(fs) }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  /* ---------------------------------- queue runner ---------------------------------- */
  useEffect(() => {
    if (busyRef.current || eng.error) return
    const next = items.find((i) => i.status === 'queued')
    if (!next) return
    busyRef.current = true
    ;(async () => {
      patch(next.id, { status: 'working', t0: performance.now() })
      try {
        const d = data.current.get(next.id)
        const r = await segment(d.work.canvas)
        d.M = netMaskToWork(r.mask, r.size, d.work.w, d.work.h); d.M0 = d.M.slice()
        patch(next.id, { status: 'done', ms: r.ms })
        setRev((n) => n + 1); setReveal(next.id)
        recentAction(`Removed background from ${next.name}`)
      } catch (e) { patch(next.id, { status: 'error', error: e.message }) }
      busyRef.current = false
    })()
  }, [items, eng.error, patch])

  useEffect(() => {
    if (sel?.status !== 'working') { setElapsed(0); return }
    const t0 = performance.now(); const iv = setInterval(() => setElapsed((performance.now() - t0) / 1000), 100)
    return () => clearInterval(iv)
  }, [sel?.status, sel?.id])

  /* ---------------------------------- stage geometry ---------------------------------- */
  useEffect(() => {
    if (!sel || !stageRef.current) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(stageRef.current); return () => ro.disconnect()
  }, [!!sel]) // eslint-disable-line
  const ww = selData?.work.w || 4, wh = selData?.work.h || 3
  const aw = Math.max(120, box.w - PAD.l - PAD.r), ah = Math.max(120, box.h - PAD.t - PAD.b)
  const dw = Math.min(aw, ah * (ww / wh)), dh = dw * (wh / ww)

  /* ---------------------------------- drawing ---------------------------------- */
  live.current = { view, split, edge, bg, shadow, selId }
  const draw = useCallback(() => {
    const cv = canvasRef.current, L = live.current; if (!cv) return
    const d = data.current.get(L.selId); if (!d) return
    const { w, h, canvas: wc } = d.work
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
    const x = cv.getContext('2d'); x.clearRect(0, 0, w, h)
    if (!d.M || L.view === 'original') { x.drawImage(wc, 0, 0); return }
    const lut = matteLUT(L.edge)
    if (L.view === 'matte') { x.drawImage(matteCanvas(d.M, w, h, lut), 0, 0); return }
    x.drawImage(compose({ src: wc, w, h, M: d.M, mw: w, mh: h, lut, bg: L.bg, shadow: L.shadow, fit: { on: false } }), 0, 0)
    if (L.view === 'split') { x.save(); x.beginPath(); x.rect(0, 0, w * L.split, h); x.clip(); x.drawImage(wc, 0, 0); x.restore() }
  }, [])
  const schedule = useCallback(() => { if (rafRef.current) return; rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; draw() }) }, [draw])
  useEffect(() => { schedule() }, [selId, rev, view, split, edge, bg, shadow, sel?.status, schedule, dw, reveal])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // reveal underlay (original) while the cut-out wipes in
  useEffect(() => {
    if (reveal && reveal === selId && underRef.current && selData) {
      const u = underRef.current, { w, h, canvas } = selData.work; u.width = w; u.height = h; u.getContext('2d').drawImage(canvas, 0, 0)
    }
  }, [reveal, selId, selData])

  useEffect(() => { zoomMV.set(1); panX.set(0); panY.set(0); setZoomPct(100); setTool('none') }, [selId]) // eslint-disable-line

  /* ---------------------------------- dock: preview + size estimate ---------------------------------- */
  const outDimsFor = useCallback((d, sc) => {
    const nat = { w: d.img.naturalWidth, h: d.img.naturalHeight }
    let w = nat.w, h = nat.h
    if (fit.on) { // approximate with the work-res bbox
      const lut = matteLUT(edge); const { w: mw, h: mh } = d.work; let minX = mw, minY = mh, maxX = -1, maxY = -1
      for (let i = 0; i < d.M.length; i += 3) { if (lut[d.M[i]] > 12) { const px = i % mw, py = (i / mw) | 0; if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py } }
      if (maxX >= 0) { const bw = (maxX - minX + 1) / mw * nat.w, bh = (maxY - minY + 1) / mh * nat.h; const pad = Math.max(bw, bh) * (fit.pad / 100); w = bw + pad * 2; h = bh + pad * 2 }
    }
    const f = fitSize(w * sc, h * sc, 8192); return f
  }, [fit, edge])
  const outDims = useMemo(() => (done && selData?.M ? outDimsFor(selData, scale) : { w: sel?.w || 0, h: sel?.h || 0 }), [done, selData, scale, outDimsFor, rev, sel?.w, sel?.h]) // eslint-disable-line

  useEffect(() => {
    if (tab !== 'download' || !done || !selData?.M) { return }
    let dead = false
    const t = setTimeout(async () => {
      const d = selData, lut = matteLUT(edge)
      const mk = (long) => { const k = fitSize(d.work.w, d.work.h, long); return compose({ src: d.work.canvas, w: k.w, h: k.h, M: d.M, mw: d.work.w, mh: d.work.h, lut, bg, shadow, fit }) }
      const prev = mk(520); if (!dead) setPreviewUrl(prev.toDataURL('image/png'))
      setComputing(true)
      try {
        const est = mk(900); const blob = await encode(est, fmt, quality / 100, bg.type === 'color' ? bg.color : '#FFFFFF')
        const ratio = (outDims.w * outDims.h) / (est.width * est.height)
        if (!dead) setSizeBytes(Math.round(blob.size * Math.pow(Math.max(ratio, 0.05), 0.9)))
      } catch { if (!dead) setSizeBytes(null) }
      if (!dead) setComputing(false)
    }, 260)
    return () => { dead = true; clearTimeout(t) }
  }, [tab, done, selData, rev, edge, bg, shadow, fit, fmt, quality, scale, outDims.w, outDims.h]) // eslint-disable-line

  /* ---------------------------------- brush ---------------------------------- */
  const painting = useRef(null)
  const radiusWork = () => brush.size * ((selData?.work.w || 900) / 900)
  const ptWork = (e) => { const r = wrapRef.current.getBoundingClientRect(); const d = selData.work; return { x: ((e.clientX - r.left) / r.width) * d.w, y: ((e.clientY - r.top) / r.height) * d.h, px: (e.clientX - r.left) / r.width, py: (e.clientY - r.top) / r.height } }
  const onStageDown = (e) => {
    if (!done || e.button === 2 || !wrapRef.current?.contains(e.target)) return
    if (tool !== 'none') {
      e.currentTarget.setPointerCapture(e.pointerId)
      const d = selData; d.dirty = true; d.undo.push(d.M.slice()); if (d.undo.length > 25) d.undo.shift(); setUndoN((n) => n + 1)
      const p = ptWork(e); painting.current = p
      paintStroke(d.M, d.work.w, d.work.h, p, p, radiusWork(), brush.hard / 100, tool); setRev((n) => n + 1)
    } else if (zoomMV.get() > 1.02) { painting.current = { pan: true, x: e.clientX, y: e.clientY, px: panX.get(), py: panY.get() }; e.currentTarget.setPointerCapture(e.pointerId) }
  }
  const onStageMove = (e) => {
    if (tool !== 'none' && done && wrapRef.current) { const p = ptWork(e); setRing({ x: p.px, y: p.py }); if (painting.current && !painting.current.pan) { paintStroke(selData.M, selData.work.w, selData.work.h, painting.current, p, radiusWork(), brush.hard / 100, tool); painting.current = p; setRev((n) => n + 1) } }
    const s = painting.current; if (s?.pan) { panX.set(s.px + e.clientX - s.x); panY.set(s.py + e.clientY - s.y) }
  }
  const onStageUp = () => { painting.current = null }
  const undoStroke = useCallback(() => { const d = selData; const m = d?.undo.pop(); if (m) { d.M = m; d.dirty = d.undo.length > 0; setUndoN((n) => n + 1); setRev((n) => n + 1) } }, [selData])
  const resetMask = () => { const d = selData; if (!d?.M0) return; d.undo.push(d.M.slice()); d.M = d.M0.slice(); d.dirty = false; setUndoN((n) => n + 1); setRev((n) => n + 1); say('Back to the original AI cut') }
  const dirty = !!selData?.dirty
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target.tagName === 'INPUT')) { e.preventDefault(); undoStroke() } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [undoStroke])

  // zoom
  useEffect(() => {
    const el = stageRef.current; if (!el || !sel) return
    const onWheel = (e) => { e.preventDefault(); const z = clamp(zoomMV.get() * Math.exp(-e.deltaY * 0.0016), 1, 8); zoomMV.set(z); setZoomPct(Math.round(z * 100)); if (z <= 1.001) { panX.set(0); panY.set(0) } }
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel)
  }, [!!sel, zoomMV, panX, panY]) // eslint-disable-line
  const resetZoom = () => { zoomMV.set(1); panX.set(0); panY.set(0); setZoomPct(100) }
  const splitDrag = useRef(false)
  const moveSplit = (e) => { if (splitDrag.current) { const r = wrapRef.current.getBoundingClientRect(); setSplit(clamp((e.clientX - r.left) / r.width, 0.02, 0.98)) } }

  /* ---------------------------------- export ---------------------------------- */
  const renderExport = useCallback(async (id, sc = scale, format = fmt) => {
    const d = data.current.get(id); const lut = matteLUT(edge)
    const f = fitSize(d.img.naturalWidth * sc, d.img.naturalHeight * sc, 8192)
    const out = compose({ src: d.img, w: f.w, h: f.h, M: d.M, mw: d.work.w, mh: d.work.h, lut, bg, shadow, fit })
    const blob = await encode(out, format, quality / 100, bg.type === 'color' ? bg.color : '#FFFFFF')
    return { blob, w: out.width, h: out.height }
  }, [edge, bg, shadow, fit, quality, scale, fmt])
  const ext = fmt === 'jpeg' ? 'jpg' : fmt
  const onDownload = async () => {
    if (!sel || saving) return
    setSaving(true); setJustSaved(false)
    try {
      await new Promise((r) => setTimeout(r, 80))
      const r = await renderExport(sel.id); download(r.blob, `${baseName(sel.name)}-cutout.${ext}`)
      setSizeBytes(r.blob.size); setJustSaved(true); setTimeout(() => setJustSaved(false), 2600)
    } catch (e) { say(e.message) }
    setSaving(false)
  }
  const onCopy = async () => {
    try { const r = await renderExport(sel.id, Math.min(scale, 1), 'png'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': r.blob })]); say('Copied to clipboard') } catch { say('Clipboard was blocked by the browser') }
  }
  const doneItems = items.filter((i) => i.status === 'done')
  const onZip = async () => {
    setSaving(true)
    try {
      const files = {}, used = new Set()
      for (const it of doneItems) {
        const r = await renderExport(it.id); let n = `${baseName(it.name)}-cutout.${ext}`; let k = 2
        while (used.has(n)) n = `${baseName(it.name)}-cutout-${k++}.${ext}`
        used.add(n); files[n] = new Uint8Array(await r.blob.arrayBuffer())
      }
      download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), 'cutouts.zip'); say(`Zipped ${doneItems.length} images`)
    } catch (e) { say(e.message) }
    setSaving(false)
  }
  const removeItem = (id) => {
    data.current.delete(id)
    setItems((l) => { const n = l.filter((i) => i.id !== id); if (selId === id) setSelId(n[0]?.id || null); return n })
  }
  const requeue = (id) => patch(id, { status: 'queued', error: '' })

  /* ---------------------------------- panel context ---------------------------------- */
  const ctx = {
    bg, setBg, shadow, setShadow, edge, setEdge, tool, setTool, brush, setBrush, canUndo: !!selData?.undo.length, undoStroke, dirty, resetMask, thumb: sel?.thumb,
    fmt, setFmt, quality, setQuality, scale, setScale, fit, setFit, outDims, previewUrl, sizeBytes, computing, saving, justSaved, ready: done, bgType: bg.type,
    stats: sel?.ms ? { ms: sel.ms } : null, onDownload, onCopy, onZip, doneCount: doneItems.length,
  }
  void undoN

  /* ============================================ EMPTY ============================================ */
  if (!items.length) {
    return (
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
          <Dropzone onFiles={addFiles} multiple accept="image/*" label="" sub=""><Hero eng={eng} onRetry={retry} /></Dropzone>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[[44, 'MB model, bundled', 'The neural net ships inside the app. No download, works offline.'], [0, 'bytes uploaded', 'Your photos are processed on this device and never sent anywhere.'], [4, 'ways to inspect', 'Result, original, matte and a draggable before / after split.'], [6, 'background types', 'Transparent, colour, gradient, blur, scenes or your own picture.']].map(([n, a, b], i) => (
            <motion.div key={a} className="card p-5" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.12 + i * 0.07 }} whileHover={{ y: -4 }}>
              <div className="display font-semibold text-[34px] leading-none"><AnimatedNumber value={n} /></div>
              <div className="eyebrow mt-2">{a}</div>
              <p className="text-[12.5px] mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>{b}</p>
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  /* ============================================ EDITOR ============================================ */
  const working = sel && (sel.status === 'working' || sel.status === 'queued' || sel.status === 'loading')
  const ringPx = ring && tool !== 'none' ? { left: `${ring.x * 100}%`, top: `${ring.y * 100}%`, width: `${(radiusWork() * 2 / ww) * 100}%` } : null
  const Panel = tab === 'background' ? BackgroundPanel : tab === 'refine' ? RefinePanel : DownloadPanel
  const ahead = items.filter((i) => i.status === 'queued' || i.status === 'working').findIndex((i) => i.id === selId)

  return (
    <motion.div className="relative" style={{ left: '50%', width: 'min(1440px, calc(100vw - 32px))', marginLeft: 'calc(min(1440px, calc(100vw - 32px)) / -2)' }} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
      <input ref={fileRef} type="file" multiple accept="image/*" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      <div className="card-raised rounded-3xl overflow-hidden flex flex-col lg:flex-row" style={{ height: 'clamp(660px, calc(100vh - 200px), 940px)', background: 'var(--surface)' }}>

        {/* ---------------- stage ---------------- */}
        <div className="flex-1 min-w-0 min-h-[440px] flex flex-col" style={{ background: 'var(--surface2)' }}>
          <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden select-none"
            style={{ backgroundImage: 'radial-gradient(ellipse at 50% 35%, color-mix(in srgb, var(--surface) 85%, transparent), transparent 70%), radial-gradient(color-mix(in srgb, var(--ink) 9%, transparent) 1px, transparent 1px)', backgroundSize: '100% 100%, 22px 22px', cursor: tool !== 'none' && done ? 'none' : zoomPct > 102 ? 'grab' : 'default' }}
            onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerLeave={() => setRing(null)}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}>

            {/* canvas */}
            <div className="absolute inset-0 grid place-items-center" style={{ paddingTop: PAD.t, paddingBottom: PAD.b, paddingLeft: PAD.l, paddingRight: PAD.r }}>
              <motion.div ref={wrapRef} className="relative rounded-md" initial={false} animate={{ width: dw, height: dh }} transition={SPRING}
                style={{ scale: zoomSpring, x: panX, y: panY, background: CHECKER, boxShadow: '0 40px 70px -28px rgba(26,24,23,.55), 0 14px 26px -14px rgba(26,24,23,.35), 0 0 0 1px var(--border)' }}>
                <canvas ref={underRef} className="absolute inset-0 w-full h-full rounded-md" style={{ display: reveal && reveal === selId ? 'block' : 'none' }} />
                <motion.canvas key={reveal === selId ? 'r' : 'n'} ref={canvasRef} className="absolute inset-0 w-full h-full rounded-md"
                  initial={reveal && reveal === selId ? { clipPath: 'inset(0 100% 0 0)' } : false} animate={{ clipPath: 'inset(0 0% 0 0)', filter: working ? 'saturate(.55) brightness(.92)' : 'saturate(1) brightness(1)' }}
                  transition={{ clipPath: { duration: 1.15, ease: [0.22, 1, 0.36, 1] }, filter: { duration: 0.4 } }} onAnimationComplete={() => reveal && setReveal(null)} />
                {reveal && reveal === selId && <motion.div className="absolute top-0 bottom-0 w-[3px] pointer-events-none" initial={{ left: '0%', opacity: 1 }} animate={{ left: '100%', opacity: [1, 1, 0] }} transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }} style={{ background: 'linear-gradient(180deg, transparent, var(--copper), transparent)', boxShadow: '0 0 24px 6px var(--copper)' }} />}

                {/* scanning treatment */}
                <AnimatePresence>
                  {working && (
                    <motion.div className="absolute inset-0 overflow-hidden rounded-md pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <motion.div className="absolute left-0 right-0 h-28" animate={{ top: ['-20%', '100%'] }} transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut', repeatType: 'reverse' }}
                        style={{ background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--copper) 35%, transparent) 70%, var(--copper))', borderBottom: '2px solid #fff', boxShadow: '0 10px 30px color-mix(in srgb, var(--copper) 70%, transparent)' }} />
                      {[['top-3 left-3', { borderTopWidth: 3, borderLeftWidth: 3 }], ['top-3 right-3', { borderTopWidth: 3, borderRightWidth: 3 }], ['bottom-3 left-3', { borderBottomWidth: 3, borderLeftWidth: 3 }], ['bottom-3 right-3', { borderBottomWidth: 3, borderRightWidth: 3 }]].map(([pos, b]) => (
                        <motion.span key={pos} className={`absolute w-7 h-7 ${pos}`} animate={{ scale: [1, 1.12, 1], opacity: [0.9, 1, 0.9] }} transition={{ repeat: Infinity, duration: 1.4 }}
                          style={{ ...b, borderStyle: 'solid', borderColor: '#fff', borderRadius: 6 }} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* split handle */}
                {view === 'split' && done && (
                  <>
                    <div className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md pointer-events-none" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}>Before</div>
                    <div className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md pointer-events-none" style={{ background: 'var(--copper)', color: '#fff' }}>After</div>
                    <div className="absolute top-0 bottom-0 w-10 -ml-5 cursor-ew-resize touch-none grid place-items-center" style={{ left: `${split * 100}%` }}
                      onPointerDown={(e) => { e.stopPropagation(); splitDrag.current = true; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={moveSplit} onPointerUp={() => { splitDrag.current = false }}>
                      <span className="absolute top-0 bottom-0 w-[2px]" style={{ background: '#fff', boxShadow: '0 0 12px rgba(0,0,0,.6)' }} />
                      <motion.span className="relative w-9 h-9 rounded-full grid place-items-center" style={{ background: '#fff', color: '#111', boxShadow: '0 4px 14px rgba(0,0,0,.5)' }} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}><Icon n="compare" s={17} /></motion.span>
                    </div>
                  </>
                )}
                {/* brush ring */}
                {ringPx && <div className="absolute rounded-full pointer-events-none" style={{ ...ringPx, aspectRatio: '1', transform: 'translate(-50%,-50%)', border: `2px solid ${tool === 'restore' ? '#4E937A' : '#D04841'}`, boxShadow: '0 0 0 1px rgba(255,255,255,.9), inset 0 0 0 1px rgba(255,255,255,.7)', background: tool === 'restore' ? 'rgba(78,147,122,.14)' : 'rgba(208,72,65,.14)' }} />}
              </motion.div>
            </div>

            {/* status card (processing) */}
            <AnimatePresence>
              {working && <StatusCard key="st" eng={eng} sel={sel} elapsed={elapsed} ahead={ahead} onRetry={() => { retry(); }} />}
            </AnimatePresence>
            {sel?.status === 'error' && (
              <motion.div className="absolute inset-x-0 bottom-10 grid place-items-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="card px-5 py-4 flex items-center gap-4 max-w-md"><div className="text-[13px]"><b>Couldn’t cut this one out.</b><div style={{ color: 'var(--muted)' }} className="text-[12px] mt-0.5">{sel.error}</div></div><button className="btn !py-2 text-[12px]" onClick={() => requeue(sel.id)}>Try again</button></div>
              </motion.div>
            )}
            {eng.error && (
              <motion.div className="absolute inset-x-0 top-20 grid place-items-center z-20" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}>
                <div className="card px-5 py-4 flex items-center gap-4 max-w-lg"><div className="text-[13px]"><b>The cut-out engine couldn’t start.</b><div style={{ color: 'var(--muted)' }} className="text-[12px] mt-0.5 break-words">{eng.error}</div></div><button className="btn btn-primary !py-2 text-[12px]" onClick={() => retry().catch(() => {})}>Retry</button></div>
              </motion.div>
            )}

            {/* top bar */}
            <motion.div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-3 pointer-events-none" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.12 }}>
              <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                {VIEWS.map(([k, l]) => (
                  <button key={k} disabled={!done} onClick={() => setView(k)} className="relative px-3.5 py-1.5 rounded-full text-[12px] font-bold" style={{ color: view === k ? 'var(--bg)' : 'var(--muted)', opacity: done ? 1 : 0.5 }}>
                    {view === k && <motion.span layoutId="bg-view" className="absolute inset-0 rounded-full" style={{ background: 'var(--ink)' }} transition={SPRING} />}
                    <span className="relative">{l}</span>
                  </button>
                ))}
              </div>
              <div className="pointer-events-auto flex items-center gap-1.5">
                <AnimatePresence>{zoomPct > 102 && <motion.button initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} whileTap={{ scale: 0.9 }} onClick={resetZoom} className="btn !py-1.5 !px-3 text-[11.5px] mono">{zoomPct}% · fit</motion.button>}</AnimatePresence>
                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} className="btn !py-2 !px-3.5 text-[12px]" onClick={() => fileRef.current?.click()}><Icon n="plus" s={14} w={2.2} /> Add photos</motion.button>
                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} disabled={!done} className="btn btn-primary !py-2 !px-4 text-[12px]" onClick={() => setTab('download')}><Icon n="download" s={14} w={2.2} /> Download</motion.button>
              </div>
            </motion.div>

            {/* badges */}
            <div className="absolute bottom-3 left-4 flex items-center gap-2 pointer-events-none">
              <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}><Icon n="lock" s={11} /> Processed on this device</span>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none"><AnimatePresence>{toast && <motion.div key={toast} initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={SPRING} className="px-4 py-2 rounded-full text-[12.5px] font-semibold" style={{ background: 'var(--ink)', color: 'var(--bg)', boxShadow: 'var(--shadow-lg)' }}>{toast}</motion.div>}</AnimatePresence></div>

            {/* drop overlay */}
            <AnimatePresence>{dragging && <motion.div className="absolute inset-3 rounded-2xl grid place-items-center z-30" style={{ border: '3px dashed var(--copper)', background: 'color-mix(in srgb, var(--surface) 82%, transparent)', backdropFilter: 'blur(4px)' }} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}><div className="display font-semibold text-[22px]">Drop to add photos</div></motion.div>}</AnimatePresence>
          </div>

          {/* ---------------- filmstrip ---------------- */}
          <div className="shrink-0 h-[96px] px-4 flex items-center gap-3 overflow-x-auto border-t border-line" style={{ background: 'var(--surface)' }}>
            <AnimatePresence initial={false}>
              {items.map((it) => (
                <motion.div key={it.id} layout initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={SPRING} className="relative shrink-0 group">
                  <motion.button whileHover={{ y: -4, scale: 1.05 }} whileTap={{ scale: 0.92 }} onClick={() => setSelId(it.id)} className="relative block w-[84px] h-[64px] rounded-xl overflow-hidden"
                    style={{ boxShadow: it.id === selId ? '0 0 0 3px var(--copper), 0 10px 20px -8px rgba(0,0,0,.5)' : '0 0 0 1px var(--border), 0 4px 10px -6px rgba(0,0,0,.4)', background: CHECKER }}>
                    {it.thumb ? <img src={it.thumb} alt="" className="w-full h-full object-cover" draggable={false} style={{ opacity: it.status === 'done' ? 1 : 0.6 }} /> : <div className="w-full h-full shimmer" />}
                    {(it.status === 'working' || it.status === 'queued' || it.status === 'loading') && <span className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(255,255,255,.35)' }}><motion.span className="block w-5 h-5 rounded-full border-[2.5px]" style={{ borderColor: 'rgba(0,0,0,.2)', borderTopColor: 'var(--copper)' }} animate={{ rotate: it.status === 'working' ? 360 : 0 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} /></span>}
                    {it.status === 'done' && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING} className="absolute bottom-1 right-1 w-[18px] h-[18px] rounded-full grid place-items-center" style={{ background: '#4E937A', color: '#fff' }}><Icon n="check" s={11} w={3.2} /></motion.span>}
                    {it.status === 'error' && <span className="absolute bottom-1 right-1 w-[18px] h-[18px] rounded-full grid place-items-center text-[11px] font-bold" style={{ background: '#D04841', color: '#fff' }}>!</span>}
                  </motion.button>
                  <button aria-label="Remove" onClick={() => removeItem(it.id)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--ink)', color: 'var(--bg)' }}><Icon n="trash" s={10} /></button>
                </motion.div>
              ))}
            </AnimatePresence>
            <motion.button whileHover={{ y: -3, rotate: 4 }} whileTap={{ scale: 0.9 }} onClick={() => fileRef.current?.click()} className="shrink-0 w-[84px] h-[64px] rounded-xl grid place-items-center border-2 border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }} aria-label="Add photos"><Icon n="plus" s={22} w={2} /></motion.button>
            <div className="ml-auto pl-4 shrink-0 text-[11.5px] text-right" style={{ color: 'var(--muted)' }}>
              <div className="font-semibold" style={{ color: 'var(--ink)' }}>{doneItems.length} of {items.length} cut out</div>
              {sel && <div className="tabular-nums">{sel.w}×{sel.h} · {fmtBytes(sel.size)}</div>}
            </div>
          </div>
        </div>

        {/* ---------------- inspector ---------------- */}
        <aside className="shrink-0 lg:w-[392px] flex flex-col min-h-[340px] max-h-[75vh] lg:max-h-none border-t lg:border-t-0 lg:border-l border-line" style={{ background: 'var(--surface)' }}>
          <div className="p-3 border-b border-line">
            <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              {TABS.map(([k, l, ic]) => (
                <button key={k} onClick={() => setTab(k)} className="relative py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[12.5px] font-bold" style={{ color: tab === k ? 'var(--bg)' : 'var(--muted)' }}>
                  {tab === k && <motion.span layoutId="bg-tab" className="absolute inset-0 rounded-xl" style={{ background: 'var(--ink)', boxShadow: '0 8px 16px -8px rgba(0,0,0,.55)' }} transition={SPRING} />}
                  <span className="relative flex items-center gap-1.5"><Icon n={ic} s={15} /> {l}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 relative">
            {!done && (
              <div className="absolute inset-0 z-10 grid place-items-center text-center px-10" style={{ background: 'color-mix(in srgb, var(--surface) 70%, transparent)', backdropFilter: 'blur(2px)' }}>
                <div><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }} className="inline-block mb-3" style={{ color: 'var(--copper)' }}><Icon n="fx" s={28} /></motion.div><div className="display font-semibold text-[16px]">Cutting out your photo…</div><div className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>The controls unlock the moment the cut-out is ready.</div></div>
              </div>
            )}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} initial={{ opacity: 0, x: 22 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -22 }} transition={{ duration: 0.16 }}>
                <Panel c={ctx} />
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </motion.div>
  )
}

/* ----------------------------------- pieces ----------------------------------- */
function StatusCard({ eng, sel, elapsed, ahead }) {
  const loadingModel = !eng.ready && !eng.error
  const steps = [
    { k: 'Engine', done: eng.ready, active: loadingModel, note: eng.phase === 'model' ? `Loading bundled model ${Math.round(eng.value * 100)}%` : eng.phase === 'compile' ? 'Warming up' : eng.ready ? 'Ready' : 'Starting' },
    { k: 'Photo', done: sel.status !== 'loading', active: sel.status === 'loading', note: sel.status === 'loading' ? 'Reading' : 'Ready' },
    { k: 'Cut-out', done: false, active: eng.ready && sel.status === 'working', note: sel.status === 'working' ? `${elapsed.toFixed(1)} s` : ahead > 0 ? `${ahead} ahead` : 'Waiting' },
  ]
  return (
    <motion.div className="absolute left-1/2 bottom-9 z-10 pointer-events-none" initial={{ opacity: 0, y: 24, x: '-50%', scale: 0.9 }} animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }} exit={{ opacity: 0, y: 16, x: '-50%' }} transition={SPRING}>
      <div className="rounded-2xl px-5 py-3.5 flex items-center gap-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        {steps.map((s, i) => (
          <div key={s.k} className="flex items-center gap-2.5">
            <span className="relative w-6 h-6 rounded-full grid place-items-center" style={{ background: s.done ? '#4E937A' : 'var(--surface2)', color: s.done ? '#fff' : 'var(--muted)', border: s.done ? 'none' : '1px solid var(--border)' }}>
              {s.done ? <Icon n="check" s={13} w={3.2} /> : s.active ? <motion.span className="block w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: 'rgba(0,0,0,.15)', borderTopColor: 'var(--copper)' }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
            </span>
            <span className="leading-tight"><span className="block text-[12px] font-bold">{s.k}</span><span className="block text-[10.5px] tabular-nums" style={{ color: 'var(--muted)' }}>{s.note}</span></span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function Hero({ eng, onRetry }) {
  return (
    <div className="py-7">
      <HeroArt />
      <div className="display font-semibold text-[22px] text-center mt-5">Drop photos to cut out the background</div>
      <div className="text-[13px] mt-1.5 text-center" style={{ color: 'var(--muted)' }}>One or many · paste with Ctrl+V · nothing leaves your device</div>
      <div className="flex justify-center mt-5" onClick={(e) => e.stopPropagation()}>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-[12px] font-semibold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <motion.span className="w-2.5 h-2.5 rounded-full" animate={{ scale: eng.ready ? [1, 1.35, 1] : [1, 0.7, 1], opacity: [1, 0.6, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} style={{ background: eng.error ? '#D04841' : eng.ready ? '#4E937A' : 'var(--accent)' }} />
          {eng.error ? <>Engine failed to start · <button className="underline" onClick={onRetry}>retry</button></> : eng.ready ? `Model ready · bundled ${fmtBytes(MODEL_BYTES)} · runs offline` : eng.phase === 'model' ? `Loading bundled model… ${Math.round(eng.value * 100)}%` : 'Starting engine…'}
        </motion.div>
      </div>
    </div>
  )
}

function HeroArt() {
  return (
    <div className="mx-auto w-[280px] h-[170px] relative">
      <div className="absolute inset-0 rounded-2xl overflow-hidden" style={{ background: CHECKER, boxShadow: '0 24px 40px -20px rgba(26,24,23,.5), 0 0 0 1px var(--border)' }}>
        <motion.div className="absolute inset-y-0 w-24" animate={{ left: ['-30%', '120%'] }} transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
          style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--copper) 45%, transparent), transparent)', borderRight: '2px solid var(--copper)' }} />
      </div>
      <motion.svg viewBox="0 0 280 170" className="absolute inset-0" animate={{ y: [0, -7, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }} style={{ filter: 'drop-shadow(0 12px 10px rgba(0,0,0,.28))' }}>
        <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E0935F" /><stop offset="1" stopColor="#B4715A" /></linearGradient></defs>
        <circle cx="140" cy="62" r="30" fill="url(#hg)" />
        <path d="M70 170c0-38 28-60 70-60s70 22 70 60Z" fill="url(#hg)" />
      </motion.svg>
    </div>
  )
}

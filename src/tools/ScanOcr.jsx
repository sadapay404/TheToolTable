import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PDFDocument } from 'pdf-lib'
import { Panel, Label, Seg, Btn, Drop, Chips, Range, Bar, KIco, SPRING, Stat2, CountText, uid, save, useToast, usePref, Empty } from './kit/ui.jsx'
import { LANGS, LOCAL_LANGS, toCanvas, rotateCanvas, rotateQuad, autoQuad, warp, applyFilter, FULL, recognize, stopOcr } from '../lib/ocr/engine.js'
import { loadDoc, renderCanvas } from '../lib/pdf/engine.js'
import { recentAction } from '../lib/utils.js'

const FILTERS = [['original', 'Original'], ['enhance', 'Enhanced'], ['gray', 'Grey'], ['bw', 'Black & white']]
const url = (c, q = 0.86) => c.toDataURL('image/jpeg', q)

function Handle({ p, i, onDrag }) {
  return <motion.span whileHover={{ scale: 1.25 }} whileTap={{ scale: 1.4 }} onPointerDown={(e) => { e.preventDefault(); onDrag(i, e) }} className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-[3px] bg-white cursor-grab" style={{ left: p[0] * 100 + '%', top: p[1] * 100 + '%', borderColor: 'var(--copper)', boxShadow: '0 3px 10px rgba(0,0,0,.35)', touchAction: 'none', zIndex: 3 }} />
}

function CameraBox({ onShot, onClose }) {
  const v = useRef(null), [err, setErr] = useState(''), [facing, setFacing] = useState('environment'), [n, setN] = useState(0), st = useRef(null)
  useEffect(() => {
    let dead = false; (async () => {
      try { st.current?.getTracks().forEach((t) => t.stop()); const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } }); if (dead) return s.getTracks().forEach((t) => t.stop()); st.current = s; v.current.srcObject = s; await v.current.play() } catch (e) { setErr(e?.name === 'NotAllowedError' ? 'Camera permission was blocked.' : 'No camera is available on this device.') }
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
  const [toast, toastNode] = useToast(), outs = useRef(new Map()), box = useRef(null), srcUrls = useRef(new Map())
  const page = pages[cur]
  const srcUrl = (p) => { if (!srcUrls.current.has(p.id)) srcUrls.current.set(p.id, url(p.src)); return srcUrls.current.get(p.id) }

  const addCanvases = useCallback((cs, name = 'Page') => {
    setPages((p) => { const add = cs.map((c, i) => ({ id: uid(), src: c, quad: autoQuad(c), name: `${name} ${p.length + i + 1}`, text: null })); setCur(p.length); return [...p, ...add] })
    setText(''); setStats(null)
  }, [])
  const onFiles = async (files) => {
    setBusy('Opening…')
    try {
      for (const f of files) {
        if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) { const d = await loadDoc(f), cs = []; for (let i = 0; i < Math.min(d.pages, 40); i++) { cs.push(toCanvas(await renderCanvas(d, i, { scale: 2.2 }))); setProg({ v: ((i + 1) / Math.min(d.pages, 40)) * 100, s: `Rendering page ${i + 1}` }) } addCanvases(cs.map((c) => { const q = c; return q }), f.name.replace(/\.pdf$/i, '')); setPages((ps) => ps.map((p) => (cs.includes(p.src) ? { ...p, quad: FULL() } : p))) }
        else if (/^image\//.test(f.type)) { const bm = await createImageBitmap(f, { imageOrientation: 'from-image' }); addCanvases([toCanvas(bm)], f.name.replace(/\.[^.]+$/, '')) }
      }
    } catch (e) { toast(e.message || 'Could not open that file', 'err') } finally { setBusy('') }
  }
  useEffect(() => { const h = (e) => { const f = [...(e.clipboardData?.files || [])].filter((x) => /^image\//.test(x.type)); if (f.length) onFiles(f) }; window.addEventListener('paste', h); return () => window.removeEventListener('paste', h) }, [])

  // processed preview
  const processed = useCallback((p) => { const w = warp(p.src, p.quad); return applyFilter(w, fx) }, [fx])
  useEffect(() => {
    if (!page || view !== 'clean') return; let dead = false
    const t = setTimeout(() => { const c = processed(page); outs.current.set(page.id, c); if (!dead) setPrev({ id: page.id, url: url(c, 0.9), w: c.width, h: c.height }) }, 120)
    return () => { dead = true; clearTimeout(t) }
  }, [page?.id, page?.quad, view, fx, processed])

  const dragCorner = (i, e) => {
    const r = () => box.current.getBoundingClientRect(), pid = page.id
    const mv = (ev) => { const b = r(), x = Math.min(1, Math.max(0, (ev.clientX - b.left) / b.width)), y = Math.min(1, Math.max(0, (ev.clientY - b.top) / b.height)); setPages((ps) => ps.map((p) => (p.id === pid ? { ...p, quad: p.quad.map((q, k) => (k === i ? [x, y] : q)) } : p))) }
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const upd = (f) => setPages((ps) => ps.map((p, i) => (i === cur ? f(p) : p)))
  const rotate = (dir) => { srcUrls.current.delete(page.id); upd((p) => ({ ...p, src: rotateCanvas(p.src, dir), quad: rotateQuad(p.quad, dir) })) }
  const remove = (i) => { setPages((ps) => ps.filter((_, k) => k !== i)); setCur((c) => Math.max(0, Math.min(c, pages.length - 2))) }

  const read = async () => {
    setBusy('ocr'); setProg({ v: 1, s: 'Starting the engine' }); setText(''); const results = []
    try {
      for (let i = 0; i < pages.length; i++) {
        const c = processed(pages[i]); outs.current.set(pages[i].id, c)
        const r = await recognize(c, lang, (m) => { if (m.status) setProg({ v: ((i + (m.progress || 0)) / pages.length) * 100, s: `${m.status[0].toUpperCase() + m.status.slice(1)}${pages.length > 1 ? ` · page ${i + 1} of ${pages.length}` : ''}` }) })
        results.push(r); setPages((ps) => ps.map((p, k) => (k === i ? { ...p, ocr: r } : p)))
      }
      const all = results.map((r, i) => (pages.length > 1 ? `— Page ${i + 1} —\n` : '') + r.text).join('\n\n'), words = results.reduce((a, r) => a + r.words, 0)
      setText(all); setStats({ words, chars: all.length, conf: Math.round(results.reduce((a, r) => a + r.confidence, 0) / results.length) }); recentAction(`Read ${pages.length} page${pages.length > 1 ? 's' : ''} with OCR`)
      if (!all.trim()) toast('No text found — try Enhanced or Black & white', 'err')
    } catch (e) { toast(String(e?.message || e).slice(0, 90) || 'OCR failed', 'err') } finally { setBusy('') }
  }
  const searchable = async () => {
    const out = await PDFDocument.create()
    for (const p of pages) { if (!p.ocr?.pdf) continue; const d = await PDFDocument.load(p.ocr.pdf); (await out.copyPages(d, d.getPageIndices())).forEach((x) => out.addPage(x)) }
    save(new Blob([await out.save()], { type: 'application/pdf' }), 'scan_searchable.pdf')
  }
  const cleanPdf = async () => {
    const out = await PDFDocument.create()
    for (const p of pages) { const c = outs.current.get(p.id) || processed(p), bw = fx.filter === 'bw', blob = await new Promise((r) => c.toBlob(r, bw ? 'image/png' : 'image/jpeg', 0.95)), img = bw ? await out.embedPng(new Uint8Array(await blob.arrayBuffer())) : await out.embedJpg(new Uint8Array(await blob.arrayBuffer())); out.addPage([c.width * 0.75, c.height * 0.75]).drawImage(img, { x: 0, y: 0, width: c.width * 0.75, height: c.height * 0.75 }) }
    save(new Blob([await out.save()], { type: 'application/pdf' }), 'scan.pdf')
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
                  <div className="flex items-center gap-1.5"><Btn small icon="undo" onClick={() => rotate(-1)} title="Rotate left" /><Btn small icon="rotate" onClick={() => rotate(1)} title="Rotate right" /><Btn small icon="wand" onClick={() => upd((p) => ({ ...p, quad: autoQuad(p.src) }))}>Auto</Btn><Btn small icon="crop" onClick={() => upd((p) => ({ ...p, quad: FULL() }))}>Full</Btn></div>
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
                  <label className="shrink-0 w-[72px] h-[92px] rounded-xl border-2 border-dashed grid place-items-center cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--copper)' }}><KIco n="plus" s={22} /><input type="file" hidden multiple accept="image/*,application/pdf" onChange={(e) => { onFiles([...e.target.files]); e.target.value = '' }} /></label>
                  <button type="button" onClick={() => setCam((c) => !c)} className="shrink-0 w-[72px] h-[92px] rounded-xl border-2 border-dashed grid place-items-center" style={{ borderColor: 'var(--border)', color: 'var(--copper)' }} aria-label="Camera"><KIco n="camera" s={22} /></button>
                </div>
                <AnimatePresence>{cam && <div className="mt-4"><CameraBox onShot={(c) => addCanvases([c], 'Photo')} onClose={() => setCam(false)} /></div>}</AnimatePresence>
              </Panel>
              <AnimatePresence>
                {(text || stats) && (
                  <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Panel>
                      <Label right={<div className="flex gap-1.5"><Btn small icon="copy" onClick={copy}>Copy</Btn><Btn small icon="file" onClick={() => save(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'scan.txt')}>.txt</Btn></div>}>Text</Label>
                      {stats && <div className="grid grid-cols-3 gap-3 mb-4"><Stat2 i={0} k="Words" v={<CountText value={stats.words} format={(v) => Math.round(v)} />} /><Stat2 i={1} k="Characters" v={<CountText value={stats.chars} format={(v) => Math.round(v)} />} /><Stat2 i={2} k="Confidence" v={<CountText value={stats.conf} format={(v) => Math.round(v) + '%'} />} /></div>}
                      <textarea className="input w-full" rows={12} dir={isRtl ? 'rtl' : 'auto'} value={text} onChange={(e) => setText(e.target.value)} style={{ fontSize: isRtl ? 18 : 14, lineHeight: 1.7 }} />
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
                <Btn primary className="w-full mt-4" icon="scan" busy={busy === 'ocr'} onClick={read}>Read text{pages.length > 1 ? ` · ${pages.length} pages` : ''}</Btn>
              </Panel>
              <Panel delay={0.15}>
                <Label>Save</Label>
                <div className="grid grid-cols-2 gap-2"><Btn icon="pdf" disabled={!pages.some((p) => p.ocr?.pdf)} onClick={searchable}>Searchable PDF</Btn><Btn icon="image" onClick={cleanPdf}>Scan PDF</Btn></div>
                <button type="button" className="text-[12px] font-semibold mt-3" style={{ color: 'var(--muted)' }} onClick={() => { setPages([]); setText(''); setStats(null); outs.current.clear(); srcUrls.current.clear(); stopOcr() }}>Start over</button>
              </Panel>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {toastNode}
    </div>
  )
}

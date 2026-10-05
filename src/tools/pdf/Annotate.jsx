import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Btn, Field, Empty, KIco, SPRING, uid, Range } from '../kit/ui.jsx'
import { DocSelect } from './shared.jsx'
import { renderCanvas, stampImages, redactPages, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from '../../lib/pdf/engine.js'

const FONTS = ['"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive', '"Lucida Handwriting", "Apple Chancery", cursive', 'Georgia, serif italic']
const dataBytes = async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer())

function SigPad({ onChange }) {
  const ref = useRef(null), drawing = useRef(false), [ink, setInk] = useState('#111111'), [dirty, setDirty] = useState(false)
  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [(e.clientX - r.left) * (ref.current.width / r.width), (e.clientY - r.top) * (ref.current.height / r.height)] }
  const down = (e) => { drawing.current = true; ref.current.setPointerCapture(e.pointerId); const c = ref.current.getContext('2d'), [x, y] = pos(e); c.strokeStyle = ink; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.1, y + 0.1); c.stroke() }
  const move = (e) => { if (!drawing.current) return; const c = ref.current.getContext('2d'), [x, y] = pos(e); c.lineTo(x, y); c.stroke(); c.beginPath(); c.moveTo(x, y) }
  const up = () => { if (!drawing.current) return; drawing.current = false; setDirty(true); crop() }
  const crop = () => {
    const c = ref.current, ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    if (x1 <= x0) return; const o = document.createElement('canvas'), pad = 6; o.width = x1 - x0 + pad * 2; o.height = y1 - y0 + pad * 2; o.getContext('2d').drawImage(c, x0 - pad, y0 - pad, o.width, o.height, 0, 0, o.width, o.height)
    onChange({ url: o.toDataURL('image/png'), ratio: o.width / o.height })
  }
  const clear = () => { ref.current.getContext('2d').clearRect(0, 0, 800, 280); setDirty(false); onChange(null) }
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line overflow-hidden relative" style={{ background: '#fff', touchAction: 'none' }}>
        <canvas ref={ref} width={800} height={280} className="w-full block cursor-crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        {!dirty && <div className="absolute inset-0 grid place-items-center pointer-events-none text-[13px] font-semibold" style={{ color: '#bbb' }}>Sign here with mouse, finger or pen</div>}
        <div className="absolute left-4 right-4 bottom-10 h-px" style={{ background: '#ddd' }} />
      </div>
      <div className="flex items-center gap-2"><span className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>Ink</span>{['#111111', '#1F3FBF', '#B3261E'].map((c) => <button key={c} type="button" aria-label={c} onClick={() => setInk(c)} className="w-7 h-7 rounded-full" style={{ background: c, outline: ink === c ? '2px solid var(--copper)' : 'none', outlineOffset: 2 }} />)}<span className="flex-1" /><Btn small icon="trash" onClick={clear}>Clear</Btn></div>
    </div>
  )
}

export default function Annotate({ docs, active, setActive, publish, toast }) {
  const doc = docs.find((d) => d.id === active) || docs[0]
  const [mode, setMode] = useState('sign'), [pg, setPg] = useState(0), [view, setView] = useState(null), [sigTab, setSigTab] = useState('draw'), [sig, setSig] = useState(null), [name, setName] = useState('Your Name'), [font, setFont] = useState(0)
  const [places, setPlaces] = useState([]), [boxes, setBoxes] = useState({}), [busy, setBusy] = useState(false), [draft, setDraft] = useState(null), [rmBg, setRmBg] = useState(true)
  const box = useRef(null)
  useEffect(() => { setPg(0); setPlaces([]); setBoxes({}) }, [doc?.id])
  useEffect(() => { if (!doc) return; let dead = false; setView(null); renderCanvas(doc, pg, { width: 760 }).then((c) => !dead && setView({ url: c.toDataURL('image/jpeg', 0.92), ratio: c.width / c.height })); return () => { dead = true } }, [doc?.id, pg])
  useEffect(() => { if (sigTab !== 'type') return; const c = document.createElement('canvas'); c.width = 900; c.height = 260; const x = c.getContext('2d'); x.font = `110px ${FONTS[font]}`; x.fillStyle = '#111'; x.textBaseline = 'middle'; const w = Math.min(880, x.measureText(name).width + 20); c.width = Math.max(40, w); x.font = `110px ${FONTS[font]}`; x.fillStyle = '#111'; x.textBaseline = 'middle'; x.fillText(name, 10, 130); const t = document.createElement('canvas'); t.width = c.width; t.height = 260; t.getContext('2d').drawImage(c, 0, 0); setSig({ url: t.toDataURL('image/png'), ratio: t.width / 260 }) }, [sigTab, name, font])
  if (!doc) return <Panel><Empty icon="sign" title="Add a PDF first" sub="Sign it with a drawn, typed or uploaded signature — or black out sensitive text for good." /></Panel>
  const upload = async (f) => {
    if (!f) return
    if (!Number.isFinite(Number(f.size)) || f.size <= 0 || f.size > MAX_IMAGE_BYTES) return toast('Signature images must be smaller than 25 MB.', 'err')
    let bm, c
    try {
      bm = await createImageBitmap(f)
      if (!bm.width || !bm.height || bm.width * bm.height > MAX_IMAGE_PIXELS) throw new RangeError('Signature images must be 32 megapixels or smaller.')
      c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height
      const x = c.getContext('2d')
      if (!x) throw new Error('Could not create a canvas for the signature image.')
      x.drawImage(bm, 0, 0)
      if (rmBg) { const d = x.getImageData(0, 0, c.width, c.height), a = d.data; for (let i = 0; i < a.length; i += 4) { const l = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]; if (l > 225) a[i + 3] = 0; else if (l > 150) a[i + 3] = Math.round(((225 - l) / 75) * 255) } x.putImageData(d, 0, 0) }
      setSig({ url: c.toDataURL('image/png'), ratio: c.width / c.height })
    } catch (e) { toast(e.message || 'Could not load this signature image.', 'err') }
    finally { bm?.close?.(); if (c) c.width = c.height = 0 }
  }
  const addSig = () => {
    if (!sig) return toast('Create a signature first', 'err')
    if (places.length >= 500) return toast('Place no more than 500 signatures in one PDF.', 'err')
    const ratio = view?.ratio || 0.72, w = Math.min(0.28, 0.72 * sig.ratio / ratio), h = (w * ratio) / sig.ratio
    setPlaces((p) => [...p, { id: uid(), page: pg, x: Math.min(0.6, 1 - w), y: Math.min(0.78, 1 - h), w, h, sig }])
  }
  const rel = (e) => { const r = box.current.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] }
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  const startDrag = (e, id, kind) => {
    e.stopPropagation(); const it = places.find((p) => p.id === id), [sx, sy] = rel(e), o = { ...it }
    const mv = (ev) => { const [x, y] = rel(ev); setPlaces((ps) => ps.map((p) => { if (p.id !== id) return p; if (kind === 'move') return { ...p, x: clamp(o.x + x - sx, 0, 1 - p.w), y: clamp(o.y + y - sy, 0, 1 - p.h) }; const ratio = view?.ratio || 0.72, maxW = Math.min(1 - p.x, (1 - p.y) * p.sig.ratio / ratio), w = clamp(o.w + (x - sx), Math.min(0.06, maxW), maxW); return { ...p, w, h: (w * ratio) / p.sig.ratio } })) }
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const startDraw = (e) => { if (mode !== 'redact') return; const [x, y] = rel(e); const mv = (ev) => { const [a, b] = rel(ev); setDraft({ x: clamp(Math.min(x, a)), y: clamp(Math.min(y, b)), w: Math.abs(clamp(a) - x), h: Math.abs(clamp(b) - y) }) }; const up = (ev) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); const [a, b] = rel(ev), r = { id: uid(), x: clamp(Math.min(x, a)), y: clamp(Math.min(y, b)), w: Math.abs(clamp(a) - x), h: Math.abs(clamp(b) - y) }; setDraft(null); if (r.w > 0.01 && r.h > 0.006) setBoxes((bs) => ({ ...bs, [pg]: [...(bs[pg] || []), r] })) }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up) }
  const nRed = Object.values(boxes).reduce((a, b) => a + b.length, 0)
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      let bytes = doc.bytes
      if (nRed) bytes = await redactPages({ ...doc, bytes, id: doc.id }, boxes, 2.5)
      if (places.length) { const pl = []; for (const p of places) pl.push({ key: p.sig.url.slice(-40) + p.sig.url.length, data: await dataBytes(p.sig.url), page: p.page, x: p.x, y: p.y, w: p.w, h: p.h }); bytes = await stampImages(bytes, pl) }
      publish(bytes, doc.name.replace(/\.pdf$/i, '') + (nRed ? '_redacted' : '_signed') + '.pdf', [places.length && `${places.length} signature${places.length > 1 ? 's' : ''}`, nRed && `${nRed} area${nRed > 1 ? 's' : ''} permanently blacked out`].filter(Boolean).join(' · '), true)
    } catch (e) { toast(e.message || 'Failed', 'err') } finally { setBusy(false) }
  }
  const pagePlaces = places.filter((p) => p.page === pg), pageBoxes = boxes[pg] || []
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Seg small className="w-[260px]" value={mode} onChange={setMode} options={[['sign', 'Sign'], ['redact', 'Redact']]} />
          <div className="flex items-center gap-2"><Btn small icon="arrowRight" className="[&_svg]:rotate-180" disabled={pg === 0} onClick={() => setPg(pg - 1)} /><span className="mono text-[12.5px] font-bold w-14 text-center">{pg + 1} / {doc.pages}</span><Btn small icon="arrowRight" disabled={pg >= doc.pages - 1} onClick={() => setPg(pg + 1)} /></div>
        </div>
        <DocSelect docs={docs} value={doc.id} onChange={setActive} />
        <div className="mt-4 rounded-xl overflow-hidden mx-auto select-none" style={{ background: 'var(--surface2)', maxWidth: 640, touchAction: mode === 'redact' ? 'none' : 'auto' }}>
          {view ? (
            <div ref={box} className="relative" style={{ aspectRatio: view.ratio, cursor: mode === 'redact' ? 'crosshair' : 'default' }} onPointerDown={startDraw}>
              <img src={view.url} alt={`Page ${pg + 1}`} className="absolute inset-0 w-full h-full" draggable={false} />
              <AnimatePresence>{pageBoxes.map((b) => <motion.div key={b.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute group" style={{ left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%', background: 'rgba(0,0,0,.88)', outline: '2px solid #C3423F' }}><button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setBoxes((bs) => ({ ...bs, [pg]: bs[pg].filter((x) => x.id !== b.id) }))} className="absolute -top-3 -right-3 w-6 h-6 rounded-full grid place-items-center text-white" style={{ background: '#C3423F' }} aria-label="Remove box"><KIco n="x" s={12} /></button></motion.div>)}</AnimatePresence>
              {draft && <div className="absolute" style={{ left: draft.x * 100 + '%', top: draft.y * 100 + '%', width: draft.w * 100 + '%', height: draft.h * 100 + '%', background: 'rgba(0,0,0,.45)', outline: '2px dashed #C3423F' }} />}
              {pagePlaces.map((p) => (
                <div key={p.id} onPointerDown={(e) => startDrag(e, p.id, 'move')} className="absolute cursor-move" style={{ left: p.x * 100 + '%', top: p.y * 100 + '%', width: p.w * 100 + '%', height: p.h * 100 + '%', outline: '2px dashed var(--copper)', outlineOffset: 2, touchAction: 'none' }}>
                  <img src={p.sig.url} alt="Signature" className="w-full h-full pointer-events-none" draggable={false} />
                  <span onPointerDown={(e) => startDrag(e, p.id, 'size')} className="absolute -bottom-3 -right-3 w-6 h-6 rounded-full border-2 bg-white cursor-nwse-resize" style={{ borderColor: 'var(--copper)' }} />
                  <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setPlaces((ps) => ps.filter((x) => x.id !== p.id))} className="absolute -top-3 -right-3 w-6 h-6 rounded-full grid place-items-center text-white" style={{ background: '#C3423F' }} aria-label="Remove signature"><KIco n="x" s={12} /></button>
                </div>))}
            </div>) : <div className="grid place-items-center" style={{ minHeight: 420 }}><motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }}><KIco n="pdf" s={34} /></motion.div></div>}
        </div>
        {mode === 'redact' && <div className="text-[12.5px] mt-3 text-center" style={{ color: 'var(--muted)' }}>Drag on the page to cover text or images. Redacted pages are flattened to pictures so the hidden content is really gone.</div>}
      </Panel>
      <div className="space-y-5">
        {mode === 'sign' ? (
          <Panel delay={0.06}>
            <Label>Your signature</Label>
            <Seg small value={sigTab} onChange={(v) => { setSigTab(v); if (v !== 'type') setSig(null) }} options={[['draw', 'Draw'], ['type', 'Type'], ['upload', 'Upload']]} />
            <div className="mt-4">
              {sigTab === 'draw' && <SigPad onChange={setSig} />}
              {sigTab === 'type' && <div className="space-y-3"><Field label="Name"><input className="input" maxLength={128} value={name} onChange={(e) => setName(e.target.value)} /></Field><div className="grid grid-cols-3 gap-2">{FONTS.map((f, i) => <button key={i} type="button" onClick={() => setFont(i)} className="rounded-xl py-3 text-[22px] border" style={{ fontFamily: f, borderColor: font === i ? 'var(--copper)' : 'var(--border)', background: 'var(--surface)' }}>{name.slice(0, 7) || 'Sign'}</button>)}</div></div>}
              {sigTab === 'upload' && <div className="space-y-3"><input type="file" accept="image/*" className="input" onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} /><label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={rmBg} onChange={(e) => setRmBg(e.target.checked)} /> Remove white paper background</label></div>}
            </div>
            {sig && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl p-3 grid place-items-center" style={{ background: '#fff', border: '1px dashed var(--border)' }}><img src={sig.url} alt="" style={{ maxHeight: 70 }} /></motion.div>}
            <Btn className="w-full mt-4" icon="plus" onClick={addSig} disabled={!sig}>Place on page {pg + 1}</Btn>
          </Panel>
        ) : (
          <Panel delay={0.06}><Label>Redactions</Label><div className="text-center py-3"><div className="display font-semibold text-[44px] leading-none">{nRed}</div><div className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>area{nRed === 1 ? '' : 's'} marked on {Object.values(boxes).filter((b) => b.length).length} page(s)</div></div><Btn small className="w-full" icon="trash" danger disabled={!nRed} onClick={() => setBoxes({})}>Clear all</Btn></Panel>
        )}
        <Panel delay={0.12}>
          <div className="text-[12.5px] mb-3" style={{ color: 'var(--muted)' }}>{places.length} signature{places.length === 1 ? '' : 's'} · {nRed} redaction{nRed === 1 ? '' : 's'}</div>
          <Btn primary className="w-full" icon="download" busy={busy} disabled={busy || (!places.length && !nRed)} onClick={run}>Build PDF</Btn>
        </Panel>
      </div>
    </div>
  )
}

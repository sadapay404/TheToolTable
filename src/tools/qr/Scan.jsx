import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QIco, Btn, Panel, Label, Seg, Switch, Drop, SPRING, useToast, CountText } from './ui.jsx'
import { useQR, useStore, uid } from './store.js'
import { decodeSource } from '../../lib/qr/zx.js'
import { parse } from '../../lib/qr/parse.js'
import { recentAction } from '../../lib/utils.js'
import ResultCard from './Result.jsx'

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open this image')); i.src = src })
const POLY = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
const COLORS = ['#B4715A', '#2F9C6B', '#3E8ED0', '#7C4DFF', '#D9962B', '#C3423F']

/** auto-levels + hard contrast: helps faded / glossy photos */
function enhance(img) {
  const k = Math.min(1, 2200 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))
  const c = document.createElement('canvas'); c.width = Math.round((img.naturalWidth || img.width) * k); c.height = Math.round((img.naturalHeight || img.height) * k)
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height)
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data
  let lo = 255, hi = 0
  for (let i = 0; i < a.length; i += 4) { const g = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) | 0; if (g < lo) lo = g; if (g > hi) hi = g }
  const span = Math.max(30, hi - lo)
  for (let i = 0; i < a.length; i += 4) { let g = ((a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) - lo) / span; g = Math.min(1, Math.max(0, (g - 0.5) * 1.8 + 0.5)); a[i] = a[i + 1] = a[i + 2] = g * 255 }
  x.putImageData(d, 0, 0)
  return c
}

export default function Scan() {
  const { editFrom } = useQR()
  const [toastNode, toast] = useToast()
  const [mode, setMode] = useState('image')
  const [shot, setShot] = useState(null) // {url,w,h}
  const [found, setFound] = useState(null)
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState(false)
  const [scans, setScans] = useStore('scans', [])
  const [cam, setCam] = useState({ on: false, err: '', facing: 'environment', torch: false, torchOk: false, keep: false })
  const camRef = useRef({ stream: null, timer: 0, last: '', lastT: 0 })
  const video = useRef(), overlay = useRef(), work = useRef(document.createElement('canvas'))
  const imgRef = useRef(null)

  const remember = useCallback((items, src) => {
    if (!items.length) return
    setScans((list) => {
      let out = list
      items.forEach((it) => { if (out[0] && out[0].text === it.text && Date.now() - out[0].t < 8000) return; const p = parse(it.text, it.format); out = [{ id: uid(), t: Date.now(), text: it.text, format: it.format, type: p.type, label: p.label, title: p.title, fav: false, src }, ...out] })
      return out.slice(0, 300)
    })
  }, [setScans])

  const runOn = useCallback(async (el, url, src, { hard = true } = {}) => {
    setBusy(true)
    try {
      const d = await decodeSource(el, { formats: ['All'], max: 20, hard })
      setShot(url ? { url, w: d.w, h: d.h } : null); setFound(d); setSel(0)
      if (d.items.length) { remember(d.items, src); recentAction(`Scanned ${d.items.length} code${d.items.length > 1 ? 's' : ''}`) }
      return d
    } catch (e) { toast(e.message || 'Could not read that image', true) } finally { setBusy(false) }
  }, [remember, toast])

  const fromFile = useCallback(async (file) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    try { const img = await loadImg(url); imgRef.current = img; await runOn(img, url, 'image') } catch (e) { toast(e.message, true) }
  }, [runOn, toast])

  useEffect(() => {
    if (mode !== 'image') return
    const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')) || [...(e.clipboardData?.items || [])].map((i) => i.getAsFile?.()).find((x) => x && x.type.startsWith('image/')); if (f) { e.preventDefault(); fromFile(f) } }
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste)
  }, [mode, fromFile])

  /* ---------- camera ---------- */
  const stopCam = useCallback(() => {
    const c = camRef.current; clearTimeout(c.timer); c.stream?.getTracks().forEach((t) => t.stop()); c.stream = null
    setCam((s) => ({ ...s, on: false, torch: false }))
  }, [])
  useEffect(() => () => { const c = camRef.current; clearTimeout(c.timer); c.stream?.getTracks().forEach((t) => t.stop()) }, [])
  useEffect(() => { if (mode !== 'camera') stopCam() }, [mode, stopCam])

  const drawOverlay = (items, w, h) => {
    const cv = overlay.current; if (!cv) return
    cv.width = cv.clientWidth * 2; cv.height = cv.clientHeight * 2
    const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height)
    const vw = video.current.videoWidth, vh = video.current.videoHeight
    const s = Math.max(cv.width / vw, cv.height / vh), ox = (cv.width - vw * s) / 2, oy = (cv.height - vh * s) / 2
    items.forEach((it, i) => { x.beginPath(); it.pts.forEach((p, j) => { const X = p.x * s + ox, Y = p.y * s + oy; j ? x.lineTo(X, Y) : x.moveTo(X, Y) }); x.closePath(); x.lineWidth = 6; x.strokeStyle = COLORS[i % COLORS.length]; x.fillStyle = COLORS[i % COLORS.length] + '33'; x.fill(); x.stroke() })
  }
  const loop = useCallback(async () => {
    const c = camRef.current, v = video.current
    if (!c.stream || !v) return
    if (v.readyState >= 2 && v.videoWidth) {
      const cv = work.current; const k = Math.min(1, 960 / v.videoWidth); cv.width = v.videoWidth * k; cv.height = v.videoHeight * k
      const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0, cv.width, cv.height)
      try {
        const d = await decodeSource(cv, { formats: ['All'], max: 8, hard: false, maxDim: 960 })
        const scaled = d.items.map((it) => ({ ...it, pts: it.pts.map((p) => ({ x: p.x / k, y: p.y / k })) }))
        drawOverlay(scaled, v.videoWidth, v.videoHeight)
        if (d.items.length) {
          const key = d.items.map((i) => i.text).join('|')
          if (key !== c.last || Date.now() - c.lastT > 4000) {
            c.last = key; c.lastT = Date.now()
            setFound({ w: v.videoWidth, h: v.videoHeight, items: scaled }); setSel(0); remember(scaled, 'camera'); recentAction('Camera scan')
            if (navigator.vibrate) navigator.vibrate(60)
            if (!camStateRef.current.keep) { stopCam(); return }
          }
        } else drawOverlay([], 0, 0)
      } catch {}
    }
    c.timer = setTimeout(loop, 140)
  }, [remember, stopCam])
  const camStateRef = useRef(cam); camStateRef.current = cam

  const startCam = async (facing = cam.facing) => {
    stopCam(); setFound(null); setShot(null)
    if (!navigator.mediaDevices?.getUserMedia) { setCam((s) => ({ ...s, err: 'Camera access needs a secure (https) page and a supported browser.' })); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      camRef.current.stream = stream; camRef.current.last = ''
      const t = stream.getVideoTracks()[0]; const caps = t.getCapabilities?.() || {}
      setCam((s) => ({ ...s, on: true, err: '', facing, torch: false, torchOk: !!caps.torch }))
      requestAnimationFrame(async () => { const v = video.current; if (!v) return; v.srcObject = stream; try { await v.play() } catch {} loop() })
    } catch (e) { setCam((s) => ({ ...s, on: false, err: e.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow it in the address bar, or use an image instead.' : e.name === 'NotFoundError' ? 'No camera found on this device.' : 'Could not start the camera: ' + (e.message || e.name) })) }
  }
  const toggleTorch = async () => { const t = camRef.current.stream?.getVideoTracks()[0]; if (!t) return; try { await t.applyConstraints({ advanced: [{ torch: !cam.torch }] }); setCam((s) => ({ ...s, torch: !s.torch })) } catch { toast('Torch not available', true) } }

  const grabScreen = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) { toast('Screen capture isn’t supported in this browser', true); return }
    try {
      const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const v = document.createElement('video'); v.srcObject = st; v.muted = true; await v.play(); await new Promise((r) => setTimeout(r, 450))
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0)
      st.getTracks().forEach((t) => t.stop())
      const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const url = URL.createObjectURL(blob)
      imgRef.current = c; await runOn(c, url, 'screen')
    } catch (e) { if (e.name !== 'NotAllowedError') toast('Screen capture failed', true) }
  }
  const retryEnhanced = async () => { if (!imgRef.current) return; const c = enhance(imgRef.current); const d = await runOn(c, shot?.url, 'image'); if (d && !d.items.length) toast('Still nothing readable in that image', true); else toast('Found it with enhanced contrast') }
  const demo = async () => {
    const { buildQR, toCanvas, DEFAULT_STYLE } = await import('../../lib/qr/render.js')
    const c = await toCanvas(buildQR('https://thetooltable.app/hello', { ...DEFAULT_STYLE, frame: { ...DEFAULT_STYLE.frame, style: 'label-bottom' } }), 700, { bg: '#fff' })
    imgRef.current = c; await runOn(c, c.toDataURL(), 'image')
  }

  const items = found?.items || []
  const cur = items[Math.min(sel, items.length - 1)]
  const rec = cur && scans.find((s) => s.text === cur.text)
  const toggleFav = () => { if (!rec) return; setScans((l) => l.map((x) => (x.id === rec.id ? { ...x, fav: !x.fav } : x))) }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)] items-start">
      <Panel delay={0.02}>
        <Label right={<span className="mono text-[11px]" style={{ color: 'var(--muted)' }}>{scans.length} in history</span>}>Scanner</Label>
        <Seg value={mode} onChange={setMode} options={[['image', 'Image'], ['camera', 'Live camera'], ['screen', 'Screen']]} />
        <div className="mt-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {mode === 'image' && (!shot ? (
                <div className="space-y-3">
                  <Drop icon="upload" onFiles={(f) => fromFile(f[0])} label="Drop an image, click to browse, or paste (Ctrl+V)"><span className="text-[12px]" style={{ color: 'var(--muted)' }}>Photos, screenshots, posters — finds every code in the picture</span></Drop>
                  <div className="flex flex-wrap gap-2 items-center"><Btn small icon="sparkle" onClick={demo} busy={busy}>Try a sample</Btn><span className="text-[12px]" style={{ color: 'var(--muted)' }}>Reads QR, Data Matrix, Aztec, PDF417, EAN/UPC, Code 39/93/128, ITF, Codabar and more.</span></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-line" style={{ background: 'var(--surface2)' }}>
                    <img src={shot.url} alt="Scanned" className="block w-full max-h-[520px] object-contain" />
                    <svg viewBox={`0 0 ${shot.w} ${shot.h}`} className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid meet" style={{ objectFit: 'contain' }}>
                      {items.map((it, i) => <motion.g key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 * i }}>
                        <polygon points={POLY(it.pts)} fill={COLORS[i % 6] + (i === sel ? '55' : '22')} stroke={COLORS[i % 6]} strokeWidth={Math.max(shot.w, shot.h) / 160} strokeLinejoin="round" />
                        <g transform={`translate(${it.pts[0].x} ${it.pts[0].y})`}><circle r={Math.max(shot.w, shot.h) / 48} fill={COLORS[i % 6]} /><text textAnchor="middle" dominantBaseline="central" fontSize={Math.max(shot.w, shot.h) / 40} fontWeight="800" fill="#fff" fontFamily="Arial">{i + 1}</text></g>
                      </motion.g>)}
                    </svg>
                    <AnimatePresence>{busy && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(255,255,255,.55)' }}><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ color: 'var(--copper)' }}><QIco n="refresh" s={32} /></motion.span></motion.div>}</AnimatePresence>
                  </div>
                  <div className="flex flex-wrap gap-2"><Btn small icon="upload" onClick={() => { setShot(null); setFound(null) }}>New image</Btn>{!items.length && <Btn small icon="wand" copper onClick={retryEnhanced} busy={busy}>Try enhanced contrast</Btn>}</div>
                </div>
              ))}
              {mode === 'camera' && (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-line aspect-[4/3]" style={{ background: '#0c0a09' }}>
                    <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                    <canvas ref={overlay} className="absolute inset-0 w-full h-full pointer-events-none" />
                    {cam.on ? <>
                      <div className="absolute inset-[12%] pointer-events-none">
                        {[[0, 0, 'tl'], [1, 0, 'tr'], [0, 1, 'bl'], [1, 1, 'br']].map(([x, y, k]) => <motion.span key={k} className="absolute w-9 h-9" style={{ [x ? 'right' : 'left']: 0, [y ? 'bottom' : 'top']: 0, borderColor: '#fff', borderStyle: 'solid', borderWidth: 0, [x ? 'borderRightWidth' : 'borderLeftWidth']: 4, [y ? 'borderBottomWidth' : 'borderTopWidth']: 4, borderRadius: 10 }} animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} />)}
                        <motion.div className="absolute left-2 right-2 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg,transparent,#B4715A,transparent)', boxShadow: '0 0 14px #B4715A' }} animate={{ top: ['6%', '94%', '6%'] }} transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }} />
                      </div>
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold text-white" style={{ background: 'rgba(0,0,0,.55)' }}><motion.span className="w-2 h-2 rounded-full" style={{ background: '#e5484d' }} animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} />SCANNING</div>
                    </> : <div className="absolute inset-0 grid place-items-center text-center p-6"><div><span style={{ color: '#B4715A' }}><QIco n="camera" s={40} /></span><div className="text-white text-[14px] font-semibold mt-3">Point your camera at any QR code or barcode</div><div className="text-[12px] mt-1.5" style={{ color: 'rgba(255,255,255,.6)' }}>Everything is decoded on this device — video never leaves it.</div></div></div>}
                  </div>
                  {cam.err && <div className="text-[12.5px] font-semibold rounded-xl p-3" style={{ background: 'color-mix(in srgb, #C3423F 10%, var(--surface))', color: '#C3423F' }}>{cam.err}</div>}
                  <div className="flex flex-wrap items-center gap-2">
                    {!cam.on ? <Btn solid icon="camera" onClick={() => startCam()}>Start camera</Btn> : <Btn solid icon="pause" onClick={stopCam}>Stop</Btn>}
                    <Btn small icon="flip" disabled={!cam.on} onClick={() => startCam(cam.facing === 'environment' ? 'user' : 'environment')}>Flip camera</Btn>
                    {cam.torchOk && <Btn small icon="torch" copper={cam.torch} onClick={toggleTorch}>Torch</Btn>}
                  </div>
                  <Switch on={cam.keep} onChange={(keep) => setCam((s) => ({ ...s, keep }))} label="Keep scanning" hint="Stay on after each code — for stock-taking or tickets" />
                </div>
              )}
              {mode === 'screen' && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-line grid place-items-center text-center py-14 px-6" style={{ background: 'var(--surface2)' }}><div><span style={{ color: 'var(--copper)' }}><QIco n="screen" s={40} /></span><div className="text-[14px] font-semibold mt-3">Scan a code that’s on your screen</div><div className="text-[12.5px] mt-1.5 max-w-sm mx-auto" style={{ color: 'var(--muted)' }}>Pick a window or tab that shows the code. We grab one frame, decode it here, and stop sharing straight away.</div></div></div>
                  <Btn solid icon="screen" onClick={grabScreen} busy={busy}>Capture screen</Btn>
                  {shot && <img src={shot.url} alt="Captured" className="w-full rounded-xl border border-line" />}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </Panel>

      <div className="space-y-4 lg:sticky lg:top-24">
        <Panel delay={0.08}>
          <Label right={items.length ? <motion.span key={items.length} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="mono text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><CountText value={items.length} format={(v) => Math.round(v)} /> found</motion.span> : null}>Result</Label>
          <AnimatePresence mode="wait" initial={false}>
            {!found ? (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-10 text-center"><motion.span animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.4 }} className="inline-block" style={{ color: 'var(--copper)' }}><QIco n="scan" s={38} /></motion.span><div className="text-[13.5px] font-semibold mt-3">Nothing scanned yet</div><div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>Results appear here with smart actions and a safety check.</div></motion.div>
            ) : !items.length ? (
              <motion.div key="none" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="py-8 text-center"><span style={{ color: '#C3423F' }}><QIco n="warn" s={34} /></span><div className="text-[14px] font-bold mt-3">No code found</div><div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>Try a sharper, closer photo with the whole code in view — or the enhanced-contrast retry.</div></motion.div>
            ) : (
              <motion.div key={cur.text + sel} className="space-y-4">
                {items.length > 1 && <div className="flex flex-wrap gap-1.5">{items.map((it, i) => <motion.button key={i} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} onClick={() => setSel(i)} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold" style={{ borderColor: i === sel ? COLORS[i % 6] : 'var(--border)', background: i === sel ? COLORS[i % 6] : 'var(--surface)', color: i === sel ? '#fff' : 'var(--ink)' }}><span>{i + 1}</span><span className="font-medium opacity-80">{it.format}</span></motion.button>)}</div>}
                <ResultCard item={cur} onEdit={editFrom} fav={rec?.fav} onFav={rec ? toggleFav : null} toast={toast} />
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
        {scans.length > 0 && <Panel delay={0.14} className="!p-4">
          <Label>Recent</Label>
          <div className="space-y-1.5">{scans.slice(0, 4).map((s) => <motion.button key={s.id} type="button" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} whileHover={{ x: 4 }} onClick={() => { setFound({ w: 1, h: 1, items: [{ text: s.text, format: s.format, pts: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] }] }); setSel(0); setShot(null); setMode('image') }} className="w-full flex items-center gap-2.5 text-left rounded-xl px-2.5 py-2" style={{ background: 'var(--surface2)' }}><span className="w-7 h-7 rounded-lg grid place-items-center shrink-0" style={{ background: 'var(--surface)', color: 'var(--copper)' }}><QIco n={parse(s.text, s.format).icon} s={15} /></span><span className="min-w-0"><span className="block text-[12.5px] font-semibold truncate">{s.title || s.text}</span><span className="block text-[11px]" style={{ color: 'var(--muted)' }}>{s.label} · {new Date(s.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span></motion.button>)}</div>
        </Panel>}
      </div>
      {toastNode}
    </div>
  )
}

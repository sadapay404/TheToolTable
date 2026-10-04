import { perf } from '../lib/perf.js'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import fixWebm from 'fix-webm-duration'
import { Dropzone, AnimatedNumber } from '../components/ui.jsx'
import { Icon, Slider, SPRING } from './studio/controls.jsx'
import { LooksPanel, StylePanel, ColourPanel, BackdropPanel, TextPanel, MotionPanel, ExportPanel } from './viz/Panels.jsx'
import { WaveScrubber, HeroBars, clock } from './viz/parts.jsx'
import { Analyzer, synth, bandsFromAnalyser, NB } from '../lib/viz/analyzer.js'
import { VizRenderer } from '../lib/viz/render.js'
import { DEFAULTS, LOOKS, PALETTES, STYLES, KEEP, SECTION_KEYS, RATIOS, exportDims, applyLook, randomLook } from '../lib/viz/params.js'
import { makeDemoTrack } from '../lib/viz/demo.js'
import { download, baseName, recentAction, fmtBytes } from '../lib/utils.js'

const SECTIONS = ['looks', 'style', 'colour', 'backdrop', 'text', 'motion', 'export']
const LABEL = { looks: 'Looks', style: 'Style', colour: 'Colour', backdrop: 'Backdrop', text: 'Text', motion: 'Motion', export: 'Export' }
const ICON = { looks: 'looks', style: 'viz', colour: 'palette', backdrop: 'image', text: 'type', motion: 'motion', export: 'export' }
const TITLES = { looks: ['Looks', 'One click restyles everything — your words and pictures stay.'], style: ['Visual style', 'Pick a visualizer, then shape it.'], colour: ['Colour & light', 'Palettes, gradients and glow.'], backdrop: ['Backdrop', 'Behind the visuals.'], text: ['Text & cover', 'Titles, progress and album art.'], motion: ['Audio response', 'How the picture reacts to sound.'], export: ['Export', 'Render a shareable video.'] }
const PANEL = { looks: LooksPanel, style: StylePanel, colour: ColourPanel, backdrop: BackdropPanel, text: TextPanel, motion: MotionPanel, export: ExportPanel }
const LS_P = 'ttt.viz.params', LS_L = 'ttt.viz.looks'

function loadParams() {
  try {
    const p = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_P) || '{}') }
    if (p.bgType === 'image') p.bgType = 'gradient'
    return p
  } catch { return { ...DEFAULTS } }
}
const loadLooks = () => { try { return JSON.parse(localStorage.getItem(LS_L) || '[]') } catch { return [] } }
const MP4 = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']
const WEBM = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
const supported = (list) => typeof MediaRecorder !== 'undefined' ? list.find((m) => MediaRecorder.isTypeSupported(m)) : null
const BASE_MBPS = { draft: 8, good: 14, max: 24 }

/* ------------------------------------------------ transport ------------------------------------------------ */
function Transport({ audioRef, peaks, peaksLoading, dur, range, onRange, playing, toggle, vol, setVol, disabled }) {
  const [time, setTime] = useState(0)
  useEffect(() => {
    const el = audioRef.current; if (!el) return
    const f = () => setTime(el.currentTime)
    const id = setInterval(() => { if (!el.paused) f() }, 66)
    el.addEventListener('seeked', f); el.addEventListener('loadedmetadata', f)
    return () => { clearInterval(id); el.removeEventListener('seeked', f); el.removeEventListener('loadedmetadata', f) }
  }, [audioRef])
  const seek = (t) => { const el = audioRef.current; if (el) { el.currentTime = t; setTime(t) } }
  return (
    <motion.div className="shrink-0 flex items-center gap-3.5 px-4 py-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.25 }}
      style={{ background: 'rgba(255,255,255,.035)', borderTop: '1px solid rgba(255,255,255,.07)' }}>
      <motion.button type="button" onClick={toggle} disabled={disabled} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.88 }} aria-label={playing ? 'Pause' : 'Play'} className="w-11 h-11 rounded-full grid place-items-center shrink-0"
        style={{ background: 'var(--copper)', color: '#fff', boxShadow: '0 8px 20px -6px var(--copper)' }}>
        <AnimatePresence mode="wait" initial={false}><motion.span key={playing ? 'p' : 'o'} initial={{ scale: 0.4, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.15 }}><Icon n={playing ? 'pause' : 'play'} s={18} /></motion.span></AnimatePresence>
      </motion.button>
      <div className="mono text-[12px] tabular-nums shrink-0 w-[88px]" style={{ color: '#ddd' }}>{clock(time)} <span style={{ opacity: 0.45 }}>/ {clock(dur)}</span></div>
      <div className="flex-1 min-w-0"><WaveScrubber peaks={peaks} loading={peaksLoading} time={time} dur={dur} range={range} onSeek={seek} onRange={onRange} disabled={disabled} /></div>
      <div className="hidden md:flex items-center gap-2 w-[112px] shrink-0" style={{ color: '#ddd' }}>
        <button aria-label="Mute" onClick={() => setVol(vol > 0 ? 0 : 0.9)} className="shrink-0"><Icon n={vol > 0 ? 'vol' : 'mute'} s={17} /></button>
        <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(+e.target.value)} className="w-full accent-[var(--copper)]" aria-label="Volume" />
      </div>
    </motion.div>
  )
}

const TBtn = ({ icon, label, onClick, disabled, active }) => (
  <motion.button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} whileHover={{ scale: 1.14 }} whileTap={{ scale: 0.82, rotate: -8 }}
    className="w-8 h-8 rounded-full grid place-items-center" style={{ opacity: disabled ? 0.35 : 1, background: active ? 'rgba(255,255,255,.18)' : 'transparent' }}><Icon n={icon} s={16} /></motion.button>
)

export default function Visualizer() {
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [dur, setDur] = useState(0)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [vol, setVol] = useState(0.9)
  const [section, setSection] = useState('looks')
  const [P, setP] = useState(loadParams)
  const [activeLook, setActiveLook] = useState(null)
  const [myLooks, setMyLooks] = useState(loadLooks)
  const [matchBg, setMatchBg] = useState(true)
  const [diceTick, setDiceTick] = useState(0)
  const [hist, setHist] = useState(0)
  const [assets, setAssets] = useState({ bg: null, cover: null })
  const [bgUrl, setBgUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [peaks, setPeaks] = useState(null)
  const [peaksLoading, setPeaksLoading] = useState(false)
  const [range, setRange] = useState(null)
  const canMp4 = useMemo(() => !!supported(MP4), [])
  const [exp, setExpState] = useState({ ratio: '16:9', res: '1080p', fps: 30, q: 'good', fmt: canMp4 ? 'mp4' : 'webm', audio: true })
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(0)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  const [full, setFull] = useState(false)
  const [stageSize, setStageSize] = useState({ w: 900, h: 520 })

  const audioRef = useRef(null), canvasRef = useRef(null), stageRef = useRef(null), colRef = useRef(null)
  const fileRef = useRef(null), bgRef = useRef(null), coverRef = useRef(null), looksRef = useRef(null)
  const PR = useRef(P); PR.current = P
  const assetsRef = useRef(assets); assetsRef.current = assets
  const an = useRef(new Analyzer())
  const gRef = useRef(null), volRef = useRef(vol); volRef.current = vol
  const exportRef = useRef(null)
  const past = useRef([]), future = useRef([]), group = useRef({ open: false, t: 0 })
  const expRef = useRef(exp); expRef.current = exp
  const rangeRef = useRef([0, 0])

  const rangeEff = range || [0, dur]
  rangeRef.current = rangeEff
  const outDims = useMemo(() => exportDims(exp.ratio, exp.res), [exp.ratio, exp.res])
  const outRef = useRef(outDims); outRef.current = outDims

  useEffect(() => { try { localStorage.setItem(LS_P, JSON.stringify(P)) } catch {} }, [P])
  useEffect(() => { try { localStorage.setItem(LS_L, JSON.stringify(myLooks)) } catch {} }, [myLooks])

  /* ---------------- params + history ---------------- */
  const touch = () => setHist((n) => n + 1)
  const beginGroup = (commit) => {
    const g = group.current
    if (!g.open) { past.current.push(PR.current); if (past.current.length > 80) past.current.shift(); future.current = []; g.open = true }
    clearTimeout(g.t); g.t = setTimeout(() => { g.open = false }, commit ? 0 : 650)
  }
  const upd = useCallback((patch, commit = false) => {
    beginGroup(commit)
    const next = { ...PR.current, ...patch }; PR.current = next; setP(next); setActiveLook(null); touch()
  }, [])
  const setWhole = (next, lookId = null) => {
    group.current.open = false; beginGroup(true)
    PR.current = next; setP(next); setActiveLook(lookId); touch()
  }
  const undo = () => { if (!past.current.length) return; future.current.push(PR.current); const p = past.current.pop(); PR.current = p; setP(p); setActiveLook(null); touch() }
  const redo = () => { if (!future.current.length) return; past.current.push(PR.current); const p = future.current.pop(); PR.current = p; setP(p); setActiveLook(null); touch() }
  const sl = (key, label, o = {}) => <Slider key={key} label={label} value={P[key]} def={DEFAULTS[key]} onChange={(v) => upd({ [key]: v })} {...o} />

  /* ---------------- looks ---------------- */
  const applyBuiltIn = (l) => setWhole(applyLook(PR.current, l), l.id)
  const applyCustom = (l) => setWhole(applyLook(PR.current, l), l.id)
  const surprise = () => { setWhole(randomLook(PR.current)); setDiceTick((n) => n + 1) }
  const saveLook = (name) => {
    const p = { ...PR.current }; KEEP.forEach((k) => delete p[k])
    const l = { id: 'u' + Date.now(), name: name.trim() || `My look ${myLooks.length + 1}`, p }
    setMyLooks((a) => [l, ...a]); setActiveLook(l.id)
  }
  const deleteLook = (id) => setMyLooks((a) => a.filter((l) => l.id !== id))
  const exportLooks = () => download(new Blob([JSON.stringify(myLooks, null, 2)], { type: 'application/json' }), 'thetooltable-visualizer-looks.json')
  const onLookFile = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return
    try {
      const arr = JSON.parse(await f.text()), list = (Array.isArray(arr) ? arr : [arr]).filter((l) => l && l.p && typeof l.p === 'object')
      if (!list.length) throw new Error()
      setMyLooks((a) => [...list.map((l, i) => ({ id: 'u' + Date.now() + i, name: String(l.name || 'Imported look').slice(0, 28), p: l.p })), ...a])
    } catch { setErr('That file is not a TheToolTable look export.') }
  }

  /* ---------------- images ---------------- */
  const loadAsset = async (kind, f) => {
    if (!f) return
    try {
      const bmp = await createImageBitmap(f), u = URL.createObjectURL(f)
      setAssets((a) => ({ ...a, [kind]: bmp }))
      if (kind === 'bg') { setBgUrl(u); upd({ bgType: 'image' }, true) } else { setCoverUrl(u); upd({ cover: PR.current.cover === 'off' ? 'circle' : PR.current.cover }, true) }
    } catch { setErr('Could not read that image.') }
  }
  const clearBg = () => { setAssets((a) => ({ ...a, bg: null })); setBgUrl(''); upd({ bgType: 'gradient' }, true) }
  const clearCover = () => { setAssets((a) => ({ ...a, cover: null })); setCoverUrl(''); upd({ cover: 'off' }, true) }

  /* ---------------- file ---------------- */
  const openFile = (files) => {
    const f = files?.[0]; if (!f) return
    setErr(''); setResult(null); setFile(f); setRange(null); setDur(0); setPlaying(false)
    setUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(f) })
  }
  const openDemo = async () => { setLoading(true); try { openFile([await makeDemoTrack()]) } catch (e) { setErr('Could not build the demo track.') } setLoading(false) }

  useEffect(() => {
    setPeaks(null); if (!file) return
    if (file.size > 80 * 1024 * 1024) return
    let dead = false; setPeaksLoading(true)
    ;(async () => {
      try {
        const buf = await file.arrayBuffer()
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
        const dec = await new OAC(1, 1, 44100).decodeAudioData(buf)
        const ch = dec.getChannelData(0), N = 200, block = Math.floor(ch.length / N), out = []
        for (let i = 0; i < N; i++) { let m = 0; for (let j = i * block; j < (i + 1) * block; j += 7) { const a = Math.abs(ch[j]); if (a > m) m = a } out.push(m) }
        const mx = Math.max(...out) || 1
        if (!dead) setPeaks(out.map((v) => Math.pow(v / mx, 0.7)))
      } catch { /* undecodable preview is fine */ }
      if (!dead) setPeaksLoading(false)
    })()
    return () => { dead = true }
  }, [file])

  /* ---------------- audio graph ---------------- */
  const ensureGraph = () => {
    const el = audioRef.current; if (!el) return null
    if (gRef.current && gRef.current.el === el) return gRef.current
    try { gRef.current?.ctx.close() } catch {}
    const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC()
    const src = ctx.createMediaElementSource(el), node = ctx.createAnalyser()
    node.fftSize = 4096; node.minDecibels = -90; node.maxDecibels = -25; node.smoothingTimeConstant = 0.35
    const outGain = ctx.createGain(); outGain.gain.value = volRef.current
    const msd = ctx.createMediaStreamDestination()
    src.connect(node); node.connect(outGain); outGain.connect(ctx.destination); src.connect(msd)
    gRef.current = { el, ctx, src, node, outGain, msd }
    return gRef.current
  }
  useEffect(() => { const g = gRef.current; if (g && !exportRef.current) g.outGain.gain.value = vol }, [vol])
  const toggle = async () => {
    const el = audioRef.current; if (!el || exportRef.current) return
    const g = ensureGraph(); await g?.ctx.resume()
    if (el.paused) { if (el.ended || el.currentTime >= (rangeRef.current[1] || el.duration) - 0.05) el.currentTime = rangeRef.current[0]; el.play().catch(() => {}) } else el.pause()
  }

  /* ---------------- render loop ---------------- */
  useEffect(() => {
    if (!file) return
    let id, last = 0, slow = 0, q = perf.scale(), fr = 0, lastRun = 0
    const raw = new Float32Array(NB), wave = new Float32Array(512), tmp = { f: new Uint8Array(2048), w: new Uint8Array(4096) }
    const prev = new VizRenderer()
    const frame = (ts) => {
      id = requestAnimationFrame(frame)
      if (!exportRef.current && lastRun && ts - lastRun < 1000 / perf.fps() - 3) return; lastRun = ts
      const el = audioRef.current, cv = canvasRef.current, a = an.current, Pm = PR.current, g = gRef.current, ex = exportRef.current
      if (!cv || !el) return
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016; last = ts
      const live = !el.paused && !el.ended && g
      a.setRange(Pm.fmin, Pm.fmax)
      let bass
      if (live) bass = bandsFromAnalyser(g.node, g.ctx.sampleRate, a.freqs, raw, wave, tmp)
      else bass = synth(ts / 1000, raw, wave, 0.85)
      a.feed(raw, wave, dt, Pm.smooth, bass, Pm.beatSens)
      const [rs, re] = ex ? [ex.start, ex.end] : [0, el.duration || 0]
      a.time = live || ex ? Math.max(0, el.currentTime - rs) : undefined
      a.dur = Math.max(0, re - rs); a.progress = a.dur ? Math.min(1, Math.max(0, (el.currentTime - rs) / a.dur)) : 0
      // auto-quality: a slow machine gets a lighter preview (exports are always full resolution)
      if (dt > 0.045 && !ex) { slow++; if (slow > 24 && q > 0.4) { q = Math.max(0.4, q * 0.8); slow = 0 } } else slow = Math.max(0, slow - 1)
      const tw = Math.max(2, Math.round((pdRef.current[0] * q) / 2) * 2), th = Math.max(2, Math.round((pdRef.current[1] * q) / 2) * 2)
      if (cv.width !== tw || cv.height !== th) { cv.width = tw; cv.height = th }
      // while exporting, the capture canvas gets priority and the on-screen preview refreshes less often
      if (ex && ts - ex.last >= 1000 / ex.fps - 4) { ex.last = ts; ex.n = (ex.n || 0) + 1; ex.rd.draw(ex.ctx, ex.cv.width, ex.cv.height, a, Pm, assetsRef.current, ts) }
      else if (!ex || (fr++ % 3 === 0)) prev.draw(cv.getContext('2d'), cv.width, cv.height, a, Pm, assetsRef.current, ts)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [file])

  /* ---------------- stage size + fullscreen ---------------- */
  useEffect(() => {
    const el = stageRef.current; if (!el) return
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el)
    setStageSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [!!file])
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])
  const goFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else colRef.current?.requestFullscreen?.().catch(() => {}) }

  const [rw, rh] = RATIOS[exp.ratio]
  const padT = 62, padB = 18, padX = 28
  const availW = Math.max(160, stageSize.w - padX * 2), availH = Math.max(120, stageSize.h - padT - padB)
  const dw = Math.min(availW, (availH * rw) / rh), dh = (dw * rh) / rw

  // preview canvas resolution: only as many pixels as the stage can show (export resolution is separate)
  const pd = useMemo(() => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), k = Math.min(1, Math.max(480, Math.max(dw, dh) * dpr) / Math.max(...outDims))
    return [Math.max(2, Math.round((outDims[0] * k) / 2) * 2), Math.max(2, Math.round((outDims[1] * k) / 2) * 2)]
  }, [Math.round(dw / 8), Math.round(dh / 8), outDims])
  const pdRef = useRef(pd); pdRef.current = pd

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const k = (e) => {
      const t = e.target, typing = t && (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'color' || t.tagName === 'TEXTAREA')
      if (typing || !file) return
      if (e.code === 'Space') { e.preventDefault(); toggle() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  /* ---------------- export ---------------- */
  const mbps = useMemo(() => Math.max(4, BASE_MBPS[exp.q] * ((outDims[0] * outDims[1]) / (1920 * 1080)) * (exp.fps === 60 ? 1.4 : exp.fps === 24 ? 0.85 : 1)), [exp.q, exp.fps, outDims])
  const estBytes = ((mbps * 1e6 + (exp.audio ? 192000 : 0)) / 8) * Math.max(0, rangeEff[1] - rangeEff[0])
  const setExp = (patch) => setExpState((e) => ({ ...e, ...patch }))

  const finishExport = (ex) => { if (ex.stopped) return; ex.stopped = true; clearInterval(ex.iv); try { ex.rec.state !== 'inactive' && ex.rec.stop() } catch {} }
  const cancelExport = () => { const ex = exportRef.current; if (!ex) return; ex.cancelled = true; finishExport(ex) }

  const renderVideo = async () => {
    setErr(''); setResult(null)
    const el = audioRef.current, g = ensureGraph(), o = expRef.current
    if (!el || !g) return
    if (typeof MediaRecorder === 'undefined') { setErr('This browser cannot record video. Try Chrome, Edge or Safari 14.1+.'); return }
    const mime = supported(o.fmt === 'mp4' ? MP4 : WEBM) || supported(WEBM) || supported(MP4)
    if (!mime) { setErr('No supported video format found in this browser.'); return }
    const [s, e] = rangeRef.current, [W, H] = outRef.current
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const ex = { cv, ctx: cv.getContext('2d'), rd: new VizRenderer(), start: s, end: e, last: 0, fps: o.fps, cancelled: false, stopped: false }
    const stream = cv.captureStream(o.fps)
    if (o.audio) g.msd.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
    const bps = Math.round(Math.max(4, BASE_MBPS[o.q] * ((W * H) / (1920 * 1080)) * (o.fps === 60 ? 1.4 : o.fps === 24 ? 0.85 : 1)) * 1e6)
    let rec
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 192000 }) } catch (er) { setErr('Could not start the recorder: ' + er.message); return }
    ex.rec = rec
    const chunks = []; rec.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data) }
    rec.onerror = (ev) => { setErr('The recorder stopped: ' + (ev.error?.message || 'unknown error')) }
    const stopped = new Promise((res) => { rec.onstop = res })
    const prevT = el.currentTime
    await g.ctx.resume(); g.outGain.gain.value = 0
    el.pause()
    await new Promise((res) => { const h = () => { el.removeEventListener('seeked', h); res() }; el.addEventListener('seeked', h); el.currentTime = s; setTimeout(res, 900) })
    exportRef.current = ex; setBusy(true); setProg(0)
    rec.start(500)
    try { await el.play() } catch (er) { setErr('Playback was blocked by the browser — click Render again.'); finishExport(ex); ex.cancelled = true }
    ex.iv = setInterval(() => {
      const t = el.currentTime
      setProg(Math.min(1, Math.max(0, (t - s) / Math.max(0.1, e - s))))
      if (t >= e - 0.03 || el.ended || (el.paused && t > s + 0.3)) finishExport(ex)
    }, 120)
    await stopped
    clearInterval(ex.iv); exportRef.current = null
    el.pause(); g.outGain.gain.value = volRef.current; el.currentTime = prevT; setBusy(false)
    if (ex.cancelled || !chunks.length) { setProg(0); return }
    const type = (chunks[0].type || mime).split(';')[0], ext = type.includes('mp4') ? 'mp4' : 'webm'
    let blob = new Blob(chunks, { type })
    if (ext === 'webm') blob = await new Promise((res) => { try { fixWebm(blob, Math.round((e - s) * 1000), res) } catch { res(blob) } })
    const name = `${baseName(file.name)}-visualizer.${ext}`
    setResult({ url: URL.createObjectURL(blob), blob, name, note: `${W}×${H} · ${o.fps} fps · ${clock(e - s)}` })
    setProg(1)
    recentAction(`Generated visualizer video for ${file.name}`)
  }
  const saveResult = () => result && download(result.blob, result.name)
  const clearResult = () => { if (result) URL.revokeObjectURL(result.url); setResult(null) }
  const exportPng = () => {
    const [W, H] = outRef.current, cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const rd = new VizRenderer(), c2 = cv.getContext('2d'), a = an.current, t0 = performance.now()
    a.dur = dur; a.progress = dur && audioRef.current ? audioRef.current.currentTime / dur : 0
    for (let i = 0; i < 4; i++) rd.draw(c2, W, H, a, PR.current, assetsRef.current, t0 + i * 33)
    cv.toBlob((b) => b && download(b, `${baseName(file.name)}-visualizer.png`), 'image/png')
  }

  useEffect(() => () => { clearInterval(exportRef.current?.iv); try { gRef.current?.ctx.close() } catch {} }, [])

  /* ---------------- section reset ---------------- */
  const resetKeys = section === 'looks' ? Object.keys(DEFAULTS).filter((k) => !KEEP.includes(k)) : SECTION_KEYS[section]
  const dirty = (s) => (s === 'looks' ? !!activeLook : SECTION_KEYS[s] ? SECTION_KEYS[s].some((k) => P[k] !== DEFAULTS[k]) : false)
  const resetSection = () => { if (!resetKeys) return; const patch = {}; resetKeys.forEach((k) => { patch[k] = DEFAULTS[k] }); upd(patch, true) }

  const c = {
    P, upd, sl, an, assets, activeLook, myLooks, applyBuiltIn, applyCustom, saveLook, deleteLook, exportLooks, importLooks: () => looksRef.current?.click(), surprise, diceTick,
    matchBg, setMatchBg, pickBg: () => bgRef.current?.click(), pickCover: () => coverRef.current?.click(), bgUrl, coverUrl, clearBg, clearCover, live: playing,
    exp, setExp, busy, prog, result, err, outDims, mbps, estBytes, canMp4, range: rangeEff, setRange, renderVideo, cancelExport, saveResult, clearResult, exportPng,
  }

  /* ============================================ EMPTY STATE ============================================ */
  if (!file) {
    return (
      <div className="space-y-6">
        <input ref={looksRef} type="file" hidden />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
          <Dropzone onFiles={openFile} accept="audio/*,video/*" label="Drop a song" sub="MP3, WAV, FLAC, M4A, OGG — everything is drawn on your device, nothing is uploaded">
            <HeroBars loading={loading} />
          </Dropzone>
        </motion.div>
        <motion.div className="flex flex-wrap items-center justify-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} className="btn" onClick={openDemo} disabled={loading}><Icon n="wand" s={15} /> {loading ? 'Composing…' : 'Try a demo beat'}</motion.button>
        </motion.div>
        {err && <div className="text-center text-[13px]" style={{ color: '#b4432f' }}>{err}</div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[[STYLES.length, 'visual styles', 'Bars, rings, ridgelines, warp tunnels, particle bursts and more.'], [PALETTES.length, 'colour palettes', 'Plus gradients, loudness-reactive colour, rainbow and three custom pickers.'], [LOOKS.length, 'one-click looks', 'Whole styles with live animated previews. Save and share your own.'], [5, 'video ratios', '16:9, 9:16, 1:1, 4:5 and 21:9 up to 4K, with a custom time range.']].map(([n, a, b], i) => (
            <motion.div key={a} className="card p-5" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 + i * 0.07 }} whileHover={{ y: -4 }}>
              <div className="display font-semibold text-[34px] leading-none"><AnimatedNumber value={n} /></div>
              <div className="eyebrow mt-2">{a}</div>
              <p className="text-[12.5px] mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>{b}</p>
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  const Panel = PANEL[section]
  const [pt, ps] = TITLES[section]
  const WIDE = 'min(1480px, calc(100vw - 32px))'
  const canUndo = past.current.length > 0, canRedo = future.current.length > 0
  void hist

  return (
    <motion.div className="relative" style={{ left: '50%', width: WIDE, marginLeft: `calc(${WIDE} / -2)` }} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
      <input ref={fileRef} type="file" hidden accept="audio/*,video/*" onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; openFile(f) }} />
      <input ref={bgRef} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; loadAsset('bg', f) }} />
      <input ref={coverRef} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; loadAsset('cover', f) }} />
      <input ref={looksRef} type="file" hidden accept=".json,application/json" onChange={onLookFile} />
      <audio ref={audioRef} src={url} preload="auto" onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />

      <div className="card-raised rounded-3xl overflow-hidden flex flex-col lg:flex-row" style={{ height: 'clamp(660px, calc(100vh - 210px), 940px)', background: 'var(--surface)' }}>
        {/* ---------------- rail ---------------- */}
        <nav className="shrink-0 flex lg:flex-col gap-1 p-2 lg:py-4 lg:w-[78px] overflow-x-auto border-b lg:border-b-0 lg:border-r border-line" style={{ background: 'var(--surface2)' }}>
          {SECTIONS.map((s, i) => (
            <motion.button key={s} onClick={() => setSection(s)} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.05 + i * 0.04 }}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} className="relative flex flex-col items-center gap-1 py-2.5 px-3 rounded-2xl shrink-0 lg:w-full" aria-label={LABEL[s]} style={{ color: section === s ? 'var(--bg)' : 'var(--muted)' }}>
              {section === s && <motion.span layoutId="viz-rail-pill" className="absolute inset-0 rounded-2xl" style={{ background: 'var(--ink)', boxShadow: '0 8px 18px -8px rgba(0,0,0,.5)' }} transition={SPRING} />}
              <span className="relative z-10"><Icon n={ICON[s]} s={20} /></span>
              <span className="relative z-10 text-[10px] font-bold tracking-wide">{LABEL[s]}</span>
              <AnimatePresence>{s !== 'export' && dirty(s) && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-1.5 right-2.5 z-10 w-[7px] h-[7px] rounded-full" style={{ background: 'var(--copper)', boxShadow: '0 0 0 2px var(--surface2)' }} />}</AnimatePresence>
            </motion.button>
          ))}
        </nav>

        {/* ---------------- stage ---------------- */}
        <div ref={colRef} className="flex-1 min-w-0 min-h-[440px] flex flex-col" style={{ background: '#121010' }}>
          <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden select-none" style={{ backgroundImage: 'radial-gradient(ellipse at 50% 40%, #2a2420 0%, #121010 72%), radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '100% 100%, 22px 22px' }}>
            <div className="absolute inset-0 grid place-items-center" style={{ paddingTop: padT, paddingBottom: padB }}>
              <motion.div className="relative rounded-md overflow-hidden" initial={false} animate={{ width: dw, height: dh }} transition={SPRING} style={{ boxShadow: '0 30px 80px -20px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.08)' }}>
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
                <AnimatePresence>
                  {busy && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 3px var(--copper)' }} />}
                </AnimatePresence>
              </motion.div>
            </div>

            {/* file chip */}
            <motion.div className="absolute top-3.5 left-4 flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full max-w-[32%]" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.15 }}
              style={{ background: 'rgba(20,17,15,.72)', color: '#eee', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.08)' }}>
              <span className="w-7 h-7 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--copper)', color: '#fff' }}><Icon n="music" s={14} /></span>
              <span className="min-w-0 leading-tight"><span className="block text-[11.5px] font-semibold truncate">{file.name}</span><span className="block text-[10px] opacity-60 tabular-nums">{clock(dur)} · {fmtBytes(file.size)}</span></span>
              <button aria-label="Change file" title="Change file" className="shrink-0 opacity-70 hover:opacity-100" onClick={() => !busy && fileRef.current?.click()}><Icon n="reset" s={13} /></button>
            </motion.div>

            {/* toolbar */}
            <motion.div className="absolute top-3.5 left-1/2 flex items-center gap-0.5 p-1 rounded-full" initial={{ opacity: 0, y: -16, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} transition={{ ...SPRING, delay: 0.2 }}
              style={{ background: 'rgba(20,17,15,.78)', color: '#eee', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.09)', boxShadow: '0 12px 30px -10px rgba(0,0,0,.7)' }}>
              <TBtn icon="undo" label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
              <TBtn icon="redo" label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
              <span className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,.15)' }} />
              <TBtn icon="dice" label="Surprise me" onClick={surprise} />
              <TBtn icon="reset" label="Reset everything" onClick={() => setWhole({ ...DEFAULTS, title: PR.current.title, subtitle: PR.current.subtitle })} />
              <span className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,.15)' }} />
              <TBtn icon="expand" label={full ? 'Exit full screen' : 'Full screen'} onClick={goFull} active={full} />
            </motion.div>

            {/* status */}
            <motion.div className="absolute top-3.5 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.25 }}
              style={{ background: 'rgba(20,17,15,.72)', color: '#eee', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.08)' }}>
              <motion.span className="w-2 h-2 rounded-full" style={{ background: busy ? '#e5483a' : playing ? '#46d38c' : '#c9a24a' }} animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ duration: busy ? 0.8 : 1.6, repeat: Infinity }} />
              <AnimatePresence mode="wait" initial={false}><motion.span key={busy ? 'r' : playing ? 'l' : 'p'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>{busy ? `Rec ${Math.round(prog * 100)}%` : playing ? 'Live' : 'Preview signal'}</motion.span></AnimatePresence>
            </motion.div>
          </div>
          <Transport audioRef={audioRef} peaks={peaks} peaksLoading={peaksLoading} dur={dur} range={range ? rangeEff : (section === 'export' ? rangeEff : null)} onRange={(a, b) => setRange([a, b])} playing={playing} toggle={toggle} vol={vol} setVol={setVol} disabled={busy} />
        </div>

        {/* ---------------- inspector ---------------- */}
        <aside className="shrink-0 lg:w-[392px] flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-line" style={{ background: 'var(--surface)' }}>
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-4 pb-3.5 border-b border-line">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }} className="min-w-0">
                <div className="display font-semibold text-[20px] leading-tight">{pt}</div>
                <div className="text-[11.5px] truncate" style={{ color: 'var(--muted)' }}>{ps}</div>
              </motion.div>
            </AnimatePresence>
            {resetKeys && <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} onClick={resetSection} className="shrink-0 flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-full border border-line" style={{ color: 'var(--muted)' }}><Icon n="reset" s={12} w={2.2} /> Reset</motion.button>}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={section} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.18 }}>
                <Panel c={c} />
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </motion.div>
  )
}

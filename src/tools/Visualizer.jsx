import { perf, usePerf } from '../lib/perf.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import fixWebm from 'fix-webm-duration'
import { Dropzone, AnimatedNumber } from '../components/ui.jsx'
import { Icon, Slider, SPRING } from './studio/controls.jsx'
import { LooksPanel, StylePanel, ColourPanel, BackdropPanel, TextPanel, MotionPanel, ExportPanel } from './viz/Panels.jsx'
import { WaveScrubber, HeroBars, clock } from './viz/parts.jsx'
import { Analyzer, synth, bandsFromAnalyser, NB } from '../lib/viz/analyzer.js'
import { VizRenderer } from '../lib/viz/render.js'
import { DEFAULTS, LOOKS, PALETTES, STYLES, KEEP, SECTION_KEYS, RATIOS, exportDims, applyLook, randomLook, sanitizeVizParams, sanitizeVizPatch } from '../lib/viz/params.js'
import { makeDemoTrack } from '../lib/viz/demo.js'
import { download, baseName, recentAction, fmtBytes } from '../lib/utils.js'

const SECTIONS = ['looks', 'style', 'colour', 'backdrop', 'text', 'motion', 'export']
const LABEL = { looks: 'Looks', style: 'Style', colour: 'Colour', backdrop: 'Backdrop', text: 'Text', motion: 'Motion', export: 'Export' }
const ICON = { looks: 'looks', style: 'viz', colour: 'palette', backdrop: 'image', text: 'type', motion: 'motion', export: 'export' }
const TITLES = { looks: ['Looks', 'One click restyles everything — your words and pictures stay.'], style: ['Visual style', 'Pick a visualizer, then shape it.'], colour: ['Colour & light', 'Palettes, gradients and glow.'], backdrop: ['Backdrop', 'Behind the visuals.'], text: ['Text & cover', 'Titles, progress and album art.'], motion: ['Audio response', 'How the picture reacts to sound.'], export: ['Export', 'Render a shareable video.'] }
const PANEL = { looks: LooksPanel, style: StylePanel, colour: ColourPanel, backdrop: BackdropPanel, text: TextPanel, motion: MotionPanel, export: ExportPanel }
const LS_P = 'ttt.viz.params', LS_L = 'ttt.viz.looks'
const MAX_SAVED_LOOKS = 60, MAX_LOOK_DATA_BYTES = 512 * 1024
const safeLookName = (value, fallback = 'Imported look') => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 28) : '') || fallback
const makeLookId = () => `u${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

function loadParams() {
  try {
    const stored = localStorage.getItem(LS_P) || '{}'
    if (stored.length > MAX_LOOK_DATA_BYTES) return { ...DEFAULTS }
    return sanitizeVizParams(JSON.parse(stored))
  } catch { return { ...DEFAULTS } }
}
function loadLooks() {
  try {
    const stored = localStorage.getItem(LS_L) || '[]'
    if (stored.length > MAX_LOOK_DATA_BYTES) return []
    const raw = JSON.parse(stored)
    if (!Array.isArray(raw)) return []
    const seen = new Set(), safe = []
    for (const [index, look] of raw.slice(-MAX_SAVED_LOOKS).entries()) {
      if (!look || typeof look !== 'object' || Array.isArray(look)) continue
      const p = sanitizeVizPatch(look.p)
      if (p.bgType === 'image') p.bgType = 'gradient'
      if (!Object.keys(p).length) continue
      let id = typeof look.id === 'string' && look.id.length <= 100 ? look.id : `u-saved-${index}`
      if (seen.has(id)) continue
      seen.add(id)
      safe.push({ id, name: safeLookName(look.name), p })
    }
    return safe
  } catch { return [] }
}
const MP4 = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']
const WEBM = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
const supported = (list) => typeof MediaRecorder !== 'undefined' ? list.find((m) => MediaRecorder.isTypeSupported(m)) : null
const BASE_MBPS = { draft: 4, good: 8, max: 14 }
const MAX_ASSET_BYTES = 32 * 1024 * 1024, MAX_ASSET_PIXELS = 32_000_000

function releaseAudioGraph(graph) {
  if (!graph) return
  for (const node of [graph.src, graph.node, graph.outGain]) { try { node?.disconnect?.() } catch {} }
  try { graph.msd?.stream?.getTracks?.().forEach((track) => track.stop()) } catch {}
  try { const closing = graph.ctx?.close?.(); closing?.catch?.(() => {}) } catch {}
}
const MAX_EXPORT_BYTES = 256 * 1024 * 1024
const MAX_ANALYSIS_FILE_BYTES = 80 * 1024 * 1024

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
      <div className="mono text-[11px] sm:text-[12px] tabular-nums shrink-0 w-[76px] sm:w-[88px]" style={{ color: '#ddd' }}>{clock(time)} <span style={{ opacity: 0.45 }}>/ {clock(dur)}</span></div>
      <div className="flex-1 min-w-0"><WaveScrubber peaks={peaks} loading={peaksLoading} time={time} dur={dur} range={range} onSeek={seek} onRange={onRange} disabled={disabled} /></div>
      <div className="flex items-center gap-2 md:w-[112px] shrink-0" style={{ color: '#ddd' }}>
        <button type="button" aria-label={vol > 0 ? 'Mute' : 'Unmute'} disabled={disabled} onClick={() => setVol(vol > 0 ? 0 : 0.9)} className="shrink-0 disabled:opacity-40"><Icon n={vol > 0 ? 'vol' : 'mute'} s={17} /></button>
        <input type="range" min={0} max={1} step={0.01} value={vol} disabled={disabled} onChange={(e) => setVol(+e.target.value)} className="hidden md:block w-full accent-[var(--copper)]" aria-label="Volume" />
      </div>
    </motion.div>
  )
}

const TBtn = ({ icon, label, onClick, disabled, active }) => (
  <motion.button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} whileHover={{ scale: 1.14 }} whileTap={{ scale: 0.82, rotate: -8 }}
    className="w-8 h-8 rounded-full grid place-items-center" style={{ opacity: disabled ? 0.35 : 1, background: active ? 'rgba(255,255,255,.18)' : 'transparent' }}><Icon n={icon} s={16} /></motion.button>
)

export default function Visualizer() {
  const perfNow = usePerf(), reduceMotion = useReducedMotion() || perfNow.level === 'lite'
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
  const exportRef = useRef(null), mountedRef = useRef(false)
  const mediaUrlRef = useRef(''), resultUrlRef = useRef('')
  const assetBitmapsRef = useRef({ bg: null, cover: null }), assetUrlsRef = useRef({ bg: '', cover: '' })
  const assetLoadToken = useRef({ bg: 0, cover: 0 }), demoTokenRef = useRef(0)
  const past = useRef([]), future = useRef([]), group = useRef({ open: false, t: 0 })
  const expRef = useRef(exp); expRef.current = exp
  const rangeRef = useRef([0, 0])

  const rangeEff = range || [0, dur]
  rangeRef.current = rangeEff
  const outDims = useMemo(() => exportDims(exp.ratio, exp.res), [exp.ratio, exp.res])
  const outRef = useRef(outDims); outRef.current = outDims

  const replaceAsset = (kind, bitmap, objectUrl) => {
    const previousBitmap = assetBitmapsRef.current[kind]
    if (previousBitmap && previousBitmap !== bitmap) { try { previousBitmap.close?.() } catch {} }
    const previousUrl = assetUrlsRef.current[kind]
    if (previousUrl && previousUrl !== objectUrl) { try { URL.revokeObjectURL(previousUrl) } catch {} }
    assetBitmapsRef.current = { ...assetBitmapsRef.current, [kind]: bitmap }
    assetUrlsRef.current = { ...assetUrlsRef.current, [kind]: objectUrl }
    const nextAssets = { ...assetsRef.current, [kind]: bitmap }
    assetsRef.current = nextAssets
    setAssets(nextAssets)
    if (kind === 'bg') setBgUrl(objectUrl)
    else setCoverUrl(objectUrl)
  }

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
    if (exportRef.current) return
    beginGroup(commit)
    const next = { ...PR.current, ...patch }; PR.current = next; setP(next); setActiveLook(null); touch()
  }, [])
  const setWhole = (next, lookId = null) => {
    if (exportRef.current) return
    group.current.open = false; beginGroup(true)
    PR.current = next; setP(next); setActiveLook(lookId); touch()
  }
  const undo = () => { if (exportRef.current || !past.current.length) return; future.current.push(PR.current); const p = past.current.pop(); PR.current = p; setP(p); setActiveLook(null); touch() }
  const redo = () => { if (exportRef.current || !future.current.length) return; past.current.push(PR.current); const p = future.current.pop(); PR.current = p; setP(p); setActiveLook(null); touch() }
  const sl = (key, label, o = {}) => <Slider key={key} label={label} value={P[key]} def={DEFAULTS[key]} onChange={(v) => upd({ [key]: v })} {...o} />

  /* ---------------- looks ---------------- */
  const applyBuiltIn = (l) => setWhole(applyLook(PR.current, l), l.id)
  const applyCustom = (l) => setWhole(applyLook(PR.current, l), l.id)
  const surprise = () => { setWhole(randomLook(PR.current)); setDiceTick((n) => n + 1) }
  const saveLook = (name) => {
    const p = { ...PR.current }; KEEP.forEach((k) => delete p[k])
    const l = { id: makeLookId(), name: safeLookName(name, `My look ${myLooks.length + 1}`), p }
    setMyLooks((a) => [l, ...a].slice(0, MAX_SAVED_LOOKS)); setActiveLook(l.id)
  }
  const deleteLook = (id) => setMyLooks((a) => a.filter((l) => l.id !== id))
  const exportLooks = () => download(new Blob([JSON.stringify(myLooks, null, 2)], { type: 'application/json' }), 'thetooltable-visualizer-looks.json')
  const onLookFile = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return
    try {
      if (f.size > MAX_LOOK_DATA_BYTES) throw new Error('Look file is too large')
      const parsed = JSON.parse(await f.text())
      const entries = (Array.isArray(parsed) ? parsed : [parsed]).slice(0, MAX_SAVED_LOOKS)
      const list = entries.flatMap((look) => {
        if (!look || typeof look !== 'object' || Array.isArray(look)) return []
        const p = sanitizeVizPatch(look.p)
        if (p.bgType === 'image') p.bgType = 'gradient'
        return Object.keys(p).length ? [{ id: makeLookId(), name: safeLookName(look.name), p }] : []
      })
      if (!list.length) throw new Error('No usable looks')
      setMyLooks((current) => [...list, ...current].slice(0, MAX_SAVED_LOOKS))
    } catch { setErr('That file is not a valid, safe TheToolTable look export.') }
  }

  /* ---------------- images ---------------- */
  const loadAsset = async (kind, f) => {
    if (!f || exportRef.current) return
    if (f.size > MAX_ASSET_BYTES) { setErr(`Choose an image smaller than ${fmtBytes(MAX_ASSET_BYTES)}.`); return }
    const token = ++assetLoadToken.current[kind]
    let bmp = null, objectUrl = ''
    try {
      if (typeof createImageBitmap !== 'function') throw new Error('Image decoding is unavailable')
      bmp = await createImageBitmap(f)
      if (!mountedRef.current || token !== assetLoadToken.current[kind] || exportRef.current) { bmp.close?.(); return }
      if (!bmp.width || !bmp.height || bmp.width * bmp.height > MAX_ASSET_PIXELS) throw new Error('That image is too large to use safely. Choose one under 32 megapixels.')
      objectUrl = URL.createObjectURL(f)
      replaceAsset(kind, bmp, objectUrl)
      if (kind === 'bg') upd({ bgType: 'image' }, true)
      else upd({ cover: PR.current.cover === 'off' ? 'circle' : PR.current.cover }, true)
    } catch (error) {
      try { bmp?.close?.() } catch {}
      if (objectUrl) { try { URL.revokeObjectURL(objectUrl) } catch {} }
      if (mountedRef.current && token === assetLoadToken.current[kind]) setErr(error.message || 'Could not read that image.')
    }
  }
  const clearBg = () => { if (exportRef.current) return; assetLoadToken.current.bg++; replaceAsset('bg', null, ''); upd({ bgType: 'gradient' }, true) }
  const clearCover = () => { if (exportRef.current) return; assetLoadToken.current.cover++; replaceAsset('cover', null, ''); upd({ cover: 'off' }, true) }

  /* ---------------- file ---------------- */
  const openFile = (files, fromDemo = false) => {
    const f = files?.[0]; if (!f || exportRef.current) return
    if (!fromDemo) { demoTokenRef.current++; setLoading(false) }
    let nextUrl
    try { nextUrl = URL.createObjectURL(f) } catch { setErr('Could not open that media file.'); return }
    audioRef.current?.pause()
    setErr(''); clearResult(); setFile(f); setRange(null); setDur(0); setPlaying(false); setPeaks(null); setPeaksLoading(false)
    if (mediaUrlRef.current) { try { URL.revokeObjectURL(mediaUrlRef.current) } catch {} }
    mediaUrlRef.current = nextUrl
    setUrl(nextUrl)
  }
  const openDemo = async () => {
    const token = ++demoTokenRef.current
    setLoading(true)
    try {
      const demo = await makeDemoTrack()
      if (mountedRef.current && token === demoTokenRef.current) openFile([demo], true)
    } catch { if (mountedRef.current && token === demoTokenRef.current) setErr('Could not build the demo track.') }
    finally { if (mountedRef.current && token === demoTokenRef.current) setLoading(false) }
  }

  useEffect(() => {
    let dead = false
    setPeaks(null); setPeaksLoading(false)
    if (!file || file.size > MAX_ANALYSIS_FILE_BYTES) return

    const el = audioRef.current
    const analyze = async () => {
      if (dead) return
      const mediaDuration = Number(el?.duration)
      // Avoid decoding multi-hour or indefinite sources into a large PCM buffer just to draw a tiny waveform.
      if (!Number.isFinite(mediaDuration) || mediaDuration <= 0 || mediaDuration > 30 * 60) return
      setPeaksLoading(true)
      try {
        const buf = await file.arrayBuffer()
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
        const dec = await new OAC(1, 1, 11025).decodeAudioData(buf)
        if (Number.isFinite(dec.duration) && dec.duration <= 30 * 60) {
          const ch = dec.getChannelData(0), N = 200, block = Math.floor(ch.length / N), out = []
          for (let i = 0; i < N; i++) { let m = 0; for (let j = i * block; j < (i + 1) * block; j += 7) { const a = Math.abs(ch[j]); if (a > m) m = a } out.push(m) }
          const mx = Math.max(...out) || 1
          if (!dead) setPeaks(out.map((v) => Math.pow(v / mx, 0.7)))
        }
      } catch { /* undecodable preview is fine */ }
      finally { if (!dead) setPeaksLoading(false) }
    }

    if (el && el.readyState < 1) {
      const onMetadata = () => { el.removeEventListener('error', onError); void analyze() }
      const onError = () => { el.removeEventListener('loadedmetadata', onMetadata); if (!dead) setPeaksLoading(false) }
      el.addEventListener('loadedmetadata', onMetadata, { once: true })
      el.addEventListener('error', onError, { once: true })
      return () => { dead = true; el.removeEventListener('loadedmetadata', onMetadata); el.removeEventListener('error', onError) }
    }
    void analyze()
    return () => { dead = true }
  }, [file])

  /* ---------------- audio graph ---------------- */
  const ensureGraph = () => {
    const el = audioRef.current; if (!el) return null
    if (gRef.current && gRef.current.el === el) return gRef.current
    releaseAudioGraph(gRef.current); gRef.current = null
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) throw new Error('Audio playback is unavailable in this browser.')
    const ctx = new AC()
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
    try {
      const g = ensureGraph(); await g?.ctx.resume()
      if (el.paused) { if (el.ended || el.currentTime >= (rangeRef.current[1] || el.duration) - 0.05) el.currentTime = rangeRef.current[0]; await el.play() }
      else el.pause()
    } catch { if (mountedRef.current) setErr('Could not play this media file in the current browser.') }
  }

  /* ---------------- render loop ----------------
     The loop only keeps scheduling frames while the preview is actually moving:
     playback or an export. A paused preview draws one still frame and parks, so
     an idle tool no longer runs a 40 fps synth animation (and Lite no longer
     redraws identical stills twelve times a second). `kickRef` wakes it for a
     single pass whenever params, assets, the stage, the playhead, playback or
     an export change. */
  const kickRef = useRef(() => {})
  useEffect(() => {
    if (!file) return undefined
    let id = 0, last = 0, slow = 0, q = perf.scale(), fr = 0, lastRun = 0
    const raw = new Float32Array(NB), wave = new Float32Array(512), tmp = { f: new Uint8Array(2048), w: new Uint8Array(4096) }
    const prev = new VizRenderer()
    const frame = (ts) => {
      id = requestAnimationFrame(frame)
      if (!exportRef.current && lastRun && ts - lastRun < 1000 / (reduceMotion ? 12 : perf.fps()) - 3) return; lastRun = ts
      const el = audioRef.current, cv = canvasRef.current, a = an.current, Pm = PR.current, g = gRef.current, ex = exportRef.current
      if (!cv || !el) return
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016; last = ts
      const live = !el.paused && !el.ended && g
      const paused = el.paused || el.ended
      a.setRange(Pm.fmin, Pm.fmax)
      let bass
      if (live) bass = bandsFromAnalyser(g.node, g.ctx.sampleRate, a.freqs, raw, wave, tmp)
      else bass = synth((paused || (reduceMotion && !ex)) ? 0 : ts / 1000, raw, wave, 0.85)
      a.feed(raw, wave, dt, Pm.smooth, bass, Pm.beatSens)
      const [rs, re] = ex ? [ex.start, ex.end] : [0, el.duration || 0]
      a.time = live || ex ? Math.max(0, el.currentTime - rs) : undefined
      a.dur = Math.max(0, re - rs); a.progress = a.dur ? Math.min(1, Math.max(0, (el.currentTime - rs) / a.dur)) : 0
      // auto-quality: a slow machine gets a lighter preview (exports are always full resolution)
      if (dt > 0.045 && !ex) { slow++; if (slow > 24 && q > 0.4) { q = Math.max(0.4, q * 0.8); slow = 0 } } else slow = Math.max(0, slow - 1)
      const tw = Math.max(2, Math.round((pdRef.current[0] * q) / 2) * 2), th = Math.max(2, Math.round((pdRef.current[1] * q) / 2) * 2)
      if (cv.width !== tw || cv.height !== th) { cv.width = tw; cv.height = th }
      // while exporting, the capture canvas gets priority and the on-screen preview refreshes less often
      if (ex?.ready && ts - ex.last >= 1000 / ex.fps - 4) { ex.last = ts; ex.n = (ex.n || 0) + 1; ex.rd.draw(ex.ctx, ex.cv.width, ex.cv.height, a, ex.params, ex.assets, ts) }
      else if (!ex || !ex.ready || fr++ % 3 === 0) {
        // Paused (or reduced motion) with no export running freezes the preview
        // into one still frame instead of animating an idle canvas.
        const still = ((reduceMotion && !live) || paused) && !ex
        const previewP = still ? { ...Pm, spin: 0, shake: 0, zoom: 0, flash: 0, cycle: 0, bgPulse: 0, tanim: 'none', coverSpin: 0 } : (ex?.params || Pm)
        prev.draw(cv.getContext('2d'), cv.width, cv.height, a, previewP, ex?.assets || assetsRef.current, still ? 0 : ts)
      }
      /* Idle and not exporting: this pass was the whole request — park. */
      if (paused && !ex) { cancelAnimationFrame(id); id = 0 }
    }
    const kick = () => { if (!id) { lastRun = 0; id = requestAnimationFrame(frame) } }
    kickRef.current = kick
    kick()
    return () => { cancelAnimationFrame(id); id = 0; kickRef.current = () => {}; prev.destroy() }
  }, [file, reduceMotion])

  useEffect(() => {
    const el = audioRef.current; if (!el) return undefined
    const kick = () => kickRef.current()
    el.addEventListener('play', kick)
    el.addEventListener('pause', kick)
    el.addEventListener('seeked', kick)
    el.addEventListener('ended', kick)
    return () => {
      el.removeEventListener('play', kick)
      el.removeEventListener('pause', kick)
      el.removeEventListener('seeked', kick)
      el.removeEventListener('ended', kick)
    }
  }, [])

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
  const padT = stageSize.w < 900 ? 106 : 62, padB = 18, padX = 28
  const availW = Math.max(160, stageSize.w - padX * 2), availH = Math.max(120, stageSize.h - padT - padB)
  const dw = Math.min(availW, (availH * rw) / rh), dh = (dw * rh) / rw

  // preview canvas resolution: only as many pixels as the stage can show (export resolution is separate)
  const pd = useMemo(() => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), k = Math.min(1, Math.max(480, Math.max(dw, dh) * dpr) / Math.max(...outDims))
    return [Math.max(2, Math.round((outDims[0] * k) / 2) * 2), Math.max(2, Math.round((outDims[1] * k) / 2) * 2)]
  }, [Math.round(dw / 8), Math.round(dh / 8), outDims])
  const pdRef = useRef(pd); pdRef.current = pd

  /* One pass for every change a parked loop would otherwise have observed.
     Declared after `pd`: this array reads it, and reading a `const` before its
     declaration throws on every render, which kept the whole tool from opening. */
  useEffect(() => { kickRef.current() }, [P, assets, stageSize, pd])

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
  const canRender = Number.isFinite(dur) && dur > 0 && Number.isFinite(estBytes) && estBytes <= MAX_EXPORT_BYTES
  const setExp = (patch) => setExpState((e) => ({ ...e, ...patch }))

  const finishExport = (ex) => {
    if (!ex || ex.stopped) return
    ex.stopped = true
    if (ex.iv) { clearInterval(ex.iv); ex.iv = null }
    if (ex.rec && ex.rec.state !== 'inactive') {
      ex.stopTimer = setTimeout(() => {
        ex.error ||= new Error('The video recorder did not stop cleanly.')
        ex.stopResolve?.()
      }, 5000)
      try { ex.rec.stop() } catch (error) { ex.error ||= error; ex.stopResolve?.() }
    } else ex.stopResolve?.()
  }
  const releaseExportStream = (ex) => {
    if (!ex) return
    const tracks = new Set([...(ex.tracksToStop || []), ...(ex.stream?.getTracks?.() || [])])
    for (const track of tracks) {
      if (ex.sharedAudioTracks?.has(track)) continue
      try { track.stop() } catch {}
    }
    ex.stream = null
  }
  const cancelExport = () => {
    const ex = exportRef.current
    if (!ex) return
    ex.cancelled = true
    finishExport(ex)
  }
  const clearResult = () => {
    const oldUrl = resultUrlRef.current || result?.url
    if (oldUrl) { try { URL.revokeObjectURL(oldUrl) } catch {} }
    resultUrlRef.current = ''
    setResult(null)
  }

  const renderVideo = async () => {
    setErr('')
    if (exportRef.current) return
    const el = audioRef.current, o = expRef.current
    if (!el) { setErr('Choose an audio file before rendering.'); return }
    if (typeof MediaRecorder === 'undefined') { setErr('This browser cannot record video. Try Chrome, Edge or Safari 14.1+.'); return }

    let mime = null
    try { mime = supported(o.fmt === 'mp4' ? MP4 : WEBM) || supported(WEBM) || supported(MP4) } catch {}
    if (!mime) { setErr('No supported video format found in this browser.'); return }

    const [W, H] = outRef.current
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : dur
    const [rawStart, rawEnd] = rangeRef.current
    const start = Number(rawStart), end = Math.min(Number(rawEnd), duration)
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + 0.05 || end - start < 0.1) {
      setErr('Choose a valid section of the track before rendering.')
      return
    }
    const fps = [24, 30, 60].includes(Number(o.fps)) ? Number(o.fps) : 30
    const quality = BASE_MBPS[o.q] || BASE_MBPS.good
    const videoMbps = Math.max(4, quality * ((W * H) / (1920 * 1080)) * (fps === 60 ? 1.4 : fps === 24 ? 0.85 : 1))
    const estimatedBytes = ((videoMbps * 1e6 + (o.audio ? 192000 : 0)) / 8) * (end - start)
    if (!Number.isFinite(estimatedBytes) || estimatedBytes > MAX_EXPORT_BYTES) {
      setErr(`This export is estimated at ${fmtBytes(estimatedBytes)}. The in-memory limit is ${fmtBytes(MAX_EXPORT_BYTES)}; shorten the range or choose a lower resolution/quality.`)
      return
    }
    clearResult()

    const ex = {
      start, end, fps, last: 0, cancelled: false, stopped: false, ready: false, completed: false,
      params: { ...PR.current }, assets: { ...assetsRef.current },
      bytes: 0, tracksToStop: new Set(), sharedAudioTracks: new Set(),
      previousTime: el.currentTime, wasPlaying: !el.paused,
    }
    exportRef.current = ex
    kickRef.current()
    setBusy(true); setProg(0)
    let graph = null, chunks = [], stopped = null

    const seekTo = (target) => new Promise((resolve, reject) => {
      let timer
      const cleanup = () => { clearTimeout(timer); el.removeEventListener('seeked', finish) }
      const finish = () => { cleanup(); resolve() }
      if (Math.abs(el.currentTime - target) < 0.01) { resolve(); return }
      el.addEventListener('seeked', finish, { once: true })
      timer = setTimeout(finish, 900)
      try { el.currentTime = target } catch (error) { cleanup(); reject(error) }
    })

    try {
      graph = ensureGraph()
      if (!graph) throw new Error('Audio playback is unavailable in this browser.')
      ex.graph = graph
      await graph.ctx.resume()
      if (ex.cancelled) return

      const cv = document.createElement('canvas')
      cv.width = W; cv.height = H
      ex.cv = cv; ex.ctx = cv.getContext('2d'); ex.rd = new VizRenderer()
      if (!ex.ctx) throw new Error('Could not create the export canvas.')
      if (typeof cv.captureStream !== 'function') throw new Error('This browser cannot capture the export canvas.')
      ex.stream = cv.captureStream(fps)
      if (!ex.stream) throw new Error('Could not capture the export canvas.')
      ex.stream.getVideoTracks().forEach((track) => ex.tracksToStop.add(track))

      if (o.audio) {
        for (const sourceTrack of graph.msd.stream.getAudioTracks()) {
          ex.sharedAudioTracks.add(sourceTrack)
          const track = typeof sourceTrack.clone === 'function' ? sourceTrack.clone() : sourceTrack
          if (track !== sourceTrack) ex.tracksToStop.add(track)
          ex.stream.addTrack(track)
        }
      }

      const bps = Math.round(videoMbps * 1e6)
      const options = { mimeType: mime, videoBitsPerSecond: bps, ...(o.audio ? { audioBitsPerSecond: 192000 } : {}) }
      ex.rec = new MediaRecorder(ex.stream, options)
      stopped = new Promise((resolve) => {
        ex.stopResolve = () => { clearTimeout(ex.stopTimer); resolve() }
        ex.rec.onstop = ex.stopResolve
      })
      ex.rec.ondataavailable = (event) => {
        if (!event.data?.size || ex.cancelled) return
        ex.bytes += event.data.size
        if (ex.bytes > MAX_EXPORT_BYTES) {
          ex.error = new Error(`The video exceeded the ${fmtBytes(MAX_EXPORT_BYTES)} in-memory export limit. Try a shorter range or lower resolution/quality.`)
          finishExport(ex)
          return
        }
        chunks.push(event.data)
      }
      ex.rec.onerror = (event) => {
        ex.error = new Error('The recorder stopped: ' + (event.error?.message || 'unknown error'))
        finishExport(ex)
      }

      graph.outGain.gain.value = 0
      el.pause()
      await seekTo(start)
      if (ex.cancelled) { finishExport(ex); await stopped; return }

      ex.rec.start(500)
      ex.ready = true
      try { await el.play() } catch {
        ex.error = new Error('Playback was blocked by the browser — tap Render again to retry.')
        finishExport(ex)
      }
      if (!ex.stopped) {
        ex.iv = setInterval(() => {
          const t = el.currentTime
          if (mountedRef.current) setProg(Math.min(1, Math.max(0, (t - start) / Math.max(0.1, end - start))))
          if (t >= end - 0.03 || el.ended || (el.paused && t > start + 0.3)) finishExport(ex)
        }, 120)
      }
      await stopped
      if (ex.cancelled) return
      if (ex.error) throw ex.error
      if (!chunks.length) throw new Error('The recorder did not produce any video data.')

      const type = (chunks[0].type || mime).split(';')[0]
      const ext = type.includes('mp4') ? 'mp4' : 'webm'
      let blob = new Blob(chunks, { type })
      if (ext === 'webm') blob = await new Promise((resolve) => { try { fixWebm(blob, Math.round((end - start) * 1000), resolve) } catch { resolve(blob) } })
      if (!mountedRef.current || ex.cancelled) return
      const name = `${baseName(file.name)}-visualizer.${ext}`
      const objectUrl = URL.createObjectURL(blob)
      resultUrlRef.current = objectUrl
      setResult({ url: objectUrl, blob, name, note: `${W}×${H} · ${fps} fps · ${clock(end - start)}` })
      setProg(1)
      ex.completed = true
      recentAction(`Generated visualizer video for ${file.name}`)
    } catch (error) {
      if (!ex.cancelled && mountedRef.current) setErr(ex.error?.message || `Could not render the video: ${error?.message || 'unknown error'}`)
    } finally {
      finishExport(ex)
      releaseExportStream(ex)
      ex.rd?.destroy?.()
      if (ex.cv) { ex.cv.width = 1; ex.cv.height = 1 }
      if (exportRef.current === ex) exportRef.current = null
      try { el.pause() } catch {}
      try { if (Number.isFinite(ex.previousTime)) el.currentTime = ex.previousTime } catch {}
      if (graph) { try { graph.outGain.gain.value = volRef.current } catch {} }
      if (ex.wasPlaying && mountedRef.current && audioRef.current === el) { try { await el.play() } catch {} }
      if (mountedRef.current) { setBusy(false); if (!ex.completed) setProg(0) }
      void stopped
    }
  }
  const saveResult = () => result && download(result.blob, result.name)
  const exportPng = () => {
    if (exportRef.current) return
    const [W, H] = outRef.current, cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const rd = new VizRenderer(), c2 = cv.getContext('2d'), a = an.current, t0 = performance.now()
    if (!c2) { rd.destroy(); return setErr('Could not create the PNG export canvas.') }
    try {
      a.dur = dur; a.progress = dur && audioRef.current ? audioRef.current.currentTime / dur : 0
      for (let i = 0; i < 4; i++) rd.draw(c2, W, H, a, PR.current, assetsRef.current, t0 + i * 33)
      cv.toBlob((blob) => {
        rd.destroy(); cv.width = 1; cv.height = 1
        if (blob) download(blob, `${baseName(file.name)}-visualizer.png`)
        else if (mountedRef.current) setErr('The browser could not encode this PNG.')
      }, 'image/png')
    } catch (error) { rd.destroy(); cv.width = 1; cv.height = 1; setErr(error.message || 'PNG export failed.') }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const ex = exportRef.current
      if (ex) {
        ex.cancelled = true; ex.ready = false; finishExport(ex); releaseExportStream(ex)
        ex.rd?.destroy?.(); if (ex.cv) { ex.cv.width = 1; ex.cv.height = 1 }
      }
      try { audioRef.current?.pause() } catch {}
      if (mediaUrlRef.current) { try { URL.revokeObjectURL(mediaUrlRef.current) } catch {}; mediaUrlRef.current = '' }
      if (resultUrlRef.current) { try { URL.revokeObjectURL(resultUrlRef.current) } catch {}; resultUrlRef.current = '' }
      for (const kind of ['bg', 'cover']) {
        try { assetBitmapsRef.current[kind]?.close?.() } catch {}
        if (assetUrlsRef.current[kind]) { try { URL.revokeObjectURL(assetUrlsRef.current[kind]) } catch {} }
        assetLoadToken.current[kind]++
      }
      releaseAudioGraph(gRef.current); gRef.current = null
    }
  }, [])

  /* ---------------- section reset ---------------- */
  const resetKeys = section === 'looks' ? Object.keys(DEFAULTS).filter((k) => !KEEP.includes(k)) : SECTION_KEYS[section]
  const dirty = (s) => (s === 'looks' ? !!activeLook : SECTION_KEYS[s] ? SECTION_KEYS[s].some((k) => P[k] !== DEFAULTS[k]) : false)
  const resetSection = () => { if (!resetKeys) return; const patch = {}; resetKeys.forEach((k) => { patch[k] = DEFAULTS[k] }); upd(patch, true) }

  const c = {
    P, upd, sl, an, assets, activeLook, myLooks, applyBuiltIn, applyCustom, saveLook, deleteLook, exportLooks, importLooks: () => looksRef.current?.click(), surprise, diceTick,
    matchBg, setMatchBg, pickBg: () => bgRef.current?.click(), pickCover: () => coverRef.current?.click(), bgUrl, coverUrl, clearBg, clearCover, live: playing,
    exp, setExp, busy, prog, result, err, outDims, mbps, estBytes, maxExportBytes: MAX_EXPORT_BYTES, canRender, canMp4, range: rangeEff, setRange, renderVideo, cancelExport, saveResult, clearResult, exportPng,
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
      <audio ref={audioRef} src={url} preload="auto" onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setDur(Number.isFinite(d) && d > 0 ? d : 0) }} onDurationChange={(e) => { const d = e.currentTarget.duration; setDur(Number.isFinite(d) && d > 0 ? d : 0) }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />

      <div className="viz-shell card-raised rounded-3xl overflow-hidden flex flex-col lg:flex-row" style={{ background: 'var(--surface)' }}>
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
        <div ref={colRef} className="flex-1 min-w-0 min-h-[300px] sm:min-h-[360px] lg:min-h-0 flex flex-col" style={{ background: '#121010' }}>
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
            <motion.div className="absolute top-3 left-2 sm:top-3.5 sm:left-4 z-10 flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full max-w-[calc(100%-56px)] sm:max-w-[45%] xl:max-w-[32%]" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.15 }}
              style={{ background: 'rgba(20,17,15,.72)', color: '#eee', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.08)' }}>
              <span className="w-7 h-7 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--copper)', color: '#fff' }}><Icon n="music" s={14} /></span>
              <span className="min-w-0 leading-tight"><span className="block text-[11.5px] font-semibold truncate">{file.name}</span><span className="block text-[10px] opacity-60 tabular-nums">{clock(dur)} · {fmtBytes(file.size)}</span></span>
              <button type="button" aria-label="Change file" title="Change file" disabled={busy} className="shrink-0 opacity-70 hover:opacity-100 disabled:opacity-35" onClick={() => fileRef.current?.click()}><Icon n="reset" s={13} /></button>
            </motion.div>

            {/* toolbar */}
            <motion.div className="absolute top-[58px] xl:top-3.5 left-1/2 z-10 flex items-center gap-0.5 p-1 rounded-full max-w-[calc(100%-16px)]" initial={{ opacity: 0, y: -16, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} transition={{ ...SPRING, delay: 0.2 }}
              style={{ background: 'rgba(20,17,15,.78)', color: '#eee', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.09)', boxShadow: '0 12px 30px -10px rgba(0,0,0,.7)' }}>
              <TBtn icon="undo" label="Undo (Ctrl+Z)" onClick={undo} disabled={busy || !canUndo} />
              <TBtn icon="redo" label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={busy || !canRedo} />
              <span className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,.15)' }} />
              <TBtn icon="dice" label="Surprise me" onClick={surprise} disabled={busy} />
              <TBtn icon="reset" label="Reset everything" onClick={() => setWhole({ ...DEFAULTS, title: PR.current.title, subtitle: PR.current.subtitle })} disabled={busy} />
              <span className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,.15)' }} />
              <TBtn icon="expand" label={full ? 'Exit full screen' : 'Full screen'} onClick={goFull} active={full} />
            </motion.div>

            {/* status */}
            <motion.div aria-label={busy ? `Recording ${Math.round(prog * 100)} percent` : playing ? 'Audio playing' : 'Preview signal'} title={busy ? `Recording ${Math.round(prog * 100)}%` : playing ? 'Live audio' : 'Preview signal'} className="absolute top-3 right-2 sm:top-3.5 sm:right-4 flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.25 }}
              style={{ background: 'rgba(20,17,15,.72)', color: '#eee', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.08)' }}>
              <motion.span className="w-2 h-2 rounded-full" style={{ background: busy ? '#e5483a' : playing ? '#46d38c' : '#c9a24a' }} animate={reduceMotion ? { scale: 1, opacity: 1 } : { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={reduceMotion ? { duration: 0 } : { duration: busy ? 0.8 : 1.6, repeat: Infinity }} />
              <AnimatePresence mode="wait" initial={false}><motion.span className="hidden sm:inline" key={busy ? 'r' : playing ? 'l' : 'p'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>{busy ? `Rec ${Math.round(prog * 100)}%` : playing ? 'Live' : 'Preview signal'}</motion.span></AnimatePresence>
            </motion.div>
            {busy && <button type="button" className="absolute left-3 bottom-3 z-20 btn !min-h-9 !py-1.5 !px-3 text-[12px]" onClick={cancelExport}><span aria-hidden="true">×</span> Cancel render</button>}
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
            {resetKeys && <motion.button type="button" disabled={busy} whileHover={{ y: busy ? 0 : -2 }} whileTap={{ scale: busy ? 1 : 0.9 }} onClick={resetSection} className="shrink-0 flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-full border border-line disabled:opacity-50" style={{ color: 'var(--muted)' }}><Icon n="reset" s={12} w={2.2} /> Reset</motion.button>}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={section} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.18 }}>
                {section === 'export' ? <Panel c={c} /> : <fieldset disabled={busy} className="min-w-0 border-0 p-0 m-0"><Panel c={c} /></fieldset>}
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </motion.div>
  )
}

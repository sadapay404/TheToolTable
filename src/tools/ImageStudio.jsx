import { perf, usePerf } from '../lib/perf.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useReducedMotion } from 'framer-motion'
import { Dropzone, AnimatedNumber } from '../components/ui.jsx'
import { Icon, SPRING, computeHistogram } from './studio/controls.jsx'
import CropOverlay, { fitAspect } from './studio/CropOverlay.jsx'
import { LooksPanel, LightPanel, ColorPanel, MixerPanel, GradePanel, FxPanel, CropPanel, ExportPanel, TITLES } from './studio/Panels.jsx'
import { Slider } from './studio/controls.jsx'
import { createRenderer } from '../lib/studio/renderer.js'
import { makeSample } from '../lib/studio/sample.js'
import { renderImage, renderVideo, supportedVideoTypes } from '../lib/studio/exporter.js'
import { DEFAULTS, HSL_CHANNELS, PRESETS, SECTION_KEYS, TRANSFORM_KEYS, applyLook, isModified, transformOf } from '../lib/studio/params.js'
import { studioMediaKind } from '../lib/studio/media.js'
import { createObjectUrlResource, releaseMediaElement, waitForMediaElement } from '../lib/studio/media-source.js'
import { loadSavedLooks, MAX_SAVED_LOOKS, persistLooks, safeLookName, safeLookParams } from '../lib/studio/looks.js'
import { clamp, download, baseName, recentAction, fmtTime } from '../lib/utils.js'

const SECTIONS = ['looks', 'light', 'color', 'mixer', 'grade', 'fx', 'crop', 'export']
const LABEL = { looks: 'Looks', light: 'Light', color: 'Colour', mixer: 'Mixer', grade: 'Grade', fx: 'Effects', crop: 'Crop', export: 'Export' }
const PANEL = { looks: LooksPanel, light: LightPanel, color: ColorPanel, mixer: MixerPanel, grade: GradePanel, fx: FxPanel, crop: CropPanel, export: ExportPanel }
const MAX_BUF = 2200
const PADDING = { l: 28, r: 28, t: 74, b: 28 }
const same = (a, b) => { for (const k in a) if (a[k] !== b[k]) return false; return true }
const isNonTransformPatch = (patch) => Object.keys(patch).some((k) => !TRANSFORM_KEYS.includes(k))
const lookOnly = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => !TRANSFORM_KEYS.includes(k)))

function releaseAudioGraph(audio) {
  if (!audio) return
  try { audio.node?.disconnect() } catch {}
  try { audio.gain?.disconnect() } catch {}
  try { audio.dest?.stream?.getTracks?.().forEach((track) => track.stop()) } catch {}
  try { const closing = audio.ctx?.close?.(); closing?.catch?.(() => {}) } catch {}
}
function makeAudioGraph(video) {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return null
  let ctx
  try {
    ctx = new AudioContext()
    const node = ctx.createMediaElementSource(video)
    const gain = ctx.createGain(), dest = ctx.createMediaStreamDestination()
    node.connect(gain); gain.connect(ctx.destination); node.connect(dest)
    return { ctx, node, gain, dest }
  } catch {
    try { const closing = ctx?.close?.(); closing?.catch?.(() => {}) } catch {}
    return null
  }
}
/* ============================================================================================ */
export default function ImageStudio() {
  const [src, setSrc] = useState(null)
  const [fail, setFail] = useState('')
  const [loading, setLoading] = useState(false)
  const [section, setSection] = useState('looks')
  const [params, setP] = useState(DEFAULTS)
  const pRef = useRef(DEFAULTS)
  const [hist, setHist] = useState(0)
  const [ready, setReady] = useState(0)
  const [renderInfo, setRenderInfo] = useState(null)
  const [box, setBox] = useState({ w: 800, h: 560 })
  const [hover, setHover] = useState(null)
  const [holdOrig, setHoldOrig] = useState(false)
  const [split, setSplit] = useState(null)
  const [pick, setPick] = useState(false)
  const [channel, setChannel] = useState(0)
  const [toast, setToast] = useState('')
  const [thumbs, setThumbs] = useState({})
  const [myLooks, setMyLooks] = useState(loadSavedLooks)
  const [activeLook, setActiveLook] = useState(null)
  const [strength, setStrengthState] = useState(100)
  const [hist3, setHist3] = useState(null)
  const [aspect, setAspectLabel] = useState('Free')
  const [lockA, setLockA] = useState(null)
  const [exp, setExpState] = useState({ scale: 1, fmt: 'png', quality: 95, vext: 'webm', mbps: 25, fps: 30, audio: true })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [vt, setVt] = useState(0)
  const [rate, setRate] = useState(1)
  const [muted, setMuted] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)

  const canvasRef = useRef(null), stageRef = useRef(null), wrapRef = useRef(null), fileRef = useRef(null), lookFileRef = useRef(null)
  const rRef = useRef(null), auxRef = useRef(null), vidRef = useRef(null), audioRef = useRef(null)
  const live = useRef({}), rafRef = useRef(0), exportingRef = useRef(false), abortRef = useRef(null)
  const base = useRef(DEFAULTS), past = useRef([]), future = useRef([]), timer = useRef(0)
  const lookBase = useRef(null), toastTimer = useRef(0), thumbCache = useRef({})
  const sourceLoadSeq = useRef(0), pendingSourceCleanup = useRef(null), activeUrl = useRef(null)
  const videoTypes = useMemo(() => supportedVideoTypes(), [])

  const zoomMV = useMotionValue(1), zoomSpring = useSpring(zoomMV, { stiffness: 300, damping: 30 })
  const panX = useMotionValue(0), panY = useMotionValue(0)

  const say = useCallback((t) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2600) }, [])
  const releaseCurrentMedia = useCallback(() => {
    const video = vidRef.current
    vidRef.current = null
    releaseMediaElement(video)
    const audio = audioRef.current
    audioRef.current = null
    releaseAudioGraph(audio)
    activeUrl.current?.release()
    activeUrl.current = null
  }, [])
  const cancelPendingSource = useCallback(() => {
    sourceLoadSeq.current += 1
    pendingSourceCleanup.current?.()
    pendingSourceCleanup.current = null
    setLoading(false)
  }, [])

  /* ---------------------------------- history ---------------------------------- */
  const commit = useCallback(() => {
    clearTimeout(timer.current)
    const next = pRef.current
    if (!same(base.current, next)) {
      past.current.push(base.current); if (past.current.length > 120) past.current.shift()
      future.current = []; base.current = next; setHist((n) => n + 1)
    }
  }, [])
  const setAll = useCallback((next, immediate = false, keepLook = false) => {
    pRef.current = next; setP(next)
    if (!keepLook) setActiveLook(null)
    clearTimeout(timer.current)
    if (immediate) commit(); else timer.current = setTimeout(commit, 450)
    setHist((n) => n + 1)
  }, [commit])
  const upd = useCallback((patch, immediate = false, keepLook = false) => {
    const next = { ...pRef.current, ...patch }
    setAll(next, immediate, keepLook || !isNonTransformPatch(patch))
  }, [setAll])
  const undo = useCallback(() => {
    commit()
    const prev = past.current.pop(); if (!prev) return
    future.current.push(base.current); base.current = prev; pRef.current = prev; setP(prev); setActiveLook(null); setHist((n) => n + 1)
  }, [commit])
  const redo = useCallback(() => {
    commit()
    const nxt = future.current.pop(); if (!nxt) return
    past.current.push(base.current); base.current = nxt; pRef.current = nxt; setP(nxt); setActiveLook(null); setHist((n) => n + 1)
  }, [commit])
  const canUndo = past.current.length > 0 || !same(base.current, params)
  const canRedo = future.current.length > 0

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName)) return
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (k === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  /* ---------------------------------- source loading ---------------------------------- */
  const resetEditor = useCallback(() => {
    clearTimeout(timer.current)
    pRef.current = DEFAULTS; base.current = DEFAULTS; past.current = []; future.current = []
    setP(DEFAULTS); setActiveLook(null); setSplit(null); setPick(false); setResult(null); setHover(null); setAspectLabel('Free'); setLockA(null)
    setThumbs({}); thumbCache.current = {}; setPlaying(false); setVt(0)
    zoomMV.set(1); panX.set(0); panY.set(0); setZoomPct(100)
  }, [zoomMV, panX, panY])

  const openFile = useCallback(async ([f]) => {
    if (!f) return
    pendingSourceCleanup.current?.()
    pendingSourceCleanup.current = null
    const seq = ++sourceLoadSeq.current
    const kind = studioMediaKind(f)
    if (!kind) { const message = 'Choose an image or video the browser can decode.'; setLoading(false); setFail(message); say(message); return }
    setLoading(true); setFail('')
    let resource = null, url = null, element = null, candidateAudio = null, cancelWait = () => {}, transferred = false, released = false
    const cleanupCandidate = () => {
      if (released) return
      released = true
      cancelWait()
      releaseAudioGraph(candidateAudio); candidateAudio = null
      releaseMediaElement(element)
      resource?.release(); resource = null
    }

    try {
      resource = createObjectUrlResource(f)
      url = resource.url
      element = kind === 'video' ? document.createElement('video') : new Image()
      if (kind === 'video') {
        element.loop = true; element.playsInline = true; element.preload = 'metadata'; element.crossOrigin = 'anonymous'
      }
      const wait = waitForMediaElement(element, kind === 'video' ? 'loadeddata' : 'load', url)
      cancelWait = wait.cancel
      pendingSourceCleanup.current = cleanupCandidate
      const status = await wait.promise
      if (seq !== sourceLoadSeq.current || status?.cancelled) return
      if (status?.error) throw new Error(status.error)

      const w = kind === 'video' ? Number(element.videoWidth) : Number(element.naturalWidth)
      const h = kind === 'video' ? Number(element.videoHeight) : Number(element.naturalHeight)
      const dur = kind === 'video' ? Number(element.duration) : null
      if (!w || !h || (kind === 'video' && (!Number.isFinite(dur) || dur <= 0))) {
        throw new Error('The file has no usable dimensions or duration.')
      }
      if (kind === 'video') candidateAudio = makeAudioGraph(element)

      releaseCurrentMedia()
      if (kind === 'video') {
        vidRef.current = element; audioRef.current = candidateAudio; candidateAudio = null
        setMuted(false); setRate(1)
      }
      activeUrl.current = resource; resource = null; transferred = true
      resetEditor(); setRenderInfo(null)
      setSrc({ kind, name: f.name, size: f.size, w, h, el: element, url, dur: kind === 'video' ? dur : 0 })
      recentAction(`Edited ${f.name} in ImagePlayer Studio`)
    } catch (e) {
      if (seq === sourceLoadSeq.current) {
        const message = e.message || 'Could not open that file'
        setFail(message)
        say(message)
      }
    } finally {
      if (!transferred) cleanupCandidate()
      if (pendingSourceCleanup.current === cleanupCandidate) pendingSourceCleanup.current = null
      if (seq === sourceLoadSeq.current) setLoading(false)
    }
  }, [resetEditor, releaseCurrentMedia, say])

  const openSample = useCallback(() => {
    cancelPendingSource()
    releaseCurrentMedia()
    const c = makeSample(1600, 1000)
    resetEditor(); setFail(''); setRenderInfo(null)
    setSrc({ kind: 'image', name: 'Sample sunset.png', size: 0, w: c.width, h: c.height, el: c, dur: 0 })
  }, [cancelPendingSource, releaseCurrentMedia, resetEditor])

  // renderer lifecycle
  useEffect(() => {
    if (!src) return
    try {
      if (!rRef.current) rRef.current = createRenderer(canvasRef.current)
      if (!rRef.current) throw new Error('This browser does not support WebGL 2, which the studio needs for real-time editing.')
      if (!auxRef.current) {
        try { auxRef.current = createRenderer(document.createElement('canvas')) } catch { auxRef.current = null }
      }
      const isV = src.kind === 'video'
      const info = rRef.current.setSource(src.el, src.w, src.h, isV)
      try { auxRef.current?.setSource(src.el, src.w, src.h, isV) } catch {
        auxRef.current?.destroy?.(); auxRef.current = null
      }
      setRenderInfo({ source: src, w: info.w, h: info.h, capped: info.capped, originalW: src.w, originalH: src.h })
      setFail(''); setReady((n) => n + 1)
    } catch (e) {
      const message = e.message || 'Could not prepare this media for the GPU.'
      setFail(message); say(message)
    }
  }, [src, say])

  // stage size
  useEffect(() => {
    if (!src || !stageRef.current) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(stageRef.current)
    return () => ro.disconnect()
  }, [src])

  /* ---------------------------------- derived view ---------------------------------- */
  const cropTab = section === 'crop'
  const sourceDims = renderInfo?.source === src ? renderInfo : src
  const dims = useMemo(() => {
    if (!src) return { ow: 1, oh: 1 }
    const sw = params.rot % 2 === 1
    return { ow: sw ? sourceDims.h : sourceDims.w, oh: sw ? sourceDims.w : sourceDims.h }
  }, [src, params.rot, sourceDims])
  const outDims = useMemo(() => ({ w: Math.max(1, Math.round(params.cw * dims.ow)), h: Math.max(1, Math.round(params.ch * dims.oh)) }), [params.cw, params.ch, dims])

  const effParams = useMemo(() => {
    if (holdOrig) return { ...DEFAULTS, ...transformOf(params) }
    if (hover && !cropTab) return applyLook(params, hover.p)
    return params
  }, [params, hover, holdOrig, cropTab])

  const showDims = cropTab ? { w: dims.ow, h: dims.oh } : outDims
  const aspectR = showDims.w / showDims.h
  const availW = Math.max(120, box.w - PADDING.l - PADDING.r), availH = Math.max(120, box.h - PADDING.t - PADDING.b)
  const dw = Math.min(availW, availH * aspectR), dh = dw / aspectR
  const dpr = perf.dpr(2)
  const bk = Math.min(1, MAX_BUF / Math.max(dw * dpr, dh * dpr))
  const bw = Math.max(2, Math.round(dw * dpr * bk)), bh = Math.max(2, Math.round(dh * dpr * bk))

  /* ---------------------------------- drawing ---------------------------------- */
  const drawNow = useCallback(() => {
    const r = rRef.current, L = live.current
    if (!r || !L.p || exportingRef.current) return
    const cv = canvasRef.current
    if (cv.width !== L.bw || cv.height !== L.bh) r.setSize(L.bw, L.bh)
    if (L.video) r.refreshVideo()
    r.draw(L.p, { crop: L.crop, split: L.split, seed: 1 })
  }, [])
  const schedule = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; drawNow() })
  }, [drawNow])

  useEffect(() => {
    live.current = { p: effParams, crop: cropTab ? [0, 0, 1, 1] : null, split, bw, bh, video: src?.kind === 'video' }
    schedule()
  }, [effParams, cropTab, split, bw, bh, ready, src, schedule])

  // video playback loop
  useEffect(() => {
    const v = vidRef.current
    if (!src || src.kind !== 'video' || !v) return
    const onSeek = () => { setVt(v.currentTime); schedule() }
    v.addEventListener('seeked', onSeek)
    return () => v.removeEventListener('seeked', onSeek)
  }, [src, schedule])
  useEffect(() => {
    const v = vidRef.current
    if (!playing || !v) return
    let raf, last = 0
    const tick = (t) => {
      drawNow()
      if (t - last > 80) { last = t; setVt(v.currentTime) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, drawNow])
  useEffect(() => () => {
    sourceLoadSeq.current += 1
    pendingSourceCleanup.current?.(); pendingSourceCleanup.current = null
    abortRef.current?.abort()
    cancelAnimationFrame(rafRef.current)
    clearTimeout(timer.current); clearTimeout(toastTimer.current)
    releaseCurrentMedia()
    rRef.current?.destroy?.(); auxRef.current?.destroy?.()
    rRef.current = null; auxRef.current = null
  }, [releaseCurrentMedia])

  const togglePlay = useCallback(async () => {
    const v = vidRef.current; if (!v) return
    try { audioRef.current?.ctx.resume?.()?.catch?.(() => {}) } catch {}
    if (v.paused) { try { await v.play(); setPlaying(true) } catch { say('Playback was blocked by the browser') } }
    else { v.pause(); setPlaying(false) }
  }, [say])
  const scrub = (t) => { const v = vidRef.current; if (v) { v.currentTime = t; setVt(t) } }
  const toggleMute = () => {
    const a = audioRef.current
    if (a) a.gain.gain.value = muted ? 1 : 0
    else if (vidRef.current) vidRef.current.muted = !muted
    setMuted(!muted)
  }
  useEffect(() => { if (vidRef.current) vidRef.current.playbackRate = rate }, [rate, src])

  /* ---------------------------------- histogram ---------------------------------- */
  useEffect(() => {
    if (section !== 'light' || !src) return
    const run = () => {
      const cv = canvasRef.current; if (!cv || !cv.width) return
      const s = document.createElement('canvas'); s.width = 128; s.height = Math.max(8, Math.round((128 * cv.height) / cv.width))
      s.getContext('2d').drawImage(cv, 0, 0, s.width, s.height)
      setHist3(computeHistogram(s))
    }
    const t = setTimeout(run, 120)
    const iv = playing ? setInterval(run, 350) : 0
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [section, effParams, src, ready, playing, bw, bh])

  /* ---------------------------------- thumbnails (separate GL context) ---------------------------------- */
  useEffect(() => {
    const r = auxRef.current
    if (!r || !src) return
    let cancelled = false
    const items = [{ id: 'original', p: {} }, ...PRESETS, ...myLooks]
    const todo = items.filter((it) => !thumbCache.current[it.id])
    let i = 0
    const step = () => {
      if (cancelled) return
      const batch = {}
      for (let n = 0; n < 4 && i < todo.length; n++, i++) {
        const it = todo[i]
        try {
          const c = r.snapshot({ ...DEFAULTS, ...it.p }, 240, { crop: [0, 0, 1, 1] })
          batch[it.id] = c.toDataURL('image/jpeg', 0.82); thumbCache.current[it.id] = batch[it.id]
        } catch {}
      }
      setThumbs((t) => ({ ...t, ...batch }))
      if (i < todo.length) setTimeout(step, 0)
    }
    setTimeout(step, 30)
    return () => { cancelled = true }
  }, [ready, myLooks]) // eslint-disable-line

  /* ---------------------------------- looks ---------------------------------- */
  const applyPreset = (p) => {
    lookBase.current = { ...pRef.current }
    setAll(applyLook(pRef.current, p.p), true, true)
    setActiveLook(p.id === 'original' ? null : p); setStrengthState(100); setHover(null)
  }
  const setStrength = (s) => {
    setStrengthState(s)
    const b = lookBase.current; if (!b || !activeLook) return
    const target = applyLook(b, activeLook.p), next = { ...b }
    for (const k in DEFAULTS) if (!TRANSFORM_KEYS.includes(k)) next[k] = b[k] + (target[k] - b[k]) * (s / 100)
    setAll(next, false, true)
  }
  const saveLook = (name) => {
    const safeName = safeLookName(name, 'My look')
    const item = { id: 'mine-' + Date.now(), name: safeName, cat: 'Mine', p: lookOnly(pRef.current) }
    const list = [...myLooks, item].slice(-MAX_SAVED_LOOKS)
    setMyLooks(list)
    say(persistLooks(list) ? `Saved “${safeName}”` : 'Look saved for this session, but browser storage is unavailable')
  }
  const deleteLook = (id) => {
    const list = myLooks.filter((l) => l.id !== id)
    setMyLooks(list); persistLooks(list); delete thumbCache.current[id]
  }
  const exportLook = () => {
    const name = safeLookName(activeLook?.name, 'My look')
    const json = JSON.stringify({ app: 'TheToolTable', type: 'look', name, p: lookOnly(pRef.current) }, null, 2)
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'my-look'
    download(new Blob([json], { type: 'application/json' }), `${slug}.look.json`)
  }
  const importLook = () => lookFileRef.current?.click()
  const onLookFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
    try {
      if (f.size > 128 * 1024) throw new Error()
      const j = JSON.parse(await f.text())
      const p = safeLookParams(j?.p)
      if (j?.type !== 'look' || !p || !Object.keys(p).length) throw new Error()
      const item = { id: 'mine-' + Date.now(), name: safeLookName(j.name), cat: 'Mine', p }
      const list = [...myLooks, item].slice(-MAX_SAVED_LOOKS)
      setMyLooks(list); persistLooks(list)
      applyPreset(item); setSection('looks'); say(`Loaded “${item.name}”`)
    } catch { say('That is not a valid TheToolTable look file') }
  }

  /* ---------------------------------- auto enhance ---------------------------------- */
  const autoEnhance = () => {
    const r = auxRef.current; if (!r) return
    const c = r.snapshot({ ...DEFAULTS, ...transformOf(pRef.current) }, 128, { crop: [0, 0, 1, 1] })
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const ys = [], n = d.length / 4; let chroma = 0
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255
      ys.push(0.2126 * R + 0.7152 * G + 0.0722 * B); chroma += Math.max(R, G, B) - Math.min(R, G, B)
    }
    ys.sort((a, b) => a - b); chroma /= n
    const q = (f) => ys[Math.floor(clamp(f, 0, 1) * (n - 1))], mean = ys.reduce((a, b) => a + b, 0) / n
    const p1 = q(0.01), p10 = q(0.1), p90 = q(0.9), p99 = q(0.99)
    const patch = {
      exposure: +clamp(Math.log2(0.46 / Math.max(mean, 0.03)) * 0.6, -1.2, 1.2).toFixed(2),
      contrast: Math.round(clamp((0.9 - (p99 - p1)) * 55, -8, 28)),
      blacks: Math.round(clamp(-(p1 - 0.015) * 160, -28, 8)),
      whites: Math.round(clamp((0.96 - p99) * 110, -12, 24)),
      shadows: Math.round(clamp((0.16 - p10) * 160, 0, 32)),
      highlights: Math.round(p90 > 0.88 ? -clamp((p90 - 0.88) * 260, 0, 30) : 0),
      vib: Math.round(clamp((0.24 - chroma) * 190, 0, 38)),
    }
    upd(patch, true); say('Auto-enhanced — fine-tune in Light')
  }

  /* ---------------------------------- crop ---------------------------------- */
  const setAspect = (label, v) => {
    setAspectLabel(label)
    if (v === null) { setLockA(null); return }
    const A = v === 0 ? dims.ow / dims.oh : v
    setLockA(A)
    const r = fitAspect(A, dims.ow, dims.oh)
    upd({ cx: r.x, cy: r.y, cw: r.w, ch: r.h }, true)
  }
  const swapAspect = () => {
    const A = lockA || (params.cw * dims.ow) / (params.ch * dims.oh)
    const B = 1 / A
    setLockA(B); setAspectLabel('Custom')
    const r = fitAspect(B, dims.ow, dims.oh)
    upd({ cx: r.x, cy: r.y, cw: r.w, ch: r.h }, true)
  }
  const rotate90 = () => { setAspectLabel('Free'); setLockA(null); upd({ rot: (pRef.current.rot + 1) % 4, cx: 0, cy: 0, cw: 1, ch: 1 }, true) }
  const fillAngle = () => {
    const p = pRef.current, th = (Math.abs(p.angle) * Math.PI) / 180
    const ar = (p.cw * dims.ow) / (p.ch * dims.oh)
    const h = Math.min(dims.ow / (ar * Math.cos(th) + Math.sin(th)), dims.oh / (ar * Math.sin(th) + Math.cos(th))), w = ar * h
    const cw = w / dims.ow, ch = h / dims.oh
    upd({ cw, ch, cx: (1 - cw) / 2, cy: (1 - ch) / 2 }, true)
  }

  /* ---------------------------------- stage interaction ---------------------------------- */
  useEffect(() => {
    const el = stageRef.current; if (!el || !src) return
    const onWheel = (e) => {
      if (cropTab) return
      e.preventDefault()
      const z = clamp(zoomMV.get() * Math.exp(-e.deltaY * 0.0016), 1, 8)
      zoomMV.set(z); setZoomPct(Math.round(z * 100))
      if (z <= 1.001) { panX.set(0); panY.set(0) }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [src, cropTab, zoomMV, panX, panY])
  const setZoom = (z) => { zoomMV.set(z); setZoomPct(Math.round(z * 100)); if (z <= 1.001) { panX.set(0); panY.set(0) } }
  const dragPan = useRef(null)
  const onStageDown = (e) => {
    if (pick) { // eyedropper
      const r = wrapRef.current.getBoundingClientRect()
      const cv = canvasRef.current
      const x = ((e.clientX - r.left) / r.width) * cv.width, y = ((e.clientY - r.top) / r.height) * cv.height
      if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return
      const [R, G, B] = Array.from(rRef.current.readPixel(x, y), (v) => v / 255)
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), c = mx - mn
      setPick(false)
      if (c < 0.06) return say('That spot is neutral grey — pick a more colourful area')
      let h = mx === R ? ((G - B) / c) % 6 : mx === G ? (B - R) / c + 2 : (R - G) / c + 4
      h = ((h * 60) + 360) % 360
      let best = 0, bd = 999
      HSL_CHANNELS.forEach((ch, i) => { const d = Math.min(Math.abs(ch.hue - h), 360 - Math.abs(ch.hue - h)); if (d < bd) { bd = d; best = i } })
      setChannel(best); say(`Picked ${HSL_CHANNELS[best].label}`)
      return
    }
    if (zoomMV.get() > 1.02 && !cropTab) { dragPan.current = { x: e.clientX, y: e.clientY, px: panX.get(), py: panY.get() }; e.currentTarget.setPointerCapture(e.pointerId) }
  }
  const onStageMove = (e) => { const d = dragPan.current; if (d) { panX.set(d.px + e.clientX - d.x); panY.set(d.py + e.clientY - d.y) } }
  const onStageUp = () => { dragPan.current = null }
  const splitDrag = useRef(false)
  const moveSplit = (e) => { if (!splitDrag.current) return; const r = wrapRef.current.getBoundingClientRect(); setSplit(clamp((e.clientX - r.left) / r.width, 0.02, 0.98)) }

  /* ---------------------------------- export ---------------------------------- */
  const setExp = (patch) => setExpState((e) => ({ ...e, ...patch }))
  useEffect(() => { if (videoTypes.length && !videoTypes.find((t) => t.ext === exp.vext)) setExp({ vext: videoTypes[0].ext }) }, [videoTypes]) // eslint-disable-line
  const outName = (ext) => `${baseName(src.name)}_edit.${ext}`
  const saveResult = () => { if (result?.blob) download(result.blob, result.name) }

  const exportImage = async () => {
    if (busy) return
    const paramsForExport = { ...pRef.current }
    const ext = exp.fmt === 'jpeg' ? 'jpg' : exp.fmt
    const name = outName(ext)
    setBusy(true); setResult(null); exportingRef.current = true
    try {
      await new Promise((resolve) => setTimeout(resolve, 60))
      const rendered = await renderImage(rRef.current, paramsForExport, { fmt: exp.fmt, quality: exp.quality / 100, scale: exp.scale })
      setResult({ name, w: rendered.w, h: rendered.h, size: rendered.blob.size, blob: rendered.blob })
      try { download(rendered.blob, name) } catch { say('Image is ready. Use Save image below to download it.') }
      if (rendered.capped) say('Scaled down to the maximum safe GPU texture size')
    } catch (e) { say(e.message || 'Image export failed') }
    finally { exportingRef.current = false; setBusy(false); drawNow() }
  }
  const copyImage = async () => {
    if (busy) return
    const paramsForExport = { ...pRef.current }
    setBusy(true); exportingRef.current = true
    try {
      const rendered = await renderImage(rRef.current, paramsForExport, { fmt: 'png', scale: Math.min(exp.scale, 1) })
      exportingRef.current = false; drawNow()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': rendered.blob })])
      say('Copied to clipboard')
    } catch { say('Clipboard access was blocked by the browser') }
    finally { exportingRef.current = false; setBusy(false); drawNow() }
  }
  const doRenderVideo = async () => {
    if (busy) return
    const t = videoTypes.find((x) => x.ext === exp.vext) || videoTypes[0]
    if (!t) return say('This browser cannot record video')
    const v = vidRef.current, a = audioRef.current
    if (!v) return say('The source video is no longer available')
    const paramsForExport = { ...pRef.current }
    const name = outName(t.ext)
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true); setResult(null); setProgress(0); setPlaying(false); exportingRef.current = true
    v.pause()
    let prevGain
    try {
      if (a) {
        try { await a.ctx.resume() } catch {}
        prevGain = a.gain.gain.value
        a.gain.gain.value = 0 // the recorder taps the WebAudio destination before the monitor gain
      }
      const rendered = await renderVideo({ renderer: rRef.current, video: v, params: paramsForExport, audioStream: exp.audio && a ? a.dest.stream : null, mime: t.mime, bps: exp.mbps * 1e6, fps: exp.fps, scale: exp.scale, speed: rate, onProgress: setProgress, signal: controller.signal })
      if (rendered) {
        setResult({ name, w: rendered.w, h: rendered.h, size: rendered.blob.size, blob: rendered.blob })
        try { download(rendered.blob, name) } catch { say('Video is ready. Use Save video below to download it.') }
      } else say('Render cancelled')
    } catch (e) { say(e.message || 'Rendering failed') }
    finally {
      if (a) { try { a.gain.gain.value = muted ? 0 : (prevGain ?? 1) } catch {} }
      if (abortRef.current === controller) abortRef.current = null
      exportingRef.current = false; setBusy(false); drawNow()
    }
  }

  /* ---------------------------------- panel context ---------------------------------- */
  const sl = (key, label, o = {}) => (
    <Slider key={key} label={label} value={params[key]} def={DEFAULTS[key]} onChange={(v) => upd({ [key]: v })} {...o} />
  )
  const ctx = {
    params, upd, sl, src, dims, outDims, hist: hist3, thumbs, activeLook, strength, setStrength, applyPreset, setHover, myLooks, saveLook, deleteLook,
    channel, setChannel, pick, setPick, aspect, setAspect, swapAspect, rotate90, fillAngle, exp, setExp, busy, progress, result, videoTypes,
    exportImage, copyImage, renderVideo: doRenderVideo, saveResult, exportLook, importLook,
  }

  const resetSection = () => {
    const keys = section === 'looks' ? Object.keys(DEFAULTS).filter((k) => !TRANSFORM_KEYS.includes(k)) : SECTION_KEYS[section]
    if (!keys) return
    const patch = {}; keys.forEach((k) => { patch[k] = DEFAULTS[k] })
    if (section === 'crop') { setAspectLabel('Free'); setLockA(null) }
    upd(patch, true)
  }
  const sectionDirty = (s) => s === 'looks' ? !!activeLook : isModified(params, s)
  const anyDirty = section === 'looks' ? Object.keys(DEFAULTS).some((k) => !TRANSFORM_KEYS.includes(k) && params[k] !== DEFAULTS[k]) : isModified(params, section)

  /* ============================================ RENDER ============================================ */
  const Panel = PANEL[section]
  const title = TITLES[section]
  const isVideo = src?.kind === 'video'

  if (!src) {
    return (
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
          <Dropzone onFiles={openFile} accept="image/*,video/*" label="Drop a photo or a video" sub="Everything is edited on your GPU — nothing is uploaded">
            <HeroSwatches loading={loading} />
          </Dropzone>
        </motion.div>
        <motion.div className="flex flex-wrap items-center justify-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} className="btn" onClick={openSample}><Icon n="wand" s={15} /> Try a sample image</motion.button>
        </motion.div>
        {fail && <div className="text-center text-[13px]" style={{ color: '#b4432f' }}>{fail}</div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[[PRESETS.length, 'one-click looks', 'Cinematic, film, mono and creative styles with live hover preview.'], [24, 'colour mixer sliders', 'Hue, saturation and luminance for eight colour ranges.'], [3, 'way colour grading', 'Shadow, midtone and highlight wheels with a blend control.'], [12, 'crop ratios', 'Drag handles, straighten, rotate and flip — on photos and video.']].map(([n, a, b], i) => (
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

  const cropRect = { x: params.cx, y: params.cy, w: params.cw, h: params.ch }
  const lockPx = lockA

  return (
    <motion.div className="relative" style={{ left: '50%', width: 'min(1480px, calc(100vw - 32px))', marginLeft: 'calc(min(1480px, calc(100vw - 32px)) / -2)' }} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
      <input ref={fileRef} type="file" hidden disabled={busy} accept="image/*,video/*" onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; openFile(f) }} />
      <input ref={lookFileRef} type="file" hidden accept=".json,application/json" onChange={onLookFile} />
      <div className="card-raised rounded-3xl overflow-hidden flex flex-col lg:flex-row min-h-[790px] h-auto lg:min-h-0 lg:h-[clamp(620px,calc(100vh-210px),940px)]" style={{ background: 'var(--surface)' }}>

        {/* ---------------- section rail ---------------- */}
        <nav className="shrink-0 flex lg:flex-col gap-1 p-2 lg:py-4 lg:w-[78px] overflow-x-auto border-b lg:border-b-0 lg:border-r border-line" style={{ background: 'var(--surface2)' }}>
          {SECTIONS.map((s, i) => (
            <motion.button key={s} onClick={() => { setSection(s); setPick(false) }} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.05 + i * 0.04 }}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} className="relative flex flex-col items-center gap-1 py-2.5 px-3 rounded-2xl shrink-0 lg:w-full" aria-label={LABEL[s]}
              style={{ color: section === s ? 'var(--bg)' : 'var(--muted)' }}>
              {section === s && <motion.span layoutId="rail-pill" className="absolute inset-0 rounded-2xl" style={{ background: 'var(--ink)', boxShadow: '0 8px 18px -8px rgba(0,0,0,.5)' }} transition={SPRING} />}
              <span className="relative z-10"><Icon n={s === 'looks' ? 'looks' : s} s={20} /></span>
              <span className="relative z-10 text-[10px] font-bold tracking-wide">{LABEL[s]}</span>
              <AnimatePresence>
                {s !== 'export' && sectionDirty(s) && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-1.5 right-2.5 z-10 w-[7px] h-[7px] rounded-full" style={{ background: 'var(--copper)', boxShadow: '0 0 0 2px var(--surface2)' }} />}
              </AnimatePresence>
            </motion.button>
          ))}
        </nav>

        {/* ---------------- stage ---------------- */}
        <div className="flex-1 min-w-0 min-h-[420px] flex flex-col" style={{ background: '#121010' }}>
          <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden select-none" style={{ cursor: pick ? 'crosshair' : zoomPct > 102 && !cropTab ? 'grab' : 'default', backgroundImage: 'radial-gradient(ellipse at 50% 40%, #2a2420 0%, #121010 70%), radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '100% 100%, 22px 22px' }}
            onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp}>

            {/* canvas */}
            <div className="absolute inset-0 grid place-items-center" style={{ paddingTop: PADDING.t, paddingBottom: PADDING.b, paddingLeft: PADDING.l, paddingRight: PADDING.r }}>
              <motion.div ref={wrapRef} className="relative" initial={false} animate={{ width: dw, height: dh }} transition={SPRING}
                style={{ scale: zoomSpring, x: panX, y: panY, boxShadow: '0 30px 80px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.07)', backgroundImage: 'conic-gradient(#2c2724 25%, #342f2b 0 50%, #2c2724 0 75%, #342f2b 0)', backgroundSize: '18px 18px' }}>
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
                {cropTab && <CropOverlay rect={cropRect} lock={lockPx} ow={dims.ow} oh={dims.oh} onChange={(r) => upd({ cx: r.x, cy: r.y, cw: r.w, ch: r.h })} />}
                {split != null && !cropTab && (
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
              </motion.div>
            </div>

            {/* file chip */}
            <motion.div className="absolute top-[58px] md:top-4 left-3 md:left-4 flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 rounded-full max-w-[34%]" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.15 }}
              style={{ background: 'rgba(20,17,15,.72)', color: '#eee', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.08)' }}>
              <span className="w-7 h-7 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--copper)', color: '#fff' }}><Icon n={isVideo ? 'film' : 'image'} s={14} /></span>
              <span className="min-w-0 leading-tight"><span className="block text-[11.5px] font-semibold truncate">{src.name}</span><span className="block text-[10px] opacity-60 tabular-nums">{src.w}×{src.h}{isVideo ? ` · ${fmtTime(src.dur)}` : ''}</span></span>
            </motion.div>
            {renderInfo?.source === src && renderInfo.capped && <div className="absolute bottom-4 left-4 max-w-[62%] rounded-lg px-2.5 py-1.5 text-[10.5px] text-white" style={{ background: 'rgba(20,17,15,.82)' }}>
              GPU limit: editing and export use {renderInfo.w}×{renderInfo.h} (source {src.w}×{src.h}).
            </div>}

            {/* toolbar */}
            <motion.div className="absolute top-4 left-1/2 flex max-w-[calc(100%-16px)] items-center gap-0.5 p-1 rounded-full overflow-x-auto" initial={{ opacity: 0, y: -16, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} transition={{ ...SPRING, delay: 0.2 }}
              style={{ background: 'rgba(20,17,15,.78)', color: '#eee', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.09)', boxShadow: '0 12px 30px -10px rgba(0,0,0,.7)' }}>
              <TB icon="undo" label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} />
              <TB icon="redo" label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo} />
              <Sep />
              <TB icon="wand" label="Auto enhance" onClick={autoEnhance} />
              <TB icon="compare" label="Before / after" active={split != null} onClick={() => setSplit(split == null ? 0.5 : null)} />
              <TB icon="eye" label="Hold to see original" active={holdOrig} onDown={() => setHoldOrig(true)} onUp={() => setHoldOrig(false)} onKeyDown={(e) => { if (e.code === 'Space' || e.key === 'Enter') setHoldOrig(true) }} onKeyUp={(e) => { if (e.code === 'Space' || e.key === 'Enter') setHoldOrig(false) }} onBlur={() => setHoldOrig(false)} />
              <Sep />
              <TB icon="zoom" label={zoomPct > 102 ? 'Fit to screen' : '100% pixels'} active={zoomPct > 102} onClick={() => setZoom(zoomPct > 102 ? 1 : clamp(Math.max(showDims.w / dw, 2), 1, 8))} />
              <TB icon="reset" label="Replace file" disabled={busy} onClick={() => fileRef.current?.click()} />
            </motion.div>

            {/* zoom badge */}
            <AnimatePresence>{zoomPct > 102 && <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="absolute bottom-4 right-4 mono text-[11px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(20,17,15,.75)', color: '#eee' }}>{zoomPct}%</motion.div>}</AnimatePresence>

            {/* hover preview label, toast */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
              <AnimatePresence>
                {hover && !cropTab && <motion.div key="hv" initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.9 }} transition={SPRING} className="px-4 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: 'var(--copper)', color: '#fff', boxShadow: '0 8px 20px -6px rgba(0,0,0,.6)' }}>Preview · {hover.name}</motion.div>}
                {pick && <motion.div key="pk" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="px-4 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: 'rgba(20,17,15,.85)', color: '#fff' }}>Click a colour in the image</motion.div>}
                {toast && <motion.div key={toast} initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={SPRING} className="px-4 py-2 rounded-full text-[12.5px] font-semibold" style={{ background: 'rgba(20,17,15,.9)', color: '#fff', border: '1px solid rgba(255,255,255,.12)' }}>{toast}</motion.div>}
              </AnimatePresence>
            </div>

            {/* rendering overlay */}
            <AnimatePresence>
              {busy && isVideo && (
                <motion.div className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(12,10,9,.55)', backdropFilter: 'blur(3px)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <motion.div className="text-center text-white px-8 py-7 rounded-3xl" style={{ background: 'rgba(20,17,15,.88)', border: '1px solid rgba(255,255,255,.1)' }} initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} transition={SPRING}>
                    <Ring value={progress} />
                    <div className="display font-semibold text-[18px] mt-3">Rendering your video</div>
                    <div className="text-[12px] opacity-70 mt-1 max-w-[250px]">Real-time GPU encode — keep this tab in the foreground.</div>
                    <motion.button whileTap={{ scale: 0.93 }} className="btn mt-4 !py-2 text-[12.5px]" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} onClick={() => abortRef.current?.abort()}>Cancel</motion.button>
                  </motion.div>
                </motion.div>
              )}
              {fail && <motion.div className="absolute inset-0 grid place-items-center text-white text-center p-8" style={{ background: 'rgba(12,10,9,.86)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="max-w-sm"><div className="display text-[18px] font-semibold mb-2">Can’t use this media</div><div className="text-[13px] opacity-80">{fail}</div>
                  <button className="btn mt-4" onClick={() => { setFail(''); fileRef.current?.click() }}>Choose another file</button>
                </div>
              </motion.div>}
            </AnimatePresence>
          </div>

          {/* ---------------- video transport ---------------- */}
          <AnimatePresence initial={false}>
            {isVideo && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 62, opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="shrink-0 overflow-hidden" style={{ background: '#1a1613', borderTop: '1px solid rgba(255,255,255,.07)' }}>
                <div className="h-[62px] px-2 sm:px-5 flex items-center gap-2 sm:gap-4 text-white">
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.86 }} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="w-10 h-10 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--copper)' }}>
                    <AnimatePresence mode="wait" initial={false}><motion.span key={playing ? 'p' : 'q'} initial={{ scale: 0.4, rotate: -45, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.14 }}><Icon n={playing ? 'pause' : 'play'} s={17} w={2} /></motion.span></AnimatePresence>
                  </motion.button>
                  <span className="mono text-[10px] sm:text-[11.5px] tabular-nums opacity-80 w-[72px] sm:w-[92px] shrink-0">{fmtTime(vt)} / {fmtTime(src.dur)}</span>
                  <div className="relative flex-1 h-6 flex items-center group">
                    <div className="absolute left-0 right-0 h-[5px] rounded-full" style={{ background: 'rgba(255,255,255,.14)' }} />
                    <div className="absolute left-0 h-[5px] rounded-full" style={{ width: `${(vt / (src.dur || 1)) * 100}%`, background: 'var(--copper)' }} />
                    <div className="absolute w-3.5 h-3.5 rounded-full -ml-[7px] transition-transform group-hover:scale-125" style={{ left: `${(vt / (src.dur || 1)) * 100}%`, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.6)' }} />
                    <input type="range" min={0} max={src.dur || 1} step={0.01} value={vt} onChange={(e) => scrub(+e.target.value)} aria-label="Seek" className="absolute inset-0 w-full opacity-0 cursor-pointer" />
                  </div>
                  <div className="flex gap-0.5 sm:gap-1 shrink-0">
                    {[0.5, 1, 1.5, 2].map((r) => (
                      <button key={r} onClick={() => setRate(r)} className="relative px-1 sm:px-2 py-1 rounded-full text-[9px] sm:text-[10.5px] font-bold" style={{ color: rate === r ? '#111' : 'rgba(255,255,255,.65)' }}>
                        <motion.span className="absolute inset-0 rounded-full" style={{ background: '#fff' }} initial={false} animate={{ opacity: rate === r ? 1 : 0, scale: rate === r ? 1 : 0.6 }} transition={SPRING} /><span className="relative">{r}×</span>
                      </button>
                    ))}
                  </div>
                  <motion.button whileTap={{ scale: 0.82 }} onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} className="opacity-80 hover:opacity-100 shrink-0"><Icon n={muted ? 'mute' : 'vol'} s={18} /></motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---------------- inspector ---------------- */}
        <aside className="shrink-0 lg:w-[372px] flex flex-col min-h-[320px] max-h-[70vh] lg:max-h-none border-t lg:border-t-0 lg:border-l border-line" style={{ background: 'var(--surface)' }}>
          <div className="px-6 pt-5 pb-3 flex items-end justify-between gap-3 border-b border-line">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.14 }}>
                <div className="display font-semibold text-[22px] leading-tight">{title[0]}</div>
                <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{title[1]}</div>
              </motion.div>
            </AnimatePresence>
            <AnimatePresence>
              {anyDirty && section !== 'export' && (
                <motion.button initial={{ opacity: 0, scale: 0.6, x: 10 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={SPRING} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} onClick={resetSection} className="btn btn-ghost !py-1.5 !px-3 text-[11.5px]"><Icon n="reset" s={13} /> Reset</motion.button>
              )}
            </AnimatePresence>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={section} initial={{ opacity: 0, x: 22 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -22 }} transition={{ duration: 0.16 }}>
                <Panel c={ctx} />
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </motion.div>
  )
}

/* ----------------------------------- small pieces ----------------------------------- */
function TB({ icon, label, onClick, onDown, onUp, onKeyDown, onKeyUp, onBlur, active, disabled }) {
  return (
    <motion.button title={label} aria-label={label} aria-pressed={active == null ? undefined : active} disabled={disabled} onClick={onClick}
      onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={onBlur}
      whileHover={disabled ? {} : { scale: 1.14, y: -1 }} whileTap={disabled ? {} : { scale: 0.82 }}
      className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ opacity: disabled ? 0.3 : 1, background: active ? 'var(--copper)' : 'transparent', color: '#fff' }}>
      <Icon n={icon} s={17} />
    </motion.button>
  )
}
const Sep = () => <span className="w-px h-5 mx-1 shrink-0" style={{ background: 'rgba(255,255,255,.15)' }} />

function Ring({ value }) {
  const R = 38, C = 2 * Math.PI * R
  return (
    <div className="relative w-[104px] h-[104px] mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="7" />
        <motion.circle cx="50" cy="50" r={R} fill="none" stroke="var(--copper)" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - value) }} transition={{ duration: 0.2 }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center display font-semibold text-[24px] tabular-nums"><span className="flex items-baseline"><AnimatedNumber value={Math.round(value * 100)} /><span className="text-[14px] ml-0.5">%</span></span></div>
    </div>
  )
}

function HeroSwatches({ loading }) {
  const perfNow = usePerf()
  const reduceMotion = useReducedMotion() || perfNow.level === 'lite'
  const cols = ['#E8A33D', '#C0563B', '#7A4E9C', '#2F6F9E', '#2F9C95', '#6E9C3B']
  return (
    <div className="py-6">
      <div className="flex justify-center items-end gap-2.5 h-[66px] mb-5">
        {cols.map((c, i) => (
          <motion.span key={c} className="block w-9 rounded-full" style={{ background: `linear-gradient(180deg, ${c}, color-mix(in srgb, ${c} 55%, #000))`, boxShadow: `0 8px 18px -6px ${c}` }}
            animate={reduceMotion ? { height: loading ? 48 : 42 + (i % 3) * 6 } : { height: loading ? [30, 66, 30] : [34, 58 - (i % 3) * 8, 34] }}
            transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: loading ? 0.9 : 2.6, delay: i * 0.15, ease: 'easeInOut' }} />
        ))}
      </div>
      <div className="display font-semibold text-[19px] text-center">{loading ? 'Opening…' : 'Drop a photo or a video'}</div>
      <div className="text-[13px] mt-1.5 text-center" style={{ color: 'var(--muted)' }}>Colour-grade, crop and export — all on your GPU, nothing is uploaded</div>
    </div>
  )
}

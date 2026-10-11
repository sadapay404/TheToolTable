import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dropzone, AnimatedNumber } from '../components/ui.jsx'
import { Icon } from './studio/controls.jsx'
import Timeline from './frames/Timeline.jsx'
import { SnapshotPanel, TrimPanel, GifPanel, Chip } from './frames/Panels.jsx'
import { clock } from '../components/RangeTrack.jsx'
import { fmtBytes, fmtTime, download, baseName, extName, recentAction, clamp } from '../lib/utils.js'
import { useDecorativeMotion } from '../lib/motion.js'
import { clipMediaFile } from '../lib/media-clip.js'
import { tc, isVideoFile, fixDuration, detectFps, grabFrame, filmstrip, encodeGif, frameSeries } from '../lib/frames.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }
const SLOTS = 18
const MAX_TRAY_ITEMS = 20
const MAX_TRAY_BYTES = 120 * 1024 * 1024
const TABS = [['snap', 'Snapshot', 'camera'], ['trim', 'Trim', 'scissors'], ['gif', 'GIF', 'gif']]

/** Press-and-hold repeats (frame stepping at speed). */
function StepBtn({ onStep, children, label, wide }) {
  const to = useRef(null), iv = useRef(null)
  const stop = () => { clearTimeout(to.current); clearInterval(iv.current) }
  useEffect(() => stop, [])
  return (
    <motion.button type="button" aria-label={label} whileHover={{ y: -2 }} whileTap={{ scale: 0.88 }}
      className={`btn !rounded-xl !py-2 ${wide ? '!px-3.5' : '!px-3'} text-[12px] font-bold flex items-center gap-1.5 select-none`}
      onClick={(e) => { if (e.detail === 0) onStep() }}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.isPrimary === false) return
        e.currentTarget.setPointerCapture?.(e.pointerId); onStep(); stop()
        to.current = setTimeout(() => { iv.current = setInterval(onStep, 65) }, 380)
      }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
      {children}
    </motion.button>
  )
}

export default function FrameExtractor() {
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState('')
  const [fps, setFps] = useState(30)
  const [fpsAuto, setFpsAuto] = useState(null) // null = detecting, true = detected, false = guessed
  const [fpsTxt, setFpsTxt] = useState('30')
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [muted, setMuted] = useState(false)
  const [loopSel, setLoopSel] = useState(false)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [thumbs, setThumbs] = useState([])
  const [tab, setTab] = useState('snap')
  const [cfg, setCfgState] = useState({ fmt: 'png', count: 12, gifW: 480, gifFps: 12, gifLoop: true })
  const [shots, setShots] = useState([])
  const [toast, setToast] = useState('')
  const [flash, setFlash] = useState(0)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [series, setSeries] = useState({ busy: false, prog: 0, result: null })
  const [trim, setTrim] = useState({ busy: false, prog: 0, phase: '', error: '', result: null })
  const [gif, setGif] = useState({ busy: false, prog: 0, n: 0, total: 0, error: '', result: null })
  const [jobBusy, setJobBusy] = useState(false)

  const videoRef = useRef(null)
  const stageRef = useRef(null)
  const gifCanvasRef = useRef(null)
  const fileRef = useRef(null)
  const dead = useRef(false)
  const outputJob = useRef(false)
  const loadId = useRef(0)
  const currentUrl = useRef('')
  const shotsRef = useRef([])
  const gifUrlRef = useRef('')
  const live = useRef({})
  const set = (p) => setCfgState((c) => ({ ...c, ...p }))
  const toastT = useRef(null)
  const say = (m) => {
    if (dead.current) return
    setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => { if (!dead.current) setToast('') }, 2200)
  }

  const duration = meta?.d || 0
  const frame = Math.floor(t * fps + 1e-6)
  const base = file ? baseName(file.name) : 'video'
  live.current = { t, fps, start, end, duration, playing, loopSel }

  useEffect(() => {
    dead.current = false
    return () => { dead.current = true; loadId.current++; clearTimeout(toastT.current) }
  }, [])
  useEffect(() => { shotsRef.current = shots }, [shots])
  useEffect(() => { gifUrlRef.current = gif.result?.url || '' }, [gif.result?.url])
  useEffect(() => {
    if (!url) return
    const ownedUrl = url
    return () => URL.revokeObjectURL(ownedUrl)
  }, [url])
  useEffect(() => () => {
    shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url))
    if (gifUrlRef.current) URL.revokeObjectURL(gifUrlRef.current)
  }, [])

  const clearOutputs = () => {
    shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url))
    shotsRef.current = []
    setShots([])
    if (gifUrlRef.current) URL.revokeObjectURL(gifUrlRef.current)
    gifUrlRef.current = ''
    setGif({ busy: false, prog: 0, n: 0, total: 0, error: '', result: null })
    setTrim({ busy: false, prog: 0, phase: '', error: '', result: null })
    setSeries({ busy: false, prog: 0, result: null })
  }

  /* ------------------------------- load ------------------------------- */
  const load = (files) => {
    if (outputJob.current) { say('Wait for the current export to finish before changing videos.'); return }
    const f = [...(files || [])].find(isVideoFile)
    if (!f) { setError('Choose a supported video file, such as MP4, MOV, MKV or WebM.'); return }
    loadId.current++
    let nextUrl
    try { nextUrl = URL.createObjectURL(f) }
    catch { setError('The browser could not open that video file.'); return }
    currentUrl.current = nextUrl
    setFile(f); setUrl(nextUrl); setMeta(null); setError(''); setT(0); setPlaying(false)
    setStart(0); setEnd(0); setThumbs([]); setFps(30); setFpsTxt('30'); setFpsAuto(null)
    clearOutputs()
  }
  const reset = () => {
    if (outputJob.current) { say('Wait for the current export to finish before closing this video.'); return }
    loadId.current++
    currentUrl.current = ''
    clearOutputs()
    setFile(null); setUrl(''); setMeta(null); setError(''); setT(0); setPlaying(false); setThumbs([])
  }

  const onMeta = async (e, expectedUrl) => {
    if (expectedUrl !== currentUrl.current || dead.current) return
    const id = loadId.current
    const v = e.currentTarget
    try {
      const d = await fixDuration(v)
      if (expectedUrl !== currentUrl.current || id !== loadId.current || dead.current) return
      if (!v.videoWidth || !Number.isFinite(d) || d <= 0) { setError('This browser could not read this video. Try MP4 (H.264) or WebM.'); return }
      setMeta({ w: v.videoWidth, h: v.videoHeight, d }); setStart(0); setEnd(d)
      const f = await detectFps(v)
      if (expectedUrl !== currentUrl.current || id !== loadId.current || dead.current) return
      if (f) { setFps(f); setFpsTxt(String(f)); setFpsAuto(true) }
      else { setFps(30); setFpsTxt('30'); setFpsAuto(false) }
      setT(0)
    } catch (e) {
      if (expectedUrl === currentUrl.current && id === loadId.current) setError(e.message || 'Could not read this video')
    }
  }

  /* filmstrip */
  useEffect(() => {
    if (!url || !meta) return
    let off = false
    filmstrip(url, meta.d, SLOTS, { cancelled: () => off, onThumb: (i, d) => !off && setThumbs((a) => { const n = a.slice(); n[i] = d; return n }) }).catch(() => {})
    return () => { off = true }
  }, [url, meta?.d]) // eslint-disable-line

  /* Keep the playhead smooth during playback, but do not spin an animation loop while paused. */
  useEffect(() => {
    if (!file) return
    let raf = 0, lastPaint = 0
    const v = videoRef.current
    const syncTime = () => {
      const node = videoRef.current
      if (!node) return
      const currentTime = node.currentTime, frameRate = live.current.fps
      setT((prev) => Math.floor(prev * frameRate + 1e-6) === Math.floor(currentTime * frameRate + 1e-6) ? prev : currentTime)
    }
    if (!playing) {
      v?.addEventListener('seeked', syncTime); v?.addEventListener('timeupdate', syncTime)
      syncTime()
      return () => { v?.removeEventListener('seeked', syncTime); v?.removeEventListener('timeupdate', syncTime) }
    }
    const loop = (now = 0) => {
      const node = videoRef.current
      if (node) {
        const L = live.current
        if (L.loopSel && node.currentTime >= L.end) node.currentTime = L.start
        if (now - lastPaint >= 33) { lastPaint = now; syncTime() }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [file, playing])

  /* stage geometry */
  useEffect(() => {
    if (!file || !stageRef.current) return
    const node = stageRef.current
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure) }
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(node); return () => ro.disconnect()
  }, [!!file]) // eslint-disable-line
  const ar = meta ? meta.w / meta.h : 16 / 9
  const aw = Math.max(160, box.w - 56), ah = Math.max(120, box.h - 120)
  const dw = Math.min(aw, ah * ar), dh = dw / ar

  /* ------------------------------- transport ------------------------------- */
  const seek = useCallback((x) => {
    const v = videoRef.current; if (!v) return
    const { fps: f, duration: d } = live.current
    const k = Math.floor(clamp(x, 0, d) * f + 1e-6)
    v.currentTime = clamp((k + 0.5) / f, 0, Math.max(0, d - 0.001))
    setT(v.currentTime)
  }, [])
  const stepFrames = useCallback((n) => { const v = videoRef.current; if (!v) return; v.pause(); const { fps: f } = live.current; seek((Math.floor(v.currentTime * f + 1e-6) + n) / f) }, [seek])
  const toggle = useCallback(() => {
    const v = videoRef.current; if (!v) return
    if (v.paused) {
      if (v.currentTime >= live.current.end - 0.02) v.currentTime = live.current.start
      v.play().catch(() => setError('The browser blocked video playback. Tap the video to try again.'))
    } else v.pause()
  }, [])
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate }, [rate, meta])
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted }, [muted, meta])
  const onRange = (a, b) => {
    if (!duration) return
    const gap = Math.min(1 / Math.max(1, fps), duration)
    let from = clamp(Number.isFinite(a) ? a : 0, 0, duration)
    let to = clamp(Number.isFinite(b) ? b : duration, 0, duration)
    if (to - from < gap) {
      if (from + gap <= duration) to = from + gap
      else from = Math.max(0, to - gap)
    }
    setStart(from); setEnd(to)
  }

  /* ------------------------------- actions ------------------------------- */
  const frameName = (ext) => `${base}-f${String(frame).padStart(5, '0')}-${(frame / fps).toFixed(3)}s.${ext}`
  const capture = async (fmt) => {
    const v = videoRef.current, id = loadId.current
    if (!v) throw new Error('Load a video before capturing a frame')
    if (v.seeking || v.readyState < 2) {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer)
          v.removeEventListener('seeked', finish); v.removeEventListener('loadeddata', finish); v.removeEventListener('error', fail)
        }
        const finish = () => {
          if (id !== loadId.current || dead.current) { cleanup(); reject(new Error('The video changed before the frame was ready.')); return }
          if (v.seeking || v.readyState < 2) return
          cleanup(); resolve()
        }
        const fail = () => { cleanup(); reject(new Error('The browser could not decode this frame.')) }
        const timer = setTimeout(() => { cleanup(); reject(new Error('The video frame is still loading. Try again in a moment.')) }, 6000)
        v.addEventListener('seeked', finish); v.addEventListener('loadeddata', finish); v.addEventListener('error', fail); finish()
      })
    }
    if (id !== loadId.current || dead.current) throw new Error('The video changed before the frame was captured.')
    await new Promise((resolve) => requestAnimationFrame(resolve))
    if (id !== loadId.current || dead.current || v !== videoRef.current) throw new Error('The video changed before the frame was captured.')
    return grabFrame(v, fmt)
  }
  const addTray = (blob, name, tt) => {
    const current = shotsRef.current
    const bytes = current.reduce((sum, shot) => sum + shot.blob.size, 0)
    if (current.length >= MAX_TRAY_ITEMS || bytes + blob.size > MAX_TRAY_BYTES) {
      say(`The capture tray is limited to ${MAX_TRAY_ITEMS} frames and ${fmtBytes(MAX_TRAY_BYTES)}. Download or remove a frame first.`)
      return false
    }
    const entry = { id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2), url: URL.createObjectURL(blob), blob, name, t: tt }
    const next = [...current, entry]
    shotsRef.current = next; setShots(next)
    return true
  }
  const removeShot = (id) => {
    const current = shotsRef.current, removed = current.find((shot) => shot.id === id)
    if (removed) URL.revokeObjectURL(removed.url)
    const next = current.filter((shot) => shot.id !== id)
    shotsRef.current = next; setShots(next)
  }

  const onSnap = async () => {
    if (outputJob.current) return
    const v = videoRef.current, id = loadId.current, sourceFile = file
    if (!v || !sourceFile) return
    try {
      const fmt = cfg.fmt, frameAtStart = frame, tt = frameAtStart / fps, name = frameName(fmt === 'png' ? 'png' : 'jpg')
      const blob = await capture(fmt)
      if (id !== loadId.current || dead.current) return
      download(blob, name)
      const added = addTray(blob, name, tt)
      setFlash((n) => n + 1); say(added ? `Saved frame ${frameAtStart.toLocaleString()}` : 'Frame downloaded; the tray is full.')
      recentAction(`Snapshot at ${fmtTime(tt)} from ${sourceFile.name}`)
    } catch (e) { if (id === loadId.current && !dead.current) say(e.message) }
  }
  const onTray = async () => {
    if (outputJob.current) return
    const id = loadId.current, frameAtStart = frame, sourceFps = fps
    try {
      const fmt = cfg.fmt, blob = await capture(fmt)
      if (id !== loadId.current || dead.current) return
      const added = addTray(blob, frameName(fmt === 'png' ? 'png' : 'jpg'), frameAtStart / sourceFps)
      if (added) { setFlash((n) => n + 1); say('Added to the tray') }
    } catch (e) { if (id === loadId.current && !dead.current) say(e.message) }
  }
  const onCopy = async () => {
    if (outputJob.current) return
    const id = loadId.current
    try {
      const b = await capture('png')
      if (id !== loadId.current || dead.current) return
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })])
      setFlash((n) => n + 1); say('Frame copied to the clipboard')
    } catch { if (id === loadId.current && !dead.current) say('Your browser blocked clipboard access') }
  }
  const onSeries = async () => {
    if (outputJob.current || !url || !meta) return
    outputJob.current = true; setJobBusy(true)
    const id = loadId.current, count = cfg.count, format = cfg.fmt, from = start, to = end, nameBase = base
    setSeries({ busy: true, prog: 0, result: null })
    try {
      const r = await frameSeries({ url, start: from, end: to, count, fmt: format, base: nameBase, cancelled: () => dead.current || id !== loadId.current, onProgress: (p) => { if (id === loadId.current && !dead.current) setSeries((s) => ({ ...s, busy: true, prog: p })) } })
      if (id !== loadId.current || dead.current) return
      const name = `${nameBase}-${count}-frames.zip`
      const scaledNote = r.scaled ? ` · safe size ${r.w}×${r.h} each` : ` · ${r.w}×${r.h} each`
      setSeries({ busy: false, prog: 1, result: { blob: r.blob, name, note: `${r.frames} frames${scaledNote} · ZIP archive` } })
      say(`${count} frames ready to save`); recentAction(`Prepared ${count} frames from ${file.name}`)
    } catch (e) { if (id === loadId.current && !dead.current) say(e.message) }
    finally {
      outputJob.current = false
      if (!dead.current) setJobBusy(false)
      if (id === loadId.current && !dead.current) setSeries((s) => ({ ...s, busy: false }))
    }
  }
  const onTrim = async () => {
    if (outputJob.current || !file || end <= start) return
    outputJob.current = true; setJobBusy(true)
    const id = loadId.current, sourceFile = file, from = start, to = end, nameBase = base
    setTrim((s) => ({ ...s, busy: true, prog: 0, phase: 'Loading built-in media engine…', error: '', result: null }))
    try {
      const blob = await clipMediaFile(sourceFile, from, to, (p) => {
        if (id === loadId.current && !dead.current) setTrim((s) => ({ ...s, prog: p, phase: 'Trimming — stream copy' }))
      })
      if (id !== loadId.current || dead.current) return
      const ext = extName(sourceFile.name) || 'mp4'
      const name = `${nameBase}-trim.${ext}`
      setTrim({ busy: false, prog: 1, phase: '', error: '', result: { blob, name, note: `${(to - from).toFixed(2)} s · no re-encode` } })
      say('Lossless trim ready to save'); recentAction(`Prepared lossless trim of ${sourceFile.name}`)
    } catch (e) {
      if (id === loadId.current && !dead.current) setTrim((s) => ({ ...s, busy: false, error: `Trim failed: ${e.message || e}. Check that the video and selected range are supported.` }))
    } finally {
      outputJob.current = false
      if (!dead.current) setJobBusy(false)
    }
  }
  const onGif = async () => {
    if (outputJob.current || !url || !meta) return
    outputJob.current = true; setJobBusy(true)
    const id = loadId.current, from = start, to = end, nameBase = base
    const settings = { fps: cfg.gifFps, width: cfg.gifW, loop: cfg.gifLoop }
    if (gifUrlRef.current) { URL.revokeObjectURL(gifUrlRef.current); gifUrlRef.current = '' }
    setGif((g) => ({ ...g, busy: true, prog: 0, n: 0, total: 0, error: '', result: null }))
    try {
      const r = await encodeGif({ url, start: from, end: to, ...settings, preview: gifCanvasRef.current, cancelled: () => dead.current || id !== loadId.current,
        onProgress: (p, n, total) => { if (id === loadId.current && !dead.current) setGif((g) => ({ ...g, prog: p, n, total })) } })
      if (id !== loadId.current || dead.current) return
      const resultUrl = URL.createObjectURL(r.blob)
      gifUrlRef.current = resultUrl
      const name = `${nameBase}.gif`
      const note = `${r.frames} frames · ${r.w}×${r.h}${r.scaled ? ' · scaled to fit safe limits' : r.capped ? ` · shortened to ${r.seconds.toFixed(1)} s` : ''}`
      setGif({ busy: false, prog: 1, n: 0, total: 0, error: '', result: { blob: r.blob, url: resultUrl, name, note } })
      say('GIF ready to save'); recentAction(`Prepared GIF from ${file.name}`)
    } catch (e) {
      if (id === loadId.current && !dead.current) setGif((g) => ({ ...g, busy: false, error: e.message === 'Cancelled' ? '' : `GIF failed: ${e.message}` }))
    } finally {
      outputJob.current = false
      if (!dead.current) setJobBusy(false)
    }
  }
  const trayZip = async () => {
    if (outputJob.current) return
    const captured = [...shotsRef.current]
    const total = captured.reduce((sum, shot) => sum + shot.blob.size, 0)
    if (total > MAX_TRAY_BYTES) return say('The capture tray exceeds its safe ZIP size. Remove some frames and try again.')
    outputJob.current = true; setJobBusy(true)
    const id = loadId.current, zipName = `${base}-captured-frames.zip`
    try {
      const { zipSync } = await import('fflate'), files = {}, used = new Set()
      for (const shot of captured) {
        const bytes = new Uint8Array(await shot.blob.arrayBuffer())
        let name = shot.name, n = 2
        while (used.has(name)) name = shot.name.replace(/(\.[^.]+)?$/, `-${n++}$1`)
        used.add(name); files[name] = bytes
      }
      if (id === loadId.current && !dead.current) download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), zipName)
    } catch (e) { if (!dead.current) say(`Could not create the ZIP: ${e.message}`) }
    finally { outputJob.current = false; if (!dead.current) setJobBusy(false) }
  }

  /* ------------------------------- keyboard ------------------------------- */
  const keys = useRef({})
  keys.current = { onSnap, toggle, stepFrames, onRange }
  useEffect(() => {
    if (!file || !meta) return
    const h = (e) => {
      if (outputJob.current || e.target?.isContentEditable || e.target?.closest?.('input, textarea, select, button, [role="slider"]') || e.metaKey || e.ctrlKey || e.altKey) return
      const K = keys.current, L = live.current
      if (e.code === 'Space') { e.preventDefault(); K.toggle() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); K.stepFrames(e.shiftKey ? 10 : 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); K.stepFrames(e.shiftKey ? -10 : -1) }
      else if (e.key === 'i' || e.key === 'I') K.onRange(Math.min(L.t, L.end - 1 / L.fps), L.end)
      else if (e.key === 'o' || e.key === 'O') K.onRange(L.start, Math.max(L.t, L.start + 1 / L.fps))
      else if (e.key === 's' || e.key === 'S') K.onSnap()
      else if (e.key === 'l' || e.key === 'L') setLoopSel((x) => !x)
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [file, meta])

  /* ============================================ EMPTY ============================================ */
  if (!file) {
    return (
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
          <Dropzone onFiles={load} accept="video/*,.mp4,.m4v,.mov,.mkv,.webm,.avi,.mpeg,.mpg,.ts" label="" sub=""><Hero /></Dropzone>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[[1, 'frame at a time', 'Step forward and back with auto-detected frame rate. Hold the button to scrub fast.'], [0, 're-encodes in a trim', 'Lossless stream-copy cuts keep the original quality and format.'], [300, 'frames per GIF', 'Pick the size, speed and looping. A live preview builds as it encodes.'], [0, 'bytes uploaded', 'Everything runs on this device. Your video never leaves it.']].map(([n, a, b], i) => (
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

  /* ============================================ STUDIO ============================================ */
  const ctx = {
    cfg, set, meta, t, fps, start, end, duration, onRange, onSnap, onCopy, onTray, onSeries, series, jobBusy,
    onSaveSeries: () => series.result && download(series.result.blob, series.result.name), onClearSeries: () => setSeries({ busy: false, prog: 0, result: null }),
    trim, onTrim, onSaveTrim: () => trim.result && download(trim.result.blob, trim.result.name), onClearTrim: () => setTrim((s) => ({ ...s, result: null })),
    gif, gifCanvasRef, onGif, onSaveGif: () => gif.result && download(gif.result.blob, gif.result.name), onClearGif: () => setGif((g) => { if (g.result) URL.revokeObjectURL(g.result.url); return { ...g, result: null } }),
  }
  const Panel = tab === 'snap' ? SnapshotPanel : tab === 'trim' ? TrimPanel : GifPanel
  const commitFps = () => { const n = parseFloat(fpsTxt); if (n >= 1 && n <= 240) { setFps(n); setFpsAuto(false) } else setFpsTxt(String(fps)) }

  return (
    <motion.div className="relative" style={{ left: '50%', width: 'min(1440px, calc(100vw - 24px))', marginLeft: 'calc(min(1440px, calc(100vw - 24px)) / -2)' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
      <input ref={fileRef} type="file" accept="video/*,.mp4,.m4v,.mov,.mkv,.webm,.avi,.mpeg,.mpg,.ts" hidden onChange={(e) => { if (e.target.files[0]) load(e.target.files); e.target.value = '' }} />
      <div className="card-raised rounded-[20px] sm:rounded-3xl overflow-hidden flex flex-col lg:flex-row lg:h-[clamp(700px,calc(100vh-190px),940px)]" style={{ background: 'var(--surface)' }}>

        {/* ---------------- stage column ---------------- */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div ref={stageRef} className="relative flex-1 min-h-[320px] sm:min-h-[360px] overflow-hidden"
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #29272D 0%, #17161A 72%)' }}>
            <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

            {/* file chip + change */}
            <motion.div className="absolute top-2.5 left-2.5 right-2.5 sm:top-4 sm:left-4 sm:right-4 flex flex-wrap items-start justify-between gap-2 z-10 pointer-events-none" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 }}>
              <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 pl-2 pr-3 sm:pl-2.5 sm:pr-4 py-2 rounded-2xl min-w-0 max-w-full sm:max-w-[calc(100%-150px)]" style={{ background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.16)', backdropFilter: 'blur(10px)', color: '#fff' }}>
                <span className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}><Icon n="film2" s={17} /></span>
                <div className="min-w-0 leading-tight">
                  <div className="text-[12px] sm:text-[12.5px] font-medium truncate max-w-[180px] sm:max-w-[320px]">{file.name}</div>
                  <div className="text-[10px] sm:text-[10.5px] mono opacity-80 truncate">{meta ? `${meta.w}×${meta.h} · ${fpsAuto === null ? 'detecting fps…' : `${fps} fps`} · ${fmtTime(meta.d)} · ${fmtBytes(file.size)}` : 'Reading video metadata…'}</div>
                </div>
              </div>
              <div className="pointer-events-auto flex gap-1.5 sm:gap-2 shrink-0 ml-auto">
                <motion.button type="button" disabled={jobBusy} whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} className="btn !min-h-9 !py-1.5 !px-2.5 sm:!px-3.5 text-[12px]" aria-label="Change video" onClick={() => fileRef.current?.click()}><Icon n="plus" s={14} w={2.2} /><span className="hidden sm:inline">Change video</span><span className="sm:hidden">Change</span></motion.button>
                <motion.button type="button" disabled={jobBusy} whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} className="btn !min-h-9 !py-1.5 !px-2.5" aria-label="Close video" title="Close video" onClick={reset}><Icon n="trash" s={14} /></motion.button>
              </div>
            </motion.div>

            {/* the video */}
            <div className="absolute inset-0 grid place-items-center pt-[96px] pb-2 sm:pt-14 sm:pb-2">
              <motion.div className="relative rounded-2xl overflow-hidden" initial={false} animate={{ width: dw, height: dh }} transition={SPRING}
                style={{ background: '#000', boxShadow: '0 50px 80px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.12)' }}>
                <video key={url} ref={videoRef} src={url} playsInline preload="metadata" className="absolute inset-0 w-full h-full object-contain cursor-pointer" onClick={toggle}
                  onLoadedMetadata={(e) => onMeta(e, url)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { if (currentUrl.current === url) setError('This browser cannot decode that video. Try MP4 (H.264) or WebM.') }} />
                {/* HUD */}
                {meta && (
                  <>
                    <motion.div className="absolute left-3 bottom-3 px-3 py-2 rounded-xl pointer-events-none" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'rgba(12,9,7,.62)', backdropFilter: 'blur(8px)', color: '#fff' }}>
                      <div className="mono font-bold text-[18px] leading-none tabular-nums">{tc(frame / fps)}</div>
                      <div className="mono text-[10.5px] mt-1 opacity-70 tabular-nums">FRAME {frame.toLocaleString()} / {Math.round(duration * fps).toLocaleString()}</div>
                    </motion.div>
                    <AnimatePresence>
                      {!playing && (
                        <motion.button key="pp" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.3 }} transition={SPRING} onClick={toggle} aria-label="Play"
                          className="absolute left-1/2 top-1/2 -ml-8 -mt-8 w-16 h-16 rounded-full grid place-items-center" style={{ background: 'rgba(255,255,255,.2)', backdropFilter: 'blur(8px)', color: '#fff', border: '1px solid rgba(255,255,255,.4)' }}><Icon n="play" s={24} /></motion.button>
                      )}
                    </AnimatePresence>
                  </>
                )}
                {/* shutter flash */}
                <AnimatePresence>
                  {flash > 0 && <motion.div key={flash} className="absolute inset-0 pointer-events-none" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.4 }} style={{ background: '#fff' }} />}
                </AnimatePresence>
                {!meta && !error && <div className="absolute inset-0 shimmer" style={{ opacity: 0.25 }} />}
              </motion.div>
            </div>
            {error && <div className="absolute inset-x-0 bottom-6 grid place-items-center z-20"><div className="card px-5 py-3 text-[13px] font-semibold">{error}</div></div>}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-20"><AnimatePresence>{toast && <motion.div key={toast} initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={SPRING} className="px-4 py-2 rounded-full text-[12.5px] font-semibold" style={{ background: '#f4efe6', color: '#2a211c', boxShadow: 'var(--shadow-lg)' }}>{toast}</motion.div>}</AnimatePresence></div>
          </div>

          {/* ---------------- transport ---------------- */}
          <div className="shrink-0 px-3 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-x-3 sm:gap-x-5 gap-y-2.5 border-t border-line" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center gap-1.5">
              {[0.25, 0.5, 1, 2].map((r) => <Chip key={r} on={rate === r} onClick={() => setRate(r)}>{r}×</Chip>)}
            </div>
            <div className="flex items-center gap-1.5 mx-auto">
              <StepBtn label="Back 10 frames" onStep={() => stepFrames(-10)}><Icon n="back10" s={15} w={2} />10</StepBtn>
              <StepBtn label="Back 1 frame" onStep={() => stepFrames(-1)} wide><Icon n="stepBack" s={15} w={2} />1</StepBtn>
              <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.88 }} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="btn btn-primary btn-sheen !rounded-full !w-12 !h-12 !p-0 grid place-items-center">
                <AnimatePresence mode="wait" initial={false}><motion.span key={playing ? 'p' : 'r'} initial={{ scale: 0.4, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING} className="grid"><Icon n={playing ? 'pause' : 'play'} s={19} /></motion.span></AnimatePresence>
              </motion.button>
              <StepBtn label="Forward 1 frame" onStep={() => stepFrames(1)} wide>1<Icon n="stepFwd" s={15} w={2} /></StepBtn>
              <StepBtn label="Forward 10 frames" onStep={() => stepFrames(10)}>10<Icon n="fwd10" s={15} w={2} /></StepBtn>
            </div>
            <div className="flex items-center gap-2.5">
              <label className="flex items-center gap-2 text-[11.5px] font-semibold" style={{ color: 'var(--muted)' }}>
                FPS
                <input className="input !w-[72px] !py-1.5 text-center mono font-semibold tabular-nums" value={fpsTxt} inputMode="decimal" onChange={(e) => setFpsTxt(e.target.value)} onBlur={commitFps} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                <AnimatePresence>{fpsAuto && <motion.span key="a" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, #4E937A 18%, transparent)', color: '#3E7B65' }}>auto</motion.span>}</AnimatePresence>
              </label>
              <motion.button whileTap={{ scale: 0.88 }} whileHover={{ y: -2 }} onClick={() => setLoopSel((x) => !x)} title="Loop the selection (L)" aria-label="Loop selection" className="btn !px-2.5 !py-2" aria-pressed={loopSel} style={loopSel ? { background: 'var(--primary)', borderColor: 'var(--primary)', color: 'var(--on-primary)' } : {}}><Icon n="loop" s={15} w={2} /></motion.button>
              <motion.button whileTap={{ scale: 0.88 }} whileHover={{ y: -2 }} onClick={() => setMuted((x) => !x)} aria-label="Mute" className="btn !px-2.5 !py-2"><Icon n={muted ? 'mute' : 'vol'} s={15} w={2} /></motion.button>
            </div>
          </div>

          {/* ---------------- timeline + tray ---------------- */}
          <div className="shrink-0 px-3 sm:px-5 pt-7 sm:pt-9 pb-2 border-t border-line" style={{ background: 'var(--surface2)' }}>
            {meta ? <Timeline duration={duration} fps={fps} t={t} start={start} end={end} thumbs={thumbs} slots={SLOTS} playing={playing} onSeek={seek} onRange={onRange} />
              : <div className="h-[96px] rounded-2xl shimmer" />}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-4 text-[10.5px] sm:text-[11px] pb-2 pt-0.5" style={{ color: 'var(--muted)' }}>
              <span className="flex gap-1.5 items-center"><span className="kbd">Space</span> play</span>
              <span className="flex gap-1.5 items-center"><span className="kbd">←</span><span className="kbd">→</span> frame <span className="kbd">Shift</span> ×10</span>
              <span className="flex gap-1.5 items-center"><span className="kbd">I</span><span className="kbd">O</span> in / out</span>
              <span className="flex gap-1.5 items-center"><span className="kbd">S</span> save frame</span>
              <span className="ml-auto mono tabular-nums">Selection {clock(start)} → {clock(end)}</span>
            </div>
          </div>
          <AnimatePresence initial={false}>
            {shots.length > 0 && (
              <motion.div key="tray" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="shrink-0 overflow-hidden border-t border-line" style={{ background: 'var(--surface)' }}>
                <div className="px-5 py-3 flex items-center gap-3 overflow-x-auto">
                  <div className="shrink-0 pr-3 leading-tight">
                    <div className="eyebrow">Captured</div>
                    <div className="display font-semibold text-[22px] tabular-nums"><AnimatedNumber value={shots.length} /></div>
                  </div>
                  <AnimatePresence initial={false}>
                    {shots.map((s) => (
                      <motion.div key={s.id} layout initial={{ opacity: 0, scale: 0.4, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5 }} transition={SPRING} className="relative shrink-0 group">
                        <motion.button whileHover={{ y: -4, rotate: -1.5 }} whileTap={{ scale: 0.94 }} onClick={() => seek(s.t)} className="block w-[104px] h-[64px] rounded-lg overflow-hidden" style={{ boxShadow: '0 0 0 1px var(--border), 0 8px 16px -8px rgba(0,0,0,.45)', background: '#000' }}>
                          <img src={s.url} alt="" className="w-full h-full object-cover" draggable={false} />
                          <span className="absolute bottom-0 inset-x-0 text-[9.5px] mono font-bold text-white text-center py-0.5" style={{ background: 'rgba(0,0,0,.55)' }}>{tc(s.t)}</span>
                        </motion.button>
                        <div className="absolute -top-1.5 -right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button aria-label="Download" onClick={() => download(s.blob, s.name)} className="w-5 h-5 rounded-full grid place-items-center" style={{ background: 'var(--copper)', color: '#fff' }}><Icon n="download" s={10} w={2.6} /></button>
                          <button aria-label="Remove" onClick={() => removeShot(s.id)} className="w-5 h-5 rounded-full grid place-items-center" style={{ background: 'var(--ink)', color: 'var(--bg)' }}><Icon n="trash" s={10} /></button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {shots.length > 1 && <motion.button disabled={jobBusy} whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} onClick={trayZip} className="btn shrink-0 !py-2 !px-3 text-[12px] ml-auto"><Icon n="zip" s={14} /> All as .zip</motion.button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---------------- inspector ---------------- */}
        <div className="lg:w-[384px] shrink-0 min-h-0 border-t lg:border-t-0 lg:border-l border-line flex flex-col" style={{ background: 'var(--surface)' }}>
          <div className="p-4 border-b border-line">
            <div role="tablist" aria-label="Frame tools" className="flex p-1 rounded-full" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              {TABS.map(([k, l, ic]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="relative flex-1 min-h-10 py-2 rounded-full text-[12px] sm:text-[12.5px] font-medium flex items-center justify-center gap-1.5" style={{ color: tab === k ? 'var(--on-primary)' : 'var(--muted)' }}>
                  {tab === k && <motion.span layoutId="fr-tab" className="absolute inset-0 rounded-full" style={{ background: 'var(--primary)' }} transition={SPRING} />}
                  <span className="relative flex items-center gap-1.5"><Icon n={ic} s={14} w={2} />{l}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {meta ? (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.18 }}>
                  <Panel c={ctx} />
                </motion.div>
              </AnimatePresence>
            ) : <div className="p-5 space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl shimmer" />)}</div>}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ----------------------------------- empty-state hero ----------------------------------- */
function Hero() {
  const decorative = useDecorativeMotion()
  const frames = ['#E0935F', '#D9A66E', '#C98A5C', '#B4715A', '#A9654F', '#8F5A52']
  return (
    <div className="py-8">
      <div className="mx-auto w-[360px] max-w-full h-[150px] relative" style={{ perspective: 600 }}>
        <motion.div className="absolute inset-0 flex items-center gap-2 px-3 rounded-2xl overflow-hidden" initial={{ rotateX: 18 }} animate={decorative ? { rotateX: [18, 10, 18] } : { rotateX: 18 }} transition={decorative ? { repeat: Infinity, duration: 5, ease: 'easeInOut' } : { duration: 0 }}
          style={{ background: 'var(--ink)', boxShadow: '0 28px 40px -22px rgba(26,24,23,.65)' }}>
          {[0, 1].map((r) => (
            <div key={r} className="absolute inset-x-0 flex justify-around px-2" style={{ [r ? 'bottom' : 'top']: 5 }}>
              {Array.from({ length: 18 }, (_, i) => <span key={i} className="w-2.5 h-1.5 rounded-sm" style={{ background: 'rgba(255,255,255,.25)' }} />)}
            </div>
          ))}
          {frames.map((c, i) => (
            <motion.div key={i} className="flex-1 h-[96px] rounded-md relative overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 + i * 0.07 }} style={{ background: `linear-gradient(160deg, ${c}, #3a2a24)` }}>
              <motion.span className="absolute w-4 h-4 rounded-full bg-white/80" animate={decorative ? { left: [`${10 + i * 6}%`, `${48 - i * 4}%`, `${10 + i * 6}%`], top: ['58%', '28%', '58%'] } : { left: `${10 + i * 6}%`, top: '58%' }} transition={decorative ? { repeat: Infinity, duration: 3.2, delay: i * 0.12, ease: 'easeInOut' } : { duration: 0 }} />
            </motion.div>
          ))}
          <motion.div className="absolute inset-y-0 w-[3px]" animate={decorative ? { left: ['4%', '96%', '4%'] } : { left: '4%' }} transition={decorative ? { repeat: Infinity, duration: 4.4, ease: 'easeInOut' } : { duration: 0 }} style={{ background: '#fff', boxShadow: '0 0 14px 3px var(--copper)' }} />
        </motion.div>
      </div>
      <div className="display font-semibold text-[22px] text-center mt-6">Drop a video to open the frame studio</div>
      <div className="text-[13px] mt-1.5 text-center" style={{ color: 'var(--muted)' }}>MP4, MOV, WebM, MKV · frame stepping · lossless trims · GIFs · all on this device</div>
    </div>
  )
}

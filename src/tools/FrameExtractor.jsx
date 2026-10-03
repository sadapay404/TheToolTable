import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dropzone, AnimatedNumber } from '../components/ui.jsx'
import { Icon } from './studio/controls.jsx'
import Timeline from './frames/Timeline.jsx'
import { SnapshotPanel, TrimPanel, GifPanel, Chip } from './frames/Panels.jsx'
import { clock } from '../components/RangeTrack.jsx'
import { fmtBytes, fmtTime, download, baseName, extName, recentAction, clamp } from '../lib/utils.js'
import { getFFmpeg } from '../lib/ffmpeg.js'
import { fetchFile } from '@ffmpeg/util'
import { tc, fixDuration, detectFps, grabFrame, filmstrip, encodeGif, frameSeries } from '../lib/frames.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }
const SLOTS = 18
const TABS = [['snap', 'Snapshot', 'camera'], ['trim', 'Trim', 'scissors'], ['gif', 'GIF', 'gif']]

/** Press-and-hold repeats (frame stepping at speed). */
function StepBtn({ onStep, children, label, wide }) {
  const to = useRef(null), iv = useRef(null)
  const stop = () => { clearTimeout(to.current); clearInterval(iv.current) }
  useEffect(() => stop, [])
  return (
    <motion.button type="button" aria-label={label} whileHover={{ y: -2 }} whileTap={{ scale: 0.88 }}
      className={`btn !rounded-xl !py-2 ${wide ? '!px-3.5' : '!px-3'} text-[12px] font-bold flex items-center gap-1.5 select-none`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); onStep(); stop(); to.current = setTimeout(() => { iv.current = setInterval(onStep, 65) }, 380) }}
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
  const [series, setSeries] = useState({ busy: false, prog: 0 })
  const [trim, setTrim] = useState({ busy: false, prog: 0, phase: '', error: '', result: null })
  const [gif, setGif] = useState({ busy: false, prog: 0, n: 0, total: 0, error: '', result: null })

  const videoRef = useRef(null)
  const stageRef = useRef(null)
  const gifCanvasRef = useRef(null)
  const fileRef = useRef(null)
  const dead = useRef(false)
  const live = useRef({})
  const set = (p) => setCfgState((c) => ({ ...c, ...p }))
  const toastT = useRef(null)
  const say = (m) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2200) }

  const duration = meta?.d || 0
  const frame = Math.floor(t * fps + 1e-6)
  const base = file ? baseName(file.name) : 'video'
  live.current = { t, fps, start, end, duration, playing, loopSel }

  useEffect(() => { dead.current = false; return () => { dead.current = true } }, [])

  /* ------------------------------- load ------------------------------- */
  const load = (files) => {
    const f = [...files].find((x) => x.type.startsWith('video/')) || files[0]
    if (!f) return
    if (url) URL.revokeObjectURL(url)
    setFile(f); setUrl(URL.createObjectURL(f)); setMeta(null); setError(''); setT(0); setPlaying(false)
    setThumbs([]); setShots([]); setFpsAuto(null)
    setTrim({ busy: false, prog: 0, phase: '', error: '', result: null }); setGif({ busy: false, prog: 0, n: 0, total: 0, error: '', result: null })
  }
  const reset = () => { if (url) URL.revokeObjectURL(url); setFile(null); setUrl(''); setMeta(null) }

  const onMeta = async (e) => {
    const v = e.currentTarget
    const d = await fixDuration(v)
    if (!v.videoWidth) { setError('This browser cannot decode that video. Try MP4 (H.264) or WebM.'); return }
    setMeta({ w: v.videoWidth, h: v.videoHeight, d }); setStart(0); setEnd(d)
    const f = await detectFps(v)
    if (dead.current) return
    if (f) { setFps(f); setFpsTxt(String(f)); setFpsAuto(true) } else { setFpsAuto(false) }
    setT(0)
  }

  /* filmstrip */
  useEffect(() => {
    if (!url || !meta) return
    let off = false
    filmstrip(url, meta.d, SLOTS, { cancelled: () => off, onThumb: (i, d) => !off && setThumbs((a) => { const n = a.slice(); n[i] = d; return n }) }).catch(() => {})
    return () => { off = true }
  }, [url, meta?.d]) // eslint-disable-line

  /* playhead clock */
  useEffect(() => {
    if (!file) return
    let raf
    const loop = () => {
      const v = videoRef.current
      if (v) {
        const L = live.current
        if (L.playing && L.loopSel && v.currentTime >= L.end) v.currentTime = L.start
        else if (L.playing && v.currentTime >= L.end && L.end < L.duration - 0.01 && !L.loopSel) { /* play on past out-point */ }
        setT((p) => (Math.abs(p - v.currentTime) > 1e-4 ? v.currentTime : p))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [file])

  /* stage geometry */
  useEffect(() => {
    if (!file || !stageRef.current) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(stageRef.current); return () => ro.disconnect()
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
  const toggle = useCallback(() => { const v = videoRef.current; if (!v) return; if (v.paused) { if (v.currentTime >= live.current.end - 0.02) v.currentTime = live.current.start; v.play() } else v.pause() }, [])
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate }, [rate, meta])
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted }, [muted, meta])
  const onRange = (a, b) => { setStart(a); setEnd(b) }

  /* ------------------------------- actions ------------------------------- */
  const frameName = (ext) => `${base}-f${String(frame).padStart(5, '0')}-${(frame / fps).toFixed(3)}s.${ext}`
  const capture = async (fmt) => grabFrame(videoRef.current, fmt)
  const addTray = (blob, name, tt) => setShots((a) => [...a, { id: Math.random().toString(36).slice(2), url: URL.createObjectURL(blob), blob, name, t: tt }])

  const onSnap = async () => {
    const v = videoRef.current; if (!v) return
    try {
      const fmt = cfg.fmt, tt = frame / fps, name = frameName(fmt === 'png' ? 'png' : 'jpg')
      const blob = await capture(fmt)
      download(blob, name); addTray(blob, name, tt); setFlash((n) => n + 1); say(`Saved frame ${frame.toLocaleString()}`)
      recentAction(`Snapshot at ${fmtTime(tt)} from ${file.name}`)
    } catch (e) { say(e.message) }
  }
  const onTray = async () => { try { const fmt = cfg.fmt; addTray(await capture(fmt), frameName(fmt === 'png' ? 'png' : 'jpg'), frame / fps); setFlash((n) => n + 1); say('Added to the tray') } catch (e) { say(e.message) } }
  const onCopy = async () => {
    try { const b = await capture('png'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); setFlash((n) => n + 1); say('Frame copied to the clipboard') } catch { say('Your browser blocked clipboard access') }
  }
  const onSeries = async () => {
    setSeries({ busy: true, prog: 0 })
    try {
      const blob = await frameSeries({ url, start, end, count: cfg.count, fmt: cfg.fmt, base, cancelled: () => dead.current, onProgress: (p) => setSeries({ busy: true, prog: p }) })
      download(blob, `${base}-${cfg.count}-frames.zip`); say(`${cfg.count} frames exported`); recentAction(`${cfg.count} frames from ${file.name}`)
    } catch (e) { say(e.message) }
    setSeries({ busy: false, prog: 0 })
  }
  const onTrim = async () => {
    setTrim((s) => ({ ...s, busy: true, prog: 0, phase: 'Loading trim engine…', error: '' }))
    let handler, ff
    try {
      ff = await getFFmpeg()
      handler = ({ progress }) => setTrim((s) => ({ ...s, prog: clamp(progress, 0, 1), phase: 'Trimming — stream copy' }))
      ff.on('progress', handler)
      setTrim((s) => ({ ...s, phase: 'Reading the video…', prog: 0.02 }))
      const ext = extName(file.name), inName = 'in.' + ext, outName = 'trim.' + ext
      await ff.writeFile(inName, await fetchFile(file))
      await ff.exec(['-ss', start.toFixed(3), '-to', end.toFixed(3), '-i', inName, '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-y', outName])
      const data = await ff.readFile(outName)
      const blob = new Blob([data.buffer], { type: file.type || 'video/mp4' })
      const name = `${base}-trim.${ext}`
      setTrim({ busy: false, prog: 1, phase: '', error: '', result: { blob, name, note: `${(end - start).toFixed(2)} s · no re-encode` } })
      download(blob, name); say('Lossless trim exported'); recentAction(`Lossless trim of ${file.name}`)
      ff.deleteFile(inName).catch(() => {}); ff.deleteFile(outName).catch(() => {})
    } catch (e) { setTrim((s) => ({ ...s, busy: false, error: `Trim failed: ${e.message || e}. The trimming engine downloads once from the internet — check your connection and try again.` })) }
    finally { if (handler) ff.off('progress', handler) }
  }
  const onGif = async () => {
    setGif((g) => ({ ...g, busy: true, prog: 0, n: 0, total: 0, error: '' }))
    try {
      const r = await encodeGif({ url, start, end, fps: cfg.gifFps, width: cfg.gifW, loop: cfg.gifLoop, preview: gifCanvasRef.current, cancelled: () => dead.current,
        onProgress: (p, n, total) => setGif((g) => ({ ...g, prog: p, n, total })) })
      setGif((g) => { if (g.result) URL.revokeObjectURL(g.result.url); const name = `${base}.gif`; return { busy: false, prog: 1, n: 0, total: 0, error: '', result: { blob: r.blob, url: URL.createObjectURL(r.blob), name, note: `${r.frames} frames · ${r.w}×${r.h}` } } })
      download(r.blob, `${base}.gif`); say('GIF exported'); recentAction(`GIF from ${file.name}`)
    } catch (e) { setGif((g) => ({ ...g, busy: false, error: e.message === 'Cancelled' ? '' : `GIF failed: ${e.message}` })) }
  }
  const trayZip = async () => {
    const { zipSync } = await import('fflate'); const files = {}
    for (const s of shots) files[s.name] = new Uint8Array(await s.blob.arrayBuffer())
    download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${base}-captured-frames.zip`)
  }

  /* ------------------------------- keyboard ------------------------------- */
  const keys = useRef({})
  keys.current = { onSnap, toggle, stepFrames, onRange }
  useEffect(() => {
    if (!file || !meta) return
    const h = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
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
          <Dropzone onFiles={load} accept="video/*" label="" sub=""><Hero /></Dropzone>
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
    cfg, set, meta, t, fps, start, end, duration, onRange, onSnap, onCopy, onTray, onSeries, series,
    trim, onTrim, onSaveTrim: () => trim.result && download(trim.result.blob, trim.result.name), onClearTrim: () => setTrim((s) => ({ ...s, result: null })),
    gif, gifCanvasRef, onGif, onSaveGif: () => gif.result && download(gif.result.blob, gif.result.name), onClearGif: () => setGif((g) => { if (g.result) URL.revokeObjectURL(g.result.url); return { ...g, result: null } }),
  }
  const Panel = tab === 'snap' ? SnapshotPanel : tab === 'trim' ? TrimPanel : GifPanel
  const commitFps = () => { const n = parseFloat(fpsTxt); if (n >= 1 && n <= 240) { setFps(n); setFpsAuto(false) } else setFpsTxt(String(fps)) }

  return (
    <motion.div className="relative" style={{ left: '50%', width: 'min(1440px, calc(100vw - 32px))', marginLeft: 'calc(min(1440px, calc(100vw - 32px)) / -2)' }} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
      <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { if (e.target.files[0]) load(e.target.files); e.target.value = '' }} />
      <div className="card-raised rounded-3xl overflow-hidden flex flex-col lg:flex-row lg:h-[clamp(700px,calc(100vh-190px),940px)]" style={{ background: 'var(--surface)' }}>

        {/* ---------------- stage column ---------------- */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div ref={stageRef} className="relative flex-1 min-h-[360px] overflow-hidden"
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #2b2420 0%, #17120f 70%)' }}>
            <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

            {/* file chip + change */}
            <motion.div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-3 z-10 pointer-events-none" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 }}>
              <div className="pointer-events-auto flex items-center gap-3 pl-2.5 pr-4 py-2 rounded-2xl min-w-0" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(10px)', color: '#f4efe6' }}>
                <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: 'var(--copper)', color: '#fff' }}><Icon n="film2" s={17} /></span>
                <div className="min-w-0 leading-tight">
                  <div className="text-[12.5px] font-bold truncate max-w-[260px]">{file.name}</div>
                  <div className="text-[10.5px] mono opacity-70">{meta ? `${meta.w}×${meta.h} · ${fpsAuto === null ? 'detecting fps…' : `${fps} fps`} · ${fmtTime(meta.d)} · ${fmtBytes(file.size)}` : 'Reading…'}</div>
                </div>
              </div>
              <div className="pointer-events-auto flex gap-2">
                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} className="btn !py-2 !px-3.5 text-[12px]" onClick={() => fileRef.current?.click()}><Icon n="plus" s={14} w={2.2} /> Change video</motion.button>
                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} className="btn !py-2 !px-3 text-[12px]" aria-label="Close video" onClick={reset}><Icon n="trash" s={14} /></motion.button>
              </div>
            </motion.div>

            {/* the video */}
            <div className="absolute inset-0 grid place-items-center" style={{ paddingTop: 56, paddingBottom: 8 }}>
              <motion.div className="relative rounded-lg overflow-hidden" initial={false} animate={{ width: dw, height: dh }} transition={SPRING}
                style={{ background: '#000', boxShadow: '0 50px 80px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.12)' }}>
                <video ref={videoRef} src={url} playsInline preload="auto" className="absolute inset-0 w-full h-full object-contain cursor-pointer" onClick={toggle}
                  onLoadedMetadata={onMeta} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError('This browser cannot decode that video. Try MP4 (H.264) or WebM.')} />
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
          <div className="shrink-0 px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-line" style={{ background: 'var(--surface)' }}>
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
              <motion.button whileTap={{ scale: 0.88 }} whileHover={{ y: -2 }} onClick={() => setLoopSel((x) => !x)} title="Loop the selection (L)" aria-label="Loop selection" className="btn !px-2.5 !py-2" style={loopSel ? { background: 'var(--ink)', color: 'var(--bg)' } : {}}><Icon n="loop" s={15} w={2} /></motion.button>
              <motion.button whileTap={{ scale: 0.88 }} whileHover={{ y: -2 }} onClick={() => setMuted((x) => !x)} aria-label="Mute" className="btn !px-2.5 !py-2"><Icon n={muted ? 'mute' : 'vol'} s={15} w={2} /></motion.button>
            </div>
          </div>

          {/* ---------------- timeline + tray ---------------- */}
          <div className="shrink-0 px-5 pt-9 pb-2 border-t border-line" style={{ background: 'var(--surface2)' }}>
            {meta ? <Timeline duration={duration} fps={fps} t={t} start={start} end={end} thumbs={thumbs} slots={SLOTS} playing={playing} onSeek={seek} onRange={onRange} />
              : <div className="h-[96px] rounded-2xl shimmer" />}
            <div className="flex items-center gap-4 text-[11px] pb-2 pt-0.5" style={{ color: 'var(--muted)' }}>
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
                          <button aria-label="Remove" onClick={() => { URL.revokeObjectURL(s.url); setShots((a) => a.filter((x) => x.id !== s.id)) }} className="w-5 h-5 rounded-full grid place-items-center" style={{ background: 'var(--ink)', color: 'var(--bg)' }}><Icon n="trash" s={10} /></button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {shots.length > 1 && <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} onClick={trayZip} className="btn shrink-0 !py-2 !px-3 text-[12px] ml-auto"><Icon n="zip" s={14} /> All as .zip</motion.button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---------------- inspector ---------------- */}
        <div className="lg:w-[384px] shrink-0 min-h-0 border-t lg:border-t-0 lg:border-l border-line flex flex-col" style={{ background: 'var(--surface)' }}>
          <div className="p-4 border-b border-line">
            <div className="flex p-1 rounded-2xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              {TABS.map(([k, l, ic]) => (
                <button key={k} onClick={() => setTab(k)} className="relative flex-1 py-2 rounded-xl text-[12.5px] font-bold flex items-center justify-center gap-1.5" style={{ color: tab === k ? 'var(--bg)' : 'var(--muted)' }}>
                  {tab === k && <motion.span layoutId="fr-tab" className="absolute inset-0 rounded-xl" style={{ background: 'var(--ink)' }} transition={SPRING} />}
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
  const frames = ['#E0935F', '#D9A66E', '#C98A5C', '#B4715A', '#A9654F', '#8F5A52']
  return (
    <div className="py-8">
      <div className="mx-auto w-[360px] max-w-full h-[150px] relative" style={{ perspective: 600 }}>
        <motion.div className="absolute inset-0 flex items-center gap-2 px-3 rounded-2xl overflow-hidden" initial={{ rotateX: 18 }} animate={{ rotateX: [18, 10, 18] }} transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
          style={{ background: 'var(--ink)', boxShadow: '0 28px 40px -22px rgba(26,24,23,.65)' }}>
          {[0, 1].map((r) => (
            <div key={r} className="absolute inset-x-0 flex justify-around px-2" style={{ [r ? 'bottom' : 'top']: 5 }}>
              {Array.from({ length: 18 }, (_, i) => <span key={i} className="w-2.5 h-1.5 rounded-sm" style={{ background: 'rgba(255,255,255,.25)' }} />)}
            </div>
          ))}
          {frames.map((c, i) => (
            <motion.div key={i} className="flex-1 h-[96px] rounded-md relative overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 + i * 0.07 }} style={{ background: `linear-gradient(160deg, ${c}, #3a2a24)` }}>
              <motion.span className="absolute w-4 h-4 rounded-full bg-white/80" animate={{ left: [`${10 + i * 6}%`, `${48 - i * 4}%`, `${10 + i * 6}%`], top: ['58%', '28%', '58%'] }} transition={{ repeat: Infinity, duration: 3.2, delay: i * 0.12, ease: 'easeInOut' }} />
            </motion.div>
          ))}
          <motion.div className="absolute inset-y-0 w-[3px]" animate={{ left: ['4%', '96%', '4%'] }} transition={{ repeat: Infinity, duration: 4.4, ease: 'easeInOut' }} style={{ background: '#fff', boxShadow: '0 0 14px 3px var(--copper)' }} />
        </motion.div>
      </div>
      <div className="display font-semibold text-[22px] text-center mt-6">Drop a video to open the frame studio</div>
      <div className="text-[13px] mt-1.5 text-center" style={{ color: 'var(--muted)' }}>MP4, MOV, WebM, MKV · frame stepping · lossless trims · GIFs · all on this device</div>
    </div>
  )
}

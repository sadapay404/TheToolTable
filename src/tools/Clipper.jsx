import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dropzone, Note, AnimatedNumber, LiveProgress } from '../components/ui.jsx'
import RangeTrack, { TimeField, clock } from '../components/RangeTrack.jsx'
import Downloader from './Downloader.jsx'
import { Icon } from './studio/controls.jsx'
import { clipMediaFile, probeMediaDuration } from '../lib/media-clip.js'
import { fmtBytes, download, baseName, extName, recentAction } from '../lib/utils.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'ogv', '3gp', 'mpeg', 'mpg'])
const isVideoFile = (file) => !!file && (file.type?.startsWith('video/') || VIDEO_EXTENSIONS.has(extName(file.name)))

async function extractPeaks(file) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) throw new Error('Audio waveform is not supported by this browser')
  const ac = new AudioContextClass()
  try {
    const buf = await ac.decodeAudioData(await file.arrayBuffer())
    const ch = buf.getChannelData(0)
    const buckets = 160, step = Math.floor(ch.length / buckets) || 1
    const peaks = []
    for (let i = 0; i < buckets; i++) {
      let max = 0
      for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 32) max = Math.max(max, Math.abs(ch[j] || 0))
      peaks.push(max)
    }
    const top = Math.max(...peaks, 0.001)
    return { peaks: peaks.map((p) => p / top), duration: buf.duration }
  } finally {
    try { await ac.close() } catch { /* already closed */ }
  }
}

function readMediaDuration(file, video) {
  return new Promise((resolve, reject) => {
    const media = document.createElement(video ? 'video' : 'audio')
    const objectUrl = URL.createObjectURL(file)
    let settled = false
    const finish = (duration, error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      media.onloadedmetadata = null
      media.onerror = null
      media.removeAttribute('src')
      media.load()
      URL.revokeObjectURL(objectUrl)
      if (Number.isFinite(duration) && duration > 0) resolve(duration)
      else reject(error || new Error('Could not read the media duration'))
    }
    const timer = setTimeout(() => finish(NaN, new Error('Reading media metadata took too long')), 15000)
    media.preload = 'metadata'
    media.muted = true
    media.onloadedmetadata = () => finish(media.duration)
    media.onerror = () => finish(NaN, new Error('This browser cannot read that media file'))
    media.src = objectUrl
  })
}

/* ------------------------------------ local clip panel ------------------------------------ */

function ClipFile() {
  const [file, setFile] = useState(null)
  const [peaks, setPeaks] = useState(null)
  const [duration, setDuration] = useState(0)
  const [range, setRange] = useState([0, 0])
  const [now, setNow] = useState(0)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(0)
  const [done, setDone] = useState(null)
  const [msg, setMsg] = useState('')
  const media = useRef(null)
  const loadId = useRef(0)
  const mounted = useRef(true)
  const stopPreview = useRef(null)
  const src = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  const isVideo = isVideoFile(file)
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; loadId.current++; stopPreview.current?.() } }, [])

  async function load(files) {
    const f = [...files].find((candidate) => candidate.type?.startsWith('audio/') || isVideoFile(candidate)) || files[0]
    if (!f) return
    const id = ++loadId.current
    stopPreview.current?.()
    setFile(f); setMsg(''); setPeaks(null); setDone(null); setNow(0); setDuration(0); setRange([0, 0])
    const readDuration = async (video) => {
      try { return await readMediaDuration(f, video) }
      catch (browserError) {
        if (id !== loadId.current) return null
        // FFprobe can inspect more containers than the platform WebView, but its
        // virtual filesystem needs a full input copy. Keep that fallback bounded.
        const narrowScreen = window.matchMedia?.('(max-width: 640px)')?.matches || false
        const maxProbeBytes = (narrowScreen ? 64 : 192) * 1024 * 1024
        if (f.size > maxProbeBytes) {
          throw new Error(`${browserError.message}. FFmpeg’s safe metadata fallback is limited to ${narrowScreen ? '64 MB on phones' : '192 MB'}; try a supported MP4/WebM file or a smaller source.`)
        }
        setMsg('This browser cannot inspect the container. Checking its duration with the bundled FFmpeg probe…')
        const probed = await probeMediaDuration(f)
        if (id !== loadId.current) return null
        const ext = extName(f.name).toUpperCase() || 'media'
        setMsg(`The browser cannot preview this ${ext} file, but FFmpeg read its duration. You can still make a clip.`)
        return probed
      }
    }

    try {
      if (isVideoFile(f)) {
        const d = await readDuration(true)
        if (id !== loadId.current || !d) return
        setDuration(d); setRange([0, d])
        return
      }
      // Decoding long compressed audio can require many times the file size in RAM.
      const narrowScreen = window.matchMedia?.('(max-width: 640px)')?.matches || false
      const smallEnoughForWaveform = f.size <= (narrowScreen ? 12 : 48) * 1024 * 1024
      if (smallEnoughForWaveform) {
        try {
          const { peaks: p, duration: d } = await extractPeaks(f)
          if (id !== loadId.current) return
          setPeaks(p); setDuration(d); setRange([0, d])
          return
        } catch { /* fall back to metadata; clipping itself is still available */ }
      } else {
        setMsg('Waveform preview skipped for this large audio file to protect memory. Clipping is still available.')
      }
      const d = await readDuration(false)
      if (id !== loadId.current || !d) return
      setDuration(d); setRange([0, d])
    } catch (e) {
      if (id === loadId.current) setMsg(e.message || 'Could not read this media file')
    }
  }

  function clearFile() {
    loadId.current++
    stopPreview.current?.()
    setFile(null); setPeaks(null); setDuration(0); setRange([0, 0]); setNow(0); setDone(null); setMsg('')
  }

  function previewSelection() {
    const m = media.current
    if (!m || !duration || range[1] <= range[0]) return
    stopPreview.current?.()
    const id = loadId.current
    const stop = () => {
      m.removeEventListener('timeupdate', onTime)
      m.pause()
      if (stopPreview.current === stop) stopPreview.current = null
    }
    const onTime = () => { if (m.currentTime >= range[1]) stop() }
    stopPreview.current = stop
    m.currentTime = range[0]
    m.addEventListener('timeupdate', onTime)
    m.play().catch((e) => {
      stop()
      if (mounted.current && id === loadId.current) setMsg(`Could not preview this file: ${e.message}`)
    })
  }

  async function cut() {
    if (!file || range[1] <= range[0]) { setMsg('Choose a start and end time before exporting.'); return }
    stopPreview.current?.()
    const id = loadId.current
    setBusy(true); setProg(0); setMsg(''); setDone(null)
    try {
      const blob = await clipMediaFile(file, range[0], range[1], (p) => { if (mounted.current && id === loadId.current) setProg(p * 100) })
      if (!mounted.current || id !== loadId.current) return
      const ext = extName(file.name) || (isVideo ? 'mp4' : 'm4a')
      const name = `${baseName(file.name)}-clip.${ext}`
      setDone({ blob, name })
      recentAction(`Prepared clip from ${file.name} ${clock(range[0])}→${clock(range[1])}`)
    } catch (e) {
      if (mounted.current && id === loadId.current) setMsg(`Clip failed: ${e.message || e}`)
    } finally { if (mounted.current && id === loadId.current) setBusy(false) }
  }

  if (!file) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
        <Dropzone onFiles={load} accept="audio/*,video/*" label="Drop audio or video" sub="Choose a file to set a range and export a lossless clip" />
      </motion.div>
    )
  }

  const len = Math.max(0, range[1] - range[0])
  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div className="card p-4 sm:p-5 flex items-center gap-3 sm:gap-4 flex-wrap" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
        <div className="flex-1 min-w-0">
          <div className="display font-semibold text-[16px] sm:text-[17px] truncate">{file.name}</div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{fmtBytes(file.size)}{duration ? ` · ${clock(duration)}` : ' · reading duration…'}</div>
        </div>
        <button className="btn !px-3 sm:!px-4" disabled={busy} onClick={clearFile}>Change file</button>
      </motion.div>

      {msg && <Note tone={duration ? 'info' : 'warn'}>{msg}</Note>}

      <motion.div className="card-raised p-4 sm:p-6 space-y-4 sm:space-y-5" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.06 }}>
        {isVideo && <video ref={media} src={src} className="w-full max-h-[260px] sm:max-h-[320px] rounded-xl bg-black" playsInline onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} controls />}
        {!isVideo && <audio ref={media} src={src} className="w-full" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} controls />}

        {duration > 0 && <RangeTrack duration={duration} start={range[0]} end={range[1]} peaks={peaks} playhead={now} onChange={(a, b) => setRange([a, b])} height={68} />}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
          <TimeField label="Start" value={range[0]} onCommit={(v) => setRange([Math.max(0, Math.min(v, Math.max(0, range[1] - Math.min(0.1, duration / 2)))), range[1]])} />
          <TimeField label="End" value={range[1]} onCommit={(v) => setRange([range[0], Math.min(duration, Math.max(v, range[0] + Math.min(0.1, duration / 2)))])} />
          <div className="col-span-2 sm:col-span-1 sm:order-none order-last text-center pb-1 sm:pb-2.5">
            <div className="label">Clip length</div>
            <div className="display font-semibold text-[21px] sm:text-[24px] tabular-nums mt-1"><AnimatedNumber value={len} format={(n) => clock(n)} /></div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
          <motion.button className="btn w-full sm:w-auto" whileTap={{ scale: 0.97 }} onClick={previewSelection} disabled={!duration || len <= 0}>Preview selection</motion.button>
          <motion.button className="btn btn-primary flex-1 min-w-0 py-3" whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} onClick={cut} disabled={busy || !duration || len <= 0}>
            {busy ? 'Cutting…' : 'Export clip — lossless'}
          </motion.button>
        </div>
        <AnimatePresence>
          {busy && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><LiveProgress value={prog} label="Copying selected streams" /></motion.div>}
          {done && !busy && <motion.div className="flex flex-col sm:flex-row sm:items-center gap-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><div className="flex-1"><Note tone="ok">Clip ready · {fmtBytes(done.blob.size)}. Streams were copied without re-encoding; the exact cut may move to the nearest keyframe.</Note></div><button className="btn btn-primary w-full sm:w-auto" onClick={() => download(done.blob, done.name)}><Icon n="download" s={15} />Save clip</button></motion.div>}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/* ------------------------------------ shell ------------------------------------ */

export default function Clipper() {
  const [tab, setTab] = useState('link')
  const tabs = [['link', 'Download from link'], ['file', 'Clip a local file']]
  return (
    <div className="space-y-4 sm:space-y-6">
      <div role="tablist" aria-label="Media tools" className="grid grid-cols-2 w-full sm:w-fit rounded-full border border-line p-1 gap-1" style={{ background: 'var(--surface2)' }}>
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="relative min-w-0 px-3 sm:px-5 py-2.5 rounded-full text-[12px] sm:text-[13px] font-medium transition-colors" style={{ color: tab === k ? 'var(--on-primary)' : 'var(--muted)' }}>
            {tab === k && <motion.span layoutId="clipper-tab" className="absolute inset-0 rounded-full" style={{ background: 'var(--primary)' }} transition={SPRING} />}
            <span className="relative z-10 block truncate">{label}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
          {tab === 'link' ? <Downloader /> : <ClipFile />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dropzone, Note, AnimatedNumber, LiveProgress } from '../components/ui.jsx'
import RangeTrack, { TimeField, clock } from '../components/RangeTrack.jsx'
import Downloader from './Downloader.jsx'
import { getFFmpeg } from '../lib/ffmpeg.js'
import { fetchFile } from '@ffmpeg/util'
import { fmtBytes, download, baseName, extName, recentAction } from '../lib/utils.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

async function extractPeaks(file) {
  const ac = new (window.AudioContext || window.webkitAudioContext)()
  try {
    const buf = await ac.decodeAudioData(await file.arrayBuffer())
    const ch = buf.getChannelData(0)
    const buckets = 160, step = Math.floor(ch.length / buckets) || 1
    const peaks = []
    for (let i = 0; i < buckets; i++) {
      let max = 0
      for (let j = i * step; j < (i + 1) * step; j += 32) max = Math.max(max, Math.abs(ch[j] || 0))
      peaks.push(max)
    }
    const top = Math.max(...peaks, 0.001)
    return { peaks: peaks.map((p) => p / top), duration: buf.duration }
  } finally { ac.close() }
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
  const src = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => src && URL.revokeObjectURL(src), [src])
  const isVideo = file?.type.startsWith('video/')

  async function load([f]) {
    setFile(f); setMsg(''); setPeaks(null); setDone(null); setNow(0)
    try {
      const { peaks: p, duration: d } = await extractPeaks(f)
      setPeaks(p); setDuration(d); setRange([0, d])
    } catch {
      const v = document.createElement('video'); v.preload = 'metadata'; v.src = URL.createObjectURL(f)
      v.onloadedmetadata = () => { setDuration(v.duration); setRange([0, v.duration]) }
    }
  }

  function previewSelection() {
    const m = media.current; if (!m) return
    m.currentTime = range[0]; m.play()
    const stop = () => { if (m.currentTime >= range[1]) { m.pause(); m.removeEventListener('timeupdate', stop) } }
    m.addEventListener('timeupdate', stop)
  }

  async function cut() {
    setBusy(true); setProg(0); setMsg(''); setDone(null)
    try {
      const ffmpeg = await getFFmpeg()
      const handler = ({ progress }) => setProg(progress * 100)
      ffmpeg.on('progress', handler)
      const ext = extName(file.name) || 'mp4'
      const inName = 'in.' + ext, outName = 'clip.' + ext
      await ffmpeg.writeFile(inName, await fetchFile(file))
      await ffmpeg.exec(['-ss', range[0].toFixed(3), '-to', range[1].toFixed(3), '-i', inName, '-c', 'copy', '-y', outName])
      const data = await ffmpeg.readFile(outName)
      await ffmpeg.deleteFile(inName); await ffmpeg.deleteFile(outName)
      ffmpeg.off('progress', handler)
      const blob = new Blob([data.buffer], { type: file.type })
      setDone(blob)
      download(blob, `${baseName(file.name)}-clip.${ext}`)
      recentAction(`Clipped ${file.name} ${clock(range[0])}→${clock(range[1])}`)
    } catch (e) { setMsg('Clip failed: ' + e.message) } finally { setBusy(false) }
  }

  if (!file) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
        <Dropzone onFiles={load} accept="audio/*,video/*" label="Drop audio or video" sub="Waveform timeline · lossless stream-copy clipping" />
      </motion.div>
    )
  }

  const len = Math.max(0, range[1] - range[0])
  return (
    <div className="space-y-6">
      <motion.div className="card p-5 flex items-center gap-4 flex-wrap" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
        <div className="flex-1 min-w-0">
          <div className="display font-semibold text-[17px] truncate">{file.name}</div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{fmtBytes(file.size)} · {clock(duration)}</div>
        </div>
        <button className="btn" disabled={busy} onClick={() => setFile(null)}>Change file</button>
      </motion.div>

      <motion.div className="card-raised p-6 space-y-5" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.06 }}>
        {isVideo && <video ref={media} src={src} className="w-full max-h-[320px] rounded-xl bg-black" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} controls />}
        {!isVideo && <audio ref={media} src={src} className="hidden" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />}

        <RangeTrack duration={duration || 1} start={range[0]} end={range[1] || duration || 1} peaks={peaks} playhead={now} onChange={(a, b) => setRange([a, b])} />

        <div className="grid grid-cols-3 gap-3 items-end">
          <TimeField label="Start" value={range[0]} onCommit={(v) => setRange([Math.max(0, Math.min(v, range[1] - 0.1)), range[1]])} />
          <div className="text-center pb-2.5">
            <div className="label">Clip length</div>
            <div className="display font-semibold text-[24px] tabular-nums mt-1"><AnimatedNumber value={len} format={(n) => clock(n)} /></div>
          </div>
          <TimeField label="End" value={range[1]} onCommit={(v) => setRange([range[0], Math.min(duration, Math.max(v, range[0] + 0.1))])} />
        </div>

        <div className="flex gap-3 flex-wrap">
          <motion.button className="btn" whileTap={{ scale: 0.95 }} onClick={previewSelection}>Preview selection</motion.button>
          <motion.button className="btn btn-primary btn-sheen flex-1 min-w-[200px] py-3" whileHover={{ y: -1, scale: 1.01 }} whileTap={{ scale: 0.96, y: 1 }} onClick={cut} disabled={busy || !duration}>
            {busy ? 'Cutting…' : 'Export clip — lossless'}
          </motion.button>
        </div>
        <AnimatePresence>
          {busy && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><LiveProgress value={prog} label="Stream-copying" /></motion.div>}
          {done && !busy && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><Note tone="ok">Saved {fmtBytes(done.size)} — original streams copied untouched, zero re-compression. Cuts land on the nearest keyframe.</Note></motion.div>}
          {msg && <Note tone="warn">{msg}</Note>}
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
    <div className="space-y-6">
      <div className="inline-flex rounded-2xl border border-line p-1 gap-1" style={{ background: 'var(--surface2)' }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="relative px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors" style={{ color: tab === k ? 'var(--bg)' : 'var(--muted)' }}>
            {tab === k && <motion.span layoutId="clipper-tab" className="absolute inset-0 rounded-xl" style={{ background: 'var(--ink)' }} transition={SPRING} />}
            <span className="relative z-10">{l}</span>
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

import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { Dropzone, Field, Progress, Note } from '../components/ui.jsx'
import { fmtBytes, fmtTime, download, baseName, extName, recentAction } from '../lib/utils.js'
import { getFFmpeg } from '../lib/ffmpeg.js'
import { fetchFile } from '@ffmpeg/util'

export default function FrameExtractor() {
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [fps, setFps] = useState(30)
  const [meta, setMeta] = useState(null)
  const videoRef = useRef(null)
  const [snapFormat, setSnapFormat] = useState('png')
  const [gifFps, setGifFps] = useState(12)
  const [gifWidth, setGifWidth] = useState(480)
  const [gifLoop, setGifLoop] = useState(true)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(0)
  const [msg, setMsg] = useState('')
  const [clipStart, setClipStart] = useState(0)
  const [clipEnd, setClipEnd] = useState(0)

  function load([f]) {
    setFile(f); setMsg('')
    setUrl(URL.createObjectURL(f))
  }

  function step(frames) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + frames / fps))
  }

  function snapshot() {
    const v = videoRef.current
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    if (snapFormat === 'png') c.toBlob((b) => download(b, `${baseName(file.name)}-${v.currentTime.toFixed(3)}s.png`), 'image/png')
    else c.toBlob((b) => download(b, `${baseName(file.name)}-${v.currentTime.toFixed(3)}s.jpg`), 'image/jpeg', 1.0)
    recentAction(`Snapshot at ${fmtTime(v.currentTime)} from ${file.name}`)
  }

  async function makeGif() {
    const v = videoRef.current
    if (!v) return
    setBusy(true); setProg(0); setMsg('')
    try {
      const start = clipStart, end = Math.max(clipEnd, clipStart + 1 / gifFps)
      const dur = end - start
      const frames = Math.min(300, Math.floor(dur * gifFps))
      const w = gifWidth, h = Math.round((v.videoHeight / v.videoWidth) * w)
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      const gif = GIFEncoder()
      for (let i = 0; i < frames; i++) {
        v.currentTime = start + i / gifFps
        await new Promise((r) => v.onseeked = r)
        ctx.drawImage(v, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        const palette = quantize(data, 256)
        const index = applyPalette(data, palette)
        gif.writeFrame(index, w, h, { palette, delay: Math.round(1000 / gifFps), repeat: gifLoop ? 0 : 1 })
        setProg(((i + 1) / frames) * 100)
      }
      gif.finish()
      download(new Blob([gif.bytes()], { type: 'image/gif' }), `${baseName(file.name)}.gif`)
      setMsg(`GIF exported — ${frames} frames @ ${gifFps} fps`)
      recentAction(`GIF from ${file.name}`)
    } catch (e) { setMsg('GIF failed: ' + e.message) } finally { setBusy(false) }
  }

  async function trimLossless() {
    const v = videoRef.current
    setBusy(true); setProg(0); setMsg('')
    try {
      const ffmpeg = await getFFmpeg()
      const handler = ({ progress }) => setProg(progress * 100)
      ffmpeg.on('progress', handler)
      const inName = 'in.' + extName(file.name)
      await ffmpeg.writeFile(inName, await fetchFile(file))
      await ffmpeg.exec(['-ss', clipStart.toFixed(3), '-to', clipEnd.toFixed(3), '-i', inName, '-c', 'copy', '-y', 'trim.' + extName(file.name)])
      const data = await ffmpeg.readFile('trim.' + extName(file.name))
      download(new Blob([data.buffer]), `${baseName(file.name)}-trim.${extName(file.name)}`)
      ffmpeg.off('progress', handler)
      setMsg('Lossless trim exported (stream copy, zero re-encode).')
    } catch (e) { setMsg('Trim failed: ' + e.message) } finally { setBusy(false) }
  }

  return !file ? (
    <Dropzone onFiles={load} accept="video/*" label="Drop a video" sub="Frame-by-frame studio · hi-res snapshots · GIF/WebP maker" />
  ) : (
    <div className="space-y-4">
      <div className="card p-4 flex items-center gap-4 flex-wrap">
        <span className="text-2xl">🎞️</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{file.name}</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>{fmtBytes(file.size)}{meta ? ` · ${meta.w}×${meta.h} · ${fmtTime(meta.d)}` : ''}</div>
        </div>
        <button className="btn" onClick={() => { setFile(null); setUrl('') }}>Change video</button>
      </div>

      <div className="card p-3 relative">
        <video
          ref={videoRef} src={url} controls className="w-full max-h-[48vh] rounded-xl"
          onLoadedMetadata={(e) => { const v = e.target; setMeta({ w: v.videoWidth, h: v.videoHeight, d: v.duration }); setClipEnd(v.duration) }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <motion.button className="btn" whileTap={{ scale: 0.85 }} onClick={() => step(-10)}>⏪ 10f</motion.button>
        <motion.button className="btn" whileTap={{ scale: 0.85 }} onClick={() => step(-1)}>◀ 1 frame</motion.button>
        <motion.button className="btn" whileTap={{ scale: 0.85 }} onClick={() => step(1)}>1 frame ▶</motion.button>
        <motion.button className="btn" whileTap={{ scale: 0.85 }} onClick={() => step(10)}>10f ⏩</motion.button>
        <span className="flex items-center gap-2 text-xs font-semibold ml-2" style={{ color: 'var(--muted)' }}>
          FPS <input type="number" className="input w-20" value={fps} min="1" max="240" onChange={(e) => setFps(+e.target.value || 30)} />
        </span>
        <span className="flex-1" />
        <select className="input w-24" value={snapFormat} onChange={(e) => setSnapFormat(e.target.value)}><option value="png">PNG</option><option value="jpg">JPG (q1.0)</option></select>
        <motion.button className="btn btn-primary" whileTap={{ scale: 0.9 }} onClick={snapshot}>📸 Snapshot</motion.button>
      </div>

      <div className="card p-5 grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="font-bold">✂️ Lossless segment trim</div>
          <Field label={`Start — ${fmtTime(clipStart)}`}><input type="range" className="w-full" min="0" max={meta?.d || 1} step="0.01" value={clipStart} onChange={(e) => setClipStart(Math.min(+e.target.value, clipEnd))} /></Field>
          <Field label={`End — ${fmtTime(clipEnd)}`}><input type="range" className="w-full" min="0" max={meta?.d || 1} step="0.01" value={clipEnd} onChange={(e) => setClipEnd(Math.max(+e.target.value, clipStart))} /></Field>
          <button className="btn btn-primary" onClick={trimLossless} disabled={busy}>Trim (stream copy)</button>
        </div>
        <div className="space-y-3">
          <div className="font-bold">🌀 GIF maker</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`FPS — ${gifFps}`}><input type="range" className="w-full" min="4" max="30" value={gifFps} onChange={(e) => setGifFps(+e.target.value)} /></Field>
            <Field label={`Width — ${gifWidth}px`}><input type="range" className="w-full" min="160" max="1080" step="40" value={gifWidth} onChange={(e) => setGifWidth(+e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={gifLoop} onChange={(e) => setGifLoop(e.target.checked)} /> Loop forever</label>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>Uses the trim range above as source.</div>
          <button className="btn btn-primary" onClick={makeGif} disabled={busy || !meta}>Generate GIF</button>
        </div>
      </div>

      {busy && <Progress value={prog} label="Processing" />}
      {msg && <Note>{msg}</Note>}
    </div>
  )
}

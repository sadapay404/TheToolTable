import React, { useEffect, useRef, useState } from 'react'
import { Dropzone, Field, Progress, Note } from '../components/ui.jsx'
import { getFFmpeg } from '../lib/ffmpeg.js'
import { fetchFile } from '@ffmpeg/util'
import { fmtBytes, fmtTime, download, baseName, extName, recentAction, clamp } from '../lib/utils.js'

function Waveform({ peaks, start, end, duration, onSeek }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const W = c.width = c.clientWidth * 2, H = c.height = 120
    const ctx = c.getContext('2d')
    const css = getComputedStyle(document.documentElement)
    ctx.clearRect(0, 0, W, H)
    const n = peaks.length
    for (let i = 0; i < n; i++) {
      const t = i / n
      const active = t * duration >= start && t * duration <= end
      ctx.fillStyle = active ? css.getPropertyValue('--accent') : css.getPropertyValue('--border')
      const h = Math.max(2, peaks[i] * H * 0.9)
      ctx.fillRect(i * (W / n), (H - h) / 2, Math.max(1, W / n - 1), h)
    }
  }, [peaks, start, end, duration])
  return (
    <canvas
      ref={ref} className="w-full rounded-xl cursor-crosshair" style={{ height: 60, background: 'var(--surface2)', border: '1px solid var(--border)' }}
      onClick={(e) => {
        const r = e.target.getBoundingClientRect()
        onSeek(clamp(((e.clientX - r.left) / r.width) * duration, 0, duration))
      }}
    />
  )
}

async function extractPeaks(file) {
  const ac = new (window.AudioContext || window.webkitAudioContext)()
  const buf = await ac.decodeAudioData(await file.arrayBuffer())
  const ch = buf.getChannelData(0)
  const buckets = 240
  const step = Math.floor(ch.length / buckets) || 1
  const peaks = []
  for (let i = 0; i < buckets; i++) {
    let max = 0
    for (let j = i * step; j < (i + 1) * step; j += 32) max = Math.max(max, Math.abs(ch[j] || 0))
    peaks.push(max)
  }
  ac.close()
  return { peaks, duration: buf.duration }
}

export default function Clipper() {
  const [mode, setMode] = useState('file')
  const [file, setFile] = useState(null)
  const [peaks, setPeaks] = useState([])
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(0)
  const [msg, setMsg] = useState('')
  const [url, setUrl] = useState('')

  async function load([f]) {
    setFile(f); setMsg(''); setPeaks([])
    try {
      if (f.type.startsWith('audio/') || f.type.startsWith('video/')) {
        const { peaks: p, duration: d } = await extractPeaks(f)
        setPeaks(p); setDuration(d); setStart(0); setEnd(d)
      }
    } catch {
      // video containers sometimes fail decodeAudioData — fall back to metadata duration
      const v = document.createElement('video'); v.preload = 'metadata'; v.src = URL.createObjectURL(f)
      v.onloadedmetadata = () => { setDuration(v.duration); setStart(0); setEnd(v.duration) }
    }
  }

  async function cutClip() {
    setBusy(true); setProg(0); setMsg('')
    try {
      const ffmpeg = await getFFmpeg()
      const handler = ({ progress }) => setProg(progress * 100)
      ffmpeg.on('progress', handler)
      const inName = 'in.' + (extName(file.name) || 'mp4')
      await ffmpeg.writeFile(inName, await fetchFile(file))
      await ffmpeg.exec(['-ss', start.toFixed(3), '-to', end.toFixed(3), '-i', inName, '-c', 'copy', '-y', 'clip.' + (extName(file.name) || 'mp4')])
      const data = await ffmpeg.readFile('clip.' + (extName(file.name) || 'mp4'))
      await ffmpeg.deleteFile(inName)
      download(new Blob([data.buffer]), `${baseName(file.name)}-clip.${extName(file.name) || 'mp4'}`)
      ffmpeg.off('progress', handler)
      setMsg('Clip exported with stream copy — zero re-compression.')
      recentAction(`Clipped ${file.name} ${fmtTime(start)}→${fmtTime(end)}`)
    } catch (e) { setMsg('Clip failed: ' + e.message) } finally { setBusy(false) }
  }

  async function downloadURL() {
    setBusy(true); setProg(0); setMsg('')
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const total = +res.headers.get('content-length') || 0
      const reader = res.body.getReader()
      const chunks = []
      let got = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); got += value.length
        if (total) setProg((got / total) * 100)
      }
      const name = url.split('/').pop().split('?')[0] || 'media.bin'
      download(new Blob(chunks), name)
      setMsg(`Downloaded ${fmtBytes(got)} — ${name}`)
      recentAction(`Downloaded ${name} from URL`)
    } catch (e) { setMsg('Download failed: ' + e.message + ' (the host must allow cross-origin fetching)') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button className="chip" data-on={mode === 'file'} onClick={() => setMode('file')}>📁 Local file clip</button>
        <button className="chip" data-on={mode === 'url'} onClick={() => setMode('url')}>🌐 URL downloader</button>
      </div>

      {mode === 'file' ? (
        !file ? (
          <Dropzone onFiles={load} accept="audio/*,video/*" label="Drop audio or video" sub="Waveform timeline + lossless stream-copy clipping" />
        ) : (
          <div className="space-y-4">
            <div className="card p-5 flex items-center gap-4 flex-wrap">
              <span className="text-2xl">✂️</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{file.name}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{fmtBytes(file.size)} · {fmtTime(duration)}</div>
              </div>
              <button className="btn" onClick={() => setFile(null)}>Change</button>
            </div>

            {peaks.length > 0 && <Waveform peaks={peaks} start={start} end={end} duration={duration} onSeek={(t) => { if (Math.abs(t - start) < Math.abs(t - end)) setStart(t); else setEnd(t) }} />}

            <div className="card p-5 grid sm:grid-cols-2 gap-5">
              <Field label={`Start — ${fmtTime(start)}`}>
                <input type="range" min="0" max={duration || 1} step="0.01" value={start} onChange={(e) => setStart(Math.min(+e.target.value, end - 0.01))} className="w-full" />
              </Field>
              <Field label={`End — ${fmtTime(end)}`}>
                <input type="range" min="0" max={duration || 1} step="0.01" value={end} onChange={(e) => setEnd(Math.max(+e.target.value, start + 0.01))} className="w-full" />
              </Field>
            </div>

            <audio controls src={URL.createObjectURL(file)} className="w-full" />
            {busy && <Progress value={prog} label="Exporting clip" />}
            {msg && <Note>{msg}</Note>}
            <button className="btn btn-primary" onClick={cutClip} disabled={busy || !duration}>✂️ Export clip (lossless copy)</button>
          </div>
        )
      ) : (
        <div className="card p-5 space-y-4">
          <Field label="Direct media URL (mp4, mp3, wav, webm, image…)">
            <input className="input" placeholder="https://example.com/media/song.mp3" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Note tone="warn">Streaming platforms (YouTube etc.) encrypt/segment their streams and cannot be legally or technically extracted client-side. Direct media file URLs and your own hosts work great.</Note>
          {busy && <Progress value={prog} label="Accelerated fetch" />}
          {msg && <Note>{msg}</Note>}
          <button className="btn btn-primary" onClick={downloadURL} disabled={busy || !url}>⬇️ Fetch & download</button>
        </div>
      )}
    </div>
  )
}

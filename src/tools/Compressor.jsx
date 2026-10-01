import React, { useMemo, useState } from 'react'
import { Dropzone, Field, Progress, Note, Stat } from '../components/ui.jsx'
import { getFFmpeg } from '../lib/ffmpeg.js'
import { fetchFile } from '@ffmpeg/util'
import { fmtBytes, fmtTime, mediaDuration, download, baseName, recentAction } from '../lib/utils.js'

export default function Compressor() {
  const [file, setFile] = useState(null)
  const [duration, setDuration] = useState(NaN)
  const [targetMB, setTargetMB] = useState(25)
  const [audioKbps, setAudioKbps] = useState(128)
  const [scale, setScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function load([f]) {
    setFile(f); setResult(null); setError('')
    setDuration(await mediaDuration(f))
  }

  // 2-pass style bitrate math: budget bytes -> split across video+audio
  const plan = useMemo(() => {
    if (!file || !Number.isFinite(duration) || duration <= 0) return null
    const targetBytes = targetMB * 1024 * 1024
    const containerOverhead = targetBytes * 0.02
    const audioBytes = (audioKbps * 1000 * duration) / 8
    const videoBits = Math.max(0, (targetBytes - containerOverhead - audioBytes) * 8)
    const vKbps = Math.round(videoBits / duration / 1000)
    const est = videoBits / 8 + audioBytes + containerOverhead
    return { vKbps, audioBytes, est, fits: est <= targetBytes }
  }, [file, duration, targetMB, audioKbps])

  async function compress() {
    if (!plan || plan.vKbps < 20) { setError('Bitrate budget too small — lower the audio bitrate, pick a bigger target, or scale resolution down.'); return }
    setBusy(true); setProg(0); setError(''); setResult(null)
    try {
      const ffmpeg = await getFFmpeg()
      const handler = ({ progress }) => setProg(progress * 100)
      ffmpeg.on('progress', handler)
      const inName = 'in' + file.name.slice(file.name.lastIndexOf('.'))
      await ffmpeg.writeFile(inName, await fetchFile(file))
      const vf = scale < 1 ? `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2` : null
      const args = ['-i', inName]
      if (vf) args.push('-vf', vf)
      args.push('-c:v', 'libx264', '-b:v', `${plan.vKbps}k`, '-maxrate', `${Math.round(plan.vKbps * 1.15)}k`, '-bufsize', `${plan.vKbps * 2}k`, '-preset', 'medium', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-y', 'out.mp4')
      await ffmpeg.exec(args)
      const data = await ffmpeg.readFile('out.mp4')
      const blob = new Blob([data.buffer], { type: 'video/mp4' })
      await ffmpeg.deleteFile(inName); await ffmpeg.deleteFile('out.mp4')
      ffmpeg.off('progress', handler)
      setResult(blob)
      download(blob, `${baseName(file.name)}-${targetMB}mb.mp4`)
      recentAction(`Compressed ${file.name} to ${targetMB} MB budget`)
    } catch (e) {
      setError('Compression failed: ' + (e.message || e))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      {!file ? (
        <Dropzone onFiles={load} accept="video/*,audio/*" label="Drop a video or audio file" sub="The only tool allowed to compress — and only when you ask it to" />
      ) : (
        <>
          <div className="card p-5 flex items-center gap-4 flex-wrap">
            <span className="text-3xl">🎯</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{file.name}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>{fmtBytes(file.size)} · {Number.isFinite(duration) ? fmtTime(duration) : '…'}</div>
            </div>
            <button className="btn" onClick={() => setFile(null)}>Change file</button>
          </div>

          <div className="card p-5 grid sm:grid-cols-3 gap-5">
            <Field label={`Target size — ${targetMB} MB`}>
              <input type="range" min="1" max="200" value={targetMB} onChange={(e) => setTargetMB(+e.target.value)} className="w-full" />
              <div className="flex gap-2 mt-2">{[8, 25, 50, 100].map((m) => <button key={m} className="chip" data-on={targetMB === m} onClick={() => setTargetMB(m)}>{m} MB</button>)}</div>
            </Field>
            <Field label={`Audio bitrate — ${audioKbps} kbps`}>
              <input type="range" min="64" max="320" step="32" value={audioKbps} onChange={(e) => setAudioKbps(+e.target.value)} className="w-full" />
            </Field>
            <Field label={`Resolution scale — ${Math.round(scale * 100)}%`}>
              <input type="range" min="0.25" max="1" step="0.05" value={scale} onChange={(e) => setScale(+e.target.value)} className="w-full" />
              <div className="flex gap-2 mt-2">{[[1, '100%'], [0.75, '75%'], [0.5, '50%']].map(([v, l]) => <button key={l} className="chip" data-on={scale === v} onClick={() => setScale(v)}>{l}</button>)}</div>
            </Field>
          </div>

          {plan && (
            <div className="grid sm:grid-cols-4 gap-3">
              <Stat k="Computed video bitrate" v={`${plan.vKbps} kbps`} />
              <Stat k="Audio budget" v={fmtBytes(plan.audioBytes)} />
              <Stat k="Live size preview" v={`≈ ${fmtBytes(plan.est)}`} />
              <Stat k="Fits target?" v={plan.fits ? '✅ Yes' : '⚠️ Over'} />
            </div>
          )}

          {error && <Note tone="warn">{error}</Note>}
          {busy && <div className="card p-5"><Progress value={prog} label="Two-pass calculated bitrate encode (x264 + AAC)" /></div>}
          {result && <Note tone="ok">Done! Output: {fmtBytes(result.size)} (target {targetMB} MB). Download started automatically.</Note>}

          <button className="btn btn-primary" onClick={compress} disabled={busy || !plan}>
            {busy ? 'Encoding…' : '🚀 Compress to target'}
          </button>
        </>
      )}
    </div>
  )
}

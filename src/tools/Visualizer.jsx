import React, { useRef, useState } from 'react'
import { Dropzone, Field, Select, Note, Progress } from '../components/ui.jsx'
import { fmtTime, download, baseName, recentAction } from '../lib/utils.js'

function hexRgb(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
/** mix accent towards white; share = 0..1 portion of accent */
function mixW(hex, share) {
  const a = hexRgb(hex)
  const s = Math.max(0, Math.min(1, share))
  return `rgb(${Math.round(a.r * s + 255 * (1 - s))},${Math.round(a.g * s + 255 * (1 - s))},${Math.round(a.b * s + 255 * (1 - s))})`
}

const RATIOS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] }
const STYLES = [['bars', 'Equalizer bars'], ['radial', 'Radial spectrum'], ['wave', 'Fluid waveform'], ['particles', 'Particle burst']]

export default function Visualizer() {
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [ratio, setRatio] = useState('16:9')
  const [style, setStyle] = useState('bars')
  const [title, setTitle] = useState('TheToolTable Session')
  const [accent, setAccent] = useState('#C87941')
  const [bgImage, setBgImage] = useState(null)
  const [recording, setRecording] = useState(false)
  const [prog, setProg] = useState(0)
  const audioRef = useRef(null)
  const canvasRef = useRef(null)
  const stateRef = useRef({})

  function load([f]) {
    setFile(f)
    setUrl(URL.createObjectURL(f))
  }

  function drawFrame(ctx, W, H, freq, wave, t, progress) {
    const css = getComputedStyle(document.documentElement)
    // background
    if (stateRef.current.bgImg) {
      const im = stateRef.current.bgImg
      const s = Math.max(W / im.width, H / im.height)
      ctx.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s)
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H)
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, '#0B0B12'); g.addColorStop(1, '#141420')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    }
    ctx.fillStyle = accent
    const bass = (freq[1] + freq[2] + freq[3]) / (3 * 255)

    if (style === 'bars') {
      const n = 72, bw = W / n
      for (let i = 0; i < n; i++) {
        const v = freq[Math.floor(i * (freq.length / 2 / n))] / 255
        const h = Math.max(4, v * H * 0.55)
        ctx.fillStyle = mixW(accent, (40 + v * 60) / 100)
        ctx.fillRect(i * bw + bw * 0.18, H * 0.72 - h, bw * 0.64, h)
      }
    } else if (style === 'radial') {
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.22
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.0002)
      const n = 120
      for (let i = 0; i < n; i++) {
        const v = freq[Math.floor(i * (freq.length / 2 / n))] / 255
        const a = (i / n) * Math.PI * 2
        const len = R * 0.2 + v * R * 1.3
        ctx.strokeStyle = mixW(accent, (35 + v * 65) / 100)
        ctx.lineWidth = Math.max(2, (Math.PI * 2 * R) / n / 2.4)
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R)
        ctx.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len))
        ctx.stroke()
      }
      ctx.restore()
      ctx.beginPath(); ctx.arc(cx, cy, R * (0.86 + bass * 0.22), 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill()
    } else if (style === 'wave') {
      for (let layer = 2; layer >= 0; layer--) {
        ctx.beginPath()
        for (let x = 0; x <= W; x += 6) {
          const i = Math.floor((x / W) * wave.length)
          const y = H * 0.55 + wave[i] * H * (0.18 + layer * 0.08)
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.strokeStyle = mixW(accent, (80 - layer * 28) / 100)
        ctx.lineWidth = 4 - layer; ctx.stroke()
      }
    } else { // particles
      const P = stateRef.current.particles || (stateRef.current.particles = Array.from({ length: 160 }, () => ({ a: Math.random() * 7, r: Math.random(), s: 0.4 + Math.random() })))
      const cx = W / 2, cy = H / 2
      P.forEach((p, i) => {
        const v = freq[(i * 7) % (freq.length / 2)] / 255
        p.r += 0.002 + v * 0.012 * p.s
        if (p.r > 1.1) p.r = 0.05
        const rad = p.r * Math.min(W, H) * 0.62
        const x = cx + Math.cos(p.a + t * 0.0003 * p.s) * rad
        const y = cy + Math.sin(p.a + t * 0.0003 * p.s) * rad
        ctx.beginPath(); ctx.arc(x, y, 2 + v * 9 + bass * 6, 0, Math.PI * 2)
        ctx.fillStyle = mixW(accent, (30 + v * 70) / 100); ctx.fill()
      })
    }

    // title + progress bar
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
    ctx.font = `800 ${Math.round(W * 0.035)}px Inter, sans-serif`
    ctx.fillText(title, W / 2, H * 0.12)
    const bw2 = W * 0.6
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(W / 2 - bw2 / 2, H * 0.92, bw2, 8)
    ctx.fillStyle = accent
    ctx.fillRect(W / 2 - bw2 / 2, H * 0.92, bw2 * progress, 8)
  }

  async function record() {
    const audio = audioRef.current
    const canvas = canvasRef.current
    const [W, H] = RATIOS[ratio]
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    const AC = window.AudioContext || window.webkitAudioContext
    const ac = new AC()
    const src = ac.createMediaElementSource(audio)
    const analyser = ac.createAnalyser()
    analyser.fftSize = 2048
    src.connect(analyser); analyser.connect(ac.destination)
    const freq = new Uint8Array(analyser.frequencyBinCount)
    const wave = new Uint8Array(analyser.fftSize)

    const dest = ac.createMediaStreamDestination()
    src.connect(dest)
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()])
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm', videoBitsPerSecond: 14_000_000 })
    const chunks = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      download(new Blob(chunks, { type: 'video/webm' }), `${baseName(file.name)}-visualizer.webm`)
      recentAction(`Generated visualizer video for ${file.name}`)
      setRecording(false)
    }

    let raf
    const loop = (t) => {
      analyser.getByteFrequencyData(freq)
      analyser.getByteTimeDomainData(wave)
      const norm = new Array(wave.length)
      for (let i = 0; i < wave.length; i++) norm[i] = (wave[i] - 128) / 128
      drawFrame(ctx, W, H, freq, norm, t, audio.duration ? audio.currentTime / audio.duration : 0)
      setProg((audio.currentTime / audio.duration) * 100)
      raf = requestAnimationFrame(loop)
    }
    audio.currentTime = 0
    await ac.resume()
    await audio.play()
    rec.start(500)
    setRecording(true)
    raf = requestAnimationFrame(loop)
    audio.onended = () => { cancelAnimationFrame(raf); rec.stop(); src.disconnect(); ac.close() }
  }

  return !file ? (
    <Dropzone onFiles={load} accept="audio/*" label="Drop an audio track" sub="MP3 · WAV · FLAC · OGG → animated visualizer video" />
  ) : (
    <div className="space-y-5">
      <div className="card p-5 flex items-center gap-4 flex-wrap">
        <span className="text-2xl">🎵</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{file.name}</div>
        </div>
        <button className="btn" onClick={() => setFile(null)}>Change track</button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="card p-3 grid place-items-center overflow-hidden" style={{ background: '#0B0B12' }}>
          <canvas ref={canvasRef} className="max-w-full max-h-[52vh] rounded-xl" width={960} height={540} />
        </div>
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <Field label="Visualizer style">
              <div className="flex flex-wrap gap-2">{STYLES.map(([v, l]) => <button key={v} className="chip" data-on={style === v} onClick={() => setStyle(v)}>{l}</button>)}</div>
            </Field>
            <Field label="Aspect ratio">
              <div className="flex gap-2">{Object.keys(RATIOS).map((r) => <button key={r} className="chip" data-on={ratio === r} onClick={() => setRatio(r)}>{r}</button>)}</div>
            </Field>
            <Field label="Title text"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Accent color"><input type="color" className="input h-11 p-1" value={accent} onChange={(e) => setAccent(e.target.value)} /></Field>
            <Field label="Background image (optional)">
              <input type="file" accept="image/*" className="text-xs" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return
                const im = new Image(); im.src = URL.createObjectURL(f)
                im.onload = () => { stateRef.current.bgImg = im }
              }} />
            </Field>
          </div>
          {recording ? <div className="card p-5"><Progress value={prog} label="Recording in real time — keep this tab visible" /></div> : null}
          <button className="btn btn-primary w-full" onClick={record} disabled={recording}>{recording ? '● Recording…' : '⏺ Render video (WebM)'}</button>
          <Note>Renders at full {RATIOS[ratio][0]}×{RATIOS[ratio][1]} in real time (video length = track length), then auto-downloads.</Note>
          <audio ref={audioRef} src={url} controls className="w-full" />
        </div>
      </div>
    </div>
  )
}

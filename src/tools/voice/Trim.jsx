import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Panel, Label, Btn, Drop, Range, Switch, KIco, SPRING, save, baseName, Stat2 } from '../kit/ui.jsx'
import { mono, peaks, encodeWav } from '../../lib/voice/audio.js'
import { fmtTime } from '../../lib/voice/subs.js'

export default function Trim({ media, loadFile, toast }) {
  const [sel, setSel] = useState([0, 1]), [fade, setFade] = useState(0), [norm, setNorm] = useState(false), [playing, setPlaying] = useState(false), [head, setHead] = useState(0)
  const cv = useRef(null), box = useRef(null), src = useRef(null), ctxRef = useRef(null)
  const buf = media?.buffer, dur = buf?.duration || 0
  const pk = useMemo(() => (buf ? peaks(mono(buf), 900) : null), [buf])
  useEffect(() => { setSel([0, 1]); stop() }, [buf])
  useEffect(() => () => { stop(); try { ctxRef.current?.close?.()?.catch?.(() => {}) } catch {} }, [])
  useEffect(() => {
    const c = cv.current; if (!c || !pk) return; const x = c.getContext('2d'), w = c.width, h = c.height; x.clearRect(0, 0, w, h)
    const s = sel[0] * w, e = sel[1] * w
    for (let i = 0; i < pk.length; i++) { const px = (i / pk.length) * w, bh = Math.max(2, pk[i] * h * 0.92); x.fillStyle = px >= s && px <= e ? '#B4715A' : 'rgba(120,110,100,.35)'; x.fillRect(px, (h - bh) / 2, Math.max(1, w / pk.length - 0.6), bh) }
  }, [pk, sel])
  const stop = () => { try { src.current?.stop() } catch {} ; src.current = null; setPlaying(false) }
  const play = async () => {
    if (playing) return stop()
    if (!buf || dur <= 0) return
    try {
      const Audio = window.AudioContext || window.webkitAudioContext
      if (!Audio) throw new Error('Audio playback is not supported in this browser.')
      const ctx = (ctxRef.current ||= new Audio())
      if (ctx.state === 'suspended') await ctx.resume()
      const s = ctx.createBufferSource(), a = sel[0] * dur, b = sel[1] * dur
      if (b - a <= 0.01) throw new Error('Choose a longer section to preview.')
      s.buffer = buf; s.connect(ctx.destination); s.start(0, a, b - a); const t0 = ctx.currentTime
      s.onended = () => { if (src.current === s) { src.current = null; setPlaying(false); setHead(0) } }
      src.current = s; setPlaying(true)
      const loop = () => { if (src.current !== s) return; setHead(Math.min(1, (a + ctx.currentTime - t0) / dur)); requestAnimationFrame(loop) }
      loop()
    } catch (error) { toast(error.message || 'Could not play this audio selection.', 'err') }
  }
  const drag = (which) => (e) => {
    e.preventDefault(); const mv = (ev) => { const r = box.current.getBoundingClientRect(), v = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)); setSel(([a, b]) => (which === 0 ? [Math.min(v, b - 0.005), b] : [a, Math.max(v, a + 0.005)])) }, up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const edges = () => {
    if (!buf) return
    const d = mono(buf), th = 0.015; let a = 0, b = d.length - 1
    while (a < d.length && Math.abs(d[a]) < th) a++
    while (b > a && Math.abs(d[b]) < th) b--
    if (a >= b) { toast('No clear silence edges found; selection was left unchanged.'); return }
    setSel([Math.max(0, (a - buf.sampleRate * 0.15) / d.length), Math.min(1, (b + buf.sampleRate * 0.25) / d.length)]); toast('Silence trimmed from both ends')
  }
  const exportWav = () => {
    if (!buf) return
    try {
      const a = Math.max(0, Math.min(buf.length - 1, Math.floor(sel[0] * buf.length))), b = Math.max(a + 1, Math.min(buf.length, Math.floor(sel[1] * buf.length))), n = b - a
      const chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice(a, b))
      if (norm) { let m = 0; for (const c of chs) for (let i = 0; i < n; i += 1) m = Math.max(m, Math.abs(c[i])); if (m > 0) for (const c of chs) for (let i = 0; i < n; i++) c[i] *= 0.97 / m }
      const f = Math.floor(fade * buf.sampleRate); if (f) for (const c of chs) for (let i = 0; i < Math.min(f, n / 2); i++) { const g = i / f; c[i] *= g; c[n - 1 - i] *= g }
      save(encodeWav(chs, buf.sampleRate), baseName(media.name) + '_trim.wav')
    } catch (error) { toast(error.message || 'Could not create this WAV file.', 'err') }
  }
  if (!media) return <Drop multiple={false} accept="audio/*,video/*" onFiles={(f) => loadFile(f[0])} title="Drop audio or video to trim" sub="Cut the start and end, fade, normalise — exported as lossless WAV" icon="scissors" />
  const len = (sel[1] - sel[0]) * dur
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <Panel>
        <Label right={<Btn small icon="x" onClick={() => loadFile(null)}>Change</Btn>}>{media.name}</Label>
        <div ref={box} className="relative select-none" style={{ touchAction: 'none' }}>
          <canvas ref={cv} width={1200} height={200} className="w-full rounded-2xl" style={{ background: 'var(--surface2)' }} />
          <div className="absolute inset-y-0 left-0 rounded-l-2xl" style={{ width: sel[0] * 100 + '%', background: 'rgba(0,0,0,.18)' }} /><div className="absolute inset-y-0 right-0 rounded-r-2xl" style={{ width: (1 - sel[1]) * 100 + '%', background: 'rgba(0,0,0,.18)' }} />
          {playing && <div className="absolute inset-y-0 w-0.5" style={{ left: head * 100 + '%', background: 'var(--ink)' }} />}
          {[0, 1].map((w) => <motion.div key={w} onPointerDown={drag(w)} whileHover={{ scaleX: 1.6 }} className="absolute inset-y-0 w-2 -ml-1 rounded-full cursor-ew-resize" style={{ left: sel[w] * 100 + '%', background: 'var(--copper)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--copper) 25%, transparent)' }}><span className="absolute top-1/2 -mt-3 -ml-2.5 w-7 h-6 rounded-md grid place-items-center text-white" style={{ background: 'var(--copper)' }}><KIco n="drag" s={12} /></span></motion.div>)}
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5"><Stat2 i={0} k="From" v={fmtTime(sel[0] * dur, false).slice(3, 11)} /><Stat2 i={1} k="To" v={fmtTime(sel[1] * dur, false).slice(3, 11)} /><Stat2 i={2} k="Length" v={fmtTime(len, false).slice(3, 11)} /></div>
        <div className="flex flex-wrap gap-2 mt-5"><Btn primary icon={playing ? 'stop' : 'play'} onClick={play}>{playing ? 'Stop' : 'Play selection'}</Btn><Btn icon="wand" onClick={edges}>Trim silence</Btn><Btn icon="refresh" onClick={() => setSel([0, 1])}>Reset</Btn></div>
      </Panel>
      <Panel delay={0.08}>
        <Label>Finish</Label>
        <div className="space-y-4"><Range label="Fade in and out" min={0} max={3} step={0.1} value={fade} onChange={setFade} fmt={(v) => (v ? v.toFixed(1) + ' s' : 'Off')} /><Switch on={norm} onChange={setNorm} label="Normalise volume" hint="Brings the loudest peak to just under full scale" /></div>
        <Btn primary className="w-full mt-5" icon="download" onClick={exportWav}>Save as WAV</Btn>
        <div className="text-[11.5px] mt-3" style={{ color: 'var(--muted)' }}>{buf.numberOfChannels === 1 ? 'Mono' : 'Stereo'} · {buf.sampleRate / 1000} kHz · 16-bit · no quality loss.</div>
      </Panel>
    </div>
  )
}

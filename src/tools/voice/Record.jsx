import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Btn, KIco, SPRING, save, Switch, fmtSize } from '../kit/ui.jsx'
import { decodeFile, encodeWav } from '../../lib/voice/audio.js'

const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const MAX_RECORD_SECONDS = 3 * 60 * 60

export default function Record({ loadFile, go, toast }) {
  const [state, setState] = useState('idle'), [t, setT] = useState(0), [clip, setClip] = useState(null), [dev, setDev] = useState({ ns: true, ec: true, agc: true }), [savingWav, setSavingWav] = useState(false)
  const R = useRef({}), tick = useRef(0), cv = useRef(null), mounted = useRef(true)
  const stopAll = () => {
    cancelAnimationFrame(R.current.raf); clearInterval(tick.current)
    R.current.stream?.getTracks?.().forEach((track) => { try { track.stop() } catch {} })
    try { R.current.ctx?.close?.()?.catch?.(() => {}) } catch {}
    R.current.raf = 0; tick.current = 0
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const recorder = R.current.rec
      if (recorder) { recorder.onstop = null; try { if (recorder.state !== 'inactive') recorder.stop() } catch {} }
      stopAll()
    }
  }, [])
  useEffect(() => () => { if (clip?.url) URL.revokeObjectURL(clip.url) }, [clip?.url])

  const start = async () => {
    let stream, ctx, rec
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Microphone recording is not supported in this browser.')
      stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: dev.ns, echoCancellation: dev.ec, autoGainControl: dev.agc } })
      const Audio = window.AudioContext || window.webkitAudioContext
      if (!Audio) throw new Error('Audio analysis is not supported in this browser.')
      ctx = new Audio(); const an = ctx.createAnalyser(); an.fftSize = 128; ctx.createMediaStreamSource(stream).connect(an)
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported?.(type)), chunks = []
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      rec.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data) }
      rec.onerror = (event) => { if (mounted.current) toast(event.error?.message || 'The microphone recorder stopped unexpectedly.', 'err') }
      rec.onstop = () => {
        stopAll()
        if (!mounted.current) return
        const type = rec.mimeType || mime || 'audio/webm', blob = new Blob(chunks, { type }), url = URL.createObjectURL(blob)
        setClip({ blob, url, type, dur: R.current.t || 0 }); setState('done')
      }
      rec.start(250)
      R.current = { stream, ctx, an, rec, t: 0 }
      setState('rec'); setT(0); setClip(null)
      const t0 = Date.now(); let paused = 0, pAt = 0
      R.current.pause = () => { pAt = Date.now() }; R.current.resume = () => { paused += Date.now() - pAt }
      tick.current = setInterval(() => {
        if (R.current.rec?.state === 'recording') {
          R.current.t = Math.min(MAX_RECORD_SECONDS, (Date.now() - t0 - paused) / 1000); setT(R.current.t)
          if (R.current.t >= MAX_RECORD_SECONDS) { toast('Stopped at the three-hour recording limit.'); stop() }
        }
      }, 200)
      const data = new Uint8Array(an.frequencyBinCount), draw = () => {
        R.current.raf = requestAnimationFrame(draw); const c = cv.current; if (!c) return
        const x = c.getContext('2d'), w = c.width, h = c.height
        if (!x) return
        an.getByteFrequencyData(data); x.clearRect(0, 0, w, h)
        const n = 36, bw = w / n, col = getComputedStyle(c).getPropertyValue('color') || '#B4715A'; x.fillStyle = col
        for (let i = 0; i < n; i++) { const v = (data[Math.floor((i / n) * data.length * 0.7)] || 0) / 255, bh = Math.max(6, v * h * 0.95), left = i * bw + 3, top = (h - bh) / 2, width = Math.max(1, bw - 6); if (x.roundRect) { x.beginPath(); x.roundRect(left, top, width, bh, 6); x.fill() } else x.fillRect(left, top, width, bh) }
      }
      draw()
    } catch (error) {
      try { if (rec && rec.state !== 'inactive') rec.stop() } catch {}
      stream?.getTracks?.().forEach((track) => { try { track.stop() } catch {} })
      try { await ctx?.close?.() } catch {}
      R.current = {}; stopAll()
      if (mounted.current) toast(error?.name === 'NotAllowedError' ? 'Microphone permission was blocked' : error?.message || 'No microphone found', 'err')
    }
  }

  const pause = () => {
    const r = R.current.rec
    if (!r) return
    try { if (r.state === 'recording') { r.pause(); R.current.pause?.(); setState('paused') } else if (r.state === 'paused') { r.resume(); R.current.resume?.(); setState('rec') } } catch { toast('The recording could not be paused.', 'err') }
  }
  const stop = () => { try { if (R.current.rec?.state !== 'inactive') R.current.rec?.stop() } catch (error) { toast(error.message || 'Could not stop the recording.', 'err') } }
  const ext = clip?.type.includes('mp4') ? 'm4a' : clip?.type.includes('ogg') ? 'ogg' : 'webm'
  const wav = async () => {
    if (!clip || savingWav) return
    setSavingWav(true)
    try {
      const file = new File([clip.blob], `recording.${ext}`, { type: clip.type }), buffer = await decodeFile(file)
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice())
      save(encodeWav(channels, buffer.sampleRate), 'recording.wav')
    } catch (error) { toast(error.message || 'Could not convert the recording to WAV.', 'err') }
    finally { setSavingWav(false) }
  }
  const live = state === 'rec' || state === 'paused'
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <Panel className="text-center">
        <div className="py-6">
          <div className="relative mx-auto w-44 h-44 grid place-items-center">
            {live && [0, 1, 2].map((i) => <motion.span key={i} className="absolute inset-0 rounded-full" style={{ border: '2px solid var(--copper)' }} animate={state === 'rec' ? { scale: [1, 1.5], opacity: [0.5, 0] } : { opacity: 0 }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.66 }} />)}
            <motion.button type="button" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }} transition={SPRING} onClick={live ? stop : start} aria-label={live ? 'Stop recording' : 'Start recording'} className="relative w-28 h-28 rounded-full grid place-items-center text-white" style={{ background: live ? '#C3423F' : 'var(--ink)', boxShadow: '0 22px 40px -16px rgba(0,0,0,.6)' }}><KIco n={live ? 'stop' : 'mic'} s={38} /></motion.button>
          </div>
          <div className="display font-semibold text-[44px] tabular-nums mt-4">{fmtT(t)}</div>
          <canvas ref={cv} width={640} height={110} className="mx-auto mt-3 w-full max-w-[520px]" style={{ color: 'var(--copper)', opacity: live ? 1 : 0.25 }} />
          <div className="h-12 mt-3 flex items-center justify-center gap-3">
            <AnimatePresence mode="wait" initial={false}>
              {live ? <motion.div key="l" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Btn icon={state === 'paused' ? 'play' : 'pause'} onClick={pause}>{state === 'paused' ? 'Resume' : 'Pause'}</Btn></motion.div> : <motion.div key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px]" style={{ color: 'var(--muted)' }}>{state === 'done' ? 'Recording ready below' : 'Tap the microphone to start'}</motion.div>}
            </AnimatePresence>
          </div>
        </div>
        <AnimatePresence>{clip && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="border-t border-line pt-5 text-left">
            <audio src={clip.url} controls className="w-full" />
            <div className="flex flex-wrap gap-2 mt-4"><Btn primary icon="download" onClick={() => save(clip.blob, `recording.${ext}`)}>Save .{ext} · {fmtSize(clip.blob.size)}</Btn><Btn icon="waves" busy={savingWav} disabled={savingWav} onClick={wav}>Save as WAV</Btn><Btn icon="mic" onClick={() => { loadFile(new File([clip.blob], `recording.${ext}`, { type: clip.type })); go('transcribe') }}>Make subtitles</Btn><Btn icon="scissors" onClick={() => { loadFile(new File([clip.blob], `recording.${ext}`, { type: clip.type })); go('trim') }}>Trim</Btn></div>
          </motion.div>)}</AnimatePresence>
      </Panel>
      <Panel delay={0.08}>
        <Label>Microphone</Label>
        <div className="space-y-3"><Switch on={dev.ns} onChange={(v) => setDev({ ...dev, ns: v })} label="Noise suppression" hint="Removes fans and background hiss" /><Switch on={dev.ec} onChange={(v) => setDev({ ...dev, ec: v })} label="Echo cancellation" /><Switch on={dev.agc} onChange={(v) => setDev({ ...dev, agc: v })} label="Auto volume" /></div>
        <div className="text-[11.5px] mt-4" style={{ color: 'var(--muted)' }}>Settings apply to the next recording. Audio is recorded on this device only.</div>
      </Panel>
    </div>
  )
}

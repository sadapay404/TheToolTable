// Tool 17 — Audio Studio. A waveform you can actually cut: trim, fade, normalise, join, speed, export.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { recentAction, download, fmtTime, baseName } from '../lib/utils.js'
import { decodeAudio, toMono, peaks as makePeaks, slice, fade, gain, normalize, reverse, resample, concat, encodeWav, audioStats, fmtDur } from '../lib/audio.js'
import { Ico, Btn, Chips, Slider, Toggle, Panel, Label, Seg, Drop, Stat, Toast, useToast, SPRING } from './kit.jsx'

const H = 190

export default function AudioStudio() {
  const [clips, setClips] = useState([])          // [{ id, name, channels, sampleRate }]
  const [active, setActive] = useState(null)
  const [sel, setSel] = useState(null)            // { a, b } in seconds
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [gainDb, setGainDb] = useState(0)
  const [fadeIn, setFadeIn] = useState(0.15)
  const [fadeOut, setFadeOut] = useState(0.4)
  const [speed, setSpeed] = useState(1)
  const [gap, setGap] = useState(0.2)
  const [busy, setBusy] = useState('')
  const [hist, setHist] = useState([])
  const [msg, toast] = useToast()
  const pickerRef = useRef(null)
  const elRef = useRef(null)
  const wrapRef = useRef(null)
  const cvRef = useRef(null)
  const dragRef = useRef(null)
  const peakRef = useRef(null)

  const clip = clips.find((c) => c.id === active) || clips[0] || null
  const sr = clip?.sampleRate || 44100
  const dur = clip ? clip.channels[0].length / sr : 0

  const addFiles = useCallback(async (files) => {
    setBusy('decoding')
    const added = []
    for (const f of files) {
      try {
        const dec = await decodeAudio(f)
        added.push({ id: `${Date.now()}-${added.length}`, name: f.name, channels: dec.channels, sampleRate: dec.sampleRate })
      } catch (e) { toast(`${f.name}: ${e.message}`, 'err') }
    }
    if (added.length) {
      setClips((c) => [...c, ...added])
      setActive((a) => a ?? added[0].id)
      peakRef.current = null
      recentAction(`Opened ${added.length} clip${added.length > 1 ? 's' : ''} in the Audio Studio`)
      toast(`${added.length} clip${added.length > 1 ? 's' : ''} ready`)
    }
    setBusy('')
  }, [toast])

  /* ------------------------------------------------------------- history */
  const pushHist = useCallback(() => {
    setHist((h) => (clip ? [{ id: clip.id, channels: clip.channels, sampleRate: clip.sampleRate, name: clip.name }, ...h].slice(0, 12) : h))
  }, [clip])
  const undo = () => {
    const [last, ...rest] = hist
    if (!last) return
    setClips((cs) => [...cs.filter((c) => c.id !== last.id), { ...last }])
    setActive(last.id); setHist(rest); peakRef.current = null
    toast('Undone')
  }
  const apply = (fn, label) => {
    if (!clip) return
    pushHist()
    setClips((cs) => cs.map((c) => (c.id === clip.id ? { ...c, channels: fn(c.channels, c.sampleRate) } : c)))
    peakRef.current = null
    toast(label)
  }

  /* ------------------------------------------------------------- waveform */
  const peaksData = useMemo(() => {
    if (!clip) return null
    if (!peakRef.current) peakRef.current = makePeaks(toMono(clip.channels), 1800)
    return peakRef.current
  }, [clip])

  const draw = useCallback(() => {
    const cv = cvRef.current
    if (!cv || !peaksData) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = wrapRef.current?.clientWidth || 900
    cv.width = w * dpr; cv.height = H * dpr
    const g = cv.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, H)
    const mid = H / 2, half = H / 2 - 10
    const px = (s) => (s / (dur || 1)) * w
    if (sel) {
      const x0 = px(Math.min(sel.a, sel.b)), x1 = px(Math.max(sel.a, sel.b))
      g.fillStyle = 'rgba(200,121,65,.18)'; g.fillRect(x0, 0, Math.max(1, x1 - x0), H)
      g.fillStyle = '#C87941'; g.fillRect(x0, 0, 2, H); g.fillRect(x1 - 2, 0, 2, H)
    }
    g.beginPath()
    peaksData.forEach((p, i) => {
      const x = (i / peaksData.length) * w
      g.moveTo(x, mid - p.max * half); g.lineTo(x, mid - p.min * half)
    })
    g.strokeStyle = '#7B6CB0'; g.lineWidth = 1; g.stroke()
    g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.strokeStyle = 'rgba(0,0,0,.12)'; g.stroke()
    const x = px(cur)
    g.fillStyle = '#22201d'; g.fillRect(x - 1, 0, 2, H)
    g.beginPath(); g.arc(x, 7, 4.5, 0, Math.PI * 2); g.fill()
  }, [peaksData, dur, sel, cur])

  useEffect(() => { draw() }, [draw])
  useEffect(() => { const on = () => draw(); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [draw])

  useEffect(() => {
    let raf = 0
    const tick = () => { if (elRef.current) setCur(elRef.current.currentTime); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const toSeconds = (e) => {
    const r = wrapRef.current.getBoundingClientRect()
    return Math.min(dur, Math.max(0, ((e.clientX - r.left) / r.width) * dur))
  }
  const onDown = (e) => { const t = toSeconds(e); dragRef.current = t; setSel({ a: t, b: t }) }
  const onMove = (e) => { if (dragRef.current === null) return; const t = toSeconds(e); setSel({ a: dragRef.current, b: t }) }
  const onUp = () => {
    if (sel && Math.abs(sel.b - sel.a) > 0.01) {
      const a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b)
      setSel({ a, b })
      if (elRef.current) { elRef.current.currentTime = a; elRef.current.pause() }
    } else setSel(null)
    dragRef.current = null
  }

  /* ------------------------------------------------------------- player */
  const playUrl = useMemo(() => (clip ? URL.createObjectURL(encodeWav(clip.channels, clip.sampleRate)) : null), [clip])
  useEffect(() => () => { if (playUrl) URL.revokeObjectURL(playUrl) }, [playUrl])
  const toggle = () => { const el = elRef.current; if (!el) return; if (el.paused) el.play().catch(() => {}); else el.pause() }
  const playSelection = () => {
    const el = elRef.current
    if (!el || !sel) return toggle()
    el.currentTime = Math.min(sel.a, sel.b)
    el.play().catch(() => {})
    const stopAt = Math.max(sel.a, sel.b)
    const check = () => { if (el.currentTime >= stopAt) { el.pause(); el.removeEventListener('timeupdate', check) } }
    el.addEventListener('timeupdate', check)
  }

  const selSecs = sel ? Math.abs(sel.b - sel.a) : 0
  const st = clip ? audioStats(clip.channels) : null

  const exportWav = async (channels = clip.channels, name = `${baseName(clip.name)}-studio.wav`) => {
    setBusy('writing WAV')
    await download(encodeWav(channels, sr), name)
    recentAction('Exported audio from the studio')
    setBusy('')
    toast('WAV saved')
  }
  const exportM4a = async () => {
    setBusy('encoding .m4a')
    try {
      const { convertWithFFmpeg } = await import('../lib/ffmpeg.js')
      const wav = new File([encodeWav(clip.channels, sr)], 'studio.wav', { type: 'audio/wav' })
      const blob = await convertWithFFmpeg(wav, 'studio.m4a', ['-c:a', 'aac', '-b:a', '192k', '-vn'])
      await download(blob, `${baseName(clip.name)}.m4a`)
      recentAction('Exported audio as .m4a')
      toast('M4A saved · 192 kbps')
    } catch (e) { toast(`Encoder failed: ${e.message}`, 'err') }
    setBusy('')
  }

  return (
    <div className="space-y-6">
      <input ref={pickerRef} type="file" hidden multiple accept="audio/*,video/*" onChange={(e) => { addFiles([...e.target.files]); e.target.value = '' }} />
      {!clips.length ? (
        <Panel>
          <Drop onFiles={addFiles} multiple accept="audio/*,video/*" label="Drop audio or video" sub="MP3 · WAV · M4A · FLAC · OGG · MP4 · MKV — decoded right here" />
          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            {[['scalpel', 'Cut with your eyes', 'Drag a selection on the waveform; trim, cut, fade and normalise it.'],
              ['layers', 'Join clips', 'Stack several files into one track with an adjustable gap.'],
              ['download', 'Real files out', '16-bit WAV for editing, or .m4a at 192 kbps for sharing.']].map(([ic, t, d], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.08 * i }} className="rounded-2xl border border-line p-4" style={{ background: 'var(--surface)' }}>
                <div className="w-9 h-9 rounded-xl grid place-items-center mb-2" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n={ic} s={18} /></div>
                <div className="font-bold text-[13px]">{t}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{d}</div>
              </motion.div>
            ))}
          </div>
        </Panel>
      ) : (
        <>
          <Panel pad={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-line">
              <Btn small primary icon={playing ? 'pause' : 'play'} onClick={toggle}>{playing ? 'Pause' : 'Play'}</Btn>
              <Btn small icon="skipb" onClick={() => { if (elRef.current) elRef.current.currentTime = 0 }} title="Back to the start" />
              <div className="min-w-0">
                <div className="font-bold text-[13px] truncate">{clip.name}</div>
                <div className="mono text-[11.5px]" style={{ color: 'var(--muted)' }}>{fmtDur(cur)} / {fmtDur(dur)} · {clip.channels.length} ch · {(sr / 1000).toFixed(1)} kHz</div>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Chips value={sel ? 'sel' : 'all'} onChange={() => (sel ? playSelection() : toggle())} options={[['sel', sel ? `Play selection · ${fmtDur(selSecs)}` : 'Selection'], ['all', 'Whole clip']]} />
                <Btn small icon="plus" onClick={() => pickerRef.current?.click()}>Add</Btn>
                <Btn small icon="undo" onClick={undo} disabled={!hist.length} title="Undo" />
              </div>
            </div>
            <div ref={wrapRef} className="relative cursor-text select-none" style={{ height: H }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
              <canvas ref={cvRef} className="w-full block" style={{ height: H }} />
              {sel && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute bottom-2 left-1/2 -translate-x-1/2 mono text-[11px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,0,0,.62)', color: '#fff' }}>
                {fmtDur(Math.min(sel.a, sel.b))} → {fmtDur(Math.max(sel.a, sel.b))} · {fmtDur(selSecs)}
              </motion.div>}
            </div>
            <audio ref={elRef} src={playUrl} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
          </Panel>

          <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_340px] items-start">
            <Panel>
              <Label right={<span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{sel ? 'selection ready' : 'drag on the waveform to select'}</span>}>Edit</Label>
              <div className="flex flex-wrap gap-2">
                <Btn small icon="scalpel" disabled={!sel} onClick={() => apply((ch, r) => slice(ch, Math.min(sel.a, sel.b), Math.max(sel.a, sel.b), r), 'kept the selection')}>Keep only the selection</Btn>
                <Btn small icon="trash" disabled={!sel} onClick={() => apply((ch, r) => {
                  const a = Math.max(0, Math.min(sel.a, sel.b)), b = Math.max(a, Math.min(dur, Math.max(sel.a, sel.b)))
                  return concat([slice(ch, 0, a, r), slice(ch, b, dur, r)], r, 0)
                }, 'selection removed')}>Cut the selection</Btn>
                <Btn small icon="split" onClick={() => apply((ch, r) => slice(ch, Math.min(cur, dur), dur, r), 'trimmed up to the playhead')}>Trim before playhead</Btn>
                <Btn small icon="split" onClick={() => apply((ch, r) => slice(ch, 0, Math.max(0.02, Math.min(cur, dur)), r), 'trimmed after the playhead')}>Trim after playhead</Btn>
              </div>
              <div className="grid sm:grid-cols-2 gap-5 mt-5">
                <div className="space-y-4">
                  <Slider label="Gain" min={-24} max={24} step={0.5} value={gainDb} onChange={setGainDb} onReset={() => setGainDb(0)} fmt={(v) => `${v > 0 ? '+' : ''}${v} dB`} />
                  <Btn small icon="check" className="w-full" onClick={() => { apply((ch) => gain(ch, gainDb), `gain ${gainDb} dB`); setGainDb(0) }} disabled={!gainDb}>Apply gain</Btn>
                  <Slider label="Speed" min={0.25} max={4} step={0.05} value={speed} onChange={setSpeed} onReset={() => setSpeed(1)} fmt={(v) => `${v.toFixed(2)}×`} hint="also shifts pitch" />
                </div>
                <div className="space-y-4">
                  <Slider label="Fade in" min={0} max={3} step={0.05} value={fadeIn} onChange={setFadeIn} fmt={(v) => `${v.toFixed(2)} s`} />
                  <Slider label="Fade out" min={0} max={3} step={0.05} value={fadeOut} onChange={setFadeOut} fmt={(v) => `${v.toFixed(2)} s`} />
                  <Slider label="Gap between clips" min={0} max={2} step={0.05} value={gap} onChange={setGap} fmt={(v) => `${v.toFixed(2)} s`} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-5">
                <Btn small icon="check" onClick={() => apply((ch, r) => normalize(ch, 0.98), 'normalised')}>Normalise</Btn>
                <Btn small icon="flip" onClick={() => apply((ch) => reverse(ch), 'reversed')}>Reverse</Btn>
                <Btn small icon="wand" onClick={() => apply((ch) => fade(ch, sr, { in: fadeIn, out: fadeOut }), 'faded')}>Fade in / out</Btn>
                <Btn small icon="refresh" onClick={() => apply((ch) => resample(ch, speed), `speed ${speed}×`)} disabled={speed === 1}>Apply speed</Btn>
                <Btn small icon="layers" onClick={() => apply((ch, r) => concat(clips.map((c) => c.channels), r, gap), 'clips joined')} disabled={clips.length < 2}>Join all clips</Btn>
              </div>
              <div className="text-[12px] mt-4" style={{ color: 'var(--muted)' }}>
                Tip: <span className="font-semibold">Join all clips</span> merges every file in the tray below, in order, with {gap.toFixed(2)} s of silence between them.
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel delay={0.04}>
                <Label>Export</Label>
                <div className="space-y-2">
                  <Btn primary icon="download" className="w-full" disabled={!!busy} busy={busy === 'writing WAV'} onClick={() => exportWav()}>Save WAV (16-bit)</Btn>
                  <Btn icon="download" className="w-full" disabled={!!busy} onClick={exportM4a}>Save .m4a (192 kbps)</Btn>
                  <Btn icon="scalpel" className="w-full" disabled={!sel} onClick={() => exportWav(slice(clip.channels, Math.min(sel.a, sel.b), Math.max(sel.a, sel.b), sr), `${baseName(clip.name)}-cut.wav`)}>Save the selection</Btn>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Stat k="Peak" v={st ? `${(20 * Math.log10(st.peak || 0.0001)).toFixed(1)} dB` : '—'} />
                  <Stat k="RMS" v={st ? `${(20 * Math.log10(st.rms || 0.0001)).toFixed(1)} dB` : '—'} />
                </div>
              </Panel>

              <Panel delay={0.08}>
                <Label right={<span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{clips.length} clips</span>}>Tray</Label>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {clips.map((c) => (
                      <motion.div key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} transition={SPRING}
                        onClick={() => { setActive(c.id); peakRef.current = null }}
                        className="rounded-xl border px-3 py-2 cursor-pointer flex items-center gap-2" style={{ borderColor: c.id === active ? 'var(--copper)' : 'var(--border)', background: 'var(--surface)' }}>
                        <Ico n="wave" s={15} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-semibold truncate">{c.name}</div>
                          <div className="text-[11px] mono" style={{ color: 'var(--muted)' }}>{fmtDur(c.channels[0].length / c.sampleRate)} · {(c.sampleRate / 1000).toFixed(1)} kHz</div>
                        </div>
                        <button className="opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setClips((cs) => cs.filter((x) => x.id !== c.id)); if (active === c.id) setActive(null) }}><Ico n="x" s={13} /></button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
      <Toast msg={msg} />
    </div>
  )
}

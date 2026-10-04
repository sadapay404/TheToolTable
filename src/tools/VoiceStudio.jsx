// Tool 15 — Voice & Subtitle Studio. Subtitle editing that is actually timed against the audio:
// import/repair cue sheets, or let the waveform tell you where the speaking is.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { recentAction, download, fmtBytes, baseName, readFile, fmtTime } from '../lib/utils.js'
import { parseSubs, toSRT, toVTT, toTXT, toCSV, fmtStamp, shortStamp, parseStamp, tidyCues, shiftCues, anchorCues, scaleCues, splitCue, mergeCues, findReplace, stats, cueAt } from '../lib/subs.js'
import { decodeAudio, toMono, rmsFrames, speechSegments, peaks as makePeaks, encodeWav, slice as sliceAudio } from '../lib/audio.js'
import { Ico, Btn, Chips, Slider, Toggle, Panel, Label, Seg, Drop, Stat, Toast, useToast, SPRING, CopyBtn } from './kit.jsx'

const WAVE_H = 148

export default function VoiceStudio() {
  const [tab, setTab] = useState('subs')
  const [cues, setCues] = useState([])
  const [active, setActive] = useState(null)
  const [media, setMedia] = useState(null)          // { name, url, kind, size }
  const [audio, setAudio] = useState(null)          // { channels, sampleRate, duration, rms, frameMs }
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)                 // ms
  const [fps, setFps] = useState(0)
  const [find, setFind] = useState('')
  const [repl, setRepl] = useState('')
  const [shiftMs, setShiftMs] = useState(500)
  const [busy, setBusy] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [thresh, setThresh] = useState(-34)
  const [minSil, setMinSil] = useState(0.35)
  const [msg, toast] = useToast()
  const pickerRef = useRef(null)

  const elRef = useRef(null)
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const peakCache = useRef(null)

  /* ------------------------------------------------------------ loading */
  const loadSubs = useCallback((text, name = 'imported') => {
    const { cues: got, format } = parseSubs(text)
    if (!got.length) { toast(`${name}: no cues found in that file`, 'err'); return }
    setCues(tidyCues(got))
    setActive(got[0]?.id ?? null)
    recentAction(`Loaded ${got.length} cues from ${name}`)
    toast(`${got.length} cues · read as ${format.toUpperCase()}`)
  }, [toast])

  const addFiles = useCallback(async (files) => {
    for (const f of files) {
      if (/\.(srt|vtt|ass|ssa|txt)$/i.test(f.name)) { loadSubs(await f.text(), f.name); continue }
      setBusy('decoding audio')
      try {
        const dec = await decodeAudio(f)
        const url = URL.createObjectURL(f)
        const mono = toMono(dec.channels)
        setMedia({ name: f.name, url, kind: /^video|\.(mp4|mkv|mov|webm)$/i.test(f.type + f.name) ? 'video' : 'audio', size: f.size })
        setAudio({ channels: dec.channels, sampleRate: dec.sampleRate, duration: dec.duration, rms: rmsFrames(mono, dec.sampleRate, 20), frameMs: 20 })
        peakCache.current = null
        setTab('audio')
        recentAction(`Opened ${f.name} for subtitle work`)
        toast(`${fmtTime(dec.duration)} of audio ready`)
      } catch (e) { toast(`${f.name}: ${e.message}`, 'err') }
      setBusy('')
    }
  }, [loadSubs, toast])

  /* ------------------------------------------------------------ playback */
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    let raf = 0
    const tick = () => {
      if (elRef.current) { setCur(elRef.current.currentTime * 1000); if (elRef.current.paused !== !playing) setPlaying(!elRef.current.paused) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, media?.url])

  const toggle = () => {
    const el = elRef.current
    if (!el) return
    if (el.paused) el.play().catch((e) => toast(`Playback blocked: ${e.message}`, 'err'))
    else el.pause()
  }
  const seek = (ms) => { const el = elRef.current; if (!el) return; el.currentTime = Math.max(0, ms / 1000); setCur(Math.max(0, ms)) }
  const seekRel = (d) => seek(cur + d)

  const activeCueNow = useMemo(() => cueAt(cues, cur), [cues, cur])

  useEffect(() => {
    if (activeCueNow && activeCueNow.id !== active && tab === 'subs' && playing) setActive(activeCueNow.id)
  }, [activeCueNow, active, tab, playing])

  /* ------------------------------------------------------------ waveform */
  const peaksData = useMemo(() => {
    if (!audio) return null
    if (!peakCache.current) peakCache.current = makePeaks(toMono(audio.channels), 1600)
    return peakCache.current
  }, [audio])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !peaksData) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = wrapRef.current?.clientWidth || 900
    cv.width = w * dpr; cv.height = WAVE_H * dpr
    const g = cv.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, WAVE_H)
    const mid = WAVE_H / 2, half = WAVE_H / 2 - 8
    const dur = audio?.duration || 1
    const px = (ms) => (ms / 1000 / dur) * w

    // cue bands
    cues.forEach((c) => {
      const x0 = px(c.start), x1 = Math.max(x0 + 1, px(c.end))
      g.fillStyle = c.id === active ? 'rgba(200,121,65,.34)' : 'rgba(200,121,65,.15)'
      g.fillRect(x0, 0, x1 - x0, WAVE_H)
      g.fillStyle = c.id === active ? '#C87941' : 'rgba(200,121,65,.5)'
      g.fillRect(x0, 0, Math.max(1, x1 - x0), 3)
    })
    // speech shading
    const segs = speechSegments(audio.rms, audio.frameMs, { thresholdDb: thresh, minSilence: minSil })
    g.fillStyle = 'rgba(78,147,122,.10)'
    segs.forEach((s) => g.fillRect(px(s.start * 1000), 0, Math.max(1, px(s.end * 1000) - px(s.start * 1000)), WAVE_H))

    // waveform
    g.strokeStyle = 'var(--copper)'
    g.beginPath()
    peaksData.forEach((p, i) => {
      const x = (i / peaksData.length) * w
      g.moveTo(x, mid - p.max * half); g.lineTo(x, mid - p.min * half)
    })
    g.strokeStyle = '#C87941'
    g.lineWidth = 1
    g.stroke()
    g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.strokeStyle = 'rgba(0,0,0,.12)'; g.stroke()

    // playhead
    const x = px(cur)
    g.fillStyle = '#22201d'
    g.fillRect(x - 1, 0, 2, WAVE_H)
    g.beginPath(); g.arc(x, 6, 4.5, 0, Math.PI * 2); g.fill()
  }, [peaksData, cues, active, cur, audio, thresh, minSil])

  const onWave = (e) => {
    const r = wrapRef.current.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    seek(frac * (audio?.duration || 0) * 1000)
  }

  /* ------------------------------------------------------------ cue editing */
  const patch = (id, up) => setCues((cs) => cs.map((c) => (c.id === id ? { ...c, ...up } : c)))
  const addCue = (start = cur, end = cur + 2000) => {
    const id = Math.max(0, ...cues.map((c) => c.id || 0)) + 1
    setCues((cs) => tidyCues([...cs, { id, start, end, text: '' }]))
    setActive(id)
  }
  const autoTime = () => {
    if (!audio) return toast('Load the audio first — timing needs a waveform', 'err')
    const segs = speechSegments(audio.rms, audio.frameMs, { thresholdDb: thresh, minSilence: minSil })
    if (!segs.length) return toast('No speech found — try moving the threshold', 'err')
    const texts = tidyCues(cues).map((c) => c.text)
    const out = segs.map((s, i) => ({ id: i + 1, start: s.start * 1000, end: s.end * 1000, text: texts[i] ?? '' }))
    setCues(tidyCues(out))
    recentAction(`Timed ${out.length} cues from the waveform`)
    toast(`${out.length} cues${texts.length ? ` · ${Math.min(texts.length, out.length)} kept their text` : ''}`)
  }
  const exportAs = async (fmt) => {
    if (!cues.length) return toast('Nothing to export yet', 'err')
    const name = `${baseName(media?.name || 'subtitles')}`
    const [body, ext, type] = fmt === 'srt' ? [toSRT(cues), 'srt', 'application/x-subrip']
      : fmt === 'vtt' ? [toVTT(cues), 'vtt', 'text/vtt']
      : fmt === 'csv' ? [toCSV(cues), 'csv', 'text/csv']
      : [toTXT(cues), 'txt', 'text/plain']
    await download(new Blob([body], { type }), `${name}.${ext}`)
    recentAction(`Exported subtitles as .${ext}`)
    toast(`${ext.toUpperCase()} saved`)
  }

  const st = stats(cues)
  const dur = audio?.duration || 0

  return (
    <div className="space-y-6">
      <input ref={pickerRef} type="file" hidden multiple accept="audio/*,video/*,.srt,.vtt,.ass,.ssa,.txt" onChange={(e) => { addFiles([...e.target.files]); e.target.value = '' }} />
      <div className="flex flex-wrap items-center gap-2">
        <Seg value={tab} onChange={setTab} options={[['subs', 'Subtitles'], ['audio', 'Voice & timing'], ['transcribe', 'Speech to text']]} />
        <div className="ml-auto flex items-center gap-2">
          <Btn small icon="book" onClick={() => setPasteOpen((o) => !o)}>Paste subtitles</Btn>
          <Btn small icon="plus" onClick={() => pickerRef.current?.click()}>Open</Btn>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {pasteOpen && (
          <motion.div key="paste" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={SPRING} className="overflow-hidden">
            <Panel>
              <Label right={<span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>SRT · VTT · ASS · plain lines</span>}>Paste a subtitle file</Label>
              <textarea className="input w-full h-32 mono text-[12px]" placeholder={'1\n00:00:01,000 --> 00:00:04,000\nHello there'} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
              <div className="flex gap-2 mt-3">
                <Btn primary small icon="check" onClick={() => { loadSubs(pasteText, 'pasted text'); setPasteText(''); setPasteOpen(false) }}>Read it</Btn>
                <Btn small icon="x" onClick={() => setPasteOpen(false)}>Cancel</Btn>
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {!media && !cues.length && (
        <Panel>
          <Drop onFiles={addFiles} multiple accept="audio/*,video/*,.srt,.vtt,.ass,.ssa,.txt" label="Drop audio, video or a subtitle file" sub="The audio gives you a waveform to time against; subtitles can come in on their own" />
          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            {[['captions', 'Repair cue sheets', 'Shift, stretch, re-anchor, split, merge, find & replace.'],
              ['wave', 'See the speech', 'Silence detection turns a waveform into properly timed cues.'],
              ['lock', 'Nothing uploaded', 'Audio is decoded in this tab; the engine is on your disk.']].map(([ic, t, d], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.08 * i }} className="rounded-2xl border border-line p-4" style={{ background: 'var(--surface)' }}>
                <div className="w-9 h-9 rounded-xl grid place-items-center mb-2" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n={ic} s={18} /></div>
                <div className="font-bold text-[13px]">{t}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{d}</div>
              </motion.div>
            ))}
          </div>
        </Panel>
      )}

      {(media || cues.length) ? (
        <>
          {media && (
            <Panel pad={false} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-line">
                <Btn small icon={playing ? 'pause' : 'play'} onClick={toggle} primary>{playing ? 'Pause' : 'Play'}</Btn>
                <Btn small icon="skipb" onClick={() => seekRel(-5000)} title="Back 5 s" />
                <Btn small icon="skipf" onClick={() => seekRel(5000)} title="Forward 5 s" />
                <div className="font-bold text-[13px]">{media.kind === 'video' ? '🎬' : '🎵'} {media.name}</div>
                <div className="mono text-[12px]" style={{ color: 'var(--muted)' }}>{shortStamp(cur)} / {shortStamp(dur * 1000)}</div>
                <div className="ml-auto flex items-center gap-2">
                  <Chips value={playing ? 'on' : 'off'} onChange={() => toggle()} options={[['on', 'Playing'], ['off', 'Paused']]} />
                  <Btn small icon="clock" onClick={autoTime} title="Detect speech and lay cues over it">Auto-time</Btn>
                  <Btn small icon="plus" onClick={() => addCue()} title="New cue at the playhead">Cue</Btn>
                </div>
              </div>
              <div ref={wrapRef} className="relative cursor-crosshair select-none" onClick={onWave} style={{ height: WAVE_H }}>
                <canvas ref={canvasRef} className="w-full block" style={{ height: WAVE_H }} />
                <div className="absolute left-3 bottom-2 text-[10.5px] mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,.55)', color: '#fff' }}>{audio ? `${audio.sampleRate / 1000} kHz · ${audio.channels.length} ch` : ''}</div>
              </div>
              <audio ref={elRef} src={media.url} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
              {audio && (
                <div className="grid sm:grid-cols-3 gap-4 px-5 py-4 border-t border-line">
                  <Slider label="Speech threshold" min={-60} max={-12} step={1} value={thresh} onChange={setThresh} fmt={(v) => `${v} dB`} hint="relative to the loudest moment" />
                  <Slider label="Ignore gaps under" min={0.1} max={1.5} step={0.05} value={minSil} onChange={setMinSil} fmt={(v) => `${v.toFixed(2)} s`} />
                  <div className="text-[12px] self-center" style={{ color: 'var(--muted)' }}>{speechSegments(audio.rms, audio.frameMs, { thresholdDb: thresh, minSilence: minSil }).length} speech stretches found</div>
                </div>
              )}
            </Panel>
          )}

          {tab === 'subs' && (
            <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_330px] items-start">
              <Panel pad={false}>
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-line">
                  <span className="eyebrow">Cues</span>
                  <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{st.cues} · {st.words} words · {st.cps} chars/s</span>
                  <div className="ml-auto flex gap-1.5">
                    <Btn small icon="plus" onClick={() => addCue()} />
                    <Btn small icon="sort" onClick={() => { setCues(tidyCues(cues)); toast('Tidied: sorted, gaps closed, durations fixed') }} title="Tidy up" />
                  </div>
                </div>
                <div className="max-h-[56vh] overflow-auto divide-y" style={{ borderColor: 'var(--border)' }}>
                  <AnimatePresence initial={false}>
                    {cues.map((c, i) => {
                      const on = c.id === active
                      return (
                        <motion.div key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24 }} transition={SPRING}
                          className="px-4 py-3" style={{ background: on ? 'var(--surface2)' : 'transparent' }} onClick={() => { setActive(c.id); if (media) seek(c.start) }}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="mono text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>{i + 1}</span>
                            <input className="mono text-[11.5px] input !py-1 !px-2 w-[104px]" value={fmtStamp(c.start)} onChange={(e) => patch(c.id, { start: Math.max(0, parseStamp(e.target.value) || 0) })} onClick={(e) => e.stopPropagation()} />
                            <span style={{ color: 'var(--muted)' }}>→</span>
                            <input className="mono text-[11.5px] input !py-1 !px-2 w-[104px]" value={fmtStamp(c.end)} onChange={(e) => patch(c.id, { end: Math.max(0, parseStamp(e.target.value) || 0) })} />
                            <span className="text-[11.5px] mono" style={{ color: 'var(--muted)' }}>{((c.end - c.start) / 1000).toFixed(1)}s</span>
                            <div className="ml-auto flex items-center gap-1">
                              <button className="opacity-60 hover:opacity-100" title="Set start to playhead" onClick={(e) => { e.stopPropagation(); patch(c.id, { start: Math.round(cur) }) }}><Ico n="arrowr" s={13} /></button>
                              <button className="opacity-60 hover:opacity-100" title="Set end to playhead" onClick={(e) => { e.stopPropagation(); patch(c.id, { end: Math.max(Math.round(cur), c.start + 200) }) }}><Ico n="arrowl" s={13} /></button>
                              <button className="opacity-60 hover:opacity-100" title="Split at playhead" onClick={(e) => { e.stopPropagation(); if (cur <= c.start + 60 || cur >= c.end - 60) return toast('Move the playhead inside the cue first', 'err'); setCues((cs) => cs.flatMap((x) => (x.id === c.id ? splitCue(x, Math.round(cur)) .map((y, k) => ({ ...y, id: c.id * 100 + k })) : [x]))) }}><Ico n="split" s={13} /></button>
                              <button className="opacity-60 hover:opacity-100" title="Merge with the next cue" onClick={(e) => { e.stopPropagation(); setCues((cs) => { const j = cs.findIndex((x) => x.id === c.id); if (j < 0 || j >= cs.length - 1) return cs; const merged = mergeCues(cs[j], cs[j + 1]); return tidyCues([...cs.slice(0, j), merged, ...cs.slice(j + 2)]) }) }}><Ico n="merge" s={13} /></button>
                              <button className="opacity-60 hover:opacity-100" title="Delete" onClick={(e) => { e.stopPropagation(); setCues((cs) => cs.filter((x) => x.id !== c.id)) }}><Ico n="trash" s={13} /></button>
                            </div>
                          </div>
                          <textarea className="input w-full text-[13px] leading-snug" rows={2} value={c.text}
                            onChange={(e) => patch(c.id, { text: e.target.value })} onFocus={() => { setActive(c.id); if (media) seek(c.start) }} />
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
                {!cues.length && <div className="p-8 text-center text-[13px]" style={{ color: 'var(--muted)' }}>No cues yet — paste a subtitle file, or press “Cue” to start one by hand.</div>}
              </Panel>

              <div className="space-y-4">
                <Panel>
                  <Label>Timing</Label>
                  <div className="flex items-center gap-2 mb-3">
                    <input className="input w-[92px]" type="number" value={shiftMs} onChange={(e) => setShiftMs(+e.target.value)} />
                    <span className="text-[12px]" style={{ color: 'var(--muted)' }}>ms</span>
                    <Btn small icon="arrowr" onClick={() => setCues((cs) => tidyCues(shiftCues(cs, Math.abs(shiftMs))))}>Later</Btn>
                    <Btn small icon="arrowl" onClick={() => setCues((cs) => tidyCues(shiftCues(cs, -Math.abs(shiftMs))))}>Earlier</Btn>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Btn small icon="clock" onClick={() => { setCues((cs) => tidyCues(anchorCues(cs, 0))); toast('First cue anchored to 0:00') }}>Start at 0</Btn>
                    <Btn small icon="clock" onClick={() => { setCues((cs) => tidyCues(anchorCues(cs, Math.round(cur)))); toast(`First cue anchored to the playhead`) }}>Start at playhead</Btn>
                  </div>
                  <div className="mt-4">
                    <Slider label="Stretch to fit" min={0.9} max={1.1} step={0.001} value={fps || 1} onChange={setFps} onReset={() => setFps(0)} fmt={(v) => `${v.toFixed(3)}×`} hint="for 23.976 ⇄ 25 fps drift" />
                    {(fps || 0) !== 0 && fps !== 1 && <Btn small icon="check" className="w-full mt-2" onClick={() => { setCues((cs) => tidyCues(scaleCues(cs, fps))); setFps(0); toast('Re-timed') }}>Apply stretch</Btn>}
                  </div>
                </Panel>

                <Panel delay={0.05}>
                  <Label>Find & replace</Label>
                  <input className="input w-full mb-2" placeholder="Find" value={find} onChange={(e) => setFind(e.target.value)} />
                  <input className="input w-full" placeholder="Replace with" value={repl} onChange={(e) => setRepl(e.target.value)} />
                  <Btn small icon="swap" className="w-full mt-3" onClick={() => { setCues((cs) => findReplace(cs, find, repl)); toast(`Replaced “${find}”`) }} disabled={!find}>Replace in all cues</Btn>
                </Panel>

                <Panel delay={0.1}>
                  <Label>Export</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Btn small icon="download" onClick={() => exportAs('srt')}>SRT</Btn>
                    <Btn small icon="download" onClick={() => exportAs('vtt')}>VTT</Btn>
                    <Btn small icon="download" onClick={() => exportAs('txt')}>Plain text</Btn>
                    <Btn small icon="download" onClick={() => exportAs('csv')}>CSV</Btn>
                  </div>
                  {audio && (
                    <Btn small icon="wave" className="w-full mt-3" disabled={!!busy} onClick={async () => {
                      const sel = sliceAudio(audio.channels, 0, dur, audio.sampleRate)
                      setBusy('writing WAV')
                      await download(encodeWav(sel, audio.sampleRate), `${baseName(media.name)}-audio.wav`)
                      setBusy('')
                      toast('Audio saved as WAV')
                    }}>Save the audio as WAV</Btn>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {tab === 'audio' && (
            <Panel>
              <Label>Timing from the waveform</Label>
              <div className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--muted)' }}>
                Green bands are the stretches the detector hears as speech. Tune the two sliders above until they
                line up with what you hear, then let “Auto-time” lay cues over them — if you already have the text,
                your lines are kept in order and only the timing changes.
              </div>
              <div className="flex flex-wrap gap-3">
                <Btn primary icon="clock" onClick={autoTime}>Auto-time {cues.length ? `${cues.length} lines` : 'cues'}</Btn>
                <Btn icon="plus" onClick={() => addCue()}>Add a cue at the playhead</Btn>
                <Btn icon="wave" onClick={() => { setCues([]); toast('Cues cleared') }}>Clear cues</Btn>
              </div>
            </Panel>
          )}

          {tab === 'transcribe' && (
            <Panel>
              <Label>Speech to text</Label>
              <div className="rounded-2xl border border-line p-5 flex flex-wrap items-center gap-4" style={{ background: 'var(--surface2)' }}>
                <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: 'var(--surface)', color: 'var(--copper)' }}><Ico n="wand" s={20} /></div>
                <div className="min-w-[220px] flex-1">
                  <div className="display font-semibold text-[15px]">Whisper is not wired up yet</div>
                  <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    The plan: a small Whisper model runs through <span className="mono">onnxruntime-web</span> (already used by the
                    AI Background Remover) on a 16 kHz mono copy of your audio — downloaded once, then offline. Until that
                    lands, this tab is honest about it: use <span className="font-semibold">Voice &amp; timing</span> to get the cue
                    timings right, and drop your text in by hand or paste a transcript into the Subtitles tab.
                  </div>
                </div>
                <Btn icon="mic" onClick={() => setTab('audio')}>Go to timing</Btn>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <Stat k="Engine" v="onnxruntime-web ✓" />
                <Stat k="Model" v="whisper-small · to fetch" />
                <Stat k="Audio path" v="16 kHz mono · ready" />
              </div>
            </Panel>
          )}
        </>
      ) : null}
      <Toast msg={msg} />
    </div>
  )
}

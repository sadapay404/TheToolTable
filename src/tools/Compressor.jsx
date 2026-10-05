import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dropzone, Note, AnimatedNumber, LiveProgress } from '../components/ui.jsx'
import { buildCompressionPlan, encodeToTargetSize, mediaKind } from '../lib/compressor.js'
import { fmtBytes, fmtTime, download, baseName, recentAction, clamp } from '../lib/utils.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }
const MIN_MB = 1, MAX_MB = 200

/* ---------------- circular budget dial ---------------- */
function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

function Dial({ value, onChange, disabled }) {
  const ref = useRef(null)
  const SWEEP = 270, START = -135
  const t = (value - MIN_MB) / (MAX_MB - MIN_MB)
  const angle = START + t * SWEEP

  function setFromPointer(e) {
    const r = ref.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI // 0 at top, cw positive
    deg = clamp(deg, START, START + SWEEP)
    onChange(Math.round(MIN_MB + ((deg - START) / SWEEP) * (MAX_MB - MIN_MB)))
  }

  const [kx, ky] = polar(110, 110, 86, angle)

  return (
    <div className="relative select-none" style={{ touchAction: 'none' }}>
      <svg
        ref={ref} viewBox="0 0 220 220" className="w-full max-w-[260px] mx-auto cursor-grab active:cursor-grabbing block"
        onPointerDown={(e) => { if (disabled) return; e.target.setPointerCapture(e.pointerId); setFromPointer(e) }}
        onPointerMove={(e) => { if (!disabled && e.buttons) setFromPointer(e) }}
        onWheel={(e) => { if (!disabled) onChange(clamp(value + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1), MIN_MB, MAX_MB)) }}
      >
        <path d={arcPath(110, 110, 86, START, START + SWEEP)} fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
        <motion.path
          d={arcPath(110, 110, 86, START, Math.max(START + 0.5, angle))}
          fill="none" stroke="var(--copper)" strokeWidth="10" strokeLinecap="round"
          initial={false}
          animate={{ d: arcPath(110, 110, 86, START, Math.max(START + 0.5, angle)) }}
          transition={SPRING}
          style={{ filter: 'drop-shadow(0 0 6px var(--glow))' }}
        />
        {/* ticks */}
        {Array.from({ length: 28 }).map((_, i) => {
          const a = START + (i / 27) * SWEEP
          const [x0, y0] = polar(110, 110, 100, a)
          const [x1, y1] = polar(110, 110, i % 9 === 0 ? 92 : 96, a)
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--muted)" strokeWidth={i % 9 === 0 ? 2 : 1} opacity="0.5" />
        })}
        <motion.circle
          cx={kx} cy={ky} r="11" fill="var(--surface)" stroke="var(--copper)" strokeWidth="3"
          initial={false} animate={{ cx: kx, cy: ky }} transition={SPRING}
          style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <div className="text-center">
          <AnimatedNumber value={value} className="display font-semibold text-[44px] leading-none tabular-nums" />
          <div className="eyebrow mt-1.5">MB target</div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- segmented control with sliding pill ---------------- */
function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className="flex rounded-xl border border-line p-1 gap-1" style={{ background: 'var(--surface2)' }}>
      {options.map(([v, l]) => (
        <button
          key={v}
          disabled={disabled}
          className="relative flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-colors"
          style={{ color: value === v ? 'var(--bg)' : 'var(--muted)' }}
          onClick={() => onChange(v)}
        >
          {value === v && (
            <motion.span layoutId="seg-pill" className="absolute inset-0 rounded-lg" style={{ background: 'var(--ink)' }} transition={SPRING} />
          )}
          <span className="relative z-10">{l}</span>
        </button>
      ))}
    </div>
  )
}

function probeMediaFile(file, kind) {
  const url = URL.createObjectURL(file)
  const element = document.createElement(kind === 'audio' ? 'audio' : 'video')
  element.preload = 'metadata'
  let settle
  const promise = new Promise((resolve) => {
    let done = false
    const cleanup = () => {
      element.removeEventListener('loadedmetadata', onMetadata)
      element.removeEventListener('error', onError)
      try { element.removeAttribute('src'); element.load() } catch {}
      URL.revokeObjectURL(url)
    }
    const finish = (result) => {
      if (done) return
      done = true
      cleanup()
      resolve(result)
    }
    const onMetadata = () => {
      const duration = Number(element.duration)
      const w = kind === 'video' ? Number(element.videoWidth) : null
      const h = kind === 'video' ? Number(element.videoHeight) : null
      if (!Number.isFinite(duration) || duration <= 0 || (kind === 'video' && (!w || !h))) {
        finish({ error: 'Could not read valid duration or dimensions from this media file.' })
      } else finish({ duration, w, h })
    }
    const onError = () => finish({ error: 'The browser could not read this file’s media metadata.' })
    settle = finish
    element.addEventListener('loadedmetadata', onMetadata)
    element.addEventListener('error', onError)
    element.src = url
  })
  return { promise, cancel: () => settle?.(null) }
}

export default function Compressor() {
  const [file, setFile] = useState(null)
  const [kind, setKind] = useState(null)
  const [duration, setDuration] = useState(NaN)
  const [dims, setDims] = useState(null)
  const [targetMB, setTargetMB] = useState(25)
  const [audioKbps, setAudioKbps] = useState(128)
  const [includeAudio, setIncludeAudio] = useState(true)
  const [scale, setScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [prog, setProg] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const probeRef = useRef(null)
  const loadSeq = useRef(0)

  useEffect(() => {
    if (!busy) return
    const t0 = Date.now()
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 250)
    return () => clearInterval(id)
  }, [busy])

  useEffect(() => () => {
    loadSeq.current += 1
    probeRef.current?.()
    probeRef.current = null
  }, [])

  async function load(files) {
    const f = files?.[0]
    if (!f) return
    const seq = ++loadSeq.current
    probeRef.current?.(); probeRef.current = null
    const mediaType = mediaKind(f)
    if (!mediaType) {
      setFile(null); setKind(null); setDuration(NaN); setDims(null); setLoading(false)
      setError('Choose a supported audio or video file.')
      return
    }

    setFile(f); setKind(mediaType); setDuration(NaN); setDims(null)
    setIncludeAudio(true)
    setResult(null); setError(''); setProg(0); setLoading(true)
    try {
      const probe = probeMediaFile(f, mediaType)
      probeRef.current = probe.cancel
      const info = await probe.promise
      if (seq !== loadSeq.current) return
      if (!info) return
      if (info.error) { setError(info.error); return }
      setDuration(info.duration)
      setDims(mediaType === 'video' ? { w: info.w, h: info.h } : null)
    } catch (e) {
      if (seq === loadSeq.current) setError('Could not inspect this file: ' + String(e?.message || e).slice(0, 180))
    } finally {
      if (seq === loadSeq.current) {
        probeRef.current = null
        setLoading(false)
      }
    }
  }

  function changeFile() {
    if (busy) return
    loadSeq.current += 1
    probeRef.current?.(); probeRef.current = null
    setFile(null); setKind(null); setDuration(NaN); setDims(null)
    setIncludeAudio(true)
    setResult(null); setError(''); setProg(0); setLoading(false)
  }

  const plan = useMemo(() => {
    if (!file || !kind) return null
    return buildCompressionPlan({ kind, duration, targetMB, audioKbps: kind === 'video' && !includeAudio ? 0 : audioKbps })
  }, [file, kind, duration, targetMB, audioKbps, includeAudio])

  async function compress() {
    if (!plan || !plan.fits || loading) {
      setError(kind === 'audio'
        ? 'The target is too small for this audio duration. Raise the target size or lower the audio bitrate cap.'
        : 'The target leaves too little bitrate for this video. Raise the target, turn off audio for a silent source, lower the audio bitrate, or scale the resolution down.')
      return
    }
    setBusy(true); setProg(0); setElapsed(0); setError(''); setResult(null)
    const target = targetMB
    try {
      const encoded = await encodeToTargetSize(file, plan, { scale, onProgress: setProg })
      const name = `${baseName(file.name)}-${target}mb.${encoded.ext}`
      const next = { ...encoded, name, targetMB: target, size: encoded.blob.size }
      setResult(next)
      // Keep an explicit save action in the result panel in case the browser blocks this automatic download.
      download(encoded.blob, name)
      recentAction(`Compressed ${file.name} into a ${target} MB budget`)
    } catch (e) {
      setError('Encode failed: ' + String(e?.message || e).slice(0, 220))
    } finally { setBusy(false) }
  }

  const saveResult = () => { if (result?.blob) download(result.blob, result.name) }
  const savedPct = result && file?.size ? Math.max(0, Math.round((1 - result.size / file.size) * 100)) : 0
  const allocatedOther = plan ? Math.max(0, plan.targetBytes - plan.audioBytes - (plan.kind === 'video' ? plan.videoBytes : plan.overhead)) : 0
  const allocations = plan && (plan.kind === 'video'
    ? [['Video', plan.videoBytes], [plan.audioKbps > 0 ? 'Audio reserve' : 'Audio off', plan.audioBytes], ['Container / margin', allocatedOther]]
    : [['Audio', plan.audioBytes], ['Container reserve', plan.overhead], ['Unused budget', Math.max(0, plan.targetBytes - plan.audioBytes - plan.overhead)]])

  return (
    <div className="space-y-6">
      {!file ? (
        <>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
            <Dropzone onFiles={load} accept="video/*,audio/*" label="Drop a video or audio file" sub="The only tool allowed to compress — and only when you ask" />
          </motion.div>
          {error && <Note tone="warn">{error}</Note>}
        </>
      ) : (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* -------- left: source + dial + levers -------- */}
          <div className="space-y-6 min-w-0">
            <motion.div className="card p-5 flex items-center gap-4 flex-wrap" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
              <motion.span
                className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                style={{ background: 'color-mix(in srgb, var(--copper) 14%, transparent)', color: 'var(--copper)' }}
                animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 9h16M4 15h16M9 4v16M15 4v16" opacity=".55" /><path d="M4 4h16v16H4z" /></svg>
              </motion.span>
              <div className="flex-1 min-w-0">
                <div className="display font-semibold text-[17px] truncate">{file.name}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>
                  {loading ? 'Reading media metadata…' : Number.isFinite(duration) ? fmtTime(duration) : 'Duration unavailable'} {dims && `· ${dims.w}×${dims.h}`} · {kind === 'audio' ? 'audio' : 'video'} · source <AnimatedNumber value={file.size} format={(n) => fmtBytes(n)} className="font-semibold" />
                </div>
              </div>
              <button className="btn" disabled={busy} onClick={changeFile}>Change file</button>
              {error && <div className="basis-full"><Note tone="warn">{error}</Note></div>}
            </motion.div>

            <motion.div className="card p-7" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.06 }}>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="display font-semibold text-[18px]">Byte budget</h3>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>drag the dial · scroll to nudge</span>
              </div>
              <Dial value={targetMB} onChange={(v) => !busy && setTargetMB(v)} disabled={busy} />
              <div className="flex justify-center gap-2 mt-5 flex-wrap">
                {[8, 25, 50, 100, 200].map((m) => (
                  <motion.button key={m} className="chip" data-on={targetMB === m} whileTap={{ scale: 0.88 }} onClick={() => !busy && setTargetMB(m)}>{m} MB</motion.button>
                ))}
              </div>
            </motion.div>

            <motion.div className="card p-7 grid sm:grid-cols-2 gap-7" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.12 }}>
              <div className="space-y-3">
                {kind === 'video' && (
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" style={{ accentColor: 'var(--copper)' }} checked={includeAudio} disabled={busy || loading} onChange={(e) => setIncludeAudio(e.target.checked)} />
                    <span>
                      <span className="label block">Include audio if available</span>
                      <span className="block text-[11px] leading-relaxed mt-1" style={{ color: 'var(--muted)' }}>Turn off for silent sources to give the full target budget to video. The output will be silent.</span>
                    </span>
                  </label>
                )}
                <div>
                  <div className="flex justify-between mb-2 gap-2">
                    <span className="label">Audio bitrate cap</span>
                    <span className="text-[12px] font-bold tabular-nums shrink-0" style={{ color: 'var(--copper)' }}>{kind === 'video' && !includeAudio ? 'Off' : `${audioKbps} kbps`}</span>
                  </div>
                  <input type="range" className="w-full" min="64" max="320" step="32" value={audioKbps} disabled={busy || loading || (kind === 'video' && !includeAudio)} onChange={(e) => setAudioKbps(+e.target.value)} />
                  <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--muted)' }}><span>64</span><span>320</span></div>
                </div>
              </div>
              {kind === 'video' && <div>
                <div className="label mb-2">Resolution scale</div>
                <Segmented disabled={busy} options={[[1, '100%'], [0.75, '75%'], [0.5, '50%'], [0.25, '25%']]} value={scale} onChange={setScale} />
              </div>}
            </motion.div>

            {plan && (
              <motion.div className="card p-7" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.18 }}>
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="display font-semibold text-[18px]">Budget allocation</h3>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>{kind === 'video' ? 'target bitrate budget' : 'audio bitrate within target'}</span>
                </div>
                <div className="flex h-4 rounded-full overflow-hidden border border-line" style={{ background: 'var(--surface2)' }}>
                  <motion.div initial={false} animate={{ width: `${clamp(((kind === 'video' ? plan.videoBytes : plan.audioBytes) / plan.targetBytes) * 100, 0, 100)}%` }} transition={SPRING} style={{ background: 'var(--copper)' }} />
                  <motion.div initial={false} animate={{ width: `${clamp(((kind === 'video' ? plan.audioBytes : plan.overhead) / plan.targetBytes) * 100, 0, 100)}%` }} transition={SPRING} style={{ background: 'color-mix(in srgb, var(--copper) 45%, var(--surface))' }} />
                  <motion.div initial={false} animate={{ width: `${clamp((allocatedOther / plan.targetBytes) * 100, 0, 100)}%` }} transition={SPRING} style={{ background: 'var(--border)' }} />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                  {allocations.map(([l, b]) => (
                    <div key={l}>
                      <div className="label">{l}</div>
                      <AnimatedNumber value={b} format={(n) => fmtBytes(n)} className="block font-bold text-[14px] mt-1 tabular-nums" />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* -------- right: plan + encode + result -------- */}
          <div className="space-y-5 lg:sticky lg:top-24">
            <motion.div className="card p-6 space-y-4" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.1 }}>
              <h3 className="display font-semibold text-[18px]">The plan</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line p-3" style={{ background: 'var(--surface2)' }}>
                  <div className="label">{kind === 'audio' ? 'Audio bitrate' : 'Video bitrate'}</div>
                  <div className="font-bold text-[17px] mt-1 tabular-nums"><AnimatedNumber value={plan ? (kind === 'audio' ? plan.audioKbps : plan.videoKbps) : 0} /> <span className="text-[11px]" style={{ color: 'var(--muted)' }}>kbps</span></div>
                </div>
                <div className="rounded-xl border border-line p-3" style={{ background: 'var(--surface2)' }}>
                  <div className="label">Est. output</div>
                  <div className="font-bold text-[17px] mt-1 tabular-nums"><AnimatedNumber value={plan?.estimatedBytes || 0} format={(n) => fmtBytes(n)} /></div>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {plan && (
                  <motion.div key={plan.fits ? 'ok' : 'no'} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={SPRING}
                    className="flex items-center gap-2.5 rounded-xl px-4 py-3 border text-[13px] font-semibold"
                    style={plan.fits
                      ? { background: 'color-mix(in srgb, #4E937A 12%, var(--surface))', borderColor: 'color-mix(in srgb, #4E937A 40%, transparent)' }
                      : { background: 'color-mix(in srgb, #E8A33D 12%, var(--surface))', borderColor: 'color-mix(in srgb, #E8A33D 40%, transparent)' }}>
                    <motion.svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={plan.fits ? '#4E937A' : '#E8A33D'} strokeWidth="2.4" strokeLinecap="round" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING}>
                      {plan.fits ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 8v5m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />}
                    </motion.svg>
                    {plan.fits ? 'Fits the budget' : 'Over budget — adjust levers'}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                className="btn btn-primary btn-sheen w-full py-3.5 text-[15px]"
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.96, y: 1 }}
                onClick={compress} disabled={busy || !plan}
              >
                {busy ? 'Encoding…' : 'Compress to target'}
              </motion.button>
              {error && <Note tone="warn">{error}</Note>}
            </motion.div>

            <AnimatePresence>
              {busy && (
                <motion.div className="card p-6" initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.97 }} transition={SPRING}>
                  <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 shrink-0">
                      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="6" />
                        <motion.circle cx="32" cy="32" r="26" fill="none" stroke="var(--copper)" strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 26} animate={{ strokeDashoffset: 2 * Math.PI * 26 * (1 - prog / 100) }} transition={{ ease: 'easeOut', duration: 0.3 }} />
                      </svg>
                      <div className="absolute inset-0 grid place-items-center text-[11px] font-bold tabular-nums"><AnimatedNumber value={prog} />%</div>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-[14px]">{kind === 'video' ? 'Two-pass H.264 encode' : 'AAC audio encode'}</div>
                      <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{kind === 'video' ? (includeAudio ? 'H.264 · AAC when source audio exists' : 'H.264 · audio omitted') : 'AAC in an M4A container'} · {fmtTime(elapsed)} elapsed</div>
                      <div className="mt-3"><LiveProgress value={prog} /></div>
                    </div>
                  </div>
                </motion.div>
              )}

              {result && !busy && (
                <motion.div className="card p-6 space-y-4" initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING}>
                  <div className="flex items-center justify-between">
                    <h3 className="display font-semibold text-[18px]">Result</h3>
                    <motion.span
                      className="display font-semibold text-[15px] px-3 py-1 rounded-full"
                      style={{ background: 'color-mix(in srgb, #4E937A 15%, var(--surface))', color: '#4E937A', border: '1px solid color-mix(in srgb, #4E937A 40%, transparent)' }}
                      initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...SPRING, delay: 0.15 }}
                    >−{savedPct}%</motion.span>
                  </div>
                  {[['Source', file.size, 'var(--muted)'], ['Compressed', result.size, 'var(--copper)']].map(([l, b, c], i) => (
                    <div key={l}>
                      <div className="flex justify-between text-[11px] font-semibold mb-1" style={{ color: 'var(--muted)' }}>
                        <span>{l}</span><span className="tabular-nums">{fmtBytes(b)}</span>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                        <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${clamp((b / file.size) * 100, 0, 100)}%` }} transition={{ ...SPRING, delay: 0.1 + i * 0.12 }} style={{ background: c }} />
                      </div>
                    </div>
                  ))}
                  <div className="text-[12px]" style={{ color: 'var(--muted)' }}>Ready as {result.name} · target {result.targetMB} MB.</div>
                  <button className="btn btn-primary w-full" onClick={saveResult}>Download again</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}

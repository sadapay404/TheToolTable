import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnimatedNumber, LiveProgress, Note } from '../components/ui.jsx'
import RangeTrack, { TimeField, clock } from '../components/RangeTrack.jsx'
import { fmtBytes, recentAction } from '../lib/utils.js'
import { useDecorativeMotion } from '../lib/motion.js'
import { engine, getBase, isAndroidPlatform, isAndroidTauri, setBase as persistEngineBase } from '../lib/engine.js'
import { isPlaylistUrl } from '../lib/ytdlp-core.js'
import { beginBackgroundTransfer, createTransferNotifier } from '../lib/backgroundTransfers.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

/* ---------------------------------- tiny UI atoms ---------------------------------- */

function Seg({ id, options, value, onChange, disabled }) {
  return (
    <div className="flex rounded-xl border border-line p-1 gap-1 flex-wrap" style={{ background: 'var(--surface2)' }}>
      {options.map(([v, l, sub]) => (
        <button
          key={String(v)} disabled={disabled} onClick={() => onChange(v)}
          className="relative flex-1 min-w-[64px] rounded-full px-3 py-2 text-[12px] sm:text-[12.5px] font-medium transition-colors"
          style={{ color: value === v ? 'var(--on-primary)' : 'var(--muted)' }}
        >
          {value === v && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full" style={{ background: 'var(--primary)' }} transition={SPRING} />}
          <span className="relative z-10 block leading-tight">{l}</span>
          {sub && <span className="relative z-10 block text-[10px] font-medium opacity-70 mt-0.5">{sub}</span>}
        </button>
      ))}
    </div>
  )
}

function Switch({ on, onChange, label, hint }) {
  return (
    <button className="flex items-center gap-3 text-left w-full group" onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="relative w-10 h-6 rounded-full shrink-0 border border-line transition-colors" style={{ background: on ? 'var(--copper)' : 'var(--surface2)' }}>
        <motion.span className="absolute top-0.5 w-5 h-5 rounded-full" style={{ background: 'var(--surface)', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} animate={{ left: on ? 18 : 2 }} transition={SPRING} />
      </span>
      <span>
        <span className="block text-[13px] font-semibold">{label}</span>
        {hint && <span className="block text-[11.5px]" style={{ color: 'var(--muted)' }}>{hint}</span>}
      </span>
    </button>
  )
}

const Card = ({ children, delay = 0, className = '' }) => (
  <motion.div className={`card p-4 sm:p-6 ${className}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay }}>{children}</motion.div>
)

/* ---------------------------------- engine status ---------------------------------- */

function EnginePill({ engine: st, onRetry }) {
  const decorative = useDecorativeMotion()
  const on = st.status === 'online'
  return (
    <button onClick={onRetry} className="flex items-center gap-2.5 rounded-full border border-line px-3.5 py-1.5 text-[11.5px] font-semibold" style={{ background: 'var(--surface)' }} title="Re-check engine">
      <span className="relative flex w-2.5 h-2.5">
        {st.status !== 'offline' && <motion.span className="absolute inset-0 rounded-full" style={{ background: on ? 'var(--success)' : 'var(--copper)' }} animate={decorative ? { scale: [1, 2.3], opacity: [0.5, 0] } : { scale: 1, opacity: 0 }} transition={decorative ? { repeat: Infinity, duration: 1.8, ease: 'easeOut' } : { duration: 0 }} />}
        <span className="relative w-2.5 h-2.5 rounded-full" style={{ background: on ? 'var(--success)' : st.status === 'offline' ? 'var(--error)' : 'var(--copper)' }} />
      </span>
      {on ? (
        <span>yt-dlp {st.info.ytdlp}{st.info.extractors ? <> · <AnimatedNumber value={st.info.extractors} /> sites</> : ''}{st.info.ffmpeg ? ' · ffmpeg' : ' · no ffmpeg'}{engine.kind !== 'http' ? ' · built in' : ''}</span>
      ) : st.status === 'offline' ? <span>Engine offline</span> : <span>Connecting…</span>}
    </button>
  )
}

function OfflineCard({ onRetry }) {
  const decorative = useDecorativeMotion()
  const [baseDraft, setBaseDraft] = useState(getBase())
  const [copied, setCopied] = useState('')
  const cmds = ['npm run setup:engine', 'npm run engine']
  const copy = async (c) => {
    try { await navigator.clipboard?.writeText(c); setCopied(c); setTimeout(() => setCopied(''), 1400) }
    catch { setCopied('') }
  }
  const connect = async () => {
    persistEngineBase(baseDraft)
    await onRetry()
  }
  return (
    <Card>
      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
        <motion.div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl grid place-items-center shrink-0" style={{ background: 'color-mix(in srgb, var(--error) 12%, transparent)', color: 'var(--error)' }}
          animate={decorative ? { rotate: [0, -6, 6, 0] } : { rotate: 0 }} transition={decorative ? { repeat: Infinity, duration: 3.5, ease: 'easeInOut' } : { duration: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2v6m0 8v6M4.9 4.9l4.2 4.2m5.8 5.8 4.2 4.2M2 12h6m8 0h6M4.9 19.1l4.2-4.2m5.8-5.8 4.2-4.2" /></svg>
        </motion.div>
        <div className="flex-1 min-w-0">
          <h3 className="display font-semibold text-[19px]">The download engine is asleep</h3>
          <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: 'var(--muted)' }}>
            {isAndroidPlatform
              ? 'This Android build does not bundle a native yt-dlp engine yet. Run the companion engine on a network-reachable PC or server, then enter its HTTPS /api/ytdlp address below. Do not use localhost or 127.0.0.1 here; on a phone those addresses refer to the phone itself.'
              : 'yt-dlp runs in a companion engine, not inside a browser tab. Start the engine on your PC, or connect to a separately hosted engine below. Static website hosting does not include the downloader service.'}
          </p>
          <div className="mt-4 space-y-2">
            {cmds.map((c, i) => (
              <motion.button key={c} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.1 + i * 0.08 }}
                onClick={() => copy(c)} className="w-full flex items-center justify-between rounded-xl border border-line px-4 py-2.5 mono text-[12.5px]" style={{ background: 'var(--surface2)' }}>
                <span><span style={{ color: 'var(--copper)' }}>{i + 1}</span>&nbsp;&nbsp;{c}</span>
                <span className="text-[10.5px] font-sans font-semibold" style={{ color: 'var(--muted)' }}>{copied === c ? 'Copied' : 'Copy'}</span>
              </motion.button>
            ))}
          </div>
          <div className="mt-5 grid sm:grid-cols-[1fr_auto] gap-2">
            <input className="input mono min-w-0 text-[12.5px]" aria-label="Downloader engine address" value={baseDraft} onChange={(e) => setBaseDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connect()} placeholder="Engine address — default /api/ytdlp" />
            <button className="btn btn-primary w-full sm:w-auto" onClick={connect}>Connect</button>
          </div>
          <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>{isAndroidPlatform ? 'The remote engine must use HTTPS and allow this app’s origin through CORS.' : <>Example local address: <span className="mono break-all">http://127.0.0.1:8787/api/ytdlp</span>. A remote engine must allow this app’s origin through CORS.</>}</p>
        </div>
      </div>
    </Card>
  )
}

/* ---------------------------------- job card ---------------------------------- */

const STEPS = ['Fetch', 'Download', 'Finish', 'Ready']
const stepOf = (j) => (j.state === 'done' ? 3 : ['merging', 'converting', 'finishing'].includes(j.stage) ? 2 : j.stage === 'downloading' ? 1 : 0)

function JobCard({ job, onRemove }) {
  const [s, setS] = useState({ state: 'running', stage: 'fetching', percent: null })
  const fired = useRef(false)
  const transferNotice = useRef(null)
  const releaseTransfer = useRef(null)
  const transferTerminal = useRef(false)

  const releaseBackgroundTransfer = () => {
    const release = releaseTransfer.current
    releaseTransfer.current = null
    if (release) void release()
  }

  useEffect(() => {
    if (!isAndroidTauri) return
    let mounted = true
    transferTerminal.current = false
    const title = `Download · ${job.title}`.slice(0, 64)
    transferNotice.current = createTransferNotifier(title)
    beginBackgroundTransfer(title).then((release) => {
      if (mounted && !transferTerminal.current) releaseTransfer.current = release
      else void release()
    }).catch((error) => {
      // A notification/service issue must never cancel the engine's download.
      console.warn('Android download keepalive unavailable:', error)
    })
    return () => {
      mounted = false
      transferNotice.current?.finish('Download card closed')
      transferNotice.current = null
      releaseBackgroundTransfer()
    }
  }, [job.id, job.title])

  useEffect(() => {
    if (!isAndroidTauri) return
    const state = s.state
    if (state === 'running') {
      transferNotice.current?.update(s.downloaded || 0, s.total || 0)
      return
    }
    if (!['done', 'error', 'cancelled'].includes(state)) return
    transferTerminal.current = true
    const message = state === 'done'
      ? 'Download ready to save'
      : state === 'cancelled' ? 'Download cancelled' : `Download failed: ${String(s.error || 'unknown error').slice(0, 90)}`
    transferNotice.current?.finish(message)
    releaseBackgroundTransfer()
  }, [s.state, s.downloaded, s.total, s.error])

  const [savedMsg, setSavedMsg] = useState(null)
  const save = useCallback(async () => {
    try {
      const location = await engine.save(job.id)
      setSavedMsg(location || (engine.kind === 'http' ? 'Browser download started' : 'File opened in its folder'))
    } catch (e) { setSavedMsg(`Could not save: ${e.message || e}`) }
  }, [job.id])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const j = await engine.status(job.id)
        if (!alive) return
        setS(j)
        if (j.state === 'running') setTimeout(tick, 600)
      } catch (e) { if (alive) setS((p) => ({ ...p, state: 'error', error: e.message })) }
    }
    tick()
    return () => { alive = false }
  }, [job.id])

  useEffect(() => {
    if (s.state === 'done' && !fired.current) { fired.current = true; recentAction(`Ready to save “${job.title}” via yt-dlp`) }
  }, [s.state, job.title])

  const step = stepOf(s)
  const R = 26, C = 2 * Math.PI * R
  const indeterminate = s.state === 'running' && s.percent == null
  const accent = s.state === 'error' ? 'var(--error)' : s.state === 'done' ? 'var(--success)' : 'var(--copper)'

  return (
    <motion.div layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24 }} transition={SPRING} className="card p-4 sm:p-5">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4">
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0">
          <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--border)" strokeWidth="6" />
            {indeterminate ? (
              <motion.circle cx="32" cy="32" r={R} fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${C * 0.25} ${C}`}
                animate={{ rotate: 360 }} style={{ originX: '32px', originY: '32px' }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }} />
            ) : (
              <motion.circle cx="32" cy="32" r={R} fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeDasharray={C}
                initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - (s.state === 'done' ? 100 : s.percent || 0) / 100) }} transition={{ ease: 'easeOut', duration: 0.4 }} />
            )}
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            {s.state === 'done' ? (
              <motion.svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0, scale: 0.6 }} animate={{ pathLength: 1, scale: 1 }} transition={SPRING}>
                <motion.path d="M20 6 9 17l-5-5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45 }} />
              </motion.svg>
            ) : s.state === 'error' ? <span className="font-bold text-[18px]" style={{ color: 'var(--error)' }}>!</span>
              : indeterminate ? <span className="text-[10px] font-bold" style={{ color: 'var(--muted)' }}>…</span>
              : <span className="text-[12px] font-bold tabular-nums"><AnimatedNumber value={s.percent || 0} />%</span>}
          </div>
        </div>

        <div className="flex-[1_1_180px] min-w-0">
          <div className="display font-semibold text-[15px] sm:text-[15.5px] truncate">{job.title}</div>
          <div className="text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{job.label}</div>
          {s.state === 'error' ? (
            <div className="text-[12.5px] mt-2 font-medium" style={{ color: 'var(--error)' }}>{s.error}</div>
          ) : (
            <div className="mt-2.5 flex items-center gap-1.5">
              {STEPS.map((l, i) => (
                <React.Fragment key={l}>
                  <motion.span className="text-[10.5px] font-bold uppercase tracking-wider" animate={{ color: i <= step ? 'var(--primary)' : 'var(--muted)', opacity: i <= step ? 1 : 0.55 }}>
                    {l}
                  </motion.span>
                  {i < STEPS.length - 1 && <motion.span className="h-px flex-1 max-w-[28px]" animate={{ background: i < step ? 'var(--copper)' : 'var(--border)' }} />}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
          {s.state === 'done' && <motion.button className="btn btn-primary !px-3 sm:!px-4 text-[12px] sm:text-[13px]" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} onClick={save}>{savedMsg ? 'Save again' : 'Save file'}</motion.button>}
          <button className="btn btn-ghost !px-3" aria-label={s.state === 'running' ? 'Cancel download' : 'Remove download'} onClick={() => { if (s.state === 'running') engine.cancel(job.id); onRemove() }}>
            {s.state === 'running' ? 'Cancel' : '✕'}
          </button>
        </div>
      </div>

      {s.state === 'running' && (
        <div className="mt-4">
          <LiveProgress value={s.percent ?? 0} />
          <div className="flex justify-between mt-2 text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
            <span>{s.parts > 1 ? `stream ${s.part}/${s.parts} · ` : ''}{s.total ? `${fmtBytes(s.downloaded)} / ${fmtBytes(s.total)}` : fmtBytes(s.downloaded)}</span>
            <span>{s.speed ? `${fmtBytes(s.speed)}/s` : ''}{s.eta != null ? ` · ${s.eta}s left` : ''}</span>
          </div>
        </div>
      )}
      {s.state === 'done' && <div className="mt-3 text-[12px] break-all" style={{ color: 'var(--muted)' }}>{savedMsg || s.file} · {fmtBytes(s.size)} · {Number(s.elapsed || 0).toFixed(1)}s</div>}
    </motion.div>
  )
}

/* ---------------------------------- media card ---------------------------------- */

function MediaCard({ info }) {
  const date = info.uploadDate ? `${info.uploadDate.slice(0, 4)}-${info.uploadDate.slice(4, 6)}-${info.uploadDate.slice(6, 8)}` : null
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="grid sm:grid-cols-[240px_1fr]">
        <div className="p-4 sm:p-5 sm:pr-0">
          <div className="relative rounded-2xl overflow-hidden aspect-video" style={{ background: 'var(--surface2)' }}>
            {info.thumbnail && <img src={info.thumbnail} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
            {info.duration && <span className="absolute bottom-2 right-2 mono text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: 'rgba(0,0,0,.72)', color: '#fff' }}>{clock(info.duration).replace(/\.\d$/, '')}</span>}
          </div>
        </div>
        <div className="p-4 sm:p-5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="chip pointer-events-none" style={{ cursor: 'default' }}>{info.extractor}</span>
            {info.isLive && <span className="chip pointer-events-none" style={{ cursor: 'default', color: 'var(--error)' }}>LIVE</span>}
            {info.chapters > 0 && <span className="chip pointer-events-none" style={{ cursor: 'default' }}>{info.chapters} chapters</span>}
          </div>
          <h3 className="display font-semibold text-[19px] sm:text-[20px] leading-snug line-clamp-2">{info.title}</h3>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--muted)' }}>
            {[info.uploader, date, info.views ? `${info.views.toLocaleString()} views` : null].filter(Boolean).join(' · ')}
          </div>
          {info.description && <p className="text-[12.5px] mt-3 line-clamp-2 leading-relaxed" style={{ color: 'var(--muted)' }}>{info.description}</p>}
        </div>
      </div>
    </Card>
  )
}

/* ---------------------------------- main panel ---------------------------------- */

const AUDIO_FORMATS = [['best', 'Original', 'no re-encode'], ['mp3', 'MP3'], ['m4a', 'M4A'], ['opus', 'Opus'], ['flac', 'FLAC'], ['wav', 'WAV']]

export default function Downloader() {
  const [eng, setEng] = useState({ status: 'checking' })
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(null)
  const [opts, setOpts] = useState({ mode: 'video', height: null, container: 'mp4', audioFormat: 'best', clip: false, start: 0, end: 0, accurate: false, subs: false })
  const [jobs, setJobs] = useState([])
  const inputRef = useRef(null)

  const check = useCallback(async () => {
    setEng({ status: 'checking' })
    try { const h = await engine.health(); setEng(h.ok ? { status: 'online', info: h } : { status: 'offline' }) } catch { setEng({ status: 'offline' }) }
  }, [])
  useEffect(() => { check() }, [check])

  const set = (p) => setOpts((o) => ({ ...o, ...p }))

  async function analyze(target = url) {
    const u = target.trim()
    if (!u || busy) return
    setBusy(true); setError(''); setInfo(null)
    try {
      const j = await engine.info(u, isPlaylistUrl(u))
      setInfo(j)
      if (j.kind === 'video') set({ mode: j.hasVideo ? 'video' : 'audio', height: null, clip: false, start: 0, end: j.duration || 0 })
    } catch (e) {
      if (e.offline) setEng({ status: 'offline' }); else setError(e.message)
    } finally { setBusy(false) }
  }

  async function paste() {
    if (busy || starting) return
    try { const t = await navigator.clipboard.readText(); if (t) { setUrl(t); analyze(t) } } catch { inputRef.current?.focus() }
  }

  const selected = useMemo(() => info?.kind === 'video' ? (opts.height ? info.heights.find((h) => h.height === opts.height) : info.heights[0]) : null, [info, opts.height])
  const clipLen = opts.clip && info?.duration ? Math.max(0, opts.end - opts.start) : null
  const estBytes = useMemo(() => {
    if (!info || info.kind !== 'video') return 0
    let b = opts.mode === 'audio' ? (info.audioBytes || (info.audioKbps && info.duration ? (info.audioKbps * 1000 * info.duration) / 8 : 0)) : (selected?.bytes || 0)
    if (clipLen && info.duration) b *= clipLen / info.duration
    return b
  }, [info, opts.mode, selected, clipLen])

  async function start() {
    if (!info || info.kind !== 'video' || starting) return
    setError('')
    setStarting(true)
    try {
      const selectedInfo = info
      const selectedOptions = { ...opts }
      const selectedFormat = selected
      const j = await engine.start({
        url: selectedInfo.sourceUrl, mode: selectedOptions.mode, height: selectedOptions.height, container: selectedOptions.container, audioFormat: selectedOptions.audioFormat,
        clip: selectedOptions.clip && selectedInfo.duration > 0, start: selectedOptions.start, end: selectedOptions.end, accurateCuts: selectedOptions.accurate, subs: selectedOptions.subs, metadata: true,
        parts: selectedOptions.mode === 'video' && selectedInfo.needsMerge ? 2 : 1,
      })
      const label = selectedOptions.mode === 'audio'
        ? `Audio · ${selectedOptions.audioFormat === 'best' ? 'original codec' : selectedOptions.audioFormat.toUpperCase()}`
        : `${selectedOptions.height ? selectedOptions.height + 'p' : selectedFormat ? selectedFormat.height + 'p best' : 'Best'} · ${selectedOptions.container.toUpperCase()}`
      setJobs((js) => [{ id: j.id, title: selectedInfo.title, label: label + (selectedOptions.clip ? ` · ${clock(selectedOptions.start)}–${clock(selectedOptions.end)}` : '') }, ...js])
    } catch (e) { if (e.offline) setEng({ status: 'offline' }); else setError(e.message) }
    finally { setStarting(false) }
  }

  const clearJobs = () => {
    jobs.forEach((job) => { void engine.cancel(job.id) })
    setJobs([])
  }

  return (
    <div className="space-y-6">
      {/* ---------- URL bar ---------- */}
      <motion.div className="card-raised p-5 sm:p-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="eyebrow">Powered by yt-dlp</div>
            <h3 className="display font-semibold text-[22px] mt-1 leading-tight">Paste a link. Get the file.</h3>
          </div>
          <EnginePill engine={eng} onRetry={check} />
        </div>

        <div className="relative">
          <div className="flex gap-2.5 flex-col sm:flex-row">
            <div className="relative flex-1">
              <input
            aria-label="Link to download"
                ref={inputRef} className="input text-[14.5px] py-3.5 pr-24" placeholder="https://…  video, audio, shorts, reels, playlists"
                value={url} onChange={(e) => { setUrl(e.target.value); setInfo(null); setError('') }} onKeyDown={(e) => e.key === 'Enter' && analyze()}
                disabled={busy || starting || eng.status !== 'online'} spellCheck={false}
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost !py-1.5 !px-3 text-[12px]" onClick={paste} disabled={busy || starting || eng.status !== 'online'}>Paste</button>
            </div>
            <motion.button
              className="btn btn-primary btn-sheen px-7 py-3.5 text-[14.5px] min-w-[130px]" whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.95, y: 1 }}
              onClick={() => analyze()} disabled={busy || !url.trim() || eng.status !== 'online'}
            >
              {busy ? (
                <span className="flex items-center justify-center gap-1.5">
                  {[0, 1, 2].map((i) => <motion.span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bg)' }} animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.12 }} />)}
                </span>
              ) : 'Analyze'}
            </motion.button>
          </div>
          <AnimatePresence>
            {busy && (
              <motion.div className="absolute -bottom-3 left-2 right-2 h-0.5 rounded-full overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="h-full w-1/3 rounded-full" style={{ background: 'var(--copper)' }} animate={{ x: ['-100%', '300%'] }} transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {error && <motion.div className="mt-5" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><Note tone="warn">{error}</Note></motion.div>}
        </AnimatePresence>
      </motion.div>

      {eng.status === 'offline' && (engine.bundled ? <Card><Note tone="warn">The built-in download engine didn't start. Reinstall the app, or update it to restore yt-dlp.</Note></Card> : <OfflineCard onRetry={check} />)}

      {/* ---------- playlist ---------- */}
      <AnimatePresence mode="wait">
        {info?.kind === 'playlist' && (
          <Card key="pl">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="eyebrow">Playlist · {info.extractor}</div>
                <h3 className="display font-semibold text-[19px] mt-1">{info.title}</h3>
              </div>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}><AnimatedNumber value={info.count || info.entries.length} /> items — pick one</span>
            </div>
            <div className="max-h-[360px] overflow-auto -mx-2 px-2 space-y-1.5">
              {info.entries.map((e, i) => (
                <motion.button key={e.url + i} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: Math.min(i, 14) * 0.03 }}
                  whileHover={{ x: 4 }} className="w-full flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left" style={{ background: 'var(--surface2)' }}
                  onClick={() => { setUrl(e.url); analyze(e.url) }}>
                  <span className="mono text-[11px] w-7 text-right" style={{ color: 'var(--muted)' }}>{e.i}</span>
                  <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">{e.title}</span>
                  {e.duration && <span className="mono text-[11px]" style={{ color: 'var(--muted)' }}>{clock(e.duration).replace(/\.\d$/, '')}</span>}
                </motion.button>
              ))}
            </div>
          </Card>
        )}
      </AnimatePresence>

      {/* ---------- single media ---------- */}
      {info?.kind === 'video' && (
        <>
          <MediaCard info={info} />
          <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
              <Card delay={0.05}>
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                  <h3 className="display font-semibold text-[18px]">What do you want?</h3>
                  <div className="w-full sm:w-64">
                    <Seg id="mode" value={opts.mode} onChange={(v) => set({ mode: v })} options={[...(info.hasVideo ? [['video', 'Video']] : []), ['audio', 'Audio only']]} />
                  </div>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {opts.mode === 'video' ? (
                    <motion.div key="v" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }} className="space-y-5">
                      <div>
                        <div className="label mb-2">Quality</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {[{ height: null }, ...info.heights].map((h, i) => {
                            const on = opts.height === h.height
                            const ref = h.height ? h : info.heights[0]
                            return (
                              <motion.button key={h.height ?? 'best'} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: i * 0.025 }}
                                whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => set({ height: h.height })}
                                className="relative rounded-xl border px-3 py-2.5 text-left overflow-hidden"
                                style={{ borderColor: on ? 'var(--primary)' : 'var(--border)', background: on ? 'var(--primary)' : 'var(--surface)', color: on ? 'var(--on-primary)' : 'var(--ink)' }}>
                                <div className="font-bold text-[14px]">{h.height ? `${h.height}p` : 'Best'}{h.fps > 30 ? <span className="text-[10px] font-semibold opacity-70"> {Math.round(h.fps)}fps</span> : null}</div>
                                <div className="text-[10.5px] mt-0.5 opacity-70">{h.height ? `${h.vcodec || ''} ${ref?.bytes ? '· ~' + fmtBytes(ref.bytes) : ''}` : `highest · ${ref?.height || '—'}p`}</div>
                              </motion.button>
                            )
                          })}
                        </div>
                        {!info.heights.length && <p className="text-[12px] mt-2" style={{ color: 'var(--muted)' }}>Single stream source — it will be saved as-is.</p>}
                      </div>
                      <div>
                        <div className="label mb-2">Container <span className="normal-case tracking-normal font-medium">— swapped losslessly, never re-encoded</span></div>
                        <Seg id="cont" value={opts.container} onChange={(v) => set({ container: v })} options={[['mp4', 'MP4', 'most compatible'], ['mkv', 'MKV', 'any codec'], ['webm', 'WebM', 'VP9 / AV1']]} />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="a" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}>
                      <div className="label mb-2">Format {info.audioKbps ? <span className="normal-case tracking-normal font-medium">— source is {info.audioKbps} kbps</span> : null}</div>
                      <Seg id="afmt" value={opts.audioFormat} onChange={(v) => set({ audioFormat: v })} options={AUDIO_FORMATS} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>

              <Card delay={0.1}>
                <Switch on={opts.clip} onChange={(v) => set({ clip: v })} label="Download only a section" hint={info.duration ? 'Grab just the part you need — saves time and bandwidth' : 'Duration unknown for this source'} />
                <AnimatePresence initial={false}>
                  {opts.clip && info.duration > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
                      <div className="pt-5 space-y-4">
                        <RangeTrack duration={info.duration} start={opts.start} end={opts.end || info.duration} onChange={(a, b) => set({ start: a, end: b })} />
                        <div className="grid grid-cols-3 gap-3 items-end">
                          <TimeField label="Start" value={opts.start} onCommit={(v) => set({ start: Math.max(0, Math.min(v, opts.end - 0.1)) })} />
                          <div className="text-center pb-2.5">
                            <div className="label">Length</div>
                            <div className="display font-semibold text-[20px] tabular-nums mt-1"><AnimatedNumber value={clipLen || 0} format={(n) => clock(n)} /></div>
                          </div>
                          <TimeField label="End" value={opts.end} onCommit={(v) => set({ end: Math.min(info.duration, Math.max(v, opts.start + 0.1)) })} />
                        </div>
                        <Switch on={opts.accurate} onChange={(v) => set({ accurate: v })} label="Frame-accurate cuts" hint="Re-encodes the boundaries only. Off = instant keyframe cuts, zero re-encoding." />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>

              {(info.subtitles.length > 0 || info.autoSubs > 0) && opts.mode === 'video' && (
                <Card delay={0.14}>
                  <Switch on={opts.subs} onChange={(v) => set({ subs: v })} label="Embed English subtitles" hint={`${info.subtitles.length} uploaded track${info.subtitles.length === 1 ? '' : 's'} · ${info.autoSubs} auto-generated`} />
                </Card>
              )}
            </div>

            {/* ---------- summary ---------- */}
            <motion.div className="card-raised p-6 space-y-5 lg:sticky lg:top-24" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.12 }}>
              <h3 className="display font-semibold text-[18px]">Your download</h3>
              <div className="space-y-2.5 text-[13px]">
                {[
                  ['Type', opts.mode === 'audio' ? 'Audio' : 'Video'],
                  ['Format', opts.mode === 'audio' ? (opts.audioFormat === 'best' ? 'Original' : opts.audioFormat.toUpperCase()) : opts.container.toUpperCase()],
                  opts.mode === 'video' && ['Quality', opts.height ? `${opts.height}p` : selected ? `${selected.height}p (best)` : 'Best'],
                  opts.clip && clipLen > 0 && ['Section', `${clock(opts.start)} → ${clock(opts.end)}`],
                ].filter(Boolean).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><span style={{ color: 'var(--muted)' }}>{k}</span><motion.span key={v} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="font-semibold text-right">{v}</motion.span></div>
                ))}
              </div>
              <div className="rounded-xl border border-line p-4 text-center" style={{ background: 'var(--surface2)' }}>
                <div className="label">Estimated size</div>
                <div className="display font-semibold text-[28px] mt-1 tabular-nums">{estBytes ? <>~<AnimatedNumber value={estBytes} format={(n) => fmtBytes(n)} /></> : '—'}</div>
              </div>
              <motion.button className="btn btn-primary btn-sheen w-full py-3.5 text-[15px]" whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.96, y: 1 }} onClick={start} disabled={starting || info.isLive || (opts.clip && clipLen <= 0)}>
                {starting ? 'Starting…' : 'Download'}
              </motion.button>
              {info.isLive && <Note tone="warn">Live streams can't be downloaded until they end.</Note>}
              {!eng.info?.ffmpeg && <Note tone="warn">ffmpeg is missing on the engine — merging, sections and audio conversion need it.</Note>}
            </motion.div>
          </div>
        </>
      )}

      {/* ---------- jobs ---------- */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="display font-semibold text-[18px]">Downloads</h3>
            <button className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }} onClick={clearJobs}>Cancel & clear all</button>
          </div>
          <AnimatePresence initial={false}>
            {jobs.map((j) => <JobCard key={j.id} job={j} onRemove={() => setJobs((js) => js.filter((x) => x.id !== j.id))} />)}
          </AnimatePresence>
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
        Download only content you own or have permission to save, and respect each site's terms. Downloads run on your own device or engine, and nothing is kept after the session on the web build.
      </p>
    </div>
  )
}

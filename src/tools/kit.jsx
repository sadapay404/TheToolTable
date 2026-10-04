/* Shared building blocks for the newer tools. Keeps one look and feel across eight apps without
   each of them re-inventing panels, chips, sliders or the icon set. Panels/Seg/Label come from the
   exchange kit so the table stays visually identical to the tools that shipped first. */
import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SPRING, Panel, Label, Seg, Stagger, usePersist, CopyBtn } from './exchange/parts.jsx'

export { SPRING, Panel, Label, Seg, Stagger, usePersist, CopyBtn }

const P = {
  file: <><path d="M6 3h7l5 5v13H6Z" /><path d="M13 3v5h5" /></>,
  pdf: <><path d="M6 3h7l5 5v13H6Z" /><path d="M13 3v5h5" /><path d="M9 13.5h1.4a1.4 1.4 0 0 1 0 2.8H9V13.5v5" /></>,
  scan: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M4 12h16" /></>,
  text: <path d="M5 6V5h14v1M12 5v14M9 19h6" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 12a6.5 6.5 0 0 0 13 0M12 18.5V21M8.5 21h7" /></>,
  wave: <path d="M3 12h2l1.5-5 2.5 10 2.5-14 2.5 12 2-6 1.5 3H21" />,
  captions: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M7 15h4M13 15h4M7 11h3M12 11h5" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9.5 8h5M9.5 12h5" /></>,
  tag: <><path d="M4 4h8l8 8-8 8-8-8Z" /><circle cx="8.5" cy="8.5" r="1.4" /></>,
  box: <><path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9Z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  zip: <><path d="M6 3h12v18H6Z" /><path d="M12 3v4M12 9v2M12 13v2M12 17v2" /></>,
  hash: <><path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" /></>,
  shield: <><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z" /><path d="m9 12 2 2 4-4" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><rect x="7" y="12" width="3" height="6" rx="1" /><rect x="12" y="8" width="3" height="10" rx="1" /><rect x="17" y="14" width="3" height="4" rx="1" /></>,
  pie: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5V12l7.3 4.2" /></>,
  line: <><path d="M4 19V5M4 19h16" /><path d="m6.5 15 3.5-4 3 2.5 4.5-6" /></>,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19.5h14" /></>,
  upload: <><path d="M12 16V5M7.5 9.5 12 5l4.5 4.5" /><path d="M5 19.5h14" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  rotate: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3.5V8h-4.5" /></>,
  rotl: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 3.5V8h4.5" /></>,
  split: <><path d="M12 3v18" /><path d="M8 7 4 12l4 5M16 7l4 5-4 5" /></>,
  merge: <><path d="M4 8h5l6 8h5M4 16h5l1.2-1.6" /><path d="m17 4 3 4h-6l3-4M17 20l3-4h-6l3 4" /></>,
  arrowl: <path d="m14.5 6-6 6 6 6" />, arrowr: <path d="m9.5 6 6 6-6 6" />,
  arrowu: <path d="m6 14.5 6-6 6 6" />, arrowd: <path d="m6 9.5 6 6 6-6" />,
  play: <path d="M8 5.5v13l11-6.5Z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none" /><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none" /></>,
  skipb: <><path d="M6 5v14M18 5 8.5 12 18 19Z" /></>, skipf: <><path d="M18 5v14M6 5l9.5 7L6 19Z" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  money: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  sliders: <><path d="M4 8h10M18 8h2M4 16h4M12 16h8" /><circle cx="16" cy="8" r="2" /><circle cx="10" cy="16" r="2" /></>,
  sparkles: <><path d="m12 4 1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6Z" /><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>,
  eye: <><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  layers: <><path d="m12 4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  wand: <><path d="m4 20 11-11M13.5 6.5l4 4" /><path d="M17.5 3v3M16 4.5h3M20 11v2M19 12h2M8 3v2M7 4h2" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2 6.2" /><path d="M20 4.5V11h-6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.1" /></>,
  warn: <><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.7" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></>,
  film: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M8 4.5v15M16 4.5v15M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5" /></>,
  book: <><path d="M5 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H5Z" /><path d="M19 4h-5v13a2.5 2.5 0 0 1 2.5-2.5H19Z" /></>,
  scalpel: <><path d="M14 4h6v6L10 20H4v-6Z" /><path d="m12 6 6 6" /></>,
}

export function Ico({ n, s = 18, w = 1.8, className = '', style }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>{P[n] || P.file}</svg>
}

export function Btn({ children, icon, onClick, primary, disabled, busy, className = '', title, small, tone }) {
  return (
    <motion.button type="button" title={title} disabled={disabled} onClick={onClick}
      whileHover={disabled ? {} : { y: -2 }} whileTap={disabled ? {} : { scale: 0.94 }}
      className={`relative inline-flex items-center justify-center gap-2 rounded-full font-bold ${small ? 'px-3.5 py-2 text-[12px]' : 'px-5 py-2.5 text-[13px]'} ${className}`}
      style={primary
        ? { background: tone || 'var(--ink)', color: 'var(--bg)', opacity: disabled ? 0.45 : 1, boxShadow: '0 12px 22px -12px rgba(0,0,0,.6)' }
        : { background: 'var(--surface)', color: tone || 'var(--ink)', border: '1px solid var(--border)', opacity: disabled ? 0.45 : 1 }}>
      {icon && <motion.span animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : SPRING} className="inline-flex"><Ico n={busy ? 'refresh' : icon} s={small ? 15 : 17} /></motion.span>}
      {children}
    </motion.button>
  )
}

export function Chips({ value, onChange, options, small = true }) {
  return (
    <div className="flex flex-wrap gap-1.5 rail">
      {options.map(([k, l]) => (
        <motion.button key={String(k)} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.93 }} onClick={() => onChange(k)}
          className={`rounded-full border font-semibold ${small ? 'px-3 py-1 text-[11.5px]' : 'px-4 py-1.5 text-[12.5px]'}`}
          style={{ borderColor: k === value ? 'var(--ink)' : 'var(--border)', background: k === value ? 'var(--ink)' : 'var(--surface)', color: k === value ? 'var(--bg)' : 'var(--ink)' }}>{l}</motion.button>
      ))}
    </div>
  )
}

export function Slider({ label, value, onChange, min, max, step = 0.01, fmt = (v) => v, hint, onReset, disabled }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="block" style={{ opacity: disabled ? 0.5 : 1 }}>
      <span className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-semibold">{label}{hint && <span className="ml-2 font-normal text-[11.5px]" style={{ color: 'var(--muted)' }}>{hint}</span>}</span>
        <span className="flex items-center gap-2">
          {onReset && <button type="button" onClick={onReset} className="text-[11px] font-semibold opacity-60 hover:opacity-100" style={{ color: 'var(--copper)' }}>Reset</button>}
          <motion.span key={String(fmt(value))} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="mono text-[11.5px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}>{fmt(value)}</motion.span>
        </span>
      </span>
      <span className="relative block h-5">
        <span className="absolute left-0 right-0 top-1/2 -mt-[3px] h-[6px] rounded-full" style={{ background: 'var(--border)' }} />
        <span className="absolute left-0 top-1/2 -mt-[3px] h-[6px] rounded-full" style={{ background: 'var(--copper)', width: `${pct}%` }} />
        <span className="absolute top-1/2 -mt-[9px] w-[18px] h-[18px] rounded-full bg-white pointer-events-none" style={{ left: `calc(${pct}% - ${pct * 0.18}px)`, border: '2px solid var(--copper)', boxShadow: '0 3px 8px rgba(0,0,0,.25)' }} />
        <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(+e.target.value)} className="absolute inset-0 w-full opacity-0 cursor-pointer" />
      </span>
    </label>
  )
}

export function Toggle({ on, onChange, label, hint }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="w-full flex items-center justify-between gap-3 text-left py-1">
      <span><span className="block text-[13px] font-semibold">{label}</span>{hint && <span className="block text-[11.5px]" style={{ color: 'var(--muted)' }}>{hint}</span>}</span>
      <span className="relative shrink-0 w-11 h-6 rounded-full transition-colors" style={{ background: on ? 'var(--copper)' : 'var(--border)' }}>
        <motion.span className="absolute top-0.5 w-5 h-5 rounded-full bg-white" style={{ boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} initial={false} animate={{ left: on ? 22 : 2 }} transition={SPRING} />
      </span>
    </button>
  )
}

export function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className="label mb-1.5 block">{label}</span>{children}</label>
}

export function Toast({ msg }) {
  return (
    <div className="fixed left-1/2 bottom-6 z-[80] -translate-x-1/2 pointer-events-none">
      <AnimatePresence>{msg && <motion.div key={msg.k} initial={{ opacity: 0, y: 24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={SPRING}
        className="rounded-full px-5 py-2.5 text-[13px] font-semibold flex items-center gap-2" style={{ background: 'var(--ink)', color: 'var(--bg)', boxShadow: '0 16px 32px -12px rgba(0,0,0,.5)' }}>
        <Ico n={msg.tone === 'err' ? 'warn' : 'check'} s={15} />{msg.t}
      </motion.div>}</AnimatePresence>
    </div>
  )
}

/** Toast state helper — `const [msg, toast] = useToast()` */
export function useToast() {
  const [msg, setMsg] = useState(null)
  const t = useRef(0)
  const toast = (t2, tone = 'ok') => { setMsg({ t: t2, tone, k: Date.now() }); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 2600) }
  useEffect(() => () => clearTimeout(t.current), [])
  return [msg, toast]
}

/** A drop target that looks like the rest of the table. */
export function Drop({ onFiles, multiple, accept, label = 'Drop files here', sub = 'or click to browse', children, compact }) {
  const [hot, setHot] = useState(false)
  const ref = useRef(null)
  return (
    <motion.div whileHover={{ y: -2 }} onClick={() => ref.current?.click()}
      className={`dropzone ${compact ? 'p-5' : 'p-10'} text-center cursor-pointer`} data-hot={hot} role="button" tabIndex={0} aria-label={label}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ref.current?.click() } }}
      onDragOver={(e) => { e.preventDefault(); setHot(true) }}
      onDragLeave={() => setHot(false)}
      onDrop={(e) => { e.preventDefault(); setHot(false); const fs = [...e.dataTransfer.files]; if (fs.length) onFiles(multiple ? fs : fs.slice(0, 1)) }}>
      <input ref={ref} type="file" hidden multiple={multiple} accept={accept} onChange={(e) => { const fs = [...e.target.files]; if (fs.length) onFiles(fs); e.target.value = '' }} />
      {children || (
        <>
          <motion.div animate={hot ? { y: [-2, 4, -2] } : { y: 0 }} transition={{ repeat: hot ? Infinity : 0, duration: 1.1 }} className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-2xl" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n="upload" s={22} /></motion.div>
          <div className="display font-semibold text-[16px]">{label}</div>
          <div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>{sub}</div>
        </>
      )}
    </motion.div>
  )
}

/** Small stat readout used across the new tools. */
export function Stat({ k, v, className = '' }) {
  return (
    <div className={`rounded-2xl border border-line px-4 py-3 ${className}`} style={{ background: 'var(--surface)' }}>
      <div className="eyebrow">{k}</div>
      <div className="font-bold mt-1 truncate text-[14px]">{v}</div>
    </div>
  )
}

/** Honest "engine not available" card, matching the downloader's offline card. */
export function EngineCard({ title, children, action }) {
  return (
    <div className="rounded-[24px] border border-line p-6 flex flex-wrap items-center gap-4" style={{ background: 'var(--surface)' }}>
      <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n="lock" s={20} /></div>
      <div className="min-w-[220px] flex-1">
        <div className="display font-semibold text-[15px]">{title}</div>
        <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{children}</div>
      </div>
      {action}
    </div>
  )
}

/** File list row with slide-in animation. */
export function Row({ children, i = 0, onClick, on, className = '', style }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ ...SPRING, delay: Math.min(i * 0.03, 0.3) }}
      onClick={onClick} className={`rounded-2xl border border-line px-3.5 py-3 flex items-center gap-3 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--bg)' : 'var(--ink)', ...style }}>
      {children}
    </motion.div>
  )
}

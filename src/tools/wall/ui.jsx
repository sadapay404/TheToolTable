import React, { createContext, useContext, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
export { SPRING, Panel, Label, Seg } from '../exchange/parts.jsx'
import { SPRING } from '../exchange/parts.jsx'

export const WallCtx = createContext(null)
export const useWall = () => useContext(WallCtx)

const P = {
  play: <path d="M8 5.5v13l11-6.5Z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none" /><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none" /></>,
  dice: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  save: <><path d="M5 4h11l3 3v13H5Z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  look: <><circle cx="12" cy="12" r="9" /><path d="M3.5 12c3-4 6-4 8.5 0s5.500 4 8.500 0" /></>,
  palette: <><path d="M12 3.5a8.500 8.500 0 1 0 0 17c1.500 0 2-1 1.500-2s0-2.300 1.800-2.300H18a2.500 2.500 0 0 0 2.500-2.500C20.500 7.200 16.700 3.500 12 3.500Z" /><circle cx="7.800" cy="11" r="1.100" fill="currentColor" /><circle cx="10.500" cy="7.500" r="1.100" fill="currentColor" /><circle cx="15" cy="8" r="1.100" fill="currentColor" /></>,
  finish: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  type: <path d="M5 6.500V5h14v1.500M12 5v14M9 19h6" />,
  frame: <><rect x="3.500" y="5.500" width="17" height="13" rx="2.500" /><path d="M7 15.500l3.200-3.500 2.800 2.800L15 13l2.500 2.500" /></>,
  download: <><path d="M12 4v11M7.500 10.500 12 15l4.500-4.500" /><path d="M5 19.500h14" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <path d="M4 7h16M9 7V4.500h6V7M6.500 7l1 13h9l1-13" />,
  check: <path d="m5 12.500 4.500 4.500L19 7.500" />,
  film: <><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><path d="M8 4.500v15M16 4.500v15M3.500 9.500H8M3.500 14.500H8M16 9.500h4.500M16 14.500h4.500" /></>,
  pack: <><path d="M12 3 3.500 7.500v9L12 21l8.500-4.500v-9Z" /><path d="M3.500 7.500 12 12l8.500-4.500M12 12v9" /></>,
  code: <path d="m8.500 7-5 5 5 5M15.500 7l5 5-5 5M13.500 5l-3 14" />,
  heart: <path d="M12 20s-7.500-4.500-7.500-10A4.200 4.200 0 0 1 12 7.500 4.200 4.200 0 0 1 19.500 10c0 5.500-7.500 10-7.500 10Z" />,
  grid: <><rect x="4" y="4" width="6.500" height="6.500" rx="1.500" /><rect x="13.500" y="4" width="6.500" height="6.500" rx="1.500" /><rect x="4" y="13.500" width="6.500" height="6.500" rx="1.500" /><rect x="13.500" y="13.500" width="6.500" height="6.500" rx="1.500" /></>,
  swap: <><path d="M7 4 3.500 7.500 7 11M3.500 7.500h13M17 13l3.500 3.500L17 20M20.500 16.500h-13" /></>,
  rev: <path d="M3 8h13M12 4l4 4-4 4M21 16H8M12 12l-4 4 4 4" />,
  sort: <path d="M4 6h16M4 12h11M4 18h6" />,
  wand: <><path d="m4 20 11-11" /><path d="m13.500 6.500 4 4" /><path d="M17.500 3v3M16 4.500h3M20 11v2M19 12h2M8 3v2M7 4h2" /></>,
  image: <><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><circle cx="9" cy="10" r="1.700" /><path d="m4 17 5-4.500 4 3.500 3-2.500 4 3.500" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" /><path d="M14 10a4 4 0 0 0-5.700 0l-3 3A4 4 0 0 0 10 18.700l1-1" /></>,
  sound: <path d="M3 12h2.500l2-5 3 10 3-14 2.500 9H21" />,
  flip: <path d="M7 4v16M17 4v16M4 8l3-4 3 4M14 16l3 4 3-4" />,
  screen: <><rect x="3" y="4.500" width="18" height="12" rx="2" /><path d="M8.500 20h7M12 16.500V20" /></>,
  phone: <><rect x="7" y="3" width="10" height="18" rx="2.500" /><path d="M10.500 18h3" /></>,
  call: <><rect x="3" y="5" width="13" height="14" rx="2.500" /><path d="m16 10 5-3v10l-5-3" /></>,
  web: <><rect x="3" y="4.500" width="18" height="15" rx="2.500" /><path d="M3 9h18M6.500 6.800h.1M9 6.800h.1" /></>,
  flat: <rect x="3.500" y="6" width="17" height="12" rx="2" />,
  arrowl: <path d="m14.500 6-6 6 6 6" />, arrowr: <path d="m9.500 6 6 6-6 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.500M12 7.800v.1" /></>,
}
export function Ico({ n, s = 18, w = 1.8, className = '', style }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>{P[n]}</svg>
}

export function Slider({ label, value, onChange, min, max, step = 0.01, fmt = (v) => v, hint, onReset }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-semibold">{label}{hint && <span className="ml-2 font-normal text-[11.5px]" style={{ color: 'var(--muted)' }}>{hint}</span>}</span>
        <span className="flex items-center gap-2">
          {onReset && <button type="button" onClick={onReset} className="text-[11px] font-semibold opacity-60 hover:opacity-100" style={{ color: 'var(--copper)' }}>Reset</button>}
          <motion.span key={String(fmt(value))} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className="mono text-[11.5px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}>{fmt(value)}</motion.span>
        </span>
      </span>
      <span className="relative block h-5">
        <span className="absolute left-0 right-0 top-1/2 -mt-[3px] h-[6px] rounded-full" style={{ background: 'var(--border)' }} />
        <span className="absolute left-0 top-1/2 -mt-[3px] h-[6px] rounded-full" style={{ background: 'var(--copper)', width: pct + '%', transition: 'width .08s' }} />
        <span className="absolute top-1/2 -mt-[9px] w-[18px] h-[18px] rounded-full bg-white pointer-events-none" style={{ left: `calc(${pct}% - ${pct * 0.18}px)`, border: '2px solid var(--copper)', boxShadow: '0 3px 8px rgba(0,0,0,.25)' }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="absolute inset-0 w-full opacity-0 cursor-pointer" />
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

export function Chips({ value, onChange, options, small = true }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, l]) => (
        <motion.button key={String(k)} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.93 }} onClick={() => onChange(k)} className={`rounded-full border font-semibold ${small ? 'px-3 py-1 text-[11.5px]' : 'px-4 py-1.5 text-[12.5px]'}`}
          style={{ borderColor: k === value ? 'var(--ink)' : 'var(--border)', background: k === value ? 'var(--ink)' : 'var(--surface)', color: k === value ? 'var(--bg)' : 'var(--ink)' }}>{l}</motion.button>
      ))}
    </div>
  )
}

export function Btn({ children, icon, onClick, primary, disabled, busy, className = '', title, small, spin }) {
  return (
    <motion.button type="button" title={title} disabled={disabled} onClick={onClick} whileHover={disabled ? {} : { y: -2 }} whileTap={disabled ? {} : { scale: 0.94 }}
      className={`relative inline-flex items-center justify-center gap-2 rounded-full font-bold ${small ? 'px-3.5 py-2 text-[12px]' : 'px-5 py-2.5 text-[13px]'} ${className}`}
      style={primary ? { background: 'var(--ink)', color: 'var(--bg)', opacity: disabled ? 0.55 : 1, boxShadow: '0 12px 22px -12px rgba(0,0,0,.6)' } : { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)', opacity: disabled ? 0.55 : 1 }}>
      {icon && <motion.span key={spin} initial={spin ? { rotate: 0, scale: 0.6 } : false} animate={busy ? { rotate: 360 } : spin ? { rotate: 360, scale: 1 } : { rotate: 0 }} transition={busy ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : SPRING} className="inline-flex"><Ico n={icon} s={small ? 15 : 17} /></motion.span>}{children}
    </motion.button>
  )
}

export function Bar({ value, className = '' }) {
  return <div className={`h-2 rounded-full overflow-hidden ${className}`} style={{ background: 'var(--border)' }}><motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,var(--copper),#E8B84B)' }} initial={false} animate={{ width: `${Math.round(value * 100)}%` }} transition={{ duration: 0.2 }} /></div>
}

export function Toast({ msg }) {
  return (
    <div className="fixed left-1/2 bottom-6 z-[80] -translate-x-1/2 pointer-events-none">
      <AnimatePresence>{msg && <motion.div key={msg.k} initial={{ opacity: 0, y: 24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={SPRING} className="rounded-full px-5 py-2.5 text-[13px] font-semibold flex items-center gap-2" style={{ background: 'var(--ink)', color: 'var(--bg)', boxShadow: '0 16px 32px -12px rgba(0,0,0,.5)' }}><Ico n="check" s={15} />{msg.t}</motion.div>}</AnimatePresence>
    </div>
  )
}

/** colour swatch that opens the native picker */
export function ColorDot({ value, onChange, size = 36, className = '' }) {
  const ref = useRef(null)
  return (
    <button type="button" onClick={() => ref.current?.click()} className={`relative rounded-full border border-line ${className}`} style={{ width: size, height: size, background: value, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.5)' }}>
      <input ref={ref} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
    </button>
  )
}

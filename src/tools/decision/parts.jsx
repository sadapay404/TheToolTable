import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
export { SPRING } from '../exchange/parts.jsx'
export { Panel, Label, Seg, CountText } from '../exchange/parts.jsx'
import { SPRING } from '../exchange/parts.jsx'

/* ------------------------------------------------ randomness (crypto-grade, unbiased) ------------------------------------------------ */
export function rnd(n) {
  if (n <= 1) return 0
  const lim = Math.floor(0x100000000 / n) * n, a = new Uint32Array(1)
  do { crypto.getRandomValues(a) } while (a[0] >= lim)
  return a[0] % n
}
export const rndf = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 0x100000000 }
export function weighted(weights) {
  const tot = weights.reduce((a, b) => a + b, 0); let x = rndf() * tot
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i }
  return weights.length - 1
}
export const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1);[a[i], a[j]] = [a[j], a[i]] } return a }

/* ------------------------------------------------ sound ------------------------------------------------ */
let ac = null, soundOn = true
export const setSound = (v) => { soundOn = v }
export function sfx(kind = 'tick', pitch = 1) {
  if (!soundOn) return
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)()
    if (ac.state === 'suspended') ac.resume()
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain()
    const spec = { tick: [1400, 'triangle', 0.05, 0.07], thud: [180, 'sine', 0.35, 0.2], ding: [1046, 'sine', 0.5, 0.18], whoosh: [320, 'sawtooth', 0.25, 0.05], click: [900, 'square', 0.04, 0.04] }[kind]
    o.type = spec[1]; o.frequency.setValueAtTime(spec[0] * pitch, t)
    if (kind === 'thud') o.frequency.exponentialRampToValueAtTime(70, t + spec[2])
    if (kind === 'whoosh') o.frequency.exponentialRampToValueAtTime(900, t + spec[2])
    g.gain.setValueAtTime(spec[3], t); g.gain.exponentialRampToValueAtTime(0.0001, t + spec[2])
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + spec[2] + 0.02)
  } catch {}
}

/* ------------------------------------------------ persistence + shared log ------------------------------------------------ */
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch { return d } }
export function usePersist(key, init) {
  const [v, setV] = useState(() => { const s = lsGet('ttt.dh.' + key, null); return s && typeof s === 'object' && !Array.isArray(s) && init && typeof init === 'object' && !Array.isArray(init) ? { ...init, ...s } : s ?? init })
  useEffect(() => { try { localStorage.setItem('ttt.dh.' + key, JSON.stringify(v)) } catch {} }, [key, v])
  return [v, setV]
}
export const LogCtx = createContext(() => {})
export const useLog = () => useContext(LogCtx)

/* ------------------------------------------------ icons ------------------------------------------------ */
const P = {
  coin: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><path d="M12 9.5v5M10.5 11h2.2a1 1 0 0 1 0 2H10.5" /></>,
  dice: <><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" /><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" /><circle cx="12" cy="12" r="1.1" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" /></>,
  wheel: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6.4 6.4M12 12 5.6 18.4M12 12h9M12 12 5.6 5.6" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></>,
  bottle: <><path d="M10 2.5h4v4.2c0 1 1.6 2 1.6 4.6V20a1.5 1.5 0 0 1-1.5 1.5H9.9A1.5 1.5 0 0 1 8.4 20v-8.7c0-2.6 1.6-3.6 1.6-4.6Z" /><path d="M8.4 13.5h7.2" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.7c2.2.6 3.5 2.3 3.5 5" /></>,
  hash: <path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  sound: <><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  mute: <><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  shuffle: <><path d="M3 7h3.5c3 0 4 2 5.5 5s2.5 5 5.5 5H21M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M21 7h-3.5c-1.4 0-2.4.5-3.2 1.4" /><path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5" /></>,
  trash: <><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3 4v4.5h4.5M12 7.5V12l3 2" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="9.5" r="3.6" /><path d="M10.4 8.4h2.2a.9.9 0 0 1 0 1.8h-1.6a.9.9 0 0 0 0 1.8h2.2" /></>,
  dot: <circle cx="12" cy="12" r="3" fill="currentColor" />,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0ZM8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4" /></>,
}
export function DIco({ n, s = 18, w = 1.8, className = '', style }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>{P[n]}</svg>
}

/* ------------------------------------------------ building blocks ------------------------------------------------ */
export function Stage({ children, className = '', h = 440, glow = 'var(--copper)' }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING} className={`relative overflow-hidden rounded-[26px] border border-line ${className}`}
      style={{ minHeight: h, background: `radial-gradient(ellipse at 50% 32%, color-mix(in srgb, ${glow} 13%, var(--surface)) 0%, var(--surface) 68%)`, boxShadow: 'var(--shadow)' }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--ink) 11%, transparent) 1px, transparent 1.3px)', backgroundSize: '22px 22px', maskImage: 'radial-gradient(ellipse at 50% 45%, #000 0%, transparent 72%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, #000 0%, transparent 72%)' }} />
      <div className="relative h-full w-full" style={{ minHeight: h }}>{children}</div>
    </motion.div>
  )
}

export function Switch({ on, onChange, label, hint }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => { sfx('click'); onChange(!on) }} className="w-full flex items-center justify-between gap-3 text-left py-1">
      <span><span className="block text-[13.5px] font-semibold">{label}</span>{hint && <span className="block text-[11.5px]" style={{ color: 'var(--muted)' }}>{hint}</span>}</span>
      <span className="relative shrink-0 w-11 h-6 rounded-full transition-colors" style={{ background: on ? 'var(--copper)' : 'var(--border)' }}>
        <motion.span className="absolute top-0.5 w-5 h-5 rounded-full bg-white" style={{ boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} initial={false} animate={{ left: on ? 22 : 2 }} transition={SPRING} />
      </span>
    </button>
  )
}

export function Range({ value, onChange, min, max, step = 1, label, fmt = (v) => v }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-2"><span className="text-[13.5px] font-semibold">{label}</span><motion.span key={value} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="mono text-[12px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}>{fmt(value)}</motion.span></span>
      <span className="relative block h-6">
        <span className="absolute left-0 right-0 top-1/2 -mt-[3px] h-[6px] rounded-full" style={{ background: 'var(--border)' }} />
        <motion.span className="absolute left-0 top-1/2 -mt-[3px] h-[6px] rounded-full" style={{ background: 'var(--copper)' }} animate={{ width: pct + '%' }} transition={{ duration: 0.12 }} />
        <span className="absolute top-1/2 -mt-[10px] w-5 h-5 rounded-full bg-white pointer-events-none" style={{ left: `calc(${pct}% - ${pct / 5}px)`, border: '2px solid var(--copper)', boxShadow: '0 3px 8px rgba(0,0,0,.25)' }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="absolute inset-0 w-full opacity-0 cursor-pointer" />
      </span>
    </label>
  )
}

export function Stepper({ value, onChange, min = 1, max = 10, label }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13.5px] font-semibold">{label}</span>
      <div className="flex items-center gap-1 rounded-full border border-line p-1" style={{ background: 'var(--surface2)' }}>
        <motion.button type="button" whileTap={{ scale: 0.8 }} onClick={() => { sfx('click'); onChange(Math.max(min, value - 1)) }} className="w-7 h-7 grid place-items-center rounded-full" style={{ background: 'var(--surface)' }} aria-label={'Fewer ' + label}><DIco n="minus" s={14} w={2.4} /></motion.button>
        <span className="w-8 text-center font-bold tabular-nums"><AnimatePresence mode="popLayout" initial={false}><motion.span key={value} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.14 }} className="inline-block">{value}</motion.span></AnimatePresence></span>
        <motion.button type="button" whileTap={{ scale: 0.8 }} onClick={() => { sfx('click'); onChange(Math.min(max, value + 1)) }} className="w-7 h-7 grid place-items-center rounded-full" style={{ background: 'var(--surface)' }} aria-label={'More ' + label}><DIco n="plus" s={14} w={2.4} /></motion.button>
      </div>
    </div>
  )
}

export function PrimaryBtn({ children, onClick, disabled, busy, icon, className = '' }) {
  return (
    <motion.button type="button" onClick={onClick} disabled={disabled} whileHover={disabled ? {} : { y: -3, scale: 1.02 }} whileTap={disabled ? {} : { scale: 0.93 }}
      className={`relative inline-flex items-center justify-center gap-2.5 rounded-full px-9 py-3.5 text-[15px] font-bold ${className}`} style={{ background: 'var(--ink)', color: 'var(--bg)', opacity: disabled ? 0.55 : 1, boxShadow: '0 14px 26px -12px rgba(0,0,0,.6)' }}>
      {icon && <motion.span animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : SPRING}><DIco n={icon} s={18} /></motion.span>}{children}
    </motion.button>
  )
}

/* confetti-style burst — re-triggers when `k` changes */
const BURST_COLORS = ['#B4715A', '#E8B84B', '#3E8ED0', '#2F9C6B', '#C3423F', '#7B6CB0']
export function Burst({ k, n = 26 }) {
  const parts = useRef([])
  if (parts.current.k !== k) { parts.current = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + rndf() * 0.5, d: 90 + rndf() * 120, c: BURST_COLORS[i % BURST_COLORS.length], s: 5 + rndf() * 6, r: rndf() * 540 - 270 })); parts.current.k = k }
  if (!k) return null
  return (
    <div key={k} className="absolute left-1/2 top-1/2 pointer-events-none z-20">
      {parts.current.map((p, i) => (
        <motion.span key={i} className="absolute rounded-[2px]" style={{ width: p.s, height: p.s * 0.55, background: p.c, left: 0, top: 0 }} initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }} animate={{ x: Math.cos(p.a) * p.d, y: Math.sin(p.a) * p.d + 40, opacity: 0, scale: 1, rotate: p.r }} transition={{ duration: 1.15, ease: [0.2, 0.7, 0.3, 1] }} />
      ))}
    </div>
  )
}

export function Result({ k, children, className = '' }) {
  return (
    <AnimatePresence mode="wait">
      {children && <motion.div key={k} initial={{ opacity: 0, y: 14, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={SPRING} className={className}>{children}</motion.div>}
    </AnimatePresence>
  )
}

export function ChipRow({ value, onChange, options, small }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, l]) => (
        <motion.button key={k} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} onClick={() => { sfx('click'); onChange(k) }} className={`relative rounded-full border font-semibold ${small ? 'px-2.5 py-1 text-[11.5px]' : 'px-3.5 py-1.5 text-[12.5px]'}`} style={{ borderColor: value === k ? 'var(--ink)' : 'var(--border)', background: value === k ? 'var(--ink)' : 'var(--surface)', color: value === k ? 'var(--bg)' : 'var(--ink)', transition: 'background .15s, color .15s' }}>{l}</motion.button>
      ))}
    </div>
  )
}

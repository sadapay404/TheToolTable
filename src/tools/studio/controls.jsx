import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CARD_SPRING } from '../../lib/motion.js'
import { clamp } from '../../lib/utils.js'

export const SPRING = CARD_SPRING

/* ----------------------------------------- icons ----------------------------------------- */
const P = {
  looks: <><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>,
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></>,
  color: <><path d="M12 3c4.5 4.6 7 7.6 7 11a7 7 0 0 1-14 0c0-3.4 2.5-6.4 7-11Z" /></>,
  mixer: <><circle cx="9" cy="9" r="5.5" /><circle cx="15" cy="9" r="5.5" /><circle cx="12" cy="15" r="5.5" /></>,
  grade: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v6M18.4 16l-5.2-3M5.6 16l5.2-3" /></>,
  fx: <><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="M19 16v4M17 18h4M5 17v3M3.5 18.5h3" /></>,
  crop: <><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" /></>,
  export: <><path d="M12 15V3m0 0 4 4m-4-4-4 4" /><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>,
  compare: <><path d="M12 3v18" /><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h2m6 0h2" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  wand: <><path d="m15 4 1 2.5L18.5 7.5 16 8.5 15 11l-1-2.5L11.5 7.5 14 6.5 15 4Z" /><path d="m3 21 11-11" /></>,
  drop: <><path d="m3 21 4-1L20.3 6.7a2.1 2.1 0 0 0-3-3L4 17l-1 4Z" /><path d="m15 5 4 4" /></>,
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></>,
  vol: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="m17 9 5 6m0-6-5 6" /></>,
  rotate: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
  flipH: <><path d="M12 3v18" /><path d="M8 7 3 12l5 5V7ZM16 7l5 5-5 5V7Z" /></>,
  flipV: <><path d="M3 12h18" /><path d="M7 8l5-5 5 5H7ZM7 16l5 5 5-5H7Z" /></>,
  save: <><path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M7 3v5h8M7 21v-7h10v7" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M20 6 9 17l-5-5" />,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  brush: <><path d="M9.06 11.9 18.4 2.6a2.1 2.1 0 0 1 3 3l-9.3 9.3" /><path d="M7.1 13.4c-2 0-3.6 1.6-3.6 3.6 0 1.4-.8 2.6-2 3.3 1 .5 2.3.7 3.4.7 2.5 0 4.7-2 4.7-4.5 0-1-.7-3-2.5-3.1Z" /></>,
  eraser: <><path d="m7 21-4.3-4.3a1.5 1.5 0 0 1 0-2.1l10-10a1.5 1.5 0 0 1 2.1 0l5.5 5.5a1.5 1.5 0 0 1 0 2.1L11 21H7Z" /><path d="M21 21H7M9 9l7 7" /></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  shadow: <><circle cx="10" cy="9" r="5" /><path d="M5 19c2 1.4 4.200 2 7 2s5-.6 7-2" /></>,
  grid: <><path d="M3 3h18v18H3z" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 4 5.700 4 9s-1.400 6.400-4 9c-2.600-2.600-4-5.700-4-9s1.400-6.400 4-9Z" /></>,
  chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.500" y="9.500" width="5" height="5" rx="1" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
  stepBack: <><path d="M6 5v14" /><path d="M19 5v14L9 12l10-7Z" /></>,
  stepFwd: <><path d="M18 5v14" /><path d="M5 5v14l10-7L5 5Z" /></>,
  back10: <><path d="M11 6v12l-8-6 8-6Z" /><path d="M21 6v12l-8-6 8-6Z" /></>,
  fwd10: <><path d="M13 6v12l8-6-8-6Z" /><path d="M3 6v12l8-6-8-6Z" /></>,
  camera: <><path d="M4 8h3l1.500-2.500h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.500" /></>,
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.100 15.900M14.500 14.500 20 20M8.100 8.100 12 12" /></>,
  gif: <><rect x="3" y="6" width="14" height="12" rx="2" /><path d="M20 8v8M7 3h12a2 2 0 0 1 2 2v1" /></>,
  loop: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  flagIn: <><path d="M5 3v18M5 4h11l-2.500 4L16 12H5" /></>,
  film2: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4" /></>,
  zip: <><path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M11 3v3M13 6v3M11 9v3M13 12v3" /></>,
  viz: <><path d="M4 20V11M9 20V5M14 20v-9M19 20V8" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.2-1-1.5-1-2.6 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z" /><circle cx="7.5" cy="11" r="1.1" /><circle cx="10" cy="7" r="1.1" /><circle cx="15" cy="7.5" r="1.1" /></>,
  type: <><path d="M5 6V4h14v2M12 4v16M9 20h6" /></>,
  motion: <><path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="9" cy="9" r="1.2" /><circle cx="15" cy="9" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="9" cy="15" r="1.2" /><circle cx="15" cy="15" r="1.2" /></>,
  music: <><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  expand: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  zoom: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></>,
}
export function Icon({ n, s = 18, w = 1.7, className = '' }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={['play', 'pause'].includes(n) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className}>{P[n]}</svg>
}

/* ----------------------------------------- slider ----------------------------------------- */
export function Slider({ label, value, min = -100, max = 100, step = 1, def = 0, onChange, track, fmt, suffix = '', disabled = false }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  const [shake, setShake] = useState(0)
  const pct = ((value - min) / (max - min)) * 100
  const o = ((def - min) / (max - min)) * 100
  const snap = (v) => clamp(Math.round(v / step) * step, min, max)
  const fromEvent = (e) => { const r = ref.current.getBoundingClientRect(); return snap(min + ((e.clientX - r.left) / r.width) * (max - min)) }
  const changed = Math.abs(value - def) > 1e-9
  const shown = fmt ? fmt(value) : (step < 1 ? value.toFixed(2) : Math.round(value)) + suffix

  return (
    <div className={`group select-none ${disabled ? 'opacity-55' : ''}`} onDoubleClick={() => { if (!disabled) { onChange(def); setShake((n) => n + 1) } }} title={disabled ? undefined : 'Double-click to reset'}>
      <div className="flex items-center justify-between mb-1.5">
        <motion.span key={shake} className="text-[12px] font-semibold" animate={shake ? { x: [0, -3, 3, -2, 0] } : {}} transition={{ duration: 0.3 }}
          style={{ color: changed ? 'var(--ink)' : 'var(--muted)' }}>{label}</motion.span>
        <span className="flex items-center gap-1.5">
          <AnimatePresence>
            {changed && (
              <motion.button initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.4 }} transition={SPRING}
                disabled={disabled} className="w-3.5 h-3.5 grid place-items-center rounded-full" style={{ color: 'var(--muted)' }} onClick={() => onChange(def)} aria-label={`Reset ${label}`}>
                <Icon n="reset" s={11} w={2.2} />
              </motion.button>
            )}
          </AnimatePresence>
          <span className="mono text-[11.5px] tabular-nums min-w-[34px] text-right font-semibold" style={{ color: changed ? 'var(--copper)' : 'var(--muted)' }}>{shown}</span>
        </span>
      </div>
      <div
        ref={ref} role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-disabled={disabled} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        className={`relative h-6 touch-none focus:outline-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); onChange(fromEvent(e)) }}
        onPointerMove={(e) => !disabled && drag && onChange(fromEvent(e))}
        onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}
        onKeyDown={(e) => {
          if (disabled) return
          const d = e.shiftKey ? step * 10 : step
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(snap(value + d)) }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(snap(value - d)) }
          if (e.key === 'Home') onChange(def)
        }}
      >
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[5px] rounded-full overflow-hidden" style={{ background: track || 'var(--border)' }}>
          {!track && (
            <motion.div className="absolute top-0 bottom-0 rounded-full" style={{ background: 'var(--copper)' }}
              animate={{ left: `${Math.min(pct, o)}%`, width: `${Math.abs(pct - o)}%` }} transition={drag ? { duration: 0 } : SPRING} />
          )}
        </div>
        {def > min && def < max && <span className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 pointer-events-none" style={{ left: `${o}%`, background: 'var(--muted)', opacity: 0.45 }} />}
        <motion.div
          className="absolute top-1/2 w-[15px] h-[15px] -ml-[7.5px] -mt-[7.5px] rounded-full"
          style={{ background: 'var(--surface)', border: '2.5px solid var(--copper)', boxShadow: '0 2px 7px rgba(0,0,0,.28)' }}
          animate={{ left: `${pct}%`, scale: drag ? 1.35 : 1 }} whileHover={{ scale: 1.2 }} transition={drag ? { left: { duration: 0 }, scale: SPRING } : SPRING}
        />
      </div>
    </div>
  )
}

/* ----------------------------------------- hue wheel ----------------------------------------- */
export function HueWheel({ label, hue, amt, onChange, size = 104 }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  const R = size / 2 - 7
  const rad = ((hue - 90) * Math.PI) / 180
  const px = Math.cos(rad) * R * (amt / 100), py = Math.sin(rad) * R * (amt / 100)

  const apply = (e) => {
    const r = ref.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
    let h = (Math.atan2(dy, dx) * 180) / Math.PI + 90; if (h < 0) h += 360
    onChange(Math.round(h), Math.round(clamp((Math.hypot(dx, dy) / R) * 100, 0, 100)))
  }
  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <motion.div
        ref={ref} className="relative rounded-full cursor-crosshair touch-none" style={{ width: size, height: size }}
        whileHover={{ scale: 1.04 }} transition={SPRING}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); apply(e) }}
        onPointerMove={(e) => drag && apply(e)} onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}
        onDoubleClick={() => onChange(hue, 0)}
        title="Drag to tint · double-click to clear"
      >
        <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, hsl(0 85% 55%), hsl(60 85% 55%), hsl(120 70% 48%), hsl(180 80% 48%), hsl(240 80% 62%), hsl(300 75% 58%), hsl(360 85% 55%))', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15), 0 6px 16px -6px rgba(0,0,0,.4)' }} />
        <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, var(--surface) 0%, color-mix(in srgb, var(--surface) 70%, transparent) 38%, transparent 78%)' }} />
        <svg className="absolute inset-0 pointer-events-none" width={size} height={size}><line x1={size / 2 - 5} y1={size / 2} x2={size / 2 + 5} y2={size / 2} stroke="var(--muted)" strokeWidth="1" opacity=".5" /><line x1={size / 2} y1={size / 2 - 5} x2={size / 2} y2={size / 2 + 5} stroke="var(--muted)" strokeWidth="1" opacity=".5" /></svg>
        <motion.div
          className="absolute w-[17px] h-[17px] rounded-full pointer-events-none"
          style={{ left: size / 2 - 8.5, top: size / 2 - 8.5, background: `hsl(${hue} 90% 55%)`, border: '3px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,.45)' }}
          animate={{ x: px, y: py, scale: drag ? 1.3 : 1 }} transition={drag ? { x: { duration: 0 }, y: { duration: 0 }, scale: SPRING } : SPRING}
        />
      </motion.div>
      <div className="text-center leading-tight">
        <div className="text-[12px] font-semibold">{label}</div>
        <div className="mono text-[10.5px]" style={{ color: amt ? 'var(--copper)' : 'var(--muted)' }}>{amt ? `${hue}° · ${amt}` : 'neutral'}</div>
      </div>
    </div>
  )
}

/* ----------------------------------------- histogram ----------------------------------------- */
export function Histogram({ data }) {
  const ref = useRef(null)
  const cur = useRef(new Float32Array(64 * 3))
  const tgt = useRef(new Float32Array(64 * 3))
  const raf = useRef(0)
  const kick = useRef(() => {})
  useEffect(() => {
    const paint = () => {
      const c = ref.current
      if (!c) return
      const W = c.clientWidth * 2, H = c.clientHeight * 2
      if (!W || !H) return
      /* Only touch the backing store when the size actually changed — assigning
         `c.width` clears and reallocates the canvas even for the same value. */
      if (c.width !== W) c.width = W
      if (c.height !== H) c.height = H
      const x = c.getContext('2d'); x.clearRect(0, 0, W, H)
      const cols = ['rgba(232,70,60,.55)', 'rgba(70,190,95,.55)', 'rgba(70,120,235,.55)']
      x.globalCompositeOperation = 'lighter'
      for (let ch = 0; ch < 3; ch++) {
        x.fillStyle = cols[ch]; x.beginPath(); x.moveTo(0, H)
        for (let i = 0; i < 64; i++) {
          const k = ch * 64 + i
          x.lineTo((i / 63) * W, H - cur.current[k] * H * 0.92)
        }
        x.lineTo(W, H); x.fill()
      }
    }
    /* Ease toward the target only while a change is in flight. A converged
       histogram must not keep a 60 fps canvas loop (and its per-frame
       reallocation) alive for as long as the panel happens to be mounted —
       that was idle battery drain even in Lite. */
    const tick = () => {
      raf.current = 0
      let moving = false
      for (let k = 0; k < cur.current.length; k++) {
        const d = tgt.current[k] - cur.current[k]
        if (d > 1e-4 || d < -1e-4) { cur.current[k] += d * 0.2; moving = true }
        else if (d !== 0) cur.current[k] = tgt.current[k]
      }
      paint()
      if (moving) raf.current = requestAnimationFrame(tick)
    }
    kick.current = () => { if (!raf.current) raf.current = requestAnimationFrame(tick) }
    kick.current()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => paint()) : null
    if (ro && ref.current) ro.observe(ref.current)
    return () => { cancelAnimationFrame(raf.current); raf.current = 0; if (ro) ro.disconnect() }
  }, [])
  useEffect(() => {
    if (data) tgt.current.set(data)
    kick.current()
  }, [data])
  return <canvas ref={ref} className="w-full rounded-lg" style={{ height: 64, background: 'var(--surface2)', border: '1px solid var(--border)' }} />
}

/** 64-bin R/G/B histogram, normalised, from a small 2D canvas. */
export function computeHistogram(canvas) {
  const x = canvas.getContext('2d', { willReadFrequently: true })
  const d = x.getImageData(0, 0, canvas.width, canvas.height).data
  const out = new Float32Array(192)
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; out[d[i] >> 2]++; out[64 + (d[i + 1] >> 2)]++; out[128 + (d[i + 2] >> 2)]++ }
  let mx = 1; for (let i = 0; i < 192; i++) mx = Math.max(mx, out[i])
  const cap = mx * 0.6 // clip spikes so mid-tones stay readable
  for (let i = 0; i < 192; i++) out[i] = Math.min(1, out[i] / cap)
  return out
}

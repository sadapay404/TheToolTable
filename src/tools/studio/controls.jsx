import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { clamp } from '../../lib/utils.js'

export const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

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
  zoom: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></>,
}
export function Icon({ n, s = 18, w = 1.7, className = '' }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={['play', 'pause'].includes(n) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className}>{P[n]}</svg>
}

/* ----------------------------------------- slider ----------------------------------------- */
export function Slider({ label, value, min = -100, max = 100, step = 1, def = 0, onChange, track, fmt, suffix = '' }) {
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
    <div className="group select-none" onDoubleClick={() => { onChange(def); setShake((n) => n + 1) }} title="Double-click to reset">
      <div className="flex items-center justify-between mb-1.5">
        <motion.span key={shake} className="text-[12px] font-semibold" animate={shake ? { x: [0, -3, 3, -2, 0] } : {}} transition={{ duration: 0.3 }}
          style={{ color: changed ? 'var(--ink)' : 'var(--muted)' }}>{label}</motion.span>
        <span className="flex items-center gap-1.5">
          <AnimatePresence>
            {changed && (
              <motion.button initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.4 }} transition={SPRING}
                className="w-3.5 h-3.5 grid place-items-center rounded-full" style={{ color: 'var(--muted)' }} onClick={() => onChange(def)} aria-label={`Reset ${label}`}>
                <Icon n="reset" s={11} w={2.2} />
              </motion.button>
            )}
          </AnimatePresence>
          <span className="mono text-[11.5px] tabular-nums min-w-[34px] text-right font-semibold" style={{ color: changed ? 'var(--copper)' : 'var(--muted)' }}>{shown}</span>
        </span>
      </div>
      <div
        ref={ref} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        className="relative h-6 cursor-pointer touch-none focus:outline-none"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); onChange(fromEvent(e)) }}
        onPointerMove={(e) => drag && onChange(fromEvent(e))}
        onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}
        onKeyDown={(e) => {
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
  useEffect(() => { if (data) tgt.current.set(data) }, [data])
  useEffect(() => {
    let raf
    const loop = () => {
      const c = ref.current
      if (c) {
        const W = (c.width = c.clientWidth * 2), H = (c.height = c.clientHeight * 2)
        const x = c.getContext('2d'); x.clearRect(0, 0, W, H)
        const cols = ['rgba(232,70,60,.55)', 'rgba(70,190,95,.55)', 'rgba(70,120,235,.55)']
        x.globalCompositeOperation = 'lighter'
        for (let ch = 0; ch < 3; ch++) {
          x.fillStyle = cols[ch]; x.beginPath(); x.moveTo(0, H)
          for (let i = 0; i < 64; i++) {
            const k = ch * 64 + i
            cur.current[k] += (tgt.current[k] - cur.current[k]) * 0.2
            x.lineTo((i / 63) * W, H - cur.current[k] * H * 0.92)
          }
          x.lineTo(W, H); x.fill()
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
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

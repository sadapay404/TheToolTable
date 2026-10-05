import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { clamp } from '../lib/utils.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

export function clock(s) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const secStr = sec.toFixed(1).padStart(4, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${secStr}` : `${m}:${secStr}`
}

export function parseClock(str) {
  const parts = String(str).trim().split(':').map(Number)
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null
  return parts.reduce((a, n) => a * 60 + n, 0)
}

/** Editable mm:ss.s field that commits on blur / Enter */
export function TimeField({ label, value, onCommit, disabled = false }) {
  const [txt, setTxt] = useState(clock(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setTxt(clock(value)) }, [value, focus])
  const commit = () => { if (!disabled) { const v = parseClock(txt); if (v != null) onCommit(v) } setFocus(false) }
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="input mt-1.5 tabular-nums text-center font-semibold" value={txt} disabled={disabled}
        onFocus={() => setFocus(true)} onChange={(e) => setTxt(e.target.value)}
        onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )
}

/**
 * Dual-handle range with optional waveform peaks. Drag a handle, or press anywhere
 * on the track to pull the nearest handle there. Arrow keys nudge the focused handle.
 */
export default function RangeTrack({ duration, start, end, onChange, peaks, playhead, height = 76 }) {
  const trackRef = useRef(null)
  const canvasRef = useRef(null)
  const [drag, setDrag] = useState(null) // 'a' | 'b'
  const pct = (t) => (duration ? (t / duration) * 100 : 0)
  const minGap = Math.min(duration, Math.max(0.001, Math.min(0.1, duration / 2000)))

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const W = (c.width = c.clientWidth * 2), H = (c.height = height * 2)
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    const css = getComputedStyle(document.documentElement)
    const on = css.getPropertyValue('--copper') || '#B4715A', off = css.getPropertyValue('--border') || '#ccc'
    const n = peaks?.length || 90
    for (let i = 0; i < n; i++) {
      const t = (i / n) * duration
      const active = t >= start && t <= end
      ctx.fillStyle = active ? on : off
      const v = peaks ? peaks[i] : 0.25 + 0.2 * Math.sin(i * 0.55) * Math.cos(i * 0.17)
      const h = Math.max(4, v * H * 0.85)
      ctx.fillRect(i * (W / n) + 1, (H - h) / 2, Math.max(2, W / n - 3), h)
    }
  }, [peaks, start, end, duration, height])

  function timeAt(e) {
    const r = trackRef.current.getBoundingClientRect()
    return clamp(((e.clientX - r.left) / r.width) * duration, 0, duration)
  }
  function move(which, t) {
    if (which === 'a') onChange(clamp(t, 0, end - minGap), end)
    else onChange(start, clamp(t, start + minGap, duration))
  }

  return (
    <div
      ref={trackRef} className="relative select-none cursor-ew-resize rounded-2xl border border-line overflow-hidden"
      style={{ height, background: 'var(--surface2)', touchAction: 'none' }}
      onPointerDown={(e) => {
        const t = timeAt(e)
        const which = Math.abs(t - start) < Math.abs(t - end) ? 'a' : 'b'
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag(which); move(which, t)
      }}
      onPointerMove={(e) => drag && move(drag, timeAt(e))}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {/* dim outside selection */}
      <motion.div className="absolute inset-y-0 left-0" style={{ background: 'color-mix(in srgb, var(--bg) 62%, transparent)' }} animate={{ width: `${pct(start)}%` }} transition={drag ? { duration: 0 } : SPRING} />
      <motion.div className="absolute inset-y-0 right-0" style={{ background: 'color-mix(in srgb, var(--bg) 62%, transparent)' }} animate={{ width: `${100 - pct(end)}%` }} transition={drag ? { duration: 0 } : SPRING} />
      {/* selection frame */}
      <motion.div
        className="absolute inset-y-0 pointer-events-none" style={{ borderTop: '3px solid var(--copper)', borderBottom: '3px solid var(--copper)' }}
        animate={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }} transition={drag ? { duration: 0 } : SPRING}
      />
      {playhead != null && (
        <div className="absolute inset-y-0 w-px pointer-events-none" style={{ left: `${pct(playhead)}%`, background: 'var(--ink)' }} />
      )}
      {[['a', start], ['b', end]].map(([k, t]) => (
        <motion.button
          key={k} type="button" role="slider" tabIndex={0}
          aria-label={k === 'a' ? 'Clip start' : 'Clip end'} aria-valuemin={k === 'a' ? 0 : start + minGap}
          aria-valuemax={k === 'a' ? end - minGap : duration} aria-valuenow={t}
          className="absolute top-0 bottom-0 w-5 -ml-2.5 grid place-items-center cursor-ew-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          animate={{ left: `${pct(t)}%`, scale: drag === k ? 1.12 : 1 }} transition={drag === k ? { duration: 0 } : SPRING}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 1 : 0.1
            if (e.key === 'ArrowLeft') { e.preventDefault(); move(k, t - step) }
            if (e.key === 'ArrowRight') { e.preventDefault(); move(k, t + step) }
          }}
        >
          <span className="block w-1.5 h-9 rounded-full" style={{ background: 'var(--copper)', boxShadow: '0 0 0 3px var(--surface), 0 2px 8px rgba(0,0,0,.3)' }} />
        </motion.button>
      ))}
    </div>
  )
}

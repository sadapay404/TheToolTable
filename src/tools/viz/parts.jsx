import React, { memo, useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Icon, SPRING } from '../studio/controls.jsx'
import { VizRenderer } from '../../lib/viz/render.js'
import { Analyzer, synth, NB } from '../../lib/viz/analyzer.js'
import { usePerf } from '../../lib/perf.js'
import { useDecorativeMotion } from '../../lib/motion.js'

export const clock = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` }
export const clock1 = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}` }

/* ------------------------------------------------ shared live-thumbnail ticker ------------------------------------------------ */
// One rAF loop (≈20 fps) feeds a synthetic signal to every on-screen thumbnail. Off-screen thumbnails cost nothing.
const subs = new Set()
let raf = 0, last = 0
const thumbAn = new Analyzer(), raw = new Float32Array(NB), wave = new Float32Array(512)
function loop(ts) {
  raf = requestAnimationFrame(loop)
  if (ts - last < 47) return
  const dt = Math.min(0.1, (ts - last) / 1000); last = ts
  const bass = synth(ts / 1000, raw, wave, 1)
  thumbAn.feed(raw, wave, dt, 0.55, bass, 1)
  subs.forEach((fn) => fn(ts))
}
function subscribe(fn) {
  subs.add(fn); if (!raf) raf = requestAnimationFrame(loop)
  return () => { subs.delete(fn); if (!subs.size) { cancelAnimationFrame(raf); raf = 0 } }
}
export const thumbParams = (P) => ({ ...P, title: '', subtitle: '', watermark: '', cover: 'off', progress: 'none', showTime: 0, shake: 0, zoom: 0, flash: 0, bgType: P.bgType === 'image' ? 'gradient' : P.bgType })

export function LiveThumb({ P, assets, className = '' }) {
  const cv = useRef(null), pr = useRef(P), as = useRef(assets), vis = useRef(false)
  const perfNow = usePerf(), reduceMotion = useReducedMotion() || perfNow.level === 'lite'
  pr.current = P; as.current = assets
  /* Contents-identical params must not schedule a repaint: the callers build P
     with fresh object literals on every render. */
  const lastDrawn = useRef({ P: null, assets: null })
  const drawStatic = useRef(null)
  useEffect(() => {
    const el = cv.current, ctx = el?.getContext('2d'), rd = new VizRenderer(), W = el?.width || 256, H = el?.height || 144
    if (!ctx) { rd.destroy(); return undefined }
    const paint = () => {
      const bass = synth(0, raw, wave, 1)
      thumbAn.feed(raw, wave, 0.016, 0.55, bass, 1)
      rd.draw(ctx, W, H, thumbAn, thumbParams(pr.current), as.current, 0)
      lastDrawn.current = { P: pr.current, assets: as.current }
    }
    if (reduceMotion) {
      drawStatic.current = paint
      paint()
      return () => { drawStatic.current = null; rd.destroy() }
    }
    drawStatic.current = null
    const io = new IntersectionObserver(([e]) => { vis.current = e.isIntersecting }, { threshold: 0.01 }); io.observe(el)
    const un = subscribe((ts) => { if (vis.current) rd.draw(ctx, W, H, thumbAn, thumbParams(pr.current), as.current, ts) })
    return () => { drawStatic.current = null; un(); io.disconnect(); rd.destroy() }
  }, [reduceMotion])
  /* The animated path reads the refs live on every tick; the static path only
     repaints when the values actually changed. Rebuilding renderer, observer and
     hub subscription for identity-only prop changes — which is what fresh object
     literals from the panels produce — was teardown churn on every panel render,
     for every thumbnail at once. */
  useEffect(() => {
    if (!reduceMotion || !drawStatic.current) return
    const prev = lastDrawn.current
    if (prev.assets === as.current && (prev.P === pr.current || sameParams(prev.P, pr.current))) return
    drawStatic.current()
  }, [reduceMotion, P, assets])
  return <canvas ref={cv} width={256} height={144} className={`block w-full h-full ${className}`} />
}

/* Shallow value compare for the flat param objects VizRenderer receives. */
function sameParams(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => a[k] === b[k])
}

/** A selectable card containing a live thumbnail. */
export const ThumbCard = React.forwardRef(function ThumbCard({ P, on, label, onClick, i = 0, badge, onDelete, sub, assets }, ref) {
  return (
    <motion.button ref={ref} layout type="button" onClick={onClick} className="relative text-left group"
      initial={{ opacity: 0, scale: 0.8, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
      transition={{ ...SPRING, delay: Math.min(i, 14) * 0.024 }} whileHover={{ y: -4, scale: 1.04 }} whileTap={{ scale: 0.92, rotate: -1.2 }}>
      <div className="relative rounded-xl overflow-hidden aspect-video" style={{ background: '#0c0a09', boxShadow: on ? '0 0 0 2.5px var(--copper), 0 8px 20px -8px rgba(0,0,0,.55)' : '0 4px 12px -6px rgba(0,0,0,.5)' }}>
        <LiveThumb P={P} assets={assets} />
        {on && <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full grid place-items-center" style={{ background: 'var(--copper)', color: '#fff' }}><Icon n="check" s={12} w={3} /></motion.span>}
        {badge && <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}>{badge}</span>}
        {onDelete && (
          <span role="button" aria-label="Delete look" onClick={(e) => { e.stopPropagation(); onDelete() }} className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,.65)', color: '#fff' }}><Icon n="trash" s={11} /></span>
        )}
      </div>
      <div className="text-[11px] font-semibold mt-1.5 truncate" style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}>{label}{sub && <span className="font-normal opacity-70"> · {sub}</span>}</div>
    </motion.button>
  )
})

/* ------------------------------------------------ colour field ------------------------------------------------ */
export function ColorField({ label, value, onChange }) {
  return (
    <motion.label whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 cursor-pointer" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <motion.span className="w-7 h-7 rounded-lg shrink-0" style={{ boxShadow: '0 0 0 2px var(--surface), 0 0 0 3px var(--border), 0 3px 8px -2px rgba(0,0,0,.4)' }} animate={{ backgroundColor: value }} transition={{ duration: 0.25 }} />
      <span className="leading-tight min-w-0"><span className="block text-[11px] font-semibold">{label}</span><span className="block mono text-[10.5px] uppercase" style={{ color: 'var(--muted)' }}>{value}</span></span>
      <input type="color" aria-label={`${label} colour`} value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
    </motion.label>
  )
}

/* ------------------------------------------------ live level meter (reads the analyzer; no React re-renders) ------------------------------------------------ */
export function LiveMeter({ an, field, label, hue }) {
  const bar = useRef(null), peak = useRef(null), txt = useRef(null)
  const perfNow = usePerf(), reduceMotion = useReducedMotion() || perfNow.level === 'lite'
  useEffect(() => {
    let id, timer, pk = 0, last = performance.now()
    const update = () => {
      const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now
      const a = an.current; if (!a || !bar.current) return
      const v = Math.min(1, a[field] * 1.6); pk = Math.max(v, pk - 0.7 * dt)
      bar.current.style.transform = `scaleX(${v})`; peak.current.style.left = `${pk * 100}%`; txt.current.textContent = Math.round(v * 100)
    }
    if (reduceMotion) { update(); timer = setInterval(update, 200) }
    else { const f = () => { id = requestAnimationFrame(f); update() }; f() }
    return () => { cancelAnimationFrame(id); clearInterval(timer) }
  }, [an, field, reduceMotion])
  return (
    <div>
      <div className="flex justify-between text-[11px] font-semibold mb-1"><span>{label}</span><span ref={txt} className="mono tabular-nums" style={{ color: 'var(--muted)' }}>0</span></div>
      <div className="relative h-[9px] rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--ink) 10%, transparent)' }}>
        <div ref={bar} className="absolute inset-0 rounded-full origin-left" style={{ background: hue || 'var(--copper)', transform: 'scaleX(0)' }} />
        <span ref={peak} className="absolute top-0 bottom-0 w-[2px]" style={{ background: 'var(--ink)', opacity: 0.6 }} />
      </div>
    </div>
  )
}
export function BeatDot({ an }) {
  const el = useRef(null), perfNow = usePerf(), reduceMotion = useReducedMotion() || perfNow.level === 'lite'
  useEffect(() => {
    if (reduceMotion) { if (el.current) { el.current.style.transform = 'scale(1)'; el.current.style.opacity = '0.75' } return }
    let id; const f = () => { id = requestAnimationFrame(f); const a = an.current; if (!a || !el.current) return; el.current.style.transform = `scale(${0.55 + a.beat * 0.8})`; el.current.style.opacity = 0.25 + a.beat * 0.75 }
    f(); return () => cancelAnimationFrame(id)
  }, [an, reduceMotion])
  return <span ref={el} className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: 'var(--copper)', boxShadow: '0 0 14px var(--copper)' }} />
}

/* ------------------------------------------------ waveform scrubber with export-range handles ------------------------------------------------ */
const PeakBars = memo(function PeakBars({ peaks, color, grow }) {
  return (
    <div className="absolute inset-0 flex items-center gap-[2px]">
      {peaks.map((p, i) => (
        <motion.span key={i} className="flex-1 rounded-full origin-center" style={{ background: color, height: `${Math.max(8, p * 100)}%`, minWidth: 1 }}
          initial={grow ? { scaleY: 0, opacity: 0 } : false} animate={{ scaleY: 1, opacity: 1 }} transition={{ ...SPRING, delay: grow ? Math.min(0.9, i * 0.004) : 0 }} />
      ))}
    </div>
  )
})

export function WaveScrubber({ peaks, loading, time, dur, range, onSeek, onRange, disabled }) {
  const box = useRef(null), drag = useRef(null)
  const fake = useMemo(() => Array.from({ length: 120 }, (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11))), [])
  const validDur = Number.isFinite(dur) && dur > 0
  const pos = (e) => {
    const r = box.current?.getBoundingClientRect()
    if (!validDur || !r?.width) return 0
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur
  }
  const frac = validDur ? Math.min(1, Math.max(0, time / dur)) : 0
  const a = range && validDur ? Math.min(1, Math.max(0, range[0] / dur)) : 0, b = range && validDur ? Math.min(1, Math.max(0, range[1] / dur)) : 1
  const down = (e) => { if (disabled || !validDur) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = 'seek'; onSeek(pos(e)) }
  const seekKey = (e) => {
    if (disabled || !validDur) return
    const step = e.shiftKey ? 10 : 2
    let next
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = time - step
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = time + step
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = dur
    else return
    e.preventDefault(); onSeek(Math.min(dur, Math.max(0, next)))
  }
  const rangeKey = (k, e) => {
    if (disabled || !range) return
    const start = k === 'a', current = start ? range[0] : range[1], minSpan = Math.min(0.5, dur)
    const min = start ? 0 : Math.min(dur, range[0] + minSpan), max = start ? Math.max(0, range[1] - minSpan) : dur
    const step = e.shiftKey ? 5 : minSpan
    let next
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = current - step
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = current + step
    else if (e.key === 'Home') next = min
    else if (e.key === 'End') next = max
    else return
    e.preventDefault(); e.stopPropagation(); next = Math.min(max, Math.max(min, next))
    onRange(start ? next : range[0], start ? range[1] : next)
  }
  const move = (e) => {
    if (disabled || !drag.current) return
    const t = pos(e)
    if (drag.current === 'seek') onSeek(t)
    else if (drag.current === 'a') { const span = Math.min(0.5, dur); onRange(Math.max(0, Math.min(t, range[1] - span)), range[1]) }
    else if (drag.current === 'b') { const span = Math.min(0.5, dur); onRange(range[0], Math.min(dur, Math.max(t, range[0] + span))) }
  }
  const up = () => { drag.current = null }
  const handle = (k, f) => (
    <motion.div role="slider" aria-label={`${k === 'a' ? 'Start' : 'End'} of export range`} aria-valuemin={k === 'a' ? 0 : Math.min(dur, range[0] + Math.min(0.5, dur))} aria-valuemax={k === 'a' ? Math.max(0, range[1] - Math.min(0.5, dur)) : dur} aria-valuenow={Math.round(k === 'a' ? range[0] : range[1])} aria-valuetext={clock1(k === 'a' ? range[0] : range[1])} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} className={`absolute top-[-4px] bottom-[-4px] w-5 -ml-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-ew-resize'} touch-none z-20 grid place-items-center`} style={{ left: `${f * 100}%` }}
      onKeyDown={(e) => rangeKey(k, e)} onPointerDown={(e) => { if (disabled || !validDur) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = k }} onPointerMove={move} onPointerUp={up} onPointerCancel={up} whileHover={disabled ? undefined : { scale: 1.2 }} whileTap={disabled ? undefined : { scale: 1.35 }}>
      <span className="w-[5px] h-full rounded-full" style={{ background: 'var(--copper)', boxShadow: '0 0 0 1px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.5)' }} />
      <span className="absolute top-1/2 -translate-y-1/2 w-3 h-5 rounded-md" style={{ background: 'var(--copper)', boxShadow: '0 2px 6px rgba(0,0,0,.5)', left: k === 'a' ? 10 : -2 }}/>
    </motion.div>
  )
  const arr = peaks || fake
  return (
    <div ref={box} className={`relative h-[52px] select-none ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} touch-none`} onKeyDown={seekKey} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="group" tabIndex={disabled ? -1 : 0} aria-label={`Audio waveform. Use arrow keys to seek; current position ${clock(time)} of ${clock(dur)}.`} aria-disabled={disabled}>
      <div className={`absolute inset-0 ${peaks ? '' : loading ? 'shimmer' : ''}`} style={{ opacity: peaks ? 1 : 0.35 }}><PeakBars key={peaks ? 'real' : 'fake'} peaks={arr} color="rgba(255,255,255,.28)" grow /></div>
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${frac * 100}%`, transition: 'width 70ms linear' }}>
        <div className="absolute inset-y-0 left-0" style={{ width: box.current ? box.current.clientWidth : 600 }}><PeakBars peaks={arr} color="var(--copper)" /></div>
      </div>
      {range && validDur && <>
        <div className="absolute inset-y-0 left-0 rounded-l-md" style={{ width: `${a * 100}%`, background: 'rgba(14,12,11,.62)' }} />
        <div className="absolute inset-y-0 right-0 rounded-r-md" style={{ width: `${(1 - b) * 100}%`, background: 'rgba(14,12,11,.62)' }} />
        <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%`, borderTop: '2px solid var(--copper)', borderBottom: '2px solid var(--copper)', opacity: 0.8 }} />
        {handle('a', a)}{handle('b', b)}
      </>}
      <div className="absolute top-[-3px] bottom-[-3px] w-[2px] rounded-full pointer-events-none z-10" style={{ left: `${frac * 100}%`, background: '#fff', boxShadow: '0 0 10px rgba(255,255,255,.8)', transition: 'left 70ms linear' }} />
    </div>
  )
}

/* ------------------------------------------------ hero art for the drop zone ------------------------------------------------ */
export function HeroBars({ loading }) {
  const decorative = useDecorativeMotion()
  const n = 28
  return (
    <div className="flex items-end justify-center gap-[5px] h-16 mb-4">
      {Array.from({ length: n }, (_, i) => {
        const base = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21))
        return <motion.span key={i} className="w-[5px] rounded-full origin-bottom" style={{ background: 'var(--copper)', height: '100%', opacity: 0.35 + 0.65 * (1 - Math.abs(i - n / 2) / (n / 2)) }}
          initial={{ scaleY: 0.05 }} animate={decorative ? { scaleY: [base * 0.3, base, base * 0.45, base * 0.9, base * 0.3] } : { scaleY: base }} transition={decorative ? { duration: loading ? 0.7 : 2.4 + (i % 5) * 0.25, repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 } : { duration: 0.4 }} />
      })}
    </div>
  )
}

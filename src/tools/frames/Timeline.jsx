import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { clock } from '../../components/RangeTrack.jsx'
import { clamp } from '../../lib/utils.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

function niceStep(d) {
  for (const s of [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]) if (d / s <= 10) return s
  return 3600
}

/**
 * Filmstrip timeline: drag anywhere to scrub the playhead (frame-snapped), drag the copper in / out
 * handles to set the selection. Thumbnails fade in as they are decoded.
 */
export default function Timeline({ duration, fps, t, start, end, thumbs, slots, onSeek, onRange, playing }) {
  const ref = useRef(null)
  const mode = useRef(null)
  const [active, setActive] = useState(null)
  const pct = (x) => (duration ? (x / duration) * 100 : 0)
  const snap = (x) => clamp(Math.round(x * fps) / fps, 0, duration)
  const at = (e) => { const r = ref.current.getBoundingClientRect(); return clamp(((e.clientX - r.left) / r.width) * duration, 0, duration) }
  const minGap = Math.min(1 / Math.max(1, fps), duration)

  const apply = (k, x) => {
    const v = snap(x)
    if (k === 'a') onRange(Math.min(v, end - minGap), end)
    else if (k === 'b') onRange(start, Math.max(v, start + minGap))
    else onSeek(v)
  }
  const down = (e) => {
    const h = e.target.closest?.('[data-h]')?.dataset.h
    mode.current = h || 'p'
    setActive(mode.current)
    e.currentTarget.setPointerCapture(e.pointerId)
    apply(mode.current, at(e))
  }
  const move = (e) => { if (mode.current) apply(mode.current, at(e)) }
  const up = () => { mode.current = null; setActive(null) }

  const step = niceStep(duration)
  const ticks = []
  for (let s = 0; s <= duration + 1e-6; s += step) ticks.push(s)

  return (
    <div className="select-none">
      <div className="relative">
        {/* in / out flags */}
        <AnimatePresence>
          {active && active !== 'p' && (
            <motion.div key="flag" initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={SPRING}
              className="absolute -top-8 z-20 -translate-x-1/2 px-2 py-0.5 rounded-md mono text-[11px] font-bold pointer-events-none"
              style={{ left: `${pct(active === 'a' ? start : end)}%`, background: 'var(--copper)', color: '#fff', boxShadow: '0 6px 14px -6px rgba(0,0,0,.5)' }}>
              {active === 'a' ? 'IN ' : 'OUT '}{clock(active === 'a' ? start : end)}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          className="relative h-[72px] rounded-2xl overflow-hidden cursor-col-resize touch-none"
          style={{ background: 'color-mix(in srgb, var(--ink) 88%, #000)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,.5), 0 0 0 1px var(--border)' }}>
          {/* thumbnails */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: slots }, (_, i) => (
              <div key={i} className="relative flex-1 h-full overflow-hidden" style={{ borderRight: '1px solid rgba(0,0,0,.35)' }}>
                {thumbs[i] ? <motion.img src={thumbs[i]} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" initial={{ opacity: 0, scale: 1.15 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45 }} />
                  : <div className="absolute inset-0 shimmer" style={{ opacity: 0.35 }} />}
              </div>
            ))}
          </div>
          {/* dim outside selection */}
          <motion.div className="absolute inset-y-0 left-0 pointer-events-none" style={{ background: 'rgba(14,11,9,.72)' }} initial={false} animate={{ width: `${pct(start)}%` }} transition={active === 'a' ? { duration: 0 } : SPRING} />
          <motion.div className="absolute inset-y-0 right-0 pointer-events-none" style={{ background: 'rgba(14,11,9,.72)' }} initial={false} animate={{ width: `${100 - pct(end)}%` }} transition={active === 'b' ? { duration: 0 } : SPRING} />
          {/* selection frame */}
          <motion.div className="absolute inset-y-0 pointer-events-none" style={{ borderTop: '3px solid var(--copper)', borderBottom: '3px solid var(--copper)' }} initial={false}
            animate={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }} transition={active === 'a' || active === 'b' ? { duration: 0 } : SPRING} />
          {/* handles */}
          {[['a', start], ['b', end]].map(([k, v]) => (
            <motion.div key={k} data-h={k} aria-label={k === 'a' ? 'In point' : 'Out point'} role="slider" tabIndex={0}
              className="absolute top-0 bottom-0 w-5 -ml-2.5 grid place-items-center cursor-ew-resize outline-none z-10"
              initial={false} animate={{ left: `${pct(v)}%`, scale: active === k ? 1.1 : 1 }} transition={active === k ? { duration: 0 } : SPRING}
              onKeyDown={(e) => { const d = (e.shiftKey ? 10 : 1) / fps; if (e.key === 'ArrowLeft') apply(k, v - d); if (e.key === 'ArrowRight') apply(k, v + d) }}>
              <span data-h={k} className="block w-[7px] h-11 rounded-full" style={{ background: 'var(--copper)', boxShadow: '0 0 0 2.5px rgba(255,255,255,.95), 0 4px 10px rgba(0,0,0,.5)' }} />
            </motion.div>
          ))}
          {/* playhead */}
          <div className="absolute inset-y-0 w-0 pointer-events-none z-10" style={{ left: `${pct(t)}%` }}>
            <span className="absolute inset-y-0 -left-px w-[2px]" style={{ background: '#fff', boxShadow: '0 0 10px rgba(255,255,255,.9), 0 0 0 1px rgba(0,0,0,.25)' }} />
            <motion.span className="absolute -top-[1px] -left-[6px] w-3 h-3 rounded-b-md" animate={{ scale: playing ? [1, 1.25, 1] : 1 }} transition={{ repeat: playing ? Infinity : 0, duration: 0.9 }} style={{ background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,.5)' }} />
          </div>
        </div>
      </div>

      {/* ruler */}
      <div className="relative h-6 mt-1.5 text-[10px] mono" style={{ color: 'var(--muted)' }}>
        {ticks.map((s, i) => (
          <motion.span key={s} className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct(s)}%` }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
            <span className="w-px h-1.5" style={{ background: 'var(--border)' }} />
            <span className="mt-0.5 tabular-nums" style={{ transform: i === 0 ? 'translateX(40%)' : i === ticks.length - 1 && pct(s) > 96 ? 'translateX(-40%)' : 'none' }}>{clock(s).replace(/\.0$/, '')}</span>
          </motion.span>
        ))}
      </div>
    </div>
  )
}

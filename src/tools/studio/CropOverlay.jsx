import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { clamp } from '../../lib/utils.js'
import { SPRING } from './controls.jsx'

const MIN = 0.04

/** Largest centred rect with pixel-aspect A inside an (ow × oh) image, in normalised coords. */
export function fitAspect(A, ow, oh) {
  const k = ow / (A * oh) // h = w * k
  let w = 1, h = k
  if (h > 1) { h = 1; w = 1 / k }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

export default function CropOverlay({ rect, onChange, lock, ow, oh }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(null)
  const k = lock ? ow / (lock * oh) : null

  const pt = (e) => { const r = ref.current.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)] }

  function compute(mode, s, [px, py], [x0, y0]) {
    if (mode === 'move') {
      const x = clamp(s.x + (px - x0), 0, 1 - s.w), y = clamp(s.y + (py - y0), 0, 1 - s.h)
      return { ...s, x, y }
    }
    const L = s.x, T = s.y, Rr = s.x + s.w, B = s.y + s.h
    const corner = mode.length === 2
    if (!k) { // free
      let l = L, t = T, r = Rr, b = B
      if (mode.includes('w')) l = clamp(px, 0, Rr - MIN)
      if (mode.includes('e')) r = clamp(px, L + MIN, 1)
      if (mode.includes('n')) t = clamp(py, 0, B - MIN)
      if (mode.includes('s')) b = clamp(py, T + MIN, 1)
      return { x: l, y: t, w: r - l, h: b - t }
    }
    if (corner) { // anchored at the opposite corner, aspect locked
      const ax = mode.includes('w') ? Rr : L, ay = mode.includes('n') ? B : T
      const sx = mode.includes('w') ? -1 : 1, sy = mode.includes('n') ? -1 : 1
      let w = Math.max(MIN, Math.abs(px - ax)), h = Math.max(MIN, Math.abs(py - ay))
      if (w * k <= h) h = w * k; else w = h / k
      const maxW = sx > 0 ? 1 - ax : ax, maxH = sy > 0 ? 1 - ay : ay
      const f = Math.min(1, maxW / w, maxH / h); w *= f; h *= f
      return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h }
    }
    // edge handle with lock → scale about the opposite edge, centred on the other axis
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2
    let w, h
    if (mode === 'e' || mode === 'w') { w = Math.max(MIN, mode === 'e' ? px - L : Rr - px); h = w * k } else { h = Math.max(MIN, mode === 's' ? py - T : B - py); w = h / k }
    const f = Math.min(1, (2 * Math.min(cx, 1 - cx)) / w, (2 * Math.min(cy, 1 - cy)) / h)
    // keep the anchored edge fixed
    w *= f; h *= f
    let x = cx - w / 2, y = cy - h / 2
    if (mode === 'e') x = L; if (mode === 'w') x = Rr - w; if (mode === 'n') y = B - h; if (mode === 's') y = T
    x = clamp(x, 0, 1 - w); y = clamp(y, 0, 1 - h)
    return { x, y, w, h }
  }

  const down = (mode) => (e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDrag({ mode, s: rect, p0: pt(e) }) }
  const move = (e) => { if (drag) onChange(compute(drag.mode, drag.s, pt(e), drag.p0)) }
  const up = () => setDrag(null)

  const H = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]]
  const cursor = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }
  const t = drag ? { duration: 0 } : SPRING

  return (
    <div ref={ref} className="absolute inset-0 touch-none" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <motion.div
        className="absolute cursor-move" initial={false}
        animate={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} transition={t}
        style={{ boxShadow: '0 0 0 9999px rgba(8,6,4,.62)', border: '1.5px solid rgba(255,255,255,.95)' }}
        onPointerDown={down('move')}
      >
        {[33.33, 66.66].map((p) => (
          <React.Fragment key={p}>
            <span className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${p}%`, background: 'rgba(255,255,255,.35)' }} />
            <span className="absolute left-0 right-0 h-px pointer-events-none" style={{ top: `${p}%`, background: 'rgba(255,255,255,.35)' }} />
          </React.Fragment>
        ))}
        {H.map(([m, fx, fy]) => {
          const corner = m.length === 2
          return (
            <motion.span
              key={m} onPointerDown={down(m)} whileHover={{ scale: 1.35 }} whileTap={{ scale: 1.5 }}
              className="absolute block"
              style={{
                left: `${fx * 100}%`, top: `${fy * 100}%`, cursor: cursor[m], marginLeft: corner ? -6 : m === 'n' || m === 's' ? -14 : -3, marginTop: corner ? -6 : m === 'e' || m === 'w' ? -14 : -3,
                width: corner ? 12 : m === 'n' || m === 's' ? 28 : 6, height: corner ? 12 : m === 'e' || m === 'w' ? 28 : 6,
                background: '#fff', borderRadius: corner ? 3 : 4, boxShadow: '0 1px 6px rgba(0,0,0,.5)',
              }}
            />
          )
        })}
      </motion.div>
    </div>
  )
}

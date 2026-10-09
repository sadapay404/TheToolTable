import { perf } from '../../lib/perf.js'
import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { WallRenderer, probe } from '../../lib/wall/renderer.js'
import { drawText, ensureFonts } from '../../lib/wall/textlayer.js'
import { textColorFor } from '../../lib/wall/design.js'
import { contrast } from '../../lib/wall/color.js'
import { Ico, Seg, SPRING, useWall } from './ui.jsx'

const MODES = [['flat', 'Flat'], ['phone', 'Phone'], ['desktop', 'Desktop'], ['call', 'Call'], ['web', 'Web']]
const ASPECT = { phone: 9 / 19.5, desktop: 16 / 10, call: 16 / 9, web: 16 / 10 }
const fit = (a, cw, ch) => (cw / ch > a ? { w: ch * a, h: ch } : { w: cw, h: cw / a })

/* ---------- mock overlays (pure CSS, sized in container units so they scale) ---------- */
function Mock({ mode, tone }) {
  const dark = tone === 'dark' // dark text on light wallpaper
  const fg = dark ? '#14110F' : '#fff', glass = dark ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.16)', line = dark ? 'rgba(20,17,15,.22)' : 'rgba(255,255,255,.32)'
  const base = { position: 'absolute', inset: 0, color: fg, fontFamily: 'Inter, system-ui, sans-serif', containerType: 'size', pointerEvents: 'none' }
  const frost = { background: glass, backdropFilter: 'blur(14px) saturate(1.3)', WebkitBackdropFilter: 'blur(14px) saturate(1.3)', border: `1px solid ${line}` }
  if (mode === 'phone') return (
    <div style={base}>
      <div style={{ position: 'absolute', top: '1.6cqh', left: '50%', transform: 'translateX(-50%)', width: '27cqw', height: '3.1cqh', borderRadius: 99, background: '#050505' }} />
      <div style={{ position: 'absolute', top: '2.2cqh', left: '8cqw', right: '8cqw', display: 'flex', justifyContent: 'space-between', fontSize: '4.2cqw', fontWeight: 600 }}><span>9:41</span><span style={{ display: 'flex', gap: '1.4cqw', alignItems: 'center' }}><i style={{ width: '4cqw', height: '2.2cqw', borderRadius: 2, background: fg, display: 'block' }} /><i style={{ width: '6cqw', height: '2.6cqw', borderRadius: 3, border: `1.5px solid ${fg}`, display: 'block' }} /></span></div>
      <div style={{ position: 'absolute', top: '11cqh', left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontSize: '4.6cqw', fontWeight: 600, opacity: 0.9 }}>Sunday, 4 October</div>
        <div style={{ fontSize: '25cqw', fontWeight: 600, lineHeight: 1.02, letterSpacing: '-0.03em', fontFamily: 'Inter, system-ui, sans-serif' }}>9:41</div>
      </div>
      <div style={{ position: 'absolute', left: '6cqw', right: '6cqw', top: '47cqh', display: 'grid', gap: '1.6cqh' }}>
        {[['Messages', 'Are we still on for tonight?'], ['Calendar', 'Design review · 11:00']].map(([a, b]) => (
          <div key={a} style={{ ...frost, borderRadius: '5cqw', padding: '2.4cqh 4cqw', display: 'flex', gap: '3cqw', alignItems: 'center' }}>
            <i style={{ width: '9cqw', height: '9cqw', borderRadius: '2.6cqw', background: line, display: 'block', flexShrink: 0 }} />
            <span style={{ lineHeight: 1.25 }}><b style={{ fontSize: '3.7cqw', display: 'block' }}>{a}</b><span style={{ fontSize: '3.4cqw', opacity: 0.85 }}>{b}</span></span>
          </div>
        ))}
      </div>
      {[8, 'r'].map((x) => <i key={x} style={{ position: 'absolute', bottom: '6.4cqh', [x === 'r' ? 'right' : 'left']: '8cqw', width: '12cqw', height: '12cqw', borderRadius: '50%', ...frost, display: 'block' }} />)}
      <i style={{ position: 'absolute', bottom: '1.6cqh', left: '50%', transform: 'translateX(-50%)', width: '34cqw', height: '0.9cqh', borderRadius: 99, background: fg, opacity: 0.85, display: 'block' }} />
    </div>
  )
  if (mode === 'desktop') return (
    <div style={base}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5.2cqh', ...frost, borderWidth: '0 0 1px 0', display: 'flex', alignItems: 'center', gap: '2.4cqw', padding: '0 2cqw', fontSize: '1.7cqw', fontWeight: 600 }}><span style={{ width: '1.7cqw', height: '1.7cqw', borderRadius: '50%', background: fg, display: 'block' }} /><span>Studio</span><span style={{ opacity: 0.75, fontWeight: 500 }}>File</span><span style={{ opacity: 0.75, fontWeight: 500 }}>Edit</span><span style={{ opacity: 0.75, fontWeight: 500 }}>View</span><span style={{ marginLeft: 'auto' }}>Sun 9:41</span></div>
      <div style={{ position: 'absolute', left: '21cqw', top: '17cqh', width: '58cqw', height: '52cqh', borderRadius: '2cqw', ...frost, overflow: 'hidden' }}>
        <div style={{ height: '8cqh', borderBottom: `1px solid ${line}`, display: 'flex', alignItems: 'center', gap: '1cqw', padding: '0 1.8cqw' }}>{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <i key={c} style={{ width: '1.3cqw', height: '1.3cqw', borderRadius: '50%', background: c, display: 'block' }} />)}</div>
        <div style={{ padding: '3cqh 3cqw', display: 'grid', gap: '1.6cqh' }}>{[70, 92, 55, 80, 40].map((w, i) => <i key={i} style={{ width: `${w}%`, height: '2.2cqh', borderRadius: 99, background: line, display: 'block' }} />)}</div>
      </div>
      <div style={{ position: 'absolute', bottom: '2.4cqh', left: '50%', transform: 'translateX(-50%)', ...frost, borderRadius: '2.4cqw', padding: '1.1cqh 1.6cqw', display: 'flex', gap: '1.3cqw' }}>
        {['#FF7A59', '#4C9AFF', '#3DD68C', '#FFC53D', '#A78BFA', '#FF5C8A', '#2DD4BF'].map((c) => <i key={c} style={{ width: '4.4cqw', height: '4.4cqw', borderRadius: '1.2cqw', background: `linear-gradient(145deg, ${c}, ${c}99)`, display: 'block' }} />)}
      </div>
    </div>
  )
  if (mode === 'call') return (
    <div style={base}>
      <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs><linearGradient id="sil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={dark ? '#2A211C' : '#0c0a14'} stopOpacity=".88" /><stop offset="1" stopColor={dark ? '#2A211C' : '#0c0a14'} stopOpacity=".95" /></linearGradient></defs>
        <circle cx="80" cy="42" r="14.5" fill="url(#sil)" /><path d="M44 92c0-22 15-32 36-32s36 10 36 32Z" fill="url(#sil)" />
      </svg>
      <div style={{ position: 'absolute', left: '2.4cqw', bottom: '4cqh', ...frost, color: fg, borderRadius: 99, padding: '1.2cqh 1.6cqw', fontSize: '1.9cqw', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.8cqw' }}><i style={{ width: '1.1cqw', height: '1.1cqw', borderRadius: '50%', background: '#3DD68C', display: 'block' }} />Mubashir</div>
      <div style={{ position: 'absolute', right: '2.4cqw', top: '4cqh', display: 'grid', gap: '1.2cqh' }}>{[0, 1, 2].map((i) => <i key={i} style={{ width: '14cqw', height: '8cqh', borderRadius: '1.2cqw', ...frost, display: 'block' }} />)}</div>
    </div>
  )
  if (mode === 'web') return (
    <div style={base}>
      <div style={{ position: 'absolute', top: '4cqh', left: '5cqw', right: '5cqw', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '1.7cqw', fontWeight: 600 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.8cqw', fontSize: '2cqw' }}><i style={{ width: '2.2cqw', height: '2.2cqw', borderRadius: '0.6cqw', background: fg, display: 'block' }} />Northwind</span>
        <span style={{ display: 'flex', gap: '3cqw', opacity: 0.85 }}><span>Product</span><span>Pricing</span><span>Journal</span></span>
        <span style={{ ...frost, borderRadius: 99, padding: '0.8cqh 1.6cqw' }}>Sign in</span>
      </div>
      <div style={{ position: 'absolute', left: '7cqw', top: '30cqh', width: '60cqw' }}>
        <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontWeight: 600, fontSize: '6.6cqw', lineHeight: 1.04, letterSpacing: '-0.02em' }}>Make something people remember.</div>
        <div style={{ fontSize: '1.9cqw', lineHeight: 1.45, opacity: 0.88, marginTop: '2.4cqh', width: '80%' }}>A calmer way to design, share and ship your best work — without the noise.</div>
        <div style={{ display: 'flex', gap: '1.2cqw', marginTop: '4cqh' }}>
          <span style={{ background: fg, color: dark ? '#fff' : '#14110F', borderRadius: 99, padding: '1.4cqh 2.4cqw', fontSize: '1.8cqw', fontWeight: 700 }}>Get started</span>
          <span style={{ ...frost, borderRadius: 99, padding: '1.4cqh 2.4cqw', fontSize: '1.8cqw', fontWeight: 600 }}>Watch demo</span>
        </div>
      </div>
    </div>
  )
  return null
}

const Stage = forwardRef(function Stage({ playing, setPlaying, mode, setMode, fs, onFullscreen, onProbe }, wrapRef) {
  const { d } = useWall()
  const holder = useRef(null), canvas = useRef(null), over = useRef(null)
  const R = useRef(null), live = useRef({ d, playing }), dirty = useRef(true), phase = useRef(0)
  const [box, setBox] = useState({ w: 640, h: 400 })
  const [err, setErr] = useState('')
  const [ready, setReady] = useState(false)
  const reduceMotion = useReducedMotion()
  const [pr, setPr] = useState({ avg: 0.3, min: 0, max: 1, sd: 0.1 })
  live.current = { d, playing }
  const aspect = fs ? box.w / box.h : mode === 'flat' ? d.size.w / d.size.h : ASPECT[mode]

  // measure the free area
  useLayoutEffect(() => {
    const el = holder.current; if (!el) return
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (r.width > 20 && r.height > 20) setBox((b) => (Math.abs(b.cw - r.width) < 1 && Math.abs(b.ch - r.height) < 1 ? b : { ...b, cw: r.width, ch: r.height })) })
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const fb = box.cw ? (fs ? { w: box.cw, h: box.ch } : fit(aspect, box.cw - (mode === 'phone' ? 48 : 28), box.ch - (mode === 'phone' ? 48 : 28))) : { w: 640, h: 400 }
  const W = Math.round(fb.w), H = Math.round(fb.h)

  // renderer lifecycle
  useEffect(() => {
    let loopRaf = 0, warmRaf = 0, idle = 0, idleKind = '', last = performance.now(), dead = false, lastRun = 0
    /* Building the WebGL context and compiling the fragment program is
       synchronous, and on a phone it is the best part of a second. Doing it
       inside the commit that mounts this tool meant nothing at all appeared
       until it finished — the whole screen, chrome included, waited on the GPU.
       Start it after the first paint instead: the tool lands immediately and the
       stage fills in a frame later, over a shimmer that is already moving. */
    const start = () => {
      if (dead) return
      try {
        R.current = new WallRenderer(canvas.current)
        R.current.setDesign(live.current.d, true)
        setReady(true)
      } catch (e) { setErr(e.message) }
    }
    const ric = typeof window !== 'undefined' && window.requestIdleCallback
    warmRaf = requestAnimationFrame(() => {
      if (dead) return
      if (ric) { idleKind = 'ric'; idle = window.requestIdleCallback(start, { timeout: 1200 }) }
      else { idleKind = 'timeout'; idle = setTimeout(start, 48) }
    })
    const loop = (now) => {
      if (dead) return; loopRaf = requestAnimationFrame(loop)
      if (lastRun && now - lastRun < 1000 / perf.fps() - 3) return; lastRun = now
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const { d: dd, playing: pl } = live.current, r = R.current
      if (!r) return
      const moving = r.step(dt)
      if (pl && dd.amp > 0) phase.current = (phase.current + (dt * Math.PI * 2) / dd.loop) % (Math.PI * 2)
      if (moving || dirty.current || (pl && dd.amp > 0)) { if (canvas.current) r.draw(phase.current, canvas.current.width, canvas.current.height); dirty.current = false }
    }
    loopRaf = requestAnimationFrame(loop)
    return () => {
      dead = true
      cancelAnimationFrame(loopRaf)
      cancelAnimationFrame(warmRaf)
      if (idle) { if (idleKind === 'ric') window.cancelIdleCallback(idle); else clearTimeout(idle) }
      R.current?.dispose(); R.current = null
    }
  }, [])
  useEffect(() => { R.current?.setDesign(d); dirty.current = true }, [d])
  useEffect(() => {
    const c = canvas.current; if (!c) return
    const dpr = perf.dpr(2), sc = Math.min(dpr, Math.sqrt(1.5e6 * perf.scale() / Math.max(1, W * H)))
    c.width = Math.max(16, Math.round(W * sc)); c.height = Math.max(16, Math.round(H * sc)); dirty.current = true
    if (over.current) { over.current.width = c.width; over.current.height = c.height }
  }, [W, H])

  // legibility probe (+ text overlay) — debounced
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const p = probe(d, W / H, 0); setPr(p); onProbe?.(p)
        const o = over.current; if (!o) return; const x = o.getContext('2d'); x.clearRect(0, 0, o.width, o.height)
        if (d.text.on) { await ensureFonts(d.text); drawText(x, o.width, o.height, d.text, textColorFor(p.avg)) }
      } catch {}
    }, 140)
    return () => clearTimeout(t)
  }, [d, W, H, mode, fs])

  const tone = pr.avg > 0.42 ? 'dark' : 'light'
  const lw = contrast(pr.avg, 1), lb = contrast(pr.avg, 0.0)
  const frame = mode === 'phone' && !fs

  return (
    <div ref={wrapRef} className={`relative ${fs ? 'bg-black' : ''}`} style={fs ? { width: '100vw', height: '100vh' } : undefined}>
      {!fs && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="min-w-[260px] flex-1 max-w-[420px]"><Seg small value={mode} onChange={setMode} options={MODES} /></div>
          <div className="flex items-center gap-2">
            <motion.span key={tone} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="hidden sm:inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[11.5px] font-semibold" style={{ background: 'var(--surface)' }} title="How readable text is on this background">
              <span className="w-3.5 h-3.5 rounded-full" style={{ background: tone === 'dark' ? '#14110F' : '#fff', border: '1px solid var(--border)' }} />
              Best with {tone === 'dark' ? 'dark' : 'white'} text <span className="mono" style={{ color: 'var(--copper)' }}>{(tone === 'dark' ? lb : lw).toFixed(1)}:1</span>
            </motion.span>
            <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} onClick={() => setPlaying(!playing)} title={playing ? 'Pause motion (Space)' : 'Play motion (Space)'} className="w-9 h-9 rounded-full border border-line grid place-items-center" style={{ background: 'var(--surface)', color: 'var(--copper)' }}><Ico n={playing ? 'pause' : 'play'} s={16} /></motion.button>
            <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} onClick={onFullscreen} title="Full-screen preview (F)" className="w-9 h-9 rounded-full border border-line grid place-items-center" style={{ background: 'var(--surface)', color: 'var(--copper)' }}><Ico n="expand" s={16} /></motion.button>
          </div>
        </div>
      )}
      <div ref={holder} className={fs ? 'absolute inset-0' : 'relative rounded-[26px] border border-line grid place-items-center overflow-hidden'} style={fs ? undefined : { height: 'clamp(300px, 62vh, 620px)', background: 'var(--surface2)', boxShadow: 'var(--shadow)' }} onDoubleClick={onFullscreen}>
        {!fs && <div className="absolute inset-0 pointer-events-none opacity-60" style={{ backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--ink) 12%, transparent) 1px, transparent 1.3px)', backgroundSize: '20px 20px' }} />}
        <motion.div layout={false} className="relative overflow-hidden" initial={false} animate={{ width: W, height: H, borderRadius: frame ? 38 : fs ? 0 : mode === 'flat' ? 8 : 14 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          style={{ boxShadow: fs ? 'none' : frame ? '0 0 0 7px #111, 0 0 0 9px #444, 0 34px 60px -20px rgba(0,0,0,.55)' : '0 30px 60px -24px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.08)' }}>
          <canvas ref={canvas} className="absolute inset-0 w-full h-full" />
          {/* The GPU is still warming up. This is what the user sees in the
              gap, and it moves rather than sitting as a dead grey box. */}
          {!ready && !err && (
            <motion.div
              className="absolute inset-0 overflow-hidden"
              style={{ background: 'var(--surface)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              aria-hidden="true"
            >
              <motion.div
                className="absolute inset-y-0 w-1/2"
                style={{
                  background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--ink) 14%, transparent), transparent)',
                }}
                initial={reduceMotion ? false : { x: '-60%' }}
                animate={reduceMotion ? undefined : { x: ['-60%', '260%'] }}
                transition={{ duration: 1.5, repeat: reduceMotion ? 0 : Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          )}
          <canvas ref={over} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: mode === 'flat' || fs ? 1 : 0.0 }} />
          <AnimatePresence mode="wait" initial={false}>{!fs && mode !== 'flat' && <motion.div key={mode} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}><Mock mode={mode} tone={tone} /></motion.div>}</AnimatePresence>
          {err && <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13px]" style={{ background: 'var(--surface)' }}>{err}<br />Background Canvas Studio needs WebGL2 (any current Chrome, Edge, Firefox or Safari 15+).</div>}
        </motion.div>
        {fs && <button type="button" onClick={onFullscreen} className="absolute top-4 right-4 rounded-full px-4 py-2 text-[12px] font-bold" style={{ background: 'rgba(0,0,0,.45)', color: '#fff', backdropFilter: 'blur(8px)' }}>Exit · Esc</button>}
      </div>
    </div>
  )
})
export default Stage

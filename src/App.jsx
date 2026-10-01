import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { TOOLS } from './toolsRegistry.jsx'
import { THEMES, THEME_ORDER, applyTheme } from './themes.js'
import CommandPalette from './components/CommandPalette.jsx'
import { Logo } from './components/Logo.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

function TiltCard({ tool, onOpen, i }) {
  const ref = useRef(null)
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const rx = useSpring(useTransform(my, [0, 1], [9, -9]), SPRING)
  const ry = useSpring(useTransform(mx, [0, 1], [-11, 11]), SPRING)
  const gx = useTransform(mx, [0, 1], ['0%', '100%'])
  const gy = useTransform(my, [0, 1], ['0%', '100%'])

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: i * 0.045 }}
      className="tilt-wrap"
      style={{ perspective: 1000 }}
    >
      <motion.div
        ref={ref}
        className="card relative overflow-hidden cursor-pointer select-none h-full"
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        onMouseMove={(e) => {
          const r = ref.current.getBoundingClientRect()
          mx.set((e.clientX - r.left) / r.width)
          my.set((e.clientY - r.top) / r.height)
        }}
        onMouseLeave={() => { mx.set(0.5); my.set(0.5) }}
        onClick={() => onOpen(tool)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
      >
        {/* dynamic glow reflection */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: useTransform([gx, gy], ([x, y]) => `radial-gradient(320px at ${x} ${y}, var(--glow), transparent 70%)`) }}
        />
        <div className="relative p-6 flex flex-col gap-3" style={{ transform: 'translateZ(28px)' }}>
          <div className="flex items-start justify-between">
            <div
              className="w-12 h-12 rounded-2xl grid place-items-center text-2xl"
              style={{ background: `color-mix(in srgb, ${tool.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${tool.color} 35%, transparent)` }}
            >
              {tool.icon}
            </div>
            <span className="label mt-1">TOOL {String(tool.n).padStart(2, '0')}</span>
          </div>
          <div>
            <h3 className="font-bold text-[17px] leading-tight">{tool.name}</h3>
            <span className="chip mt-2 pointer-events-none" data-on="false" style={{ cursor: 'default' }}>{tool.tag}</span>
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--muted)' }}>{tool.desc}</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ThemePicker({ theme, setTheme }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <motion.button className="btn" whileTap={{ scale: 0.93 }} onClick={() => setOpen(!open)}>
        <span className="w-3.5 h-3.5 rounded-full" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))' }} />
        {THEMES[theme].name}
        <span style={{ color: 'var(--muted)' }}>▾</span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={SPRING}
            className="card absolute right-0 mt-2 w-56 p-2 z-50"
          >
            {THEME_ORDER.map((id) => (
              <button
                key={id}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-[var(--surface2)] transition-colors"
                onClick={() => { setTheme(id); setOpen(false) }}
              >
                <span className="w-4 h-4 rounded-md border border-[var(--border)]" style={{ background: THEMES[id].vars['--bg'] }} />
                <span className="w-3 h-3 rounded-full" style={{ background: THEMES[id].vars['--accent'] }} />
                {THEMES[id].name}
                {id === theme && <span className="ml-auto" style={{ color: 'var(--accent)' }}>✓</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  const [theme, setThemeState] = useState(() => { try { return localStorage.getItem('ttt-theme') || 'creamy' } catch { return 'creamy' } })
  const [active, setActive] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const setTheme = (id) => { setThemeState(id); applyTheme(id) }

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
      if (e.key === 'Escape') { setPaletteOpen(false); setActive(null) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const openTool = (t) => { setActive(t); window.scrollTo({ top: 0 }) }
  const ActiveComp = useMemo(() => active?.comp, [active])

  return (
    <div className="min-h-screen relative overflow-x-clip">
      <div className="hero-mesh" />
      <div className="glow-orb w-72 h-72 floaty" style={{ background: 'var(--accent)', top: -90, left: -60, opacity: 0.14 }} />
      <div className="glow-orb w-96 h-96 floaty" style={{ background: 'var(--accent2)', top: 200, right: -120, opacity: 0.12, animationDelay: '-3s' }} />

      {/* Sticky top bar */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-line" style={{ background: 'color-mix(in srgb, var(--bg) 78%, transparent)' }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-4">
          <motion.button
            className="flex items-center gap-3 shrink-0" whileTap={{ scale: 0.94 }}
            onClick={() => setActive(null)} title="TheToolTab — Home"
          >
            <Logo className="w-9 h-9 rounded-xl" shadow />
            <div className="text-left leading-none">
              <div className="font-extrabold tracking-tight text-[17px]">TheToolTab</div>
              <div className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--muted)' }}>Multi-Tool Studio</div>
            </div>
          </motion.button>

          <motion.button
            className="btn btn-ghost flex-1 max-w-md mx-auto justify-start gap-3 text-[13px] font-medium"
            style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setPaletteOpen(true)}
          >
            <span>🔎</span> Search 12 tools…
            <span className="ml-auto flex gap-1"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
          </motion.button>

          <ThemePicker theme={theme} setTheme={setTheme} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 pb-24 relative">
        <AnimatePresence mode="wait">
          {!active ? (
            <motion.div key="home" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={SPRING}>
              {/* Hero */}
              <section className="pt-14 pb-10 text-center relative">
                <motion.div className="floaty inline-block mb-5" initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={SPRING}>
                  <Logo className="w-24 h-24 rounded-[26px]" shadow big />
                </motion.div>
                <motion.h1
                  className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]"
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.08 }}
                >
                  Twelve desktop-grade tools.
                  <br />
                  <span style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent2))', WebkitBackgroundClip: 'text', color: 'transparent' }}>
                    One slick tab.
                  </span>
                </motion.h1>
                <motion.p className="mt-4 text-[15px] max-w-xl mx-auto" style={{ color: 'var(--muted)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                  Everything runs locally in your browser — zero uploads, zero quality loss, zero compression unless you explicitly ask for it.
                </motion.p>
                <motion.div className="mt-6 flex items-center justify-center gap-2 flex-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                  <span className="chip">🔒 100% client-side</span>
                  <span className="chip">💎 Lossless by default</span>
                  <span className="chip">⚡ WASM powered</span>
                  <span className="chip">🎨 5 themes</span>
                </motion.div>
              </section>

              {/* Tool grid */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {TOOLS.map((t, i) => <TiltCard key={t.id} tool={t} i={i} onOpen={openTool} />)}
              </section>

              <footer className="mt-20 text-center text-xs" style={{ color: 'var(--muted)' }}>
                TheToolTab · Phase 1 web build — Phase 2: Windows & Android wrappers · All processing happens on your device.
              </footer>
            </motion.div>
          ) : (
            <motion.div key={active.id} initial={{ opacity: 0, y: 24, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -24, scale: 0.985 }} transition={SPRING}>
              <div className="pt-8 pb-6 flex items-center gap-4">
                <motion.button className="btn btn-ghost" whileTap={{ scale: 0.9 }} onClick={() => setActive(null)}>← All tools</motion.button>
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl grid place-items-center text-xl" style={{ background: `color-mix(in srgb, ${active.color} 16%, transparent)` }}>{active.icon}</span>
                  <div>
                    <h2 className="font-extrabold text-xl leading-none">{active.name}</h2>
                    <div className="text-[11px] font-bold tracking-widest uppercase mt-1" style={{ color: 'var(--muted)' }}>Tool {String(active.n).padStart(2, '0')} · {active.tag}</div>
                  </div>
                </div>
              </div>
              <ActiveComp />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onTool={openTool}
        onTheme={(id) => { setTheme(id); setPaletteOpen(false) }}
      />
    </div>
  )
}

import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { TOOLS } from './toolsRegistry.jsx'
import { THEMES, THEME_ORDER, applyTheme } from './themes.js'
import CommandPalette from './components/CommandPalette.jsx'
import { Logo } from './components/Logo.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err) { console.error('TheToolTable crash:', err) }
  render() {
    if (this.state.err) {
      return (
        <div className="card p-8 my-10 text-center">
          <div className="display font-semibold text-[18px]">Something crashed here.</div>
          <pre className="mono text-[11px] mt-4 text-left overflow-auto max-h-48 card p-4" style={{ color: 'var(--muted)' }}>
            {String(this.state.err?.stack || this.state.err).slice(0, 800)}
          </pre>
          <button className="btn btn-primary mt-5" onClick={() => this.setState({ err: null })}>Try again</button>
        </div>
      )
    }
    return this.props.children
  }
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function TiltCard({ tool, onOpen, i }) {
  const ref = useRef(null)
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [7, -7]), SPRING)
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-9, 9]), SPRING)

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: 0.05 * i }}
      className="tilt-stage h-full"
    >
      <motion.div
        ref={ref}
        className="card3d"
        style={{ rotateX: rx, rotateY: ry }}
        onMouseMove={(e) => {
          const r = ref.current.getBoundingClientRect()
          const x = (e.clientX - r.left) / r.width
          const y = (e.clientY - r.top) / r.height
          px.set(x - 0.5)
          py.set(y - 0.5)
          ref.current.style.setProperty('--mx', `${x * 100}%`)
          ref.current.style.setProperty('--my', `${y * 100}%`)
        }}
        onMouseLeave={() => { px.set(0); py.set(0) }}
        onClick={() => onOpen(tool)}
      >
        <div className="sheen" />
        <div className="inner relative p-7 flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <span className="eyebrow">{tool.tag}</span>
            <span className="ghost-num">{String(tool.n).padStart(2, '0')}</span>
          </div>
          <div>
            <h3 className="display font-semibold text-[21px] leading-snug">{tool.name}</h3>
            <p className="text-[13.5px] leading-relaxed mt-2" style={{ color: 'var(--muted)' }}>{tool.desc}</p>
          </div>
          <div className="mt-auto">
            <div className="rule" />
            <div className="text-[11px] font-semibold tracking-[0.14em] uppercase mt-3" style={{ color: 'var(--muted)' }}>Open tool</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ThemePicker({ theme, setTheme }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-theme-menu]')) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  function toggle() {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen((o) => !o)
  }

  return (
    <>
      <button ref={ref} className="btn" onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
        <span className="w-3 h-3 rounded-full border border-[var(--border)]" style={{ background: THEMES[theme].vars['--bg'] }} />
        {THEMES[theme].name}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && ReactDOM.createPortal(
        <div
          data-theme-menu
          className="card fixed w-56 p-2 z-[60]"
          style={{ top: pos.top, right: pos.right, boxShadow: 'var(--shadow-lg)' }}
        >
          {THEME_ORDER.map((id) => (
            <button
              key={id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium hover:bg-[var(--surface2)] transition-colors"
              style={id === theme ? { background: 'var(--surface2)' } : undefined}
              onClick={() => { setTheme(id); setOpen(false) }}
            >
              <span className="w-4 h-4 rounded-[5px] border border-[var(--border)]" style={{ background: THEMES[id].vars['--bg'] }} />
              <span className="w-3 h-3 rounded-full" style={{ background: THEMES[id].vars['--accent'] }} />
              {THEMES[id].name}
              {id === theme && <span className="ml-auto" style={{ color: 'var(--accent)' }}>—</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
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
      <div className="hero-tint" />

      {/* Top bar */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-line" style={{ background: 'color-mix(in srgb, var(--bg) 82%, transparent)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-5">
          <motion.button className="flex items-center gap-3.5 shrink-0" whileTap={{ scale: 0.96 }} onClick={() => setActive(null)}>
            <Logo className="w-9 h-9 rounded-[10px]" shadow />
            <span className="text-left leading-none">
              <span className="display block font-semibold text-[19px] tracking-tight">TheToolTable</span>
              <span className="eyebrow block mt-1" style={{ letterSpacing: '0.24em' }}>By Mubashir</span>
            </span>
          </motion.button>

          <motion.button
            className="btn btn-ghost flex-1 max-w-xs ml-auto justify-start gap-2.5 text-[13px] font-medium"
            style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setPaletteOpen(true)}
          >
            <SearchIcon /> Search the table
            <span className="ml-auto flex gap-1"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
          </motion.button>

          <ThemePicker theme={theme} setTheme={setTheme} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-28 relative">
        <ErrorBoundary>
        <AnimatePresence mode="wait">
          {!active ? (
            <motion.div key="home" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={SPRING}>
              {/* Masthead */}
              <section className="pt-20 pb-16 text-center relative">
                <motion.div
                  className="inline-block mb-8"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 }}
                >
                  <Logo className="w-[104px] h-[104px] rounded-[22px]" shadow big />
                </motion.div>
                <motion.div className="eyebrow mb-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}>
                  By Mubashir
                </motion.div>
                <motion.h1
                  className="display font-semibold text-[42px] md:text-[60px] leading-[1.04] tracking-tight"
                  initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.16 }}
                >
                  Every tool you need,
                  <br />
                  <em className="font-medium" style={{ color: 'var(--accent2)' }}>on one quiet table.</em>
                </motion.h1>
                <motion.p
                  className="mt-6 text-[15px] leading-relaxed max-w-lg mx-auto"
                  style={{ color: 'var(--muted)' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}
                >
                  A private workbench for your files. Everything is processed on this device — nothing is uploaded, and nothing is re-encoded unless you choose to.
                </motion.p>
              </section>

              {/* The table */}
              <motion.div className="flex items-end justify-between mb-7" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                <h2 className="display font-semibold text-[26px]">The table</h2>
                <span className="text-[12px] font-medium" style={{ color: 'var(--muted)' }}>{TOOLS.length} tools · the collection grows</span>
              </motion.div>

              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {TOOLS.map((t, i) => <TiltCard key={t.id} tool={t} i={i} onOpen={openTool} />)}
              </section>

              <footer className="mt-24 pt-8 border-t border-line flex flex-wrap items-center justify-between gap-3 text-[12.5px]" style={{ color: 'var(--muted)' }}>
                <span className="display text-[15px]" style={{ color: 'var(--ink)' }}>TheToolTable</span>
                <span>Crafted by Mubashir · desktop &amp; Android editions forthcoming</span>
              </footer>
            </motion.div>
          ) : (
            <motion.div key={active.id} initial={{ opacity: 0, y: 20, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.99 }} transition={SPRING}>
              <div className="pt-10 pb-8 flex items-center gap-5">
                <motion.button className="btn btn-ghost" whileTap={{ scale: 0.92 }} onClick={() => setActive(null)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
                  The table
                </motion.button>
                <div className="h-6 w-px" style={{ background: 'var(--border)' }} />
                <div>
                  <div className="eyebrow mb-1">Tool {String(active.n).padStart(2, '0')} · {active.tag}</div>
                  <h2 className="display font-semibold text-[26px] leading-none">{active.name}</h2>
                </div>
              </div>
              <ActiveComp />
            </motion.div>
          )}
        </AnimatePresence>
        </ErrorBoundary>
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

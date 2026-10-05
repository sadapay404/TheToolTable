import Footer from './components/Footer.jsx'
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { usePerf, setPerfMode, runBenchmark } from './lib/perf.js'
import { TOOLS } from './toolsRegistry.jsx'
import { THEMES, THEME_ORDER, applyTheme, savedTheme } from './themes.js'
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: 0.035 * i }}
      className="h-full"
    >
      <motion.button
        type="button"
        className="card3d block w-full text-left"
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        onPointerEnter={() => tool.comp.preload?.()}
        onFocus={() => tool.comp.preload?.()}
        onClick={() => onOpen(tool)}
      >
        <div className="sheen" />
        <div className="inner relative p-5 sm:p-7 flex flex-col gap-4 sm:gap-5">
          <div className="flex items-start justify-between">
            <span className="eyebrow">{tool.tag}</span>
            <span className="ghost-num">{String(tool.n).padStart(2, '0')}</span>
          </div>
          <div>
            <h3 className="display font-semibold text-[19px] sm:text-[21px] leading-snug">{tool.name}</h3>
            <p className="text-[13.5px] leading-relaxed mt-2" style={{ color: 'var(--muted)' }}>{tool.desc}</p>
          </div>
          <div className="mt-auto">
            <div className="rule" />
            <div className="text-[11px] font-semibold tracking-[0.08em] uppercase mt-3" style={{ color: 'var(--muted)' }}>Open tool</div>
          </div>
        </div>
      </motion.button>
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
      <button ref={ref} className="btn !px-2 sm:!px-3" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={`Theme: ${THEMES[theme].name}`} title={`Theme: ${THEMES[theme].name}`}>
        <span className="w-3.5 h-3.5 rounded-full border border-[var(--border)]" style={{ background: THEMES[theme].vars['--accent'] }} />
        <span className="hidden sm:inline">{THEMES[theme].name}</span>
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

const PERF_OPTS = [
  ['auto', 'Auto', 'Picks the best profile for this device'],
  ['lite', 'Lite', 'Low-end laptops & phones: no blur or grain, lighter previews'],
  ['balanced', 'Balanced', 'Mid-range phones & laptops'],
  ['full', 'Full', 'High-end machines: every effect at full resolution'],
]
const LEVEL_NAME = { lite: 'Lite', balanced: 'Balanced', full: 'Full' }

function PerfPicker() {
  const p = usePerf()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-perf-menu]')) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const close = () => setOpen(false)
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])
  const toggle = () => {
    if (!open && ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) }) }
    setOpen((o) => !o)
  }
  const bars = p.level === 'lite' ? 1 : p.level === 'balanced' ? 2 : 3
  return (
    <>
      <button ref={ref} className="btn !px-2 sm:!px-3" onClick={toggle} aria-haspopup="menu" aria-expanded={open} title={`Performance: ${LEVEL_NAME[p.level]}${p.mode === 'auto' ? ' (auto)' : ''}`} aria-label="Performance profile">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          {[0, 1, 2].map((i) => <path key={i} d={`M${6 + i * 6} 19V${15 - i * 4}`} opacity={i < bars ? 1 : 0.28} />)}
        </svg>
        <span className="hidden lg:inline">{LEVEL_NAME[p.level]}</span>
      </button>
      {open && ReactDOM.createPortal(
        <div data-perf-menu className="card fixed w-72 p-2 z-[60]" style={{ top: pos.top, right: pos.right, boxShadow: 'var(--shadow-lg)' }}>
          <div className="eyebrow px-3 pt-2 pb-2">Performance</div>
          {PERF_OPTS.map(([id, name, hint]) => (
            <button key={id} className="w-full text-left px-3 py-2.5 rounded-[10px] hover:bg-[var(--surface2)] transition-colors" style={p.mode === id ? { background: 'var(--surface2)' } : undefined} onClick={() => { setPerfMode(id); setOpen(false) }}>
              <span className="flex items-center gap-2 text-sm font-semibold">{name}{id === 'auto' && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>now {LEVEL_NAME[p.level]}</span>}{p.mode === id && <span className="ml-auto" style={{ color: 'var(--accent)' }}>—</span>}</span>
              <span className="block text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{hint}</span>
            </button>
          ))}
          <div className="px-3 pt-2 pb-2 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
            This device: {p.hw.cores} CPU threads{p.hw.mem ? ` · ${p.hw.mem}+ GB RAM` : ''}{p.hw.phone ? ' · phone' : ''}. Exports are never lowered — only previews and effects.
          </div>
        </div>, document.body)}
    </>
  )
}

function ToolLoading() {
  return (
    <div className="py-24 grid place-items-center">
      <motion.div className="w-10 h-10 rounded-full border-[3px]" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--copper)' }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: 'linear', duration: 0.8 }} />
    </div>
  )
}

export default function App() {
  const [theme, setThemeState] = useState(() => savedTheme())
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

  const perfNow = usePerf()
  useEffect(() => { runBenchmark() }, [])
  return (
    <MotionConfig reducedMotion={perfNow.mode === 'lite' ? 'always' : 'user'}>
    <div className="min-h-screen relative overflow-x-clip">
      <div className="hero-tint" />

      {/* Top bar */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-line" style={{ background: 'color-mix(in srgb, var(--bg) 92%, transparent)' }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-6 min-h-16 py-2 flex items-center gap-2 sm:gap-5">
          <motion.button type="button" aria-label="Back to TheToolTable home" className="flex items-center gap-2 sm:gap-3.5 shrink-0" whileTap={{ scale: 0.97 }} onClick={() => setActive(null)}>
            <Logo className="w-8 h-8 sm:w-9 sm:h-9 rounded-[10px]" shadow />
            <span className="text-left leading-none">
              <span className="display block font-semibold text-[16px] sm:text-[19px] tracking-tight">TheToolTable</span>
              <span className="eyebrow hidden sm:block mt-1" style={{ letterSpacing: '0.12em' }}>By Mubashir</span>
            </span>
          </motion.button>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <motion.button
              type="button" aria-label="Search tools" title="Search tools (Ctrl+K)"
              className="btn btn-ghost !px-2 sm:!px-3 sm:flex-1 sm:max-w-xs sm:justify-start sm:gap-2.5 sm:text-[13px] sm:font-medium"
              style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}
              whileTap={{ scale: 0.97 }} onClick={() => setPaletteOpen(true)}
            >
              <SearchIcon />
              <span className="hidden sm:inline">Search the table</span>
              <span className="ml-auto hidden sm:flex gap-1"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
            </motion.button>
            <PerfPicker />
            <ThemePicker theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 pb-16 sm:pb-28 relative">
        <ErrorBoundary>
        <AnimatePresence mode="wait">
          {!active ? (
            <motion.div key="home" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={SPRING}>
              {/* Masthead */}
              <section className="pt-12 pb-10 sm:pt-20 sm:pb-16 text-center relative">
                <motion.div
                  className="inline-block mb-5 sm:mb-8"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 }}
                >
                  <Logo className="w-[76px] h-[76px] sm:w-[104px] sm:h-[104px] rounded-[20px] sm:rounded-[22px]" shadow big />
                </motion.div>
                <motion.div className="eyebrow mb-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}>
                  By Mubashir
                </motion.div>
                <motion.h1
                  className="display font-semibold text-[32px] sm:text-[42px] md:text-[60px] leading-[1.08] tracking-tight"
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
              <motion.div className="flex flex-wrap items-end justify-between gap-1.5 mb-5 sm:mb-7" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                <h2 className="display font-semibold text-[23px] sm:text-[26px]">The table</h2>
                <span className="text-[12px] font-medium" style={{ color: 'var(--muted)' }}>{TOOLS.length} tools · the collection grows</span>
              </motion.div>

              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                {TOOLS.map((t, i) => <TiltCard key={t.id} tool={t} i={i} onOpen={openTool} />)}
              </section>

            </motion.div>
          ) : (
            <motion.div key={active.id} initial={{ opacity: 0, y: 20, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.99 }} transition={SPRING}>
              <div className="pt-6 pb-5 sm:pt-10 sm:pb-8 flex items-center gap-3 sm:gap-5 min-w-0">
                <motion.button type="button" className="btn btn-ghost shrink-0 !px-3 sm:!px-4" whileTap={{ scale: 0.96 }} onClick={() => setActive(null)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
                  <span className="hidden sm:inline">The table</span><span className="sm:hidden">Back</span>
                </motion.button>
                <div className="h-8 w-px shrink-0" style={{ background: 'var(--border)' }} />
                <div className="min-w-0">
                  <div className="eyebrow mb-1 truncate">Tool {String(active.n).padStart(2, '0')} · {active.tag}</div>
                  <h2 className="display font-semibold text-[20px] sm:text-[26px] leading-tight">{active.name}</h2>
                </div>
              </div>
              <Suspense fallback={<ToolLoading />}><ActiveComp /></Suspense>
            </motion.div>
          )}
        </AnimatePresence>
        </ErrorBoundary>
      </main>
      <Footer />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onTool={openTool}
        onTheme={(id) => { setTheme(id); setPaletteOpen(false) }}
      />
    </div>
    </MotionConfig>
  )
}

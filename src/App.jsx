import Footer from './components/Footer.jsx'
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { MotionConfig, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { usePerf, runBenchmark } from './lib/perf.js'
import { useMobile, useCanHover } from './lib/useMedia.js'
import { TOOLS } from './toolsRegistry.jsx'
import { applyTheme, savedTheme, THEMES } from './themes.js'
import CommandPalette from './components/CommandPalette.jsx'
import SaveToast from './components/SaveToast.jsx'
import { Logo } from './components/Logo.jsx'
import { ThemeButton, ThemeSheet, PerfButton, PerfSheet } from './components/Pickers.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err) { console.error('TheToolTable crash:', err) }
  render() {
    if (this.state.err) {
      return (
        <div className="card p-6 sm:p-8 my-10 text-center">
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

function SearchIcon({ s = 16 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  )
}

const HomeIcon = ({ s = 17 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1Z" />
  </svg>
)

/** The one card in the table. Tilts under a real mouse; on a touch screen it presses in and
    springs back instead (tilting on touch is janky and fights the scroll). */
function TiltCard({ tool, onOpen, i, hover }) {
  const ref = useRef(null)
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [7, -7]), SPRING)
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-9, 9]), SPRING)

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: Math.min(0.05 * i, 0.35) }}
      className="tilt-stage h-full"
    >
      <motion.div
        ref={ref}
        className="card3d"
        style={hover ? { rotateX: rx, rotateY: ry } : undefined}
        whileTap={{ scale: 0.975 }}
        onPointerEnter={() => tool.comp.preload?.()}
        onFocus={() => tool.comp.preload?.()}
        onMouseMove={hover ? (e) => {
          const r = ref.current.getBoundingClientRect()
          const x = (e.clientX - r.left) / r.width
          const y = (e.clientY - r.top) / r.height
          px.set(x - 0.5); py.set(y - 0.5)
          ref.current.style.setProperty('--mx', `${x * 100}%`)
          ref.current.style.setProperty('--my', `${y * 100}%`)
        } : undefined}
        onMouseLeave={hover ? () => { px.set(0); py.set(0) } : undefined}
        onClick={() => onOpen(tool)}
      >
        <div className="sheen" />
        <div className="inner relative p-5 sm:p-7 flex flex-col gap-4 sm:gap-5">
          <div className="flex items-start justify-between gap-3">
            <span className="eyebrow">{tool.tag}</span>
            <span className="ghost-num">{String(tool.n).padStart(2, '0')}</span>
          </div>
          <div>
            <h3 className="display font-semibold text-[19px] sm:text-[21px] leading-snug">{tool.name}</h3>
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

function ToolLoading() {
  return (
    <div className="py-24 grid place-items-center">
      <motion.div className="w-10 h-10 rounded-full border-[3px]" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--copper)' }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: 'linear', duration: 0.8 }} />
    </div>
  )
}

/** Fixed bottom dock, phones only: back to the table, search, theme — all inside thumb reach. */
function MobileDock({ onHome, onSearch, onTheme, theme }) {
  const Btn = ({ onClick, label, children }) => (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="flex-1 h-12 rounded-full flex items-center justify-center gap-2 font-semibold text-[12.5px] transition-transform active:scale-95"
      style={{ color: 'var(--ink)' }}>
      {children}
    </button>
  )
  return (
    <div data-mobile-bar className="dock" role="toolbar" aria-label="Tool actions">
      <Btn onClick={onHome} label="Back to the table"><HomeIcon /><span>Table</span></Btn>
      <span className="w-px h-6 self-center shrink-0" style={{ background: 'var(--border)' }} />
      <Btn onClick={onSearch} label="Search the table"><SearchIcon s={17} /><span>Search</span></Btn>
      <span className="w-px h-6 self-center shrink-0" style={{ background: 'var(--border)' }} />
      <Btn onClick={onTheme} label="Change theme">
        <span className="w-4 h-4 rounded-full grid place-items-center" style={{ background: THEMES[theme].vars['--bg'], boxShadow: '0 0 0 1.5px var(--border)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: THEMES[theme].vars['--accent'] }} />
        </span>
        <span>Theme</span>
      </Btn>
    </div>
  )
}

export default function App() {
  const [theme, setThemeState] = useState(() => savedTheme())
  const [active, setActive] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [themeAnchor, setThemeAnchor] = useState(null)   // element the sheet should hang from (desktop)
  const [perfAnchor, setPerfAnchor] = useState(null)
  const mobile = useMobile()
  const hover = useCanHover()

  const setTheme = (id) => { setThemeState(applyTheme(id)) }

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
      if (e.key === 'Escape') { setPaletteOpen(false); setActive(null) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const openTool = (t) => { setActive(t); window.scrollTo({ top: 0 }) }
  const closeSheets = () => { setThemeAnchor(null); setPerfAnchor(null) }
  const ActiveComp = useMemo(() => active?.comp, [active])

  const perfNow = usePerf()
  useEffect(() => { runBenchmark() }, [])
  return (
    <MotionConfig reducedMotion={perfNow.mode === 'lite' ? 'always' : 'user'}>
    <div className="min-h-screen relative overflow-x-clip">
      <div className="hero-tint" />

      {/* Top bar — icon-only on phones, the full row from md up. */}
      <header className="app-bar sticky top-0 z-40 backdrop-blur-xl border-b border-line" style={{ background: 'color-mix(in srgb, var(--bg) 82%, transparent)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center gap-2.5 md:gap-5">
          <motion.button className="flex items-center gap-2.5 md:gap-3.5 shrink-0 min-w-0" whileTap={{ scale: 0.96 }} onClick={() => setActive(null)} aria-label="TheToolTable — home">
            <Logo className="w-8 h-8 md:w-9 md:h-9 rounded-[10px]" shadow />
            <span className="text-left leading-none min-w-0">
              <span className="display block font-semibold text-[17px] md:text-[19px] tracking-tight truncate">TheToolTable</span>
              <span className="eyebrow hidden sm:block mt-1" style={{ letterSpacing: '0.24em' }}>By Mubashir</span>
            </span>
          </motion.button>

          <motion.button
            className="btn btn-ghost md-only flex-1 max-w-xs ml-auto justify-start gap-2.5 text-[13px] font-medium"
            style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setPaletteOpen(true)}
          >
            <SearchIcon /> Search the table
            <span className="ml-auto flex gap-1"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
          </motion.button>

          <div className="flex items-center gap-2 ml-auto md:ml-0">
            <button className="btn btn-icon phone-only" onClick={() => setPaletteOpen(true)} aria-label="Search the table"><SearchIcon s={18} /></button>
            <PerfButton onOpen={setPerfAnchor} />
            <ThemeButton onOpen={setThemeAnchor} theme={theme} />
          </div>
        </div>
      </header>

      <main className={`max-w-6xl mx-auto px-4 sm:px-6 relative ${active ? 'pb-[104px] md:pb-28' : 'pb-20 md:pb-28'}`}>
        <ErrorBoundary>
        {/*
          The home ⇄ tool switch is deliberately a plain keyed mount animation, NOT <AnimatePresence>.
          With `mode="wait"` a long tool run could leave the exiting view animating forever: it faded to
          opacity 0, its exit never reported completion, the arriving view never mounted and the whole
          app looked blank and un-navigable. In the default mode the exiting view was kept mounted as an
          invisible ghost — and React then *reused that instance with its old state* the next time the
          same tool was opened. Mounting the new view and letting React drop the old one cannot fail.
        */}
          {!active ? (
            <motion.div key="home" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
              {/* Masthead */}
              <section className="pt-10 pb-8 sm:pt-20 sm:pb-16 text-center relative">
                <motion.div
                  className="inline-block mb-6 sm:mb-8"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 }}
                >
                  <Logo className="w-[84px] h-[84px] sm:w-[104px] sm:h-[104px] rounded-[20px] sm:rounded-[22px]" shadow big />
                </motion.div>
                <motion.div className="eyebrow mb-4 sm:mb-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}>
                  By Mubashir
                </motion.div>
                <motion.h1
                  className="display font-semibold text-[31px] sm:text-[42px] md:text-[60px] leading-[1.06] sm:leading-[1.04] tracking-tight px-1"
                  initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.16 }}
                >
                  Every tool you need,
                  <br />
                  <em className="font-medium" style={{ color: 'var(--accent2)' }}>on one quiet table.</em>
                </motion.h1>
                <motion.p
                  className="mt-5 sm:mt-6 text-[14px] sm:text-[15px] leading-relaxed max-w-lg mx-auto px-2"
                  style={{ color: 'var(--muted)' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}
                >
                  A private workbench for your files. Everything is processed on this device — nothing is uploaded, and nothing is re-encoded unless you choose to.
                </motion.p>
              </section>

              {/* The table */}
              <motion.div className="flex items-end justify-between gap-3 mb-5 sm:mb-7" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                <h2 className="display font-semibold text-[23px] sm:text-[26px]">The table</h2>
                <span className="text-[12px] font-medium text-right" style={{ color: 'var(--muted)' }}>{TOOLS.length} tools · the collection grows</span>
              </motion.div>

              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {TOOLS.map((t, i) => <TiltCard key={t.id} tool={t} i={i} onOpen={openTool} hover={hover} />)}
              </section>

            </motion.div>
          ) : (
            <motion.div key={active.id} initial={{ opacity: 0, y: 16, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING}>
              {/* Phone: one sticky bar with the way back and the tool's name. Desktop: the original row. */}
              <div className="tool-bar sticky z-30 -mx-4 px-4 py-2.5 flex items-center gap-3 border-b border-line backdrop-blur-xl" style={{ top: 56, background: 'color-mix(in srgb, var(--bg) 88%, transparent)' }}>
                <motion.button className="btn btn-icon shrink-0" whileTap={{ scale: 0.92 }} onClick={() => setActive(null)} aria-label="Back to the table">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
                </motion.button>
                <div className="min-w-0">
                  <div className="eyebrow mb-0.5 truncate">Tool {String(active.n).padStart(2, '0')} · {active.tag}</div>
                  <h2 className="display font-semibold text-[18px] leading-tight truncate">{active.name}</h2>
                </div>
              </div>
              <div className="md-only pt-10 pb-8 items-center gap-5">
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
              <Suspense fallback={<ToolLoading />}><ActiveComp /></Suspense>
            </motion.div>
          )}
        </ErrorBoundary>
      </main>
      <Footer />
      <SaveToast />

      {active && <MobileDock theme={theme} onHome={() => setActive(null)} onSearch={() => setPaletteOpen(true)} onTheme={() => setThemeAnchor(true)} />}

      <ThemeSheet open={!!themeAnchor} onClose={() => setThemeAnchor(null)} anchorEl={themeAnchor} theme={theme} setTheme={setTheme} />
      <PerfSheet open={!!perfAnchor} onClose={() => setPerfAnchor(null)} anchorEl={perfAnchor} />
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

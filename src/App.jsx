import Footer from './components/Footer.jsx'
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { exit, onBackButtonPress } from '@tauri-apps/api/app'
import { AnimatePresence, MotionConfig, motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion'
import { usePerf, setPerfMode, runBenchmark } from './lib/perf.js'
import { TOOLS } from './toolsRegistry.jsx'
import { THEME_CHOICES, SYSTEM_THEME, applyTheme, savedTheme, themeLabel, themeIsDark, themeVars as themeVarsOf, watchSystemTheme } from './themes.js'
import { pushToolHistory, resetToolHistory, resolveBack, installHistorySentinel } from './lib/navigation.js'
import CommandPalette from './components/CommandPalette.jsx'
import MobileNavBar from './components/MobileNavBar.jsx'
import MobileSearch from './components/MobileSearch.jsx'
import { ambientProfile, EASE, DURATION, t, sharedAxis, useCountUp, usePointerDrift, useMotionValueEvent } from './lib/motion.js'
import AmbientField from './components/AmbientField.jsx'
import { AmbientSpinner } from './components/AmbientField.jsx'
import { RevealLine, RevealBlock, RevealRule } from './components/Reveal.jsx'
import { ToolShell, ToolIntro } from './components/ToolChrome.jsx'
import TransferCentre from './components/TransferCentre.jsx'
import { cancelTransfer } from './lib/transfers.js'
import { Logo } from './components/Logo.jsx'
import ToolCard from './components/ToolCard.jsx'
import ToolActions from './components/ToolActions.jsx'
import { ToolIcon } from './components/ToolIcon.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err) { console.error('TheToolTable crash:', err) }
  render() {
    if (this.state.err) {
      return (
        <div className="crash-screen">
          <div className="crash-card">
            <div className="crash-mark" aria-hidden="true">⚠</div>
            <div className="display font-semibold text-[19px]">This tool stopped unexpectedly</div>
            <p className="text-[13px] mt-2" style={{ color: 'var(--on-surface-variant)' }}>
              Your files were not changed. You can go back and pick another tool.
            </p>
            <pre className="mono crash-trace">{String(this.state.err?.stack || this.state.err).slice(0, 700)}</pre>
            <div className="flex flex-wrap gap-2 mt-5">
              <button type="button" className="md3-filled-button" onClick={() => this.setState({ err: null })}>Try again</button>
              <button type="button" className="md3-outlined-button" onClick={() => { this.setState({ err: null }); this.props.onExit?.() }}>Back to all tools</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/** Last line of defence: if the shell itself throws, still show a usable screen. */
function ShellBoundary({ children }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  )
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  )
}

const CARD_ICON_VARIANTS = {
  rest: { rotateY: 0, rotateZ: 0, scale: 1 },
  hover: { rotateY: 180, rotateZ: -8, scale: 1.12, transition: { type: 'spring', stiffness: 300, damping: 18 } },
}
const CARD_NUMBER_VARIANTS = {
  rest: { opacity: 0.08, scale: 1, rotateZ: 0, y: 0 },
  hover: { opacity: 0.22, scale: 1.12, rotateZ: 5, y: -3, transition: SPRING },
}
const CARD_TITLE_VARIANTS = {
  rest: { y: 0 },
  hover: { y: -3, transition: SPRING },
}
const CARD_DESCRIPTION_VARIANTS = {
  rest: { y: 0, opacity: 0.9 },
  hover: { y: -1, opacity: 1, transition: SPRING },
}
const CARD_RULE_VARIANTS = {
  rest: { scaleX: 1 },
  hover: { scaleX: 2.3, transition: { type: 'spring', stiffness: 260, damping: 22 } },
}
const CARD_CTA_VARIANTS = {
  rest: { x: 0 },
  hover: { x: 3, transition: SPRING },
}
const CARD_ARROW_VARIANTS = {
  rest: { x: 0, y: 0, rotate: 0, scale: 1 },
  hover: { x: 5, y: -2, rotate: 8, scale: 1.12, transition: SPRING },
}
const HOME_FILTERS = [
  { id: 'all', label: 'All tools', ids: null },
  { id: 'media', label: 'Media', ids: ['clipper', 'imagestudio', 'compressor', 'frames', 'visualizer', 'voice', 'converter'] },
  { id: 'images', label: 'Images & design', ids: ['metadata', 'imagestudio', 'bgremover', 'backgrounds', 'icons', 'qr'] },
  { id: 'docs', label: 'Documents', ids: ['metadata', 'pdf', 'ocr', 'invoice', 'textlab'] },
  { id: 'everyday', label: 'Everyday', ids: ['units', 'decision', 'pkmoney', 'beam', 'qr'] },
]

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
      <button ref={ref} className="btn !px-2 sm:!px-3" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={`Theme: ${themeLabel(theme)}`} title={`Theme: ${themeLabel(theme)}`}>
        <span className="w-3.5 h-3.5 rounded-full border border-[var(--border)]" style={{ background: themeVarsOf(theme)['--accent'] }} />
        <span className="hidden sm:inline">{themeLabel(theme)}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && ReactDOM.createPortal(
        <div
          data-theme-menu
          className="card fixed w-56 p-2 z-[60]"
          style={{ top: pos.top, right: pos.right, boxShadow: 'var(--shadow-lg)' }}
        >
          {THEME_CHOICES.map((id) => (
            <button
              key={id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium hover:bg-[var(--surface2)] transition-colors"
              style={id === theme ? { background: 'var(--surface2)' } : undefined}
              onClick={() => { setTheme(id); setOpen(false) }}
            >
              <span className="w-4 h-4 rounded-[5px] border border-[var(--border)]" style={{ background: id === SYSTEM_THEME ? 'linear-gradient(135deg, #FCF8FF 50%, #131318 50%)' : themeVarsOf(id)['--bg'] }} />
              <span className="w-3 h-3 rounded-full" style={{ background: id === SYSTEM_THEME ? 'linear-gradient(135deg, #5B4BD6 50%, #C6BFFF 50%)' : themeVarsOf(id)['--accent'] }} />
              {themeLabel(id)}
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
  ['lite', 'Lite', 'Battery-first: no decorative motion, blur or grain'],
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

function MobileControlsSheet({ open, onClose, theme, setTheme }) {
  const perf = usePerf()
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => closeRef.current?.focus(), 40)
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key === 'Tab' && dialogRef.current) {
        const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        if (!controls.length) return
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => { clearTimeout(id); document.removeEventListener('keydown', onKey, true) }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="mobile-controls-overlay sm:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="mobile-controls-title" className="mobile-controls-sheet" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 36, opacity: 0 }} transition={SPRING} onClick={(event) => event.stopPropagation()}>
            <div className="mobile-sheet-handle" aria-hidden="true" />
            <div className="flex items-start gap-4 mb-5">
              <div className="min-w-0 flex-1">
                <div className="eyebrow">Personalize</div>
                <h2 id="mobile-controls-title" className="display text-[22px] font-semibold mt-1">Appearance & motion</h2>
                <p className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>Made for one-hand reach, safely below the status bar.</p>
              </div>
              <button ref={closeRef} type="button" className="mobile-sheet-close" aria-label="Close appearance settings" onClick={onClose}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <section aria-label="Color theme" className="mb-5">
              <div className="flex items-center justify-between mb-2.5"><span className="mobile-section-label">Color theme</span><span className="text-[11px]" style={{ color: 'var(--muted)' }}>{themeLabel(theme)}</span></div>
              <div className="grid grid-cols-2 gap-2">
                {THEME_CHOICES.map((id, index) => {
                  const selected = theme === id
                  return (
                    <motion.button key={id} type="button" whileTap={{ scale: 0.97 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: index * 0.025 }} aria-pressed={selected} onClick={() => setTheme(id)} className="mobile-theme-option" data-selected={selected}>
                      <span className="mobile-theme-swatch" style={{ background: themeVarsOf(id)['--bg'], borderColor: themeVarsOf(id)['--border'] }}><i style={{ background: themeVarsOf(id)['--primary'] || themeVarsOf(id)['--accent'] }} /></span>
                      <span className="min-w-0 text-left"><span className="block font-semibold text-[12.5px] truncate">{themeLabel(id)}</span><span className="block text-[10.5px]" style={{ color: 'var(--muted)' }}>{id === SYSTEM_THEME ? 'System light / dark' : themeIsDark(id) ? 'Dark' : 'Light'}</span></span>
                      {selected && <span className="mobile-theme-check" aria-hidden="true">✓</span>}
                    </motion.button>
                  )
                })}
              </div>
            </section>

            <section aria-label="Performance profile">
              <div className="flex items-center justify-between mb-2.5"><span className="mobile-section-label">Performance</span><span className="text-[11px]" style={{ color: 'var(--muted)' }}>Now: {LEVEL_NAME[perf.level]}</span></div>
              <div className="grid gap-2">
                {PERF_OPTS.map(([id, name, hint], index) => {
                  const selected = perf.mode === id
                  return (
                    <motion.button key={id} type="button" whileTap={{ scale: 0.985 }} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: index * 0.025 }} aria-pressed={selected} onClick={() => setPerfMode(id)} className="mobile-perf-option" data-selected={selected}>
                      <span className="mobile-perf-bars" aria-hidden="true"><i /><i /><i /></span>
                      <span className="min-w-0 flex-1 text-left"><span className="block font-semibold text-[13px]">{name}</span><span className="block text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>{hint}</span></span>
                      {selected && <span className="mobile-theme-check" aria-hidden="true">✓</span>}
                    </motion.button>
                  )
                })}
              </div>
              {perf.hw.reduced && <div className="mobile-reduced-note mt-3"><span aria-hidden="true">◌</span> Reduced motion is enabled in Android accessibility settings.</div>}
            </section>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SettingsIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" /><path d="m19.4 15 .1.1 1.2 1-1.5 2.6-1.5-.6a7.8 7.8 0 0 1-1.6.9l-.3 1.6h-3l-.3-1.6a7.8 7.8 0 0 1-1.6-.9l-1.5.6-1.5-2.6 1.2-1-.1-.9.1-.9-1.2-1 1.5-2.6 1.5.6a7.8 7.8 0 0 1 1.6-.9l.3-1.6h3l.3 1.6a7.8 7.8 0 0 1 1.6.9l1.5-.6 1.5 2.6-1.2 1 .1.9-.1.9Z" /></svg>
}

function ToolLoading() {
  return (
    <div className="py-24 grid place-items-center gap-3">
      <AmbientSpinner size={42} />
      <span className="eyebrow">Opening tool</span>
    </div>
  )
}

/**
 * A counter that rolls to its value instead of snapping to it. Used on the phone
 * hero and the collection header so the numbers feel alive on first paint.
 */
function RollingNumber({ to, format, duration = 1.1, inView = false }) {
  const counter = useCountUp(to, { duration, inView })
  const value = inView ? counter.value : counter
  const ref = inView ? counter.ref : undefined
  const [display, setDisplay] = useState(0)
  useMotionValueEvent(value, 'change', (next) => setDisplay(Math.round(next)))
  return <span ref={ref} className="tabular-nums">{format ? format(display) : display}</span>
}

export default function App() {
  const [theme, setThemeState] = useState(() => savedTheme())
  const [active, setActive] = useState(null)
  /* One overlay at a time keeps the back contract unambiguous. */
  const [overlay, setOverlay] = useState(null) // null | 'search' | 'personalize'
  const [homeQuery, setHomeQuery] = useState('')
  const [homeFilter, setHomeFilter] = useState('all')
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  const [quickActions, setQuickActions] = useState(null)

  const controlsOpen = overlay === 'personalize'
  const searchOpen = overlay === 'search'
  const routeHistoryRef = useRef(resetToolHistory())
  const themeRef = useRef(theme)
  themeRef.current = theme

  /* A ref is the only safe way for the native back listener to see current
     state. The previous handler closed over the first render's values, so the
     gesture met an empty tool stack and fell straight through to exit(). */
  const navRef = useRef({ active: null, overlay: null })
  navRef.current = { active, overlay }

  const setTheme = useCallback((id) => { setThemeState(id); applyTheme(id) }, [])

  const goHome = useCallback(() => {
    routeHistoryRef.current = resetToolHistory()
    setOverlay(null)
    setActive(null)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  const openTool = useCallback((tool) => {
    routeHistoryRef.current = pushToolHistory(routeHistoryRef.current, tool.id)
    setOverlay(null)
    setActive(tool)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  /**
   * The single back contract, shared by the Android system button, the gesture
   * bar, the keyboard, the header control and the browser history sentinel.
   * Precedence: close overlay → unwind one tool → return to the collection →
   * only then leave the app.
   */
  const navigateBack = useCallback((exitAtRoot = false) => {
    const snapshot = navRef.current || { active: null, overlay: null }
    const decision = resolveBack({
      history: routeHistoryRef.current,
      active: snapshot.active,
      overlays: snapshot.overlay ? [snapshot.overlay] : [],
    })
    routeHistoryRef.current = decision.history

    if (decision.action === 'close-overlay') {
      setOverlay(null)
      return true
    }
    if (decision.action === 'navigate') {
      setActive(decision.toolId ? TOOLS.find((tool) => tool.id === decision.toolId) || null : null)
      window.scrollTo({ top: 0, behavior: 'auto' })
      return true
    }
    if (decision.action === 'home') {
      setActive(null)
      window.scrollTo({ top: 0, behavior: 'auto' })
      return true
    }
    /* Root of the app: only here may back leave. */
    if (exitAtRoot) { void exit(0) }
    return false
  }, [])

  const backRef = useRef(navigateBack)
  backRef.current = navigateBack

  useEffect(() => {
    const onResize = () => setIsPhone(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize) }
  }, [])

  useEffect(() => {
    const h = (event) => {
      const snapshot = navRef.current || {}
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOverlay((current) => (current === 'search' ? null : 'search'))
        return
      }
      if (event.key === 'Escape') {
        if (snapshot.overlay) { setOverlay(null); return }
        if (snapshot.active) goHome()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [goHome])

  /* Line 1: the native Android back button / gesture. */
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__)
    if (!isTauri) return undefined
    let cancelled = false
    let listener = null
    onBackButtonPress(() => backRef.current(true))
      .then((result) => { if (cancelled) result?.unregister?.(); else listener = result })
      .catch((error) => console.warn('Native back handler unavailable:', error))
    return () => { cancelled = true; listener?.unregister?.() }
  }, [])

  /* Line 2: if the native handler never registers, Android hands the gesture to
     the WebView, whose empty history navigated the document away and produced
     the "black screen with only the header" report. A sentinel entry gives
     history.back() somewhere harmless to land. */
  useEffect(() => installHistorySentinel(() => backRef.current(true)), [])

  // `auto` should repaint the moment the OS flips light/dark while the app is open.
  useEffect(() => watchSystemTheme(() => { if (themeRef.current === SYSTEM_THEME) applyTheme(SYSTEM_THEME) }), [])

  useEffect(() => { window.scrollTo(0, 0) }, [active])

  const visibleTools = useMemo(() => {
    const group = HOME_FILTERS.find((filter) => filter.id === homeFilter) || HOME_FILTERS[0]
    const query = homeQuery.trim().toLowerCase()
    return TOOLS.filter((tool) => {
      if (group.ids && !group.ids.includes(tool.id)) return false
      if (!query) return true
      return `${tool.name} ${tool.tag} ${tool.desc} ${tool.keywords || ''}`.toLowerCase().includes(query)
    })
  }, [homeFilter, homeQuery])
  const ActiveComp = useMemo(() => active?.comp, [active])

  const perfNow = usePerf()
  const reduceMotion = useReducedMotion()
  /* One reactive performance snapshot controls all permanent decorative layers.
     Keeping this here prevents each child from starting its own polling loop. */
  const ambient = useMemo(() => ambientProfile(perfNow.level, !!reduceMotion, perfNow.hw.phone), [perfNow.level, perfNow.hw.phone, reduceMotion])
  const { scrollY, scrollYProgress } = useScroll()
  /* Springing the progress bar removes the stepped feel of a raw scroll value on
     Windows trackpads while staying tight enough to feel immediate. */
  const scrollProgressSmooth = useSpring(scrollYProgress, { stiffness: 260, damping: 40, mass: 0.6, restDelta: 0.0005 })
  /* Desktop-only: the ambient field drifts a few pixels toward the cursor. */
  const drift = usePointerDrift(16)
  const heroY = useTransform(scrollY, [0, 520], [0, -38])
  const heroOpacity = useTransform(scrollY, [0, 520], [1, 0.84])
  const heroScale = useTransform(scrollY, [0, 520], [1, 0.98])
  /* Depth parallax: the orbit sits closer to the reader than the copy, so it
     travels further in the opposite direction as the hero leaves. */
  /* Parallax is decorative. Lite keeps the same content and progress feedback,
     but leaves this scroll-linked depth static to save battery and frame time. */
  const heroParallax = ambient.enabled ? 1 : 0
  const heroOrbitY = useTransform(scrollY, [0, 420], [0, 30 * heroParallax])
  const heroCopyY = useTransform(scrollY, [0, 420], [0, -14 * heroParallax])
  const heroHaloY = useTransform(scrollY, [0, 420], [0, 44 * heroParallax])
  useEffect(() => { runBenchmark() }, [])

  /* Background work continues while the WebView is suspended. On the way back in
     the native store is read again so a download that finished off-screen is not
     still showing a spinner, and its notification is restored. */
  useEffect(() => {
    let cancelled = false
    const resync = async () => {
      try {
        const { refreshBackgroundTransfers, restoreProgressNotifications } = await import('./lib/backgroundTransfers.js')
        await refreshBackgroundTransfers()
        if (!cancelled) await restoreProgressNotifications()
      } catch { /* the store is unavailable in a browser; nothing to resync */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') resync() }
    window.addEventListener('focus', resync)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.removeEventListener('focus', resync)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return (
    <MotionConfig reducedMotion="user">
    <ShellBoundary>
    <div
      className="app-shell min-h-screen relative overflow-x-clip"
      data-ambient={ambient.enabled ? 'enabled' : 'static'}
      onPointerMove={isPhone || !ambient.enabled ? undefined : drift.onPointerMove}
    >
      <motion.div className="scroll-progress" style={{ scaleX: reduceMotion || !ambient.enabled ? scrollYProgress : scrollProgressSmooth }} aria-hidden="true" />
      <div className="hero-tint" />
      <AmbientField drift={ambient.enabled ? drift : null} ambient={ambient} />

      {/* Top bar */}
      <header className="app-header sticky top-0 z-40 border-b border-line" style={{ background: 'color-mix(in srgb, var(--bg) 92%, transparent)' }}>
        <div className="app-header-inner max-w-6xl mx-auto px-3 sm:px-6 min-h-16 py-2 flex items-center gap-2 sm:gap-5">
          <motion.button type="button" aria-label={active ? 'Go back' : 'TheToolTable home'} className="app-brand flex items-center gap-2 sm:gap-3.5 shrink-0" whileTap={{ scale: 0.97 }} onClick={() => (active ? navigateBack(false) : goHome())}>
            <Logo className="w-8 h-8 sm:w-9 sm:h-9 rounded-[10px]" shadow />
            <span className="text-left leading-none">
              <span className="display block font-semibold text-[16px] sm:text-[19px] tracking-tight">TheToolTable</span>
              <span className="eyebrow hidden sm:block mt-1" style={{ letterSpacing: '0.12em' }}>By Mubashir</span>
            </span>
          </motion.button>

          <div className="app-header-actions ml-auto flex items-center gap-1.5 sm:gap-2">
            <motion.button
              type="button" aria-label="Search tools" title="Search tools (Ctrl+K)"
              className="btn btn-ghost header-search-button !px-2 sm:!px-3 sm:flex-1 sm:max-w-xs sm:justify-start sm:gap-2.5 sm:text-[13px] sm:font-medium"
              style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}
              whileTap={{ scale: 0.97 }} onClick={() => setOverlay('search')}
            >
              <SearchIcon />
              <span className="hidden sm:inline">Search the table</span>
              <span className="ml-auto hidden sm:flex gap-1"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
            </motion.button>
            <div className="hidden sm:flex items-center gap-1.5 sm:gap-2">
              <PerfPicker />
              <ThemePicker theme={theme} setTheme={setTheme} />
            </div>
            <motion.button type="button" className="mobile-settings-trigger sm:hidden" aria-label="Open appearance and performance settings" aria-haspopup="dialog" aria-expanded={controlsOpen} title="Appearance and performance" whileTap={{ scale: 0.92 }} onClick={() => setOverlay('personalize')}>
              <SettingsIcon />
            </motion.button>
          </div>
        </div>
      </header>

      <main id="app-main" data-screen={active?.id || 'home'} className={`app-main max-w-6xl mx-auto px-3 sm:px-6 relative ${active ? 'app-main-tool' : 'app-main-home'}`}>
        {/* `wait` keeps exactly one screen mounted. With `sync` the outgoing tool
            stayed alive during its exit animation; if its cleanup threw, React
            tore down <main> and the user got a header-only black screen. */}
        <AnimatePresence mode="wait" initial={false}>
          {!active ? (
            <motion.div key="home" className="home-screen" {...sharedAxis(1)}>
              <motion.section
                className="home-hero pt-12 pb-10 sm:pt-20 sm:pb-16 text-center relative"
                style={{ y: ambient.enabled ? heroY : 0, opacity: ambient.enabled ? heroOpacity : 1, scale: ambient.enabled ? heroScale : 1 }}
              >
                <div className="desktop-home-hero hidden sm:block">
                  <motion.div
                    className="inline-block relative mb-5 sm:mb-8"
                    initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={reduceMotion ? { duration: 0 } : t(DURATION.extraLong1, EASE.overshoot, 0.04)}
                  >
                    <motion.span className="hero-mark-halo" aria-hidden="true" style={{ y: heroHaloY }} />
                    <span className="hero-mark-swap block"><Logo className="w-[76px] h-[76px] sm:w-[104px] sm:h-[104px] rounded-[20px] sm:rounded-[22px]" shadow big /></span>
                  </motion.div>
                  <RevealLine delay={0.14} className="eyebrow mb-5">By Mubashir</RevealLine>
                  <h1 className="display font-semibold text-[32px] sm:text-[42px] md:text-[60px] leading-[1.08] tracking-tight">
                    <RevealLine delay={0.2}>Every tool you need,</RevealLine>
                    <RevealLine delay={0.3} className="reveal-gradient-text font-medium">on one quiet table.</RevealLine>
                  </h1>
                  <RevealBlock delay={0.44} className="mt-6">
                    <p className="text-[15px] leading-relaxed max-w-lg mx-auto" style={{ color: 'var(--on-surface-variant)' }}>
                      A growing workbench for files, media, documents and everyday tasks. Processing stays on this device wherever the tool allows; network-backed features are clearly opt-in.
                    </p>
                  </RevealBlock>
                  <RevealRule delay={0.6} className="hero-underline mt-8 w-24" />
                </div>

                <div className="mobile-home-hero sm:hidden">
                  <motion.div className="mobile-hero-orbit" aria-hidden="true" style={{ y: heroOrbitY }}>
                    <motion.span className="mobile-orbit-ring mobile-orbit-ring-a" animate={ambient.enabled ? { rotate: 360 } : { rotate: 0 }} transition={ambient.enabled ? { duration: 28, repeat: Infinity, ease: 'linear' } : { duration: 0 }} />
                    <motion.span className="mobile-orbit-ring mobile-orbit-ring-b" animate={ambient.enabled ? { rotate: -360 } : { rotate: 0 }} transition={ambient.enabled ? { duration: 38, repeat: Infinity, ease: 'linear' } : { duration: 0 }} />
                    <motion.span className="mobile-orbit-dot" animate={ambient.enabled ? { y: [0, -7, 0], opacity: [0.55, 1, 0.55] } : { y: 0, opacity: 0.55 }} transition={ambient.enabled ? { duration: 2.7, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }} />
                  </motion.div>
                  {/* Parallax wrapper sits outside the animated row so the scroll
                      offset never competes with its spring entrance. */}
                  <motion.div className="block" style={{ y: heroCopyY }} aria-hidden={false}>
                  <motion.div className="mobile-hero-brand" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.04 }}>
                    <motion.span className="mobile-hero-logo" animate={ambient.enabled ? { y: [0, -3, 0], rotate: [0, 2, 0] } : { y: 0, rotate: 0 }} transition={ambient.enabled ? { duration: 4.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}><Logo className="w-12 h-12 rounded-2xl" shadow /></motion.span>
                    <span className="text-left"><span className="eyebrow block">By Mubashir</span><span className="display block text-[13px] font-semibold mt-1">The all-in-one workbench</span></span>
                  </motion.div>
                  </motion.div>
                  <h1 className="mobile-hero-title display font-semibold">
                    <RevealLine delay={0.09}>Tools for every</RevealLine>
                    <RevealLine delay={0.18} className="reveal-gradient-text font-medium">little big moment.</RevealLine>
                  </h1>
                  <motion.p className="mobile-hero-copy" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.2 }}>
                    A calm, local-first space for your files, media and everyday tasks. Use the tools you need, on your terms.
                  </motion.p>
                  <div className="mobile-hero-stats">
                    {[[TOOLS.length, String(TOOLS.length).padStart(2, '0'), 'tools'], ['LOCAL', 'LOCAL', 'by default'], ['YOU', 'YOU', 'in control']].map(([count, value, label], index) => (
                      <motion.div key={label} className="mobile-hero-stat" initial={reduceMotion ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={reduceMotion ? { duration: 0 } : t(DURATION.long2, EASE.emphasizedDecelerate, 0.16 + index * 0.06) }>
                        {typeof count === 'number'
                          ? <RollingNumber to={count} format={(n) => String(n).padStart(2, '0')} />
                          : <span>{value}</span>}
                        <small>{label}</small>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.section>

              <motion.div className="home-collection-head" initial={reduceMotion ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.8 }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.06 }}>
                <div>
                  <RevealLine delay={0.05} className="eyebrow mb-1.5">Browse the collection</RevealLine>
                  <h2 className="display font-semibold text-[23px] sm:text-[26px]">The table</h2>
                  <RevealRule delay={0.16} className="hero-underline mt-2 w-14" />
                </div>
                <motion.span
                  key={visibleTools.length}
                  className="home-tool-count"
                  aria-live="polite"
                  initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={t(DURATION.medium2, EASE.emphasizedDecelerate)}
                >
                  <b className="tabular-nums">{visibleTools.length}</b> {visibleTools.length === 1 ? 'tool' : 'tools'} <i /> ready to explore
                </motion.span>
              </motion.div>

              <div className="home-browser">
                <label className="home-search-field">
                  <SearchIcon />
                  <input aria-label="Filter tools" type="search" inputMode="search" placeholder="Find a tool…" value={homeQuery} onChange={(event) => setHomeQuery(event.target.value)} />
                  {homeQuery && <button type="button" aria-label="Clear tool search" onClick={() => setHomeQuery('')}>×</button>}
                  <span className="home-search-count">{visibleTools.length}</span>
                </label>
                <div className="home-filter-strip" role="group" aria-label="Filter tool categories">
                  {HOME_FILTERS.map((filter, index) => {
                    const selected = homeFilter === filter.id
                    return (
                      <motion.button key={filter.id} type="button" className="home-filter-chip" aria-pressed={selected} onClick={() => setHomeFilter(filter.id)} whileTap={{ scale: 0.95 }} initial={reduceMotion ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: index * 0.035 }}>
                        {selected && <motion.span className="home-filter-active" layoutId="home-filter-active" transition={SPRING} />}
                        <span className="relative z-[1]">{filter.label}</span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              {visibleTools.length ? (
                <section
                  className={`tool-collection ${isPhone ? 'tool-collection--phone' : 'grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5'}`}
                  aria-label="Available tools"
                >
                  {visibleTools.map((tool, index) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      i={index}
                      level={perfNow.level}
                      isPhone={isPhone}
                      onOpen={openTool}
                      onLongPress={setQuickActions}
                    />
                  ))}
                </section>
              ) : (
                <motion.div className="home-empty-state" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
                  <span aria-hidden="true">⌕</span><strong>No tools found</strong><small>Try a different word or category.</small><button type="button" className="btn" onClick={() => { setHomeQuery(''); setHomeFilter('all') }}>Clear filters</button>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div key={`tool-${active.id}`} className="tool-screen" {...sharedAxis(-1)}>
              <div className="tool-screen-header pt-5 pb-4 sm:pt-10 sm:pb-8 flex items-center gap-3 sm:gap-5 min-w-0">
                <motion.button type="button" className="btn btn-ghost tool-back-button shrink-0 !px-3 sm:!px-4" aria-label="Go back" whileTap={{ scale: 0.94 }} onClick={() => navigateBack(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
                  <span className="hidden sm:inline">The table</span><span className="sm:hidden">Back</span>
                </motion.button>
                <div className="tool-header-divider h-8 w-px shrink-0" style={{ background: 'var(--border)' }} />
                {/* Just a breadcrumb here — the tool's name and tag live in the
                    Material intro band right below, so nothing is said twice. */}
                <div className="min-w-0 flex-1">
                  <h2 tabIndex="-1" className="tool-screen-title display font-semibold text-[13px] sm:text-[14px] leading-tight truncate" style={{ color: 'var(--on-surface-variant)' }}>
                    The table <span aria-hidden="true">/</span> Tool {String(active.n).padStart(2, '0')}
                  </h2>
                </div>
                <span className="tool-screen-badge hidden sm:grid" aria-hidden="true">{String(active.n).padStart(2, '0')}</span>
              </div>
              <ErrorBoundary key={active.id} onExit={goHome}>
                <div className="tool-view">
                  {/* Motion follows the operating system and nothing else. A
                      performance tier may lower resolution, frame rate or preview
                      scale — it may not switch the animation off, which is what
                      'always' here would do to every tool on a two-core phone. */}
                  <MotionConfig reducedMotion="user">
                    <Suspense fallback={<ToolLoading />}>
                      {/* Every tool gets the same frame and the same introduction. */}
                      <ToolShell>
                        <ToolIntro tool={active} />
                        <ActiveComp />
                      </ToolShell>
                    </Suspense>
                  </MotionConfig>
                </div>
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {/* Inside a tool the collection is still one back-press away, so its
          destination stays selected rather than leaving the bar unhighlighted. */}
      <MobileNavBar
        destination={overlay === 'personalize' ? 'personalize' : overlay === 'search' ? 'search' : 'home'}
        onHome={goHome}
        onSearch={() => setOverlay('search')}
        onPersonalize={() => setOverlay('personalize')}
      />
      <Footer isPhone={isPhone} ambient={ambient} />

      {!isPhone && (
        <CommandPalette
          open={searchOpen}
          onClose={() => setOverlay(null)}
          onTool={openTool}
          onTheme={(id) => { setTheme(id); setOverlay(null) }}
        />
      )}
      {isPhone && (
        <MobileSearch
          open={searchOpen}
          onClose={() => setOverlay(null)}
          onTool={openTool}
          onTheme={(id) => { setTheme(id); setOverlay(null) }}
        />
      )}
      <MobileControlsSheet open={controlsOpen} onClose={() => setOverlay(null)} theme={theme} setTheme={setTheme} />
      <ToolActions tool={quickActions} onClose={() => setQuickActions(null)} onOpen={openTool} />
      <TransferCentre onCancel={async (transfer) => {
        // Stop the real work first — with the exact native path the transfer
        // recorded — then take the row off screen.
        try {
          const { cancelNativeTransfer } = await import('./lib/backgroundTransfers.js')
          await cancelNativeTransfer(transfer)
        } catch { /* the transfer may already be finished */ }
        cancelTransfer(transfer.id)
      }} />
    </div>
    </ShellBoundary>
    </MotionConfig>
  )
}

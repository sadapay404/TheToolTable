import Footer from './components/Footer.jsx'
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { exit, onBackButtonPress } from '@tauri-apps/api/app'
import { AnimatePresence, MotionConfig, motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion'
import { usePerf, setPerfMode, runBenchmark } from './lib/perf.js'
import { TOOLS } from './toolsRegistry.jsx'
import { THEMES, THEME_ORDER, applyTheme, savedTheme } from './themes.js'
import { popToolHistory, pushToolHistory, resetToolHistory } from './lib/navigation.js'
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

function TiltCard({ tool, onOpen, i, level = 'full' }) {
  const reduceMotion = useReducedMotion()
  const maxTilt = reduceMotion ? 0 : level === 'lite' ? 4 : level === 'balanced' ? 7 : 11
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const smoothX = useSpring(pointerX, { stiffness: 180, damping: 22, mass: 0.45 })
  const smoothY = useSpring(pointerY, { stiffness: 180, damping: 22, mass: 0.45 })
  const rotateX = useTransform(smoothY, [-1, 1], [maxTilt, -maxTilt])
  const rotateY = useTransform(smoothX, [-1, 1], [-maxTilt, maxTilt])
  const lightX = useTransform(smoothX, [-1, 1], ['8%', '92%'])
  const lightY = useTransform(smoothY, [-1, 1], ['8%', '92%'])
  const contentX = useTransform(smoothX, [-1, 1], [-2.5, 2.5])
  const contentY = useTransform(smoothY, [-1, 1], [-1.5, 1.5])
  const hoverLift = reduceMotion ? -1 : level === 'lite' ? -3 : -7
  const hoverDepth = reduceMotion ? 0 : level === 'lite' ? 5 : 20
  const revealY = level === 'lite' ? 18 : 34
  const revealScale = level === 'lite' ? 0.97 : 0.92

  function trackPointer(event) {
    if (reduceMotion || event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    pointerX.set(Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1)))
    pointerY.set(Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1)))
  }

  function resetPointer() {
    pointerX.set(0)
    pointerY.set(0)
  }

  const cardVariants = {
    rest: { y: 0, z: 0, scale: 1, transition: SPRING },
    hover: {
      y: hoverLift,
      z: hoverDepth,
      scale: reduceMotion ? 1 : level === 'lite' ? 1.01 : 1.025,
      transition: { ...SPRING, staggerChildren: 0.035, delayChildren: 0.015 },
    },
    tap: { y: 0, z: 0, scale: reduceMotion ? 1 : 0.985, transition: { duration: 0.12 } },
  }

  return (
    <motion.div
      className="tilt-stage h-full"
      initial={reduceMotion ? false : { opacity: 0, y: revealY, scale: revealScale, filter: level === 'lite' ? 'blur(0px)' : 'blur(8px)' }}
      whileInView={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      viewport={{ once: true, amount: 0.16 }}
      transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.025 * (i % 4) }}
      style={{ perspective: level === 'lite' ? 850 : 1100 }}
    >
      <motion.button
        type="button"
        className="card3d group block w-full text-left"
        aria-label={`Open ${tool.name}`}
        variants={cardVariants}
        initial="rest"
        animate="rest"
        whileHover="hover"
        whileFocus="hover"
        whileTap="tap"
        onPointerMove={trackPointer}
        onPointerLeave={resetPointer}
        onPointerEnter={() => tool.comp.preload?.()}
        onFocus={() => tool.comp.preload?.()}
        onClick={() => onOpen(tool)}
        style={{
          rotateX: reduceMotion ? 0 : rotateX,
          rotateY: reduceMotion ? 0 : rotateY,
          transformStyle: 'preserve-3d',
          '--mx': lightX,
          '--my': lightY,
        }}
      >
        <div className="sheen" aria-hidden="true" />
        <div className="inner relative h-full p-5 sm:p-7">
          <motion.div className="card-content flex min-h-full flex-col gap-4 sm:gap-5" style={{ x: reduceMotion ? 0 : contentX, y: reduceMotion ? 0 : contentY }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <motion.span className="tool-icon shrink-0" variants={CARD_ICON_VARIANTS} aria-hidden="true">{tool.icon}</motion.span>
                <span className="eyebrow truncate">{tool.tag}</span>
              </div>
              <motion.span className="ghost-num shrink-0" variants={CARD_NUMBER_VARIANTS} aria-hidden="true">{String(tool.n).padStart(2, '0')}</motion.span>
            </div>
            <div className="min-h-[88px]">
              <motion.h3 className="display font-semibold text-[19px] sm:text-[21px] leading-snug" variants={CARD_TITLE_VARIANTS}>{tool.name}</motion.h3>
              <motion.p className="text-[13.5px] leading-relaxed mt-2" style={{ color: 'var(--muted)' }} variants={CARD_DESCRIPTION_VARIANTS}>{tool.desc}</motion.p>
            </div>
            <div className="mt-auto">
              <motion.div className="rule" variants={CARD_RULE_VARIANTS} style={{ originX: 0 }} />
              <div className="mt-3 flex items-center justify-between">
                <motion.span className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: 'var(--muted)' }} variants={CARD_CTA_VARIANTS}>Open tool</motion.span>
                <motion.span className="card-arrow" variants={CARD_ARROW_VARIANTS} aria-hidden="true">↗</motion.span>
              </div>
            </div>
          </motion.div>
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
              <div className="flex items-center justify-between mb-2.5"><span className="mobile-section-label">Color theme</span><span className="text-[11px]" style={{ color: 'var(--muted)' }}>{THEMES[theme]?.name}</span></div>
              <div className="grid grid-cols-2 gap-2">
                {THEME_ORDER.map((id, index) => {
                  const selected = theme === id
                  return (
                    <motion.button key={id} type="button" whileTap={{ scale: 0.97 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: index * 0.025 }} aria-pressed={selected} onClick={() => setTheme(id)} className="mobile-theme-option" data-selected={selected}>
                      <span className="mobile-theme-swatch" style={{ background: THEMES[id].vars['--bg'], borderColor: THEMES[id].vars['--border'] }}><i style={{ background: THEMES[id].vars['--primary'] || THEMES[id].vars['--accent'] }} /></span>
                      <span className="min-w-0 text-left"><span className="block font-semibold text-[12.5px] truncate">{THEMES[id].name}</span><span className="block text-[10.5px]" style={{ color: 'var(--muted)' }}>{THEMES[id].dark ? 'Dark' : 'Light'} theme</span></span>
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

function MobileBottomNav({ onHome, onSearch, onControls }) {
  return (
    <nav className="mobile-bottom-nav sm:hidden" aria-label="Tool navigation">
      <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={onHome} aria-label="Back to all tools">
        <span className="mobile-nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></svg></span><span>All tools</span>
      </motion.button>
      <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={onSearch} aria-label="Search tools">
        <span className="mobile-nav-icon"><SearchIcon /></span><span>Search</span>
      </motion.button>
      <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={onControls} aria-label="Open appearance and performance settings">
        <span className="mobile-nav-icon"><SettingsIcon /></span><span>Personalize</span>
      </motion.button>
    </nav>
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
  const [controlsOpen, setControlsOpen] = useState(false)
  const [homeQuery, setHomeQuery] = useState('')
  const [homeFilter, setHomeFilter] = useState('all')
  const navRef = useRef(null)
  const routeHistoryRef = useRef(resetToolHistory())
  navRef.current = { active, paletteOpen, controlsOpen }

  const setTheme = (id) => { setThemeState(id); applyTheme(id) }
  const goHome = () => {
    routeHistoryRef.current = resetToolHistory()
    setPaletteOpen(false); setControlsOpen(false); setActive(null)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
  const openTool = (t) => {
    routeHistoryRef.current = pushToolHistory(routeHistoryRef.current, t.id)
    setActive(t); setPaletteOpen(false); setControlsOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
  const navigateBack = (exitAtRoot = false) => {
    const current = navRef.current || {}
    if (current.controlsOpen) { setControlsOpen(false); return true }
    if (current.paletteOpen) { setPaletteOpen(false); return true }

    const previous = popToolHistory(routeHistoryRef.current)
    routeHistoryRef.current = previous.history
    if (previous.moved) {
      setActive(previous.toolId ? TOOLS.find((tool) => tool.id === previous.toolId) || null : null)
      window.scrollTo({ top: 0, behavior: 'auto' })
      return true
    }
    if (current.active) {
      routeHistoryRef.current = resetToolHistory()
      setActive(null)
      window.scrollTo({ top: 0, behavior: 'auto' })
      return true
    }
    if (exitAtRoot) { void exit(0); return true }
    return false
  }

  useEffect(() => {
    const h = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (navRef.current?.controlsOpen) setControlsOpen(false)
        setPaletteOpen((open) => !open)
      }
      if (event.key === 'Escape') {
        if (navRef.current?.controlsOpen) setControlsOpen(false)
        else if (navRef.current?.paletteOpen) setPaletteOpen(false)
        else if (navRef.current?.active) goHome()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window) || !/android/i.test(navigator.userAgent || '')) return
    let cancelled = false
    let listener = null
    onBackButtonPress(() => {
      // Prefer the app's tool stack over WebView history. A stale WebView entry
      // can otherwise navigate to an empty document and leave only the header.
      navigateBack(true)
    }).then((result) => {
      if (cancelled) result.unregister()
      else listener = result
    }).catch((error) => console.warn('Android back handler unavailable:', error))
    return () => { cancelled = true; listener?.unregister() }
  }, [])

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
  const { scrollY, scrollYProgress } = useScroll()
  const heroY = useTransform(scrollY, [0, 520], [0, -38])
  const heroOpacity = useTransform(scrollY, [0, 520], [1, 0.84])
  const heroScale = useTransform(scrollY, [0, 520], [1, 0.98])
  useEffect(() => { runBenchmark() }, [])
  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen relative overflow-x-clip">
      <motion.div className="scroll-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
      <div className="hero-tint" />

      {/* Top bar */}
      <header className="app-header sticky top-0 z-40 border-b border-line" style={{ background: 'color-mix(in srgb, var(--bg) 92%, transparent)' }}>
        <div className="app-header-inner max-w-6xl mx-auto px-3 sm:px-6 min-h-16 py-2 flex items-center gap-2 sm:gap-5">
          <motion.button type="button" aria-label={active ? 'Back to all tools' : 'Back to TheToolTable home'} className="app-brand flex items-center gap-2 sm:gap-3.5 shrink-0" whileTap={{ scale: 0.97 }} onClick={goHome}>
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
              whileTap={{ scale: 0.97 }} onClick={() => { setControlsOpen(false); setPaletteOpen(true) }}
            >
              <SearchIcon />
              <span className="hidden sm:inline">Search the table</span>
              <span className="ml-auto hidden sm:flex gap-1"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
            </motion.button>
            <div className="hidden sm:flex items-center gap-1.5 sm:gap-2">
              <PerfPicker />
              <ThemePicker theme={theme} setTheme={setTheme} />
            </div>
            <motion.button type="button" className="mobile-settings-trigger sm:hidden" aria-label="Open appearance and performance settings" aria-haspopup="dialog" aria-expanded={controlsOpen} title="Appearance and performance" whileTap={{ scale: 0.92 }} onClick={() => { setPaletteOpen(false); setControlsOpen(true) }}>
              <SettingsIcon />
            </motion.button>
          </div>
        </div>
      </header>

      <main id="app-main" data-screen={active?.id || 'home'} className={`app-main max-w-6xl mx-auto px-3 sm:px-6 relative ${active ? 'app-main-tool' : 'app-main-home'}`}>
        <AnimatePresence mode="sync" initial={false}>
          {!active ? (
            <motion.div key="home" className="home-screen" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -12 }} transition={reduceMotion ? { duration: 0 } : SPRING}>
              <motion.section
                className="home-hero pt-12 pb-10 sm:pt-20 sm:pb-16 text-center relative"
                style={{ y: reduceMotion || perfNow.level === 'lite' ? 0 : heroY, opacity: reduceMotion || perfNow.level === 'lite' ? 1 : heroOpacity, scale: reduceMotion || perfNow.level === 'lite' ? 1 : heroScale }}
              >
                <div className="desktop-home-hero hidden sm:block">
                  <motion.div className="inline-block mb-5 sm:mb-8" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.05 }}>
                    <Logo className="w-[76px] h-[76px] sm:w-[104px] sm:h-[104px] rounded-[20px] sm:rounded-[22px]" shadow big />
                  </motion.div>
                  <motion.div className="eyebrow mb-5" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={reduceMotion ? { duration: 0 } : { delay: 0.12 }}>By Mubashir</motion.div>
                  <motion.h1 className="display font-semibold text-[32px] sm:text-[42px] md:text-[60px] leading-[1.08] tracking-tight" initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.16 }}>
                    Every tool you need,<br /><em className="font-medium" style={{ color: 'var(--accent2)' }}>on one quiet table.</em>
                  </motion.h1>
                  <motion.p className="mt-6 text-[15px] leading-relaxed max-w-lg mx-auto" style={{ color: 'var(--muted)' }} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={reduceMotion ? { duration: 0 } : { delay: 0.28 }}>
                    A growing workbench for files, media, documents and everyday tasks. Processing stays on this device wherever the tool allows; network-backed features are clearly opt-in.
                  </motion.p>
                </div>

                <div className="mobile-home-hero sm:hidden">
                  <div className="mobile-hero-orbit" aria-hidden="true">
                    <motion.span className="mobile-orbit-ring mobile-orbit-ring-a" animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }} />
                    <motion.span className="mobile-orbit-ring mobile-orbit-ring-b" animate={reduceMotion ? undefined : { rotate: -360 }} transition={{ duration: 38, repeat: Infinity, ease: 'linear' }} />
                    <motion.span className="mobile-orbit-dot" animate={reduceMotion ? undefined : { y: [0, -7, 0], opacity: [0.55, 1, 0.55] }} transition={{ duration: 2.7, repeat: Infinity, ease: 'easeInOut' }} />
                  </div>
                  <motion.div className="mobile-hero-brand" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.04 }}>
                    <motion.span className="mobile-hero-logo" animate={reduceMotion ? undefined : { y: [0, -3, 0], rotate: [0, 2, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}><Logo className="w-12 h-12 rounded-2xl" shadow /></motion.span>
                    <span className="text-left"><span className="eyebrow block">By Mubashir</span><span className="display block text-[13px] font-semibold mt-1">The all-in-one workbench</span></span>
                  </motion.div>
                  <motion.h1 className="mobile-hero-title display font-semibold" initial={reduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.09 }}>
                    Tools for every<br /><motion.em className="font-medium" style={{ color: 'var(--primary)' }} initial={reduceMotion ? false : { opacity: 0.4 }} animate={{ opacity: 1 }} transition={reduceMotion ? { duration: 0 } : { delay: 0.3 }}>little big moment.</motion.em>
                  </motion.h1>
                  <motion.p className="mobile-hero-copy" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.2 }}>
                    A calm, local-first space for your files, media and everyday tasks. Use the tools you need, on your terms.
                  </motion.p>
                  <div className="mobile-hero-stats">
                    {[[String(TOOLS.length).padStart(2, '0'), 'tools'], ['LOCAL', 'by default'], ['YOU', 'in control']].map(([value, label], index) => (
                      <motion.div key={label} className="mobile-hero-stat" initial={reduceMotion ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.16 + index * 0.06 }}>
                        <span>{value}</span><small>{label}</small>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.section>

              <motion.div className="home-collection-head" initial={reduceMotion ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.8 }} transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.06 }}>
                <div><div className="eyebrow mb-1.5">Browse the collection</div><h2 className="display font-semibold text-[23px] sm:text-[26px]">The table</h2></div>
                <span className="home-tool-count" aria-live="polite">{visibleTools.length} {visibleTools.length === 1 ? 'tool' : 'tools'} <i /> ready to explore</span>
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
                <section className="tool-table-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5" aria-label="Available tools">
                  {visibleTools.map((tool, index) => <TiltCard key={tool.id} tool={tool} i={index} level={perfNow.level} onOpen={openTool} />)}
                </section>
              ) : (
                <motion.div className="home-empty-state" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
                  <span aria-hidden="true">⌕</span><strong>No tools found</strong><small>Try a different word or category.</small><button type="button" className="btn" onClick={() => { setHomeQuery(''); setHomeFilter('all') }}>Clear filters</button>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div key={`tool-${active.id}`} className="tool-screen" initial={reduceMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -14 }} transition={reduceMotion ? { duration: 0 } : SPRING}>
              <div className="tool-screen-header pt-5 pb-4 sm:pt-10 sm:pb-8 flex items-center gap-3 sm:gap-5 min-w-0">
                <motion.button type="button" className="btn btn-ghost tool-back-button shrink-0 !px-3 sm:!px-4" aria-label="Back to the table" whileTap={{ scale: 0.94 }} onClick={goHome}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
                  <span className="hidden sm:inline">The table</span><span className="sm:hidden">Back</span>
                </motion.button>
                <div className="tool-header-divider h-8 w-px shrink-0" style={{ background: 'var(--border)' }} />
                <div className="min-w-0 flex-1"><div className="eyebrow mb-1 truncate">Tool {String(active.n).padStart(2, '0')} · {active.tag}</div><h2 tabIndex="-1" className="tool-screen-title display font-semibold text-[20px] sm:text-[26px] leading-tight">{active.name}</h2></div>
                <span className="tool-screen-badge hidden sm:grid" aria-hidden="true">{String(active.n).padStart(2, '0')}</span>
              </div>
              <ErrorBoundary key={active.id}>
                <div className="tool-view">
                  <MotionConfig reducedMotion={perfNow.level === 'lite' ? 'always' : 'user'}><Suspense fallback={<ToolLoading />}><ActiveComp /></Suspense></MotionConfig>
                </div>
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {active && <MobileBottomNav onHome={goHome} onSearch={() => { setControlsOpen(false); setPaletteOpen(true) }} onControls={() => { setPaletteOpen(false); setControlsOpen(true) }} />}
      <Footer />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onTool={openTool}
        onTheme={(id) => { setTheme(id); setPaletteOpen(false) }}
      />
      <MobileControlsSheet open={controlsOpen} onClose={() => setControlsOpen(false)} theme={theme} setTheme={setTheme} />
    </div>
    </MotionConfig>
  )
}

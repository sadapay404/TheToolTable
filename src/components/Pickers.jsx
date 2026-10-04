/* The two header menus — theme and performance — rebuilt on top of <Sheet> so they turn into
   bottom sheets on a phone instead of a menu hanging off the right edge of the screen.
   The theme sheet is also where the rememberer lives: star a theme and the app opens with it
   every time, whatever you previewed last. */
import React, { useState } from 'react'
import { Sheet, SheetRow } from './Sheet.jsx'
import { THEMES, THEME_ORDER, DEFAULT_THEME, applyTheme, setFavouriteTheme, forgetTheme, favouriteTheme, savedTheme } from '../themes.js'
import { usePerf, setPerfMode } from '../lib/perf.js'

export const PERF_OPTS = [
  ['auto', 'Auto', 'Picks the best profile for this device'],
  ['lite', 'Lite', 'Low-end laptops & phones: no blur or grain, lighter previews'],
  ['balanced', 'Balanced', 'Mid-range phones & laptops'],
  ['full', 'Full', 'High-end machines: every effect at full resolution'],
]
export const LEVEL_NAME = { lite: 'Lite', balanced: 'Balanced', full: 'Full' }

function Swatch({ id, size = 22 }) {
  const t = THEMES[id]
  return (
    <span className="shrink-0 grid place-items-center rounded-full" style={{ width: size, height: size, background: t.vars['--bg'], boxShadow: '0 0 0 1.5px var(--border)' }}>
      <span className="rounded-full" style={{ width: size * 0.5, height: size * 0.5, background: t.vars['--accent'] }} />
    </span>
  )
}

const Star = ({ on }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </svg>
)

const Chevron = ({ up }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: up ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="m6 9 6 6 6-6" /></svg>
)

export function ThemeSheet({ open, onClose, theme, setTheme, anchorEl }) {
  const [fav, setFav] = useState(() => favouriteTheme())
  const star = (id) => {
    const next = fav === id ? null : id
    setFavouriteTheme(next)
    setFav(next)
  }
  return (
    <Sheet open={open} onClose={onClose} label="Theme" anchorEl={anchorEl}>
      <div className="px-4 pt-1 pb-2 flex items-baseline gap-3">
        <div className="display font-semibold text-[16px]">Theme</div>
        <div className="ml-auto text-[11.5px] font-medium" style={{ color: 'var(--muted)' }}>Remembered on this device</div>
      </div>
      {THEME_ORDER.map((id) => (
        <SheetRow key={id} on={id === theme} onClick={() => { setTheme(id); onClose() }}
          onStar={() => star(id)} star={fav === id}>
          <Swatch id={id} />
          <span className="min-w-0 truncate">{THEMES[id].name}</span>
          {id === theme && <span className="ml-auto text-[12px] font-bold" style={{ color: 'var(--accent)' }}>Current</span>}
        </SheetRow>
      ))}
      <div className="px-4 pt-3 pb-1 flex items-center gap-3 text-[11.5px]" style={{ color: 'var(--muted)' }}>
        <Star on={!!fav} />
        <span className="flex-1 leading-snug">
          {fav ? <>Opens with <b style={{ color: 'var(--ink)' }}>{THEMES[fav].name}</b> on restart{fav !== theme ? ` · ${THEMES[theme].name} is only a preview` : ''}</>
               : <>Opens with whatever you picked last. Star a theme to pin it.</>}
        </span>
        {(fav || savedTheme() !== DEFAULT_THEME) && (
          <button type="button" className="shrink-0 px-3 py-2 -mr-1 rounded-full font-semibold hover:bg-[var(--surface2)]"
            onClick={() => { forgetTheme(); setFav(null); }}>
            Forget
          </button>
        )}
      </div>
    </Sheet>
  )
}

export function PerfSheet({ open, onClose, anchorEl }) {
  const p = usePerf()
  return (
    <Sheet open={open} onClose={onClose} label="Performance" anchorEl={anchorEl}>
      <div className="px-4 pt-1 pb-2 display font-semibold text-[16px]">Performance</div>
      {PERF_OPTS.map(([id, name, hint]) => (
        <SheetRow key={id} on={p.mode === id} onClick={() => { setPerfMode(id); onClose() }}>
          <span className="min-w-0">
            <span className="flex items-center gap-2">{name}{id === 'auto' && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>now {LEVEL_NAME[p.level]}</span>}</span>
            <span className="block text-[12px] font-normal mt-0.5" style={{ color: 'var(--muted)' }}>{hint}</span>
          </span>
        </SheetRow>
      ))}
      <div className="px-4 pt-3 pb-1 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
        This device: {p.hw.cores} CPU threads{p.hw.mem ? ` · ${p.hw.mem}+ GB RAM` : ''}{p.hw.phone ? ' · phone' : ''}. Exports are never lowered — only previews and effects.
      </div>
    </Sheet>
  )
}

const Bars = ({ level }) => {
  const n = level === 'lite' ? 1 : level === 'balanced' ? 2 : 3
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      {[0, 1, 2].map((i) => <path key={i} d={`M${6 + i * 6} 19V${15 - i * 4}`} opacity={i < n ? 1 : 0.28} />)}
    </svg>
  )
}

export function ThemeButton({ theme, onOpen }) {
  const ref = React.useRef(null)
  return (
    <button ref={ref} className="btn btn-icon md:!px-4" onClick={() => onOpen(ref.current)} aria-haspopup="menu" aria-label={`Theme: ${THEMES[theme].name}`}>
      <Swatch id={theme} size={18} />
      <span className="hidden md:inline">{THEMES[theme].name}</span>
      <span className="hidden md:inline-flex"><Chevron up={false} /></span>
    </button>
  )
}

export function PerfButton({ onOpen }) {
  const p = usePerf()
  const ref = React.useRef(null)
  return (
    <button ref={ref} className="btn btn-icon md:!px-3" onClick={() => onOpen(ref.current)} aria-haspopup="menu"
      title={`Performance: ${LEVEL_NAME[p.level]}${p.mode === 'auto' ? ' (auto)' : ''}`} aria-label="Performance profile">
      <Bars level={p.level} />
      <span className="hidden md:inline">{LEVEL_NAME[p.level]}</span>
    </button>
  )
}

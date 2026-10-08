import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion'
import { TOOLS } from '../toolsRegistry.jsx'
import { THEMES, THEME_CHOICES, themeLabel, themeVars } from '../themes.js'
import { getRecent } from '../lib/utils.js'
import { EASE, DURATION, t, stagger, riseIn } from '../lib/motion.js'

/**
 * Full-screen Material 3 search for phones.
 *
 * The desktop keeps the floating command palette; on a phone a 24dp full-screen
 * search view is what Android users expect (Gmail, Settings, Play Store all do
 * this), and it gives the keyboard somewhere to live without covering results.
 */

function score(q, text) {
  q = q.toLowerCase()
  text = text.toLowerCase()
  if (!q) return 1
  if (text.includes(q)) return 2
  let qi = 0
  for (const c of text) if (c === q[qi]) qi++
  return qi === q.length ? 1.2 : 0
}

function ResultRow({ item, index, onPick }) {
  return (
    <motion.li variants={riseIn(14)} transition={{ ...t(DURATION.medium2, EASE.emphasizedDecelerate), delay: stagger(index, 0.028) }}>
      <button type="button" className="md3-search-result" onClick={() => onPick(item)}>
        <span className="md3-search-result-icon" aria-hidden="true">{item.icon}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block font-semibold text-[15px] truncate">{item.label}</span>
          {item.sub && <span className="block text-[12px] truncate" style={{ color: 'var(--on-surface-variant)' }}>{item.sub}</span>}
        </span>
        <span className="md3-search-chevron" aria-hidden="true">›</span>
      </button>
    </motion.li>
  )
}

export default function MobileSearch({ open, onClose, onTool, onTheme }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const { scrollY } = useScroll()
  const titleScale = useTransform(scrollY, [0, 90], [1, 0.82])
  const titleOpacity = useTransform(scrollY, [0, 110], [1, 0])

  const items = useMemo(() => {
    const toolItems = TOOLS.map((tool) => ({
      kind: 'tool', icon: tool.icon, label: tool.name, sub: `Tool ${String(tool.n).padStart(2, '0')} · ${tool.tag}`,
      s: Math.max(score(q, tool.name), score(q, tool.keywords || '') * 0.9),
      run: () => onTool(tool),
    }))
    const themeItems = THEME_CHOICES.map((id) => ({
      kind: 'theme', icon: '🎨', label: `Theme: ${themeLabel(id)}`, sub: 'Appearance',
      s: score(q, `theme ${themeLabel(id)} appearance`),
      run: () => onTheme(id),
    }))
    const recentItems = q ? [] : getRecent().map((r) => ({
      kind: 'recent', icon: '🕘', label: r.label, sub: 'Recent action', s: 0.4, run: onClose,
    }))
    return [...recentItems, ...toolItems, ...themeItems].filter((i) => i.s > 0).sort((a, b) => b.s - a.s)
  }, [q, onTool, onTheme, onClose])

  useEffect(() => {
    if (!open) return
    setQ('')
    // Let the sheet animate in before stealing focus, so the keyboard does not
    // fight the entrance transition on slower phones.
    const id = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 220)
    return () => clearTimeout(id)
  }, [open])

  const pick = (item) => { item?.run(); onClose() }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="md3-search-view"
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14, transition: t(DURATION.short4, EASE.emphasizedAccelerate) }}
          transition={t(DURATION.long2, EASE.emphasizedDecelerate)}
          role="dialog"
          aria-modal="true"
          aria-label="Search tools"
        >
          <header className="md3-search-header" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
            <div className="md3-search-title-row">
              <motion.h2 style={{ scale: titleScale, opacity: titleOpacity, transformOrigin: 'left center' }}>Search</motion.h2>
              <button type="button" className="md3-icon-button" onClick={onClose} aria-label="Close search">✕</button>
            </div>
            <div className="md3-search-field">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--on-surface-variant)" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
                placeholder="Tools, themes, actions…"
                aria-label="Search the tool table"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                type="search"
              />
              {q && <button type="button" className="md3-search-clear" onClick={() => setQ('')} aria-label="Clear search">✕</button>}
            </div>
          </header>

          <div className="md3-search-body">
            {items.length ? (
              <ul className="md3-search-list">
                {items.slice(0, 40).map((item, i) => <ResultRow key={`${item.kind}-${item.label}`} item={item} index={i} onPick={pick} />)}
              </ul>
            ) : (
              <div className="md3-search-empty">
                <span className="md3-search-empty-mark" aria-hidden="true">⌕</span>
                <strong>Nothing found</strong>
                <small>Try a different word — {TOOLS.length} tools and {THEMES.length ? THEME_CHOICES.length : 0} themes are searchable.</small>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
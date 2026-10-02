import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TOOLS } from '../toolsRegistry.jsx'
import { THEMES, THEME_ORDER } from '../themes.js'
import { getRecent } from '../lib/utils.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

function score(q, text) {
  q = q.toLowerCase(); text = text.toLowerCase()
  if (!q) return 1
  if (text.includes(q)) return 2
  let qi = 0
  for (const c of text) if (c === q[qi]) qi++
  return qi === q.length ? 1.2 : 0
}

export default function CommandPalette({ open, onClose, onTool, onTheme }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)

  const items = useMemo(() => {
    const toolItems = TOOLS.map((t) => ({
      kind: 'tool', icon: t.icon, label: t.name, sub: `Tool ${String(t.n).padStart(2, '0')} · ${t.tag}`,
      s: Math.max(score(q, t.name), score(q, t.keywords) * 0.9), run: () => onTool(t),
    }))
    const themeItems = THEME_ORDER.map((id) => ({
      kind: 'theme', icon: '🎨', label: `Theme: ${THEMES[id].name}`, sub: 'Appearance',
      s: score(q, `theme ${THEMES[id].name}`), run: () => onTheme(id),
    }))
    const recentItems = q ? [] : getRecent().map((r) => ({
      kind: 'recent', icon: '🕘', label: r.label, sub: 'Recent action', s: 0.5, run: onClose,
    }))
    return [...recentItems, ...toolItems, ...themeItems].filter((i) => i.s > 0).sort((a, b) => b.s - a.s)
  }, [q, onTool, onTheme, onClose])

  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 30) } }, [open])
  useEffect(() => { setSel(0) }, [q])

  const exec = (item) => { item?.run(); onClose() }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="card w-full max-w-xl overflow-hidden"
            initial={{ y: -24, scale: 0.94, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -18, scale: 0.96, opacity: 0 }}
            transition={SPRING}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 border-b border-line">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--muted)' }}>
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                className="flex-1 bg-transparent py-4 outline-none text-[15px]"
                placeholder="Search tools, actions, themes…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
                  if (e.key === 'Enter') exec(items[sel])
                }}
              />
              <span className="kbd">esc</span>
            </div>
            <div className="max-h-[46vh] overflow-y-auto p-2">
              {items.length === 0 && <div className="p-6 text-center text-sm" style={{ color: 'var(--muted)' }}>No matches for “{q}”</div>}
              {items.map((it, i) => (
                <motion.button
                  key={it.kind + it.label}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                  style={i === sel ? { background: 'var(--surface2)' } : undefined}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => exec(it)}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="w-8 h-8 grid place-items-center rounded-lg text-base" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>{it.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-sm truncate">{it.label}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--muted)' }}>{it.sub}</span>
                  </span>
                  {i === sel && <span className="kbd">↵</span>}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

import React from 'react'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { ToolIcon } from './ToolIcon.jsx'
import { useRipple } from '../lib/ripple.js'
import { RevealLine, RevealRule } from './Reveal.jsx'
import { EASE, DURATION, SPRING, t } from '../lib/motion.js'

/**
 * Tool chrome.
 *
 * Every tool used to invent its own header, its own drop zone and its own action
 * row, so twenty tools looked like twenty different apps. These are the shared
 * pieces — the shell, the intro band, sections, the action bar and the empty
 * state — so a tool only has to describe *what* it does, not how it is dressed.
 *
 * The rule here is the same as everywhere else in Part 4/5: chrome is added,
 * never substituted. Nothing a tool already renders is taken away.
 */

/* ------------------------------------------------------------------ shell -- */

/**
 * The frame a tool renders into. Owns the vertical rhythm and the clearance the
 * phone nav bar needs, so no tool has to remember either.
 */
export function ToolShell({ children, className = '', wide = false }) {
  return (
    <div className={`tool-shell ${wide ? 'tool-shell--wide' : ''} ${className}`}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ intro -- */

/**
 * The band every tool opens with. Driven entirely by the registry entry, so all
 * twenty tools get an identical introduction without twenty hand-written copies.
 */
export function ToolIntro({ tool, children }) {
  const reduceMotion = useReducedMotion()
  if (!tool) return null
  const tags = String(tool.tag || '').split('·').map((s) => s.trim()).filter(Boolean)
  return (
    <motion.section
      className="tool-intro"
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={t(DURATION.extraLong2, EASE.emphasizedDecelerate)}
      aria-label={`${tool.name} introduction`}
    >
      <div className="tool-intro-glow" aria-hidden="true" />

      <div className="tool-intro-head">
        <motion.span
          className="tool-intro-mark"
          aria-hidden="true"
          initial={reduceMotion ? false : { scale: 0.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={SPRING.bouncy}
        >
          <ToolIcon name={tool.icon} size={isPhoneSize() ? 24 : 28} />
        </motion.span>

        <div className="min-w-0 flex-1">
          <RevealLine delay={0.08} className="eyebrow mb-1.5">Tool {String(tool.n).padStart(2, '0')} · {tool.tag}</RevealLine>
          <RevealLine delay={0.16} className="tool-intro-title display font-semibold">{tool.name}</RevealLine>
          <RevealRule delay={0.28} className="tool-intro-rule mt-3 w-16" />
        </div>
      </div>

      <RevealLine delay={0.34} distance="60%" className="tool-intro-desc">
        {tool.desc}
      </RevealLine>

      {tags.length > 0 && (
        <motion.div className="tool-intro-tags" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.42, duration: DURATION.medium3 }}>
          {tags.map((tag, i) => (
            <motion.span
              key={tag}
              className="tool-intro-chip"
              initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...SPRING.snappy, delay: 0.46 + i * 0.05 }}
            >
              {tag}
            </motion.span>
          ))}
          {children}
        </motion.div>
      )}
      {children && tags.length === 0 && <div className="tool-intro-tags">{children}</div>}
    </motion.section>
  )
}

/* --------------------------------------------------------------- sections -- */

/** A titled block inside a tool, with a rule that draws itself in. */
export function ToolSection({ eyebrow, title, sub, right, children, className = '', delay = 0, index = 0 }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.section
      className={`tool-section ${className}`}
      initial={reduceMotion ? false : { opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.expressive, delay: delay + index * 0.06 }}
    >
      {(title || eyebrow) && (
        <header className="tool-section-head">
          <div className="min-w-0">
            {eyebrow && <RevealLine delay={delay + 0.04} className="eyebrow mb-1">{eyebrow}</RevealLine>}
            {title && <RevealLine delay={delay + 0.1} className="tool-section-title display font-semibold">{title}</RevealLine>}
            {sub && <RevealLine delay={delay + 0.16} distance="50%" className="tool-section-sub">{sub}</RevealLine>}
          </div>
          {right && <div className="tool-section-right">{right}</div>}
        </header>
      )}
      {children}
    </motion.section>
  )
}

/* ------------------------------------------------------------- action bar -- */

/**
 * A sticky bar of primary actions. On a phone it docks just above the nav bar
 * and lifts in once the tool scrolls, so the action is never scrolled away.
 */
export function ActionBar({ children, className = '', label = 'Actions' }) {
  return (
    <div className={`tool-actionbar ${className}`}>
      <div className="tool-actionbar-inner" role="group" aria-label={label}>{children}</div>
    </div>
  )
}

/** The filled Material button every tool's main action should use. */
export function ToolButton({ children, onClick, icon, disabled, busy, tone = 'filled', className = '', type = 'button', ...rest }) {
  const ripple = useRipple()
  return (
    <motion.button
      ref={ripple.ref}
      type={type}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.965 }}
      transition={SPRING.snappy}
      className={`tool-btn tool-btn--${tone} ${className}`}
      {...rest}
      onPointerDown={ripple.onPointerDown}
      data-ripple=""
    >
      {busy ? (
        <motion.span
          className="tool-btn-spinner"
          aria-hidden="true"
          animate={busy ? { rotate: 360 } : { rotate: 0 }}
          transition={t(DURATION.long4, 'linear')}
        />
      ) : icon ? (
        <span className="tool-btn-icon" aria-hidden="true"><ToolIcon name={icon} size={18} /></span>
      ) : null}
      <span>{children}</span>
    </motion.button>
  )
}

/* ---------------------------------------------------------- empty states -- */

export function EmptyState({ icon = 'file', title, sub, action, compact = false }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className={`tool-empty ${compact ? 'tool-empty--compact' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING.expressive}
    >
      <motion.span
        className="tool-empty-mark"
        aria-hidden="true"
        animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ToolIcon name={icon} size={compact ? 26 : 34} />
      </motion.span>
      {title && <div className="tool-empty-title display font-semibold">{title}</div>}
      {sub && <p className="tool-empty-sub">{sub}</p>}
      {action}
    </motion.div>
  )
}

/* -------------------------------------------------------------- tabs/rail -- */

/**
 * Material tabs with a sliding indicator. Shared so the phone tab bar, the tool
 * tabs and the segmented controls all move the same way.
 */
export function TabsRail({ value, onChange, options, className = '', layoutId = 'tool-tabs' }) {
  return (
    <div className={`tool-tabs ${className}`} role="tablist">
      {options.map(([key, label, icon]) => {
        const active = key === value
        return (
          <motion.button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            className="tool-tab"
            onClick={() => onChange(key)}
            whileTap={{ scale: 0.96 }}
            transition={SPRING.snappy}
            style={{ color: active ? 'var(--on-secondary-container)' : 'var(--on-surface-variant)' }}
          >
            {active && (
              <motion.span className="tool-tab-indicator" layoutId={layoutId} transition={SPRING.snappy} aria-hidden="true" />
            )}
            <span className="relative z-[1] flex items-center justify-center gap-2">
              {icon && <span className="tool-tab-icon" aria-hidden="true">{icon}</span>}
              <span className="tool-tab-label">{label}</span>
              {active && (
                <motion.span
                  className="tool-tab-dot"
                  layoutId={`${layoutId}-dot`}
                  transition={SPRING.snappy}
                  aria-hidden="true"
                />
              )}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}

/** Linear progress with a travelling indicator — indeterminate feels alive. */
export function ProgressRail({ value, label, tone = 'primary' }) {
  const pct = Math.min(100, Math.max(0, value ?? 0))
  return (
    <div className="tool-rail-wrap">
      {label && (
        <div className="tool-rail-label">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={label} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={t(DURATION.short3, EASE.emphasizedAccelerate)}>{label}</motion.span>
          </AnimatePresence>
          {typeof value === 'number' && <span className="tabular-nums">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="tool-rail" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <motion.span className={`tool-rail-fill tool-rail-fill--${tone}`} initial={{ scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ ...SPRING.snappy, mass: 0.9 }} aria-hidden="true" />
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- facts -- */

/** A single fact in the intro band or a summary row. */
export function FactChip({ k, v, tone = 'default' }) {
  return (
    <motion.span className={`tool-fact tool-fact--${tone}`} whileHover={{ y: -2 }} transition={SPRING.snappy}>
      <span className="tool-fact-k">{k}</span>
      <span className="tool-fact-v">{v}</span>
    </motion.span>
  )
}

/** Split view on desktop, stacked on a phone — the layout every tool should use. */
export function SplitView({ primary, secondary, className = '' }) {
  return <div className={`tool-split ${className}`}>{primary}{secondary}</div>
}

function isPhoneSize() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 640px)').matches
    : false
}
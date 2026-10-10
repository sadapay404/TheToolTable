import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { TOOLS } from '../toolsRegistry.jsx'
import { Logo } from './Logo.jsx'
import { ToolIcon } from './ToolIcon.jsx'
import { useAmbient } from '../lib/motion.js'
import { useRipple } from '../lib/ripple.js'
import { EASE, DURATION, SPRING, t } from '../lib/motion.js'

/**
 * The phone footer.
 *
 * The old one was the desktop footer, shrunk. This is built for a thumb: the
 * wordmark is the centrepiece and it never stops moving, the ticker runs both
 * ways, the credits are real list rows you can press, and every tool in the
 * collection is on screen as a constellation.
 *
 * "Always animated" is taken literally — except under reduced motion, and
 * except on the `lite` profile, where loops keep running but travel less far.
 */

const ROLES = [
  ['Idea by', '01', 'The first spark, and every tool after it.'],
  ['Designed by', '02', 'Every pixel, on a phone first.'],
  ['Created by', '03', 'Built to be used every single day.'],
]

const TICKER_A = ['LOCAL-FIRST', 'NO ACCOUNT', 'NO UPLOAD', 'NO COMPRESSION']
const TICKER_B = [`${TOOLS.length} TOOLS`, 'AND GROWING', 'ONE QUIET TABLE']

const scrollToTop = () => window.scrollTo({
  top: 0,
  behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth',
})

/**
 * One glyph of the wordmark: masked, and it rises when the mark arrives.
 *
 * The observer sits on the **mask**, never on the glyph inside it. An element
 * that its own `overflow: hidden` parent clips away has an intersection ratio
 * of zero, so `whileInView` on the glyph would never fire and the wordmark would
 * stay blank. The mask drives the child through variants instead.
 */
function Glyph({ char, index, tone = '' }) {
  const reduceMotion = useReducedMotion()
  const lift = {
    hidden: { y: '112%' },
    show: { y: 0, transition: reduceMotion ? { duration: 0 } : { ...SPRING.expressive, delay: 0.05 + index * 0.04 } },
  }
  return (
    <motion.span
      className="mfoot-glyph-mask"
      aria-hidden="true"
      initial={reduceMotion ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
    >
      <motion.span className={`mfoot-glyph ${tone}`} variants={lift} whileTap={{ y: '-18%', scale: 1.06 }} transition={SPRING.snappy}>
        {char}
      </motion.span>
    </motion.span>
  )
}

/* ------------------------------------------------------------------ bands -- */

function Aurora() {
  const ambient = useAmbient()
  if (!ambient.enabled) return <span className="mfoot-aurora" aria-hidden="true" />
  const blobs = [
    ['mfoot-aurora-blob--a', 30],
    ['mfoot-aurora-blob--b', 37],
    ['mfoot-aurora-blob--c', 24],
  ].slice(0, ambient.count)
  return (
    <div className="mfoot-aurora" aria-hidden="true">
      {blobs.map(([cls, dur]) => (
        <span key={cls} className={`mfoot-aurora-blob ${cls}`} style={{ animationDuration: `${dur}s`, '--ambient-scale': ambient.scale }} />
      ))}
      <motion.span
        className="mfoot-aurora-sweep"
        animate={{ rotate: 360 }}
        transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
      />
      <span className="mfoot-aurora-scan" />
    </div>
  )
}

/** The wordmark. Big, stacked, and lit by a bar that keeps sweeping. */
function Wordmark() {
  const ambient = useAmbient()
  const reduceMotion = useReducedMotion()
  const tool = [...'TOOL']
  const table = [...'TABLE']
  const ripple = useRipple()

  return (
    <motion.div
      className="mfoot-mark"
      ref={ripple.ref}
      onPointerDown={ripple.onPointerDown}
      data-ripple=""
      role="img"
      aria-label="the TOOL TABLE"
      initial={reduceMotion ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={SPRING.expressive}
    >
      <div className="mfoot-mark-labels">
        <span className="mfoot-mark-by">{TOOLS.length} tools · local-first</span>
        <span className="mfoot-mark-sub">and growing, one quiet table at a time</span>
      </div>

      <div className="mfoot-mark-lockup">
        <div className="mfoot-mark-the">the</div>
        <div className="mfoot-mark-words">
          <span className="mfoot-mark-line">{tool.map((c, i) => <Glyph key={`a${c}${i}`} char={c} index={i} />)}</span>
          <span className="mfoot-mark-line mfoot-mark-line--accent">
            {table.map((c, i) => <Glyph key={`b${c}${i}`} char={c} index={i + 4} tone="accent" />)}
            <motion.span
              className="mfoot-mark-dot"
              aria-hidden="true"
              animate={ambient.enabled ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            >
              <motion.span
                className="mfoot-mark-dot-halo"
                animate={ambient.enabled ? { scale: [1, 2.6], opacity: [0.45, 0] } : { scale: 1, opacity: 0.45 }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut', repeatDelay: 1.1 }}
              />
            </motion.span>
          </span>
        </div>
      </div>

      {/* The light bar. This is what makes the mark feel alive rather than
          printed. Always rendered — the stylesheet is what stops it under
          reduced motion, so there is one rule for that and not two. */}
      <span className="mfoot-mark-sweep" aria-hidden="true" />
    </motion.div>
  )
}

/** Two tickers running in opposite directions, with a lit leading edge. */
function Ticker({ words, reverse = false, duration = 26 }) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="mfoot-ticker" data-reverse={reverse ? 'true' : 'false'} aria-hidden="true">
      <div className="mfoot-ticker-track" style={{ animationDuration: `${duration}s`, animationPlayState: reduceMotion ? 'paused' : 'running' }}>
        {[0, 1, 2].map((copy) => (
          <span className="mfoot-ticker-copy" key={copy}>
            {words.map((word, i) => (
              <React.Fragment key={`${copy}-${word}-${i}`}>
                <span>{word}</span>
                <i>◆</i>
              </React.Fragment>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A credit row you can press. The index chip pulses on a loop. */
function CreditRow({ role, number, note, index, ambient }) {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const ripple = useRipple()
  const panelId = `mfoot-credit-${number}`

  return (
    <motion.button
      type="button"
      className="mfoot-credit"
      ref={ripple.ref}
      onPointerDown={ripple.onPointerDown}
      data-ripple=""
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-controls={panelId}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ ...SPRING.expressive, delay: 0.06 * index }}
      whileTap={{ scale: 0.985 }}
    >
      <motion.span
        className="mfoot-credit-index"
        aria-hidden="true"
        animate={ambient.enabled && !open ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: index * 0.7 }}
      >
        {number}
      </motion.span>

      <span className="mfoot-credit-text">
        <span className="mfoot-credit-role">{role}</span>
        <span className="mfoot-credit-name">Mubashir</span>
        <motion.span
          className="mfoot-credit-note"
          id={panelId}
          initial={false}
          animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
          transition={reduceMotion ? { duration: 0 } : t(DURATION.long2, EASE.emphasizedDecelerate)}
        >
          <span className="mfoot-credit-note-inner">{note}</span>
        </motion.span>
      </span>

      <motion.span
        className="mfoot-credit-chevron"
        aria-hidden="true"
        animate={{ rotate: open ? 90 : 0 }}
        transition={SPRING.snappy}
      >
        ›
      </motion.span>
    </motion.button>
  )
}

/** Every tool in the collection, as a grid of pulsing marks. */
function Constellation() {
  const reduceMotion = useReducedMotion()
  const ambient = useAmbient()
  return (
    <motion.div
      className="mfoot-constellation"
      initial={reduceMotion ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={t(DURATION.extraLong1, EASE.emphasized)}
      aria-label={`All ${TOOLS.length} tools`}
      role="img"
    >
      {TOOLS.map((tool, i) => (
        <motion.span
          key={tool.id}
          className="mfoot-star"
          aria-hidden="true"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.3 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ ...SPRING.bouncy, delay: i * 0.022 }}
          animate={ambient.enabled ? { y: [0, -3, 0] } : { y: 0 }}
          style={{ transition: undefined }}
        >
          <span className="mfoot-star-mark"><ToolIcon name={tool.icon} size={15} /></span>
          <span className="mfoot-star-num">{String(tool.n).padStart(2, '0')}</span>
        </motion.span>
      ))}
    </motion.div>
  )
}

/** A round button whose ring follows scroll without React rendering each frame. */
function BackToTop() {
  const { scrollYProgress } = useScroll()
  const circumference = 2 * Math.PI * 22
  const dashOffset = useTransform(scrollYProgress, (value) => (
    circumference * (1 - Math.min(1, Math.max(0, value)))
  ))

  return (
    <motion.button
      type="button"
      className="mfoot-top"
      onClick={scrollToTop}
      aria-label="Back to top"
      whileTap={{ scale: 0.9 }}
    >
      <svg className="mfoot-top-ring" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="22" fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <motion.circle
          cx="26" cy="26" r="22" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span className="mfoot-top-arrow" aria-hidden="true">↑</span>
    </motion.button>
  )
}

/* ------------------------------------------------------------------ shell -- */

/**
 * The phone footer. Purpose-built for a narrow, thumb-reachable surface and
 * continuous motion; the wide lockup lives in `Footer.jsx`.
 */
export default function MobileFooter() {
  const ambient = useAmbient()
  const reduceMotion = useReducedMotion()
  const year = useMemo(() => new Date().getFullYear(), [])

  return (
    <div className="mfoot" aria-label="TheToolTable credits">
      <Aurora />

      <div className="mfoot-inner">
        <motion.div
          className="mfoot-brand"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={SPRING.expressive}
        >
          <Logo className="w-10 h-10 rounded-xl" shadow />
          <span className="mfoot-brand-text">
            <span className="eyebrow block">TheToolTable</span>
            <span className="mfoot-brand-note">a workbench by Mubashir — built to stay on your device.</span>
          </span>
          <BackToTop />
        </motion.div>

        <Wordmark />

        <div className="mfoot-tickers">
          <Ticker words={TICKER_A} duration={24} />
          <Ticker words={TICKER_B} reverse duration={32} />
        </div>

        <motion.div
          className="mfoot-credits"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={SPRING.expressive}
        >
          {ROLES.map(([role, number, note], i) => (
            <CreditRow key={number} role={role} number={number} note={note} index={i} ambient={ambient} />
          ))}
          {ambient.enabled && <span className="mfoot-credits-sweep" aria-hidden="true" />}
        </motion.div>

        <Constellation />

        <div className="mfoot-base">
          <span>© {year} TheToolTable</span>
          <span className="mfoot-base-dot" aria-hidden="true" />
          <span>v1.2.0</span>
          <span className="mfoot-base-dot" aria-hidden="true" />
          <span>{TOOLS.length} tools</span>
          <button type="button" className="mfoot-base-top" onClick={scrollToTop}>Top</button>
        </div>
      </div>
    </div>
  )
}

export { Wordmark, Constellation, CreditRow, Ticker }
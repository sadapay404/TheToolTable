import React from 'react'
import { motion } from 'framer-motion'
import { EASE, DURATION, t } from '../lib/motion.js'

/**
 * Reveal primitives.
 *
 * `RevealLine` masks a line of text and slides it up out of the mask — the single
 * most useful typographic reveal there is, because it reads as "settling into
 * place" rather than "fading in".
 */

/** One line of text that rises out of an overflow-hidden mask. */
export function RevealLine({ children, delay = 0, className = '', distance = '108%', duration = DURATION.long2 }) {
  const reduced = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <span className={`reveal-line ${className}`}>
      <motion.span
        initial={reduced ? false : { y: distance }}
        animate={{ y: 0 }}
      transition={t(duration, EASE.emphasizedDecelerate, delay)}
    >
        {children}
      </motion.span>
    </span>
  )
}

/** A block that rises and fades into view, optionally on scroll. */
export function RevealBlock({ children, delay = 0, distance = 18, className = '', yoyo = false, inView = false, amount = 0.25 }) {
  const motionProps = inView
    ? {
      initial: { opacity: 0, y: distance },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true, amount },
    }
    : { initial: { opacity: 0, y: distance }, animate: { opacity: 1, y: 0 } }
  return (
    <motion.div
      {...motionProps}
      className={className}
      transition={t(DURATION.long2, EASE.emphasizedDecelerate, delay)}
    >
      {children}
      {yoyo ? <span aria-hidden="true" /> : null}
    </motion.div>
  )
}

/** A rule that draws itself from the left when it enters view. */
export function RevealRule({ delay = 0, className = '', origin = 'left', color = 'var(--primary)' }) {
  const reduced = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <motion.span
      className={`block h-[2px] rounded-full ${className}`}
      style={{ background: color, transformOrigin: `${origin} center` }}
      initial={reduced ? false : { scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={t(DURATION.extraLong1, EASE.emphasized, delay)}
    />
  )
}

/**
 * One glyph of a wordmark, masked so it rises independently.
 *
 * The observer is on the mask, not on the glyph: a child clipped away by its own
 * `overflow: hidden` parent has an intersection ratio of zero, so observing the
 * child directly would mean it never animates in.
 */
export function MaskedGlyph({ char, index, delay = 0 }) {
  const reduced = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const lift = {
    hidden: { y: '110%' },
    show: { y: 0, transition: t(DURATION.long2, EASE.emphasizedDecelerate, delay + index * 0.045) },
  }
  return (
    <motion.span
      className="reveal-line"
      style={{ lineHeight: 0.82 }}
      initial={reduced ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
    >
      <motion.span variants={lift}>{char}</motion.span>
    </motion.span>
  )
}
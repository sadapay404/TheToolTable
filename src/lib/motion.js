/**
 * Material 3 motion system.
 *
 * One place for every curve, duration and spring in the app, plus the small hooks
 * that make scroll, hover and press feel continuous rather than animated.
 *
 * Rules this module enforces:
 *   • Only `transform` and `opacity` are animated on scroll paths — animating
 *     layout properties is what makes a page feel heavy.
 *   • Nothing loops when the OS asks for reduced motion.
 *   • Decorative ambient work is selected once by the application shell. Lite
 *     mode is intentionally static so it can protect battery and frame time.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInView, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring, useTransform } from 'framer-motion'

/* M3 easing curves */
export const EASE = {
  standard: [0.2, 0, 0, 1],
  standardDecelerate: [0, 0, 0, 1],
  standardAccelerate: [0.3, 0, 1, 1],
  emphasized: [0.2, 0, 0, 1],
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1],
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15],
  overshoot: [0.34, 1.56, 0.64, 1],
  drift: 'cubic-bezier(0.45, 0, 0.55, 1)',
}

/* M3 duration tokens (seconds, for Framer Motion) */
export const DURATION = {
  short1: 0.05, short2: 0.1, short3: 0.15, short4: 0.2,
  medium1: 0.25, medium2: 0.3, medium3: 0.35, medium4: 0.4,
  long1: 0.45, long2: 0.5, long3: 0.55, long4: 0.6,
  extraLong1: 0.7, extraLong2: 0.8, extraLong3: 0.9, extraLong4: 1,
}

/* Seconds, for CSS */
export const CSS_MS = Object.fromEntries(Object.entries(DURATION).map(([k, v]) => [k, Math.round(v * 1000)]))

export const t = (duration = DURATION.medium2, ease = EASE.emphasized, delay = 0) => ({ duration, ease, delay })
export const instant = { duration: 0 }

/** Springs for anything a finger is driving. */
export const SPRING = {
  gentle: { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 },
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 },
  expressive: { type: 'spring', stiffness: 340, damping: 22, mass: 0.8 },
  layout: { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 },
  bouncy: { type: 'spring', stiffness: 520, damping: 18, mass: 0.6 },
  /** Slow, heavy settle for large surfaces. */
  heavy: { type: 'spring', stiffness: 180, damping: 30, mass: 1.2 },
  /**
   * The app's original card spring (300/25, no mass). Twenty tools were tuned
   * against it, so it stays a first-class preset rather than a loose literal.
   */
  legacy: { type: 'spring', stiffness: 300, damping: 25 },
}

/**
 * The app's original card spring, kept as a first-class preset so the existing
 * tools that already use it keep their exact feel while sharing one source.
 */
export const CARD_SPRING = SPRING.legacy

export const stagger = (index, step = 0.035, base = 0) => base + index * step
export const staggerChildren = (step = 0.035, delayChildren = 0) => ({ ...SPRING.expressive, staggerChildren: step, delayChildren })

/* --------------------------------------------------------------- variants -- */

export const fadeIn = { hidden: { opacity: 0 }, show: { opacity: 1, transition: t(DURATION.medium2) } }

export const riseIn = (distance = 16) => ({
  hidden: { opacity: 0, y: distance },
  show: { opacity: 1, y: 0, transition: t(DURATION.long1, EASE.emphasizedDecelerate) },
})

export const riseInX = (distance = -18) => ({
  hidden: { opacity: 0, x: distance },
  show: { opacity: 1, x: 0, transition: t(DURATION.long1, EASE.emphasizedDecelerate) },
})

/** Masked line reveal — text slides up out of an overflow-hidden box. */
export const maskLine = {
  hidden: { y: '108%' },
  show: { y: 0, transition: t(DURATION.long2, EASE.emphasizedDecelerate) },
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: t(DURATION.medium2, EASE.emphasizedDecelerate) },
}

export const pressable = {
  rest: { scale: 1 },
  press: { scale: 0.96, transition: t(DURATION.short3, EASE.emphasizedAccelerate) },
  hover: { scale: 1.03, transition: t(DURATION.short4, EASE.emphasized) },
}

/** Material container transform between two screens. */
export const containerTransform = (direction = 1) => ({
  initial: { opacity: 0, x: direction * 28, scale: 0.985 },
  animate: { opacity: 1, x: 0, scale: 1, transition: t(DURATION.long2, EASE.emphasizedDecelerate) },
  exit: { opacity: 0, x: direction * -18, scale: 0.99, transition: t(DURATION.short4, EASE.emphasizedAccelerate) },
})

export const sharedAxis = (direction = 1) => ({
  initial: { opacity: 0, y: direction * 12 },
  animate: { opacity: 1, y: 0, transition: t(DURATION.long2, EASE.emphasizedDecelerate) },
  exit: { opacity: 0, y: direction * -8, transition: t(DURATION.medium1, EASE.emphasizedAccelerate) },
})

/** A line that draws itself from the left as it enters view. */
export const drawRule = (origin = 'left') => ({
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: t(DURATION.extraLong1, EASE.emphasized, 0.15) },
  origin,
})

/** A light sweep across a surface on hover. */
export const shineSweep = {
  rest: { x: '-120%', opacity: 0 },
  hover: { x: '120%', opacity: 1, transition: { duration: DURATION.extraLong2, ease: EASE.emphasized } },
}

/** Endless ambient float. Call only when the shell's ambient profile is enabled. */
export function floatingLoop(duration = 6, distance = 6) {
  return {
    animate: { y: [0, -distance, 0] },
    transition: { duration, repeat: Infinity, ease: 'easeInOut' },
  }
}

/** Endless slow rotation for rings and dials. */
export const spinLoop = (duration = 24, reverse = false) => ({
  animate: { rotate: reverse ? -360 : 360 },
  transition: { duration, repeat: Infinity, ease: 'linear' },
})

/** Breathing glow. */
export const breatheLoop = (duration = 4, min = 0.35, max = 1) => ({
  animate: { opacity: [min, max, min] },
  transition: { duration, repeat: Infinity, ease: 'easeInOut' },
})

/* ------------------------------------------------------------------ hooks -- */

export function useMotionSafe() {
  return !!useReducedMotion()
}

/**
 * Build a Framer transition that collapses to nothing when reduced motion is on.
 * Keeps call sites free of `reduceMotion ? instant : …` ternaries.
 */
export function useTransition(transition) {
  const reduced = useReducedMotion()
  return reduced ? instant : transition
}

/**
 * A pure, shell-owned policy for decorative perpetual motion.
 *
 * `usePerf()` already gives the app a reactive performance snapshot. Keeping this
 * policy pure lets the shell derive it once and pass it to permanent consumers,
 * rather than making each visual layer poll independently. Lite deliberately
 * mounts no decorative loops; interaction feedback and progress remain separate.
 */
export const AMBIENT_STATIC = Object.freeze({ enabled: true, level: 'full', count: 5, scale: 1 })

export function ambientProfile(level = 'full', reduced = false, phone = false) {
  const normalized = level === 'lite' || level === 'balanced' || level === 'full' ? level : 'full'
  /* Balanced is the automatic handset tier. Keep its controls, progress and
     one-shot transitions, but do not keep decorative compositor loops alive
     beneath a phone's screen while it is sitting idle. Full is still opt-in. */
  const enabled = !reduced && normalized !== 'lite' && !(phone && normalized === 'balanced')
  return {
    enabled,
    level: normalized,
    count: enabled ? (normalized === 'balanced' ? 4 : 5) : 0,
    scale: normalized === 'balanced' ? 0.8 : normalized === 'lite' ? 0 : 1,
  }
}

/**
 * Props for a scroll-triggered reveal. Returns `false` when motion is reduced,
 * which Framer Motion accepts as "no animation".
 */
export function useReveal({ distance = 18, delay = 0, once = true, amount = 0.2 } = {}) {
  const reduced = useReducedMotion()
  if (reduced) return { initial: false }
  return {
    initial: { opacity: 0, y: distance },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once, amount },
    transition: t(DURATION.long2, EASE.emphasizedDecelerate, delay),
  }
}

/** Map a scroll MotionValue through a range into a transform value. */
export function useParallax(scrollY, input, output) {
  return useTransform(scrollY, input, output)
}

/**
 * Magnetic pull toward the cursor — desktop only.
 *
 * Returns `style` plus pointer handlers to spread onto the surface. Disabled for
 * touch pointers so a phone tap never drags a card around.
 */
export function useMagnetic({ strength = 0.28, max = 14, disabled = false } = {}) {
  const ref = useRef(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 220, damping: 22, mass: 0.55 })
  const sy = useSpring(y, { stiffness: 220, damping: 22, mass: 0.55 })

  const onPointerMove = useCallback((event) => {
    if (disabled || event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 2 * max * strength * 2)
    y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 2 * max * strength * 2)
  }, [disabled, strength, max, x, y])

  const onPointerLeave = useCallback(() => { x.set(0); y.set(0) }, [x, y])

  return { ref, x: sx, y: sy, onPointerMove, onPointerLeave, style: { x: disabled ? 0 : sx, y: disabled ? 0 : sy } }
}

/** Re-exported so callers only ever need one motion import. */
export { useMotionValueEvent }

/**
 * Legacy helper kept so existing call sites and tests keep working.
 * Returns `true` when this device is allowed to animate at all.
 */
export function shouldAnimate() {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return true
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Animate a number from 0 to `to` the first time it scrolls into view.
 * Returns the live value as a MotionValue so callers can format it without a
 * React re-render per frame.
 */
export function useCountUp(to, { enabled = true, duration = 1.4, inView = false, rootMargin = '0px 0px -12% 0px' } = {}) {
  const value = useMotionValue(enabled ? 0 : to)
  const started = useRef(false)
  const reduced = useReducedMotion()
  const ref = useRef(null)
  const inViewRef = useInView(ref, { once: true, amount: 0.4, margin: rootMargin })

  useEffect(() => {
    if (reduced || !enabled) { value.set(to); return undefined }
    if (inView && !inViewRef) return undefined
    started.current = true
    let raf = 0
    let start = 0
    const step = (now) => {
      if (!start) start = now
      const progress = Math.min(1, (now - start) / (duration * 1000))
      // easeOutExpo — fast commit, long settle.
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      value.set(to * eased)
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, enabled, duration, reduced, value, inView, inViewRef])

  return inView ? { value, ref } : value
}

/** Re-trigger a key whenever `value` changes, for flash/pop feedback. */
export function useFlashKey(value) {
  const previous = useRef(value)
  const [key, setKey] = useState(0)
  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value
      setKey((k) => k + 1)
    }
  }, [value])
  return key
}

/**
 * Drifting background offset driven by the pointer (desktop).
 * Returns -1..1 on both axes, eased.
 */
export function usePointerDrift(max = 14) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 60, damping: 20, mass: 1 })
  const sy = useSpring(y, { stiffness: 60, damping: 20, mass: 1 })

  const onPointerMove = useCallback((event) => {
    if (event.pointerType === 'touch') return
    const nx = (event.clientX / window.innerWidth) - 0.5
    const ny = (event.clientY / window.innerHeight) - 0.5
    x.set(nx * 2 * max)
    y.set(ny * 2 * max)
  }, [max, x, y])

  return { x: sx, y: sy, onPointerMove }
}

/** Stable, evenly spaced delays for a list of any length. */
export function useStaggeredDelay(count, step = 0.04, cap = 10) {
  return useMemo(
    () => Array.from({ length: count }, (_, i) => stagger(Math.min(i, cap), step)),
    [count, step, cap],
  )
}
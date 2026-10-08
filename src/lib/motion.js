/**
 * Material 3 motion tokens, shared by every animated surface in the app.
 *
 * Material's expressive motion uses *emphasized* easing — a long, confident
 * curve that overshoots slightly at the end — instead of the older physical
 * springs. Framer Motion cannot take a cubic-bezier array for a spring, so the
 * expressive curves live here as tween transitions and the springs below are for
 * gestures that genuinely need to follow a finger.
 */
import { useReducedMotion } from 'framer-motion'

/* M3 easing curves */
export const EASE = {
  standard: [0.2, 0, 0, 1],
  standardDecelerate: [0, 0, 0, 1],
  standardAccelerate: [0.3, 0, 1, 1],
  emphasized: [0.2, 0, 0, 1],
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1],
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15],
  legacy: [0.4, 0, 0.2, 1],
}

/* M3 duration tokens (seconds for Framer Motion) */
export const DURATION = {
  short1: 0.05, short2: 0.1, short3: 0.15, short4: 0.2,
  medium1: 0.25, medium2: 0.3, medium3: 0.35, medium4: 0.4,
  long1: 0.45, long2: 0.5, long3: 0.55, long4: 0.6,
  extraLong1: 0.7, extraLong2: 0.8, extraLong3: 0.9, extraLong4: 1,
}

/** Ready-made transitions. `t()` is the reduced-motion aware tween helper. */
export const t = (duration = DURATION.medium2, ease = EASE.emphasized, delay = 0) => ({ duration, ease, delay })
export const instant = { duration: 0 }

/* Springs for anything the pointer is driving. */
export const SPRING = {
  gentle: { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 },
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 },
  expressive: { type: 'spring', stiffness: 340, damping: 22, mass: 0.8 },
  layout: { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 },
}

/** Legacy alias used across the existing components. */
export const CARD_SPRING = { type: 'spring', stiffness: 300, damping: 25 }

/** Per-item delay for staggered reveals. */
export const stagger = (index, step = 0.035, base = 0) => base + index * step

/** Build a stagger container's transition. */
export const staggerChildren = (step = 0.035, delayChildren = 0) => ({
  ...SPRING.expressive,
  staggerChildren: step,
  delayChildren,
})

/* --------------------------------------------------------------- variants -- */

export const fadeIn = { hidden: { opacity: 0 }, show: { opacity: 1, transition: t(DURATION.medium2) } }

export const riseIn = (distance = 16) => ({
  hidden: { opacity: 0, y: distance },
  show: { opacity: 1, y: 0, transition: t(DURATION.long1, EASE.emphasizedDecelerate) },
})

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

/** Shared-axis style fade used for the tool ↔ collection transition. */
export const sharedAxis = (direction = 1) => ({
  initial: { opacity: 0, y: direction * 12 },
  animate: { opacity: 1, y: 0, transition: t(DURATION.long2, EASE.emphasizedDecelerate) },
  exit: { opacity: 0, y: direction * -8, transition: t(DURATION.medium1, EASE.emphasizedAccelerate) },
})

/* ------------------------------------------------------------- utilities --- */

/** Returns a motion-value-safe fallback when the user asked for less motion. */
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

/** True when ambient looping animation should run. */
export const shouldAnimate = (reduceMotion, perfLevel) => !reduceMotion && perfLevel !== 'lite'
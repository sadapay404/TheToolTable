import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, motionValue, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { ToolIcon } from './ToolIcon.jsx'
import { useRipple } from '../lib/ripple.js'
import { EASE, DURATION, t, riseIn, useMagnetic } from '../lib/motion.js'

/* ------------------------------------------------ shared scroll position --
   Every Balanced/Full card used to call `useScroll()`, which attaches its own
   window scroll listener and its own frame bookkeeping: twenty cards meant
   twenty listeners firing on every scroll tick. One window listener now feeds a
   single MotionValue, coalesced to one write per frame and shared by all cards.
   It is reference-counted, so the listener exists only while a tilt card is
   mounted, and Lite never subscribes at all. */
let sharedScrollY = null
let scrollSubscribers = 0
let scrollFrame = 0
const flushScrollY = () => { scrollFrame = 0; sharedScrollY?.set(window.scrollY) }
const onSharedScroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(flushScrollY) }
function sharedScrollMotionValue() {
  if (!sharedScrollY) sharedScrollY = motionValue(typeof window !== 'undefined' ? window.scrollY : 0)
  return sharedScrollY
}
function acquireSharedScroll() {
  const value = sharedScrollMotionValue()
  if (scrollSubscribers++ === 0) window.addEventListener('scroll', onSharedScroll, { passive: true })
  value.set(window.scrollY)
  return value
}
function releaseSharedScroll() {
  if (--scrollSubscribers > 0) return
  window.removeEventListener('scroll', onSharedScroll)
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
}
/** The shared scroll MotionValue, subscribed for the lifetime of the caller. */
function useSharedScrollY() {
  const value = sharedScrollMotionValue()
  useEffect(() => {
    acquireSharedScroll()
    return releaseSharedScroll
  }, [])
  return value
}

/* ----------------------------------------------------------- Lite desktop --
   Lite is deliberately a normal DOM surface. It keeps native keyboard/click and
   preload behaviour, but does not create a scroll observer, ResizeObserver,
   MotionValue springs, or pointer-tracking work for every card in the grid. */
function LiteSurface({ tool, onOpen }) {
  return (
    <div className="h-full">
      <button
        type="button"
        className="card3d card3d--static group block h-full w-full text-left"
        data-tool-id={tool.id}
        aria-label={`Open ${tool.name}`}
        onPointerEnter={() => tool.comp?.preload?.()}
        onFocus={() => tool.comp?.preload?.()}
        onClick={() => onOpen(tool)}
      >
        <div className="sheen" aria-hidden="true" />
        <div className="inner relative h-full p-5 sm:p-7" style={{ transform: 'none', transformStyle: 'flat' }}>
          <div className="card-content flex min-h-full flex-col gap-4 sm:gap-5" style={{ transformStyle: 'flat' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="tool-icon shrink-0" aria-hidden="true"><ToolIcon name={tool.icon} size={22} /></span>
                <span className="eyebrow truncate">{tool.tag}</span>
              </div>
              <span className="ghost-num shrink-0" aria-hidden="true">{String(tool.n).padStart(2, '0')}</span>
            </div>
            <div className="min-h-[88px]">
              <h3 className="display font-semibold text-[19px] sm:text-[21px] leading-snug">{tool.name}</h3>
              <p className="text-[13.5px] leading-relaxed mt-2" style={{ color: 'var(--on-surface-variant)' }}>{tool.desc}</p>
            </div>
            <div className="mt-auto flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: 'var(--on-surface-variant)' }}>Open tool</span>
              <span className="card-arrow" aria-hidden="true">↗</span>
            </div>
          </div>
        </div>
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- desktop --
   Balanced and Full retain the pointer-tracked 3-D tilt, layered parallax and
   sheen. Lite takes the static branch above before these subscriptions mount. */
function TiltSurface({ tool, onOpen, i, level }) {
  const reduceMotion = useReducedMotion()
  const maxTilt = reduceMotion ? 0 : level === 'balanced' ? 7 : 11
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
  const hoverLift = reduceMotion ? -1 : -7
  const hoverDepth = reduceMotion ? 0 : 20

  /* Magnetism lives on an outer wrapper so it composes with the tilt's own
     rotate/scale instead of fighting it for the `x`/`y` channels. */
  /* Scroll-linked depth is reserved for Balanced and Full. The travel window is
     measured from the card's own document position so the grid reads as a stack
     rather than a flat wall; Lite never mounts this path. */
  const stageRef = useRef(null)
  const cardScrollY = useSharedScrollY()
  const depth = reduceMotion ? 0 : level === 'balanced' ? 18 : 24
  const [travel, setTravel] = useState(() => [0, 1])
  useEffect(() => {
    const el = stageRef.current
    if (!el || !depth) return undefined
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      setTravel([Math.max(0, top - window.innerHeight * 1.1), top + window.innerHeight * 1.1])
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) ro.observe(el)
    return () => { window.removeEventListener('resize', measure); if (ro) ro.disconnect() }
  }, [depth])
  const cardParallax = useTransform(cardScrollY, travel, [depth, -depth])

  const magnet = useMagnetic({
    strength: reduceMotion ? 0 : level === 'balanced' ? 0.22 : 0.3,
    max: 16,
    disabled: reduceMotion,
  })
  /* Two MotionValues want the same channel — compose them instead of letting
     the later one win. */
  const stageY = useTransform([cardParallax, magnet.y], ([p, m]) => p + m)

  const trackPointer = useCallback((event) => {
    if (reduceMotion || event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    pointerX.set(Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1)))
    pointerY.set(Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1)))
  }, [reduceMotion, pointerX, pointerY])

  const resetPointer = useCallback(() => { pointerX.set(0); pointerY.set(0) }, [pointerX, pointerY])

  const cardVariants = {
    rest: { y: 0, z: 0, scale: 1, transition: t(DURATION.medium2, EASE.emphasized) },
    hover: {
      y: hoverLift, z: hoverDepth,
      scale: reduceMotion ? 1 : 1.025,
      transition: { ...t(DURATION.medium2, EASE.emphasized), staggerChildren: 0.035, delayChildren: 0.015 },
    },
    tap: { y: 0, z: 0, scale: reduceMotion ? 1 : 0.985, transition: t(DURATION.short3, EASE.emphasizedAccelerate) },
  }

  /* Small choreographed responses for the pieces inside the card. Each one is a
     spring, so the card never snaps — it settles. */
  const iconVariants = {
    ...riseIn(10),
    rest: { scale: 1, rotate: 0 },
    hover: { scale: 1.14, rotate: -7, transition: { ...t(DURATION.long2, EASE.overshoot), yoyo: false } },
  }
  const arrowVariants = {
    rest: { x: 0, y: 0, opacity: 0.75 },
    hover: { x: 4, y: -4, opacity: 1, transition: t(DURATION.long2, EASE.overshoot) },
  }
  const numVariants = {
    ...riseIn(14),
    rest: { opacity: 0.55, scale: 1 },
    hover: { opacity: 1, scale: 1.12, transition: t(DURATION.long2, EASE.overshoot) },
  }

  return (
    <motion.div
      ref={stageRef}
      className="tilt-stage h-full"
      style={{ perspective: 1100, x: magnet.x, y: stageY }}
      onPointerMove={magnet.onPointerMove}
      onPointerLeave={magnet.onPointerLeave}
    >
    <motion.div
      className="h-full"
      initial={reduceMotion ? false : { opacity: 0, y: 34, scale: 0.92 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={reduceMotion ? { duration: 0 } : { ...t(DURATION.long2, EASE.emphasizedDecelerate), delay: 0.05 * (i % 8) }}
    >
      <motion.button
        type="button"
        className="card3d group block w-full text-left"
        data-tool-id={tool.id}
        aria-label={`Open ${tool.name}`}
        variants={cardVariants}
        initial="rest"
        animate="rest"
        whileHover="hover"
        whileFocus="hover"
        whileTap="tap"
        onPointerMove={trackPointer}
        onPointerLeave={resetPointer}
        onPointerEnter={() => tool.comp?.preload?.()}
        onFocus={() => tool.comp?.preload?.()}
        onClick={() => onOpen(tool)}
        style={{ rotateX: reduceMotion ? 0 : rotateX, rotateY: reduceMotion ? 0 : rotateY, transformStyle: 'preserve-3d', '--mx': lightX, '--my': lightY }}
      >
        <div className="sheen" aria-hidden="true" />
        {/* Two sweeps: a slow ambient one that never stops, and a bright one that
            fires on hover. Both are pure CSS on transform. */}
        <span className="card-shine card-shine--ambient" aria-hidden="true" />
        <span className="card-shine card-shine--hover" aria-hidden="true" />
        <div className="inner relative h-full p-5 sm:p-7">
          <motion.div className="card-content flex min-h-full flex-col gap-4 sm:gap-5" style={{ x: reduceMotion ? 0 : contentX, y: reduceMotion ? 0 : contentY }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <motion.span className="tool-icon shrink-0" variants={iconVariants} aria-hidden="true"><ToolIcon name={tool.icon} size={22} /></motion.span>
                <span className="eyebrow truncate">{tool.tag}</span>
              </div>
              <motion.span className="ghost-num shrink-0" variants={numVariants} aria-hidden="true">{String(tool.n).padStart(2, '0')}</motion.span>
            </div>
            <div className="min-h-[88px]">
              <motion.h3 className="display font-semibold text-[19px] sm:text-[21px] leading-snug" variants={riseIn(12)}>{tool.name}</motion.h3>
              <motion.p className="text-[13.5px] leading-relaxed mt-2" style={{ color: 'var(--on-surface-variant)' }}>{tool.desc}</motion.p>
            </div>
            <motion.div className="mt-auto flex items-center justify-between" variants={riseIn(8)}>
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: 'var(--on-surface-variant)' }}>Open tool</span>
              <motion.span className="card-arrow" variants={arrowVariants} aria-hidden="true">↗</motion.span>
            </motion.div>
          </motion.div>
        </div>
      </motion.button>
    </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ phone --
   A Material 3 list item: 56dp icon container, headline, supporting text, and a
   trailing chevron. Long-press opens the tool's quick actions. */
function PhoneSurface({ tool, onOpen, onLongPress, index }) {
  const ripple = useRipple()
  const holdTimer = useRef(null)
  const held = useRef(false)

  const cancelHold = () => { if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null } }

  const startHold = useCallback((event) => {
    if (event.button > 0 || event.pointerType === 'mouse') return
    held.current = false
    cancelHold()
    holdTimer.current = window.setTimeout(() => { held.current = true; onLongPress?.(tool) }, 480)
  }, [onLongPress, tool])

  const endHold = useCallback((event) => {
    cancelHold()
    // A held gesture must not also fire the click that opens the tool.
    if (held.current) { held.current = false; event.preventDefault(); event.stopPropagation() }
  }, [])

  return (
    <motion.li
      variants={riseIn(18)}
      transition={{ ...t(DURATION.medium2, EASE.emphasizedDecelerate), delay: Math.min(index, 8) * 0.035 }}
      className="tool-tile-wrap"
    >
      <motion.button
        type="button"
        ref={ripple.ref}
        onPointerDown={(event) => { ripple.onPointerDown(event); startHold(event) }}
        onPointerMove={cancelHold}
        onPointerUp={endHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onContextMenu={(event) => { event.preventDefault(); onLongPress?.(tool) }}
        onClick={() => { if (!held.current) onOpen(tool) }}
        whileTap={{ scale: 0.985 }}
        transition={t(DURATION.short3, EASE.emphasizedAccelerate)}
        className="tool-tile"
        data-tool-id={tool.id}
        aria-label={`Open ${tool.name}. Long press for more actions.`}
      >
        <span className="tool-tile-icon" aria-hidden="true">
          <ToolIcon name={tool.icon} size={24} />
        </span>
        <span className="tool-tile-text">
          <span className="tool-tile-title">{tool.name}</span>
          <span className="tool-tile-sub">
            <span className="tool-tile-num">{String(tool.n).padStart(2, '0')}</span>
            {tool.tag}
          </span>
        </span>
        <span className="tool-tile-chevron" aria-hidden="true">›</span>
      </motion.button>
    </motion.li>
  )
}

/**
 * One card in the collection. Phones get the Material list treatment; pointer
 * devices keep the 3-D tilt the studio is built around.
 */
export default function ToolCard({ tool, onOpen, onLongPress, i, level = 'full', isPhone = false }) {
  if (isPhone) return <PhoneSurface tool={tool} onOpen={onOpen} onLongPress={onLongPress} index={i} />
  if (level === 'lite') return <LiteSurface tool={tool} onOpen={onOpen} />
  return <TiltSurface tool={tool} onOpen={onOpen} i={i} level={level} />
}

export { LiteSurface, PhoneSurface, TiltSurface }

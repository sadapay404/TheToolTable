import React from 'react'
import { motion } from 'framer-motion'
import { useAmbient, EASE, DURATION, t, spinLoop, breatheLoop } from '../lib/motion.js'

/**
 * Always-on ambient background.
 *
 * The brief was "as many animations as possible", but an ambient layer is the one
 * place where careless motion costs frames on every screen. So it is built to be
 * cheap: CSS keyframes on `transform` only, GPU-composited, no layout or paint per
 * frame, and it thins out on the `lite` profile instead of switching off (a still
 * screen reads as a broken one). Pointer-driven drift is desktop-only.
 */

const BLOBS = [
  { size: 46, x: '4%', y: '6%', from: 'var(--primary)', to: 'var(--tertiary)', dur: 26, delay: 0, opacity: 0.28 },
  { size: 38, x: '72%', y: '2%', from: 'var(--tertiary)', to: 'var(--primary)', dur: 31, delay: -6, opacity: 0.24 },
  /* Kept off the centre column so the headline always sits on clean ground. */
  { size: 54, x: '92%', y: '42%', from: 'var(--secondary)', to: 'var(--primary)', dur: 37, delay: -12, opacity: 0.17 },
  { size: 34, x: '8%', y: '58%', from: 'var(--primary)', to: 'var(--secondary)', dur: 29, delay: -3, opacity: 0.2 },
  { size: 42, x: '80%', y: '76%', from: 'var(--tertiary)', to: 'var(--secondary)', dur: 34, delay: -18, opacity: 0.18 },
]

export default function AmbientField({ drift = null }) {
  const ambient = useAmbient()
  if (!ambient.enabled) return null

  const blobs = BLOBS.slice(0, ambient.count)
  const scale = ambient.scale

  return (
    <div className="ambient-field" aria-hidden="true">
      <motion.div
        className="ambient-wash"
        style={drift ? { x: drift.x, y: drift.y } : undefined}
      />
      <div className="ambient-grid" />
      {blobs.map((blob, i) => (
        <motion.span
          key={i}
          className="ambient-blob"
          style={{
            width: `${blob.size}vmax`,
            height: `${blob.size}vmax`,
            left: blob.x,
            top: blob.y,
            marginLeft: `-${blob.size / 2}vmax`,
            marginTop: `-${blob.size / 2}vmax`,
            opacity: blob.opacity,
            background: `radial-gradient(circle at 34% 30%, ${blob.from}, ${blob.to} 72%, transparent)`,
            animationDuration: `${blob.dur}s`,
            animationDelay: `${blob.delay}s`,
            '--ambient-scale': scale,
          }}
        />
      ))}
      <motion.span
        className="ambient-ring"
        style={{ width: '62vmin', height: '62vmin', top: '-14vmin', right: '-16vmin', opacity: 0.16 }}
        {...spinLoop(48)}
      />
      <motion.span
        className="ambient-ring ambient-ring--inner"
        style={{ width: '40vmin', height: '40vmin', bottom: '-12vmin', left: '-14vmin', opacity: 0.12 }}
        {...spinLoop(34, true)}
      />
    </div>
  )
}

/** Small always-on halo used behind hero marks and section headers. */
export function AmbientHalo({ className = '', duration = 4.4, min = 0.35, max = 0.85 }) {
  const ambient = useAmbient()
  if (!ambient.enabled) return null
  return <motion.span className={`ambient-halo ${className}`} aria-hidden="true" {...breatheLoop(duration, min, max)} />
}

/** Slow spinner for the tool loading state — a bare 0.8s rotate reads as jank. */
export function AmbientSpinner({ size = 40 }) {
  const ambient = useAmbient()
  return (
    <div className="ambient-spinner" style={{ width: size, height: size }} role="status" aria-label="Loading tool">
      <motion.span
        className="ambient-spinner-track"
        animate={ambient.enabled ? { rotate: 360 } : { rotate: 0 }}
        transition={t(DURATION.extraLong3, 'linear')}
      />
      <motion.span
        className="ambient-spinner-arc"
        animate={ambient.enabled ? { rotate: -360 } : { rotate: 0 }}
        transition={t(DURATION.long4, EASE.emphasized, 0.2)}
      />
    </div>
  )
}
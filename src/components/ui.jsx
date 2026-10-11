import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useReducedMotion, useSpring, useMotionValueEvent } from 'framer-motion'
import { ToolIcon } from './ToolIcon.jsx'
import { useRipple } from '../lib/ripple.js'
import { EASE, DURATION, SPRING, t, useDecorativeMotion } from '../lib/motion.js'

/** Spring-animated numeric readout */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString(), className = '', stiffness = 120 }) {
  const mv = useMotionValue(value)
  const sp = useSpring(mv, { stiffness, damping: 22 })
  const [txt, setTxt] = useState(() => format(value))
  useMotionValueEvent(sp, 'change', (v) => setTxt(format(v)))
  useEffect(() => { mv.set(value) }, [value])
  return <span className={className}>{txt}</span>
}

/** Thin animated striped progress for engine work */
export function LiveProgress({ value, label }) {
  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={label} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={t(DURATION.short3, EASE.emphasizedAccelerate)}>{label}</motion.span>
          </AnimatePresence>
          <AnimatedNumber value={value} className="tabular-nums" />%
        </div>
      )}
      <div className="progress-shell relative overflow-hidden">
        <motion.div className="progress-fill stripes" initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
    </div>
  )
}

/**
 * The Material 3 drop target every tool uses to accept files.
 *
 * It answers the three questions a drop target has to answer at a glance:
 * where do I drop it, what goes in it, and is it live right now. The dashed
 * border is drawn with a real stroke animation rather than a CSS dash trick, so
 * it stays smooth at any size.
 */
export function Dropzone({ onFiles, multiple = false, accept, label = 'Drop files here', sub = 'or click to browse', icon = 'upload', children, compact = false }) {
  const [hot, setHot] = useState(false)
  const [landed, setLanded] = useState(0)
  const ref = useRef(null)
  const ripple = useRipple()
  const reduceMotion = useReducedMotion()
  const decorativeMotion = useDecorativeMotion()

  const accept_ = (files) => {
    const list = [...files]
    if (!list.length) return
    setLanded((n) => n + list.length)
    onFiles(multiple ? list : list.slice(0, 1))
  }

  return (
    <motion.div
      ref={ripple.ref}
      onPointerDown={ripple.onPointerDown}
      data-ripple=""
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ref.current?.click() } }}
      className={`app-dropzone dropzone tool-dropzone ${compact ? 'tool-dropzone--compact' : ''}`}
      data-hot={hot}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setHot(true) }}
      onDragLeave={() => setHot(false)}
      onDrop={(e) => { e.preventDefault(); setHot(false); accept_(e.dataTransfer.files) }}
      animate={reduceMotion ? undefined : {
        scale: hot ? 1.012 : 1,
        boxShadow: hot
          ? `0 0 0 4px color-mix(in srgb, var(--primary) 22%, transparent), 0 22px 44px -20px color-mix(in srgb, var(--primary) 60%, transparent)`
          : '0 0 0 0px color-mix(in srgb, var(--primary) 0%, transparent), 0 0 0 0px rgba(0,0,0,0)',
      }}
      transition={SPRING.expressive}
    >
      <input ref={ref} type="file" hidden multiple={multiple} accept={accept} onChange={(e) => { accept_(e.target.files); e.target.value = '' }} />

      {/* Dashed frame. A real border keeps the dashes uniform at any width —
          a stretched SVG stroke would stretch the dashes too. */}
      <span className="tool-dropzone-outline" data-hot={hot} aria-hidden="true" />

      {children || (
        <div className="relative z-[1] flex flex-col items-center text-center">
          <motion.span
            className="tool-dropzone-mark"
            aria-hidden="true"
            animate={hot ? { y: -4, scale: 1.06 } : decorativeMotion ? { y: [0, -6, 0] } : { y: 0, scale: 1 }}
            transition={hot ? SPRING.bouncy : decorativeMotion ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
          >
            <ToolIcon name={icon} size={compact ? 24 : 30} />
          </motion.span>
          <div className="display font-semibold text-[16px] sm:text-[17px] mt-3">{label}</div>
          {sub && <div className="text-[13px] mt-1.5 max-w-[46ch]" style={{ color: 'var(--on-surface-variant)' }}>{sub}</div>}

          <motion.span
            className="tool-dropzone-cta"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING.snappy, delay: 0.14 }}
          >
            {hot ? 'Release to add' : 'Browse files'}
          </motion.span>

          <AnimatePresence>
            {landed > 0 && (
              <motion.span
                key={landed}
                className="tool-dropzone-landed"
                initial={{ opacity: 0, scale: 0.8, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={SPRING.bouncy}
              >
                {landed} file{landed === 1 ? '' : 's'} added
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{landed > 0 ? `${landed} file${landed === 1 ? '' : 's'} added` : ''}</span>
    </motion.div>
  )
}

export function Progress({ value, label }) {
  return (
    <div>
      {label && <div className="flex justify-between text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}><span>{label}</span><span>{Math.round(value)}%</span></div>}
      <div className="progress-shell"><div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
    </div>
  )
}

export function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <div className="label mb-1.5">{label}</div>
      {children}
    </div>
  )
}

export function Select({ value, onChange, options, className = '', label }) {
  return (
    <select aria-label={label || options?.find((o) => typeof o !== 'string' && !o.disabled)?.l || options?.[0] || 'Select'} className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

export function Stat({ k, v }) {
  return (
    <div className="card p-4">
      <div className="label">{k}</div>
      <div className="font-bold mt-1 truncate">{v}</div>
    </div>
  )
}

export function Note({ children, tone = 'info' }) {
  const colors = { info: 'var(--accent2)', warn: '#E8A33D', ok: '#4E937A' }
  return (
    <div className="rounded-xl px-4 py-3 text-[13px] flex items-start gap-2.5 border" style={{ background: `color-mix(in srgb, ${colors[tone]} 10%, var(--surface))`, borderColor: `color-mix(in srgb, ${colors[tone]} 35%, transparent)` }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors[tone]} strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0">
        {tone === 'warn' ? <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          : tone === 'ok' ? <path d="M20 6 9 17l-5-5" />
          : <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>}
      </svg>
      <span>{children}</span>
    </div>
  )
}

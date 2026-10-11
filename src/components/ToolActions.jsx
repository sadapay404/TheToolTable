import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ToolIcon } from './ToolIcon.jsx'
import { EASE, DURATION, t, stagger, riseIn } from '../lib/motion.js'

/**
 * Long-press quick actions for a tool card.
 *
 * A Material bottom sheet with a scrim, a grab handle, the tool's identity, and
 * three actions that are genuinely useful without opening anything: launch it,
 * copy its name, or read its description.
 */
export default function ToolActions({ tool, onClose, onOpen }) {
  const [toast, setToast] = useState('')
  const closeTimerRef = useRef(null)
  const copyRequestRef = useRef(0)

  useEffect(() => {
    if (!tool) return undefined
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tool, onClose])

  /* Closing or swapping sheets invalidates an in-flight clipboard result and
     releases the delayed close, so neither can act on a later tool. */
  useEffect(() => {
    copyRequestRef.current += 1
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
    if (!tool) setToast('')
  }, [tool])
  useEffect(() => () => {
    copyRequestRef.current += 1
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  const copy = async () => {
    const request = ++copyRequestRef.current
    try {
      await navigator.clipboard.writeText(tool.name)
      if (request !== copyRequestRef.current) return
      setToast('Name copied')
    } catch {
      if (request !== copyRequestRef.current) return
      setToast('Could not copy')
    }
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      if (request !== copyRequestRef.current) return
      setToast('')
      onClose()
    }, 700)
  }

  return (
    <AnimatePresence>
      {tool && (
        <motion.div
          className="tool-actions-scrim"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={t(DURATION.short4, EASE.emphasized)}
          onClick={onClose}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={`${tool.name} actions`}
            className="tool-actions-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={t(DURATION.long2, EASE.emphasizedDecelerate)}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tool-actions-handle" aria-hidden="true" />

            <motion.div className="tool-actions-head" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={t(DURATION.medium3, EASE.emphasizedDecelerate)}>
              <span className="tool-actions-icon" aria-hidden="true"><ToolIcon name={tool.icon} size={26} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[16px] truncate">{tool.name}</span>
                <span className="block text-[12.5px] truncate" style={{ color: 'var(--on-surface-variant)' }}>Tool {String(tool.n).padStart(2, '0')} · {tool.tag}</span>
              </span>
            </motion.div>

            <p className="tool-actions-desc">{tool.desc}</p>

            <ul className="tool-actions-list">
              {[
                { key: 'open', label: 'Open tool', hint: 'Jump straight in', primary: true, run: () => { onClose(); onOpen(tool) } },
                { key: 'copy', label: 'Copy name', hint: 'To the clipboard', run: copy },
              ].map((action, index) => (
                <motion.li key={action.key} variants={riseIn(14)} transition={{ ...t(DURATION.medium2, EASE.emphasizedDecelerate), delay: stagger(index, 0.05, 0.06) }}>
                  <button type="button" className={`md3-list-item${action.primary ? ' tool-actions-primary' : ''}`} onClick={action.run}>
                    <span className="tool-actions-glyph" aria-hidden="true">{action.key === 'open' ? '↗' : '⧉'}</span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block font-semibold text-[14.5px]">{action.label}</span>
                      <span className="block text-[11.5px]" style={{ color: 'var(--on-surface-variant)' }}>{action.hint}</span>
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>

            <button type="button" className="md3-text-button w-full mt-1" onClick={onClose}>Cancel</button>
            <p className="tool-actions-toast" role="status" aria-live="polite">{toast}</p>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
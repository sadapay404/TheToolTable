import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { onSaveNotice } from '../lib/utils.js'

/**
 * Confirmation for native saves. On the web the browser's own download shelf is the feedback,
 * but in the Windows/Android shells nothing visible happens unless we say so — this says so.
 */
export default function SaveToast() {
  const [items, setItems] = useState([])
  useEffect(() => onSaveNotice((n) => {
    const id = Math.random().toString(36).slice(2)
    setItems((a) => [...a.slice(-2), { id, ...n }])
    setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), n.tone === 'err' ? 7000 : 4200)
  }), [])
  return (
    <div className="fixed bottom-5 right-5 z-[70] space-y-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {items.map((n) => (
          <motion.div key={n.id} initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="card px-4 py-3 text-[12.5px] font-semibold max-w-[340px] flex items-start gap-2.5"
            style={{ boxShadow: 'var(--shadow-lg)' }}>
            <span className="mt-px shrink-0" style={{ color: n.tone === 'err' ? '#D04841' : '#4E937A' }}>
              {n.tone === 'err'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 8v5m0 4h.01" /><circle cx="12" cy="12" r="9" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
            </span>
            <span className="min-w-0 break-words">{n.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

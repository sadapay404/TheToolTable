/* Overlay primitives that behave like the device expects.
 *
 * `Sheet`  — the little menus behind the header buttons (theme, performance). On a phone it rises
 *            from the bottom as a Material-style sheet with a drag handle; with a mouse it drops
 *            down from the button it belongs to. Same content, same spring, no overflow.
 * `Dialog` — a centred card on desktop, a bottom sheet on mobile. Tools use it for pickers and
 *            confirmations so nothing ever hangs off a small screen.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMobile } from '../lib/useMedia.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }
const SHEET_EASE = { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 }

/** Lock the page behind an open sheet without the layout jumping. */
function useScrollLock(open) {
  useEffect(() => {
    if (!open) return
    const el = document.documentElement
    const before = el.style.overflow
    el.style.overflow = 'hidden'
    return () => { el.style.overflow = before }
  }, [open])
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [open, onClose])
}

function Grabber() {
  return <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full shrink-0" style={{ background: 'var(--border)' }} aria-hidden />
}

/** Mobile: bottom sheet. Desktop: popover anchored to `anchorRef`. */
export function Sheet({ open, onClose, anchorEl, children, width = 300, label }) {
  const mobile = useMobile()
  const [pos, setPos] = useState({ top: 0, right: 16 })
  const boxRef = useRef(null)
  useScrollLock(open && mobile)
  useEscape(open, onClose)

  useLayoutEffect(() => {
    if (!open || mobile) return
    const r = typeof anchorEl?.getBoundingClientRect === 'function' ? anchorEl.getBoundingClientRect() : null
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    else setPos({ top: 64, right: 16 })
    const close = () => onClose()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open, mobile, anchorEl, onClose])

  useEffect(() => {
    if (!open || mobile) return
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target) && !(anchorEl instanceof Element && anchorEl.contains(e.target))) onClose() }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, mobile, anchorEl, onClose])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[70]" style={{ pointerEvents: mobile ? 'auto' : 'none' }}>
        {mobile && (
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,.42)', backdropFilter: 'blur(2px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
        <motion.div
          ref={boxRef}
          role="menu"
          aria-label={label}
          className={mobile
            ? 'absolute left-0 right-0 bottom-0 card !rounded-b-none !rounded-t-[26px] max-h-[84vh] overflow-y-auto no-scrollbar pb-[max(14px,env(safe-area-inset-bottom))]'
            : 'absolute card p-2'}
          style={{
            ...(mobile ? {} : { top: pos.top, right: pos.right, width, boxShadow: 'var(--shadow-lg)', pointerEvents: 'auto' }),
            ...(mobile ? { boxShadow: 'var(--shadow-lg)' } : {}),
          }}
          initial={mobile ? { y: '104%' } : { opacity: 0, y: -8, scale: 0.97 }}
          animate={mobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
          exit={mobile ? { y: '104%' } : { opacity: 0, y: -6, scale: 0.98 }}
          transition={mobile ? SHEET_EASE : SPRING}
        >
          {mobile && <Grabber />}
          {children}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}

/** Centred card on desktop, bottom sheet on mobile. */
export function Dialog({ open, onClose, title, children, footer, wide = false, bare = false }) {
  const mobile = useMobile()
  useScrollLock(open && mobile)
  useEscape(open, onClose)
  if (!open) return null
  const body = (
    <>
      {mobile && <Grabber />}
      {title && (
        <div className="flex items-center gap-3 px-5 pt-3 pb-3 sm:px-6 sm:pt-5" style={{ borderBottom: bare ? 'none' : '1px solid var(--border)' }}>
          <div className="display font-semibold text-[17px] min-w-0 truncate">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="ml-auto shrink-0 grid place-items-center w-11 h-11 -mr-2 rounded-full hover:bg-[var(--surface2)] transition-colors">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}
      <div className={mobile ? 'px-5 pb-2 pt-2' : 'px-6 py-5'}>{children}</div>
      {footer && <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--border)' }}>{footer}</div>}
    </>
  )
  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[72] flex items-end sm:items-center justify-center">
        <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(3px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
        <motion.div
          className={`relative card w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[90vh] sm:max-h-[86vh] overflow-y-auto no-scrollbar ${mobile ? '!rounded-b-none !rounded-t-[26px] pb-[max(12px,env(safe-area-inset-bottom))]' : ''}`}
          style={{ boxShadow: 'var(--shadow-lg)' }}
          initial={mobile ? { y: '104%' } : { opacity: 0, y: 18, scale: 0.98 }}
          animate={mobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
          exit={mobile ? { y: '104%' } : { opacity: 0, y: 12, scale: 0.98 }}
          transition={mobile ? SHEET_EASE : SPRING}
        >
          {body}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}

/** A row inside a Sheet — 48px tall so it is comfortable with a thumb. */
export function SheetRow({ children, onClick, on, star, onStar, href }) {
  return (
    <div className="flex items-center">
      <motion.button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left text-[14.5px] font-semibold transition-colors active:bg-[var(--surface2)]"
        style={on ? { background: 'var(--surface2)' } : undefined}
      >
        {children}
      </motion.button>
      {onStar && (
        <button type="button" onClick={onStar} aria-label={star ? 'Stop opening with this theme' : 'Always open with this theme'}
          className="shrink-0 grid place-items-center w-12 h-12 rounded-full transition-colors active:bg-[var(--surface2)]"
          style={{ color: star ? 'var(--accent)' : 'var(--muted)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill={star ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
          </svg>
        </button>
      )}
    </div>
  )
}

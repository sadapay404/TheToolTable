import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  TRANSFER_STATUS, useTransfers, formatBytes, clearFinishedTransfers, cancelTransfer, activeTransferCount,
} from '../lib/transfers.js'
import { useRipple } from '../lib/ripple.js'
import { DURATION, EASE, SPRING, t } from '../lib/motion.js'

/**
 * The transfer centre.
 *
 * Android notifications tell you a model is downloading. This tells you the same
 * thing without leaving the app — which is what Windows users get, and what an
 * Android user gets when they come back to check.
 *
 * It is deliberately a sheet rather than a toast: a model download can take a
 * while, and a toast that has already gone is useless.
 */

function Speed({ transfer, running }) {
  // A finished row must not keep quoting a speed or an ETA: the last known rate
  // of a transfer that already stopped is just a wrong number.
  if (!running) return null
  if (!transfer.updatedAt || !transfer.startedAt) return null
  const elapsed = (transfer.updatedAt - transfer.startedAt) / 1000
  if (elapsed < 0.8 || transfer.received <= 0) return null
  const bytesPerSecond = transfer.received / elapsed
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null
  const remaining = transfer.total > 0 ? (transfer.total - transfer.received) / bytesPerSecond : Infinity
  const eta = Number.isFinite(remaining) && remaining > 1 && remaining < 86400
    ? remaining < 60 ? `${Math.ceil(remaining)}s left` : `${Math.ceil(remaining / 60)}m left`
    : null
  return (
    <span className="transfer-meta-item">
      {formatBytes(bytesPerSecond)}/s{eta ? ` · ${eta}` : ''}
    </span>
  )
}

function TransferRow({ transfer, onDismiss, onCancel }) {
  const reduceMotion = useReducedMotion()
  const ripple = useRipple()
  const done = transfer.status === TRANSFER_STATUS.completed
  const failed = transfer.status === TRANSFER_STATUS.failed || transfer.status === TRANSFER_STATUS.canceled
  const running = transfer.status === TRANSFER_STATUS.running || transfer.status === TRANSFER_STATUS.queued

  return (
    <motion.li
      className="transfer-row"
      data-status={transfer.status}
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -28, scale: 0.96, transition: t(DURATION.medium2, EASE.emphasizedAccelerate) }}
      transition={{ ...SPRING.expressive, delay: 0.04 }}
    >
      <motion.span
        className="transfer-mark"
        data-kind={transfer.kind}
        aria-hidden="true"
        animate={running ? { y: [0, -3, 0] } : { y: 0 }}
        transition={{ duration: 2.4, repeat: running ? Infinity : 0, ease: 'easeInOut' }}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
          {transfer.kind === 'upload'
            ? <path d="M12 3.6 6.6 9h3.3v6.2h4.2V9h3.3zM4.5 17.4h15v2.6h-15z" />
            : <path d="M11.1 3.2h1.8v7h2.7L12 14.4 8.4 10.2h2.7zM4.4 16.9h15.2v2.6H4.4z" />}
        </svg>
      </motion.span>

      <div className="transfer-body">
        <div className="transfer-head">
          <span className="transfer-title" title={transfer.title}>{transfer.title}</span>
          <span className="transfer-percent tabular-nums">{Math.round(transfer.progress * 100)}%</span>
        </div>

        <div
          className="transfer-rail"
          role="progressbar"
          aria-valuenow={Math.round(transfer.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={transfer.title}
        >
          <motion.span
            className="transfer-fill"
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: transfer.progress }}
            transition={{ ...SPRING.legacy, mass: 0.9 }}
          />
          {running && (
            <motion.span
              className="transfer-shimmer"
              aria-hidden="true"
              animate={reduceMotion ? undefined : { x: ['-120%', '120%'] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </div>

        <div className="transfer-meta">
          <span className="transfer-meta-item tabular-nums">
            {transfer.total > 0
              ? `${formatBytes(transfer.received)} of ${formatBytes(transfer.total)}`
              : formatBytes(transfer.received)}
          </span>
          {transfer.detail && (
            <span className="transfer-meta-item transfer-meta-detail" title={transfer.detail}>{transfer.detail}</span>
          )}
          <Speed transfer={transfer} running={running} />
        </div>
      </div>

      <div className="transfer-actions">
        {running && transfer.canCancel && onCancel && (
          <motion.button
            type="button"
            ref={ripple.ref}
            onPointerDown={ripple.onPointerDown}
            data-ripple=""
            className="transfer-btn"
            aria-label={`Cancel ${transfer.title}`}
            onClick={() => onCancel(transfer)}
            whileTap={{ scale: 0.9 }}
          >
            ✕
          </motion.button>
        )}
        {!running && (
          <motion.button
            type="button"
            className="transfer-btn transfer-btn--quiet"
            aria-label={`Dismiss ${transfer.title}`}
            onClick={() => onDismiss(transfer)}
            whileTap={{ scale: 0.9 }}
            initial={false}
          >
            {done ? '✓' : '!'}
          </motion.button>
        )}
      </div>
    </motion.li>
  )
}

/**
 * A button that appears only while work is running, and a sheet it opens.
 * Mounted once by the shell, so every tool gets it for free.
 */
export default function TransferCentre({ onCancel }) {
  const transfers = useTransfers()
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  const active = useMemo(() => transfers.filter((t) => t.status === TRANSFER_STATUS.running || t.status === TRANSFER_STATUS.queued), [transfers])
  const running = activeTransferCount()

  // The sheet opens itself the moment work appears — however many transfers
  // there are — and then gets out of the way until something new starts.
  const previousRunning = useRef(0)
  useEffect(() => {
    if (running > 0 && previousRunning.current === 0) setOpen(true)
    previousRunning.current = running
  }, [running])

  // Nothing left to show at all: retire the button as well as the sheet.
  useEffect(() => {
    if (transfers.length === 0) setOpen(false)
  }, [transfers.length])

  if (transfers.length === 0) return null

  return (
    <>
      <AnimatePresence>
        {running > 0 && !open && (
          <motion.button
            type="button"
            className="transfer-fab"
            onClick={() => setOpen(true)}
            aria-label={`${running} transfer${running === 1 ? '' : 's'} running`}
            initial={reduceMotion ? false : { opacity: 0, y: 26, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.8 }}
            whileTap={{ scale: 0.94 }}
            transition={SPRING.bouncy}
          >
            <span className="transfer-fab-count tabular-nums">{running}</span>
            <span className="transfer-fab-label">running</span>
            <motion.span
              className="transfer-fab-ring"
              aria-hidden="true"
              animate={reduceMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            className="transfer-sheet"
            role="dialog"
            aria-modal="false"
            aria-label="Transfers"
            initial={reduceMotion ? false : { opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60 }}
            transition={SPRING.snappy}
          >
            <div className="transfer-sheet-grip" aria-hidden="true" />
            <header className="transfer-sheet-head">
              <span className="transfer-sheet-title">
                {running > 0 ? `${running} transfer${running === 1 ? '' : 's'} running` : 'Transfers'}
              </span>
              <span className="transfer-sheet-actions">
                <button
                  type="button"
                  className="transfer-sheet-link"
                  onClick={() => clearFinishedTransfers()}
                >
                  Clear finished
                </button>
                <motion.button
                  type="button"
                  className="transfer-sheet-close"
                  aria-label="Close transfers"
                  onClick={() => setOpen(false)}
                  whileTap={{ scale: 0.9 }}
                >
                  ✕
                </motion.button>
              </span>
            </header>

            <motion.ul className="transfer-list" layout={!reduceMotion}>
              <AnimatePresence initial={false}>
                {transfers.map((transfer) => (
                  <TransferRow
                    key={transfer.id}
                    transfer={transfer}
                    onCancel={onCancel}
                    onDismiss={(t) => cancelTransfer(t.id)}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
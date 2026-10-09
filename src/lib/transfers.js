import { useSyncExternalStore } from 'react'

/**
 * The transfer registry.
 *
 * Background work needs one place that knows what is running. Before this, each
 * transfer invented its own notification: a model download posted nothing at all,
 * an upload posted its own, and there was no way for the UI to show live progress
 * or for the app to rebuild its notifications after being resumed.
 *
 * The registry is deliberately plain — a module-level map plus a snapshot — so it
 * works in a browser (where it simply stays empty) and in the Tauri shell, and it
 * never imports the Tauri API at module scope.
 */

export const TRANSFER_STATUS = {
  queued: 'queued',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
}

/** A finished transfer stays visible long enough to be read, then retires. */
const RETIRE_MS = 8000
/** Native progress events arrive far faster than a notification can be useful. */
const NOTIFY_THROTTLE_MS = 900

const transfers = new Map()
const listeners = new Set()
let snapshot = []
let sequence = 0
let timer = null

function emit() {
  snapshot = [...transfers.values()].sort((a, b) => a.startedAt - b.startedAt)
  listeners.forEach((fn) => { try { fn() } catch { /* a bad listener must not break a transfer */ } })
  scheduleRetire()
}

function scheduleRetire() {
  if (timer) clearTimeout(timer)
  const now = Date.now()
  const soonest = [...transfers.values()]
    .filter((t) => t.retireAt && t.retireAt > now)
    .reduce((min, t) => Math.min(min, t.retireAt), Infinity)
  if (soonest === Infinity) { timer = null; return }
  timer = setTimeout(emit, Math.max(50, soonest - now + 20))
}

/** Public, read-only snapshot. Never hand out the live objects. */
export function getTransfers() {
  return snapshot
}

export function subscribeToTransfers(fn) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Reactive view for components. */
export function useTransfers() {
  return useSyncExternalStore(subscribeToTransfers, getTransfers, getTransfers)
}

/** Transfers that are genuinely still moving. */
export function activeTransferCount() {
  let n = 0
  transfers.forEach((t) => { if (t.status === TRANSFER_STATUS.running || t.status === TRANSFER_STATUS.queued) n += 1 })
  return n
}

export function activeTransfers() {
  return snapshot.filter((t) => t.status === TRANSFER_STATUS.running || t.status === TRANSFER_STATUS.queued)
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  /* Anything under a byte logs a negative index, which printed the unit as the
     literal word "undefined" — e.g. a half-byte read as "512.0 undefined". */
  const index = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log(value) / Math.log(1024))))
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`
}

function clampProgress(value) {
  const n = Number(value || 0)
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n))
}

/**
 * Start tracking a transfer.
 *
 * @returns the transfer id, which is what every later call takes.
 */
export function beginTransfer({ kind = 'download', title, detail = '', total = 0, id = null, notificationId = null, nativePath = null } = {}) {
  sequence += 1
  const transferId = id || `${kind}-${Date.now().toString(36)}-${sequence.toString(36)}`
  transfers.set(transferId, {
    id: transferId,
    kind,
    title: String(title || (kind === 'download' ? 'Download' : 'Upload')),
    detail: String(detail || ''),
    /* The shade entry this transfer owns, and the exact native path it is
       writing to. Both must survive the WebView being suspended: a fresh
       notification id would orphan the old one in the shade, and a rebuilt
       filename would not match the worker the OS is actually running. */
    notificationId: notificationId == null ? null : Number(notificationId),
    nativePath: nativePath == null ? null : String(nativePath),
    status: TRANSFER_STATUS.queued,
    received: 0,
    total: Number(total || 0),
    progress: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    retireAt: null,
    lastNoticeAt: 0,
    canCancel: false,
  })
  emit()
  return transferId
}

/**
 * Report progress. Notifications are throttled here rather than at every call
 * site, so the whole app has one rule for how often the shade is allowed to
 * redraw — a notification posted per chunk is what makes a transfer look like it
 * is stuttering.
 *
 * @param notify set false to skip the native notification (e.g. in a browser).
 */
export function updateTransfer(id, patch = {}, { notify = true, now = Date.now() } = {}) {
  const transfer = transfers.get(id)
  if (!transfer) return null

  const next = { ...transfer }
  if (patch.status) next.status = patch.status
  if (patch.title) next.title = String(patch.title)
  if (patch.detail != null) next.detail = String(patch.detail)
  if (patch.received != null) next.received = Math.max(0, Number(patch.received) || 0)
  if (patch.total != null) next.total = Math.max(0, Number(patch.total) || 0)
  if (patch.canCancel != null) next.canCancel = !!patch.canCancel
  if (patch.notificationId != null) next.notificationId = Number(patch.notificationId)
  if (patch.nativePath != null) next.nativePath = String(patch.nativePath)
  if (patch.progress != null) next.progress = clampProgress(patch.progress)
  else if (next.total > 0) next.progress = clampProgress(next.received / next.total)

  next.updatedAt = now
  // Any real progress means the transfer has left the queue, even when the
  // caller did not say so explicitly.
  if (next.status === TRANSFER_STATUS.queued && (patch.received > 0 || (patch.progress || 0) > 0)) {
    next.status = TRANSFER_STATUS.running
  }
  transfers.set(id, next)

  const shouldNotify = notify && now - (next.lastNoticeAt || 0) >= NOTIFY_THROTTLE_MS
  if (shouldNotify) next.lastNoticeAt = now
  emit()

  return { transfer: next, shouldNotify }
}

/** Mark a transfer finished. It stays on screen briefly, then retires itself. */
export function finishTransfer(id, { status = TRANSFER_STATUS.completed, detail, notify = true, now = Date.now() } = {}) {
  const transfer = transfers.get(id)
  if (!transfer) return null
  const terminal = [TRANSFER_STATUS.completed, TRANSFER_STATUS.failed, TRANSFER_STATUS.canceled].includes(status)
    ? status
    : TRANSFER_STATUS.completed
  const next = {
    ...transfer,
    status: terminal,
    detail: detail != null ? String(detail) : transfer.detail,
    progress: terminal === TRANSFER_STATUS.completed ? 1 : transfer.progress,
    updatedAt: now,
    retireAt: now + RETIRE_MS,
  }
  transfers.set(id, next)
  emit()
  return { transfer: next, shouldNotify: notify, terminal: true }
}

export function failTransfer(id, error, { notify = true, now = Date.now() } = {}) {
  const message = String(error?.message || error || 'Transfer failed')
  const result = finishTransfer(id, { status: TRANSFER_STATUS.failed, detail: message, notify, now })
  return result ? { ...result, message } : null
}

/**
 * Mark a transfer canceled and hand it back so the caller can stop the real
 * work behind it. The row is kept rather than deleted: a canceled download is
 * still something the user asked for and expects to see end.
 */
export function cancelTransfer(id) {
  const transfer = transfers.get(id)
  if (!transfer) return null
  transfers.delete(id)
  emit()
  return transfer
}

/** Read one transfer without subscribing — used when stopping native work. */
export function getTransfer(id) {
  return transfers.get(id) || null
}

/** Drop every finished transfer immediately — used by "dismiss". */
export function clearFinishedTransfers() {
  let removed = 0
  transfers.forEach((t) => {
    if (t.retireAt) { transfers.delete(t.id); removed += 1 }
  })
  if (removed) emit()
  return removed
}

/**
 * Rebuild the in-app view of background work from the native download store.
 *
 * Android keeps working after the WebView is suspended; when the app comes back
 * the UI would otherwise still show a stale spinner. This folds the native
 * records back into the registry so what you see matches what is actually
 * happening.
 */
export async function syncTransfersFromNative({ invoke, adopt } = {}) {
  if (typeof invoke !== 'function') return { adopted: 0, active: 0 }
  let records = []
  try {
    records = (await invoke('plugin:download|list')) || []
  } catch {
    return { adopted: 0, active: 0 }
  }
  const list = Array.isArray(records) ? records : []
  const nativeIds = new Map()

  let adopted = 0
  for (const record of list) {
    const path = String(record?.path || '')
    if (!path) continue
    const name = path.split('/').filter(Boolean).pop() || path
    const status = String(record?.status || '')
    const running = status === 'inProgress' || status === 'idle' || status === 'paused'
    const done = status === 'completed'
    const key = `download:${path}`
    nativeIds.set(key, { running, done })

    const known = [...transfers.keys()].find((id) => transfers.get(id)?.nativeKey === key)
    if (known) {
      updateTransfer(known, {
        status: running ? TRANSFER_STATUS.running : done ? TRANSFER_STATUS.completed : TRANSFER_STATUS.failed,
        received: Number(record?.receivedBytes || 0),
        total: Number(record?.totalBytes || 0) || undefined,
        progress: record?.progress != null ? clampProgress(record.progress) : undefined,
      }, { notify: false })
      continue
    }

    if (!running && !done) continue
    const id = adopt ? adopt({ id: key, title: name, record }) : beginTransfer({ kind: 'download', title: name, id: key, total: Number(record?.totalBytes || 0) })
    const transfer = transfers.get(id)
    if (transfer) { transfer.nativeKey = key; transfer.nativePath = path; transfer.canCancel = running }
    updateTransfer(id, {
      status: running ? TRANSFER_STATUS.running : TRANSFER_STATUS.completed,
      received: Number(record?.receivedBytes || 0),
      total: Number(record?.totalBytes || 0) || undefined,
      progress: record?.progress != null ? clampProgress(record.progress) : undefined,
      detail: running ? 'Resumed in the background' : 'Finished while the app was away',
    }, { notify: false })
    adopted += 1
  }

  // Anything the registry thinks is running that the native store no longer knows
  // about has finished one way or another; do not leave a spinner running.
  const stale = []
  transfers.forEach((t, id) => {
    if (t.status !== TRANSFER_STATUS.running && t.status !== TRANSFER_STATUS.queued) return
    if (!t.nativeKey || nativeIds.has(t.nativeKey)) return
    stale.push(id)
  })
  stale.forEach((id) => failTransfer(id, new Error('Transfer ended in the background'), { notify: false }))

  emit()
  return { adopted, active: list.filter((r) => ['inProgress', 'idle', 'paused'].includes(String(r?.status || ''))).length }
}

/** Reset — used by tests and by the "clear finished" affordance. */
export function resetTransfers() {
  transfers.clear()
  listeners.clear()
  if (timer) { clearTimeout(timer); timer = null }
  sequence = 0
  snapshot = []
}

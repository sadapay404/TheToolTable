import { addPluginListener, convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { appCacheDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import {
  TRANSFER_STATUS, beginTransfer, updateTransfer, finishTransfer, failTransfer,
  activeTransferCount, syncTransfersFromNative, formatBytes,
} from './transfers.js'

const isNative = () => typeof window !== 'undefined' && isTauri()
const isAndroidNative = () => isNative() && /android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent || '' : '')
const activeDownloads = new Map()
let backgroundTaskCount = 0
let backgroundServiceRunning = false
let backgroundServiceQueue = Promise.resolve()
let notificationChannelPromise = null
let notificationId = 41000

function nextNotificationId() {
  notificationId = notificationId >= 2_000_000_000 ? 41000 : notificationId + 1
  return notificationId
}

async function askForNotificationPermission() {
  try {
    const service = await import('tauri-plugin-background-service')
    await service.requestNotificationPermission()
  } catch {
    // A denied permission should not block a native transfer; Android may still
    // keep a foreground-service notification visible in system settings.
  }
}

/** Keep Android's process in the foreground while a native upload is active. */
export async function beginBackgroundTransfer(label = 'Transfer in progress') {
  if (!isAndroidNative()) return async () => {}

  await askForNotificationPermission()
  backgroundTaskCount += 1
  const start = backgroundServiceQueue.then(async () => {
    if (backgroundTaskCount > 0 && !backgroundServiceRunning) {
      const service = await import('tauri-plugin-background-service')
      await service.startService({
        serviceLabel: label,
        foregroundServiceType: 'dataSync',
      })
      backgroundServiceRunning = true
    }
  })
  backgroundServiceQueue = start.catch(() => {})

  try {
    await start
  } catch (error) {
    backgroundTaskCount = Math.max(0, backgroundTaskCount - 1)
    throw new Error(`Could not start the Android background transfer service: ${String(error?.message || error)}`, { cause: error })
  }

  let released = false
  return async () => {
    if (released) return
    released = true
    backgroundTaskCount = Math.max(0, backgroundTaskCount - 1)
    if (backgroundTaskCount === 0) {
      const stop = backgroundServiceQueue.then(async () => {
        // A new upload may have started while the stop was queued.
        if (backgroundTaskCount === 0 && backgroundServiceRunning) {
          const service = await import('tauri-plugin-background-service')
          await service.stopService()
          backgroundServiceRunning = false
        }
      })
      backgroundServiceQueue = stop.catch(() => {})
      try { await stop } catch { /* a stale service notification is preferable to failing a completed transfer */ }
    }
  }
}

async function postProgressNotification(id, title, body, ongoing = true) {
  try {
    const { createChannel, Importance, sendNotification } = await import('@tauri-apps/plugin-notification')
    if (!notificationChannelPromise) {
      notificationChannelPromise = createChannel({
        id: 'background-transfers',
        name: 'Background transfers',
        importance: Importance.Low,
        vibration: false,
        sound: false,
      }).catch(() => {})
    }
    await notificationChannelPromise
    /* Live progress goes in the text: tauri-plugin-notification 2.5 has no
       determinate-progress field, and sending an unknown key risks the whole
       notification being dropped rather than falling back to a text bar. */
    await sendNotification({
      id,
      title,
      body,
      ongoing,
      autoCancel: !ongoing,
      channelId: 'background-transfers',
    })
  } catch {
    // Progress callbacks and file transfer continue if notifications are blocked.
  }
}

/** The body text a transfer's notification shows right now. */
function progressBody(transfer) {
  const size = transfer.total > 0
    ? `${formatBytes(transfer.received)} of ${formatBytes(transfer.total)}`
    : formatBytes(transfer.received)
  const percent = transfer.total > 0 ? ` · ${Math.min(100, Math.floor(transfer.progress * 100))}%` : ''
  return `${size}${percent}`
}

function normalizeProgress(download) {
  const percent = Number(download?.progress || 0)
  return {
    status: download?.status || 'pending',
    receivedBytes: Number(download?.receivedBytes || 0),
    totalBytes: download?.totalBytes == null ? null : Number(download.totalBytes),
    progress: Math.max(0, Math.min(1, percent > 1 ? percent / 100 : percent)),
    fromCache: !!download?.fromCache,
  }
}

function downloadError(download) {
  const message = download?.error?.message || `Download ${download?.status || 'failed'}`
  const error = new Error(message)
  error.code = download?.error?.code || download?.status || 'download'
  return error
}

function safeFileName(name, url) {
  return String(name || new URL(url).pathname.split('/').filter(Boolean).pop() || 'download.bin')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 160) || 'download.bin'
}

export async function appCacheFilePath(name, directory = 'TheToolTable/models') {
  return join(await appCacheDir(), ...directory.split('/').filter(Boolean), safeFileName(name, 'https://local.invalid/'))
}

export async function isAppCacheFilePresent(name, expectedBytes = 0, directory = 'TheToolTable/models') {
  if (!isNative()) return false
  try {
    const path = await appCacheFilePath(name, directory)
    const { exists, stat } = await import('@tauri-apps/plugin-fs')
    if (!await exists(path)) return false
    const size = Number((await stat(path)).size || 0)
    return size > 0 && (!expectedBytes || size >= expectedBytes * 0.9)
  } catch { return false }
}

/**
 * Transfer a URL into a sandboxed app-owned file using the native download
 * manager (WorkManager on Android). It deliberately does not depend on WebView
 * fetch, timers, or component lifetime, so the download can finish while the UI
 * is backgrounded or unmounted.
 */
export async function downloadToAppCache(url, {
  name,
  directory = 'TheToolTable/models',
  expectedBytes = 0,
  onProgress,
  allowMetered = true,
  title = null,
  detail = '',
} = {}) {
  if (!isNative()) throw new Error('Native background downloads require the installed app.')
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    throw new Error('Background downloads require a secure HTTPS URL.')
  }
  if (isAndroidNative()) await askForNotificationPermission()

  const safeName = safeFileName(name, url)
  /* A model download used to run entirely inside the WebView: no foreground
     service, no notification. Switching apps suspended it and the transfer died
     half-finished. Hold the service for the whole download and post live
     progress, exactly as the upload path already did. */
  const label = title || `Downloading ${safeName}`
  const releaseService = await beginBackgroundTransfer(label)
  const notificationId = nextNotificationId()
  const transferId = beginTransfer({
    kind: 'download',
    title: label,
    detail,
    total: expectedBytes || 0,
    notificationId,
  })
  void postProgressNotification(notificationId, label, 'Starting download…', true)

  try {
    return await runNativeDownload(url, {
      name: safeName,
      directory,
      expectedBytes,
      onProgress,
      allowMetered,
      transferId,
      notificationId,
      label,
    })
  } catch (error) {
    const failed = failTransfer(transferId, error)
    if (failed) void postProgressNotification(notificationId, label, `Failed: ${failed.message}`.slice(0, 140), false)
    throw error
  } finally {
    await releaseService()
  }
}

/** The download itself, with every progress event mirrored to the registry. */
async function runNativeDownload(url, {
  name: safeName,
  directory,
  expectedBytes,
  onProgress,
  allowMetered,
  transferId,
  notificationId,
  label,
}) {
  const folder = await join(await appCacheDir(), ...directory.split('/').filter(Boolean))
  const initialPath = await join(folder, safeName)
  const owner = activeDownloads.get(initialPath)
  if (owner) {
    /* Another caller already owns this exact download: join it rather than
       starting a second native transfer for the same path. The joined row has
       to reach a terminal state too, otherwise the Transfer Centre shows a
       spinner that never ends and the shade keeps a progress bar that stops
       moving the moment the owner's poll stops. */
    updateTransfer(transferId, { detail: 'Sharing an in-flight download', nativePath: initialPath, canCancel: true }, { notify: false })
    void postProgressNotification(notificationId, label, 'Sharing an in-flight download', true)
    try {
      const shared = await owner.task
      finishTransfer(transferId, { status: TRANSFER_STATUS.completed, detail: 'Shared an in-flight download', notify: false })
      void postProgressNotification(notificationId, label, 'Download complete — ready offline', false)
      return shared
    } catch (error) {
      const failed = failTransfer(transferId, error, { notify: false })
      void postProgressNotification(notificationId, label, `Failed: ${failed?.message || 'download failed'}`.slice(0, 140), false)
      throw error
    }
  }

  const task = (async () => {
    const { exists, stat } = await import('@tauri-apps/plugin-fs')
    let path = initialPath
    let download = await invoke('plugin:download|get', { path })
    const fileExists = async (candidate) => {
      try {
        if (!await exists(candidate)) return false
        const size = Number((await stat(candidate)).size || 0)
        return size > 0 && (!expectedBytes || size >= expectedBytes * 0.9)
      } catch { return false }
    }

    if (download?.status === 'completed' && await fileExists(path)) {
      const size = (await stat(path)).size
      try { onProgress?.({ status: 'completed', receivedBytes: size, totalBytes: expectedBytes || null, progress: 1, fromCache: true }) } catch {}
      finishTransfer(transferId, { status: TRANSFER_STATUS.completed, detail: 'Already downloaded', notify: false })
      void postProgressNotification(notificationId, label, 'Already downloaded', false)
      return path
    }
    if (download?.status === 'completed' || download?.status === 'canceled') {
      // A completed record whose cache file was purged, or a canceled terminal
      // record, cannot be restarted at the same identity. Preserve its record
      // and create a fresh, unique attempt.
      path = await join(folder, `${Date.now()}-${safeName}`)
      download = await invoke('plugin:download|get', { path })
    } else if ((!download || download.status === 'pending') && await fileExists(path)) {
      // An already complete file without a persisted record is safe to reuse.
      const size = (await stat(path)).size
      try { onProgress?.({ status: 'completed', receivedBytes: size, totalBytes: expectedBytes || null, progress: 1, fromCache: true }) } catch {}
      finishTransfer(transferId, { status: TRANSFER_STATUS.completed, detail: 'Already on this device', notify: false })
      void postProgressNotification(notificationId, label, 'Already on this device', false)
      return path
    }

    let unlisten = null
    let timer = null
    let settled = false
    let settleResolve
    let settleReject
    const finished = new Promise((resolve, reject) => {
      settleResolve = resolve
      settleReject = reject
    })
    const notify = (next) => {
      if (!next || settled) return
      const progress = normalizeProgress(next)
      try { onProgress?.(progress) } catch { /* UI callbacks must not break transfers */ }

      /* Mirror into the registry (in-app) and the shade (system), with one
         throttle for both so a 300 KB/s model cannot flood either. */
      const done = progress.status === 'completed'
      const failed = progress.status === 'failed' || progress.status === 'canceled'
      const result = done
        ? finishTransfer(transferId, { status: TRANSFER_STATUS.completed, detail: 'Saved for offline use' })
        : failed
          ? failTransfer(transferId, downloadError(next))
          : updateTransfer(transferId, {
            status: progress.status === 'paused' ? TRANSFER_STATUS.queued : TRANSFER_STATUS.running,
            received: progress.receivedBytes,
            total: progress.totalBytes ?? undefined,
            progress: progress.progress,
            canCancel: true,
          })
      if (result?.shouldNotify) {
        void postProgressNotification(notificationId, label, progressBody(result.transfer), true)
      }
      if (done) void postProgressNotification(notificationId, label, 'Download complete — ready offline', false)
      else if (failed) void postProgressNotification(notificationId, label, `Failed: ${result?.message || 'download failed'}`.slice(0, 140), false)

      if (done) {
        settled = true
        settleResolve(path)
      } else if (failed) {
        settled = true
        settleReject(downloadError(next))
      }
    }

    try {
      const isPluginNative = await invoke('plugin:download|is_native')
      if (isPluginNative) {
        const listener = await addPluginListener('download', 'changed', (event) => {
          if (event?.path === path) notify(event)
        })
        unlisten = () => listener.unregister()
      } else {
        unlisten = await listen('tauri-plugin-download:changed', (event) => {
          if (event?.payload?.path === path) notify(event.payload)
        })
      }

      download = await invoke('plugin:download|get', { path })
      if (download?.status === 'completed') {
        notify(download)
        return await finished
      }
      if (!download || download.status === 'pending') {
        const created = await invoke('plugin:download|create', {
          path,
          url,
          options: { allowMetered },
        })
        download = created?.download || created
      }

      if (download?.status === 'idle') {
        const started = await invoke('plugin:download|start', { path })
        download = started?.download || started
      } else if (download?.status === 'paused' || download?.status === 'failed') {
        const resumed = await invoke('plugin:download|resume', { path })
        download = resumed?.download || resumed
      }
      notify(download)

      // Poll the native store as a recovery path for missed event delivery (for
      // example, when Android resumes the WebView after the worker completed).
      timer = setInterval(async () => {
        if (settled) return
        try { notify(await invoke('plugin:download|get', { path })) } catch { /* retry on the next tick */ }
      }, 1200)
      return await finished
    } finally {
      if (timer) clearInterval(timer)
      try { unlisten?.() } catch { /* listener may already be gone */ }
    }
  })()

  /* The row learns the exact path the OS worker is writing to, so cancelling
     later stops that worker rather than a guessed filename. */
  updateTransfer(transferId, { nativePath: initialPath, canCancel: true }, { notify: false })
  activeDownloads.set(initialPath, { task, transferId })
  try {
    return await task
  } finally {
    activeDownloads.delete(initialPath)
  }
}

export async function clearNativeModelCache() {
  if (!isNative()) return
  const folder = await join(await appCacheDir(), 'TheToolTable', 'models')
  try {
    const downloads = await invoke('plugin:download|list')
    for (const item of downloads || []) {
      if (!String(item.path || '').startsWith(folder)) continue
      if (item.status === 'inProgress' || item.status === 'idle' || item.status === 'paused' || item.status === 'failed') {
        try { await invoke('plugin:download|cancel', { path: item.path }) } catch {}
      }
    }
  } catch {}
  try {
    const { remove } = await import('@tauri-apps/plugin-fs')
    await remove(folder, { recursive: true })
  } catch { /* the app cache directory may not have been created yet */ }
}

/** Return a URL the model worker can fetch from the Tauri asset protocol. */
export function appFileUrl(path) {
  if (!isNative()) return path
  return convertFileSrc(path)
}

/**
 * Upload a local file using Tauri's native HTTP plugin. The transfer runs in
 * Rust rather than WebView fetch; Android's foreground service keeps it active
 * while the app is backgrounded, and native progress is surfaced in a persistent
 * notification while the UI is available.
 */
export function createTransferNotifier(title = 'File transfer', kind = 'transfer') {
  const id = nextNotificationId()
  const transferId = beginTransfer({ kind, title, notificationId: id })
  let finished = false
  return {
    update(received, total) {
      if (finished) return
      const result = updateTransfer(transferId, { received, total: total || undefined, status: TRANSFER_STATUS.running })
      if (result?.shouldNotify) {
        void postProgressNotification(id, title, progressBody({ ...result.transfer, total: result.transfer.total || Number(total || 0) }), true)
      }
    },
    finish(body = 'Transfer complete') {
      if (finished) return
      finished = true
      finishTransfer(transferId, { status: TRANSFER_STATUS.completed, detail: body })
      void postProgressNotification(id, title, body, false)
    },
    fail(error) {
      if (finished) return
      finished = true
      failTransfer(transferId, error)
      void postProgressNotification(id, title, `Failed: ${String(error?.message || error).slice(0, 120)}`, false)
    },
  }
}

export async function uploadFileInBackground(url, filePath, {
  headers = {},
  method = 'POST',
  title = 'Uploading file',
  onProgress,
} = {}) {
  if (!isNative()) throw new Error('Native background uploads require the installed app.')
  if (!/^https:\/\//i.test(String(url || ''))) throw new Error('Background uploads require a secure HTTPS URL.')

  const releaseService = await beginBackgroundTransfer('Uploading a file')
  const id = nextNotificationId()
  const transferId = beginTransfer({ kind: 'upload', title, detail: filePath.split('/').filter(Boolean).pop() || '', notificationId: id })
  try {
    const { upload, HttpMethod } = await import('@tauri-apps/plugin-upload')
    const httpMethod = method === 'PUT' ? HttpMethod.Put : method === 'PATCH' ? HttpMethod.Patch : HttpMethod.Post
    await postProgressNotification(id, title, 'Preparing upload…', true)
    const response = await upload(url, filePath, (event) => {
      const progress = {
        transferred: Number(event?.progressTotal || 0),
        total: Number(event?.total || 0),
        speed: Number(event?.transferSpeed || 0),
      }
      try { onProgress?.(progress) } catch { /* keep native transfer alive */ }
      const result = updateTransfer(transferId, {
        status: TRANSFER_STATUS.running,
        received: progress.transferred,
        total: progress.total || undefined,
      })
      if (result?.shouldNotify) {
        void postProgressNotification(id, title, `${progressBody(result.transfer)} sent`, true)
      }
    }, new Map(Object.entries(headers)), httpMethod)
    finishTransfer(transferId, { status: TRANSFER_STATUS.completed, detail: 'Upload complete' })
    await postProgressNotification(id, title, 'Upload complete', false)
    return response
  } catch (error) {
    failTransfer(transferId, error)
    await postProgressNotification(id, title, `Upload failed: ${String(error?.message || error).slice(0, 120)}`, false)
    throw error
  } finally {
    await releaseService()
  }
}

/**
 * How many transfers are still moving. Used by the shell to decide whether to
 * hold the Android foreground service open at all.
 */
export function runningTransferCount() {
  return activeTransferCount()
}

/**
 * Stop a transfer for real.
 *
 * Removing the row is only half of it: on Android the WorkManager job keeps
 * running and keeps writing the file. The native cancel has to be given the
 * exact path the worker was registered with — reconstructing a filename from
 * the title misses the timestamped retries and resumed records this module
 * creates, and the transfer then appears canceled while still downloading.
 */
export async function cancelNativeTransfer(transfer) {
  if (!isNative() || !transfer) return false
  const path = transfer.nativePath
  if (!path) return false
  try {
    await invoke('plugin:download|cancel', { path })
    return true
  } catch {
    return false
  }
}

/**
 * Rebuild the in-app view of background work.
 *
 * Android keeps downloading after the WebView is suspended. On resume the UI
 * would still show the spinner it left behind, so the native store is read back
 * in and the registry is corrected.
 */
export async function refreshBackgroundTransfers() {
  if (!isNative()) return { adopted: 0, active: 0 }
  return syncTransfersFromNative({
    invoke,
    adopt: ({ id, title }) => beginTransfer({ kind: 'download', title, id }),
  })
}

/**
 * Re-post a notification for anything still running.
 *
 * Android drops progress notifications when the process is trimmed under memory
 * pressure even with a foreground service held, so the shade can go quiet while
 * work continues. Returning to the app restores it.
 */
export async function restoreProgressNotifications() {
  if (!isNative() || !isAndroidNative()) return 0
  const { getTransfers, TRANSFER_STATUS: S } = await import('./transfers.js')
  let restored = 0
  for (const transfer of getTransfers()) {
    if (transfer.status !== S.running && transfer.status !== S.queued) continue
    restored += 1
    /* Re-post under the id this transfer already owns. A fresh id would leave
       the previous notification orphaned in the shade, so every resume would
       add another stale copy of the same progress bar. */
    const id = transfer.notificationId || nextNotificationId()
    if (!transfer.notificationId) updateTransfer(transfer.id, { notificationId: id }, { notify: false })
    void postProgressNotification(
      id,
      transfer.title,
      `${progressBody(transfer)}${transfer.detail ? ` · ${transfer.detail}` : ''}`,
      true,
    )
  }
  return restored
}

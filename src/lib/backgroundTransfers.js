import { addPluginListener, convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { appCacheDir, join } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'

const isNative = () => typeof window !== 'undefined' && isTauri()
const isAndroidNative = () => isNative() && /android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent || '' : '')
const activeDownloads = new Map()
let backgroundTaskCount = 0
let backgroundServicePromise = null
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
  backgroundServicePromise = start
  backgroundServiceQueue = start.catch(() => {})

  try {
    await start
  } catch (error) {
    backgroundTaskCount = Math.max(0, backgroundTaskCount - 1)
    if (backgroundTaskCount === 0) backgroundServicePromise = null
    throw new Error(`Could not start the Android background transfer service: ${String(error?.message || error)}`)
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
          backgroundServicePromise = null
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
} = {}) {
  if (!isNative()) throw new Error('Native background downloads require the installed app.')
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    throw new Error('Background downloads require a secure HTTPS URL.')
  }
  if (isAndroidNative()) await askForNotificationPermission()

  const safeName = safeFileName(name, url)
  const folder = await join(await appCacheDir(), ...directory.split('/').filter(Boolean))
  const initialPath = await join(folder, safeName)
  const existingTask = activeDownloads.get(initialPath)
  if (existingTask) return existingTask

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
      try { onProgress?.({ status: 'completed', receivedBytes: (await stat(path)).size, totalBytes: expectedBytes || null, progress: 1, fromCache: true }) } catch {}
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
      try { onProgress?.({ status: 'completed', receivedBytes: (await stat(path)).size, totalBytes: expectedBytes || null, progress: 1, fromCache: true }) } catch {}
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
      if (progress.status === 'completed') {
        settled = true
        settleResolve(path)
      } else if (progress.status === 'failed' || progress.status === 'canceled') {
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

  activeDownloads.set(initialPath, task)
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
export function createTransferNotifier(title = 'File transfer') {
  const id = nextNotificationId()
  let lastNotice = 0
  let finished = false
  return {
    update(received, total) {
      if (finished || Date.now() - lastNotice < 900) return
      lastNotice = Date.now()
      const done = Number(received || 0)
      const size = Number(total || 0)
      const percent = size > 0 ? ` · ${Math.min(100, Math.floor(done / size * 100))}%` : ''
      void postProgressNotification(id, title, `${formatBytes(done)} of ${size ? formatBytes(size) : 'unknown'}${percent}`, true)
    },
    finish(body = 'Transfer complete') {
      if (finished) return
      finished = true
      void postProgressNotification(id, title, body, false)
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
  let lastNotice = 0
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
      const now = Date.now()
      if (now - lastNotice > 1400) {
        lastNotice = now
        const percent = progress.total > 0 ? ` · ${Math.min(100, Math.floor(progress.transferred / progress.total * 100))}%` : ''
        void postProgressNotification(id, title, `${formatBytes(progress.transferred)} sent${percent}`, true)
      }
    }, new Map(Object.entries(headers)), httpMethod)
    await postProgressNotification(id, title, 'Upload complete', false)
    return response
  } catch (error) {
    await postProgressNotification(id, title, `Upload failed: ${String(error?.message || error).slice(0, 120)}`, false)
    throw error
  } finally {
    await releaseService()
  }
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`
}

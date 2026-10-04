/** Public-folder asset URL that survives being hosted under a sub-path (Vercel root, Tauri, previews). */
export function assetUrl(path) {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
  return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '')
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1
  do { n /= 1024; i++ } while (n >= 1024 && i < u.length - 1)
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${u[i]}`
}

export function fmtTime(s) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

/* --------------------------- saving files (web + native) --------------------------- */

/**
 * Every tool ends with "save this file". In a browser that is an <a download>; inside the
 * Windows/Android shells (Tauri) a blob anchor silently does nothing, so the bytes are written
 * through the OS instead: Downloads/TheToolTable first, app storage as a fallback.
 */
const saveSubs = new Set()
export const onSaveNotice = (f) => { saveSubs.add(f); return () => saveSubs.delete(f) }
const notifySave = (n) => saveSubs.forEach((f) => { try { f(n) } catch {} })

const tauriGlobal = () => (typeof window !== 'undefined' && window.__TAURI__) || null
export const isNativeShell = () => !!tauriGlobal()
const safeFileName = (n) => (String(n || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 180) || 'file')

/** Write through the native shells. Returns true when the bytes really hit the disk. */
async function saveNative(blob, name) {
  const T = tauriGlobal()
  const fs = T?.fs, path = T?.path
  if (!fs?.writeFile || !path?.downloadDir) return false
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const file = safeFileName(name)
  const targets = []
  try { targets.push(['Downloads/TheToolTable', await path.join(await path.downloadDir(), 'TheToolTable')]) } catch {}
  try { targets.push(['app storage/exports', await path.join(await path.appDataDir(), 'exports')]) } catch {}
  for (const [label, dir] of targets) {
    try {
      await fs.mkdir(dir, { recursive: true }).catch(() => {})
      await fs.writeFile(await path.join(dir, file), bytes)
      notifySave({ tone: 'ok', text: `Saved to ${label}/${file}` })
      return true
    } catch { /* try the next location */ }
  }
  notifySave({ tone: 'err', text: `Could not save ${file} — check the app's storage permission.` })
  return false
}

/** Save a blob anywhere: OS-save in the native builds, browser download on the web. */
export async function download(blob, name) {
  try { if (await saveNative(blob, name)) return true } catch { /* fall through to the browser */ }
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 8000)
    return true
  } catch (e) {
    notifySave({ tone: 'err', text: `Could not save ${name}: ${String(e?.message || e).slice(0, 120)}` })
    return false
  }
}

export function readFile(file) {
  return file.arrayBuffer()
}

export function baseName(name) {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

export function extName(name) {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

/**
 * Real duration of a media file in seconds (NaN when it cannot be read).
 * Screen recordings / camera exports (WebM & MKV) often carry no duration in their header, so
 * `duration` comes back Infinity — we then force the browser to index the file by seeking past the
 * end, which makes it report the true length instead of leaving the caller with a dead "0:00".
 */
export function mediaDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(file.type.startsWith('audio') ? 'audio' : 'video')
    let settled = false
    const done = (d) => { if (settled) return; settled = true; el.removeAttribute('src'); el.load?.(); URL.revokeObjectURL(url); resolve(Number.isFinite(d) && d > 0 ? d : NaN) }
    const timer = setTimeout(() => done(el.duration), 8000)
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) { clearTimeout(timer); return done(el.duration) }
      // Unknown/streaming duration: seeking to a huge timestamp makes the element compute it.
      el.ontimeupdate = () => { if (Number.isFinite(el.duration) && el.duration > 0) { clearTimeout(timer); done(el.duration) } }
      try { el.currentTime = 1e101 } catch { clearTimeout(timer); done(el.duration) }
    }
    el.ondurationchange = () => { if (Number.isFinite(el.duration) && el.duration > 0) { clearTimeout(timer); done(el.duration) } }
    el.onerror = () => { clearTimeout(timer); done(NaN) }
    el.src = url
  })
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }

export function recentAction(label) {
  try {
    const r = JSON.parse(localStorage.getItem('ttt-recent') || '[]')
    r.unshift({ label, t: Date.now() })
    localStorage.setItem('ttt-recent', JSON.stringify(r.slice(0, 8)))
  } catch {}
}

export function getRecent() {
  try { return JSON.parse(localStorage.getItem('ttt-recent') || '[]') } catch { return [] }
}

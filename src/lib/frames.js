// Frame-accurate video helpers shared by the Frame Studio (Tool 07): metadata, fps detection,
// exact seeking, hi-res frame grabs, filmstrip thumbnails and GIF encoding. Pure browser code.
import gifenc from 'gifenc'

const { GIFEncoder, quantize, applyPalette } = gifenc

/* A timecode wider than 999 hours is meaningless, and letting one through costs
   the seconds digit entirely: at that magnitude `m * 60` overflows to Infinity
   and `s - m * 60` renders as the literal text "-Infinity". */
export const MAX_TIMECODE_SECONDS = 999 * 3600 + 59.999

export const tc = (s) => {
  s = Math.min(MAX_TIMECODE_SECONDS, Math.max(0, Number.isFinite(s) ? s : 0))
  const m = Math.floor(s / 60), r = s - m * 60
  return `${m}:${Math.max(0, r).toFixed(3).padStart(6, '0')}`
}

export const STD_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120]
export const MAX_FRAME_EDGE = 8192
export const MAX_FRAME_PIXELS = 32_000_000
export const MAX_GIF_FRAMES = 300
export const MAX_GIF_PIXELS = 30_000_000
export const MAX_SERIES_PIXELS = 12_000_000

const VIDEO_EXTENSIONS = new Set(['3g2', '3gp', 'avi', 'm2ts', 'm2v', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'mts', 'mxf', 'ogv', 'ts', 'vob', 'webm', 'wmv'])

export function isVideoFile(file) {
  if (String(file?.type || '').toLowerCase().startsWith('video/')) return true
  const ext = String(file?.name || '').match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase()
  return !!ext && VIDEO_EXTENSIONS.has(ext)
}

/** Calculate a bounded aspect-preserving canvas size. */
export function fitFrameSize(w, h, maxEdge = MAX_FRAME_EDGE, maxPixels = MAX_FRAME_PIXELS) {
  if (![w, h, maxEdge, maxPixels].every(Number.isFinite) || w <= 0 || h <= 0 || maxEdge < 1 || maxPixels < 1) {
    throw new RangeError('Frame dimensions and limits must be positive finite numbers')
  }
  const scale = Math.min(1, maxEdge / Math.max(w, h), Math.sqrt(maxPixels / (w * h)))
  return {
    w: Math.max(1, Math.floor(w * scale)),
    h: Math.max(1, Math.floor(h * scale)),
    scale,
    capped: scale < 1,
  }
}

/** Bound a ZIP frame sequence by total pixels so large batches do not exhaust browser memory. */
export function frameSeriesPlan(w, h, count, maxPixels = MAX_SERIES_PIXELS) {
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new RangeError('Frame count must be between 1 and 1000')
  if (![w, h, maxPixels].every(Number.isFinite) || w <= 0 || h <= 0 || maxPixels < 1) throw new RangeError('Frame dimensions and pixel budget must be positive')
  const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(w, h), Math.sqrt(maxPixels / (w * h * count)))
  const outW = Math.max(1, Math.floor(w * scale)), outH = Math.max(1, Math.floor(h * scale))
  return { w: outW, h: outH, scale, capped: scale < 1, totalPixels: outW * outH * count }
}

/** Load a video element from an object URL and wait until it has real dimensions + a finite duration. */
export function loadVideo(url, { timeoutMs = 15_000, cancelled } = {}) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.muted = true; v.preload = 'auto'; v.playsInline = true
    let settled = false, cancelTimer = 0
    const cleanupListeners = () => {
      clearTimeout(timer); clearInterval(cancelTimer)
      v.removeEventListener('loadedmetadata', onMetadata)
      v.removeEventListener('error', onError)
    }
    const finish = (err, value) => {
      if (settled) return
      settled = true; cleanupListeners()
      if (err) { releaseVideo(v); reject(err) } else resolve(value)
    }
    const onMetadata = async () => {
      try {
        const duration = await fixDuration(v)
        if (!Number.isFinite(duration) || duration <= 0 || !v.videoWidth || !v.videoHeight) throw new Error('This video has no usable dimensions or duration.')
        finish(null, v)
      } catch (err) { finish(err instanceof Error ? err : new Error(String(err))) }
    }
    const onError = () => finish(new Error('This browser cannot decode that video. Try MP4 (H.264) or WebM.'))
    const timer = setTimeout(() => finish(new Error('Timed out while opening the video. Try a smaller file or another format.')), timeoutMs)
    cancelTimer = setInterval(() => { if (cancelled?.()) finish(new Error('Cancelled')) }, 150)
    v.addEventListener('loadedmetadata', onMetadata)
    v.addEventListener('error', onError)
    try { v.src = url; v.load() } catch (err) { finish(err instanceof Error ? err : new Error(String(err))) }
  })
}

/** Pause and detach a helper video element without revoking its caller-owned URL. */
export function releaseVideo(v) {
  if (!v) return
  try { v.pause() } catch {}
  try { v.removeAttribute('src'); v.srcObject = null; v.load() } catch {}
}

/** MediaRecorder / streamed files report Infinity — seek to the end to learn the real length. */
export async function fixDuration(v) {
  if (Number.isFinite(v.duration) && v.duration > 0) return v.duration
  await new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true; clearTimeout(timer)
      v.removeEventListener('timeupdate', onUpdate); v.removeEventListener('seeked', onUpdate)
      resolve()
    }
    const onUpdate = () => { if (Number.isFinite(v.duration) || (Number.isFinite(v.currentTime) && v.currentTime > 0.001)) finish() }
    const timer = setTimeout(finish, 3000)
    v.addEventListener('timeupdate', onUpdate); v.addEventListener('seeked', onUpdate)
    try { v.currentTime = 1e101 } catch { finish() }
  })
  const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Number(v.currentTime)
  if (!Number.isFinite(duration) || duration <= 0) return null
  try { await seekTo(v, 0, { timeoutMs: 4000 }) } catch {}
  return duration
}

export function seekTo(v, t, { timeoutMs = 10_000, cancelled } = {}) {
  if (!Number.isFinite(t) || t < 0) return Promise.reject(new RangeError('Seek time must be a non-negative finite number'))
  if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let settled = false, cancelTimer = 0
    const needsSeek = Math.abs(v.currentTime - t) >= 1e-4
    let seekComplete = !needsSeek
    const cleanup = () => {
      clearTimeout(timer); clearInterval(cancelTimer)
      v.removeEventListener('seeked', check); v.removeEventListener('loadeddata', check); v.removeEventListener('canplay', check)
      v.removeEventListener('error', onError)
    }
    const finish = (err) => {
      if (settled) return
      settled = true; cleanup()
      if (err) reject(err); else resolve()
    }
    const check = (event) => {
      if (event?.type === 'seeked') seekComplete = true
      if (seekComplete && v.readyState >= 2 && Math.abs(v.currentTime - t) < 0.05) finish()
    }
    const onError = () => finish(new Error('The video could not decode the requested frame.'))
    const timer = setTimeout(() => finish(new Error('Timed out while seeking to that frame.')), timeoutMs)
    if (cancelled) cancelTimer = setInterval(() => { try { if (cancelled()) finish(new Error('Cancelled')) } catch { finish(new Error('Cancelled')) } }, 100)
    v.addEventListener('seeked', check); v.addEventListener('loadeddata', check); v.addEventListener('canplay', check); v.addEventListener('error', onError)
    try { if (needsSeek) v.currentTime = t; check() } catch (err) { finish(err instanceof Error ? err : new Error(String(err))) }
  })
}

/** Measure the real frame rate by timing decoded frames (falls back to null when unsupported). */
export function detectFps(v) {
  if (!('requestVideoFrameCallback' in v)) return Promise.resolve(null)
  return new Promise((resolve) => {
    const times = []
    let finished = false, callbackId = null
    const wasMuted = v.muted
    v.muted = true
    const finish = async () => {
      if (finished) return
      finished = true; clearTimeout(timer)
      if (callbackId != null) { try { v.cancelVideoFrameCallback?.(callbackId) } catch {} }
      try { v.pause() } catch {}
      v.muted = wasMuted
      const d = []
      for (let i = 1; i < times.length; i++) { const x = times[i] - times[i - 1]; if (x > 0.001) d.push(x) }
      try { await seekTo(v, 0, { timeoutMs: 3000 }) } catch {}
      if (d.length < 3) return resolve(null)
      d.sort((a, b) => a - b)
      const raw = 1 / d[Math.floor(d.length / 2)]
      const near = STD_FPS.reduce((b, f) => (Math.abs(f - raw) < Math.abs(b - raw) ? f : b), 30)
      resolve(Math.abs(near - raw) / near < 0.04 ? near : Math.round(raw * 100) / 100)
    }
    const cb = (_, md) => {
      if (finished) return
      times.push(md.mediaTime)
      if (times.length < 16) callbackId = v.requestVideoFrameCallback(cb)
      else finish()
    }
    const timer = setTimeout(finish, 3000)
    try {
      callbackId = v.requestVideoFrameCallback(cb)
      Promise.resolve(v.play()).catch(() => finish())
    } catch { finish() }
  })
}

/** Native-resolution frame → Blob (PNG lossless, or JPG at quality 1.0), within safe canvas limits. */
export function grabFrame(v, fmt = 'png', w = v.videoWidth, h = v.videoHeight) {
  if (!['png', 'jpg', 'jpeg'].includes(fmt)) throw new TypeError('Choose PNG or JPEG frame output')
  const size = fitFrameSize(w, h)
  if (size.capped) throw new RangeError(`This frame is too large for a safe browser canvas (${Math.round(w)}×${Math.round(h)}). Use a smaller source video.`)
  const c = document.createElement('canvas'); c.width = size.w; c.height = size.h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Could not allocate a canvas for this frame')
  ctx.drawImage(v, 0, 0, size.w, size.h)
  const mime = fmt === 'png' ? 'image/png' : 'image/jpeg'
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that frame'))), mime, 1.0))
}

/** Evenly spaced filmstrip thumbnails; calls onThumb(i, dataUrl) as each one is ready. */
export async function filmstrip(url, duration, n, { height = 96, onThumb, cancelled } = {}) {
  const v = await loadVideo(url, { cancelled })
  try {
    const targetH = Math.max(1, Math.round(height)), targetW = Math.max(1, Math.round((v.videoWidth / v.videoHeight) * targetH))
    const { w, h } = fitFrameSize(targetW, targetH, MAX_FRAME_EDGE, 1_000_000)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d')
    if (!x) throw new Error('Could not allocate thumbnail canvas')
    for (let i = 0; i < n; i++) {
      if (cancelled?.()) break
      const t = Math.max(0, Math.min(Math.max(0, v.duration - 0.001), ((i + 0.5) / n) * duration))
      await seekTo(v, t, { cancelled })
      if (cancelled?.()) break
      x.drawImage(v, 0, 0, w, h)
      onThumb?.(i, c.toDataURL('image/jpeg', 0.72))
    }
  } finally { releaseVideo(v) }
}

/** GIF frame and pixel budgets keep encoding usable on phones as well as desktops. */
export function gifPlan(start, end, fps, width = 480, aspect = 16 / 9) {
  if (![start, end, fps, width, aspect].every(Number.isFinite) || start < 0 || end <= start || fps <= 0 || width < 1 || aspect <= 0) {
    throw new RangeError('Choose a valid GIF selection, frame rate and width')
  }
  const duration = end - start
  const wanted = Math.max(1, Math.floor(duration * fps))
  const rawW = Math.max(1, Math.round(width)), rawH = Math.max(1, Math.round(rawW / aspect))
  const size = fitFrameSize(rawW, rawH, MAX_FRAME_EDGE, MAX_GIF_PIXELS)
  const { w, h } = size
  const safeFrames = Math.floor(MAX_GIF_PIXELS / (w * h))
  const frames = Math.min(MAX_GIF_FRAMES, safeFrames, wanted)
  return { frames, wanted, capped: size.capped || frames < wanted, scaled: size.capped, seconds: frames / fps, w, h, pixelCount: frames * w * h }
}

/** Encode start..end of the video as a GIF. Draws each frame into `preview` so the UI can show it live. */
export async function encodeGif({ url, start, end, fps, width, loop, preview, onProgress, cancelled }) {
  const v = await loadVideo(url, { cancelled })
  try {
    const plan = gifPlan(start, end, fps, width, v.videoWidth / v.videoHeight)
    const { frames, w, h } = plan
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Could not allocate a GIF encoding canvas')
    if (preview) { preview.width = w; preview.height = h }
    const px = preview?.getContext('2d')
    const gif = GIFEncoder()
    for (let i = 0; i < frames; i++) {
      if (cancelled?.()) throw new Error('Cancelled')
      await seekTo(v, Math.max(0, Math.min(Math.max(0, v.duration - 0.001), start + i / fps)), { cancelled })
      if (cancelled?.()) throw new Error('Cancelled')
      ctx.drawImage(v, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)
      const palette = quantize(data, 256)
      gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: Math.round(1000 / fps), repeat: loop ? 0 : 1 })
      px?.drawImage(c, 0, 0)
      onProgress?.((i + 1) / frames, i + 1, frames)
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0))
    }
    gif.finish()
    return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), frames, w, h, capped: plan.capped, scaled: plan.scaled, seconds: plan.seconds }
  } finally { releaseVideo(v) }
}

const safeBaseName = (base) => String(base || 'video').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\.\.+/g, '_').slice(0, 100) || 'video'

/** N frames evenly across start..end as a stored ZIP, downscaled to a safe total pixel budget. */
export async function frameSeries({ url, start, end, count, fmt, base, onProgress, cancelled }) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new RangeError('Choose a valid frame-series range')
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new RangeError('Frame count must be between 1 and 1000')
  if (!['png', 'jpg', 'jpeg'].includes(fmt)) throw new TypeError('Choose PNG or JPEG frame output')
  const { zipSync } = await import('fflate')
  const v = await loadVideo(url, { cancelled })
  try {
    const plan = frameSeriesPlan(v.videoWidth, v.videoHeight, count)
    const files = {}, prefix = safeBaseName(base), ext = fmt === 'png' ? 'png' : 'jpg'
    const pad = String(count).length
    for (let i = 0; i < count; i++) {
      if (cancelled?.()) throw new Error('Cancelled')
      const t = count === 1 ? start : start + ((end - start) * i) / (count - 1)
      await seekTo(v, Math.max(0, Math.min(Math.max(0, v.duration - 0.001), t)), { cancelled })
      if (cancelled?.()) throw new Error('Cancelled')
      const blob = await grabFrame(v, fmt, plan.w, plan.h)
      files[`${prefix}-${String(i + 1).padStart(pad, '0')}-${t.toFixed(3)}s.${ext}`] = new Uint8Array(await blob.arrayBuffer())
      onProgress?.((i + 1) / count)
    }
    return { blob: new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), w: plan.w, h: plan.h, frames: count, scaled: plan.capped }
  } finally { releaseVideo(v) }
}

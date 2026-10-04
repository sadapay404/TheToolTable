// Frame-accurate video helpers shared by the Frame Studio (Tool 07): metadata, fps detection,
// exact seeking, hi-res frame grabs, filmstrip thumbnails and GIF encoding. Pure browser code.
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { gifPlan } from './gifplan.js'

export const tc = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r.toFixed(3).padStart(6, '0')}` }

export const STD_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120]

/** Load a video element from an object URL and wait until it has real dimensions + a finite duration. */
export function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.muted = true; v.preload = 'auto'; v.playsInline = true
    v.onloadedmetadata = async () => { await fixDuration(v); resolve(v) }
    v.onerror = () => reject(new Error('This browser cannot decode that video. Try MP4 (H.264) or WebM.'))
    v.src = url
  })
}

/** MediaRecorder / streamed files report Infinity — seek to the end to learn the real length. */
export async function fixDuration(v) {
  if (Number.isFinite(v.duration) && v.duration > 0) return v.duration
  await new Promise((res) => {
    const done = () => { v.removeEventListener('timeupdate', done); res() }
    v.addEventListener('timeupdate', done)
    v.currentTime = 1e101
    setTimeout(res, 3000)
  })
  const d = Number.isFinite(v.duration) ? v.duration : v.currentTime
  v.currentTime = 0
  await seekTo(v, 0)
  return d
}

export function seekTo(v, t) {
  return new Promise((resolve) => {
    if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return resolve()
    const on = () => { v.removeEventListener('seeked', on); resolve() }
    v.addEventListener('seeked', on)
    v.currentTime = t
  })
}

/** Measure the real frame rate by timing decoded frames (falls back to null when unsupported). */
export function detectFps(v) {
  if (!('requestVideoFrameCallback' in v)) return Promise.resolve(null)
  return new Promise((resolve) => {
    const times = []
    let finished = false
    const wasMuted = v.muted; v.muted = true
    const finish = async () => {
      if (finished) return; finished = true
      v.pause(); v.muted = wasMuted
      const d = []
      for (let i = 1; i < times.length; i++) { const x = times[i] - times[i - 1]; if (x > 0.001) d.push(x) }
      await seekTo(v, 0).catch(() => {})
      if (d.length < 3) return resolve(null)
      d.sort((a, b) => a - b)
      const raw = 1 / d[Math.floor(d.length / 2)]
      const near = STD_FPS.reduce((b, f) => (Math.abs(f - raw) < Math.abs(b - raw) ? f : b), 30)
      resolve(Math.abs(near - raw) / near < 0.04 ? near : Math.round(raw * 100) / 100)
    }
    const cb = (_, md) => { times.push(md.mediaTime); if (times.length < 16) v.requestVideoFrameCallback(cb); else finish() }
    v.requestVideoFrameCallback(cb)
    v.play().catch(() => finish())
    setTimeout(finish, 3000)
  })
}

/** Native-resolution frame → Blob (PNG lossless, or JPG at quality 1.0). */
export function grabFrame(v, fmt = 'png', w = v.videoWidth, h = v.videoHeight) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  c.getContext('2d').drawImage(v, 0, 0, w, h)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that frame'))), fmt === 'png' ? 'image/png' : 'image/jpeg', 1.0))
}

/** Evenly spaced filmstrip thumbnails; calls onThumb(i, dataUrl) as each one is ready. */
export async function filmstrip(url, duration, n, { height = 96, onThumb, cancelled }) {
  const v = await loadVideo(url)
  const h = height, w = Math.max(1, Math.round((v.videoWidth / v.videoHeight) * h))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d')
  for (let i = 0; i < n; i++) {
    if (cancelled?.()) break
    await seekTo(v, Math.min(duration - 0.05, ((i + 0.5) / n) * duration))
    x.drawImage(v, 0, 0, w, h)
    onThumb(i, c.toDataURL('image/jpeg', 0.72))
  }
  v.removeAttribute('src'); v.load()
}

// Frame budgeting lives in its own dependency-free module so it stays unit-testable.
export { MAX_GIF_FRAMES, gifPlan } from './gifplan.js'

/** Encode start..end of the video as a GIF. Draws each frame into `preview` (a <canvas>) so the UI can show it live. */
export async function encodeGif({ url, start, end, fps, width, loop, preview, onProgress, cancelled }) {
  const v = await loadVideo(url)
  const { frames, wanted, capped } = gifPlan(start, end, fps)
  const w = width, h = Math.max(1, Math.round((v.videoHeight / v.videoWidth) * w))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (preview) { preview.width = w; preview.height = h }
  const px = preview?.getContext('2d')
  const gif = GIFEncoder()
  for (let i = 0; i < frames; i++) {
    if (cancelled?.()) throw new Error('Cancelled')
    await seekTo(v, Math.min(v.duration - 0.001, start + i / fps))
    ctx.drawImage(v, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    const palette = quantize(data, 256)
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: Math.round(1000 / fps), repeat: loop ? 0 : 1 })
    px?.drawImage(c, 0, 0)
    onProgress?.((i + 1) / frames, i + 1, frames)
    if (i % 4 === 3) await new Promise((r) => setTimeout(r))
  }
  gif.finish()
  v.removeAttribute('src'); v.load()
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), frames, wanted, capped, w, h }
}

/** N frames evenly across start..end as an uncompressed (stored) ZIP of PNG/JPG files. */
export async function frameSeries({ url, start, end, count, fmt, base, onProgress, cancelled }) {
  const { zipSync } = await import('fflate')
  const v = await loadVideo(url)
  const files = {}
  const pad = String(count).length
  for (let i = 0; i < count; i++) {
    if (cancelled?.()) throw new Error('Cancelled')
    const t = count === 1 ? start : start + ((end - start) * i) / (count - 1)
    await seekTo(v, Math.min(v.duration - 0.001, t))
    const blob = await grabFrame(v, fmt)
    files[`${base}-${String(i + 1).padStart(pad, '0')}-${t.toFixed(3)}s.${fmt === 'png' ? 'png' : 'jpg'}`] = new Uint8Array(await blob.arrayBuffer())
    onProgress?.((i + 1) / count)
  }
  v.removeAttribute('src'); v.load()
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}

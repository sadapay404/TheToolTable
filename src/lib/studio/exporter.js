// Export helpers for ImagePlayer Studio. Everything runs on-device.

export const IMAGE_TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }

export function canvasToBlob(canvas, type, quality) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The browser could not encode this image'))), type, quality))
}

export function fitToMax(w, h, max) {
  if (![w, h, max].every(Number.isFinite) || w <= 0 || h <= 0 || max < 1) throw new RangeError('Output dimensions must be positive finite numbers')
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), capped: k < 1 }
}

/** Render the edit at full GPU-safe resolution and encode it. Caller redraws the live canvas afterwards. */
export async function renderImage(renderer, params, { fmt = 'png', quality = 0.95, scale = 1, seed = 1 } = {}) {
  if (!renderer?.gl?.canvas || !IMAGE_TYPES[fmt]) throw new Error('Image export is not available')
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) throw new RangeError('Output scale must be between 0 and 1')
  const dims = renderer.outputDims(params)
  const f = fitToMax(dims.w * scale, dims.h * scale, renderer.maxTex)
  renderer.setSize(f.w, f.h)
  renderer.draw(params, { seed })
  const blob = await canvasToBlob(renderer.gl.canvas, IMAGE_TYPES[fmt], fmt === 'png' ? undefined : quality)
  return { blob, w: f.w, h: f.h, capped: f.capped }
}

/** Which video containers can this browser's MediaRecorder write? MP4 only when truly supported. */
export function supportedVideoTypes() {
  if (typeof MediaRecorder === 'undefined') return []
  const cands = [
    ['mp4', 'video/mp4;codecs=avc1.640034,mp4a.40.2'], ['mp4', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'], ['mp4', 'video/mp4'],
    ['webm', 'video/webm;codecs=vp9,opus'], ['webm', 'video/webm;codecs=vp8,opus'], ['webm', 'video/webm'],
  ]
  const out = []
  for (const [ext, mime] of cands) {
    if (!out.find((o) => o.ext === ext) && MediaRecorder.isTypeSupported(mime)) out.push({ ext, mime })
  }
  return out
}

const evenN = (n) => Math.max(2, Math.round(n / 2) * 2)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function stopRecorder(recorder, stopped) {
  if (!recorder) return
  try { if (recorder.state !== 'inactive') recorder.stop() } catch {}
  if (!stopped) return
  let timer
  try { await Promise.race([stopped, new Promise((resolve) => { timer = setTimeout(resolve, 2000) })]) }
  finally { clearTimeout(timer) }
}

/**
 * Real-time GPU re-encode: plays the source through the shader and records the canvas (+ audio).
 * Only the canvas-capture tracks are owned here; audio tracks belong to the editor's WebAudio graph.
 */
export async function renderVideo({ renderer, video, params, audioStream, mime, bps, fps, scale, seed = 1, speed = 1, onProgress, signal }) {
  if (!renderer?.gl?.canvas || !video) throw new Error('Video export is not available')
  const canvas = renderer.gl.canvas
  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') throw new Error('This browser cannot record the edited video')
  if (signal?.aborted) return null
  if (!Number.isFinite(fps) || fps < 1 || !Number.isFinite(speed) || speed <= 0) throw new RangeError('Frame rate or playback speed is invalid')

  const dims = renderer.outputDims(params)
  const f = fitToMax(dims.w * scale, dims.h * scale, Math.min(4096, renderer.maxTex))
  const w = evenN(f.w), h = evenN(f.h)
  const previous = { loop: video.loop, rate: video.playbackRate, time: video.currentTime }
  let captureStream = null, canvasTracks = [], recorder = null, stopped = null, finishFrames = null
  const chunks = []

  try {
    renderer.setSize(w, h)
    video.pause()
    await seekTo(video, 0)
    if (signal?.aborted) return null
    renderer.refreshVideo(); renderer.draw(params, { seed })

    captureStream = canvas.captureStream(fps)
    canvasTracks = captureStream.getVideoTracks?.() || captureStream.getTracks?.().filter((track) => track.kind === 'video') || []
    const audioTracks = audioStream?.getAudioTracks?.() || []
    for (const track of audioTracks) {
      if (track.readyState !== 'ended' && !captureStream.getTracks?.().some((item) => item.id === track.id)) captureStream.addTrack(track)
    }

    recorder = new MediaRecorder(captureStream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 256000 })
    let resolveStopped
    stopped = new Promise((resolve) => { resolveStopped = resolve })
    let reportRecorderError
    const recorderError = new Promise((resolve) => { reportRecorderError = resolve })
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data) }
    recorder.onstop = () => resolveStopped()
    recorder.onerror = (event) => reportRecorderError(event.error || new Error('The browser stopped recording unexpectedly'))

    video.loop = false
    video.playbackRate = speed
    recorder.start(400)
    await video.play()

    const totalDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null
    const frameLoop = new Promise((resolve, reject) => {
      let raf = 0, settled = false
      const cleanup = () => {
        cancelAnimationFrame(raf)
        video.removeEventListener('ended', onEnded)
        signal?.removeEventListener('abort', onAbort)
      }
      const finish = (error) => {
        if (settled) return
        settled = true; cleanup()
        if (error) reject(error); else resolve()
      }
      const onEnded = () => finish()
      const onAbort = () => finish()
      finishFrames = finish
      video.addEventListener('ended', onEnded)
      signal?.addEventListener('abort', onAbort, { once: true })
      const tick = () => {
        if (signal?.aborted) return finish()
        try {
          renderer.refreshVideo(); renderer.draw(params, { seed })
          onProgress?.(totalDuration ? Math.min(1, Math.max(0, video.currentTime / totalDuration)) : 0)
        } catch (error) { return finish(error) }
        if (video.ended) return finish()
        raf = requestAnimationFrame(tick)
      }
      if (signal?.aborted) finish()
      else raf = requestAnimationFrame(tick)
    })
    const recordingError = recorderError.then((error) => { throw new Error(error?.message || 'The browser stopped recording unexpectedly') })
    await Promise.race([frameLoop, recordingError])
    finishFrames?.()

    if (!signal?.aborted) {
      renderer.refreshVideo(); renderer.draw(params, { seed })
      await delay(250)
    }
    await stopRecorder(recorder, stopped)
    if (signal?.aborted) return null
    return { blob: new Blob(chunks, { type: String(mime).split(';')[0] }), w, h }
  } finally {
    finishFrames?.()
    await stopRecorder(recorder, stopped)
    for (const track of canvasTracks) { try { track.stop() } catch {} }
    video.pause()
    video.loop = previous.loop
    video.playbackRate = previous.rate
    try { if (Number.isFinite(previous.time) && video.readyState >= 1) await seekTo(video, previous.time) } catch {}
  }
}

export function seekTo(video, time, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) return resolve()
    let timer
    const finish = (error) => {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      if (error) reject(error); else resolve()
    }
    const onSeeked = () => finish()
    const onError = () => finish(new Error('The video could not seek to the requested frame'))
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    timer = setTimeout(() => finish(new Error('Timed out while seeking the video')), timeoutMs)
    try { video.currentTime = time } catch (error) { finish(error) }
  })
}

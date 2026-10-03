// Export helpers for ImagePlayer Studio. Everything runs on-device.

export const IMAGE_TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }

export function canvasToBlob(canvas, type, quality) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The browser could not encode this image'))), type, quality))
}

export function fitToMax(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), capped: k < 1 }
}

/** Render the edit at full resolution on the live canvas and encode it. Caller must redraw afterwards. */
export async function renderImage(renderer, params, { fmt = 'png', quality = 0.95, scale = 1, seed = 1 }) {
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

/** Real-time GPU re-encode: plays the source through the shader and records the canvas (+ audio). */
export async function renderVideo({ renderer, video, params, audioStream, mime, bps, fps, scale, seed = 1, speed = 1, onProgress, signal }) {
  const dims = renderer.outputDims(params)
  const f = fitToMax(dims.w * scale, dims.h * scale, Math.min(4096, renderer.maxTex))
  const w = evenN(f.w), h = evenN(f.h)
  renderer.setSize(w, h)
  video.pause()
  await seekTo(video, 0)
  renderer.refreshVideo(); renderer.draw(params, { seed })

  const canvas = renderer.gl.canvas
  const stream = canvas.captureStream(fps)
  if (audioStream) audioStream.getAudioTracks().forEach((t) => stream.addTrack(t))
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 256000 })
  const chunks = []
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
  const stopped = new Promise((res) => { rec.onstop = res })

  const prevLoop = video.loop, prevRate = video.playbackRate
  video.loop = false
  video.playbackRate = speed
  rec.start(400)
  await video.play()

  await new Promise((resolve) => {
    let raf, ended = false
    const finish = () => { if (ended) return; ended = true; cancelAnimationFrame(raf); resolve() }
    video.addEventListener('ended', finish, { once: true })
    const tick = () => {
      if (signal?.aborted) return finish()
      renderer.refreshVideo(); renderer.draw(params, { seed })
      onProgress?.(Math.min(1, video.currentTime / (video.duration || 1)))
      if (video.ended) return finish()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  })
  // flush the final frame
  renderer.refreshVideo(); renderer.draw(params, { seed })
  await new Promise((r) => setTimeout(r, 250))
  rec.stop()
  await stopped
  stream.getTracks().forEach((t) => t.stop())
  video.pause(); video.loop = prevLoop; video.playbackRate = prevRate
  if (signal?.aborted) return null
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), w, h }
}

export function seekTo(video, t) {
  return new Promise((res) => {
    if (Math.abs(video.currentTime - t) < 0.001 && video.readyState >= 2) return res()
    const done = () => { video.removeEventListener('seeked', done); res() }
    video.addEventListener('seeked', done)
    video.currentTime = t
    setTimeout(done, 2500)
  })
}

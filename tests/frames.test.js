import test from 'node:test'
import assert from 'node:assert/strict'
import {
  tc, isVideoFile, fitFrameSize, frameSeriesPlan, gifPlan, releaseVideo, seekTo, MAX_GIF_FRAMES, MAX_GIF_PIXELS, MAX_SERIES_PIXELS,
} from '../src/lib/frames.js'

const file = (name, type = '') => ({ name, type })

test('timecode and video detection tolerate ordinary metadata edge cases', () => {
  assert.equal(tc(61.25), '1:01.250')
  assert.equal(tc(-4), '0:00.000')
  assert.equal(tc(Infinity), '0:00.000')
  assert.equal(isVideoFile(file('movie.MOV')), true)
  assert.equal(isVideoFile(file('movie', 'video/mp4')), true)
  assert.equal(isVideoFile(file('still.jpg')), false)
})

test('frame canvas sizing preserves aspect and respects edge and pixel limits', () => {
  assert.deepEqual(fitFrameSize(8000, 4000, 4096, 40_000_000), { w: 4096, h: 2048, scale: 0.512, capped: true })
  const pixels = fitFrameSize(2000, 1500, 8192, 1_000_000)
  assert.ok(pixels.w * pixels.h <= 1_000_000)
  assert.ok(Math.abs(pixels.w / pixels.h - 4 / 3) < 0.01)
  assert.throws(() => fitFrameSize(0, 100), /positive finite/)
})

test('frame-series planning bounds the whole ZIP and scales only oversized batches', () => {
  const native = frameSeriesPlan(1920, 1080, 3)
  assert.equal(native.capped, false)
  assert.equal(native.w, 1920)
  assert.ok(native.totalPixels <= MAX_SERIES_PIXELS)

  const batch = frameSeriesPlan(3840, 2160, 120)
  assert.equal(batch.capped, true)
  assert.ok(batch.totalPixels <= MAX_SERIES_PIXELS)
  assert.ok(batch.w < 3840)
  assert.throws(() => frameSeriesPlan(1920, 1080, 0), /Frame count/)
})

test('GIF planning applies frame and total-pixel caps before allocating canvases', () => {
  const small = gifPlan(0, 1, 12, 480, 16 / 9)
  assert.equal(small.frames, 12)
  assert.equal(small.capped, false)
  assert.equal(small.pixelCount, small.frames * small.w * small.h)

  const large = gifPlan(0, 30, 30, 1080, 16 / 9)
  assert.equal(large.capped, true)
  assert.ok(large.frames <= MAX_GIF_FRAMES)
  assert.ok(large.pixelCount <= MAX_GIF_PIXELS)
  assert.ok(large.seconds < 30)
  const extremeAspect = gifPlan(0, 1, 12, 1080, 1 / 10_000)
  assert.equal(extremeAspect.scaled, true)
  assert.ok(extremeAspect.w * extremeAspect.h <= MAX_GIF_PIXELS)
  assert.ok(extremeAspect.pixelCount <= MAX_GIF_PIXELS)
  assert.throws(() => gifPlan(1, 0, 12), /valid GIF/)
})

test('a seek waits for the decoded seeked event instead of trusting currentTime alone', async () => {
  const events = new Map()
  let currentTime = 0
  const video = {
    readyState: 2,
    get currentTime() { return currentTime },
    set currentTime(value) { currentTime = value },
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  }
  const seek = seekTo(video, 0.04, { timeoutMs: 1000 })
  let settled = false
  seek.then(() => { settled = true })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(settled, false)
  events.get('seeked')?.({ type: 'seeked' })
  await seek
  assert.equal(events.size, 0)
})

test('a pending frame seek can be cancelled and removes its listeners', async () => {
  const events = new Map()
  let cancelled = false
  const video = {
    currentTime: 0, readyState: 0,
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  }
  const seek = seekTo(video, 2, { timeoutMs: 1000, cancelled: () => cancelled })
  setTimeout(() => { cancelled = true }, 10)
  await assert.rejects(seek, /Cancelled/)
  assert.equal(events.size, 0)
})

test('helper video cleanup pauses and unloads its media source', () => {
  const calls = []
  const video = { pause: () => calls.push('pause'), removeAttribute: (name) => calls.push(`remove:${name}`), load: () => calls.push('load'), srcObject: {} }
  releaseVideo(video)
  assert.deepEqual(calls, ['pause', 'remove:src', 'load'])
  assert.equal(video.srcObject, null)
  releaseVideo(null)
})

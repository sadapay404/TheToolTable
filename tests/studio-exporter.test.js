import test from 'node:test'
import assert from 'node:assert/strict'
import { fitToMax, renderVideo, seekTo } from '../src/lib/studio/exporter.js'
import { fitTextureSize } from '../src/lib/studio/renderer.js'
import { studioMediaKind } from '../src/lib/studio/media.js'

test('image output dimensions are capped proportionally to the available GPU texture size', () => {
  assert.deepEqual(fitTextureSize(12000, 6000, 8192), { w: 8192, h: 4096, capped: true })
  assert.deepEqual(fitTextureSize(1600, 900, 8192), { w: 1600, h: 900, capped: false })
  assert.deepEqual(fitToMax(12000, 6000, 4096), { w: 4096, h: 2048, capped: true })
  assert.throws(() => fitTextureSize(0, 10, 1024), RangeError)
  assert.throws(() => fitToMax(10, 10, 0), RangeError)
})

test('ImagePlayer Studio recognizes image and video files with missing MIME types', () => {
  assert.equal(studioMediaKind({ name: 'photo.JPEG', type: '' }), 'image')
  assert.equal(studioMediaKind({ name: 'clip.MOV', type: '' }), 'video')
  assert.equal(studioMediaKind({ name: 'clip', type: 'video/webm' }), 'video')
  assert.equal(studioMediaKind({ name: 'song.mp3', type: 'audio/mpeg' }), null)
  assert.equal(studioMediaKind({ name: 'archive.bin', type: '' }), null)
})

function makeVideo({ playError = false } = {}) {
  const listeners = new Map()
  return {
    _currentTime: 0,
    get currentTime() { return this._currentTime },
    set currentTime(value) {
      this._currentTime = value
      queueMicrotask(() => { for (const fn of listeners.get('seeked') || []) fn() })
    },
    duration: 0.04, readyState: 2, videoWidth: 640, videoHeight: 360,
    loop: true, playbackRate: 1.25, paused: true, ended: false,
    addEventListener(name, fn) { const group = listeners.get(name) || new Set(); group.add(fn); listeners.set(name, group) },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn) },
    pause() { this.paused = true },
    async play() {
      this.paused = false
      if (playError) throw new Error('playback rejected')
      this.currentTime = this.duration; this.ended = true
      for (const fn of listeners.get('ended') || []) fn()
    },
    setTime(time) {
      this.currentTime = time
      for (const fn of listeners.get('seeked') || []) fn()
    },
  }
}

function makeRenderer(stream) {
  const canvas = { captureStream: () => stream }
  return {
    gl: { canvas }, maxTex: 2048,
    outputDims: () => ({ w: 640, h: 360 }),
    setSize(w, h) { this.lastSize = [w, h] },
    refreshVideo() {}, draw() {},
  }
}

function withRecorderAndFrames(t) {
  const saved = {
    MediaRecorder: globalThis.MediaRecorder,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }
  class Recorder {
    constructor(stream, options) { this.stream = stream; this.options = options; this.state = 'inactive' }
    start() { this.state = 'recording' }
    stop() {
      if (this.state === 'inactive') return
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['encoded']) })
      this.onstop?.()
    }
  }
  globalThis.MediaRecorder = Recorder
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  t.after(() => {
    if (saved.MediaRecorder === undefined) delete globalThis.MediaRecorder
    else globalThis.MediaRecorder = saved.MediaRecorder
    if (saved.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame
    else globalThis.requestAnimationFrame = saved.requestAnimationFrame
    if (saved.cancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame
    else globalThis.cancelAnimationFrame = saved.cancelAnimationFrame
  })
}

function makeTrack(kind, id) {
  return { kind, id, readyState: 'live', stopped: false, stop() { this.stopped = true; this.readyState = 'ended' } }
}
function makeStream(videoTrack) {
  const tracks = [videoTrack]
  return {
    addTrack(track) { tracks.push(track) },
    getVideoTracks() { return tracks.filter((track) => track.kind === 'video') },
    getAudioTracks() { return tracks.filter((track) => track.kind === 'audio') },
    getTracks() { return [...tracks] },
  }
}

test('video export cleanup stops its canvas track but leaves shared WebAudio tracks live', async (t) => {
  withRecorderAndFrames(t)
  const canvasTrack = makeTrack('video', 'canvas-video')
  const audioTrack = makeTrack('audio', 'shared-audio')
  const stream = makeStream(canvasTrack)
  const video = makeVideo()
  const renderer = makeRenderer(stream)
  const progress = []

  const output = await renderVideo({
    renderer, video, params: {}, audioStream: makeStream(audioTrack), mime: 'video/webm',
    bps: 1000000, fps: 30, scale: 1, speed: 1.5, onProgress: (value) => progress.push(value),
  })

  assert.equal(output.blob.size, 7)
  assert.deepEqual([output.w, output.h], [640, 360])
  assert.equal(canvasTrack.stopped, true)
  assert.equal(audioTrack.stopped, false)
  assert.equal(video.paused, true)
  assert.equal(video.loop, true)
  assert.equal(video.playbackRate, 1.25)
  assert.ok(progress.length > 0)
})

test('video export always stops its recorder and restores playback settings when play is rejected', async (t) => {
  withRecorderAndFrames(t)
  const canvasTrack = makeTrack('video', 'canvas-video')
  const audioTrack = makeTrack('audio', 'shared-audio')
  const stream = makeStream(canvasTrack)
  const video = makeVideo({ playError: true })
  const renderer = makeRenderer(stream)

  await assert.rejects(renderVideo({
    renderer, video, params: {}, audioStream: makeStream(audioTrack), mime: 'video/webm',
    bps: 1000000, fps: 30, scale: 1, speed: 2,
  }), /playback rejected/)

  assert.equal(canvasTrack.stopped, true)
  assert.equal(audioTrack.stopped, false)
  assert.equal(video.paused, true)
  assert.equal(video.loop, true)
  assert.equal(video.playbackRate, 1.25)
})

test('seek helper resolves immediately for a ready frame already at the target time', async () => {
  const video = { currentTime: 4, readyState: 2 }
  await seekTo(video, 4)
})

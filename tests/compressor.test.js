import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAudioArgs,
  buildCompressionPlan,
  buildVideoPassArgs,
  encodeToTargetSize,
  mediaKind,
} from '../src/lib/compressor.js'
import { createSerialQueue } from '../src/lib/serial-queue.js'

const fakeFile = (name, type = '') => ({ name, type, size: 8000000 })

test('media kind recognizes audio/video MIME types and common extensions without MIME metadata', () => {
  assert.equal(mediaKind(fakeFile('voice.mp3', '')), 'audio')
  assert.equal(mediaKind(fakeFile('voice', 'audio/ogg')), 'audio')
  assert.equal(mediaKind(fakeFile('phone.MOV', '')), 'video')
  assert.equal(mediaKind(fakeFile('recording.webm', 'video/webm')), 'video')
  assert.equal(mediaKind(fakeFile('unknown.bin', 'application/octet-stream')), null)
})

test('video target math reserves optional audio and container margin', () => {
  const plan = buildCompressionPlan({ kind: 'video', duration: 60, targetMB: 25, audioKbps: 128 })
  assert.equal(plan.kind, 'video')
  assert.ok(plan.videoKbps > 20)
  assert.equal(plan.audioKbps, 128)
  assert.ok(plan.estimatedBytes <= plan.targetBytes)
  assert.equal(plan.fits, true)

  const tooSmall = buildCompressionPlan({ kind: 'video', duration: 900, targetMB: 1, audioKbps: 320 })
  assert.equal(tooSmall.fits, false)
})

test('silent-video mode removes audio allocation and allows more video bitrate for long sources', () => {
  const withAudio = buildCompressionPlan({ kind: 'video', duration: 900, targetMB: 5, audioKbps: 64 })
  const silent = buildCompressionPlan({ kind: 'video', duration: 900, targetMB: 5, audioKbps: 0 })
  assert.equal(withAudio.fits, false)
  assert.equal(silent.fits, true)
  assert.equal(silent.audioBytes, 0)
  assert.equal(silent.audioKbps, 0)
  assert.ok(silent.videoKbps > 20)

  const args = buildVideoPassArgs({ inputName: 'in.mp4', outputName: 'out.mp4', passLogName: 'logs', videoKbps: silent.videoKbps, audioKbps: 0 })
  assert.ok(args.secondPass.includes('-an'))
  assert.ok(!args.secondPass.includes('0:a:0?'))
  assert.ok(!args.secondPass.includes('-c:a'))
})

test('audio-only plan caps AAC bitrate to fit a small target and rejects impossible targets', () => {
  const plan = buildCompressionPlan({ kind: 'audio', duration: 300, targetMB: 2, audioKbps: 320 })
  assert.equal(plan.videoKbps, null)
  assert.ok(plan.audioKbps < 320)
  assert.ok(plan.audioKbps >= 32)
  assert.ok(plan.estimatedBytes <= plan.targetBytes)
  assert.equal(plan.fits, true)

  const impossible = buildCompressionPlan({ kind: 'audio', duration: 900, targetMB: 1, audioKbps: 64 })
  assert.equal(impossible.fits, false)
  assert.ok(impossible.audioKbps < 32)
})

test('video compression arguments perform both x264 passes and map audio optionally', () => {
  const args = buildVideoPassArgs({
    inputName: 'in.mov', outputName: 'out.mp4', passLogName: 'logs', videoKbps: 900, audioKbps: 128, scale: 0.5,
  })
  assert.ok(args.firstPass.includes('-pass') && args.firstPass.includes('1'))
  assert.ok(args.secondPass.includes('-pass') && args.secondPass.includes('2'))
  assert.ok(args.firstPass.includes('scale=trunc(iw*0.5/2)*2:trunc(ih*0.5/2)*2'))
  assert.ok(args.secondPass.includes('0:a:0?'))
  assert.ok(args.secondPass.includes('libx264'))
  assert.equal(args.secondPass.at(-1), 'out.mp4')
})

test('audio-only encoding produces an AAC M4A command with no video encoder', () => {
  const args = buildAudioArgs('in.mp3', 'out.m4a', 96)
  assert.ok(args.includes('-map') && args.includes('0:a:0'))
  assert.ok(args.includes('-vn'))
  assert.ok(args.includes('aac'))
  assert.ok(!args.includes('libx264'))
  assert.equal(args.at(-1), 'out.m4a')
})

class FakeFFmpeg {
  constructor({ failAt = null } = {}) { this.calls = []; this.deleted = []; this.failAt = failAt; this.progress = null; this.offCount = 0 }
  on(name, handler) { if (name === 'progress') this.progress = handler }
  off(name, handler) { if (name === 'progress' && this.progress === handler) this.progress = null; this.offCount++ }
  async writeFile(name, bytes) { this.input = { name, bytes } }
  async exec(args) {
    this.calls.push(args)
    this.progress?.({ progress: 0.5 })
    if (this.failAt === this.calls.length) throw new Error('mock pass failed')
  }
  async readFile(name) { this.output = name; return new Uint8Array([1, 2, 3]) }
  async deleteFile(name) { this.deleted.push(name) }
}

test('target-size video execution serializes both passes and always removes temporary files', async () => {
  const ffmpeg = new FakeFFmpeg()
  const progress = []
  const plan = buildCompressionPlan({ kind: 'video', duration: 60, targetMB: 25, audioKbps: 128 })
  const result = await encodeToTargetSize(fakeFile('clip.mp4'), plan, {
    loadFFmpeg: async () => ffmpeg,
    readFile: async () => new Uint8Array([9]),
    runJob: createSerialQueue(),
    onProgress: (value) => progress.push(value),
  })

  assert.equal(result.ext, 'mp4')
  assert.equal(result.blob.type, 'video/mp4')
  assert.equal(result.blob.size, 3)
  assert.equal(ffmpeg.calls.length, 2)
  assert.ok(ffmpeg.deleted.some((name) => name.endsWith('-input.mp4')))
  assert.ok(ffmpeg.deleted.some((name) => name.endsWith('-compressed.mp4')))
  assert.ok(ffmpeg.deleted.some((name) => name.endsWith('-passlog-0.log')))
  assert.equal(ffmpeg.offCount, 1)
  assert.ok(progress.some((value) => value === 25))
  assert.equal(progress.at(-1), 100)
})

test('failed encode pass cleans its files and releases the progress listener', async () => {
  const ffmpeg = new FakeFFmpeg({ failAt: 1 })
  const plan = buildCompressionPlan({ kind: 'video', duration: 60, targetMB: 25, audioKbps: 128 })
  await assert.rejects(encodeToTargetSize(fakeFile('clip.mp4'), plan, {
    loadFFmpeg: async () => ffmpeg,
    readFile: async () => new Uint8Array([9]),
    runJob: createSerialQueue(),
  }), /mock pass failed/)
  assert.equal(ffmpeg.calls.length, 1)
  assert.equal(ffmpeg.deleted.length, 4)
  assert.equal(ffmpeg.offCount, 1)
  assert.equal(ffmpeg.progress, null)
})

test('audio-only execution uses one AAC pass and writes an M4A blob', async () => {
  const ffmpeg = new FakeFFmpeg()
  const plan = buildCompressionPlan({ kind: 'audio', duration: 120, targetMB: 5, audioKbps: 128 })
  const result = await encodeToTargetSize(fakeFile('voice.wav', 'audio/wav'), plan, {
    loadFFmpeg: async () => ffmpeg,
    readFile: async () => new Uint8Array([4]),
    runJob: createSerialQueue(),
  })
  assert.equal(ffmpeg.calls.length, 1)
  assert.equal(ffmpeg.calls[0].includes('libx264'), false)
  assert.equal(result.ext, 'm4a')
  assert.equal(result.blob.type, 'audio/mp4')
})

test('shared FFmpeg queue runs jobs sequentially even when one rejects', async () => {
  const sequence = []
  const enqueue = createSerialQueue()
  const first = enqueue(async () => {
    sequence.push('first:start')
    await new Promise((resolve) => setTimeout(resolve, 10))
    sequence.push('first:end')
    throw new Error('expected failure')
  })
  const second = enqueue(async () => { sequence.push('second:start'); return 'done' })
  await assert.rejects(first, /expected failure/)
  assert.equal(await second, 'done')
  assert.deepEqual(sequence, ['first:start', 'first:end', 'second:start'])
})

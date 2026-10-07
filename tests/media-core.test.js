import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStreamCopyClipArgs, parseProbeDuration, safeMediaExtension } from '../src/lib/media-core.js'

test('stream-copy clips seek to the input start and use end minus start as output duration', () => {
  assert.deepEqual(buildStreamCopyClipArgs('source.webm', 'clip.webm', 10.5, 20.75), [
    '-ss', '10.500', '-i', 'source.webm', '-t', '10.250', '-c', 'copy',
    '-avoid_negative_ts', 'make_zero', '-y', 'clip.webm',
  ])
})

test('stream-copy clip args reject invalid and sub-millisecond ranges', () => {
  assert.throws(() => buildStreamCopyClipArgs('in.mp4', 'out.mp4', -1, 4), RangeError)
  assert.throws(() => buildStreamCopyClipArgs('in.mp4', 'out.mp4', 4, 4), RangeError)
  assert.throws(() => buildStreamCopyClipArgs('in.mp4', 'out.mp4', 4, 4.0004), RangeError)
  assert.throws(() => buildStreamCopyClipArgs('', 'out.mp4', 0, 2), TypeError)
})

test('media extensions are normalized and safe for FFmpeg temporary paths', () => {
  assert.equal(safeMediaExtension('Camera Clip.MOV'), 'mov')
  assert.equal(safeMediaExtension('voice-note'), 'mp4')
  assert.equal(safeMediaExtension('movie.exe;touch'), 'mp4')
})

test('ffprobe duration parsing accepts finite positive seconds and rejects invalid media output', () => {
  assert.equal(parseProbeDuration(' 120.375\n'), 120.375)
  assert.throws(() => parseProbeDuration('N/A'), /valid media duration/)
  assert.throws(() => parseProbeDuration('0'), /valid media duration/)
  assert.throws(() => parseProbeDuration('Infinity'), /valid media duration/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildArgs, isPlaylistUrl, normalizeUrl } from '../src/lib/ytdlp-core.js'

const ctx = { outTemplate: '/downloads/%(title)s.%(ext)s', tempDir: '/downloads/.tmp' }

test('downloader only accepts HTTP(S) and normalizes the pasted URL', () => {
  assert.equal(normalizeUrl('  https://example.com/watch?v=abc  '), 'https://example.com/watch?v=abc')
  assert.throws(() => normalizeUrl('file:///etc/passwd'), /Only http\(s\) URLs are supported/)
  assert.throws(() => normalizeUrl('http://127.0.0.1/admin'), /Private \/ local addresses are blocked/)
})

test('playlist detection catches list links without treating one selected video as a full playlist', () => {
  assert.equal(isPlaylistUrl('https://www.youtube.com/playlist?list=PL123'), true)
  assert.equal(isPlaylistUrl('https://soundcloud.com/artist/sets/mix'), true)
  assert.equal(isPlaylistUrl('https://www.youtube.com/watch?v=video&list=PL123'), false)
  assert.equal(isPlaylistUrl('not a URL'), false)
})

test('video download format selector uses a video-only stream before pairing audio', () => {
  const args = buildArgs({ url: 'https://example.com/watch?v=abc', mode: 'video', height: 720, container: 'mp4' }, ctx)
  const formatIndex = args.indexOf('-f')
  assert.equal(args[formatIndex + 1], 'bv[height<=720][ext=mp4]+ba[ext=m4a]/bv[height<=720]+ba/b[height<=720]/b')
  assert.equal(args.at(-2), '--')
  assert.equal(args.at(-1), 'https://example.com/watch?v=abc')
})

test('audio-only downloads do not receive video format arguments', () => {
  const args = buildArgs({ url: 'https://example.com/audio', mode: 'audio', audioFormat: 'mp3' }, ctx)
  assert.ok(args.includes('--audio-format'))
  assert.equal(args[args.indexOf('--audio-format') + 1], 'mp3')
  const formatIndex = args.indexOf('-f')
  assert.equal(args[formatIndex + 1], 'ba/b')
  assert.equal(args.some((arg) => arg.includes('bv[')), false)
})

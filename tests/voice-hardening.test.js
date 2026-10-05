import test from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeWav, mono, peaks, resample, windows, voiceMediaKind, MAX_WAV_BYTES,
} from '../src/lib/voice/audio.js'
import {
  fmtTime, parseTime, parseSubs, toSrt, toVtt, toTxt,
  MAX_SUBTITLE_FILE_CHARS,
} from '../src/lib/voice/subs.js'
import { MODELS, WLANGS, transcribe } from '../src/lib/voice/whisper.js'

function fakeBuffer(channels, sampleRate) {
  const length = channels[0].length
  return {
    length, numberOfChannels: channels.length, sampleRate, duration: length / sampleRate,
    getChannelData: (i) => channels[i],
  }
}

test('voice media detection prefers MIME and recognizes common audio/video extensions', () => {
  assert.equal(voiceMediaKind({ type: '', name: 'interview.M4A' }), 'audio')
  assert.equal(voiceMediaKind({ type: '', name: 'meeting.MKV' }), 'video')
  assert.equal(voiceMediaKind({ type: 'audio/webm', name: 'clip.webm' }), 'audio')
  assert.equal(voiceMediaKind({ type: 'video/mp4', name: 'sound.mp3' }), 'video')
  assert.equal(voiceMediaKind({ type: '', name: 'notes.txt' }), null)
})

test('audio utilities validate channel data, resample and bound windows', async () => {
  const input = fakeBuffer([Float32Array.from([0, 1, 0, -1]), Float32Array.from([0, -1, 0, 1])], 8_000)
  assert.deepEqual([...mono(input)], [0, 0, 0, 0])
  const up = await resample(fakeBuffer([Float32Array.from([0, 1, 0, -1])], 8_000), 16_000)
  assert.equal(up.length, 8)
  assert.equal(peaks(Float32Array.from([0, -0.2, 0.7, 0.1]), 2).length, 2)
  const samples = new Float32Array(5_000)
  const split = windows(samples, 1_000, 1)
  assert.ok(split.length > 1)
  assert.equal(split.reduce((sum, row) => sum + row.data.length, 0), samples.length)
  assert.ok(split.every((row) => row.data.length > 0))
  assert.throws(() => windows(samples, 0, 1), /settings are invalid/)
  assert.throws(() => peaks(samples, 0), /dimensions are invalid/)
})

test('WAV writer creates valid PCM headers and refuses oversized or mismatched audio', async () => {
  const blob = encodeWav([Float32Array.from([-1, 0, 1])], 16_000), bytes = new Uint8Array(await blob.arrayBuffer())
  assert.equal(blob.type, 'audio/wav')
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF')
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), 'WAVE')
  assert.equal(new DataView(bytes.buffer).getUint32(24, true), 16_000)
  assert.throws(() => encodeWav([new Float32Array(3), new Float32Array(2)], 16_000), /invalid/)
  assert.throws(() => encodeWav([{ length: MAX_WAV_BYTES }], 16_000), /too large/)
})

test('subtitle time formatting carries milliseconds and parses clock forms without invalid ranges', () => {
  assert.equal(fmtTime(59.9999), '00:01:00,000')
  assert.equal(fmtTime(3_661.25, false), '01:01:01.250')
  assert.equal(parseTime('00:01:02,500'), 62.5)
  assert.equal(parseTime('65:30'), 3_930)
  assert.equal(parseTime('1:60'), null)
  assert.equal(parseTime('00:61:00'), null)
  assert.equal(parseTime('-1'), null)
  assert.equal(parseTime('not a time'), null)
})

test('subtitle import/export skips malformed cue ranges, limits input, and retains valid text', () => {
  const imported = parseSubs('\uFEFFWEBVTT\n\n00:00:01.200 --> 00:00:02.500 align:start\nHello <i>there</i>\n\n2\n00:00:03,000 --> 00:00:03,000\nempty range\n\n00:99:00,000 --> 00:99:01,000\ninvalid minutes')
  assert.equal(imported.length, 1)
  assert.deepEqual([imported[0].start, imported[0].end, imported[0].text], [1.2, 2.5, 'Hello there'])
  const rows = [{ start: 1, end: 2, text: 'Hello world' }, { start: -1, end: 2, text: 'bad' }]
  assert.match(toSrt(rows, 42), /00:00:01,000 --> 00:00:02,000/)
  assert.equal(toTxt(rows), 'Hello world')
  assert.match(toVtt(rows, 42), /^WEBVTT/)
  assert.throws(() => parseSubs('x'.repeat(MAX_SUBTITLE_FILE_CHARS + 1)), /5 MB or smaller/)
})

test('Whisper API rejects malformed configuration before starting a worker', async () => {
  assert.ok(MODELS.length >= 3)
  assert.ok(WLANGS.some(([id]) => id === 'urdu'))
  await assert.rejects(transcribe(new Float32Array(), { model: MODELS[0][0] }), /no decoded audio/)
  await assert.rejects(transcribe(new Float32Array(10), { model: '__proto__' }), /supported speech model/)
  await assert.rejects(transcribe(new Float32Array(10), { model: MODELS[0][0], language: '__proto__' }), /supported transcription language/)
})

import { getFFmpeg, runFFmpegJob } from '../ffmpeg.js'
import { fetchFile } from '@ffmpeg/util'

export const MAX_VOICE_FILE_BYTES = 256 * 1024 * 1024
export const MAX_VOICE_DURATION = 3 * 60 * 60
export const MAX_DECODED_AUDIO_BYTES = 512 * 1024 * 1024
export const MAX_WAV_BYTES = 512 * 1024 * 1024
const AUDIO_EXTENSIONS = new Set(['aac', 'aif', 'aiff', 'amr', 'caf', 'flac', 'm4a', 'mka', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba', 'wma'])
const VIDEO_EXTENSIONS = new Set(['3gp', 'avi', 'flv', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'ts', 'webm', 'wmv'])

export function voiceMediaKind(file) {
  const type = String(file?.type || '').toLowerCase()
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  const ext = String(file?.name || '').match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase()
  if (ext && AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (ext && VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}

function validBuffer(buf) {
  const length = Number(buf?.length), channels = Number(buf?.numberOfChannels), rate = Number(buf?.sampleRate), duration = Number(buf?.duration)
  if (!Number.isInteger(length) || length < 1 || !Number.isInteger(channels) || channels < 1 || channels > 16 || !Number.isFinite(rate) || rate < 8_000 || rate > 384_000 || !Number.isFinite(duration) || duration <= 0) throw new TypeError('This file did not decode to usable audio.')
  if (duration > MAX_VOICE_DURATION) throw new RangeError('Audio longer than three hours is not supported in one job. Split the file and try again.')
  if (length * channels * 4 > MAX_DECODED_AUDIO_BYTES) throw new RangeError('This audio is too large to process safely in memory. Try a shorter or lower-channel version.')
  return { length, channels, rate, duration }
}

export function mono(buf) {
  const { length: n, channels: ch } = validBuffer(buf), out = new Float32Array(n)
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); if (!d || d.length !== n) throw new TypeError('The decoded audio channels do not match.')
    for (let i = 0; i < n; i++) out[i] += d[i] / ch
  }
  return out
}

export async function resample(buf, rate = 16_000) {
  const meta = validBuffer(buf), target = Number(rate)
  if (!Number.isInteger(target) || target < 8_000 || target > 48_000) throw new RangeError('Choose a sample rate between 8 and 48 kHz.')
  if (meta.rate === target && meta.channels === 1) return buf.getChannelData(0)
  const len = Math.ceil(meta.duration * target)
  if (!Number.isSafeInteger(len) || len < 1 || len * 4 > MAX_DECODED_AUDIO_BYTES) throw new RangeError('This audio is too long to resample safely.')
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext
  if (!Offline) {
    const channels = Array.from({ length: meta.channels }, (_, i) => buf.getChannelData(i)), out = new Float32Array(len)
    for (let i = 0; i < len; i++) {
      const pos = i * meta.rate / target, left = Math.min(meta.length - 1, Math.floor(pos)), right = Math.min(meta.length - 1, left + 1), mix = pos - left
      let sample = 0
      for (const ch of channels) sample += (ch[left] * (1 - mix) + ch[right] * mix) / meta.channels
      out[i] = sample
    }
    return out
  }
  const oc = new Offline(1, len, target), src = oc.createBufferSource(), input = oc.createBuffer(1, meta.length, meta.rate)
  input.copyToChannel(mono(buf), 0); src.buffer = input; src.connect(oc.destination); src.start()
  return (await oc.startRendering()).getChannelData(0).slice()
}

/** Decode media for editing/transcription, falling back to the app's serialized FFmpeg engine. */
export async function decodeFile(file, onStatus) {
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isFinite(Number(file.size)) || file.size <= 0 || !voiceMediaKind(file)) throw new TypeError('Choose a supported audio or video file.')
  if (file.size > MAX_VOICE_FILE_BYTES) throw new RangeError('Audio and video files must be 256 MB or smaller.')
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!Audio) throw new Error('Audio decoding is not supported in this browser.')
  const ctx = new Audio()
  try {
    try {
      const decoded = await ctx.decodeAudioData(await file.arrayBuffer())
      validBuffer(decoded)
      return decoded
    } catch (nativeError) {
      if (nativeError instanceof RangeError) throw nativeError
      onStatus?.('Extracting audio…')
      const data = await runFFmpegJob(async () => {
        const ff = await getFFmpeg(), id = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
        const ext = String(file.name || '').match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase() || 'bin'
        const input = `ttt-${id}-voice.${ext}`, output = `ttt-${id}-audio.wav`
        try {
          await ff.writeFile(input, await fetchFile(file))
          await ff.exec(['-nostdin', '-v', 'error', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', output])
          const raw = await ff.readFile(output)
          return new Uint8Array(raw).slice()
        } catch (error) {
          if (/no audio|matches no streams|does not contain any stream/i.test(String(error?.message || error))) throw new Error('This file has no audio track I can read.', { cause: error })
          throw new Error(`Could not extract audio from this file: ${String(error?.message || error).slice(0, 140)}`, { cause: error })
        } finally {
          await Promise.all([input, output].map(async (path) => { try { await ff.deleteFile(path) } catch {} }))
        }
      })
      const decoded = await ctx.decodeAudioData(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
      validBuffer(decoded)
      return decoded
    }
  } finally { try { await ctx.close?.() } catch {} }
}

export function peaks(samples, n = 600) {
  if (!samples || !Number.isInteger(samples.length) || samples.length < 1 || !Number.isInteger(n) || n < 1 || n > 20_000) throw new RangeError('Waveform dimensions are invalid.')
  const out = new Float32Array(n), step = Math.max(1, Math.floor(samples.length / n))
  for (let i = 0; i < n; i++) { let m = 0; const a = i * step, b = Math.min(samples.length, a + step); for (let j = a; j < b; j += Math.max(1, Math.floor(step / 40))) { const v = Math.abs(samples[j]); if (Number.isFinite(v) && v > m) m = v } out[i] = m }
  return out
}

/** Split 16 kHz samples into bounded windows, preferring quiet points near the end of each window. */
export function windows(samples, rate = 16_000, win = 30) {
  if (!samples || !Number.isSafeInteger(samples.length) || !Number.isFinite(rate) || rate < 1_000 || rate > 384_000 || !Number.isFinite(win) || win <= 0 || win > 600) throw new RangeError('Audio window settings are invalid.')
  const W = Math.max(1, Math.floor(win * rate)), out = []; let a = 0
  while (a < samples.length) {
    let b = Math.min(samples.length, a + W)
    if (b < samples.length) {
      let best = b, bestE = Infinity
      const from = Math.max(a + W - 4 * rate, a + rate), step = Math.max(1, Math.floor(rate / 20)), sampleStep = Math.max(1, Math.floor(rate / 20 / 8))
      for (let t = from; t < b; t += step) { let e = 0; for (let j = 0; j < step; j += sampleStep) e += Math.abs(samples[t + j] || 0); if (e < bestE) { bestE = e; best = t } }
      b = Math.max(a + 1, Math.floor(best))
    }
    out.push({ start: a / rate, data: samples.subarray(a, b) }); a = b
  }
  return out
}

export function encodeWav(channels, rate) {
  const nc = Array.isArray(channels) ? channels.length : 0, r = Number(rate), n = Number(channels?.[0]?.length)
  if (!nc || nc > 16 || !Number.isInteger(n) || n < 1 || !Number.isFinite(r) || r < 8_000 || r > 384_000 || channels.some((c) => !c || c.length !== n)) throw new RangeError('WAV audio data is invalid.')
  const size = 44 + n * nc * 2
  if (!Number.isSafeInteger(size) || size > MAX_WAV_BYTES || size > 0xffff_ffff) throw new RangeError('This WAV would be too large to export safely. Select a shorter section.')
  const buf = new ArrayBuffer(size), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, r, true); v.setUint32(28, r * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * nc * 2, true)
  let o = 44
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const raw = Number(channels[c][i]), s = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0; v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2 }
  return new Blob([buf], { type: 'audio/wav' })
}

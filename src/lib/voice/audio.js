import { getFFmpeg } from '../ffmpeg.js'
import { fetchFile } from '@ffmpeg/util'

export function mono(buf) {
  const n = buf.length, out = new Float32Array(n), ch = buf.numberOfChannels
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / ch }
  return out
}
export async function resample(buf, rate = 16000) {
  if (buf.sampleRate === rate && buf.numberOfChannels === 1) return buf.getChannelData(0).slice()
  const len = Math.ceil(buf.duration * rate), oc = new OfflineAudioContext(1, len, rate), src = oc.createBufferSource(); const m = oc.createBuffer(1, buf.length, buf.sampleRate); m.copyToChannel(mono(buf), 0); src.buffer = m; src.connect(oc.destination); src.start()
  return (await oc.startRendering()).getChannelData(0).slice()
}
/** Decode any audio/video file to an AudioBuffer (falls back to ffmpeg for containers the browser can't decode). */
export async function decodeFile(file, onStatus) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  try { return await ctx.decodeAudioData(await file.arrayBuffer()) }
  catch {
    onStatus?.('Extracting audio…')
    const ff = await getFFmpeg(), name = 'in_' + file.name.replace(/[^\w.]/g, '_')
    await ff.writeFile(name, await fetchFile(file)); await ff.exec(['-i', name, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', 'out.wav'])
    let d; try { d = await ff.readFile('out.wav') } catch { throw new Error('This file has no audio track I can read.') }
    await ff.deleteFile(name); await ff.deleteFile('out.wav')
    return await ctx.decodeAudioData(d.buffer.slice(0))
  } finally { ctx.close?.().catch?.(() => {}) }
}
export function peaks(samples, n = 600) {
  const out = new Float32Array(n), step = Math.max(1, Math.floor(samples.length / n))
  for (let i = 0; i < n; i++) { let m = 0; const a = i * step, b = Math.min(samples.length, a + step); for (let j = a; j < b; j += Math.max(1, Math.floor(step / 40))) { const v = Math.abs(samples[j]); if (v > m) m = v } out[i] = m }
  return out
}
/** cut into ≤30 s windows, preferring quiet points near the end of each window */
export function windows(samples, rate = 16000, win = 30) {
  const W = win * rate, out = []; let a = 0
  while (a < samples.length) {
    let b = Math.min(samples.length, a + W)
    if (b < samples.length) { let best = b, bestE = Infinity; const from = Math.max(a + W - 4 * rate, a + rate); for (let t = from; t < b; t += rate / 20) { let e = 0; for (let j = 0; j < rate / 20; j += 8) e += Math.abs(samples[t + j] || 0); if (e < bestE) { bestE = e; best = t } } b = Math.floor(best) }
    out.push({ start: a / rate, data: samples.subarray(a, b) }); a = b
  }
  return out
}
export function encodeWav(channels, rate) {
  const n = channels[0].length, nc = channels.length, buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, rate, true); v.setUint32(28, rate * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * nc * 2, true)
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2 }
  return new Blob([buf], { type: 'audio/wav' })
}

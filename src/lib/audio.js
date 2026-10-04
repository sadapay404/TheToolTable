/* Audio toolkit: decode anything the browser can decode, edit the samples, write a WAV back out,
   and work out where the speech is. The maths here is pure so it can be unit-tested in Node. */

let ac = null
export const audioCtx = () => (ac ??= new (window.AudioContext || window.webkitAudioContext)())

/** Decode a File/Blob/ArrayBuffer into channel arrays we can edit. */
export async function decodeAudio(file) {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer()
  const buf = await audioCtx().decodeAudioData(data.slice(0))
  const channels = []
  for (let c = 0; c < buf.numberOfChannels; c++) channels.push(Float32Array.from(buf.getChannelData(c)))
  return { channels, sampleRate: buf.sampleRate, duration: buf.duration, channels0: buf.numberOfChannels }
}

export function toMono(channels) {
  if (channels.length === 1) return channels[0]
  const n = channels[0].length
  const out = new Float32Array(n)
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length
  return out
}

export const slice = (channels, from, to, sr) => {
  const a = Math.max(0, Math.floor(from * sr)), b = Math.min(channels[0].length, Math.ceil(to * sr))
  return channels.map((ch) => ch.subarray(a, Math.max(a, b)))
}

/** fade in / fade out, in seconds */
export function fade(channels, sr, { in: fin = 0, out: fout = 0 } = {}) {
  const n = channels[0].length
  const iN = Math.min(n, Math.round(fin * sr)), oN = Math.min(n, Math.round(fout * sr))
  return channels.map((ch) => {
    const c = Float32Array.from(ch)
    for (let i = 0; i < iN; i++) c[i] *= i / iN
    for (let i = 0; i < oN; i++) c[n - 1 - i] *= i / oN
    return c
  })
}

export function gain(channels, db) {
  const g = db === 0 ? 1 : 10 ** (db / 20)
  return channels.map((ch) => { const c = Float32Array.from(ch); for (let i = 0; i < c.length; i++) c[i] *= g; return c })
}

export function normalize(channels, peak = 0.98) {
  let max = 0
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > max) max = v }
  if (!max) return channels
  const g = peak / max
  return channels.map((ch) => { const c = Float32Array.from(ch); for (let i = 0; i < c.length; i++) c[i] *= g; return c })
}

export function reverse(channels) {
  return channels.map((ch) => { const c = Float32Array.from(ch); c.reverse(); return c })
}

/** linear-interpolation resample — `speed` 2 = twice as fast (and an octave up, like tape) */
export function resample(channels, speed) {
  if (speed === 1) return channels
  return channels.map((ch) => {
    const n = Math.max(1, Math.floor(ch.length / speed))
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = i * speed, i0 = Math.floor(x), i1 = Math.min(ch.length - 1, i0 + 1), f = x - i0
      out[i] = ch[i0] * (1 - f) + ch[i1] * f
    }
    return out
  })
}

/** join clips end to end (silence between them if asked) */
export function concat(list, sr, gapSeconds = 0) {
  const gap = Math.round(gapSeconds * sr)
  const chans = Math.max(...list.map((c) => c.length))
  return Array.from({ length: chans }, (_, c) => {
    const parts = list.map((clip) => clip[Math.min(c, clip.length - 1)] || new Float32Array(0))
    const len = parts.reduce((n, p) => n + p.length, 0) + gap * (parts.length - 1)
    const out = new Float32Array(len)
    let at = 0
    parts.forEach((p, i) => { out.set(p, at); at += p.length + gap })
    return out
  })
}

/** 16-bit PCM WAV — universally readable, and the honest choice for editing output */
export function encodeWav(channels, sampleRate) {
  const n = channels[0]?.length || 0, ch = channels.length
  const bytes = 44 + n * ch * 2
  const buf = new ArrayBuffer(bytes), v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * ch * 2, true)
  let o = 44
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { v.setInt16(o, Math.max(-1, Math.min(1, channels[c][i])) * 32767, true); o += 2 }
  return new Blob([buf], { type: 'audio/wav' })
}

/** min/max pairs for drawing a waveform */
export function peaks(mono, buckets = 1000) {
  const n = mono.length, step = Math.max(1, Math.floor(n / buckets))
  const out = new Array(Math.max(1, Math.ceil(n / step)))
  for (let b = 0, i = 0; i < n; i += step, b++) {
    let lo = 0, hi = 0
    for (let j = i; j < Math.min(n, i + step); j++) { const v = mono[j]; if (v < lo) lo = v; if (v > hi) hi = v }
    out[b] = { min: lo, max: hi }
  }
  return out
}

/** root-mean-square level per frame (frameMs wide) — the basis for silence detection */
export function rmsFrames(mono, sampleRate, frameMs = 20) {
  const step = Math.max(1, Math.round((sampleRate * frameMs) / 1000))
  const out = new Float32Array(Math.max(1, Math.ceil(mono.length / step)))
  for (let f = 0, i = 0; i < mono.length; i += step, f++) {
    let sum = 0
    for (let j = i; j < Math.min(mono.length, i + step); j++) sum += mono[j] * mono[j]
    out[f] = Math.sqrt(sum / Math.max(1, Math.min(mono.length, i + step) - i))
  }
  return out
}

/**
 * Where the talking is. Pure function of the RMS envelope, so it is easy to test:
 * anything above `thresholdDb` (relative to the loudest frame) counts as speech, gaps shorter than
 * `minSilence` are bridged, and clips shorter than `minSpeech` are dropped.
 */
export function speechSegments(rms, frameMs = 20, { thresholdDb = -34, minSilence = 0.35, minSpeech = 0.25, pad = 0.1, maxSegment = 6 } = {}) {
  if (!rms.length) return []
  let peak = 0
  for (const v of rms) if (v > peak) peak = v
  if (!peak) return []
  const cut = peak * 10 ** (thresholdDb / 20)
  const minSilFrames = Math.max(1, Math.round(minSilence * 1000 / frameMs))
  const minSpFrames = Math.max(1, Math.round(minSpeech * 1000 / frameMs))

  const spans = []
  let start = -1
  for (let i = 0; i <= rms.length; i++) {
    const loud = i < rms.length && rms[i] >= cut
    if (loud && start < 0) start = i
    else if (!loud && start >= 0) {
      let end = i - 1
      // bridge short dips
      let j = i
      while (j < rms.length && !(rms[j] >= cut)) j++
      if (j - i < minSilFrames && j < rms.length) { i = j; continue }
      if (end - start + 1 >= minSpFrames) spans.push([start, end])
      start = -1
      i = j - 1
    }
  }
  const sec = (f) => (f * frameMs) / 1000
  const out = []
  for (const [a, b] of spans) {
    let s = Math.max(0, sec(a) - pad), e = sec(b) + frameMs / 1000 + pad
    while (e - s > maxSegment) { out.push({ start: s, end: s + maxSegment }); s += maxSegment }
    if (e - s > 0.05) out.push({ start: s, end: e })
  }
  return out
}

export function audioStats(channels) {
  const mono = toMono(channels)
  let peak = 0, sum = 0
  for (let i = 0; i < mono.length; i++) { const v = Math.abs(mono[i]); if (v > peak) peak = v; sum += mono[i] * mono[i] }
  return { peak, rms: Math.sqrt(sum / Math.max(1, mono.length)), clipped: mono.length ? [...mono].filter((v) => Math.abs(v) >= 0.999).length / mono.length : 0 }
}

export const fmtDur = (s) => {
  if (!Number.isFinite(s)) return '—'
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${r.toFixed(1).padStart(4, '0')}`
}

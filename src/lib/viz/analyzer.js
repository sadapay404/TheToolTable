// Turns raw FFT / waveform data into smoothed, log-spaced bands + bass/mid/treble + beat pulses.
// The same class is fed by a live AnalyserNode or by a synthetic signal (idle preview, live thumbnails).
export const NB = 256
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

export class Analyzer {
  constructor() {
    this.bands = new Float32Array(NB); this.wave = new Float32Array(512)
    this.bass = 0; this.mid = 0; this.treble = 0; this.level = 0; this.beat = 0
    this.avg = 0.2; this.cool = 0; this.prevBass = 0
    this.freqs = new Float32Array(NB); this.range = [0, 0]
    this.setRange(30, 12000)
  }
  setRange(fmin, fmax) {
    if (this.range[0] === fmin && this.range[1] === fmax) return
    this.range = [fmin, fmax]
    const lo = Math.max(20, Math.min(fmin, fmax - 200)), hi = Math.max(lo + 200, fmax)
    for (let k = 0; k < NB; k++) this.freqs[k] = lo * Math.pow(hi / lo, k / (NB - 1))
  }
  /** raw: Float32Array(NB) 0..1 · wave: Float32Array(512) -1..1 · bassRaw 0..1 */
  feed(raw, wave, dt, smooth, bassRaw, beatSens = 1) {
    dt = clamp(dt, 0.001, 0.1)
    const a = 1 - Math.exp(-dt * (46 - 32 * smooth)), r = 1 - Math.exp(-dt * (15 - 12 * smooth))
    let b = 0, m = 0, t = 0, nb = 0, nm = 0, nt = 0, all = 0
    for (let i = 0; i < NB; i++) {
      const cur = this.bands[i], tgt = raw[i]
      const v = cur + (tgt - cur) * (tgt > cur ? a : r)
      this.bands[i] = v; all += v
      const f = this.freqs[i]
      if (f < 160) { b += v; nb++ } else if (f < 2500) { m += v; nm++ } else { t += v; nt++ }
    }
    this.bass = nb ? b / nb : 0; this.mid = nm ? m / nm : 0; this.treble = nt ? t / nt : 0
    this.level += (all / NB - this.level) * (1 - Math.exp(-dt * 8))
    this.wave.set(wave)
    // beat: bass energy jumping above its running average
    this.avg += (bassRaw - this.avg) * (1 - Math.exp(-dt * 1.4))
    this.cool -= dt
    const thr = (1.32 - 0.22 * beatSens) * this.avg + 0.07 / Math.max(0.4, beatSens)
    if (this.cool <= 0 && bassRaw > thr && bassRaw >= this.prevBass) { this.beat = 1; this.cool = 0.17 }
    this.prevBass = bassRaw
    this.beat *= Math.exp(-dt * 6.5)
  }
}

/** Live bytes from an AnalyserNode → NB log-spaced values. */
export function bandsFromAnalyser(an, sr, freqs, rawOut, waveOut, tmp) {
  an.getByteFrequencyData(tmp.f); an.getByteTimeDomainData(tmp.w)
  const N = tmp.f.length, hz = sr / 2 / N
  const bin = (f) => f / hz
  for (let k = 0; k < NB; k++) {
    const f0 = k === 0 ? freqs[0] / 1.03 : Math.sqrt(freqs[k - 1] * freqs[k]), f1 = k === NB - 1 ? freqs[k] * 1.03 : Math.sqrt(freqs[k] * freqs[k + 1])
    let b0 = bin(f0), b1 = bin(f1), v
    if (b1 - b0 < 1) { const c = (b0 + b1) / 2, i = Math.floor(c), fr = c - i; v = (tmp.f[Math.min(N - 1, i)] * (1 - fr) + tmp.f[Math.min(N - 1, i + 1)] * fr) }
    else { v = 0; for (let i = Math.floor(b0); i <= Math.min(N - 1, Math.ceil(b1)); i++) if (tmp.f[i] > v) v = tmp.f[i] }
    const u = k / (NB - 1)
    rawOut[k] = clamp(Math.pow(v / 255, 1.55) * (0.85 + 0.95 * u), 0, 1)
  }
  const W = tmp.w, step = W.length / waveOut.length
  for (let i = 0; i < waveOut.length; i++) waveOut[i] = (W[Math.floor(i * step)] - 128) / 128
  let bs = 0, nb = 0; const bmax = Math.min(N - 1, Math.ceil(160 / hz))
  for (let i = 1; i <= bmax; i++) { bs += tmp.f[i]; nb++ }
  return nb ? Math.pow(bs / nb / 255, 1.2) : 0
}

/** Synthetic signal: ~120 bpm kick, shimmering mids, airy highs. */
export function synth(t, raw, wave, intensity = 1) {
  const bt = (t * 2) % 1, env = Math.exp(-bt * 5.5)
  for (let k = 0; k < NB; k++) {
    const u = k / (NB - 1)
    const body = Math.exp(-u * 2.1) * (0.55 + 0.45 * Math.sin(t * 1.3 + u * 9))
    const shimmer = Math.pow(Math.sin(t * 3.1 + k * 0.37) * 0.5 + 0.5, 2) * (1 - u * 0.55)
    const hat = (Math.floor(t * 4) % 2 ? 0.28 : 0.1) * u * Math.pow(Math.sin(k * 1.7 + t * 9) * 0.5 + 0.5, 3)
    raw[k] = clamp((body * (0.38 + 0.62 * env) + 0.26 * shimmer + hat) * intensity, 0, 1)
  }
  for (let i = 0; i < wave.length; i++) {
    const x = i / wave.length
    wave[i] = (0.5 * Math.sin(Math.PI * 2 * (x * 3 + t * 1.5)) * (0.35 + env * 0.65) + 0.25 * Math.sin(Math.PI * 2 * (x * 9 - t * 2.3)) + 0.12 * Math.sin(Math.PI * 2 * (x * 23 + t * 4))) * intensity
  }
  return (0.3 + 0.65 * env) * intensity
}

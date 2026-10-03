// Renders a short synthetic beat so the visualizer can be tried without a file. Pure WebAudio, nothing downloaded.
function wavBlob(buf) {
  const ch = buf.getChannelData(0), n = ch.length, sr = buf.sampleRate, out = new DataView(new ArrayBuffer(44 + n * 2))
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true)
  out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 32767, true)
  return new Blob([out], { type: 'audio/wav' })
}

export async function makeDemoTrack(seconds = 24, bpm = 120) {
  const sr = 22050, ctx = new OfflineAudioContext(1, sr * seconds, sr), master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination)
  const beat = 60 / bpm, scale = [0, 3, 5, 7, 10, 12, 15, 17], root = 55
  const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d) }
  const noiseBuf = ctx.createBuffer(1, sr, sr); { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1 }
  for (let b = 0; b < seconds / beat; b++) {
    const t = b * beat, bar = Math.floor(b / 4), sect = Math.floor(b / 16)
    // kick
    const k = ctx.createOscillator(), kg = ctx.createGain(); k.frequency.setValueAtTime(150, t); k.frequency.exponentialRampToValueAtTime(42, t + 0.14); env(kg, t, 0.003, 0.28, 0.95); k.connect(kg).connect(master); k.start(t); k.stop(t + 0.4)
    // off-beat hat + snare on 2/4
    for (const off of [0.5, 1]) {
      if (sect === 0 && b < 8 && off === 1) continue
      const h = ctx.createBufferSource(), hg = ctx.createGain(), hp = ctx.createBiquadFilter(); h.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = 7000
      env(hg, t + beat * off * 0.5 * (off === 0.5 ? 1 : 1), 0.002, 0.05, 0.22); h.connect(hp).connect(hg).connect(master); h.start(t + beat * off * 0.5); h.stop(t + beat * off * 0.5 + 0.1)
    }
    if (b % 2 === 1) { const s = ctx.createBufferSource(), sg = ctx.createGain(), bp = ctx.createBiquadFilter(); s.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.value = 1900; env(sg, t, 0.003, 0.16, 0.5); s.connect(bp).connect(sg).connect(master); s.start(t); s.stop(t + 0.3) }
    // bass
    if (b % 2 === 0 || sect > 0) { const f = root * Math.pow(2, [0, 0, 5, 3][bar % 4] / 12), o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 420; env(g, t + beat * 0.5, 0.01, beat * 0.45, 0.32); o.connect(lp).connect(g).connect(master); o.start(t + beat * 0.5); o.stop(t + beat) }
    // arp (8ths)
    if (b >= 8) for (let e = 0; e < 2; e++) {
      const n = scale[(b * 2 + e * 3 + bar) % scale.length], f = root * 4 * Math.pow(2, n / 12), o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = f
      env(g, t + e * beat * 0.5, 0.005, 0.3, 0.16); o.connect(g).connect(master); o.start(t + e * beat * 0.5); o.stop(t + e * beat * 0.5 + 0.4)
    }
  }
  const buf = await ctx.startRendering()
  return new File([wavBlob(buf)], 'TheToolTable demo beat.wav', { type: 'audio/wav' })
}

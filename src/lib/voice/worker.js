import { pipeline, env } from '@huggingface/transformers'
env.allowLocalModels = false
let asr = null, key = ''
const files = {}
self.onmessage = async (e) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      const k = m.model + '|' + m.device
      if (asr && key === k) return self.postMessage({ type: 'ready', device: m.device })
      asr = null; Object.keys(files).forEach((f) => delete files[f])
      const cb = (p) => {
        if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; const L = Object.values(files).reduce((a, b) => a + b[0], 0), T = Object.values(files).reduce((a, b) => a + b[1], 0); self.postMessage({ type: 'dl', pct: (L / T) * 100, loaded: L, total: T }) }
      }
      const opts = { progress_callback: cb, device: m.device }
      if (m.device === 'webgpu') opts.dtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' }
      else opts.dtype = 'q8'
      try { asr = await pipeline('automatic-speech-recognition', m.model, opts) }
      catch (err) { if (m.device === 'webgpu') { self.postMessage({ type: 'note', text: 'GPU not available — using the CPU engine.' }); asr = await pipeline('automatic-speech-recognition', m.model, { progress_callback: cb, device: 'wasm', dtype: 'q8' }); m.device = 'wasm' } else throw err }
      key = m.model + '|' + m.device; self.postMessage({ type: 'ready', device: m.device })
    } else if (m.type === 'run') {
      const o = { task: m.task, return_timestamps: true }; if (m.language && m.language !== 'auto') o.language = m.language
      const out = await asr(m.audio, o)
      self.postMessage({ type: 'result', id: m.id, chunks: (out.chunks || [{ text: out.text, timestamp: [0, m.audio.length / 16000] }]).map((c) => ({ text: c.text, start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? c.timestamp[0] + 2 })) })
    }
  } catch (err) { self.postMessage({ type: 'error', message: String(err?.message || err) }) }
}

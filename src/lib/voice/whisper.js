import { windows } from './audio.js'
import { newId } from './subs.js'

export const MODELS = [
  ['onnx-community/whisper-tiny', 'Tiny', 'Fastest · ~40 MB · good for clear speech'],
  ['onnx-community/whisper-base', 'Base', 'Balanced · ~80 MB'],
  ['onnx-community/whisper-small', 'Small', 'More accurate · ~250 MB'],
  ['onnx-community/whisper-large-v3-turbo', 'Turbo', 'Best quality · ~800 MB · wants a strong GPU'],
]
export const WLANGS = [['auto', 'Auto-detect'], ['english', 'English'], ['urdu', 'Urdu · اردو'], ['hindi', 'Hindi'], ['arabic', 'Arabic'], ['punjabi', 'Punjabi'], ['pashto', 'Pashto'], ['persian', 'Persian'], ['bengali', 'Bengali'], ['turkish', 'Turkish'], ['french', 'French'], ['german', 'German'], ['spanish', 'Spanish'], ['italian', 'Italian'], ['russian', 'Russian'], ['chinese', 'Chinese'], ['japanese', 'Japanese'], ['korean', 'Korean'], ['indonesian', 'Indonesian']]

let worker = null
const get = () => (worker ||= new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }))
export function stopWhisper() { worker?.terminate(); worker = null }

/** Transcribe 16 kHz mono samples. cb({stage,pct,note,partial}) */
export function transcribe(samples, { model, language, task, device, onUpdate, signal }) {
  const w = get(), wins = windows(samples), segs = []
  return new Promise((resolve, reject) => {
    let i = 0, dead = false
    const fail = (m) => { if (dead) return; dead = true; w.removeEventListener('message', on); reject(new Error(m)) }
    signal?.addEventListener('abort', () => { stopWhisper(); fail('Cancelled') })
    const next = () => {
      if (i >= wins.length) { dead = true; w.removeEventListener('message', on); return resolve(segs) }
      const a = wins[i].data.slice(); onUpdate?.({ stage: 'run', pct: (i / wins.length) * 100, note: `Listening · part ${i + 1} of ${wins.length}` })
      w.postMessage({ type: 'run', id: i, audio: a, language, task }, [a.buffer])
    }
    const on = (e) => {
      const m = e.data
      if (m.type === 'dl') onUpdate?.({ stage: 'dl', pct: m.pct, note: `Downloading the model · ${(m.loaded / 1048576).toFixed(0)} of ${(m.total / 1048576).toFixed(0)} MB (first time only)` })
      else if (m.type === 'note') onUpdate?.({ stage: 'dl', note: m.text })
      else if (m.type === 'ready') next()
      else if (m.type === 'result') {
        const off = wins[i].start
        for (const c of m.chunks) { const t = c.text.trim(); if (t) segs.push({ id: newId(), start: off + c.start, end: Math.max(off + c.end, off + c.start + 0.4), text: t }) }
        onUpdate?.({ stage: 'run', pct: ((i + 1) / wins.length) * 100, partial: [...segs], note: `Listening · part ${i + 1} of ${wins.length}` }); i++; next()
      } else if (m.type === 'error') fail(/fetch|network|Failed to load|NetworkError/i.test(m.message) ? 'Could not download the speech model. Connect to the internet once — it is cached after that.' : m.message)
    }
    w.addEventListener('message', on); w.addEventListener('error', (e) => fail(e.message || 'Speech engine crashed'))
    w.postMessage({ type: 'load', model, device: device || 'wasm' })
  })
}

import { windows, MAX_VOICE_DURATION } from './audio.js'
import { newId } from './subs.js'

export const MODELS = [
  ['onnx-community/whisper-tiny', 'Tiny', 'Fastest · ~40 MB · good for clear speech'],
  ['onnx-community/whisper-base', 'Base', 'Balanced · ~80 MB'],
  ['onnx-community/whisper-small', 'Small', 'More accurate · ~250 MB'],
  ['onnx-community/whisper-large-v3-turbo', 'Turbo', 'Best quality · ~800 MB · wants a strong GPU'],
]
export const WLANGS = [['auto', 'Auto-detect'], ['english', 'English'], ['urdu', 'Urdu · اردو'], ['hindi', 'Hindi'], ['arabic', 'Arabic'], ['punjabi', 'Punjabi'], ['pashto', 'Pashto'], ['persian', 'Persian'], ['bengali', 'Bengali'], ['turkish', 'Turkish'], ['french', 'French'], ['german', 'German'], ['spanish', 'Spanish'], ['italian', 'Italian'], ['russian', 'Russian'], ['chinese', 'Chinese'], ['japanese', 'Japanese'], ['korean', 'Korean'], ['indonesian', 'Indonesian']]

let worker = null
const active = new Set()
const get = () => (worker ||= new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }))
export function stopWhisper() {
  const w = worker; worker = null
  try { w?.terminate() } catch {}
  for (const cancel of [...active]) cancel()
}

/** Transcribe 16 kHz mono samples. cb({stage,pct,note,partial}) */
export function transcribe(samples, { model, language = 'auto', task = 'transcribe', device, onUpdate, signal } = {}) {
  if (!(samples instanceof Float32Array) || !samples.length) return Promise.reject(new TypeError('There is no decoded audio to transcribe.'))
  if (samples.length > 16_000 * MAX_VOICE_DURATION) return Promise.reject(new RangeError('Audio longer than three hours is not supported in one transcription.'))
  if (!MODELS.some(([id]) => id === model)) return Promise.reject(new RangeError('Choose a supported speech model.'))
  if (!WLANGS.some(([id]) => id === language)) return Promise.reject(new RangeError('Choose a supported transcription language.'))
  if (!['transcribe', 'translate'].includes(task)) return Promise.reject(new RangeError('Choose transcribe or translate.'))
  if (signal?.aborted) return Promise.reject(new Error('Cancelled'))
  if (active.size) return Promise.reject(new Error('The speech engine is already working on another file.'))
  let w
  try { w = get() } catch (error) { return Promise.reject(error) }
  const wins = windows(samples), segs = []
  if (!wins.length) return Promise.resolve([])
  return new Promise((resolve, reject) => {
    let i = 0, dead = false
    const update = (value) => { try { onUpdate?.(value) } catch {} }
    const cleanup = () => {
      w.removeEventListener('message', on); w.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort); active.delete(cancel)
    }
    const finish = (error, value) => {
      if (dead) return
      dead = true; cleanup()
      error ? reject(error) : resolve(value)
    }
    const cancel = () => finish(new Error('Cancelled'))
    const onAbort = () => { stopWhisper(); cancel() }
    const fail = (message) => finish(new Error(String(message || 'Speech recognition failed.')))
    const next = () => {
      if (dead) return
      if (i >= wins.length) { finish(null, segs); return }
      const audio = wins[i].data.slice()
      update({ stage: 'run', pct: (i / wins.length) * 100, note: `Listening · part ${i + 1} of ${wins.length}` })
      try { w.postMessage({ type: 'run', id: i, audio, language, task }, [audio.buffer]) }
      catch (error) { fail(error.message || 'Could not start speech recognition.') }
    }
    const on = (event) => {
      const m = event.data || {}
      if (m.type === 'dl') update({ stage: 'dl', pct: Number.isFinite(m.pct) ? m.pct : 0, note: `Downloading the model · ${(Number(m.loaded) / 1048576 || 0).toFixed(0)} of ${(Number(m.total) / 1048576 || 0).toFixed(0)} MB (first time only)` })
      else if (m.type === 'note') update({ stage: 'dl', note: String(m.text || '') })
      else if (m.type === 'ready') next()
      else if (m.type === 'result') {
        if (m.id !== i || !Array.isArray(m.chunks)) return
        const off = wins[i].start
        for (const chunk of m.chunks) {
          const text = String(chunk?.text || '').trim(), start = Number(chunk?.start), end = Number(chunk?.end)
          if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue
          const absoluteStart = Math.max(off, off + start), absoluteEnd = Math.max(absoluteStart + 0.05, off + end)
          segs.push({ id: newId(), start: absoluteStart, end: absoluteEnd, text: text.slice(0, 10_000) })
        }
        update({ stage: 'run', pct: ((i + 1) / wins.length) * 100, partial: [...segs], note: `Listening · part ${i + 1} of ${wins.length}` }); i++; next()
      } else if (m.type === 'error') {
        const message = String(m.message || '')
        fail(/fetch|network|Failed to load|NetworkError/i.test(message) ? 'Could not download the speech model. Connect to the internet once — it is cached after that.' : message)
      }
    }
    const onError = (event) => {
      try { w.terminate() } catch {}
      if (worker === w) worker = null
      fail(event?.message || 'The speech engine crashed.')
    }
    active.add(cancel)
    signal?.addEventListener('abort', onAbort, { once: true })
    w.addEventListener('message', on); w.addEventListener('error', onError)
    try { w.postMessage({ type: 'load', model, device: device === 'webgpu' ? 'webgpu' : 'wasm' }) }
    catch (error) { fail(error.message || 'Could not start the speech engine.') }
  })
}

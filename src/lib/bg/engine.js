// Main-thread side of the cut-out engine: owns the worker, does pre-processing, hands back an 8-bit mask.
const MODEL_URL = () => new URL(`${import.meta.env.BASE_URL || '/'}models/isnet-quint8.onnx`, location.href).href
export const MODEL_BYTES = 44342436
export const NET_SIZE = 1024

let worker = null
let state = { phase: 'idle', value: 0, ready: false, error: '', backend: '', threads: 1 }
let readyPromise = null
const listeners = new Set()
const pending = new Map()
let nextId = 1

const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f(state)) }
export const subscribe = (f) => { listeners.add(f); f(state); return () => listeners.delete(f) }
export const getState = () => state

export function warmUp() {
  if (readyPromise) return readyPromise
  readyPromise = new Promise((resolve, reject) => {
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    } catch (e) { emit({ error: 'This browser cannot start a background worker.' }); return reject(e) }
    worker.onerror = (e) => { const m = e.message || 'The cut-out engine crashed'; emit({ error: m, phase: 'error' }); reject(new Error(m)) }
    worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'phase') emit({ phase: m.phase, value: m.value })
      else if (m.type === 'ready') { emit({ phase: 'ready', value: 1, ready: true, backend: m.backend, threads: m.threads }); resolve() }
      else if (m.type === 'result') { pending.get(m.id)?.resolve(m); pending.delete(m.id) }
      else if (m.type === 'error') {
        if (m.id) { pending.get(m.id)?.reject(new Error(m.message)); pending.delete(m.id) }
        else { emit({ error: m.message, phase: 'error' }); reject(new Error(m.message)) }
      }
    }
    worker.postMessage({ type: 'init', modelUrl: MODEL_URL(), modelSize: MODEL_BYTES })
  })
  readyPromise.catch(() => { readyPromise = null; try { worker?.terminate() } catch {} worker = null })
  return readyPromise
}

/** Pre-process (stretch to 1024², CHW float, (v-128)/256) — same convention the net was trained with. */
function preprocess(source) {
  const c = document.createElement('canvas'); c.width = c.height = NET_SIZE
  const x = c.getContext('2d', { willReadFrequently: true })
  x.imageSmoothingQuality = 'high'
  x.drawImage(source, 0, 0, NET_SIZE, NET_SIZE)
  const d = x.getImageData(0, 0, NET_SIZE, NET_SIZE).data
  const n = NET_SIZE * NET_SIZE
  const out = new Float32Array(3 * n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = (d[p] - 128) / 256
    out[n + i] = (d[p + 1] - 128) / 256
    out[2 * n + i] = (d[p + 2] - 128) / 256
  }
  return out
}

/** → { mask: Uint8Array(1024²), size, ms } */
export async function segment(source) {
  await warmUp()
  const id = nextId++
  const data = preprocess(source)
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ type: 'run', id, data, size: NET_SIZE }, [data.buffer])
  })
}

/** Clear a failed state and try booting the worker again. */
export function retry() {
  readyPromise = null
  emit({ error: '', phase: 'idle', value: 0, ready: false })
  return warmUp()
}

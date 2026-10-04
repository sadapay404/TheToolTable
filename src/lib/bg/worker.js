// Background-removal inference worker.
// Runs the bundled IS-Net (quint8) model with ONNX Runtime Web on the WASM backend, off the main thread
// so the UI keeps animating while the network runs. Nothing here touches the network except same-origin
// static files (/models/*.onnx and the bundled ORT .wasm).
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import mjsUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'

let session = null
let inputName = 'input', outputName = 'output'

const post = (m, t) => self.postMessage(m, t || [])

async function fetchWithProgress(url, onProgress, fallbackSize) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not read the bundled model (${res.status})`)
  const total = +res.headers.get('content-length') || fallbackSize
  if (!res.body) { onProgress(1); return new Uint8Array(await res.arrayBuffer()) }
  const reader = res.body.getReader()
  const chunks = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); got += value.length
    onProgress(Math.min(1, got / total))
  }
  const out = new Uint8Array(got); let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

async function init({ modelUrl, modelSize }) {
  post({ type: 'phase', phase: 'engine', value: 0 })
  ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href, mjs: new URL(mjsUrl, self.location.href).href }
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, Math.floor((self.navigator.hardwareConcurrency || 2) / 2))) : 1
  ort.env.wasm.proxy = false
  post({ type: 'phase', phase: 'model', value: 0 })
  const bytes = await fetchWithProgress(modelUrl, (v) => post({ type: 'phase', phase: 'model', value: v }), modelSize)
  post({ type: 'phase', phase: 'compile', value: 0 })
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  inputName = session.inputNames[0]; outputName = session.outputNames[0]
  post({ type: 'ready', backend: 'wasm', threads: ort.env.wasm.numThreads, input: inputName, output: outputName })
}

async function run({ id, data, size }) {
  const t0 = performance.now()
  const input = new ort.Tensor('float32', data, [1, 3, size, size])
  const out = await session.run({ [inputName]: input })
  const o = out[outputName]
  const raw = o.data
  // normalise to 0..1 (the net outputs a sigmoid map; min/max keeps full contrast on soft inputs)
  let mn = Infinity, mx = -Infinity
  for (let i = 0; i < raw.length; i++) { const v = raw[i]; if (v < mn) mn = v; if (v > mx) mx = v }
  const mask = new Uint8Array(size * size)
  const sigmoidish = mn >= -0.001 && mx <= 1.001 && mx - mn > 0.5
  const k = sigmoidish ? 1 : 1 / Math.max(1e-6, mx - mn)
  for (let i = 0; i < mask.length; i++) mask[i] = Math.max(0, Math.min(255, Math.round((sigmoidish ? raw[i] : (raw[i] - mn) * k) * 255)))
  post({ type: 'result', id, mask, size, ms: Math.round(performance.now() - t0), range: [mn, mx] }, [mask.buffer])
}

self.onmessage = async (e) => {
  const m = e.data
  try {
    if (m.type === 'init') await init(m)
    else if (m.type === 'run') await run(m)
  } catch (err) {
    post({ type: 'error', id: m.id, message: String(err?.message || err) })
  }
}

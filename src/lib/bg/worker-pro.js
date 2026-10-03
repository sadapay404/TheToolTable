// "Online" inference worker: BiRefNet via ONNX Runtime Web (WebGPU, with a WASM fallback).
// Network use is limited to ONE fetch of the model weights, which are then kept in Cache Storage so every
// later session starts instantly and offline. Photos never leave this worker's device.
import * as ort from 'onnxruntime-web/webgpu'
import wasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url'
import mjsUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url'

let session = null
let inputName = 'input_image', outputName = 'output_image'
let useSigmoid = true
let fp16In = false
const post = (m, t) => self.postMessage(m, t || [])

/* ---- half-float helpers (some exports keep fp16 inputs/outputs) ---- */
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer)
function toHalf(v) {
  f32[0] = v; const x = u32[0]
  const s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 112; const m = x & 0x7fffff
  if (e <= 0) return s
  if (e >= 31) return s | 0x7c00
  return s | (e << 10) | (m >> 13)
}
function fromHalf(h) {
  const s = (h & 0x8000) << 16, e = (h >> 10) & 0x1f, m = h & 0x3ff
  if (e === 0) return m === 0 ? (s ? -0 : 0) : (s ? -1 : 1) * Math.pow(2, -14) * (m / 1024)
  if (e === 31) return m ? NaN : (s ? -Infinity : Infinity)
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + m / 1024)
}

async function fetchModel({ url, cacheName, fallbackSize }) {
  let cache = null
  try { cache = await self.caches.open(cacheName) } catch {}
  let res = cache ? await cache.match(url).catch(() => null) : null
  const fromCache = !!res
  if (!res) {
    try { res = await fetch(url, { mode: 'cors', credentials: 'omit' }) }
    catch { throw new Error('Couldn’t reach the model host (huggingface.co). Check your internet connection — or switch to Offline mode, which needs no network.') }
    if (!res.ok) throw new Error(`The model host answered ${res.status}. Try again in a moment, or switch to Offline mode.`)
  }
  const total = +res.headers.get('content-length') || fallbackSize || 0
  post({ type: 'phase', phase: 'model', value: 0, got: 0, total, fromCache })
  const reader = res.body.getReader()
  const chunks = []
  let got = 0, lastPost = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); got += value.length
    const now = performance.now()
    if (now - lastPost > 80) { lastPost = now; post({ type: 'phase', phase: 'model', value: total ? Math.min(1, got / total) : 0, got, total: total || got, fromCache }) }
  }
  post({ type: 'phase', phase: 'model', value: 1, got, total: got, fromCache })
  if (!fromCache && cache) {
    try { await cache.put(url, new Response(new Blob(chunks), { headers: { 'content-type': 'application/octet-stream', 'content-length': String(got) } })) } catch {}
  }
  const out = new Uint8Array(got); let o = 0
  for (let i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; chunks[i] = null }
  return out
}

let stretch = false
async function init({ modelUrl, modelSize, ep, cacheName, sigmoid, stretch: st }) {
  stretch = !!st
  post({ type: 'phase', phase: 'engine', value: 0 })
  ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href, mjs: new URL(mjsUrl, self.location.href).href }
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator.hardwareConcurrency || 2) : 1
  ort.env.wasm.proxy = false
  useSigmoid = sigmoid !== false
  const bytes = await fetchModel({ url: modelUrl, cacheName, fallbackSize: modelSize })
  post({ type: 'phase', phase: 'compile', value: 0 })
  session = await ort.InferenceSession.create(bytes, { executionProviders: [ep === 'webgpu' ? 'webgpu' : 'wasm'], graphOptimizationLevel: 'all' })
  inputName = session.inputNames.includes('input_image') ? 'input_image' : session.inputNames[0]
  outputName = session.outputNames.includes('output_image') ? 'output_image' : session.outputNames[0]
  post({ type: 'ready', backend: ep === 'webgpu' ? 'webgpu' : 'wasm', threads: ort.env.wasm.numThreads })
}

async function runOnce(data, size, half) {
  let input
  if (half) { const h = new Uint16Array(data.length); for (let i = 0; i < data.length; i++) h[i] = toHalf(data[i]); input = new ort.Tensor('float16', h, [1, 3, size, size]) }
  else input = new ort.Tensor('float32', data, [1, 3, size, size])
  return session.run({ [inputName]: input })
}

async function run({ id, data, size }) {
  const t0 = performance.now()
  let out
  try { out = await runOnce(data, size, fp16In) }
  catch (err) {
    if (!fp16In && /float16|half|type/i.test(String(err?.message || err))) { fp16In = true; out = await runOnce(data, size, true) }
    else throw err
  }
  const o = out[outputName]
  let raw = o.data
  if (o.type === 'float16') { const f = new Float32Array(raw.length); for (let i = 0; i < raw.length; i++) f[i] = fromHalf(raw[i]); raw = f }
  const n = size * size
  const mask = new Uint8Array(n)
  const off = raw.length > n ? raw.length - n : 0 // multi-scale heads: the last map is the final one
  let mn = Infinity, mx = -Infinity
  for (let i = 0; i < n; i++) { const v = raw[off + i]; if (v < mn) mn = v; if (v > mx) mx = v }
  const alreadyProb = mn >= -0.0001 && mx <= 1.0001
  for (let i = 0; i < n; i++) {
    const v = raw[off + i]
    const p = stretch ? (v - mn) / Math.max(1e-6, mx - mn) : useSigmoid && !alreadyProb ? 1 / (1 + Math.exp(-v)) : v
    mask[i] = p <= 0 ? 0 : p >= 1 ? 255 : Math.round(p * 255)
  }
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

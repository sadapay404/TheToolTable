// Main-thread side of the cut-out engines. Two engines live here and the UI switches between them:
//
//   offline  IS-Net (quint8, 44 MB) bundled inside the site → WASM worker. No network, ever.
//   online   BiRefNet (MIT licence) — the strongest open background-removal network. Its weights are
//            downloaded ONCE from Hugging Face, cached in the browser (Cache Storage), then run on-device
//            with WebGPU (or the CPU when WebGPU is missing). Photos are never uploaded in either mode —
//            "online" only means "fetch a bigger model from the internet".

import { isTauri } from '@tauri-apps/api/core'
import { appFileUrl, clearNativeModelCache, downloadToAppCache, isAppCacheFilePresent } from '../backgroundTransfers.js'

const BASE = () => import.meta.env.BASE_URL || '/'
const OFFLINE_URL = () => new URL(`${BASE()}models/isnet-quint8.onnx`, location.href).href
export const MODEL_BYTES = 44342436
export const NET_SIZE = 1024
export const CACHE_NAME = 'ttt-models-v1'

const HF = 'https://huggingface.co/onnx-community'
export const TIERS = {
  pro: { id: 'pro', name: 'Pro', model: 'BiRefNet Lite', repo: 'BiRefNet_lite-ONNX', blurb: 'Sharp hair, fur and fine edges. The best balance of quality and speed.', gpuMB: 115, cpuMB: 224 },
  max: { id: 'max', name: 'Max', model: 'BiRefNet', repo: 'BiRefNet-ONNX', blurb: 'The full network — studio-grade edges on the hardest photos. Needs a WebGPU graphics card.', gpuMB: 490, cpuMB: null },
}

/** What can this browser do? (WebGPU + 16-bit shaders decide which weights we download.) */
let gpuPromise = null
export function detectGPU() {
  gpuPromise ??= (async () => {
    try {
      const a = await navigator.gpu?.requestAdapter()
      if (!a) return { webgpu: false, f16: false }
      return { webgpu: true, f16: a.features.has('shader-f16') }
    } catch { return { webgpu: false, f16: false } }
  })()
  return gpuPromise
}

/** Which weights + execution provider for a tier on this machine. null = tier unavailable here. */
export function planFor(tier, gpu) {
  // Dev hook (kept deliberately undocumented in the UI): point the online engine at any local .onnx
  // to exercise the loader without internet. localStorage['ttt.bg.devModel'] = {"url":"/models/x.onnx","norm":"half","ep":"wasm","bytes":123}
  try {
    const d = JSON.parse(localStorage.getItem('ttt.bg.devModel') || 'null')
    if (d?.url) return { tier, url: new URL(d.url, location.href).href, ep: d.ep || 'wasm', bytes: d.bytes || 0, norm: d.norm || 'imagenet', sigmoid: d.sigmoid !== false, stretch: !!d.stretch, file: 'dev', mb: Math.round((d.bytes || 0) / 1e6) }
  } catch {}
  const T = TIERS[tier]
  const f16 = gpu.webgpu && gpu.f16
  if (tier === 'max') return f16 ? { tier, url: `${HF}/${T.repo}/resolve/main/onnx/model_fp16.onnx`, ep: 'webgpu', bytes: T.gpuMB * 1e6, mb: T.gpuMB, norm: 'imagenet', sigmoid: true, file: 'fp16' } : null
  if (f16) return { tier, url: `${HF}/${T.repo}/resolve/main/onnx/model_fp16.onnx`, ep: 'webgpu', bytes: T.gpuMB * 1e6, mb: T.gpuMB, norm: 'imagenet', sigmoid: true, file: 'fp16' }
  return { tier, url: `${HF}/${T.repo}/resolve/main/onnx/model.onnx`, ep: gpu.webgpu ? 'webgpu' : 'wasm', bytes: T.cpuMB * 1e6, mb: T.cpuMB, norm: 'imagenet', sigmoid: true, file: 'fp32' }
}
const cpuPlan = (tier) => ({ tier, url: `${HF}/${TIERS[tier].repo}/resolve/main/onnx/model.onnx`, ep: 'wasm', bytes: TIERS[tier].cpuMB * 1e6, mb: TIERS[tier].cpuMB, norm: 'imagenet', sigmoid: true, file: 'fp32' })

/* ----------------------------------- cache helpers ----------------------------------- */
function nativeModelName(plan) {
  const tierName = plan.tier === 'max' ? 'max' : 'lite'
  return `birefnet-${tierName}-${plan.file || 'model'}.onnx`
}

export async function cachedSet() {
  const out = {}
  const gpu = await detectGPU()
  if (isTauri()) {
    for (const tier of Object.keys(TIERS)) {
      const plans = [planFor(tier, gpu), tier === 'pro' ? cpuPlan(tier) : null].filter(Boolean)
      for (const plan of plans) {
        if (await isAppCacheFilePresent(nativeModelName(plan), plan.bytes, 'TheToolTable/models')) out[tier] = true
      }
    }
  }
  try {
    const cache = await caches.open(CACHE_NAME)
    for (const tier of Object.keys(TIERS)) {
      const urls = [planFor(tier, gpu)?.url, tier === 'pro' ? cpuPlan(tier).url : null].filter(Boolean)
      for (const url of urls) if (await cache.match(url)) out[tier] = true
    }
  } catch {}
  return out
}
export async function clearModelCache() {
  try { await caches.delete(CACHE_NAME) } catch {}
  await clearNativeModelCache()
}

/* ----------------------------------- engine instances ----------------------------------- */
const listeners = new Set()
const mk = (kind) => ({ kind, worker: null, readyPromise: null, preparingPromise: null, generation: 0, pending: new Map(), plan: null, state: { phase: 'idle', value: 0, ready: false, error: '', backend: '', threads: 1, got: 0, total: 0, fromCache: false, note: '' } })
const engines = { offline: mk('offline'), online: mk('online') }
let nextId = 1

const readPref = () => { try { return JSON.parse(localStorage.getItem('ttt.bg.engine') || 'null') || {} } catch { return {} } }
let active = { mode: readPref().mode === 'online' ? 'online' : 'offline', tier: readPref().tier === 'max' ? 'max' : 'pro' }
let gpuInfo = { webgpu: false, f16: false }
detectGPU().then((g) => { gpuInfo = g; emitAll() })

const view = () => ({ ...engines[active.mode].state, mode: active.mode, tier: active.tier, gpu: gpuInfo, plan: engines[active.mode].plan })
const emitAll = () => { const v = view(); listeners.forEach((f) => f(v)) }
const patch = (e, p) => { e.state = { ...e.state, ...p }; if (e === engines[active.mode]) emitAll() }

export const subscribe = (f) => { listeners.add(f); f(view()); return () => listeners.delete(f) }
export const getState = () => view()
export const getMode = () => active

function killWorker(e) {
  e.generation += 1
  e.preparingPromise = null
  try { e.worker?.terminate() } catch {}
  e.worker = null; e.readyPromise = null
  e.pending.forEach((p) => p.reject(new Error('Engine stopped or restarted')))
  e.pending.clear()
}

/** Release both model workers when the background-removal tool unmounts. */
export function shutdown() {
  for (const e of Object.values(engines)) {
    killWorker(e)
    e.plan = null
    e.state = { phase: 'idle', value: 0, ready: false, error: '', backend: '', threads: 1, got: 0, total: 0, fromCache: false, note: '' }
  }
}

function boot(e, plan) {
  killWorker(e)
  e.plan = plan
  e.state = { ...e.state, phase: 'idle', value: 0, ready: false, error: '', got: 0, total: 0, fromCache: false, note: '' }
  e.readyPromise = new Promise((resolve, reject) => {
    try {
      e.worker = e.kind === 'offline'
        ? new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
        : new Worker(new URL('./worker-pro.js', import.meta.url), { type: 'module' })
    } catch (err) { patch(e, { error: 'This browser cannot start a background worker.', phase: 'error' }); return reject(err) }
    e.worker.onerror = (ev) => {
      const err = new Error(ev.message || 'The cut-out engine crashed')
      patch(e, { error: err.message, phase: 'error', ready: false })
      e.pending.forEach((p) => p.reject(err)); e.pending.clear()
      reject(err)
    }
    e.worker.onmessage = (ev) => {
      const m = ev.data
      if (m.type === 'phase') patch(e, { phase: m.phase, value: m.value, ...(m.got != null ? { got: m.got, total: m.total } : {}), ...(m.fromCache != null ? { fromCache: m.fromCache } : {}) })
      else if (m.type === 'ready') { patch(e, { phase: 'ready', value: 1, ready: true, backend: m.backend, threads: m.threads }); resolve() }
      else if (m.type === 'result') { e.pending.get(m.id)?.resolve(m); e.pending.delete(m.id) }
      else if (m.type === 'error') {
        if (m.id) { e.pending.get(m.id)?.reject(new Error(m.message)); e.pending.delete(m.id) }
        else patch(e, { error: m.message, phase: 'error' }), reject(new Error(m.message))
      }
    }
    if (e.kind === 'offline') e.worker.postMessage({ type: 'init', modelUrl: OFFLINE_URL(), modelSize: MODEL_BYTES })
    else e.worker.postMessage({ type: 'init', modelUrl: plan.url, modelSize: plan.bytes, ep: plan.ep, cacheName: CACHE_NAME, sigmoid: plan.sigmoid, stretch: plan.stretch, nativeCache: !!plan.nativeCache })
  })
  e.readyPromise.catch(() => { e.readyPromise = null })
  return e.readyPromise
}

async function prepareNativeModel(e, plan, generation = e.generation) {
  if (!isTauri()) return plan
  e.plan = plan
  patch(e, { phase: 'model', value: 0, ready: false, error: '', got: 0, total: plan.bytes, fromCache: false })
  try {
    const path = await downloadToAppCache(plan.url, {
      name: nativeModelName(plan),
      directory: 'TheToolTable/models',
      expectedBytes: plan.bytes,
      /* Named so the notification says what it is: this download is long, it is
         resumable, and it is safe to switch apps while it runs. */
      title: `${TIERS[plan.tier]?.name || 'Background remover'} model`,
      detail: 'Keeps running if you leave the app',
      onProgress: (progress) => {
        if (e.generation !== generation) return
        patch(e, {
          phase: 'model',
          value: progress.progress,
          got: progress.receivedBytes,
          total: progress.totalBytes || plan.bytes,
          fromCache: !!progress.fromCache,
        })
      },
    })
    if (e.generation !== generation) throw new Error('Engine stopped or restarted')
    patch(e, { phase: 'model', value: 1, got: plan.bytes, total: plan.bytes, fromCache: true })
    return { ...plan, sourceUrl: plan.url, url: appFileUrl(path), nativeCache: true }
  } catch (error) {
    if (e.generation === generation) {
      patch(e, { error: error?.message || 'The background model download failed.', phase: 'error', ready: false })
    }
    throw error
  }
}

async function start(e, tier = active.tier) {
  if (e.readyPromise) return e.readyPromise
  if (e.preparingPromise) return e.preparingPromise
  if (e.kind === 'offline') return boot(e, null)

  const requestedGeneration = e.generation
  const preparing = (async () => {
    const gpu = await detectGPU(); gpuInfo = gpu
    const plan = planFor(tier, gpu)
    if (!plan) {
      const message = `${TIERS[tier].name} needs a WebGPU graphics card, which this browser doesn’t expose. Choose Pro, or switch to Offline.`
      patch(e, { error: message, phase: 'error' })
      throw new Error(message)
    }

    // Native transfers are owned by Rust/WorkManager, not this worker. They
    // continue if React unmounts or Android suspends the WebView.
    const runtimePlan = await prepareNativeModel(e, plan, requestedGeneration)
    if (e.generation !== requestedGeneration) throw new Error('Engine stopped or restarted')
    const workerGeneration = requestedGeneration + 1 // boot() replaces the worker and increments once
    try {
      return await boot(e, runtimePlan)
    } catch (error) {
      if (e.generation !== workerGeneration) throw error
      // WebGPU can fail on odd drivers — Pro quietly falls back to the CPU weights.
      let devModel = false
      try { devModel = !!localStorage.getItem('ttt.bg.devModel') } catch {}
      if (runtimePlan.ep === 'webgpu' && tier === 'pro' && !devModel) {
        const cpu = cpuPlan('pro')
        const fallbackGeneration = e.generation
        const cpuRuntimePlan = await prepareNativeModel(e, cpu, fallbackGeneration)
        if (e.generation !== fallbackGeneration) throw new Error('Engine stopped or restarted')
        const fallbackWorkerGeneration = fallbackGeneration + 1
        patch(e, { note: 'WebGPU failed here — using the CPU weights instead.' })
        try { return await boot(e, cpuRuntimePlan) }
        catch (fallbackError) {
          if (e.generation !== fallbackWorkerGeneration) throw fallbackError
          throw fallbackError
        }
      }
      throw error
    }
  })()
  e.preparingPromise = preparing
  try {
    return await preparing
  } finally {
    if (e.preparingPromise === preparing) e.preparingPromise = null
  }
}

export function warmUp() { return start(engines[active.mode], active.tier) }

/** Switch engine. Starting the online engine begins the (cached) model download straight away. */
export function setEngine(mode, tier = active.tier) {
  if (!Object.hasOwn(engines, mode)) return Promise.reject(new RangeError('Choose the Offline or Online cut-out engine'))
  if (!Object.hasOwn(TIERS, tier)) tier = 'pro'
  const previous = active
  const tierChanged = tier !== previous.tier
  active = { mode, tier }
  try { localStorage.setItem('ttt.bg.engine', JSON.stringify(active)) } catch {}
  if (previous.mode !== mode) killWorker(engines[previous.mode])
  if (tierChanged) killWorker(engines.online)
  emitAll()
  return warmUp().catch(() => {})
}

/** Pre-process (stretch to 1024², CHW float). 'half' = (v-128)/256 (IS-Net) · 'imagenet' = (v/255-mean)/std (BiRefNet). */
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225]
function preprocess(source, norm) {
  const c = document.createElement('canvas'); c.width = c.height = NET_SIZE
  const x = c.getContext('2d', { willReadFrequently: true })
  x.imageSmoothingQuality = 'high'
  x.drawImage(source, 0, 0, NET_SIZE, NET_SIZE)
  const d = x.getImageData(0, 0, NET_SIZE, NET_SIZE).data
  const n = NET_SIZE * NET_SIZE
  const out = new Float32Array(3 * n)
  if (norm === 'imagenet') {
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      out[i] = (d[p] / 255 - MEAN[0]) / STD[0]
      out[n + i] = (d[p + 1] / 255 - MEAN[1]) / STD[1]
      out[2 * n + i] = (d[p + 2] / 255 - MEAN[2]) / STD[2]
    }
  } else {
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      out[i] = (d[p] - 128) / 256
      out[n + i] = (d[p + 1] - 128) / 256
      out[2 * n + i] = (d[p + 2] - 128) / 256
    }
  }
  return out
}

/** → { mask: Uint8Array(1024²), size, ms, mode } using whichever engine is active. */
export async function segment(source) {
  const { mode, tier } = active
  const e = engines[mode]
  await start(e, tier)
  const id = nextId++
  const data = preprocess(source, e.plan?.norm === 'imagenet' ? 'imagenet' : 'half')
  const r = await new Promise((resolve, reject) => {
    e.pending.set(id, { resolve, reject })
    try { e.worker.postMessage({ type: 'run', id, data, size: NET_SIZE }, [data.buffer]) }
    catch (error) { e.pending.delete(id); reject(error) }
  })
  return { ...r, mode, tier }
}

/** Clear a failed state and try booting the active engine again. */
export function retry() {
  const e = engines[active.mode]
  killWorker(e)
  e.state = { ...e.state, error: '', phase: 'idle', value: 0, ready: false, note: '' }
  emitAll()
  return warmUp()
}

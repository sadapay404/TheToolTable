/* Offline OCR. Tesseract runs from the copies in public/ocr (worker + LSTM core + English
   traineddata), so recognition works with the network switched off — nothing is uploaded. */

const BASE = () => import.meta.env.BASE_URL || '/'
export const asset = (f) => new URL(`${BASE()}ocr/${f}`, location.href).href

export const LANG_PACKS = [
  ['eng', 'English', 'Bundled — works offline out of the box.'],
]

let workerP = null
let listeners = new Set()

/** The status/progress stream the UI subscribes to. */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
const emit = (v) => listeners.forEach((f) => f(v))

export let state = { ready: false, busy: false, phase: '', progress: 0, error: '' }
const set = (patch) => { state = { ...state, ...patch }; emit(state) }

export function getWorker() {
  workerP ??= (async () => {
    set({ phase: 'loading engine', progress: 0.02, error: '' })
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng', 1, {
      workerPath: asset('worker.min.js'),
      corePath: new URL(`${BASE()}ocr`, location.href).href,
      langPath: new URL(`${BASE()}ocr`, location.href).href,
      gzip: true,
      logger: (m) => {
        const p = Number(m.progress) || 0
        if (/loading language|initializing/i.test(m.status || '')) set({ phase: 'loading language data', progress: 0.05 + p * 0.35 })
        else if (/recognizing/i.test(m.status || '')) set({ phase: 'reading text', progress: 0.4 + p * 0.6 })
        else if (m.status) set({ phase: m.status, progress: Math.max(0.02, p * 0.05) })
      },
    })
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '3', // fully automatic page segmentation
    })
    set({ ready: true, phase: 'ready', progress: 1 })
    return worker
  })().catch((e) => {
    workerP = null
    set({ ready: false, error: String(e?.message || e), phase: '', progress: 0 })
    throw e
  })
  return workerP
}

/** Warm the engine without recognising anything (called when the tool opens). */
export const preload = () => getWorker().then(() => true).catch(() => false)

/**
 * Recognise text in an image. `image` may be a Blob/File, a canvas or an ImageBitmap.
 * Returns `{ text, confidence, lines, words, ms }`.
 */
export async function recognize(image, { onProgress } = {}) {
  const worker = await getWorker()
  set({ busy: true, phase: 'reading text', progress: 0.4 })
  const t0 = Date.now()
  let res
  try {
    // blocks give per-line boxes + confidence, which is what the preview highlights
    res = await worker.recognize(image, {}, { text: true, blocks: true })
    if (!res?.data) throw new Error('no data')
  } catch {
    res = await worker.recognize(image)
  }
  const d = res?.data || {}
  const lines = extractLines(d)
  set({ busy: false, phase: 'ready', progress: 1 })
  onProgress?.(1)
  return {
    text: String(d.text || '').replace(/\n{3,}/g, '\n\n').trim(),
    confidence: Number(d.confidence) || 0,
    lines,
    words: lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0),
    ms: Date.now() - t0,
  }
}

function extractLines(d) {
  const out = []
  for (const b of d.blocks || []) {
    for (const p of b.paragraphs || []) {
      for (const l of p.lines || []) {
        const text = String(l.text || '').trim()
        if (!text) continue
        const bbox = l.bbox || {}
        out.push({
          text, confidence: Number(l.confidence) || 0,
          x0: bbox.x0 ?? 0, y0: bbox.y0 ?? 0, x1: bbox.x1 ?? 0, y1: bbox.y1 ?? 0,
          y: bbox.y0 ?? 0, h: (bbox.y1 ?? 0) - (bbox.y0 ?? 0),
        })
      }
    }
  }
  if (!out.length && d.text) {
    for (const line of String(d.text).split('\n')) if (line.trim()) out.push({ text: line.trim(), confidence: Number(d.confidence) || 0, y: 0, h: 0, x0: 0, y0: 0, x1: 0, y1: 0, flat: true })
  }
  return out
}

export async function terminate() {
  const p = workerP
  workerP = null
  set({ ready: false, phase: '', progress: 0 })
  try { const w = await p; await w?.terminate() } catch { /* nothing to stop */ }
}

/** Anything the OCR tool can read: images directly, PDFs via the rasteriser. */
export const IMAGE_TYPES = /image\/(png|jpeg|jpg|webp|bmp|gif|avif)|\.(png|jpe?g|webp|bmp|gif|avif)$/i

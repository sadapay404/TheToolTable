#!/usr/bin/env node
/**
 * Copies the OCR runtime out of node_modules into public/ocr/ so the app recognises text with
 * **no network at all** — the worker, the three LSTM cores (plain / SIMD / relaxed-SIMD, whichever
 * the browser reports support for) and English traineddata. Run it after `npm install`; the files
 * are committed so a plain `npm run build` works anywhere.
 *
 *   node scripts/ocr-assets.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'public/ocr')
const nm = (p) => join(root, 'node_modules', p)

const wanted = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
]

mkdirSync(out, { recursive: true })
let bytes = 0
const missing = []
for (const [from, to] of wanted) {
  const src = nm(from)
  if (!existsSync(src)) { missing.push(from); continue }
  copyFileSync(src, join(out, to))
  bytes += statSync(src).size
  console.log(`  ${to.padEnd(42)} ${(statSync(src).size / 1048576).toFixed(2)} MB`)
}
if (missing.length) {
  console.error(`\n${missing.length} OCR file(s) missing — run \`npm install\` first:\n  ${missing.join('\n  ')}`)
  process.exit(1)
}
const total = readdirSync(out).reduce((n, f) => n + statSync(join(out, f)).size, 0)
console.log(`# ocr assets: ${(total / 1048576).toFixed(1)} MB in public/ocr (copied ${(bytes / 1048576).toFixed(1)} MB)`)

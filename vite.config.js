import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createYtdlpHandler } from './server/ytdlp-api.js'
import fs from 'node:fs'
import path from 'node:path'

/** Mounts the yt-dlp companion engine on the dev + preview servers (same origin → zero setup). */
const ytdlpEngine = () => {
  const mount = (server) => { server.middlewares.use('/api/ytdlp', createYtdlpHandler()) }
  return { name: 'tttable-ytdlp-engine', configureServer: mount, configurePreviewServer: mount }
}

/** Ships the ffmpeg.wasm core inside the app (/ffmpeg/*) so conversions work offline and in the native builds. */
const ffmpegCore = () => {
  const dir = path.resolve('node_modules/@ffmpeg/core/dist/esm')
  const files = { 'ffmpeg-core.js': 'text/javascript', 'ffmpeg-core.wasm': 'application/wasm' }
  return {
    name: 'tttable-ffmpeg-core',
    configureServer(server) {
      server.middlewares.use('/ffmpeg', (req, res, next) => {
        const f = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '')
        if (!files[f]) return next()
        res.setHeader('Content-Type', files[f]); res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(path.join(dir, f)).pipe(res)
      })
    },
    generateBundle() { for (const f of Object.keys(files)) this.emitFile({ type: 'asset', fileName: `ffmpeg/${f}`, source: fs.readFileSync(path.join(dir, f)) }) },
  }
}

/** Ships the OCR engine (worker, wasm cores, English + Urdu models) inside the app (/ocr/*) so scanning works offline and in the native builds. */
const ocrAssets = () => {
  const nm = (...a) => path.resolve('node_modules', ...a)
  const map = { 'worker.min.js': nm('tesseract.js/dist/worker.min.js'), 'lang/eng.traineddata.gz': nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), 'lang/urd.traineddata.gz': nm('@tesseract.js-data/urd/4.0.0_best_int/urd.traineddata.gz') }
  for (const c of ['simd-lstm', 'relaxedsimd-lstm', 'lstm']) map[`core/tesseract-core-${c}.wasm.js`] = nm('tesseract.js-core', `tesseract-core-${c}.wasm.js`)
  return {
    name: 'tttable-ocr-assets',
    configureServer(server) {
      server.middlewares.use('/ocr', (req, res, next) => {
        const f = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '')
        if (!map[f]) return next()
        res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(map[f]).pipe(res)
      })
    },
    generateBundle() { for (const [f, src] of Object.entries(map)) this.emitFile({ type: 'asset', fileName: `ocr/${f}`, source: fs.readFileSync(src) }) },
  }
}

export default defineConfig({
  plugins: [react(), ytdlpEngine(), ffmpegCore(), ocrAssets()],
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  build: { chunkSizeWarningLimit: 3000 },
  worker: { format: 'es' },
})

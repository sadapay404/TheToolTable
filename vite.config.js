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

export default defineConfig({
  plugins: [react(), ytdlpEngine(), ffmpegCore()],
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  build: { chunkSizeWarningLimit: 3000 },
  worker: { format: 'es' },
})

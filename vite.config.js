import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createYtdlpHandler } from './server/ytdlp-api.js'

/** Mounts the yt-dlp companion engine on the dev + preview servers (same origin → zero setup). */
const ytdlpEngine = () => {
  const mount = (server) => { server.middlewares.use('/api/ytdlp', createYtdlpHandler()) }
  return { name: 'tttable-ytdlp-engine', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig({
  plugins: [react(), ytdlpEngine()],
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  build: { chunkSizeWarningLimit: 3000 },
})

/**
 * Self-hosted yt-dlp engine for TheToolTable (VPS / Docker / desktop sidecar).
 *   node server/standalone.js            → http://127.0.0.1:8787/api/ytdlp
 * Env: PORT, HOST, YTDLP_PATH, FFMPEG_PATH, YTDLP_CORS (comma-separated origins, or * to allow any
 *      site — default: local dev + thetooltable.app only), YTDLP_ALLOW_PRIVATE=1
 */
import http from 'node:http'
import { createYtdlpHandler, parseCors, resolveBinaries } from './ytdlp-api.js'

const PORT = +process.env.PORT || 8787
const HOST = process.env.HOST || '127.0.0.1'
const handler = createYtdlpHandler({ cors: process.env.YTDLP_CORS ?? true })

http.createServer((req, res) => {
  if (req.url.startsWith('/api/ytdlp')) {
    req.url = req.url.slice('/api/ytdlp'.length) || '/'
    return handler(req, res)
  }
  res.writeHead(404).end('TheToolTable yt-dlp engine')
}).listen(PORT, HOST, () => {
  const b = resolveBinaries()
  console.log(`TheToolTable engine → http://${HOST}:${PORT}/api/ytdlp`)
  console.log(`  yt-dlp: ${b.version || 'NOT FOUND (run: npm run setup:engine)'}  ffmpeg: ${b.ffmpeg ? 'ok' : 'missing'}`)
  const cors = parseCors(process.env.YTDLP_CORS ?? true)
  console.log(cors === '*' ? '  CORS: any website (YTDLP_CORS=*) — only do this on a machine you control'
    : `  CORS: ${cors.join(', ')}${process.env.YTDLP_CORS ? '' : ' (defaults — add yours with YTDLP_CORS=https://your-app.example)'}`)
})

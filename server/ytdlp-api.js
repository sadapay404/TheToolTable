/**
 * TheToolTable — yt-dlp companion engine.
 *
 * A zero-dependency Node request handler that wraps the real yt-dlp binary.
 * It is mounted in two places:
 *   • Vite dev/preview server (see vite.config.js)  → same origin, no setup
 *   • server/standalone.js                           → self-host / Docker / VPS / Tauri sidecar
 *
 * Security model: user input is NEVER passed to a shell. Every option is validated
 * against a whitelist and handed to yt-dlp as an argv array, with `--` before the URL.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = os.homedir()
const WORK = path.join(os.tmpdir(), 'tttable-ytdlp')
const MAX_JOBS_RUNNING = 3
const JOB_TTL_MS = 30 * 60 * 1000

/* ------------------------------ binary discovery ------------------------------ */

function probe(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 8000 })
    return r.status === 0 ? (r.stdout || r.stderr || '').trim().split('\n')[0] : null
  } catch { return null }
}

let _bins = null
export function resolveBinaries(force = false) {
  if (_bins && !force) return _bins
  const ytCands = [process.env.YTDLP_PATH, path.join(ROOT, '.bin', 'yt-dlp'), path.join(HOME, '.ytvenv', 'bin', 'yt-dlp'), 'yt-dlp', 'yt-dlp.exe'].filter(Boolean)
  let ytdlp = null, version = null
  for (const c of ytCands) { const v = probe(c, ['--version']); if (v) { ytdlp = c; version = v; break } }

  const ffCands = [process.env.FFMPEG_PATH, path.join(ROOT, '.bin', 'ffmpeg'), 'ffmpeg', 'ffmpeg.exe']
  try {
    const dir = path.join(HOME, '.ytvenv', 'lib')
    for (const py of fs.readdirSync(dir)) {
      const b = path.join(dir, py, 'site-packages', 'imageio_ffmpeg', 'binaries')
      if (fs.existsSync(b)) for (const f of fs.readdirSync(b)) ffCands.push(path.join(b, f))
    }
  } catch { /* venv absent */ }
  let ffmpeg = null
  for (const c of ffCands.filter(Boolean)) { if (probe(c, ['-version'])) { ffmpeg = c; break } }

  _bins = { ytdlp, version, ffmpeg }
  return _bins
}

let _extractors = null
function extractorCount(ytdlp) {
  if (_extractors != null) return _extractors
  try {
    const r = spawnSync(ytdlp, ['--list-extractors'], { encoding: 'utf8', timeout: 15000 })
    _extractors = r.status === 0 ? r.stdout.split('\n').filter((l) => l.trim() && !/^\s*(CURRENTLY BROKEN|Generic)/i.test(l)).length : 0
  } catch { _extractors = 0 }
  return _extractors
}

/* ------------------------------ validation helpers ------------------------------ */

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i

function validateUrl(raw, allowPrivate) {
  if (typeof raw !== 'string' || raw.length > 2048) throw httpErr(400, 'Invalid URL')
  let u
  try { u = new URL(raw.trim()) } catch { throw httpErr(400, 'That does not look like a valid URL') }
  if (!/^https?:$/.test(u.protocol)) throw httpErr(400, 'Only http(s) URLs are supported')
  if (!allowPrivate && PRIVATE_HOST.test(u.hostname)) throw httpErr(400, 'Private / local addresses are blocked on this engine')
  return u.toString()
}

const httpErr = (status, message) => Object.assign(new Error(message), { status })
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null }

/* ------------------------------ process helpers ------------------------------ */

function runJson(bin, args, timeout = 75000) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(httpErr(504, 'The site took too long to respond')) }, timeout)
    p.stdout.on('data', (d) => { out += d; if (out.length > 60e6) p.kill('SIGKILL') })
    p.stderr.on('data', (d) => { err += d })
    p.on('error', (e) => { clearTimeout(t); reject(httpErr(500, 'Could not start yt-dlp: ' + e.message)) })
    p.on('close', (code) => {
      clearTimeout(t)
      if (code !== 0) return reject(httpErr(422, cleanErr(err) || 'yt-dlp could not read that link'))
      try { resolve(JSON.parse(out)) } catch { reject(httpErr(500, 'Unreadable response from yt-dlp')) }
    })
  })
}

function cleanErr(s) {
  const line = String(s).split('\n').filter((l) => /^ERROR/i.test(l.trim())).pop() || String(s).trim().split('\n').pop() || ''
  return line.replace(/^ERROR:\s*/i, '').replace(/\s*\(caused by .*$/i, '').replace(/; please report this issue.*$/i, '').slice(0, 320)
}

/* ------------------------------ info ------------------------------ */

function summarise(j) {
  if (j._type === 'playlist') {
    return {
      kind: 'playlist', title: j.title, uploader: j.uploader || j.channel, count: j.playlist_count || (j.entries || []).length,
      extractor: j.extractor_key,
      entries: (j.entries || []).slice(0, 300).map((e, i) => ({
        i: i + 1, id: e.id, title: e.title, url: e.url || e.webpage_url, duration: e.duration,
        thumbnail: e.thumbnails?.[0]?.url || e.thumbnail,
      })).filter((e) => e.url),
    }
  }
  const formats = j.formats || []
  const video = formats.filter((f) => f.vcodec && f.vcodec !== 'none' && f.height)
  const audio = formats.filter((f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
  const size = (f) => f?.filesize || f?.filesize_approx || 0
  const bestAudio = audio.slice().sort((a, b) => (b.abr || 0) - (a.abr || 0))[0]
  const byH = new Map()
  for (const f of video) {
    const cur = byH.get(f.height)
    if (!cur || (f.tbr || 0) > (cur.tbr || 0)) byH.set(f.height, f)
  }
  const hasMuxedOnly = video.length > 0 && audio.length === 0
  const heights = [...byH.entries()].sort((a, b) => b[0] - a[0]).map(([h, f]) => ({
    height: h, fps: f.fps || null, vcodec: (f.vcodec || '').split('.')[0], ext: f.ext,
    bytes: size(f) ? size(f) + (hasMuxedOnly || (f.acodec && f.acodec !== 'none') ? 0 : size(bestAudio)) : 0,
  }))
  const subs = Object.keys(j.subtitles || {})
  return {
    kind: 'video', id: j.id, title: j.title, uploader: j.uploader || j.channel || j.creator, duration: j.duration || null,
    thumbnail: j.thumbnail, extractor: j.extractor_key || j.extractor, webpageUrl: j.webpage_url,
    uploadDate: j.upload_date, views: j.view_count, likes: j.like_count, isLive: !!j.is_live,
    description: (j.description || '').slice(0, 500), chapters: (j.chapters || []).length,
    heights, needsMerge: !hasMuxedOnly && video.some((f) => !f.acodec || f.acodec === 'none'),
    hasVideo: video.length > 0, hasAudio: audio.length > 0 || video.some((f) => f.acodec && f.acodec !== 'none'),
    audioKbps: bestAudio?.abr ? Math.round(bestAudio.abr) : null,
    audioBytes: size(bestAudio), subtitles: subs.slice(0, 40), autoSubs: Object.keys(j.automatic_captions || {}).length,
    formatCount: formats.length,
  }
}

/* ------------------------------ jobs ------------------------------ */

const jobs = new Map()

const MIME = { mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/ogg', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav', aac: 'audio/aac', mov: 'video/quicktime' }

function buildArgs(o, bins, outDir) {
  const args = ['--no-playlist', '--no-warnings', '--newline', '--no-colors', '--no-mtime', '--restrict-filenames',
    '--progress-template', 'download:TTT|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
    '-o', path.join(outDir, '%(title).120B [%(id)s].%(ext)s'), '--paths', 'temp:' + path.join(outDir, '.tmp')]
  if (bins.ffmpeg) args.push('--ffmpeg-location', bins.ffmpeg)

  if (o.mode === 'audio') {
    const af = ['best', 'mp3', 'm4a', 'opus', 'flac', 'wav', 'aac'].includes(o.audioFormat) ? o.audioFormat : 'best'
    args.push('-f', 'ba/b', '-x', '--audio-format', af, '--audio-quality', '0')
  } else {
    const h = num(o.height, 100, 4320)
    const c = ['mp4', 'mkv', 'webm'].includes(o.container) ? o.container : 'mp4'
    const hf = h ? `[height<=${h}]` : ''
    // Prefer codecs that already fit the container → stream copy, never re-encode.
    const sel = c === 'mp4'
      ? `bv*${hf}[ext=mp4]+ba[ext=m4a]/bv*${hf}+ba/b${hf}/b`
      : c === 'webm'
        ? `bv*${hf}[ext=webm]+ba[ext=webm]/bv*${hf}+ba/b${hf}/b`
        : `bv*${hf}+ba/b${hf}/b`
    args.push('-f', sel, '--merge-output-format', c, '--remux-video', c) // remux = container swap only, never a re-encode
  }
  const s = num(o.start, 0, 86400 * 3), e = num(o.end, 0, 86400 * 3)
  if (o.clip && s != null && e != null && e > s) {
    args.push('--download-sections', `*${s}-${e}`)
    if (o.accurateCuts) args.push('--force-keyframes-at-cuts')
  }
  if (o.metadata !== false) args.push('--embed-metadata', '--embed-chapters')
  if (o.subs && o.mode !== 'audio') args.push('--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,en', '--embed-subs')
  args.push('--', o.url)
  return args
}

function startJob(o, bins, allowPrivate) {
  if (!bins.ytdlp) throw httpErr(503, 'yt-dlp is not installed on the engine')
  o.url = validateUrl(o.url, allowPrivate)
  const running = [...jobs.values()].filter((j) => j.state === 'running').length
  if (running >= MAX_JOBS_RUNNING) throw httpErr(429, 'Engine is busy — wait for a running download to finish')

  const id = crypto.randomBytes(8).toString('hex')
  const dir = path.join(WORK, id)
  fs.mkdirSync(path.join(dir, '.tmp'), { recursive: true })
  const job = {
    id, state: 'running', stage: 'fetching', percent: null, downloaded: 0, total: 0, speed: 0, eta: null,
    part: 0, parts: Math.round(num(o.parts, 1, 3) || 1), created: Date.now(), dir, file: null, size: 0, error: null, log: [],
    startedAt: Date.now(),
  }
  jobs.set(id, job)

  const p = spawn(bins.ytdlp, buildArgs(o, bins, dir), { stdio: ['ignore', 'pipe', 'pipe'], cwd: dir })
  job.proc = p
  const onLine = (line) => {
    if (!line) return
    job.log.push(line); if (job.log.length > 60) job.log.shift()
    if (line.startsWith('TTT|')) {
      const [, dl, tot, est, spd, eta] = line.split('|')
      const d = +dl || 0, t = +tot || +est || 0
      job.downloaded = d; job.total = t; job.speed = +spd || 0; job.eta = Number.isFinite(+eta) && eta !== 'NA' ? +eta : null
      if (t > 0) {
        const within = Math.min(1, d / t)
        job.percent = Math.min(99, ((job.part + within) / job.parts) * 100)
      }
      job.stage = 'downloading'
    } else if (/^\[download\] Destination:/.test(line)) {
      if (job.stage === 'downloading') job.part = Math.min(job.parts - 1, job.part + 1)
    } else if (/^\[(Merger|ExtractAudio|VideoConvertor|EmbedSubtitle|Metadata|ModifyChapters|FixupM4a|FixupM3u8|VideoRemuxer)\]/.test(line)) {
      job.stage = /Merger/.test(line) ? 'merging' : /ExtractAudio|VideoConvertor|VideoRemuxer/.test(line) ? 'converting' : 'finishing'
      job.percent = 99
    } else if (/^\[(ffmpeg|download)\].*(clip|section)/i.test(line) || /^\[download\] Downloading/.test(line)) {
      job.stage = 'downloading'
    }
  }
  let buf = ''
  const feed = (chunk) => { buf += chunk; const lines = buf.split(/\r?\n/); buf = lines.pop(); lines.forEach(onLine) }
  p.stdout.on('data', (d) => feed(String(d)))
  p.stderr.on('data', (d) => feed(String(d)))
  p.on('error', (e) => { job.state = 'error'; job.error = 'Could not start yt-dlp: ' + e.message })
  p.on('close', (code) => {
    if (buf) onLine(buf)
    job.proc = null
    if (job.state === 'cancelled') return
    if (code !== 0) { job.state = 'error'; job.error = cleanErr(job.log.filter((l) => /ERROR/.test(l)).join('\n') || job.log.join('\n')) || 'Download failed'; return }
    try {
      const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.') && !/\.(part|ytdl|json|vtt|srt)$/i.test(f))
        .map((f) => ({ f, s: fs.statSync(path.join(dir, f)).size })).sort((a, b) => b.s - a.s)
      if (!files.length) throw new Error('No output file was produced')
      job.file = files[0].f; job.size = files[0].s
      job.state = 'done'; job.stage = 'ready'; job.percent = 100; job.doneAt = Date.now()
    } catch (e) { job.state = 'error'; job.error = e.message }
  })
  return job
}

const pub = (j) => ({
  id: j.id, state: j.state, stage: j.stage, percent: j.percent, downloaded: j.downloaded, total: j.total,
  speed: j.speed, eta: j.eta, part: j.part + 1, parts: j.parts, file: j.file, size: j.size, error: j.error,
  elapsed: ((j.doneAt || Date.now()) - j.startedAt) / 1000,
})

function dropJob(j) {
  try { j.proc?.kill('SIGKILL') } catch { /* noop */ }
  try { fs.rmSync(j.dir, { recursive: true, force: true }) } catch { /* noop */ }
  jobs.delete(j.id)
}

setInterval(() => {
  const now = Date.now()
  for (const j of jobs.values()) if (now - j.created > JOB_TTL_MS && j.state !== 'running') dropJob(j)
}, 60 * 1000).unref?.()

/* ------------------------------ http handler ------------------------------ */

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = []
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(httpErr(413, 'Body too large')); req.destroy() } else chunks.push(c) })
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) } catch { reject(httpErr(400, 'Invalid JSON')) } })
    req.on('error', reject)
  })
}

const json = (res, status, body) => {
  const s = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(s)
}

/** connect-style middleware; `req.url` is relative to the mount point. */
export function createYtdlpHandler({ allowPrivate = process.env.YTDLP_ALLOW_PRIVATE === '1', cors = false } = {}) {
  return async function handler(req, res, next) {
    const url = new URL(req.url, 'http://x')
    const route = url.pathname.replace(/\/+$/, '') || '/'

    if (cors) {
      res.setHeader('Access-Control-Allow-Origin', typeof cors === 'string' ? cors : '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition,Content-Length')
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
    }

    try {
      const bins = resolveBinaries()
      if (route === '/health' && req.method === 'GET') {
        if (!bins.ytdlp) resolveBinaries(true)
        const b = resolveBinaries()
        return json(res, 200, { ok: !!b.ytdlp, ytdlp: b.version, ffmpeg: !!b.ffmpeg, extractors: b.ytdlp ? extractorCount(b.ytdlp) : 0, running: [...jobs.values()].filter((j) => j.state === 'running').length })
      }
      if (!bins.ytdlp) throw httpErr(503, 'yt-dlp is not installed on the engine')

      if (route === '/info' && req.method === 'POST') {
        const b = await readBody(req)
        const u = validateUrl(b.url, allowPrivate)
        const args = ['-J', '--no-warnings', '--no-colors', b.playlist ? '--flat-playlist' : '--no-playlist', '--', u]
        const j = await runJson(bins.ytdlp, args)
        return json(res, 200, { ...summarise(j), sourceUrl: u })
      }

      if (route === '/jobs' && req.method === 'POST') {
        const b = await readBody(req)
        const job = startJob(b, bins, allowPrivate)
        return json(res, 202, pub(job))
      }

      const m = route.match(/^\/jobs\/([a-f0-9]{16})(\/file)?$/)
      if (m) {
        const job = jobs.get(m[1])
        if (!job) throw httpErr(404, 'Job not found or expired')
        if (!m[2] && req.method === 'GET') return json(res, 200, pub(job))
        if (!m[2] && req.method === 'DELETE') { job.state = 'cancelled'; dropJob(job); return json(res, 200, { ok: true }) }
        if (m[2] && req.method === 'GET') {
          if (job.state !== 'done') throw httpErr(409, 'File is not ready yet')
          const fp = path.join(job.dir, job.file)
          const ext = path.extname(job.file).slice(1).toLowerCase()
          res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': job.size,
            'Content-Disposition': `attachment; filename="${job.file.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(job.file)}`,
            'Cache-Control': 'no-store',
          })
          return fs.createReadStream(fp).pipe(res)
        }
      }
      if (next) return next()
      throw httpErr(404, 'Unknown endpoint')
    } catch (e) {
      json(res, e.status || 500, { error: e.message || 'Engine error' })
    }
  }
}

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
import { err as httpErr, normalizeUrl, cleanErr, summarise, buildArgs, infoArgs, JobTracker } from '../src/lib/ytdlp-core.js'

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

const validateUrl = normalizeUrl

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

/* ------------------------------ jobs ------------------------------ */

const jobs = new Map()

const MIME = { mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/ogg', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav', aac: 'audio/aac', mov: 'video/quicktime' }

function startJob(o, bins, allowPrivate) {
  if (!bins.ytdlp) throw httpErr(503, 'yt-dlp is not installed on the engine')
  o.url = validateUrl(o.url, allowPrivate)
  const running = [...jobs.values()].filter((j) => j.state === 'running').length
  if (running >= MAX_JOBS_RUNNING) throw httpErr(429, 'Engine is busy — wait for a running download to finish')

  const id = crypto.randomBytes(8).toString('hex')
  const dir = path.join(WORK, id)
  fs.mkdirSync(path.join(dir, '.tmp'), { recursive: true })
  const tracker = new JobTracker(id, o.parts)
  const job = { id, tracker, dir, created: Date.now(), proc: null, get state() { return tracker.s.state } }
  jobs.set(id, job)

  const argv = buildArgs(o, { ffmpeg: bins.ffmpeg, outTemplate: path.join(dir, '%(title).120B [%(id)s].%(ext)s'), tempDir: path.join(dir, '.tmp') })
  const p = spawn(bins.ytdlp, argv, { stdio: ['ignore', 'pipe', 'pipe'], cwd: dir })
  job.proc = p
  p.stdout.on('data', (d) => tracker.feed(String(d)))
  p.stderr.on('data', (d) => tracker.feed(String(d)))
  p.on('error', (e) => { tracker.s.state = 'error'; tracker.s.error = 'Could not start yt-dlp: ' + e.message })
  p.on('close', (code) => { job.proc = null; tracker.finish(code, async (f) => fs.statSync(f).size).then(() => { job.doneAt = Date.now() }) })
  return job
}

const pub = (j) => {
  const s = j.tracker.snapshot()
  return { ...s, file: s.file ? path.basename(s.file) : null }
}

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
        const j = await runJson(bins.ytdlp, infoArgs(u, !!b.playlist))
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
        if (!m[2] && req.method === 'DELETE') { job.tracker.cancelled = true; job.tracker.s.state = 'cancelled'; dropJob(job); return json(res, 200, { ok: true }) }
        if (m[2] && req.method === 'GET') {
          if (job.state !== 'done') throw httpErr(409, 'File is not ready yet')
          const fp = job.tracker.s.file
          const name = path.basename(fp)
          const ext = path.extname(name).slice(1).toLowerCase()
          res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': job.tracker.s.size,
            'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
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

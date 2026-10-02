/**
 * yt-dlp core — pure logic, ZERO environment dependencies (no node:*, no DOM).
 *
 * The very same code drives every runtime:
 *   • server/ytdlp-api.js      (web dev / self-hosted engine)
 *   • src/lib/engine.js        (Tauri desktop sidecar + Android plugin transports)
 *
 * A runtime only has to do three things: spawn yt-dlp with `buildArgs(...)`, feed every
 * stdout/stderr line to `tracker.feed(line)`, and call `tracker.finish(exitCode)`.
 */

export const err = (status, message) => Object.assign(new Error(message), { status })
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null }

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i

/** Validate + normalise a user URL. `allowPrivate` is true on the user's own device. */
export function normalizeUrl(raw, allowPrivate = false) {
  if (typeof raw !== 'string' || raw.length > 2048) throw err(400, 'Invalid URL')
  let u
  try { u = new URL(raw.trim()) } catch { throw err(400, 'That does not look like a valid URL') }
  if (!/^https?:$/.test(u.protocol)) throw err(400, 'Only http(s) URLs are supported')
  if (!allowPrivate && PRIVATE_HOST.test(u.hostname)) throw err(400, 'Private / local addresses are blocked on this engine')
  return u.toString()
}

export function cleanErr(s) {
  const line = String(s).split('\n').filter((l) => /^ERROR/i.test(l.trim())).pop() || String(s).trim().split('\n').pop() || ''
  return line.replace(/^ERROR:\s*/i, '').replace(/\s*\(caused by .*$/i, '').replace(/; please report this issue.*$/i, '').slice(0, 320)
}

export const infoArgs = (url, playlist) => ['-J', '--no-warnings', '--no-colors', playlist ? '--flat-playlist' : '--no-playlist', '--', url]

/* ------------------------------ info → UI model ------------------------------ */

export function summarise(j) {
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
  return {
    kind: 'video', id: j.id, title: j.title, uploader: j.uploader || j.channel || j.creator, duration: j.duration || null,
    thumbnail: j.thumbnail, extractor: j.extractor_key || j.extractor, webpageUrl: j.webpage_url,
    uploadDate: j.upload_date, views: j.view_count, likes: j.like_count, isLive: !!j.is_live,
    description: (j.description || '').slice(0, 500), chapters: (j.chapters || []).length,
    heights, needsMerge: !hasMuxedOnly && video.some((f) => !f.acodec || f.acodec === 'none'),
    hasVideo: video.length > 0, hasAudio: audio.length > 0 || video.some((f) => f.acodec && f.acodec !== 'none'),
    audioKbps: bestAudio?.abr ? Math.round(bestAudio.abr) : null,
    audioBytes: size(bestAudio), subtitles: Object.keys(j.subtitles || {}).slice(0, 40), autoSubs: Object.keys(j.automatic_captions || {}).length,
    formatCount: formats.length,
  }
}

/* ------------------------------ download argv ------------------------------ */

/**
 * @param o        validated-by-whitelist options from the UI
 * @param ctx      { ffmpeg?: string, outTemplate: string (full path w/ %(…)s), tempDir: string }
 * Never involves a shell: callers pass the returned array straight to spawn / Command.
 */
export function buildArgs(o, ctx) {
  const args = ['--no-playlist', '--no-warnings', '--newline', '--no-colors', '--progress', '--no-mtime', '--restrict-filenames',
    '--progress-template', 'download:TTT|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
    '--print', 'after_move:TTTFILE|%(filepath)s', '--no-simulate',
    '-o', ctx.outTemplate, '--paths', 'temp:' + ctx.tempDir]
  if (ctx.ffmpeg) args.push('--ffmpeg-location', ctx.ffmpeg)

  if (o.mode === 'audio') {
    const af = ['best', 'mp3', 'm4a', 'opus', 'flac', 'wav', 'aac'].includes(o.audioFormat) ? o.audioFormat : 'best'
    args.push('-f', 'ba/b', '-x', '--audio-format', af, '--audio-quality', '0')
  } else {
    const h = num(o.height, 100, 4320)
    const c = ['mp4', 'mkv', 'webm'].includes(o.container) ? o.container : 'mp4'
    const hf = h ? `[height<=${h}]` : ''
    // Prefer codecs that already fit the container → stream copy, never re-encode.
    const sel = c === 'mp4' ? `bv*${hf}[ext=mp4]+ba[ext=m4a]/bv*${hf}+ba/b${hf}/b`
      : c === 'webm' ? `bv*${hf}[ext=webm]+ba[ext=webm]/bv*${hf}+ba/b${hf}/b`
        : `bv*${hf}+ba/b${hf}/b`
    args.push('-f', sel, '--merge-output-format', c, '--remux-video', c) // remux = container swap only
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

/* ------------------------------ progress tracker ------------------------------ */

export class JobTracker {
  constructor(id, parts = 1) {
    this.s = {
      id, state: 'running', stage: 'fetching', percent: null, downloaded: 0, total: 0, speed: 0, eta: null,
      part: 1, parts: Math.round(num(parts, 1, 3) || 1), file: null, size: 0, error: null, elapsed: 0,
    }
    this.t0 = Date.now()
    this.log = []
    this._part = 0
    this.cancelled = false
  }

  feed(chunk) {
    this._buf = (this._buf || '') + chunk
    const lines = this._buf.split(/\r?\n/)
    this._buf = lines.pop()
    lines.forEach((l) => this._line(l))
  }

  _line(line) {
    if (!line) return
    const s = this.s
    this.log.push(line); if (this.log.length > 60) this.log.shift()
    if (line.startsWith('TTTFILE|')) { s.file = line.slice(8).trim(); return }
    if (line.startsWith('TTT|')) {
      const [, dl, tot, est, spd, eta] = line.split('|')
      const d = +dl || 0, t = +tot || +est || 0
      s.downloaded = d; s.total = t; s.speed = +spd || 0
      s.eta = Number.isFinite(+eta) && eta !== 'NA' ? +eta : null
      if (t > 0) s.percent = Math.min(99, ((this._part + Math.min(1, d / t)) / s.parts) * 100)
      s.stage = 'downloading'
    } else if (/^\[download\] Destination:/.test(line)) {
      if (s.stage === 'downloading') this._part = Math.min(s.parts - 1, this._part + 1)
      s.part = this._part + 1
    } else if (/^\[(Merger|ExtractAudio|VideoConvertor|EmbedSubtitle|Metadata|ModifyChapters|FixupM4a|FixupM3u8|VideoRemuxer)\]/.test(line)) {
      s.stage = /Merger/.test(line) ? 'merging' : /ExtractAudio|VideoConvertor|VideoRemuxer/.test(line) ? 'converting' : 'finishing'
      s.percent = 99
    }
  }

  /** Call when the process exits. `sizeOf(path)` is optional (runtime-specific file size lookup). */
  async finish(code, sizeOf) {
    if (this._buf) this._line(this._buf)
    const s = this.s
    if (this.cancelled) { s.state = 'cancelled'; return }
    if (code !== 0) {
      s.state = 'error'
      s.error = cleanErr(this.log.filter((l) => /ERROR/.test(l)).join('\n') || this.log.join('\n')) || 'Download failed'
    } else if (!s.file) {
      s.state = 'error'; s.error = 'No output file was produced'
    } else {
      s.state = 'done'; s.stage = 'ready'; s.percent = 100
      try { s.size = (await sizeOf?.(s.file)) || 0 } catch { /* size is cosmetic */ }
    }
    this.s.elapsed = (Date.now() - this.t0) / 1000
  }

  snapshot() { if (this.s.state === 'running') this.s.elapsed = (Date.now() - this.t0) / 1000; return { ...this.s } }
}

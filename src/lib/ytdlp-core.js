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

/* ------------------------------ container maths ------------------------------ */

/**
 * Codec compatibility with the container we promise the user. A file is only "MP4-safe" when BOTH
 * streams were born MP4-compatible — otherwise yt-dlp would either refuse or remux-re-encode, so we
 * say so up front and save MKV instead (still lossless, still no re-encode).
 */
const V_CODEC = (c) => String(c || '').split('.')[0].toLowerCase()
export const MP4_VIDEO = /^(avc1|avc3|h264|hev1|hvc1|h265|hevc)$/
export const MP4_AUDIO = /^(mp4a|aac|mp3|ac-3|ec-3)$/
export const WEBM_VIDEO = /^(vp8|vp9|vp09|av1|av01)$/
export const WEBM_AUDIO = /^(opus|vorbis|vp9|opus)$/
export const isMp4Video = (c) => MP4_VIDEO.test(V_CODEC(c))
export const isMp4Audio = (c) => MP4_AUDIO.test(V_CODEC(c))
export const isWebmVideo = (c) => WEBM_VIDEO.test(V_CODEC(c))
export const isWebmAudio = (c) => WEBM_AUDIO.test(V_CODEC(c))

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
  const bestMp4Audio = audio.slice().sort((a, b) => (b.abr || 0) - (a.abr || 0)).find((f) => isMp4Audio(f.acodec))
  const bestWebmAudio = audio.find((f) => isWebmAudio(f.acodec))
  const byH = new Map()
  for (const f of video) {
    const cur = byH.get(f.height)
    if (!cur || (f.tbr || 0) > (cur.tbr || 0)) byH.set(f.height, f)
  }
  const hasMuxedOnly = video.length > 0 && audio.length === 0
  const heights = [...byH.entries()].sort((a, b) => b[0] - a[0]).map(([h, f]) => {
    const muxed = f.acodec && f.acodec !== 'none'
    return {
      height: h, fps: f.fps || null, vcodec: (f.vcodec || '').split('.')[0], ext: f.ext,
      bytes: size(f) ? size(f) + (hasMuxedOnly || muxed ? 0 : size(bestAudio)) : 0,
      // Can this exact quality be written to an .mp4 without re-encoding or dropping the audio?
      mp4: isMp4Video(f.vcodec) && (muxed ? isMp4Audio(f.acodec) : !!bestMp4Audio),
      webm: isWebmVideo(f.vcodec) && (muxed ? isWebmAudio(f.acodec) : !!bestWebmAudio),
    }
  })
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

/**
 * Which container will *actually* come out of yt-dlp, and why.
 * Never claims a container the codecs can't reach losslessly.
 * @returns {{ container: 'mp4'|'mkv'|'webm'|null, requested: string, fallback: boolean, reason: string }}
 */
export function containerPlan(info, height, requested = 'auto') {
  const req = ['auto', 'mp4', 'mkv', 'webm'].includes(requested) ? requested : 'auto'
  const h = num(height, 100, 4320)
  const heights = info?.heights || []
  // yt-dlp's `height<=H` selector falls back to the best stream when H is unavailable — plan for the
  // quality that will really be downloaded, never for a quality that doesn't exist.
  const pick = (h && heights.find((x) => x.height === h)) || heights[0]
  const usable = pick || {}
  if (req === 'mkv') return { container: 'mkv', requested: req, fallback: false, reason: 'MKV holds any codec without re-encoding.' }
  if (req === 'webm') {
    return usable.webm
      ? { container: 'webm', requested: req, fallback: false, reason: 'VP8/VP9/AV1 + Opus — natively WebM.' }
      : { container: 'mkv', requested: req, fallback: true, reason: 'This quality has no WebM-native pair, so it is saved as MKV.' }
  }
  if (req === 'mp4') {
    return usable.mp4
      ? { container: 'mp4', requested: req, fallback: false, reason: 'H.264/HEVC/AV1 video with AAC/MP3 audio — MP4-native.' }
      : { container: 'mkv', requested: req, fallback: true, reason: usable.vcodec ? `This quality is ${usable.vcodec} + ${usable.ext || 'source'} audio; putting that in MP4 would need a re-encode, so it is saved as MKV (identical bytes).` : 'No MP4-compatible pair at this quality — MKV keeps it lossless.' }
  }
  const auto = usable.mp4 ? 'mp4' : 'mkv'
  return { container: auto, requested: 'auto', fallback: false, reason: auto === 'mp4' ? 'Automatic: this quality is MP4-compatible.' : 'Automatic: MKV (keeps the original codecs bit-for-bit).' }
}

/* ------------------------------ download argv ------------------------------ */

/**
 * @param o        validated-by-whitelist options from the UI
 *                 { mode, audioFormat, height, container, clip, start, end, accurateCuts, metadata, subs, url, parts }
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
    const c = ['mp4', 'mkv', 'webm'].includes(o.container) ? o.container : 'auto'
    const hf = h ? `[height<=${h}]` : ''
    // Codec-aware selectors: every branch asks for a pair that fits the container WITHOUT re-encoding.
    // The last branch is the honest fallback — whatever the site actually has.
    const sel = c === 'mp4'
      ? `bv*${hf}[ext=mp4][vcodec~='^(avc|hev|hvc)']+ba[ext=m4a]/bv*${hf}[ext=mp4][vcodec~='^(avc|hev|hvc)']+ba[acodec~='^(mp4a|aac|mp3)']/bv*${hf}[ext=mp4]+ba[ext=m4a]/bv*${hf}+ba/b${hf}/b`
      : c === 'webm'
        ? `bv*${hf}[ext=webm][vcodec~='^(vp8|vp9|vp09|av01|av1)']+ba[ext=webm]/bv*${hf}[ext=webm]+ba/b${hf}/b`
        : c === 'mkv'
          ? `bv*${hf}+ba/b${hf}/b`
          : `bv*${hf}[ext=mp4][vcodec~='^(avc|hev|hvc)']+ba[ext=m4a]/bv*${hf}+ba/b${hf}/b` // auto — prefer MP4-native, else anything
    args.push('-f', sel)
    // NOTE: no --remux-video here on purpose. Remuxing a fallback pair into the "wrong" container can drop
    // an audio stream; --merge-output-format is the safe, codec-respecting container switch.
    if (c !== 'auto') args.push('--merge-output-format', c)
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
  constructor(id, parts = 1, requested = {}) {
    this.s = {
      id, state: 'running', stage: 'fetching', percent: null, downloaded: 0, total: 0, speed: 0, eta: null,
      part: 1, parts: Math.round(num(parts, 1, 3) || 1), file: null, name: null, ext: null,
      requested: requested.container || (requested.mode === 'audio' ? (requested.audioFormat === 'best' ? 'best' : requested.audioFormat) : 'auto'),
      fellBack: false, size: 0, error: null, elapsed: 0,
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
    if (line.startsWith('TTTFILE|')) {
      s.file = line.slice(8).trim()
      const base = s.file.split(/[\\/]/).pop() || ''
      const dot = base.lastIndexOf('.')
      s.name = base
      s.ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : null
      // The container the user asked for vs the one the codecs allow (yt-dlp tells us the real file).
      const audio = ['mp3', 'm4a', 'opus', 'flac', 'wav', 'aac']
      if (!audio.includes(s.ext)) s.fellBack = !!s.requested && s.requested !== 'auto' && s.requested !== s.ext
      return
    }
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
    } else if (/^\[(Merger|ExtractAudio|VideoConvertor|EmbedSubtitle|Metadata|ModifyChapters|FixupM4a|FixupM3u8|VideoRemuxer)\]/) {
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

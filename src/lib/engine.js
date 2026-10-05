/**
 * Download-engine abstraction for Tool 04.
 *
 *   web (browser)      → HTTP transport  → companion engine (dev server / self-hosted)
 *   Windows / desktop  → Tauri sidecar   → yt-dlp.exe + ffmpeg.exe bundled INSIDE the installer
 *   Android            → native plugin   → yt-dlp (+Python +ffmpeg) bundled INSIDE the APK
 *
 * The UI only ever talks to `engine`. Native transports share ONE generic implementation
 * (`nativeEngine`) that needs just a tiny "runner": spawn yt-dlp, stream its lines, kill it.
 */
import { normalizeUrl, summarise, buildArgs, infoArgs, JobTracker, err } from './ytdlp-core.js'

/* ====================================== HTTP ====================================== */

const BASE_KEY = 'ttt.engine.base'
const DEFAULT_BASE = '/api/ytdlp'
export const getBase = () => {
  try { return (localStorage.getItem(BASE_KEY) || DEFAULT_BASE).trim().replace(/\/+$/, '') || DEFAULT_BASE }
  catch { return DEFAULT_BASE }
}
export const setBase = (v) => {
  const base = String(v || '').trim().replace(/\/+$/, '') || DEFAULT_BASE
  try { localStorage.setItem(BASE_KEY, base) } catch { /* restricted storage; same-session request still uses the default */ }
  return base
}

async function http(path, opts = {}) {
  const { timeoutMs = 90000, ...fetchOpts } = opts
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(getBase() + path, {
      ...fetchOpts,
      signal: fetchOpts.signal || controller.signal,
      headers: fetchOpts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: fetchOpts.body ? JSON.stringify(fetchOpts.body) : undefined,
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* static SPA fallback HTML → no companion engine */ }
    if (!json) throw Object.assign(new Error('Engine response was not JSON. Check the engine address and its /api/ytdlp route.'), { offline: true })
    if (!res.ok) throw new Error(json.error || `Engine error ${res.status}`)
    return json
  } catch (e) {
    if (e.offline) throw e
    if (e.name === 'AbortError') throw Object.assign(new Error('The downloader engine did not respond in time. Check that it is running.'), { offline: true })
    if (e instanceof TypeError) throw Object.assign(new Error('Could not reach the downloader engine. Check its address, network and CORS settings.'), { offline: true })
    throw e
  } finally { clearTimeout(timeout) }
}

const httpEngine = {
  kind: 'http',
  bundled: false, // user must run / point at an engine
  health: () => http('/health', { timeoutMs: 8000 }),
  info: (url, playlist) => http('/info', { method: 'POST', body: { url, playlist } }),
  start: (opts) => http('/jobs', { method: 'POST', body: opts }),
  status: (id) => http(`/jobs/${id}`),
  cancel: (id) => http(`/jobs/${id}`, { method: 'DELETE' }).catch(() => {}),
  /** Hand the finished file to the browser's download manager (streamed, no memory copy). */
  async save(id) {
    const a = document.createElement('a')
    a.href = `${getBase()}/jobs/${id}/file`; a.download = ''
    document.body.appendChild(a); a.click(); a.remove()
    return null
  },
}

/* ====================================== native (generic) ====================================== */

/**
 * runner contract (implemented per platform):
 *   version(): Promise<string|null>          yt-dlp version
 *   hasFfmpeg(): Promise<boolean>
 *   spawn(args, onChunk): { done: Promise<number>, kill(): void }   stream stdout+stderr text chunks
 *   downloadsDir(): Promise<string>           where finished files go
 *   sizeOf(path): Promise<number>
 *   reveal?(path): Promise<void>              show the file to the user (optional)
 */
export function nativeEngine(runner, kind) {
  const jobs = new Map()
  const collect = async (args) => {
    let out = '', errOut = ''
    const p = runner.spawn(args, (c, isErr) => { if (isErr) errOut += c; else out += c })
    const code = await p.done
    if (code !== 0) throw err(422, (errOut.split('\n').filter((l) => /ERROR/.test(l)).pop() || 'yt-dlp could not read that link').replace(/^ERROR:\s*/, ''))
    return JSON.parse(out)
  }
  return {
    kind,
    bundled: true,
    async health() {
      const v = await runner.version()
      return { ok: !!v, ytdlp: v, ffmpeg: await runner.hasFfmpeg(), extractors: null, running: [...jobs.values()].filter((j) => j.t.s.state === 'running').length }
    },
    async info(url, playlist) {
      const u = normalizeUrl(url, true) // it is the user's own device — local URLs are fine
      return { ...summarise(await collect(infoArgs(u, playlist))), sourceUrl: u }
    },
    async start(o) {
      o.url = normalizeUrl(o.url, true)
      const id = Math.random().toString(16).slice(2, 18).padEnd(16, '0')
      const dir = await runner.downloadsDir()
      const t = new JobTracker(id, o.parts)
      const argv = buildArgs(o, { outTemplate: `${dir}/%(title).120B [%(id)s].%(ext)s`, tempDir: `${dir}/.tmp` })
      const p = runner.spawn(argv, (c) => t.feed(c))
      jobs.set(id, { t, p })
      p.done.then((code) => t.finish(code, runner.sizeOf), () => t.finish(1))
      return t.snapshot()
    },
    async status(id) { const j = jobs.get(id); if (!j) throw err(404, 'Job not found'); return j.t.snapshot() },
    async cancel(id) { const j = jobs.get(id); if (j) { j.t.cancelled = true; j.p.kill(); jobs.delete(id) } },
    async save(id) {
      const j = jobs.get(id); const f = j?.t.s.file
      if (f) await runner.reveal?.(f)
      return f ? `Saved to ${f}` : null
    },
  }
}

/* ---------- Windows / macOS / Linux desktop: Tauri 2 sidecars (yt-dlp + ffmpeg inside the installer) ---------- */

// Specifiers are variables so Vite doesn't try to resolve Tauri packages in the plain-web build.
// Inside the shipped app there is no bundler for bare imports, so use the globals Tauri injects
// (`app.withGlobalTauri: true` in tauri.conf.json): __TAURI__.shell / .fs / .path / .opener.
const TAURI_GLOBAL = { '@tauri-apps/plugin-shell': 'shell', '@tauri-apps/plugin-fs': 'fs', '@tauri-apps/api/path': 'path', '@tauri-apps/plugin-opener': 'opener' }
const tauriImport = async (m) => {
  const g = window.__TAURI__?.[TAURI_GLOBAL[m]]
  if (g) return g
  return import(/* @vite-ignore */ m)
}

function tauriRunner() {
  const sidecar = async (name, args) => {
    const { Command } = await tauriImport('@tauri-apps/plugin-shell')
    return Command.sidecar(`binaries/${name}`, args)
  }
  return {
    async version() { try { const r = await (await sidecar('yt-dlp', ['--version'])).execute(); return r.code === 0 ? r.stdout.trim() : null } catch { return null } },
    async hasFfmpeg() { try { return (await (await sidecar('ffmpeg', ['-version'])).execute()).code === 0 } catch { return false } },
    spawn(args, onChunk) {
      let child = null
      const done = (async () => {
        const cmd = await sidecar('yt-dlp', args)
        cmd.stdout.on('data', (c) => onChunk(c + '\n', false))
        cmd.stderr.on('data', (c) => onChunk(c + '\n', true))
        return new Promise((resolve, reject) => {
          cmd.on('close', (e) => resolve(e.code ?? 1))
          cmd.on('error', reject)
          cmd.spawn().then((c) => { child = c }, reject)
        })
      })()
      return { done, kill: () => child?.kill() }
    },
    async downloadsDir() {
      const { downloadDir, join } = await tauriImport('@tauri-apps/api/path')
      const { mkdir } = await tauriImport('@tauri-apps/plugin-fs')
      const dir = await join(await downloadDir(), 'TheToolTable')
      await mkdir(dir, { recursive: true }).catch(() => {})
      return dir.replace(/\\/g, '/')
    },
    async sizeOf(p) { const { stat } = await tauriImport('@tauri-apps/plugin-fs'); return (await stat(p)).size },
    async reveal(p) { try { const { revealItemInDir } = await tauriImport('@tauri-apps/plugin-opener'); await revealItemInDir(p) } catch { /* optional */ } },
  }
}

/* ====================================== selection ====================================== */

export function selectEngine({ tauri = false, android = false, androidRunner, desktopRunner = tauriRunner } = {}) {
  if (android && androidRunner) return nativeEngine(androidRunner, 'android')
  // Android builds do not bundle the desktop sidecars. Use the configurable HTTP companion
  // instead of reporting a nonexistent yt-dlp binary as a built-in engine.
  if (tauri && !android) return nativeEngine(desktopRunner(), 'desktop')
  return httpEngine
}

const isTauri = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__)
const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
export const isAndroidPlatform = /android/i.test(userAgent)
export const isAndroidTauri = isTauri && (isAndroidPlatform || !!window.__TTT_ANDROID_RUNNER__)

export const engine = selectEngine({
  tauri: isTauri,
  android: isAndroidTauri,
  androidRunner: isAndroidTauri ? window.__TTT_ANDROID_RUNNER__ : undefined,
})

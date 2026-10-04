/**
 * Performance profile — one place that decides how hard the app should work on this device.
 *
 *   mode  : 'auto' (default) | 'lite' | 'balanced' | 'full'   (user choice, remembered)
 *   level : the profile actually applied: 'lite' | 'balanced' | 'full'
 *
 * Auto looks at CPU cores, memory (where the browser reveals it), Data-Saver, touch-phone form factor and a
 * 40 ms micro-benchmark. Everything else (CSS effects, WebGL resolution, frame caps, export warnings, worker
 * threads) just asks this module — so a low-end laptop and a high-end one run the same app, tuned differently.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'ttt.perf.mode', BENCH = 'ttt.perf.bench'
const LEVELS = ['lite', 'balanced', 'full']
const TIER_LEVEL = { low: 'lite', mid: 'balanced', high: 'full' }
const nav = typeof navigator !== 'undefined' ? navigator : {}
const store = (k, v) => { try { v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v) } catch {} }
const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }

let mode = read(KEY) || 'auto'
if (mode !== 'auto' && !LEVELS.includes(mode)) mode = 'auto'
let benchMs = Number(read(BENCH)) || 0
const subs = new Set()
let snap = null

export function hardware() {
  const cores = nav.hardwareConcurrency || 4
  const mem = nav.deviceMemory || 0 // Chromium only (capped at 8)
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  const phone = coarse && typeof innerWidth !== 'undefined' && Math.min(innerWidth, innerHeight || innerWidth) < 820
  const saveData = !!(nav.connection && nav.connection.saveData)
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  return { cores, mem, phone, saveData, reduced }
}

export function tierOf(hw = hardware(), ms = benchMs) {
  let s = 0
  if (hw.cores <= 2) s += 3; else if (hw.cores <= 4) s += 2; else if (hw.cores <= 6) s += 1
  if (hw.mem) { if (hw.mem <= 2) s += 3; else if (hw.mem <= 4) s += 2 }
  if (hw.phone) s += 1
  if (hw.saveData) s += 2
  if (ms) { if (ms > 70) s += 2; else if (ms > 35) s += 1 }
  return s >= 4 ? 'low' : s >= 2 ? 'mid' : 'high'
}

function compute() {
  const hw = hardware(), tier = tierOf(hw)
  const level = mode === 'auto' ? TIER_LEVEL[tier] : mode
  return { mode, level, tier, hw, bench: benchMs }
}
function emit() {
  snap = compute()
  if (typeof document !== 'undefined') document.documentElement.dataset.perf = snap.level
  subs.forEach((f) => f())
}
snap = compute()

export const getPerf = () => snap
export function setPerfMode(m) { mode = m; store(KEY, m); emit() }
export function usePerf() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, getPerf, getPerf) }

/* ---- knobs the tools read ---- */
const pick = (l, lite, bal, full) => (l === 'lite' ? lite : l === 'balanced' ? bal : full)
export const perf = {
  get level() { return snap.level },
  get lite() { return snap.level === 'lite' },
  /** device-pixel-ratio ceiling for live canvases */
  dpr: (max = 2) => Math.min(max, pick(snap.level, 1, 1.5, 2), (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1),
  /** multiplier on live-preview resolution */
  scale: () => pick(snap.level, 0.6, 0.85, 1),
  /** frame-rate ceiling for ambient / preview animation loops */
  fps: () => pick(snap.level, 24, 40, 75),
  /** worker threads for wasm (only matters when the page is cross-origin isolated) */
  threads: () => { const c = (nav.hardwareConcurrency || 2); return Math.max(1, Math.min(pick(snap.level, 2, 3, 4), Math.floor(c / 2) || 1)) },
  /** soft ceiling (megapixels) for a single exported canvas before we warn */
  maxMP: () => pick(snap.level, 16, 40, 140),
  /** how many files a batch runs at once */
  parallel: () => pick(snap.level, 1, 2, 3),
}

/** tiny canvas+JS workload; the result only nudges the auto tier, never overrides an explicit choice */
export function runBenchmark(force = false) {
  if (typeof document === 'undefined' || (benchMs && !force)) return
  const go = () => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 384
      const g = c.getContext('2d'), t0 = performance.now()
      for (let i = 0; i < 60; i++) { const r = g.createRadialGradient(192, 192, 4, 192 + i, 192, 190); r.addColorStop(0, '#fff'); r.addColorStop(1, `hsl(${i * 6},70%,50%)`); g.fillStyle = r; g.fillRect(0, 0, 384, 384) }
      g.getImageData(0, 0, 384, 384)
      let x = 0; for (let i = 0; i < 4e6; i++) x += Math.sqrt(i) % 3
      benchMs = Math.max(1, Math.round(performance.now() - t0 + (x < 0 ? 1 : 0)))
      store(BENCH, String(benchMs)); emit()
    } catch {}
  }
  ;(window.requestIdleCallback || ((f) => setTimeout(f, 1800)))(go, { timeout: 4000 })
}

if (typeof document !== 'undefined') document.documentElement.dataset.perf = snap.level

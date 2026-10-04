/* Shared browser-harness launcher.
   Puppeteer is intentionally NOT a dependency of the app (it would bloat the shipped bundle), so it is
   resolved from the app's own node_modules when present and otherwise from TTT_HARNESS_MODULES
   (default: /home/user/browsertest/node_modules, the sandbox test rig). */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const FALLBACK = process.env.TTT_HARNESS_MODULES || '/home/user/browsertest/node_modules'

/* The headless Chromium build targets Amazon Linux; scripts/harness/setup.mjs unpacks the handful of
   shared libraries it needs next to the harness deps. Hand them to the browser process explicitly so
   no shell setup is required. */
const libDir = [
  process.env.TTT_CHROMIUM_LIBS,
  join(FALLBACK, '..', 'lib'),
  '/home/user/browsertest/lib',
  '/tmp/al2023x/lib',
].filter(Boolean).find((d) => existsSync(join(d, 'libnss3.so')))

function loadOne(name) {
  const tries = [createRequire(import.meta.url), createRequire(join(FALLBACK, 'noop.js'))]
  let last
  for (const req of tries) {
    try { return req(name) } catch (e) { last = e }
  }
  throw last
}
const unwrap = (m) => (m && typeof m === 'object' && !m.executablePath && m.default ? m.default : m)
const puppeteer = unwrap(loadOne('puppeteer-core'))
const chromium = unwrap(loadOne('@sparticuz/chromium'))

export const URL_BASE = process.env.TTT_URL || 'http://localhost:5173'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Poll until fn() is truthy in the page (or give up). Returns the value. */
export async function until(page, fn, { timeout = 30000, step = 250, label = 'condition' } = {}) {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = await page.evaluate(fn) } catch { /* page busy navigating */ }
    if (v) return v
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${label}`)
    await sleep(step)
  }
}

export async function launch() {
  const executablePath = await chromium.executablePath()
  return puppeteer.launch({
    executablePath,
    headless: 'shell',
    env: libDir ? { ...process.env, LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } : process.env,
    args: [...chromium.args, '--no-sandbox', '--disable-accelerated-2d-canvas', '--autoplay-policy=no-user-gesture-required'],
    defaultViewport: { width: 1280, height: 900 },
    protocolTimeout: 240000, // animated tools (WebGL/canvas loops) can stall a screenshot
  })
}

/** A page wired to collect console errors / page errors / failed requests. */
export async function newPage(browser, { url = URL_BASE, clearStorage = true, vw = 1280, vh = 900 } = {}) {
  const p = await browser.newPage()
  await p.setViewport({ width: vw, height: vh })
  p.logs = []
  const push = (s) => p.logs.push(s.slice(0, 400))
  p.on('console', (m) => { if (m.type() === 'error') push('[console.error] ' + m.text()) })
  p.on('pageerror', (e) => push('[pageerror] ' + e.message))
  p.on('requestfailed', (r) => {
    const u = r.url()
    if (!u.startsWith('data:') && !u.startsWith('blob:')) push('[requestfailed] ' + u.slice(0, 160) + ' :: ' + (r.failure()?.errorText || ''))
  })
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await until(p, () => document.querySelectorAll('.card3d').length > 0, { label: 'home screen' })
  if (clearStorage) { await p.evaluate(() => localStorage.clear()) ; await p.reload({ waitUntil: 'domcontentloaded' }) ; await until(p, () => document.querySelectorAll('.card3d').length > 0, { label: 'home screen after clear' }) }
  return p
}

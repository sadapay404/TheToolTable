/* Small helpers shared by smoke.mjs and e2e.mjs. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { URL_BASE, sleep, until } from './lib.mjs'

export const SHOTS = process.env.TTT_SHOTS || '/tmp/shots'
mkdirSync(SHOTS, { recursive: true })

export { sleep, until, URL_BASE }
/** Screenshot that never fails the run — an animated tool can time out the compositor. */
export const shot = async (p, name, full = false) => {
  try { await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); return true } catch { return false }
}

/** Click the first element whose text starts with `t` (defaults to any clickable tag). */
export async function clickText(p, t, sel = 'button, a, [role="button"]') {
  const ok = await p.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().startsWith(t))
    if (!el) return false
    el.scrollIntoView({ block: 'center' })
    el.click()
    return true
  }, t, sel)
  if (!ok) throw new Error(`no clickable element starting with “${t}”`)
  return ok
}

/** Open a tool from the home table by its card title. */
export async function openTool(p, name) {
  const ok = await p.evaluate((n) => {
    const card = [...document.querySelectorAll('.card3d')].find((x) => x.textContent.includes(n))
    if (!card) return false
    card.scrollIntoView({ block: 'center' })
    card.click()
    return true
  }, name)
  if (!ok) throw new Error(`no tool card matching “${name}”`)
  await sleep(1200)
  await until(p, () => !document.querySelector('.card3d') || !!document.querySelector('main'), { timeout: 10000, label: 'tool view' }).catch(() => {})
  // Wait for the lazy chunk AND its Suspense fallback to give way: a big tool (onnxruntime, ffmpeg)
  // can still be a bare spinner here, which used to look like "0 controls" to the smoke test.
  await until(p, () => {
    if (document.querySelector('.py-24.grid')) return false // the tool loader
    const main = document.querySelector('main')
    return !!main && main.querySelectorAll('button, input, canvas, select').length >= 2
  }, { timeout: 60000, step: 200, label: 'tool controls' }).catch(() => {})
  await sleep(600)
}

/** Back to the table (idempotent). The back button is the only button whose *exact* text is “The table”. */
export async function goHome(p) {
  // Close any modal/palette first — it would swallow the click.
  await p.keyboard.press('Escape').catch(() => {})
  await sleep(250)
  const clicked = await p.evaluate(() => {
    // Desktop shows a text button; on phones the same control is the icon-only “Back to the table”.
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'The table' || x.getAttribute('aria-label') === 'Back to the table')
    if (!b) return false
    b.scrollIntoView({ block: 'center' }); b.click(); return true
  })
  if (!clicked) await p.evaluate(() => { window.scrollTo(0, 0) })
  await sleep(700)
  await until(p, () => document.querySelectorAll('.card3d').length > 0, { timeout: 15000, label: 'back on the table' })
}

/** True when the tool panel rendered its crash/error boundary instead of content. */
export const crashed = (p) => p.evaluate(() => !!document.querySelector('.card.p-8.my-10'))

/** Upload a file from disk into the first file input of the current view. */
export async function upload(p, path) {
  const input = await p.$('input[type=file]')
  if (!input) throw new Error('no file input in this view')
  await input.uploadFile(path)
  await sleep(400)
}

/** Upload several files into the first file input (tools accept batches). */
export async function uploadMany(p, paths, index = 0) {
  const inputs = await p.$$('input[type=file]')
  if (!inputs.length) throw new Error('no file input in this view')
  await (inputs[index] || inputs[0]).uploadFile(...paths)
  await sleep(500)
}

/** Send every download of this page into `dir` (cleared first) via CDP. */
export async function downloadDir(p, dir, { clear = true } = {}) {
  if (clear) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const client = await p.createCDPSession()
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true }).catch(() => {})
  return client
}

/** Copy a Blob out of the page and write it to disk (used to build real sample media). */
export async function savePageBlob(p, makeBlob, outPath) {
  const b64 = await p.evaluate(async (src) => {
    // eslint-disable-next-line no-new-func
    const blob = await new Function(`return (${src})()`)()
    const buf = await blob.arrayBuffer()
    let s = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }, makeBlob.toString())
  writeFileSync(outPath, Buffer.from(b64, 'base64'))
  return outPath
}

/** Build a real WebM clip in the page (canvas → MediaRecorder) and save it to disk. */
export async function makeSampleVideo(p, outPath, { seconds = 2.5, w = 320, h = 240, fps = 25 } = {}) {
  const rec = await p.evaluate(async ({ seconds, w, h, fps }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')
    const stream = c.captureStream(fps)
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => window.MediaRecorder?.isTypeSupported?.(m))
    if (!mime) return { error: 'this browser cannot record webm' }
    const r = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 700000 })
    const chunks = []
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise((res) => { r.onstop = res })
    r.start(100)
    const t0 = performance.now()
    await new Promise((res) => {
      const timer = setInterval(() => {
        const t = (performance.now() - t0) / 1000
        ctx.fillStyle = `hsl(${Math.round((t * 120) % 360)} 80% 45%)`; ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#fff'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(t.toFixed(1) + 's', 14, 44)
        ctx.fillStyle = '#000'; ctx.fillRect((t * 110) % (w - 48), h - 44, 48, 28)
        if (t >= seconds) { clearInterval(timer); res() }
      }, 1000 / fps)
    })
    r.stop(); await stopped
    stream.getTracks().forEach((t) => t.stop())
    const blob = new Blob(chunks, { type: mime })
    self.__sample = blob
    return { size: blob.size, mime }
  }, { seconds, w, h, fps })
  if (rec.error || !rec.size) throw new Error('sample video not recorded: ' + JSON.stringify(rec))
  await savePageBlob(p, () => self.__sample, outPath)
  return { path: outPath, ...rec }
}

/** A tiny PNG built by the page's own canvas (kept in memory for drop-style uploads). */
export const pngBlobScript = `async () => {
  const c = document.createElement('canvas'); c.width = 8; c.height = 8
  const x = c.getContext('2d'); x.fillStyle = '#c0ffee'; x.fillRect(0, 0, 8, 8); x.fillStyle = '#000'; x.fillRect(0, 0, 4, 4)
  return new Promise((r) => c.toBlob(r, 'image/png'))
}`

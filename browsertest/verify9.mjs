/**
 * Part 9 — functional sweep across all twenty tools.
 *
 * Runs the real app in a real browser: every tool is opened the way a user
 * opens it, checked for its chrome, its controls, its motion, its console and
 * its layout, and several are actually driven — a file is uploaded, a value is
 * typed, a result is read back.
 *
 * Run with the dev server up:  node browsertest/verify9.mjs
 */
import { launch, sleep } from './lib.mjs'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/home/user/part9-preview'
const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures')
fs.mkdirSync(OUT, { recursive: true })

const results = []
const record = (name, value, expected = true) => {
  const pass = expected instanceof RegExp ? expected.test(String(value)) : value === expected
  results.push({ name, value, pass })
  if (!pass) console.log(`FAIL  ${name} = ${JSON.stringify(value)}`)
}

/** Console noise the sandbox itself causes and no app can prevent. */
const IGNORABLE = /Failed to load resource: net::ERR_|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/
const watch = (page) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORABLE.test(m.text())) errors.push(m.text().slice(0, 200)) })
  return errors
}

const TOOLS = [
  ['metadata', 'Metadata Extractor'], ['converter', 'Any-to-Any Converter'],
  ['compressor', 'Target-Size Compressor'], ['clipper', 'Media Clipper & Downloader'],
  ['imagestudio', 'ImagePlayer Studio'], ['bgremover', 'AI Background Remover'],
  ['frames', 'Frame Extractor & Clipper'], ['visualizer', 'Audio Visualizer Video'],
  ['units', 'Currency, Unit & Time Converter'], ['decision', 'Decision & Randomizer Hub'],
  ['qr', 'QR Code Studio'], ['backgrounds', 'Background Canvas Studio'],
  ['pdf', 'PDF Studio'], ['ocr', 'Scan & OCR'], ['voice', 'Voice & Subtitle Studio'],
  ['invoice', 'Invoice & Receipt Studio'], ['beam', 'Beam'],
  ['icons', 'App Icon & Asset Forge'], ['pkmoney', 'Pakistan Money Kit'],
  ['textlab', 'Text & Writing Lab'],
]

/**
 * Open a tool the way a user does, then wait for it to actually be there.
 * A fixed sleep is the source of most flaky sweeps: it either wastes seconds on
 * twenty tools or gives up before a slow one has painted.
 */
/**
 * Open a tool, click once, then wait.
 *
 * Two things make the naive version lie: a tool's screen appears immediately
 * while its intro waits on a lazy chunk, and the collection is still animating
 * back in for a moment after leaving a tool. Re-clicking in a loop therefore
 * reports tools as broken when they are merely still loading.
 */
const openTool = async (page, id, budgetMs = 6000) => {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      screen: !!document.querySelector('.tool-screen'),
      home: !!document.querySelector('[data-tool-id]'),
    }))
    if (!state.home) { await sleep(150); continue }
    await page.evaluate((id) => {
      const card = document.querySelector(`[data-tool-id="${id}"]`)
      if (card) card.click()
    }, id)
    await sleep(400)
    if (await page.evaluate(() => !!document.querySelector('.tool-screen'))) break
    await sleep(300)
  }
  const introDeadline = Date.now() + 15000
  while (Date.now() < introDeadline) {
    if (await page.evaluate(() => !!document.querySelector('.tool-intro'))) { await sleep(450); return true }
    await sleep(150)
  }
  return false
}
const goHome = async (page) => {
  await page.evaluate(() => {
    const back = document.querySelector('.tool-screen-header button')
    if (back) back.click()
  })
  const deadline = Date.now() + 6000
  while (Date.now() < deadline) {
    const home = await page.evaluate(() => !document.querySelector('.tool-screen') && document.querySelectorAll('[data-tool-id]').length > 0)
    if (home) break
    await sleep(120)
  }
  await sleep(350)
}

/** Wait until the tool screen has gone (the app animates it out). */
const leftTool = async (page, budgetMs = 6000) => {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    if (!(await page.evaluate(() => !!document.querySelector('.tool-screen')))) return true
    await sleep(120)
  }
  return false
}

/**
 * Every tool remembers its last tab and options in localStorage. A sweep that
 * inherits those is testing yesterday's state, so each section starts clean.
 */
const openHome = async (page, { phone = true } = {}) => {
  if (phone) await page.setUserAgent(PHONE_UA)
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle2' })
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (await page.evaluate(() => document.querySelectorAll('[data-tool-id]').length === 20)) break
    await sleep(120)
  }
  await sleep(900)
}

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36'

const browser = await launch()
const PHONE = {
  ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
  viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

/* ============================================================ 1. every tool */
{
  const page = await browser.newPage()
  const errors = watch(page)
  await page.setViewport(PHONE.viewport)
  await openHome(page)
  record('the collection lists all twenty tools', await page.evaluate(() => document.querySelectorAll('[data-tool-id]').length), 20)

  const seen = []
  for (const [id, name] of TOOLS) {
    errors.length = 0
    await openTool(page, id, 2400)
    const info = await page.evaluate((name) => {
      const intro = document.querySelector('.tool-intro')
      const text = document.body.innerText
      return {
        onTool: !!document.querySelector('.tool-screen'),
        intro: !!intro,
        // "Target-Size Compressor" is rendered as "Target Size Compressor", so
        // compare on letters only rather than on the punctuation.
        names: (intro?.innerText || '').toLowerCase().replace(/[^a-z]/g, '')
          .includes(name.toLowerCase().replace(/[^a-z]/g, '').split(' ')[0]),
        controls: document.querySelectorAll('.tool-view button, .tool-view input:not([type=hidden]), .tool-view textarea, .tool-view select, .tool-view canvas').length,
        sections: document.querySelectorAll('.tool-view section, .tool-view [class*=section]').length,
        // Framer writes transforms inline; CSS loops and transitions are the
        // other half. A tool counts as moving if either is present.
        animating: [...document.querySelectorAll('.tool-view, .tool-view *')].some((n) => {
          const s = getComputedStyle(n)
          return (s.animationName !== 'none' && s.animationDuration !== '0s')
            || (s.transitionDuration !== '0s' && s.transitionProperty !== 'none')
            || (/matrix|translate/.test(s.transform) && s.transform !== 'none')
        }),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        errorText: /something went wrong|crash|unexpected error/i.test(text),
        toolHeight: document.querySelector('.tool-view')?.scrollHeight || 0,
      }
    }, name)
    seen.push({ id, name, ...info })
    await goHome(page)
  }

  for (const s of seen) {
    record(`${s.name}: opens`, s.onTool)
    record(`${s.name}: has the shared intro`, s.intro && s.names)
    record(`${s.name}: has controls to work with`, s.controls > 0)
    record(`${s.name}: is laid out, not empty`, s.toolHeight > 200)
    record(`${s.name}: nothing overflows sideways`, s.overflow, 0)
    record(`${s.name}: no crash screen`, s.errorText, false)
    record(`${s.name}: zero console errors`, errors.length, 0)
    record(`${s.name}: something is moving`, s.animating, true)
  }
  record('all twenty tools were opened', seen.filter((s) => s.onTool).length, TOOLS.length)
  await page.close()
}

/* ================================================ 2. tools actually compute */
{
  const page = await browser.newPage()
  const errors = watch(page)
  await page.setViewport(PHONE.viewport)
  await openHome(page)

  // QR Studio: type a new value and read the rendered code back.
  await openTool(page, 'qr')
  // The code is drawn as SVG modules, not a canvas, so the honest check is that
  // the artwork itself changes when the encoded text does.
  const qrBefore = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('.tool-view svg')].map((s) => s.outerHTML).join('')
    return { length: svg.length, markup: svg }
  })
  const qrField = await page.$('.tool-view input[type="text"]')
  await qrField.click({ clickCount: 3 })
  await page.keyboard.press('Backspace')
  await qrField.type('https://thetooltable.app/functional-sweep')
  await sleep(1800)
  const qrAfter = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('.tool-view svg')].map((s) => s.outerHTML).join('')
    return { length: svg.length, markup: svg, modules: document.querySelectorAll('.tool-view rect, .tool-view path').length }
  })
  record('QR Studio draws the code as vector modules', qrAfter.modules > 10, true)
  record('typing new text redraws the code', qrBefore.markup !== qrAfter.markup, true)
  record('the code is drawn at a real size', qrAfter.length > 2000, true)
  await page.screenshot({ path: `${OUT}/phone-qr.png` })
  await goHome(page)

  // Decision Hub: flip the coin properly — the button is disabled while the
  // coin is in the air, so this has to wait for each flip to land rather than
  // hammering the button (which would only register the first press).
  await openTool(page, 'decision')
  const flips = await page.evaluate(async () => {
    const view = () => document.querySelector('.tool-view')
    const flipButton = () => [...(view()?.querySelectorAll('button') || [])].find((b) => /^\s*flip\b/i.test(b.textContent))
    /* The hub remembers which picker you were last using, so open the coin
       explicitly rather than assuming it is the first tab. */
    const coinTab = [...(view()?.querySelectorAll('button') || [])].find((b) => /^\s*coin\b/i.test(b.textContent))
    if (coinTab) {
      coinTab.click()
      const until = Date.now() + 4000
      while (Date.now() < until && !flipButton()) await new Promise((r) => setTimeout(r, 150))
    }
    const flip = flipButton()
    if (!flip) return { found: false, results: [] }
    const results = []
    for (let i = 0; i < 8; i += 1) {
      const button = flipButton()
      if (!button || button.disabled) break
      button.click()
      // the result is announced in the big display line under the coin
      const deadline = Date.now() + 8000
      let text = null
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 120))
        const next = flipButton()
        if (next && !next.disabled) {
          /* `.display` is the app's display type and the tool heading uses it
             too, so read every occurrence and take the one that is a side. */
          const shown = [...(view()?.querySelectorAll('.display') || [])].map((d) => d.textContent.trim())
          text = shown.find((t) => /heads|tails/i.test(t)) || shown.join(' ')
          break
        }
      }
      results.push(text)
      if (!view()) return { found: true, results, left: true }
    }
    return { found: true, results }
  })
  if (flips.left) console.log('  decision: the tool view disappeared mid-sweep')
  if (flips.results.filter(Boolean).length !== 8) console.log('  decision results:', JSON.stringify(flips).slice(0, 300))
  const sides = (flips.results || []).map((r) => (String(r).toLowerCase().includes('tails') ? 'tails' : String(r).toLowerCase().includes('heads') ? 'heads' : null))
  record('Decision Hub has a coin to flip', flips.found, true)
  record('every flip reports a side', sides.filter(Boolean).length, 8)
  record('the coin comes out both ways, not stuck on one', new Set(sides.filter(Boolean)).size, 2)
  await page.screenshot({ path: `${OUT}/phone-decision.png` })
  await goHome(page)

  // Text Lab: type and read the live counters.
  await openTool(page, 'textlab')
  const typed = await page.evaluate(async () => {
    const area = document.querySelector('.tool-view textarea')
    if (!area) return { ok: false }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(area, 'The quick brown fox jumps over the lazy dog. '.repeat(20))
    area.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 500))
    const body = document.querySelector('.tool-view').innerText
    return { ok: true, showsCount: /\b(900|words|Words)\b/.test(body), body: body.replace(/\n/g, ' ').slice(0, 120) }
  })
  record('Text Lab counts what you type', typed.ok && typed.showsCount, true)
  await goHome(page)

  // Pakistan Money Kit: EMI-style arithmetic on typed numbers.
  await openTool(page, 'pkmoney')
  const money = await page.evaluate(async () => {
    const numbers = [...document.querySelectorAll('.tool-view input[type="number"]')]
    if (numbers.length < 2) return { ok: false, count: numbers.length }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(numbers[0], '100000')
    numbers[0].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(numbers[1], '60')
    numbers[1].dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 600))
    const body = document.querySelector('.tool-view').innerText
    return { ok: true, computed: /\d[\d,]*\.\d/.test(body), sample: body.replace(/\n/g, ' ').slice(0, 160) }
  })
  record('Pakistan Money Kit computes from typed input', money.ok && money.computed, true)
  await goHome(page)

  // Metadata Extractor: a real file through a real file input.
  await openTool(page, 'metadata')
  const fileInput = await page.$('.tool-view input[type="file"]')
  if (fileInput) {
    await fileInput.uploadFile(path.join(FIXTURES, 'photo.png'))
    await sleep(3000)
  }
  const meta = await page.evaluate(() => {
    const body = document.querySelector('.tool-view').innerText
    const entries = body.match(/(\d[\d,]*)\s+metadata entries/i)
    return {
      took: /photo\.png/i.test(body),
      entries: entries ? Number(entries[1].replace(/,/g, '')) : 0,
      reportsSize: /4\.53 ?KB|4,?634|4635/i.test(body),
      reportsDimensions: /\b480\b/.test(body),
      hasReport: /FILE INFORMATION|Report|Scrub/i.test(body),
    }
  })
  record('Metadata Extractor accepts a real file', !!fileInput && meta.took, true)
  record('it actually read the file rather than showing a shell', meta.entries > 3, true)
  record('it reports the file size it found', meta.reportsSize, true)
  record('it reports the real pixel dimensions', meta.reportsDimensions, true)
  record('it offers the extract / scrub actions', meta.hasReport, true)
  await page.screenshot({ path: `${OUT}/phone-metadata.png` })
  await goHome(page)

  // App Icon Forge: does it actually produce the set of icons it promises?
  await openTool(page, 'icons')
  const forge = await page.evaluate(async () => {
    const view = document.querySelector('.tool-view')
    if (!view) return { canvases: 0, painted: 0, platforms: 0, packs: false, missing: true }
    const canvases = [...view.querySelectorAll('canvas')]
    let painted = 0
    for (const c of canvases) {
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let ink = 0
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8 && (d[i] > 8 || d[i + 1] > 8 || d[i + 2] > 8)) ink += 1
        if (ink > 20) painted += 1
      } catch { /* a cross-origin preview is still a preview */ }
    }
    const text = view.innerText
    return {
      canvases: canvases.length,
      painted,
      platforms: ['android', 'ios', 'windows', 'macos', 'tauri', 'favicon'].filter((p) => text.toLowerCase().includes(p)).length,
      packs: /icon packs/i.test(text),
    }
  })
  record('Icon Forge renders a preview per platform', forge.canvases >= 6, true)
  record('every preview is actually drawn, not a blank canvas', forge.painted >= 6, true)
  record('it covers the platform packs it advertises', forge.platforms >= 4, true)
  record('it offers the downloadable packs', forge.packs, true)
  await page.screenshot({ path: `${OUT}/phone-icon-forge.png` })

  record('driving the tools produced no console errors', errors.length, 0)
  if (errors.length) console.log('errors seen:', errors.slice(0, 4))
  await page.close()
}

/* ============================================ 3. back navigation regressions */
{
  const page = await browser.newPage()
  const errors = watch(page)
  await page.setViewport(PHONE.viewport)
  await openHome(page)

  // Bug 6: the Android back gesture must navigate, not close the app.
  await openTool(page, 'converter')
  const deep = await page.evaluate(() => !!document.querySelector('.tool-screen'))
  await page.keyboard.press('Escape')
  const gone = await leftTool(page)
  record('back leaves a tool instead of closing the app', deep && gone, true)
  record('and lands back on the collection', await page.evaluate(() => !!document.querySelector('[data-tool-id="converter"]')), true)

  // Bug 7: a half-drawn screen must never be left behind.
  for (const id of ['pdf', 'ocr', 'qr', 'units', 'voice']) {
    await openTool(page, id)
    await page.keyboard.press('Escape')
    await sleep(400)
    const state = await page.evaluate(() => ({
      headerOnly: !!(document.querySelector('header') && document.querySelector('.tool-screen') &&
        document.querySelector('.tool-view').innerText.trim().length < 5),
      blank: document.body.innerText.trim().length < 20,
    }))
    record(`leaving ${id} never leaves a header with nothing under it`, state.headerOnly, false)
    record(`leaving ${id} never leaves a blank screen`, state.blank, false)
    await sleep(700)
  }

  // Opening the same tool twice, and several tools in a row, stays consistent.
  await openTool(page, 'decision')
  await goHome(page)
  await openTool(page, 'decision')
  record('reopening a tool still shows it', await page.evaluate(() => !!document.querySelector('.tool-intro')), true)
  record('zero console errors through all of that', errors.length, 0)
  await page.close()
}

/* ================================================ 4. reduced motion + wide */
{
  const page = await browser.newPage()
  const errors = watch(page)
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.setViewport(PHONE.viewport)
  await openHome(page)
  await openTool(page, 'backgrounds')
  await sleep(1800)
  const rm = await page.evaluate(() => ({
    intro: !!document.querySelector('.tool-intro'),
    introText: (document.querySelector('.tool-intro')?.innerText || '').trim().length,
    canvas: document.querySelector('.tool-view canvas')?.width || 0,
    controls: document.querySelectorAll('.tool-view button').length,
  }))
  record('reduced motion: the tool still renders', rm.intro && rm.introText > 10, true)
  record('reduced motion: the stage still comes up', rm.canvas > 10, true)
  record('reduced motion: every control is still there', rm.controls > 5, true)
  record('reduced motion: zero console errors', errors.length, 0)
  await page.screenshot({ path: `${OUT}/phone-reduced-motion-wall.png` })
  await page.close()
}
{
  const page = await browser.newPage()
  const errors = watch(page)
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
  await openHome(page, { phone: false })
  record('desktop still lists every tool', await page.evaluate(() => document.querySelectorAll('[data-tool-id]').length), 20)
  record('desktop has no phone footer', await page.evaluate(() => !document.querySelector('.mobile-footer')), true)
  await openTool(page, 'backgrounds')
  await sleep(2200)
  const wide = await page.evaluate(() => ({
    intro: !!document.querySelector('.tool-intro'),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    canvas: document.querySelector('.tool-view canvas')?.width || 0,
  }))
  record('desktop opens a tool with the shared chrome', wide.intro)
  record('desktop does not overflow sideways', wide.overflow, 0)
  record('the deferred stage still comes up on desktop', wide.canvas > 10, true)
  await page.screenshot({ path: `${OUT}/desktop-wall.png` })
  record('zero console errors on desktop', errors.length, 0)
  await page.close()
}

await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('\nfailures:')
  for (const f of failed) console.log(` - ${f.name} (got ${JSON.stringify(f.value)})`)
  process.exit(1)
}
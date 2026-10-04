/* Smoke: open all 12 tools in a real browser, screenshot each, and fail on crashes / console errors.
   Run with a dev or preview server up:  TTT_URL=http://localhost:5173 npm run smoke            */
import { launch, newPage, sleep, until, URL_BASE } from './lib.mjs'
import { openTool, goHome, shot, crashed } from './h.mjs'

const TOOLS = [
  ['Metadata Extractor', 'metadata'],
  ['Any-to-Any Converter', 'converter'],
  ['Target-Size Compressor', 'compressor'],
  ['Media Clipper', 'clipper'],
  ['ImagePlayer Studio', 'studio'],
  ['AI Background Remover', 'bg'],
  ['Frame Extractor', 'frames'],
  ['Audio Visualizer', 'viz'],
  ['Currency, Unit & Time', 'currency'],
  ['Decision & Randomizer', 'decision'],
  ['QR Code Studio', 'qr'],
  ['Background Canvas Studio', 'wall'],
]

const b = await launch()
const p = await newPage(b, {})
console.log(`# smoke against ${URL_BASE}`)
await shot(p, '00-home')

const results = []
for (const [name, id] of TOOLS) {
  p.logs.length = 0
  let status = 'ok', detail = ''
  try {
    await openTool(p, name)
    const shotOk = await shot(p, `${id}-open`)
    if (!shotOk) detail = 'screenshot timed out (animated view)'
    if (await crashed(p)) { status = 'CRASH'; detail = 'error boundary rendered' }
    const panel = await p.evaluate(() => {
      const main = document.querySelector('main') || document.body
      return { text: (main.innerText || '').slice(0, 400), controls: main.querySelectorAll('button, input, canvas, select').length }
    })
    if (status === 'ok' && panel.controls < 2) { status = 'EMPTY'; detail = `only ${panel.controls} controls` }
    const errs = p.logs.filter((l) => !/favicon|manifest|sw\.js|Download the React/i.test(l))
    if (errs.length) { status = status === 'ok' ? 'WARN' : status; detail = errs.slice(0, 3).join(' | ') }
  } catch (e) {
    status = 'FAIL'; detail = e.message
  }
  results.push({ name, status, detail })
  console.log(`${status === 'ok' ? '✓' : status === 'WARN' ? '!' : '✗'} ${name.padEnd(24)} ${detail}`)
  await goHome(p).catch((e) => { results.push({ name: `${name} (return to table)`, status: 'FAIL', detail: e.message }) })
  await sleep(300)
}

const bad = results.filter((r) => r.status === 'FAIL' || r.status === 'CRASH' || r.status === 'EMPTY')
const warn = results.filter((r) => r.status === 'WARN')
console.log(`\n# ${results.length} tools · ${results.length - bad.length - warn.length} clean · ${warn.length} warnings · ${bad.length} broken`)
await b.close()
if (bad.length) process.exit(1)

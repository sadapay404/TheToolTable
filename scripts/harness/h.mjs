import { launch, sleep } from './lib.mjs'
import fs from 'fs'
fs.mkdirSync('/tmp/shots', { recursive: true })
export async function open(name, vw = 1280, vh = 900) {
  const b = await launch(); const p = await b.newPage(); await p.setViewport({ width: vw, height: vh })
  p.logs = []
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) p.logs.push(m.text().slice(0, 300)) })
  p.on('pageerror', (e) => p.logs.push('PAGEERR ' + e.message))
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
  await p.evaluate(() => { localStorage.clear() })
  await p.reload({ waitUntil: 'networkidle2' })
  if (name) { await p.evaluate((n) => { const t = [...document.querySelectorAll('.card3d')].find((x) => x.textContent.includes(n)); t.click() }, name); await sleep(2000) }
  return { b, p }
}
export const shot = (p, n, full = false) => p.screenshot({ path: `/tmp/shots/${n}.png`, fullPage: full })
export const clickText = (p, t, sel = 'button') => p.evaluate((t, sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().startsWith(t)); if (!e) throw new Error('no ' + t); e.click() }, t, sel)
export { sleep }

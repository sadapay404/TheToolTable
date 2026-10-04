/* Mobile UI audit: open every tool at real phone widths and hunt for the things that make a
   desktop layout feel broken on a phone — sideways scroll, elements wider than the screen,
   tap targets smaller than a fingertip, text that renders smaller than readable, and content
   hidden underneath the fixed bottom bar. Prints one line per tool, fails on nothing (it is a
   measuring stick, not a gate) so it can run before and after a UI pass.

   Usage:  TTT_URL=… node scripts/harness/mobile.mjs [toolName…] */
import { launch, newPage, sleep, until } from './lib.mjs'
import { SHOTS, shot, openTool } from './h.mjs'

const WIDTHS = (process.env.TTT_WIDTHS || '390x844,360x740').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number)
  return { w, h }
})

const only = process.argv.slice(2)

/* Runs in the page. Returns a compact report of everything that is too wide / too small. */
const AUDIT = () => {
  const W = innerWidth
  const de = document.documentElement
  const out = {
    hScroll: de.scrollWidth - de.clientWidth,
    wide: [], small: [], tiny: [], underBar: [], offLeft: [], info: {},
  }
  const seen = new Set()
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 42)
    return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter((c) => c && !c.includes('/')).slice(0, 2).join('.') : ''}${t ? ` “${t}”` : ''}`
  }
  // Elements inside a horizontal scroller (tab rails, chip rows, ticker strips) are *meant* to run
  // past the edge — that is the mobile pattern, not a bug. Skip anything in a scrollable ancestor.
  const inScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') return true
    }
    return false
  }
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
  }
  // any element that physically sticks out of the viewport
  for (const el of document.querySelectorAll('main *, header *, footer *')) {
    if (!vis(el) || inScroller(el)) continue
    const r = el.getBoundingClientRect()
    const key = label(el)
    if (seen.has(key)) continue
    if (r.width > W + 1 && el.children.length === 0) { seen.add(key); out.wide.push(`${Math.round(r.width)}px · ${key}`) }
    else if (r.right > W + 2) { seen.add(key); out.offLeft.push(`${Math.round(r.right - W)}px past · ${key}`) }
  }
  // interactive things a finger has to hit
  for (const el of document.querySelectorAll('main button, main a, main input, main select, main textarea, main [role="button"]')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.height < 32 && r.width > 0) out.small.push(`${Math.round(r.width)}×${Math.round(r.height)} · ${label(el)}`)
  }
  // unreadably small text
  for (const el of document.querySelectorAll('main p, main span, main div, main td, main label, main li')) {
    // coin/flag art and the A4 invoice miniature are pictures of text, not body copy
    if (!vis(el) || el.children.length || el.closest('[data-badge]') || el.closest('[data-doc]')) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    const t = (el.textContent || '').trim()
    if (t.length > 2 && fs < 11) out.tiny.push(`${fs}px · ${JSON.stringify(t.slice(0, 34))}`)
  }
  // content sitting behind the fixed bottom bar
  const bars = [...document.querySelectorAll('[data-mobile-bar], footer')].map((b) => b.getBoundingClientRect()).filter((r) => r.height > 0 && r.bottom > innerHeight - 4)
  if (bars.length) {
    const barTop = Math.min(...bars.map((r) => r.top))
    for (const el of document.querySelectorAll('main button, main input, main select, main textarea, main a')) {
      if (!vis(el)) continue
      const r = el.getBoundingClientRect()
      if (r.bottom > barTop + 4 && r.top < innerHeight) { out.underBar.push(label(el)); if (out.underBar.length > 3) break }
    }
  }
  out.info = {
    vw: W,
    pageH: Math.round(de.scrollHeight / 10) * 10,
    mainW: Math.round(document.querySelector('main')?.getBoundingClientRect().width || 0),
    controls: document.querySelectorAll('main button, main input, main select, main textarea').length,
  }
  out.wide = out.wide.slice(0, 6); out.small = out.small.slice(0, 6); out.tiny = out.tiny.slice(0, 4); out.offLeft = out.offLeft.slice(0, 5)
  return out
}

const browser = await launch()
let bad = 0

for (const { w, h } of WIDTHS) {
  const page = await newPage(browser, { vw: w, vh: h, clearStorage: false, touch: true })
  const names = only.length ? only : await page.evaluate(() => [...document.querySelectorAll('.card3d h3')].map((e) => e.textContent.trim()))
  console.log(`\n=== ${w}×${h} — ${names.length} screens ===`)
  for (const name of names) {
    let report = null
    try {
      await openTool(page, name)
      await sleep(900)
      report = await page.evaluate(AUDIT)
      await shot(page, `${w}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`)
      // scroll to the bottom of the tool — sticky bars and long layouts only misbehave down there
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await sleep(700)
      const bottom = await page.evaluate(AUDIT)
      await shot(page, `${w}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-end`)
      report.underBar = [...new Set([...report.underBar, ...bottom.underBar])]
      report.hScroll = Math.max(report.hScroll, bottom.hScroll)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.keyboard.press('Escape').catch(() => {})
      const { goHome } = await import('./h.mjs')
      await goHome(page)
    } catch (e) {
      console.log(`  !  ${name} — could not audit: ${String(e.message).slice(0, 90)}`)
      bad++
      // a heavy tool can kill the renderer; start from a fresh page so the rest still get measured
      try { await page.goto(process.env.TTT_URL || 'http://localhost:5173', { waitUntil: 'domcontentloaded' }); await until(page, () => document.querySelectorAll('.card3d').length > 0, { label: 'home' }) } catch {}
      continue
    }
    const flags = []
    if (report.hScroll > 2) flags.push(`SIDEWAYS ${report.hScroll}px`)
    if (report.wide.length) flags.push(`over-wide: ${report.wide[0]}`)
    if (report.offLeft.length) flags.push(`offscreen: ${report.offLeft[0]}`)
    if (report.small.length) flags.push(`small taps: ${report.small.length} (e.g. ${report.small[0]})`)
    if (report.tiny.length) flags.push(`tiny text: ${report.tiny[0]}`)
    if (report.underBar.length) flags.push(`behind bar: ${report.underBar[0]}`)
    if (flags.length) bad++
    console.log(`  ${flags.length ? '✗' : '✓'} ${name}${flags.length ? '\n      ' + flags.join('\n      ') : ' — clean'}`)
  }
  await page.close()
}
console.log(`\n${bad} screen(s) flagged · shots in ${SHOTS}`)
await browser.close()

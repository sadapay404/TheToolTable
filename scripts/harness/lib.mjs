import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
export async function launch() {
  const executablePath = await chromium.executablePath()
  return puppeteer.launch({ executablePath, headless: 'shell', args: [...chromium.args, '--disable-accelerated-2d-canvas', '--no-sandbox'], defaultViewport: { width: 1280, height: 900 } })
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'

const packageId = 'app.thetooltable.mubashir'
const apkPath = path.resolve(process.argv[2] || '')
const POLL_MS = 900
const UI_TIMEOUT_MS = 60_000
let lastTree = ''

function adb(...args) {
  return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 25_000 }).trim()
}

function safeAdb(...args) {
  try { return adb(...args) } catch { return '' }
}

function decodeXml(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function nodesOf(xml) {
  return [...String(xml || '').matchAll(/<node\b[^>]*>/g)].map(([node]) => {
    const read = (name) => decodeXml(node.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '')
    const bounds = node.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    return {
      raw: node,
      text: read('text'),
      description: read('content-desc'),
      className: read('class'),
      bounds: bounds ? bounds.slice(1).map(Number) : null,
    }
  })
}

function dumpUi() {
  try {
    adb('shell', 'uiautomator', 'dump', '/sdcard/thetooltable-window.xml')
    lastTree = adb('shell', 'cat', '/sdcard/thetooltable-window.xml')
  } catch {
    lastTree = ''
  }
  return lastTree
}

function nodeWithLabel(xml, label) {
  return nodesOf(xml).find((node) => node.text === label || node.description === label)
}

function screenSize() {
  const result = safeAdb('shell', 'wm', 'size')
  const match = result.match(/(\d+)x(\d+)/)
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 1080, height: 2400 }
}

function foreground() {
  const activities = safeAdb('shell', 'dumpsys', 'activity', 'activities')
  const windows = safeAdb('shell', 'dumpsys', 'window', 'windows')
  const resumed = new RegExp(`(?:mResumedActivity|topResumedActivity)[^\\n]*${packageId}`).test(activities)
  const focused = new RegExp(`mCurrentFocus[^\\n]*${packageId}`).test(windows)
  return resumed || focused
}

async function waitUntil(description, predicate, timeout = UI_TIMEOUT_MS) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const tree = dumpUi()
    const found = predicate(tree)
    if (found) return { tree, found }
    await delay(POLL_MS)
  }
  throw new Error(`Timed out waiting for ${description}. Last visible nodes:\n${nodesOf(lastTree).slice(0, 100).map((node) => `${node.className}: ${node.text || node.description}`).join('\n')}`)
}

async function waitForHome() {
  const result = await waitUntil('the home collection after back navigation', (tree) => {
    const nodes = nodesOf(tree)
    return nodes.some((node) => node.text === 'Browse the collection')
      && nodes.some((node) => node.description === 'Open Media Clipper & Downloader' || node.description === 'Open AI Background Remover')
  })
  if (!foreground()) throw new Error('The app left the foreground after returning to its home screen.')
  return result
}

async function openTool(label, title) {
  const { width, height } = screenSize()
  let target = null
  for (let attempt = 0; attempt < 8; attempt++) {
    const tree = dumpUi()
    target = nodeWithLabel(tree, label)
    if (target?.bounds) break
    // The menu is a vertically scrolling catalogue; reveal the requested card
    // before trying its accessible label again.
    adb('shell', 'input', 'swipe', String(Math.round(width * 0.52)), String(Math.round(height * 0.82)), String(Math.round(width * 0.52)), String(Math.round(height * 0.42)), '360')
    await delay(450)
  }
  if (!target?.bounds) throw new Error(`Could not find the accessible tool card "${label}". The Android WebView must expose its button label to UIAutomator.`)
  const [left, top, right, bottom] = target.bounds
  adb('shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)))
  await waitUntil(`the ${title} screen`, (tree) => {
    const nodes = nodesOf(tree)
    return nodes.some((node) => node.text.includes(title))
      && nodes.some((node) => node.description === 'Back to the table')
  })
  if (!foreground()) throw new Error(`The app is not foregrounded on ${title}.`)
}

async function tapLabel(label) {
  const tree = dumpUi()
  const target = nodeWithLabel(tree, label)
  if (!target?.bounds) throw new Error(`Could not find accessible button "${label}".`)
  const [left, top, right, bottom] = target.bounds
  adb('shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)))
}

function assertNoAppCrash() {
  const log = safeAdb('logcat', '-d', '-t', '1200')
  const fatalBlocks = log.match(/FATAL EXCEPTION[\s\S]{0,2500}/g) || []
  const ownCrash = fatalBlocks.find((block) => block.includes(`Process: ${packageId}`))
  const nativeCrash = log.split('\n').find((line) => line.includes('Fatal signal') && line.includes(packageId))
  if (ownCrash || nativeCrash) throw new Error(`Android reported an app crash:\n${ownCrash || nativeCrash}`)
}

async function main() {
  if (!process.argv[2]) throw new Error('Pass the signed APK path as the first argument.')
  adb('install', '-r', apkPath)
  safeAdb('logcat', '-c')
  adb('shell', 'am', 'force-stop', packageId)
  adb('shell', 'monkey', '-p', packageId, '1')
  await waitUntil('the Android home collection on launch', (tree) => {
    const nodes = nodesOf(tree)
    return nodes.some((node) => node.text === 'Browse the collection')
      && nodes.some((node) => node.description === 'Open Media Clipper & Downloader')
  })
  if (!foreground()) throw new Error('The app rendered its home collection but is not the resumed Android activity.')
  console.log('PASS: fresh install launches into the accessible tool collection.')

  // Tool 04: exercise actual system-back navigation instead of just checking the
  // APK build. The home collection must remain rendered (not a header-only page).
  await openTool('Open Media Clipper & Downloader', 'Media Clipper & Downloader')
  adb('shell', 'input', 'keyevent', '4')
  await waitForHome()
  console.log('PASS: Android system back returns from Tool 04 to the live home collection.')

  // Tool 06: verify its own back control also restores the collection.
  await openTool('Open AI Background Remover', 'AI Background Remover')
  await tapLabel('Back to the table')
  await waitForHome()
  console.log('PASS: Tool 06 app-back returns to the live home collection (no header-only black screen).')

  assertNoAppCrash()
  console.log('PASS: no app-process fatal exception detected in logcat.')
}

main().catch((error) => {
  const tail = safeAdb('logcat', '-d', '-t', '300').split('\n').slice(-160).join('\n')
  console.error(`ANDROID RUNTIME SMOKE FAILED: ${error.stack || error}`)
  if (lastTree) console.error(`\nLast UIAutomator hierarchy:\n${lastTree.slice(0, 30_000)}`)
  if (tail) console.error(`\nRecent Android logcat:\n${tail}`)
  process.exitCode = 1
})
